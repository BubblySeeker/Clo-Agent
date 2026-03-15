"use client";

import { useState } from "react";
import { Plus, Phone, Mail, Calendar, Users, AlertCircle, CheckCircle, Clock, Edit2, RefreshCw, Trash2 } from "lucide-react";

const tasksRaw = [
  { id: 1, title: "Call Marcus Rivera re: counter-offer", contact: "Marcus Rivera", deal: "327 Maple Ave", dueDate: "Mar 12", type: "call", priority: "high", done: false, group: "Overdue" },
  { id: 2, title: "Follow up with David Nguyen — no response", contact: "David Nguyen", deal: null, dueDate: "Mar 13", type: "follow-up", priority: "high", done: false, group: "Overdue" },
  { id: 3, title: "Send listing report to Sarah Chen", contact: "Sarah Chen", deal: null, dueDate: "Mar 14", type: "email", priority: "medium", done: false, group: "Today" },
  { id: 4, title: "Confirm showing with Nina Patel", contact: "Nina Patel", deal: "95 Skyline Blvd", dueDate: "Mar 14", type: "meeting", priority: "high", done: false, group: "Today" },
  { id: 5, title: "Review counter-offer documents for Aisha", contact: "Aisha Thompson", deal: "74 Birchwood Lane", dueDate: "Mar 14", type: "follow-up", priority: "medium", done: false, group: "Today" },
  { id: 6, title: "Email Priya Kapoor: Jersey City comps", contact: "Priya Kapoor", deal: null, dueDate: "Mar 15", type: "email", priority: "medium", done: false, group: "Tomorrow" },
  { id: 7, title: "Schedule open house for Tenafly listing", contact: "Aisha Thompson", deal: "74 Birchwood Lane", dueDate: "Mar 16", type: "meeting", priority: "low", done: false, group: "This Week" },
  { id: 8, title: "Follow up with James Walsh: showing feedback", contact: "James Walsh", deal: null, dueDate: "Mar 17", type: "follow-up", priority: "medium", done: false, group: "This Week" },
  { id: 9, title: "Submit pre-approval for Carlos Reyes", contact: "Carlos Reyes", deal: "780 Elm Court", dueDate: "Mar 8", type: "follow-up", priority: "high", done: true, group: "Overdue" },
  { id: 10, title: "Send CMA to Tom Becker", contact: "Tom Becker", deal: null, dueDate: "Mar 10", type: "email", priority: "low", done: true, group: "Overdue" },
];

type TaskType = "call" | "email" | "meeting" | "follow-up";
const typeConfig: Record<TaskType, { icon: React.ElementType; color: string; bg: string }> = {
  call: { icon: Phone, color: "#0EA5E9", bg: "#EFF6FF" },
  email: { icon: Mail, color: "#22C55E", bg: "#F0FDF4" },
  meeting: { icon: Calendar, color: "#8B5CF6", bg: "#EDE9FE" },
  "follow-up": { icon: Users, color: "#F59E0B", bg: "#FFFBEB" },
};
const priorityColors = { high: "#EF4444", medium: "#F59E0B", low: "#22C55E" };
const groups = ["Overdue", "Today", "Tomorrow", "This Week"];
const filterTabs = ["All", "Today", "Overdue", "Upcoming", "Completed"];

export default function TasksPage() {
  const [tasks, setTasks] = useState(tasksRaw);
  const [filter, setFilter] = useState("All");
  const [hoveredTask, setHoveredTask] = useState<number | null>(null);

  const toggleDone = (id: number) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const totalToday = tasks.filter((t) => t.group === "Today" && !t.done).length;
  const totalOverdue = tasks.filter((t) => t.group === "Overdue" && !t.done).length;
  const totalUpcoming = tasks.filter((t) => ["Tomorrow", "This Week"].includes(t.group) && !t.done).length;
  const totalCompleted = tasks.filter((t) => t.done).length;

  const getFiltered = (group: string) => {
    return tasks.filter((t) => {
      if (filter === "Completed") return t.done && t.group === group;
      if (filter === "Today") return !t.done && t.group === "Today";
      if (filter === "Overdue") return !t.done && t.group === "Overdue";
      if (filter === "Upcoming") return !t.done && ["Tomorrow", "This Week"].includes(t.group);
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
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: "#0EA5E9" }}>
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
                  const cfg = typeConfig[task.type as TaskType] || typeConfig.call;
                  const isHovered = hoveredTask === task.id;
                  return (
                    <div
                      key={task.id}
                      onMouseEnter={() => setHoveredTask(task.id)}
                      onMouseLeave={() => setHoveredTask(null)}
                      className={`flex items-center gap-4 px-4 py-3 transition-colors ${i !== groupTasks.length - 1 ? "border-b border-gray-50" : ""} ${task.done ? "bg-gray-50/50" : "hover:bg-blue-50/20"}`}
                    >
                      <button
                        onClick={() => toggleDone(task.id)}
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${task.done ? "border-green-400 bg-green-400" : "border-gray-300 hover:border-green-400"}`}
                      >
                        {task.done && <CheckCircle size={11} className="text-white" />}
                      </button>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: cfg.bg }}>
                        <cfg.icon size={13} style={{ color: cfg.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-semibold ${task.done ? "line-through text-gray-400" : "text-gray-800"}`}>{task.title}</span>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium shrink-0">{task.contact}</span>
                      {task.deal && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium shrink-0 hidden lg:inline">{task.deal}</span>
                      )}
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${group === "Overdue" && !task.done ? "bg-red-50 text-red-500" : "bg-gray-100 text-gray-500"}`}>
                        {task.dueDate}
                      </span>
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: priorityColors[task.priority as keyof typeof priorityColors] }}
                        title={`${task.priority} priority`}
                      />
                      {isHovered && !task.done && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center hover:bg-blue-100 transition-colors">
                            <Edit2 size={11} className="text-gray-500" />
                          </button>
                          <button className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center hover:bg-amber-100 transition-colors">
                            <RefreshCw size={11} className="text-gray-500" />
                          </button>
                          <button className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center hover:bg-red-100 transition-colors">
                            <Trash2 size={11} className="text-red-400" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {filter === "Overdue" && tasks.filter((t) => t.group === "Overdue" && !t.done).length === 0 && (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={28} className="text-green-500" />
            </div>
            <p className="text-sm font-bold text-gray-700">No overdue tasks!</p>
            <p className="text-xs text-gray-400 mt-1">All caught up. Great work staying on top of follow-ups.</p>
          </div>
        )}
      </div>
    </div>
  );
}
