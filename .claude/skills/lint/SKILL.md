# /lint — Lint and Auto-format All Services

Run linting and auto-fix formatting across all services in the CloAgent monorepo.

## Instructions

Run the following steps sequentially, reporting results for each service:

### 1. Frontend (TypeScript/React)
```bash
cd frontend && npx prettier --write "src/**/*.{ts,tsx,js,jsx,json,css}" && npx next lint
```

### 2. Backend (Go)
```bash
cd backend && gofmt -w .
```

### 3. AI Service (Python)
Find all changed `.py` files in `ai-service/` and compile-check them:
```bash
cd ai-service && find . -name "*.py" -exec python -m py_compile {} +
```

## Output

For each service, report:
- Whether formatting was applied (files changed)
- Any lint errors or warnings with file:line references
- A summary: all clean, or list of issues to fix
