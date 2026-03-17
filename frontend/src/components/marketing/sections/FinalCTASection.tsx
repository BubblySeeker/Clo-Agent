"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { LayoutDashboard, Bot, BarChart3, Users, Shield } from "lucide-react";
import Link from "next/link";

const LAYERS = [
  { id: "pipeline", title: "Pipeline", color: "#3B82F6", icon: LayoutDashboard, from: { x: -300, y: 0, rotate: -20 } },
  { id: "ai", title: "AI", color: "#F97316", icon: Bot, from: { x: 300, y: 0, rotate: 20 } },
  { id: "analytics", title: "Analytics", color: "#8B5CF6", icon: BarChart3, from: { x: 0, y: -200, rotate: 15 } },
  { id: "contacts", title: "Contacts", color: "#10B981", icon: Users, from: { x: 0, y: 200, rotate: -15 } },
  { id: "security", title: "Security", color: "#EF4444", icon: Shield, from: { x: -200, y: -150, rotate: 25 } },
];

export default function FinalCTASection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const reduced = useReducedMotion() ?? false;

  return (
    <section className="relative py-24 lg:py-32" ref={ref}>
      <div className="max-w-4xl mx-auto px-6 text-center">
        {/* Reassembling layers */}
        <div className="relative h-[280px] mb-12 flex items-center justify-center" style={{ perspective: 800 }}>
          <div className="preserve-3d relative" style={{ width: 360, height: 250 }}>
            {LAYERS.map((layer, i) => {
              const centerOffset = i - 2;
              return (
                <motion.div
                  key={layer.id}
                  className="absolute inset-0 flex items-center justify-center"
                  initial={reduced ? false : {
                    x: layer.from.x,
                    y: layer.from.y,
                    rotate: layer.from.rotate,
                    opacity: 0,
                  }}
                  animate={inView ? {
                    x: 0,
                    y: centerOffset * 40,
                    rotate: 0,
                    opacity: 1,
                  } : {}}
                  transition={{
                    type: "spring",
                    stiffness: 60,
                    damping: 15,
                    delay: i * 0.15,
                  }}
                  style={{ zIndex: 5 - i }}
                >
                  <div
                    className="w-[320px] h-[48px] rounded-lg border border-white/[0.08] bg-[#0F172A]/95 flex items-center gap-3 px-4"
                    style={{ boxShadow: `0 -1px 20px ${layer.color}15, inset 0 1px 0 ${layer.color}30` }}
                  >
                    <div className="w-full h-[2px] absolute top-0 left-0 right-0 rounded-t-lg" style={{ backgroundColor: layer.color }} />
                    <layer.icon className="w-4 h-4 shrink-0" style={{ color: layer.color }} />
                    <span className="text-xs font-semibold text-white/80 font-[family-name:var(--font-josefin)]">{layer.title}</span>
                    <div className="flex-1" />
                    <div className="flex gap-1">
                      <div className="w-8 h-1.5 rounded-full bg-white/10" />
                      <div className="w-5 h-1.5 rounded-full bg-white/5" />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* CTA content */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 1, duration: 0.6 }}
        >
          <h2 className="text-4xl lg:text-5xl font-bold font-[family-name:var(--font-cinzel)] text-white mb-6">
            Ready to <span className="text-gradient-orange">Transform</span> Your Business?
          </h2>
          <p className="text-lg text-slate-400 font-[family-name:var(--font-josefin)] max-w-xl mx-auto mb-10">
            Join thousands of agents who&apos;ve replaced spreadsheets and sticky notes with five layers of intelligence.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold text-white rounded-xl transition-all hover:shadow-lg hover:shadow-[#F97316]/25 hover:scale-[1.02] active:scale-[0.98] font-[family-name:var(--font-josefin)]"
              style={{ backgroundColor: "#F97316" }}
            >
              Start Free Trial
            </Link>
            <Link
              href="/features"
              className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold rounded-xl border-2 border-[#2563EB] text-[#2563EB] hover:bg-[#2563EB] hover:text-white transition-all font-[family-name:var(--font-josefin)]"
            >
              Explore Features
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
