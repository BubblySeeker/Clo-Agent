const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export async function apiRequest<T>(
  path: string,
  token: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || res.statusText);
  }

  // 204 No Content — return empty object
  if (res.status === 204) return {} as T;
  return res.json();
}
