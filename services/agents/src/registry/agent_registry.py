"""Extensible Agent Registry for Apollo Restaurant OS."""

from enum import Enum

from pydantic import BaseModel, Field


class AgentCategory(str, Enum):
    """Categorization of specialized restaurant intelligence agents."""

    FRONT_OF_HOUSE = "FRONT_OF_HOUSE"
    BACK_OF_HOUSE = "BACK_OF_HOUSE"
    INVENTORY = "INVENTORY"
    WORKFORCE = "WORKFORCE"
    GENERAL = "GENERAL"


class AgentMetadata(BaseModel):
    """Complete metadata definition for a registered restaurant agent."""

    agent_id: str = Field(..., description="Unique alphanumeric identifier for the agent")
    name: str = Field(..., description="Human-readable display name")
    description: str = Field(..., description="Functional scope and responsibilities")
    category: AgentCategory = Field(..., description="Operational domain")
    enabled: bool = Field(default=True, description="Whether the agent is currently enabled")
    is_implemented: bool = Field(
        default=False,
        description="Whether this agent has executable logic vs. remaining a planned placeholder",
    )
    supported_tasks: list[str] = Field(
        default_factory=list, description="Keywords or task names this agent can handle"
    )
    registered_tools: list[str] = Field(
        default_factory=list, description="Names of tools permitted for this agent"
    )


class AgentRegistry:
    """In-memory extensible registry for Apollo AI agents."""

    def __init__(self) -> None:
        self._agents: dict[str, AgentMetadata] = {}
        self._initialize_default_agents()

    def _initialize_default_agents(self) -> None:
        """Register initial placeholder agents and foundational test orchestrator."""
        # 1. FoH Guest Orchestrator (Placeholder)
        self.register(
            AgentMetadata(
                agent_id="foh-guest-orchestrator",
                name="Front of House Guest Orchestrator",
                description="Coordinates guest seating, reservations, server pacing, and table turn optimization.",
                category=AgentCategory.FRONT_OF_HOUSE,
                enabled=True,
                is_implemented=False,
                supported_tasks=[
                    "table_seating",
                    "guest_concierge",
                    "server_rotation",
                    "reservation_pacing",
                ],
                registered_tools=["fetch_floor_status", "fetch_staff_summary"],
            )
        )

        # 2. BoH Predictive Ticket Execution Agent (Placeholder)
        self.register(
            AgentMetadata(
                agent_id="boh-predictive-ticket-agent",
                name="Back of House Predictive Ticket Execution Agent",
                description="Predicts kitchen prep bottlenecks, fire times, and synchronizes cross-station assembly.",
                category=AgentCategory.BACK_OF_HOUSE,
                enabled=True,
                is_implemented=False,
                supported_tasks=[
                    "kitchen_pacing",
                    "ticket_priority",
                    "fire_timing_prediction",
                    "station_balancing",
                ],
                registered_tools=["fetch_active_orders", "fetch_menu"],
            )
        )

        # 3. Autonomous Inventory Supply Agent (Placeholder)
        self.register(
            AgentMetadata(
                agent_id="inventory-supply-agent",
                name="Autonomous Inventory Supply Agent",
                description="Monitors ingredient burn rates, forecasts stockout risks, and plans supplier replenishment.",
                category=AgentCategory.INVENTORY,
                enabled=True,
                is_implemented=False,
                supported_tasks=[
                    "stockout_prediction",
                    "inventory_depletion_forecast",
                    "par_level_adjustment",
                ],
                registered_tools=["fetch_inventory_summary", "fetch_menu"],
            )
        )

        # 4. Dynamic Labor Optimization Agent (Placeholder)
        self.register(
            AgentMetadata(
                agent_id="labor-optimization-agent",
                name="Dynamic Labor Optimization Agent",
                description="Evaluates labor-to-sales percentages, recommends mid-shift cuts, and suggests shift call-ins.",
                category=AgentCategory.WORKFORCE,
                enabled=True,
                is_implemented=False,
                supported_tasks=[
                    "labor_sales_ratio",
                    "shift_cut_recommendation",
                    "staff_scheduling_optimization",
                ],
                registered_tools=["fetch_staff_summary", "fetch_active_orders"],
            )
        )

        # 5. General Orchestrator Test Agent (Functional foundation)
        # Note: Must execute without requiring external LLMs (Ollama/OpenAI/Gemini)
        self.register(
            AgentMetadata(
                agent_id="general-orchestrator-test",
                name="General Orchestrator Test Agent",
                description="Foundational orchestrator agent used for baseline orchestration and tool verification.",
                category=AgentCategory.GENERAL,
                enabled=True,
                is_implemented=True,
                supported_tasks=[
                    "test_echo",
                    "test_tool_execution",
                    "general_health_check",
                    "test_task",
                ],
                registered_tools=[
                    "fetch_menu",
                    "fetch_active_orders",
                    "fetch_floor_status",
                    "fetch_inventory_summary",
                    "fetch_staff_summary",
                ],
            )
        )

    def register(self, metadata: AgentMetadata) -> None:
        """Register or update an agent definition."""
        self._agents[metadata.agent_id] = metadata

    def get(self, agent_id: str) -> AgentMetadata | None:
        """Retrieve agent metadata by identifier."""
        return self._agents.get(agent_id)

    def list_all(self) -> list[AgentMetadata]:
        """List all registered agents."""
        return list(self._agents.values())

    def enable(self, agent_id: str) -> bool:
        """Enable a registered agent."""
        if agent_id in self._agents:
            self._agents[agent_id].enabled = True
            return True
        return False

    def disable(self, agent_id: str) -> bool:
        """Disable a registered agent."""
        if agent_id in self._agents:
            self._agents[agent_id].enabled = False
            return True
        return False

    def route_task(self, task: str, target_agent_id: str | None = None) -> AgentMetadata | None:
        """Resolve the target agent for a task prompt."""
        if target_agent_id:
            return self.get(target_agent_id)

        task_lower = task.lower()

        # Keyword affinity mapping
        if any(
            kw in task_lower for kw in ["table", "guest", "seat", "floor", "server", "reservation"]
        ):
            return self.get("foh-guest-orchestrator")
        if any(kw in task_lower for kw in ["kitchen", "ticket", "cook", "fire", "boh", "station"]):
            return self.get("boh-predictive-ticket-agent")
        if any(
            kw in task_lower
            for kw in ["inventory", "ingredient", "stock", "supply", "depletion", "par"]
        ):
            return self.get("inventory-supply-agent")
        if any(
            kw in task_lower for kw in ["labor", "staff", "shift", "cut", "schedule", "workforce"]
        ):
            return self.get("labor-optimization-agent")

        # Default fallback to test orchestrator for unspecialized or test prompts
        return self.get("general-orchestrator-test")


# Global agent registry singleton
agent_registry = AgentRegistry()
