"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Phone, Mail, Eye, FileText, Calendar, Clock } from "lucide-react";
import { portalTimeline, type PortalActivity } from "@/lib/api/portal";

const activityIcons: Record<string, React.ElementType> = {
  call: Phone,
  email: Mail,
  showing: Eye,
  note: FileText,
  task: Calendar,
};

const activityColors: Record<string, string> = {
  call: "bg-green-100 text-green-600",
  email: "bg-blue-100 text-blue-600",
  showing: "bg-purple-100 text-purple-600",
  note: "bg-amber-100 text-amber-600",
  task: "bg-cyan-100 text-cyan-600",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PortalTimelinePage() {
  const params = useParams();
  const token = params.token as string;

  const [activities, setActivities] = useState<PortalActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalTimeline(token)
      .then((data) => setActivities(data.activities))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-7 h-7 border-3 border-cyan-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          No Activity Yet
        </h2>
        <p className="text-sm text-gray-500">
          Your activity timeline will appear here as things progress.
        </p>
      </div>
    );
  }

  // Group activities by date
  const grouped: Record<string, PortalActivity[]> = {};
  for (const act of activities) {
    const dateKey = formatDate(act.created_at);
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(act);
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([date, items]) => (
        <div key={date}>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            {date}
          </h3>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {items.map((act) => {
              const Icon = activityIcons[act.type] || FileText;
              const colorClass = activityColors[act.type] || "bg-gray-100 text-gray-600";
              return (
                <div key={act.id} className="flex items-start gap-3 p-4">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-500 capitalize">
                        {act.type}
                      </span>
                      {act.deal_title && (
                        <>
                          <span className="text-gray-300">&middot;</span>
                          <span className="text-xs text-gray-400">
                            {act.deal_title}
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 mt-0.5">
                      {act.body}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatTime(act.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
