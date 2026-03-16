import { apiRequest } from "./client";

export interface Activity {
  id: string;
  contact_id: string | null;
  deal_id: string | null;
  agent_id: string;
  type: "call" | "email" | "note" | "showing" | "task";
  body: string | null;
  created_at: string;
  due_date: string | null;
  priority: string | null;
  completed_at: string | null;
  contact_name?: string;
}

export interface ActivitiesResponse {
  activities: Activity[];
  total: number;
}

export interface CreateActivityBody {
  type: "call" | "email" | "note" | "showing" | "task";
  body?: string;
  deal_id?: string;
}

export function listActivities(token: string, contactId: string, typeFilter?: string): Promise<ActivitiesResponse> {
  const params = new URLSearchParams();
  if (typeFilter) params.set("type", typeFilter);
  const qs = params.toString();
  return apiRequest(`/contacts/${contactId}/activities${qs ? "?" + qs : ""}`, token);
}

export function listAllActivities(token: string, typeFilter?: string): Promise<ActivitiesResponse> {
  const params = new URLSearchParams();
  if (typeFilter) params.set("type", typeFilter);
  const qs = params.toString();
  return apiRequest(`/activities${qs ? "?" + qs : ""}`, token);
}

export function createActivity(token: string, contactId: string, body: CreateActivityBody): Promise<Activity> {
  return apiRequest(`/contacts/${contactId}/activities`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface CreateGeneralActivityBody {
  type: "call" | "email" | "note" | "showing" | "task";
  body?: string;
  deal_id?: string;
  contact_id?: string;
  due_date?: string;
  priority?: string;
}

export interface UpdateActivityBody {
  body?: string;
  due_date?: string | null;
  priority?: string;
  completed_at?: string | null; // "now" to complete, null to un-complete
}

export interface TaskFilters {
  status?: "overdue" | "today" | "upcoming" | "completed";
  page?: number;
  limit?: number;
}

export interface TasksResponse {
  tasks: Activity[];
  total: number;
}

export function createGeneralActivity(token: string, body: CreateGeneralActivityBody): Promise<Activity> {
  return apiRequest("/activities", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateActivity(token: string, id: string, body: UpdateActivityBody): Promise<Activity> {
  return apiRequest(`/activities/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function listTasks(token: string, filters?: TaskFilters): Promise<TasksResponse> {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return apiRequest(`/tasks${qs ? "?" + qs : ""}`, token);
}
