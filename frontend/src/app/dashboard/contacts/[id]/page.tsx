"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getContact } from "@/lib/api/contacts";
import { listActivities, createActivity } from "@/lib/api/activities";
import { listDeals } from "@/lib/api/deals";
import {
  Phone,
  Mail,
  MessageSquare,
  FileText,
  ChevronLeft,
  Home,
  ChevronDown,
  ChevronRight,
  Send,
} from "lucide-react";

const typeIconColors: Record<string, { bg: string; color: string }> = {
  call: { bg: "#EFF6FF", color: "#0EA5E9" },
  email: { bg: "#F0FDF4", color: "#22C55E" },
  note: { bg: "#FFFBEB", color: "#F59E0B" },
  showing: { bg: "#EDE9FE", color: "#8B5CF6" },
  task: { bg: "#EFF6FF", color: "#0EA5E9" },
};

const typeIcons: Record<string, React.ElementType> = {
  call: Phone,
  email: Mail,
  note: FileText,
  showing: Home,
  task: FileText,
};

const stageColors: Record<string, string> = {
  Lead: "#6B7280",
  Contacted: "#0EA5E9",
  Touring: "#8B5CF6",
  Offer: "#F59E0B",
  "Under Contract": "#22C55E",
  Closed: "#1E3A5F",
  Lost: "#EF4444",
};

function getAvatarColor(id: string) {
  const colors = ["#0EA5E9", "#22C55E", "#F59E0B", "#8B5CF6", "#EF4444", "#1E3A5F"];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function timeStr(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const tabOptions = ["All Activity", "Calls", "Emails", "Notes", "Showings"];
const tabTypeMap: Record<string, string> = {
  Calls: "call",
  Emails: "email",
  Notes: "note",
  Showings: "showing",
};

export default function ContactDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("All Activity");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState<"call" | "email" | "note" | "showing" | "task">("note");

  const { data: contact, isLoading: contactLoading } = useQuery({
    queryKey: ["contact", id],
    queryFn: async () => {
      const token = await getToken();
      return getContact(token!, id);
    },
  });

  const typeFilter = tabTypeMap[activeTab];
  const { data: activitiesData } = useQuery({
    queryKey: ["activities", id, typeFilter],
    queryFn: async () => {
      const token = await getToken();
      return listActivities(token!, id, typeFilter);
    },
  });

  const { data: dealsData } = useQuery({
    queryKey: ["deals", { contact_id: id }],
    queryFn: async () => {
      const token = await getToken();
      return listDeals(token!, { contact_id: id });
    },
  });

  const logMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return createActivity(token!, id, { type: noteType, body: note });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
      setNote("");
    },
  });

  const toggleExpand = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const activities = activitiesData?.activities ?? [];
  const deals = dealsData?.deals ?? [];

  if (contactLoading) {
    return (
      <div className="p-6 animate-pulse">
        <div className="h-6 w-32 bg-gray-100 rounded mb-6" />
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-4 space-y-4">
            <div className="h-64 bg-gray-100 rounded-2xl" />
            <div className="h-48 bg-gray-100 rounded-2xl" />
          </div>
          <div className="col-span-8 h-96 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Contact not found.</p>
      </div>
    );
  }

  const avatarColor = getAvatarColor(contact.id);
  const initials = `${contact.first_name[0] ?? ""}${contact.last_name[0] ?? ""}`.toUpperCase();

  return (
    <div className="p-6">
      <button
        onClick={() => router.push("/dashboard/contacts")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
      >
        <ChevronLeft size={16} /> Back to Contacts
      </button>

      <div className="grid grid-cols-12 gap-5">
        {/* LEFT COLUMN */}
        <div className="col-span-4 flex flex-col gap-4">
          {/* Profile card */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex flex-col items-center text-center gap-3 pb-5 border-b border-gray-100">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold"
                style={{ backgroundColor: avatarColor }}
              >
                {initials}
              </div>
              <div>
                <h2 className="text-xl font-bold" style={{ color: "#1E3A5F" }}>
                  {contact.first_name} {contact.last_name}
                </h2>
                {contact.source && (
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full mt-1 inline-block"
                    style={{ backgroundColor: "#EFF6FF", color: "#0EA5E9" }}
                  >
                    {contact.source}
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 pt-4">
              {[
                { icon: Phone, label: "Call", color: "#0EA5E9" },
                { icon: Mail, label: "Email", color: "#22C55E" },
                { icon: MessageSquare, label: "Message", color: "#8B5CF6" },
                { icon: FileText, label: "Log", color: "#F59E0B" },
              ].map((action) => (
                <button
                  key={action.label}
                  className="flex flex-col items-center gap-1 p-2 rounded-xl transition-colors hover:bg-gray-50"
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${action.color}18` }}
                  >
                    <action.icon size={16} style={{ color: action.color }} />
                  </div>
                  <span className="text-xs text-gray-500">{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Contact Info */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h4 className="font-bold mb-3" style={{ color: "#1E3A5F" }}>Contact Info</h4>
            <div className="flex flex-col gap-2.5 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <Phone size={13} className="text-gray-400" />
                {contact.phone ?? "No phone"}
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <Mail size={13} className="text-gray-400" />
                {contact.email ?? "No email"}
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-gray-400 text-xs">Source:</span>
                {contact.source ?? "Unknown"}
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-gray-400 text-xs">Added:</span>
                {new Date(contact.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* Linked Deals */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h4 className="font-bold mb-3" style={{ color: "#1E3A5F" }}>Linked Deals</h4>
            {deals.length === 0 ? (
              <p className="text-xs text-gray-400">No deals linked to this contact.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {deals.map((deal) => (
                  <div
                    key={deal.id}
                    onClick={() => router.push(`/dashboard/pipeline`)}
                    className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-blue-50/50 cursor-pointer transition-colors"
                  >
                    <div>
                      <p className="text-xs font-semibold text-gray-800">{deal.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {deal.value ? `$${deal.value.toLocaleString()}` : "No value"}
                      </p>
                    </div>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: stageColors[deal.stage_name] ?? "#6B7280" }}
                    >
                      {deal.stage_name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN — Activity Timeline */}
        <div className="col-span-8 flex flex-col gap-4">
          {/* Tabs */}
          <div className="bg-white rounded-2xl p-1 shadow-sm border border-gray-100 flex gap-1">
            {tabOptions.map((tab) => (
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

          {/* Log activity */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex gap-2 mb-2">
              {(["note", "call", "email", "showing", "task"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setNoteType(t)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                    noteType === t ? "text-white" : "bg-gray-100 text-gray-500"
                  }`}
                  style={noteType === t ? { backgroundColor: "#0EA5E9" } : {}}
                >
                  {t}
                </button>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={`Log a ${noteType} for ${contact.first_name}...`}
              className="w-full text-sm text-gray-700 placeholder-gray-400 outline-none resize-none bg-transparent"
              rows={2}
            />
            <div className="flex justify-end mt-2">
              <button
                disabled={!note.trim() || logMutation.isPending}
                onClick={() => logMutation.mutate()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-xs font-semibold disabled:opacity-50"
                style={{ backgroundColor: "#0EA5E9" }}
              >
                <Send size={12} />
                {logMutation.isPending ? "Logging..." : "Log Activity"}
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h4 className="font-bold mb-5" style={{ color: "#1E3A5F" }}>Activity Timeline</h4>
            {activities.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No activities yet — log one above!</p>
            ) : (
              <div className="flex flex-col gap-4">
                {activities.map((item, i) => {
                  const colors = typeIconColors[item.type] || typeIconColors.note;
                  const IconComp = typeIcons[item.type] || FileText;
                  const isExpanded = expandedItems.has(item.id);
                  return (
                    <div key={item.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                          style={{ backgroundColor: colors.bg }}
                        >
                          <IconComp size={15} style={{ color: colors.color }} />
                        </div>
                        {i < activities.length - 1 && (
                          <div className="w-px flex-1 mt-2 bg-gray-200" style={{ minHeight: 16 }} />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs text-gray-400">{timeStr(item.created_at)}</span>
                              <span
                                className="text-xs font-semibold px-2 py-0.5 rounded-full capitalize"
                                style={{ backgroundColor: colors.bg, color: colors.color }}
                              >
                                {item.type}
                              </span>
                            </div>
                            <p className="text-sm text-gray-800">{item.body ?? `${item.type} logged`}</p>
                            {isExpanded && item.body && (
                              <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-xl p-3 leading-relaxed">
                                {item.body}
                              </p>
                            )}
                          </div>
                          {item.body && (
                            <button
                              onClick={() => toggleExpand(item.id)}
                              className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 hover:bg-gray-200 transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronDown size={12} className="text-gray-400" />
                              ) : (
                                <ChevronRight size={12} className="text-gray-400" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
