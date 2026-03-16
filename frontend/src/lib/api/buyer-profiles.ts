import { apiRequest } from "./client";

export interface BuyerProfile {
  id: string;
  contact_id: string;
  budget_min: number | null;
  budget_max: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  locations: string[];
  must_haves: string[];
  deal_breakers: string[];
  property_type: string | null;
  pre_approved: boolean;
  timeline: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBuyerProfileBody {
  budget_min?: number;
  budget_max?: number;
  bedrooms?: number;
  bathrooms?: number;
  locations?: string[];
  must_haves?: string[];
  deal_breakers?: string[];
  property_type?: string;
  pre_approved?: boolean;
  timeline?: string;
  notes?: string;
}

export type UpdateBuyerProfileBody = Partial<CreateBuyerProfileBody>;

export function getBuyerProfile(token: string, contactId: string): Promise<BuyerProfile> {
  return apiRequest(`/contacts/${contactId}/buyer-profile`, token);
}

export function createBuyerProfile(token: string, contactId: string, body: CreateBuyerProfileBody): Promise<BuyerProfile> {
  return apiRequest(`/contacts/${contactId}/buyer-profile`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateBuyerProfile(token: string, contactId: string, body: UpdateBuyerProfileBody): Promise<BuyerProfile> {
  return apiRequest(`/contacts/${contactId}/buyer-profile`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
