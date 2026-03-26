import { apiRequest } from "./client";

export interface GmailStatus {
  connected: boolean;
  gmail_address: string | null;
  last_synced_at: string | null;
}

export interface Email {
  id: string;
  gmail_message_id: string;
  thread_id: string | null;
  contact_id: string | null;
  from_address: string | null;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string | null;
  snippet: string | null;
  body_text?: string | null;
  body_html?: string | null;
  labels: string[];
  is_read: boolean;
  is_outbound: boolean;
  gmail_date: string | null;
  created_at: string;
  contact_name?: string;
}

export interface EmailsResponse {
  emails: Email[];
  total: number;
}

export interface SendEmailBody {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  contact_id?: string;
  reply_to_message_id?: string;
}

export function getGmailStatus(token: string): Promise<GmailStatus> {
  return apiRequest("/gmail/status", token);
}

export function initGmailAuth(token: string): Promise<{ url: string }> {
  return apiRequest("/gmail/auth/init", token, { method: "POST" });
}

export function disconnectGmail(token: string): Promise<void> {
  return apiRequest("/gmail/disconnect", token, { method: "DELETE" }) as Promise<void>;
}

export function syncGmail(token: string): Promise<{ synced: number; message?: string }> {
  return apiRequest("/gmail/sync", token, { method: "POST" });
}

export function listEmails(
  token: string,
  opts?: { contact_id?: string; search?: string; page?: number; limit?: number }
): Promise<EmailsResponse> {
  const params = new URLSearchParams();
  if (opts?.contact_id) params.set("contact_id", opts.contact_id);
  if (opts?.search) params.set("search", opts.search);
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return apiRequest(`/gmail/emails${qs ? "?" + qs : ""}`, token);
}

export function getEmail(token: string, id: string): Promise<Email> {
  return apiRequest(`/gmail/emails/${id}`, token);
}

export function markEmailRead(token: string, id: string): Promise<{ success: boolean }> {
  return apiRequest(`/gmail/emails/${id}/read`, token, { method: "PATCH" });
}

export function sendEmail(token: string, body: SendEmailBody): Promise<{ id: string; thread_id: string; message: string }> {
  return apiRequest("/gmail/send", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface ForwardEmailBody {
  email_id: string;
  to: string;
  cc?: string;
  body?: string;
}

export function forwardEmail(token: string, body: ForwardEmailBody): Promise<{ id: string; thread_id: string; message: string }> {
  return apiRequest("/gmail/forward", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
