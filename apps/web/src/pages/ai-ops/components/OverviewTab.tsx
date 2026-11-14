import type {
  AgentHealthResponse,
  AgentMetadata,
  TaskExecution,
} from "../../../types/agent";
import {
  Activity,
  Cpu,
  Bot,
  CheckCircle2,
  PlayCircle,
  ArrowRight,
  ShieldAlert,
  Server,
  Zap,
} from "lucide-react";

interface OverviewTabProps {
  health: AgentHealthResponse | null;
  agents: AgentMetadata[];
  sessionExecutions: TaskExecution[];
  isLoading: boolean;
  error: string | null;
  onNavigateTab: (
    tab: "overview" | "agents" | "history" | "run",
    preselectAgent?: string,
  ) => void;
  onSelectExecution: (execution: TaskExecution) => void;
  onRefresh: () => void;
}

export function OverviewTab({
  health,
  agents,
  sessionExecutions,
  isLoading,
  error,
  onNavigateTab,
  onSelectExecution,
  onRefresh,
}: OverviewTabProps) {
  if (isLoading && !health && agents.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center space-y-3 rounded-xl border border-gray-200 bg-white p-8 shadow-xs">
        <Activity className="h-6 w-6 animate-spin text-indigo-600" />
        <p className="text-sm font-medium text-gray-600">
          Connecting to Apollo AI Agent Service...
        </p>
      </div>
    );
  }

  if (error && !health) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-6 shadow-xs">
        <div className="flex items-start space-x-3">
          <ShieldAlert className="h-6 w-6 text-rose-600 mt-0.5 shrink-0" />
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-rose-900">
              AI Service Connection Failed
            </h3>
            <p className="text-sm text-rose-700">{error}</p>
            <button
              onClick={onRefresh}
              className="mt-3 inline-flex items-center rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-rose-700"
            >
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  const implementedAgents = agents.filter((a) => a.is_implemented);
  const placeholderAgents = agents.filter((a) => !a.is_implemented);

  const completedExecutions = sessionExecutions.filter(
    (e) => e.status === "COMPLETED",
  );
  const successRate =
    sessionExecutions.length > 0
      ? Math.round(
          (completedExecutions.length / sessionExecutions.length) * 100,
        )
      : null;

  return (
    <div className="space-y-6">
      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: AI Service Health */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              AI Service Health
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Server className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <h4 className="text-lg font-bold text-gray-900 capitalize">
              {health?.status || "Healthy"}
            </h4>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            FastAPI v{health?.version || "0.1.0"} •{" "}
            {health?.environment || "development"}
          </p>
        </div>

        {/* Card 2: LLM Provider Configuration */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              LLM Provider Engine
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Cpu className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-center space-x-2">
            <h4 className="text-base font-bold text-gray-900">
              {health?.llm?.provider?.toUpperCase() || "OPENAI"}
            </h4>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                health?.llm?.configured
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-amber-50 text-amber-700 border border-amber-200"
              }`}
            >
              {health?.llm?.configured ? "Ready" : "Missing API Key"}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Model: {health?.llm?.model || "gpt-4o-mini"} (Offline Rule-Based
            Ready)
          </p>
        </div>

        {/* Card 3: Agent Fleet Capacity */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Agent Fleet Status
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Bot className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <h4 className="text-2xl font-bold text-gray-900">
              {agents.length}
            </h4>
            <span className="text-xs text-gray-500">Registered</span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            <span className="font-semibold text-emerald-600">
              {implementedAgents.length} Implemented
            </span>{" "}
            • {placeholderAgents.length} Roadmap Placeholders
          </p>
        </div>

        {/* Card 4: Session Execution Metrics */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Session Executions
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <h4 className="text-2xl font-bold text-gray-900">
              {sessionExecutions.length}
            </h4>
            <span className="text-xs text-gray-500">
              {successRate !== null ? `${successRate}% Success` : "No runs yet"}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Backend storage: In-Memory / Ephemeral
          </p>
        </div>
      </div>

      {/* Notice Banner: Honest Architecture Status */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs text-indigo-900 flex items-start space-x-3">
        <Zap className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold">
            Apollo Restaurant OS — AI Intelligence Layer Status (Phase 3)
          </span>
          <p className="text-indigo-800 leading-relaxed">
            The Agent Orchestrator foundation and live backend tool integrations
            are active. The primary LLM provider (OpenAI) currently reports{" "}
            <code className="font-mono bg-indigo-100 px-1 py-0.5 rounded">
              configured=false
            </code>{" "}
            due to an unconfigured API key; the system runs deterministically
            using live backend tools. Specialized Front of House, Back of House,
            Inventory, and Labor agents are defined in the registry as
            architecture roadmap placeholders.
          </p>
        </div>
      </div>

      {/* Main Content Grid: Recent Activity & Quick Launcher */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Recent Agent Activity */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Recent Agent Activity
              </h3>
              <p className="text-xs text-gray-500">
                Authoritative task executions recorded during this active
                browser session
              </p>
            </div>
            {sessionExecutions.length > 0 && (
              <button
                onClick={() => onNavigateTab("history")}
                className="inline-flex items-center space-x-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                <span>View All History</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="p-6">
            {sessionExecutions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-400 mb-3">
                  <PlayCircle className="h-6 w-6" />
                </div>
                <h4 className="text-sm font-semibold text-gray-800">
                  No Agent Tasks Executed Yet
                </h4>
                <p className="mt-1 max-w-sm text-xs text-gray-500">
                  Submit a live task to test real-time tool orchestration
                  against the Apollo API.
                </p>
                <button
                  onClick={() => onNavigateTab("run")}
                  className="mt-4 inline-flex items-center space-x-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700"
                >
                  <PlayCircle className="h-3.5 w-3.5" />
                  <span>Run First Agent Task</span>
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {sessionExecutions.slice(0, 5).map((exec) => (
                  <div
                    key={exec.execution_id}
                    onClick={() => onSelectExecution(exec)}
                    className="flex cursor-pointer items-center justify-between py-3 hover:bg-gray-50/80 -mx-3 px-3 rounded-lg transition"
                  >
                    <div className="space-y-1 pr-4">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-medium text-gray-800">
                          {exec.execution_id}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            exec.status === "COMPLETED"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}
                        >
                          {exec.status}
                        </span>
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs text-gray-500 font-medium">
                          {exec.result?.agent_name || exec.agent_id}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-1">
                        {exec.task}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-gray-500">
                        {new Date(exec.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <span className="text-[11px] font-medium text-indigo-600">
                        View Details →
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Col: Quick Launcher & Live Tools */}
        <div className="space-y-6">
          {/* Quick Launcher Card */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              Active Orchestrator Agent
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Foundational test agent with live authenticated tool access
            </p>

            <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-4">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-semibold text-emerald-900">
                  General Orchestrator Test Agent
                </span>
              </div>
              <p className="mt-1.5 text-xs text-emerald-800">
                Bound to 5 backend tools with tenant context verification.
              </p>
              <button
                onClick={() =>
                  onNavigateTab("run", "general-orchestrator-test")
                }
                className="mt-3 w-full inline-flex items-center justify-center space-x-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                <span>Launch Task</span>
              </button>
            </div>
          </div>

          {/* Bound Live Tools Status */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              Registered Backend Tools
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Direct connection to Apollo Express API
            </p>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between rounded bg-gray-50 p-2 border border-gray-100">
                <span className="font-mono text-gray-800">fetch_menu</span>
                <span className="text-emerald-600 font-medium">Live API</span>
              </div>
              <div className="flex items-center justify-between rounded bg-gray-50 p-2 border border-gray-100">
                <span className="font-mono text-gray-800">
                  fetch_active_orders
                </span>
                <span className="text-emerald-600 font-medium">Live API</span>
              </div>
              <div className="flex items-center justify-between rounded bg-gray-50 p-2 border border-gray-100">
                <span className="font-mono text-gray-800">
                  fetch_floor_status
                </span>
                <span className="text-emerald-600 font-medium">Live API</span>
              </div>
              <div className="flex items-center justify-between rounded bg-gray-50 p-2 border border-gray-100">
                <span className="font-mono text-gray-800">
                  fetch_staff_summary
                </span>
                <span className="text-emerald-600 font-medium">Live API</span>
              </div>
              <div className="flex items-center justify-between rounded bg-amber-50/60 p-2 border border-amber-200/60">
                <span className="font-mono text-amber-900">
                  fetch_inventory_summary
                </span>
                <span className="text-amber-700 font-medium">
                  NOT_IMPLEMENTED
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
