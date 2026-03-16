# /test-endpoint — Test a Backend API Endpoint

Test a backend API endpoint against the running local server with proper Clerk authentication.

## Arguments

The user provides:
- **Method** (GET, POST, PATCH, DELETE) — defaults to GET
- **Path** (e.g., `/api/contacts`, `/api/deals/123`)
- **Body** (optional JSON for POST/PATCH)

## Instructions

1. Get a Clerk session token for the local dev user:
   ```bash
   cd frontend && node -e "
   // If a dev token is available in .env.local, use it
   const fs = require('fs');
   const env = fs.readFileSync('.env.local', 'utf8');
   const match = env.match(/CLERK_DEV_TOKEN=(.+)/);
   if (match) console.log(match[1].trim());
   else console.log('NO_TOKEN');
   "
   ```

2. If no dev token is available, instruct the user to:
   - Open the browser dev tools on the running app
   - Run: `await window.Clerk.session.getToken()`
   - Paste the token back

3. Make the request:
   ```bash
   curl -s -X <METHOD> \
     -H "Authorization: Bearer <TOKEN>" \
     -H "Content-Type: application/json" \
     -d '<BODY>' \
     http://localhost:8080<PATH> | jq .
   ```

4. Report the HTTP status code and formatted JSON response.

## Output

- The full curl command used (for reproducibility)
- HTTP status code
- Formatted JSON response body
- Any errors or connection issues
