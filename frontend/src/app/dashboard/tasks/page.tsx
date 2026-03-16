"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createGeneralActivity, listAllActivities, Activity } from "@/lib/api/activities";
import { listContacts } from "@/lib/api/contacts";
import { Plus, Phone, Mail, Calendar, Users, AlertCircle, CheckCircle, Clock, X, User, ChevronDown } from "lucide-react";

type TaskType = "call" | "email" | "meeting" | "follow-up";
const typeConfig: Record<TaskType, { icon: React.ElementType; color: string; bg: string }> = {
  call: { icon: Phone, color: "#0EA5E9", bg: "#EFF6FF" },
  email: { icon: Mail, color: "#22C55E", bg: "#F0FDF4" },
  meeting: { icon: Calendar, color: "#8B5CF6", bg: "#EDE9FE" },
  "follow-up": { icon: Users, color: "#F59E0B", bg: "#FFFBEB" },
};
const groups = ["Overdue", "Today", "Tomorrow", "This Week"];
const filterTabs = ["All", "Today", "Overdue", "Upcoming", "Completed"];

function mapActivityType(type: Activity["type"]): TaskType {
  switch (type) {
    case "call": return "call";
    case "email": return "email";
    case "showing": return "meeting";
    case "task":
    case "note":
    default: return "follow-up";
  }
}

function getGroup(createdAt: string): string {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const startOfDayAfterTomorrow = new Date(startOfToday);
  startOfDayAfterTomorrow.setDate(startOfDayAfterTomorrow.getDate() + 2);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const date = new Date(createdAt);

  if (date < startOfToday) return "Overdue";
  if (date < startOfTomorrow) return "Today";
  if (date < startOfDayAfterTomorrow) return "Tomorrow";
  if (date < endOfWeek) return "This Week";
  return "This Week";
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface MappedTask {
  id: string;
  title: string;
  contactName: string;
  date: string;
  dateFormatted: string;
  type: TaskType;
  group: string;
}

export default function TasksPage() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("All");

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContactId, setNewContactId] = useState("");
  const [newPriority, setNewPriority] = useState<"high" | "medium" | "low">("medium");
  const [newDueDate, setNewDueDate] = useState("");

  const { data: activitiesData } = useQuery({
    queryKey: ["all-activities", "task"],
    queryFn: async () => {
      const token = await getToken();
      return listAllActivities(token!, "task");
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

  const tasks: MappedTask[] = useMemo(() => {
    const activities = activitiesData?.activities ?? [];
    return activities.map((a) => ({
      id: a.id,
      title: a.body || `Task for ${a.contact_name || "Unknown"}`,
      contactName: a.contact_name || "Unknown",
      date: a.created_at,
      dateFormatted: formatDate(a.created_at),
      type: mapActivityType(a.type),
      group: getGroup(a.created_at),
    }));
  }, [activitiesData]);

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const taskBody = [newTitle, newDueDate ? `Due: ${newDueDate}` : ""].filter(Boolean).join(" — ");
      return createGeneralActivity(token!, {
        type: "task",
        body: taskBody || undefined,
        contact_id: newContactId || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-activities"] });
      setShowAdd(false);
      setNewTitle("");
      setNewContactId("");
      setNewPriority("medium");
      setNewDueDate("");
    },
  });

  const toggleDone = (id: string) => {
    setDoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const totalToday = tasks.filter((t) => t.group === "Today" && !doneIds.has(t.id)).length;
  const totalOverdue = tasks.filter((t) => t.group === "Overdue" && !doneIds.has(t.id)).length;
  const totalUpcoming = tasks.filter((t) => ["Tomorrow", "This Week"].includes(t.group) && !doneIds.has(t.id)).length;
  const totalCompleted = tasks.filter((t) => doneIds.has(t.id)).length;

  const getFiltered = (group: string) => {
    return tasks.filter((t) => {
      const done = doneIds.has(t.id);
      if (filter === "Completed") return done && t.group === group;
      if (filter === "Today") return !done && t.group === "Today";
      if (filter === "Overdue") return !done && t.group === "Overdue";
      if (filter === "Upcoming") return !done && ["Tomorrow", "This Week"].includes(t.group);
      return t.group === group;
    });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E3A5F" }}>Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">Stay on top of follow-ups and action items</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: "#0EA5E9" }}>
          <Plus size={16} /> Add Task
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: "Today's Tasks", value: totalToday, icon: Clock, color: "#0EA5E9", bg: "#EFF6FF" },
          { label: "Overdue", value: totalOverdue, icon: AlertCircle, color: "#EF4444", bg: "#FEF2F2" },
          { label: "Due This Week", value: totalUpcoming, icon: Calendar, color: "#F59E0B", bg: "#FFFBEB" },
          { label: "Completed This Month", value: totalCompleted, icon: CheckCircle, color: "#22C55E", bg: "#F0FDF4" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: s.bg }}>
              <s.icon size={18} style={{ color: s.color }} />
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="bg-white rounded-2xl p-1 shadow-sm border border-gray-100 flex gap-1 mb-4">
        {filterTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${filter === tab ? "text-white" : "text-gray-500 hover:bg-gray-50"}`}
            style={filter === tab ? { backgroundColor: "#1E3A5F" } : {}}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Task groups */}
      <div className="flex flex-col gap-4">
        {groups.map((group) => {
          const groupTasks = getFiltered(group);
          if (groupTasks.length === 0) return null;
          return (
            <div key={group}>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: group === "Overdue" ? "#FEF2F2" : "#F3F4F6", color: group === "Overdue" ? "#EF4444" : "#6B7280" }}
                >
                  {group}
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {groupTasks.map((task, i) => {
                  const cfg = typeConfig[task.type] || typeConfig.call;
                  const done = doneIds.has(task.id);
                  return (
                    <div
                      key={task.id}
                      className={`flex items-center gap-4 px-4 py-3 transition-colors ${i !== groupTasks.length - 1 ? "border-b border-gray-50" : ""} ${done ? "bg-gray-50/50" : "hover:bg-blue-50/20"}`}
                    >
                      <button
                        onClick={() => toggleDone(task.id)}
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${done ? "border-green-400 bg-green-400" : "border-gray-300 hover:border-green-400"}`}
                      >
                        {done && <CheckCircle size={11} className="text-white" />}
                      </button>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: cfg.bg }}>
                        <cfg.icon size={13} style={{ color: cfg.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-semibold ${done ? "line-through text-gray-400" : "text-gray-800"}`}>{task.title}</span>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium shrink-0">{task.contactName}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${group === "Overdue" && !done ? "bg-red-50 text-red-500" : "bg-gray-100 text-gray-500"}`}>
                        {task.dateFormatted}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {filter === "Overdue" && tasks.filter((t) => t.group === "Overdue" && !doneIds.has(t.id)).length === 0 && (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={28} className="text-green-500" />
            </div>
            <p className="text-sm font-bold text-gray-700">No overdue tasks!</p>
            <p className="text-xs text-gray-400 mt-1">All caught up. Great work staying on top of follow-ups.</p>
          </div>
        )}
      </div>

      {/* Add Task Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold" style={{ color: "#1E3A5F" }}>Add Task</h2>
                <p className="text-xs text-gray-400 mt-0.5">Create a new follow-up or action item</p>
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
              {/* Task Title */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Task Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Follow up with client about showing feedback"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-[#0EA5E9]"
                />
              </div>

              {/* Due Date */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Due Date</label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-[#0EA5E9]"
                />
              </div>

              {/* Contact */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Contact <span className="normal-case text-gray-400 font-normal">(optional)</span></label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <select
                    value={newContactId}
                    onChange={(e) => setNewContactId(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-[#0EA5E9] appearance-none"
                  >
                    <option value="">Select a contact...</option>
                    {contacts.map((c: { id: string; first_name: string; last_name: string }) => (
                      <option key={c.id} value={c.id}>
                        {c.first_name} {c.last_name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Priority</label>
                <div className="flex gap-2">
                  {([
                    { value: "high" as const, label: "High", color: "#EF4444", bg: "#FEF2F2" },
                    { value: "medium" as const, label: "Medium", color: "#F59E0B", bg: "#FFFBEB" },
                    { value: "low" as const, label: "Low", color: "#22C55E", bg: "#F0FDF4" },
                  ]).map((p) => {
                    const selected = newPriority === p.value;
                    return (
                      <button
                        key={p.value}
                        onClick={() => setNewPriority(p.value)}
                        className="flex items-center gap-2 flex-1 py-2.5 rounded-xl border-2 justify-center transition-all"
                        style={{
                          borderColor: selected ? p.color : "#f3f4f6",
                          backgroundColor: selected ? p.bg : "white",
                        }}
                      >
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                        <span className="text-xs font-semibold" style={{ color: selected ? p.color : "#6b7280" }}>
                          {p.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
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
                onClick={() => createTaskMutation.mutate()}
                disabled={!newTitle.trim() || createTaskMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-all"
                style={{ backgroundColor: "#0EA5E9" }}
              >
                {createTaskMutation.isPending ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
                Add Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
