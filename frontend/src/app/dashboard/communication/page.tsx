"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listAllActivities, createActivity, type Activity } from "@/lib/api/activities";
import { listContacts } from "@/lib/api/contacts";
import { getGmailStatus, syncGmail, listEmails, getEmail, sendEmail, type Email } from "@/lib/api/gmail";
import { Phone, Mail, Search, Plus, X, User, ChevronDown, ChevronUp, RefreshCw, Send, Reply } from "lucide-react";

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

  // Compose state
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");

  // CC fields
  const [replyCc, setReplyCc] = useState("");
  const [composeCc, setComposeCc] = useState("");

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

  const { data: activitiesData } = useQuery({
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
      .filter((t) => !search || t.groupName.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
  }, [filteredItems, search]);

  const selectedThread = threads.find((t) => t.groupKey === selectedGroupKey);
  const selectedContact = selectedThread?.contactId ? contactMap[selectedThread.contactId] : null;
  const currentItem = selectedThread?.items[currentIndex] ?? null;
  const totalItems = selectedThread?.items.length ?? 0;

  // Load full email body when currentItem changes
  useEffect(() => {
    setShowReply(false);
    setReplyBody("");
    setReplyCc("");

    if (!currentItem?.email_data) return;
    const emailId = currentItem.email_data.id;
    if (emailCacheRef.current[emailId]) return; // already cached

    let cancelled = false;
    setLoadingEmail(true);
    (async () => {
      try {
        const token = await getToken();
        if (token && !cancelled) {
          const full = await getEmail(token, emailId);
          if (!cancelled) {
            emailCacheRef.current[emailId] = full;
            setCacheVersion((v) => v + 1);
          }
        }
      } catch { /* ignore */ }
      if (!cancelled) setLoadingEmail(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem?.id]);

  function selectThread(groupKey: string) {
    setSelectedGroupKey(groupKey);
    setCurrentIndex(0);
    setShowReply(false);
    setReplyBody("");
  }

  function goUp() {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }

  function goDown() {
    if (currentIndex < totalItems - 1) setCurrentIndex((i) => i + 1);
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

  // Get the cached full body for current item
  void cacheVersion; // used to trigger re-render
  const fullBody = currentItem?.email_data ? emailCacheRef.current[currentItem.email_data.id] : null;
  const isGmail = currentItem?.type === "gmail_in" || currentItem?.type === "gmail_out";

  return (
    <div className="flex h-full">
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
            {(["all", "call", "email", ...(gmailConnected ? ["gmail" as const] : [])] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f as typeof filter)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter === f ? "bg-[#0EA5E9]/10 text-[#0EA5E9]" : "text-gray-400 hover:text-gray-600"}`}>
                {f === "all" ? "All" : f === "call" ? "Calls" : f === "email" ? "Manual" : "Gmail"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 ? (
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
              const initials = isEmailGroup
                ? (thread.groupName[0] ?? "?").toUpperCase()
                : thread.groupName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
              const colors = getItemColors(lastItem.type);
              const Icon = lastItem.type === "call" ? Phone : Mail;
              return (
                <button key={thread.groupKey} onClick={() => selectThread(thread.groupKey)}
                  className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors border-b border-gray-50 ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5"
                    style={{ backgroundColor: isEmailGroup ? "#6B7280" : "#1E3A5F" }}>
                    {initials || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-800 truncate">{thread.groupName}</p>
                      <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(thread.lastDate)}</span>
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
                <h3 className="text-sm font-bold text-gray-800 truncate">{selectedThread.groupName}</h3>
                <p className="text-xs text-gray-400">{currentIndex + 1} of {totalItems}</p>
              </div>
              <div className="flex items-center gap-1">
                {/* Nav arrows */}
                <button onClick={goUp} disabled={currentIndex === 0}
                  className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-default"
                  title="Newer">
                  <ChevronUp size={16} className="text-gray-500" />
                </button>
                <button onClick={goDown} disabled={currentIndex >= totalItems - 1}
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

            {/* Email / item content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                  {/* Item header */}
                  <div className="px-6 pt-5 pb-4 border-b border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: getItemColors(currentItem.type).bg, color: getItemColors(currentItem.type).color }}>
                        {getItemLabel(currentItem.type)}
                      </span>
                      <span className="text-xs text-gray-400">{formatDate(currentItem.date)}</span>
                    </div>
                    {currentItem.subject && (
                      <h4 className="text-base font-semibold text-gray-800 mt-1">{currentItem.subject}</h4>
                    )}
                    {isGmail && (
                      <p className="text-xs text-gray-400 mt-1">
                        {currentItem.type === "gmail_out"
                          ? `To: ${currentItem.to_addresses?.join(", ")}`
                          : `From: ${currentItem.from_name || ""} ${currentItem.from_address ? `<${currentItem.from_address}>` : ""}`}
                      </p>
                    )}
                  </div>

                  {/* Body */}
                  <div className="px-6 py-5">
                    {isGmail && loadingEmail && !fullBody ? (
                      <p className="text-sm text-gray-400">Loading...</p>
                    ) : isGmail && fullBody?.body_html ? (
                      <div className="text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: fullBody.body_html }} />
                    ) : isGmail && fullBody?.body_text ? (
                      <pre className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-sans">
                        {fullBody.body_text}
                      </pre>
                    ) : (
                      <p className="text-sm text-gray-700 leading-relaxed">{currentItem.body}</p>
                    )}
                  </div>
                </div>

                {/* Inline reply for gmail items */}
                {isGmail && (
                  <div className="mt-4">
                    {showReply ? (
                      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                        <p className="text-xs text-gray-400 mb-2">
                          Replying to {currentItem.type === "gmail_out"
                            ? currentItem.to_addresses?.[0]
                            : (currentItem.from_name || currentItem.from_address)}
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
