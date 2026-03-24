import { apiRequest } from "./client";

export interface SMSStatus {
  configured: boolean;
  phone_number: string | null;
  last_synced_at: string | null;
  personal_phone: string | null;
}

export function getSMSStatus(token: string): Promise<SMSStatus> {
  return apiRequest("/sms/status", token);
}

export function savePersonalPhone(
  token: string,
  phone: string
): Promise<{ message: string }> {
  return apiRequest("/sms/configure", token, {
    method: "POST",
    body: JSON.stringify({ personal_phone: phone }),
  });
}
