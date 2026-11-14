import { useState } from "react";
import type { TaskExecution } from "../../../types/agent";
import {
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  Database,
  Layers,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Building,
  MapPin,
  Bot,
} from "lucide-react";

interface ExecutionDetailModalProps {
  execution: TaskExecution | null;
  onClose: () => void;
}

export function ExecutionDetailModal({
  execution,
  onClose,
}: ExecutionDetailModalProps) {
  const [showRawJson, setShowRawJson] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!execution) return null;

  const handleCopyId = () => {
    navigator.clipboard.writeText(execution.execution_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getDuration = () => {
    if (!execution.created_at || !execution.completed_at) return "N/A";
    const start = new Date(
      execution.started_at || execution.created_at,
    ).getTime();
    const end = new Date(execution.completed_at).getTime();
    const diffMs = end - start;
    if (isNaN(diffMs) || diffMs < 0) return "N/A";
    if (diffMs < 1000) return `${diffMs} ms`;
    return `${(diffMs / 1000).toFixed(2)} s`;
  };

  const toolExecutions = execution.result?.tool_executions || {};
  const toolNames = Object.keys(toolExecutions);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-gray-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center space-x-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-semibold text-gray-900">
                  Execution Details
                </h3>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    execution.status === "COMPLETED"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : execution.status === "FAILED"
                        ? "bg-rose-50 text-rose-700 border border-rose-200"
                        : "bg-blue-50 text-blue-700 border border-blue-200"
                  }`}
                >
                  {execution.status === "COMPLETED" ? (
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                  ) : execution.status === "FAILED" ? (
                    <AlertCircle className="mr-1 h-3 w-3" />
                  ) : (
                    <Clock className="mr-1 h-3 w-3 animate-spin" />
                  )}
                  {execution.status}
                </span>
              </div>
              <div className="flex items-center space-x-2 text-xs text-gray-500">
                <span className="font-mono text-gray-700">
                  {execution.execution_id}
                </span>
                <button
                  onClick={handleCopyId}
                  className="text-gray-400 hover:text-gray-700"
                  title="Copy Execution ID"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-100 bg-gray-50/70 p-4 sm:grid-cols-4 text-xs">
            <div>
              <span className="font-medium text-gray-500">Agent</span>
              <p className="mt-0.5 font-semibold text-gray-800">
                {execution.result?.agent_name || execution.agent_id}
              </p>
            </div>
            <div>
              <span className="font-medium text-gray-500">Duration</span>
              <p className="mt-0.5 font-semibold text-gray-800">
                {getDuration()}
              </p>
            </div>
            <div>
              <span className="font-medium text-gray-500">Executed At</span>
              <p className="mt-0.5 text-gray-800">
                {new Date(execution.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </p>
            </div>
            <div>
              <span className="font-medium text-gray-500">User Role</span>
              <p className="mt-0.5 text-gray-800">
                {execution.result?.user_role || "Authenticated Staff"}
              </p>
            </div>
          </div>

          {/* Context Tagging */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
            <div className="flex items-center space-x-1 rounded bg-gray-100 px-2 py-1">
              <Building className="h-3.5 w-3.5 text-gray-500" />
              <span>Org:</span>
              <span className="font-mono text-gray-800">
                {execution.organization_id}
              </span>
            </div>
            <div className="flex items-center space-x-1 rounded bg-gray-100 px-2 py-1">
              <MapPin className="h-3.5 w-3.5 text-gray-500" />
              <span>Location:</span>
              <span className="font-mono text-gray-800">
                {execution.location_id}
              </span>
            </div>
          </div>

          {/* Task Prompt */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
              Task Prompt
            </h4>
            <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-800 shadow-2xs">
              {execution.task}
            </div>
          </div>

          {/* Error Message (if any) */}
          {execution.error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
              <div className="flex items-center space-x-1.5 font-semibold mb-1">
                <AlertCircle className="h-4 w-4" />
                <span>Execution Error</span>
              </div>
              <p>{execution.error}</p>
            </div>
          )}

          {/* Orchestrator Output Message */}
          {execution.result?.message && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                Engine Summary
              </h4>
              <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3">
                {execution.result.message}
              </p>
            </div>
          )}

          {/* Tool Executions Breakdown */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Tool Integrations ({toolNames.length})
              </h4>
              <span className="text-xs text-gray-400">
                Live Apollo Backend APIs
              </span>
            </div>

            {toolNames.length === 0 ? (
              <p className="text-xs text-gray-400 italic">
                No tools were invoked during this execution.
              </p>
            ) : (
              <div className="space-y-3">
                {toolNames.map((toolName) => {
                  const tool = toolExecutions[toolName];
                  if (!tool) return null;
                  const isNotImplemented = tool.status === "NOT_IMPLEMENTED";

                  return (
                    <div
                      key={toolName}
                      className={`rounded-lg border p-4 text-xs ${
                        isNotImplemented
                          ? "border-amber-200 bg-amber-50/50"
                          : "border-gray-200 bg-white shadow-2xs"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Layers className="h-4 w-4 text-indigo-600" />
                          <span className="font-semibold text-gray-900 font-mono">
                            {toolName}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-gray-600 font-mono">
                            <Database className="mr-1 h-3 w-3 text-gray-400" />
                            {tool.source}
                          </span>
                          {isNotImplemented ? (
                            <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                              NOT_IMPLEMENTED
                            </span>
                          ) : (
                            <span className="rounded bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">
                              SUCCESS
                            </span>
                          )}
                        </div>
                      </div>

                      {tool.endpoint && (
                        <p className="mt-1.5 text-gray-500">
                          Backend Endpoint:{" "}
                          <span className="font-mono text-gray-800">
                            {tool.endpoint}
                          </span>
                        </p>
                      )}

                      {/* Display summary counts */}
                      <div className="mt-2.5 flex flex-wrap gap-2 text-xs">
                        {tool.items_count !== undefined && (
                          <span className="rounded bg-indigo-50 px-2 py-1 text-indigo-700 font-medium">
                            Menu Items: {tool.items_count}
                          </span>
                        )}
                        {tool.modifier_groups_count !== undefined && (
                          <span className="rounded bg-indigo-50 px-2 py-1 text-indigo-700 font-medium">
                            Modifier Groups: {tool.modifier_groups_count}
                          </span>
                        )}
                        {tool.active_orders_count !== undefined && (
                          <span className="rounded bg-indigo-50 px-2 py-1 text-indigo-700 font-medium">
                            Active Tickets: {tool.active_orders_count}
                          </span>
                        )}
                        {tool.dining_areas_count !== undefined && (
                          <span className="rounded bg-indigo-50 px-2 py-1 text-indigo-700 font-medium">
                            Dining Areas: {tool.dining_areas_count}
                          </span>
                        )}
                        {tool.tables_count !== undefined && (
                          <span className="rounded bg-indigo-50 px-2 py-1 text-indigo-700 font-medium">
                            Tables: {tool.tables_count}
                          </span>
                        )}
                        {tool.total_staff_count !== undefined && (
                          <span className="rounded bg-indigo-50 px-2 py-1 text-indigo-700 font-medium">
                            Staff Records: {tool.total_staff_count}
                          </span>
                        )}
                      </div>

                      {/* Controlled message for unbacked modules */}
                      {isNotImplemented && tool.message && (
                        <div className="mt-2 rounded border border-amber-200 bg-amber-100/60 p-2.5 text-amber-900">
                          <p className="font-medium">
                            Backend Implementation Note:
                          </p>
                          <p className="mt-0.5">{tool.message}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Collapsible Raw JSON Viewer */}
          <div>
            <button
              onClick={() => setShowRawJson(!showRawJson)}
              className="flex items-center space-x-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900"
            >
              {showRawJson ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              <span>Raw Execution JSON</span>
            </button>
            {showRawJson && (
              <pre className="mt-2 max-h-64 overflow-x-auto rounded-lg bg-gray-900 p-4 font-mono text-[11px] text-gray-200">
                {JSON.stringify(execution, null, 2)}
              </pre>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-gray-50 px-6 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 shadow-2xs hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
