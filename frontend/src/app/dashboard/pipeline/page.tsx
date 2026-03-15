"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listDeals, listDealStages, updateDeal, createDeal, type Deal } from "@/lib/api/deals";
import { listContacts } from "@/lib/api/contacts";
import { Plus, Search, AlertTriangle, GripVertical } from "lucide-react";

function getAvatarColor(id: string) {
  const colors = ["#0EA5E9", "#22C55E", "#F59E0B", "#8B5CF6", "#EF4444", "#1E3A5F"];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function formatValue(v: number | null) {
  if (!v) return "$0";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export default function PipelinePage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContactId, setNewContactId] = useState("");
  const [newStageId, setNewStageId] = useState("");
  const [newValue, setNewValue] = useState("");

  const { data: stagesData, isLoading: stagesLoading } = useQuery({
    queryKey: ["deal-stages"],
    queryFn: async () => {
      const token = await getToken();
      return listDealStages(token!);
    },
  });

  const { data: dealsData, isLoading: dealsLoading } = useQuery({
    queryKey: ["deals"],
    queryFn: async () => {
      const token = await getToken();
      return listDeals(token!);
    },
  });

  const { data: contactsData } = useQuery({
    queryKey: ["contacts", { limit: 100 }],
    queryFn: async () => {
      const token = await getToken();
      return listContacts(token!, { limit: 100 });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ dealId, stageId }: { dealId: string; stageId: string }) => {
      const token = await getToken();
      return updateDeal(token!, dealId, { stage_id: stageId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deals"] }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return createDeal(token!, {
        contact_id: newContactId,
        stage_id: newStageId,
        title: newTitle,
        value: newValue ? parseFloat(newValue) : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      setShowAdd(false);
      setNewTitle("");
      setNewContactId("");
      setNewStageId("");
      setNewValue("");
    },
  });

  const stages = stagesData ?? [];
  const deals = dealsData?.deals ?? [];
  const contacts = contactsData?.contacts ?? [];

  const dealsByStage: Record<string, Deal[]> = {};
  stages.forEach((s) => {
    dealsByStage[s.id] = deals.filter(
      (d) => d.stage_id === s.id && (!search || d.contact_name.toLowerCase().includes(search.toLowerCase()) || d.title.toLowerCase().includes(search.toLowerCase()))
    );
  });

  const totalValue = deals.reduce((sum, d) => sum + (d.value ?? 0), 0);
  const isLoading = stagesLoading || dealsLoading;

  const handleDrop = (stageId: string) => {
    if (draggingDealId && draggingDealId !== "") {
      updateMutation.mutate({ dealId: draggingDealId, stageId });
    }
    setDragOver(null);
    setDraggingDealId(null);
  };

  return (
    <div className="p-6 flex flex-col gap-5 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E3A5F" }}>Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {formatValue(totalValue)} across {deals.length} deals
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold"
          style={{ backgroundColor: "#0EA5E9" }}
        >
          <Plus size={16} /> Add Deal
        </button>
      </div>

      {/* Add Deal Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 shadow-xl w-full max-w-md">
            <h3 className="text-lg font-bold mb-4" style={{ color: "#1E3A5F" }}>New Deal</h3>
            <div className="flex flex-col gap-3">
              <input
                placeholder="Deal title *"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9]"
              />
              <select
                value={newContactId}
                onChange={(e) => setNewContactId(e.target.value)}
                className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none"
              >
                <option value="">Select contact *</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </option>
                ))}
              </select>
              <select
                value={newStageId}
                onChange={(e) => setNewStageId(e.target.value)}
                className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none"
              >
                <option value="">Select stage *</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <input
                placeholder="Deal value (e.g. 500000)"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                type="number"
                className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9]"
              />
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                disabled={!newTitle || !newContactId || !newStageId || createMutation.isPending}
                onClick={() => createMutation.mutate()}
                className="flex-1 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: "#0EA5E9" }}
              >
                {createMutation.isPending ? "Creating..." : "Create Deal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search deals..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm outline-none focus:border-[#0EA5E9]"
            />
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      {isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="min-w-[220px] h-64 bg-gray-100 rounded-2xl animate-pulse shrink-0" />
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 500 }}>
          {stages.map((col) => {
            const colDeals = dealsByStage[col.id] ?? [];
            const colTotal = colDeals.reduce((s, d) => s + (d.value ?? 0), 0);

            return (
              <div
                key={col.id}
                className="flex flex-col rounded-2xl p-3 min-w-[220px] w-[220px] shrink-0 transition-all"
                style={{
                  backgroundColor: "#F5F7FA",
                  border: dragOver === col.id ? `2px dashed ${col.color}` : "2px solid transparent",
                }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(col.id); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => handleDrop(col.id)}
              >
                {/* Column header */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.color }} />
                    <span className="text-sm font-bold" style={{ color: "#1E3A5F" }}>{col.name}</span>
                    <span
                      className="text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center text-white"
                      style={{ backgroundColor: col.color }}
                    >
                      {colDeals.length}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 px-1 mb-3">{formatValue(colTotal)}</p>

                {/* Cards */}
                <div className="flex flex-col gap-2.5">
                  {colDeals.map((deal) => {
                    const daysOld = daysSince(deal.created_at);
                    const isStale = daysOld > 14;
                    const avatarColor = getAvatarColor(deal.contact_id);
                    const initials = deal.contact_name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();

                    return (
                      <div
                        key={deal.id}
                        draggable
                        onDragStart={() => setDraggingDealId(deal.id)}
                        onDragEnd={() => setDraggingDealId(null)}
                        onClick={() => router.push(`/dashboard/contacts/${deal.contact_id}`)}
                        className="bg-white rounded-xl p-3 shadow-sm cursor-pointer hover:shadow-md transition-all group"
                        style={isStale ? { borderLeft: "3px solid #F59E0B" } : { borderLeft: "3px solid transparent" }}
                      >
                        {isStale && (
                          <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1 mb-2">
                            <AlertTriangle size={10} />
                            No activity {daysOld}d
                          </div>
                        )}
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                            style={{ backgroundColor: avatarColor }}
                          >
                            {initials}
                          </div>
                          <span className="text-xs font-bold text-gray-800 truncate">{deal.contact_name}</span>
                          <GripVertical size={12} className="text-gray-300 ml-auto shrink-0 opacity-0 group-hover:opacity-100" />
                        </div>
                        <p className="text-xs text-gray-500 mb-2 truncate">{deal.title}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold" style={{ color: "#1E3A5F" }}>
                            {formatValue(deal.value)}
                          </span>
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                              isStale ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {daysOld}d
                          </span>
                        </div>
                        {/* Progress dots */}
                        <div className="flex gap-1 mt-2">
                          {stages.slice(0, 6).map((s, idx) => {
                            const colIdx = stages.findIndex((x) => x.id === col.id);
                            return (
                              <span
                                key={s.id}
                                className="flex-1 h-1 rounded-full"
                                style={{ backgroundColor: idx <= colIdx ? col.color : "#E5E7EB" }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
