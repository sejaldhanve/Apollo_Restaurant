import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useLocation } from "react-router";
import { agentApi, AgentApiError } from "../../lib/agent-api";
import type {
  AgentHealthResponse,
  AgentMetadata,
  TaskExecution,
} from "../../types/agent";
import { OverviewTab } from "./components/OverviewTab";
import { AgentsTab } from "./components/AgentsTab";
import { HistoryTab } from "./components/HistoryTab";
import { RunTab } from "./components/RunTab";
import { ExecutionDetailModal } from "./components/ExecutionDetailModal";
import {
  Bot,
  LayoutDashboard,
  Clock,
  RefreshCw,
  Server,
  AlertCircle,
  Sparkles,
} from "lucide-react";

type ActiveTab = "overview" | "agents" | "history" | "run";

const SESSION_EXECUTIONS_KEY = "apollo_ai_session_executions";

export function AiOperationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  // Determine active tab from URL path or search param
  const getInitialTab = (): ActiveTab => {
    const tabParam = searchParams.get("tab") as ActiveTab;
    if (
      tabParam &&
      ["overview", "agents", "history", "run"].includes(tabParam)
    ) {
      return tabParam;
    }
    if (location.pathname.includes("/agents")) return "agents";
    if (location.pathname.includes("/history")) return "history";
    if (location.pathname.includes("/run")) return "run";
    return "overview";
  };

  const [activeTab, setActiveTab] = useState<ActiveTab>(getInitialTab);
  const [selectedAgentForRun, setSelectedAgentForRun] = useState<
    string | undefined
  >();

  // State for Agent API data
  const [health, setHealth] = useState<AgentHealthResponse | null>(null);
  const [agents, setAgents] = useState<AgentMetadata[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Session execution history (retained in browser storage for quick review)
  const [sessionExecutions, setSessionExecutions] = useState<TaskExecution[]>(
    () => {
      try {
        const saved = localStorage.getItem(SESSION_EXECUTIONS_KEY);
        if (saved) return JSON.parse(saved);
      } catch {
        // Ignore parse errors
      }
      return [];
    },
  );

  // Modal inspection state
  const [inspectedExecution, setInspectedExecution] =
    useState<TaskExecution | null>(null);

  // Load health & agents from FastAPI backend
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [healthRes, agentsRes] = await Promise.all([
        agentApi.getHealth().catch((err) => {
          throw err;
        }),
        agentApi.listAgents().catch((err) => {
          throw err;
        }),
      ]);
      setHealth(healthRes);
      setAgents(agentsRes.agents);
    } catch (err) {
      if (err instanceof AgentApiError) {
        setError(err.message);
      } else {
        setError(
          (err as Error).message ||
            "Failed to communicate with AI Agent service.",
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTabChange = (tab: ActiveTab, preselectAgent?: string) => {
    setActiveTab(tab);
    setSearchParams({ tab });
    if (preselectAgent) {
      setSelectedAgentForRun(preselectAgent);
    }
  };

  const handleExecutionCompleted = (execution: TaskExecution) => {
    setSessionExecutions((prev) => {
      // Deduplicate by execution_id
      const filtered = prev.filter(
        (e) => e.execution_id !== execution.execution_id,
      );
      const updated = [execution, ...filtered];
      try {
        localStorage.setItem(
          SESSION_EXECUTIONS_KEY,
          JSON.stringify(updated.slice(0, 50)),
        );
      } catch {
        // Ignore storage quotas
      }
      return updated;
    });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header with Title and Connection Status */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center space-x-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h2 className="text-xl font-bold tracking-tight text-gray-900">
                AI Operations Command Center
              </h2>
              <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 border border-indigo-200">
                Phase 3
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              Centralized autonomous agent orchestration, live backend tools and
              operational monitoring
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Live Service Indicator */}
          <div className="flex items-center space-x-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-2xs">
            <Server className="h-3.5 w-3.5 text-gray-400" />
            <span className="flex h-2 w-2 relative">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  health ? "bg-emerald-400" : "bg-rose-400"
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  health ? "bg-emerald-500" : "bg-rose-500"
                }`}
              />
            </span>
            <span className="font-mono text-[11px]">
              {health ? "FastAPI :8000 Online" : "Service Offline"}
            </span>
          </div>

          {/* Refresh Button */}
          <button
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center space-x-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 disabled:opacity-50"
            title="Reload AI agent registry & health"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Error Callout if service is unreachable */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start space-x-3 shadow-2xs">
          <AlertCircle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <span className="font-semibold">
              AI Agent Service Connection Error:
            </span>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-2 sm:space-x-4">
          <button
            onClick={() => handleTabChange("overview")}
            className={`flex items-center space-x-2 border-b-2 py-3 px-3 text-xs font-semibold transition ${
              activeTab === "overview"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            <span>Overview</span>
          </button>

          <button
            onClick={() => handleTabChange("agents")}
            className={`flex items-center space-x-2 border-b-2 py-3 px-3 text-xs font-semibold transition ${
              activeTab === "agents"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            <Bot className="h-4 w-4" />
            <span>AI Agents</span>
            {agents.length > 0 && (
              <span className="rounded-full bg-gray-100 px-1.5 py-0.2 text-[10px] text-gray-600 font-bold">
                {agents.length}
              </span>
            )}
          </button>

          <button
            onClick={() => handleTabChange("history")}
            className={`flex items-center space-x-2 border-b-2 py-3 px-3 text-xs font-semibold transition ${
              activeTab === "history"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            <Clock className="h-4 w-4" />
            <span>Execution History</span>
            {sessionExecutions.length > 0 && (
              <span className="rounded-full bg-indigo-50 px-1.5 py-0.2 text-[10px] text-indigo-600 font-bold">
                {sessionExecutions.length}
              </span>
            )}
          </button>

          <button
            onClick={() => handleTabChange("run")}
            className={`flex items-center space-x-2 border-b-2 py-3 px-3 text-xs font-semibold transition ${
              activeTab === "run"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>Run an Agent</span>
          </button>
        </nav>
      </div>

      {/* Active Tab View */}
      <div>
        {activeTab === "overview" && (
          <OverviewTab
            health={health}
            agents={agents}
            sessionExecutions={sessionExecutions}
            isLoading={isLoading}
            error={error}
            onNavigateTab={handleTabChange}
            onSelectExecution={setInspectedExecution}
            onRefresh={loadData}
          />
        )}

        {activeTab === "agents" && (
          <AgentsTab
            agents={agents}
            isLoading={isLoading}
            onLaunchAgent={(agentId) => handleTabChange("run", agentId)}
          />
        )}

        {activeTab === "history" && (
          <HistoryTab
            sessionExecutions={sessionExecutions}
            onSelectExecution={setInspectedExecution}
            onNavigateToRun={() => handleTabChange("run")}
          />
        )}

        {activeTab === "run" && (
          <RunTab
            agents={agents}
            selectedAgentId={selectedAgentForRun}
            onExecutionCompleted={handleExecutionCompleted}
            onViewExecutionDetails={setInspectedExecution}
          />
        )}
      </div>

      {/* Detail Inspection Modal */}
      <ExecutionDetailModal
        execution={inspectedExecution}
        onClose={() => setInspectedExecution(null)}
      />
    </div>
  );
}
