# CloAgent

An AI-powered customer relationship management platform.

## Monorepo Structure

```
/
├── frontend/      # Next.js 14 app (TypeScript, Tailwind, shadcn/ui)
├── ai-service/    # Python FastAPI service (LangChain, pgvector)
└── backend/       # (additional services)
```

---

## Prerequisites

- Node.js 18+
- npm 9+
- Python 3.10+

---

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/BubblySeeker/Clo-Agent.git
cd Clo-Agent
```

---

### 2. Frontend (`/frontend`)

#### Install dependencies

```bash
cd frontend
npm install
```

#### Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.local.example .env.local
```

> The frontend does not ship a committed `.env.local.example` — create one manually or set the variables below directly.

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (from [Clerk dashboard](https://dashboard.clerk.com)) |
| `CLERK_SECRET_KEY` | Clerk secret key (from Clerk dashboard) |

#### Run the development server

```bash
npm run dev
# http://localhost:3000
```

---

### 3. AI Service (`/ai-service`)

#### Create and activate a virtual environment

**macOS / Linux:**
```bash
cd ai-service
python3 -m venv venv
source venv/bin/activate
```

**Windows:**
```bash
cd ai-service
python -m venv venv
venv\Scripts\activate
```

#### Install dependencies

```bash
pip install -r requirements.txt
```

#### Configure environment variables

```bash
cp .env.example .env
```

Then edit `.env` with your values. See [`ai-service/.env.example`](./ai-service/.env.example) for the full list.

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key (from [console.anthropic.com](https://console.anthropic.com)) |
| `OPENAI_API_KEY` | OpenAI API key (from [platform.openai.com](https://platform.openai.com)) |
| `DATABASE_URL` | PostgreSQL connection string (e.g. `postgresql://user:password@localhost:5432/aicrm`) |

#### Run the development server

```bash
python main.py
# http://localhost:8000
# http://localhost:8000/health
```

---

## Services Overview

| Service | Port | Stack |
|---|---|---|
| Frontend | 3000 | Next.js 14, Clerk, TanStack Query |
| AI Service | 8000 | FastAPI, LangChain, pgvector |
