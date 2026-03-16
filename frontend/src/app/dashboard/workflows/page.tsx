"use client";

import { Zap, RefreshCw, CheckSquare, Mail } from "lucide-react";

const templates = [
  {
    icon: Zap,
    name: "New Lead Follow-up",
    desc: "Automatically send a welcome email and schedule a follow-up call when a new contact is added.",
    steps: ["Send welcome email", "Wait 2 days", "Create follow-up task"],
    color: "#0EA5E9",
    bg: "#EFF6FF",
  },
  {
    icon: RefreshCw,
    name: "Stale Contact Re-engagement",
    desc: "Flag contacts that have gone silent for 14+ days and draft an AI re-engagement message.",
    steps: ["Detect stale contacts", "Draft AI message", "Notify agent"],
    color: "#F59E0B",
    bg: "#FFFBEB",
  },
  {
    icon: CheckSquare,
    name: "Offer Stage Checklist",
    desc: "Create a task checklist and notify you when a deal moves into the Offer stage.",
    steps: ["Detect stage change", "Create review tasks", "Send notification"],
    color: "#8B5CF6",
    bg: "#EDE9FE",
  },
  {
    icon: Mail,
    name: "Post-Close Nurture",
    desc: "30-day and 90-day check-ins after closing to generate referrals.",
    steps: ["Wait 30 days", "Create check-in task", "Wait 60 more days", "Create follow-up task"],
    color: "#22C55E",
    bg: "#F0FDF4",
  },
];

export default function WorkflowsPage() {
  return (
    <div className="p-6">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E3A5F" }}>Workflows</h1>
          <p className="text-sm text-gray-500 mt-0.5">Automate follow-ups, tasks, and reminders</p>
        </div>

        {/* Coming Soon Banner */}
        <div className="flex items-start gap-4 px-6 py-5 rounded-2xl border border-amber-200 bg-amber-50">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#FFFBEB" }}>
            <Zap size={22} className="text-amber-500" />
          </div>
          <div>
            <p className="text-base font-bold text-amber-800">Workflows are coming soon</p>
            <p className="text-sm text-amber-700 mt-1 leading-relaxed">
              We&apos;re building a workflow automation engine that will let you create custom sequences triggered by events like new contacts, deal stage changes, and overdue tasks. Below are some of the templates we&apos;re planning.
            </p>
          </div>
        </div>

        {/* Template Previews */}
        <div>
          <h2 className="font-bold mb-3" style={{ color: "#1E3A5F" }}>Planned Templates</h2>
          <div className="grid grid-cols-2 gap-4">
            {templates.map((t) => (
              <div
                key={t.name}
                className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: t.bg }}>
                    <t.icon size={18} style={{ color: t.color }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: "#1E3A5F" }}>{t.name}</p>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{t.desc}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 ml-[52px]">
                  {t.steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-400 shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-xs text-gray-500">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
