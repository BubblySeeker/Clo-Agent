import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.routes.health import router as health_router
from app.routes.chat import router as chat_router
from app.routes.profiles import router as profiles_router
from app.routes.search import router as search_router
from app.routes.workflows import router as workflows_router
from app.routes.documents import router as documents_router
from app.routes.emails import router as emails_router
from app.tools import cleanup_expired_actions

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    try:
        deleted = cleanup_expired_actions()
        if deleted:
            logger.info("Cleaned up %d expired pending actions", deleted)
    except Exception:
        pass  # table may not exist yet during first migration

    # Start the workflow scheduler as a background task
    from app.services.workflow_scheduler import scheduler_loop
    scheduler_task = asyncio.create_task(scheduler_loop())
    logger.info("Workflow scheduler background task started")

    yield

    # Shutdown
    scheduler_task.cancel()
    try:
        await scheduler_task
    except asyncio.CancelledError:
        logger.info("Workflow scheduler stopped")


app = FastAPI(title="CloAgent AI Service", lifespan=lifespan)

app.include_router(health_router)
app.include_router(chat_router)
app.include_router(profiles_router)
app.include_router(search_router)
app.include_router(workflows_router)
app.include_router(documents_router)
app.include_router(emails_router)
