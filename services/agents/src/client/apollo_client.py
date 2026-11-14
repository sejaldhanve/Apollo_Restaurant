"""Apollo Restaurant OS Backend API Client.

Provides authenticated, tenant-scoped, read-only service-to-service communication
between services/agents and services/api.
"""

from datetime import UTC, datetime
from typing import Any

import httpx

from src.config import settings
from src.context.restaurant_context import RestaurantContext
from src.middleware.auth import create_token


class ApolloBackendError(Exception):
    """Base error for Apollo backend API integration failures."""

    def __init__(self, status_code: int, detail: str, endpoint: str) -> None:
        self.status_code = status_code
        self.detail = detail
        self.endpoint = endpoint
        super().__init__(f"Backend API error [{status_code}] on {endpoint}: {detail}")


class ApolloBackendUnavailableError(ApolloBackendError):
    """Raised when Apollo backend service is unreachable or connection fails."""

    def __init__(self, endpoint: str, detail: str = "Apollo API backend is unreachable") -> None:
        super().__init__(503, detail, endpoint)


class ApolloBackendTimeoutError(ApolloBackendError):
    """Raised when an API request to Apollo backend times out."""

    def __init__(self, endpoint: str, timeout_seconds: float) -> None:
        super().__init__(
            504, f"Request to Apollo backend timed out after {timeout_seconds}s", endpoint
        )


class ApolloBackendAuthError(ApolloBackendError):
    """Raised when backend rejects service credentials."""

    def __init__(
        self, endpoint: str, detail: str = "Service authentication rejected by backend"
    ) -> None:
        super().__init__(401, detail, endpoint)


class ApolloBackendForbiddenError(ApolloBackendError):
    """Raised when caller lacks required tenant or permission authorization on backend."""

    def __init__(self, endpoint: str, detail: str = "Access denied by Apollo backend") -> None:
        super().__init__(403, detail, endpoint)


class ApolloBackendNotFoundError(ApolloBackendError):
    """Raised when requested backend resource or location does not exist."""

    def __init__(self, endpoint: str, detail: str = "Resource or location not found") -> None:
        super().__init__(404, detail, endpoint)


class ApolloBackendResponseError(ApolloBackendError):
    """Raised when backend returns invalid JSON or malformed response."""

    def __init__(
        self, endpoint: str, detail: str = "Malformed or unexpected response from backend"
    ) -> None:
        super().__init__(502, detail, endpoint)


class ApolloApiClient:
    """Authenticated client for querying Apollo Restaurant OS backend APIs."""

    def __init__(
        self,
        base_url: str | None = None,
        timeout: float | None = None,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.base_url = (base_url or settings.API_BASE_URL).rstrip("/")
        self.timeout = timeout or settings.API_CLIENT_TIMEOUT_SECONDS
        self._transport = transport

    def _create_service_headers(self, context: RestaurantContext) -> dict[str, str]:
        """Generate short-lived service-to-service auth token preserving user & tenant identity."""
        service_token = create_token(
            user_id=context.user_id,
            expires_in=300,
            token_type="access",
            extra_claims={"client": "apollo-agents-service", "role": context.user_role},
        )
        return {
            "Authorization": f"Bearer {service_token}",
            "x-organization-id": context.organization_id,
            "x-location-id": context.location_id,
            "User-Agent": "Apollo-Agents-Service/0.1.0",
            "Accept": "application/json",
        }

    def _request(
        self,
        method: str,
        path: str,
        context: RestaurantContext,
        params: dict[str, Any] | None = None,
    ) -> Any:
        """Execute synchronous HTTP request against Apollo backend with timeout and error mapping."""
        url = f"{self.base_url}/{path.lstrip('/')}"
        headers = self._create_service_headers(context)
        timeout_config = httpx.Timeout(self.timeout)

        try:
            with httpx.Client(transport=self._transport, timeout=timeout_config) as client:
                response = client.request(
                    method=method,
                    url=url,
                    headers=headers,
                    params=params,
                )
        except httpx.TimeoutException as err:
            raise ApolloBackendTimeoutError(path, self.timeout) from err
        except (httpx.ConnectError, httpx.NetworkError) as err:
            raise ApolloBackendUnavailableError(path, str(err)) from err
        except httpx.RequestError as err:
            raise ApolloBackendUnavailableError(path, f"Request error: {err}") from err

        # Error status code mapping
        if response.status_code == 401:
            raise ApolloBackendAuthError(path, "Backend rejected service token")
        elif response.status_code == 403:
            raise ApolloBackendForbiddenError(
                path, response.text or "Tenant or permission check failed"
            )
        elif response.status_code == 404:
            raise ApolloBackendNotFoundError(path, response.text or "Resource not found")
        elif response.status_code >= 500:
            raise ApolloBackendUnavailableError(
                path, f"Backend returned status {response.status_code}"
            )
        elif response.status_code != 200:
            raise ApolloBackendError(response.status_code, response.text, path)

        try:
            payload = response.json()
        except Exception as err:
            raise ApolloBackendResponseError(
                path, "Failed to decode JSON response from backend"
            ) from err

        # Apollo API standard response envelope: { success: true, data: ... }
        if isinstance(payload, dict) and "data" in payload:
            return payload["data"]
        return payload

    def get_menu(
        self, context: RestaurantContext, category_id: str | None = None
    ) -> dict[str, Any]:
        """Fetch real menu items and modifier groups from Apollo backend."""
        params: dict[str, Any] = {"locationId": context.location_id}
        if category_id:
            params["categoryId"] = category_id

        items = self._request("GET", "/menu/items", context, params=params)

        # Retrieve modifier groups
        try:
            modifier_groups = self._request("GET", "/menu/modifier-groups", context)
        except Exception:
            modifier_groups = []

        return {
            "source": "apollo_backend_api",
            "endpoint": "/menu/items",
            "organization_id": context.organization_id,
            "location_id": context.location_id,
            "retrieved_at": datetime.now(UTC).isoformat(),
            "items_count": len(items) if isinstance(items, list) else 0,
            "items": items,
            "modifier_groups": modifier_groups,
        }

    def get_active_kitchen_orders(
        self, context: RestaurantContext, kitchen_station_id: str | None = None
    ) -> dict[str, Any]:
        """Fetch live active kitchen tickets (SUBMITTED, IN_PREPARATION, READY) from Apollo backend."""
        params: dict[str, Any] = {"locationId": context.location_id}
        if kitchen_station_id:
            params["kitchenStationId"] = kitchen_station_id

        orders = self._request("GET", "/orders/kitchen/active", context, params=params)

        return {
            "source": "apollo_backend_api",
            "endpoint": "/orders/kitchen/active",
            "organization_id": context.organization_id,
            "location_id": context.location_id,
            "retrieved_at": datetime.now(UTC).isoformat(),
            "active_orders_count": len(orders) if isinstance(orders, list) else 0,
            "active_orders": orders,
        }

    def get_floor_status(self, context: RestaurantContext) -> dict[str, Any]:
        """Fetch dining areas, tables, and occupancy status from Apollo backend."""
        path = f"/foh/locations/{context.location_id}/floor-plan"
        floor_plan = self._request("GET", path, context)

        dining_areas = floor_plan.get("diningAreas", []) if isinstance(floor_plan, dict) else []
        tables_count = 0
        occupied_count = 0

        for area in dining_areas:
            for table in area.get("tables", []):
                tables_count += 1
                if table.get("status") in ("OCCUPIED", "SEATED"):
                    occupied_count += 1

        return {
            "source": "apollo_backend_api",
            "endpoint": path,
            "organization_id": context.organization_id,
            "location_id": context.location_id,
            "retrieved_at": datetime.now(UTC).isoformat(),
            "dining_areas_count": len(dining_areas),
            "tables_count": tables_count,
            "occupied_tables_count": occupied_count,
            "floor_plan": floor_plan,
        }

    def get_staff_summary(
        self, context: RestaurantContext, role: str | None = None
    ) -> dict[str, Any]:
        """Fetch active staff members and role assignments from Apollo backend."""
        staff = self._request("GET", "/team", context)

        staff_list = staff if isinstance(staff, list) else []
        if role:
            staff_list = [
                s for s in staff_list if s.get("role") == role or s.get("roleName") == role
            ]

        return {
            "source": "apollo_backend_api",
            "endpoint": "/team",
            "organization_id": context.organization_id,
            "location_id": context.location_id,
            "retrieved_at": datetime.now(UTC).isoformat(),
            "total_staff_count": len(staff_list),
            "staff": staff_list,
        }

    def get_inventory_summary(
        self, context: RestaurantContext, low_stock_only: bool = False
    ) -> dict[str, Any]:
        """Controlled NOT_IMPLEMENTED response for Inventory module not present in Apollo backend."""
        return {
            "status": "NOT_IMPLEMENTED",
            "tool": "fetch_inventory_summary",
            "message": "Inventory management module is not implemented in Apollo Restaurant OS backend APIs.",
            "source": "apollo_backend_api",
            "available_endpoints": ["/menu", "/orders", "/foh", "/team"],
            "retrieved_at": datetime.now(UTC).isoformat(),
            "organization_id": context.organization_id,
            "location_id": context.location_id,
            "data": None,
        }


# Global client singleton
_apollo_api_client: ApolloApiClient = ApolloApiClient()


def get_apollo_api_client() -> ApolloApiClient:
    """Retrieve active Apollo API backend client."""
    return _apollo_api_client


def set_apollo_api_client(client: ApolloApiClient) -> None:
    """Inject a configured or mocked Apollo API client (e.g. for testing)."""
    global _apollo_api_client
    _apollo_api_client = client
