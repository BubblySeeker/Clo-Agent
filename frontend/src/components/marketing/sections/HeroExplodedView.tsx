"use client";

import { useState } from "react";
import {
  motion,
  useReducedMotion,
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
import HeroDashboardMockup from "./HeroDashboardMockup";
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

/* ─── Desktop: Split-screen hero with interactive dashboard mockup ─── */
function DesktopHero() {
  return (
    <section className="relative hidden md:block min-h-screen overflow-hidden">
      {/* Radial glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
        <div className="w-[900px] h-[900px] rounded-full bg-[#2563EB]/20 blur-[160px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-10 h-screen flex items-center">
        {/* Left: Text + CTA */}
        <motion.div
          className="w-1/2 pr-8 xl:pr-12"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7 }}
        >
          <p className="text-xs font-semibold tracking-[0.25em] uppercase text-[#2563EB] font-[family-name:var(--font-dm-sans)] mb-5">
            AI-Powered Real Estate CRM
          </p>
          <h1 className="text-5xl lg:text-6xl xl:text-7xl font-bold font-[family-name:var(--font-sora)] text-white mb-6 leading-[1.08]">
            The Future of{" "}
            <span className="text-gradient-blue">CRMs</span>
          </h1>
          <p className="text-lg lg:text-xl text-slate-400 font-[family-name:var(--font-dm-sans)] mb-10 leading-relaxed">
            Five intelligent layers working together to manage your pipeline, nurture leads, and close deals faster.
          </p>
          <div className="flex items-center gap-4">
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
          </div>
        </motion.div>

        {/* Right: Interactive dashboard mockup */}
        <motion.div
          className="w-1/2 h-[500px] xl:h-[520px]"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          <HeroDashboardMockup />
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-20"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
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
      {/* Mobile only */}
      <div className="md:hidden">
        <MobileAccordion />
      </div>

      {/* Desktop: Split-screen hero with scroll-driven stack animation */}
      <DesktopHero />
    </>
  );
}
