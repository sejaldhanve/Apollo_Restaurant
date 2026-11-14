"""Agent management and task orchestration API routes."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from src.context.restaurant_context import RestaurantContext
from src.middleware.auth import get_current_restaurant_context
from src.models.execution import (
    ExecuteTaskRequest,
    ExecuteTaskResponse,
    ExecutionDetailResponse,
    ExecutionStatus,
)
from src.orchestrator.engine import orchestrator_engine
from src.registry.agent_registry import AgentMetadata, agent_registry
from src.routes.health import health_check
from src.storage.execution_storage import get_execution_storage

router = APIRouter()


class AgentListResponse(BaseModel):
    """Response model for registered agents query."""

    agents: list[AgentMetadata]
    total_count: int
    message: str


@router.get("", response_model=AgentListResponse)
@router.get("/", response_model=AgentListResponse)
async def list_agents() -> AgentListResponse:
    """List all registered agents and their current availability."""
    agents = agent_registry.list_all()
    return AgentListResponse(
        agents=agents,
        total_count=len(agents),
        message="Apollo Agent Registry: specialized agents defined with operational statuses.",
    )


# Health check alias under agents router (/api/v1/agents/health and /agents/health)
router.add_api_route("/health", health_check, methods=["GET"], include_in_schema=False)


@router.post("/execute", response_model=ExecuteTaskResponse, status_code=status.HTTP_200_OK)
async def execute_task(
    payload: ExecuteTaskRequest,
    context: RestaurantContext = Depends(get_current_restaurant_context),
) -> ExecuteTaskResponse:
    """Submit a task to the centralized agent orchestrator.

    Requires authenticated JWT and validated restaurant tenant context.
    """
    # 1. Agent validation if explicit target agent requested
    if payload.agent_id:
        agent = agent_registry.get(payload.agent_id)
        if not agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Agent '{payload.agent_id}' not found in registry",
            )
        if not agent.enabled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Agent '{payload.agent_id}' is currently disabled",
            )

    # 2. Execute through LangGraph orchestration engine
    execution = await orchestrator_engine.execute_task(
        task=payload.task,
        context=context,
        target_agent_id=payload.agent_id,
        parameters=payload.parameters,
        session_id=payload.session_id,
    )

    if execution.status == ExecutionStatus.FAILED:
        # Check if failure was due to unknown or disabled agent
        if execution.error and "No registered agent" in execution.error:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=execution.error,
            )
        if execution.error and "currently disabled" in execution.error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=execution.error,
            )

    return ExecuteTaskResponse(
        execution_id=execution.execution_id,
        agent_id=execution.agent_id,
        status=execution.status,
        message="Task execution completed"
        if execution.status == ExecutionStatus.COMPLETED
        else "Task execution failed",
        result=execution.result,
        error=execution.error,
        created_at=execution.created_at,
        completed_at=execution.completed_at,
    )


@router.get("/executions/{execution_id}", response_model=ExecutionDetailResponse)
async def get_execution_status(
    execution_id: str,
    context: RestaurantContext = Depends(get_current_restaurant_context),
) -> ExecutionDetailResponse:
    """Retrieve execution status and output by execution ID.

    Guarantees strict tenant isolation: cross-tenant access is rejected with 403.
    """
    storage = get_execution_storage()
    execution = storage.get(execution_id)

    if not execution:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Execution '{execution_id}' not found",
        )

    # Cross-tenant isolation check: caller's organization must match execution record
    if execution.organization_id != context.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to execution record from another organization is denied",
        )

    return ExecutionDetailResponse(execution=execution)
