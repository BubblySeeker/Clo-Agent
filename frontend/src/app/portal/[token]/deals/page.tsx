"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import {
  portalDeals,
  type PortalDeal,
  type PortalStage,
} from "@/lib/api/portal";

function DealProgressBar({
  currentPosition,
  stages,
}: {
  currentPosition: number;
  stages: PortalStage[];
}) {
  return (
    <div className="mt-4">
      <div className="flex items-center gap-0.5">
        {stages.map((stage, i) => {
          const isActive = stage.position <= currentPosition;
          const isCurrent = stage.position === currentPosition;
          return (
            <div key={stage.name} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`h-2 w-full rounded-full transition-colors ${
                  isActive ? "" : "bg-gray-200"
                }`}
                style={{
                  backgroundColor: isActive ? stage.color : undefined,
                  opacity: isCurrent ? 1 : isActive ? 0.5 : undefined,
                }}
              />
              <span
                className={`text-[10px] leading-tight text-center ${
                  isCurrent ? "font-semibold text-gray-900" : "text-gray-400"
                }`}
              >
                {stage.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PortalDealsPage() {
  const params = useParams();
  const token = params.token as string;

  const [deals, setDeals] = useState<PortalDeal[]>([]);
  const [stages, setStages] = useState<PortalStage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalDeals(token)
      .then((data) => {
        setDeals(data.deals);
        setStages(data.stages);
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

  if (deals.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-gray-900 mb-1">No Deals</h2>
        <p className="text-sm text-gray-500">
          There are no deals associated with your account yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {deals.map((deal) => (
        <div
          key={deal.id}
          className="bg-white rounded-xl border border-gray-200 p-6"
        >
          <div className="flex items-start justify-between mb-1">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {deal.title}
              </h3>
              <span
                className="inline-block mt-1 px-2.5 py-0.5 rounded text-xs font-medium"
                style={{
                  backgroundColor: deal.stage_color + "20",
                  color: deal.stage_color,
                }}
              >
                {deal.stage_name}
              </span>
            </div>
            {deal.value != null && (
              <span className="text-lg font-bold text-gray-800">
                ${deal.value.toLocaleString()}
              </span>
            )}
          </div>

          {deal.notes && (
            <p className="text-sm text-gray-600 mt-3">{deal.notes}</p>
          )}

          <DealProgressBar currentPosition={deal.stage_position} stages={stages} />

          <div className="flex items-center gap-4 mt-4 text-xs text-gray-400">
            <span>Created {formatDate(deal.created_at)}</span>
            <span>Updated {formatDate(deal.updated_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
