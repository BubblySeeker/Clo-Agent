import { apiRequest } from "./client";

export interface Activity {
  id: string;
  contact_id: string | null;
  deal_id: string | null;
  agent_id: string;
  type: "call" | "email" | "note" | "showing" | "task";
  body: string | null;
  created_at: string;
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
}

export function createGeneralActivity(token: string, body: CreateGeneralActivityBody): Promise<Activity> {
  return apiRequest("/activities", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
