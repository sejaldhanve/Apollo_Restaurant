"""Restaurant context models for tenant-aware AI agent execution."""

from typing import Any

from pydantic import BaseModel, Field


class RestaurantContext(BaseModel):
    """Structured context defining the authenticated restaurant tenant and caller.

    Guarantees strict tenant isolation: no AI agent or tool may execute without
    a verified restaurant context.
    """

    organization_id: str = Field(..., description="Target organization identifier")
    location_id: str = Field(..., description="Target location identifier")
    user_id: str = Field(..., description="Authenticated user identifier")
    user_role: str = Field(..., description="User role in the organization")
    permissions: list[str] = Field(
        default_factory=list, description="Active permission codes for the caller"
    )
    session_id: str | None = Field(
        default=None, description="Optional conversation or session identifier"
    )
    operational_data: dict[str, Any] = Field(
        default_factory=dict,
        description="Operational snapshot (e.g., active service period, shift info)",
    )

    def has_permission(self, required_permission: str) -> bool:
        """Check whether the context holds the required permission."""
        if (
            self.user_role in ("Owner", "Organization Owner", "Admin")
            or "org:manage" in self.permissions
            or "*" in self.permissions
        ):
            return True

        alias_map = {
            "menu:view": {"menu:read", "menu:view"},
            "menu:read": {"menu:read", "menu:view"},
            "order:view": {"orders:read", "order:view", "orders:view"},
            "orders:read": {"orders:read", "order:view", "orders:view"},
            "table:view": {"floor:read", "table:view", "table:read"},
            "floor:read": {"floor:read", "table:view", "table:read"},
            "user:view": {"staff:read", "user:view", "team:view"},
            "staff:read": {"staff:read", "user:view", "team:view"},
            "inventory:view": {"inventory:read", "inventory:view"},
            "inventory:read": {"inventory:read", "inventory:view"},
        }
        allowed = alias_map.get(required_permission, {required_permission})
        return any(p in self.permissions for p in allowed)
