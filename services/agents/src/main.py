"""Apollo Restaurant OS — AI Agent Service."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.logging_config import setup_logging
from src.routes import agents_router, health_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    """Application lifecycle: startup and shutdown."""
    logger = setup_logging()
    logger.info("apollo_agents.startup", version=settings.VERSION, env=settings.ENVIRONMENT)
    yield
    logger.info("apollo_agents.shutdown")


app = FastAPI(
    title="Apollo Restaurant OS — Agent Service",
    version=settings.VERSION,
    description="AI Agent orchestration service for Apollo Restaurant OS",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.CORS_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/health", tags=["System"])
app.include_router(agents_router, prefix="/agents", tags=["Agents"])
