"use client";

import { useRef, useState, useCallback } from "react";
import { motion, MotionValue, useTransform, useSpring } from "framer-motion";
import { LayoutDashboard, Bot, BarChart3, Users, Shield } from "lucide-react";
import { MOCKUP_COMPONENTS } from "./LayerMockups";

export const LAYERS = [
  { id: "pipeline" as const, title: "UI Interface", subtitle: "Pipeline kanban, deal cards, drag-and-drop", color: "#3B82F6", icon: LayoutDashboard },
  { id: "ai" as const, title: "AI Intelligence", subtitle: "Chat, smart suggestions, tool execution", color: "#F97316", icon: Bot },
  { id: "analytics" as const, title: "Analytics & Insights", subtitle: "Charts, metrics, conversion tracking", color: "#8B5CF6", icon: BarChart3 },
  { id: "contacts" as const, title: "Contact Database", subtitle: "Buyer profiles, activity history", color: "#10B981", icon: Users },
  { id: "security" as const, title: "Security & Infrastructure", subtitle: "Row-level security, encryption", color: "#EF4444", icon: Shield },
] as const;

export type LayerId = (typeof LAYERS)[number]["id"];

interface LayerCardProps {
  layer: (typeof LAYERS)[number];
  index: number;
  scrollProgress: MotionValue<number>;
  totalLayers: number;
}

export function LayerCard({ layer, index, scrollProgress, totalLayers }: LayerCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [glowPosition, setGlowPosition] = useState({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState(false);

  const Mockup = MOCKUP_COMPONENTS[layer.id];
  const centerOffset = index - Math.floor(totalLayers / 2);

  // Each layer peels off at a different scroll range
  const peelStart = 0.15 + index * 0.14;
  const peelEnd = peelStart + 0.12;

  // Stack assembly (0-15%)
  const assembleY = useTransform(scrollProgress, [0, 0.15], [0, centerOffset * 90]);
  const assembleZ = useTransform(scrollProgress, [0, 0.15], [0, (totalLayers - 1 - index) * 18]);

  // Peel off (layer-specific range)
  const peelX = useTransform(scrollProgress, [peelStart, peelEnd], [0, index % 2 === 0 ? -1200 : 1200]);
  const peelOpacity = useTransform(scrollProgress, [peelStart, peelEnd - 0.02], [1, 0]);
  const peelRotate = useTransform(scrollProgress, [peelStart, peelEnd], [0, index % 2 === 0 ? -15 : 15]);

  const springConfig = { stiffness: 120, damping: 30 };
  const y = useSpring(assembleY, springConfig);
  const z = useSpring(assembleZ, springConfig);
  const x = useSpring(peelX, springConfig);
  const opacity = useSpring(peelOpacity, springConfig);
  const rotate = useSpring(peelRotate, springConfig);

  const transform = useTransform(
    [y, z, x, rotate],
    ([yVal, zVal, xVal, rotVal]: number[]) =>
      `translateY(${yVal}px) translateZ(${zVal}px) translateX(${xVal}px) rotate(${rotVal}deg)`
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setGlowPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center will-change-transform"
      style={{ transform, opacity }}
    >
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative w-[720px] h-[140px] rounded-xl border border-white/[0.08] bg-[#0F172A]/95 backdrop-blur-sm overflow-hidden"
        style={{
          boxShadow: `0 -2px 30px ${layer.color}15, inset 0 1px 0 ${layer.color}30`,
        }}
      >
        {/* Color top edge */}
        <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-xl" style={{ backgroundColor: layer.color }} />

        {/* Cursor proximity glow */}
        {isHovered && (
          <div
            className="absolute pointer-events-none z-10 w-[200px] h-[200px] rounded-full opacity-[0.12]"
            style={{
              left: glowPosition.x - 100,
              top: glowPosition.y - 100,
              background: `radial-gradient(circle, ${layer.color}, transparent 70%)`,
            }}
          />
        )}

        {/* Mockup content */}
        <Mockup />

        {/* Label overlay - bottom right */}
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
