"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useInView, useReducedMotion } from "framer-motion";
import { Brain, Clock, MapPin, DollarSign, Bed, Bath, CheckCircle2 } from "lucide-react";

const CONTACT = {
  name: "Sarah Johnson",
  email: "sarah@example.com",
  phone: "(555) 123-4567",
  source: "Zillow",
  initials: "SJ",
  color: "#3B82F6",
};

const VIEWS = ["Overview", "Buyer Profile", "AI Profile", "Activity History"] as const;

const JOURNEY_STEPS = [
  { stage: "Lead", date: "Jan 5", done: true },
  { stage: "Contacted", date: "Jan 8", done: true },
  { stage: "Touring", date: "Jan 15", done: true },
  { stage: "Offer", date: "Feb 2", done: true },
  { stage: "Under Contract", date: "Feb 10", done: false },
  { stage: "Closed", date: "", done: false },
];

function OverviewView() {
  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: CONTACT.color }}>
          {CONTACT.initials}
        </div>
        <div>
          <p className="text-sm font-semibold text-white font-[family-name:var(--font-dm-sans)]">{CONTACT.name}</p>
          <p className="text-xs text-slate-400 font-[family-name:var(--font-dm-sans)]">{CONTACT.source} Lead</p>
        </div>
      </div>
      <div className="space-y-2 text-xs text-slate-300 font-[family-name:var(--font-dm-sans)]">
        <p>✉️ {CONTACT.email}</p>
        <p>📱 {CONTACT.phone}</p>
        <p>📍 Looking in Westside</p>
      </div>
      <div className="flex gap-2 mt-4">
        <span className="text-[10px] px-2 py-1 rounded-full bg-[#3B82F6]/15 text-[#3B82F6] border border-[#3B82F6]/20">Active</span>
        <span className="text-[10px] px-2 py-1 rounded-full bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/20">Pre-Approved</span>
      </div>
    </div>
  );
}

function BuyerProfileView() {
  return (
    <div className="p-5 space-y-4">
      <h4 className="text-xs font-semibold text-[#10B981] font-[family-name:var(--font-dm-sans)] uppercase tracking-wider">Buyer Profile</h4>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-3.5 h-3.5 text-[#10B981]" />
          <div>
            <p className="text-[10px] text-slate-500">Budget</p>
            <p className="text-xs text-white font-semibold">$800K - $1.2M</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Bed className="w-3.5 h-3.5 text-[#10B981]" />
          <div>
            <p className="text-[10px] text-slate-500">Beds</p>
            <p className="text-xs text-white font-semibold">3-4</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Bath className="w-3.5 h-3.5 text-[#10B981]" />
          <div>
            <p className="text-[10px] text-slate-500">Baths</p>
            <p className="text-xs text-white font-semibold">2+</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-[#10B981]" />
          <div>
            <p className="text-[10px] text-slate-500">Location</p>
            <p className="text-xs text-white font-semibold">Westside</p>
          </div>
        </div>
      </div>
      <div>
        <p className="text-[10px] text-slate-500 mb-1">Must-haves</p>
        <div className="flex flex-wrap gap-1">
          {["Garage", "Updated Kitchen", "Good Schools"].map((t) => (
            <span key={t} className="text-[9px] px-2 py-0.5 rounded-full bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20">{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function AIProfileView() {
  const [typing, setTyping] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setTyping(false), 1500);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="p-5">
      <h4 className="text-xs font-semibold text-[#10B981] font-[family-name:var(--font-dm-sans)] uppercase tracking-wider mb-3">AI Profile</h4>
      <div className="flex items-center gap-2 mb-3">
        <Brain className="w-4 h-4 text-[#F97316]" />
        <span className="text-xs text-slate-400 font-[family-name:var(--font-dm-sans)]">Generated Summary</span>
      </div>
      {typing ? (
        <div className="space-y-2">
          <div className="h-2 bg-white/[0.08] rounded-full animate-pulse w-full" />
          <div className="h-2 bg-white/[0.08] rounded-full animate-pulse w-4/5" />
          <div className="h-2 bg-white/[0.08] rounded-full animate-pulse w-3/5" />
        </div>
      ) : (
        <p className="text-xs text-slate-300 font-[family-name:var(--font-dm-sans)] leading-relaxed">
          Sarah is a motivated first-time buyer with strong financial readiness. She prioritizes proximity to good schools and modern amenities. Response rate is high — she typically replies within 2 hours. Recommend focusing on Westside listings with updated kitchens.
        </p>
      )}
    </div>
  );
}

function ActivityHistoryView() {
  const activities = [
    { type: "call", text: "Discussed pricing range", time: "2h ago" },
    { type: "showing", text: "Toured 350 Fifth Ave", time: "Yesterday" },
    { type: "email", text: "Sent comparable listings", time: "3 days ago" },
    { type: "note", text: "Prefers south-facing units", time: "1 week ago" },
  ];
  return (
    <div className="p-5">
      <h4 className="text-xs font-semibold text-[#10B981] font-[family-name:var(--font-dm-sans)] uppercase tracking-wider mb-3">Activity History</h4>
      <div className="space-y-3">
        {activities.map((a, i) => (
          <div key={i} className="flex items-start gap-2">
            <Clock className="w-3 h-3 text-slate-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-slate-300 font-[family-name:var(--font-dm-sans)]">{a.text}</p>
              <p className="text-[10px] text-slate-500">{a.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const VIEW_COMPONENTS = [OverviewView, BuyerProfileView, AIProfileView, ActivityHistoryView];

export default function ContactIntelligenceSection() {
  const [activeView, setActiveView] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const reduced = useReducedMotion() ?? false;

  // Auto-rotate views
  useEffect(() => {
    if (!inView) return;
    const interval = setInterval(() => {
      setActiveView((v) => (v + 1) % VIEWS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [inView]);

  const ViewComponent = VIEW_COMPONENTS[activeView];

  return (
    <section id="section-contacts" className="relative py-24 lg:py-32" ref={ref}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <span className="text-xs font-semibold tracking-[0.2em] uppercase text-[#10B981] font-[family-name:var(--font-dm-sans)]">
            Layer 4
          </span>
          <h2 className="mt-4 text-4xl lg:text-5xl font-bold font-[family-name:var(--font-sora)] text-white">
            Contact <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg, #10B981, #34D399)" }}>Intelligence</span>
          </h2>
          <p className="mt-4 text-lg text-slate-400 font-[family-name:var(--font-dm-sans)] max-w-xl mx-auto">
            Every contact is a complete picture — profile, preferences, history, and AI insights.
          </p>
        </motion.div>

        {/* Split layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Left: Contact card with view switcher */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            {/* View tabs */}
            <div className="flex gap-1 mb-4 overflow-x-auto">
              {VIEWS.map((view, i) => (
                <button
                  key={view}
                  onClick={() => setActiveView(i)}
                  className={`text-[11px] px-3 py-1.5 rounded-lg font-[family-name:var(--font-dm-sans)] transition-colors whitespace-nowrap ${
                    activeView === i
                      ? "bg-[#10B981]/20 text-[#10B981] font-semibold"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {view}
                </button>
              ))}
            </div>

            {/* Card with 3D flip */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] overflow-hidden min-h-[280px]" style={{ perspective: 800 }}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeView}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, rotateY: 90 }}
                  animate={{ opacity: 1, rotateY: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, rotateY: -90 }}
                  transition={{ duration: 0.4 }}
                >
                  <ViewComponent />
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Right: Journey timeline */}
          <motion.div
            className="flex items-center"
            initial={{ opacity: 0, x: 30 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            <div className="w-full">
              <h3 className="text-sm font-semibold text-white font-[family-name:var(--font-dm-sans)] mb-8">
                Contact Journey
              </h3>
              <div className="relative">
                {/* Progress line */}
                <div className="absolute left-4 top-0 bottom-0 w-px bg-white/[0.08]" />
                <motion.div
                  className="absolute left-4 top-0 w-px bg-[#10B981]"
                  initial={{ height: 0 }}
                  animate={inView ? { height: "66%" } : { height: 0 }}
                  transition={{ delay: 0.6, duration: 1.2, ease: "easeOut" }}
                />

                <div className="space-y-8">
                  {JOURNEY_STEPS.map((step, i) => (
                    <motion.div
                      key={step.stage}
                      className="flex items-center gap-4 relative"
                      initial={reduced ? false : { opacity: 0, x: 20 }}
                      animate={inView ? { opacity: 1, x: 0 } : {}}
                      transition={{ delay: 0.5 + i * 0.15 }}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 shrink-0 ${
                        step.done ? "bg-[#10B981]/20" : "bg-white/[0.04]"
                      }`}>
                        {step.done ? (
                          <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-slate-600" />
                        )}
                      </div>
                      <div>
                        <p className={`text-sm font-[family-name:var(--font-dm-sans)] ${step.done ? "text-white font-semibold" : "text-slate-500"}`}>
                          {step.stage}
                        </p>
                        {step.date && (
                          <p className="text-[10px] text-slate-500 font-[family-name:var(--font-dm-sans)]">{step.date}</p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
