"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { TrendingUp, Users, DollarSign, Activity } from "lucide-react";

function AnimatedCounter({ target, prefix = "", suffix = "" }: { target: number; prefix?: string; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion() ?? false;

  useEffect(() => {
    if (!inView) return;
    if (reduced) { setCount(target); return; }
    let start = 0;
    const duration = 1500;
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      start = Math.round(eased * target);
      setCount(start);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, target, reduced]);

  return <span ref={ref}>{prefix}{count.toLocaleString()}{suffix}</span>;
}

const KPI_CARDS = [
  { label: "Active Deals", value: 47, prefix: "", suffix: "", icon: TrendingUp, color: "#3B82F6" },
  { label: "Total Contacts", value: 1284, prefix: "", suffix: "", icon: Users, color: "#10B981" },
  { label: "Pipeline Value", value: 12, prefix: "$", suffix: "M", icon: DollarSign, color: "#F97316" },
  { label: "Activities/Week", value: 156, prefix: "", suffix: "", icon: Activity, color: "#8B5CF6" },
];

const FUNNEL_STAGES = [
  { name: "Leads", count: 847, width: 100, color: "#3B82F6" },
  { name: "Contacted", count: 523, width: 78, color: "#06B6D4" },
  { name: "Touring", count: 234, width: 52, color: "#F97316" },
  { name: "Offer", count: 98, width: 30, color: "#8B5CF6" },
  { name: "Closed", count: 42, width: 15, color: "#22C55E" },
];

const TIMELINE_ITEMS = [
  { time: "2m ago", text: "Called Sarah Johnson — discussed pricing", type: "call", color: "#3B82F6" },
  { time: "15m ago", text: "Email sent to Mark Thompson — showing confirmation", type: "email", color: "#10B981" },
  { time: "1h ago", text: "Note added — Buyer prefers south-facing units", type: "note", color: "#F97316" },
  { time: "3h ago", text: "Showing completed at 350 Fifth Avenue", type: "showing", color: "#8B5CF6" },
  { time: "Yesterday", text: "Deal moved to Offer — 10 Downing Street", type: "deal", color: "#EF4444" },
];

export default function AnalyticsShowcaseSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const reduced = useReducedMotion() ?? false;

  return (
    <section id="section-analytics" className="relative py-24 lg:py-32" ref={ref}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <span className="text-xs font-semibold tracking-[0.2em] uppercase text-[#8B5CF6] font-[family-name:var(--font-josefin)]">
            Layer 3
          </span>
          <h2 className="mt-4 text-4xl lg:text-5xl font-bold font-[family-name:var(--font-cinzel)] text-white">
            Analytics & <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg, #8B5CF6, #A78BFA)" }}>Insights</span>
          </h2>
          <p className="mt-4 text-lg text-slate-400 font-[family-name:var(--font-josefin)] max-w-xl mx-auto">
            Every metric, chart, and insight — animated and alive.
          </p>
        </motion.div>

        {/* KPI counters */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
          {KPI_CARDS.map((kpi, i) => (
            <motion.div
              key={kpi.label}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6 text-center"
              initial={reduced ? false : { opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.1, type: "spring", stiffness: 100, damping: 15 }}
            >
              <kpi.icon className="w-5 h-5 mx-auto mb-3" style={{ color: kpi.color }} />
              <div className="text-3xl font-bold text-white font-[family-name:var(--font-cinzel)] mb-1">
                <AnimatedCounter target={kpi.value} prefix={kpi.prefix} suffix={kpi.suffix} />
              </div>
              <p className="text-xs text-slate-400 font-[family-name:var(--font-josefin)]">{kpi.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Two-column: Funnel + Timeline */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Pipeline funnel */}
          <motion.div
            className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6"
            initial={{ opacity: 0, x: -30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            <h3 className="text-sm font-semibold text-white font-[family-name:var(--font-josefin)] mb-6">
              Conversion Funnel
            </h3>
            <div className="space-y-3">
              {FUNNEL_STAGES.map((stage, i) => (
                <div key={stage.name} className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-400 font-[family-name:var(--font-josefin)] w-20 text-right">
                    {stage.name}
                  </span>
                  <div className="flex-1 h-8 bg-white/[0.04] rounded-lg overflow-hidden">
                    <motion.div
                      className="h-full rounded-lg flex items-center justify-end pr-2"
                      style={{ backgroundColor: stage.color }}
                      initial={{ width: "0%" }}
                      animate={inView ? { width: `${stage.width}%` } : { width: "0%" }}
                      transition={{ delay: 0.5 + i * 0.15, duration: 0.8, ease: "easeOut" }}
                    >
                      <span className="text-[10px] font-bold text-white">{stage.count}</span>
                    </motion.div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Activity timeline */}
          <motion.div
            className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6"
            initial={{ opacity: 0, x: 30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            <h3 className="text-sm font-semibold text-white font-[family-name:var(--font-josefin)] mb-6">
              Activity Timeline
            </h3>
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-3 top-0 bottom-0 w-px bg-white/[0.08]" />
              <div className="space-y-5">
                {TIMELINE_ITEMS.map((item, i) => (
                  <motion.div
                    key={i}
                    className="flex gap-4 relative"
                    initial={reduced ? false : { opacity: 0, x: 20 }}
                    animate={inView ? { opacity: 1, x: 0 } : {}}
                    transition={{ delay: 0.6 + i * 0.15 }}
                  >
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center z-10 shrink-0"
                      style={{ backgroundColor: `${item.color}20` }}
                    >
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                    </div>
                    <div>
                      <p className="text-xs text-slate-300 font-[family-name:var(--font-josefin)]">{item.text}</p>
                      <p className="text-[10px] text-slate-500 font-[family-name:var(--font-josefin)] mt-0.5">{item.time}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
