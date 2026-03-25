"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDashboardSummary, getDashboardLayout, saveDashboardLayout } from "@/lib/api/dashboard";
import { getDemoDataStatus, seedDemoData, clearDemoData } from "@/lib/api/demo-data";
import {
  TrendingUp, TrendingDown, Users, AlertCircle, CheckCircle,
  Phone, Mail, FileText, Home, MessageSquare, Sparkles,
  ChevronRight, Flame, DollarSign, Banknote,
  Check, Zap, Plus, Briefcase, GripVertical, X,
  Maximize2, Minimize2, Settings2, GitBranch, Activity,
  BarChart as BarChartIcon, PieChart as PieChartIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragEndEvent, DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, rectSortingStrategy, horizontalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtVal(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}
function timeAgo(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function EmptyState({ icon: Icon, headline, subline, ctaLabel, ctaHref }: {
  icon: React.ElementType;
  headline: string;
  subline: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#EFF6FF" }}>
        <Icon size={24} style={{ color: "#0EA5E9" }} />
      </div>
      <p className="text-sm font-semibold" style={{ color: "#1E3A5F" }}>{headline}</p>
      <p className="text-xs text-gray-400 text-center max-w-[220px]">{subline}</p>
      {ctaLabel && ctaHref && (
        <Link href={ctaHref} className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full mt-1" style={{ color: "#0EA5E9", backgroundColor: "#EFF6FF" }}>
          {ctaLabel} <ChevronRight size={13} />
        </Link>
      )}
    </div>
  );
}

// ─── Static data ──────────────────────────────────────────────────────────────

const activityIconColors: Record<string, { bg: string; color: string }> = {
  call:    { bg: "#EFF6FF", color: "#0EA5E9" },
  email:   { bg: "#F0FDF4", color: "#22C55E" },
  note:    { bg: "#FEF3C7", color: "#F59E0B" },
  showing: { bg: "#EDE9FE", color: "#8B5CF6" },
  task:    { bg: "#FEF3C7", color: "#F59E0B" },
};
const activityIcons: Record<string, React.ElementType> = {
  call: Phone, email: Mail, note: FileText, showing: Home,
  task: CheckCircle, message: MessageSquare,
};

const sourceColors: Record<string, string> = {
  Zillow: "#0EA5E9", Referral: "#22C55E", "Cold Call": "#1E3A5F",
  "Open House": "#F59E0B", WhatsApp: "#8B5CF6",
};
const quickActions = [
  { icon: Users,     label: "New Contact",  href: "/dashboard/contacts",   color: "#0EA5E9" },
  { icon: Briefcase, label: "New Deal",     href: "/dashboard/pipeline",   color: "#8B5CF6" },
  { icon: FileText,  label: "Log Activity", href: "/dashboard/activities", color: "#10B981" },
];

// ─── KPI card definitions ─────────────────────────────────────────────────────

type DashData = Awaited<ReturnType<typeof getDashboardSummary>>;

function pctChange(current: number, prev: number): { label: string; up: boolean } | null {
  if (prev === 0 && current === 0) return null;
  if (prev === 0) return { label: "+100%", up: true };
  const pct = Math.round(((current - prev) / prev) * 100);
  if (pct === 0) return null;
  return { label: `${pct > 0 ? "+" : ""}${pct}%`, up: pct > 0 };
}

function numChange(current: number, prev: number): { label: string; up: boolean } | null {
  const diff = current - prev;
  if (diff === 0) return null;
  return { label: `${diff > 0 ? "+" : ""}${diff}`, up: diff > 0 };
}

interface KpiDef {
  id: string;
  label: string;
  sub: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  urgent?: boolean;
  getValue: (data: DashData | undefined, loading: boolean) => string;
  getTrend: (data: DashData | undefined) => { label: string; up: boolean } | null;
}

const KPI_DEFS: KpiDef[] = [
  {
    id: "kpi-leads", label: "Active Leads", sub: "vs last month",
    icon: Users, iconBg: "#EFF6FF", iconColor: "#0EA5E9",
    getValue: (d, l) => l ? "—" : String(d?.total_contacts ?? 0),
    getTrend: (d) => d?.trends ? pctChange(d.total_contacts, d.trends.prev_total_contacts) : null,
  },
  {
    id: "kpi-pipeline", label: "Deals in Pipeline", sub: "active deals",
    icon: DollarSign, iconBg: "#F0FDF4", iconColor: "#22C55E",
    getValue: (d, l) => l ? "—" : fmtVal(d?.pipeline_value ?? 0),
    getTrend: (d) => d?.trends ? pctChange(d.pipeline_value, d.trends.prev_pipeline_value) : null,
  },
  {
    id: "kpi-followups", label: "Follow-ups Overdue", sub: "needs attention",
    icon: AlertCircle, iconBg: "#FFFBEB", iconColor: "#F59E0B", urgent: true,
    getValue: (d, l) => l ? "—" : String(d?.needs_follow_up?.length ?? 0),
    getTrend: () => null,
  },
  {
    id: "kpi-closings", label: "Closings This Month", sub: "on track",
    icon: CheckCircle, iconBg: "#F0FDF4", iconColor: "#22C55E",
    getValue: (d, l) => l ? "—" : String(d?.closed_this_month ?? 0),
    getTrend: (d) => d?.trends ? numChange(d.closed_this_month, d.trends.prev_closed_this_month) : null,
  },
  {
    id: "kpi-commission", label: "Revenue This Month", sub: "vs last month",
    icon: Banknote, iconBg: "#EFF6FF", iconColor: "#1E3A5F",
    getValue: (d, l) => l ? "—" : fmtVal(d?.trends?.closed_this_month_value ?? 0),
    getTrend: (d) => d?.trends ? pctChange(d.trends.closed_this_month_value, d.trends.prev_closed_month_value) : null,
  },
];

const KPI_STORAGE_KEY = "kpi_layout_v1";

function loadKpiLayout(): string[] {
  try {
    const raw = localStorage.getItem(KPI_STORAGE_KEY);
    if (!raw) return KPI_DEFS.map((k) => k.id);
    const saved = JSON.parse(raw) as string[];
    // append any new KPI ids not yet in saved layout
    const extra = KPI_DEFS.map((k) => k.id).filter((id) => !saved.includes(id));
    return [...saved, ...extra];
  } catch { return KPI_DEFS.map((k) => k.id); }
}

// ─── Widget registry ──────────────────────────────────────────────────────────

export type WidgetSize = "full" | "half";
export interface LayoutItem { id: string; size: WidgetSize; }

const WIDGET_REGISTRY = [
  { id: "kpi-cards",     label: "KPI Cards",           description: "Active leads, pipeline, follow-ups, closings.",    defaultSize: "full" as WidgetSize, icon: BarChartIcon,  iconColor: "#0EA5E9" },
  { id: "pipeline",      label: "Pipeline Snapshot",   description: "Active deals grouped by stage with values.",        defaultSize: "half" as WidgetSize, icon: GitBranch,     iconColor: "#8B5CF6" },
  { id: "tasks",         label: "Today's Tasks",        description: "Task list for the day with overdue flags.",         defaultSize: "half" as WidgetSize, icon: CheckCircle,   iconColor: "#22C55E" },
  { id: "hot-leads",     label: "Hot Leads",            description: "AI-flagged contacts needing follow-up.",            defaultSize: "half" as WidgetSize, icon: Flame,         iconColor: "#F97316" },
  { id: "commission",    label: "Commission Chart",     description: "Monthly and yearly commission income.",             defaultSize: "half" as WidgetSize, icon: Banknote,      iconColor: "#1E3A5F" },
  { id: "activity",      label: "Recent Activity",      description: "Latest logged calls, emails, notes, showings.",    defaultSize: "half" as WidgetSize, icon: Activity,      iconColor: "#0EA5E9" },
  { id: "ai-insights",   label: "AI Insights",          description: "Claude-powered nudges and opportunity alerts.",    defaultSize: "half" as WidgetSize, icon: Sparkles,      iconColor: "#8B5CF6" },
  { id: "lead-source",   label: "Lead Source Chart",    description: "Donut chart showing where leads come from.",       defaultSize: "half" as WidgetSize, icon: PieChartIcon,  iconColor: "#22C55E" },
  { id: "speed-to-lead", label: "Speed to Lead",        description: "New leads and how quickly you responded.",         defaultSize: "half" as WidgetSize, icon: Zap,           iconColor: "#F59E0B" },
];

const LAYOUT_STORAGE_KEY = "dashboard_layout_v1";
const DEFAULT_LAYOUT: LayoutItem[] = WIDGET_REGISTRY.map((w) => ({ id: w.id, size: w.defaultSize }));

function loadLayout(): LayoutItem[] {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as LayoutItem[];
    const existingIds = new Set(parsed.map((i) => i.id));
    const newItems = DEFAULT_LAYOUT.filter((i) => !existingIds.has(i.id));
    return [...parsed, ...newItems];
  } catch { return DEFAULT_LAYOUT; }
}
function saveLayout(layout: LayoutItem[], kpiOrder: string[]) {
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  localStorage.setItem(KPI_STORAGE_KEY, JSON.stringify(kpiOrder));
}

// ─── Sortable KPI card ────────────────────────────────────────────────────────

function SortableKpiCard({
  def, data, isLoading, editMode, onRemove,
}: {
  def: KpiDef;
  data: DashData | undefined;
  isLoading: boolean;
  editMode: boolean;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: def.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const trend = def.getTrend(data);

  return (
    <div ref={setNodeRef} style={style} className="relative flex-1 min-w-0">
      {editMode && (
        <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-[#0EA5E9]/40 z-10 pointer-events-none" />
      )}
      {editMode && (
        <div className="absolute top-1.5 right-1.5 z-20 flex gap-1">
          <button
            {...attributes} {...listeners}
            className="w-6 h-6 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-center cursor-grab active:cursor-grabbing hover:bg-gray-50"
          >
            <GripVertical size={11} className="text-gray-400" />
          </button>
          <button
            onClick={() => onRemove(def.id)}
            className="w-6 h-6 rounded-lg bg-white border border-red-200 shadow-sm flex items-center justify-center hover:bg-red-50"
          >
            <X size={11} className="text-red-500" />
          </button>
        </div>
      )}
      <div className={`bg-white rounded-2xl p-5 shadow-sm border flex flex-col gap-3 h-full ${def.urgent ? "border-amber-200" : "border-gray-100"} ${editMode ? "animate-wiggle" : ""}`}>
        <div className="flex items-center justify-between">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: def.iconBg }}>
            <def.icon size={20} style={{ color: def.iconColor }} />
          </div>
          {trend && (
            <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${trend.up ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"}`}>
              {trend.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {trend.label}
            </div>
          )}
        </div>
        <div>
          <p className="text-2xl font-bold leading-tight" style={{ color: def.urgent ? "#F59E0B" : "#1E3A5F" }}>
            {def.getValue(data, isLoading)}
          </p>
          <p className="text-sm font-medium text-gray-700 mt-0.5">{def.label}</p>
          <p className="text-xs text-gray-400 mt-0.5">{def.sub}</p>
        </div>
      </div>
    </div>
  );
}

// ─── KPI cards widget ─────────────────────────────────────────────────────────

function KpiCards({
  data, isLoading, editMode,
  kpiOrder, hiddenKpis, setKpiOrder, setHiddenKpis,
}: {
  data: DashData | undefined;
  isLoading: boolean;
  editMode: boolean;
  kpiOrder: string[];
  hiddenKpis: Set<string>;
  setKpiOrder: React.Dispatch<React.SetStateAction<string[]>>;
  setHiddenKpis: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  const [activeKpiId, setActiveKpiId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const visibleOrder = kpiOrder.filter((id) => !hiddenKpis.has(id));
  const hiddenList = KPI_DEFS.filter((k) => hiddenKpis.has(k.id));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveKpiId(null);
    if (over && active.id !== over.id) {
      setKpiOrder((prev) => {
        const oldIdx = prev.indexOf(active.id as string);
        const newIdx = prev.indexOf(over.id as string);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  }

  function removeKpi(id: string) {
    setHiddenKpis((prev) => { const s = new Set(prev); s.add(id); return s; });
  }

  function addKpi(id: string) {
    setHiddenKpis((prev) => { const s = new Set(prev); s.delete(id); return s; });
  }

  const activeKpiDef = activeKpiId ? KPI_DEFS.find((k) => k.id === activeKpiId) : null;

  return (
    <div className="flex flex-col gap-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setActiveKpiId(e.active.id as string)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={visibleOrder} strategy={horizontalListSortingStrategy}>
          <div className="flex gap-4">
            {visibleOrder.map((id) => {
              const def = KPI_DEFS.find((k) => k.id === id)!;
              return (
                <SortableKpiCard
                  key={id}
                  def={def}
                  data={data}
                  isLoading={isLoading}
                  editMode={editMode}
                  onRemove={removeKpi}
                />
              );
            })}

            {/* Ghost add-back slots for hidden KPI cards */}
            {editMode && hiddenList.map((def) => (
              <button
                key={def.id}
                onClick={() => addKpi(def.id)}
                className="flex-1 min-w-0 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-2 p-5 hover:border-[#0EA5E9] hover:bg-blue-50/30 transition-colors group"
                style={{ minHeight: 116 }}
              >
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: def.iconBg }}>
                  <def.icon size={16} style={{ color: def.iconColor }} />
                </div>
                <p className="text-xs font-semibold text-gray-400 group-hover:text-[#0EA5E9] text-center">{def.label}</p>
                <Plus size={13} className="text-gray-300 group-hover:text-[#0EA5E9]" />
              </button>
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeKpiDef ? (
            <div className="opacity-80 flex-1 min-w-[180px] rounded-2xl shadow-2xl ring-2 ring-[#0EA5E9] overflow-hidden">
              <div className={`bg-white rounded-2xl p-5 shadow-sm border flex flex-col gap-3 ${activeKpiDef.urgent ? "border-amber-200" : "border-gray-100"}`}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: activeKpiDef.iconBg }}>
                  <activeKpiDef.icon size={20} style={{ color: activeKpiDef.iconColor }} />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-tight" style={{ color: activeKpiDef.urgent ? "#F59E0B" : "#1E3A5F" }}>
                    {activeKpiDef.getValue(data, isLoading)}
                  </p>
                  <p className="text-sm font-medium text-gray-700 mt-0.5">{activeKpiDef.label}</p>
                </div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// ─── Sortable widget wrapper ──────────────────────────────────────────────────

function SortableWidget({
  item, editMode, onRemove, onToggleSize, isDragging, children,
}: {
  item: LayoutItem;
  editMode: boolean;
  onRemove: (id: string) => void;
  onToggleSize: (id: string) => void;
  isDragging?: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  // KPI cards widget: render controls as a bar ABOVE the cards so they don't
  // collide with the individual KPI card drag/remove buttons.
  if (item.id === "kpi-cards") {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="col-span-12 flex flex-col gap-2"
      >
        {editMode && (
          <div className="flex items-center justify-between px-1">
            <div
              {...attributes} {...listeners}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-gray-200 shadow-sm cursor-grab active:cursor-grabbing hover:bg-gray-50 w-fit"
            >
              <GripVertical size={13} className="text-gray-400" />
              <span className="text-xs font-semibold text-gray-500">KPI Cards</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onRemove(item.id)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white border border-red-200 shadow-sm text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
              >
                <X size={11} /> Remove
              </button>
            </div>
          </div>
        )}
        <div className={editMode ? "animate-wiggle" : ""}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group h-full ${item.size === "full" ? "col-span-12" : "col-span-6"}`}
    >
      {editMode && (
        <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-[#0EA5E9]/40 z-10 pointer-events-none" />
      )}
      {editMode && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
          <button
            onClick={() => onToggleSize(item.id)}
            title={item.size === "full" ? "Shrink to half" : "Expand to full"}
            className="w-6 h-6 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-center hover:bg-gray-50"
          >
            {item.size === "full" ? <Minimize2 size={11} className="text-gray-500" /> : <Maximize2 size={11} className="text-gray-500" />}
          </button>
          <button
            onClick={() => onRemove(item.id)}
            className="w-6 h-6 rounded-lg bg-white border border-red-200 shadow-sm flex items-center justify-center hover:bg-red-50"
          >
            <X size={11} className="text-red-500" />
          </button>
        </div>
      )}
      {editMode && (
        <div
          {...attributes} {...listeners}
          className="absolute top-2 left-2 z-20 w-6 h-6 rounded-lg bg-white border border-gray-200 shadow-sm flex items-center justify-center cursor-grab active:cursor-grabbing hover:bg-gray-50"
        >
          <GripVertical size={12} className="text-gray-400" />
        </div>
      )}
      <div className={`h-full ${editMode ? "animate-wiggle" : ""}`}>
        {children}
      </div>
    </div>
  );
}

// ─── Other widget components ──────────────────────────────────────────────────

function PipelineWidget({ data, isLoading }: { data: DashData | undefined; isLoading: boolean }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold" style={{ color: "#1E3A5F" }}>Pipeline Snapshot</h3>
          <p className="text-xs text-gray-400 mt-0.5">Active deals by stage</p>
        </div>
        <Link href="/dashboard/pipeline" className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full" style={{ color: "#0EA5E9", backgroundColor: "#EFF6FF" }}>
          Full View <ChevronRight size={13} />
        </Link>
      </div>
      {isLoading ? (
        <div className="flex flex-col gap-2.5 flex-1">
          {[...Array(5)].map((_, i) => <div key={i} className="flex items-center gap-3 animate-pulse"><div className="w-24 h-4 bg-gray-100 rounded" /><div className="flex-1 h-8 bg-gray-100 rounded-lg" /></div>)}
        </div>
      ) : !data?.pipeline_by_stage?.length || !data.pipeline_by_stage.some(s => s.deal_count > 0) ? (
        <EmptyState
          icon={GitBranch}
          headline="Build your pipeline"
          subline="Add deals to track their progress from lead to close."
          ctaLabel="Go to Pipeline"
          ctaHref="/dashboard/pipeline"
        />
      ) : (
        <>
          <div className="flex flex-col gap-2.5 flex-1">
            {data.pipeline_by_stage.slice(0, 6).map((stage) => {
              const maxCount = Math.max(1, ...(data.pipeline_by_stage.map((s) => s.deal_count)));
              const pct = Math.max(20, (stage.deal_count / maxCount) * 100);
              return (
                <div key={stage.stage_id} className="flex items-center gap-3">
                  <div className="w-24 text-xs text-gray-500 shrink-0 text-right truncate">{stage.stage_name}</div>
                  <div className="flex-1">
                    <div className="h-8 rounded-lg flex items-center justify-between px-3" style={{ width: `${pct}%`, backgroundColor: stage.stage_color || "#94a3b8" }}>
                      <span className="text-white text-xs font-bold">{stage.deal_count}</span>
                      <span className="text-white/80 text-xs">{fmtVal(stage.total_value)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-6 pt-2 border-t border-gray-100">
            <div>
              <p className="text-xs text-gray-400">Pipeline Value</p>
              <p className="text-sm font-bold" style={{ color: "#1E3A5F" }}>{fmtVal(data?.pipeline_value ?? 0)}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TasksWidget({ data, isLoading }: { data: DashData | undefined; isLoading: boolean }) {
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const tasks = data?.tasks ?? [];
  const toggleDone = (id: string) => setDoneIds((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4 h-full">
      <div className="flex items-center gap-2">
        <h3 className="font-bold" style={{ color: "#1E3A5F" }}>Tasks</h3>
        {tasks.length > 0 && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{tasks.length}</span>}
      </div>
      <div className="flex flex-col gap-2 flex-1">
        {isLoading
          ? [...Array(4)].map((_, i) => <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />)
          : !tasks.length
          ? <EmptyState
              icon={CheckCircle}
              headline="No tasks yet"
              subline="Tasks you log for contacts will show up here so nothing slips through the cracks."
              ctaLabel="View Contacts"
              ctaHref="/dashboard/contacts"
            />
          : tasks.map((t) => {
              const done = doneIds.has(t.id);
              return (
                <div key={t.id} className={`flex items-center gap-3 p-3 rounded-xl ${done ? "opacity-50" : ""} bg-gray-50`}>
                  <span className="w-2 h-2 rounded-full shrink-0 bg-blue-400" />
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "#EFF6FF" }}>
                    <CheckCircle size={13} style={{ color: "#0EA5E9" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${done ? "line-through text-gray-400" : "text-gray-800"}`}>{t.contact_name}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500 truncate">{t.body || "Task"}</span>
                      <span className="text-xs text-gray-400">{timeAgo(t.created_at)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleDone(t.id)}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${done ? "border-green-400 bg-green-400" : "border-gray-300 hover:border-green-400"}`}
                  >
                    {done && <Check size={11} className="text-white" />}
                  </button>
                </div>
              );
            })}
      </div>
    </div>
  );
}

function HotLeadsWidget({ data, isLoading }: { data: DashData | undefined; isLoading: boolean }) {
  const colors = ["#0EA5E9", "#22C55E", "#F59E0B", "#8B5CF6"];
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-bold" style={{ color: "#1E3A5F" }}>Hot Leads</h3>
          <Flame size={16} className="text-orange-500" />
        </div>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">AI Flagged</span>
      </div>
      <div className="flex flex-col gap-3 flex-1">
        {isLoading
          ? [...Array(4)].map((_, i) => <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />)
          : !data?.needs_follow_up?.length
          ? <EmptyState
              icon={Flame}
              headline="No follow-ups needed"
              subline="Contacts who haven't heard from you in a while will appear here."
            />
          : data.needs_follow_up.slice(0, 4).map((lead, i) => (
              <Link key={lead.contact_id} href={`/dashboard/contacts/${lead.contact_id}`}
                className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 hover:bg-blue-50/50 transition-colors"
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: colors[i % colors.length] }}>
                  {lead.contact_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-sm font-semibold text-gray-800 truncate">{lead.contact_name}</p>
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: "#FEF3C7", color: "#D97706" }}>{lead.days_since_contact}d ago</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{lead.days_since_contact}d since last contact</p>
                </div>
                <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#EDE9FE" }}>
                  <Sparkles size={10} style={{ color: "#7C3AED" }} />
                </div>
              </Link>
            ))}
      </div>
      <Link href="/dashboard/contacts" className="flex items-center justify-center gap-1 text-xs font-semibold pt-2 border-t border-gray-100" style={{ color: "#0EA5E9" }}>
        View All Leads <ChevronRight size={13} />
      </Link>
    </div>
  );
}

function CommissionWidget({ data, isLoading }: { data: DashData | undefined; isLoading: boolean }) {
  const chartData = data?.monthly_revenue ?? [];
  const total = chartData.reduce((s, d) => s + d.value, 0);
  const bestMonth = chartData.length ? chartData.reduce((best, d) => d.value > best.value ? d : best, chartData[0]) : null;
  const max = chartData.length ? Math.max(...chartData.map((d) => d.value)) : 0;
  const hasData = chartData.some((d) => d.value > 0);
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4 h-full">
      <div>
        <h3 className="font-bold" style={{ color: "#1E3A5F" }}>Deal Revenue</h3>
        <p className="text-xs text-gray-400 mt-0.5">Closed deal value over 12 months</p>
      </div>
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center"><div className="h-32 w-full bg-gray-50 rounded-xl animate-pulse" /></div>
      ) : !hasData ? (
        <EmptyState
          icon={Banknote}
          headline="Your first close is ahead"
          subline="Closed deal revenue will be charted here over time."
          ctaLabel="Go to Pipeline"
          ctaHref="/dashboard/pipeline"
        />
      ) : (
        <>
          <div className="flex gap-6">
            <div><p className="text-xs text-gray-400">Total</p><p className="text-xl font-bold" style={{ color: "#1E3A5F" }}>{fmtVal(total)}</p></div>
            {bestMonth && <div><p className="text-xs text-gray-400">Best Month</p><p className="text-xl font-bold text-green-500">{fmtVal(bestMonth.value)}</p></div>}
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barSize={22} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`} tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                <Tooltip content={({ active, payload, label }) => active && payload?.length
                  ? <div className="bg-white shadow-lg border border-gray-100 rounded-xl p-3"><p className="text-xs text-gray-500">{label}</p><p className="text-sm font-bold" style={{ color: "#1E3A5F" }}>${(payload[0].value as number).toLocaleString()}</p></div>
                  : null} cursor={{ fill: "rgba(14,165,233,0.06)" }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {chartData.map((e, i) => <Cell key={i} fill={e.value === max ? "#1E3A5F" : "#0EA5E9"} opacity={e.value === max ? 1 : 0.7} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

function ActivityWidget({ data, isLoading }: { data: DashData | undefined; isLoading: boolean }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4 h-full">
      <div>
        <h3 className="font-bold" style={{ color: "#1E3A5F" }}>Recent Activity</h3>
        <p className="text-xs text-gray-400 mt-0.5">Latest logged interactions</p>
      </div>
      <div className="flex flex-col flex-1">
        {isLoading
          ? [...Array(5)].map((_, i) => <div key={i} className="flex gap-3 py-3 animate-pulse"><div className="w-8 h-8 bg-gray-100 rounded-lg shrink-0" /><div className="flex-1 space-y-1.5"><div className="h-3 bg-gray-100 rounded w-3/4" /><div className="h-2 bg-gray-50 rounded w-1/2" /></div></div>)
          : !data?.recent_activity?.length
          ? <EmptyState
              icon={Activity}
              headline="Start logging activity"
              subline="Calls, emails, and notes you log for contacts will appear in this feed."
              ctaLabel="View Contacts"
              ctaHref="/dashboard/contacts"
            />
          : data.recent_activity.slice(0, 6).map((item, i) => {
              const c = activityIconColors[item.type] || activityIconColors.note;
              const Icon = activityIcons[item.type] || FileText;
              return (
                <div key={item.id} className={`flex items-start gap-3 py-3 rounded-xl -mx-2 px-2 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}`}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: c.bg }}><Icon size={14} style={{ color: c.color }} /></div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-gray-800">{item.contact_name}</span>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{item.body || item.type}</p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{timeAgo(item.created_at)}</span>
                </div>
              );
            })}
      </div>
    </div>
  );
}

function AIInsightsWidget() {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4 h-full">
      <div className="flex items-center gap-2">
        <h3 className="font-bold" style={{ color: "#1E3A5F" }}>AI Insights</h3>
        <Sparkles size={15} style={{ color: "#0EA5E9" }} />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "#EFF6FF" }}>
          <Sparkles size={24} style={{ color: "#0EA5E9" }} />
        </div>
        <p className="text-sm font-semibold" style={{ color: "#1E3A5F" }}>Coming Soon</p>
        <p className="text-xs text-gray-400 text-center max-w-[200px]">AI-powered insights and recommendations will appear here as you add more data.</p>
      </div>
    </div>
  );
}

const FALLBACK_COLORS = ["#0EA5E9", "#22C55E", "#1E3A5F", "#F59E0B", "#8B5CF6", "#F97316", "#EC4899", "#06B6D4"];

function LeadSourceWidget({ data, isLoading }: { data: DashData | undefined; isLoading: boolean }) {
  const sources = data?.lead_sources ?? [];
  const chartData = sources.map((s, i) => ({
    name: s.source,
    value: s.count,
    color: sourceColors[s.source] || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
  }));
  const displayTotal = chartData.reduce((s, d) => s + d.value, 0);
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4 h-full">
      <div>
        <h3 className="font-bold" style={{ color: "#1E3A5F" }}>Lead Source Breakdown</h3>
        <p className="text-xs text-gray-400 mt-0.5">Where your leads are coming from</p>
      </div>
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center"><div className="w-32 h-32 bg-gray-50 rounded-full animate-pulse" /></div>
      ) : !chartData.length ? (
        <EmptyState
          icon={Users}
          headline="Add your first contacts"
          subline="See where your leads come from as you grow your network."
          ctaLabel="Add Contact"
          ctaHref="/dashboard/contacts"
        />
      ) : (
        <div className="flex items-center gap-6 flex-1">
          <div className="relative shrink-0" style={{ width: 160, height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} cx="50%" cy="50%" innerRadius={52} outerRadius={76} paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}>
                  {chartData.map((e, i) => <Cell key={i} fill={e.color} stroke="none" />)}
                </Pie>
                <Tooltip content={({ active, payload }) => active && payload?.length
                  ? <div className="bg-white shadow-lg border border-gray-100 rounded-xl p-3"><p className="text-xs text-gray-500">{payload[0].payload.name}</p><p className="text-sm font-bold" style={{ color: "#1E3A5F" }}>{payload[0].value} leads ({Math.round(((payload[0].value as number) / displayTotal) * 100)}%)</p></div>
                  : null} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-2xl font-bold" style={{ color: "#1E3A5F" }}>{displayTotal}</p>
              <p className="text-xs text-gray-400">Total Leads</p>
            </div>
          </div>
          <div className="flex flex-col gap-2.5 flex-1">
            {chartData.map((item) => (
              <div key={item.name} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} /><span className="text-sm text-gray-600">{item.name}</span></div>
                <div className="flex items-center gap-2"><span className="text-sm font-bold" style={{ color: "#1E3A5F" }}>{item.value}</span><span className="text-xs text-gray-400 w-8 text-right">{Math.round((item.value / displayTotal) * 100)}%</span></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SpeedToLeadWidget({ data, isLoading }: { data: DashData | undefined; isLoading: boolean }) {
  const leads = data?.speed_to_lead ?? [];
  const notContacted = leads.filter((l) => !l.contacted).length;
  const contacted = leads.filter((l) => l.contacted).length;
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4 h-full">
      <div className="flex items-center gap-2">
        <h3 className="font-bold" style={{ color: "#1E3A5F" }}>New Leads</h3>
        <Zap size={16} className="text-amber-400" />
      </div>
      {isLoading ? (
        <div className="flex-1 flex flex-col gap-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-gray-50 rounded-xl animate-pulse" />)}</div>
      ) : !leads.length ? (
        <EmptyState
          icon={Zap}
          headline="New leads will appear here"
          subline="Track how quickly you respond to incoming leads."
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-100 flex-1">
            <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
              {["Contact", "Source", "Added", "Status"].map((h) => <span key={h} className="text-xs font-semibold text-gray-500">{h}</span>)}
            </div>
            {leads.map((lead, i) => (
              <div key={lead.contact_id} className={`grid grid-cols-4 gap-2 px-4 py-3 items-center ${i !== leads.length - 1 ? "border-b border-gray-50" : ""} ${!lead.contacted ? "bg-amber-50/30" : ""}`}>
                <span className="text-sm font-semibold text-gray-800 truncate">{lead.contact_name}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full w-fit" style={{ backgroundColor: `${sourceColors[lead.source || ""] || "#94a3b8"}18`, color: sourceColors[lead.source || ""] || "#1E3A5F" }}>{lead.source || "Unknown"}</span>
                <span className="text-xs text-gray-500">{timeAgo(lead.created_at)}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full w-fit ${lead.contacted ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-700"}`}>{lead.contacted ? "Contacted" : "Pending"}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-4">
            <div className="flex-1 text-center rounded-xl p-3 bg-amber-50"><p className="text-xl font-bold text-amber-600">{notContacted}</p><p className="text-xs text-amber-500 mt-0.5">Not yet contacted</p></div>
            <div className="flex-1 text-center rounded-xl p-3 bg-green-50"><p className="text-xl font-bold text-green-600">{contacted}</p><p className="text-xs text-green-500 mt-0.5">Contacted</p></div>
            <div className="flex-1 text-center rounded-xl p-3" style={{ backgroundColor: "#EFF6FF" }}><p className="text-xl font-bold" style={{ color: "#0EA5E9" }}>{leads.length}</p><p className="text-xs mt-0.5" style={{ color: "#7CC8F0" }}>Total New</p></div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { getToken } = useAuth();
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);

  // Dashboard layout
  const [editMode, setEditMode] = useState(false);
  const [layout, setLayout] = useState<LayoutItem[]>(DEFAULT_LAYOUT);
  const [savedLayout, setSavedLayout] = useState<LayoutItem[]>(DEFAULT_LAYOUT);
  const [activeId, setActiveId] = useState<string | null>(null);

  // KPI card layout
  const [kpiOrder, setKpiOrder] = useState<string[]>(KPI_DEFS.map((k) => k.id));
  const [hiddenKpis, setHiddenKpis] = useState<Set<string>>(new Set());
  const [savedKpiOrder, setSavedKpiOrder] = useState<string[]>(KPI_DEFS.map((k) => k.id));
  const [savedHiddenKpis, setSavedHiddenKpis] = useState<Set<string>>(new Set());

  useEffect(() => {
    const lo = loadLayout();
    setLayout(lo); setSavedLayout(lo);
    const ko = loadKpiLayout();
    setKpiOrder(ko); setSavedKpiOrder(ko);
  }, []);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) setNewMenuOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async () => { const token = await getToken(); return getDashboardSummary(token!); },
  });

  // Demo data toggle
  const { data: demoStatus } = useQuery({
    queryKey: ["demo-data-status"],
    queryFn: async () => { const token = await getToken(); return getDemoDataStatus(token!); },
  });
  const [demoLoading, setDemoLoading] = useState(false);
  const toggleDemoData = async () => {
    setDemoLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      if (demoStatus?.active) {
        await clearDemoData(token);
      } else {
        await seedDemoData(token);
      }
      queryClient.invalidateQueries();
    } finally {
      setDemoLoading(false);
    }
  };

  const { data: layoutData } = useQuery({
    queryKey: ["dashboard-layout"],
    queryFn: async () => { const token = await getToken(); return getDashboardLayout(token!); },
  });

  useEffect(() => {
    if (!layoutData?.layout) return;
    const saved = layoutData.layout;
    if (saved.widgets) {
      setLayout(saved.widgets); setSavedLayout(saved.widgets);
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(saved.widgets));
    }
    if (saved.kpiOrder) {
      setKpiOrder(saved.kpiOrder); setSavedKpiOrder(saved.kpiOrder);
      localStorage.setItem(KPI_STORAGE_KEY, JSON.stringify(saved.kpiOrder));
    }
    if (saved.hiddenKpis) {
      const set = new Set(saved.hiddenKpis);
      setHiddenKpis(set); setSavedHiddenKpis(set);
    }
  }, [layoutData]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (over && active.id !== over.id) {
      setLayout((prev) => {
        const oi = prev.findIndex((i) => i.id === active.id);
        const ni = prev.findIndex((i) => i.id === over.id);
        return arrayMove(prev, oi, ni);
      });
    }
  }

  const removeWidget = useCallback((id: string) => setLayout((p) => p.filter((i) => i.id !== id)), []);
  const toggleSize = useCallback((id: string) => setLayout((p) => p.map((i) => i.id === id ? { ...i, size: i.size === "full" ? "half" : "full" } : i)), []);

  function addWidget(id: string) {
    const def = WIDGET_REGISTRY.find((w) => w.id === id);
    if (!def) return;
    // KPI cards always go back to the top
    if (id === "kpi-cards") {
      setLayout((p) => [{ id, size: def.defaultSize }, ...p]);
    } else {
      setLayout((p) => [...p, { id, size: def.defaultSize }]);
    }
  }

  function saveCustomization() {
    saveLayout(layout, kpiOrder);
    getToken().then((token) => {
      if (token) saveDashboardLayout(token, { widgets: layout, kpiOrder, hiddenKpis: Array.from(hiddenKpis) });
    });
    setSavedLayout(layout);
    setSavedKpiOrder(kpiOrder);
    setSavedHiddenKpis(new Set(hiddenKpis));
    setEditMode(false);
  }

  function cancelCustomization() {
    setLayout(savedLayout);
    setKpiOrder(savedKpiOrder);
    setHiddenKpis(new Set(savedHiddenKpis));
    setEditMode(false);
  }

  function resetToDefault() {
    setLayout(DEFAULT_LAYOUT);
    setKpiOrder(KPI_DEFS.map((k) => k.id));
    setHiddenKpis(new Set());
  }

  const hiddenWidgets = WIDGET_REGISTRY.filter((w) => !layout.find((i) => i.id === w.id));

  function renderWidgetContent(id: string) {
    switch (id) {
      case "kpi-cards":     return <KpiCards data={data} isLoading={isLoading} editMode={editMode} kpiOrder={kpiOrder} hiddenKpis={hiddenKpis} setKpiOrder={setKpiOrder} setHiddenKpis={setHiddenKpis} />;
      case "pipeline":      return <PipelineWidget data={data} isLoading={isLoading} />;
      case "tasks":         return <TasksWidget data={data} isLoading={isLoading} />;
      case "hot-leads":     return <HotLeadsWidget data={data} isLoading={isLoading} />;
      case "commission":    return <CommissionWidget data={data} isLoading={isLoading} />;
      case "activity":      return <ActivityWidget data={data} isLoading={isLoading} />;
      case "ai-insights":   return <AIInsightsWidget />;
      case "lead-source":   return <LeadSourceWidget data={data} isLoading={isLoading} />;
      case "speed-to-lead": return <SpeedToLeadWidget data={data} isLoading={isLoading} />;
      default:              return null;
    }
  }

  // The active dragged item's overlay (skip kpi-cards since it has its own overlay)
  const activeWidget = activeId ? WIDGET_REGISTRY.find((w) => w.id === activeId) : null;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 p-6 text-center">
        <p className="text-gray-600 font-medium">Failed to load dashboard data</p>
        <button onClick={() => refetch()} className="px-4 py-2 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: "#0EA5E9" }}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#1E3A5F" }}>Dashboard</h1>
            <p className="text-sm text-gray-400 mt-0.5">Welcome back — here&apos;s what&apos;s happening today.</p>
          </div>
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <button onClick={resetToDefault} className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50">Reset</button>
                <button onClick={cancelCustomization} className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
                <button onClick={saveCustomization} className="px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90" style={{ backgroundColor: "#22C55E" }}>Save Layout</button>
              </>
            ) : (
              <>
                <button
                  onClick={toggleDemoData}
                  disabled={demoLoading}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                    demoStatus?.active
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  } ${demoLoading ? "opacity-50 cursor-wait" : ""}`}
                >
                  <Sparkles size={14} />
                  <span>Demo Data</span>
                  <span
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      demoStatus?.active ? "bg-amber-500" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                        demoStatus?.active ? "translate-x-[18px]" : "translate-x-[3px]"
                      }`}
                    />
                  </span>
                </button>
                <button onClick={() => setEditMode(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  <Settings2 size={14} /> Customize
                </button>
                <div className="relative" ref={newMenuRef}>
                  <button onClick={() => setNewMenuOpen((o) => !o)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-semibold hover:opacity-90" style={{ backgroundColor: "#0EA5E9" }}>
                    <Plus size={15} /> New
                  </button>
                  {newMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 z-50 overflow-hidden">
                      {quickActions.map((a) => (
                        <Link key={a.label} href={a.href} onClick={() => setNewMenuOpen(false)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 group">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: a.color + "18" }}><a.icon size={14} style={{ color: a.color }} /></div>
                          <span className="text-sm text-gray-700 font-medium">{a.label}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {editMode && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-dashed border-[#0EA5E9] bg-blue-50/60 text-sm text-[#1E3A5F]">
            <GripVertical size={16} className="text-[#0EA5E9] shrink-0" />
            <span className="font-medium">Customize mode</span>
            <span className="text-gray-500">— drag to reorder widgets and KPI cards, resize, or remove. Add back hidden items below.</span>
          </div>
        )}

        {/* Outer DnD for widgets */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(e) => setActiveId(e.active.id as string)}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={layout.map((i) => i.id)} strategy={rectSortingStrategy}>
            {/* items-stretch so half-width widgets share equal row height */}
            <div className="grid grid-cols-12 gap-5 items-stretch">
              {layout.map((item) => (
                <SortableWidget
                  key={item.id}
                  item={item}
                  editMode={editMode}
                  onRemove={removeWidget}
                  onToggleSize={toggleSize}
                  isDragging={activeId === item.id}
                >
                  {renderWidgetContent(item.id)}
                </SortableWidget>
              ))}
            </div>
          </SortableContext>

          <DragOverlay>
            {activeWidget && activeId !== "kpi-cards" ? (
              <div className="opacity-80 rounded-2xl shadow-2xl ring-2 ring-[#0EA5E9] overflow-hidden">
                {renderWidgetContent(activeId!)}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Hidden widget picker */}
        {editMode && hiddenWidgets.length > 0 && (
          <div className="border-2 border-dashed border-gray-200 rounded-2xl p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Hidden Widgets — click to add</p>
            <div className="grid grid-cols-4 gap-3">
              {hiddenWidgets.map((w) => (
                <button key={w.id} onClick={() => addWidget(w.id)}
                  className="flex items-start gap-3 p-4 bg-white rounded-2xl border border-gray-100 hover:border-[#0EA5E9]/40 hover:shadow-md transition-all text-left group"
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: w.iconColor + "18" }}>
                    <w.icon size={18} style={{ color: w.iconColor }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 group-hover:text-[#1E3A5F]">{w.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5 leading-snug">{w.description}</p>
                  </div>
                  <Plus size={14} className="text-gray-300 group-hover:text-[#0EA5E9] shrink-0 mt-0.5 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {editMode && hiddenWidgets.length === 0 && (
          <div className="border-2 border-dashed border-gray-200 rounded-2xl p-4 text-center text-sm text-gray-400">
            All widgets visible. Remove some above to add them back here.
          </div>
        )}

      </div>
    </div>
  );
}
