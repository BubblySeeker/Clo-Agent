import { apiRequest } from "./client";

export async function getDemoDataStatus(
  token: string
): Promise<{ active: boolean }> {
  return apiRequest("/demo-data", token);
}

export async function seedDemoData(
  token: string
): Promise<{ status: string }> {
  return apiRequest("/demo-data", token, { method: "POST" });
}

export async function clearDemoData(
  token: string
): Promise<{ status: string }> {
  return apiRequest("/demo-data", token, { method: "DELETE" });
}
