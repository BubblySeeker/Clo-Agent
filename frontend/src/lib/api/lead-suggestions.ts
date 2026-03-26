import { apiRequest } from "./client";

export interface LeadSuggestion {
  id: string;
  agent_id: string;
  email_id: string;
  from_address: string;
  from_name: string | null;
  suggested_first_name: string | null;
  suggested_last_name: string | null;
  suggested_phone: string | null;
  suggested_intent: string | null;
  confidence: number;
  status: string;
  created_at: string;
  // Joined from emails table
  subject: string | null;
  snippet: string | null;
  email_date: string | null;
}

export interface LeadSuggestionsResponse {
  suggestions: LeadSuggestion[];
  total: number;
}

export interface AcceptResponse {
  contact_id: string;
  first_name: string;
  last_name: string;
  email: string;
  message: string;
}

export function listLeadSuggestions(
  token: string,
  status: string = "pending"
): Promise<LeadSuggestionsResponse> {
  return apiRequest(`/lead-suggestions?status=${status}`, token);
}

export function acceptLeadSuggestion(
  token: string,
  id: string,
  overrides?: { first_name?: string; last_name?: string; phone?: string }
): Promise<AcceptResponse> {
  return apiRequest(`/lead-suggestions/${id}/accept`, token, {
    method: "POST",
    body: overrides ? JSON.stringify(overrides) : undefined,
  });
}

export function dismissLeadSuggestion(
  token: string,
  id: string
): Promise<{ message: string }> {
  return apiRequest(`/lead-suggestions/${id}/dismiss`, token, {
    method: "POST",
  });
}
