from fastapi import FastAPI
from app.routes.health import router as health_router
from app.routes.chat import router as chat_router

app = FastAPI(title="CloAgent AI Service")

app.include_router(health_router)
app.include_router(chat_router)
