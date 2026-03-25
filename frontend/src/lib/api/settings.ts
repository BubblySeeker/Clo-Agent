import { apiRequest } from "./client";

export interface AgentSettings {
  commission_rate?: number;
  commission_split?: number;
  show_lead_scores?: boolean;
  notifications?: {
    new_leads?: boolean;
    deal_updates?: boolean;
    task_reminders?: boolean;
    weekly_report?: boolean;
  };
}

export function getSettings(token: string): Promise<AgentSettings> {
  return apiRequest("/settings", token);
}

export function updateSettings(token: string, settings: Partial<AgentSettings>): Promise<{ status: string }> {
  return apiRequest("/settings", token, {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}
