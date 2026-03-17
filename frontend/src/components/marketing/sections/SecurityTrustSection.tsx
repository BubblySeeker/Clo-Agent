"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { Shield, Lock, Key, Database, UserCheck } from "lucide-react";

const RINGS = [
  { label: "Agent Isolation", icon: UserCheck, radius: 60, color: "#EF4444", delay: 0 },
  { label: "Encryption", icon: Lock, radius: 95, color: "#F97316", delay: 0.3 },
  { label: "Row-Level Security", icon: Database, radius: 130, color: "#8B5CF6", delay: 0.6 },
  { label: "JWT Validation", icon: Key, radius: 165, color: "#3B82F6", delay: 0.9 },
  { label: "Clerk Authentication", icon: Shield, radius: 200, color: "#10B981", delay: 1.2 },
];

const TRUST_BADGES = [
  { label: "SOC 2 Ready", desc: "Enterprise-grade compliance" },
  { label: "Data Isolation", desc: "Per-agent row-level security" },
  { label: "Encrypted at Rest", desc: "AES-256 encryption" },
  { label: "Zero Trust", desc: "Every request authenticated" },
];

export default function SecurityTrustSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const reduced = useReducedMotion() ?? false;

  return (
    <section id="section-security" className="relative py-24 lg:py-32" ref={ref}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <span className="text-xs font-semibold tracking-[0.2em] uppercase text-[#EF4444] font-[family-name:var(--font-josefin)]">
            Layer 5
          </span>
          <h2 className="mt-4 text-4xl lg:text-5xl font-bold font-[family-name:var(--font-cinzel)] text-white">
            Security & <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg, #EF4444, #F87171)" }}>Trust</span>
          </h2>
          <p className="mt-4 text-lg text-slate-400 font-[family-name:var(--font-josefin)] max-w-xl mx-auto">
            Five concentric layers of protection around every piece of data.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: SVG rings */}
          <motion.div
            className="flex justify-center"
            initial={{ opacity: 0 }}
            animate={inView ? { opacity: 1 } : {}}
            transition={{ duration: 0.6 }}
          >
            <div className="relative" style={{ width: 440, height: 440 }}>
              <svg viewBox="0 0 440 440" className="w-full h-full">
                {RINGS.map((ring) => {
                  const circumference = 2 * Math.PI * ring.radius;
                  return (
                    <motion.circle
                      key={ring.label}
                      cx="220"
                      cy="220"
                      r={ring.radius}
                      fill="none"
                      stroke={ring.color}
                      strokeWidth="2"
                      strokeDasharray={circumference}
                      initial={{ strokeDashoffset: circumference, opacity: 0.3 }}
                      animate={inView ? { strokeDashoffset: 0, opacity: 1 } : {}}
                      transition={{
                        strokeDashoffset: { delay: ring.delay, duration: 1.5, ease: "easeInOut" },
                        opacity: { delay: ring.delay, duration: 0.3 },
                      }}
                      style={{ transformOrigin: "center" }}
                    />
                  );
                })}
              </svg>

              {/* Center shield */}
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  className="w-16 h-16 rounded-full bg-[#EF4444]/20 flex items-center justify-center"
                  animate={reduced ? {} : { boxShadow: ["0 0 20px #EF444440", "0 0 40px #EF444460", "0 0 20px #EF444440"] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Shield className="w-8 h-8 text-[#EF4444]" />
                </motion.div>
              </div>

              {/* Ring labels - positioned around the rings */}
              {RINGS.map((ring, i) => {
                const angle = -90 + i * 72;
                const rad = (angle * Math.PI) / 180;
                const labelRadius = ring.radius + 25;
                const lx = 220 + Math.cos(rad) * labelRadius;
                const ly = 220 + Math.sin(rad) * labelRadius;
                return (
                  <motion.div
                    key={ring.label}
                    className="absolute flex items-center gap-1.5"
                    style={{
                      left: lx,
                      top: ly,
                      transform: "translate(-50%, -50%)",
                    }}
                    initial={{ opacity: 0 }}
                    animate={inView ? { opacity: 1 } : {}}
                    transition={{ delay: ring.delay + 1 }}
                  >
                    <ring.icon className="w-3 h-3" style={{ color: ring.color }} />
                    <span className="text-[9px] font-semibold text-white/70 font-[family-name:var(--font-josefin)] whitespace-nowrap">
                      {ring.label}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* Right: Trust badges */}
          <div className="space-y-4">
            {TRUST_BADGES.map((badge, i) => (
              <motion.div
                key={badge.label}
                className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-5 flex items-start gap-4"
                initial={reduced ? false : { opacity: 0, x: 30 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.5 + i * 0.2 }}
              >
                <div className="w-10 h-10 rounded-lg bg-[#EF4444]/10 flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5 text-[#EF4444]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white font-[family-name:var(--font-josefin)]">{badge.label}</p>
                  <p className="text-xs text-slate-400 font-[family-name:var(--font-josefin)] mt-0.5">{badge.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
