"use client";

import { FileText } from "lucide-react";
import { useUIStore } from "@/store/ui-store";

interface CitationBadgeProps {
  filename: string;
  pageNumber: number | null;
  chunkId: string | null;
  documentId?: string;
}

export default function CitationBadge({ filename, pageNumber, chunkId, documentId }: CitationBadgeProps) {
  const openCitationViewer = useUIStore((s) => s.openCitationViewer);
  const openCitationByFilename = useUIStore((s) => s.openCitationByFilename);

  const handleClick = () => {
    if (documentId && chunkId) {
      openCitationViewer(documentId, chunkId, pageNumber);
    } else {
      // Fallback: open by filename + page number (for citations without chunk UUIDs)
      // For page-only citations (empty filename), still open — viewer will resolve to most recent doc
      openCitationByFilename(filename || "", pageNumber);
    }
  };

  return (
    <span
      onClick={handleClick}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
        bg-blue-50 text-blue-700 border border-blue-200
        cursor-pointer hover:bg-blue-100 hover:border-blue-300 transition-colors"
      title={`${filename}${pageNumber ? `, Page ${pageNumber}` : ""}`}
    >
      <FileText size={11} className="shrink-0" />
      {filename ? (
        <span className="truncate max-w-[120px]">{filename}</span>
      ) : null}
      {pageNumber && (
        <span className="text-blue-500">{filename ? `p.${pageNumber}` : `Page ${pageNumber}`}</span>
      )}
    </span>
  );
}
