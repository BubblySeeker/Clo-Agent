from dotenv import load_dotenv
import os

load_dotenv(override=True)

ANTHROPIC_API_KEY: str = os.environ["ANTHROPIC_API_KEY"]
ANTHROPIC_MODEL: str = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
DATABASE_URL: str = os.environ["DATABASE_URL"]
AI_SERVICE_SECRET: str = os.environ["AI_SERVICE_SECRET"]
BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:8080")
