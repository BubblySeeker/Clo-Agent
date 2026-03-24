"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Zap, Plus, Power, PowerOff, Trash2, ChevronDown, ChevronRight,
  Clock, AlertCircle, CheckCircle2, Play, FlaskConical, Pencil,
  type LucideIcon,
} from "lucide-react";
import {
  listWorkflows, deleteWorkflow, toggleWorkflow,
  listWorkflowRuns, type Workflow, type WorkflowRun,
} from "@/lib/api/workflows";
import WorkflowChat from "@/components/shared/WorkflowChat";
import WorkflowStatus from "@/components/shared/WorkflowStatus";

const TRIGGER_LABELS: Record<string, string> = {
  contact_created: "New Contact Created",
  deal_stage_changed: "Deal Stage Changed",
  activity_logged: "Activity Logged",
  manual: "Manual Trigger",
  scheduled: "Scheduled",
};

function RunStatusBadge({ status }: { status: string }) {
  const config = {
    running: { icon: Clock, color: "text-blue-600", bg: "bg-blue-50", label: "Running" },
    waiting: { icon: Clock, color: "text-amber-600", bg: "bg-amber-50", label: "Waiting" },
    completed: { icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50", label: "Completed" },
    failed: { icon: AlertCircle, color: "text-red-600", bg: "bg-red-50", label: "Failed" },
  }[status] ?? { icon: Clock, color: "text-gray-600", bg: "bg-gray-50", label: status };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
      <config.icon size={12} />
      {config.label}
    </span>
  );
}

function WorkflowRunsPanel({ workflowId }: { workflowId: string }) {
  const { getToken } = useAuth();
  const { data } = useQuery({
    queryKey: ["workflow-runs", workflowId],
    queryFn: async () => {
      const token = await getToken();
      return listWorkflowRuns(token!, workflowId);
    },
  });

  const runs = data?.runs ?? [];
  if (runs.length === 0) {
    return <p className="text-xs text-gray-400 py-2">No runs yet</p>;
  }

  return (
    <div className="space-y-1.5">
      {runs.slice(0, 5).map((run: WorkflowRun) => (
        <div key={run.id} className="flex items-center gap-3 text-xs text-gray-500">
          <RunStatusBadge status={run.status} />
          {run.is_dry_run && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">DRY</span>
          )}
          <span>Step {run.current_step + 1}</span>
          <span className="text-gray-300">|</span>
          <span>{new Date(run.started_at).toLocaleDateString()}</span>
        </div>
      ))}
      {runs.length > 5 && (
        <p className="text-xs text-gray-400">+{runs.length - 5} more runs</p>
      )}
    </div>
  );
}

function WorkflowStats({ runs }: { runs: WorkflowRun[] }) {
  if (runs.length === 0) return null;
  const completed = runs.filter((r) => r.status === "completed").length;
  const rate = runs.length > 0 ? Math.round((completed / runs.length) * 100) : 0;

  return (
    <div className="flex items-center gap-3 text-[10px] text-gray-400 mt-1">
      <span>{runs.length} run{runs.length !== 1 ? "s" : ""}</span>
      <span>{rate}% success</span>
    </div>
  );
}

function WorkflowCard({
  wf,
  onDelete,
  onToggle,
  onRun,
  onDryRun,
  onEdit,
}: {
  wf: Workflow;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onRun: (wf: Workflow) => void;
  onDryRun: (wf: Workflow) => void;
  onEdit: (wf: Workflow) => void;
}) {
  const { getToken } = useAuth();
  const [expanded, setExpanded] = useState(false);

  const { data: runsData } = useQuery({
    queryKey: ["workflow-runs", wf.id],
    queryFn: async () => {
      const token = await getToken();
      return listWorkflowRuns(token!, wf.id);
    },
  });

  const runs = runsData?.runs ?? [];
  const lastRun = runs.length > 0 ? runs[0] : null;

  return (
    <div className={`bg-white rounded-2xl shadow-sm border ${wf.enabled ? "border-gray-100" : "border-gray-200 opacity-70"}`}>
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: wf.enabled ? "#EFF6FF" : "#F3F4F6" }}
            >
              <Zap size={18} className={wf.enabled ? "text-[#0EA5E9]" : "text-gray-400"} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: "#1E3A5F" }}>
                {wf.name}
              </p>
              {wf.description && (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{wf.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600">
                  {TRIGGER_LABELS[wf.trigger_type] ?? wf.trigger_type}
                </span>
                {wf.approval_mode && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    wf.approval_mode === "auto"
                      ? "bg-green-50 text-green-600"
                      : "bg-amber-50 text-amber-600"
                  }`}>
                    {wf.approval_mode === "auto" ? "Auto" : "Review"}
                  </span>
                )}
                {lastRun && (
                  <RunStatusBadge status={lastRun.status} />
                )}
              </div>
              <WorkflowStats runs={runs} />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button
              onClick={() => onRun(wf)}
              title="Run"
              className="p-1.5 rounded-lg hover:bg-green-50 transition-colors"
            >
              <Play size={14} className="text-green-500" />
            </button>
            <button
              onClick={() => onDryRun(wf)}
              title="Dry Run"
              className="p-1.5 rounded-lg hover:bg-amber-50 transition-colors"
            >
              <FlaskConical size={14} className="text-amber-500" />
            </button>
            <button
              onClick={() => onEdit(wf)}
              title="Edit with AI"
              className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <Pencil size={14} className="text-blue-500" />
            </button>
            <button
              onClick={() => onToggle(wf.id)}
              title={wf.enabled ? "Disable" : "Enable"}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {wf.enabled ? (
                <Power size={14} className="text-green-500" />
              ) : (
                <PowerOff size={14} className="text-gray-400" />
              )}
            </button>
            <button
              onClick={() => onDelete(wf.id)}
              title="Delete"
              className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} className="text-gray-400 hover:text-red-500" />
            </button>
          </div>
        </div>

        {/* Expand toggle */}
        <div className="mt-3 ml-[52px]">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {expanded ? "Hide details" : "Show details"}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-50 px-5 py-3 space-y-3">
          {/* Instruction */}
          {wf.instruction && (
            <div>
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                Instruction
              </p>
              <p className="text-xs text-gray-600 leading-relaxed">{wf.instruction}</p>
            </div>
          )}

          {/* Recent Runs */}
          <div>
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
              Recent Runs
            </p>
            <WorkflowRunsPanel workflowId={wf.id} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function WorkflowsPage() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [showChat, setShowChat] = useState(false);
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

  const workflows = data?.workflows ?? [];

  const handleRun = (wf: Workflow) => {
    setActiveRun({ workflowId: wf.id, workflowName: wf.name, isDryRun: false });
  };

  const handleDryRun = (wf: Workflow) => {
    setActiveRun({ workflowId: wf.id, workflowName: wf.name, isDryRun: true });
  };

  const handleEdit = (wf: Workflow) => {
    setEditingWorkflow(wf);
    setShowChat(true);
  };

  const handleCreateNew = () => {
    setEditingWorkflow(null);
    setShowChat(true);
  };

  const handleWorkflowSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["workflows"] });
  };

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 p-6 text-center">
        <p className="text-gray-600 font-medium">Failed to load workflows</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-xl text-white text-sm font-semibold"
          style={{ backgroundColor: "#0EA5E9" }}
        >
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
            <h1 className="text-2xl font-bold" style={{ color: "#1E3A5F" }}>
              Workflows
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              AI-powered automations for your real estate business
            </p>
          </div>
          <button
            onClick={handleCreateNew}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: "#0EA5E9" }}
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

        {/* Inline Chat for Create/Edit */}
        {showChat && (
          <WorkflowChat
            workflowId={editingWorkflow?.id}
            onClose={() => {
              setShowChat(false);
              setEditingWorkflow(null);
            }}
            onWorkflowSaved={handleWorkflowSaved}
          />
        )}

        {/* Workflow List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-[#0EA5E9]/30 border-t-[#0EA5E9] rounded-full animate-spin" />
          </div>
        ) : workflows.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {workflows.map((wf) => (
              <WorkflowCard
                key={wf.id}
                wf={wf}
                onDelete={(id) => deleteMutation.mutate(id)}
                onToggle={(id) => toggleMutation.mutate(id)}
                onRun={handleRun}
                onDryRun={handleDryRun}
                onEdit={handleEdit}
              />
            ))}
          </div>
        ) : !showChat ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Zap size={24} className="text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-500">No workflows yet</p>
            <p className="text-xs text-gray-400 mt-1 mb-4">
              Describe what you want to automate, and AI will build the workflow for you
            </p>
            <button
              onClick={handleCreateNew}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white hover:opacity-90 transition-colors"
              style={{ backgroundColor: "#0EA5E9" }}
            >
              Create Your First Workflow
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
