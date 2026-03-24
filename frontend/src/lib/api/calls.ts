import { apiRequest } from "./client";

export interface CallLog {
  id: string;
  twilio_sid: string | null;
  contact_id: string | null;
  from_number: string;
  to_number: string;
  direction: string;
  status: string;
  duration: number;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  contact_name?: string;
  recording_sid: string | null;
  recording_duration: number;
  has_recording: boolean;
  transcription_status: "processing" | "completed" | "failed" | null;
}

export interface CallLogsResponse {
  calls: CallLog[];
  total: number;
}

export function listCallLogs(
  token: string,
  opts?: { contact_id?: string; direction?: string; page?: number; limit?: number }
): Promise<CallLogsResponse> {
  const params = new URLSearchParams();
  if (opts?.contact_id) params.set("contact_id", opts.contact_id);
  if (opts?.direction) params.set("direction", opts.direction);
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return apiRequest(`/calls${qs ? "?" + qs : ""}`, token);
}

export function getCallLog(token: string, id: string): Promise<CallLog> {
  return apiRequest(`/calls/${id}`, token);
}

export function initiateCall(
  token: string,
  body: { to: string; contact_id?: string }
): Promise<{ id: string; sid: string; status: string; message: string }> {
  return apiRequest("/calls/initiate", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function syncCallLogs(token: string): Promise<{ synced: number }> {
  return apiRequest("/calls/sync", token, { method: "POST" });
}

export interface AIAction {
  type: "create_task" | "update_buyer_profile" | "update_deal_stage";
  params: Record<string, unknown>;
  status: "pending" | "confirmed" | "dismissed";
}

export interface CallTranscript {
  id: string;
  call_id: string;
  full_text: string;
  speaker_segments: Array<{
    speaker: "agent" | "client" | "unknown";
    start: number;
    end: number;
    text: string;
  }>;
  ai_summary: string | null;
  ai_actions: AIAction[];
  status: "pending" | "processing" | "completed" | "failed";
  duration_seconds: number | null;
  word_count: number | null;
  created_at: string;
  completed_at: string | null;
}

export function getCallTranscript(token: string, callId: string): Promise<CallTranscript> {
  return apiRequest(`/calls/${callId}/transcript`, token);
}

export function confirmTranscriptAction(
  token: string,
  callId: string,
  actionIndex: number
): Promise<{ status: string }> {
  return apiRequest(`/calls/${callId}/transcript/actions/${actionIndex}/confirm`, token, {
    method: "POST",
  });
}

export function dismissTranscriptAction(
  token: string,
  callId: string,
  actionIndex: number
): Promise<{ status: string }> {
  return apiRequest(`/calls/${callId}/transcript/actions/${actionIndex}/dismiss`, token, {
    method: "POST",
  });
}

export function getRecordingUrl(callId: string): string {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
  return `${API_URL}/api/calls/${callId}/recording`;
}
