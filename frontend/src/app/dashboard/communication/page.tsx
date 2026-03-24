"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listAllActivities, createActivity, type Activity } from "@/lib/api/activities";
import { listContacts } from "@/lib/api/contacts";
import { getGmailStatus, syncGmail, listEmails, getEmail, sendEmail, markEmailRead, type Email } from "@/lib/api/gmail";
import { Phone, Mail, Search, Plus, X, User, ChevronDown, ChevronUp, ChevronRight, RefreshCw, Send, Reply, Star, Paperclip, UserPlus, Check, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { listLeadSuggestions, acceptLeadSuggestion, dismissLeadSuggestion, type LeadSuggestion } from "@/lib/api/lead-suggestions";

const typeColors: Record<string, { bg: string; color: string }> = {
  call: { bg: "#EFF6FF", color: "#0EA5E9" },
  email: { bg: "#F0FDF4", color: "#22C55E" },
  gmail: { bg: "#FEF2F2", color: "#EA4335" },
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
  const searchParams = useSearchParams();

  const initialTab = searchParams.get("tab") === "leads" ? "leads" : "all";
  const [filter, setFilter] = useState<"all" | "call" | "email" | "gmail" | "leads">(initialTab);
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

  // Lead suggestions
  const { data: leadSuggestionsData } = useQuery({
    queryKey: ["lead-suggestions"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { suggestions: [], total: 0 };
      return listLeadSuggestions(token);
    },
    refetchInterval: 60000,
  });
  const leadSuggestions = leadSuggestionsData?.suggestions ?? [];

  const acceptMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return acceptLeadSuggestion(token!, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["gmail-emails"] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return dismissLeadSuggestion(token!, id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-suggestions"] });
    },
  });

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
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 p-6 text-center">
        <p className="text-gray-600 font-medium">Failed to load communications</p>
        <button onClick={() => refetchActivities()} className="px-4 py-2 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: "#0EA5E9" }}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Left sidebar */}
      <div className="w-80 border-r border-gray-100 bg-white flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold" style={{ color: "#1E3A5F" }}>Communication</h2>
            <div className="flex items-center gap-1">
              {gmailConnected && (
                <button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors" title="Sync Gmail">
                  <RefreshCw size={14} className={syncMutation.isPending ? "animate-spin" : ""} />
                </button>
              )}
              {gmailConnected && (
                <button onClick={() => setShowCompose(true)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#EA4335]/10 text-[#EA4335] hover:bg-[#EA4335]/20 transition-colors" title="Compose Email">
                  <Send size={14} />
                </button>
              )}
              <button onClick={() => setShowLog(true)}
                className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#0EA5E9]/10 text-[#0EA5E9] hover:bg-[#0EA5E9]/20 transition-colors">
                <Plus size={16} />
              </button>
            </div>
          </div>

          {gmailConnected && gmailStatusData?.last_synced_at && (
            <div className="flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg bg-green-50 text-green-700">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-[10px] font-medium">Gmail synced {timeAgo(gmailStatusData.last_synced_at)}</span>
            </div>
          )}

          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50" />
          </div>

          <div className="flex gap-1">
            {(["all", "call", "email", ...(gmailConnected ? ["gmail" as const] : []), ...(leadSuggestions.length > 0 ? ["leads" as const] : [])] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f as typeof filter)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filter === f
                    ? f === "leads" ? "bg-green-100 text-green-700" : "bg-[#0EA5E9]/10 text-[#0EA5E9]"
                    : "text-gray-400 hover:text-gray-600"
                }`}>
                {f === "all" ? "All" : f === "call" ? "Calls" : f === "email" ? "Manual" : f === "gmail" ? "Gmail" : `Leads (${leadSuggestions.length})`}
              </button>
            ))}
          </div>
        </div>

        <div ref={sidebarRef} className="flex-1 overflow-y-auto">
          {filter === "leads" ? (
            <div className="divide-y divide-gray-100">
              {leadSuggestions.length === 0 ? (
                <div className="p-8 text-center">
                  <UserPlus size={24} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-400">No lead suggestions</p>
                  <p className="text-xs text-gray-300 mt-1">AI will detect potential leads from your incoming emails</p>
                </div>
              ) : (
                leadSuggestions.map((s) => (
                  <div key={s.id} className="px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                        <UserPlus size={16} className="text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900 truncate">
                            {s.suggested_first_name || s.from_name || s.from_address}
                            {s.suggested_last_name ? ` ${s.suggested_last_name}` : ""}
                          </span>
                          {s.confidence > 0 && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                              s.confidence >= 0.7 ? "bg-green-100 text-green-700" :
                              s.confidence >= 0.4 ? "bg-yellow-100 text-yellow-700" :
                              "bg-gray-100 text-gray-500"
                            }`}>
                              {Math.round(s.confidence * 100)}%
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate">{s.from_address}</p>
                        {s.subject && <p className="text-xs text-gray-700 mt-1 truncate font-medium">{s.subject}</p>}
                        {s.snippet && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{s.snippet}</p>}
                        {s.suggested_intent && (
                          <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium capitalize">
                            {s.suggested_intent}
                          </span>
                        )}
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => acceptMutation.mutate(s.id)}
                            disabled={acceptMutation.isPending}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500 text-white text-xs font-semibold hover:bg-green-600 transition-colors disabled:opacity-50"
                          >
                            <Check size={12} />
                            Accept
                          </button>
                          <button
                            onClick={() => dismissMutation.mutate(s.id)}
                            disabled={dismissMutation.isPending}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
                          >
                            <XCircle size={12} />
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                    {s.gmail_date && (
                      <p className="text-[10px] text-gray-300 mt-1 text-right">{timeAgo(s.gmail_date)}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : threads.length === 0 ? (
            <div className="p-8 text-center">
              <Mail size={24} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No communications yet</p>
              <p className="text-xs text-gray-300 mt-1">{gmailConnected ? "Sync Gmail or log a call/email" : "Log a call or email to get started"}</p>
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
                  className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors border-b border-gray-50 ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                  {hasUnread && <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-4" />}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5"
                    style={{ backgroundColor: isEmailGroup ? "#6B7280" : "#1E3A5F" }}>
                    {initials || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm text-gray-800 truncate ${hasUnread ? "font-bold" : "font-medium"}`}>{thread.groupName}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        {lastItem.email_data?.labels && emailIsStarred(lastItem.email_data.labels) && (
                          <Star size={11} className="text-amber-400 fill-amber-400" />
                        )}
                        {lastItem.email_data?.labels && emailHasAttachment(lastItem.email_data.labels) && (
                          <Paperclip size={11} className="text-gray-400" />
                        )}
                        <span className="text-[10px] text-gray-400">{timeAgo(thread.lastDate)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Icon size={11} style={{ color: colors.color }} className="shrink-0" />
                      <p className="text-xs text-gray-500 truncate">{lastItem.subject || lastItem.body}</p>
                    </div>
                    <span className="text-[10px] text-gray-300">{thread.items.length} item{thread.items.length !== 1 ? "s" : ""}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Center — full email view with arrow nav */}
      <div className="flex-1 flex flex-col bg-gray-50 min-w-0">
        {selectedThread && currentItem ? (
          <>
            {/* Header bar with nav arrows */}
            <div className="px-6 py-3 bg-white border-b border-gray-100 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-gray-800 truncate">
                  {selectedThread.groupName}{totalItems > 1 ? ` — ${totalItems} ${totalItems === 1 ? "item" : "items"}` : ""}
                </h3>
              </div>
              <div className="flex items-center gap-1">
                {/* Nav arrows */}
                <button onClick={goNewer} disabled={currentFlatIndex <= 0}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-default"
                  title="Newer">
                  <ChevronUp size={16} className="text-gray-500" />
                </button>
                <button onClick={goOlder} disabled={currentFlatIndex < 0 || currentFlatIndex >= flatItems.length - 1}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-default"
                  title="Older">
                  <ChevronDown size={16} className="text-gray-500" />
                </button>

                <div className="w-px h-6 bg-gray-200 mx-1" />

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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#EA4335]/10 text-[#EA4335] hover:bg-[#EA4335]/20 transition-colors">
                    <Send size={12} /> Email
                  </button>
                )}
                <button onClick={() => { setShowLog(true); if (selectedThread.contactId) setLogContactId(selectedThread.contactId); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0EA5E9]/10 text-[#0EA5E9] hover:bg-[#0EA5E9]/20 transition-colors">
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
                    <div key={item.id} className="bg-white rounded-xl shadow-sm border border-gray-100">
                      {/* Clickable header — always visible */}
                      <button
                        onClick={() => toggleExpanded(item.id)}
                        className={`w-full px-6 pt-5 pb-4 text-left flex items-start gap-3 hover:bg-gray-50/50 transition-colors ${isExpanded ? "rounded-t-xl" : "rounded-xl"}`}
                      >
                        <div className="mt-0.5 shrink-0 text-gray-400 transition-transform duration-150" style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                          <ChevronRight size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                                style={{ backgroundColor: getItemColors(item.type).bg, color: getItemColors(item.type).color }}>
                                {getItemLabel(item.type)}
                              </span>
                              {itemIsGmail && (
                                <span className="text-xs text-gray-500 truncate">
                                  {item.type === "gmail_out"
                                    ? `To: ${item.to_addresses?.join(", ") ?? ""}`
                                    : `From: ${item.from_name || item.from_address || ""}`}
                                </span>
                              )}
                              {itemIsGmail && item.email_data?.labels && emailIsStarred(item.email_data.labels) && (
                                <Star size={12} className="text-yellow-400 fill-yellow-400 shrink-0" />
                              )}
                              {itemIsGmail && item.email_data?.labels && emailHasAttachment(item.email_data.labels) && (
                                <Paperclip size={12} className="text-gray-400 shrink-0" />
                              )}
                            </div>
                            <span className="text-xs text-gray-400 shrink-0 ml-2">{formatDate(item.date)}</span>
                          </div>
                          {item.subject && (
                            <h4 className="text-sm font-semibold text-gray-800 truncate">{item.subject}</h4>
                          )}
                          {!isExpanded && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">{item.body}</p>
                          )}
                          {!isExpanded && itemIsGmail && item.email_data?.labels && getUserLabels(item.email_data.labels).length > 0 && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              {getUserLabels(item.email_data.labels).map((label) => (
                                <span key={label} className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </button>

                      {/* Collapsible body */}
                      {isExpanded && (
                        <div className="px-6 py-5 border-t border-gray-100">
                          {itemIsGmail && item.email_data?.labels && (
                            <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                              {emailHasAttachment(item.email_data.labels) && (
                                <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                                  <Paperclip size={10} /> Attachment
                                </span>
                              )}
                              {getUserLabels(item.email_data.labels).map((label) => (
                                <span key={label} className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                          {itemIsGmail && loadingEmail && !itemFullBody ? (
                            <p className="text-sm text-gray-400">Loading...</p>
                          ) : itemIsGmail && itemFullBody?.body_html ? (
                            <EmailHtmlFrame html={itemFullBody.body_html} />
                          ) : itemIsGmail && itemFullBody?.body_text ? (
                            <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-sans">
                              {itemFullBody.body_text}
                            </pre>
                          ) : (
                            <p className="text-sm text-gray-700 leading-relaxed">{item.body}</p>
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
                      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                        <p className="text-xs text-gray-400 mb-2">
                          Replying to {(() => {
                            const lastGmail = selectedThread.items.find((i) => i.email_data);
                            if (!lastGmail) return "...";
                            return lastGmail.type === "gmail_out"
                              ? lastGmail.to_addresses?.[0]
                              : (lastGmail.from_name || lastGmail.from_address);
                          })()}
                        </p>
                        <input value={replyCc} onChange={(e) => setReplyCc(e.target.value)} placeholder="Cc (optional)"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-xs outline-none focus:border-[#0EA5E9] bg-gray-50 mb-2" />
                        <textarea ref={replyRef} value={replyBody} onChange={(e) => setReplyBody(e.target.value)}
                          placeholder="Write your reply..." rows={4}
                          className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 resize-none" />
                        <div className="flex items-center justify-between mt-3">
                          <button onClick={() => { setShowReply(false); setReplyBody(""); }}
                            className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                          <button onClick={() => replyMutation.mutate()}
                            disabled={!replyBody.trim() || replyMutation.isPending}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50"
                            style={{ backgroundColor: "#0EA5E9" }}>
                            <Send size={12} />
                            {replyMutation.isPending ? "Sending..." : "Send"}
                          </button>
                        </div>
                        {replyMutation.isError && <p className="text-xs text-red-500 mt-2">Failed to send. Try again.</p>}
                      </div>
                    ) : (
                      <button onClick={() => { setShowReply(true); setTimeout(() => replyRef.current?.focus(), 100); }}
                        className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-gray-200 text-sm text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors w-full">
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
              <Mail size={40} className="mx-auto text-gray-200 mb-3" />
              <p className="text-gray-400 text-sm font-medium">Select a conversation</p>
              <p className="text-gray-300 text-xs mt-1">Choose a contact to view their communication history</p>
            </div>
          </div>
        )}
      </div>

      {/* Right panel — contact details */}
      {selectedContact && (
        <div className="w-72 border-l border-gray-100 bg-white p-5 shrink-0">
          <div className="text-center mb-5">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold mx-auto mb-3" style={{ backgroundColor: "#1E3A5F" }}>
              {`${selectedContact.first_name[0]}${selectedContact.last_name[0]}`.toUpperCase()}
            </div>
            <p className="text-sm font-bold text-gray-800">{selectedContact.first_name} {selectedContact.last_name}</p>
            {selectedContact.source && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 mt-1 inline-block">{selectedContact.source}</span>
            )}
          </div>
          <div className="flex flex-col gap-3">
            {selectedContact.email && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Email</p>
                <p className="text-sm text-gray-700">{selectedContact.email}</p>
              </div>
            )}
            {selectedContact.phone && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Phone</p>
                <p className="text-sm text-gray-700">{selectedContact.phone}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Added</p>
              <p className="text-sm text-gray-700">
                {new Date(selectedContact.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Log modal */}
      {showLog && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-800">Log Communication</h3>
              <button onClick={() => setShowLog(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setLogType("call")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${logType === "call" ? "bg-[#0EA5E9]/10 text-[#0EA5E9] border border-[#0EA5E9]/30" : "bg-gray-50 text-gray-400 border border-gray-200"}`}>
                <Phone size={14} /> Call
              </button>
              <button onClick={() => setLogType("email")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${logType === "email" ? "bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/30" : "bg-gray-50 text-gray-400 border border-gray-200"}`}>
                <Mail size={14} /> Email
              </button>
            </div>
            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-500 block mb-1">Contact</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <select value={logContactId} onChange={(e) => setLogContactId(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 appearance-none">
                  <option value="">Select contact...</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div className="mb-5">
              <label className="text-xs font-semibold text-gray-500 block mb-1">Details</label>
              <textarea value={logBody} onChange={(e) => setLogBody(e.target.value)}
                placeholder={logType === "call" ? "Call notes..." : "Email summary..."} rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 resize-none" />
            </div>
            <button onClick={() => logMutation.mutate()} disabled={!logContactId || !logBody || logMutation.isPending}
              className="w-full py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: "#0EA5E9" }}>
              {logMutation.isPending ? "Saving..." : `Log ${logType === "call" ? "Call" : "Email"}`}
            </button>
          </div>
        </div>
      )}

      {/* Compose modal */}
      {showCompose && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-800">New Email</h3>
              <button onClick={() => setShowCompose(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="flex flex-col gap-4 mb-5">
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">To</label>
                <input value={composeTo} onChange={(e) => setComposeTo(e.target.value)} placeholder="recipient@email.com"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Cc</label>
                <input value={composeCc} onChange={(e) => setComposeCc(e.target.value)} placeholder="cc@email.com (optional)"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Subject</label>
                <input value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} placeholder="Email subject"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 block mb-1">Message</label>
                <textarea value={composeBody} onChange={(e) => setComposeBody(e.target.value)} placeholder="Write your email..." rows={6}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 resize-none" />
              </div>
            </div>
            <button onClick={() => composeMutation.mutate()}
              disabled={!composeTo || !composeSubject || !composeBody || composeMutation.isPending}
              className="w-full py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: "#EA4335" }}>
              <Send size={14} /> {composeMutation.isPending ? "Sending..." : "Send Email"}
            </button>
            {composeMutation.isError && <p className="text-xs text-red-500 mt-2">Failed to send. Try again.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
