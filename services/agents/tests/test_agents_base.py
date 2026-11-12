"""Tests for LangGraph base agent state graph."""

import pytest

from src.agents.base import AgentState, create_base_graph


def test_create_base_graph():
    """Verify that the base LangGraph state graph compiles cleanly."""
    graph = create_base_graph("test_agent")
    app = graph.compile()
    assert app is not None


@pytest.mark.asyncio
async def test_base_graph_execution():
    """Verify state initialization and node transitions in the base agent graph."""
    graph = create_base_graph("test_agent")
    app = graph.compile()

    initial_state: AgentState = {
        "messages": [],
        "context": {"tenant": "test_org"},
        "agent_name": "",
        "organization_id": "org_123",
        "location_id": "loc_456",
    }

    result = await app.ainvoke(initial_state)
    assert result["agent_name"] == "test_agent"
    assert result["organization_id"] == "org_123"
