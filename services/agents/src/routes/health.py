"""Health check endpoint."""

from datetime import UTC, datetime

from fastapi import APIRouter
from pydantic import BaseModel

from src.config import settings

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str
    timestamp: str
    llm_provider: str


@router.get("/", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Return agent service health status."""
    return HealthResponse(
        status="healthy",
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(UTC).isoformat(),
        llm_provider=settings.DEFAULT_LLM_PROVIDER,
    )
