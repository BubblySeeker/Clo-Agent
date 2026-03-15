from dotenv import load_dotenv
import os

load_dotenv()

ANTHROPIC_API_KEY: str = os.environ["ANTHROPIC_API_KEY"]
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
DATABASE_URL: str = os.environ["DATABASE_URL"]
AI_SERVICE_SECRET: str = os.getenv("AI_SERVICE_SECRET", "cloagent-internal-secret-change-me")
BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:8080")
