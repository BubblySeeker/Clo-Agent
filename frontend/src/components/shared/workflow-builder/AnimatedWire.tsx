"use client";

import { useRef } from "react";
import { X } from "lucide-react";

interface AnimatedWireProps {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  animated?: boolean;
  edgeId?: string;
  selected?: boolean;
  onSelect?: (edgeId: string) => void;
  onDelete?: (edgeId: string) => void;
}

export default function AnimatedWire({
  fromX,
  fromY,
  toX,
  toY,
  color,
  animated = true,
  edgeId,
  selected = false,
  onSelect,
  onDelete,
}: AnimatedWireProps) {
  const pathRef = useRef<SVGPathElement>(null);

  // Bezier curve between two points
  const controlOffset = Math.abs(toY - fromY) * 0.5 + 40;
  const d = `M ${fromX} ${fromY} C ${fromX} ${fromY + controlOffset}, ${toX} ${toY - controlOffset}, ${toX} ${toY}`;

  // Calculate midpoint for delete button
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;

  return (
    <g>
      {/* Invisible fat hit-area for click detection */}
      {edgeId && onSelect && (
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={20}
          style={{ pointerEvents: "stroke", cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(edgeId);
          }}
        />
      )}

      {/* Shadow/glow layer */}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={selected ? 6 : 4}
        strokeOpacity={selected ? 0.4 : 0.15}
        filter="url(#wire-glow)"
      />
      {/* Base wire */}
      <path
        d={d}
        fill="none"
        stroke={selected ? "#ffffff" : color}
        strokeWidth={selected ? 3 : 2}
        strokeOpacity={selected ? 0.8 : 0.4}
        strokeLinecap="round"
      />
      {/* Animated current flow */}
      {animated && (
        <path
          ref={pathRef}
          d={d}
          fill="none"
          stroke={selected ? "#ffffff" : color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray="8 16"
          strokeOpacity={selected ? 1 : 0.9}
        >
          <animate
            attributeName="stroke-dashoffset"
            from="24"
            to="0"
            dur="1s"
            repeatCount="indefinite"
          />
        </path>
      )}
      {/* Pulse dot traveling along wire */}
      {animated && (
        <circle r="3" fill={selected ? "#ffffff" : color} opacity={selected ? 1 : 0.8}>
          <animateMotion dur="2s" repeatCount="indefinite" path={d} />
        </circle>
      )}

      {/* Delete button at midpoint when selected */}
      {selected && edgeId && onDelete && (
        <g
          style={{ cursor: "pointer", pointerEvents: "all" }}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(edgeId);
          }}
        >
          <circle cx={midX} cy={midY} r={10} fill="#EF4444" opacity={0.9} />
          <line
            x1={midX - 3.5} y1={midY - 3.5}
            x2={midX + 3.5} y2={midY + 3.5}
            stroke="white" strokeWidth={2} strokeLinecap="round"
          />
          <line
            x1={midX + 3.5} y1={midY - 3.5}
            x2={midX - 3.5} y2={midY + 3.5}
            stroke="white" strokeWidth={2} strokeLinecap="round"
          />
        </g>
      )}
    </g>
  );
}

/** Ghost wire for connection-in-progress */
export function GhostWire({
  fromX, fromY, toX, toY, color,
}: {
  fromX: number; fromY: number; toX: number; toY: number; color: string;
}) {
  const controlOffset = Math.abs(toY - fromY) * 0.4 + 30;
  const d = `M ${fromX} ${fromY} C ${fromX} ${fromY + controlOffset}, ${toX} ${toY - controlOffset}, ${toX} ${toY}`;

  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeOpacity={0.5}
      strokeDasharray="6 6"
      strokeLinecap="round"
    >
      <animate attributeName="stroke-dashoffset" from="12" to="0" dur="0.5s" repeatCount="indefinite" />
    </path>
  );
}

/** SVG defs for wire glow filter — include once in the canvas SVG */
export function WireGlowDefs() {
  return (
    <defs>
      <filter id="wire-glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}
