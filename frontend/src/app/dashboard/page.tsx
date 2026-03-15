"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { getDashboardSummary } from "@/lib/api/dashboard";
import {
  TrendingUp,
  TrendingDown,
  Users,
  AlertCircle,
  CheckCircle,
  Phone,
  Mail,
  FileText,
  Home,
  MessageSquare,
  Sparkles,
  ChevronRight,
  Flame,
  DollarSign,
  Banknote,
  Phone as PhoneIcon,
  Calendar,
  Check,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatValue(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const activityIconColors: Record<string, { bg: string; color: string }> = {
  call: { bg: "#EFF6FF", color: "#0EA5E9" },
  email: { bg: "#F0FDF4", color: "#22C55E" },
  note: { bg: "#FEF3C7", color: "#F59E0B" },
  showing: { bg: "#EDE9FE", color: "#8B5CF6" },
  task: { bg: "#FEF3C7", color: "#F59E0B" },
};

const activityIcons: Record<string, React.ElementType> = {
  call: Phone,
  email: Mail,
  note: FileText,
  showing: Home,
  task: CheckCircle,
  message: MessageSquare,
};

// ─── Static data (matches prototype) ──────────────────────────────────────────

const commissionYearData = [
  { month: "Jan", value: 9200 },
  { month: "Feb", value: 11400 },
  { month: "Mar", value: 8700 },
  { month: "Apr", value: 14600 },
  { month: "May", value: 12300 },
  { month: "Jun", value: 18900 },
  { month: "Jul", value: 16200 },
  { month: "Aug", value: 21500 },
  { month: "Sep", value: 17800 },
  { month: "Oct", value: 15400 },
  { month: "Nov", value: 19200 },
  { month: "Dec", value: 18400 },
];

const commissionMonthData = [
  { month: "Wk 1", value: 3200 },
  { month: "Wk 2", value: 5400 },
  { month: "Wk 3", value: 4100 },
  { month: "Wk 4", value: 5700 },
];

const leadSourceData = [
  { name: "Zillow", value: 31, color: "#0EA5E9" },
  { name: "Referral", value: 27, color: "#22C55E" },
  { name: "Cold Call", value: 16, color: "#1E3A5F" },
  { name: "Open House", value: 15, color: "#F59E0B" },
  { name: "WhatsApp", value: 11, color: "#8B5CF6" },
];

const speedLeads = [
  { name: "James Walsh", source: "Zillow", elapsed: "4 hrs ago", contacted: false },
  { name: "Aisha Thompson", source: "Open House", elapsed: "7 hrs ago", contacted: false },
  { name: "Carlos Reyes", source: "Referral", elapsed: "1 hr ago", contacted: true },
  { name: "Nina Patel", source: "WhatsApp", elapsed: "9 hrs ago", contacted: false },
  { name: "Tom Becker", source: "Cold Call", elapsed: "12 min ago", contacted: true },
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
  { id: 1, contact: "Marcus Rivera", type: "Call", time: "9:00 AM", overdue: false, icon: PhoneIcon, done: false },
  { id: 2, contact: "Sarah Chen", type: "Follow-up", time: "10:30 AM", overdue: false, icon: MessageSquare, done: false },
  { id: 3, contact: "David Nguyen", type: "Email", time: "Yesterday", overdue: true, icon: Mail, done: false },
  { id: 4, contact: "Priya Kapoor", type: "Call", time: "2 days ago", overdue: true, icon: PhoneIcon, done: false },
  { id: 5, contact: "James Walsh", type: "Showing", time: "3:00 PM", overdue: false, icon: Calendar, done: false },
];

// ─── Sub-components ────────────────────────────────────────────────────────────

function CommissionChart() {
  const [view, setView] = useState<"year" | "month">("year");
  const data = view === "year" ? commissionYearData : commissionMonthData;
  const currentMax = Math.max(...data.map((d) => d.value));

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold" style={{ color: "#1E3A5F" }}>Commission Income</h3>
          <p className="text-xs text-gray-400 mt-0.5">Earnings over time</p>
        </div>
        <div className="flex rounded-xl overflow-hidden border border-gray-200">
          {(["month", "year"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`text-xs font-semibold px-3 py-1.5 transition-colors capitalize ${
                view === v ? "text-white" : "text-gray-500 bg-white hover:bg-gray-50"
              }`}
              style={view === v ? { backgroundColor: "#0EA5E9" } : {}}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-6">
        <div>
          <p className="text-xs text-gray-400">Total</p>
          <p className="text-xl font-bold" style={{ color: "#1E3A5F" }}>
            {view === "year" ? "$183.1K" : "$18.4K"}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Best {view === "year" ? "Month" : "Week"}</p>
          <p className="text-xl font-bold text-green-500">{view === "year" ? "$21.5K" : "$5.7K"}</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} barSize={view === "year" ? 22 : 40} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`}
            tick={{ fontSize: 11, fill: "#9CA3AF" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="bg-white shadow-lg border border-gray-100 rounded-xl p-3">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-sm font-bold" style={{ color: "#1E3A5F" }}>${(payload[0].value as number).toLocaleString()}</p>
                </div>
              ) : null
            }
            cursor={{ fill: "rgba(14,165,233,0.06)" }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.value === currentMax ? "#1E3A5F" : "#0EA5E9"} opacity={entry.value === currentMax ? 1 : 0.7} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LeadSourceChart({ total }: { total: number }) {
  const data = leadSourceData;
  const displayTotal = total > 0 ? total : data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4">
      <div>
        <h3 className="font-bold" style={{ color: "#1E3A5F" }}>Lead Source Breakdown</h3>
        <p className="text-xs text-gray-400 mt-0.5">Where your leads are coming from</p>
      </div>
      <div className="flex items-center gap-6">
        <div className="relative shrink-0" style={{ width: 160, height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={76}
                paddingAngle={3}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
              >
                {data.map((entry, index) => (
                  <Cell key={index} fill={entry.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div className="bg-white shadow-lg border border-gray-100 rounded-xl p-3">
                      <p className="text-xs text-gray-500">{payload[0].payload.name}</p>
                      <p className="text-sm font-bold" style={{ color: "#1E3A5F" }}>
                        {payload[0].value} leads ({Math.round(((payload[0].value as number) / displayTotal) * 100)}%)
                      </p>
                    </div>
                  ) : null
                }
              />
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
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-sm text-gray-600">{item.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold" style={{ color: "#1E3A5F" }}>{item.value}</span>
                <span className="text-xs text-gray-400 w-8 text-right">{Math.round((item.value / displayTotal) * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { getToken } = useAuth();
  const [tasks, setTasks] = useState(initialTasks);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const token = await getToken();
      return getDashboardSummary(token!);
    },
  });

  const toggleTask = (id: number) => setTasks((prev) => prev.map((t) => t.id === id ? { ...t, done: !t.done } : t));
  const overdueCount = tasks.filter((t) => t.overdue && !t.done).length;

  type KPI = {
    label: string; value: string; trend: string; up: boolean;
    icon: React.ElementType; iconBg: string; iconColor: string; sub: string; urgent?: boolean;
  };

  const kpis: KPI[] = [
    {
      label: "Active Leads",
      value: isLoading ? "—" : String(data?.total_contacts ?? 0),
      trend: "+12%", up: true,
      icon: Users, iconBg: "#EFF6FF", iconColor: "#0EA5E9",
      sub: "vs last month",
    },
    {
      label: "Deals in Pipeline",
      value: isLoading ? "—" : formatValue(data?.pipeline_value ?? 0),
      trend: "+8%", up: true,
      icon: DollarSign, iconBg: "#F0FDF4", iconColor: "#22C55E",
      sub: `${data?.active_deals ?? 0} active deals`,
    },
    {
      label: "Follow-ups Overdue",
      value: isLoading ? "—" : String(data?.needs_follow_up?.length ?? 0),
      trend: "", up: false,
      icon: AlertCircle, iconBg: "#FFFBEB", iconColor: "#F59E0B",
      sub: "needs attention", urgent: true,
    },
    {
      label: "Closings This Month",
      value: isLoading ? "—" : String(data?.closed_this_month ?? 0),
      trend: "+1", up: true,
      icon: CheckCircle, iconBg: "#F0FDF4", iconColor: "#22C55E",
      sub: "on track",
    },
    {
      label: "Commission This Month",
      value: "$18,400",
      trend: "+22%", up: true,
      icon: Banknote, iconBg: "#EFF6FF", iconColor: "#1E3A5F",
      sub: "vs last month",
    },
  ];

  return (
    <div className="p-6">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-5">

        {/* ROW 1 — KPI Cards */}
        <div className="grid grid-cols-5 gap-4">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className={`bg-white rounded-2xl p-5 shadow-sm border flex flex-col gap-3 ${kpi.urgent ? "border-amber-200" : "border-gray-100"}`}
            >
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: kpi.iconBg }}>
                  <kpi.icon size={20} style={{ color: kpi.iconColor }} />
                </div>
                {kpi.trend && (
                  <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${kpi.up ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"}`}>
                    {kpi.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {kpi.trend}
                  </div>
                )}
              </div>
              <div>
                <p className="text-2xl font-bold leading-tight" style={{ color: kpi.urgent ? "#F59E0B" : "#1E3A5F" }}>
                  {kpi.value}
                </p>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{kpi.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ROW 2 — Pipeline | Tasks | Hot Leads */}
        <div className="grid grid-cols-12 gap-5">
          {/* Pipeline Snapshot */}
          <div className="col-span-5 bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold" style={{ color: "#1E3A5F" }}>Pipeline Snapshot</h3>
                <p className="text-xs text-gray-400 mt-0.5">Active deals by stage</p>
              </div>
              <Link
                href="/dashboard/pipeline"
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full"
                style={{ color: "#0EA5E9", backgroundColor: "#EFF6FF" }}
              >
                Full View <ChevronRight size={13} />
              </Link>
            </div>
            <div className="flex flex-col gap-2.5">
              {isLoading
                ? [...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-24 h-4 bg-gray-100 rounded" />
                      <div className="flex-1 h-8 bg-gray-100 rounded-lg" />
                    </div>
                  ))
                : data?.pipeline_by_stage?.slice(0, 6).map((stage) => {
                    const maxCount = Math.max(1, ...(data.pipeline_by_stage.map((s) => s.deal_count)));
                    const widthPct = Math.max(20, (stage.deal_count / maxCount) * 100);
                    return (
                      <div key={stage.stage_id} className="flex items-center gap-3">
                        <div className="w-24 text-xs text-gray-500 shrink-0 text-right truncate">{stage.stage_name}</div>
                        <div className="flex-1">
                          <div
                            className="h-8 rounded-lg flex items-center justify-between px-3"
                            style={{ width: `${widthPct}%`, backgroundColor: stage.stage_color || "#94a3b8" }}
                          >
                            <span className="text-white text-xs font-bold">{stage.deal_count}</span>
                            <span className="text-white/80 text-xs">{formatValue(stage.total_value)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
            </div>
            <div className="flex gap-6 pt-2 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-400">Pipeline Value</p>
                <p className="text-sm font-bold" style={{ color: "#1E3A5F" }}>{formatValue(data?.pipeline_value ?? 0)}</p>
              </div>
            </div>
          </div>

          {/* Today's Tasks */}
          <div className="col-span-4 bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-bold" style={{ color: "#1E3A5F" }}>Today&apos;s Tasks</h3>
                {overdueCount > 0 && (
                  <span className="text-xs font-bold text-white bg-red-500 rounded-full px-2 py-0.5">{overdueCount} overdue</span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all ${task.done ? "opacity-50" : ""} ${task.overdue && !task.done ? "bg-amber-50" : "bg-gray-50"}`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${task.overdue && !task.done ? "bg-amber-400" : "bg-green-400"}`} />
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: task.overdue && !task.done ? "#FEF3C7" : "#EFF6FF" }}>
                    <task.icon size={13} style={{ color: task.overdue && !task.done ? "#F59E0B" : "#0EA5E9" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold truncate ${task.done ? "line-through text-gray-400" : "text-gray-800"}`}>{task.contact}</p>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${task.overdue && !task.done ? "bg-amber-100 text-amber-700" : "bg-blue-50 text-blue-600"}`}>{task.type}</span>
                      <span className="text-xs text-gray-400">{task.time}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleTask(task.id)}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${task.done ? "border-green-400 bg-green-400" : "border-gray-300 hover:border-green-400"}`}
                  >
                    {task.done && <Check size={11} className="text-white" />}
                  </button>
                </div>
              ))}
            </div>
            <Link href="/dashboard/tasks" className="flex items-center justify-center gap-1 text-xs font-semibold mt-auto pt-2 border-t border-gray-100" style={{ color: "#0EA5E9" }}>
              View All Tasks <ChevronRight size={13} />
            </Link>
          </div>

          {/* Hot Leads */}
          <div className="col-span-3 bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-bold" style={{ color: "#1E3A5F" }}>Hot Leads</h3>
                <Flame size={16} className="text-orange-500" />
              </div>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">AI Flagged</span>
            </div>
            <div className="flex flex-col gap-3">
              {isLoading
                ? [...Array(4)].map((_, i) => <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />)
                : data?.needs_follow_up?.length === 0
                ? <p className="text-sm text-gray-400 text-center py-6">All up to date!</p>
                : data?.needs_follow_up?.slice(0, 4).map((lead, i) => {
                    const colors = ["#0EA5E9", "#22C55E", "#F59E0B", "#8B5CF6"];
                    return (
                      <Link
                        key={lead.contact_id}
                        href={`/dashboard/contacts/${lead.contact_id}`}
                        className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 hover:bg-blue-50/50 transition-colors"
                      >
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: colors[i % colors.length] }}>
                          {lead.contact_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <p className="text-sm font-semibold text-gray-800 truncate">{lead.contact_name}</p>
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: "#FEF3C7", color: "#D97706" }}>
                              {lead.days_since_contact}d ago
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {lead.last_activity_at ? `${lead.days_since_contact}d since last contact` : "No activity yet"}
                          </p>
                        </div>
                        <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "#EDE9FE" }}>
                          <Sparkles size={10} style={{ color: "#7C3AED" }} />
                        </div>
                      </Link>
                    );
                  })}
            </div>
            <Link href="/dashboard/contacts" className="flex items-center justify-center gap-1 text-xs font-semibold mt-auto pt-2 border-t border-gray-100" style={{ color: "#0EA5E9" }}>
              View All Leads <ChevronRight size={13} />
            </Link>
          </div>
        </div>

        {/* ROW 3 — Commission Chart | Recent Activity | AI Insights */}
        <div className="grid grid-cols-12 gap-5">
          <div className="col-span-5">
            <CommissionChart />
          </div>

          {/* Recent Activity */}
          <div className="col-span-4 bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4">
            <div>
              <h3 className="font-bold" style={{ color: "#1E3A5F" }}>Recent Activity</h3>
              <p className="text-xs text-gray-400 mt-0.5">Latest logged interactions</p>
            </div>
            <div className="flex flex-col">
              {isLoading
                ? [...Array(5)].map((_, i) => (
                    <div key={i} className="flex gap-3 py-3 animate-pulse">
                      <div className="w-8 h-8 bg-gray-100 rounded-lg shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-gray-100 rounded w-3/4" />
                        <div className="h-2 bg-gray-50 rounded w-1/2" />
                      </div>
                    </div>
                  ))
                : data?.recent_activity?.length === 0
                ? <p className="text-sm text-gray-400 text-center py-8">No recent activity</p>
                : data?.recent_activity?.slice(0, 6).map((item, index) => {
                    const colors = activityIconColors[item.type] || activityIconColors.note;
                    const IconComp = activityIcons[item.type] || FileText;
                    return (
                      <div key={item.id} className={`flex items-start gap-3 py-3 rounded-xl -mx-2 px-2 ${index % 2 === 0 ? "bg-white" : "bg-gray-50/60"}`}>
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: colors.bg }}>
                          <IconComp size={14} style={{ color: colors.color }} />
                        </div>
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

          {/* AI Insights */}
          <div className="col-span-3 bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <h3 className="font-bold" style={{ color: "#1E3A5F" }}>AI Insights</h3>
              <Sparkles size={15} style={{ color: "#0EA5E9" }} />
            </div>
            <div className="flex flex-col gap-3">
              {aiInsights.map((insight) => (
                <div
                  key={insight.id}
                  className="rounded-2xl p-4 flex flex-col gap-3"
                  style={{
                    background: insight.urgency === "high"
                      ? "linear-gradient(135deg, #EFF6FF 0%, #E0F2FE 100%)"
                      : "linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 100%)",
                    border: `1px solid ${insight.urgency === "high" ? "#BAE6FD" : "#A7F3D0"}`,
                  }}
                >
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: insight.urgency === "high" ? "#0EA5E9" : "#22C55E" }}>
                      <Sparkles size={11} className="text-white" />
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">{insight.text}</p>
                  </div>
                  <button
                    className="flex items-center gap-1 text-xs font-bold self-start px-3 py-1.5 rounded-full text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: insight.urgency === "high" ? "#0EA5E9" : "#22C55E" }}
                  >
                    {insight.action} <ChevronRight size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ROW 4 — Lead Source | Speed to Lead */}
        <div className="grid grid-cols-12 gap-5 pb-2">
          <div className="col-span-5">
            <LeadSourceChart total={data?.total_contacts ?? 0} />
          </div>

          {/* Speed to Lead */}
          <div className="col-span-7 bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <h3 className="font-bold" style={{ color: "#1E3A5F" }}>New Leads — Response Time</h3>
              <Zap size={16} className="text-amber-400" />
            </div>
            <div className="overflow-hidden rounded-xl border border-gray-100">
              <div className="grid grid-cols-4 gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
                {["Contact", "Source", "Arrived", "Status"].map((h) => (
                  <span key={h} className="text-xs font-semibold text-gray-500">{h}</span>
                ))}
              </div>
              {speedLeads.map((lead, index) => (
                <div
                  key={lead.name}
                  className={`grid grid-cols-4 gap-2 px-4 py-3 items-center ${index !== speedLeads.length - 1 ? "border-b border-gray-50" : ""} ${!lead.contacted ? "bg-amber-50/30" : ""}`}
                >
                  <span className="text-sm font-semibold text-gray-800 truncate">{lead.name}</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full w-fit" style={{ backgroundColor: `${sourceColors[lead.source] || "#94a3b8"}18`, color: sourceColors[lead.source] || "#1E3A5F" }}>
                    {lead.source}
                  </span>
                  <span className="text-xs text-gray-500">{lead.elapsed}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full w-fit ${lead.contacted ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-700"}`}>
                    {lead.contacted ? "Contacted" : "Not Contacted"}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-4 pt-1">
              <div className="flex-1 text-center rounded-xl p-3 bg-amber-50">
                <p className="text-xl font-bold text-amber-600">{speedLeads.filter((l) => !l.contacted).length}</p>
                <p className="text-xs text-amber-500 mt-0.5">Not yet contacted</p>
              </div>
              <div className="flex-1 text-center rounded-xl p-3 bg-green-50">
                <p className="text-xl font-bold text-green-600">{speedLeads.filter((l) => l.contacted).length}</p>
                <p className="text-xs text-green-500 mt-0.5">Contacted today</p>
              </div>
              <div className="flex-1 text-center rounded-xl p-3" style={{ backgroundColor: "#EFF6FF" }}>
                <p className="text-xl font-bold" style={{ color: "#0EA5E9" }}>4.2h</p>
                <p className="text-xs mt-0.5" style={{ color: "#7CC8F0" }}>Avg. response time</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
