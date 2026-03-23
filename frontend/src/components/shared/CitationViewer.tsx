"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { X, FileText, Download, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useUIStore } from "@/store/ui-store";
import {
  getDocument as getDocApi,
  listDocuments,
  fetchDocumentPreview,
  getDocumentChunk,
  getDocumentChunks,
  type DocumentChunk,
  type Document as DocType,
} from "@/lib/api/documents";

// Lazy-load PDF viewer to avoid SSR issues with pdfjs-dist
const PDFViewer = dynamic(() => import("./PDFViewer"), { ssr: false });

export default function CitationViewer() {
  const { getToken } = useAuth();
  const {
    citationViewerOpen, citationDocId, citationChunkId,
    citationPageNumber, citationFilename, closeCitationViewer,
  } = useUIStore();

  // PDF state
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfFailed, setPdfFailed] = useState(false);

  // Chunk fallback state
  const [chunk, setChunk] = useState<DocumentChunk | null>(null);
  const [doc, setDoc] = useState<DocType | null>(null);
  const [loading, setLoading] = useState(false);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (!citationViewerOpen) {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
      setCurrentPage(1);
      setPdfFailed(false);
      setChunk(null);
      setDoc(null);
      return;
    }

    if (!citationDocId && !citationFilename) return;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        let resolvedDocId = citationDocId;
        let docData: DocType | null = null;

        // Resolve document ID from filename if needed
        if (!resolvedDocId && citationFilename) {
          try {
            const docs = await listDocuments(token, 1, 50);
            const match = docs.documents.find((d) => {
              const citName = citationFilename.replace(/\.{3,}$/, "").replace(/_/g, " ").toLowerCase();
              const docName = d.filename.replace(/_/g, " ").toLowerCase();
              return docName.includes(citName) || citName.includes(docName.slice(0, citName.length));
            });
            if (match) {
              resolvedDocId = match.id;
              docData = match;
            }
          } catch {
            // ignore
          }
        }

        if (!resolvedDocId) {
          if (!cancelled) setLoading(false);
          return;
        }

        // Get document metadata
        if (!docData) {
          docData = await getDocApi(token, resolvedDocId).catch(() => null);
        }
        if (!cancelled) setDoc(docData);

        // Try to load PDF preview
        try {
          const url = await fetchDocumentPreview(token, resolvedDocId);
          if (!cancelled) {
            setPdfUrl(url);
            setPdfFailed(false);
            if (citationPageNumber && citationPageNumber > 0) {
              setCurrentPage(citationPageNumber);
            }
          }
        } catch {
          // PDF preview not available — fall back to chunk text
          if (!cancelled) setPdfFailed(true);

          let chunkData: DocumentChunk | null = null;
          if (citationChunkId) {
            try {
              chunkData = await getDocumentChunk(token, resolvedDocId, citationChunkId);
            } catch {
              // Chunk ID might be hallucinated
            }
          }
          if (!chunkData && citationPageNumber) {
            try {
              const allChunks = await getDocumentChunks(token, resolvedDocId, 1, 200);
              chunkData = allChunks.chunks.find((c) => c.page_number === citationPageNumber) ?? null;
            } catch {
              // ignore
            }
          }
          if (!cancelled) setChunk(chunkData);
        }
      } catch (err) {
        console.error("Failed to load citation:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [citationViewerOpen, citationDocId, citationChunkId, citationFilename, citationPageNumber, getToken]);

  if (!citationViewerOpen) return null;

  const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-[60] transition-opacity"
        onClick={closeCitationViewer}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[540px] max-w-[90vw] bg-white shadow-2xl z-[61] flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <FileText size={16} className="text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#1E3A5F] truncate">
                {doc?.filename || citationFilename || "Document"}
              </p>
              {citationPageNumber && (
                <p className="text-xs text-gray-500">
                  Page {citationPageNumber}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={closeCitationViewer}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-gray-100">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 size={24} className="animate-spin text-gray-400" />
            </div>
          ) : pdfUrl && !pdfFailed ? (
            <PDFViewer
              url={pdfUrl}
              pageNumber={currentPage}
              scale={1}
              onLoadSuccess={() => {}}
            />
          ) : chunk ? (
            /* Chunk text fallback */
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                {chunk.page_number && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-200">
                    Page {chunk.page_number}
                  </span>
                )}
                {chunk.section_heading && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700 border border-purple-200">
                    {chunk.section_heading}
                  </span>
                )}
              </div>
              <div className="bg-white rounded-xl p-4 border border-gray-200">
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {chunk.content}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-8">
              Could not load the source document.
            </p>
          )}
        </div>

        {/* Footer */}
        {doc && (
          <div className="border-t border-gray-100 p-3 flex items-center justify-end">
            <a
              href={`${BASE}/api/documents/${doc.id}/download`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-colors"
            >
              <Download size={13} />
              Download Original
            </a>
          </div>
        )}
      </div>
    </>
  );
}
