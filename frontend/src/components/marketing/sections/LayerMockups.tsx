"use client";

import { Bot, Shield, Lock } from "lucide-react";

export function PipelineMockup() {
  const stages = [
    { name: "Lead", color: "#64748B", cards: 3 },
    { name: "Contacted", color: "#3B82F6", cards: 2 },
    { name: "Touring", color: "#F97316", cards: 2 },
    { name: "Offer", color: "#8B5CF6", cards: 1 },
  ];
  return (
    <div className="flex gap-3 p-4 h-full">
      {stages.map((s) => (
        <div key={s.name} className="flex-1 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-[9px] text-white/50 font-semibold tracking-wide uppercase">
              {s.name}
            </span>
            <span className="text-[9px] text-white/30 ml-auto">{s.cards}</span>
          </div>
          {Array.from({ length: s.cards }).map((_, i) => (
            <div key={i} className="rounded-lg bg-white/[0.06] border border-white/[0.06] p-2">
              <div className="h-1.5 w-3/4 bg-white/20 rounded-full mb-1.5" />
              <div className="h-1.5 w-1/2 bg-white/10 rounded-full" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function AiMockup() {
  return (
    <div className="flex flex-col gap-3 p-4 h-full justify-center">
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full bg-orange-500/30 flex items-center justify-center shrink-0">
          <Bot className="w-3 h-3 text-orange-400" />
        </div>
        <div className="rounded-lg bg-white/[0.06] border border-white/[0.06] px-3 py-2 flex-1 max-w-[70%]">
          <div className="h-1.5 w-full bg-white/20 rounded-full mb-1.5" />
          <div className="h-1.5 w-2/3 bg-white/10 rounded-full" />
        </div>
      </div>
      <div className="flex items-start gap-2 justify-end">
        <div className="rounded-lg bg-blue-500/20 border border-blue-500/20 px-3 py-2 max-w-[60%]">
          <div className="h-1.5 w-24 bg-white/25 rounded-full" />
        </div>
      </div>
      <div className="flex gap-2 mt-1">
        {["Follow up", "Pipeline", "Next steps"].map((t) => (
          <span
            key={t}
            className="text-[8px] px-2 py-1 rounded-full bg-orange-500/15 text-orange-300/80 border border-orange-500/20"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

export function AnalyticsMockup() {
  const metrics = [
    { label: "Deals", value: "24" },
    { label: "Pipeline", value: "$5.9M" },
    { label: "Closed", value: "$1.2M" },
  ];
  const bars = [65, 45, 80, 55, 70, 40, 85];
  return (
    <div className="flex gap-4 p-4 h-full items-center">
      <div className="flex gap-2">
        {metrics.map((m) => (
          <div key={m.label} className="rounded-lg bg-white/[0.06] border border-white/[0.06] px-3 py-2 text-center">
            <div className="text-[10px] font-bold text-white/80">{m.value}</div>
            <div className="text-[7px] text-white/40 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-1 h-14 flex-1">
        {bars.map((h, i) => (
          <div key={i} className="flex-1 rounded-t bg-purple-500/40" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div
        className="w-12 h-12 rounded-full shrink-0"
        style={{
          background: "conic-gradient(#8B5CF6 0% 35%, #3B82F6 35% 60%, #10B981 60% 80%, #1E293B 80% 100%)",
        }}
      />
    </div>
  );
}

export function ContactsMockup() {
  const avatars = [
    { initials: "JD", bg: "#3B82F6" },
    { initials: "SM", bg: "#10B981" },
    { initials: "AK", bg: "#F97316" },
    { initials: "LR", bg: "#8B5CF6" },
    { initials: "MH", bg: "#EF4444" },
    { initials: "TP", bg: "#06B6D4" },
    { initials: "RW", bg: "#F59E0B" },
    { initials: "CN", bg: "#EC4899" },
  ];
  return (
    <div className="grid grid-cols-4 gap-3 p-4 h-full content-center">
      {avatars.map((a) => (
        <div key={a.initials} className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
            style={{ backgroundColor: a.bg }}
          >
            {a.initials}
          </div>
          <div>
            <div className="h-1.5 w-10 bg-white/20 rounded-full mb-1" />
            <div className="h-1.5 w-6 bg-white/10 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SecurityMockup() {
  return (
    <div className="flex items-center justify-center gap-6 p-4 h-full">
      <Shield className="w-10 h-10 text-red-400/60" />
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5">
          <Shield className="w-3 h-3 text-red-400" />
          <span className="text-[9px] text-red-300/80 font-medium">RLS Enforced</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5">
          <Lock className="w-3 h-3 text-red-400" />
          <span className="text-[9px] text-red-300/80 font-medium">Encrypted</span>
        </div>
      </div>
    </div>
  );
}

export const MOCKUP_COMPONENTS = {
  pipeline: PipelineMockup,
  ai: AiMockup,
  analytics: AnalyticsMockup,
  contacts: ContactsMockup,
  security: SecurityMockup,
} as const;
