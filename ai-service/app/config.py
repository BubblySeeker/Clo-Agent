from dotenv import load_dotenv
import os

load_dotenv()

ANTHROPIC_API_KEY: str = os.environ["ANTHROPIC_API_KEY"]
OPENAI_API_KEY: str = os.environ["OPENAI_API_KEY"]
DATABASE_URL: str = os.environ["DATABASE_URL"]
