"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listAllActivities, createActivity, type Activity } from "@/lib/api/activities";
import { listContacts } from "@/lib/api/contacts";
import { Phone, Mail, Search, Plus, X, User, ChevronDown } from "lucide-react";

const typeColors: Record<string, { bg: string; color: string }> = {
  call: { bg: "#EFF6FF", color: "#0EA5E9" },
  email: { bg: "#F0FDF4", color: "#22C55E" },
};

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

  const [filter, setFilter] = useState<"all" | "call" | "email">("all");
  const [search, setSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [logType, setLogType] = useState<"call" | "email">("call");
  const [logContactId, setLogContactId] = useState("");
  const [logBody, setLogBody] = useState("");

  // Fetch all call/email activities
  const { data: activitiesData } = useQuery({
    queryKey: ["comm-activities"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return { activities: [], total: 0 };
      return listAllActivities(token, undefined, 100);
    },
    refetchInterval: 30000,
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

  // Filter to calls/emails only
  const commActivities = useMemo(() => {
    const all = activitiesData?.activities ?? [];
    return all
      .filter((a) => a.type === "call" || a.type === "email")
      .filter((a) => filter === "all" || a.type === filter);
  }, [activitiesData, filter]);

  // Group by contact
  const contactThreads = useMemo(() => {
    const groups: Record<string, Activity[]> = {};
    for (const a of commActivities) {
      const key = a.contact_id || "unknown";
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    }
    // Sort by most recent activity
    return Object.entries(groups)
      .map(([contactId, activities]) => ({
        contactId,
        contactName: activities[0]?.contact_name || contactMap[contactId]
          ? `${contactMap[contactId]?.first_name} ${contactMap[contactId]?.last_name}`
          : "Unknown",
        activities: activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        lastActivity: activities[0]?.created_at ?? "",
      }))
      .filter((t) => !search || t.contactName.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
  }, [commActivities, contactMap, search]);

  const selectedThread = contactThreads.find((t) => t.contactId === selectedContactId);
  const selectedContact = selectedContactId ? contactMap[selectedContactId] : null;

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

  return (
    <div className="flex h-full">
      {/* Left sidebar — contact threads */}
      <div className="w-80 border-r border-gray-100 bg-white flex flex-col shrink-0">
        {/* Header */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold" style={{ color: "#1E3A5F" }}>Communication</h2>
            <button
              onClick={() => setShowLog(true)}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#0EA5E9]/10 text-[#0EA5E9] hover:bg-[#0EA5E9]/20 transition-colors"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1">
            {(["all", "call", "email"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filter === f
                    ? "bg-[#0EA5E9]/10 text-[#0EA5E9]"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                {f === "all" ? "All" : f === "call" ? "Calls" : "Emails"}
              </button>
            ))}
          </div>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto">
          {contactThreads.length === 0 ? (
            <div className="p-8 text-center">
              <Phone size={24} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">No communications yet</p>
              <p className="text-xs text-gray-300 mt-1">Log a call or email to get started</p>
            </div>
          ) : (
            contactThreads.map((thread) => {
              const isSelected = thread.contactId === selectedContactId;
              const lastAct = thread.activities[0];
              const initials = thread.contactName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);
              return (
                <button
                  key={thread.contactId}
                  onClick={() => setSelectedContactId(thread.contactId)}
                  className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors border-b border-gray-50 ${
                    isSelected ? "bg-blue-50" : "hover:bg-gray-50"
                  }`}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5"
                    style={{ backgroundColor: "#1E3A5F" }}
                  >
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-800 truncate">{thread.contactName}</p>
                      <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(thread.lastActivity)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {lastAct?.type === "call" ? (
                        <Phone size={11} className="text-[#0EA5E9] shrink-0" />
                      ) : (
                        <Mail size={11} className="text-[#22C55E] shrink-0" />
                      )}
                      <p className="text-xs text-gray-500 truncate">{lastAct?.body || "No details"}</p>
                    </div>
                    <span className="text-[10px] text-gray-300">{thread.activities.length} message{thread.activities.length !== 1 ? "s" : ""}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Center — timeline */}
      <div className="flex-1 flex flex-col bg-gray-50 min-w-0">
        {selectedThread ? (
          <>
            <div className="px-6 py-4 bg-white border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-800">{selectedThread.contactName}</h3>
                <p className="text-xs text-gray-400">{selectedThread.activities.length} communication{selectedThread.activities.length !== 1 ? "s" : ""}</p>
              </div>
              <button
                onClick={() => {
                  setShowLog(true);
                  setLogContactId(selectedThread.contactId);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0EA5E9]/10 text-[#0EA5E9] hover:bg-[#0EA5E9]/20 transition-colors"
              >
                <Plus size={14} />
                Log
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto flex flex-col gap-4">
                {selectedThread.activities.map((a) => {
                  const colors = typeColors[a.type] || { bg: "#F3F4F6", color: "#6B7280" };
                  const Icon = a.type === "call" ? Phone : Mail;
                  return (
                    <div key={a.id} className="flex gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                        style={{ backgroundColor: colors.bg }}
                      >
                        <Icon size={14} style={{ color: colors.color }} />
                      </div>
                      <div className="flex-1 bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: colors.bg, color: colors.color }}
                          >
                            {a.type === "call" ? "Call" : "Email"}
                          </span>
                          <span className="text-[10px] text-gray-400">{formatDate(a.created_at)}</span>
                        </div>
                        <p className="text-sm text-gray-700 mt-2 leading-relaxed">{a.body || "No details"}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Phone size={40} className="mx-auto text-gray-200 mb-3" />
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
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold mx-auto mb-3"
              style={{ backgroundColor: "#1E3A5F" }}
            >
              {`${selectedContact.first_name[0]}${selectedContact.last_name[0]}`.toUpperCase()}
            </div>
            <p className="text-sm font-bold text-gray-800">{selectedContact.first_name} {selectedContact.last_name}</p>
            {selectedContact.source && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 mt-1 inline-block">
                {selectedContact.source}
              </span>
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
              <button onClick={() => setShowLog(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {/* Type toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setLogType("call")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  logType === "call" ? "bg-[#0EA5E9]/10 text-[#0EA5E9] border border-[#0EA5E9]/30" : "bg-gray-50 text-gray-400 border border-gray-200"
                }`}
              >
                <Phone size={14} /> Call
              </button>
              <button
                onClick={() => setLogType("email")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  logType === "email" ? "bg-[#22C55E]/10 text-[#22C55E] border border-[#22C55E]/30" : "bg-gray-50 text-gray-400 border border-gray-200"
                }`}
              >
                <Mail size={14} /> Email
              </button>
            </div>

            {/* Contact picker */}
            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-500 block mb-1">Contact</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <select
                  value={logContactId}
                  onChange={(e) => setLogContactId(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 appearance-none"
                >
                  <option value="">Select contact…</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Body */}
            <div className="mb-5">
              <label className="text-xs font-semibold text-gray-500 block mb-1">Details</label>
              <textarea
                value={logBody}
                onChange={(e) => setLogBody(e.target.value)}
                placeholder={logType === "call" ? "Call notes…" : "Email summary…"}
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 resize-none"
              />
            </div>

            <button
              onClick={() => logMutation.mutate()}
              disabled={!logContactId || !logBody || logMutation.isPending}
              className="w-full py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: "#0EA5E9" }}
            >
              {logMutation.isPending ? "Saving…" : `Log ${logType === "call" ? "Call" : "Email"}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
