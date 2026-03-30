"use client";

import {
  Mail, UserPlus, GitBranch, Activity, Play, Clock, Send, CheckSquare,
  FileText, TrendingUp, Bot, Zap, Timer, GitFork, MessageSquare,
  UserCog, Bell, Tag,
  type LucideIcon,
} from "lucide-react";
import type { NodeTemplate } from "./types";
import { TRIGGER_TEMPLATES, ACTION_TEMPLATES, LOGIC_TEMPLATES, EXTRA_ACTION_TEMPLATES } from "./types";

const ICON_MAP: Record<string, LucideIcon> = {
  Mail, UserPlus, GitBranch, Activity, Play, Clock, Send, CheckSquare,
  FileText, TrendingUp, Bot, Timer, GitFork, MessageSquare,
  UserCog, Bell, Tag,
};

interface NodePaletteProps {
  onDragTemplate: (template: NodeTemplate) => void;
}

export default function NodePalette({ onDragTemplate }: NodePaletteProps) {
  return (
    <div className="w-[220px] shrink-0 border-r border-white/10 bg-[#0D1117] overflow-y-auto">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={14} className="text-amber-400" />
          <h3 className="text-xs font-bold text-white/70 uppercase tracking-wider">
            Node Palette
          </h3>
        </div>

        {/* Triggers */}
        <div className="mb-5">
          <p className="text-[9px] font-bold text-violet-400 uppercase tracking-[0.15em] mb-2">
            Triggers — When
          </p>
          <div className="space-y-1.5">
            {TRIGGER_TEMPLATES.map((t) => (
              <PaletteItem key={t.type} template={t} onDrag={onDragTemplate} />
            ))}
          </div>
        </div>

        {/* Logic */}
        <div className="mb-5">
          <p className="text-[9px] font-bold text-yellow-400 uppercase tracking-[0.15em] mb-2">
            Logic — Flow
          </p>
          <div className="space-y-1.5">
            {LOGIC_TEMPLATES.map((t) => (
              <PaletteItem key={t.type} template={t} onDrag={onDragTemplate} />
            ))}
          </div>
        </div>

        {/* Core Actions */}
        <div className="mb-5">
          <p className="text-[9px] font-bold text-sky-400 uppercase tracking-[0.15em] mb-2">
            Actions — Then
          </p>
          <div className="space-y-1.5">
            {ACTION_TEMPLATES.map((t) => (
              <PaletteItem key={t.type} template={t} onDrag={onDragTemplate} />
            ))}
          </div>
        </div>

        {/* Extra Actions */}
        <div>
          <p className="text-[9px] font-bold text-pink-400 uppercase tracking-[0.15em] mb-2">
            More Actions
          </p>
          <div className="space-y-1.5">
            {EXTRA_ACTION_TEMPLATES.map((t) => (
              <PaletteItem key={t.type} template={t} onDrag={onDragTemplate} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PaletteItem({
  template,
  onDrag,
}: {
  template: NodeTemplate;
  onDrag: (t: NodeTemplate) => void;
}) {
  const Icon = ICON_MAP[template.icon] ?? Activity;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/workflow-node", JSON.stringify(template));
        e.dataTransfer.effectAllowed = "copy";
        onDrag(template);
      }}
      className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-white/5 hover:border-white/15 bg-white/[0.02] hover:bg-white/[0.05] cursor-grab active:cursor-grabbing transition-all group"
    >
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${template.color}`}>
        <Icon size={13} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-white/80 group-hover:text-white truncate">
          {template.label}
        </p>
        <p className="text-[9px] text-white/30 truncate">{template.description}</p>
      </div>
    </div>
  );
}
