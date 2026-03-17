"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listAllActivities, createActivity, createGeneralActivity } from "@/lib/api/activities";
import { listContacts } from "@/lib/api/contacts";
import { Phone, Mail, FileText, Home, CheckSquare, ChevronDown, Plus, X, User } from "lucide-react";

const typeColors: Record<string, { bg: string; color: string }> = {
  call: { bg: "#EFF6FF", color: "#0EA5E9" },
  email: { bg: "#F0FDF4", color: "#22C55E" },
  note: { bg: "#FFFBEB", color: "#F59E0B" },
  showing: { bg: "#EDE9FE", color: "#8B5CF6" },
  task: { bg: "#FEF3C7", color: "#F59E0B" },
};

const typeIcons: Record<string, React.ElementType> = {
  call: Phone,
  email: Mail,
  note: FileText,
  showing: Home,
  task: CheckSquare,
};

const tabs = ["All", "Calls", "Emails", "Notes", "Showings", "Tasks"];
const tabTypeMap: Record<string, string> = {
  Calls: "call",
  Emails: "email",
  Notes: "note",
  Showings: "showing",
  Tasks: "task",
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

const ACTIVITY_TYPES = [
  { value: "call" as const, label: "Call", icon: Phone, color: "#0EA5E9", bg: "#EFF6FF" },
  { value: "email" as const, label: "Email", icon: Mail, color: "#22C55E", bg: "#F0FDF4" },
  { value: "note" as const, label: "Note", icon: FileText, color: "#F59E0B", bg: "#FFFBEB" },
  { value: "showing" as const, label: "Showing", icon: Home, color: "#8B5CF6", bg: "#EDE9FE" },
  { value: "task" as const, label: "Task", icon: CheckSquare, color: "#F59E0B", bg: "#FEF3C7" },
];

export default function ActivitiesPage() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("All");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState<"call" | "email" | "note" | "showing" | "task">("call");
  const [newContactId, setNewContactId] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newPriority, setNewPriority] = useState<"high" | "medium" | "low">("medium");

  const typeFilter = tabTypeMap[activeTab];

  const { data, isLoading } = useQuery({
    queryKey: ["all-activities", typeFilter],
    queryFn: async () => {
      const token = await getToken();
      return listAllActivities(token!, typeFilter);
    },
  });

  const { data: contactsData } = useQuery({
    queryKey: ["contacts", { limit: 100 }],
    queryFn: async () => {
      const token = await getToken();
      return listContacts(token!, { limit: 100 });
    },
  });

  const contacts = contactsData?.contacts ?? [];

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (newType === "task") {
        return createGeneralActivity(token!, {
          type: "task",
          body: newBody || undefined,
          contact_id: newContactId || undefined,
          due_date: newDueDate || undefined,
          priority: newPriority,
        });
      }
      return createActivity(token!, newContactId, { type: newType, body: newBody || undefined });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-activities"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setShowAdd(false);
      setNewType("call");
      setNewContactId("");
      setNewBody("");
      setNewDueDate("");
      setNewPriority("medium");
    },
  });

  const activities = (data?.activities ?? []).filter((a) => {
    if (!search) return true;
    const name = a.contact_name ?? "";
    const body = a.body ?? "";
    return (
      name.toLowerCase().includes(search.toLowerCase()) ||
      body.toLowerCase().includes(search.toLowerCase())
    );
  });

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E3A5F" }}>Activities</h1>
          <p className="text-sm text-gray-500 mt-0.5">All logged interactions across your contacts</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold"
          style={{ backgroundColor: "#0EA5E9" }}
        >
          <Plus size={16} /> Log Activity
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl p-1 shadow-sm border border-gray-100 flex gap-1 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === tab ? "text-white" : "text-gray-500 hover:bg-gray-50"
            }`}
            style={activeTab === tab ? { backgroundColor: "#1E3A5F" } : {}}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-4">
        <div className="relative max-w-sm">
          <input
            type="text"
            placeholder="Search activities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-4 pr-4 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-[#0EA5E9]"
          />
        </div>
      </div>

      {/* Activity Feed */}
      <div className="flex flex-col gap-3">
        {isLoading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-pulse">
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-gray-100 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                  <div className="h-2 bg-gray-50 rounded w-2/3" />
                </div>
              </div>
            </div>
          ))
        ) : activities.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-sm font-semibold text-gray-700">No activities found</p>
            <p className="text-xs text-gray-400 mt-1">
              {data?.total === 0
                ? "Log your first activity from a contact's profile page."
                : "Try adjusting your filters."}
            </p>
          </div>
        ) : (
          activities.map((a) => {
            const colors = typeColors[a.type] || typeColors.note;
            const IconComp = typeIcons[a.type] || FileText;
            const isExpanded = expanded.has(a.id);
            return (
              <div
                key={a.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
              >
                <div className="flex items-start gap-4 p-4">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: colors.bg }}
                  >
                    <IconComp size={16} style={{ color: colors.color }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-bold text-gray-800">
                        {a.contact_name ?? "Unknown Contact"}
                      </span>
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full capitalize"
                        style={{ backgroundColor: colors.bg, color: colors.color }}
                      >
                        {a.type}
                      </span>
                    </div>
                    {a.body && (
                      <p className="text-xs text-gray-600 truncate">{a.body}</p>
                    )}
                    {isExpanded && a.body && (
                      <p className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3 mt-2 leading-relaxed">
                        {a.body}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-400">{timeAgo(a.created_at)}</span>
                    {a.body && (
                      <button
                        onClick={() => toggleExpand(a.id)}
                        className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                      >
                        <ChevronDown
                          size={13}
                          className={`text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Log Activity Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold" style={{ color: "#1E3A5F" }}>Log Activity</h2>
                <p className="text-xs text-gray-400 mt-0.5">Record a new interaction with a contact</p>
              </div>
              <button
                onClick={() => setShowAdd(false)}
                className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <X size={14} className="text-gray-500" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
              {/* Activity Type */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Activity Type</label>
                <div className="flex gap-2">
                  {ACTIVITY_TYPES.map((t) => {
                    const Icon = t.icon;
                    const selected = newType === t.value;
                    return (
                      <button
                        key={t.value}
                        onClick={() => setNewType(t.value)}
                        className="flex flex-col items-center gap-1.5 flex-1 py-3 rounded-xl border-2 transition-all"
                        style={{
                          borderColor: selected ? t.color : "#f3f4f6",
                          backgroundColor: selected ? t.bg : "white",
                        }}
                      >
                        <Icon size={18} style={{ color: selected ? t.color : "#9ca3af" }} />
                        <span className="text-xs font-semibold" style={{ color: selected ? t.color : "#6b7280" }}>
                          {t.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Contact */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                  Contact{newType === "task" && (
                    <span className="normal-case text-gray-400 font-normal"> (optional)</span>
                  )}
                </label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <select
                    value={newContactId}
                    onChange={(e) => setNewContactId(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-[#0EA5E9] appearance-none"
                  >
                    <option value="">{newType === "task" ? "No contact" : "Select a contact..."}</option>
                    {contacts.map((c: { id: string; first_name: string; last_name: string }) => (
                      <option key={c.id} value={c.id}>
                        {c.first_name} {c.last_name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Task-specific fields: Due Date + Priority */}
              {newType === "task" && (
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-[#0EA5E9]"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                      Priority
                    </label>
                    <div className="flex gap-1.5">
                      {(
                        [
                          { value: "high" as const, label: "High", color: "#EF4444", bg: "#FEF2F2" },
                          { value: "medium" as const, label: "Med", color: "#F59E0B", bg: "#FFFBEB" },
                          { value: "low" as const, label: "Low", color: "#22C55E", bg: "#F0FDF4" },
                        ] as const
                      ).map((p) => {
                        const selected = newPriority === p.value;
                        return (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => setNewPriority(p.value)}
                            className="flex items-center gap-1.5 flex-1 py-2 rounded-xl border-2 justify-center transition-all"
                            style={{
                              borderColor: selected ? p.color : "#f3f4f6",
                              backgroundColor: selected ? p.bg : "white",
                            }}
                          >
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                            <span className="text-xs font-semibold" style={{ color: selected ? p.color : "#6b7280" }}>
                              {p.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Notes / Body */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
                  {newType === "note" ? "Note" : newType === "task" ? "Task Description" : "Details"}
                </label>
                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder={
                    newType === "call" ? "Call summary, key points discussed..."
                    : newType === "email" ? "Email subject or summary..."
                    : newType === "note" ? "Write your note..."
                    : newType === "showing" ? "Property address, client feedback..."
                    : "Describe the task..."
                  }
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-[#0EA5E9] resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={(newType === "task" ? !newBody.trim() : !newContactId) || createMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-all"
                style={{ backgroundColor: "#0EA5E9" }}
              >
                {createMutation.isPending ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
                Log Activity
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
