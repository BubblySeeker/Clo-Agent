"use client";

import { parseMessageWithCitations } from "@/lib/ai-chat-helpers";
import { detectRichBlocks } from "@/lib/rich-block-detector";
import CitationBadge from "./CitationBadge";
import MarkdownRenderer from "./MarkdownRenderer";
import MetricsBar from "./chat-renderers/MetricsBar";
import KeyValueCard from "./chat-renderers/KeyValueCard";

interface MessageContentProps {
  content: string;
  isStreaming: boolean;
  compact?: boolean;
}

export default function MessageContent({
  content,
  isStreaming,
  compact,
}: MessageContentProps) {
  // During streaming, render raw text (no parsing overhead, preserves cursor UX)
  if (isStreaming) {
    return <span>{content}</span>;
  }

  // Parse citations first
  const segments = parseMessageWithCitations(content);

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "citation") {
          return (
            <CitationBadge
              key={i}
              filename={seg.filename}
              pageNumber={seg.pageNumber}
              chunkId={seg.chunkId}
              documentId={seg.documentId ?? undefined}
            />
          );
        }

        // Text segment — detect rich blocks
        const blocks = detectRichBlocks(seg.content);

        return (
          <span key={i}>
            {blocks.map((block, j) => {
              switch (block.type) {
                case "metrics-bar":
                  return (
                    <MetricsBar
                      key={j}
                      metrics={block.metrics}
                      compact={compact}
                    />
                  );
                case "key-value-card":
                  return (
                    <KeyValueCard
                      key={j}
                      title={block.title}
                      pairs={block.pairs}
                      compact={compact}
                    />
                  );
                case "markdown":
                  return (
                    <MarkdownRenderer
                      key={j}
                      content={block.content}
                      compact={compact}
                    />
                  );
              }
            })}
          </span>
        );
      })}
    </>
  );
}
