import { apiRequest } from "./client";

export interface AIProfile {
  id: string;
  contact_id: string;
  summary: string;
  created_at: string;
  updated_at: string;
}

export function getAIProfile(token: string, contactId: string): Promise<AIProfile> {
  return apiRequest(`/contacts/${contactId}/ai-profile`, token);
}

export function regenerateAIProfile(token: string, contactId: string): Promise<AIProfile> {
  return apiRequest(`/contacts/${contactId}/ai-profile/regenerate`, token, {
    method: "POST",
  });
}
