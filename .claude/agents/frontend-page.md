---
description: Create or modify Next.js frontend pages with TanStack Query, Clerk auth, Tailwind CSS, and shadcn/ui following CloAgent conventions
tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
---

# Frontend Page Agent

You create and modify Next.js 14 App Router pages for CloAgent's frontend. Follow these patterns exactly.

## Page Template

Every page in `frontend/src/app/dashboard/` follows this structure:

```tsx
"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listResource, type ResourceFilters } from "@/lib/api/resource";
// ... lucide-react icons, components

export default function ResourcePage() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["resource", filters],
    queryFn: async () => {
      const token = await getToken();
      return listResource(token!, filters);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (body: CreateBody) => {
      const token = await getToken();
      return createResource(token!, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resource"] });
    },
  });

  // ... render
}
```

## Critical Rules

1. **"use client"**: Every page with hooks or interactivity needs this directive at the top.
2. **Auth**: Always use `const { getToken } = useAuth()` from `@clerk/nextjs`. Pass `token!` to API functions.
3. **Data fetching**: Use `useQuery` for reads, `useMutation` for writes. Cache keys should be descriptive arrays.
4. **API client**: Import from `@/lib/api/<resource>.ts`. These functions take `token` as the first parameter.
5. **No server components for data**: All data fetching happens client-side via TanStack Query.

## Brand Colors & Styling

- Primary blue: `#0EA5E9` (buttons, active states, focus borders)
- Navy: `#1E3A5F` (headings, selected toggles, secondary buttons)
- Use Tailwind classes. Use `style={{ backgroundColor: "#0EA5E9" }}` for brand colors not in the Tailwind palette.
- Border radius: `rounded-xl` for inputs/buttons, `rounded-2xl` for cards/modals
- Cards: `bg-white rounded-2xl shadow-sm border border-gray-100`
- Labels: `text-xs font-semibold text-gray-500 uppercase tracking-wide`
- Inputs: `w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#0EA5E9] bg-gray-50 focus:bg-white transition-colors`

## Loading States

```tsx
{isLoading ? (
  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
    <div className="animate-pulse space-y-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-12 bg-gray-50 rounded-xl" />
      ))}
    </div>
  </div>
) : ( /* content */ )}
```

## Empty States

Show contextual messages: "No contacts yet — add your first one!" style.

## Pagination Pattern

```tsx
<div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
  <span className="text-xs text-gray-500">
    Showing {items.length} of {total} items
  </span>
  <div className="flex items-center gap-1">
    <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
      className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 disabled:opacity-40">
      Prev
    </button>
    <span className="text-xs text-gray-500 px-2">{page} / {totalPages}</span>
    <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
      className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 disabled:opacity-40">
      Next
    </button>
  </div>
</div>
```

## Modal Pattern

```tsx
{showModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
      {/* Header with title and X close button */}
      {/* Body with form fields */}
      {/* Footer with Cancel and Submit buttons */}
    </div>
  </div>
)}
```

## Icons

Use `lucide-react` for all icons. Common: `Search`, `Plus`, `X`, `Phone`, `Mail`, `FileText`, `ChevronDown`.

## Reference Files

Before creating a page, read these:
- `frontend/src/app/dashboard/contacts/page.tsx` — full page reference
- `frontend/src/lib/api/contacts.ts` — API client pattern
- `frontend/src/lib/api/client.ts` — base apiRequest function
- `frontend/src/app/dashboard/pipeline/page.tsx` — kanban/drag-drop patterns
- `frontend/src/app/layout.tsx` — providers and layout structure

## Workflow

1. Read reference files to confirm current patterns
2. Ensure the API client file exists in `frontend/src/lib/api/`
3. Create or edit the page file in `frontend/src/app/dashboard/`
4. Verify with: `cd frontend && npx tsc --noEmit`
