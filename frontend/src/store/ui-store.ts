import { create } from "zustand";

export interface ChatMessage {
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
}

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Floating AI chat bubble
  chatOpen: boolean;
  chatConversationId: string | null;
  chatMessages: ChatMessage[];
  setChatOpen: (open: boolean) => void;
  setChatConversationId: (id: string | null) => void;
  setChatMessages: (msgs: ChatMessage[]) => void;
  appendChatMessage: (msg: ChatMessage) => void;
  updateLastMessage: (patch: Partial<ChatMessage>) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  chatOpen: false,
  chatConversationId: null,
  chatMessages: [],
  setChatOpen: (open) => set({ chatOpen: open }),
  setChatConversationId: (id) => set({ chatConversationId: id }),
  setChatMessages: (msgs) => set({ chatMessages: msgs }),
  appendChatMessage: (msg) =>
    set((state) => ({ chatMessages: [...state.chatMessages, msg] })),
  updateLastMessage: (patch) =>
    set((state) => {
      const msgs = [...state.chatMessages];
      if (msgs.length === 0) return state;
      msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], ...patch };
      return { chatMessages: msgs };
    }),
}));
