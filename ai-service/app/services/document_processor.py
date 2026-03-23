"""
Document processing pipeline for the RAG system.

Extracts text from uploaded files (PDF, DOCX, CSV, XLSX, TXT, MD, RTF),
chunks it with overlap, generates embeddings, and stores everything in the
document_chunks table for later retrieval.
"""

import io
import logging
import os
import shutil
import subprocess
import tempfile
from collections import namedtuple

import tiktoken
import psycopg2.extras

from app.database import get_conn
from app.services.embeddings import generate_embedding

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# PDF conversion (LibreOffice headless for non-PDF documents)
# ---------------------------------------------------------------------------

def _convert_to_pdf(raw_file: bytes, file_type: str) -> bytes | None:
    """Convert a non-PDF document to PDF using LibreOffice headless.

    Returns PDF bytes on success, None on failure.
    """
    if file_type.lower() in (".pdf", "pdf"):
        return None  # Already a PDF, no conversion needed

    # Check if LibreOffice is available
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        logger.warning("LibreOffice not found — skipping PDF conversion for %s", file_type)
        return None

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            # Write source file
            ext = file_type if file_type.startswith(".") else f".{file_type}"
            src_path = os.path.join(tmpdir, f"input{ext}")
            with open(src_path, "wb") as f:
                f.write(raw_file)

            # Run LibreOffice conversion
            result = subprocess.run(
                [soffice, "--headless", "--convert-to", "pdf", "--outdir", tmpdir, src_path],
                capture_output=True,
                timeout=60,
            )

            if result.returncode != 0:
                logger.warning(
                    "LibreOffice conversion failed (exit %d): %s",
                    result.returncode,
                    result.stderr.decode(errors="replace")[:500],
                )
                return None

            # Read the generated PDF
            pdf_path = os.path.join(tmpdir, "input.pdf")
            if not os.path.exists(pdf_path):
                logger.warning("LibreOffice produced no output PDF")
                return None

            with open(pdf_path, "rb") as f:
                return f.read()

    except subprocess.TimeoutExpired:
        logger.warning("LibreOffice conversion timed out for %s", file_type)
        return None
    except Exception as exc:
        logger.warning("PDF conversion failed: %s", exc)
        return None

# ---------------------------------------------------------------------------
# PDF page remapping (for non-PDF documents after conversion)
# ---------------------------------------------------------------------------

def _remap_chunks_to_pdf_pages(
    pdf_bytes: bytes, document_id: str, agent_id: str
) -> int:
    """After DOCX/XLSX→PDF conversion, remap chunk page numbers to real PDF pages.

    Extracts text from each PDF page, then for each chunk finds the PDF page
    that best matches the chunk's content. Updates chunk page_number in DB.

    Returns the real PDF page count.
    """
    import PyPDF2

    reader = PyPDF2.PdfReader(io.BytesIO(pdf_bytes))
    real_page_count = len(reader.pages)

    # Extract text from each PDF page (lowercased for matching)
    pdf_pages: list[tuple[int, str]] = []
    for i, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").lower()
        pdf_pages.append((i, text))

    if not pdf_pages:
        return real_page_count

    # Get all chunks for this document
    with get_conn() as conn:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """SELECT id, content, chunk_index FROM document_chunks
               WHERE document_id = %s AND agent_id = %s
               ORDER BY chunk_index""",
            (document_id, agent_id),
        )
        chunks = cur.fetchall()

    if not chunks:
        return real_page_count

    # For each chunk, find the best matching PDF page
    updates: list[tuple[int, str]] = []
    for chunk in chunks:
        # Take first ~20 significant words from chunk as search terms
        words = [w.lower() for w in chunk["content"].split() if len(w) > 3][:20]
        if not words:
            continue

        best_page = 1
        best_score = 0

        for page_num, page_text in pdf_pages:
            score = sum(1 for w in words if w in page_text)
            if score > best_score:
                best_score = score
                best_page = page_num

        updates.append((best_page, chunk["id"]))

    # Batch update chunk page numbers
    if updates:
        with get_conn() as conn:
            cur = conn.cursor()
            psycopg2.extras.execute_batch(
                cur,
                "UPDATE document_chunks SET page_number = %s WHERE id = %s",
                updates,
            )
        logger.info("Remapped %d chunks to real PDF pages", len(updates))

    return real_page_count


# ---------------------------------------------------------------------------
# Vision support (Claude Haiku 4.5)
# ---------------------------------------------------------------------------

MAX_VISION_CALLS_PER_DOC = 5


def _vision_describe(image_bytes: bytes, mime_type: str = "image/png", context: str = "") -> str:
    """Use Claude Haiku 4.5 Vision to describe an image's content."""
    import anthropic
    import base64
    from app.config import ANTHROPIC_API_KEY

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    b64_data = base64.standard_b64encode(image_bytes).decode("utf-8")

    prompt = "Describe the content of this image in detail. "
    if context:
        prompt += f"This image comes from: {context}. "
    prompt += (
        "Focus on any text, data, charts, tables, diagrams, or key visual information. "
        "If there are numbers, percentages, or data points, include them exactly. Be thorough."
    )

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": mime_type, "data": b64_data}},
                {"type": "text", "text": prompt},
            ],
        }],
    )
    return response.content[0].text


def _enhance_pdf_pages_with_vision(file_data: bytes, pages: list) -> list:
    """For PDF pages with very little text, use vision to describe visual content."""
    try:
        from pdf2image import convert_from_bytes

        images = convert_from_bytes(file_data, dpi=200)
        page_texts = {p.page_number: p for p in pages}
        enhanced = list(pages)
        vision_calls = 0

        for i, img in enumerate(images, start=1):
            if vision_calls >= MAX_VISION_CALLS_PER_DOC:
                logger.info("Vision call limit (%d) reached, skipping remaining pages", MAX_VISION_CALLS_PER_DOC)
                break

            existing = page_texts.get(i)
            if existing and len(existing.text) > 100:
                continue  # Already has sufficient text

            # Convert PIL image to bytes
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            img_bytes = buf.getvalue()

            try:
                description = _vision_describe(img_bytes, "image/png", f"PDF page {i}")
                vision_calls += 1
                if description:
                    if existing:
                        idx = enhanced.index(existing)
                        enhanced[idx] = PageContent(
                            text=existing.text + f"\n\n[Visual Content]\n{description}",
                            page_number=existing.page_number,
                            heading=existing.heading,
                        )
                    else:
                        enhanced.append(PageContent(
                            text=f"[Vision: Page {i}]\n{description}",
                            page_number=i,
                            heading=f"Page {i} Visual Content",
                        ))
            except Exception as exc:
                logger.warning("Vision failed for PDF page %d: %s", i, exc)

        enhanced.sort(key=lambda p: p.page_number)
        return enhanced
    except Exception as exc:
        logger.warning("PDF vision enhancement failed: %s", exc)
        return pages


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ALLOWED_EXTENSIONS = {"pdf", "docx", "csv", "txt", "xlsx", "xls", "rtf", "md", "png", "jpg", "jpeg", "webp"}
MAX_FILE_SIZE = 104_857_600  # 100 MB
EMBEDDING_BATCH_SIZE = 50

_tokenizer = tiktoken.get_encoding("cl100k_base")

# ---------------------------------------------------------------------------
# Data containers
# ---------------------------------------------------------------------------

PageContent = namedtuple("PageContent", ["text", "page_number", "heading"])
ChunkData = namedtuple(
    "ChunkData", ["content", "page_number", "section_heading", "chunk_index", "metadata"]
)

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def validate_file(filename: str, file_data: bytes) -> tuple[bool, str]:
    """Check that the file type is allowed and size is within limits.

    Returns (True, "") on success or (False, "reason") on failure.
    """
    if not filename or "." not in filename:
        return False, "Filename must have an extension"

    ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"Unsupported file type '.{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"

    if len(file_data) > MAX_FILE_SIZE:
        size_mb = len(file_data) / (1024 * 1024)
        return False, f"File too large ({size_mb:.1f} MB). Maximum is 100 MB"

    if len(file_data) == 0:
        return False, "File is empty"

    return True, ""


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------


def _ocr_pdf(file_data: bytes) -> list[PageContent]:
    """OCR fallback for scanned/image-based PDFs."""
    try:
        from pdf2image import convert_from_bytes
        import pytesseract

        images = convert_from_bytes(file_data, dpi=300)
        pages: list[PageContent] = []
        for i, img in enumerate(images, start=1):
            text = pytesseract.image_to_string(img).strip()
            if text:
                pages.append(PageContent(text=text, page_number=i, heading=None))
        return pages
    except Exception as exc:
        logger.warning("OCR fallback failed: %s", exc)
        return []


import re as _re

# Patterns for detecting section headings in PDF text
_NUMBERED_HEADING_RE = _re.compile(
    r"^(\d+\.[\d.]*)\s+([A-Z][A-Za-z &,/'\-]{2,})", _re.MULTILINE
)
_ALLCAPS_HEADING_RE = _re.compile(
    r"^([A-Z][A-Z &,/'\-]{4,})$", _re.MULTILINE
)


def _detect_pdf_headings(pages: list) -> list:
    """Post-process PDF pages to detect section headings and split accordingly.

    Scans each page's text for numbered headings (e.g. '2.4 Parking & Access')
    and ALL-CAPS headings (e.g. 'EXECUTIVE SUMMARY'). Splits pages at heading
    boundaries so each chunk carries its section context.
    """
    result: list = []

    for page in pages:
        lines = page.text.split("\n")
        sections: list[tuple[str | None, list[str]]] = []
        current_heading = page.heading  # preserve any existing heading
        current_lines: list[str] = []

        for line in lines:
            stripped = line.strip()
            if not stripped:
                current_lines.append(line)
                continue

            # Check for numbered heading: "2.4 Parking & Access"
            numbered = _NUMBERED_HEADING_RE.match(stripped)
            # Check for ALL-CAPS heading: "EXECUTIVE SUMMARY" (min 5 chars, not a data row)
            allcaps = (
                _ALLCAPS_HEADING_RE.match(stripped)
                and len(stripped) < 80
                and not any(c.isdigit() for c in stripped)
            )

            if numbered or allcaps:
                # Flush current section
                if current_lines:
                    text = "\n".join(current_lines).strip()
                    if text:
                        sections.append((current_heading, current_lines[:]))

                current_heading = stripped
                current_lines = [line]
            else:
                current_lines.append(line)

        # Flush remaining
        if current_lines:
            sections.append((current_heading, current_lines))

        # Convert sections to PageContent
        if not sections:
            result.append(page)
        else:
            for heading, sec_lines in sections:
                text = "\n".join(sec_lines).strip()
                if text:
                    result.append(PageContent(
                        text=text,
                        page_number=page.page_number,
                        heading=heading,
                    ))

    return result


def _extract_pdf(file_data: bytes) -> list[PageContent]:
    from PyPDF2 import PdfReader

    reader = PdfReader(io.BytesIO(file_data))
    pages: list[PageContent] = []
    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        text = text.strip()
        if text:
            pages.append(PageContent(text=text, page_number=i, heading=None))

    # If very little text extracted, try OCR (likely a scanned PDF)
    total_chars = sum(len(p.text) for p in pages)
    if total_chars < 50:
        ocr_pages = _ocr_pdf(file_data)
        if ocr_pages:
            return ocr_pages

    # Detect section headings for better chunk context
    pages = _detect_pdf_headings(pages)

    return pages


def _extract_image(file_data: bytes) -> list[PageContent]:
    """Extract text from standalone image files via OCR, with vision fallback."""
    # Try OCR first
    try:
        import pytesseract
        from PIL import Image

        img = Image.open(io.BytesIO(file_data))
        text = pytesseract.image_to_string(img).strip()
        if len(text) > 50:
            return [PageContent(text=text, page_number=1, heading=None)]
    except Exception as exc:
        logger.warning("Image OCR failed: %s", exc)

    # Fall back to vision
    try:
        from PIL import Image as PILImage
        img = PILImage.open(io.BytesIO(file_data))
        mime = f"image/{img.format.lower()}" if img.format else "image/png"
        description = _vision_describe(file_data, mime, "standalone image upload")
        if description:
            return [PageContent(
                text=f"[Vision Description]\n{description}",
                page_number=1,
                heading="Image Description (AI-generated)",
            )]
    except Exception as exc:
        logger.warning("Vision fallback for image failed: %s", exc)

    return []


def _extract_docx_images(doc, filename: str = "document") -> list[PageContent]:
    """Extract and describe embedded images from a DOCX using Claude Vision."""
    pages: list[PageContent] = []
    vision_calls = 0
    _NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

    for i, shape in enumerate(doc.inline_shapes, start=1):
        if vision_calls >= MAX_VISION_CALLS_PER_DOC:
            logger.info("DOCX vision call limit (%d) reached, skipping remaining images", MAX_VISION_CALLS_PER_DOC)
            break

        try:
            blip = shape._inline.graphic.graphicData.pic.blipFill.blip
            rId = blip.get(f"{_NS}embed")
            if not rId:
                continue

            image_part = doc.part.related_parts.get(rId)
            if not image_part:
                continue

            content_type = image_part.content_type
            if not content_type or not content_type.startswith("image/"):
                continue

            image_bytes = image_part.blob
            if not image_bytes or len(image_bytes) < 100:
                continue

            description = _vision_describe(image_bytes, content_type, f"image in {filename}")
            vision_calls += 1

            if description:
                pages.append(PageContent(
                    text=f"[Embedded Image {i}]\n{description}",
                    page_number=0,  # assigned later
                    heading=f"Embedded Image {i} (AI-described)",
                ))
        except Exception as exc:
            logger.warning("Failed to extract DOCX image %d: %s", i, exc)

    return pages


def _extract_docx(file_data: bytes) -> list[PageContent]:
    from docx import Document as DocxDocument

    doc = DocxDocument(io.BytesIO(file_data))
    pages: list[PageContent] = []
    current_heading: str | None = None
    current_text_parts: list[str] = []
    section_index = 0

    def _flush():
        nonlocal section_index
        text = "\n".join(current_text_parts).strip()
        if text:
            section_index += 1
            pages.append(
                PageContent(text=text, page_number=section_index, heading=current_heading)
            )
        current_text_parts.clear()

    for para in doc.paragraphs:
        style_name = para.style.name if para.style else ""
        if style_name.startswith("Heading"):
            _flush()
            current_heading = para.text.strip() or None
        else:
            if para.text.strip():
                current_text_parts.append(para.text)

    # flush remaining
    _flush()

    # Extract embedded images via Vision
    image_pages = _extract_docx_images(doc)
    for img_page in image_pages:
        section_index += 1
        pages.append(PageContent(
            text=img_page.text,
            page_number=section_index,
            heading=img_page.heading,
        ))

    return pages


def _extract_csv(file_data: bytes) -> list[PageContent]:
    import pandas as pd

    try:
        df = pd.read_csv(io.BytesIO(file_data))
    except Exception:
        # Try with different encoding
        df = pd.read_csv(io.BytesIO(file_data), encoding="latin-1")

    pages: list[PageContent] = []
    columns = list(df.columns)
    rows_per_page = 20

    for start in range(0, len(df), rows_per_page):
        batch = df.iloc[start : start + rows_per_page]
        lines = []
        for idx, row in batch.iterrows():
            parts = [f"{col}={row[col]}" for col in columns if pd.notna(row[col])]
            lines.append(f"Row {idx + 1}: {', '.join(parts)}")
        text = "\n".join(lines)
        page_num = (start // rows_per_page) + 1
        pages.append(PageContent(text=text, page_number=page_num, heading=None))

    return pages


def _extract_xlsx_images(file_data: bytes, filename: str = "spreadsheet") -> list[PageContent]:
    """Extract and describe embedded images from an XLSX using Claude Vision."""
    pages: list[PageContent] = []
    vision_calls = 0

    try:
        from openpyxl import load_workbook

        wb = load_workbook(io.BytesIO(file_data))
        for ws in wb.worksheets:
            for i, img in enumerate(ws._images, start=1):
                if vision_calls >= MAX_VISION_CALLS_PER_DOC:
                    logger.info("XLSX vision call limit (%d) reached, skipping remaining images", MAX_VISION_CALLS_PER_DOC)
                    break

                try:
                    img_bytes = img._data()
                    if not img_bytes or len(img_bytes) < 100:
                        continue

                    # Infer MIME type from image path extension
                    img_path = getattr(img, "path", "") or ""
                    ext = img_path.rsplit(".", 1)[-1].lower() if "." in img_path else "png"
                    mime_map = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
                                "gif": "image/gif", "webp": "image/webp", "bmp": "image/bmp"}
                    mime_type = mime_map.get(ext, "image/png")

                    description = _vision_describe(
                        img_bytes, mime_type,
                        f"image in sheet '{ws.title}' of {filename}",
                    )
                    vision_calls += 1

                    if description:
                        pages.append(PageContent(
                            text=f"[Embedded Image from sheet '{ws.title}']\n{description}",
                            page_number=0,  # assigned later
                            heading=f"Sheet: {ws.title} — Embedded Image {i} (AI-described)",
                        ))
                except Exception as exc:
                    logger.warning("Failed to extract XLSX image %d from sheet '%s': %s", i, ws.title, exc)

            if vision_calls >= MAX_VISION_CALLS_PER_DOC:
                break
    except Exception as exc:
        logger.warning("XLSX image extraction failed: %s", exc)

    return pages


def _extract_xlsx(file_data: bytes) -> list[PageContent]:
    import pandas as pd

    xls = pd.ExcelFile(io.BytesIO(file_data), engine="openpyxl")
    pages: list[PageContent] = []
    global_page = 0

    for sheet_name in xls.sheet_names:
        df = xls.parse(sheet_name)
        columns = list(df.columns)
        rows_per_page = 20

        for start in range(0, max(len(df), 1), rows_per_page):
            batch = df.iloc[start : start + rows_per_page]
            lines = []
            for idx, row in batch.iterrows():
                parts = [f"{col}={row[col]}" for col in columns if pd.notna(row[col])]
                lines.append(f"Row {idx + 1}: {', '.join(parts)}")

            text = "\n".join(lines)
            if text.strip():
                global_page += 1
                pages.append(
                    PageContent(text=text, page_number=global_page, heading=f"Sheet: {sheet_name}")
                )

    # Extract embedded images via Vision
    image_pages = _extract_xlsx_images(file_data)
    for img_page in image_pages:
        global_page += 1
        pages.append(PageContent(
            text=img_page.text,
            page_number=global_page,
            heading=img_page.heading,
        ))

    return pages


def _extract_text_plain(file_data: bytes) -> list[PageContent]:
    """Handle .txt, .md, and .rtf files as plain text."""
    try:
        text = file_data.decode("utf-8")
    except UnicodeDecodeError:
        text = file_data.decode("latin-1")

    sections = text.split("\n\n")
    pages: list[PageContent] = []
    current_parts: list[str] = []
    current_chars = 0
    page_num = 1
    chars_per_page = 3000

    for section in sections:
        section = section.strip()
        if not section:
            continue

        current_parts.append(section)
        current_chars += len(section)

        if current_chars >= chars_per_page:
            pages.append(
                PageContent(
                    text="\n\n".join(current_parts),
                    page_number=page_num,
                    heading=None,
                )
            )
            page_num += 1
            current_parts = []
            current_chars = 0

    # flush remainder
    if current_parts:
        pages.append(
            PageContent(text="\n\n".join(current_parts), page_number=page_num, heading=None)
        )

    return pages


_EXTRACTORS = {
    "pdf": _extract_pdf,
    "docx": _extract_docx,
    "csv": _extract_csv,
    "xlsx": _extract_xlsx,
    "xls": _extract_xlsx,
    "txt": _extract_text_plain,
    "md": _extract_text_plain,
    "rtf": _extract_text_plain,
    "png": _extract_image,
    "jpg": _extract_image,
    "jpeg": _extract_image,
    "webp": _extract_image,
}


def extract_text(file_data: bytes, file_type: str) -> list[PageContent]:
    """Extract text from a file, returning a list of PageContent.

    Raises ValueError if extraction fails or the file type is unsupported.
    """
    file_type = file_type.lower().lstrip(".")
    extractor = _EXTRACTORS.get(file_type)
    if extractor is None:
        raise ValueError(f"Unsupported file type: {file_type}")

    try:
        pages = extractor(file_data)
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Failed to extract text from {file_type} file: {exc}") from exc

    if not pages:
        raise ValueError("No text or visual content could be extracted from the document")

    return pages


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------


def _count_tokens(text: str) -> int:
    return len(_tokenizer.encode(text))


def _recursive_split(text: str, max_tokens: int) -> list[str]:
    """Split text recursively using progressively finer separators."""
    if _count_tokens(text) <= max_tokens:
        return [text]

    # Try separators in order of preference
    separators = ["\n\n", "\n", ". ", " "]
    for sep in separators:
        parts = text.split(sep)
        if len(parts) > 1:
            chunks: list[str] = []
            current = parts[0]
            for part in parts[1:]:
                candidate = current + sep + part
                if _count_tokens(candidate) <= max_tokens:
                    current = candidate
                else:
                    if current.strip():
                        chunks.append(current.strip())
                    current = part
            if current.strip():
                chunks.append(current.strip())

            # If any chunk is still too large, recurse with a finer separator
            result: list[str] = []
            for chunk in chunks:
                if _count_tokens(chunk) > max_tokens:
                    result.extend(_recursive_split(chunk, max_tokens))
                else:
                    result.append(chunk)
            return result

    # Last resort: hard-split by tokens
    tokens = _tokenizer.encode(text)
    result = []
    for i in range(0, len(tokens), max_tokens):
        result.append(_tokenizer.decode(tokens[i : i + max_tokens]))
    return result


def chunk_text(
    pages: list[PageContent],
    chunk_size: int = 600,
    overlap: int = 200,
) -> list[ChunkData]:
    """Split extracted pages into overlapping token-bounded chunks.

    Uses recursive splitting (paragraph -> line -> sentence -> word boundaries).
    Overlap prepends the last `overlap` tokens from the previous chunk.
    """
    chunks: list[ChunkData] = []
    chunk_index = 0
    prev_tail_tokens: list[int] = []  # last N tokens of the previous chunk for overlap
    char_offset = 0

    for page in pages:
        raw_splits = _recursive_split(page.text, chunk_size)

        for split_text in raw_splits:
            # Prepend overlap from previous chunk
            if prev_tail_tokens and overlap > 0:
                overlap_text = _tokenizer.decode(prev_tail_tokens[-overlap:])
                content = overlap_text + " " + split_text
            else:
                content = split_text

            # Ensure we don't exceed chunk_size after adding overlap (re-split if needed)
            if _count_tokens(content) > chunk_size + overlap:
                content_tokens = _tokenizer.encode(content)
                content = _tokenizer.decode(content_tokens[: chunk_size + overlap])

            chunks.append(
                ChunkData(
                    content=content.strip(),
                    page_number=page.page_number,
                    section_heading=page.heading,
                    chunk_index=chunk_index,
                    metadata={"char_offset": char_offset},
                )
            )

            # Track tail for next overlap
            prev_tail_tokens = _tokenizer.encode(split_text)
            char_offset += len(split_text)
            chunk_index += 1

    return chunks


# ---------------------------------------------------------------------------
# Main processing pipeline
# ---------------------------------------------------------------------------


def process_document(document_id: str, agent_id: str) -> dict:
    """End-to-end document processing: extract, chunk, embed, store.

    Fetches the raw file from the documents table, processes it, and inserts
    chunks with embeddings into document_chunks. Updates the document status
    on completion or failure.

    Returns a dict with status, chunk_count, and page_count.
    """
    logger.info("Processing document %s for agent %s", document_id, agent_id)

    try:
        # ---- Fetch the raw document ----
        with get_conn() as conn:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(
                "SELECT raw_file, file_type FROM documents WHERE id = %s AND agent_id = %s",
                (document_id, agent_id),
            )
            row = cur.fetchone()

        if not row:
            raise ValueError(f"Document {document_id} not found for agent {agent_id}")

        raw_file = bytes(row["raw_file"])
        file_type = row["file_type"]

        import time as _time

        # ---- Extract text ----
        t0 = _time.time()
        logger.info("Extracting text from %s document", file_type)
        pages = extract_text(raw_file, file_type)
        logger.info("Extracted %d pages in %.1fs", len(pages), _time.time() - t0)

        # ---- Enhance image-heavy PDF pages with vision (only for scanned PDFs) ----
        if file_type.lower() in (".pdf", "pdf"):
            total_text = sum(len(p.text) for p in pages)
            if total_text < 2000:
                t1 = _time.time()
                logger.info("Low text content (%d chars) — running vision enhancement", total_text)
                pages = _enhance_pdf_pages_with_vision(raw_file, pages)
                logger.info("Vision enhancement done in %.1fs, %d pages", _time.time() - t1, len(pages))
            else:
                logger.info("Skipping vision — document has %d chars of extracted text", total_text)

        page_count = max(p.page_number for p in pages)

        # ---- Chunk ----
        t2 = _time.time()
        chunks = chunk_text(pages)
        if not chunks:
            raise ValueError("Document produced no text chunks")
        logger.info("Created %d chunks in %.1fs", len(chunks), _time.time() - t2)

        # ---- Generate embeddings in batches (using batch API) ----
        t3 = _time.time()
        from app.services.embeddings import generate_embeddings_batch
        chunk_texts = [c.content for c in chunks]
        embeddings = generate_embeddings_batch(chunk_texts)
        logger.info("Generated %d embeddings in %.1fs", len(embeddings), _time.time() - t3)

        # ---- Batch insert chunks ----
        insert_rows = []
        for chunk, embedding in zip(chunks, embeddings):
            insert_rows.append((
                document_id,
                agent_id,
                chunk.chunk_index,
                chunk.content,
                chunk.page_number,
                chunk.section_heading,
                str(embedding),
                psycopg2.extras.Json(chunk.metadata),
            ))

        with get_conn() as conn:
            cur = conn.cursor()
            psycopg2.extras.execute_values(
                cur,
                """INSERT INTO document_chunks
                   (document_id, agent_id, chunk_index, content, page_number,
                    section_heading, embedding, metadata)
                   VALUES %s""",
                insert_rows,
                template="(%s, %s, %s, %s, %s, %s, %s::vector, %s)",
                page_size=100,
            )

        # ---- Convert non-PDF documents to PDF for preview ----
        if file_type.lower() not in (".pdf", "pdf"):
            logger.info("Converting %s document to PDF for preview", file_type)
            pdf_bytes = _convert_to_pdf(raw_file, file_type)
            if pdf_bytes:
                with get_conn() as conn:
                    cur = conn.cursor()
                    cur.execute(
                        "UPDATE documents SET pdf_preview = %s WHERE id = %s AND agent_id = %s",
                        (psycopg2.Binary(pdf_bytes), document_id, agent_id),
                    )
                logger.info("PDF preview stored (%d bytes)", len(pdf_bytes))

                # Remap chunk page numbers to real PDF pages
                try:
                    page_count = _remap_chunks_to_pdf_pages(
                        pdf_bytes, document_id, agent_id
                    )
                    logger.info("Remapped chunks to real PDF pages (count: %d)", page_count)
                except Exception as remap_err:
                    logger.warning("Chunk page remap failed: %s", remap_err)
            else:
                logger.warning("PDF conversion skipped or failed for document %s", document_id)

        # ---- Mark document as ready ----
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                """UPDATE documents
                   SET status = 'ready', page_count = %s, chunk_count = %s, updated_at = NOW()
                   WHERE id = %s AND agent_id = %s""",
                (page_count, len(chunks), document_id, agent_id),
            )

        logger.info(
            "Document %s processed: %d pages, %d chunks",
            document_id, page_count, len(chunks),
        )
        return {"status": "ready", "chunk_count": len(chunks), "page_count": page_count}

    except Exception as exc:
        logger.error("Failed to process document %s: %s", document_id, exc, exc_info=True)

        # Mark document as failed
        try:
            with get_conn() as conn:
                cur = conn.cursor()
                cur.execute(
                    """UPDATE documents
                       SET status = 'failed', error_message = %s, updated_at = NOW()
                       WHERE id = %s AND agent_id = %s""",
                    (str(exc)[:500], document_id, agent_id),
                )
        except Exception as update_exc:
            logger.error("Failed to update document status: %s", update_exc)

        return {"status": "failed", "chunk_count": 0, "page_count": 0}
