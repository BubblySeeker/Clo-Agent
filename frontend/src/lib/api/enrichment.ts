import { apiRequest } from "./client";

export interface Enrichment {
  id: string;
  contact_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string;
  source: string;
  source_email_id: string | null;
  confidence: "high" | "medium" | "low";
  status: "pending" | "accepted" | "rejected";
  evidence?: string;
  created_at: string;
}

export interface EnrichmentResponse {
  enrichments: Enrichment[];
  message?: string;
}

export interface AcceptAllResponse {
  accepted: number;
  total: number;
}

export function triggerEnrichment(token: string, contactId: string): Promise<EnrichmentResponse> {
  return apiRequest(`/contacts/${contactId}/enrich`, token, { method: "POST" });
}

export function listEnrichments(
  token: string,
  contactId: string,
  status?: string
): Promise<EnrichmentResponse> {
  const qs = status ? `?status=${status}` : "";
  return apiRequest(`/contacts/${contactId}/enrichments${qs}`, token);
}

export function acceptEnrichment(token: string, enrichmentId: string): Promise<Enrichment> {
  return apiRequest(`/enrichments/${enrichmentId}/accept`, token, { method: "POST" });
}

export function rejectEnrichment(token: string, enrichmentId: string): Promise<{ status: string }> {
  return apiRequest(`/enrichments/${enrichmentId}/reject`, token, { method: "POST" });
}

export function acceptAllEnrichments(token: string, contactId: string): Promise<AcceptAllResponse> {
  return apiRequest(`/contacts/${contactId}/enrichments/accept-all`, token, { method: "POST" });
}
