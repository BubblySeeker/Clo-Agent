"use client";

import { useState } from "react";
import { Plus, MoreHorizontal, Zap, RefreshCw, CheckSquare, Mail, MessageSquare, GitBranch, Clock, Play, Pause, Copy, Trash2, X } from "lucide-react";

type WorkflowStatus = "active" | "paused" | "draft";

interface Workflow {
  id: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  trigger: string;
  actions: string[];
  lastRun: string | null;
  runCount: number;
  category: string;
}

const workflowsData: Workflow[] = [
  {
    id: "w1",
    name: "New Lead Welcome Sequence",
    description: "Automatically send a welcome email and schedule a follow-up call when a new contact is added.",
    status: "active",
    trigger: "New Contact Added",
    actions: ["Send Email: Welcome intro", "Wait: 2 Days", "Create Task: Follow-up call"],
    lastRun: "2 hrs ago",
    runCount: 47,
    category: "Lead Nurture",
  },
  {
    id: "w2",
    name: "Stale Contact Re-engagement",
    description: "Flag contacts that have gone silent for 14+ days and draft an AI re-engagement message.",
    status: "active",
    trigger: "Lead Goes Stale (14 days)",
    actions: ["Flag Contact as Stale", "Draft AI Message", "Notify Agent"],
    lastRun: "Yesterday",
    runCount: 23,
    category: "Re-engagement",
  },
  {
    id: "w3",
    name: "Offer Stage Checklist",
    description: "Create a task checklist and notify you when a deal moves into the Offer stage.",
    status: "paused",
    trigger: "Deal Stage → Offer",
    actions: ["Create Task: Review documents", "Create Task: Send disclosures", "Notify Agent"],
    lastRun: "3 days ago",
    runCount: 12,
    category: "Pipeline",
  },
  {
    id: "w4",
    name: "Task Overdue Reminder",
    description: "Send a daily digest of overdue tasks every morning at 9 AM.",
    status: "paused",
    trigger: "Task Overdue",
    actions: ["Send Notification: Overdue tasks digest"],
    lastRun: "1 week ago",
    runCount: 38,
    category: "Reminders",
  },
  {
    id: "w5",
    name: "Post-Closing Follow-up",
    description: "After a deal is closed, schedule a 30-day and 90-day check-in to generate referrals.",
    status: "draft",
    trigger: "Deal Stage → Closed",
    actions: ["Wait: 30 Days", "Create Task: 30-day check-in", "Wait: 60 Days", "Create Task: 90-day follow-up"],
    lastRun: null,
    runCount: 0,
    category: "Post-Close",
  },
  {
    id: "w6",
    name: "Open House Lead Capture",
    description: "Instantly create contacts and send a thank-you email when a lead signs in at an open house.",
    status: "draft",
    trigger: "Manual Trigger",
    actions: ["Create Contact", "Send Email: Thank you + listing info", "Create Task: Follow-up within 24h"],
    lastRun: null,
    runCount: 0,
    category: "Lead Capture",
  },
];

const templates = [
  { id: "t1", icon: Zap, name: "New Lead Follow-up (3-step)", desc: "Auto-send intro email, wait 2 days, send follow-up text", color: "#0EA5E9", bg: "#EFF6FF" },
  { id: "t2", icon: RefreshCw, name: "Stale Contact Re-engagement", desc: "Flag contacts with no activity in 14+ days, draft AI message", color: "#F59E0B", bg: "#FFFBEB" },
  { id: "t3", icon: CheckSquare, name: "Offer Stage Checklist", desc: "Create tasks and notify agent when deal enters Offer stage", color: "#8B5CF6", bg: "#EDE9FE" },
  { id: "t4", icon: Mail, name: "Post-Close Nurture", desc: "30-day and 90-day check-ins after closing to generate referrals", color: "#22C55E", bg: "#F0FDF4" },
];

const actionIcons: Record<string, React.ElementType> = {
  "Send Email": Mail,
  "Send Notification": MessageSquare,
  "Create Task": CheckSquare,
  "Wait": Clock,
  "Flag": Zap,
  "Draft": Zap,
  "Notify": MessageSquare,
  "Create Contact": GitBranch,
};

function getActionIcon(action: string): React.ElementType {
  for (const key of Object.keys(actionIcons)) {
    if (action.startsWith(key)) return actionIcons[key];
  }
  return GitBranch;
}

const statusConfig: Record<WorkflowStatus, { label: string; color: string; bg: string; dot: string }> = {
  active: { label: "Active", color: "#22C55E", bg: "#F0FDF4", dot: "#22C55E" },
  paused: { label: "Paused", color: "#9CA3AF", bg: "#F3F4F6", dot: "#9CA3AF" },
  draft: { label: "Draft", color: "#F59E0B", bg: "#FFFBEB", dot: "#F59E0B" },
};

const categoryColors: Record<string, string> = {
  "Lead Nurture": "#0EA5E9",
  "Re-engagement": "#F59E0B",
  "Pipeline": "#8B5CF6",
  "Reminders": "#EF4444",
  "Post-Close": "#22C55E",
  "Lead Capture": "#1E3A5F",
};

const CATEGORIES = ["Lead Nurture", "Re-engagement", "Pipeline", "Reminders", "Post-Close", "Lead Capture"];
const TRIGGERS = ["New Contact Added", "Lead Goes Stale (14 days)", "Deal Stage Change", "Task Overdue", "Manual Trigger"];

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState(workflowsData);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | WorkflowStatus>("all");

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTrigger, setNewTrigger] = useState(TRIGGERS[0]);
  const [newCategory, setNewCategory] = useState(CATEGORIES[0]);

  const toggleStatus = (id: string) => {
    setWorkflows((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, status: w.status === "active" ? "paused" : "active" } : w
      )
    );
  };

  const deleteWorkflow = (id: string) => {
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
    setOpenMenu(null);
  };

  const handleCreateWorkflow = () => {
    const newWorkflow: Workflow = {
      id: `w${Date.now()}`,
      name: newName,
      description: newDescription,
      status: "draft",
      trigger: newTrigger,
      actions: [],
      lastRun: null,
      runCount: 0,
      category: newCategory,
    };
    setWorkflows((prev) => [...prev, newWorkflow]);
    setShowAdd(false);
    setNewName("");
    setNewDescription("");
    setNewTrigger(TRIGGERS[0]);
    setNewCategory(CATEGORIES[0]);
  };

  const filtered = filter === "all" ? workflows : workflows.filter((w) => w.status === filter);

  const counts = {
    active: workflows.filter((w) => w.status === "active").length,
    paused: workflows.filter((w) => w.status === "paused").length,
    draft: workflows.filter((w) => w.status === "draft").length,
  };

  return (
    <div className="p-6">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#1E3A5F" }}>Workflows</h1>
            <p className="text-sm text-gray-500 mt-0.5">Automate follow-ups, tasks, and reminders</p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold"
            style={{ backgroundColor: "#0EA5E9" }}
          >
            <Plus size={16} /> New Workflow
          </button>
        </div>

        {/* Coming Soon Banner */}
        <div className="flex items-center gap-3 px-5 py-3.5 rounded-2xl border border-amber-200 bg-amber-50">
          <Zap size={18} className="text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Workflows are coming soon!</p>
            <p className="text-xs text-amber-600 mt-0.5">This feature is currently in development. The workflows below are preview examples.</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Active", value: counts.active, color: "#22C55E", bg: "#F0FDF4" },
            { label: "Paused", value: counts.paused, color: "#9CA3AF", bg: "#F3F4F6" },
            { label: "Drafts", value: counts.draft, color: "#F59E0B", bg: "#FFFBEB" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: s.bg }}>
                <span className="text-xl font-bold" style={{ color: s.color }}>{s.value}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">{s.label} Workflows</p>
                <p className="text-xs text-gray-400">{s.value === 1 ? "1 workflow" : `${s.value} workflows`}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {(["all", "active", "paused", "draft"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold capitalize transition-all ${filter === tab ? "text-white" : "text-gray-500 bg-white border border-gray-200 hover:bg-gray-50"}`}
              style={filter === tab ? { backgroundColor: "#1E3A5F" } : {}}
            >
              {tab === "all" ? `All (${workflows.length})` : `${tab.charAt(0).toUpperCase() + tab.slice(1)} (${counts[tab]})`}
            </button>
          ))}
        </div>

        {/* Workflow Cards */}
        <div className="grid grid-cols-3 gap-4">
          {filtered.map((workflow) => {
            const statusCfg = statusConfig[workflow.status];
            const categoryColor = categoryColors[workflow.category] || "#1E3A5F";
            return (
              <div
                key={workflow.id}
                className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col gap-4 hover:shadow-md transition-shadow"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${categoryColor}18`, color: categoryColor }}
                      >
                        {workflow.category}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statusCfg.dot }} />
                        <span className="text-[10px] font-semibold" style={{ color: statusCfg.color }}>{statusCfg.label}</span>
                      </div>
                    </div>
                    <h3 className="font-bold text-sm leading-tight" style={{ color: "#1E3A5F" }}>{workflow.name}</h3>
                  </div>
                  <div className="relative shrink-0">
                    <button
                      onClick={() => setOpenMenu(openMenu === workflow.id ? null : workflow.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
                    >
                      <MoreHorizontal size={15} className="text-gray-400" />
                    </button>
                    {openMenu === workflow.id && (
                      <div className="absolute right-0 top-9 w-40 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-10">
                        <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                          <Copy size={12} /> Duplicate
                        </button>
                        <button
                          onClick={() => deleteWorkflow(workflow.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-gray-500 leading-relaxed">{workflow.description}</p>

                {/* Trigger */}
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                  <Zap size={12} style={{ color: "#0EA5E9" }} className="shrink-0" />
                  <span className="text-xs text-gray-600 font-medium">When: {workflow.trigger}</span>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1.5">
                  {workflow.actions.slice(0, 3).map((action, i) => {
                    const Icon = getActionIcon(action);
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: "#EFF6FF" }}>
                          <Icon size={10} style={{ color: "#0EA5E9" }} />
                        </div>
                        <span className="text-xs text-gray-500 truncate">{action}</span>
                      </div>
                    );
                  })}
                  {workflow.actions.length > 3 && (
                    <span className="text-xs text-gray-400 ml-7">+{workflow.actions.length - 3} more steps</span>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-auto">
                  <div className="text-xs text-gray-400">
                    {workflow.lastRun ? `Last run: ${workflow.lastRun} · ${workflow.runCount} total` : "Never run"}
                  </div>
                  <button
                    onClick={() => toggleStatus(workflow.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                    style={
                      workflow.status === "active"
                        ? { backgroundColor: "#FEF2F2", color: "#EF4444" }
                        : { backgroundColor: "#F0FDF4", color: "#22C55E" }
                    }
                  >
                    {workflow.status === "active" ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Activate</>}
                  </button>
                </div>
              </div>
            );
          })}

          {/* Add new card */}
          <button onClick={() => setShowAdd(true)} className="bg-white rounded-2xl p-5 shadow-sm border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-3 hover:border-[#0EA5E9] hover:text-[#0EA5E9] text-gray-400 transition-all min-h-[200px]">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-gray-50">
              <Plus size={22} />
            </div>
            <span className="text-sm font-semibold">Create Workflow</span>
          </button>
        </div>

        {/* Templates */}
        <div>
          <h2 className="font-bold mb-3" style={{ color: "#1E3A5F" }}>Quick Start Templates</h2>
          <div className="grid grid-cols-4 gap-4">
            {templates.map((t) => (
              <div
                key={t.id}
                className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col gap-3 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: t.bg }}>
                  <t.icon size={18} style={{ color: t.color }} />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: "#1E3A5F" }}>{t.name}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{t.desc}</p>
                </div>
                <button
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl self-start transition-opacity hover:opacity-80"
                  style={{ backgroundColor: t.bg, color: t.color }}
                  onClick={() => alert("Workflow templates coming soon!")}
                >
                  Use Template
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* New Workflow Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold" style={{ color: "#1E3A5F" }}>New Workflow</h2>
                <p className="text-xs text-gray-400 mt-0.5">Create an automation to save time on repetitive tasks</p>
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
              {/* Name */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Workflow Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. New Lead Welcome Sequence"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-[#0EA5E9]"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Description</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="What does this workflow do?"
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-[#0EA5E9] resize-none"
                />
              </div>

              {/* Category */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Category</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => {
                    const selected = newCategory === cat;
                    const color = categoryColors[cat] || "#1E3A5F";
                    return (
                      <button
                        key={cat}
                        onClick={() => setNewCategory(cat)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all"
                        style={{
                          borderColor: selected ? color : "#f3f4f6",
                          backgroundColor: selected ? `${color}18` : "white",
                          color: selected ? color : "#6b7280",
                        }}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Trigger */}
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Trigger</label>
                <div className="flex flex-col gap-2">
                  {TRIGGERS.map((trigger) => {
                    const selected = newTrigger === trigger;
                    return (
                      <button
                        key={trigger}
                        onClick={() => setNewTrigger(trigger)}
                        className="flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 text-left transition-all"
                        style={{
                          borderColor: selected ? "#0EA5E9" : "#f3f4f6",
                          backgroundColor: selected ? "#EFF6FF" : "white",
                        }}
                      >
                        <Zap size={14} style={{ color: selected ? "#0EA5E9" : "#9ca3af" }} />
                        <span className="text-xs font-semibold" style={{ color: selected ? "#0EA5E9" : "#6b7280" }}>
                          {trigger}
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
                onClick={handleCreateWorkflow}
                disabled={!newName.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-all"
                style={{ backgroundColor: "#0EA5E9" }}
              >
                <Plus size={14} />
                Create Workflow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
