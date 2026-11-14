import React, { useState, useEffect } from "react";
import type {
  AgentMetadata,
  ExecuteTaskRequest,
  TaskExecution,
} from "../../../types/agent";
import { agentApi, AgentApiError } from "../../../lib/agent-api";
import { useAuthStore } from "../../../stores/authStore";
import {
  Sparkles,
  Building,
  MapPin,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Shield,
  Bot,
  PlayCircle,
} from "lucide-react";

interface RunTabProps {
  agents: AgentMetadata[];
  selectedAgentId?: string;
  onExecutionCompleted: (execution: TaskExecution) => void;
  onViewExecutionDetails: (execution: TaskExecution) => void;
}

const TASK_TEMPLATES = [
  {
    title: "Seating & Dining Floor Plan Status",
    task: "Inspect live floor status, dining areas and occupied tables for this location",
    tool: "fetch_floor_status",
    badge: "FOH / Tables",
  },
  {
    title: "Menu Catalog & Modifier Options",
    task: "Audit active restaurant menu items, categories and modifier groups",
    tool: "fetch_menu",
    badge: "Menu / Catalog",
  },
  {
    title: "Active Kitchen Tickets",
    task: "Fetch live kitchen tickets currently in progress",
    tool: "fetch_active_orders",
    badge: "BOH / Kitchen",
  },
  {
    title: "Staff Members & Role Distribution",
    task: "Summarize active restaurant team members, servers and assigned roles",
    tool: "fetch_staff_summary",
    badge: "Team / Workforce",
  },
  {
    title: "Ingredient Inventory Replenishment (Probe unbacked module)",
    task: "Check current ingredient inventory stock levels and replenishment status",
    tool: "fetch_inventory_summary",
    badge: "Inventory / Unbacked",
  },
];

export function RunTab({
  agents,
  selectedAgentId: initialAgentId,
  onExecutionCompleted,
  onViewExecutionDetails,
}: RunTabProps) {
  const { currentOrgId, organizations } = useAuthStore();

  const implementedAgents = agents.filter((a) => a.is_implemented);
  const defaultAgent =
    implementedAgents.find((a) => a.agent_id === initialAgentId) ||
    implementedAgents[0];

  const defaultTemplate = TASK_TEMPLATES[0];

  const [agentId, setAgentId] = useState<string>(
    defaultAgent ? defaultAgent.agent_id : "general-orchestrator-test",
  );
  const [taskPrompt, setTaskPrompt] = useState<string>(
    defaultTemplate ? defaultTemplate.task : "",
  );
  const [selectedTool, setSelectedTool] = useState<string>(
    defaultTemplate ? defaultTemplate.tool : "",
  );
  const [locationId, setLocationId] = useState<string>("");

  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<TaskExecution | null>(
    null,
  );
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [showRawOutput, setShowRawOutput] = useState(false);

  useEffect(() => {
    if (initialAgentId) {
      setAgentId(initialAgentId);
    }
  }, [initialAgentId]);

  // Resolve current organization display
  const currentOrg = organizations.find(
    (o) => o.organizationId === currentOrgId,
  );
  const orgDisplayName = currentOrg?.organizationName || "Active Organization";

  const handleTemplateSelect = (template: (typeof TASK_TEMPLATES)[0]) => {
    if (!template) return;
    setTaskPrompt(template.task);
    setSelectedTool(template.tool);
  };

  const handleCopyExecutionId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskPrompt.trim() || isExecuting) return;

    setIsExecuting(true);
    setExecutionError(null);
    setExecutionResult(null);

    try {
      const payload: ExecuteTaskRequest = {
        agent_id: agentId,
        task: taskPrompt.trim(),
        parameters: selectedTool ? { tool: selectedTool } : {},
        organization_id: currentOrgId || undefined,
        location_id: locationId.trim() || undefined,
      };

      // 1. Submit task execution to POST /api/v1/agents/execute
      const initialResponse = await agentApi.executeTask(
        payload,
        locationId.trim() || undefined,
      );

      // 2. Query authoritative execution details via GET /api/v1/agents/executions/{id}
      let fullExecution: TaskExecution | null = null;
      try {
        const detailRes = await agentApi.getExecution(
          initialResponse.execution_id,
          locationId.trim() || undefined,
        );
        fullExecution = detailRes.execution;
      } catch {
        // Fallback to initial response if single get detail query encounters network glitch
        fullExecution = {
          execution_id: initialResponse.execution_id,
          agent_id: initialResponse.agent_id,
          task: taskPrompt,
          status: initialResponse.status,
          organization_id: currentOrgId || "",
          location_id: locationId || "",
          user_id: "",
          parameters: selectedTool ? { tool: selectedTool } : {},
          result: initialResponse.result,
          error: initialResponse.error,
          created_at: initialResponse.created_at,
          completed_at: initialResponse.completed_at,
        };
      }

      setExecutionResult(fullExecution);
      onExecutionCompleted(fullExecution);
    } catch (err) {
      if (err instanceof AgentApiError) {
        setExecutionError(err.message);
      } else {
        setExecutionError(
          (err as Error).message ||
            "An unexpected error occurred during execution.",
        );
      }
    } finally {
      setIsExecuting(false);
    }
  };

  const toolExecutions = executionResult?.result?.tool_executions || {};
  const toolNames = Object.keys(toolExecutions);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left Column: Form & Templates (7 cols) */}
      <div className="space-y-6 lg:col-span-7">
        {/* Quick Task Templates */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Verified Task Templates
            </span>
            <span className="text-xs text-gray-400">Click to fill</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TASK_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.title}
                type="button"
                onClick={() => handleTemplateSelect(tmpl)}
                className={`flex flex-col items-start p-3 rounded-lg border text-left transition text-xs ${
                  taskPrompt === tmpl.task
                    ? "border-indigo-400 bg-indigo-50/70 text-indigo-900 ring-1 ring-indigo-200"
                    : "border-gray-200 bg-gray-50/50 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="font-semibold">{tmpl.title}</span>
                  <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-600 border border-gray-200">
                    {tmpl.badge}
                  </span>
                </div>
                <span className="mt-1 font-mono text-[10px] text-gray-500">
                  tool: {tmpl.tool}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Task Submission Form */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs">
          <h3 className="text-sm font-bold text-gray-900 mb-1">
            Agent Task Dispatcher
          </h3>
          <p className="text-xs text-gray-500 mb-5">
            Submits a verified task to the LangGraph execution engine with
            active tenant context.
          </p>

          <form onSubmit={handleExecute} className="space-y-4">
            {/* Target Agent Selector */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Target Agent
              </label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 shadow-2xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {agents.map((agent) => (
                  <option
                    key={agent.agent_id}
                    value={agent.agent_id}
                    disabled={!agent.is_implemented}
                  >
                    {agent.name}{" "}
                    {agent.is_implemented
                      ? "(Implemented & Ready)"
                      : "(Roadmap - In Development)"}
                  </option>
                ))}
              </select>
            </div>

            {/* Optional Tool Selector Parameter */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Target Backend Tool Binding (Optional)
              </label>
              <select
                value={selectedTool}
                onChange={(e) => setSelectedTool(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-xs text-gray-900 shadow-2xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">Auto-Route by Orchestrator</option>
                <option value="fetch_floor_status">
                  fetch_floor_status (FOH / Floor Plan)
                </option>
                <option value="fetch_menu">
                  fetch_menu (Menu Items & Modifiers)
                </option>
                <option value="fetch_active_orders">
                  fetch_active_orders (BOH Kitchen Queue)
                </option>
                <option value="fetch_staff_summary">
                  fetch_staff_summary (Staff Roster & Roles)
                </option>
                <option value="fetch_inventory_summary">
                  fetch_inventory_summary (Unbacked Inventory Probe)
                </option>
              </select>
            </div>

            {/* Task Prompt Text Area */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Task Instruction Prompt
              </label>
              <textarea
                rows={3}
                value={taskPrompt}
                onChange={(e) => setTaskPrompt(e.target.value)}
                placeholder="Enter prompt or operational instruction for the agent..."
                className="w-full rounded-lg border border-gray-300 bg-white p-3 text-xs text-gray-900 shadow-2xs placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Tenant Context Verification Info */}
            <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3 text-xs space-y-2">
              <div className="flex items-center justify-between text-gray-600">
                <span className="flex items-center space-x-1.5">
                  <Building className="h-3.5 w-3.5 text-gray-400" />
                  <span>Tenant Organization:</span>
                </span>
                <span className="font-semibold text-gray-900">
                  {orgDisplayName}
                </span>
              </div>
              <div className="flex items-center justify-between text-gray-600">
                <span className="flex items-center space-x-1.5">
                  <MapPin className="h-3.5 w-3.5 text-gray-400" />
                  <span>Location Filter (Optional):</span>
                </span>
                <input
                  type="text"
                  placeholder="Auto-resolved if blank"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="w-48 rounded border border-gray-300 bg-white px-2 py-0.5 font-mono text-[11px] text-gray-800 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex items-center space-x-1.5 text-[11px] text-gray-500 pt-1 border-t border-gray-200">
                <Shield className="h-3.5 w-3.5 text-emerald-600" />
                <span>
                  Zero token leakage: Backend JWT credentials are securely
                  preserved server-side.
                </span>
              </div>
            </div>

            {/* Submission Error Banner */}
            {executionError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start space-x-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{executionError}</span>
              </div>
            )}

            {/* Dispatch Button */}
            <button
              type="submit"
              disabled={isExecuting || !taskPrompt.trim()}
              className="w-full inline-flex items-center justify-center space-x-2 rounded-lg bg-indigo-600 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {isExecuting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Orchestrating Live Task...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Execute Agent Task</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Right Column: Execution Output Panel (5 cols) */}
      <div className="space-y-6 lg:col-span-5">
        <div className="rounded-xl border border-gray-200 bg-white shadow-xs overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50/75 px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bot className="h-4 w-4 text-indigo-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                Execution Output
              </h3>
            </div>
            {executionResult && (
              <button
                onClick={() => onViewExecutionDetails(executionResult)}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                Inspect All Details →
              </button>
            )}
          </div>

          <div className="p-5">
            {isExecuting ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                <div className="relative">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                </div>
                <h4 className="text-xs font-semibold text-gray-800">
                  Executing LangGraph Workflow
                </h4>
                <p className="max-w-xs text-[11px] text-gray-500">
                  Dispatching authenticated API call to Apollo Express backend
                  and validating tenant isolation...
                </p>
              </div>
            ) : !executionResult ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400">
                <PlayCircle className="h-10 w-10 text-gray-300 mb-2" />
                <p className="text-xs font-medium text-gray-600">
                  Ready to execute
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5 max-w-xs">
                  Select a template or type a custom instruction, then click
                  "Execute Agent Task".
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Status & ID Header */}
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        executionResult.status === "COMPLETED"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}
                    >
                      {executionResult.status === "COMPLETED" ? (
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <AlertCircle className="mr-1 h-3.5 w-3.5 text-rose-600" />
                      )}
                      {executionResult.status}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5 font-mono text-[11px] text-gray-500">
                    <span>{executionResult.execution_id}</span>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyExecutionId(executionResult.execution_id)
                      }
                      className="text-gray-400 hover:text-gray-700"
                      title="Copy ID"
                    >
                      {copiedId ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Engine Message */}
                {executionResult.result?.message && (
                  <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-800 border border-gray-200">
                    <p className="font-medium text-gray-900 mb-0.5">
                      Engine Message:
                    </p>
                    <p>{executionResult.result.message}</p>
                  </div>
                )}

                {/* Tool Executions Overview */}
                <div className="space-y-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Live Tool Results ({toolNames.length})
                  </span>

                  {toolNames.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">
                      No tools were invoked.
                    </p>
                  ) : (
                    toolNames.map((toolName) => {
                      const tool = toolExecutions[toolName];
                      if (!tool) return null;
                      const isNotImplemented =
                        tool.status === "NOT_IMPLEMENTED";

                      return (
                        <div
                          key={toolName}
                          className={`rounded-lg border p-3 text-xs ${
                            isNotImplemented
                              ? "border-amber-200 bg-amber-50/50"
                              : "border-gray-200 bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-gray-800">
                              {toolName}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                isNotImplemented
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {tool.status || "COMPLETED"}
                            </span>
                          </div>

                          {tool.endpoint && (
                            <p className="mt-1 text-[11px] text-gray-500 font-mono">
                              Endpoint: {tool.endpoint}
                            </p>
                          )}

                          {/* Record counts */}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {tool.items_count !== undefined && (
                              <span className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700 font-medium">
                                Menu Items: {tool.items_count}
                              </span>
                            )}
                            {tool.modifier_groups_count !== undefined && (
                              <span className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700 font-medium">
                                Modifier Groups: {tool.modifier_groups_count}
                              </span>
                            )}
                            {tool.dining_areas_count !== undefined && (
                              <span className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700 font-medium">
                                Dining Areas: {tool.dining_areas_count}
                              </span>
                            )}
                            {tool.tables_count !== undefined && (
                              <span className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700 font-medium">
                                Tables: {tool.tables_count}
                              </span>
                            )}
                            {tool.total_staff_count !== undefined && (
                              <span className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700 font-medium">
                                Staff: {tool.total_staff_count}
                              </span>
                            )}
                            {tool.active_orders_count !== undefined && (
                              <span className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700 font-medium">
                                Active Tickets: {tool.active_orders_count}
                              </span>
                            )}
                          </div>

                          {/* Controlled Not Implemented Notice */}
                          {isNotImplemented && tool.message && (
                            <div className="mt-2 rounded border border-amber-200 bg-amber-100/70 p-2 text-[11px] text-amber-900">
                              <span className="font-semibold">
                                Backend Notice:{" "}
                              </span>
                              {tool.message}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Collapsible Raw Output */}
                <div className="pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowRawOutput(!showRawOutput)}
                    className="flex items-center space-x-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800"
                  >
                    {showRawOutput ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    <span>Toggle Full JSON Payload</span>
                  </button>
                  {showRawOutput && (
                    <pre className="mt-2 max-h-48 overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-[10px] text-gray-200">
                      {JSON.stringify(executionResult, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
