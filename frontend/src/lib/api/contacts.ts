import { apiRequest } from "./client";

export interface Contact {
  id: string;
  agent_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  folder_id: string | null;
  folder_name: string | null;
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
  folder_id?: string;
  page?: number;
  limit?: number;
}

export interface CreateContactBody {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  source?: string;
}

export interface UpdateContactBody {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  source?: string;
  folder_id?: string | null;
}

export function listContacts(token: string, filters?: ContactFilters): Promise<ContactsResponse> {
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.source) params.set("source", filters.source);
  if (filters?.folder_id) params.set("folder_id", filters.folder_id);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return apiRequest(`/contacts${qs ? "?" + qs : ""}`, token);
}

export function getContact(token: string, id: string): Promise<Contact> {
  return apiRequest(`/contacts/${id}`, token);
}

export function createContact(token: string, body: CreateContactBody): Promise<Contact> {
  return apiRequest("/contacts", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateContact(token: string, id: string, body: UpdateContactBody): Promise<Contact> {
  return apiRequest(`/contacts/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteContact(token: string, id: string): Promise<void> {
  return apiRequest(`/contacts/${id}`, token, { method: "DELETE" });
}
