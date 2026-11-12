"""Agent management routes — placeholder for future agent endpoints."""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class AgentListResponse(BaseModel):
    agents: list[str]
    message: str


@router.get("/", response_model=AgentListResponse)
async def list_agents() -> AgentListResponse:
    """List available agent types. Will be populated as agents are implemented."""
    return AgentListResponse(
        agents=[
            "supervisor",
            "front-of-house",
            "order",
            "kitchen",
            "inventory",
            "finance",
            "workforce",
            "coding",
            "testing",
            "security",
            "deployment",
        ],
        message="Agent registry initialized. Individual agents not yet implemented.",
    )
