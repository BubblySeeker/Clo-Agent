# Phase 8: React Native Mobile Dialer - Research

**Researched:** 2026-03-24
**Domain:** React Native / Expo mobile app as thin CRM dialer shell
**Confidence:** HIGH

## Summary

Phase 8 builds a thin React Native mobile app that lets agents authenticate with their existing Clerk account, browse contacts, initiate API-triggered calls (their phone rings natively -- no VoIP SDK), view call history with transcript summaries, and configure their personal phone number. The app is intentionally minimal: all business logic lives in the existing Go backend. The mobile app is a UI shell that calls the same REST endpoints the Next.js frontend uses.

The recommended stack is Expo SDK 55 (latest, React Native 0.83) with `@clerk/clerk-expo` for auth, Expo Router for navigation, and TanStack Query for data fetching -- mirroring the web frontend's patterns. No Twilio Voice SDK is needed because calls are API-triggered (POST `/api/calls/initiate` causes the agent's real phone to ring natively). This eliminates all VoIP SDK complexity, push notification setup, and native module headaches.

**Primary recommendation:** Use `npx create-expo-app@latest --template default@sdk-55` to scaffold, add Clerk + TanStack Query + expo-secure-store, and build four screens (sign-in, contacts, call history, settings). The app reuses existing backend endpoints with zero backend changes.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MOB-01 | React Native (Expo) app scaffold with Clerk authentication | Expo SDK 55 + @clerk/clerk-expo + expo-secure-store; same Clerk project as web, JWT validated identically by Go backend |
| MOB-02 | Agent can view and search their contact list from the mobile app | GET /api/contacts endpoint already exists with ?search param; reuse Contact types from web frontend |
| MOB-03 | Agent can tap a contact to initiate a call (API-triggered, their phone rings) | POST /api/calls/initiate already exists and working (Phase 4 complete); returns within ~2s, phone rings natively |
| MOB-04 | Agent can view call history with status, duration, and transcript summaries | GET /api/calls exists; GET /api/calls/{id}/transcript will exist after Phase 6 -- app should gracefully handle missing transcripts |
| MOB-05 | Agent can configure their personal phone number in mobile settings | POST /api/sms/configure with {personal_phone} already works; GET /api/sms/status returns current personal_phone |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| expo | ~55.0.x | Build toolchain, managed workflow | Latest stable SDK (Feb 2026), React Native 0.83, New Architecture enabled by default |
| @clerk/clerk-expo | ~2.19.x | Authentication | Same Clerk project as web; JWT validated identically by Go backend; no backend changes needed |
| expo-router | ~55.0.x (bundled with Expo SDK 55) | File-based navigation | Built into Expo, same mental model as Next.js App Router the team already knows |
| @tanstack/react-query | ^5.x | Data fetching + caching | Same library as web frontend; same patterns, same query key conventions |
| expo-secure-store | ~14.x (bundled with Expo SDK 55) | Secure token storage | Clerk-recommended for storing session tokens; uses iOS Keychain / Android Keystore |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-native-safe-area-context | (bundled) | Safe area insets | Already included in Expo template |
| expo-linking | (bundled) | Deep links | Clerk OAuth callback redirect |
| expo-constants | (bundled) | Environment variables | API URL configuration |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Expo managed | Bare React Native | More control but much more build complexity; no benefit for a thin shell app |
| Expo Router | React Navigation standalone | Expo Router is built on React Navigation; file-based routing is simpler and matches web patterns |
| @tanstack/react-query | SWR or manual fetch | TQ already used in web frontend; consistency matters more than micro-optimization |

**Installation:**
```bash
npx create-expo-app@latest denver-mobile --template default@sdk-55
cd denver-mobile
npx expo install @clerk/clerk-expo expo-secure-store @tanstack/react-query
```

## Architecture Patterns

### Recommended Project Structure
```
denver-mobile/
  src/
    app/
      _layout.tsx              # Root: ClerkProvider + QueryClientProvider
      (auth)/
        sign-in.tsx            # Clerk sign-in screen (custom flow with RN components)
      (tabs)/
        _layout.tsx            # Tab navigator (Contacts, Calls, Settings)
        index.tsx              # Contacts list with search
        calls.tsx              # Call history list
        settings.tsx           # Personal phone number config
      call/
        [id].tsx               # Call detail: status, duration, transcript summary
      contact/
        [id].tsx               # Contact detail with tap-to-call button
    lib/
      api/
        client.ts              # apiRequest wrapper (same pattern as web, uses Clerk getToken)
        contacts.ts            # Contact types + API functions (copied from web)
        calls.ts               # Call types + API functions (copied from web)
        settings.ts            # SMS status/configure for personal_phone
    components/
      ContactRow.tsx           # Contact list item with phone icon
      CallRow.tsx              # Call history item with status badge
      CallButton.tsx           # Large tap-to-call button, triggers POST /api/calls/initiate
  app.json                     # Expo config
```

### Pattern 1: API Client (Mirror Web Pattern)
**What:** Same `apiRequest<T>` wrapper as web, but using Clerk Expo's `useAuth().getToken()`
**When to use:** Every API call
**Example:**
```typescript
// src/lib/api/client.ts
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080";

export async function apiRequest<T>(
  path: string,
  token: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
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

### Pattern 2: Clerk Auth Root Layout
**What:** Wrap entire app in ClerkProvider with expo-secure-store token cache
**When to use:** Root `_layout.tsx`
**Example:**
```typescript
// src/app/_layout.tsx
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import { tokenCache } from "@clerk/clerk-expo/token-cache";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Slot, useRouter, useSegments } from "expo-router";

const queryClient = new QueryClient();

function AuthGate() {
  const { isSignedIn, isLoaded } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  React.useEffect(() => {
    if (!isLoaded) return;
    const inAuth = segments[0] === "(auth)";
    if (!isSignedIn && !inAuth) router.replace("/(auth)/sign-in");
    if (isSignedIn && inAuth) router.replace("/(tabs)");
  }, [isSignedIn, isLoaded]);

  return <Slot />;
}

export default function RootLayout() {
  return (
    <ClerkProvider
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      tokenCache={tokenCache}
    >
      <QueryClientProvider client={queryClient}>
        <AuthGate />
      </QueryClientProvider>
    </ClerkProvider>
  );
}
```

### Pattern 3: Data Fetching with TanStack Query + Clerk Token
**What:** Same inline useQuery pattern as web frontend
**When to use:** Every data-fetching screen
**Example:**
```typescript
const { getToken } = useAuth();
const { data, isLoading } = useQuery({
  queryKey: ["contacts", { search }],
  queryFn: async () => {
    const token = await getToken();
    return listContacts(token!, { search, limit: 50 });
  },
});
```

### Anti-Patterns to Avoid
- **Do NOT use Twilio Voice React Native SDK:** The entire point of API-triggered calls is to avoid VoIP SDK complexity. The agent's native phone handles voice.
- **Do NOT build a full CRM in mobile:** This is a thin dialer shell. No deal management, pipeline, AI chat, analytics, or workflow screens.
- **Do NOT use different auth flow:** Same Clerk project, same JWT format. The Go backend validates tokens identically regardless of client.
- **Do NOT use Expo Go for development:** Clerk's OAuth requires a development build (Expo Dev Client). Expo Go does not support custom native modules.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Authentication | Custom auth flow | @clerk/clerk-expo | Same Clerk project as web; tokens work identically with Go backend |
| Secure token storage | AsyncStorage for tokens | expo-secure-store via @clerk/clerk-expo/token-cache | Encrypted platform-native storage (iOS Keychain, Android Keystore) |
| Navigation | Manual screen management | expo-router file-based routing | Mirrors Next.js App Router patterns the team knows |
| Data fetching | Manual fetch + useState | @tanstack/react-query | Same cache patterns as web; automatic background refetch, loading states |
| Phone number formatting | Manual regex | Reuse E.164 validation from backend | Backend already validates; mobile just sends the string |
| API types | New type definitions | Copy types from web frontend `lib/api/` | Contact, CallLog, CallLogsResponse are identical |

**Key insight:** The mobile app should share as many patterns and types as possible with the web frontend. The API layer (`lib/api/`) files can be nearly copy-pasted with only the environment variable and token acquisition mechanism changed.

## Common Pitfalls

### Pitfall 1: Using Expo Go Instead of Dev Build
**What goes wrong:** Clerk OAuth flows and expo-secure-store require native modules that Expo Go does not support. The app crashes or auth fails silently.
**Why it happens:** Developers default to Expo Go for quick iteration.
**How to avoid:** Use `npx expo start --dev-client` from day one. Create a development build with `npx expo prebuild` and `npx expo run:ios` / `npx expo run:android`.
**Warning signs:** "Unable to resolve module" errors, blank screen on auth redirect.

### Pitfall 2: Assuming Transcript Endpoints Exist
**What goes wrong:** Phase 8 lists "view call history with transcript summaries" but `GET /api/calls/{id}/transcript` is a Phase 6 deliverable that may not exist when Phase 8 is built.
**Why it happens:** Phase dependency says "depends on Phase 4" but transcript viewing depends on Phase 6.
**How to avoid:** Build the transcript UI conditionally -- show transcript summary if `ai_summary` field exists on the call log, show "No transcript available" otherwise. The call history screen works without transcripts.
**Warning signs:** 404 errors when fetching transcript for calls without recordings or transcription.

### Pitfall 3: Hardcoding API URL
**What goes wrong:** App works in development but fails when pointing to a different backend.
**Why it happens:** Using `http://localhost:8080` directly instead of environment variable.
**How to avoid:** Use `EXPO_PUBLIC_API_URL` env var in `app.json` or `.env`. For local development, use your machine's LAN IP (e.g., `http://192.168.1.x:8080`) since the iOS/Android simulator can't reach `localhost` on the host.
**Warning signs:** Network request failed errors on simulator/device.

### Pitfall 4: Not Handling Call Initiation Latency
**What goes wrong:** Agent taps "Call" and nothing visible happens for 2-3 seconds while Twilio creates the call. Agent taps again, creating duplicate calls.
**Why it happens:** API-triggered calls have inherent latency (backend -> Twilio API -> agent's phone rings).
**How to avoid:** Immediately show a "Calling..." state with disabled button after tap. Use `useMutation` with loading state. Show "Your phone will ring shortly" feedback.
**Warning signs:** Duplicate call_logs entries, confused users.

### Pitfall 5: Forgetting CORS for Mobile
**What goes wrong:** API requests from the mobile app are blocked by CORS.
**Why it happens:** Go backend's CORS middleware might only whitelist `http://localhost:3000`.
**How to avoid:** Check `middleware/cors.go` -- React Native `fetch` does not send an Origin header in most configurations, so CORS is typically not an issue for native apps. But verify this works by testing from a real device/simulator early.
**Warning signs:** CORS preflight failures in network logs.

### Pitfall 6: Expo SDK 55 New Architecture Requirement
**What goes wrong:** Some third-party libraries may not support the New Architecture, causing build failures.
**Why it happens:** Expo SDK 55 requires the New Architecture (cannot be disabled). SDK 54 was the last version where it could be disabled.
**How to avoid:** This app uses only official Expo packages and Clerk's Expo SDK, which all support the New Architecture. Do not add random third-party native modules without checking compatibility.
**Warning signs:** Build errors mentioning "TurboModules" or "Fabric".

## Code Examples

### Tap-to-Call Button
```typescript
// src/components/CallButton.tsx
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { initiateCall } from "../lib/api/calls";
import { Alert, TouchableOpacity, Text, ActivityIndicator } from "react-native";

export function CallButton({ contactId, phone }: { contactId: string; phone: string }) {
  const { getToken } = useAuth();

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return initiateCall(token!, { to: phone, contact_id: contactId });
    },
    onSuccess: () => {
      Alert.alert("Calling", "Your phone will ring shortly. Answer to connect.");
    },
    onError: (err) => {
      Alert.alert("Call Failed", err.message);
    },
  });

  return (
    <TouchableOpacity
      onPress={() => mutation.mutate()}
      disabled={mutation.isPending}
      style={{ backgroundColor: "#22c55e", padding: 16, borderRadius: 12, alignItems: "center" }}
    >
      {mutation.isPending ? (
        <ActivityIndicator color="white" />
      ) : (
        <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>Call {phone}</Text>
      )}
    </TouchableOpacity>
  );
}
```

### Contact List Screen
```typescript
// src/app/(tabs)/index.tsx
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { listContacts } from "../../lib/api/contacts";
import { useState } from "react";
import { FlatList, TextInput, View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";

export default function ContactsScreen() {
  const { getToken } = useAuth();
  const [search, setSearch] = useState("");
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ["contacts", { search }],
    queryFn: async () => {
      const token = await getToken();
      return listContacts(token!, { search: search || undefined, limit: 50 });
    },
  });

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        placeholder="Search contacts..."
        value={search}
        onChangeText={setSearch}
        style={{ padding: 12, borderBottomWidth: 1, borderColor: "#e5e7eb" }}
      />
      <FlatList
        data={data?.contacts ?? []}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => router.push(`/contact/${item.id}`)}
            style={{ padding: 16, borderBottomWidth: 1, borderColor: "#f3f4f6" }}
          >
            <Text style={{ fontSize: 16, fontWeight: "500" }}>
              {item.first_name} {item.last_name}
            </Text>
            {item.phone && <Text style={{ color: "#6b7280" }}>{item.phone}</Text>}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
```

### Personal Phone Settings Screen
```typescript
// src/app/(tabs)/settings.tsx
import { useAuth } from "@clerk/clerk-expo";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TextInput, View, Text, TouchableOpacity, Alert } from "react-native";
import { useState, useEffect } from "react";
import { apiRequest } from "../../lib/api/client";

export default function SettingsScreen() {
  const { getToken, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState("");

  const { data } = useQuery({
    queryKey: ["sms-status"],
    queryFn: async () => {
      const token = await getToken();
      return apiRequest<{ configured: boolean; personal_phone?: string }>("/sms/status", token!);
    },
  });

  useEffect(() => {
    if (data?.personal_phone) setPhone(data.personal_phone);
  }, [data]);

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return apiRequest("/sms/configure", token!, {
        method: "POST",
        body: JSON.stringify({ personal_phone: phone }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sms-status"] });
      Alert.alert("Saved", "Personal phone number updated.");
    },
  });

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>Personal Phone Number</Text>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="+1 (555) 123-4567"
        keyboardType="phone-pad"
        style={{ borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, padding: 12, marginBottom: 16 }}
      />
      <TouchableOpacity
        onPress={() => mutation.mutate()}
        style={{ backgroundColor: "#3b82f6", padding: 14, borderRadius: 8, alignItems: "center" }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>Save</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => signOut()}
        style={{ marginTop: 32, padding: 14, alignItems: "center" }}
      >
        <Text style={{ color: "#ef4444" }}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Expo Go for all development | Dev builds (expo-dev-client) | Expo SDK 50+ | Required for native modules like Clerk OAuth |
| React Navigation manual config | Expo Router file-based | Expo SDK 49+ | Simpler routing, mirrors Next.js patterns |
| @clerk/clerk-expo v1 | @clerk/clerk-expo v2 (Core 2) | 2024 | New token cache API, improved Expo compatibility |
| Expo SDK 54 (opt-out New Arch) | Expo SDK 55 (New Arch required) | Feb 2026 | Cannot disable New Architecture; all deps must be compatible |
| Custom token storage | @clerk/clerk-expo/token-cache | @clerk/clerk-expo v2+ | Built-in expo-secure-store integration |

**Deprecated/outdated:**
- `@clerk/clerk-expo` v1.x: Use v2.x (Core 2 migration required)
- Expo SDK 52/53 templates from architecture research: Use SDK 55 (latest)
- `@twilio/voice-react-native-sdk`: NOT needed for Phase 8 (API-triggered calls, no VoIP)

## Open Questions

1. **CORS behavior with React Native fetch**
   - What we know: React Native's `fetch` typically does not send an Origin header, so CORS middleware should not block requests.
   - What's unclear: Whether the Go CORS middleware in this project has an explicit whitelist that would reject requests without an Origin header.
   - Recommendation: Test API request from simulator early in development. If blocked, update `middleware/cors.go` to allow requests without Origin or add a wildcard for mobile.

2. **Transcript endpoint availability**
   - What we know: Phase 8 depends on Phase 4 (done), but MOB-04 references transcript summaries which require Phase 6.
   - What's unclear: Whether Phases 6-7 will be complete before Phase 8 starts.
   - Recommendation: Build call history UI that works without transcripts. Show transcript summary conditionally when the field exists. This makes Phase 8 buildable immediately after Phase 4/5.

3. **Environment variable configuration for mobile**
   - What we know: Expo uses `EXPO_PUBLIC_*` prefix for client-side env vars. The Clerk publishable key and API URL need to be configured.
   - What's unclear: Best practice for multi-environment (dev/staging/prod) config in Expo SDK 55.
   - Recommendation: Use `.env` file with `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`. For dev, use LAN IP for API URL.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (bundled with Expo SDK 55) + React Native Testing Library |
| Config file | `denver-mobile/jest.config.js` (to be created in Wave 0) |
| Quick run command | `cd denver-mobile && npx jest --passWithNoTests` |
| Full suite command | `cd denver-mobile && npx jest` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MOB-01 | Clerk auth flow renders, redirects unauthenticated | unit | `cd denver-mobile && npx jest src/__tests__/auth.test.tsx -x` | No -- Wave 0 |
| MOB-02 | Contact list fetches and renders, search filters | unit | `cd denver-mobile && npx jest src/__tests__/contacts.test.tsx -x` | No -- Wave 0 |
| MOB-03 | Call initiation mutation fires POST /api/calls/initiate | unit | `cd denver-mobile && npx jest src/__tests__/call-button.test.tsx -x` | No -- Wave 0 |
| MOB-04 | Call history list renders with status and duration | unit | `cd denver-mobile && npx jest src/__tests__/call-history.test.tsx -x` | No -- Wave 0 |
| MOB-05 | Settings screen saves personal phone number | unit | `cd denver-mobile && npx jest src/__tests__/settings.test.tsx -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd denver-mobile && npx jest --passWithNoTests`
- **Per wave merge:** `cd denver-mobile && npx jest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `denver-mobile/jest.config.js` -- Jest configuration for Expo SDK 55
- [ ] `denver-mobile/src/__tests__/auth.test.tsx` -- Clerk auth gate tests
- [ ] `denver-mobile/src/__tests__/contacts.test.tsx` -- Contact list tests
- [ ] `denver-mobile/src/__tests__/call-button.test.tsx` -- Call initiation tests
- [ ] `denver-mobile/src/__tests__/call-history.test.tsx` -- Call history tests
- [ ] `denver-mobile/src/__tests__/settings.test.tsx` -- Settings screen tests
- [ ] Framework install: `npx expo install jest-expo @testing-library/react-native` -- testing deps

## Sources

### Primary (HIGH confidence)
- [Expo SDK 55 Changelog](https://expo.dev/changelog/sdk-55) -- Latest SDK, React Native 0.83, New Architecture required
- [Expo create-expo-app documentation](https://docs.expo.dev/more/create-expo/) -- Template default@sdk-55
- [Clerk Expo Quickstart](https://clerk.com/docs/expo/getting-started/quickstart) -- Auth setup with token cache
- [Clerk Expo SDK Reference](https://clerk.com/docs/reference/expo/overview) -- API surface
- [@clerk/clerk-expo npm](https://www.npmjs.com/package/@clerk/clerk-expo) -- v2.19.31 latest
- [Expo Router Introduction](https://docs.expo.dev/router/introduction/) -- File-based routing
- [TanStack Query React Native docs](https://tanstack.com/query/v5/docs/react/react-native) -- RN-specific setup
- [expo-secure-store docs](https://docs.expo.dev/versions/latest/sdk/securestore/) -- Encrypted token storage

### Secondary (MEDIUM confidence)
- Existing web frontend patterns (`frontend/src/lib/api/client.ts`, `contacts.ts`, `calls.ts`) -- Verified by reading source
- Backend route inventory (`backend/cmd/api/main.go`) -- All endpoints confirmed present
- Backend auth middleware (`backend/internal/middleware/auth.go`) -- Clerk JWT validation confirmed client-agnostic

### Tertiary (LOW confidence)
- None -- all claims verified against primary sources or existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Expo SDK 55, Clerk Expo, TanStack Query are all mature, well-documented, and verified against npm/official docs
- Architecture: HIGH -- Thin shell pattern is explicitly prescribed by project architecture; all required backend endpoints exist and are verified in main.go
- Pitfalls: HIGH -- Based on known Expo development patterns and verified Phase 6/7 dependency gap

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable; Expo SDK 55 is current, Clerk v2 is stable)
