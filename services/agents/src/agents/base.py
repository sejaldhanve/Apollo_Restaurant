"""Base agent architecture using LangGraph."""

from typing import Annotated, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """Base state for all Apollo agents."""

    messages: Annotated[list, add_messages]
    context: dict
    agent_name: str
    organization_id: str
    location_id: str | None


def create_base_graph(agent_name: str) -> StateGraph:
    """Create a base LangGraph state graph for an agent.

    This is a template. Each specialist agent will extend this
    with domain-specific nodes, edges, and tools.
    """
    graph = StateGraph(AgentState)

    async def entry_node(state: AgentState) -> AgentState:
        """Entry point for agent processing."""
        return {**state, "agent_name": agent_name}

    graph.add_node("entry", entry_node)
    graph.add_edge(START, "entry")
    graph.add_edge("entry", END)

    return graph
