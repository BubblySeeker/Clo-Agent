"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface MarkdownRendererProps {
  content: string;
  compact?: boolean;
}

export default function MarkdownRenderer({
  content,
  compact,
}: MarkdownRendererProps) {
  const components: Components = {
    h2: ({ children }) => (
      <h2
        className={`font-bold text-[#1E3A5F] mt-3 mb-1 ${
          compact ? "text-xs" : "text-sm"
        }`}
      >
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3
        className={`font-semibold text-gray-700 mt-2 mb-1 ${
          compact ? "text-xs" : "text-sm"
        }`}
      >
        {children}
      </h3>
    ),
    p: ({ children }) => (
      <p className={`mb-2 last:mb-0 ${compact ? "text-xs" : "text-sm"}`}>
        {children}
      </p>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold text-gray-900">{children}</strong>
    ),
    em: ({ children }) => <em className="italic text-gray-600">{children}</em>,
    ul: ({ children }) => (
      <ul
        className={`ml-4 mb-2 list-disc ${compact ? "text-xs" : "text-sm"}`}
      >
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol
        className={`ml-4 mb-2 list-decimal ${compact ? "text-xs" : "text-sm"}`}
      >
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="mb-0.5">{children}</li>,
    table: ({ children }) => (
      <div className="rounded-lg border border-gray-200 overflow-hidden my-2">
        <div className="overflow-x-auto">
          <table className="w-full caption-bottom text-sm">{children}</table>
        </div>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="[&_tr]:border-b bg-gray-50">{children}</thead>
    ),
    tbody: ({ children }) => (
      <tbody className="[&_tr:last-child]:border-0">{children}</tbody>
    ),
    tr: ({ children }) => (
      <tr className="border-b transition-colors hover:bg-gray-50/50">
        {children}
      </tr>
    ),
    th: ({ children }) => (
      <th
        className={`px-3 py-2 text-left align-middle font-medium text-gray-500 ${
          compact ? "text-[10px]" : "text-xs"
        }`}
      >
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td
        className={`px-3 py-2 align-middle ${
          compact ? "text-[11px]" : "text-xs"
        }`}
      >
        {children}
      </td>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        className="text-[#0EA5E9] hover:underline"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-[#0EA5E9] pl-3 italic text-gray-600 my-2">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="border-t border-gray-200 my-3" />,
    code: ({ className, children }) => {
      // Check if this is a code block (has language class) or inline code
      const isBlock = className?.startsWith("language-");
      if (isBlock) {
        return (
          <code
            className={`block bg-gray-900 text-gray-100 p-3 rounded-lg text-xs font-mono overflow-x-auto my-2 ${className}`}
          >
            {children}
          </code>
        );
      }
      return (
        <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono text-gray-800">
          {children}
        </code>
      );
    },
    pre: ({ children }) => <pre className="my-2">{children}</pre>,
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
