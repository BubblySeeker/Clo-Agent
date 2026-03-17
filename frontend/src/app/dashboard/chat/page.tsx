"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listConversations,
  createConversation,
  getMessages,
  deleteConversation,
  streamMessage,
  confirmToolAction,
  type SSEEvent,
} from "@/lib/api/conversations";
import { Plus, Search, Send, Trash2, Sparkles, User, Loader2, Check, XCircle } from "lucide-react";
import { type ChatMessage } from "@/store/ui-store";
import { toolLabel, confirmLabel, formatPreview } from "@/lib/ai-chat-helpers";

const suggestedPrompts = [
  "Who hasn't heard from me in 2 weeks?",
  "Show me all active deals",
  "Which contacts need follow-up?",
  "Summarize my pipeline",
];

export default function ChatPage() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [hoveredConv, setHoveredConv] = useState<string | null>(null);
  const [localMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const handleSendActiveRef = useRef(false);

  const { data: conversations = [], error: convsError } = useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const token = await getToken();
      return listConversations(token!);
    },
  });

  const convsLoadFailed = !!convsError;

  const { data: serverMessages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["messages", activeConvId],
    queryFn: async () => {
      if (!activeConvId) return [];
      const token = await getToken();
      return getMessages(token!, activeConvId);
    },
    enabled: !!activeConvId && !isStreaming,
  });

  const displayedMessages: ChatMessage[] = localMessages.length > 0
    ? localMessages
    : serverMessages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

  const createConvMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return createConversation(token!);
    },
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (!handleSendActiveRef.current) {
        setActiveConvId(conv.id);
        setChatMessages([]);
      }
    },
    onError: () => {}, // handled in handleSend try/catch
  });

  const deleteConvMutation = useMutation({
    mutationFn: async (convId: string) => {
      const token = await getToken();
      return deleteConversation(token!, convId);
    },
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (activeConvId === deletedId) {
        setActiveConvId(null);
        setChatMessages([]);
      }
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayedMessages, isStreaming]);

  const handleSend = useCallback(
    async (text?: string) => {
      const msg = (text ?? input).trim();
      if (!msg || isStreaming) return;

      const token = await getToken();
      if (!token) return;

      // Auto-create conversation if none active
      let convId = activeConvId;
      handleSendActiveRef.current = true;
      if (!convId) {
        try {
          const conv = await createConvMutation.mutateAsync();
          convId = conv.id;
          setActiveConvId(conv.id);
          setChatMessages([]);
        } catch {
          return; // leave input intact so user can retry
        }
      }

      setInput("");

      // Seed from server messages + optimistic user msg + assistant placeholder
      const userMsgId = crypto.randomUUID();
      const assistantMsgId = crypto.randomUUID();
      const baseMessages: ChatMessage[] = serverMessages.map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      setChatMessages([
        ...baseMessages,
        { id: userMsgId, role: "user", content: msg },
        { id: assistantMsgId, role: "assistant", content: "", isStreaming: true, toolCalls: [] },
      ]);

      setIsStreaming(true);
      let accumulated = "";

      cleanupRef.current = streamMessage(
        token,
        convId,
        msg,
        (event: SSEEvent) => {
          if (event.type === "text") {
            accumulated += event.content;
            setChatMessages((prev) => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last && last.id === assistantMsgId) {
                msgs[msgs.length - 1] = { ...last, content: accumulated, isStreaming: true };
              }
              return msgs;
            });
          } else if (event.type === "tool_call") {
            setActiveToolName(event.name);
            setChatMessages((prev) => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last && last.id === assistantMsgId) {
                msgs[msgs.length - 1] = {
                  ...last,
                  toolCalls: [...(last.toolCalls ?? []), event.name],
                };
              }
              return msgs;
            });
          } else if (event.type === "tool_result") {
            setActiveToolName(null);
          } else if (event.type === "confirmation") {
            setChatMessages((prev) => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last && last.id === assistantMsgId) {
                msgs[msgs.length - 1] = {
                  ...last,
                  confirmationData: {
                    tool: event.tool,
                    preview: event.preview,
                    pending_id: event.pending_id,
                  },
                };
              }
              return msgs;
            });
          }
        },
        () => {
          setIsStreaming(false);
          setActiveToolName(null);
          handleSendActiveRef.current = false;
          queryClient.invalidateQueries({ queryKey: ["conversations"] });
          queryClient.invalidateQueries({ queryKey: ["messages", convId] });
          setChatMessages((prev) => {
            const msgs = [...prev];
            const last = msgs[msgs.length - 1];
            if (last && last.id === assistantMsgId) {
              msgs[msgs.length - 1] = {
                ...last,
                isStreaming: false,
                content: last.content || "Sorry, I couldn\u2019t generate a response. Please try again.",
              };
            }
            return msgs;
          });
        },
        (err) => {
          console.error("Stream error:", err);
          setIsStreaming(false);
          setActiveToolName(null);
          handleSendActiveRef.current = false;
          setChatMessages((prev) => {
            const msgs = [...prev];
            const last = msgs[msgs.length - 1];
            if (last && last.id === assistantMsgId) {
              msgs[msgs.length - 1] = {
                ...last,
                content: "Sorry, something went wrong. Please try again.",
                isStreaming: false,
              };
            }
            return msgs;
          });
        }
      );
    },
    [input, activeConvId, isStreaming, getToken, createConvMutation]
  );

  const handleConfirm = async (pendingId: string, assistantMsgId: string) => {
    const token = await getToken();
    if (!token || !activeConvId) return;
    const targetMsg = localMessages.find((m) => m.id === assistantMsgId);
    const actionInfo = targetMsg?.confirmationData;
    try {
      await confirmToolAction(token, activeConvId, pendingId);
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                confirmationData: undefined,
                content: "",
                resolvedAction: actionInfo ? { tool: actionInfo.tool, preview: actionInfo.preview, status: "confirmed" as const } : undefined,
              }
            : m
        )
      );
    } catch {
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                confirmationData: undefined,
                content: "",
                resolvedAction: actionInfo ? { tool: actionInfo.tool, preview: actionInfo.preview, status: "failed" as const } : undefined,
              }
            : m
        )
      );
    }
  };

  const handleCancel = (assistantMsgId: string) => {
    const targetMsg = localMessages.find((m) => m.id === assistantMsgId);
    const actionInfo = targetMsg?.confirmationData;
    setChatMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMsgId
          ? {
              ...m,
              confirmationData: undefined,
              content: "",
              resolvedAction: actionInfo ? { tool: actionInfo.tool, preview: actionInfo.preview, status: "cancelled" as const } : undefined,
            }
          : m
      )
    );
  };

  const activeConv = conversations.find((c) => c.id === activeConvId);

  return (
    <div className="flex" style={{ height: "calc(100vh - 0px)" }}>
      {/* LEFT — Conversation History */}
      <div className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <div className="mb-3">
            <h1 className="text-lg font-bold" style={{ color: "#1E3A5F" }}>AI Chat</h1>
            <p className="text-xs text-gray-400">Your conversations</p>
          </div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm" style={{ color: "#1E3A5F" }}>Conversations</h3>
            <button
              onClick={() => createConvMutation.mutate()}
              disabled={createConvMutation.isPending}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-white text-xs font-semibold disabled:opacity-50"
              style={{ backgroundColor: "#0EA5E9" }}
            >
              <Plus size={12} /> New
            </button>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              placeholder="Search chats..."
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-xs outline-none focus:border-[#0EA5E9]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {convsLoadFailed ? (
            <p className="text-xs text-red-400 text-center py-8">Failed to load conversations. Check your connection.</p>
          ) : conversations.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">No conversations yet. Start one!</p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onMouseEnter={() => setHoveredConv(conv.id)}
                onMouseLeave={() => setHoveredConv(null)}
                onClick={() => {
                  if (isStreaming && cleanupRef.current) {
                    cleanupRef.current();
                    cleanupRef.current = null;
                    setIsStreaming(false);
                    setActiveToolName(null);
                  }
                  setActiveConvId(conv.id);
                  setChatMessages([]);
                }}
                className={`relative flex flex-col p-2.5 rounded-xl cursor-pointer mb-1 transition-all ${
                  activeConvId === conv.id ? "bg-blue-50" : "hover:bg-gray-50"
                }`}
                style={
                  activeConvId === conv.id
                    ? { borderLeft: "3px solid #0EA5E9" }
                    : { borderLeft: "3px solid transparent" }
                }
              >
                <p className="text-xs font-semibold text-gray-800 truncate pr-5">
                  {conv.title || (conv.contact_name ? `Chat — ${conv.contact_name}` : "General Chat")}
                </p>
                <span className="text-[10px] text-gray-400 mt-1">
                  {new Date(conv.created_at).toLocaleDateString()}
                </span>
                {hoveredConv === conv.id && (
                  <button
                    className="absolute right-2 top-2.5 w-5 h-5 rounded-md bg-red-50 flex items-center justify-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConvMutation.mutate(conv.id);
                    }}
                  >
                    <Trash2 size={10} className="text-red-400" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* RIGHT — Active Chat */}
      <div className="flex-1 flex flex-col bg-gray-50 min-h-0">
        {/* Chat header — only when conversation active */}
        {activeConvId && (
          <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-3 shrink-0">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "#EFF6FF" }}
            >
              <Sparkles size={14} style={{ color: "#0EA5E9" }} />
            </div>
            <span className="text-sm font-bold" style={{ color: "#1E3A5F" }}>
              {activeConv?.title || (activeConv?.contact_name ? `Chat — ${activeConv.contact_name}` : "General Chat")}
            </span>
          </div>
        )}

        {/* Message area */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4 min-h-0">
          {!activeConvId ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center gap-4 h-full">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "#EFF6FF" }}
              >
                <Sparkles size={28} style={{ color: "#0EA5E9" }} />
              </div>
              <div className="text-center">
                <p className="font-bold text-gray-800 mb-1">CloAgent AI</p>
                <p className="text-sm text-gray-500">Ask anything or pick a suggestion below.</p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-md">
                {suggestedPrompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => handleSend(p)}
                    className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:border-[#0EA5E9] hover:text-[#0EA5E9] transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : messagesLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-[#0EA5E9] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : displayedMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3">
              <p className="text-sm text-gray-500">Send a message to start the conversation.</p>
              <div className="flex gap-2 flex-wrap justify-center">
                {suggestedPrompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => handleSend(p)}
                    className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:border-[#0EA5E9] hover:text-[#0EA5E9] transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            displayedMessages.map((msg) => (
              <div key={msg.id} className={`flex flex-col gap-1.5 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  {/* Avatar */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1"
                    style={{
                      backgroundColor: msg.role === "assistant" ? "#0EA5E9" : "#1E3A5F",
                    }}
                  >
                    {msg.role === "assistant" ? (
                      <Sparkles size={14} className="text-white" />
                    ) : (
                      <User size={14} className="text-white" />
                    )}
                  </div>

                  <div className={`flex flex-col gap-1.5 max-w-[72%] ${msg.role === "user" ? "items-end" : "items-start"}`}>
                    {/* Tool call indicator */}
                    {msg.role === "assistant" && msg.isStreaming && activeToolName && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Loader2 size={11} className="animate-spin" />
                        <span>{toolLabel[activeToolName] ?? activeToolName}…</span>
                      </div>
                    )}

                    {/* Message bubble */}
                    {(msg.content || (msg.isStreaming && !activeToolName)) && (
                      <div
                        className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "text-white rounded-tr-sm"
                            : "bg-white text-gray-800 shadow-sm rounded-tl-sm"
                        }`}
                        style={msg.role === "user" ? { backgroundColor: "#0EA5E9" } : {}}
                      >
                        {msg.content || (
                          <span className="flex items-center gap-1">
                            {[0, 1, 2].map((i) => (
                              <span
                                key={i}
                                className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
                                style={{ animationDelay: `${i * 0.15}s` }}
                              />
                            ))}
                          </span>
                        )}
                        {msg.isStreaming && msg.content && (
                          <span className="inline-block w-1 h-3 ml-0.5 bg-gray-400 animate-pulse rounded-sm align-middle" />
                        )}
                      </div>
                    )}

                    {/* Confirmation card — pending */}
                    {msg.confirmationData && (
                      <div className="bg-blue-50 border border-[#0EA5E9]/20 rounded-xl p-3 w-full text-xs">
                        <p className="font-semibold text-[#1E3A5F] mb-2">
                          {confirmLabel[msg.confirmationData.tool] ?? msg.confirmationData.tool}
                        </p>
                        <p className="text-[#1E3A5F]/80 mb-2">
                          {formatPreview(msg.confirmationData.tool, msg.confirmationData.preview)}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleConfirm(msg.confirmationData!.pending_id, msg.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0EA5E9] text-white rounded-lg hover:bg-[#0EA5E9]/90 text-xs font-medium"
                          >
                            <Check size={11} /> Confirm
                          </button>
                          <button
                            onClick={() => handleCancel(msg.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-xs font-medium"
                          >
                            <XCircle size={11} /> Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Resolved action card — after confirm/cancel */}
                    {msg.resolvedAction && (
                      <div className={`rounded-xl p-3 w-full text-xs border ${
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
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input area — always visible */}
        <div className="bg-white border-t border-gray-100 px-6 py-4 shrink-0">
          {/* Suggested prompts only shown in input area when no conversation is active and message area has the empty state */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3 border border-gray-200 focus-within:border-[#0EA5E9] transition-colors">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder={activeConvId ? "Ask anything about your clients..." : "Start a new conversation..."}
              disabled={isStreaming || createConvMutation.isPending}
              className="flex-1 text-sm text-gray-700 placeholder-gray-400 outline-none bg-transparent disabled:opacity-50"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isStreaming || createConvMutation.isPending}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: "#0EA5E9" }}
            >
              {isStreaming || createConvMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
