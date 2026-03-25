import { useState, useRef, useCallback } from "react";
import { streamMessage, type SSEEvent } from "@/lib/api/conversations";

export interface AIStreamCallbacks {
  onTextUpdate: (accumulated: string) => void;
  onToolCall: (toolName: string) => void;
  onToolResult: () => void;
  onConfirmation: (data: {
    tool: string;
    preview: Record<string, unknown>;
    pending_id: string;
  }) => void;
  onAutoExecuted: (data: { name: string; result: Record<string, unknown>; status: "success" | "error" }) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

export interface UseAIStreamReturn {
  isStreaming: boolean;
  activeToolName: string | null;
  startStream: (
    token: string,
    conversationId: string,
    message: string,
    callbacks: AIStreamCallbacks
  ) => void;
  cleanup: () => void;
}

export function useAIStream(): UseAIStreamReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const accumulatedRef = useRef("");

  const cleanup = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
  }, []);

  const startStream = useCallback(
    (
      token: string,
      conversationId: string,
      message: string,
      callbacks: AIStreamCallbacks
    ) => {
      accumulatedRef.current = "";
      setIsStreaming(true);
      setActiveToolName(null);

      cleanupRef.current = streamMessage(
        token,
        conversationId,
        message,
        (event: SSEEvent) => {
          if (event.type === "text") {
            accumulatedRef.current += event.content;
            callbacks.onTextUpdate(accumulatedRef.current);
          } else if (event.type === "tool_call") {
            setActiveToolName(event.name);
            callbacks.onToolCall(event.name);
          } else if (event.type === "tool_result") {
            setActiveToolName(null);
            callbacks.onToolResult();
          } else if (event.type === "confirmation") {
            callbacks.onConfirmation({
              tool: event.tool,
              preview: event.preview,
              pending_id: event.pending_id,
            });
          } else if (event.type === "auto_executed") {
            callbacks.onAutoExecuted({
              name: event.name,
              result: event.result,
              status: event.status,
            });
          }
        },
        () => {
          setIsStreaming(false);
          setActiveToolName(null);
          callbacks.onDone();
        },
        (err: Error) => {
          setIsStreaming(false);
          setActiveToolName(null);
          callbacks.onError(err);
        }
      );
    },
    []
  );

  return { isStreaming, activeToolName, startStream, cleanup };
}
