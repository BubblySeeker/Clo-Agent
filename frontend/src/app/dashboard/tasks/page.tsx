"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listTasks,
  createGeneralActivity,
  updateActivity,
  Activity,
} from "@/lib/api/activities";
import { listContacts } from "@/lib/api/contacts";
import { listProperties } from "@/lib/api/properties";
import Link from "next/link";
import {
  Plus,
  Building2,
  AlertCircle,
  CheckCircle,
  Clock,
  Calendar,
  X,
  User,
  ChevronDown,
  Sparkles,
  Check,
} from "lucide-react";

type StatusFilter = "all" | "today" | "overdue" | "upcoming" | "completed";

const filterTabs: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Today", value: "today" },
  { label: "Overdue", value: "overdue" },
  { label: "Upcoming", value: "upcoming" },
  { label: "Completed", value: "completed" },
];

const priorityColors: Record<string, string> = {
  high: "#EF4444",
  medium: "#F59E0B",
  low: "#22C55E",
};

function getTaskGroup(dueDate: string | null, completedAt: string | null): string {
  if (completedAt) return "Completed";
  if (!dueDate) return "No Due Date";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const due = new Date(dueDate + "T00:00:00");

  if (due < today) return "Overdue";
  if (due.getTime() === today.getTime()) return "Today";
  if (due.getTime() === tomorrow.getTime()) return "Tomorrow";
  if (due < endOfWeek) return "This Week";
  return "Later";
}

function formatDueLabel(dueDate: string | null): string {
  if (!dueDate) return "No date";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const due = new Date(dueDate + "T00:00:00");

  if (due < today) return "Overdue";
  if (due.getTime() === today.getTime()) return "Today";
  if (due.getTime() === tomorrow.getTime()) return "Tomorrow";
  return due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dueBadgeClasses(dueDate: string | null, completedAt: string | null): string {
  if (completedAt) return "bg-gray-100 text-gray-400";
  if (!dueDate) return "bg-gray-100 text-gray-500";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + "T00:00:00");
  if (due < today) return "bg-red-50 text-red-600";
  if (due.getTime() === today.getTime()) return "bg-blue-50 text-blue-600";
  return "bg-gray-100 text-gray-500";
}

const groupOrder = ["Overdue", "Today", "Tomorrow", "This Week", "Later", "No Due Date", "Completed"];

export default function TasksPage() {
  const searchParams = useSearchParams();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>("all");

  const [showAdd, setShowAdd] = useState(searchParams.get("action") === "new");
  const [showDetails, setShowDetails] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContactId, setNewContactId] = useState("");
  const [newPropertyId, setNewPropertyId] = useState("");
  const [newPriority, setNewPriority] = useState<"high" | "medium" | "low">("medium");
  const [newDueDate, setNewDueDate] = useState("");

  const { data: tasksData, isError: tasksError, refetch: refetchTasks } = useQuery({
    queryKey: ["tasks", filter],
    queryFn: async () => {
      const token = await getToken();
      return listTasks(token!, filter === "all" ? {} : { status: filter });
    },
  });

  const { data: contactsData } = useQuery({
    queryKey: ["contacts", { limit: 100 }],
    queryFn: async () => {
      const token = await getToken();
      return listContacts(token!, { limit: 100 });
    },
  });

  const { data: propertiesData } = useQuery({
    queryKey: ["properties-list"],
    queryFn: async () => {
      const token = await getToken();
      return listProperties(token!, { limit: 100 });
    },
  });

  const contacts = contactsData?.contacts ?? [];
  const properties = propertiesData?.properties ?? [];
  const tasks = tasksData?.tasks ?? [];

  // Stat counts — derived from "all" tasks (fetch separately if filtered)
  const { data: allTasksData } = useQuery({
    queryKey: ["tasks", "all"],
    queryFn: async () => {
      const token = await getToken();
      return listTasks(token!, { limit: 200 });
    },
  });

  const allTasks = allTasksData?.tasks ?? [];

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    let todayCount = 0;
    let overdueCount = 0;
    let thisWeekCount = 0;
    let completedCount = 0;

    for (const t of allTasks) {
      if (t.completed_at) {
        completedCount++;
        continue;
      }
      if (!t.due_date) continue;
      const due = new Date(t.due_date + "T00:00:00");
      if (due < today) overdueCount++;
      else if (due.getTime() === today.getTime()) todayCount++;
      if (due >= today && due < weekEnd) thisWeekCount++;
    }

    return { todayCount, overdueCount, thisWeekCount, completedCount };
  }, [allTasks]);

  const grouped = useMemo(() => {
    const groups: Record<string, Activity[]> = {};
    for (const t of tasks) {
      const g = getTaskGroup(t.due_date, t.completed_at);
      if (!groups[g]) groups[g] = [];
      groups[g].push(t);
    }
    return groups;
  }, [tasks]);

  const toggleCompleteMutation = useMutation({
    mutationFn: async (task: Activity) => {
      const token = await getToken();
      return updateActivity(token!, task.id, {
        completed_at: task.completed_at ? "" : "now",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return createGeneralActivity(token!, {
        type: "task",
        body: newTitle,
        contact_id: newContactId || undefined,
        property_id: newPropertyId || undefined,
        due_date: newDueDate || undefined,
        priority: newPriority,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setShowAdd(false);
      setShowDetails(false);
      setNewTitle("");
      setNewContactId("");
      setNewPropertyId("");
      setNewPriority("medium");
      setNewDueDate("");
    },
  });

  if (tasksError) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 p-6 text-center">
        <p className="text-gray-600 font-medium">Failed to load tasks</p>
        <button onClick={() => refetchTasks()} className="px-4 py-2 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: "#0EA5E9" }}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E3A5F" }}>
            Tasks
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Stay on top of follow-ups and action items
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold"
          style={{ backgroundColor: "#0EA5E9" }}
        >
          <Plus size={16} /> Add Task
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: "Today's Tasks", value: stats.todayCount, icon: Clock, color: "#0EA5E9", bg: "#EFF6FF" },
          { label: "Overdue", value: stats.overdueCount, icon: AlertCircle, color: "#EF4444", bg: "#FEF2F2" },
          { label: "Due This Week", value: stats.thisWeekCount, icon: Calendar, color: "#F59E0B", bg: "#FFFBEB" },
          { label: "Completed", value: stats.completedCount, icon: CheckCircle, color: "#22C55E", bg: "#F0FDF4" },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3"
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: s.bg }}
            >
              <s.icon size={18} style={{ color: s.color }} />
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color: s.color }}>
                {s.value}
              </p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* AI Suggestion card */}
      {stats.overdueCount > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-100 mb-4">
          <div className="flex items-center gap-3">
            <Sparkles className="text-blue-500" size={20} />
            <div>
              <p className="text-sm font-semibold text-gray-800">
                You have {stats.overdueCount} overdue task
                {stats.overdueCount !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Ask your AI assistant to help reschedule or complete them
              </p>
            </div>
            <Link
              href="/dashboard/chat"
              className="ml-auto px-3 py-1.5 rounded-lg bg-white border border-blue-200 text-xs font-semibold text-blue-600 hover:bg-blue-50 shrink-0"
            >
              Open AI Assistant
            </Link>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="bg-white rounded-2xl p-1 shadow-sm border border-gray-100 flex gap-1 mb-4">
        {filterTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
              filter === tab.value
                ? "text-white"
                : "text-gray-500 hover:bg-gray-50"
            }`}
            style={filter === tab.value ? { backgroundColor: "#1E3A5F" } : {}}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Task groups */}
      <div className="flex flex-col gap-4">
        {groupOrder.map((group) => {
          const groupTasks = grouped[group];
          if (!groupTasks || groupTasks.length === 0) return null;
          return (
            <div key={group}>
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor:
                      group === "Overdue" ? "#FEF2F2" : "#F3F4F6",
                    color: group === "Overdue" ? "#EF4444" : "#6B7280",
                  }}
                >
                  {group}
                </span>
                <span className="text-xs text-gray-400">
                  {groupTasks.length}
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {groupTasks.map((task, i) => {
                  const done = !!task.completed_at;
                  const priority = task.priority || "medium";
                  return (
                    <div
                      key={task.id}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                        i !== groupTasks.length - 1
                          ? "border-b border-gray-50"
                          : ""
                      } ${done ? "bg-gray-50/50" : "hover:bg-blue-50/20"}`}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleCompleteMutation.mutate(task)}
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                          done
                            ? "border-green-400 bg-green-400"
                            : "border-gray-300 hover:border-green-400"
                        }`}
                      >
                        {done && <Check size={11} className="text-white" />}
                      </button>

                      {/* Priority dot */}
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor: priorityColors[priority] || "#F59E0B",
                        }}
                      />

                      {/* Title + contact + date */}
                      <div className="flex-1 min-w-0">
                        <span
                          className={`text-sm font-semibold block truncate ${
                            done
                              ? "line-through text-gray-400"
                              : "text-gray-800"
                          }`}
                        >
                          {task.body || "Untitled task"}
                        </span>
                        <span className="text-xs text-gray-500">
                          {task.contact_name || "No contact"}
                          {task.due_date && (
                            <>
                              {" · "}
                              {new Date(task.due_date + "T00:00:00").toLocaleDateString(
                                "en-US",
                                { month: "short", day: "numeric" }
                              )}
                            </>
                          )}
                        </span>
                      </div>

                      {/* Due badge */}
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${dueBadgeClasses(
                          task.due_date,
                          task.completed_at
                        )}`}
                      >
                        {done ? "Done" : formatDueLabel(task.due_date)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {tasks.length === 0 && (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={28} className="text-blue-500" />
            </div>
            <p className="text-sm font-bold text-gray-700">
              {filter === "overdue"
                ? "No overdue tasks!"
                : filter === "completed"
                  ? "No completed tasks yet"
                  : "No tasks found"}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {filter === "overdue"
                ? "All caught up. Great work staying on top of follow-ups."
                : "Create a task to get started."}
            </p>
          </div>
        )}
      </div>

      {/* Add Task Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold" style={{ color: "#1E3A5F" }}>
                  Add Task
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Type a name and hit Enter, or add details below
                </p>
              </div>
              <button
                onClick={() => setShowAdd(false)}
                className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <X size={14} className="text-gray-500" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* Title — primary input, supports Enter to quick-submit */}
              <div>
                <input
                  type="text"
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTitle.trim() && !createTaskMutation.isPending) {
                      createTaskMutation.mutate();
                    }
                  }}
                  placeholder="What needs to be done?"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-[#0EA5E9] focus:ring-1 focus:ring-[#0EA5E9]/30"
                />
              </div>

              {/* Expandable details section */}
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors"
              >
                <ChevronDown
                  size={14}
                  className={`transition-transform ${showDetails ? "rotate-180" : ""}`}
                />
                {showDetails ? "Hide details" : "Add due date, contact, or priority"}
              </button>

              {showDetails && (
                <div className="space-y-4 pt-1">
                  {/* Due Date + Priority row */}
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                        Due Date
                      </label>
                      <input
                        type="date"
                        value={newDueDate}
                        onChange={(e) => setNewDueDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-[#0EA5E9]"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
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

                  {/* Contact */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                      Contact{" "}
                      <span className="normal-case text-gray-400 font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <select
                        value={newContactId}
                        onChange={(e) => setNewContactId(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-[#0EA5E9] appearance-none"
                      >
                        <option value="">No contact</option>
                        {contacts.map(
                          (c: { id: string; first_name: string; last_name: string }) => (
                            <option key={c.id} value={c.id}>
                              {c.first_name} {c.last_name}
                            </option>
                          )
                        )}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Property */}
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                      Property{" "}
                      <span className="normal-case text-gray-400 font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <select
                        value={newPropertyId}
                        onChange={(e) => setNewPropertyId(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-[#0EA5E9] appearance-none"
                      >
                        <option value="">No property</option>
                        {properties.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.address}{p.city ? `, ${p.city}` : ""}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Press <kbd className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 font-mono text-[10px]">Enter</kbd> to quick add
              </p>
              <div className="flex items-center gap-3">
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
        </div>
      )}
    </div>
  );
}
