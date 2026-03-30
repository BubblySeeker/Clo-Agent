from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    return {"status": "ok"}


@router.get("/ai/health")
async def ai_health():
    from app.services.workflow_scheduler import get_scheduler_status
    return {
        "status": "ok",
        "scheduler": get_scheduler_status(),
    }
