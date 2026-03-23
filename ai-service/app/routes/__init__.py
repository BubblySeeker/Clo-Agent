import hmac
from fastapi import Header, HTTPException
from app.config import AI_SERVICE_SECRET


def verify_secret(x_ai_service_secret: str = Header(...)):
    """Constant-time comparison of service secret to prevent timing attacks."""
    if not hmac.compare_digest(x_ai_service_secret, AI_SERVICE_SECRET):
        raise HTTPException(status_code=403, detail="Unauthorized")
