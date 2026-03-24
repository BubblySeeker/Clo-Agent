"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FileText, Phone, Mail, Eye, Home, Calendar } from "lucide-react";
import {
  portalDashboard,
  type PortalDeal,
  type PortalActivity,
} from "@/lib/api/portal";

const STAGE_COUNT = 7;

function StageProgress({ position, color }: { position: number; color: string }) {
  return (
    <div className="flex gap-1 mt-3">
      {Array.from({ length: STAGE_COUNT }, (_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full ${
            i < position
              ? ""
              : i === position
              ? ""
              : "bg-gray-200"
          }`}
          style={{
            backgroundColor:
              i <= position ? color : undefined,
            opacity: i < position ? 0.4 : i === position ? 1 : undefined,
          }}
        />
      ))}
    </div>
  );
}

const activityIcons: Record<string, React.ElementType> = {
  call: Phone,
  email: Mail,
  showing: Eye,
  note: FileText,
  task: Calendar,
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function PortalDashboardPage() {
  const params = useParams();
  const token = params.token as string;

  const [deals, setDeals] = useState<PortalDeal[]>([]);
  const [activities, setActivities] = useState<PortalActivity[]>([]);
  const [welcome, setWelcome] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalDashboard(token)
      .then((data) => {
        setDeals(data.deals);
        setActivities(data.activities);
        setWelcome(data.welcome_message);
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-7 h-7 border-3 border-cyan-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Deal Progress Cards */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Home className="w-4 h-4 text-gray-400" />
          Your Deals
        </h2>
        {deals.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No active deals yet</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {deals.map((deal) => (
              <div
                key={deal.id}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{deal.title}</h3>
                    <span
                      className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium"
                      style={{
                        backgroundColor: deal.stage_color + "20",
                        color: deal.stage_color,
                      }}
                    >
                      {deal.stage_name}
                    </span>
                  </div>
                  {deal.value != null && (
                    <span className="text-sm font-semibold text-gray-700">
                      ${deal.value.toLocaleString()}
                    </span>
                  )}
                </div>
                <StageProgress
                  position={deal.stage_position - 1}
                  color={deal.stage_color}
                />
                <p className="text-xs text-gray-400 mt-2">
                  Updated {formatDate(deal.updated_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Activity */}
      {activities.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            Recent Activity
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {activities.map((act) => {
              const Icon = activityIcons[act.type] || FileText;
              return (
                <div key={act.id} className="flex items-start gap-3 p-4">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 line-clamp-2">
                      {act.body}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      <span className="capitalize">{act.type}</span>
                      {" \u00b7 "}
                      {formatDate(act.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
