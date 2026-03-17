"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence, useInView, useReducedMotion } from "framer-motion";
import { GripVertical } from "lucide-react";

const INITIAL_STAGES = [
  { id: "lead", name: "Lead", color: "#64748B", deals: [
    { id: "d1", title: "742 Evergreen Terrace", value: 485000 },
    { id: "d2", title: "221B Baker Street", value: 1200000 },
  ]},
  { id: "contacted", name: "Contacted", color: "#3B82F6", deals: [
    { id: "d3", title: "1600 Pennsylvania Ave", value: 2800000 },
  ]},
  { id: "touring", name: "Touring", color: "#06B6D4", deals: [
    { id: "d4", title: "350 Fifth Avenue", value: 950000 },
  ]},
  { id: "offer", name: "Offer", color: "#F97316", deals: [
    { id: "d5", title: "10 Downing Street", value: 3400000 },
  ]},
  { id: "under-contract", name: "Under Contract", color: "#8B5CF6", deals: [] as { id: string; title: string; value: number }[] },
  { id: "closed", name: "Closed", color: "#22C55E", deals: [] as { id: string; title: string; value: number }[] },
  { id: "lost", name: "Lost", color: "#EF4444", deals: [] as { id: string; title: string; value: number }[] },
];

function formatValue(val: number): string {
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  return `$${(val / 1000).toFixed(0)}K`;
}

function ConfettiBurst() {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: (Math.random() - 0.5) * 200,
    y: -(Math.random() * 150 + 50),
    rotation: Math.random() * 720,
    color: ["#22C55E", "#3B82F6", "#F97316", "#8B5CF6", "#EF4444"][Math.floor(Math.random() * 5)],
    size: Math.random() * 6 + 4,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-sm"
          style={{
            left: "50%",
            bottom: "50%",
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
          }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{ x: p.x, y: p.y, rotate: p.rotation, opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

export default function PipelineDemoSection() {
  const [stages, setStages] = useState(INITIAL_STAGES);
  const [draggedDeal, setDraggedDeal] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const reduced = useReducedMotion() ?? false;

  const totalValue = stages.reduce((sum, s) => sum + s.deals.reduce((ds, d) => ds + d.value, 0), 0);
  const activeDeals = stages.reduce((sum, s) => sum + s.deals.length, 0);

  const handleDragStart = useCallback((dealId: string) => {
    setDraggedDeal(dealId);
  }, []);

  const handleDrop = useCallback((targetStageId: string) => {
    if (!draggedDeal) return;

    setStages((prev) => {
      const newStages = prev.map((stage) => ({
        ...stage,
        deals: stage.deals.filter((d) => d.id !== draggedDeal),
      }));

      let deal: { id: string; title: string; value: number } | undefined;
      for (const stage of prev) {
        deal = stage.deals.find((d) => d.id === draggedDeal);
        if (deal) break;
      }

      if (deal) {
        const targetStage = newStages.find((s) => s.id === targetStageId);
        if (targetStage) {
          targetStage.deals.push(deal);
        }
      }

      return newStages;
    });

    if (targetStageId === "closed") {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 1500);
    }

    setDraggedDeal(null);
  }, [draggedDeal]);

  return (
    <section id="section-pipeline" className="relative py-24 lg:py-32 overflow-hidden" ref={ref}>
      {/* Grid background */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative">
        {/* Header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <span className="text-xs font-semibold tracking-[0.2em] uppercase text-[#3B82F6] font-[family-name:var(--font-dm-sans)]">
            Layer 1
          </span>
          <h2 className="mt-4 text-4xl lg:text-5xl font-bold font-[family-name:var(--font-sora)] text-white">
            Pipeline <span className="text-gradient-blue">Management</span>
          </h2>
          <p className="mt-4 text-lg text-slate-400 font-[family-name:var(--font-dm-sans)] max-w-xl mx-auto">
            Drag deals between stages. Try moving one to Closed for a surprise.
          </p>
        </motion.div>

        {/* Stats bar */}
        <motion.div
          className="flex justify-center gap-8 mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="text-center">
            <motion.span
              key={activeDeals}
              initial={reduced ? false : { scale: 1.3 }}
              animate={{ scale: 1 }}
              className="text-2xl font-bold text-white font-[family-name:var(--font-sora)]"
            >
              {activeDeals}
            </motion.span>
            <p className="text-xs text-slate-500 font-[family-name:var(--font-dm-sans)]">Active Deals</p>
          </div>
          <div className="w-px bg-white/[0.08]" />
          <div className="text-center">
            <motion.span
              key={totalValue}
              initial={reduced ? false : { scale: 1.3 }}
              animate={{ scale: 1 }}
              className="text-2xl font-bold text-white font-[family-name:var(--font-sora)]"
            >
              {formatValue(totalValue)}
            </motion.span>
            <p className="text-xs text-slate-500 font-[family-name:var(--font-dm-sans)]">Pipeline Value</p>
          </div>
        </motion.div>

        {/* Pipeline */}
        <motion.div
          className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 lg:p-6 backdrop-blur-sm overflow-x-auto relative"
          initial={{ opacity: 0, y: 40 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          {showConfetti && <ConfettiBurst />}
          <div className="grid grid-cols-7 gap-2 min-w-[900px]">
            {stages.map((stage, stageIndex) => (
              <motion.div
                key={stage.id}
                className="flex flex-col"
                initial={reduced ? false : { opacity: 0, scaleY: 0 }}
                animate={inView ? { opacity: 1, scaleY: 1 } : {}}
                transition={{ delay: 0.4 + stageIndex * 0.08, type: "spring", stiffness: 100, damping: 15 }}
                style={{ transformOrigin: "bottom" }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(stage.id)}
              >
                {/* Stage header */}
                <div className="flex items-center gap-1.5 mb-3 px-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="text-[11px] font-semibold text-slate-300 font-[family-name:var(--font-dm-sans)] truncate">
                    {stage.name}
                  </span>
                  <span className="text-[11px] text-slate-500 ml-auto">{stage.deals.length}</span>
                </div>

                {/* Drop zone */}
                <div className={`flex-1 rounded-lg border border-dashed p-1.5 space-y-2 transition-colors min-h-[120px] ${
                  draggedDeal ? "border-[#2563EB]/30 bg-[#2563EB]/5" : "border-white/[0.06]"
                }`}>
                  <AnimatePresence>
                    {stage.deals.map((deal) => (
                      <motion.div
                        key={deal.id}
                        layout
                        initial={reduced ? false : { opacity: 0, scale: 0.8, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ type: "spring", stiffness: 200, damping: 20 }}
                        draggable
                        onDragStart={() => handleDragStart(deal.id)}
                        className="rounded-lg bg-white/[0.06] border border-white/[0.08] p-2.5 cursor-grab active:cursor-grabbing hover:bg-white/[0.1] transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <GripVertical size={12} className="text-slate-600 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[11px] text-slate-300 font-[family-name:var(--font-dm-sans)] truncate">
                              {deal.title}
                            </p>
                            <p className="text-[11px] font-bold text-white font-[family-name:var(--font-sora)]">
                              {formatValue(deal.value)}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
