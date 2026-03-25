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
  resolvedAction?: {
    tool: string;
    preview: Record<string, unknown>;
    status: "confirmed" | "cancelled" | "failed";
  };
  autoExecutedActions?: Array<{
    tool: string;
    result: Record<string, unknown>;
    status: "success" | "error" | "undone";
  }>;
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

  // Citation viewer
  citationViewerOpen: boolean;
  citationDocId: string | null;
  citationChunkId: string | null;
  citationPageNumber: number | null;
  citationFilename: string | null;
  openCitationViewer: (docId: string, chunkId: string, pageNumber?: number | null) => void;
  openCitationByFilename: (filename: string, pageNumber?: number | null) => void;
  closeCitationViewer: () => void;
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

  citationViewerOpen: false,
  citationDocId: null,
  citationChunkId: null,
  citationPageNumber: null,
  citationFilename: null,
  openCitationViewer: (docId, chunkId, pageNumber) =>
    set({ citationViewerOpen: true, citationDocId: docId, citationChunkId: chunkId, citationPageNumber: pageNumber ?? null, citationFilename: null }),
  openCitationByFilename: (filename, pageNumber) =>
    set({ citationViewerOpen: true, citationDocId: null, citationChunkId: null, citationPageNumber: pageNumber ?? null, citationFilename: filename }),
  closeCitationViewer: () =>
    set({ citationViewerOpen: false, citationDocId: null, citationChunkId: null, citationPageNumber: null, citationFilename: null }),
}));
