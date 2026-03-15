import { apiRequest } from "./client";

export interface ActivityItem {
  id: string;
  contact_name: string;
  type: string;
  body: string | null;
  created_at: string;
}

export interface FollowUpItem {
  contact_id: string;
  contact_name: string;
  last_activity_at: string | null;
  days_since_contact: number;
}

export interface StageAggregate {
  stage_id: string;
  stage_name: string;
  stage_color: string;
  deal_count: number;
  total_value: number;
}

export interface DashboardSummary {
  total_contacts: number;
  active_deals: number;
  pipeline_value: number;
  closed_this_month: number;
  recent_activity: ActivityItem[];
  needs_follow_up: FollowUpItem[];
  pipeline_by_stage: StageAggregate[];
}

export function getDashboardSummary(token: string): Promise<DashboardSummary> {
  return apiRequest("/dashboard/summary", token);
}

export function getDashboardLayout(token: string): Promise<{ layout: unknown | null }> {
  return apiRequest("/dashboard/layout", token);
}

export function saveDashboardLayout(token: string, layout: unknown): Promise<{ status: string }> {
  return apiRequest("/dashboard/layout", token, {
    method: "PUT",
    body: JSON.stringify({ layout }),
  });
}
