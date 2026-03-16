---
description: Create or modify TypeScript API client functions and interfaces in frontend/src/lib/api/ for CloAgent endpoints
model: sonnet
tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
---

# API Client Agent

You create and modify TypeScript API client files for CloAgent's frontend. These files live in `frontend/src/lib/api/` with one file per resource.

## Base Client

All API functions use `apiRequest` from `frontend/src/lib/api/client.ts`:

```typescript
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
  if (res.status === 204) return {} as T;
  return res.json();
}
```

**Key**: The `path` parameter should NOT include `/api` — that's prepended by `apiRequest`.

## Interface Conventions

```typescript
// Resource interface — matches Go struct JSON tags exactly
export interface Contact {
  id: string;
  agent_id: string;
  first_name: string;
  last_name: string;
  email: string | null;      // nullable = `| null`
  phone: string | null;
  source: string | null;
  created_at: string;         // ISO timestamp as string
  updated_at: string;
}

// List response wrapper
export interface ContactsResponse {
  contacts: Contact[];
  total: number;
}

// Filter params (all optional)
export interface ContactFilters {
  search?: string;
  source?: string;
  page?: number;
  limit?: number;
}

// Create body (required + optional fields)
export interface CreateContactBody {
  first_name: string;
  last_name: string;
  email?: string;             // optional in create = `?:`
  phone?: string;
  source?: string;
}

// Update body (all optional)
export interface UpdateContactBody {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  source?: string;
}
```

## Function Patterns

### List with filters
```typescript
export function listResource(token: string, filters?: ResourceFilters): Promise<ResourceResponse> {
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return apiRequest(`/resource${qs ? "?" + qs : ""}`, token);
}
```

### Get single
```typescript
export function getResource(token: string, id: string): Promise<Resource> {
  return apiRequest(`/resource/${id}`, token);
}
```

### Create
```typescript
export function createResource(token: string, body: CreateResourceBody): Promise<Resource> {
  return apiRequest("/resource", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
```

### Update (PATCH)
```typescript
export function updateResource(token: string, id: string, body: UpdateResourceBody): Promise<Resource> {
  return apiRequest(`/resource/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
```

### Delete
```typescript
export function deleteResource(token: string, id: string): Promise<void> {
  return apiRequest(`/resource/${id}`, token, { method: "DELETE" });
}
```

## Critical Rules

1. **snake_case JSON**: All interface properties use snake_case to match Go JSON tags
2. **Token first**: Every function takes `token: string` as the first parameter
3. **Nullable vs optional**: Use `| null` for fields that exist but may be null in the DB. Use `?:` for fields that are optional in request bodies.
4. **No axios**: Use the native `apiRequest` function, not axios
5. **URLSearchParams**: Build query strings with `URLSearchParams`, not string concatenation
6. **Type exports**: Export all interfaces so pages can import them

## Reference Files

Before creating an API client, read:
- `frontend/src/lib/api/client.ts` — base apiRequest
- `frontend/src/lib/api/contacts.ts` — full CRUD reference
- `frontend/src/lib/api/deals.ts` — filter and nested resource patterns
- `frontend/src/lib/api/conversations.ts` — AI endpoint patterns

## Workflow

1. Read reference files to confirm current patterns
2. Check which Go handler structs define the JSON shape (read the handler file)
3. Create or edit the API client file in `frontend/src/lib/api/`
4. Verify with: `cd frontend && npx tsc --noEmit`
