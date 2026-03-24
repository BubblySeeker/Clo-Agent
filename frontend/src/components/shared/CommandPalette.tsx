"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Users, GitBranch, Activity, CheckSquare, User } from "lucide-react";
import { listContacts, type Contact } from "@/lib/api/contacts";

interface Action {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const { getToken } = useAuth();

  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = useCallback(
    (href: string) => {
      router.push(href);
      onClose();
    },
    [router, onClose]
  );

  const staticActions: Action[] = [
    {
      id: "new-contact",
      label: "New Contact",
      description: "Add a new contact to your CRM",
      icon: <Users size={16} className="text-[#0EA5E9]" />,
      onSelect: () => navigate("/dashboard/contacts?action=new"),
    },
    {
      id: "new-deal",
      label: "New Deal",
      description: "Create a deal in the pipeline",
      icon: <GitBranch size={16} className="text-emerald-500" />,
      onSelect: () => navigate("/dashboard/pipeline?action=new"),
    },
    {
      id: "log-activity",
      label: "Log Activity",
      description: "Record a call, email, or note",
      icon: <Activity size={16} className="text-amber-500" />,
      onSelect: () => navigate("/dashboard/activities?action=new"),
    },
    {
      id: "new-task",
      label: "New Task",
      description: "Add a task to your list",
      icon: <CheckSquare size={16} className="text-purple-500" />,
      onSelect: () => navigate("/dashboard/tasks?action=new"),
    },
  ];

  // Search contacts via API, debounced 300ms
  useEffect(() => {
    if (!query.trim()) {
      setContacts([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const result = await listContacts(token, { search: query.trim(), limit: 6 });
        setContacts(result.contacts);
      } catch {
        setContacts([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, getToken]);

  // Reset state when opening/closing
  useEffect(() => {
    if (open) {
      setQuery("");
      setContacts([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Build the flattened list of all items for keyboard nav
  const showActions = query.trim() === "";
  const contactItems: Action[] = contacts.map((c) => ({
    id: c.id,
    label: `${c.first_name} ${c.last_name}`,
    description: [c.email, c.source].filter(Boolean).join(" · "),
    icon: <User size={16} className="text-gray-400" />,
    onSelect: () => navigate(`/dashboard/contacts/${c.id}`),
  }));

  const allItems: Action[] = showActions ? staticActions : contactItems;

  // Clamp selectedIndex when list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, contacts]);

  const executeSelected = useCallback(() => {
    const item = allItems[selectedIndex];
    if (item) item.onSelect();
  }, [allItems, selectedIndex]);

  // Keyboard handler
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        executeSelected();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, allItems, selectedIndex, onClose, executeSelected]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg mx-4 rounded-2xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: "#0F1E36", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/10">
          {/* Magnifying glass icon */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-white/40"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts or type a command…"
            className="flex-1 bg-transparent text-white placeholder-white/30 text-sm outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-white/30 hover:text-white/60 transition-colors text-xs px-1"
            >
              Clear
            </button>
          )}
          <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-white/30 border border-white/10">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="py-2 max-h-[340px] overflow-y-auto">
          {/* Loading state while searching */}
          {loading && query.trim() && (
            <div className="px-4 py-6 text-center text-white/30 text-sm">
              Searching…
            </div>
          )}

          {/* Actions section (empty query) */}
          {!loading && showActions && (
            <div>
              <p className="px-4 py-1.5 text-[10px] font-semibold tracking-widest uppercase text-white/30">
                Quick Actions
              </p>
              {staticActions.map((action, idx) => (
                <button
                  key={action.id}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={action.onSelect}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    selectedIndex === idx ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5 shrink-0">
                    {action.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white/90 truncate">{action.label}</p>
                    {action.description && (
                      <p className="text-xs text-white/40 truncate">{action.description}</p>
                    )}
                  </div>
                  {selectedIndex === idx && (
                    <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-white/30 border border-white/10 shrink-0">
                      ↵
                    </kbd>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Contact results */}
          {!loading && !showActions && contactItems.length > 0 && (
            <div>
              <p className="px-4 py-1.5 text-[10px] font-semibold tracking-widest uppercase text-white/30">
                Contacts
              </p>
              {contactItems.map((item, idx) => (
                <button
                  key={item.id}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={item.onSelect}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    selectedIndex === idx ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/5 shrink-0">
                    {item.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white/90 truncate">{item.label}</p>
                    {item.description && (
                      <p className="text-xs text-white/40 truncate">{item.description}</p>
                    )}
                  </div>
                  {selectedIndex === idx && (
                    <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-white/30 border border-white/10 shrink-0">
                      ↵
                    </kbd>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* No results */}
          {!loading && !showActions && contactItems.length === 0 && (
            <div className="px-4 py-8 text-center text-white/30 text-sm">
              No contacts found for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2.5 border-t border-white/10 flex items-center gap-4 text-[10px] text-white/25">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded border border-white/10">↑</kbd>
            <kbd className="px-1 py-0.5 rounded border border-white/10">↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded border border-white/10">↵</kbd>
            select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded border border-white/10">ESC</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  );
}
