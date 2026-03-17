import { apiRequest } from "./client";

export interface Workflow {
  id: string;
  agent_id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  steps: WorkflowStep[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStep {
  type: string; // create_task, log_activity, wait, update_deal, ai_message
  config: Record<string, unknown>;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  agent_id: string;
  trigger_data: Record<string, unknown> | null;
  status: string;
  current_step: number;
  step_results: unknown[];
  started_at: string;
  completed_at: string | null;
}

export async function listWorkflows(token: string) {
  return apiRequest<{ workflows: Workflow[]; total: number }>("/workflows", token);
}

export async function getWorkflow(token: string, id: string) {
  return apiRequest<Workflow>(`/workflows/${id}`, token);
}

export async function createWorkflow(
  token: string,
  data: {
    name: string;
    description?: string;
    trigger_type: string;
    trigger_config?: Record<string, unknown>;
    steps?: WorkflowStep[];
  }
) {
  return apiRequest<Workflow>("/workflows", token, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateWorkflow(
  token: string,
  id: string,
  data: Partial<{
    name: string;
    description: string;
    trigger_type: string;
    trigger_config: Record<string, unknown>;
    steps: WorkflowStep[];
    enabled: boolean;
  }>
) {
  return apiRequest<Workflow>(`/workflows/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteWorkflow(token: string, id: string) {
  return apiRequest<Record<string, never>>(`/workflows/${id}`, token, {
    method: "DELETE",
  });
}

export async function toggleWorkflow(token: string, id: string) {
  return apiRequest<Workflow>(`/workflows/${id}/toggle`, token, {
    method: "POST",
  });
}

export async function listWorkflowRuns(token: string, workflowId: string) {
  return apiRequest<{ runs: WorkflowRun[]; total: number }>(
    `/workflows/${workflowId}/runs`,
    token
  );
}
