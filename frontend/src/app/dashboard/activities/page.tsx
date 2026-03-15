"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { listAllActivities } from "@/lib/api/activities";
import { Phone, Mail, FileText, Home, CheckSquare, ChevronDown, Plus } from "lucide-react";

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

export default function ActivitiesPage() {
  const { getToken } = useAuth();
  const [activeTab, setActiveTab] = useState("All");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const typeFilter = tabTypeMap[activeTab];

  const { data, isLoading } = useQuery({
    queryKey: ["all-activities", typeFilter],
    queryFn: async () => {
      const token = await getToken();
      return listAllActivities(token!, typeFilter);
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
    </div>
  );
}
