"""LangGraph Orchestration Engine for Apollo Restaurant OS.

Coordinates agent selection, tenant context validation, permission checks,
safe placeholder fallbacks, and execution lifecycle recording.
"""

import asyncio
from datetime import UTC, datetime
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from src.config import settings
from src.context.restaurant_context import RestaurantContext
from src.models.execution import ExecutionStatus, TaskExecution
from src.registry.agent_registry import AgentMetadata, agent_registry
from src.registry.tool_registry import tool_registry
from src.storage.execution_storage import get_execution_storage


class OrchestratorState(TypedDict):
    """Execution state passed through the LangGraph orchestrator workflow."""

    execution_id: str
    task: str
    target_agent_id: str | None
    selected_agent: dict[str, Any] | None
    context: dict[str, Any]
    parameters: dict[str, Any]
    status: str
    result: dict[str, Any] | None
    error: str | None


def create_orchestrator_graph() -> StateGraph:
    """Build the centralized LangGraph orchestration state graph."""
    graph = StateGraph(OrchestratorState)

    def validate_node(state: OrchestratorState) -> OrchestratorState:
        """Validate presence of required task and tenant fields."""
        if not state.get("task"):
            return {
                **state,
                "status": ExecutionStatus.FAILED.value,
                "error": "Task description cannot be empty",
            }
        ctx = state.get("context", {})
        if not ctx.get("organization_id") or not ctx.get("location_id"):
            return {
                **state,
                "status": ExecutionStatus.FAILED.value,
                "error": "Execution requires valid tenant organization_id and location_id",
            }
        return state

    def route_node(state: OrchestratorState) -> OrchestratorState:
        """Identify the appropriate agent using target_agent_id or task heuristics."""
        if state.get("error"):
            return state

        target_id = state.get("target_agent_id")
        agent: AgentMetadata | None = agent_registry.route_task(state["task"], target_id)

        if not agent:
            return {
                **state,
                "status": ExecutionStatus.FAILED.value,
                "error": f"No registered agent found matching ID '{target_id}'",
            }

        if not agent.enabled:
            return {
                **state,
                "status": ExecutionStatus.FAILED.value,
                "selected_agent": agent.model_dump(),
                "error": f"Agent '{agent.name}' ({agent.agent_id}) is currently disabled",
            }

        return {
            **state,
            "selected_agent": agent.model_dump(),
        }

    def execute_implemented_node(state: OrchestratorState) -> OrchestratorState:
        """Execute operational agent logic (e.g., test orchestrator or specialized agent)."""
        if state.get("error"):
            return state

        agent_dict = state.get("selected_agent") or {}
        agent_id = agent_dict.get("agent_id", "")
        task = state["task"]
        ctx_data = state["context"]
        params = state.get("parameters", {})

        context = RestaurantContext.model_validate(ctx_data)

        # Baseline execution for foundational general-orchestrator-test agent
        # Deterministic: Does NOT require external LLM (Ollama/OpenAI/Gemini)
        tool_results = {}
        tool_name = params.get("tool")
        if tool_name:
            if tool_name not in agent_dict.get("registered_tools", []):
                return {
                    **state,
                    "status": ExecutionStatus.FAILED.value,
                    "error": f"Tool '{tool_name}' is not authorized for agent '{agent_id}'",
                }
            try:
                tool_output = tool_registry.execute_tool(
                    tool_name, context, params.get("tool_params", {})
                )
                tool_results[tool_name] = tool_output
            except Exception as tool_err:
                return {
                    **state,
                    "status": ExecutionStatus.FAILED.value,
                    "error": str(tool_err),
                }

        result_payload = {
            "orchestrator": "Apollo AI Agent Engine v1",
            "agent_id": agent_id,
            "agent_name": agent_dict.get("name"),
            "category": agent_dict.get("category"),
            "task": task,
            "tenant_organization_id": context.organization_id,
            "tenant_location_id": context.location_id,
            "executed_by_user": context.user_id,
            "user_role": context.user_role,
            "tool_executions": tool_results,
            "message": f"Successfully orchestrated task for agent '{agent_dict.get('name')}'.",
        }

        return {
            **state,
            "status": ExecutionStatus.COMPLETED.value,
            "result": result_payload,
        }

    def safe_placeholder_node(state: OrchestratorState) -> OrchestratorState:
        """Produce a safe structured placeholder response for unimplemented agents."""
        if state.get("error"):
            return state

        agent_dict = state.get("selected_agent") or {}
        agent_id = agent_dict.get("agent_id", "unknown")
        agent_name = agent_dict.get("name", "Unknown Agent")
        category = agent_dict.get("category")
        supported_tasks = agent_dict.get("supported_tasks", [])

        placeholder_result = {
            "status": "placeholder_acknowledged",
            "agent_id": agent_id,
            "agent_name": agent_name,
            "category": category,
            "message": (
                f"Agent '{agent_name}' ({agent_id}) is registered in category {category} "
                "but has not yet been implemented in Phase 3 Module 1."
            ),
            "supported_tasks": supported_tasks,
            "task_requested": state["task"],
            "organization_id": state["context"].get("organization_id"),
            "location_id": state["context"].get("location_id"),
        }

        return {
            **state,
            "status": ExecutionStatus.COMPLETED.value,
            "result": placeholder_result,
        }

    def record_node(state: OrchestratorState) -> OrchestratorState:
        """Persist final execution status in the execution storage."""
        storage = get_execution_storage()
        exec_id = state["execution_id"]

        status_val = ExecutionStatus.FAILED if state.get("error") else ExecutionStatus.COMPLETED

        storage.update(
            exec_id,
            {
                "status": status_val,
                "result": state.get("result"),
                "error": state.get("error"),
                "completed_at": datetime.now(UTC).isoformat(),
            },
        )
        return {**state, "status": status_val.value}

    # Conditional Routing Edges
    def route_after_validation(state: OrchestratorState) -> str:
        if state.get("error"):
            return "record"
        return "route"

    def route_after_routing(state: OrchestratorState) -> str:
        if state.get("error"):
            return "record"

        agent_dict = state.get("selected_agent") or {}
        if agent_dict.get("is_implemented"):
            return "execute_implemented"
        return "safe_placeholder"

    # Build Graph
    graph.add_node("validate", validate_node)
    graph.add_node("route", route_node)
    graph.add_node("execute_implemented", execute_implemented_node)
    graph.add_node("safe_placeholder", safe_placeholder_node)
    graph.add_node("record", record_node)

    graph.add_edge(START, "validate")
    graph.add_conditional_edges(
        "validate", route_after_validation, {"record": "record", "route": "route"}
    )
    graph.add_conditional_edges(
        "route",
        route_after_routing,
        {
            "record": "record",
            "execute_implemented": "execute_implemented",
            "safe_placeholder": "safe_placeholder",
        },
    )
    graph.add_edge("execute_implemented", "record")
    graph.add_edge("safe_placeholder", "record")
    graph.add_edge("record", END)

    return graph


class OrchestrationEngine:
    """High-level facade for orchestrating restaurant intelligence tasks."""

    def __init__(self) -> None:
        self._graph = create_orchestrator_graph().compile()

    async def execute_task(
        self,
        task: str,
        context: RestaurantContext,
        target_agent_id: str | None = None,
        parameters: dict[str, Any] | None = None,
        session_id: str | None = None,
    ) -> TaskExecution:
        """Execute task through LangGraph workflow with timeout and state persistence."""
        storage = get_execution_storage()

        # Target or resolved agent ID for preliminary record
        initial_agent = agent_registry.route_task(task, target_agent_id)
        assigned_agent_id = (
            initial_agent.agent_id if initial_agent else (target_agent_id or "unknown")
        )

        # Create initial PENDING execution record
        execution = TaskExecution(
            agent_id=assigned_agent_id,
            task=task,
            status=ExecutionStatus.RUNNING,
            organization_id=context.organization_id,
            location_id=context.location_id,
            user_id=context.user_id,
            session_id=session_id or context.session_id,
            parameters=parameters or {},
            started_at=datetime.now(UTC).isoformat(),
        )
        storage.save(execution)

        initial_state: OrchestratorState = {
            "execution_id": execution.execution_id,
            "task": task,
            "target_agent_id": target_agent_id,
            "selected_agent": initial_agent.model_dump() if initial_agent else None,
            "context": context.model_dump(),
            "parameters": parameters or {},
            "status": ExecutionStatus.RUNNING.value,
            "result": None,
            "error": None,
        }

        try:
            # Wrap execution with bounded timeout
            final_state = await asyncio.wait_for(
                asyncio.to_thread(self._graph.invoke, initial_state),
                timeout=float(settings.ORCHESTRATOR_TIMEOUT_SECONDS),
            )

            updated = storage.get(execution.execution_id)
            if updated:
                return updated

            return TaskExecution(
                execution_id=execution.execution_id,
                agent_id=final_state.get("selected_agent", {}).get("agent_id", assigned_agent_id),
                task=task,
                status=ExecutionStatus(final_state["status"]),
                organization_id=context.organization_id,
                location_id=context.location_id,
                user_id=context.user_id,
                session_id=session_id,
                result=final_state.get("result"),
                error=final_state.get("error"),
            )

        except TimeoutError:
            storage.update(
                execution.execution_id,
                {
                    "status": ExecutionStatus.FAILED,
                    "error": f"Orchestrator timed out after {settings.ORCHESTRATOR_TIMEOUT_SECONDS}s",
                },
            )
            rec = storage.get(execution.execution_id)
            if rec:
                return rec
            execution.status = ExecutionStatus.FAILED
            execution.error = (
                f"Orchestrator timed out after {settings.ORCHESTRATOR_TIMEOUT_SECONDS}s"
            )
            return execution

        except Exception as err:
            storage.update(
                execution.execution_id,
                {
                    "status": ExecutionStatus.FAILED,
                    "error": f"Orchestration failure: {err}",
                },
            )
            rec = storage.get(execution.execution_id)
            if rec:
                return rec
            execution.status = ExecutionStatus.FAILED
            execution.error = f"Orchestration failure: {err}"
            return execution


# Global orchestrator singleton
orchestrator_engine = OrchestrationEngine()
