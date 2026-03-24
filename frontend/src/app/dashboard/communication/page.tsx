"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listAllActivities, createActivity } from "@/lib/api/activities";
import { listContacts } from "@/lib/api/contacts";
import { getGmailStatus, syncGmail, listEmails, getEmail, sendEmail, markEmailRead, type Email } from "@/lib/api/gmail";
import { Phone, Mail, Search, Plus, X, User, ChevronDown, ChevronUp, ChevronRight, RefreshCw, Send, Reply, Star, Paperclip } from "lucide-react";

const typeColors: Record<string, { bg: string; color: string }> = {
  call: { bg: "#EFF4FF", color: "#2563EB" },
  email: { bg: "#ECFDF5", color: "#16A34A" },
  gmail: { bg: "#FEF2F2", color: "#DC2626" },
};

interface CommItem {
  id: string;
  type: "call" | "email" | "gmail_in" | "gmail_out";
  contact_id: string | null;
  contact_name: string;
  body: string;
  subject?: string;
  date: string;
  from_address?: string;
  from_name?: string;
  to_addresses?: string[];
  email_data?: Email;
  groupKey: string;
  groupName: string;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Internal Gmail labels that should not be shown as user-facing label pills
const INTERNAL_LABELS = new Set([
  "INBOX", "UNREAD", "SENT", "DRAFT", "SPAM", "TRASH", "IMPORTANT", "STARRED",
  "CATEGORY_PERSONAL", "CATEGORY_SOCIAL", "CATEGORY_PROMOTIONS",
  "CATEGORY_UPDATES", "CATEGORY_FORUMS", "HAS_ATTACHMENT",
]);

/** Return only user-created labels (filter out Gmail system labels). */
function getUserLabels(labels: string[]): string[] {
  return labels.filter((l) => !INTERNAL_LABELS.has(l));
}

/** Check if the labels list indicates the email has attachments. */
function emailHasAttachment(labels: string[]): boolean {
  return labels.includes("HAS_ATTACHMENT");
}

/** Check if the labels list contains IMPORTANT or STARRED. */
function emailIsStarred(labels: string[]): boolean {
  return labels.includes("STARRED") || labels.includes("IMPORTANT");
}

function EmailHtmlFrame({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  const baseStyles = `
    <style>
      body { font-family: sans-serif; font-size: 14px; color: #374151; margin: 0; padding: 0; overflow-x: hidden; }
      img { max-width: 100%; height: auto; }
      * { max-width: 100%; box-sizing: border-box; }
    </style>
  `;

  const fullHtml = baseStyles + html;

  const adjustHeight = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (doc?.body) {
        const newHeight = doc.body.scrollHeight;
        if (newHeight > 0) setHeight(newHeight);
      }
    } catch {
      // cross-origin fallback — keep current height
    }
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    try {
      const doc = iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(fullHtml);
        doc.close();
        // Adjust after content loads (images etc.)
        adjustHeight();
        const timer = setTimeout(adjustHeight, 500);
        return () => clearTimeout(timer);
      }
    } catch {
      // If contentDocument.write fails, srcdoc fallback handles it
    }
  }, [fullHtml, adjustHeight]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-same-origin"
      srcDoc={fullHtml}
      onLoad={adjustHeight}
      style={{ width: "100%", height: `${height}px`, border: "none", display: "block" }}
      title="Email content"
    />
  );
}

export default function CommunicationPage() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<"all" | "call" | "email" | "gmail">("all");
  const [search, setSearch] = useState("");
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showLog, setShowLog] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [logType, setLogType] = useState<"call" | "email">("call");
  const [logContactId, setLogContactId] = useState("");
  const [logBody, setLogBody] = useState("");

  // Inline reply
  const [showReply, setShowReply] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Compose state
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");

  // CC fields
  const [replyCc, setReplyCc] = useState("");
  const [composeCc, setComposeCc] = useState("");

  // Track which thread items are expanded (by item id); most recent is expanded by default
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Cache of loaded full email bodies: emailId -> Email
  const emailCacheRef = useRef<Record<string, Email>>({});
  const [loadingEmail, setLoadingEmail] = useState(false);
  // Trigger re-render when cache updates
  const [cacheVersion, setCacheVersion] = useState(0);

  // Gmail status
  const { data: gmailStatusData } = useQuery({
    queryKey: ["gmail-status"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { connected: false, gmail_address: null, last_synced_at: null };
      return getGmailStatus(token);
    },
  });

  const gmailConnected = gmailStatusData?.connected ?? false;

  // Auto-sync on mount if connected and last sync > 5 min ago
  useEffect(() => {
    if (!gmailConnected) return;
    if (gmailStatusData?.last_synced_at) {
      const elapsed = Date.now() - new Date(gmailStatusData.last_synced_at).getTime();
      if (elapsed < 5 * 60 * 1000) return;
    }
    (async () => {
      const token = await getToken();
      if (token) {
        await syncGmail(token);
        queryClient.invalidateQueries({ queryKey: ["gmail-emails"] });
        queryClient.invalidateQueries({ queryKey: ["gmail-status"] });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmailConnected]);

  const { data: activitiesData, isError: activitiesError, refetch: refetchActivities } = useQuery({
    queryKey: ["comm-activities"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { activities: [], total: 0 };
      return listAllActivities(token, undefined, 100);
    },
    refetchInterval: 30000,
  });

  const { data: emailsData } = useQuery({
    queryKey: ["gmail-emails"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { emails: [], total: 0 };
      return listEmails(token, { limit: 100 });
    },
    enabled: gmailConnected,
    refetchInterval: 60000,
  });

  const { data: contactsData } = useQuery({
    queryKey: ["contacts-list"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { contacts: [], total: 0 };
      return listContacts(token, { limit: 200 });
    },
  });

  const contacts = contactsData?.contacts ?? [];
  const contactMap = useMemo(
    () => Object.fromEntries(contacts.map((c) => [c.id, c])),
    [contacts]
  );

  const allItems = useMemo(() => {
    const items: CommItem[] = [];

    const activities = activitiesData?.activities ?? [];
    for (const a of activities) {
      if (a.type !== "call" && a.type !== "email") continue;
      const contact = a.contact_id ? contactMap[a.contact_id] : null;
      const name = a.contact_name || (contact ? `${contact.first_name} ${contact.last_name}` : "Unknown");
      items.push({
        id: a.id, type: a.type, contact_id: a.contact_id, contact_name: name,
        body: a.body || "No details", date: a.created_at,
        groupKey: a.contact_id || `manual-${a.id}`, groupName: name,
      });
    }

    const emails = emailsData?.emails ?? [];
    for (const e of emails) {
      const contact = e.contact_id ? contactMap[e.contact_id] : null;
      const isOut = e.is_outbound;
      const otherEmail = isOut ? (e.to_addresses?.[0] ?? "") : (e.from_address ?? "");
      const otherName = isOut ? (e.to_addresses?.[0] ?? "Unknown") : (e.from_name || e.from_address || "Unknown");

      let groupKey: string;
      let groupName: string;
      if (e.contact_id && contact) {
        groupKey = e.contact_id;
        groupName = `${contact.first_name} ${contact.last_name}`;
      } else if (e.contact_name) {
        groupKey = e.contact_id || `email-${otherEmail.toLowerCase()}`;
        groupName = e.contact_name;
      } else {
        groupKey = `email-${otherEmail.toLowerCase()}`;
        groupName = otherName;
      }

      items.push({
        id: `gmail-${e.id}`, type: isOut ? "gmail_out" : "gmail_in",
        contact_id: e.contact_id, contact_name: groupName,
        body: e.snippet || "No content", subject: e.subject || undefined,
        date: e.gmail_date || e.created_at,
        from_address: e.from_address ?? undefined, from_name: e.from_name ?? undefined,
        to_addresses: e.to_addresses, email_data: e, groupKey, groupName,
      });
    }

    return items;
  }, [activitiesData, emailsData, contactMap]);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (filter === "call") return item.type === "call";
      if (filter === "email") return item.type === "email";
      if (filter === "gmail") return item.type === "gmail_in" || item.type === "gmail_out";
      return true;
    });
  }, [allItems, filter]);

  const threads = useMemo(() => {
    const groups: Record<string, CommItem[]> = {};
    for (const item of filteredItems) {
      if (!groups[item.groupKey]) groups[item.groupKey] = [];
      groups[item.groupKey].push(item);
    }
    return Object.entries(groups)
      .map(([key, items]) => {
        const sorted = items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return { groupKey: key, groupName: sorted[0]?.groupName || "Unknown", contactId: sorted[0]?.contact_id, items: sorted, lastDate: sorted[0]?.date ?? "" };
      })
      .filter((t) => {
        if (!search) return true;
        const q = search.toLowerCase();
        if (t.groupName.toLowerCase().includes(q)) return true;
        return t.items.some(
          (item) =>
            (item.subject && item.subject.toLowerCase().includes(q)) ||
            item.body.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
  }, [filteredItems, search]);

  const selectedThread = threads.find((t) => t.groupKey === selectedGroupKey);
  const selectedContact = selectedThread?.contactId ? contactMap[selectedThread.contactId] : null;
  const currentItem = selectedThread?.items[currentIndex] ?? null;
  const totalItems = selectedThread?.items.length ?? 0;

  // Load full email bodies for ALL gmail items in the selected thread
  useEffect(() => {
    setShowReply(false);
    setReplyBody("");
    setReplyCc("");

    if (!selectedThread) return;

    // Expand the most recent item (index 0) by default, collapse others
    setExpandedItems(new Set(selectedThread.items.length > 0 ? [selectedThread.items[0].id] : []));

    const gmailItems = selectedThread.items.filter((item) => item.email_data);
    if (gmailItems.length === 0) return;

    // Mark unread items as read (fire-and-forget)
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        for (const item of gmailItems) {
          if (item.email_data && !item.email_data.is_read) {
            markEmailRead(token, item.email_data.id);
          }
        }
        queryClient.invalidateQueries({ queryKey: ["gmail-emails"] });
      } catch { /* ignore */ }
    })();

    // Load full bodies for uncached emails
    const uncached = gmailItems.filter((item) => item.email_data && !emailCacheRef.current[item.email_data.id]);
    if (uncached.length === 0) return;

    let cancelled = false;
    setLoadingEmail(true);
    (async () => {
      try {
        const token = await getToken();
        if (token && !cancelled) {
          for (const item of uncached) {
            if (cancelled) break;
            if (!item.email_data) continue;
            const full = await getEmail(token, item.email_data.id);
            if (!cancelled) {
              emailCacheRef.current[item.email_data.id] = full;
              setCacheVersion((v) => v + 1);
            }
          }
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoadingEmail(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupKey]);

  function selectThread(groupKey: string) {
    setSelectedGroupKey(groupKey);
    setCurrentIndex(0);
    setShowReply(false);
    setReplyBody("");
  }


  const logMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token || !logContactId) return;
      return createActivity(token, logContactId, { type: logType, body: logBody });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comm-activities"] });
      setShowLog(false);
      setLogBody("");
      setLogContactId("");
    },
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      if (!currentItem?.email_data) throw new Error("No email");
      const token = await getToken();
      if (!token) throw new Error("No token");
      const e = currentItem.email_data;
      const to = e.is_outbound ? (e.to_addresses?.[0] ?? "") : (e.from_address ?? "");
      const subject = e.subject ? (e.subject.startsWith("Re: ") ? e.subject : `Re: ${e.subject}`) : "";
      return sendEmail(token, { to, cc: replyCc || undefined, subject, body: replyBody, contact_id: e.contact_id || undefined, reply_to_message_id: e.gmail_message_id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gmail-emails"] });
      setShowReply(false);
      setReplyBody("");
    },
  });

  const composeMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("No token");
      return sendEmail(token, { to: composeTo, cc: composeCc || undefined, subject: composeSubject, body: composeBody });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gmail-emails"] });
      setShowCompose(false);
      setComposeTo("");
      setComposeCc("");
      setComposeSubject("");
      setComposeBody("");
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("No token");
      return syncGmail(token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gmail-emails"] });
      queryClient.invalidateQueries({ queryKey: ["gmail-status"] });
    },
  });

  function getItemColors(type: CommItem["type"]) {
    if (type === "call") return typeColors.call;
    if (type === "gmail_in" || type === "gmail_out") return typeColors.gmail;
    return typeColors.email;
  }

  function getItemLabel(type: CommItem["type"]) {
    if (type === "call") return "Call";
    if (type === "email") return "Email";
    if (type === "gmail_in") return "Received";
    if (type === "gmail_out") return "Sent";
    return "Email";
  }

  // Force re-render when email cache updates
  void cacheVersion;

  // Thread-level navigation: one entry per thread
  const flatItems = useMemo(() => {
    return threads.map((t) => ({ groupKey: t.groupKey, index: 0 }));
  }, [threads]);

  const currentFlatIndex = useMemo(() => {
    if (!selectedGroupKey) return -1;
    return flatItems.findIndex((f) => f.groupKey === selectedGroupKey);
  }, [flatItems, selectedGroupKey]);

  function goNewer() {
    if (currentFlatIndex <= 0) return;
    const prev = flatItems[currentFlatIndex - 1];
    setSelectedGroupKey(prev.groupKey);
    setCurrentIndex(0);
  }

  function goOlder() {
    if (currentFlatIndex < 0 || currentFlatIndex >= flatItems.length - 1) return;
    const next = flatItems[currentFlatIndex + 1];
    setSelectedGroupKey(next.groupKey);
    setCurrentIndex(0);
  }

  function toggleExpanded(itemId: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          goOlder();
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          goNewer();
          break;
        case "r":
          e.preventDefault();
          setShowReply(true);
          break;
        case "c":
          e.preventDefault();
          setShowCompose(true);
          break;
        case "Escape":
          setShowReply(false);
          setShowCompose(false);
          setShowLog(false);
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFlatIndex, flatItems]);

  // Auto-scroll selected thread into view
  useEffect(() => {
    if (!selectedGroupKey || !sidebarRef.current) return;
    const el = sidebarRef.current.querySelector(`[data-group-key="${CSS.escape(selectedGroupKey)}"]`);
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedGroupKey]);

  if (activitiesError) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 p-6 text-center font-[family-name:var(--font-dm-sans)]" style={{ backgroundColor: "#FAFAF8" }}>
        <p className="text-[#1A2E44] font-medium font-[family-name:var(--font-sora)]">Failed to load communications</p>
        <button onClick={() => refetchActivities()} className="px-4 py-2 rounded-xl text-white text-sm font-semibold shadow-sm hover:shadow-md transition-all duration-200" style={{ backgroundColor: "#2563EB" }}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      {/* Left sidebar */}
      <div className="w-80 border-r border-[#E8E6E1] bg-white flex flex-col shrink-0">
        <div className="p-4 border-b border-[#E8E6E1]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-[family-name:var(--font-sora)] text-xl font-semibold tracking-tight" style={{ color: "#1A2E44" }}>Communication</h2>
            <div className="flex items-center gap-1">
              {gmailConnected && (
                <button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9CA3AF] hover:bg-[#F8F9FC] hover:text-[#2563EB] transition-colors" title="Sync Gmail">
                  <RefreshCw size={14} className={syncMutation.isPending ? "animate-spin" : ""} />
                </button>
              )}
              {gmailConnected && (
                <button onClick={() => setShowCompose(true)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#DC2626]/10 text-[#DC2626] hover:bg-[#DC2626]/20 transition-colors" title="Compose Email">
                  <Send size={14} />
                </button>
              )}
              <button onClick={() => setShowLog(true)}
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#2563EB]/10 text-[#2563EB] hover:bg-[#2563EB]/20 transition-colors">
                <Plus size={16} />
              </button>
            </div>
          </div>

          {gmailConnected && gmailStatusData?.last_synced_at && (
            <div className="flex items-center gap-1.5 mb-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-medium">Gmail synced {timeAgo(gmailStatusData.last_synced_at)}</span>
            </div>
          )}

          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..."
              className="comm-input pl-9 pr-3" />
          </div>

          <div className="flex gap-1">
            {(["all", "call", "email", ...(gmailConnected ? ["gmail" as const] : [])] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f as typeof filter)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium tracking-wide uppercase transition-all duration-200 ${filter === f ? "bg-[#2563EB] text-white shadow-sm" : "text-[#6B7280] hover:text-[#1A2E44] hover:bg-[#F8F9FC]"}`}>
                {f === "all" ? "All" : f === "call" ? "Calls" : f === "email" ? "Manual" : "Gmail"}
              </button>
            ))}
          </div>
        </div>

        <div ref={sidebarRef} className="flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <div className="p-8 text-center">
              <Mail size={32} className="mx-auto text-[#E8E6E1] mb-3" />
              <p className="text-sm text-[#1A2E44] font-medium font-[family-name:var(--font-sora)]">No communications yet</p>
              <p className="text-xs text-[#6B7280] mt-1">{gmailConnected ? "Sync Gmail or log a call/email" : "Log a call or email to get started"}</p>
            </div>
          ) : (
            threads.map((thread) => {
              const isSelected = thread.groupKey === selectedGroupKey;
              const lastItem = thread.items[0];
              const isEmailGroup = thread.groupKey.startsWith("email-");
              const hasUnread = thread.items.some((item) => item.email_data && !item.email_data.is_read);
              const initials = isEmailGroup
                ? (thread.groupName[0] ?? "?").toUpperCase()
                : thread.groupName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
              const colors = getItemColors(lastItem.type);
              const Icon = lastItem.type === "call" ? Phone : Mail;
              return (
                <button key={thread.groupKey} data-group-key={thread.groupKey} onClick={() => selectThread(thread.groupKey)}
                  className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-all duration-150 mb-0.5 ${isSelected ? "bg-[#F0F4FA] border-l-2 border-l-[#2563EB]" : "hover:bg-[#F8F9FC] border-l-2 border-l-transparent"}`}>
                  {hasUnread && <div className="w-2.5 h-2.5 rounded-full bg-[#2563EB] shrink-0 mt-4" />}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5 ring-2 ring-white shadow-sm"
                    style={{ background: isEmailGroup ? "linear-gradient(135deg, #6B7280, #9CA3AF)" : "linear-gradient(135deg, #1A2E44, #2D4A6F)" }}>
                    {initials || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm text-[#1A2E44] truncate font-[family-name:var(--font-sora)] ${hasUnread ? "font-bold" : "font-medium"}`}>{thread.groupName}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        {lastItem.email_data?.labels && emailIsStarred(lastItem.email_data.labels) && (
                          <Star size={11} className="text-[#F59E0B] fill-[#F59E0B]" />
                        )}
                        {lastItem.email_data?.labels && emailHasAttachment(lastItem.email_data.labels) && (
                          <Paperclip size={11} className="text-[#9CA3AF]" />
                        )}
                        <span className="text-[11px] text-[#9CA3AF] font-medium">{timeAgo(thread.lastDate)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Icon size={11} style={{ color: colors.color }} className="shrink-0" />
                      <p className="text-xs text-[#6B7280] truncate">{lastItem.subject || lastItem.body}</p>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F0F4FA] text-[#2563EB]">{thread.items.length} item{thread.items.length !== 1 ? "s" : ""}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Center — full email view with arrow nav */}
      <div className="flex-1 flex flex-col bg-[#FAFAF8] min-w-0">
        {selectedThread && currentItem ? (
          <>
            {/* Header bar with nav arrows */}
            <div className="px-6 py-3 bg-white/80 backdrop-blur-sm border-b border-[#E8E6E1] flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="font-[family-name:var(--font-sora)] text-base font-semibold text-[#1A2E44] truncate">
                  {selectedThread.groupName}{totalItems > 1 ? ` — ${totalItems} ${totalItems === 1 ? "item" : "items"}` : ""}
                </h3>
              </div>
              <div className="flex items-center gap-1">
                {/* Nav arrows */}
                <button onClick={goNewer} disabled={currentFlatIndex <= 0}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F0F4FA] transition-colors disabled:opacity-30 disabled:cursor-default"
                  title="Newer">
                  <ChevronUp size={16} className="text-[#6B7280]" />
                </button>
                <button onClick={goOlder} disabled={currentFlatIndex < 0 || currentFlatIndex >= flatItems.length - 1}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[#F0F4FA] transition-colors disabled:opacity-30 disabled:cursor-default"
                  title="Older">
                  <ChevronDown size={16} className="text-[#6B7280]" />
                </button>

                <div className="w-px h-6 bg-[#E8E6E1] mx-1" />

                {gmailConnected && (
                  <button onClick={() => {
                    const lastGmail = selectedThread.items.find((i) => i.email_data);
                    if (lastGmail?.email_data) {
                      const e = lastGmail.email_data;
                      setComposeTo(e.is_outbound ? (e.to_addresses?.[0] ?? "") : (e.from_address ?? ""));
                    } else if (selectedContact?.email) {
                      setComposeTo(selectedContact.email);
                    }
                    setShowCompose(true);
                  }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#DC2626]/10 text-[#DC2626] hover:bg-[#DC2626]/20 hover:shadow-sm transition-all duration-200">
                    <Send size={12} /> Email
                  </button>
                )}
                <button onClick={() => { setShowLog(true); if (selectedThread.contactId) setLogContactId(selectedThread.contactId); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[#2563EB]/10 text-[#2563EB] hover:bg-[#2563EB]/20 hover:shadow-sm transition-all duration-200">
                  <Plus size={14} /> Log
                </button>
              </div>
            </div>

            {/* Thread conversation view — all items inline */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto flex flex-col gap-3">
                {selectedThread.items.map((item) => {
                  const isExpanded = expandedItems.has(item.id);
                  const itemIsGmail = item.type === "gmail_in" || item.type === "gmail_out";
                  const itemFullBody = item.email_data ? emailCacheRef.current[item.email_data.id] : null;

                  return (
                    <div key={item.id} className="comm-card hover:shadow-md transition-shadow duration-200 border border-[#F0EEEA]">
                      {/* Clickable header — always visible */}
                      <button
                        onClick={() => toggleExpanded(item.id)}
                        className={`w-full px-6 pt-5 pb-4 text-left flex items-start gap-3 hover:bg-[#F8F9FC]/50 transition-colors ${isExpanded ? "rounded-t-2xl" : "rounded-2xl"}`}
                      >
                        <div className="mt-0.5 shrink-0 text-[#9CA3AF] hover:text-[#2563EB] transition-all duration-150" style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                          <ChevronRight size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase shrink-0"
                                style={{ backgroundColor: getItemColors(item.type).bg, color: getItemColors(item.type).color }}>
                                {getItemLabel(item.type)}
                              </span>
                              {itemIsGmail && (
                                <span className="text-xs text-[#6B7280] truncate">
                                  {item.type === "gmail_out"
                                    ? `To: ${item.to_addresses?.join(", ") ?? ""}`
                                    : `From: ${item.from_name || item.from_address || ""}`}
                                </span>
                              )}
                              {itemIsGmail && item.email_data?.labels && emailIsStarred(item.email_data.labels) && (
                                <Star size={12} className="text-[#F59E0B] fill-[#F59E0B] shrink-0" />
                              )}
                              {itemIsGmail && item.email_data?.labels && emailHasAttachment(item.email_data.labels) && (
                                <Paperclip size={12} className="text-[#9CA3AF] shrink-0" />
                              )}
                            </div>
                            <span className="text-[11px] text-[#9CA3AF] font-medium shrink-0 ml-2">{formatDate(item.date)}</span>
                          </div>
                          {item.subject && (
                            <h4 className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[#1A2E44] truncate">{item.subject}</h4>
                          )}
                          {!isExpanded && (
                            <p className="text-xs text-[#9CA3AF] mt-0.5 truncate">{item.body}</p>
                          )}
                          {!isExpanded && itemIsGmail && item.email_data?.labels && getUserLabels(item.email_data.labels).length > 0 && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              {getUserLabels(item.email_data.labels).map((label) => (
                                <span key={label} className="bg-indigo-50 text-indigo-600 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </button>

                      {/* Collapsible body */}
                      {isExpanded && (
                        <div className="px-8 py-6 border-t border-[#E8E6E1]">
                          {itemIsGmail && item.email_data?.labels && (
                            <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                              {emailHasAttachment(item.email_data.labels) && (
                                <span className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full bg-[#F0F4FA] text-[#6B7280] font-medium">
                                  <Paperclip size={10} /> Attachment
                                </span>
                              )}
                              {getUserLabels(item.email_data.labels).map((label) => (
                                <span key={label} className="bg-indigo-50 text-indigo-600 rounded-full px-2.5 py-0.5 text-[10px] font-semibold">
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                          {itemIsGmail && loadingEmail && !itemFullBody ? (
                            <p className="text-sm text-[#9CA3AF]">Loading...</p>
                          ) : itemIsGmail && itemFullBody?.body_html ? (
                            <EmailHtmlFrame html={itemFullBody.body_html} />
                          ) : itemIsGmail && itemFullBody?.body_text ? (
                            <pre className="text-sm text-[#1A2E44] leading-relaxed whitespace-pre-wrap font-sans">
                              {itemFullBody.body_text}
                            </pre>
                          ) : (
                            <p className="text-sm text-[#1A2E44] leading-relaxed">{item.body}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Inline reply for threads with gmail items */}
                {selectedThread.items.some((i) => i.type === "gmail_in" || i.type === "gmail_out") && (
                  <div>
                    {showReply ? (
                      <div className="comm-card-elevated p-5">
                        <p className="text-xs text-[#9CA3AF] mb-2">
                          Replying to {(() => {
                            const lastGmail = selectedThread.items.find((i) => i.email_data);
                            if (!lastGmail) return "...";
                            return lastGmail.type === "gmail_out"
                              ? lastGmail.to_addresses?.[0]
                              : (lastGmail.from_name || lastGmail.from_address);
                          })()}
                        </p>
                        <input value={replyCc} onChange={(e) => setReplyCc(e.target.value)} placeholder="Cc (optional)"
                          className="comm-input text-xs mb-2" />
                        <textarea ref={replyRef} value={replyBody} onChange={(e) => setReplyBody(e.target.value)}
                          placeholder="Write your reply..." rows={4}
                          className="comm-input resize-none" />
                        <div className="flex items-center justify-between mt-3">
                          <button onClick={() => { setShowReply(false); setReplyBody(""); }}
                            className="text-xs text-[#9CA3AF] hover:text-[#1A2E44] transition-colors">Cancel</button>
                          <button onClick={() => replyMutation.mutate()}
                            disabled={!replyBody.trim() || replyMutation.isPending}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50 bg-[#2563EB] hover:bg-[#1D4ED8] shadow-sm hover:shadow-md transition-all duration-200">
                            <Send size={12} />
                            {replyMutation.isPending ? "Sending..." : "Send"}
                          </button>
                        </div>
                        {replyMutation.isError && <p className="text-xs text-red-500 mt-2">Failed to send. Try again.</p>}
                      </div>
                    ) : (
                      <button onClick={() => { setShowReply(true); setTimeout(() => replyRef.current?.focus(), 100); }}
                        className="comm-card flex items-center gap-2 px-4 py-3 border border-[#E8E6E1] text-sm text-[#6B7280] hover:border-[#2563EB] hover:text-[#2563EB] hover:shadow-sm transition-all duration-200 w-full">
                        <Reply size={14} /> Reply
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "linear-gradient(135deg, #F0F4FA, #E8E6E1)" }}>
                <Mail size={32} className="text-[#2563EB]/40" />
              </div>
              <p className="text-[#1A2E44] text-sm font-medium font-[family-name:var(--font-sora)]">Select a conversation</p>
              <p className="text-[#9CA3AF] text-xs mt-1">Choose a contact to view their communication history</p>
            </div>
          </div>
        )}
      </div>

      {/* Right panel — contact details */}
      {selectedContact && (
        <div className="w-72 border-l border-[#E8E6E1] bg-white p-6 shrink-0">
          <div className="text-center mb-5">
            <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-xl font-bold mx-auto mb-3 ring-4 ring-[#F0F4FA] shadow-lg" style={{ background: "linear-gradient(135deg, #1A2E44, #2D4A6F)" }}>
              {`${selectedContact.first_name[0]}${selectedContact.last_name[0]}`.toUpperCase()}
            </div>
            <p className="font-[family-name:var(--font-sora)] text-base font-bold text-[#1A2E44]">{selectedContact.first_name} {selectedContact.last_name}</p>
            {selectedContact.source && (
              <span className="bg-[#F0F4FA] text-[#2563EB] rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide uppercase mt-2 inline-block">{selectedContact.source}</span>
            )}
          </div>
          <div className="flex flex-col gap-4">
            {selectedContact.email && (
              <div className="pb-4 border-b border-[#F0EEEA]">
                <p className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-widest mb-1">Email</p>
                <p className="text-sm text-[#1A2E44] font-medium">{selectedContact.email}</p>
              </div>
            )}
            {selectedContact.phone && (
              <div className="pb-4 border-b border-[#F0EEEA]">
                <p className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-widest mb-1">Phone</p>
                <p className="text-sm text-[#1A2E44] font-medium">{selectedContact.phone}</p>
              </div>
            )}
            <div>
              <p className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-widest mb-1">Added</p>
              <p className="text-sm text-[#1A2E44] font-medium">
                {new Date(selectedContact.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Log modal */}
      {showLog && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="comm-card-elevated w-full max-w-md p-7">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-[family-name:var(--font-sora)] text-lg font-bold text-[#1A2E44]">Log Communication</h3>
              <button onClick={() => setShowLog(false)} className="text-[#9CA3AF] hover:text-[#1A2E44] hover:bg-[#F8F9FC] rounded-lg w-8 h-8 flex items-center justify-center transition-colors"><X size={18} /></button>
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setLogType("call")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${logType === "call" ? "bg-[#2563EB] text-white shadow-sm" : "bg-[#FAFAF8] text-[#6B7280] border border-[#E8E6E1]"}`}>
                <Phone size={14} /> Call
              </button>
              <button onClick={() => setLogType("email")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${logType === "email" ? "bg-[#16A34A] text-white shadow-sm" : "bg-[#FAFAF8] text-[#6B7280] border border-[#E8E6E1]"}`}>
                <Mail size={14} /> Email
              </button>
            </div>
            <div className="mb-4">
              <label className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-widest block mb-1.5">Contact</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                <select value={logContactId} onChange={(e) => setLogContactId(e.target.value)}
                  className="comm-input pl-9 pr-3 appearance-none">
                  <option value="">Select contact...</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none" />
              </div>
            </div>
            <div className="mb-5">
              <label className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-widest block mb-1.5">Details</label>
              <textarea value={logBody} onChange={(e) => setLogBody(e.target.value)}
                placeholder={logType === "call" ? "Call notes..." : "Email summary..."} rows={3}
                className="comm-input resize-none" />
            </div>
            <button onClick={() => logMutation.mutate()} disabled={!logContactId || !logBody || logMutation.isPending}
              className="w-full py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 bg-[#2563EB] hover:bg-[#1D4ED8] shadow-sm hover:shadow-md transition-all duration-200">
              {logMutation.isPending ? "Saving..." : `Log ${logType === "call" ? "Call" : "Email"}`}
            </button>
          </div>
        </div>
      )}

      {/* Compose modal */}
      {showCompose && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="comm-card-elevated w-full max-w-lg p-7">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-[family-name:var(--font-sora)] text-lg font-bold text-[#1A2E44]">New Email</h3>
              <button onClick={() => setShowCompose(false)} className="text-[#9CA3AF] hover:text-[#1A2E44] hover:bg-[#F8F9FC] rounded-lg w-8 h-8 flex items-center justify-center transition-colors"><X size={18} /></button>
            </div>
            <div className="flex flex-col gap-4 mb-5">
              <div>
                <label className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-widest block mb-1.5">To</label>
                <input value={composeTo} onChange={(e) => setComposeTo(e.target.value)} placeholder="recipient@email.com"
                  className="comm-input" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-widest block mb-1.5">Cc</label>
                <input value={composeCc} onChange={(e) => setComposeCc(e.target.value)} placeholder="cc@email.com (optional)"
                  className="comm-input" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-widest block mb-1.5">Subject</label>
                <input value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} placeholder="Email subject"
                  className="comm-input" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-widest block mb-1.5">Message</label>
                <textarea value={composeBody} onChange={(e) => setComposeBody(e.target.value)} placeholder="Write your email..." rows={6}
                  className="comm-input resize-none" />
              </div>
            </div>
            <button onClick={() => composeMutation.mutate()}
              disabled={!composeTo || !composeSubject || !composeBody || composeMutation.isPending}
              className="w-full py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 bg-[#DC2626] hover:bg-[#B91C1C] shadow-sm hover:shadow-md transition-all duration-200">
              <Send size={14} /> {composeMutation.isPending ? "Sending..." : "Send Email"}
            </button>
            {composeMutation.isError && <p className="text-xs text-red-500 mt-2">Failed to send. Try again.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
