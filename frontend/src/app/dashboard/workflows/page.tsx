"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Zap, Plus, RefreshCw, CheckSquare, Mail, Power, PowerOff,
  Trash2, ChevronDown, ChevronRight, Clock, AlertCircle, CheckCircle2, X,
  type LucideIcon,
} from "lucide-react";
import {
  listWorkflows, createWorkflow, deleteWorkflow, toggleWorkflow,
  listWorkflowRuns, type Workflow, type WorkflowStep,
} from "@/lib/api/workflows";

const TRIGGER_TYPES = [
  { value: "contact_created", label: "New Contact Created" },
  { value: "deal_stage_changed", label: "Deal Stage Changed" },
  { value: "activity_logged", label: "Activity Logged" },
  { value: "manual", label: "Manual Trigger" },
];

const STEP_TYPES = [
  { value: "create_task", label: "Create Task" },
  { value: "log_activity", label: "Log Activity" },
  { value: "wait", label: "Wait (delay)" },
  { value: "update_deal", label: "Update Deal" },
  { value: "ai_message", label: "AI Message" },
];

const TEMPLATES: {
  icon: LucideIcon;
  name: string;
  desc: string;
  trigger_type: string;
  steps: WorkflowStep[];
  color: string;
  bg: string;
}[] = [
  {
    icon: Zap,
    name: "New Lead Follow-up",
    desc: "Send welcome email and schedule a follow-up call when a new contact is added.",
    trigger_type: "contact_created",
    steps: [
      { type: "log_activity", config: { activity_type: "email", body: "Welcome email sent" } },
      { type: "wait", config: { days: 2 } },
      { type: "create_task", config: { body: "Follow-up call with new lead" } },
    ],
    color: "#0EA5E9",
    bg: "#EFF6FF",
  },
  {
    icon: RefreshCw,
    name: "Stale Contact Re-engagement",
    desc: "Flag contacts silent for 14+ days with an AI-drafted re-engagement message.",
    trigger_type: "manual",
    steps: [
      { type: "ai_message", config: { prompt: "Draft a re-engagement message for stale contacts" } },
      { type: "create_task", config: { body: "Review and send re-engagement messages" } },
    ],
    color: "#F59E0B",
    bg: "#FFFBEB",
  },
  {
    icon: CheckSquare,
    name: "Offer Stage Checklist",
    desc: "Create tasks and notify when a deal moves into the Offer stage.",
    trigger_type: "deal_stage_changed",
    steps: [
      { type: "create_task", config: { body: "Review offer details and comparables" } },
      { type: "create_task", config: { body: "Verify financing and pre-approval" } },
      { type: "log_activity", config: { activity_type: "note", body: "Deal moved to Offer stage" } },
    ],
    color: "#8B5CF6",
    bg: "#EDE9FE",
  },
  {
    icon: Mail,
    name: "Post-Close Nurture",
    desc: "30-day and 90-day check-ins after closing to generate referrals.",
    trigger_type: "deal_stage_changed",
    steps: [
      { type: "wait", config: { days: 30 } },
      { type: "create_task", config: { body: "30-day check-in with client" } },
      { type: "wait", config: { days: 60 } },
      { type: "create_task", config: { body: "90-day follow-up for referrals" } },
    ],
    color: "#22C55E",
    bg: "#F0FDF4",
  },
];

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
    return <p className="text-xs text-gray-400 py-2 pl-4">No runs yet</p>;
  }

  return (
    <div className="pl-4 space-y-1.5 pb-2">
      {runs.slice(0, 5).map((run) => (
        <div key={run.id} className="flex items-center gap-3 text-xs text-gray-500">
          <RunStatusBadge status={run.status} />
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

function WorkflowCard({ wf, onDelete, onToggle }: {
  wf: Workflow;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const steps = (wf.steps as unknown as WorkflowStep[]) ?? [];
  const trigger = TRIGGER_TYPES.find((t) => t.value === wf.trigger_type);

  return (
    <div className={`bg-white rounded-2xl shadow-sm border ${wf.enabled ? "border-gray-100" : "border-gray-200 opacity-70"}`}>
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                 style={{ backgroundColor: wf.enabled ? "#EFF6FF" : "#F3F4F6" }}>
              <Zap size={18} className={wf.enabled ? "text-[#0EA5E9]" : "text-gray-400"} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: "#1E3A5F" }}>{wf.name}</p>
              {wf.description && (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{wf.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600">
                  {trigger?.label ?? wf.trigger_type}
                </span>
                <span className="text-[10px] text-gray-400">{steps.length} step{steps.length !== 1 ? "s" : ""}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button onClick={() => onToggle(wf.id)} title={wf.enabled ? "Disable" : "Enable"}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
              {wf.enabled ? <Power size={14} className="text-green-500" /> : <PowerOff size={14} className="text-gray-400" />}
            </button>
            <button onClick={() => onDelete(wf.id)} title="Delete"
              className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
              <Trash2 size={14} className="text-gray-400 hover:text-red-500" />
            </button>
          </div>
        </div>

        {/* Steps preview */}
        {steps.length > 0 && (
          <div className="mt-3 ml-[52px]">
            <button onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {expanded ? "Hide steps" : "Show steps"}
            </button>
            {expanded && (
              <div className="flex flex-col gap-1.5 mt-2">
                {steps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-400 shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-xs text-gray-500">
                      {STEP_TYPES.find((s) => s.value === step.type)?.label ?? step.type}
                      {step.type === "wait" && step.config?.days ? ` (${step.config.days} day${Number(step.config.days) !== 1 ? "s" : ""})` : ""}
                      {step.type === "create_task" && step.config?.body ? `: ${step.config.body}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Runs */}
      {expanded && (
        <div className="border-t border-gray-50 px-5 py-2">
          <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">Recent Runs</p>
          <WorkflowRunsPanel workflowId={wf.id} />
        </div>
      )}
    </div>
  );
}

export default function WorkflowsPage() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [fromTemplate, setFromTemplate] = useState<typeof TEMPLATES[number] | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["workflows"],
    queryFn: async () => {
      const token = await getToken();
      return listWorkflows(token!);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (d: Parameters<typeof createWorkflow>[1]) => {
      const token = await getToken();
      return createWorkflow(token!, d);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      setShowCreate(false);
      setFromTemplate(null);
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

  const handleUseTemplate = (template: typeof TEMPLATES[number]) => {
    setFromTemplate(template);
    setShowCreate(true);
  };

  return (
    <div className="p-6">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#1E3A5F" }}>Workflows</h1>
            <p className="text-sm text-gray-500 mt-0.5">Automate follow-ups, tasks, and reminders</p>
          </div>
          <button
            onClick={() => { setFromTemplate(null); setShowCreate(true); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: "#0EA5E9" }}
          >
            <Plus size={16} /> New Workflow
          </button>
        </div>

        {/* Create Form */}
        {showCreate && (
          <CreateWorkflowFormWrapper
            template={fromTemplate}
            onClose={() => { setShowCreate(false); setFromTemplate(null); }}
            onCreate={(d) => createMutation.mutate(d)}
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
              />
            ))}
          </div>
        ) : !showCreate ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <Zap size={24} className="text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-500">No workflows yet</p>
            <p className="text-xs text-gray-400 mt-1">Create one from scratch or use a template below</p>
          </div>
        ) : null}

        {/* Templates */}
        <div>
          <h2 className="font-bold mb-3" style={{ color: "#1E3A5F" }}>Templates</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {TEMPLATES.map((t) => (
              <div key={t.name} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: t.bg }}>
                    <t.icon size={18} style={{ color: t.color }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold" style={{ color: "#1E3A5F" }}>{t.name}</p>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">{t.desc}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 ml-[52px]">
                  {t.steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-400 shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-xs text-gray-500">
                        {STEP_TYPES.find((s) => s.value === step.type)?.label}
                        {step.type === "wait" && step.config?.days ? ` (${step.config.days as number} days)` : ""}
                        {step.config?.body ? `: ${step.config.body as string}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => handleUseTemplate(t)}
                  className="mt-1 ml-[52px] self-start text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  style={{ color: t.color, backgroundColor: t.bg }}
                >
                  Use Template
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateWorkflowFormWrapper({
  template,
  onClose,
  onCreate,
}: {
  template: typeof TEMPLATES[number] | null;
  onClose: () => void;
  onCreate: (data: { name: string; description?: string; trigger_type: string; steps: WorkflowStep[] }) => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.desc ?? "");
  const [triggerType, setTriggerType] = useState(template?.trigger_type ?? "contact_created");
  const [steps, setSteps] = useState<WorkflowStep[]>(
    template?.steps ?? []
  );

  const addStep = (type: string) => {
    setSteps([...steps, { type, config: {} }]);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const updateStepConfig = (index: number, key: string, value: unknown) => {
    setSteps(steps.map((s, i) => i === index ? { ...s, config: { ...s.config, [key]: value } } : s));
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold" style={{ color: "#1E3A5F" }}>
          {template ? `Create from: ${template.name}` : "Create Workflow"}
        </h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X size={16} /></button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., New Lead Follow-up"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/30" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Description (optional)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/30 resize-none" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Trigger</label>
          <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/30 bg-white">
            {TRIGGER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">Steps</label>
          {steps.length > 0 && (
            <div className="space-y-2 mb-3">
              {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-2 bg-gray-50 rounded-lg p-3">
                  <span className="w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-400 shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div className="flex-1 space-y-1.5">
                    <p className="text-xs font-medium text-gray-700">
                      {STEP_TYPES.find((s) => s.value === step.type)?.label}
                    </p>
                    {step.type === "wait" && (
                      <input type="number" placeholder="Days" value={(step.config.days as number) ?? ""}
                        onChange={(e) => updateStepConfig(i, "days", parseInt(e.target.value) || 0)}
                        className="border border-gray-200 rounded px-2 py-1 text-xs w-20" />
                    )}
                    {(step.type === "create_task" || step.type === "log_activity") && (
                      <input placeholder="Description" value={(step.config.body as string) ?? ""}
                        onChange={(e) => updateStepConfig(i, "body", e.target.value)}
                        className="border border-gray-200 rounded px-2 py-1 text-xs w-full" />
                    )}
                    {step.type === "ai_message" && (
                      <input placeholder="AI prompt" value={(step.config.prompt as string) ?? ""}
                        onChange={(e) => updateStepConfig(i, "prompt", e.target.value)}
                        className="border border-gray-200 rounded px-2 py-1 text-xs w-full" />
                    )}
                  </div>
                  <button onClick={() => removeStep(i)} className="p-1 hover:bg-gray-200 rounded shrink-0">
                    <X size={12} className="text-gray-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {STEP_TYPES.map((s) => (
              <button key={s.value} onClick={() => addStep(s.value)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-[#0EA5E9] hover:text-[#0EA5E9] transition-colors">
                <Plus size={10} /> {s.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => {
            if (!name.trim()) return;
            onCreate({
              name: name.trim(),
              description: description.trim() || undefined,
              trigger_type: triggerType,
              steps,
            });
          }}
          disabled={!name.trim()}
          className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-50 hover:opacity-90"
          style={{ backgroundColor: "#0EA5E9" }}
        >
          Create Workflow
        </button>
      </div>
    </div>
  );
}
