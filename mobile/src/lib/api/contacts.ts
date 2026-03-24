import { apiRequest } from "./client";

export interface Contact {
  id: string;
  agent_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactsResponse {
  contacts: Contact[];
  total: number;
}

export interface ContactFilters {
  search?: string;
  source?: string;
  page?: number;
  limit?: number;
}

export function listContacts(
  token: string,
  filters?: ContactFilters
): Promise<ContactsResponse> {
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.source) params.set("source", filters.source);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return apiRequest(`/contacts${qs ? "?" + qs : ""}`, token);
}

export function getContact(token: string, id: string): Promise<Contact> {
  return apiRequest(`/contacts/${id}`, token);
}
