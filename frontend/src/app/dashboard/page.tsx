"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { getDashboardSummary } from "@/lib/api/dashboard";
import { listAllActivities } from "@/lib/api/activities";
import {
  TrendingUp, TrendingDown, Users, AlertCircle, CheckCircle,
  Phone, Mail, FileText, Home, MessageSquare, Sparkles,
  ChevronRight, Flame, DollarSign, Banknote, Phone as PhoneIcon,
  Calendar, Check, Zap, Plus, Briefcase, GripVertical, X,
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

const commissionYearData = [
  { month: "Jan", value: 9200 },  { month: "Feb", value: 11400 },
  { month: "Mar", value: 8700 },  { month: "Apr", value: 14600 },
  { month: "May", value: 12300 }, { month: "Jun", value: 18900 },
  { month: "Jul", value: 16200 }, { month: "Aug", value: 21500 },
  { month: "Sep", value: 17800 }, { month: "Oct", value: 15400 },
  { month: "Nov", value: 19200 }, { month: "Dec", value: 18400 },
];
const commissionMonthData = [
  { month: "Wk 1", value: 3200 }, { month: "Wk 2", value: 5400 },
  { month: "Wk 3", value: 4100 }, { month: "Wk 4", value: 5700 },
];
const leadSourceData = [
  { name: "Zillow",     value: 31, color: "#0EA5E9" },
  { name: "Referral",   value: 27, color: "#22C55E" },
  { name: "Cold Call",  value: 16, color: "#1E3A5F" },
  { name: "Open House", value: 15, color: "#F59E0B" },
  { name: "WhatsApp",   value: 11, color: "#8B5CF6" },
];
const speedLeads = [
  { name: "James Walsh",    source: "Zillow",     elapsed: "4 hrs ago",  contacted: false },
  { name: "Aisha Thompson", source: "Open House", elapsed: "7 hrs ago",  contacted: false },
  { name: "Carlos Reyes",   source: "Referral",   elapsed: "1 hr ago",   contacted: true  },
  { name: "Nina Patel",     source: "WhatsApp",   elapsed: "9 hrs ago",  contacted: false },
  { name: "Tom Becker",     source: "Cold Call",  elapsed: "12 min ago", contacted: true  },
];
const sourceColors: Record<string, string> = {
  Zillow: "#0EA5E9", Referral: "#22C55E", "Cold Call": "#1E3A5F",
  "Open House": "#F59E0B", WhatsApp: "#8B5CF6",
};
const aiInsights = [
  { id: 1, text: "Marcus hasn't replied in 11 days — he was ready to tour last week.", action: "Draft Message", urgency: "high" },
  { id: 2, text: "Sarah Chen viewed the Pecan St. listing 4 times — high purchase intent signal.", action: "View Profile", urgency: "medium" },
  { id: 3, text: "3 leads from the open house still uncontacted after 48 hours.", action: "View Leads", urgency: "high" },
];
const initialTasks = [
  { id: 1, contact: "Marcus Rivera",  type: "Call",      time: "9:00 AM",    overdue: false, icon: PhoneIcon,     done: false },
  { id: 2, contact: "Sarah Chen",     type: "Follow-up", time: "10:30 AM",   overdue: false, icon: MessageSquare, done: false },
  { id: 3, contact: "David Nguyen",   type: "Email",     time: "Yesterday",  overdue: true,  icon: Mail,          done: false },
  { id: 4, contact: "Priya Kapoor",   type: "Call",      time: "2 days ago", overdue: true,  icon: PhoneIcon,     done: false },
  { id: 5, contact: "James Walsh",    type: "Showing",   time: "3:00 PM",    overdue: false, icon: Calendar,      done: false },
];
const quickActions = [
  { icon: Users,     label: "New Contact",  href: "/dashboard/contacts",   color: "#0EA5E9" },
  { icon: Briefcase, label: "New Deal",     href: "/dashboard/pipeline",   color: "#8B5CF6" },
  { icon: FileText,  label: "Log Activity", href: "/dashboard/activities", color: "#10B981" },
];

// ─── KPI card definitions ─────────────────────────────────────────────────────

type DashData = Awaited<ReturnType<typeof getDashboardSummary>>;

interface KpiDef {
  id: string;
  label: string;
  sub: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  urgent?: boolean;
  getValue: (data: DashData | undefined, loading: boolean) => string;
  getTrend: () => { label: string; up: boolean } | null;
}

const KPI_DEFS: KpiDef[] = [
  {
    id: "kpi-leads", label: "Active Leads", sub: "vs last month",
    icon: Users, iconBg: "#EFF6FF", iconColor: "#0EA5E9",
    getValue: (d, l) => l ? "—" : String(d?.total_contacts ?? 0),
    getTrend: () => ({ label: "+12%", up: true }),
  },
  {
    id: "kpi-pipeline", label: "Deals in Pipeline", sub: "active deals",
    icon: DollarSign, iconBg: "#F0FDF4", iconColor: "#22C55E",
    getValue: (d, l) => l ? "—" : fmtVal(d?.pipeline_value ?? 0),
    getTrend: () => ({ label: "+8%", up: true }),
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
    getTrend: () => ({ label: "+1", up: true }),
  },
  {
    id: "kpi-commission", label: "Commission This Month", sub: "vs last month",
    icon: Banknote, iconBg: "#EFF6FF", iconColor: "#1E3A5F",
    getValue: () => "$18,400",
    getTrend: () => ({ label: "+22%", up: true }),
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

  const trend = def.getTrend();

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
      <div className="flex flex-col gap-2.5 flex-1">
        {isLoading
          ? [...Array(5)].map((_, i) => <div key={i} className="flex items-center gap-3 animate-pulse"><div className="w-24 h-4 bg-gray-100 rounded" /><div className="flex-1 h-8 bg-gray-100 rounded-lg" /></div>)
          : data?.pipeline_by_stage?.slice(0, 6).map((stage) => {
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
    </div>
  );
}

function TasksWidget({ tasks, setTasks }: { tasks: typeof initialTasks; setTasks: React.Dispatch<React.SetStateAction<typeof initialTasks>> }) {
  const overdueCount = tasks.filter((t) => t.overdue && !t.done).length;
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4 h-full">
      <div className="flex items-center gap-2">
        <h3 className="font-bold" style={{ color: "#1E3A5F" }}>Today&apos;s Tasks</h3>
        {overdueCount > 0 && <span className="text-xs font-bold text-white bg-red-500 rounded-full px-2 py-0.5">{overdueCount} overdue</span>}
      </div>
      <div className="flex flex-col gap-2 flex-1">
        {tasks.map((t) => (
          <div key={t.id} className={`flex items-center gap-3 p-3 rounded-xl ${t.done ? "opacity-50" : ""} ${t.overdue && !t.done ? "bg-amber-50" : "bg-gray-50"}`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${t.overdue && !t.done ? "bg-amber-400" : "bg-green-400"}`} />
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: t.overdue && !t.done ? "#FEF3C7" : "#EFF6FF" }}>
              <t.icon size={13} style={{ color: t.overdue && !t.done ? "#F59E0B" : "#0EA5E9" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold truncate ${t.done ? "line-through text-gray-400" : "text-gray-800"}`}>{t.contact}</p>
              <div className="flex items-center gap-1.5">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${t.overdue && !t.done ? "bg-amber-100 text-amber-700" : "bg-blue-50 text-blue-600"}`}>{t.type}</span>
                <span className="text-xs text-gray-400">{t.time}</span>
              </div>
            </div>
            <button
              onClick={() => setTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))}
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${t.done ? "border-green-400 bg-green-400" : "border-gray-300 hover:border-green-400"}`}
            >
              {t.done && <Check size={11} className="text-white" />}
            </button>
          </div>
        ))}
      </div>
      <Link href="/dashboard/tasks" className="flex items-center justify-center gap-1 text-xs font-semibold pt-2 border-t border-gray-100" style={{ color: "#0EA5E9" }}>
        View All Tasks <ChevronRight size={13} />
      </Link>
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
          ? <p className="text-sm text-gray-400 text-center py-6">All up to date!</p>
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

function CommissionWidget() {
  const [view, setView] = useState<"year" | "month">("year");
  const data = view === "year" ? commissionYearData : commissionMonthData;
  const max = Math.max(...data.map((d) => d.value));
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold" style={{ color: "#1E3A5F" }}>Commission Income</h3>
          <p className="text-xs text-gray-400 mt-0.5">Earnings over time</p>
        </div>
        <div className="flex rounded-xl overflow-hidden border border-gray-200">
          {(["month", "year"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`text-xs font-semibold px-3 py-1.5 capitalize ${view === v ? "text-white" : "text-gray-500 bg-white hover:bg-gray-50"}`} style={view === v ? { backgroundColor: "#0EA5E9" } : {}}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-6">
        <div><p className="text-xs text-gray-400">Total</p><p className="text-xl font-bold" style={{ color: "#1E3A5F" }}>{view === "year" ? "$183.1K" : "$18.4K"}</p></div>
        <div><p className="text-xs text-gray-400">Best {view === "year" ? "Month" : "Week"}</p><p className="text-xl font-bold text-green-500">{view === "year" ? "$21.5K" : "$5.7K"}</p></div>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barSize={view === "year" ? 22 : 40} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`} tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
            <Tooltip content={({ active, payload, label }) => active && payload?.length
              ? <div className="bg-white shadow-lg border border-gray-100 rounded-xl p-3"><p className="text-xs text-gray-500">{label}</p><p className="text-sm font-bold" style={{ color: "#1E3A5F" }}>${(payload[0].value as number).toLocaleString()}</p></div>
              : null} cursor={{ fill: "rgba(14,165,233,0.06)" }} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {data.map((e, i) => <Cell key={i} fill={e.value === max ? "#1E3A5F" : "#0EA5E9"} opacity={e.value === max ? 1 : 0.7} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
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
          ? <p className="text-sm text-gray-400 text-center py-8">No recent activity</p>
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
      <div className="flex flex-col gap-3 flex-1">
        {aiInsights.map((ins) => (
          <div key={ins.id} className="rounded-2xl p-4 flex flex-col gap-3"
            style={{ background: ins.urgency === "high" ? "linear-gradient(135deg,#EFF6FF,#E0F2FE)" : "linear-gradient(135deg,#F0FDF4,#ECFDF5)", border: `1px solid ${ins.urgency === "high" ? "#BAE6FD" : "#A7F3D0"}` }}>
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: ins.urgency === "high" ? "#0EA5E9" : "#22C55E" }}><Sparkles size={11} className="text-white" /></div>
              <p className="text-xs text-gray-700 leading-relaxed">{ins.text}</p>
            </div>
            <button className="flex items-center gap-1 text-xs font-bold self-start px-3 py-1.5 rounded-full text-white hover:opacity-90" style={{ backgroundColor: ins.urgency === "high" ? "#0EA5E9" : "#22C55E" }}>
              {ins.action} <ChevronRight size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeadSourceWidget({ total }: { total: number }) {
  const data = leadSourceData;
  const displayTotal = total > 0 ? total : data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4 h-full">
      <div>
        <h3 className="font-bold" style={{ color: "#1E3A5F" }}>Lead Source Breakdown</h3>
        <p className="text-xs text-gray-400 mt-0.5">Where your leads are coming from</p>
      </div>
      <div className="flex items-center gap-6 flex-1">
        <div className="relative shrink-0" style={{ width: 160, height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={52} outerRadius={76} paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}>
                {data.map((e, i) => <Cell key={i} fill={e.color} stroke="none" />)}
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
          {data.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} /><span className="text-sm text-gray-600">{item.name}</span></div>
              <div className="flex items-center gap-2"><span className="text-sm font-bold" style={{ color: "#1E3A5F" }}>{item.value}</span><span className="text-xs text-gray-400 w-8 text-right">{Math.round((item.value / displayTotal) * 100)}%</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SpeedToLeadWidget() {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4 h-full">
      <div className="flex items-center gap-2">
        <h3 className="font-bold" style={{ color: "#1E3A5F" }}>New Leads — Response Time</h3>
        <Zap size={16} className="text-amber-400" />
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-100 flex-1">
        <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
          {["Contact", "Source", "Arrived", "Status"].map((h) => <span key={h} className="text-xs font-semibold text-gray-500">{h}</span>)}
        </div>
        {speedLeads.map((lead, i) => (
          <div key={lead.name} className={`grid grid-cols-4 gap-2 px-4 py-3 items-center ${i !== speedLeads.length - 1 ? "border-b border-gray-50" : ""} ${!lead.contacted ? "bg-amber-50/30" : ""}`}>
            <span className="text-sm font-semibold text-gray-800 truncate">{lead.name}</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full w-fit" style={{ backgroundColor: `${sourceColors[lead.source] || "#94a3b8"}18`, color: sourceColors[lead.source] || "#1E3A5F" }}>{lead.source}</span>
            <span className="text-xs text-gray-500">{lead.elapsed}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full w-fit ${lead.contacted ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-700"}`}>{lead.contacted ? "Contacted" : "Pending"}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-4">
        <div className="flex-1 text-center rounded-xl p-3 bg-amber-50"><p className="text-xl font-bold text-amber-600">{speedLeads.filter((l) => !l.contacted).length}</p><p className="text-xs text-amber-500 mt-0.5">Not yet contacted</p></div>
        <div className="flex-1 text-center rounded-xl p-3 bg-green-50"><p className="text-xl font-bold text-green-600">{speedLeads.filter((l) => l.contacted).length}</p><p className="text-xs text-green-500 mt-0.5">Contacted today</p></div>
        <div className="flex-1 text-center rounded-xl p-3" style={{ backgroundColor: "#EFF6FF" }}><p className="text-xl font-bold" style={{ color: "#0EA5E9" }}>4.2h</p><p className="text-xs mt-0.5" style={{ color: "#7CC8F0" }}>Avg. response time</p></div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { getToken } = useAuth();
  const [tasks, setTasks] = useState(initialTasks);
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

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async () => { const token = await getToken(); return getDashboardSummary(token!); },
  });

  const { data: tasksApiData } = useQuery({
    queryKey: ["dashboard-tasks"],
    queryFn: async () => { const token = await getToken(); return listAllActivities(token!, "task"); },
  });

  useEffect(() => {
    if (tasksApiData?.activities?.length) {
      const mapped = tasksApiData.activities.slice(0, 5).map((a: { created_at: string; contact_name?: string; type: string; id: string }, i: number) => {
        const isOverdue = new Date(a.created_at) < new Date(new Date().toDateString());
        return {
          id: i + 1,
          contact: a.contact_name || "Unknown",
          type: a.type === "task" ? "Follow-up" : a.type.charAt(0).toUpperCase() + a.type.slice(1),
          time: isOverdue ? timeAgo(a.created_at) : new Date(a.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
          overdue: isOverdue,
          icon: (activityIcons[a.type] || FileText) as typeof FileText,
          done: false,
        };
      });
      setTasks(mapped);
    }
  }, [tasksApiData]);

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
      case "tasks":         return <TasksWidget tasks={tasks} setTasks={setTasks} />;
      case "hot-leads":     return <HotLeadsWidget data={data} isLoading={isLoading} />;
      case "commission":    return <CommissionWidget />;
      case "activity":      return <ActivityWidget data={data} isLoading={isLoading} />;
      case "ai-insights":   return <AIInsightsWidget />;
      case "lead-source":   return <LeadSourceWidget total={data?.total_contacts ?? 0} />;
      case "speed-to-lead": return <SpeedToLeadWidget />;
      default:              return null;
    }
  }

  // The active dragged item's overlay (skip kpi-cards since it has its own overlay)
  const activeWidget = activeId ? WIDGET_REGISTRY.find((w) => w.id === activeId) : null;

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
