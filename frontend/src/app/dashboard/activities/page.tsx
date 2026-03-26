"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listAllActivities, createActivity, createGeneralActivity } from "@/lib/api/activities";
import { listContacts } from "@/lib/api/contacts";
import { getGmailStatus, listEmails, type Email } from "@/lib/api/gmail";
import {
  Phone, Mail, FileText, Home, CheckSquare, ChevronDown, Plus, X, User, Search,
  Send, Inbox, Calendar, ArrowUpDown, ExternalLink, Users, Clock, TrendingUp
} from "lucide-react";
import Link from "next/link";

/* ── Constants ──────────────────────────────────────────────────────────── */

const typeConfig: Record<string, { bg: string; color: string; icon: React.ElementType; label: string }> = {
  call:      { bg: "#EFF6FF", color: "#2563EB", icon: Phone, label: "Call" },
  email:     { bg: "#ECFDF5", color: "#059669", icon: Mail, label: "Email" },
  note:      { bg: "#FFFBEB", color: "#D97706", icon: FileText, label: "Note" },
  showing:   { bg: "#F5F3FF", color: "#7C3AED", icon: Home, label: "Showing" },
  task:      { bg: "#FFF7ED", color: "#EA580C", icon: CheckSquare, label: "Task" },
  gmail_in:  { bg: "#FEF2F2", color: "#DC2626", icon: Inbox, label: "Received" },
  gmail_out: { bg: "#EFF6FF", color: "#0EA5E9", icon: Send, label: "Sent" },
};

const AVATAR_COLORS = ["#2563EB", "#7C3AED", "#0EA5E9", "#059669", "#D97706", "#DC2626", "#0891B2", "#4F46E5"];
function avatarColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

type FilterTab = "all" | "call" | "email" | "note" | "showing" | "task" | "gmail";
type DateRange = "today" | "week" | "month" | "all";

interface UnifiedItem {
  id: string;
  type: string;
  contact_id: string | null;
  contact_name: string;
  body: string;
  subject?: string;
  date: string;
  from_address?: string;
  to_addresses?: string[];
  is_outbound?: boolean;
  due_date?: string;
  priority?: string;
  completed_at?: string;
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

function formatFullDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function getDateGroup(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (itemDate.getTime() === today.getTime()) return "Today";
  if (itemDate.getTime() === yesterday.getTime()) return "Yesterday";
  if (now.getTime() - itemDate.getTime() < 7 * 24 * 60 * 60 * 1000) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: now.getFullYear() !== d.getFullYear() ? "numeric" : undefined });
}

function isThisWeek(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const start = new Date(now); start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  return d >= start;
}

function isToday(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isThisMonth(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

const ACTIVITY_TYPES = [
  { value: "call" as const, label: "Call", icon: Phone, color: "#2563EB", bg: "#EFF6FF" },
  { value: "email" as const, label: "Email", icon: Mail, color: "#059669", bg: "#ECFDF5" },
  { value: "note" as const, label: "Note", icon: FileText, color: "#D97706", bg: "#FFFBEB" },
  { value: "showing" as const, label: "Showing", icon: Home, color: "#7C3AED", bg: "#F5F3FF" },
  { value: "task" as const, label: "Task", icon: CheckSquare, color: "#EA580C", bg: "#FFF7ED" },
];

/* ── Main Page ──────────────────────────────────────────────────────────── */

export default function ActivitiesPage() {
  const searchParams = useSearchParams();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [contactFilter, setContactFilter] = useState("");
  const [contactFilterName, setContactFilterName] = useState("");
  const [contactSearchQuery, setContactSearchQuery] = useState("");
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [showDateDropdown, setShowDateDropdown] = useState(false);

  // Modal state
  const [showAdd, setShowAdd] = useState(searchParams.get("action") === "new");
  const [newType, setNewType] = useState<"call" | "email" | "note" | "showing" | "task">("call");
  const [newContactId, setNewContactId] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newPriority, setNewPriority] = useState<"high" | "medium" | "low">("medium");

  /* ── Queries ──────────────────────────────────────────────────────────── */

  const { data: activitiesData, isLoading, isError, refetch } = useQuery({
    queryKey: ["all-activities"],
    queryFn: async () => { const token = await getToken(); return listAllActivities(token!); },
    refetchInterval: 30000,
  });

  const { data: contactsData } = useQuery({
    queryKey: ["contacts-list"],
    queryFn: async () => { const token = await getToken(); return listContacts(token!, { limit: 200 }); },
  });

  const { data: gmailStatusData } = useQuery({
    queryKey: ["gmail-status"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { connected: false, gmail_address: null, last_synced_at: null };
      return getGmailStatus(token);
    },
  });
  const gmailConnected = gmailStatusData?.connected ?? false;

  const { data: emailsData } = useQuery({
    queryKey: ["gmail-emails"],
    queryFn: async () => { const token = await getToken(); if (!token) return { emails: [], total: 0 }; return listEmails(token, { limit: 100 }); },
    enabled: gmailConnected,
    refetchInterval: 60000,
  });

  const contacts = contactsData?.contacts ?? [];
  const contactMap = useMemo(() => Object.fromEntries(contacts.map((c) => [c.id, c])), [contacts]);

  /* ── Build unified items ──────────────────────────────────────────────── */

  const allItems = useMemo(() => {
    const items: UnifiedItem[] = [];

    // Activities
    for (const a of (activitiesData?.activities ?? [])) {
      const contact = a.contact_id ? contactMap[a.contact_id] : null;
      const name = a.contact_name || (contact ? `${contact.first_name} ${contact.last_name}` : "Unknown");
      items.push({
        id: a.id, type: a.type, contact_id: a.contact_id, contact_name: name,
        body: a.body || "", date: a.created_at,
        due_date: a.due_date ?? undefined, priority: a.priority ?? undefined, completed_at: a.completed_at ?? undefined,
      });
    }

    // Gmail emails
    for (const e of (emailsData?.emails ?? [])) {
      const isOut = e.is_outbound;
      const contact = e.contact_id ? contactMap[e.contact_id] : null;
      const otherName = isOut ? (e.to_addresses?.[0] ?? "Unknown") : (e.from_name || e.from_address || "Unknown");
      const name = contact ? `${contact.first_name} ${contact.last_name}` : (e.contact_name || otherName);
      items.push({
        id: `gmail-${e.id}`, type: isOut ? "gmail_out" : "gmail_in",
        contact_id: e.contact_id, contact_name: name,
        body: e.snippet || "", subject: e.subject || undefined,
        date: e.gmail_date || e.created_at,
        from_address: e.from_address ?? undefined, to_addresses: e.to_addresses,
        is_outbound: isOut,
      });
    }

    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activitiesData, emailsData, contactMap]);

  /* ── Filtering ────────────────────────────────────────────────────────── */

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      // Tab filter
      const isGmail = item.type === "gmail_in" || item.type === "gmail_out";
      if (activeTab === "all") {
        // "All" = manual activities + gmail emails that have contact_id set in DB
        if (isGmail && !item.contact_id) return false;
      }
      if (activeTab === "call" && item.type !== "call") return false;
      if (activeTab === "email" && item.type !== "email") return false;
      if (activeTab === "note" && item.type !== "note") return false;
      if (activeTab === "showing" && item.type !== "showing") return false;
      if (activeTab === "task" && item.type !== "task") return false;
      if (activeTab === "gmail" && !isGmail) return false;

      // Date range
      if (dateRange === "today" && !isToday(item.date)) return false;
      if (dateRange === "week" && !isThisWeek(item.date)) return false;
      if (dateRange === "month" && !isThisMonth(item.date)) return false;

      // Contact filter
      if (contactFilter && item.contact_id !== contactFilter) return false;

      // Search
      if (search) {
        const q = search.toLowerCase();
        if (!item.contact_name.toLowerCase().includes(q) && !item.body.toLowerCase().includes(q) && !(item.subject && item.subject.toLowerCase().includes(q))) return false;
      }

      return true;
    });
  }, [allItems, activeTab, dateRange, contactFilter, search]);

  // Group by date
  const groupedItems = useMemo(() => {
    const groups: { label: string; items: UnifiedItem[] }[] = [];
    let currentLabel = "";
    for (const item of filteredItems) {
      const label = getDateGroup(item.date);
      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, items: [] });
      }
      groups[groups.length - 1].items.push(item);
    }
    return groups;
  }, [filteredItems]);

  /* ── Stats ────────────────────────────────────────────────────────────── */

  const stats = useMemo(() => {
    // Only count contact-linked items (same logic as "All" tab)
    const contactItems = allItems.filter((i) => {
      const isGmail = i.type === "gmail_in" || i.type === "gmail_out";
      return !isGmail || !!i.contact_id;
    });
    const weekItems = contactItems.filter((i) => isThisWeek(i.date));
    const calls = weekItems.filter((i) => i.type === "call").length;
    const emailsSent = weekItems.filter((i) => i.type === "gmail_out" || i.type === "email").length;
    const tasksDueToday = contactItems.filter((i) => i.type === "task" && i.due_date && isToday(i.due_date) && !i.completed_at).length;
    return { total: weekItems.length, calls, emailsSent, tasksDueToday };
  }, [allItems]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, call: 0, email: 0, note: 0, showing: 0, task: 0, gmail: 0 };
    for (const item of allItems) {
      const isGmail = item.type === "gmail_in" || item.type === "gmail_out";
      // "All" count = manual activities + gmail with contact_id only
      if (!isGmail || item.contact_id) counts.all++;
      if (item.type === "gmail_in" || item.type === "gmail_out") counts.gmail++;
      else if (counts[item.type] !== undefined) counts[item.type]++;
    }
    return counts;
  }, [allItems]);

  /* ── Mutations ─────────────────────────────────────────────────────────── */

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (newType === "task") return createGeneralActivity(token!, { type: "task", body: newBody || undefined, contact_id: newContactId || undefined, due_date: newDueDate || undefined, priority: newPriority });
      return createActivity(token!, newContactId, { type: newType, body: newBody || undefined });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-activities"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setShowAdd(false); setNewType("call"); setNewContactId(""); setNewBody(""); setNewDueDate(""); setNewPriority("medium");
    },
  });

  /* ── Helpers ───────────────────────────────────────────────────────────── */

  const toggleExpand = (id: string) => {
    setExpanded((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const filteredContacts = useMemo(() => {
    if (!contactSearchQuery) return contacts.slice(0, 10);
    const q = contactSearchQuery.toLowerCase();
    return contacts.filter((c) => `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) || (c.email && c.email.toLowerCase().includes(q))).slice(0, 10);
  }, [contactSearchQuery, contacts]);

  /* ── Error state ──────────────────────────────────────────────────────── */

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 p-6 text-center">
        <p className="text-gray-600 font-medium">Failed to load activities</p>
        <button onClick={() => refetch()} className="px-4 py-2 rounded-xl text-white text-sm font-semibold bg-[#0EA5E9] hover:bg-[#0284C7] transition-colors">Try again</button>
      </div>
    );
  }

  const dateRangeLabels: Record<DateRange, string> = { today: "Today", week: "This Week", month: "This Month", all: "All Time" };
  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" }, { key: "call", label: "Calls" },
    { key: "note", label: "Notes" }, { key: "showing", label: "Showings" }, { key: "task", label: "Tasks" },
    ...(gmailConnected ? [{ key: "gmail" as FilterTab, label: "Gmail" }] : []),
  ];

  /* ── RENDER ───────────────────────────────────────────────────────────── */

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1E3A5F]">Activities</h1>
          <p className="text-sm text-gray-400 mt-0.5">Activity timeline for your contacts &amp; leads</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold bg-[#0EA5E9] hover:bg-[#0284C7] shadow-sm hover:shadow-md transition-all">
          <Plus size={16} /> Log Activity
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: "This Week", value: stats.total, icon: TrendingUp, color: "#0EA5E9" },
          { label: "Calls", value: stats.calls, icon: Phone, color: "#2563EB" },
          { label: "Emails Sent", value: stats.emailsSent, icon: Send, color: "#059669" },
          { label: "Tasks Due Today", value: stats.tasksDueToday, icon: Clock, color: "#EA580C" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl p-4 border border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${s.color}10` }}>
              <s.icon size={18} style={{ color: s.color }} />
            </div>
            <div>
              <p className="text-xl font-bold text-[#1E3A5F]">{s.value}</p>
              <p className="text-[11px] text-gray-400 font-medium">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100/80 rounded-lg p-0.5 mb-4">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === tab.key ? "bg-white text-[#1E3A5F] shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}>
            {tab.label}
            {tabCounts[tab.key] > 0 && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === tab.key ? "bg-[#0EA5E9] text-white" : "bg-gray-200 text-gray-500"
              }`}>{tabCounts[tab.key] > 99 ? "99+" : tabCounts[tab.key]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-2 mb-5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search activities, emails, contacts..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:border-[#0EA5E9] transition-all" />
        </div>

        {/* Date range */}
        <div className="relative">
          <button onClick={() => setShowDateDropdown(!showDateDropdown)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:border-gray-300 transition-colors">
            <Calendar size={13} /> {dateRangeLabels[dateRange]} <ChevronDown size={12} />
          </button>
          {showDateDropdown && (
            <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-40 py-1 w-36">
              {(["all", "today", "week", "month"] as DateRange[]).map((r) => (
                <button key={r} onClick={() => { setDateRange(r); setShowDateDropdown(false); }}
                  className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors ${dateRange === r ? "text-[#0EA5E9] bg-sky-50" : "text-gray-600 hover:bg-gray-50"}`}>
                  {dateRangeLabels[r]} {dateRange === r && "✓"}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Contact filter */}
        <div className="relative">
          {contactFilter ? (
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-50 border border-sky-200">
              <Users size={12} className="text-[#0EA5E9]" />
              <span className="text-xs font-medium text-[#0EA5E9] truncate max-w-[120px]">{contactFilterName}</span>
              <button onClick={() => { setContactFilter(""); setContactFilterName(""); }} className="text-[#0EA5E9] hover:text-sky-700"><X size={14} /></button>
            </div>
          ) : (
            <>
              <button onClick={() => setShowContactDropdown(!showContactDropdown)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-600 hover:border-gray-300 transition-colors">
                <Users size={13} /> Contact <ChevronDown size={12} />
              </button>
              {showContactDropdown && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-40 w-56">
                  <div className="p-2 border-b border-gray-100">
                    <input value={contactSearchQuery} onChange={(e) => setContactSearchQuery(e.target.value)} placeholder="Search contacts..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs outline-none focus:border-[#0EA5E9]" autoFocus />
                  </div>
                  <div className="max-h-40 overflow-y-auto py-1">
                    {filteredContacts.map((c) => (
                      <button key={c.id} onClick={() => { setContactFilter(c.id); setContactFilterName(`${c.first_name} ${c.last_name}`); setContactSearchQuery(""); setShowContactDropdown(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left transition-colors text-xs">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ backgroundColor: avatarColor(`${c.first_name} ${c.last_name}`) }}>
                          {`${c.first_name[0]}${c.last_name[0]}`.toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-700">{c.first_name} {c.last_name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Timeline Feed */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 animate-pulse">
              <div className="flex gap-3"><div className="w-10 h-10 bg-gray-100 rounded-full" /><div className="flex-1 space-y-2"><div className="h-3 bg-gray-100 rounded w-1/3" /><div className="h-2 bg-gray-50 rounded w-2/3" /></div></div>
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 text-center border border-gray-100">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Mail size={24} className="text-gray-300" />
          </div>
          <p className="text-sm font-semibold text-gray-600">No activities found</p>
          <p className="text-xs text-gray-400 mt-1">
            {allItems.length === 0 ? "Log your first activity to get started." : "Try adjusting your filters."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedItems.map((group) => (
            <div key={group.label}>
              {/* Date header */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{group.label}</span>
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-[10px] text-gray-300 font-medium">{group.items.length} item{group.items.length !== 1 ? "s" : ""}</span>
              </div>

              {/* Items */}
              <div className="space-y-2">
                {group.items.map((item) => {
                  const config = typeConfig[item.type] || typeConfig.note;
                  const IconComp = config.icon;
                  const isExpanded_ = expanded.has(item.id);
                  const isGmail = item.type === "gmail_in" || item.type === "gmail_out";
                  const isTask = item.type === "task";

                  return (
                    <div key={item.id} className="flex items-start gap-3 group">
                      {/* Timeline dot */}
                      <div className="flex flex-col items-center mt-1 shrink-0">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center ring-2 ring-white shadow-sm" style={{ backgroundColor: config.bg }}>
                          <IconComp size={15} style={{ color: config.color }} />
                        </div>
                      </div>

                      {/* Card */}
                      <div className={`flex-1 bg-white rounded-xl border border-gray-100 overflow-hidden transition-all duration-150 ${isExpanded_ ? "shadow-sm" : "hover:shadow-sm"}`}>
                        <div className="flex items-start gap-3 p-3.5 cursor-pointer" onClick={() => item.body && toggleExpand(item.id)}>
                          {/* Avatar */}
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5"
                            style={{ backgroundColor: avatarColor(item.contact_name) }}>
                            {item.contact_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              {item.contact_id ? (
                                <Link href={`/dashboard/contacts/${item.contact_id}`} onClick={(e) => e.stopPropagation()}
                                  className="text-sm font-semibold text-[#1E3A5F] hover:text-[#0EA5E9] transition-colors">{item.contact_name}</Link>
                              ) : (
                                <span className="text-sm font-semibold text-[#1E3A5F]">{item.contact_name}</span>
                              )}
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase" style={{ backgroundColor: config.bg, color: config.color }}>
                                {config.label}
                              </span>
                              {isTask && item.priority && (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                                  item.priority === "high" ? "bg-red-50 text-red-500" :
                                  item.priority === "medium" ? "bg-amber-50 text-amber-500" : "bg-green-50 text-green-500"
                                }`}>{item.priority}</span>
                              )}
                              {isTask && item.completed_at && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600">Done</span>
                              )}
                            </div>

                            {/* Subject for gmail */}
                            {isGmail && item.subject && (
                              <p className="text-sm font-medium text-gray-700 truncate">{item.subject}</p>
                            )}

                            {/* Body preview */}
                            {item.body && !isExpanded_ && (
                              <p className="text-xs text-gray-400 truncate mt-0.5">{item.body}</p>
                            )}

                            {/* Gmail from/to */}
                            {isGmail && (
                              <p className="text-[11px] text-gray-400 mt-0.5">
                                {item.is_outbound ? `To: ${item.to_addresses?.join(", ") || ""}` : `From: ${item.from_address || ""}`}
                              </p>
                            )}

                            {/* Task due date */}
                            {isTask && item.due_date && (
                              <p className={`text-[11px] mt-0.5 flex items-center gap-1 ${
                                !item.completed_at && new Date(item.due_date) < new Date() ? "text-red-500" : "text-gray-400"
                              }`}>
                                <Clock size={10} /> Due {new Date(item.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] text-gray-300 font-medium" title={formatFullDate(item.date)}>{timeAgo(item.date)}</span>
                            {item.body && (
                              <ChevronDown size={13} className={`text-gray-300 transition-transform ${isExpanded_ ? "rotate-180" : ""}`} />
                            )}
                          </div>
                        </div>

                        {/* Expanded body */}
                        {isExpanded_ && item.body && (
                          <div className="px-14 pb-3.5 -mt-1">
                            <p className="text-sm text-gray-600 leading-relaxed bg-gray-50/50 rounded-lg p-3">{item.body}</p>
                            {item.contact_id && (
                              <Link href={`/dashboard/contacts/${item.contact_id}`}
                                className="inline-flex items-center gap-1 mt-2 text-[11px] font-medium text-[#0EA5E9] hover:text-[#0284C7] transition-colors">
                                <ExternalLink size={11} /> View Contact
                              </Link>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ LOG ACTIVITY MODAL ═══ */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-[#1E3A5F]">Log Activity</h2>
                <p className="text-xs text-gray-400 mt-0.5">Record a new interaction</p>
              </div>
              <button onClick={() => setShowAdd(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"><X size={16} /></button>
            </div>

            <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
              {/* Activity Type */}
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2 block">Type</label>
                <div className="flex gap-2">
                  {ACTIVITY_TYPES.map((t) => {
                    const Icon = t.icon;
                    const selected = newType === t.value;
                    return (
                      <button key={t.value} onClick={() => setNewType(t.value)}
                        className="flex flex-col items-center gap-1.5 flex-1 py-3 rounded-xl border-2 transition-all"
                        style={{ borderColor: selected ? t.color : "#f3f4f6", backgroundColor: selected ? t.bg : "white" }}>
                        <Icon size={18} style={{ color: selected ? t.color : "#9ca3af" }} />
                        <span className="text-xs font-semibold" style={{ color: selected ? t.color : "#6b7280" }}>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Contact */}
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  Contact{newType === "task" && <span className="normal-case text-gray-300 font-normal"> (optional)</span>}
                </label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <select value={newContactId} onChange={(e) => setNewContactId(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-[#0EA5E9] appearance-none">
                    <option value="">{newType === "task" ? "No contact" : "Select a contact..."}</option>
                    {contacts.map((c: { id: string; first_name: string; last_name: string }) => (
                      <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Task fields */}
              {newType === "task" && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5 block">Due Date</label>
                    <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-[#0EA5E9]" />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5 block">Priority</label>
                    <div className="flex gap-1.5">
                      {([
                        { value: "high" as const, label: "High", color: "#EF4444", bg: "#FEF2F2" },
                        { value: "medium" as const, label: "Med", color: "#F59E0B", bg: "#FFFBEB" },
                        { value: "low" as const, label: "Low", color: "#22C55E", bg: "#F0FDF4" },
                      ] as const).map((p) => {
                        const selected = newPriority === p.value;
                        return (
                          <button key={p.value} type="button" onClick={() => setNewPriority(p.value)}
                            className="flex items-center gap-1.5 flex-1 py-2 rounded-xl border-2 justify-center transition-all"
                            style={{ borderColor: selected ? p.color : "#f3f4f6", backgroundColor: selected ? p.bg : "white" }}>
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                            <span className="text-xs font-semibold" style={{ color: selected ? p.color : "#6b7280" }}>{p.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Body */}
              <div>
                <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5 block">
                  {newType === "note" ? "Note" : newType === "task" ? "Description" : "Details"}
                </label>
                <textarea value={newBody} onChange={(e) => setNewBody(e.target.value)}
                  placeholder={
                    newType === "call" ? "Call summary, key points..." : newType === "email" ? "Email subject or summary..."
                    : newType === "note" ? "Write your note..." : newType === "showing" ? "Property address, client feedback..."
                    : "Describe the task..."
                  } rows={4}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-[#0EA5E9] resize-none" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50/50 border-t border-gray-100">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors">Cancel</button>
              <button onClick={() => createMutation.mutate()}
                disabled={(newType === "task" ? !newBody.trim() : !newContactId) || createMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50 bg-[#0EA5E9] hover:bg-[#0284C7] transition-all">
                {createMutation.isPending ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Plus size={14} />}
                Log Activity
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
