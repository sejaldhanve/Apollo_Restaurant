import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { AiOperationsPage } from "./AiOperationsPage";
import { agentApi } from "../../lib/agent-api";
import { useAuthStore } from "../../stores/authStore";
import type {
  AgentHealthResponse,
  AgentListResponse,
  TaskExecution,
} from "../../types/agent";

vi.mock("../../lib/agent-api", () => ({
  agentApi: {
    getHealth: vi.fn(),
    listAgents: vi.fn(),
    executeTask: vi.fn(),
    getExecution: vi.fn(),
  },
  AgentApiError: class extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));

const mockHealthResponse: AgentHealthResponse = {
  status: "healthy",
  version: "0.1.0",
  environment: "development",
  timestamp: "2026-11-14T20:00:00Z",
  llm: {
    provider: "openai",
    model: "gpt-4o-mini",
    configured: false,
    status: "missing_api_key",
  },
};

const mockAgentsResponse: AgentListResponse = {
  total_count: 5,
  message:
    "Apollo Agent Registry: specialized agents defined with operational statuses.",
  agents: [
    {
      agent_id: "general-orchestrator-test",
      name: "General Orchestrator Test Agent",
      description:
        "Foundational orchestrator agent used for baseline orchestration and tool verification.",
      category: "GENERAL",
      enabled: true,
      is_implemented: true,
      supported_tasks: ["test_echo", "test_tool_execution"],
      registered_tools: [
        "fetch_menu",
        "fetch_active_orders",
        "fetch_floor_status",
        "fetch_inventory_summary",
        "fetch_staff_summary",
      ],
    },
    {
      agent_id: "foh-guest-orchestrator",
      name: "Front of House Guest Orchestrator",
      description: "Coordinates guest seating and table turn optimization.",
      category: "FRONT_OF_HOUSE",
      enabled: true,
      is_implemented: false,
      supported_tasks: ["table_seating", "guest_concierge"],
      registered_tools: ["fetch_floor_status", "fetch_staff_summary"],
    },
    {
      agent_id: "boh-predictive-ticket-agent",
      name: "Back of House Predictive Ticket Execution Agent",
      description: "Predicts kitchen prep bottlenecks and fire times.",
      category: "BACK_OF_HOUSE",
      enabled: true,
      is_implemented: false,
      supported_tasks: ["kitchen_pacing", "ticket_priority"],
      registered_tools: ["fetch_active_orders", "fetch_menu"],
    },
    {
      agent_id: "inventory-supply-agent",
      name: "Autonomous Inventory Supply Agent",
      description:
        "Monitors ingredient burn rates and forecasts stockout risks.",
      category: "INVENTORY",
      enabled: true,
      is_implemented: false,
      supported_tasks: ["stockout_prediction"],
      registered_tools: ["fetch_inventory_summary", "fetch_menu"],
    },
    {
      agent_id: "labor-optimization-agent",
      name: "Dynamic Labor Optimization Agent",
      description: "Evaluates labor-to-sales percentages and schedules.",
      category: "WORKFORCE",
      enabled: true,
      is_implemented: false,
      supported_tasks: ["labor_sales_ratio"],
      registered_tools: ["fetch_staff_summary", "fetch_active_orders"],
    },
  ],
};

const mockCompletedExecution: TaskExecution = {
  execution_id: "exec_test123456",
  agent_id: "general-orchestrator-test",
  task: "Inspect live floor status and dining tables",
  status: "COMPLETED",
  organization_id: "org-13d045e2",
  location_id: "loc-f617832c",
  user_id: "user-e9035ba6",
  parameters: { tool: "fetch_floor_status" },
  result: {
    orchestrator: "Apollo AI Agent Engine v1",
    agent_id: "general-orchestrator-test",
    agent_name: "General Orchestrator Test Agent",
    category: "GENERAL",
    task: "Inspect live floor status and dining tables",
    tenant_organization_id: "org-13d045e2",
    tenant_location_id: "loc-f617832c",
    executed_by_user: "user-e9035ba6",
    user_role: "Owner",
    message:
      "Successfully orchestrated task for agent 'General Orchestrator Test Agent'.",
    tool_executions: {
      fetch_floor_status: {
        source: "apollo_backend_api",
        endpoint: "/foh/locations/loc-f617832c/floor-plan",
        organization_id: "org-13d045e2",
        location_id: "loc-f617832c",
        dining_areas_count: 2,
        tables_count: 10,
        occupied_tables_count: 3,
        status: "COMPLETED",
      },
    },
  },
  created_at: "2026-11-14T20:00:00Z",
  started_at: "2026-11-14T20:00:00Z",
  completed_at: "2026-11-14T20:00:02Z",
};

describe("AiOperationsPage Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.setState({
      currentOrgId: "org-13d045e2",
      organizations: [
        {
          organizationId: "org-13d045e2",
          organizationName: "Sejal Group",
          organizationSlug: "sejal-group",
          role: "Owner",
          permissions: ["org:manage"],
        },
      ],
      isAuthenticated: true,
    });

    vi.mocked(agentApi.getHealth).mockResolvedValue(mockHealthResponse);
    vi.mocked(agentApi.listAgents).mockResolvedValue(mockAgentsResponse);
  });

  it("renders Overview tab by default with live health and fleet capacity", async () => {
    render(
      <MemoryRouter initialEntries={["/ai-ops"]}>
        <AiOperationsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByText("AI Operations Command Center"),
      ).toBeInTheDocument();
    });

    // Check status pill in header
    expect(screen.getByText("FastAPI :8000 Online")).toBeInTheDocument();

    // Check stat cards
    expect(screen.getByText("AI Service Health")).toBeInTheDocument();
    expect(screen.getByText("LLM Provider Engine")).toBeInTheDocument();
    expect(screen.getByText("Agent Fleet Status")).toBeInTheDocument();
    expect(screen.getByText("Session Executions")).toBeInTheDocument();

    // Check fleet numbers
    expect(screen.getByText("1 Implemented")).toBeInTheDocument();
    expect(
      screen.getByText("4 Roadmap Placeholders", { exact: false }),
    ).toBeInTheDocument();

    // Check honest unconfigured LLM status
    expect(screen.getByText("Missing API Key")).toBeInTheDocument();
  });

  it("navigates to AI Agents tab and differentiates implemented vs placeholder agents", async () => {
    render(
      <MemoryRouter initialEntries={["/ai-ops"]}>
        <AiOperationsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("AI Agents")).toBeInTheDocument();
    });

    // Click AI Agents tab
    fireEvent.click(screen.getByRole("button", { name: /ai agents/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Registered AI Restaurant Agents"),
      ).toBeInTheDocument();
    });

    // Verify implemented agent
    expect(
      screen.getByText("General Orchestrator Test Agent"),
    ).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /launch task/i })).toBeEnabled();

    // Verify placeholder agents exist with roadmap badges and disabled buttons
    expect(
      screen.getByText("Front of House Guest Orchestrator"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Back of House Predictive Ticket Execution Agent"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Autonomous Inventory Supply Agent"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Dynamic Labor Optimization Agent"),
    ).toBeInTheDocument();

    const notExecutableButtons = screen.getAllByRole("button", {
      name: /not executable/i,
    });
    expect(notExecutableButtons.length).toBe(4);
    expect(notExecutableButtons[0]).toBeDisabled();
  });

  it("navigates to Execution History tab and displays lookup and backend architecture limitation notice", async () => {
    render(
      <MemoryRouter initialEntries={["/ai-ops"]}>
        <AiOperationsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Execution History")).toBeInTheDocument();
    });

    // Click Execution History tab
    fireEvent.click(screen.getByRole("button", { name: /execution history/i }));

    await waitFor(() => {
      expect(screen.getByText("Query Execution by ID")).toBeInTheDocument();
    });

    // Check honest limitation notice
    expect(
      screen.getByText("Backend Execution Storage Architecture Note"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("InMemoryExecutionStorage", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("GET /api/v1/agents/executions?limit=50", {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  it("submits a task in Run an Agent tab and displays live tool results", async () => {
    vi.mocked(agentApi.executeTask).mockResolvedValue({
      execution_id: "exec_test123456",
      agent_id: "general-orchestrator-test",
      status: "COMPLETED",
      message: "Task execution completed",
      result: mockCompletedExecution.result,
      created_at: "2026-11-14T20:00:00Z",
      completed_at: "2026-11-14T20:00:02Z",
    });

    vi.mocked(agentApi.getExecution).mockResolvedValue({
      execution: mockCompletedExecution,
    });

    render(
      <MemoryRouter initialEntries={["/ai-ops"]}>
        <AiOperationsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Run an Agent")).toBeInTheDocument();
    });

    // Click Run an Agent tab
    fireEvent.click(screen.getByRole("button", { name: /run an agent/i }));

    await waitFor(() => {
      expect(screen.getByText("Agent Task Dispatcher")).toBeInTheDocument();
    });

    // Click Execute Agent Task button
    const executeButton = screen.getByRole("button", {
      name: /execute agent task/i,
    });
    fireEvent.click(executeButton);

    await waitFor(() => {
      expect(agentApi.executeTask).toHaveBeenCalled();
    });

    // Check output
    await waitFor(() => {
      expect(screen.getByText("exec_test123456")).toBeInTheDocument();
      expect(screen.getByText("fetch_floor_status")).toBeInTheDocument();
      expect(screen.getByText("Dining Areas: 2")).toBeInTheDocument();
      expect(screen.getByText("Tables: 10")).toBeInTheDocument();
    });
  });

  it("displays controlled NOT_IMPLEMENTED note when inventory tool is tested", async () => {
    const mockInventoryExecution: TaskExecution = {
      ...mockCompletedExecution,
      execution_id: "exec_inv_999",
      task: "Check ingredient inventory stock levels",
      parameters: { tool: "fetch_inventory_summary" },
      result: {
        ...mockCompletedExecution.result!,
        task: "Check ingredient inventory stock levels",
        tool_executions: {
          fetch_inventory_summary: {
            source: "apollo_backend_api",
            status: "NOT_IMPLEMENTED",
            message:
              "Inventory module is not yet implemented in Apollo API backend. Returning controlled response with data=None.",
            data: null,
          },
        },
      },
    };

    vi.mocked(agentApi.executeTask).mockResolvedValue({
      execution_id: "exec_inv_999",
      agent_id: "general-orchestrator-test",
      status: "COMPLETED",
      message: "Task completed",
      result: mockInventoryExecution.result,
      created_at: "2026-11-14T20:00:00Z",
      completed_at: "2026-11-14T20:00:01Z",
    });

    vi.mocked(agentApi.getExecution).mockResolvedValue({
      execution: mockInventoryExecution,
    });

    render(
      <MemoryRouter initialEntries={["/ai-ops?tab=run"]}>
        <AiOperationsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Agent Task Dispatcher")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: /execute agent task/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("exec_inv_999")).toBeInTheDocument();
      expect(screen.getByText("NOT_IMPLEMENTED")).toBeInTheDocument();
      expect(
        screen.getByText("Inventory module is not yet implemented", {
          exact: false,
        }),
      ).toBeInTheDocument();
    });
  });
});
