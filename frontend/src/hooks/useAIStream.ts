import { useRef, useCallback } from "react";
import { streamMessage, type SSEEvent } from "@/lib/api/conversations";

export interface AIStreamCallbacks {
  onText: (content: string) => void;
  onToolCall: (name: string) => void;
  onToolResult: (name: string, result: unknown) => void;
  onConfirmation: (tool: string, preview: Record<string, unknown>, pendingId: string) => void;
  onAutoExecuted: (name: string, result: unknown) => void;
  onError: (message: string) => void;
  onDone: () => void;
}

export function useAIStream() {
  const cleanupRef = useRef<(() => void) | null>(null);

  const start = useCallback(
    (
      token: string,
      conversationId: string,
      content: string,
      callbacks: AIStreamCallbacks
    ) => {
      // Abort any in-flight stream
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }

      cleanupRef.current = streamMessage(
        token,
        conversationId,
        content,
        (event: SSEEvent) => {
          switch (event.type) {
            case "text":
              callbacks.onText(event.content);
              break;
            case "tool_call":
              callbacks.onToolCall(event.name);
              break;
            case "tool_result":
              callbacks.onToolResult(event.name, event.result);
              break;
            case "confirmation":
              callbacks.onConfirmation(event.tool, event.preview, event.pending_id);
              break;
            case "auto_executed":
              callbacks.onAutoExecuted(event.name, event.result);
              break;
            case "error":
              callbacks.onError(event.message);
              break;
          }
        },
        () => {
          cleanupRef.current = null;
          callbacks.onDone();
        },
        (err) => {
          cleanupRef.current = null;
          callbacks.onError(err.message);
        }
      );
    },
    []
  );

  const abort = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
  }, []);

  return { start, abort };
}
