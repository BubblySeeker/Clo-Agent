"use client";

import { useState, useEffect } from "react";
import {
  X, Mail, UserPlus, GitBranch, Activity, Play, Clock, Send, CheckSquare,
  FileText, TrendingUp, Bot,
  type LucideIcon,
} from "lucide-react";
import type { WorkflowNode as NodeType } from "./types";
import { getTemplate } from "./types";

const ICON_MAP: Record<string, LucideIcon> = {
  Mail, UserPlus, GitBranch, Activity, Play, Clock, Send, CheckSquare,
  FileText, TrendingUp, Bot,
};

interface NodeDetailPanelProps {
  node: NodeType;
  fieldKey: string;
  fieldLabel: string;
  value: string;
  onSave: (value: string) => void;
  onClose: () => void;
}

export default function NodeDetailPanel({
  node,
  fieldLabel,
  value: initialValue,
  onSave,
  onClose,
}: NodeDetailPanelProps) {
  const [text, setText] = useState(initialValue);
  const template = getTemplate(node.type);
  const Icon = ICON_MAP[template?.icon ?? ""] ?? Activity;

  // Sync if external value changes
  useEffect(() => {
    setText(initialValue);
  }, [initialValue]);

  const handleSave = () => {
    onSave(text);
    onClose();
  };

  const charCount = text.length;

  return (
    <div
      className="absolute top-0 right-0 h-full w-[360px] z-40 flex flex-col border-l border-white/10"
      style={{
        background: "linear-gradient(180deg, #0D1117 0%, #0B0F19 100%)",
        animation: "slideInRight 200ms ease-out",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${template?.color ?? "bg-gray-500"}`}>
            <Icon size={13} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold text-white">{node.label}</p>
            <p className="text-[9px] text-white/40 uppercase tracking-wider">{fieldLabel}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
        >
          <X size={14} className="text-white/40" />
        </button>
      </div>

      {/* Editor */}
      <div className="flex-1 p-4 overflow-y-auto">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter instructions for the AI..."
          className="w-full h-full min-h-[200px] p-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white/90 placeholder-white/25 outline-none focus:border-white/25 resize-none leading-relaxed"
          autoFocus
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 shrink-0">
        <span className="text-[10px] text-white/30">
          {charCount} / 5,000 characters
        </span>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-white/50 hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
            style={{ background: "linear-gradient(135deg, #0EA5E9 0%, #8B5CF6 100%)" }}
          >
            Apply
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
