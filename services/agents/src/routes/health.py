"""Health check endpoint with LLM provider status probe."""

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from src.config import settings
from src.llm.provider import check_llm_provider_health

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str
    timestamp: str
    llm: dict[str, Any]


@router.get("", response_model=HealthResponse)
@router.get("/", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Return agent service health status and LLM provider configuration."""
    llm_health = check_llm_provider_health()
    return HealthResponse(
        status="healthy",
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(UTC).isoformat(),
        llm=llm_health,
    )
