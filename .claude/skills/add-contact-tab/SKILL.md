---
name: add-contact-tab
description: /add-contact-tab <tab-name> — Scaffold a new tab on the contact detail page following existing patterns
user_invocable: true
---

# Add Contact Tab

Scaffolds a new tab on the contact detail page (`frontend/src/app/dashboard/contacts/[id]/page.tsx`).

## Arguments

- `tab-name` (required): The name of the tab to add (e.g., "Buyer Profile", "AI Profile")

## Steps

1. **Read current tab structure** from `frontend/src/app/dashboard/contacts/[id]/page.tsx`:
   - Identify the tab list (button row) and tab content panels
   - List existing tabs and their state variable name

2. **Check available API functions**:
   - Read `frontend/src/lib/api/` directory for relevant API modules
   - Read `backend/internal/handlers/` for matching endpoints
   - Report which API functions already exist for this tab's data

3. **Show the user a plan** before writing code:
   - Tab button addition (where in the tab row)
   - State management (which query keys, mutations)
   - Component structure (form fields, display layout)
   - API functions needed (existing vs new)

4. **After user confirms**, add:
   - Tab button in the tab row
   - Tab content panel with loading/empty/error states
   - TanStack Query for data fetching
   - Form with react-hook-form if the tab has editable data
   - Mutations for create/update operations

## Patterns to Follow

- Use inline TanStack Query (no custom hook wrapper files)
- Use react-hook-form + Zod for forms
- Use Tailwind CSS only (no component library)
- Follow the existing color scheme: `#1E3A5F` (dark navy), `#0EA5E9` (sky blue), `#F9FAFB` (light bg)
- Match existing tab panel padding and spacing
- Use `apiRequest` from `@/lib/api/client.ts` for API calls

## Example Usage

```
/add-contact-tab Buyer Profile
/add-contact-tab AI Profile
```
