"""Extensible Tool Registry for Apollo Restaurant OS.

Enforces strict tenant scoping, caller permission checks, and authenticated
read-only live integration with Apollo Restaurant OS backend APIs.
"""

from collections.abc import Callable
from typing import Any

from pydantic import BaseModel, Field

from src.client.apollo_client import get_apollo_api_client
from src.context.restaurant_context import RestaurantContext


class ToolPermissionDeniedError(Exception):
    """Raised when the calling context lacks permissions required to invoke a tool."""

    def __init__(self, tool_name: str, missing_permissions: list[str]) -> None:
        self.tool_name = tool_name
        self.missing_permissions = missing_permissions
        super().__init__(
            f"Access to tool '{tool_name}' denied. Missing required permissions: {missing_permissions}"
        )


class ToolDefinition(BaseModel):
    """Metadata and execution definition for an authorized agent tool."""

    name: str = Field(..., description="Unique tool identifier")
    description: str = Field(..., description="Capability description for agent planning")
    input_schema: dict[str, Any] = Field(
        default_factory=dict, description="JSON Schema defining acceptable arguments"
    )
    required_permissions: list[str] = Field(
        default_factory=list, description="Permissions the caller context must hold"
    )
    associated_agent: str | None = Field(
        default=None, description="Optional agent ID strictly bound to this tool"
    )
    enabled: bool = Field(default=True, description="Whether tool execution is permitted")


class ToolRegistry:
    """Registry managing authorized, permission-checked tools."""

    def __init__(self) -> None:
        self._tools: dict[str, ToolDefinition] = {}
        self._handlers: dict[str, Callable[[RestaurantContext, dict[str, Any]], Any]] = {}
        self._initialize_default_tools()

    def register_tool(
        self,
        tool: ToolDefinition,
        handler: Callable[[RestaurantContext, dict[str, Any]], Any],
    ) -> None:
        """Register a tool along with its execution handler."""
        self._tools[tool.name] = tool
        self._handlers[tool.name] = handler

    def get_tool(self, tool_name: str) -> ToolDefinition | None:
        """Retrieve tool metadata by name."""
        return self._tools.get(tool_name)

    def list_tools(self) -> list[ToolDefinition]:
        """List all registered tools."""
        return list(self._tools.values())

    def execute_tool(
        self, tool_name: str, context: RestaurantContext, parameters: dict[str, Any]
    ) -> Any:
        """Execute a tool with strict permission and tenant validation against live backend."""
        tool = self._tools.get(tool_name)
        if not tool:
            raise ValueError(f"Tool '{tool_name}' is not registered")
        if not tool.enabled:
            raise ValueError(f"Tool '{tool_name}' is currently disabled")

        # Permission check
        missing = [p for p in tool.required_permissions if not context.has_permission(p)]
        if missing:
            raise ToolPermissionDeniedError(tool_name, missing)

        handler = self._handlers.get(tool_name)
        if not handler:
            raise RuntimeError(f"No execution handler registered for tool '{tool_name}'")

        # Execute read-only handler under authenticated restaurant context
        return handler(context, parameters)

    def _initialize_default_tools(self) -> None:
        """Register read-only tools connecting to Apollo backend APIs."""

        # 1. Fetch Menu
        self.register_tool(
            ToolDefinition(
                name="fetch_menu",
                description="Fetch real menu items and modifier groups from Apollo backend.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "category_id": {"type": "string", "description": "Optional category filter"}
                    },
                },
                required_permissions=["menu:view"],
                associated_agent="general-orchestrator-test",
            ),
            handler=self._handle_fetch_menu,
        )

        # 2. Fetch Active Orders
        self.register_tool(
            ToolDefinition(
                name="fetch_active_orders",
                description="Fetch live active kitchen orders (SUBMITTED, IN_PREPARATION, READY).",
                input_schema={
                    "type": "object",
                    "properties": {
                        "kitchen_station_id": {
                            "type": "string",
                            "description": "Optional station filter",
                        }
                    },
                },
                required_permissions=["order:view"],
                associated_agent="general-orchestrator-test",
            ),
            handler=self._handle_fetch_active_orders,
        )

        # 3. Fetch Floor Status
        self.register_tool(
            ToolDefinition(
                name="fetch_floor_status",
                description="Fetch floor plan, dining areas, table occupancy, and active seating status.",
                input_schema={
                    "type": "object",
                    "properties": {},
                },
                required_permissions=["table:view"],
                associated_agent="foh-guest-orchestrator",
            ),
            handler=self._handle_fetch_floor_status,
        )

        # 4. Fetch Inventory Summary
        self.register_tool(
            ToolDefinition(
                name="fetch_inventory_summary",
                description="Fetch current ingredient stock levels and par depletion alerts.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "low_stock_only": {
                            "type": "boolean",
                            "description": "Filter strictly to depleted items",
                        }
                    },
                },
                required_permissions=["inventory:view"],
                associated_agent="inventory-supply-agent",
            ),
            handler=self._handle_fetch_inventory_summary,
        )

        # 5. Fetch Staff Summary
        self.register_tool(
            ToolDefinition(
                name="fetch_staff_summary",
                description="Fetch active staff members and role assignments.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "role": {"type": "string", "description": "Filter by staff role"}
                    },
                },
                required_permissions=["user:view"],
                associated_agent="labor-optimization-agent",
            ),
            handler=self._handle_fetch_staff_summary,
        )

    # Handlers — Authenticated Live Backend Integrations
    def _handle_fetch_menu(
        self, context: RestaurantContext, parameters: dict[str, Any]
    ) -> dict[str, Any]:
        client = get_apollo_api_client()
        return client.get_menu(context, category_id=parameters.get("category_id"))

    def _handle_fetch_active_orders(
        self, context: RestaurantContext, parameters: dict[str, Any]
    ) -> dict[str, Any]:
        client = get_apollo_api_client()
        return client.get_active_kitchen_orders(
            context, kitchen_station_id=parameters.get("kitchen_station_id")
        )

    def _handle_fetch_floor_status(
        self, context: RestaurantContext, parameters: dict[str, Any]
    ) -> dict[str, Any]:
        client = get_apollo_api_client()
        return client.get_floor_status(context)

    def _handle_fetch_inventory_summary(
        self, context: RestaurantContext, parameters: dict[str, Any]
    ) -> dict[str, Any]:
        client = get_apollo_api_client()
        return client.get_inventory_summary(
            context, low_stock_only=bool(parameters.get("low_stock_only", False))
        )

    def _handle_fetch_staff_summary(
        self, context: RestaurantContext, parameters: dict[str, Any]
    ) -> dict[str, Any]:
        client = get_apollo_api_client()
        return client.get_staff_summary(context, role=parameters.get("role"))


# Global tool registry singleton
tool_registry = ToolRegistry()
