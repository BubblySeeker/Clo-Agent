import { useRef, useState, useCallback } from "react";
import type { SSEEvent } from "@/lib/api/conversations";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export interface SSEStreamCallbacks {
  onText: (accumulated: string) => void;
  onToolCall: (name: string) => void;
  onToolResult: (name: string, result: unknown) => void;
  onConfirmation: (tool: string, preview: Record<string, unknown>, pendingId: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

/**
 * Generic SSE streaming hook. Handles fetch → ReadableStream → SSE parsing.
 * Works for both AI chat and workflow execution endpoints.
 */
export function useSSEStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const stopStream = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setIsStreaming(false);
  }, []);

  const startStream = useCallback(
    (
      token: string,
      url: string,
      body: Record<string, unknown>,
      callbacks: SSEStreamCallbacks
    ) => {
      // Abort any in-flight stream
      cleanupRef.current?.();
      setError(null);
      setIsStreaming(true);

      const controller = new AbortController();
      let accumulated = "";

      (async () => {
        try {
          const res = await fetch(`${BASE}${url}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });

          if (!res.ok) {
            const text = await res.text().catch(() => res.statusText);
            throw new Error(text || res.statusText);
          }

          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6).trim();
              if (raw === "[DONE]") {
                setIsStreaming(false);
                callbacks.onDone();
                return;
              }
              try {
                const event = JSON.parse(raw) as SSEEvent;
                if (event.type === "text") {
                  accumulated += event.content;
                  callbacks.onText(accumulated);
                } else if (event.type === "tool_call") {
                  callbacks.onToolCall(event.name);
                } else if (event.type === "tool_result") {
                  callbacks.onToolResult(event.name, event.result);
                } else if (event.type === "confirmation") {
                  callbacks.onConfirmation(event.tool, event.preview, event.pending_id);
                }
              } catch {
                // ignore malformed chunks
              }
            }
          }
          setIsStreaming(false);
          callbacks.onDone();
        } catch (err) {
          if ((err as Error).name !== "AbortError") {
            setIsStreaming(false);
            setError(err as Error);
            callbacks.onError(err as Error);
          }
        }
      })();

      cleanupRef.current = () => controller.abort();
    },
    []
  );

  return { isStreaming, error, startStream, stopStream };
}
