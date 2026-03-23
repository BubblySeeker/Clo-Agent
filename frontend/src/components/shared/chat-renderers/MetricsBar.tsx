"use client";

import {
  Users,
  Briefcase,
  DollarSign,
  Activity,
  CheckCircle,
  BarChart3,
  Clock,
  TrendingUp,
  Home,
  type LucideIcon,
} from "lucide-react";

interface MetricsBarProps {
  metrics: Array<{ label: string; value: string }>;
  compact?: boolean;
}

const ICON_KEYWORDS: Array<[RegExp, LucideIcon]> = [
  [/contact|client|lead|people/i, Users],
  [/deal|pipeline|stage/i, Briefcase],
  [/value|revenue|price|budget|income|cost|loan|capital/i, DollarSign],
  [/activit|task|action/i, Activity],
  [/closed|complete|done|won/i, CheckCircle],
  [/time|date|day|month|year|term/i, Clock],
  [/rate|return|irr|ltv|yield|percent/i, TrendingUp],
  [/propert|building|home|house|unit|squar|acre/i, Home],
];

function getIcon(label: string): LucideIcon {
  for (const [pattern, icon] of ICON_KEYWORDS) {
    if (pattern.test(label)) return icon;
  }
  return BarChart3;
}

function getValueColor(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("$")) return "text-green-600";
  if (trimmed.endsWith("%")) return "text-[#0EA5E9]";
  return "text-[#1E3A5F]";
}

export default function MetricsBar({ metrics, compact }: MetricsBarProps) {
  return (
    <div className={`flex gap-2 flex-wrap my-2 ${compact ? "gap-1.5" : ""}`}>
      {metrics.map((m, i) => {
        const Icon = getIcon(m.label);
        const valueColor = getValueColor(m.value);

        return (
          <div
            key={i}
            className={`bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-2 min-w-0 ${
              compact ? "px-2 py-1.5" : "px-3 py-2"
            }`}
          >
            <div
              className={`flex-shrink-0 rounded-md flex items-center justify-center ${
                compact ? "w-6 h-6" : "w-8 h-8"
              } bg-blue-50`}
            >
              <Icon
                className={compact ? "w-3 h-3" : "w-4 h-4"}
                style={{ color: "#0EA5E9" }}
              />
            </div>
            <div className="min-w-0">
              <div
                className={`font-bold truncate ${valueColor} ${
                  compact ? "text-xs" : "text-sm"
                }`}
              >
                {m.value}
              </div>
              <div
                className={`text-gray-500 truncate ${
                  compact ? "text-[10px]" : "text-xs"
                }`}
              >
                {m.label}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
