"use client";

import { useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useReducedMotion,
  AnimatePresence,
} from "framer-motion";
import { LayoutDashboard, Bot, BarChart3, Users, Shield, ChevronDown } from "lucide-react";
import { MOCKUP_COMPONENTS } from "./LayerMockups";
import Link from "next/link";

const LAYERS = [
  { id: "pipeline" as const, title: "UI Interface", subtitle: "Pipeline kanban, deal cards, drag-and-drop", color: "#3B82F6", icon: LayoutDashboard },
  { id: "ai" as const, title: "AI Intelligence", subtitle: "Chat, smart suggestions, tool execution", color: "#F97316", icon: Bot },
  { id: "analytics" as const, title: "Analytics & Insights", subtitle: "Charts, metrics, conversion tracking", color: "#8B5CF6", icon: BarChart3 },
  { id: "contacts" as const, title: "Contact Database", subtitle: "Buyer profiles, activity history", color: "#10B981", icon: Users },
  { id: "security" as const, title: "Security & Infrastructure", subtitle: "Row-level security, encryption", color: "#EF4444", icon: Shield },
];

function DesktopLayer({
  layer,
  index,
  scrollProgress,
}: {
  layer: (typeof LAYERS)[number];
  index: number;
  scrollProgress: ReturnType<typeof useScroll>["scrollYProgress"];
}) {
  const Mockup = MOCKUP_COMPONENTS[layer.id];
  const centerOffset = index - 2;

  // Stack assembly (0-15%)
  const rawY = useTransform(scrollProgress, [0, 0.12, 0.15], [centerOffset * 20, centerOffset * 20, centerOffset * 90]);
  const rawZ = useTransform(scrollProgress, [0, 0.12, 0.15], [0, 0, (4 - index) * 18]);

  // Peel off - each layer peels at different scroll point
  const peelStart = 0.18 + index * 0.13;
  const peelEnd = peelStart + 0.10;
  const rawPeelX = useTransform(scrollProgress, [peelStart, peelEnd], [0, index % 2 === 0 ? -1400 : 1400]);
  const rawPeelOpacity = useTransform(scrollProgress, [peelStart, peelEnd - 0.03], [1, 0]);
  const rawPeelRotate = useTransform(scrollProgress, [peelStart, peelEnd], [0, index % 2 === 0 ? -12 : 12]);

  const springCfg = { stiffness: 80, damping: 25 };
  const y = useSpring(rawY, springCfg);
  const z = useSpring(rawZ, springCfg);
  const peelX = useSpring(rawPeelX, springCfg);
  const opacity = useSpring(rawPeelOpacity, springCfg);
  const peelRotate = useSpring(rawPeelRotate, springCfg);

  const transform = useTransform(
    [y, z, peelX, peelRotate],
    ([yVal, zVal, xVal, rotVal]: number[]) =>
      `translateY(${yVal}px) translateZ(${zVal}px) translateX(${xVal}px) rotate(${rotVal}deg)`
  );

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center will-change-transform"
      style={{ transform, opacity }}
    >
      <div
        className="relative w-[720px] h-[140px] rounded-xl border border-white/[0.08] bg-[#0F172A]/95 backdrop-blur-sm overflow-hidden"
        style={{
          boxShadow: `0 -2px 30px ${layer.color}15, inset 0 1px 0 ${layer.color}30`,
        }}
      >
        <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl" style={{ backgroundColor: layer.color }} />
        <Mockup />
        <div className="absolute bottom-2 right-3 flex items-center gap-2">
          <layer.icon className="w-3.5 h-3.5" style={{ color: layer.color }} />
          <span className="text-[10px] font-semibold text-white/70 font-[family-name:var(--font-josefin)]">
            {layer.title}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function MobileAccordion() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <section className="md:hidden py-24 px-4">
      <div className="text-center mb-8">
        <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[#2563EB] font-[family-name:var(--font-josefin)] mb-3">
          Under the Hood
        </p>
        <h1 className="text-3xl font-bold font-[family-name:var(--font-cinzel)] text-white mb-4">
          Five Layers of <span className="text-gradient-blue">Intelligence</span>
        </h1>
        <p className="text-sm text-slate-400 font-[family-name:var(--font-josefin)] max-w-md mx-auto">
          Peel back the layers of your CRM to see the intelligence inside.
        </p>
      </div>

      <div className="max-w-lg mx-auto space-y-3">
        {LAYERS.map((layer, i) => {
          const Mockup = MOCKUP_COMPONENTS[layer.id];
          const isExpanded = expanded === i;
          return (
            <motion.div
              key={layer.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <button
                onClick={() => setExpanded(isExpanded ? null : i)}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-white/[0.08] bg-white/[0.04] text-left"
                style={{ borderColor: isExpanded ? `${layer.color}40` : undefined }}
              >
                <layer.icon className="w-5 h-5 shrink-0" style={{ color: layer.color }} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white font-[family-name:var(--font-josefin)]">{layer.title}</p>
                  <p className="text-xs text-slate-400 font-[family-name:var(--font-josefin)]">{layer.subtitle}</p>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                />
              </button>
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 rounded-xl border border-white/[0.08] bg-[#0F172A] h-[120px] overflow-hidden"
                      style={{ boxShadow: `0 0 20px ${layer.color}10` }}
                    >
                      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ backgroundColor: layer.color }} />
                      <Mockup />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      <div className="text-center mt-10">
        <Link
          href="/sign-up"
          className="inline-flex items-center justify-center px-8 py-3.5 text-sm font-semibold text-white rounded-xl transition-all hover:shadow-lg hover:shadow-[#F97316]/25 hover:scale-[1.02] active:scale-[0.98] font-[family-name:var(--font-josefin)]"
          style={{ backgroundColor: "#F97316" }}
        >
          Get Started Free
        </Link>
      </div>
    </section>
  );
}

export default function HeroExplodedView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const sceneRotateX = useTransform(scrollYProgress, [0, 0.12, 0.85, 1.0], [0, 25, 25, 0]);
  const sceneRotateY = useTransform(scrollYProgress, [0, 0.12, 0.85, 1.0], [0, -20, -20, 0]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.03, 0.08], [1, 1, 0]);
  const titleY = useTransform(scrollYProgress, [0, 0.08], [0, -30]);
  const subtitleOpacity = useTransform(scrollYProgress, [0, 0.02, 0.06], [1, 1, 0]);

  // Radial glow behind the stack
  const glowScale = useTransform(scrollYProgress, [0, 0.15], [0.8, 1.2]);
  const glowOpacity = useTransform(scrollYProgress, [0, 0.15, 0.8, 1.0], [0.3, 0.6, 0.6, 0]);

  if (reduced) {
    return (
      <>
        <MobileAccordion />
      </>
    );
  }

  return (
    <>
      {/* Mobile accordion */}
      <MobileAccordion />

      {/* Desktop sticky scroll */}
      <section
        ref={containerRef}
        className="relative hidden md:block"
        style={{ height: "650vh", isolation: "isolate" }}
      >
        <div className="sticky top-0 h-screen overflow-hidden">
          {/* Radial glow background */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ opacity: glowOpacity, scale: glowScale }}
          >
            <div className="w-[600px] h-[600px] rounded-full bg-[#2563EB]/20 blur-[120px]" />
          </motion.div>

          <div className="h-full flex flex-col items-center justify-center relative">
            {/* Title overlay */}
            <motion.div
              className="absolute top-24 text-center z-10 px-6"
              style={{ opacity: titleOpacity, y: titleY }}
            >
              <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[#2563EB] font-[family-name:var(--font-josefin)] mb-4">
                Under the Hood
              </p>
              <h1 className="text-5xl lg:text-6xl font-bold font-[family-name:var(--font-cinzel)] text-white mb-5">
                Five Layers of <span className="text-gradient-blue">Intelligence</span>
              </h1>
              <motion.p
                className="text-lg text-slate-400 font-[family-name:var(--font-josefin)] max-w-xl mx-auto mb-8"
                style={{ opacity: subtitleOpacity }}
              >
                Peel back the layers of your CRM to see the intelligence inside every interaction.
              </motion.p>
              <Link
                href="/sign-up"
                className="inline-flex items-center justify-center px-8 py-3.5 text-sm font-semibold text-white rounded-xl transition-all hover:shadow-lg hover:shadow-[#F97316]/25 hover:scale-[1.02] active:scale-[0.98] font-[family-name:var(--font-josefin)]"
                style={{ backgroundColor: "#F97316" }}
              >
                Get Started Free
              </Link>
            </motion.div>

            {/* 3D scene */}
            <div style={{ perspective: 1200 }}>
              <motion.div
                className="preserve-3d relative"
                style={{
                  rotateX: sceneRotateX,
                  rotateY: sceneRotateY,
                  width: 720,
                  height: 800,
                }}
              >
                {LAYERS.map((layer, i) => (
                  <DesktopLayer
                    key={layer.id}
                    layer={layer}
                    index={i}
                    scrollProgress={scrollYProgress}
                  />
                ))}
              </motion.div>
            </div>

            {/* Scroll indicator */}
            <motion.div
              className="absolute bottom-8 flex flex-col items-center gap-2"
              style={{ opacity: titleOpacity }}
            >
              <span className="text-xs text-slate-500 font-[family-name:var(--font-josefin)]">
                Scroll to explore
              </span>
              <motion.div
                animate={{ y: [0, 8, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              >
                <ChevronDown className="w-4 h-4 text-slate-500" />
              </motion.div>
            </motion.div>
          </div>
        </div>
      </section>
    </>
  );
}
