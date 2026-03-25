"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listAllActivities, createActivity } from "@/lib/api/activities";
import { listContacts } from "@/lib/api/contacts";
import { getGmailStatus, syncGmail, listEmails, getEmail, sendEmail, forwardEmail, markEmailRead, type Email } from "@/lib/api/gmail";
import {
  Phone, Mail, Search, Plus, X, User, ChevronDown, ChevronUp, ChevronRight, RefreshCw,
  Send, Reply, Star, Paperclip, UserPlus, Check, XCircle, CornerUpRight, ArrowUpDown,
  ExternalLink, PhoneCall, Users
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { listLeadSuggestions, acceptLeadSuggestion, dismissLeadSuggestion, type LeadSuggestion } from "@/lib/api/lead-suggestions";
import Link from "next/link";

/* ── helpers ────────────────────────────────────────────────────────────── */

const typeColors: Record<string, { bg: string; color: string }> = {
  call: { bg: "#EFF6FF", color: "#2563EB" },
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

type SortMode = "date" | "name" | "unread" | "starred";

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
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const INTERNAL_LABELS = new Set([
  "INBOX", "UNREAD", "SENT", "DRAFT", "SPAM", "TRASH", "IMPORTANT", "STARRED",
  "CATEGORY_PERSONAL", "CATEGORY_SOCIAL", "CATEGORY_PROMOTIONS",
  "CATEGORY_UPDATES", "CATEGORY_FORUMS", "HAS_ATTACHMENT",
]);
function getUserLabels(labels: string[]): string[] { return labels.filter((l) => !INTERNAL_LABELS.has(l)); }
function emailHasAttachment(labels: string[]): boolean { return labels.includes("HAS_ATTACHMENT"); }
function emailIsStarred(labels: string[]): boolean { return labels.includes("STARRED") || labels.includes("IMPORTANT"); }

const AVATAR_COLORS = ["#2563EB", "#7C3AED", "#0EA5E9", "#059669", "#D97706", "#DC2626", "#0891B2", "#4F46E5"];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

/* ── Contact Autocomplete ───────────────────────────────────────────────── */

interface ContactOption { id: string; email: string; name: string; initials: string; }

function ContactAutocomplete({
  value, onChange, contacts, placeholder = "Type to search contacts...",
}: {
  value: string; onChange: (email: string) => void; contacts: ContactOption[]; placeholder?: string;
}) {
  // value is comma-separated emails; we split into chips + active input
  const chips = useMemo(() => value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [], [value]);
  const [inputVal, setInputVal] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = inputVal.trim().toLowerCase();
    const existing = new Set(chips.map((c) => c.toLowerCase()));
    const base = contacts.filter((c) => !existing.has(c.email.toLowerCase()));
    if (!q) return base.slice(0, 6);
    return base.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)).slice(0, 6);
  }, [inputVal, contacts, chips]);

  function addChip(email: string) {
    const trimmed = email.trim();
    if (!trimmed) return;
    const exists = chips.some((c) => c.toLowerCase() === trimmed.toLowerCase());
    if (exists) { setInputVal(""); return; }
    const next = [...chips, trimmed];
    onChange(next.join(", "));
    setInputVal("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function removeChip(idx: number) {
    const next = chips.filter((_, i) => i !== idx);
    onChange(next.join(", "));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.key === "Enter" || e.key === "Tab" || e.key === ",") && inputVal.trim()) {
      e.preventDefault();
      addChip(inputVal);
    }
    if (e.key === "Backspace" && !inputVal && chips.length > 0) {
      removeChip(chips.length - 1);
    }
  }

  // Find contact info for chip display
  const contactByEmail = useMemo(() => {
    const map: Record<string, ContactOption> = {};
    for (const c of contacts) map[c.email.toLowerCase()] = c;
    return map;
  }, [contacts]);

  return (
    <div ref={ref} className="relative">
      <div className="flex flex-wrap items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl text-sm outline-none transition-all duration-200 cursor-text"
        style={{ background: "var(--comm-bg)", border: "1.5px solid var(--comm-border)", color: "var(--comm-text-primary)" }}
        onClick={() => inputRef.current?.focus()}>
        {chips.map((email, idx) => {
          const contact = contactByEmail[email.toLowerCase()];
          return (
            <span key={`${email}-${idx}`} className="inline-flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded-full bg-sky-100 text-[#0EA5E9] text-xs font-medium max-w-[200px]">
              {contact ? (
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0"
                  style={{ backgroundColor: avatarColor(contact.name) }}>
                  {contact.initials}
                </span>
              ) : (
                <span className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-white text-[8px] font-bold shrink-0">
                  {email[0]?.toUpperCase() || "?"}
                </span>
              )}
              <span className="truncate">{contact?.name || email}</span>
              <button onClick={(e) => { e.stopPropagation(); removeChip(idx); }}
                className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center hover:bg-sky-200 transition-colors">
                <X size={10} />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          value={inputVal}
          onChange={(e) => { setInputVal(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (inputVal.trim() && inputVal.includes("@")) addChip(inputVal); }}
          placeholder={chips.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm py-0.5"
          style={{ color: "var(--comm-text-primary)" }}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-50 max-h-48 overflow-y-auto">
          {filtered.map((c) => (
            <button key={c.id} onClick={() => addChip(c.email)}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-left transition-colors first:rounded-t-xl last:rounded-b-xl">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                style={{ backgroundColor: avatarColor(c.name) }}>
                {c.initials}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">{c.name}</p>
                <p className="text-[10px] text-gray-400 truncate">{c.email}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── EmailHtmlFrame ─────────────────────────────────────────────────────── */

function EmailHtmlFrame({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  const baseStyles = `<style>body{font-family:sans-serif;font-size:14px;color:#374151;margin:0;padding:0;overflow-x:hidden;}img{max-width:100%;height:auto;}*{max-width:100%;box-sizing:border-box;}</style>`;
  const fullHtml = baseStyles + html;

  const adjustHeight = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (doc?.body) { const h = doc.body.scrollHeight; if (h > 0) setHeight(h); }
    } catch { /* cross-origin */ }
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (doc) { doc.open(); doc.write(fullHtml); doc.close(); adjustHeight(); const t = setTimeout(adjustHeight, 500); return () => clearTimeout(t); }
    } catch { /* fallback */ }
  }, [fullHtml, adjustHeight]);

  return <iframe ref={iframeRef} sandbox="allow-same-origin" srcDoc={fullHtml} onLoad={adjustHeight} style={{ width: "100%", height: `${height}px`, border: "none", display: "block" }} title="Email content" />;
}

/* ── Main Page ──────────────────────────────────────────────────────────── */

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
  const [showForward, setShowForward] = useState(false);
  const [logType, setLogType] = useState<"call" | "email">("call");
  const [logContactId, setLogContactId] = useState("");
  const [logBody, setLogBody] = useState("");

  // Sort & filter
  const [sortBy, setSortBy] = useState<SortMode>("date");
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [contactFilter, setContactFilter] = useState<string>("");
  const [contactFilterName, setContactFilterName] = useState("");
  const [contactSearchQuery, setContactSearchQuery] = useState("");
  const [showContactFilter, setShowContactFilter] = useState(false);
  const contactFilterRef = useRef<HTMLDivElement>(null);

  // Inline reply
  const [showReply, setShowReply] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Compose state
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [replyCc, setReplyCc] = useState("");

  // Forward state
  const [forwardTo, setForwardTo] = useState("");
  const [forwardCc, setForwardCc] = useState("");
  const [forwardBody, setForwardBody] = useState("");
  const [forwardEmailId, setForwardEmailId] = useState("");
  const [forwardSubject, setForwardSubject] = useState("");
  const [forwardOriginal, setForwardOriginal] = useState<{ from: string; date: string; snippet: string }>({ from: "", date: "", snippet: "" });

  // Expand/collapse
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const emailCacheRef = useRef<Record<string, Email>>({});
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [cacheVersion, setCacheVersion] = useState(0);

  /* ── Queries ──────────────────────────────────────────────────────────── */

  const { data: gmailStatusData } = useQuery({
    queryKey: ["gmail-status"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { connected: false, gmail_address: null, last_synced_at: null };
      return getGmailStatus(token);
    },
  });
  const gmailConnected = gmailStatusData?.connected ?? false;

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
    mutationFn: async (id: string) => { const token = await getToken(); return acceptLeadSuggestion(token!, id); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["lead-suggestions"] }); queryClient.invalidateQueries({ queryKey: ["contacts"] }); queryClient.invalidateQueries({ queryKey: ["gmail-emails"] }); },
  });
  const dismissMutation = useMutation({
    mutationFn: async (id: string) => { const token = await getToken(); return dismissLeadSuggestion(token!, id); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["lead-suggestions"] }); },
  });

  const { data: activitiesData, isError: activitiesError, refetch: refetchActivities } = useQuery({
    queryKey: ["comm-activities"],
    queryFn: async () => { const token = await getToken(); if (!token) return { activities: [], total: 0 }; return listAllActivities(token, undefined, 100); },
    refetchInterval: 30000,
  });

  const { data: emailsData } = useQuery({
    queryKey: ["gmail-emails"],
    queryFn: async () => { const token = await getToken(); if (!token) return { emails: [], total: 0 }; return listEmails(token, { limit: 100 }); },
    enabled: gmailConnected,
    refetchInterval: 60000,
  });

  const { data: contactsData } = useQuery({
    queryKey: ["contacts-list"],
    queryFn: async () => { const token = await getToken(); if (!token) return { contacts: [], total: 0 }; return listContacts(token, { limit: 200 }); },
  });

  const contacts = contactsData?.contacts ?? [];
  const contactMap = useMemo(() => Object.fromEntries(contacts.map((c) => [c.id, c])), [contacts]);
  const contactOptions: ContactOption[] = useMemo(() =>
    contacts.filter((c) => c.email).map((c) => ({
      id: c.id, email: c.email!, name: `${c.first_name} ${c.last_name}`,
      initials: `${c.first_name[0] || ""}${c.last_name[0] || ""}`.toUpperCase(),
    })), [contacts]);

  /* ── Build items ──────────────────────────────────────────────────────── */

  const allItems = useMemo(() => {
    const items: CommItem[] = [];
    const activities = activitiesData?.activities ?? [];
    for (const a of activities) {
      if (a.type !== "call" && a.type !== "email") continue;
      const contact = a.contact_id ? contactMap[a.contact_id] : null;
      const name = a.contact_name || (contact ? `${contact.first_name} ${contact.last_name}` : "Unknown");
      items.push({ id: a.id, type: a.type, contact_id: a.contact_id, contact_name: name, body: a.body || "No details", date: a.created_at, groupKey: a.contact_id || `manual-${a.id}`, groupName: name });
    }
    const emails = emailsData?.emails ?? [];
    for (const e of emails) {
      const contact = e.contact_id ? contactMap[e.contact_id] : null;
      const isOut = e.is_outbound;
      const otherEmail = isOut ? (e.to_addresses?.[0] ?? "") : (e.from_address ?? "");
      const otherName = isOut ? (e.to_addresses?.[0] ?? "Unknown") : (e.from_name || e.from_address || "Unknown");
      let groupKey: string, groupName: string;
      if (e.contact_id && contact) { groupKey = e.contact_id; groupName = `${contact.first_name} ${contact.last_name}`; }
      else if (e.contact_name) { groupKey = e.contact_id || `email-${otherEmail.toLowerCase()}`; groupName = e.contact_name; }
      else { groupKey = `email-${otherEmail.toLowerCase()}`; groupName = otherName; }
      items.push({ id: `gmail-${e.id}`, type: isOut ? "gmail_out" : "gmail_in", contact_id: e.contact_id, contact_name: groupName, body: e.snippet || "No content", subject: e.subject || undefined, date: e.gmail_date || e.created_at, from_address: e.from_address ?? undefined, from_name: e.from_name ?? undefined, to_addresses: e.to_addresses, email_data: e, groupKey, groupName });
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
    let result = Object.entries(groups)
      .map(([key, items]) => {
        const sorted = items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const hasUnread = sorted.some((i) => i.email_data && !i.email_data.is_read);
        const hasStarred = sorted.some((i) => i.email_data?.labels && emailIsStarred(i.email_data.labels));
        return { groupKey: key, groupName: sorted[0]?.groupName || "Unknown", contactId: sorted[0]?.contact_id, items: sorted, lastDate: sorted[0]?.date ?? "", hasUnread, hasStarred };
      })
      .filter((t) => {
        if (contactFilter && t.contactId !== contactFilter) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        if (t.groupName.toLowerCase().includes(q)) return true;
        return t.items.some((item) => (item.subject && item.subject.toLowerCase().includes(q)) || item.body.toLowerCase().includes(q));
      });

    // Sort
    switch (sortBy) {
      case "name": result.sort((a, b) => a.groupName.localeCompare(b.groupName)); break;
      case "unread": result.sort((a, b) => (b.hasUnread ? 1 : 0) - (a.hasUnread ? 1 : 0) || new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime()); break;
      case "starred": result.sort((a, b) => (b.hasStarred ? 1 : 0) - (a.hasStarred ? 1 : 0) || new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime()); break;
      default: result.sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
    }
    return result;
  }, [filteredItems, search, sortBy, contactFilter]);

  // Unread counts for tab badges
  const unreadCounts = useMemo(() => {
    let all = 0, gmail = 0;
    for (const item of allItems) {
      if (item.email_data && !item.email_data.is_read) { all++; if (item.type === "gmail_in" || item.type === "gmail_out") gmail++; }
    }
    return { all, gmail };
  }, [allItems]);

  const selectedThread = threads.find((t) => t.groupKey === selectedGroupKey);
  const selectedContact = selectedThread?.contactId ? contactMap[selectedThread.contactId] : null;
  const currentItem = selectedThread?.items[currentIndex] ?? null;
  const totalItems = selectedThread?.items.length ?? 0;

  /* ── Effects ──────────────────────────────────────────────────────────── */

  // Load full email bodies for selected thread
  useEffect(() => {
    setShowReply(false); setReplyBody(""); setReplyCc("");
    if (!selectedThread) return;
    setExpandedItems(new Set(selectedThread.items.length > 0 ? [selectedThread.items[0].id] : []));
    const gmailItems = selectedThread.items.filter((item) => item.email_data);
    if (gmailItems.length === 0) return;
    (async () => {
      try {
        const token = await getToken(); if (!token) return;
        for (const item of gmailItems) { if (item.email_data && !item.email_data.is_read) markEmailRead(token, item.email_data.id); }
        queryClient.invalidateQueries({ queryKey: ["gmail-emails"] });
      } catch { /* ignore */ }
    })();
    const uncached = gmailItems.filter((item) => item.email_data && !emailCacheRef.current[item.email_data.id]);
    if (uncached.length === 0) return;
    let cancelled = false;
    setLoadingEmail(true);
    (async () => {
      try {
        const token = await getToken();
        if (token && !cancelled) {
          for (const item of uncached) {
            if (cancelled || !item.email_data) break;
            const full = await getEmail(token, item.email_data.id);
            if (!cancelled) { emailCacheRef.current[item.email_data.id] = full; setCacheVersion((v) => v + 1); }
          }
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoadingEmail(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupKey]);

  // Close contact filter dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (contactFilterRef.current && !contactFilterRef.current.contains(e.target as Node)) setShowContactFilter(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  void cacheVersion;

  /* ── Navigation ───────────────────────────────────────────────────────── */

  function selectThread(groupKey: string) { setSelectedGroupKey(groupKey); setCurrentIndex(0); setShowReply(false); setReplyBody(""); }
  const flatItems = useMemo(() => threads.map((t) => ({ groupKey: t.groupKey, index: 0 })), [threads]);
  const currentFlatIndex = useMemo(() => { if (!selectedGroupKey) return -1; return flatItems.findIndex((f) => f.groupKey === selectedGroupKey); }, [flatItems, selectedGroupKey]);
  function goNewer() { if (currentFlatIndex <= 0) return; setSelectedGroupKey(flatItems[currentFlatIndex - 1].groupKey); setCurrentIndex(0); }
  function goOlder() { if (currentFlatIndex < 0 || currentFlatIndex >= flatItems.length - 1) return; setSelectedGroupKey(flatItems[currentFlatIndex + 1].groupKey); setCurrentIndex(0); }
  function toggleExpanded(itemId: string) { setExpandedItems((prev) => { const next = new Set(prev); if (next.has(itemId)) next.delete(itemId); else next.add(itemId); return next; }); }

  /* ── Mutations ─────────────────────────────────────────────────────────── */

  const logMutation = useMutation({
    mutationFn: async () => { const token = await getToken(); if (!token || !logContactId) return; return createActivity(token, logContactId, { type: logType, body: logBody }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["comm-activities"] }); setShowLog(false); setLogBody(""); setLogContactId(""); },
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      if (!currentItem?.email_data) throw new Error("No email");
      const token = await getToken(); if (!token) throw new Error("No token");
      const e = currentItem.email_data;
      const to = e.is_outbound ? (e.to_addresses?.[0] ?? "") : (e.from_address ?? "");
      const subject = e.subject ? (e.subject.startsWith("Re: ") ? e.subject : `Re: ${e.subject}`) : "";
      return sendEmail(token, { to, cc: replyCc || undefined, subject, body: replyBody, contact_id: e.contact_id || undefined, reply_to_message_id: e.gmail_message_id });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["gmail-emails"] }); setShowReply(false); setReplyBody(""); },
  });

  const composeMutation = useMutation({
    mutationFn: async () => { const token = await getToken(); if (!token) throw new Error("No token"); return sendEmail(token, { to: composeTo, cc: composeCc || undefined, subject: composeSubject, body: composeBody }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["gmail-emails"] }); setShowCompose(false); setComposeTo(""); setComposeCc(""); setComposeSubject(""); setComposeBody(""); },
  });

  const forwardMutation = useMutation({
    mutationFn: async () => { const token = await getToken(); if (!token) throw new Error("No token"); return forwardEmail(token, { email_id: forwardEmailId, to: forwardTo, cc: forwardCc || undefined, body: forwardBody || undefined }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["gmail-emails"] }); setShowForward(false); setForwardTo(""); setForwardCc(""); setForwardBody(""); setForwardEmailId(""); },
  });

  const syncMutation = useMutation({
    mutationFn: async () => { const token = await getToken(); if (!token) throw new Error("No token"); return syncGmail(token); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["gmail-emails"] }); queryClient.invalidateQueries({ queryKey: ["gmail-status"] }); },
  });

  /* ── Helpers ───────────────────────────────────────────────────────────── */

  function getItemColors(type: CommItem["type"]) {
    if (type === "call") return typeColors.call;
    if (type === "gmail_in" || type === "gmail_out") return typeColors.gmail;
    return typeColors.email;
  }
  function getItemLabel(type: CommItem["type"]) {
    if (type === "call") return "Call";
    if (type === "email") return "Logged";
    if (type === "gmail_in") return "Received";
    if (type === "gmail_out") return "Sent";
    return "Email";
  }

  function openForward(item: CommItem) {
    if (!item.email_data) return;
    setForwardEmailId(item.email_data.id);
    setForwardSubject(item.subject ? (item.subject.toLowerCase().startsWith("fwd:") ? item.subject : `Fwd: ${item.subject}`) : "");
    setForwardOriginal({
      from: item.from_name || item.from_address || "Unknown",
      date: formatDate(item.date),
      snippet: item.body.slice(0, 200),
    });
    setForwardTo(""); setForwardCc(""); setForwardBody("");
    setShowForward(true);
  }

  /* ── Keyboard shortcuts ───────────────────────────────────────────────── */

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      switch (e.key) {
        case "j": case "ArrowDown": e.preventDefault(); goOlder(); break;
        case "k": case "ArrowUp": e.preventDefault(); goNewer(); break;
        case "r": e.preventDefault(); setShowReply(true); break;
        case "c": e.preventDefault(); setShowCompose(true); break;
        case "f": e.preventDefault(); if (currentItem?.email_data) openForward(currentItem); break;
        case "Escape": setShowReply(false); setShowCompose(false); setShowLog(false); setShowForward(false); break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFlatIndex, flatItems, currentItem]);

  // Auto-scroll selected thread into view
  useEffect(() => {
    if (!selectedGroupKey || !sidebarRef.current) return;
    const el = sidebarRef.current.querySelector(`[data-group-key="${CSS.escape(selectedGroupKey)}"]`);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedGroupKey]);

  /* ── Error state ──────────────────────────────────────────────────────── */

  if (activitiesError) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 p-6 text-center font-[family-name:var(--font-dm-sans)]" style={{ backgroundColor: "#F5F7FA" }}>
        <p className="text-[#1E3A5F] font-medium">Failed to load communications</p>
        <button onClick={() => refetchActivities()} className="px-4 py-2 rounded-xl text-white text-sm font-semibold bg-[#0EA5E9] hover:bg-[#0284C7] transition-colors">Try again</button>
      </div>
    );
  }

  /* ── Filtered contacts for contact filter dropdown ────────────────────── */
  const filteredContacts = useMemo(() => {
    if (!contactSearchQuery) return contacts.slice(0, 10);
    const q = contactSearchQuery.toLowerCase();
    return contacts.filter((c) => `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) || (c.email && c.email.toLowerCase().includes(q))).slice(0, 10);
  }, [contactSearchQuery, contacts]);

  /* ── RENDER ───────────────────────────────────────────────────────────── */

  const sortLabels: Record<SortMode, string> = { date: "Newest", name: "Name", unread: "Unread", starred: "Starred" };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] font-[family-name:var(--font-dm-sans)]" style={{ backgroundColor: "#F5F7FA" }}>

      {/* ═══ LEFT SIDEBAR ═══ */}
      <div className="w-[340px] border-r border-gray-200/80 bg-white flex flex-col shrink-0">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-[#1E3A5F]">Inbox</h2>
            <div className="flex items-center gap-1">
              {gmailConnected && (
                <button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#0EA5E9] hover:bg-sky-50 transition-colors" title="Sync Gmail">
                  <RefreshCw size={15} className={syncMutation.isPending ? "animate-spin" : ""} />
                </button>
              )}
              {gmailConnected && (
                <button onClick={() => setShowCompose(true)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[#0EA5E9] bg-sky-50 hover:bg-sky-100 transition-colors" title="Compose (C)">
                  <Send size={15} />
                </button>
              )}
              <button onClick={() => setShowLog(true)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#0EA5E9] hover:bg-sky-50 transition-colors" title="Log Activity">
                <Plus size={16} />
              </button>
            </div>
          </div>

          {gmailConnected && gmailStatusData?.last_synced_at && (
            <div className="flex items-center gap-1.5 mb-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-emerald-600 font-medium">Synced {timeAgo(gmailStatusData.last_synced_at)}</span>
            </div>
          )}

          {/* Search + Sort */}
          <div className="flex items-center gap-2 mb-2.5">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50/50 text-sm outline-none focus:border-[#0EA5E9] focus:bg-white transition-all" />
            </div>
            <div className="relative">
              <button onClick={() => setShowSortMenu(!showSortMenu)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#0EA5E9] hover:bg-sky-50 border border-gray-200 transition-colors" title="Sort">
                <ArrowUpDown size={14} />
              </button>
              {showSortMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-40 py-1 w-36">
                  {(["date", "name", "unread", "starred"] as SortMode[]).map((mode) => (
                    <button key={mode} onClick={() => { setSortBy(mode); setShowSortMenu(false); }}
                      className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors ${sortBy === mode ? "text-[#0EA5E9] bg-sky-50" : "text-gray-600 hover:bg-gray-50"}`}>
                      {sortLabels[mode]} {sortBy === mode && "✓"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Contact filter */}
          <div ref={contactFilterRef} className="relative mb-2.5">
            {contactFilter ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200">
                <Users size={12} className="text-[#0EA5E9]" />
                <span className="text-xs font-medium text-[#0EA5E9] truncate flex-1">{contactFilterName}</span>
                <button onClick={() => { setContactFilter(""); setContactFilterName(""); }}
                  className="text-[#0EA5E9] hover:text-sky-700"><X size={14} /></button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Users size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
                  <input value={contactSearchQuery} onChange={(e) => { setContactSearchQuery(e.target.value); setShowContactFilter(true); }}
                    onFocus={() => setShowContactFilter(true)}
                    placeholder="Filter by contact..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-gray-100 bg-gray-50/30 text-xs outline-none focus:border-[#0EA5E9] transition-all" />
                </div>
                {showContactFilter && filteredContacts.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-40 max-h-40 overflow-y-auto">
                    {filteredContacts.map((c) => (
                      <button key={c.id} onClick={() => { setContactFilter(c.id); setContactFilterName(`${c.first_name} ${c.last_name}`); setContactSearchQuery(""); setShowContactFilter(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left transition-colors text-xs">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ backgroundColor: avatarColor(`${c.first_name} ${c.last_name}`) }}>
                          {`${c.first_name[0]}${c.last_name[0]}`.toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-700">{c.first_name} {c.last_name}</span>
                        {c.email && <span className="text-gray-400 truncate">({c.email})</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 bg-gray-100/80 rounded-lg p-0.5">
            {(["all", "call", "email", ...(gmailConnected ? ["gmail" as const] : []), ...(leadSuggestions.length > 0 ? ["leads" as const] : [])] as const).map((f) => {
              const badge = f === "all" ? unreadCounts.all : f === "gmail" ? unreadCounts.gmail : 0;
              return (
                <button key={f} onClick={() => setFilter(f as typeof filter)}
                  className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold tracking-wide uppercase transition-all duration-150 flex items-center justify-center gap-1 ${
                    filter === f
                      ? f === "leads" ? "bg-emerald-500 text-white shadow-sm" : "bg-white text-[#1E3A5F] shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}>
                  {f === "all" ? "All" : f === "call" ? "Calls" : f === "email" ? "Manual" : f === "gmail" ? "Gmail" : `Leads`}
                  {f === "leads" && <span className="text-[9px]">({leadSuggestions.length})</span>}
                  {badge > 0 && f !== "leads" && filter !== f && (
                    <span className="w-4 h-4 rounded-full bg-[#0EA5E9] text-white text-[9px] flex items-center justify-center font-bold">{badge > 9 ? "9+" : badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Thread list */}
        <div ref={sidebarRef} className="flex-1 overflow-y-auto">
          {filter === "leads" ? (
            <div className="divide-y divide-gray-50">
              {leadSuggestions.length === 0 ? (
                <div className="p-8 text-center">
                  <UserPlus size={28} className="mx-auto text-gray-200 mb-3" />
                  <p className="text-sm text-gray-400 font-medium">No lead suggestions</p>
                  <p className="text-xs text-gray-300 mt-1">AI will detect potential leads from incoming emails</p>
                </div>
              ) : (
                leadSuggestions.map((s) => (
                  <div key={s.id} className="px-4 py-3.5 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0"><UserPlus size={16} className="text-emerald-600" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900 truncate">{s.suggested_first_name || s.from_name || s.from_address}{s.suggested_last_name ? ` ${s.suggested_last_name}` : ""}</span>
                          {s.confidence > 0 && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${s.confidence >= 0.7 ? "bg-emerald-100 text-emerald-700" : s.confidence >= 0.4 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                              {Math.round(s.confidence * 100)}%
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate">{s.from_address}</p>
                        {s.subject && <p className="text-xs text-gray-700 mt-1 truncate font-medium">{s.subject}</p>}
                        {s.snippet && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{s.snippet}</p>}
                        {s.suggested_intent && (
                          <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-sky-50 text-[#0EA5E9] font-medium capitalize">{s.suggested_intent}</span>
                        )}
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => acceptMutation.mutate(s.id)} disabled={acceptMutation.isPending}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50">
                            <Check size={12} /> Accept
                          </button>
                          <button onClick={() => dismissMutation.mutate(s.id)} disabled={dismissMutation.isPending}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50">
                            <XCircle size={12} /> Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : threads.length === 0 ? (
            <div className="p-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Mail size={24} className="text-gray-300" />
              </div>
              <p className="text-sm text-gray-500 font-medium">No conversations yet</p>
              <p className="text-xs text-gray-400 mt-1">{gmailConnected ? "Sync Gmail or log a call" : "Log a call or email to get started"}</p>
            </div>
          ) : (
            threads.map((thread) => {
              const isSelected = thread.groupKey === selectedGroupKey;
              const lastItem = thread.items[0];
              const isEmailGroup = thread.groupKey.startsWith("email-");
              const initials = isEmailGroup
                ? (thread.groupName[0] ?? "?").toUpperCase()
                : thread.groupName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
              const bg = avatarColor(thread.groupName);
              return (
                <button key={thread.groupKey} data-group-key={thread.groupKey} onClick={() => selectThread(thread.groupKey)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-150 border-l-[3px] ${
                    isSelected ? "bg-sky-50/60 border-l-[#0EA5E9]" : "border-l-transparent hover:bg-gray-50/80"
                  }`}>
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold ring-2 ring-white shadow-sm" style={{ backgroundColor: bg }}>
                      {initials || "?"}
                    </div>
                    {thread.hasUnread && <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#0EA5E9] border-2 border-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm text-[#1E3A5F] truncate ${thread.hasUnread ? "font-bold" : "font-medium"}`}>{thread.groupName}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        {lastItem.email_data?.labels && emailIsStarred(lastItem.email_data.labels) && <Star size={11} className="text-amber-400 fill-amber-400" />}
                        {lastItem.email_data?.labels && emailHasAttachment(lastItem.email_data.labels) && <Paperclip size={11} className="text-gray-400" />}
                        <span className="text-[10px] text-gray-400 font-medium">{timeAgo(thread.lastDate)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{lastItem.subject || lastItem.body}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ═══ CENTER PANEL ═══ */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedThread && currentItem ? (
          <>
            {/* Thread header */}
            <div className="px-6 py-3 bg-white border-b border-gray-100 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-[#1E3A5F] truncate">{selectedThread.groupName}</h3>
                <p className="text-xs text-gray-400">{totalItems} message{totalItems !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex items-center gap-1">
                {currentItem.email_data && (
                  <>
                    <button onClick={() => { setShowReply(true); setTimeout(() => replyRef.current?.focus(), 100); }}
                      className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors" title="Reply (R)">
                      <Reply size={14} /> Reply
                    </button>
                    <button onClick={() => openForward(currentItem)}
                      className="h-8 px-3 rounded-lg flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors" title="Forward (F)">
                      <CornerUpRight size={14} /> Forward
                    </button>
                  </>
                )}
                <div className="w-px h-5 bg-gray-200 mx-1" />
                <button onClick={goNewer} disabled={currentFlatIndex <= 0}
                  className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-gray-100 transition-colors disabled:opacity-20" title="Newer (K)">
                  <ChevronUp size={16} className="text-gray-500" />
                </button>
                <button onClick={goOlder} disabled={currentFlatIndex < 0 || currentFlatIndex >= flatItems.length - 1}
                  className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-gray-100 transition-colors disabled:opacity-20" title="Older (J)">
                  <ChevronDown size={16} className="text-gray-500" />
                </button>
              </div>
            </div>

            {/* Conversation */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="max-w-2xl mx-auto flex flex-col gap-3">
                {selectedThread.items.map((item) => {
                  const isExpanded = expandedItems.has(item.id);
                  const itemIsGmail = item.type === "gmail_in" || item.type === "gmail_out";
                  const isSent = item.type === "gmail_out";
                  const itemFullBody = item.email_data ? emailCacheRef.current[item.email_data.id] : null;
                  const colors = getItemColors(item.type);

                  return (
                    <div key={item.id} className={`rounded-xl border transition-all duration-200 ${isSent ? "bg-sky-50/40 border-sky-100" : "bg-white border-gray-100"} ${isExpanded ? "shadow-sm" : "hover:shadow-sm"}`}>
                      <button onClick={() => toggleExpanded(item.id)}
                        className={`w-full px-5 py-3.5 text-left flex items-start gap-3 transition-colors ${isExpanded ? "" : "hover:bg-gray-50/30"} rounded-xl`}>
                        <div className="mt-0.5 shrink-0 text-gray-300 transition-transform duration-150" style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
                          <ChevronRight size={14} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase" style={{ backgroundColor: colors.bg, color: colors.color }}>
                                {getItemLabel(item.type)}
                              </span>
                              {itemIsGmail && (
                                <span className="text-xs text-gray-500 truncate">
                                  {item.type === "gmail_out" ? `To: ${item.to_addresses?.join(", ") ?? ""}` : `From: ${item.from_name || item.from_address || ""}`}
                                </span>
                              )}
                              {itemIsGmail && item.email_data?.labels && emailIsStarred(item.email_data.labels) && <Star size={11} className="text-amber-400 fill-amber-400 shrink-0" />}
                              {itemIsGmail && item.email_data?.labels && emailHasAttachment(item.email_data.labels) && <Paperclip size={11} className="text-gray-400 shrink-0" />}
                            </div>
                            <span className="text-[11px] text-gray-400 shrink-0 ml-2">{formatDate(item.date)}</span>
                          </div>
                          {item.subject && <h4 className="text-sm font-semibold text-[#1E3A5F] truncate">{item.subject}</h4>}
                          {!isExpanded && <p className="text-xs text-gray-400 mt-0.5 truncate">{item.body}</p>}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-8 pb-5 pt-2 border-t border-gray-100/60">
                          {itemIsGmail && item.email_data?.labels && getUserLabels(item.email_data.labels).length > 0 && (
                            <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                              {getUserLabels(item.email_data.labels).map((label) => (
                                <span key={label} className="bg-indigo-50 text-indigo-600 rounded-md px-2 py-0.5 text-[10px] font-semibold">{label}</span>
                              ))}
                            </div>
                          )}
                          {itemIsGmail && loadingEmail && !itemFullBody ? (
                            <div className="flex items-center gap-2 py-4"><RefreshCw size={14} className="animate-spin text-gray-300" /><span className="text-sm text-gray-400">Loading...</span></div>
                          ) : itemIsGmail && itemFullBody?.body_html ? (
                            <EmailHtmlFrame html={itemFullBody.body_html} />
                          ) : itemIsGmail && itemFullBody?.body_text ? (
                            <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-sans">{itemFullBody.body_text}</pre>
                          ) : (
                            <p className="text-sm text-gray-700 leading-relaxed">{item.body}</p>
                          )}
                          {/* Per-item forward button */}
                          {itemIsGmail && item.email_data && (
                            <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100/60">
                              <button onClick={(e) => { e.stopPropagation(); openForward(item); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-[#0EA5E9] hover:bg-sky-50 transition-colors">
                                <CornerUpRight size={13} /> Forward
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Reply / Forward bar */}
                {selectedThread.items.some((i) => i.type === "gmail_in" || i.type === "gmail_out") && (
                  <div>
                    {showReply ? (
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                        <p className="text-xs text-gray-400 mb-2">
                          Replying to {(() => {
                            const lastGmail = selectedThread.items.find((i) => i.email_data);
                            if (!lastGmail) return "...";
                            return lastGmail.type === "gmail_out" ? lastGmail.to_addresses?.[0] : (lastGmail.from_name || lastGmail.from_address);
                          })()}
                        </p>
                        <ContactAutocomplete value={replyCc} onChange={setReplyCc} contacts={contactOptions} placeholder="Cc (optional)" />
                        <textarea ref={replyRef} value={replyBody} onChange={(e) => setReplyBody(e.target.value)} placeholder="Write your reply..." rows={4}
                          className="comm-input resize-none mt-2" />
                        <div className="flex items-center justify-between mt-3">
                          <button onClick={() => { setShowReply(false); setReplyBody(""); }} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
                          <button onClick={() => replyMutation.mutate()} disabled={!replyBody.trim() || replyMutation.isPending}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 bg-[#0EA5E9] hover:bg-[#0284C7] transition-colors">
                            <Send size={13} /> {replyMutation.isPending ? "Sending..." : "Send"}
                          </button>
                        </div>
                        {replyMutation.isError && <p className="text-xs text-red-500 mt-2">Failed to send. Try again.</p>}
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => { setShowReply(true); setTimeout(() => replyRef.current?.focus(), 100); }}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 font-medium hover:border-[#0EA5E9] hover:text-[#0EA5E9] hover:bg-sky-50/30 transition-all">
                          <Reply size={15} /> Reply
                        </button>
                        <button onClick={() => { const lastGmail = selectedThread.items.find((i) => i.email_data); if (lastGmail) openForward(lastGmail); }}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 font-medium hover:border-gray-300 hover:text-gray-600 hover:bg-gray-50 transition-all">
                          <CornerUpRight size={15} /> Forward
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Mail size={28} className="text-gray-300" />
              </div>
              <p className="text-sm text-gray-500 font-medium">Select a conversation</p>
              <p className="text-xs text-gray-400 mt-1">Choose from the list to view messages</p>
              <div className="flex items-center justify-center gap-3 mt-4 text-[10px] text-gray-300">
                <span className="px-1.5 py-0.5 rounded border border-gray-200 font-mono">J</span> <span>older</span>
                <span className="px-1.5 py-0.5 rounded border border-gray-200 font-mono">K</span> <span>newer</span>
                <span className="px-1.5 py-0.5 rounded border border-gray-200 font-mono">C</span> <span>compose</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ RIGHT PANEL ═══ */}
      {selectedThread && (
        <div className="w-[300px] border-l border-gray-200/80 bg-white shrink-0 flex flex-col">
          {selectedContact ? (
            <div className="p-5 flex-1 overflow-y-auto">
              <div className="text-center mb-5">
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-lg font-bold mx-auto mb-3 ring-4 ring-gray-100"
                  style={{ backgroundColor: avatarColor(`${selectedContact.first_name} ${selectedContact.last_name}`) }}>
                  {`${selectedContact.first_name[0]}${selectedContact.last_name[0]}`.toUpperCase()}
                </div>
                <p className="text-base font-bold text-[#1E3A5F]">{selectedContact.first_name} {selectedContact.last_name}</p>
                {selectedContact.source && (
                  <span className="bg-sky-50 text-[#0EA5E9] rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase mt-1.5 inline-block">{selectedContact.source}</span>
                )}
              </div>

              {/* Quick actions */}
              <div className="flex gap-2 mb-5">
                <Link href={`/dashboard/contacts/${selectedContact.id}`}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:border-[#0EA5E9] hover:text-[#0EA5E9] transition-colors">
                  <ExternalLink size={12} /> Profile
                </Link>
                <button onClick={() => { setShowLog(true); setLogContactId(selectedContact.id); setLogType("call"); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:border-emerald-400 hover:text-emerald-600 transition-colors">
                  <PhoneCall size={12} /> Call
                </button>
                <button onClick={() => { setComposeTo(selectedContact.email || ""); setShowCompose(true); }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:border-[#0EA5E9] hover:text-[#0EA5E9] transition-colors">
                  <Mail size={12} /> Email
                </button>
              </div>

              {/* Contact info */}
              <div className="space-y-3">
                {selectedContact.email && (
                  <div className="pb-3 border-b border-gray-100">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">Email</p>
                    <p className="text-sm text-gray-700">{selectedContact.email}</p>
                  </div>
                )}
                {selectedContact.phone && (
                  <div className="pb-3 border-b border-gray-100">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">Phone</p>
                    <p className="text-sm text-gray-700">{selectedContact.phone}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">Added</p>
                  <p className="text-sm text-gray-700">{new Date(selectedContact.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                </div>
              </div>

              {/* Recent activity */}
              {selectedThread.items.length > 1 && (
                <div className="mt-5">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Recent</p>
                  <div className="space-y-2">
                    {selectedThread.items.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex items-center gap-2 py-1.5">
                        <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ backgroundColor: getItemColors(item.type).bg }}>
                          {item.type === "call" ? <Phone size={10} style={{ color: getItemColors(item.type).color }} /> : <Mail size={10} style={{ color: getItemColors(item.type).color }} />}
                        </div>
                        <p className="text-xs text-gray-500 truncate flex-1">{item.subject || item.body}</p>
                        <span className="text-[10px] text-gray-300 shrink-0">{timeAgo(item.date)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-5 flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <User size={20} className="text-gray-300" />
              </div>
              <p className="text-sm text-gray-500 font-medium">{selectedThread.groupName}</p>
              <p className="text-xs text-gray-400 mt-1">Not in your contacts</p>
              <button onClick={() => {
                window.open(`/dashboard/contacts?new=true&email=${encodeURIComponent(selectedThread.items[0]?.from_address || "")}`, "_self");
              }}
                className="flex items-center gap-1.5 mt-3 px-4 py-2 rounded-lg bg-[#0EA5E9] text-white text-xs font-semibold hover:bg-[#0284C7] transition-colors">
                <UserPlus size={13} /> Add as Contact
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══ LOG MODAL ═══ */}
      {showLog && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-[#1E3A5F]">Log Communication</h3>
              <button onClick={() => setShowLog(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="flex gap-2">
                <button onClick={() => setLogType("call")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${logType === "call" ? "bg-[#0EA5E9] text-white" : "bg-gray-100 text-gray-600"}`}>
                  <Phone size={14} /> Call
                </button>
                <button onClick={() => setLogType("email")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${logType === "email" ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-600"}`}>
                  <Mail size={14} /> Email
                </button>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block mb-1.5">Contact</label>
                <select value={logContactId} onChange={(e) => setLogContactId(e.target.value)}
                  className="comm-input appearance-none">
                  <option value="">Select contact...</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block mb-1.5">Details</label>
                <textarea value={logBody} onChange={(e) => setLogBody(e.target.value)} placeholder={logType === "call" ? "Call notes..." : "Email summary..."} rows={3}
                  className="comm-input resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              <button onClick={() => logMutation.mutate()} disabled={!logContactId || !logBody || logMutation.isPending}
                className="w-full py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 bg-[#0EA5E9] hover:bg-[#0284C7] transition-colors">
                {logMutation.isPending ? "Saving..." : `Log ${logType === "call" ? "Call" : "Email"}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ COMPOSE MODAL ═══ */}
      {showCompose && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-[#1E3A5F]">New Email</h3>
              <button onClick={() => setShowCompose(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block mb-1.5">To</label>
                <ContactAutocomplete value={composeTo} onChange={setComposeTo} contacts={contactOptions} placeholder="recipient@email.com" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block mb-1.5">Cc</label>
                <ContactAutocomplete value={composeCc} onChange={setComposeCc} contacts={contactOptions} placeholder="cc@email.com (optional)" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block mb-1.5">Subject</label>
                <input value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} placeholder="Email subject" className="comm-input" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block mb-1.5">Message</label>
                <textarea value={composeBody} onChange={(e) => setComposeBody(e.target.value)} placeholder="Write your email..." rows={6} className="comm-input resize-none" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              <button onClick={() => composeMutation.mutate()} disabled={!composeTo || !composeSubject || !composeBody || composeMutation.isPending}
                className="w-full py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 bg-[#0EA5E9] hover:bg-[#0284C7] transition-colors">
                <Send size={14} /> {composeMutation.isPending ? "Sending..." : "Send Email"}
              </button>
              {composeMutation.isError && <p className="text-xs text-red-500 mt-2 text-center">Failed to send. Try again.</p>}
            </div>
          </div>
        </div>
      )}

      {/* ═══ FORWARD MODAL ═══ */}
      {showForward && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-[#1E3A5F]">Forward Email</h3>
                {forwardSubject && <p className="text-xs text-gray-400 truncate mt-0.5">{forwardSubject}</p>}
              </div>
              <button onClick={() => setShowForward(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block mb-1.5">To</label>
                <ContactAutocomplete value={forwardTo} onChange={setForwardTo} contacts={contactOptions} placeholder="Forward to..." />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block mb-1.5">Cc</label>
                <ContactAutocomplete value={forwardCc} onChange={setForwardCc} contacts={contactOptions} placeholder="cc@email.com (optional)" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest block mb-1.5">Note (optional)</label>
                <textarea value={forwardBody} onChange={(e) => setForwardBody(e.target.value)} placeholder="Add a note..." rows={3} className="comm-input resize-none" />
              </div>
              {/* Original message preview */}
              <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Original Message</p>
                <p className="text-xs text-gray-500"><span className="font-medium text-gray-600">From:</span> {forwardOriginal.from}</p>
                <p className="text-xs text-gray-500"><span className="font-medium text-gray-600">Date:</span> {forwardOriginal.date}</p>
                <p className="text-xs text-gray-400 mt-2 line-clamp-3">{forwardOriginal.snippet}</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              <button onClick={() => forwardMutation.mutate()} disabled={!forwardTo || forwardMutation.isPending}
                className="w-full py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 bg-[#0EA5E9] hover:bg-[#0284C7] transition-colors">
                <CornerUpRight size={14} /> {forwardMutation.isPending ? "Forwarding..." : "Forward Email"}
              </button>
              {forwardMutation.isError && <p className="text-xs text-red-500 mt-2 text-center">Failed to forward. Try again.</p>}
            </div>
          </div>
        </div>
      )}

      {/* Keyboard shortcut hints */}
      <div className="fixed bottom-4 right-4 flex items-center gap-2 text-[9px] text-gray-300 opacity-0 hover:opacity-100 transition-opacity z-10 pointer-events-none">
        <span className="px-1 py-0.5 rounded border border-gray-200 font-mono">J/K</span> navigate
        <span className="px-1 py-0.5 rounded border border-gray-200 font-mono">R</span> reply
        <span className="px-1 py-0.5 rounded border border-gray-200 font-mono">F</span> forward
        <span className="px-1 py-0.5 rounded border border-gray-200 font-mono">C</span> compose
      </div>
    </div>
  );
}
