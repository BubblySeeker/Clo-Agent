import { apiRequest } from "./client";

export interface Property {
  id: string;
  agent_id: string;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  property_type: string | null;
  status: string;
  listing_type: string | null;
  mls_id: string | null;
  description: string | null;
  photos: string[];
  year_built: number | null;
  lot_size: number | null;
  created_at: string;
  updated_at: string;
  deals_count?: number;
}

export interface PropertiesResponse {
  properties: Property[];
  total: number;
}

export interface PropertyFilters {
  search?: string;
  status?: string;
  property_type?: string;
  listing_type?: string;
  min_price?: string;
  max_price?: string;
  bedrooms?: string;
  page?: number;
  limit?: number;
}

export interface CreatePropertyBody {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  property_type?: string;
  status?: string;
  listing_type?: string;
  mls_id?: string;
  description?: string;
  year_built?: number;
  lot_size?: number;
}

export interface UpdatePropertyBody {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  property_type?: string;
  status?: string;
  listing_type?: string;
  mls_id?: string;
  description?: string;
  year_built?: number;
  lot_size?: number;
}

export interface BuyerMatch {
  contact_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  score: number;
  pre_approved: boolean;
  timeline: string | null;
  budget_min: number | null;
  budget_max: number | null;
}

export interface MatchesResponse {
  matches: BuyerMatch[];
  total: number;
}

export function listProperties(
  token: string,
  filters?: PropertyFilters
): Promise<PropertiesResponse> {
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.property_type) params.set("property_type", filters.property_type);
  if (filters?.listing_type) params.set("listing_type", filters.listing_type);
  if (filters?.min_price) params.set("min_price", filters.min_price);
  if (filters?.max_price) params.set("max_price", filters.max_price);
  if (filters?.bedrooms) params.set("bedrooms", filters.bedrooms);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return apiRequest(`/properties${qs ? "?" + qs : ""}`, token);
}

export function getProperty(token: string, id: string): Promise<Property> {
  return apiRequest(`/properties/${id}`, token);
}

export function createProperty(
  token: string,
  body: CreatePropertyBody
): Promise<Property> {
  return apiRequest("/properties", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateProperty(
  token: string,
  id: string,
  body: UpdatePropertyBody
): Promise<Property> {
  return apiRequest(`/properties/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteProperty(token: string, id: string): Promise<void> {
  return apiRequest(`/properties/${id}`, token, { method: "DELETE" });
}

export function getPropertyMatches(
  token: string,
  id: string
): Promise<MatchesResponse> {
  return apiRequest(`/properties/${id}/matches`, token);
}
