"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  Kanban,
  MessageSquare,
  BarChart3,
  Settings,
  Bell,
  Search,
  Plus,
  TrendingUp,
  DollarSign,
  Phone,
  Mail,
  FileText,
  Home,
  ChevronRight,
  Bot,
} from "lucide-react";

/* ─── Data ─── */
const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Users, label: "Contacts" },
  { icon: Kanban, label: "Pipeline" },
  { icon: MessageSquare, label: "Chat" },
  { icon: BarChart3, label: "Analytics" },
  { icon: Settings, label: "Settings" },
];

const KPIS = [
  { label: "Active Deals", value: "47", change: "+12%", icon: TrendingUp, color: "#3B82F6" },
  { label: "Pipeline Value", value: "$8.4M", change: "+23%", icon: DollarSign, color: "#10B981" },
  { label: "Contacts", value: "1,284", change: "+8%", icon: Users, color: "#8B5CF6" },
  { label: "Closed MTD", value: "$1.2M", change: "+31%", icon: TrendingUp, color: "#F97316" },
];

const PIPELINE_STAGES = [
  { name: "Lead", count: 12, color: "#64748B", width: "100%" },
  { name: "Contacted", count: 8, color: "#3B82F6", width: "67%" },
  { name: "Touring", count: 5, color: "#06B6D4", width: "42%" },
  { name: "Offer", count: 3, color: "#F97316", width: "25%" },
  { name: "Closed", count: 2, color: "#22C55E", width: "17%" },
];

const ACTIVITIES = [
  { icon: Phone, text: "Called Sarah Johnson", time: "2m ago", color: "#3B82F6" },
  { icon: Mail, text: "Email sent to Mark T.", time: "15m ago", color: "#10B981" },
  { icon: FileText, text: "Added buyer notes", time: "1h ago", color: "#F59E0B" },
  { icon: Home, text: "Toured 350 Fifth Ave", time: "3h ago", color: "#8B5CF6" },
];

/* ─── Dashboard face (rendered twice: front + mirrored back) ─── */
function DashboardFace() {
  return (
    <>
      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06]">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444]/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]/70" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#22C55E]/70" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06]">
            <Search className="w-3 h-3 text-slate-500" />
            <span className="text-[10px] text-slate-500 font-[family-name:var(--font-dm-sans)]">
              Search contacts, deals...
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Bell className="w-3.5 h-3.5 text-slate-500" />
            <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
          </div>
          <div className="w-5 h-5 rounded-full bg-[#3B82F6] flex items-center justify-center">
            <span className="text-[7px] font-bold text-white">JD</span>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* ── Sidebar ── */}
        <div className="w-[52px] border-r border-white/[0.06] py-3 flex flex-col items-center gap-1">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#3B82F6] to-[#2563EB] flex items-center justify-center mb-3">
            <span className="text-[8px] font-bold text-white font-[family-name:var(--font-sora)]">CL</span>
          </div>
          {NAV_ITEMS.map((item) => (
            <div
              key={item.label}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                item.active ? "bg-[#3B82F6]/15" : "hover:bg-white/[0.04]"
              }`}
            >
              <item.icon
                className="w-3.5 h-3.5"
                style={{ color: item.active ? "#3B82F6" : "#475569" }}
              />
            </div>
          ))}
          <div className="flex-1" />
          <div className="w-8 h-8 rounded-lg bg-[#F97316]/15 flex items-center justify-center">
            <Bot className="w-3.5 h-3.5 text-[#F97316]" />
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="flex-1 p-3 space-y-3 min-h-[340px]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[11px] font-bold text-white font-[family-name:var(--font-sora)]">
                Dashboard
              </h3>
              <p className="text-[8px] text-slate-500 font-[family-name:var(--font-dm-sans)]">
                Welcome back, John
              </p>
            </div>
            <button className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#F97316] text-white">
              <Plus className="w-2.5 h-2.5" />
              <span className="text-[8px] font-semibold font-[family-name:var(--font-dm-sans)]">New</span>
            </button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-4 gap-2">
            {KPIS.map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-lg border border-white/[0.06] bg-white/[0.03] p-2"
              >
                <div className="flex items-center gap-1 mb-1.5">
                  <div
                    className="w-4 h-4 rounded flex items-center justify-center"
                    style={{ backgroundColor: `${kpi.color}20` }}
                  >
                    <kpi.icon className="w-2.5 h-2.5" style={{ color: kpi.color }} />
                  </div>
                </div>
                <p className="text-[11px] font-bold text-white font-[family-name:var(--font-sora)]">
                  {kpi.value}
                </p>
                <span className="text-[7px] text-slate-500 font-[family-name:var(--font-dm-sans)]">
                  {kpi.label}
                </span>
                <br />
                <span className="text-[7px] font-semibold" style={{ color: kpi.color }}>
                  {kpi.change}
                </span>
              </div>
            ))}
          </div>

          {/* Pipeline + Activity */}
          <div className="grid grid-cols-5 gap-2">
            <div className="col-span-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-semibold text-white font-[family-name:var(--font-dm-sans)]">
                  Pipeline
                </span>
                <ChevronRight className="w-3 h-3 text-slate-600" />
              </div>
              <div className="space-y-1.5">
                {PIPELINE_STAGES.map((stage) => (
                  <div key={stage.name} className="flex items-center gap-2">
                    <span className="text-[7px] text-slate-500 font-[family-name:var(--font-dm-sans)] w-[50px] text-right shrink-0">
                      {stage.name}
                    </span>
                    <div className="flex-1 h-[10px] bg-white/[0.04] rounded overflow-hidden">
                      <motion.div
                        className="h-full rounded"
                        style={{ backgroundColor: stage.color, width: stage.width }}
                        initial={{ width: 0 }}
                        animate={{ width: stage.width }}
                        transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
                      />
                    </div>
                    <span className="text-[7px] text-slate-400 font-[family-name:var(--font-dm-sans)] w-3 text-right">
                      {stage.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="col-span-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-semibold text-white font-[family-name:var(--font-dm-sans)]">
                  Recent
                </span>
                <ChevronRight className="w-3 h-3 text-slate-600" />
              </div>
              <div className="space-y-2">
                {ACTIVITIES.map((act, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5"
                      style={{ backgroundColor: `${act.color}20` }}
                    >
                      <act.icon className="w-2 h-2" style={{ color: act.color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[8px] text-slate-300 font-[family-name:var(--font-dm-sans)] truncate">
                        {act.text}
                      </p>
                      <p className="text-[7px] text-slate-600 font-[family-name:var(--font-dm-sans)]">
                        {act.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Card shell (shared styling for front + back) ─── */
const CARD_CLASSES =
  "absolute inset-0 w-[540px] xl:w-[600px] rounded-2xl border border-white/[0.12] overflow-hidden select-none";
const CARD_BG = "linear-gradient(145deg, #0F172A 0%, #131E35 50%, #0F172A 100%)";

/* ─── Main component ─── */
export default function HeroDashboardMockup() {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;

  const [showHint, setShowHint] = useState(true);

  // Physics state kept in refs to avoid re-renders on every frame
  const rotationRef = useRef(0);        // current Y rotation in degrees
  const velocityRef = useRef(0);        // degrees per frame
  const lastMouseXRef = useRef(0);      // last cursor X
  const isHoveringRef = useRef(false);
  const hasInteractedRef = useRef(false);
  const tiltXRef = useRef(0);           // subtle vertical tilt from cursor Y
  const frameRef = useRef<number>(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const sheenRef = useRef<HTMLDivElement>(null);
  const sheenBackRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);

  // Animation loop — runs continuously, applies rotation + friction
  useEffect(() => {
    if (reduced) return;

    const FRICTION = 0.96;          // velocity decay per frame (lower = more friction)

    const tick = () => {
      // Apply friction
      velocityRef.current *= FRICTION;

      // Clamp tiny values to zero
      if (Math.abs(velocityRef.current) < 0.001) velocityRef.current = 0;

      // Update rotation
      rotationRef.current += velocityRef.current;

      // When slowing down and not hovering, gently continue in the same
      // direction until we land on a front-facing position (multiple of 360).
      if (Math.abs(velocityRef.current) < 0.4 && !isHoveringRef.current) {
        // Figure out the next front-face in the direction we're already going
        const dir = velocityRef.current >= 0 ? 1 : -1;
        const mod = ((rotationRef.current % 360) + 360) % 360; // 0-359
        let remaining: number;
        if (dir >= 0) {
          remaining = mod < 1 ? 0 : 360 - mod; // how far to next 360 boundary going forward
        } else {
          remaining = mod < 1 ? 0 : mod; // how far going backward
        }

        if (remaining < 1) {
          // Close enough — snap and stop
          rotationRef.current = Math.round(rotationRef.current / 360) * 360;
          velocityRef.current = 0;
        } else {
          // Keep drifting in the same direction, speed proportional to remaining distance
          const nudge = Math.min(remaining * 0.03, 0.6) * dir;
          velocityRef.current = nudge;
        }
      }

      // Smooth tilt X toward 0 when not hovering
      if (!isHoveringRef.current) {
        tiltXRef.current *= 0.95;
      }

      // Apply transform directly to DOM (no React re-render)
      if (cardRef.current) {
        cardRef.current.style.transform =
          `rotateX(${tiltXRef.current}deg) rotateY(${rotationRef.current}deg)`;
      }

      // Update sheen based on rotation
      if (sheenRef.current) {
        const angle = 115 + (rotationRef.current % 360) * 0.3;
        sheenRef.current.style.background = `linear-gradient(${angle}deg, transparent 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.02) 60%, transparent 100%)`;
      }
      if (sheenBackRef.current) {
        const angle = 115 - (rotationRef.current % 360) * 0.3;
        sheenBackRef.current.style.background = `linear-gradient(${angle}deg, transparent 0%, rgba(255,255,255,0.02) 40%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.02) 60%, transparent 100%)`;
      }

      // Shadow intensity based on whether it's moving
      if (shadowRef.current) {
        const speed = Math.abs(velocityRef.current);
        const intensity = Math.min(0.6, 0.25 + speed * 0.05);
        shadowRef.current.style.opacity = String(intensity);
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [reduced]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (reduced) return;
      const el = containerRef.current;
      if (!el) return;

      // Horizontal velocity from cursor movement
      const dx = e.clientX - lastMouseXRef.current;
      lastMouseXRef.current = e.clientX;

      // Scale cursor delta to rotation velocity
      // Faster cursor → faster spin (kept gentle)
      velocityRef.current += dx * 0.04;

      // Subtle vertical tilt from cursor Y position
      const rect = el.getBoundingClientRect();
      const py = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      tiltXRef.current = py * -6;
    },
    [reduced]
  );

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent) => {
      isHoveringRef.current = true;
      lastMouseXRef.current = e.clientX;
      if (!hasInteractedRef.current) {
        hasInteractedRef.current = true;
        setShowHint(false);
      }
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    isHoveringRef.current = false;
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center"
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ perspective: 1200 }}
    >
      {/* Hint label */}
      <AnimatePresence>
        {showHint && (
          <motion.div
            className="absolute bottom-[2%] left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 pointer-events-none"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            {/* Animated cursor icon */}
            <motion.svg
              width="16" height="16" viewBox="0 0 16 16" fill="none"
              className="text-slate-500"
              animate={{ x: [0, 6, 0, -6, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <path
                d="M3 2l8.5 5.5-3.5.5 2 4.5-1.5.7-2-4.5L4 11z"
                fill="currentColor"
                opacity="0.6"
              />
            </motion.svg>
            <span className="text-[11px] text-slate-500/70 font-[family-name:var(--font-dm-sans)]">
              Hover to interact
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating shadow beneath */}
      <div
        ref={shadowRef}
        className="absolute bottom-[8%] left-1/2 -translate-x-1/2 w-[80%] h-[30px] rounded-[50%] blur-[30px]"
        style={{
          background: "radial-gradient(ellipse, rgba(37,99,235,0.35), transparent 70%)",
          opacity: 0.3,
        }}
      />

      {/* 3D card container */}
      <div
        ref={cardRef}
        style={{
          transformStyle: "preserve-3d",
          transition: "none",
          width: "fit-content",
        }}
      >
        {/* ── Front face ── */}
        <div
          className={CARD_CLASSES}
          style={{
            position: "relative",
            background: CARD_BG,
            boxShadow:
              "0 25px 70px rgba(37,99,235,0.15), 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
          }}
        >
          <DashboardFace />
          {/* Sheen */}
          <div
            ref={sheenRef}
            className="absolute inset-0 pointer-events-none"
          />
        </div>

        {/* ── Back face (mirrored so content reads correctly) ── */}
        <div
          className={CARD_CLASSES}
          style={{
            background: CARD_BG,
            boxShadow:
              "0 25px 70px rgba(37,99,235,0.15), 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)",
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <DashboardFace />
          {/* Sheen */}
          <div
            ref={sheenBackRef}
            className="absolute inset-0 pointer-events-none"
          />
        </div>
      </div>
    </div>
  );
}
