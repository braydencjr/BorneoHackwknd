from fastapi import APIRouter
from datetime import datetime

router = APIRouter()


@router.get("")
async def health_check():
    """Liveness check — confirms API is up."""
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}
