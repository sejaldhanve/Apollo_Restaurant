"""Comprehensive verification suite for Apollo Restaurant OS AI Agent Orchestrator.

Covers all 10 required test scenarios:
1. Agent registry initialization.
2. Listing registered agents.
3. Unknown agent rejection.
4. Disabled agent rejection.
5. Successful orchestration of a supported test task.
6. Missing tenant context rejection.
7. Cross-tenant access rejection.
8. Tool permission enforcement.
9. LLM provider unavailable handling.
10. Execution lifecycle and error handling.
"""

import pytest
from fastapi.testclient import TestClient

from src.context.restaurant_context import RestaurantContext
from src.llm.provider import LLMUnavailableError, get_llm
from src.main import app
from src.middleware.auth import (
    MockTenantValidator,
    create_token,
    set_tenant_validator,
)
from src.registry.agent_registry import AgentCategory, agent_registry
from src.registry.tool_registry import (
    ToolPermissionDeniedError,
    tool_registry,
)
from src.storage.execution_storage import (
    InMemoryExecutionStorage,
    set_execution_storage,
)

client = TestClient(app)

# Test tenant fixtures
TEST_USER_ID = "usr-test-100"
TEST_ORG_ID = "org-bistro-alpha"
TEST_LOC_ID = "loc-downtown"
OTHER_ORG_ID = "org-competitor-beta"
OTHER_LOC_ID = "loc-uptown"


@pytest.fixture(autouse=True)
def setup_test_environment():
    """Setup deterministic mock validator and storage before each test."""
    mock_validator = MockTenantValidator()
    # Grant test user full access to TEST_ORG_ID and TEST_LOC_ID
    mock_validator.allow(
        user_id=TEST_USER_ID,
        organization_id=TEST_ORG_ID,
        locations=[TEST_LOC_ID],
        role="Owner",
        permissions=["*"],
    )
    # Configure user with restricted permissions in OTHER_ORG_ID
    mock_validator.allow(
        user_id=TEST_USER_ID,
        organization_id=OTHER_ORG_ID,
        locations=[OTHER_LOC_ID],
        role="Server",
        permissions=["orders:read"],
    )
    set_tenant_validator(mock_validator)

    # Reset storage
    storage = InMemoryExecutionStorage()
    set_execution_storage(storage)

    # Set mock Apollo client for baseline orchestrator tests
    def default_mock_backend(req):
        import httpx

        if "/menu/items" in req.url.path:
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "data": [{"id": f"i-{i}", "name": f"Item {i}"} for i in range(24)],
                },
            )
        return httpx.Response(200, json={"success": True, "data": []})

    import httpx

    from src.client.apollo_client import ApolloApiClient, set_apollo_api_client

    set_apollo_api_client(ApolloApiClient(transport=httpx.MockTransport(default_mock_backend)))

    # Ensure default agent states
    for a in agent_registry.list_all():
        agent_registry.enable(a.agent_id)


def get_auth_headers(
    user_id: str = TEST_USER_ID,
    org_id: str = TEST_ORG_ID,
    loc_id: str = TEST_LOC_ID,
) -> dict[str, str]:
    """Helper to generate valid auth and tenant headers."""
    token = create_token(user_id=user_id)
    return {
        "Authorization": f"Bearer {token}",
        "x-organization-id": org_id,
        "x-location-id": loc_id,
    }


# =====================================================================
# Scenario 1: Agent Registry Initialization
# =====================================================================
def test_1_agent_registry_initialization():
    """Verify registry initializes with required placeholder agents and test agent."""
    agents = agent_registry.list_all()
    agent_ids = {a.agent_id for a in agents}

    # Verify all 4 required placeholder agents exist
    assert "foh-guest-orchestrator" in agent_ids
    assert "boh-predictive-ticket-agent" in agent_ids
    assert "inventory-supply-agent" in agent_ids
    assert "labor-optimization-agent" in agent_ids
    # Verify foundational test agent exists
    assert "general-orchestrator-test" in agent_ids

    # Verify placeholder agents are explicitly marked not implemented
    foh = agent_registry.get("foh-guest-orchestrator")
    assert foh is not None
    assert foh.category == AgentCategory.FRONT_OF_HOUSE
    assert foh.is_implemented is False
    assert foh.enabled is True

    boh = agent_registry.get("boh-predictive-ticket-agent")
    assert boh is not None
    assert boh.category == AgentCategory.BACK_OF_HOUSE
    assert boh.is_implemented is False

    inv = agent_registry.get("inventory-supply-agent")
    assert inv is not None
    assert inv.category == AgentCategory.INVENTORY
    assert inv.is_implemented is False

    labor = agent_registry.get("labor-optimization-agent")
    assert labor is not None
    assert labor.category == AgentCategory.WORKFORCE
    assert labor.is_implemented is False

    # Verify test agent is implemented
    test_agent = agent_registry.get("general-orchestrator-test")
    assert test_agent is not None
    assert test_agent.is_implemented is True


# =====================================================================
# Scenario 2: Listing Registered Agents
# =====================================================================
def test_2_listing_registered_agents():
    """Verify GET /api/v1/agents returns complete list of registered agents with metadata."""
    res = client.get("/api/v1/agents")
    assert res.status_code == 200
    data = res.json()

    assert "agents" in data
    assert data["total_count"] >= 5
    assert "message" in data

    # Verify structure of items
    first_agent = data["agents"][0]
    assert "agent_id" in first_agent
    assert "name" in first_agent
    assert "description" in first_agent
    assert "category" in first_agent
    assert "enabled" in first_agent
    assert "is_implemented" in first_agent
    assert "supported_tasks" in first_agent
    assert "registered_tools" in first_agent

    # Also check /agents endpoint compatibility
    res_legacy = client.get("/agents")
    assert res_legacy.status_code == 200
    assert res_legacy.json()["total_count"] == data["total_count"]


# =====================================================================
# Scenario 3: Unknown Agent Rejection
# =====================================================================
def test_3_unknown_agent_rejection():
    """Verify executing task targeting a non-existent agent returns 404."""
    headers = get_auth_headers()
    payload = {
        "task": "Perform illegal secret operations",
        "agent_id": "non-existent-agent-id-999",
    }
    res = client.post("/api/v1/agents/execute", json=payload, headers=headers)
    assert res.status_code == 404
    assert "not found in registry" in res.json()["detail"]


# =====================================================================
# Scenario 4: Disabled Agent Rejection
# =====================================================================
def test_4_disabled_agent_rejection():
    """Verify executing task with a disabled agent is rejected with 400."""
    headers = get_auth_headers()

    # Disable general-orchestrator-test
    agent_registry.disable("general-orchestrator-test")

    payload = {
        "task": "Execute test task",
        "agent_id": "general-orchestrator-test",
    }
    res = client.post("/api/v1/agents/execute", json=payload, headers=headers)
    assert res.status_code == 400
    assert "currently disabled" in res.json()["detail"]


# =====================================================================
# Scenario 5: Successful Orchestration of Supported Test Task
# =====================================================================
def test_5_successful_orchestration_test_task():
    """Verify general-orchestrator-test executes successfully without external LLMs."""
    headers = get_auth_headers()
    payload = {
        "task": "Test task verification",
        "agent_id": "general-orchestrator-test",
        "parameters": {"test_param": "alpha_value"},
    }
    res = client.post("/api/v1/agents/execute", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["status"] == "COMPLETED"
    assert data["agent_id"] == "general-orchestrator-test"
    assert "execution_id" in data
    assert data["result"] is not None
    assert data["result"]["tenant_organization_id"] == TEST_ORG_ID
    assert data["result"]["tenant_location_id"] == TEST_LOC_ID
    assert data["result"]["executed_by_user"] == TEST_USER_ID


def test_5b_placeholder_agent_safe_response():
    """Verify calling an unimplemented placeholder agent returns a safe structured response."""
    headers = get_auth_headers()
    payload = {
        "task": "Seat incoming party of 4 at table 6",
        "agent_id": "foh-guest-orchestrator",
    }
    res = client.post("/api/v1/agents/execute", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["status"] == "COMPLETED"
    assert data["agent_id"] == "foh-guest-orchestrator"
    assert data["result"] is not None
    assert data["result"]["status"] == "placeholder_acknowledged"
    assert "not yet been implemented" in data["result"]["message"]


# =====================================================================
# Scenario 6: Missing Tenant Context Rejection
# =====================================================================
def test_6_missing_tenant_context_rejection():
    """Verify missing authorization, organization, or location fails with 401 or 400."""
    token = create_token(user_id=TEST_USER_ID)
    payload = {"task": "Verify table status"}

    # 1. No Authorization header -> 401
    res1 = client.post(
        "/api/v1/agents/execute",
        json=payload,
        headers={"x-organization-id": TEST_ORG_ID, "x-location-id": TEST_LOC_ID},
    )
    assert res1.status_code == 401
    assert "Authorization header missing" in res1.json()["detail"]

    # 2. Missing organization_id -> 400
    res2 = client.post(
        "/api/v1/agents/execute",
        json=payload,
        headers={"Authorization": f"Bearer {token}", "x-location-id": TEST_LOC_ID},
    )
    assert res2.status_code == 400
    assert "Missing organization identifier" in res2.json()["detail"]

    # 3. Missing location_id -> 400
    res3 = client.post(
        "/api/v1/agents/execute",
        json=payload,
        headers={"Authorization": f"Bearer {token}", "x-organization-id": TEST_ORG_ID},
    )
    assert res3.status_code == 400
    assert "Missing location identifier" in res3.json()["detail"]


# =====================================================================
# Scenario 7: Cross-Tenant Access Rejection
# =====================================================================
def test_7_cross_tenant_access_rejection():
    """Verify unauthorized cross-tenant operations are rejected with 403."""
    # User lacks membership in 'unauthorized-org-999'
    token = create_token(user_id=TEST_USER_ID)
    unauthorized_headers = {
        "Authorization": f"Bearer {token}",
        "x-organization-id": "unauthorized-org-999",
        "x-location-id": "loc-any",
    }
    payload = {"task": "Inspect tickets", "agent_id": "general-orchestrator-test"}

    res = client.post("/api/v1/agents/execute", json=payload, headers=unauthorized_headers)
    assert res.status_code == 403
    assert "not an authorized member" in res.json()["detail"]


def test_7b_cross_tenant_execution_retrieval_rejection():
    """Verify retrieving execution record belonging to another organization returns 403."""
    # First create an execution in TEST_ORG_ID
    headers_org1 = get_auth_headers(org_id=TEST_ORG_ID, loc_id=TEST_LOC_ID)
    payload = {"task": "Orchestrate private test", "agent_id": "general-orchestrator-test"}
    create_res = client.post("/api/v1/agents/execute", json=payload, headers=headers_org1)
    assert create_res.status_code == 200
    exec_id = create_res.json()["execution_id"]

    # Now attempt retrieval using tenant context for OTHER_ORG_ID
    headers_org2 = get_auth_headers(org_id=OTHER_ORG_ID, loc_id=OTHER_LOC_ID)
    get_res = client.get(f"/api/v1/agents/executions/{exec_id}", headers=headers_org2)
    assert get_res.status_code == 403
    assert "denied" in get_res.json()["detail"]


# =====================================================================
# Scenario 8: Tool Permission Enforcement
# =====================================================================
def test_8_tool_permission_enforcement_success():
    """Verify tool execution succeeds when context holds the required permission."""
    headers = get_auth_headers(org_id=TEST_ORG_ID, loc_id=TEST_LOC_ID)
    payload = {
        "task": "Test tool invocation",
        "agent_id": "general-orchestrator-test",
        "parameters": {"tool": "fetch_menu", "tool_params": {}},
    }
    res = client.post("/api/v1/agents/execute", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "COMPLETED"
    tool_execs = data["result"]["tool_executions"]
    assert "fetch_menu" in tool_execs
    assert tool_execs["fetch_menu"]["items_count"] == 24


def test_8b_tool_permission_enforcement_denied():
    """Verify tool execution fails when caller lacks required permissions."""
    # Context with strictly 'orders:read' (lacks 'menu:read')
    restricted_context = RestaurantContext(
        organization_id="org-restricted",
        location_id="loc-restricted",
        user_id="usr-restricted",
        user_role="Line Cook",
        permissions=["orders:read"],
    )

    # Executing fetch_menu should raise ToolPermissionDeniedError
    with pytest.raises(ToolPermissionDeniedError) as exc_info:
        tool_registry.execute_tool("fetch_menu", restricted_context, {})

    assert "Access to tool 'fetch_menu' denied" in str(exc_info.value)
    assert "menu:view" in exc_info.value.missing_permissions


# =====================================================================
# Scenario 9: LLM Provider Unavailable Handling
# =====================================================================
def test_9_llm_provider_unavailable_handling():
    """Verify requesting an unconfigured LLM provider raises LLMUnavailableError without crash."""
    # When provider is not configured or unsupported
    with pytest.raises(LLMUnavailableError) as exc_info:
        get_llm(provider="unsupported-provider-xyz")

    assert "Unsupported provider" in str(exc_info.value)

    # Health check probe reflects LLM status safely
    res = client.get("/api/v1/agents/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert "llm" in data
    assert "provider" in data["llm"]


# =====================================================================
# Scenario 10: Execution Lifecycle and Error Handling
# =====================================================================
def test_10_execution_lifecycle_and_retrieval():
    """Verify execution lifecycle from running to completion and status retrieval."""
    headers = get_auth_headers()
    payload = {
        "task": "Inspect inventory summary",
        "agent_id": "general-orchestrator-test",
        "parameters": {"tool": "fetch_inventory_summary"},
    }
    exec_res = client.post("/api/v1/agents/execute", json=payload, headers=headers)
    assert exec_res.status_code == 200
    exec_id = exec_res.json()["execution_id"]

    # Retrieve execution status
    get_res = client.get(f"/api/v1/agents/executions/{exec_id}", headers=headers)
    assert get_res.status_code == 200
    record = get_res.json()["execution"]

    assert record["execution_id"] == exec_id
    assert record["status"] == "COMPLETED"
    assert record["organization_id"] == TEST_ORG_ID
    assert record["location_id"] == TEST_LOC_ID
    assert record["user_id"] == TEST_USER_ID
    assert record["created_at"] is not None
    assert record["completed_at"] is not None


def test_10b_execution_not_found():
    """Verify querying a non-existent execution ID returns 404."""
    headers = get_auth_headers()
    res = client.get("/api/v1/agents/executions/exec-non-existent-999", headers=headers)
    assert res.status_code == 404
    assert "not found" in res.json()["detail"]
