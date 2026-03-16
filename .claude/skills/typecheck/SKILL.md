# /typecheck — Type-check All Services

Verify types compile across the frontend (TypeScript) and backend (Go).

## Instructions

Run both checks and report results:

### 1. Frontend (TypeScript)
```bash
cd frontend && npx tsc --noEmit
```

### 2. Backend (Go)
```bash
cd backend && go build ./...
```

## Output

For each service, report:
- Clean compilation, or list of type errors with `file:line` references
- A final summary: all passing, or count of errors per service
