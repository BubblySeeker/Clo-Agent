"use client";

import { useState, useCallback, useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Zap, Plus, Play, FlaskConical, Power, PowerOff, Trash2,
  Clock, CheckCircle2, AlertCircle, ChevronRight,
} from "lucide-react";
import {
  listWorkflows, createWorkflow, updateWorkflow, deleteWorkflow,
  toggleWorkflow, listWorkflowRuns, getWorkflow,
  type Workflow,
} from "@/lib/api/workflows";
import { listContacts } from "@/lib/api/contacts";
import type { ContactOption } from "@/components/shared/ContactChipInput";
import { WorkflowBuilder } from "@/components/shared/workflow-builder";
import type { WorkflowGraph, WorkflowNode as NodeType } from "@/components/shared/workflow-builder";
import { TRIGGER_TEMPLATES, ACTION_TEMPLATES } from "@/components/shared/workflow-builder";
import { workflowToGraph } from "@/components/shared/workflow-builder/graphUtils";
import WorkflowStatus from "@/components/shared/WorkflowStatus";

type ViewMode = "list" | "builder";

function RunStatusBadge({ status }: { status: string }) {
  const config = {
    running: { icon: Clock, color: "text-blue-400", bg: "bg-blue-500/10", label: "Running" },
    waiting: { icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10", label: "Waiting" },
    completed: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Completed" },
    failed: { icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/10", label: "Failed" },
  }[status] ?? { icon: Clock, color: "text-white/40", bg: "bg-white/5", label: status };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${config.bg} ${config.color}`}>
      <config.icon size={10} />
      {config.label}
    </span>
  );
}

function WorkflowListCard({
  wf,
  onEdit,
  onRun,
  onDryRun,
  onToggle,
  onDelete,
}: {
  wf: Workflow;
  onEdit: () => void;
  onRun: () => void;
  onDryRun: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { getToken } = useAuth();
  const { data: runsData } = useQuery({
    queryKey: ["workflow-runs", wf.id],
    queryFn: async () => {
      const token = await getToken();
      return listWorkflowRuns(token!, wf.id);
    },
  });
  const runs = runsData?.runs ?? [];
  const lastRun = runs.length > 0 ? runs[0] : null;
  const triggerTemplate = TRIGGER_TEMPLATES.find((t) => t.type === wf.trigger_type);

  const stepCount = wf.steps?.length ?? 0;

  return (
    <div
      onClick={onEdit}
      className={`group relative rounded-2xl border cursor-pointer transition-all duration-200 overflow-hidden ${
        wf.enabled
          ? "border-white/10 hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.04]"
          : "border-white/5 bg-white/[0.01] opacity-60"
      }`}
    >
      {/* Accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{
          background: wf.enabled
            ? `linear-gradient(90deg, ${triggerTemplate?.accent ?? "#6B7280"} 0%, transparent 100%)`
            : "transparent",
        }}
      />

      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${triggerTemplate?.color ?? "bg-gray-500"}`}
            >
              <Zap size={16} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{wf.name}</p>

              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                  style={{
                    backgroundColor: `${triggerTemplate?.accent ?? "#6B7280"}15`,
                    color: triggerTemplate?.accent ?? "#6B7280",
                  }}
                >
                  {triggerTemplate?.label ?? wf.trigger_type}
                </span>
                {stepCount > 0 && (
                  <span className="text-[10px] text-white/30">
                    {stepCount} action{stepCount !== 1 ? "s" : ""}
                  </span>
                )}
                {wf.approval_mode && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    wf.approval_mode === "auto"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-amber-500/10 text-amber-400"
                  }`}>
                    {wf.approval_mode === "auto" ? "Auto" : "Review"}
                  </span>
                )}
                {lastRun && <RunStatusBadge status={lastRun.status} />}
              </div>

              {wf.instruction && (
                <p className="text-[11px] text-white/30 mt-2 line-clamp-2 leading-relaxed">
                  {wf.instruction}
                </p>
              )}

              {runs.length > 0 && (
                <div className="flex items-center gap-3 text-[10px] text-white/20 mt-2">
                  <span>{runs.length} run{runs.length !== 1 ? "s" : ""}</span>
                  <span>
                    {Math.round(
                      (runs.filter((r) => r.status === "completed").length / runs.length) * 100
                    )}% success
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-0.5 shrink-0 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onRun(); }}
              title="Run"
              className="p-1.5 rounded-lg hover:bg-green-500/10 transition-colors"
            >
              <Play size={13} className="text-green-400" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDryRun(); }}
              title="Dry Run"
              className="p-1.5 rounded-lg hover:bg-amber-500/10 transition-colors"
            >
              <FlaskConical size={13} className="text-amber-400" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              title={wf.enabled ? "Disable" : "Enable"}
              className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              {wf.enabled ? (
                <Power size={13} className="text-green-400" />
              ) : (
                <PowerOff size={13} className="text-white/30" />
              )}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Delete"
              className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={13} className="text-white/20 hover:text-red-400" />
            </button>
          </div>

          <ChevronRight size={14} className="text-white/10 group-hover:text-white/30 transition-colors shrink-0 ml-1 mt-3" />
        </div>
      </div>
    </div>
  );
}

export default function WorkflowsPage() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const [view, setView] = useState<ViewMode>("list");
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [activeRun, setActiveRun] = useState<{
    workflowId: string;
    workflowName: string;
    isDryRun: boolean;
  } | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["workflows"],
    queryFn: async () => {
      const token = await getToken();
      return listWorkflows(token!);
    },
  });

  // Load contacts for autocomplete in builder
  const { data: contactsData } = useQuery({
    queryKey: ["contacts-for-workflows"],
    queryFn: async () => {
      const token = await getToken();
      return listContacts(token!, { limit: 200 });
    },
  });
  const contactOptions: ContactOption[] = useMemo(() =>
    (contactsData?.contacts ?? []).filter((c) => c.email).map((c) => ({
      id: c.id,
      email: c.email!,
      name: `${c.first_name} ${c.last_name}`.trim(),
      initials: `${c.first_name?.[0] || ""}${c.last_name?.[0] || ""}`.toUpperCase(),
    })),
    [contactsData]
  );

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return deleteWorkflow(token!, id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflows"] }),
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return toggleWorkflow(token!, id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflows"] }),
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(
    async (saveData: {
      name: string;
      instruction: string;
      trigger_type: string;
      trigger_config: Record<string, unknown>;
      approval_mode: "review" | "auto";
      steps: Array<{ type: string; config: Record<string, string> }>;
    }) => {
      setIsSaving(true);
      try {
        const token = await getToken();
        if (!token) return;

        if (editingWorkflow) {
          await updateWorkflow(token, editingWorkflow.id, {
            name: saveData.name,
            instruction: saveData.instruction,
            trigger_type: saveData.trigger_type,
            trigger_config: saveData.trigger_config,
            approval_mode: saveData.approval_mode,
            steps: saveData.steps,
          });
        } else {
          await createWorkflow(token, {
            name: saveData.name,
            instruction: saveData.instruction,
            trigger_type: saveData.trigger_type,
            trigger_config: saveData.trigger_config,
            approval_mode: saveData.approval_mode,
            steps: saveData.steps,
          });
        }
        queryClient.invalidateQueries({ queryKey: ["workflows"] });
      } finally {
        setIsSaving(false);
      }
    },
    [editingWorkflow, getToken, queryClient]
  );

  // When AI creates/updates a workflow, refresh the list and load into canvas
  const handleWorkflowSavedByAI = useCallback(async (newWorkflowId?: string) => {
    queryClient.invalidateQueries({ queryKey: ["workflows"] });
    // Load the workflow (new or updated) into the canvas
    const wfId = newWorkflowId || editingWorkflow?.id;
    if (wfId) {
      try {
        const token = await getToken();
        if (token) {
          const wf = await getWorkflow(token, wfId);
          setEditingWorkflow(wf);
        }
      } catch {
        // Ignore, user can refresh manually
      }
    }
  }, [editingWorkflow, getToken, queryClient]);

  const workflows = data?.workflows ?? [];

  // List view
  if (view === "list") {
    return (
      <div
        className="min-h-screen"
        style={{
          background: "linear-gradient(180deg, #0B0F19 0%, #0D1117 100%)",
        }}
      >
        <div className="max-w-[900px] mx-auto p-6 flex flex-col gap-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Workflows</h1>
              <p className="text-sm text-white/40 mt-0.5">
                Visual automations for your real estate business
              </p>
            </div>
            <button
              onClick={() => { setEditingWorkflow(null); setView("builder"); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #0EA5E9 0%, #8B5CF6 100%)",
              }}
            >
              <Plus size={16} /> Create Workflow
            </button>
          </div>

          {/* Active Run Status */}
          {activeRun && (
            <WorkflowStatus
              workflowId={activeRun.workflowId}
              workflowName={activeRun.workflowName}
              isDryRun={activeRun.isDryRun}
              onComplete={() => {
                queryClient.invalidateQueries({ queryKey: ["workflow-runs", activeRun.workflowId] });
              }}
              onClose={() => setActiveRun(null)}
            />
          )}

          {/* Workflow list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
            </div>
          ) : isError ? (
            <div className="text-center py-16">
              <p className="text-sm text-white/40">Failed to load workflows</p>
              <button
                onClick={() => refetch()}
                className="mt-3 px-4 py-2 rounded-xl text-sm text-white bg-sky-500/20 hover:bg-sky-500/30 transition-colors"
              >
                Try again
              </button>
            </div>
          ) : workflows.length > 0 ? (
            <div className="grid grid-cols-1 gap-3">
              {workflows.map((wf) => (
                <WorkflowListCard
                  key={wf.id}
                  wf={wf}
                  onEdit={() => { setEditingWorkflow(wf); setView("builder"); }}
                  onRun={() => setActiveRun({ workflowId: wf.id, workflowName: wf.name, isDryRun: false })}
                  onDryRun={() => setActiveRun({ workflowId: wf.id, workflowName: wf.name, isDryRun: true })}
                  onToggle={() => toggleMutation.mutate(wf.id)}
                  onDelete={() => deleteMutation.mutate(wf.id)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-5"
                style={{
                  background: "linear-gradient(135deg, rgba(14,165,233,0.1) 0%, rgba(139,92,246,0.1) 100%)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <Zap size={28} className="text-white/20" />
              </div>
              <p className="text-sm font-medium text-white/50">No workflows yet</p>
              <p className="text-xs text-white/25 mt-1 mb-5">
                Build visual automations that run on triggers
              </p>
              <button
                onClick={() => { setEditingWorkflow(null); setView("builder"); }}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:scale-[1.02]"
                style={{
                  background: "linear-gradient(135deg, #0EA5E9 0%, #8B5CF6 100%)",
                }}
              >
                Create Your First Workflow
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Builder view
  return (
    <div className="h-full" style={{ minHeight: "calc(100vh - 64px)" }}>
      <WorkflowBuilder
        workflowId={editingWorkflow?.id}
        initialGraph={editingWorkflow ? workflowToGraph(editingWorkflow) : undefined}
        initialName={editingWorkflow?.name}
        initialApprovalMode={
          (editingWorkflow?.approval_mode as "review" | "auto") ?? "review"
        }
        enabled={editingWorkflow?.enabled ?? true}
        onSave={handleSave}
        onWorkflowSaved={handleWorkflowSavedByAI}
        onRun={
          editingWorkflow
            ? () => setActiveRun({ workflowId: editingWorkflow.id, workflowName: editingWorkflow.name, isDryRun: false })
            : undefined
        }
        onDryRun={
          editingWorkflow
            ? () => setActiveRun({ workflowId: editingWorkflow.id, workflowName: editingWorkflow.name, isDryRun: true })
            : undefined
        }
        onToggle={editingWorkflow ? () => toggleMutation.mutate(editingWorkflow.id) : undefined}
        onDelete={
          editingWorkflow
            ? () => { deleteMutation.mutate(editingWorkflow.id); setView("list"); }
            : undefined
        }
        onBack={() => setView("list")}
        isSaving={isSaving}
        contacts={contactOptions}
      />
    </div>
  );
}
