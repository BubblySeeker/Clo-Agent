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
  outcome: string | null;
  answered_by: string | null;
  transcription_status: "processing" | "completed" | "failed" | null;
  /** AI-generated transcript summary (available after Phase 6 transcription) */
  ai_summary?: string;
}

export interface CallLogsResponse {
  calls: CallLog[];
  total: number;
}

export function listCallLogs(
  token: string,
  opts?: {
    contact_id?: string;
    direction?: string;
    page?: number;
    limit?: number;
  }
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
