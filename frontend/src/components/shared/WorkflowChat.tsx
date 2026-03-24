"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { Send, X, Loader2, Bot, Check, XCircle } from "lucide-react";
import { useSSEStream } from "@/hooks/useSSEStream";
import { createConversation, getMessages, confirmToolAction } from "@/lib/api/conversations";
import { toolLabel, confirmLabel, formatPreview } from "@/lib/ai-chat-helpers";
import MessageContent from "./MessageContent";

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

interface WorkflowChatProps {
  /** Existing workflow ID for editing mode. Null for creation mode. */
  workflowId?: string | null;
  /** Pre-fill the first user message (e.g. from a template) */
  initialPrompt?: string;
  onClose: () => void;
  /** Called when workflow is created/updated */
  onWorkflowSaved?: () => void;
}

export default function WorkflowChat({
  workflowId,
  initialPrompt,
  onClose,
  onWorkflowSaved,
}: WorkflowChatProps) {
  const { getToken } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { isStreaming, startStream } = useSSEStream();
  const [initialized, setInitialized] = useState(false);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Initialize conversation
  useEffect(() => {
    if (initialized) return;
    setInitialized(true);

    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const conv = await createConversation(token);
        setConversationId(conv.id);

        // Load any existing messages
        const msgs = await getMessages(token, conv.id);
        if (msgs.length > 0) {
          setMessages(
            msgs.map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
            }))
          );
        }

        // Auto-send initial prompt for workflow creation
        if (initialPrompt) {
          sendMessage(token, conv.id, initialPrompt);
        } else if (!workflowId) {
          // For creation mode, send a system-like prompt to guide the AI
          sendMessage(
            token,
            conv.id,
            "I want to create a new workflow. Help me define what it should do."
          );
        } else {
          // Editing mode - tell AI which workflow to edit
          sendMessage(
            token,
            conv.id,
            `I want to edit workflow ${workflowId}. Show me the current configuration and ask what I'd like to change.`
          );
        }
      } catch {
        // Conversation creation failed
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = async (token: string, convId: string, text: string) => {
    // Add user message
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    // Add placeholder assistant message
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", isStreaming: true, toolCalls: [] },
    ]);

    startStream(
      token,
      `/api/ai/conversations/${convId}/messages`,
      { content: text },
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
          // If workflow was saved/updated, notify parent
          if (name === "save_workflow" || name === "update_workflow") {
            // Will trigger after tool result
          }
        },
        onToolResult: (name) => {
          setActiveToolName(null);
          if (name === "save_workflow" || name === "update_workflow") {
            onWorkflowSaved?.();
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
                ? { ...m, isStreaming: false, content: m.content || "Done." }
                : m
            )
          );
        },
        onError: (err) => {
          console.error("WorkflowChat stream error:", err);
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
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col" style={{ maxHeight: 480 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: "#0EA5E9" }}>
            <Bot size={14} className="text-white" />
          </div>
          <span className="text-sm font-semibold" style={{ color: "#1E3A5F" }}>
            {workflowId ? "Edit Workflow with AI" : "Create Workflow with AI"}
          </span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 transition-colors">
          <X size={16} className="text-gray-400" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3" style={{ backgroundColor: "#F9FAFB" }}>
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
            {/* Tool call indicator */}
            {msg.role === "assistant" && msg.isStreaming && activeToolName && msg === messages[messages.length - 1] && (
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
                {msg.role === "assistant" ? (
                  <MessageContent content={msg.content} isStreaming={!!msg.isStreaming} compact />
                ) : (
                  msg.content
                )}
                {msg.isStreaming && !msg.confirmationData && (
                  <span className="inline-block w-1 h-3 ml-0.5 bg-gray-400 animate-pulse rounded-sm" />
                )}
              </div>
            )}

            {/* Confirmation card */}
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
                    onClick={() => handleConfirm(msg.id, msg.confirmationData!.pending_id)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[#0EA5E9] text-white rounded-lg hover:bg-[#0EA5E9]/90 text-xs"
                  >
                    <Check size={10} /> Confirm
                  </button>
                  <button
                    onClick={() => handleCancel(msg.id)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-xs"
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
                    ? "bg-green-50 border-green-200"
                    : msg.resolvedAction.status === "failed"
                    ? "bg-red-50 border-red-200"
                    : "bg-gray-50 border-gray-200"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  {msg.resolvedAction.status === "confirmed" ? (
                    <Check size={12} className="text-green-600" />
                  ) : (
                    <XCircle
                      size={12}
                      className={msg.resolvedAction.status === "failed" ? "text-red-500" : "text-gray-500"}
                    />
                  )}
                  <span
                    className={`font-semibold ${
                      msg.resolvedAction.status === "confirmed"
                        ? "text-green-700"
                        : msg.resolvedAction.status === "failed"
                        ? "text-red-700"
                        : "text-gray-700"
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
            placeholder={workflowId ? "Describe the changes…" : "Describe your workflow…"}
            disabled={isStreaming || !conversationId}
            className="flex-1 text-xs text-gray-700 placeholder-gray-400 outline-none bg-transparent disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || !conversationId}
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
