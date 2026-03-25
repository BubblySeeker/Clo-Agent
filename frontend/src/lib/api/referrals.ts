import { apiRequest } from "./client";

export interface Referral {
  id: string;
  agent_id: string;
  referrer_id: string;
  referred_id: string;
  notes: string | null;
  created_at: string;
  referrer_name: string;
  referred_name: string;
}

export interface ReferralsResponse {
  referrals: Referral[];
  total: number;
}

export interface NetworkNode {
  id: string;
  name: string;
  source: string;
  deals_count: number;
  referral_count: number;
}

export interface NetworkEdge {
  from: string;
  to: string;
  created_at: string;
}

export interface NetworkResponse {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

export interface TopReferrer {
  id: string;
  name: string;
  referral_count: number;
}

export interface ReferralStats {
  total_referrals: number;
  total_referred: number;
  conversion_rate: number;
  top_referrers: TopReferrer[];
}

export function listReferrals(token: string): Promise<ReferralsResponse> {
  return apiRequest("/referrals", token);
}

export function createReferral(
  token: string,
  body: { referrer_id: string; referred_id: string; notes?: string }
): Promise<Referral> {
  return apiRequest("/referrals", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteReferral(token: string, id: string): Promise<void> {
  return apiRequest(`/referrals/${id}`, token, { method: "DELETE" });
}

export function getReferralNetwork(token: string): Promise<NetworkResponse> {
  return apiRequest("/referrals/network", token);
}

export function getReferralStats(token: string): Promise<ReferralStats> {
  return apiRequest("/referrals/stats", token);
}
