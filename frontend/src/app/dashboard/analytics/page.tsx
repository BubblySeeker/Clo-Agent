"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { BarChart2, Users, Activity, TrendingUp } from "lucide-react";

interface StageAnalytics {
  stage_id: string;
  stage_name: string;
  stage_color: string;
  deal_count: number;
  total_value: number;
  avg_value: number;
}

interface ActivityTypeCount {
  type: string;
  count: number;
}

interface ContactSourceCount {
  source: string;
  count: number;
}

function formatValue(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

const activityTypeColors: Record<string, string> = {
  call: "#0EA5E9",
  email: "#22C55E",
  note: "#F59E0B",
  showing: "#8B5CF6",
  task: "#F97316",
};

const sourceColors = [
  "#0EA5E9", "#22C55E", "#F59E0B", "#8B5CF6", "#F97316", "#EC4899", "#14B8A6",
];

export default function AnalyticsPage() {
  const { getToken } = useAuth();

  const { data: pipeline, isLoading: pipelineLoading } = useQuery({
    queryKey: ["analytics-pipeline"],
    queryFn: async () => {
      const token = await getToken();
      return apiRequest<{ stages: StageAnalytics[] }>("/analytics/pipeline", token!);
    },
  });

  const { data: activities, isLoading: activitiesLoading } = useQuery({
    queryKey: ["analytics-activities"],
    queryFn: async () => {
      const token = await getToken();
      return apiRequest<{ by_type: ActivityTypeCount[]; total: number }>("/analytics/activities", token!);
    },
  });

  const { data: contacts, isLoading: contactsLoading } = useQuery({
    queryKey: ["analytics-contacts"],
    queryFn: async () => {
      const token = await getToken();
      return apiRequest<{ by_source: ContactSourceCount[]; total: number; new_this_month: number }>("/analytics/contacts", token!);
    },
  });

  const totalPipelineValue = pipeline?.stages.reduce((sum, s) => sum + s.total_value, 0) ?? 0;
  const totalDeals = pipeline?.stages.reduce((sum, s) => sum + s.deal_count, 0) ?? 0;
  const maxDealCount = Math.max(1, ...(pipeline?.stages.map((s) => s.deal_count) ?? [1]));
  const maxActivityCount = Math.max(1, ...(activities?.by_type.map((t) => t.count) ?? [1]));
  const maxSourceCount = Math.max(1, ...(contacts?.by_source.map((s) => s.count) ?? [1]));

  return (
    <div className="p-6">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-5">

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E3A5F" }}>Reports</h1>
          <p className="text-sm text-gray-400 mt-0.5">Pipeline performance, activity volume, and lead sources.</p>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-4 gap-4">
          {[
            {
              label: "Total Contacts",
              value: contactsLoading ? "—" : String(contacts?.total ?? 0),
              sub: `+${contacts?.new_this_month ?? 0} this month`,
              icon: Users,
              iconBg: "#EFF6FF",
              iconColor: "#0EA5E9",
            },
            {
              label: "Total Deals",
              value: pipelineLoading ? "—" : String(totalDeals),
              sub: "across all stages",
              icon: BarChart2,
              iconBg: "#F0FDF4",
              iconColor: "#22C55E",
            },
            {
              label: "Pipeline Value",
              value: pipelineLoading ? "—" : formatValue(totalPipelineValue),
              sub: "total deal value",
              icon: TrendingUp,
              iconBg: "#EFF6FF",
              iconColor: "#1E3A5F",
            },
            {
              label: "Total Activities",
              value: activitiesLoading ? "—" : String(activities?.total ?? 0),
              sub: "logged interactions",
              icon: Activity,
              iconBg: "#FDF4FF",
              iconColor: "#8B5CF6",
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col gap-3"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: kpi.iconBg }}
              >
                <kpi.icon size={20} style={{ color: kpi.iconColor }} />
              </div>
              <div>
                <p className="text-2xl font-bold leading-tight" style={{ color: "#1E3A5F" }}>
                  {kpi.value}
                </p>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{kpi.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{kpi.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-12 gap-5">

          {/* Pipeline by Stage */}
          <div className="col-span-6 bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4">
            <div>
              <h3 className="font-bold" style={{ color: "#1E3A5F" }}>Pipeline by Stage</h3>
              <p className="text-xs text-gray-400 mt-0.5">Deal count and value per stage</p>
            </div>
            <div className="flex flex-col gap-3">
              {pipelineLoading
                ? [...Array(7)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-28 h-4 bg-gray-100 rounded" />
                      <div className="flex-1 h-8 bg-gray-100 rounded-lg" />
                    </div>
                  ))
                : pipeline?.stages.map((stage) => {
                    const widthPct = Math.max(8, (stage.deal_count / maxDealCount) * 100);
                    return (
                      <div key={stage.stage_id} className="flex items-center gap-3">
                        <div className="w-28 text-xs text-gray-500 shrink-0 text-right truncate">
                          {stage.stage_name}
                        </div>
                        <div className="flex-1 relative h-9">
                          <div
                            className="h-9 rounded-lg flex items-center justify-between px-3 transition-all"
                            style={{
                              width: `${widthPct}%`,
                              backgroundColor: stage.stage_color || "#94a3b8",
                              minWidth: 80,
                            }}
                          >
                            <span className="text-white text-xs font-bold">{stage.deal_count}</span>
                            <span className="text-white/80 text-xs">{formatValue(stage.total_value)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
            </div>
          </div>

          {/* Activity Breakdown */}
          <div className="col-span-3 bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4">
            <div>
              <h3 className="font-bold" style={{ color: "#1E3A5F" }}>Activity Breakdown</h3>
              <p className="text-xs text-gray-400 mt-0.5">By activity type</p>
            </div>
            <div className="flex flex-col gap-3 flex-1">
              {activitiesLoading
                ? [...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-16 h-4 bg-gray-100 rounded" />
                      <div className="flex-1 h-6 bg-gray-100 rounded-full" />
                    </div>
                  ))
                : activities?.by_type.length === 0
                ? <p className="text-sm text-gray-400 text-center py-8">No activities yet</p>
                : activities?.by_type.map((item) => {
                    const widthPct = Math.max(8, (item.count / maxActivityCount) * 100);
                    const color = activityTypeColors[item.type] || "#94a3b8";
                    return (
                      <div key={item.type} className="flex items-center gap-3">
                        <div className="w-16 text-xs text-gray-500 capitalize shrink-0 text-right">
                          {item.type}
                        </div>
                        <div className="flex-1 h-7 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full flex items-center justify-end pr-2 transition-all"
                            style={{ width: `${widthPct}%`, backgroundColor: color }}
                          >
                            <span className="text-white text-xs font-bold">{item.count}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
            </div>
          </div>

          {/* Contact Sources */}
          <div className="col-span-3 bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col gap-4">
            <div>
              <h3 className="font-bold" style={{ color: "#1E3A5F" }}>Contact Sources</h3>
              <p className="text-xs text-gray-400 mt-0.5">Where leads come from</p>
            </div>
            <div className="flex flex-col gap-3 flex-1">
              {contactsLoading
                ? [...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-20 h-4 bg-gray-100 rounded" />
                      <div className="flex-1 h-6 bg-gray-100 rounded-full" />
                    </div>
                  ))
                : contacts?.by_source.length === 0
                ? <p className="text-sm text-gray-400 text-center py-8">No contacts yet</p>
                : contacts?.by_source.map((item, i) => {
                    const widthPct = Math.max(8, (item.count / maxSourceCount) * 100);
                    const color = sourceColors[i % sourceColors.length];
                    return (
                      <div key={item.source} className="flex items-center gap-3">
                        <div className="w-20 text-xs text-gray-500 capitalize shrink-0 text-right truncate">
                          {item.source}
                        </div>
                        <div className="flex-1 h-7 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full flex items-center justify-end pr-2 transition-all"
                            style={{ width: `${widthPct}%`, backgroundColor: color }}
                          >
                            <span className="text-white text-xs font-bold">{item.count}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
            </div>
          </div>
        </div>

        {/* Stage detail table */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="font-bold mb-4" style={{ color: "#1E3A5F" }}>Stage Detail</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Stage</th>
                  <th className="text-right py-2 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Deals</th>
                  <th className="text-right py-2 pr-4 font-semibold text-gray-500 text-xs uppercase tracking-wide">Total Value</th>
                  <th className="text-right py-2 font-semibold text-gray-500 text-xs uppercase tracking-wide">Avg Value</th>
                </tr>
              </thead>
              <tbody>
                {pipelineLoading
                  ? [...Array(7)].map((_, i) => (
                      <tr key={i} className="border-b border-gray-50 animate-pulse">
                        <td className="py-3 pr-4"><div className="h-4 bg-gray-100 rounded w-28" /></td>
                        <td className="py-3 pr-4 text-right"><div className="h-4 bg-gray-100 rounded w-8 ml-auto" /></td>
                        <td className="py-3 pr-4 text-right"><div className="h-4 bg-gray-100 rounded w-16 ml-auto" /></td>
                        <td className="py-3 text-right"><div className="h-4 bg-gray-100 rounded w-16 ml-auto" /></td>
                      </tr>
                    ))
                  : pipeline?.stages.map((stage) => (
                      <tr key={stage.stage_id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: stage.stage_color || "#94a3b8" }}
                            />
                            <span className="font-medium text-gray-800">{stage.stage_name}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-right font-medium text-gray-700">{stage.deal_count}</td>
                        <td className="py-3 pr-4 text-right font-medium text-gray-700">{formatValue(stage.total_value)}</td>
                        <td className="py-3 text-right text-gray-500">{formatValue(stage.avg_value)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
