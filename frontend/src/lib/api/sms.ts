import { apiRequest } from "./client";

export interface SMSStatus {
  configured: boolean;
  phone_number: string | null;
  last_synced_at: string | null;
  personal_phone: string | null;
}

export interface SMSMessage {
  id: string;
  twilio_sid: string | null;
  contact_id: string | null;
  from_number: string;
  to_number: string;
  body: string;
  status: string;
  direction: string;
  sent_at: string;
  created_at: string;
  contact_name?: string;
}

export interface SMSMessagesResponse {
  messages: SMSMessage[];
  total: number;
}

export interface SMSConversation {
  group_key: string;
  contact_id: string | null;
  other_number: string;
  contact_name: string;
  message_count: number;
  last_message_at: string;
  last_message: string;
  unread_count: number;
}

export interface SMSConversationsResponse {
  conversations: SMSConversation[];
}

export function getSMSStatus(token: string): Promise<SMSStatus> {
  return apiRequest("/sms/status", token);
}

export function configureSMS(
  token: string,
  config: { account_sid: string; auth_token: string; phone_number: string; personal_phone?: string }
): Promise<{ message: string }> {
  return apiRequest("/sms/configure", token, {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export function disconnectSMS(token: string): Promise<void> {
  return apiRequest("/sms/disconnect", token, { method: "DELETE" }) as Promise<void>;
}

export function syncSMS(token: string): Promise<{ synced: number; message?: string }> {
  return apiRequest("/sms/sync", token, { method: "POST" });
}

export function listSMSMessages(
  token: string,
  opts?: { contact_id?: string; search?: string; page?: number; limit?: number }
): Promise<SMSMessagesResponse> {
  const params = new URLSearchParams();
  if (opts?.contact_id) params.set("contact_id", opts.contact_id);
  if (opts?.search) params.set("search", opts.search);
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return apiRequest(`/sms/messages${qs ? "?" + qs : ""}`, token);
}

export function getSMSMessage(token: string, id: string): Promise<SMSMessage> {
  return apiRequest(`/sms/messages/${id}`, token);
}

export function listSMSConversations(token: string): Promise<SMSConversationsResponse> {
  return apiRequest("/sms/conversations", token);
}

export function sendSMS(
  token: string,
  body: { to: string; body: string; contact_id?: string }
): Promise<{ id: string; sid: string; status: string; message: string }> {
  return apiRequest("/sms/send", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
