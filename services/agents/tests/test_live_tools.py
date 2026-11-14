"""Comprehensive test suite for Phase 3 Module 2: Live Apollo Tool Integration.

Verifies:
1. Actual API integration using mocked HTTP responses for all registered endpoints.
2. Tenant and location isolation in requests and returned payloads.
3. Permission enforcement at tool boundary.
4. Unauthorized backend responses (401, 403, 404).
5. Backend timeout handling (504) without silent fallbacks.
6. Backend unavailable handling (503) without silent fallbacks.
7. Controlled NOT_IMPLEMENTED response for Inventory module.
8. Malformed JSON handling (502).
9. Preservation of user & tenant identity in service-to-service auth headers.
"""

import httpx
import pytest
from fastapi.testclient import TestClient

from src.client.apollo_client import (
    ApolloApiClient,
    ApolloBackendAuthError,
    ApolloBackendForbiddenError,
    ApolloBackendNotFoundError,
    ApolloBackendResponseError,
    ApolloBackendTimeoutError,
    ApolloBackendUnavailableError,
    set_apollo_api_client,
)
from src.context.restaurant_context import RestaurantContext
from src.main import app
from src.middleware.auth import (
    MockTenantValidator,
    create_token,
    set_tenant_validator,
    verify_jwt,
)
from src.registry.tool_registry import (
    ToolPermissionDeniedError,
    tool_registry,
)

client = TestClient(app)

TEST_USER_ID = "usr-chef-10"
TEST_ORG_ID = "org-alpha-dining"
TEST_LOC_ID = "loc-midtown"


@pytest.fixture
def test_context() -> RestaurantContext:
    """Fixture providing authorized Owner restaurant context."""
    return RestaurantContext(
        organization_id=TEST_ORG_ID,
        location_id=TEST_LOC_ID,
        user_id=TEST_USER_ID,
        user_role="Owner",
        permissions=["*"],
    )


# =====================================================================
# 1. Menu Tool Integration (fetch_menu -> /menu/items & /menu/modifier-groups)
# =====================================================================
def test_live_fetch_menu_success(test_context: RestaurantContext):
    """Verify fetch_menu queries /menu/items with tenant context and returns real payload."""
    captured_requests: list[httpx.Request] = []

    def mock_menu_handler(request: httpx.Request) -> httpx.Response:
        captured_requests.append(request)
        if request.url.path == "/api/v1/menu/items":
            assert request.url.params.get("locationId") == TEST_LOC_ID
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "data": [
                        {
                            "id": "item-1",
                            "name": "Chicken Tikka Masala",
                            "basePriceCents": 1800,
                            "categoryId": "cat-mains",
                        },
                        {
                            "id": "item-2",
                            "name": "Garlic Naan",
                            "basePriceCents": 400,
                            "categoryId": "cat-breads",
                        },
                    ],
                },
            )
        elif request.url.path == "/api/v1/menu/modifier-groups":
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "data": [
                        {
                            "id": "grp-spice",
                            "name": "Spice Level",
                            "options": [{"id": "opt-mild", "name": "Mild"}],
                        }
                    ],
                },
            )
        return httpx.Response(404, json={"success": False, "error": "Not found"})

    transport = httpx.MockTransport(mock_menu_handler)
    api_client = ApolloApiClient(transport=transport)
    set_apollo_api_client(api_client)

    result = tool_registry.execute_tool("fetch_menu", test_context, {})

    assert result["source"] == "apollo_backend_api"
    assert result["endpoint"] == "/menu/items"
    assert result["organization_id"] == TEST_ORG_ID
    assert result["location_id"] == TEST_LOC_ID
    assert result["items_count"] == 2
    assert result["items"][0]["name"] == "Chicken Tikka Masala"
    assert len(result["modifier_groups"]) == 1

    # Verify service-to-service auth headers
    assert len(captured_requests) >= 1
    req = captured_requests[0]
    assert req.headers.get("x-organization-id") == TEST_ORG_ID
    assert req.headers.get("x-location-id") == TEST_LOC_ID
    auth_header = req.headers.get("authorization", "")
    assert auth_header.startswith("Bearer ")

    # Verify service token contains user subject and claims
    token = auth_header[7:]
    decoded = verify_jwt(token)
    assert decoded["sub"] == TEST_USER_ID
    assert decoded["client"] == "apollo-agents-service"


# =====================================================================
# 2. Active Orders Integration (fetch_active_orders -> /orders/kitchen/active)
# =====================================================================
def test_live_fetch_active_orders_success(test_context: RestaurantContext):
    """Verify fetch_active_orders queries /orders/kitchen/active with location filter."""

    def mock_orders_handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/orders/kitchen/active"
        assert request.headers.get("x-organization-id") == TEST_ORG_ID
        assert request.headers.get("x-location-id") == TEST_LOC_ID
        return httpx.Response(
            200,
            json={
                "success": True,
                "data": [
                    {
                        "id": "ord-201",
                        "orderNumber": "ORD-0201",
                        "status": "IN_PREPARATION",
                        "tableNumber": "5",
                        "items": [{"name": "Butter Chicken", "status": "IN_PREPARATION"}],
                    },
                    {
                        "id": "ord-202",
                        "orderNumber": "ORD-0202",
                        "status": "SUBMITTED",
                        "tableNumber": "8",
                        "items": [{"name": "Samosa Chaat", "status": "PENDING"}],
                    },
                ],
            },
        )

    transport = httpx.MockTransport(mock_orders_handler)
    api_client = ApolloApiClient(transport=transport)
    set_apollo_api_client(api_client)

    result = tool_registry.execute_tool("fetch_active_orders", test_context, {})

    assert result["source"] == "apollo_backend_api"
    assert result["endpoint"] == "/orders/kitchen/active"
    assert result["active_orders_count"] == 2
    assert result["active_orders"][0]["orderNumber"] == "ORD-0201"
    assert result["active_orders"][0]["status"] == "IN_PREPARATION"


# =====================================================================
# 3. Floor Status Integration (fetch_floor_status -> /foh/locations/:id/floor-plan)
# =====================================================================
def test_live_fetch_floor_status_success(test_context: RestaurantContext):
    """Verify fetch_floor_status queries /foh/locations/:locationId/floor-plan."""

    def mock_foh_handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == f"/api/v1/foh/locations/{TEST_LOC_ID}/floor-plan"
        assert request.headers.get("x-organization-id") == TEST_ORG_ID
        return httpx.Response(
            200,
            json={
                "success": True,
                "data": {
                    "locationId": TEST_LOC_ID,
                    "diningAreas": [
                        {
                            "id": "area-main",
                            "name": "Main Dining Room",
                            "tables": [
                                {"id": "tbl-1", "tableNumber": "1", "status": "OCCUPIED"},
                                {"id": "tbl-2", "tableNumber": "2", "status": "AVAILABLE"},
                                {"id": "tbl-3", "tableNumber": "3", "status": "OCCUPIED"},
                            ],
                        },
                        {
                            "id": "area-patio",
                            "name": "Patio",
                            "tables": [
                                {"id": "tbl-4", "tableNumber": "P1", "status": "AVAILABLE"},
                            ],
                        },
                    ],
                },
            },
        )

    transport = httpx.MockTransport(mock_foh_handler)
    api_client = ApolloApiClient(transport=transport)
    set_apollo_api_client(api_client)

    result = tool_registry.execute_tool("fetch_floor_status", test_context, {})

    assert result["source"] == "apollo_backend_api"
    assert result["endpoint"] == f"/foh/locations/{TEST_LOC_ID}/floor-plan"
    assert result["dining_areas_count"] == 2
    assert result["tables_count"] == 4
    assert result["occupied_tables_count"] == 2


# =====================================================================
# 4. Staff Summary Integration (fetch_staff_summary -> /team)
# =====================================================================
def test_live_fetch_staff_summary_success(test_context: RestaurantContext):
    """Verify fetch_staff_summary queries /team and filters by role."""

    def mock_team_handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/team"
        assert request.headers.get("x-organization-id") == TEST_ORG_ID
        return httpx.Response(
            200,
            json={
                "success": True,
                "data": [
                    {
                        "id": "staff-1",
                        "userId": "usr-1",
                        "name": "Auguste Gusteau",
                        "role": "Owner",
                        "status": "ACTIVE",
                    },
                    {
                        "id": "staff-2",
                        "userId": "usr-2",
                        "name": "Colette Tatou",
                        "role": "Server",
                        "status": "ACTIVE",
                    },
                    {
                        "id": "staff-3",
                        "userId": "usr-3",
                        "name": "Alfredo Linguini",
                        "role": "Server",
                        "status": "ACTIVE",
                    },
                ],
            },
        )

    transport = httpx.MockTransport(mock_team_handler)
    api_client = ApolloApiClient(transport=transport)
    set_apollo_api_client(api_client)

    # 1. Fetch all staff
    all_staff = tool_registry.execute_tool("fetch_staff_summary", test_context, {})
    assert all_staff["total_staff_count"] == 3
    assert all_staff["source"] == "apollo_backend_api"
    assert all_staff["endpoint"] == "/team"

    # 2. Fetch filtered by role Server
    filtered = tool_registry.execute_tool("fetch_staff_summary", test_context, {"role": "Server"})
    assert filtered["total_staff_count"] == 2
    assert all(s["role"] == "Server" for s in filtered["staff"])


# =====================================================================
# 5. Inventory Summary — Missing Module Controlled NOT_IMPLEMENTED
# =====================================================================
def test_inventory_summary_not_implemented_no_fabrication(test_context: RestaurantContext):
    """Verify fetch_inventory_summary returns NOT_IMPLEMENTED without fabricating records."""
    result = tool_registry.execute_tool("fetch_inventory_summary", test_context, {})

    assert result["status"] == "NOT_IMPLEMENTED"
    assert result["tool"] == "fetch_inventory_summary"
    assert "not implemented in Apollo Restaurant OS backend APIs" in result["message"]
    assert result["source"] == "apollo_backend_api"
    assert result["organization_id"] == TEST_ORG_ID
    assert result["location_id"] == TEST_LOC_ID
    assert result["data"] is None  # Never fabricated


# =====================================================================
# 6. Error Handling: Backend Timeout
# =====================================================================
def test_backend_timeout_handling(test_context: RestaurantContext):
    """Verify backend request timeout raises ApolloBackendTimeoutError without fallback."""

    def timeout_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("Connection timed out", request=request)

    transport = httpx.MockTransport(timeout_handler)
    api_client = ApolloApiClient(transport=transport, timeout=1.0)
    set_apollo_api_client(api_client)

    with pytest.raises(ApolloBackendTimeoutError) as exc_info:
        tool_registry.execute_tool("fetch_menu", test_context, {})

    assert exc_info.value.status_code == 504
    assert "timed out" in exc_info.value.detail


# =====================================================================
# 7. Error Handling: Backend Unavailable
# =====================================================================
def test_backend_unavailable_handling(test_context: RestaurantContext):
    """Verify connection refused raises ApolloBackendUnavailableError."""

    def unavailable_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Connection refused on 127.0.0.1:3001", request=request)

    transport = httpx.MockTransport(unavailable_handler)
    api_client = ApolloApiClient(transport=transport)
    set_apollo_api_client(api_client)

    with pytest.raises(ApolloBackendUnavailableError) as exc_info:
        tool_registry.execute_tool("fetch_active_orders", test_context, {})

    assert exc_info.value.status_code == 503
    assert "Connection refused" in exc_info.value.detail


# =====================================================================
# 8. Error Handling: Backend Auth Failure (401)
# =====================================================================
def test_backend_auth_failure_handling(test_context: RestaurantContext):
    """Verify 401 response from backend raises ApolloBackendAuthError."""

    def auth_fail_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"success": False, "error": "Invalid token"})

    transport = httpx.MockTransport(auth_fail_handler)
    api_client = ApolloApiClient(transport=transport)
    set_apollo_api_client(api_client)

    with pytest.raises(ApolloBackendAuthError) as exc_info:
        tool_registry.execute_tool("fetch_menu", test_context, {})

    assert exc_info.value.status_code == 401
    assert "rejected" in exc_info.value.detail


# =====================================================================
# 9. Error Handling: Backend Forbidden (403)
# =====================================================================
def test_backend_forbidden_handling(test_context: RestaurantContext):
    """Verify 403 response from backend raises ApolloBackendForbiddenError."""

    def forbidden_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, json={"success": False, "error": "Location access denied"})

    transport = httpx.MockTransport(forbidden_handler)
    api_client = ApolloApiClient(transport=transport)
    set_apollo_api_client(api_client)

    with pytest.raises(ApolloBackendForbiddenError) as exc_info:
        tool_registry.execute_tool("fetch_floor_status", test_context, {})

    assert exc_info.value.status_code == 403


# =====================================================================
# 10. Error Handling: Backend Not Found (404)
# =====================================================================
def test_backend_not_found_handling(test_context: RestaurantContext):
    """Verify 404 response from backend raises ApolloBackendNotFoundError."""

    def not_found_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"success": False, "error": "Location not found"})

    transport = httpx.MockTransport(not_found_handler)
    api_client = ApolloApiClient(transport=transport)
    set_apollo_api_client(api_client)

    with pytest.raises(ApolloBackendNotFoundError) as exc_info:
        tool_registry.execute_tool("fetch_floor_status", test_context, {})

    assert exc_info.value.status_code == 404


# =====================================================================
# 11. Error Handling: Backend Invalid JSON (502)
# =====================================================================
def test_backend_invalid_json_handling(test_context: RestaurantContext):
    """Verify HTML error page from backend raises ApolloBackendResponseError."""

    def html_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html><body>Bad Gateway</body></html>")

    transport = httpx.MockTransport(html_handler)
    api_client = ApolloApiClient(transport=transport)
    set_apollo_api_client(api_client)

    with pytest.raises(ApolloBackendResponseError) as exc_info:
        tool_registry.execute_tool("fetch_staff_summary", test_context, {})

    assert exc_info.value.status_code == 502


# =====================================================================
# 12. Permission Enforcement Pre-flight Guard
# =====================================================================
def test_tool_permission_preflight_denied():
    """Verify tool execution fails closed before dispatching if context lacks permission."""
    restricted_context = RestaurantContext(
        organization_id="org-restricted",
        location_id="loc-restricted",
        user_id="usr-guest",
        user_role="Guest",
        permissions=[],  # Zero permissions
    )

    with pytest.raises(ToolPermissionDeniedError) as exc_info:
        tool_registry.execute_tool("fetch_menu", restricted_context, {})

    assert exc_info.value.tool_name == "fetch_menu"
    assert "menu:view" in exc_info.value.missing_permissions


# =====================================================================
# 13. End-to-End Orchestrator Execution with Live Tool Integration
# =====================================================================
def test_orchestrator_execute_live_tool_integration():
    """Verify POST /api/v1/agents/execute dispatches tool to backend client and returns result."""
    mock_validator = MockTenantValidator()
    mock_validator.allow(
        user_id=TEST_USER_ID,
        organization_id=TEST_ORG_ID,
        locations=[TEST_LOC_ID],
        role="Owner",
        permissions=["*"],
    )
    set_tenant_validator(mock_validator)

    def mock_backend(request: httpx.Request) -> httpx.Response:
        if "/menu/items" in request.url.path:
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "data": [{"id": "m-1", "name": "Paneer Tikka", "basePriceCents": 1200}],
                },
            )
        return httpx.Response(200, json={"success": True, "data": []})

    set_apollo_api_client(ApolloApiClient(transport=httpx.MockTransport(mock_backend)))

    token = create_token(user_id=TEST_USER_ID)
    headers = {
        "Authorization": f"Bearer {token}",
        "x-organization-id": TEST_ORG_ID,
        "x-location-id": TEST_LOC_ID,
    }
    payload = {
        "task": "Retrieve menu items for chef inspection",
        "agent_id": "general-orchestrator-test",
        "parameters": {"tool": "fetch_menu"},
    }

    res = client.post("/api/v1/agents/execute", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["status"] == "COMPLETED"
    tool_execs = data["result"]["tool_executions"]
    assert "fetch_menu" in tool_execs
    menu_result = tool_execs["fetch_menu"]
    assert menu_result["source"] == "apollo_backend_api"
    assert menu_result["endpoint"] == "/menu/items"
    assert menu_result["items_count"] == 1
    assert menu_result["items"][0]["name"] == "Paneer Tikka"
