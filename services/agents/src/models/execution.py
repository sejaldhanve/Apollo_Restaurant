"""Pydantic execution models and API schemas for AI Agent orchestration."""

from datetime import UTC, datetime
from enum import Enum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


class ExecutionStatus(str, Enum):
    """Lifecycle states of an agent task execution."""

    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class TaskExecution(BaseModel):
    """Complete record of an orchestrated agent task execution."""

    execution_id: str = Field(default_factory=lambda: f"exec_{uuid4().hex[:12]}")
    agent_id: str
    task: str
    status: ExecutionStatus = ExecutionStatus.PENDING
    organization_id: str
    location_id: str
    user_id: str
    session_id: str | None = None
    parameters: dict[str, Any] = Field(default_factory=dict)
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
    started_at: str | None = None
    completed_at: str | None = None


class ExecuteTaskRequest(BaseModel):
    """Incoming request to execute an AI agent task."""

    task: str = Field(..., min_length=1, description="Prompt or task description to execute")
    agent_id: str | None = Field(
        default=None,
        description="Optional target agent ID. If omitted, orchestrator routes dynamically.",
    )
    organization_id: str | None = Field(
        default=None,
        description="Target organization ID. If provided, must match authenticated token context.",
    )
    location_id: str | None = Field(
        default=None,
        description="Target location ID. If provided, must match authenticated token context.",
    )
    session_id: str | None = Field(
        default=None,
        description="Optional conversation or session identifier.",
    )
    parameters: dict[str, Any] = Field(
        default_factory=dict,
        description="Optional task execution parameters or tool inputs.",
    )


class ExecuteTaskResponse(BaseModel):
    """Synchronous return structure for a task orchestration request."""

    execution_id: str
    agent_id: str
    status: ExecutionStatus
    message: str
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at: str
    completed_at: str | None = None


class ExecutionDetailResponse(BaseModel):
    """Detailed response model for querying execution status."""

    execution: TaskExecution
