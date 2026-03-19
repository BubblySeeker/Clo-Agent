from fastapi import FastAPI
from app.routes.health import router as health_router
from app.routes.chat import router as chat_router
from app.routes.profiles import router as profiles_router
from app.routes.search import router as search_router
from app.routes.workflows import router as workflows_router
from app.routes.enrichment import router as enrichment_router
from app.tools import cleanup_expired_actions

app = FastAPI(title="CloAgent AI Service")

app.include_router(health_router)
app.include_router(chat_router)
app.include_router(profiles_router)
app.include_router(search_router)
app.include_router(workflows_router)
app.include_router(enrichment_router)


@app.on_event("startup")
def startup_cleanup():
    try:
        deleted = cleanup_expired_actions()
        if deleted:
            print(f"Cleaned up {deleted} expired pending actions")
    except Exception:
        pass  # table may not exist yet during first migration
