import { apiRequest } from "./client";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export interface Conversation {
  id: string;
  contact_id: string | null;
  agent_id: string;
  created_at: string;
  contact_name?: string | null;
  title?: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export type SSEEvent =
  | { type: "text"; content: string }
  | { type: "tool_call"; name: string; status: "running" }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "confirmation"; tool: string; preview: Record<string, unknown>; pending_id: string };

export function listConversations(token: string): Promise<Conversation[]> {
  return apiRequest("/ai/conversations", token);
}

export function createConversation(token: string, contactId?: string): Promise<Conversation> {
  return apiRequest("/ai/conversations", token, {
    method: "POST",
    body: JSON.stringify({ contact_id: contactId ?? null }),
  });
}

export function deleteConversation(token: string, conversationId: string): Promise<{ status: string }> {
  return apiRequest(`/ai/conversations/${conversationId}`, token, { method: "DELETE" });
}

export function getMessages(token: string, conversationId: string): Promise<Message[]> {
  return apiRequest(`/ai/conversations/${conversationId}/messages`, token);
}

export function confirmToolAction(
  token: string,
  conversationId: string,
  pendingId: string
): Promise<{ status: string; result: unknown }> {
  return apiRequest(`/ai/conversations/${conversationId}/confirm`, token, {
    method: "POST",
    body: JSON.stringify({ pending_id: pendingId }),
  });
}

/**
 * Stream a message via SSE. Calls onEvent for each parsed event, onDone when finished.
 * Returns a cleanup function (aborts the fetch).
 */
export function streamMessage(
  token: string,
  conversationId: string,
  content: string,
  onEvent: (event: SSEEvent) => void,
  onDone: () => void,
  onError: (err: Error) => void
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${BASE}/api/ai/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content }),
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
            onDone();
            return;
          }
          try {
            onEvent(JSON.parse(raw) as SSEEvent);
          } catch {
            // ignore malformed chunks
          }
        }
      }
      onDone();
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        onError(err as Error);
      }
    }
  })();

  return () => controller.abort();
}
