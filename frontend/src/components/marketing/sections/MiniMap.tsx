"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const SECTIONS = [
  { id: "pipeline", label: "Pipeline", color: "#3B82F6" },
  { id: "ai-chat", label: "AI Chat", color: "#F97316" },
  { id: "analytics", label: "Analytics", color: "#8B5CF6" },
  { id: "contacts", label: "Contacts", color: "#10B981" },
  { id: "security", label: "Security", color: "#EF4444" },
];

export default function MiniMap() {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show after scrolling past ~100vh
      setVisible(window.scrollY > window.innerHeight);

      // Determine active section
      const sections = SECTIONS.map((s) => document.getElementById(`section-${s.id}`));
      let currentIndex = -1;
      for (let i = sections.length - 1; i >= 0; i--) {
        const el = sections[i];
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= window.innerHeight * 0.5) {
            currentIndex = i;
            break;
          }
        }
      }
      setActiveIndex(currentIndex);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(`section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="fixed right-6 top-1/2 -translate-y-1/2 z-40 hidden md:flex flex-col items-center gap-4"
        >
          {SECTIONS.map((section, i) => {
            const isActive = i === activeIndex;
            return (
              <button
                key={section.id}
                onClick={() => scrollToSection(section.id)}
                className="group relative flex items-center"
                aria-label={`Scroll to ${section.label}`}
              >
                {/* Tooltip */}
                <span className="absolute right-full mr-3 text-xs text-white/70 font-[family-name:var(--font-dm-sans)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {section.label}
                </span>

                {/* Dot */}
                <motion.div
                  animate={{
                    scale: isActive ? 1.5 : 1,
                    boxShadow: isActive ? `0 0 12px ${section.color}60` : "0 0 0px transparent",
                  }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className="w-2.5 h-2.5 rounded-full transition-colors"
                  style={{ backgroundColor: isActive ? section.color : `${section.color}40` }}
                />
              </button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
