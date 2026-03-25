"use client";

interface PDFViewerProps {
  url: string;
  pageNumber: number;
  scale: number;
  onLoadSuccess: (data: { numPages: number }) => void;
}

export default function PDFViewer({ url, pageNumber }: PDFViewerProps) {
  // Use browser's built-in PDF viewer via iframe
  // #page=N navigates to the specific page in Chrome/Edge/Firefox
  const src = `${url}#page=${pageNumber}`;

  return (
    <iframe
      src={src}
      className="w-full h-full border-0"
      title="Document Preview"
    />
  );
}
