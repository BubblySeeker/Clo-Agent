"use client";

import { useState } from "react";
import {
  Mail, UserPlus, GitBranch, Activity, Play, Clock, Send, CheckSquare,
  FileText, TrendingUp, Bot, GripVertical, X, Settings, Maximize2,
  Timer, GitFork, MessageSquare, UserCog, Bell, Tag, AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import type { WorkflowNode as NodeType, ConfigField } from "./types";
import { getTemplate } from "./types";
import ContactChipInput, { type ContactOption } from "../ContactChipInput";

const ICON_MAP: Record<string, LucideIcon> = {
  Mail, UserPlus, GitBranch, Activity, Play, Clock, Send, CheckSquare,
  FileText, TrendingUp, Bot, Timer, GitFork, MessageSquare,
  UserCog, Bell, Tag,
};

interface WorkflowNodeCardProps {
  node: NodeType;
  selected: boolean;
  contacts: ContactOption[];
  isOrphaned?: boolean;
  onSelect: (id: string) => void;
  onDragStart: (id: string, e: React.MouseEvent) => void;
  onDelete: (id: string) => void;
  onConfigChange: (id: string, config: Record<string, string>) => void;
  onOpenDetail?: (nodeId: string, fieldKey: string, fieldLabel: string) => void;
  onStartConnect?: (nodeId: string, port: "top" | "bottom", e: React.MouseEvent) => void;
  onEndConnect?: (nodeId: string, port: "top" | "bottom") => void;
}

export default function WorkflowNodeCard({
  node,
  selected,
  contacts,
  isOrphaned = false,
  onSelect,
  onDragStart,
  onDelete,
  onConfigChange,
  onOpenDetail,
  onStartConnect,
  onEndConnect,
}: WorkflowNodeCardProps) {
  const [showConfig, setShowConfig] = useState(false);
  const template = getTemplate(node.type);
  const Icon = ICON_MAP[template?.icon ?? ""] ?? Activity;

  const kindLabel = node.kind === "trigger" ? "WHEN" : node.kind === "condition" ? "IF" : "THEN";
  const kindColor = node.kind === "trigger"
    ? "text-violet-400"
    : node.kind === "condition"
    ? "text-yellow-400"
    : "text-sky-400";

  // Get a brief summary of the config
  const configSummary = Object.entries(node.config)
    .filter(([, v]) => v && v !== "any")
    .map(([, v]) => {
      if (v.length > 40) return v.slice(0, 37) + "...";
      return v;
    })
    .join(" · ");

  return (
    <div
      className="absolute group"
      style={{
        left: node.position.x,
        top: node.position.y,
        zIndex: selected ? 20 : 10,
      }}
    >
      {/* Node card */}
      <div
        onClick={(e) => { e.stopPropagation(); onSelect(node.id); }}
        className={`
          relative w-[200px] rounded-2xl border-2 cursor-pointer
          transition-all duration-200 select-none
          ${selected
            ? "border-white/60 shadow-lg shadow-white/10 scale-105"
            : isOrphaned
            ? "border-red-500/60 shadow-md shadow-red-500/20"
            : "border-white/10 hover:border-white/30 hover:shadow-md"
          }
        `}
        style={{
          background: "linear-gradient(135deg, rgba(30,35,50,0.95) 0%, rgba(20,24,36,0.98) 100%)",
          backdropFilter: "blur(12px)",
          animation: isOrphaned ? "pulse-border 2s ease-in-out infinite" : undefined,
        }}
      >
        {/* Orphaned warning badge with tooltip */}
        {isOrphaned && (
          <div
            className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center z-30 cursor-help group/orphan"
            title="Not connected — drag from a port to connect this node to your workflow"
          >
            <AlertTriangle size={10} className="text-white" />
            {/* Hover tooltip */}
            <div className="absolute left-6 top-0 hidden group-hover/orphan:flex items-center z-50 pointer-events-none">
              <div className="px-2.5 py-1.5 rounded-lg bg-red-500 text-white text-[10px] font-medium whitespace-nowrap shadow-lg">
                Not connected — drag to link
              </div>
            </div>
          </div>
        )}

        {/* Drag handle */}
        <div
          onMouseDown={(e) => { e.stopPropagation(); onDragStart(node.id, e); }}
          className="absolute -top-0 left-0 right-0 h-8 cursor-grab active:cursor-grabbing flex items-center justify-center"
        >
          <GripVertical size={12} className="text-white/20 group-hover:text-white/40 transition-colors" />
        </div>

        {/* Delete button */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-30"
        >
          <X size={10} className="text-white" />
        </button>

        <div className="p-4 pt-3">
          {/* Kind label */}
          <span className={`text-[9px] font-bold tracking-[0.15em] uppercase ${kindColor}`}>
            {kindLabel}
          </span>

          {/* Icon + Label */}
          <div className="flex items-center gap-2.5 mt-1.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${template?.color ?? "bg-gray-500"}`}
            >
              <Icon size={16} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{node.label}</p>
              {configSummary && (
                <p className="text-[10px] text-white/50 truncate mt-0.5">{configSummary}</p>
              )}
            </div>
          </div>

          {/* Config toggle */}
          {template && template.configFields.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowConfig(!showConfig); }}
              className="mt-2.5 flex items-center gap-1 text-[10px] text-white/40 hover:text-white/70 transition-colors"
            >
              <Settings size={10} />
              {showConfig ? "Hide config" : "Configure"}
            </button>
          )}

          {/* Inline config form */}
          {showConfig && template && (
            <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
              {template.configFields.map((field) => (
                <ConfigInput
                  key={field.key}
                  field={field}
                  value={node.config[field.key] ?? ""}
                  contacts={contacts}
                  onChange={(val) => {
                    onConfigChange(node.id, { ...node.config, [field.key]: val });
                  }}
                  onExpandTextarea={
                    field.type === "textarea" && onOpenDetail
                      ? () => onOpenDetail(node.id, field.key, field.label)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Top connection port */}
        <div
          className="absolute -top-[6px] left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white/30 z-20 cursor-crosshair hover:scale-150 hover:border-white/60 transition-transform"
          style={{ backgroundColor: template?.accent ?? "#6B7280" }}
          onMouseDown={(e) => {
            e.stopPropagation();
            onStartConnect?.(node.id, "top", e);
          }}
          onMouseUp={(e) => {
            e.stopPropagation();
            onEndConnect?.(node.id, "top");
          }}
        />

        {/* Bottom connection port */}
        <div
          className="absolute -bottom-[6px] left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white/30 z-20 cursor-crosshair hover:scale-150 hover:border-white/60 transition-transform"
          style={{ backgroundColor: template?.accent ?? "#6B7280" }}
          onMouseDown={(e) => {
            e.stopPropagation();
            onStartConnect?.(node.id, "bottom", e);
          }}
          onMouseUp={(e) => {
            e.stopPropagation();
            onEndConnect?.(node.id, "bottom");
          }}
        />
      </div>

      <style jsx>{`
        @keyframes pulse-border {
          0%, 100% { border-color: rgba(239, 68, 68, 0.3); }
          50% { border-color: rgba(239, 68, 68, 0.8); }
        }
      `}</style>
    </div>
  );
}

function ConfigInput({
  field,
  value,
  contacts,
  onChange,
  onExpandTextarea,
}: {
  field: ConfigField;
  value: string;
  contacts: ContactOption[];
  onChange: (val: string) => void;
  onExpandTextarea?: () => void;
}) {
  // Contact chip input
  if (field.type === "contact") {
    return (
      <div>
        <label className="text-[9px] text-white/50 uppercase tracking-wider">{field.label}</label>
        <div className="mt-0.5">
          <ContactChipInput
            value={value}
            onChange={onChange}
            contacts={contacts}
            placeholder={field.placeholder}
            variant="dark"
          />
        </div>
      </div>
    );
  }

  if (field.type === "select" && field.options) {
    return (
      <div>
        <label className="text-[9px] text-white/50 uppercase tracking-wider">{field.label}</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full mt-0.5 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-white/80 outline-none focus:border-white/30"
        >
          <option value="">Select...</option>
          {field.options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }

  // Textarea with expand button
  if (field.type === "textarea") {
    const preview = value ? (value.length > 60 ? value.slice(0, 57) + "..." : value) : "";
    return (
      <div>
        <div className="flex items-center justify-between">
          <label className="text-[9px] text-white/50 uppercase tracking-wider">{field.label}</label>
          {onExpandTextarea && (
            <button
              onClick={(e) => { e.stopPropagation(); onExpandTextarea(); }}
              className="p-0.5 rounded hover:bg-white/10 transition-colors"
              title="Expand editor"
            >
              <Maximize2 size={9} className="text-white/40" />
            </button>
          )}
        </div>
        {/* Show preview if there's content + expand is available */}
        {onExpandTextarea && value ? (
          <button
            onClick={(e) => { e.stopPropagation(); onExpandTextarea(); }}
            className="w-full mt-0.5 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] text-white/60 text-left leading-relaxed hover:bg-white/8 hover:border-white/20 transition-colors cursor-pointer"
          >
            {preview || "Click to edit..."}
          </button>
        ) : (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={2}
            className="w-full mt-0.5 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-white/80 placeholder-white/30 outline-none focus:border-white/30 resize-none"
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <label className="text-[9px] text-white/50 uppercase tracking-wider">{field.label}</label>
      <input
        type={field.type === "email" ? "email" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="w-full mt-0.5 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-xs text-white/80 placeholder-white/30 outline-none focus:border-white/30"
      />
    </div>
  );
}
