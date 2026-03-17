"use client";

import { useRef, useState } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useReducedMotion,
  useMotionValueEvent,
  AnimatePresence,
} from "framer-motion";
import {
  LayoutDashboard,
  Bot,
  BarChart3,
  Users,
  Shield,
  ChevronDown,
  ArrowRight,
} from "lucide-react";
import { MOCKUP_COMPONENTS } from "./LayerMockups";
import Link from "next/link";

const LAYERS = [
  {
    id: "pipeline" as const,
    title: "UI Interface",
    subtitle: "Pipeline kanban, deal cards, drag-and-drop",
    description: "A beautiful, intuitive interface that puts your entire pipeline at your fingertips. Drag deals between stages, track values in real-time, and never lose sight of an opportunity.",
    color: "#3B82F6",
    icon: LayoutDashboard,
    bullets: [
      "Visual kanban board with 7 stages",
      "Drag-and-drop deal management",
      "Real-time pipeline value tracking",
      "Smart deal cards with quick actions",
    ],
  },
  {
    id: "ai" as const,
    title: "AI Intelligence",
    subtitle: "Chat, smart suggestions, tool execution",
    description: "Your AI assistant understands your business. Ask questions in plain English, get instant answers, and let AI handle the busywork — from creating contacts to scheduling follow-ups.",
    color: "#F97316",
    icon: Bot,
    bullets: [
      "Natural language chat interface",
      "23 AI tools — read and write",
      "Tool execution with confirmations",
      "Contact-scoped conversations",
    ],
  },
  {
    id: "analytics" as const,
    title: "Analytics & Insights",
    subtitle: "Charts, metrics, conversion tracking",
    description: "Data-driven decisions made easy. Track your conversion funnel, monitor activity trends, and understand exactly where your business stands at any moment.",
    color: "#8B5CF6",
    icon: BarChart3,
    bullets: [
      "Pipeline conversion funnel",
      "Activity tracking & timeline",
      "KPI dashboards with live data",
      "Lead source attribution",
    ],
  },
  {
    id: "contacts" as const,
    title: "Contact Database",
    subtitle: "Buyer profiles, activity history",
    description: "Every contact tells a complete story. From buyer preferences and budget ranges to AI-generated personality insights and full interaction history — everything in one place.",
    color: "#10B981",
    icon: Users,
    bullets: [
      "Complete buyer preference profiles",
      "AI-generated contact summaries",
      "Full activity & interaction history",
      "Journey tracking across stages",
    ],
  },
  {
    id: "security" as const,
    title: "Security & Infrastructure",
    subtitle: "Row-level security, encryption",
    description: "Enterprise-grade security from the ground up. Every query is scoped to your account with row-level security, ensuring complete data isolation between agents.",
    color: "#EF4444",
    icon: Shield,
    bullets: [
      "Row-level security per agent",
      "Clerk authentication with JWT",
      "Encrypted data at rest",
      "Complete data isolation",
    ],
  },
];

/* ─── Part A: CRM Intro Hero ─── */
function HeroIntro() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">
      {/* Radial glow background */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[700px] h-[700px] rounded-full bg-[#2563EB]/15 blur-[140px]" />
      </div>

      <div className="relative z-10 text-center max-w-3xl mx-auto">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-xs font-semibold tracking-[0.25em] uppercase text-[#2563EB] font-[family-name:var(--font-dm-sans)] mb-6"
        >
          AI-Powered Real Estate CRM
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-5xl md:text-6xl lg:text-7xl font-bold font-[family-name:var(--font-sora)] text-white mb-6 leading-[1.1]"
        >
          The AI-Powered CRM{" "}
          <span className="text-gradient-blue">Built for Real Estate</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-lg md:text-xl text-slate-400 font-[family-name:var(--font-dm-sans)] max-w-xl mx-auto mb-12"
        >
          Manage your pipeline, nurture leads, and close deals faster with
          intelligent automation built for how agents actually work.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link
            href="/sign-up"
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-semibold text-white rounded-xl transition-all hover:shadow-lg hover:shadow-[#F97316]/25 hover:scale-[1.02] active:scale-[0.98] font-[family-name:var(--font-dm-sans)]"
            style={{ backgroundColor: "#F97316" }}
          >
            Start Free Trial
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/features"
            className="inline-flex items-center justify-center px-8 py-3.5 text-sm font-semibold text-white rounded-xl border border-[#2563EB]/40 hover:border-[#2563EB]/70 hover:bg-[#2563EB]/10 transition-all hover:scale-[1.02] active:scale-[0.98] font-[family-name:var(--font-dm-sans)]"
          >
            See Features
          </Link>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.8, duration: 0.6 }}
        className="absolute bottom-8 flex flex-col items-center gap-2"
      >
        <span className="text-xs text-slate-500 font-[family-name:var(--font-dm-sans)]">
          Scroll to explore
        </span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="w-4 h-4 text-slate-500" />
        </motion.div>
      </motion.div>
    </section>
  );
}

/* ─── Desktop: 3D Stack Assembly (sticky) ─── */
function StackAssembly() {
  const containerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  // Title fades in slowly
  const titleOpacity = useTransform(scrollYProgress, [0, 0.05, 0.12], [0, 0, 1]);
  const titleY = useTransform(scrollYProgress, [0.05, 0.12], [30, 0]);

  // 3D scene rotation — very slow build, long hold
  const sceneRotateX = useTransform(
    scrollYProgress,
    [0, 0.08, 0.2, 0.8, 0.92],
    [0, 0, 25, 25, 0]
  );
  const sceneRotateY = useTransform(
    scrollYProgress,
    [0, 0.08, 0.2, 0.8, 0.92],
    [0, 0, -20, -20, 0]
  );

  // Radial glow
  const glowOpacity = useTransform(
    scrollYProgress,
    [0, 0.2, 0.8, 1.0],
    [0.3, 0.6, 0.6, 0.3]
  );

  return (
    <section
      ref={containerRef}
      className="relative hidden md:block"
      style={{ height: "500vh", isolation: "isolate" }}
    >
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* Radial glow background */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ opacity: glowOpacity }}
        >
          <div className="w-[600px] h-[600px] rounded-full bg-[#2563EB]/20 blur-[120px]" />
        </motion.div>

        <div className="h-full flex flex-col items-center justify-center relative">
          {/* Section title */}
          <motion.div
            className="absolute top-20 text-center z-10 px-6"
            style={{ opacity: titleOpacity, y: titleY }}
          >
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[#2563EB] font-[family-name:var(--font-dm-sans)] mb-4">
              Under the Hood
            </p>
            <h2 className="text-5xl lg:text-6xl font-bold font-[family-name:var(--font-sora)] text-white mb-5">
              Five Layers of{" "}
              <span className="text-gradient-blue">Intelligence</span>
            </h2>
            <p className="text-lg text-slate-400 font-[family-name:var(--font-dm-sans)] max-w-xl mx-auto">
              Scroll to explore what powers your CRM.
            </p>
          </motion.div>

          {/* 3D scene */}
          <div style={{ perspective: 1200 }}>
            <motion.div
              className="preserve-3d relative"
              style={{
                rotateX: sceneRotateX,
                rotateY: sceneRotateY,
                width: 720,
                height: 1000,
              }}
            >
              {LAYERS.map((layer, i) => (
                <StackLayer
                  key={layer.id}
                  layer={layer}
                  index={i}
                  scrollProgress={scrollYProgress}
                />
              ))}
            </motion.div>
          </div>

          {/* Scroll indicator at bottom */}
          <motion.div
            className="absolute bottom-8 flex flex-col items-center gap-2"
            style={{ opacity: titleOpacity }}
          >
            <span className="text-xs text-slate-500 font-[family-name:var(--font-dm-sans)]">
              Keep scrolling
            </span>
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <ChevronDown className="w-4 h-4 text-slate-500" />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ─── Single layer in the 3D stack ─── */
function StackLayer({
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

  // Stack assembly: layers spread very dramatically
  // Starts collapsed, holds, then slowly fans out to massive 200px gaps
  const rawY = useTransform(
    scrollProgress,
    [0, 0.1, 0.2, 0.35, 0.6],
    [0, 0, centerOffset * 30, centerOffset * 120, centerOffset * 200]
  );
  const rawZ = useTransform(
    scrollProgress,
    [0, 0.1, 0.2, 0.35, 0.55],
    [0, 0, (4 - index) * 5, (4 - index) * 20, (4 - index) * 40]
  );

  // Very soft springs for ultra-smooth, slow-feeling motion
  const springCfg = { stiffness: 30, damping: 25 };
  const y = useSpring(rawY, springCfg);
  const z = useSpring(rawZ, springCfg);

  const transform = useTransform(
    [y, z],
    ([yVal, zVal]: number[]) =>
      `translateY(${yVal}px) translateZ(${zVal}px)`
  );

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center will-change-transform"
      style={{ transform }}
    >
      <div
        className="relative w-[720px] h-[140px] rounded-xl border border-white/[0.08] bg-[#0F172A]/95 backdrop-blur-sm overflow-hidden"
        style={{
          boxShadow: `0 -2px 30px ${layer.color}15, inset 0 1px 0 ${layer.color}30`,
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl"
          style={{ backgroundColor: layer.color }}
        />
        <Mockup />
        <div className="absolute bottom-2 right-3 flex items-center gap-2">
          <layer.icon
            className="w-3.5 h-3.5"
            style={{ color: layer.color }}
          />
          <span className="text-[10px] font-semibold text-white/70 font-[family-name:var(--font-dm-sans)]">
            {layer.title}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Desktop: Layer Expansion Cards (non-sticky, scroll-revealed) ─── */
function LayerExpansionSection() {
  return (
    <section className="hidden md:block py-16 px-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {LAYERS.map((layer) => (
          <ExpandableLayerCard key={layer.id} layer={layer} />
        ))}
      </div>
    </section>
  );
}

function ExpandableLayerCard({
  layer,
}: {
  layer: (typeof LAYERS)[number];
}) {
  const Mockup = MOCKUP_COMPONENTS[layer.id];
  const cardRef = useRef<HTMLDivElement>(null);
  const [hasExpanded, setHasExpanded] = useState(false);

  const { scrollYProgress } = useScroll({
    target: cardRef,
    offset: ["start 85%", "start 40%"],
  });

  // Track when card enters view to trigger expansion
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (v > 0.3 && !hasExpanded) setHasExpanded(true);
  });

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ duration: 0.5, delay: 0.05 }}
      className="relative rounded-2xl border border-white/[0.08] bg-[#0F172A]/95 backdrop-blur-sm overflow-hidden"
      style={{
        boxShadow: `0 -2px 40px ${layer.color}20, inset 0 1px 0 ${layer.color}30`,
      }}
    >
      {/* Color top edge */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl z-10"
        style={{ backgroundColor: layer.color }}
      />

      {/* Ambient glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={hasExpanded ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.8 }}
      >
        <div
          className="absolute -top-20 -right-20 w-[300px] h-[300px] rounded-full blur-[100px] opacity-[0.08]"
          style={{ backgroundColor: layer.color }}
        />
      </motion.div>

      <div className="flex flex-col lg:flex-row">
        {/* Mockup side — larger when expanded */}
        <motion.div
          className="relative shrink-0 overflow-hidden"
          animate={
            hasExpanded
              ? { height: "auto", width: "auto" }
              : { height: 140 }
          }
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <div className="lg:w-[420px] h-[180px] lg:h-[220px]">
            <Mockup />
          </div>
          {/* Label — visible when collapsed */}
          <motion.div
            className="absolute bottom-3 right-4 flex items-center gap-2"
            animate={{ opacity: hasExpanded ? 0 : 1 }}
            transition={{ duration: 0.3 }}
          >
            <layer.icon
              className="w-4 h-4"
              style={{ color: layer.color }}
            />
            <span className="text-xs font-semibold text-white/70 font-[family-name:var(--font-dm-sans)]">
              {layer.title}
            </span>
          </motion.div>
        </motion.div>

        {/* Description panel — expands in with richer content */}
        <motion.div
          className="lg:border-l border-t lg:border-t-0 border-white/[0.06] overflow-hidden"
          initial={{ height: 0, opacity: 0 }}
          animate={
            hasExpanded
              ? { height: "auto", opacity: 1 }
              : { height: 0, opacity: 0 }
          }
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <div className="p-8">
            {/* Header with icon and layer number */}
            <div className="flex items-center gap-4 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${layer.color}20` }}
              >
                <layer.icon
                  className="w-5 h-5"
                  style={{ color: layer.color }}
                />
              </div>
              <div>
                <h3
                  className="text-xl font-bold font-[family-name:var(--font-sora)]"
                  style={{ color: layer.color }}
                >
                  {layer.title}
                </h3>
                <p className="text-xs text-slate-500 font-[family-name:var(--font-dm-sans)]">
                  {layer.subtitle}
                </p>
              </div>
            </div>

            {/* Description text */}
            <motion.p
              className="text-sm text-slate-400 font-[family-name:var(--font-dm-sans)] mb-5 leading-relaxed"
              initial={{ opacity: 0 }}
              animate={hasExpanded ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              {layer.description}
            </motion.p>

            {/* Bullet points in a grid for more visual weight */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {layer.bullets.map((bullet, bi) => (
                <motion.div
                  key={bullet}
                  initial={{ opacity: 0, y: 10 }}
                  animate={
                    hasExpanded
                      ? { opacity: 1, y: 0 }
                      : { opacity: 0, y: 10 }
                  }
                  transition={{ duration: 0.4, delay: 0.3 + bi * 0.1 }}
                  className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]"
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0 mt-1"
                    style={{ backgroundColor: layer.color }}
                  />
                  <span className="text-sm text-slate-300 font-[family-name:var(--font-dm-sans)]">
                    {bullet}
                  </span>
                </motion.div>
              ))}
            </div>

            {/* Bottom accent bar */}
            <motion.div
              className="mt-6 h-[1px] rounded-full"
              style={{ backgroundColor: `${layer.color}30` }}
              initial={{ scaleX: 0 }}
              animate={hasExpanded ? { scaleX: 1 } : { scaleX: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
            />
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ─── Mobile: Accordion with descriptions ─── */
function MobileAccordion() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <section className="md:hidden">
      {/* Mobile Hero Intro */}
      <div className="relative min-h-screen flex flex-col items-center justify-center px-4 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-[400px] h-[400px] rounded-full bg-[#2563EB]/15 blur-[100px]" />
        </div>

        <div className="relative z-10 text-center">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[#2563EB] font-[family-name:var(--font-dm-sans)] mb-4">
            AI-Powered Real Estate CRM
          </p>
          <h1 className="text-3xl font-bold font-[family-name:var(--font-sora)] text-white mb-4 leading-[1.15]">
            The AI-Powered CRM{" "}
            <span className="text-gradient-blue">Built for Real Estate</span>
          </h1>
          <p className="text-sm text-slate-400 font-[family-name:var(--font-dm-sans)] max-w-md mx-auto mb-8">
            Manage your pipeline, nurture leads, and close deals faster with
            intelligent automation.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 text-sm font-semibold text-white rounded-xl transition-all hover:shadow-lg hover:shadow-[#F97316]/25 font-[family-name:var(--font-dm-sans)]"
              style={{ backgroundColor: "#F97316" }}
            >
              Start Free Trial
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/features"
              className="inline-flex items-center justify-center px-8 py-3.5 text-sm font-semibold text-white rounded-xl border border-[#2563EB]/40 hover:border-[#2563EB]/70 hover:bg-[#2563EB]/10 transition-all font-[family-name:var(--font-dm-sans)]"
            >
              See Features
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile Five Layers */}
      <div className="py-24 px-4">
        <div className="text-center mb-8">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[#2563EB] font-[family-name:var(--font-dm-sans)] mb-3">
            Under the Hood
          </p>
          <h2 className="text-3xl font-bold font-[family-name:var(--font-sora)] text-white mb-4">
            Five Layers of{" "}
            <span className="text-gradient-blue">Intelligence</span>
          </h2>
          <p className="text-sm text-slate-400 font-[family-name:var(--font-dm-sans)] max-w-md mx-auto">
            Tap each layer to see what powers your CRM.
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
                  style={{
                    borderColor: isExpanded ? `${layer.color}40` : undefined,
                  }}
                >
                  <layer.icon
                    className="w-5 h-5 shrink-0"
                    style={{ color: layer.color }}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white font-[family-name:var(--font-dm-sans)]">
                      {layer.title}
                    </p>
                    <p className="text-xs text-slate-400 font-[family-name:var(--font-dm-sans)]">
                      {layer.subtitle}
                    </p>
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
                      <div
                        className="mt-2 rounded-xl border border-white/[0.08] bg-[#0F172A] overflow-hidden"
                        style={{ boxShadow: `0 0 20px ${layer.color}10` }}
                      >
                        <div
                          className="h-[2px] w-full"
                          style={{ backgroundColor: layer.color }}
                        />
                        <div className="relative h-[120px] overflow-hidden">
                          <Mockup />
                        </div>
                        <div className="px-4 pb-4 pt-2 border-t border-white/[0.06]">
                          <ul className="space-y-1.5">
                            {layer.bullets.map((bullet) => (
                              <li
                                key={bullet}
                                className="flex items-center gap-2 text-xs text-slate-300 font-[family-name:var(--font-dm-sans)]"
                              >
                                <div
                                  className="w-1 h-1 rounded-full shrink-0"
                                  style={{ backgroundColor: layer.color }}
                                />
                                {bullet}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ─── Main Export ─── */
export default function HeroExplodedView() {
  const reduced = useReducedMotion() ?? false;

  if (reduced) {
    return <MobileAccordion />;
  }

  return (
    <>
      {/* Mobile */}
      <MobileAccordion />

      {/* Desktop: Part A — CRM Intro Hero */}
      <div className="hidden md:block">
        <HeroIntro />
      </div>

      {/* Desktop: Part B — 3D Stack Assembly (sticky scroll) */}
      <StackAssembly />

      {/* Desktop: Part C — Layer Expansion Cards (scroll-revealed) */}
      <LayerExpansionSection />
    </>
  );
}
