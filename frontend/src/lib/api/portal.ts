import { apiRequest } from "./client";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortalToken {
  id: string;
  contact_id: string;
  agent_id: string;
  token: string;
  expires_at: string;
  last_used_at: string | null;
  created_at: string;
  contact_name?: string;
  contact_email?: string | null;
}

export interface PortalSettings {
  id?: string;
  agent_id: string;
  show_deal_value: boolean;
  show_activities: boolean;
  show_properties: boolean;
  welcome_message: string | null;
  agent_phone: string | null;
  agent_email: string | null;
}

export interface PortalDeal {
  id: string;
  title: string;
  value?: number | null;
  notes?: string | null;
  stage_name: string;
  stage_position: number;
  stage_color: string;
  property_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortalStage {
  name: string;
  position: number;
  color: string;
}

export interface PortalActivity {
  id: string;
  type: string;
  body: string;
  deal_title?: string | null;
  created_at: string;
}

export interface PortalProperty {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price?: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  property_type: string | null;
  status: string | null;
  description: string | null;
}

export interface PortalAuthResponse {
  contact: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
  };
  agent: {
    name: string;
    email: string;
  };
  settings: PortalSettings;
}

// ---------------------------------------------------------------------------
// Agent-side API (requires Clerk token)
// ---------------------------------------------------------------------------

export function createPortalInvite(
  token: string,
  contactId: string
): Promise<PortalToken> {
  return apiRequest(`/portal/invite/${contactId}`, token, { method: "POST" });
}

export function listPortalInvites(
  token: string
): Promise<{ invites: PortalToken[] }> {
  return apiRequest("/portal/invites", token);
}

export function revokePortalInvite(
  token: string,
  tokenId: string
): Promise<void> {
  return apiRequest(`/portal/invite/${tokenId}`, token, { method: "DELETE" });
}

export function getPortalSettings(token: string): Promise<PortalSettings> {
  return apiRequest("/portal/settings", token);
}

export function updatePortalSettings(
  token: string,
  body: Partial<Omit<PortalSettings, "id" | "agent_id">>
): Promise<PortalSettings> {
  return apiRequest("/portal/settings", token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Client-side API (public — no Clerk token, uses portal token in URL)
// ---------------------------------------------------------------------------

async function portalFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api/portal${path}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export function portalAuth(portalToken: string): Promise<PortalAuthResponse> {
  return portalFetch(`/auth/${portalToken}`);
}

export function portalDashboard(
  portalToken: string
): Promise<{
  deals: PortalDeal[];
  activities: PortalActivity[];
  welcome_message: string | null;
}> {
  return portalFetch(`/view/${portalToken}/dashboard`);
}

export function portalDeals(
  portalToken: string
): Promise<{ deals: PortalDeal[]; stages: PortalStage[] }> {
  return portalFetch(`/view/${portalToken}/deals`);
}

export function portalProperties(
  portalToken: string
): Promise<{ properties: PortalProperty[] }> {
  return portalFetch(`/view/${portalToken}/properties`);
}

export function portalTimeline(
  portalToken: string
): Promise<{ activities: PortalActivity[] }> {
  return portalFetch(`/view/${portalToken}/timeline`);
}
