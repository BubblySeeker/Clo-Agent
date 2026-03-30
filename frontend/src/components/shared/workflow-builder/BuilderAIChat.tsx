"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { Send, X, Loader2, Bot, Check, XCircle, Sparkles } from "lucide-react";
import { useSSEStream } from "@/hooks/useSSEStream";
import { createConversation, getMessages, confirmToolAction } from "@/lib/api/conversations";
import { toolLabel, confirmLabel, formatPreview } from "@/lib/ai-chat-helpers";
import MessageContent from "../MessageContent";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  toolCalls?: string[];
  confirmationData?: {
    tool: string;
    preview: Record<string, unknown>;
    pending_id: string;
  };
  resolvedAction?: {
    tool: string;
    preview: Record<string, unknown>;
    status: "confirmed" | "cancelled" | "failed";
  };
}

interface BuilderAIChatProps {
  workflowId?: string | null;
  onWorkflowSaved?: (workflowId?: string) => void;
  onClose: () => void;
}

export default function BuilderAIChat({
  workflowId,
  onWorkflowSaved,
  onClose,
}: BuilderAIChatProps) {
  const { getToken } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    // Static welcome message — no API call
    {
      id: "welcome",
      role: "assistant",
      content: workflowId
        ? "What changes would you like to make to this workflow? Describe what you want in plain English."
        : "Describe the workflow you want to create. For example:\n\n*\"When I get an email from Matt, send a summary to my Gmail\"*\n\nI'll figure out the trigger, actions, and build it for you.",
    },
  ]);
  const [input, setInput] = useState("");
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { isStreaming, startStream } = useSSEStream();
  const initRef = useRef(false); // Guard against React Strict Mode double-fire
  const isFirstMessage = useRef(true); // Track first message for context injection

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Initialize conversation (create only, no auto-send)
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const conv = await createConversation(token);
        setConversationId(conv.id);
      } catch {
        // Conversation creation failed
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = async (token: string, convId: string, text: string) => {
    // The system prompt (workflow_creation mode) already has full context about
    // available node types and instructions. Just send the user's text directly.
    // On first message for editing, include the workflow ID.
    let fullText = text;
    if (isFirstMessage.current && workflowId) {
      isFirstMessage.current = false;
      fullText = `[Editing workflow ID: ${workflowId}] ${text}`;
    } else if (isFirstMessage.current) {
      isFirstMessage.current = false;
    }

    // Add user message to UI
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", isStreaming: true, toolCalls: [] },
    ]);

    startStream(
      token,
      `/api/ai/conversations/${convId}/messages`,
      { content: fullText, prompt_mode: "workflow_creation" },
      {
        onText: (accumulated) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: accumulated, isStreaming: true } : m))
          );
        },
        onToolCall: (name) => {
          setActiveToolName(name);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, toolCalls: [...(m.toolCalls ?? []), name] }
                : m
            )
          );
        },
        onToolResult: (name, result) => {
          setActiveToolName(null);
          if (name === "save_workflow" || name === "update_workflow" || name === "save_conversation_as_workflow") {
            const resultObj = result as Record<string, unknown>;
            onWorkflowSaved?.(resultObj?.id as string | undefined);
            // Add a success indicator to the message
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      resolvedAction: {
                        tool: name,
                        preview: (result as Record<string, unknown>) ?? {},
                        status: "confirmed" as const,
                      },
                    }
                  : m
              )
            );
          }
        },
        onConfirmation: (tool, preview, pendingId) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, confirmationData: { tool, preview, pending_id: pendingId } }
                : m
            )
          );
        },
        onDone: () => {
          setActiveToolName(null);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, isStreaming: false }
                : m
            )
          );
        },
        onError: (err) => {
          console.error("BuilderAIChat stream error:", err);
          setActiveToolName(null);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: "Sorry, something went wrong. Please try again.", isStreaming: false }
                : m
            )
          );
        },
      }
    );
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !conversationId || isStreaming) return;
    setInput("");
    const token = await getToken();
    if (!token) return;
    sendMessage(token, conversationId, text);
  };

  const handleConfirm = async (msgId: string, pendingId: string) => {
    const token = await getToken();
    if (!token || !conversationId) return;
    const msg = messages.find((m) => m.id === msgId);
    const actionInfo = msg?.confirmationData;
    try {
      await confirmToolAction(token, conversationId, pendingId);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                confirmationData: undefined,
                resolvedAction: actionInfo
                  ? { tool: actionInfo.tool, preview: actionInfo.preview, status: "confirmed" as const }
                  : undefined,
              }
            : m
        )
      );
      onWorkflowSaved?.();
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                confirmationData: undefined,
                resolvedAction: actionInfo
                  ? { tool: actionInfo.tool, preview: actionInfo.preview, status: "failed" as const }
                  : undefined,
              }
            : m
        )
      );
    }
  };

  const handleCancel = (msgId: string) => {
    const msg = messages.find((m) => m.id === msgId);
    const actionInfo = msg?.confirmationData;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? {
              ...m,
              confirmationData: undefined,
              resolvedAction: actionInfo
                ? { tool: actionInfo.tool, preview: actionInfo.preview, status: "cancelled" as const }
                : undefined,
            }
          : m
      )
    );
  };

  return (
    <div
      className="w-[360px] shrink-0 border-l border-white/10 flex flex-col h-full"
      style={{
        background: "linear-gradient(180deg, #0D1117 0%, #0B0F19 100%)",
        animation: "slideInRight 200ms ease-out",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-sky-500">
            <Sparkles size={13} className="text-white" />
          </div>
          <div>
            <span className="text-xs font-semibold text-white">
              AI Workflow Assistant
            </span>
            <p className="text-[9px] text-white/30">
              {workflowId ? "Edit with natural language" : "Describe your workflow"}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
          <X size={14} className="text-white/40" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
            {/* Tool call indicator */}
            {msg.role === "assistant" && msg.isStreaming && activeToolName && msg === messages[messages.length - 1] && (
              <div className="flex items-center gap-1.5 text-xs text-white/40 mb-1">
                <Loader2 size={11} className="animate-spin" />
                <span>{toolLabel[activeToolName] ?? activeToolName}...</span>
              </div>
            )}

            {/* Message bubble */}
            {msg.content && (
              <div
                className={`px-3 py-2 rounded-xl text-sm leading-relaxed max-w-[90%] ${
                  msg.role === "user"
                    ? "bg-gradient-to-br from-purple-500/80 to-sky-500/80 text-white rounded-tr-sm"
                    : "bg-white/5 text-white/80 rounded-tl-sm border border-white/10"
                }`}
              >
                {msg.role === "assistant" ? (
                  <MessageContent content={msg.content} isStreaming={!!msg.isStreaming} compact />
                ) : (
                  msg.content
                )}
                {msg.isStreaming && !msg.confirmationData && (
                  <span className="inline-block w-1 h-3 ml-0.5 bg-white/40 animate-pulse rounded-sm" />
                )}
              </div>
            )}

            {/* Confirmation card */}
            {msg.confirmationData && (
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 w-full max-w-[90%] text-xs">
                <p className="font-semibold text-white mb-2">
                  {confirmLabel[msg.confirmationData.tool] ?? msg.confirmationData.tool}
                </p>
                <p className="text-white/60 mb-2">
                  {formatPreview(msg.confirmationData.tool, msg.confirmationData.preview)}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleConfirm(msg.id, msg.confirmationData!.pending_id)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-gradient-to-r from-purple-500 to-sky-500 text-white rounded-lg hover:opacity-90 text-xs"
                  >
                    <Check size={10} /> Confirm
                  </button>
                  <button
                    onClick={() => handleCancel(msg.id)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-white/10 text-white/60 rounded-lg hover:bg-white/15 text-xs"
                  >
                    <XCircle size={10} /> Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Resolved action */}
            {msg.resolvedAction && (
              <div
                className={`rounded-xl p-3 w-full max-w-[90%] text-xs border ${
                  msg.resolvedAction.status === "confirmed"
                    ? "bg-emerald-500/10 border-emerald-500/20"
                    : msg.resolvedAction.status === "failed"
                    ? "bg-red-500/10 border-red-500/20"
                    : "bg-white/5 border-white/10"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  {msg.resolvedAction.status === "confirmed" ? (
                    <Check size={12} className="text-emerald-400" />
                  ) : (
                    <XCircle
                      size={12}
                      className={msg.resolvedAction.status === "failed" ? "text-red-400" : "text-white/40"}
                    />
                  )}
                  <span
                    className={`font-semibold ${
                      msg.resolvedAction.status === "confirmed"
                        ? "text-emerald-400"
                        : msg.resolvedAction.status === "failed"
                        ? "text-red-400"
                        : "text-white/40"
                    }`}
                  >
                    {confirmLabel[msg.resolvedAction.tool] ?? msg.resolvedAction.tool}
                    {msg.resolvedAction.status === "confirmed"
                      ? " — Done"
                      : msg.resolvedAction.status === "failed"
                      ? " — Failed"
                      : " — Cancelled"}
                  </span>
                </div>
                <p className="text-white/40">
                  {formatPreview(msg.resolvedAction.tool, msg.resolvedAction.preview)}
                </p>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-white/10 shrink-0">
        <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/10 focus-within:border-purple-500/50 transition-colors">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder={workflowId ? "Describe changes..." : "Describe your workflow..."}
            disabled={isStreaming || !conversationId}
            className="flex-1 text-xs text-white/80 placeholder-white/30 outline-none bg-transparent disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || !conversationId}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white transition-opacity hover:opacity-90 disabled:opacity-30 shrink-0 bg-gradient-to-r from-purple-500 to-sky-500"
          >
            {isStreaming ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
