import { apiRequest } from "./client";

export interface DealStage {
  id: string;
  name: string;
  position: number;
  color: string;
}

export interface Deal {
  id: string;
  contact_id: string;
  agent_id: string;
  stage_id: string | null;
  title: string;
  value: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  contact_name: string;
  stage_name: string;
  stage_color: string;
  property_id: string | null;
  property_address: string;
  last_activity_at: string | null;
}

export interface DealsResponse {
  deals: Deal[];
  total: number;
}

export interface DealFilters {
  stage_id?: string;
  contact_id?: string;
}

export interface CreateDealBody {
  contact_id: string;
  stage_id: string;
  title: string;
  value?: number;
  notes?: string;
  property_id?: string;
}

export interface UpdateDealBody {
  stage_id?: string;
  title?: string;
  value?: number;
  notes?: string;
  contact_id?: string;
  property_id?: string;
}

export function listDealStages(token: string): Promise<DealStage[]> {
  return apiRequest("/deal-stages", token);
}

export function listDeals(token: string, filters?: DealFilters): Promise<DealsResponse> {
  const params = new URLSearchParams();
  if (filters?.stage_id) params.set("stage_id", filters.stage_id);
  if (filters?.contact_id) params.set("contact_id", filters.contact_id);
  const qs = params.toString();
  return apiRequest(`/deals${qs ? "?" + qs : ""}`, token);
}

export function getDeal(token: string, id: string): Promise<Deal> {
  return apiRequest(`/deals/${id}`, token);
}

export function createDeal(token: string, body: CreateDealBody): Promise<Deal> {
  return apiRequest("/deals", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateDeal(token: string, id: string, body: UpdateDealBody): Promise<Deal> {
  return apiRequest(`/deals/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteDeal(token: string, id: string): Promise<void> {
  return apiRequest(`/deals/${id}`, token, { method: "DELETE" });
}
