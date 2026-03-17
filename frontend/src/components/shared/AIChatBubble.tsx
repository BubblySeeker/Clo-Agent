"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { Bot, Send, Minimize2, Check, XCircle, Loader2 } from "lucide-react";
import {
  streamMessage,
  createConversation,
  getMessages,
  confirmToolAction,
  type SSEEvent,
} from "@/lib/api/conversations";
import { useUIStore } from "@/store/ui-store";
import { toolLabel, confirmLabel, formatPreview } from "@/lib/ai-chat-helpers";

export default function AIChatBubble() {
  const { getToken } = useAuth();
  const pathname = usePathname();

  const {
    chatOpen,
    chatConversationId,
    chatMessages,
    setChatOpen,
    setChatConversationId,
    setChatMessages,
    appendChatMessage,
    updateLastMessage,
  } = useUIStore();

  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Detect if we're on a contact detail page
  const contactMatch = pathname.match(/\/dashboard\/contacts\/([a-f0-9-]{36})/);
  const contactId = contactMatch?.[1] ?? null;

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isStreaming]);

  // When bubble opens, ensure we have a conversation
  useEffect(() => {
    if (!chatOpen) return;
    if (chatConversationId) return;

    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const conv = await createConversation(token, contactId ?? undefined);
        setChatConversationId(conv.id);
      } catch {
        // will retry next time bubble opens
      }
    })();
  }, [chatOpen, chatConversationId, contactId, getToken, setChatConversationId]);

  // When conversation changes, load its history
  useEffect(() => {
    if (!chatConversationId) return;
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const msgs = await getMessages(token, chatConversationId);
        setChatMessages(
          msgs.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
          }))
        );
      } catch {
        // ignore — messages will be empty
      }
    })();
  }, [chatConversationId, getToken, setChatMessages]);

  const handleSend = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || !chatConversationId || isStreaming) return;
    setInput("");

    const token = await getToken();
    if (!token) return;

    // Optimistic user message
    appendChatMessage({ id: crypto.randomUUID(), role: "user", content: msg });

    // Placeholder assistant message (will be filled by stream)
    const assistantId = crypto.randomUUID();
    appendChatMessage({
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
      toolCalls: [],
    });

    setIsStreaming(true);
    let accumulated = "";

    cleanupRef.current = streamMessage(
      token,
      chatConversationId,
      msg,
      (event: SSEEvent) => {
        if (event.type === "text") {
          accumulated += event.content;
          updateLastMessage({ content: accumulated, isStreaming: true });
        } else if (event.type === "tool_call") {
          setActiveToolName(event.name);
          const toolName = event.name;
          const current = useUIStore.getState().chatMessages;
          if (current.length > 0) {
            const last = current[current.length - 1];
            useUIStore.getState().setChatMessages([
              ...current.slice(0, -1),
              { ...last, toolCalls: [...(last.toolCalls ?? []), toolName] },
            ]);
          }
        } else if (event.type === "tool_result") {
          setActiveToolName(null);
        } else if (event.type === "confirmation") {
          updateLastMessage({
            confirmationData: {
              tool: event.tool,
              preview: event.preview,
              pending_id: event.pending_id,
            },
          });
        }
      },
      () => {
        setIsStreaming(false);
        setActiveToolName(null);
        const current = useUIStore.getState().chatMessages;
        const last = current.length > 0 ? current[current.length - 1] : null;
        updateLastMessage({
          isStreaming: false,
          content: (last?.content) || "Sorry, I couldn\u2019t generate a response. Please try again.",
        });
      },
      (err) => {
        console.error("AI stream error:", err);
        setIsStreaming(false);
        setActiveToolName(null);
        updateLastMessage({ content: "Sorry, something went wrong. Please try again.", isStreaming: false });
      }
    );
  };

  const handleConfirm = async (pendingId: string) => {
    const token = await getToken();
    if (!token || !chatConversationId) return;
    const current = useUIStore.getState().chatMessages;
    const last = current[current.length - 1];
    const actionInfo = last?.confirmationData;
    try {
      await confirmToolAction(token, chatConversationId, pendingId);
      updateLastMessage({
        confirmationData: undefined,
        content: "",
        resolvedAction: actionInfo ? { tool: actionInfo.tool, preview: actionInfo.preview, status: "confirmed" } : undefined,
      });
    } catch {
      updateLastMessage({
        confirmationData: undefined,
        content: "",
        resolvedAction: actionInfo ? { tool: actionInfo.tool, preview: actionInfo.preview, status: "failed" } : undefined,
      });
    }
  };

  const handleCancel = () => {
    const current = useUIStore.getState().chatMessages;
    const last = current[current.length - 1];
    const actionInfo = last?.confirmationData;
    updateLastMessage({
      confirmationData: undefined,
      content: "",
      resolvedAction: actionInfo ? { tool: actionInfo.tool, preview: actionInfo.preview, status: "cancelled" } : undefined,
    });
  };

  const placeholder = contactId
    ? "Ask about this contact..."
    : "Ask anything about your clients...";

  if (!chatOpen) {
    return (
      <button
        onClick={() => setChatOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full text-white shadow-xl flex items-center justify-center hover:opacity-90 transition-all hover:scale-105"
        style={{ backgroundColor: "#0EA5E9" }}
        title="Open AI Assistant"
      >
        <Bot size={22} />
        <span
          className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full border-2 border-white animate-pulse"
          style={{ backgroundColor: "#22c55e" }}
        />
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl shadow-2xl overflow-hidden"
      style={{ width: 400, height: 520, backgroundColor: "white", border: "1px solid #e5e7eb" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ backgroundColor: "#0F1E36" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "#0EA5E9" }}
          >
            <Bot size={16} className="text-white" />
          </div>
          <span className="text-white text-sm font-semibold">CloAgent AI</span>
          {contactId && (
            <span className="text-xs text-blue-300 ml-1">(contact-scoped)</span>
          )}
        </div>
        <button
          onClick={() => setChatOpen(false)}
          className="text-white/60 hover:text-white transition-colors"
        >
          <Minimize2 size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3" style={{ backgroundColor: "#F9FAFB" }}>
        {chatMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <Bot size={32} style={{ color: "#0EA5E9" }} />
            <p className="text-sm text-gray-500">
              {contactId ? "Ask about this contact" : "How can I help you today?"}
            </p>
            {!contactId && (
              <div className="flex flex-col gap-1.5 w-full">
                {["How many contacts do I have?", "Summarize my pipeline", "Who needs follow-up?"].map((p) => (
                  <button
                    key={p}
                    onClick={() => handleSend(p)}
                    className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:border-[#0EA5E9] hover:text-[#0EA5E9] transition-colors text-left"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {chatMessages.map((msg) => (
          <div key={msg.id} className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
            {/* Tool call indicator */}
            {msg.role === "assistant" && msg.isStreaming && activeToolName && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                <Loader2 size={11} className="animate-spin" />
                <span>{toolLabel[activeToolName] ?? activeToolName}…</span>
              </div>
            )}

            {/* Message bubble */}
            {msg.content && (
              <div
                className={`px-3 py-2 rounded-xl text-sm leading-relaxed max-w-[85%] ${
                  msg.role === "user"
                    ? "text-white rounded-tr-sm"
                    : "bg-white text-gray-800 shadow-sm rounded-tl-sm border border-gray-100"
                }`}
                style={msg.role === "user" ? { backgroundColor: "#0EA5E9" } : {}}
              >
                {msg.content}
                {msg.isStreaming && !msg.confirmationData && (
                  <span className="inline-block w-1 h-3 ml-0.5 bg-gray-400 animate-pulse rounded-sm" />
                )}
              </div>
            )}

            {/* Confirmation card — pending */}
            {msg.confirmationData && (
              <div className="bg-blue-50 border border-[#0EA5E9]/20 rounded-xl p-3 w-full max-w-[90%] text-xs">
                <p className="font-semibold text-[#1E3A5F] mb-2">
                  {confirmLabel[msg.confirmationData.tool] ?? msg.confirmationData.tool}
                </p>
                <p className="text-[#1E3A5F]/80 mb-2">
                  {formatPreview(msg.confirmationData.tool, msg.confirmationData.preview)}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleConfirm(msg.confirmationData!.pending_id)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[#0EA5E9] text-white rounded-lg hover:bg-[#0EA5E9]/90 text-xs"
                  >
                    <Check size={10} /> Confirm
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex items-center gap-1 px-2.5 py-1 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-xs"
                  >
                    <XCircle size={10} /> Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Resolved action card — after confirm/cancel */}
            {msg.resolvedAction && (
              <div className={`rounded-xl p-3 w-full max-w-[90%] text-xs border ${
                msg.resolvedAction.status === "confirmed"
                  ? "bg-green-50 border-green-200"
                  : msg.resolvedAction.status === "failed"
                  ? "bg-red-50 border-red-200"
                  : "bg-gray-50 border-gray-200"
              }`}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  {msg.resolvedAction.status === "confirmed" ? (
                    <Check size={12} className="text-green-600" />
                  ) : (
                    <XCircle size={12} className={msg.resolvedAction.status === "failed" ? "text-red-500" : "text-gray-500"} />
                  )}
                  <span className={`font-semibold ${
                    msg.resolvedAction.status === "confirmed" ? "text-green-700" : msg.resolvedAction.status === "failed" ? "text-red-700" : "text-gray-700"
                  }`}>
                    {confirmLabel[msg.resolvedAction.tool] ?? msg.resolvedAction.tool}
                    {msg.resolvedAction.status === "confirmed" ? " — Done" : msg.resolvedAction.status === "failed" ? " — Failed" : " — Cancelled"}
                  </span>
                </div>
                <p className="text-gray-600">
                  {formatPreview(msg.resolvedAction.tool, msg.resolvedAction.preview)}
                </p>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-gray-100 bg-white shrink-0">
        <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 border border-gray-200 focus-within:border-[#0EA5E9] transition-colors">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={placeholder}
            disabled={isStreaming}
            className="flex-1 text-xs text-gray-700 placeholder-gray-400 outline-none bg-transparent disabled:opacity-50"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isStreaming}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white transition-opacity hover:opacity-90 disabled:opacity-40 shrink-0"
            style={{ backgroundColor: "#0EA5E9" }}
          >
            {isStreaming ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          </button>
        </div>
      </div>
    </div>
  );
}
