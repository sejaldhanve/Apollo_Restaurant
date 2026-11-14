import React, { useState } from "react";
import type { TaskExecution } from "../../../types/agent";
import { agentApi, AgentApiError } from "../../../lib/agent-api";
import {
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  PlayCircle,
  ArrowRight,
  Database,
} from "lucide-react";

interface HistoryTabProps {
  sessionExecutions: TaskExecution[];
  onSelectExecution: (execution: TaskExecution) => void;
  onNavigateToRun: () => void;
}

export function HistoryTab({
  sessionExecutions,
  onSelectExecution,
  onNavigateToRun,
}: HistoryTabProps) {
  const [lookupId, setLookupId] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupId.trim()) return;

    setIsSearching(true);
    setLookupError(null);
    try {
      const res = await agentApi.getExecution(lookupId.trim());
      if (res && res.execution) {
        onSelectExecution(res.execution);
      } else {
        setLookupError(`Execution '${lookupId}' returned empty result.`);
      }
    } catch (err) {
      if (err instanceof AgentApiError) {
        setLookupError(err.message);
      } else {
        setLookupError(
          (err as Error).message || "Failed to retrieve execution record.",
        );
      }
    } finally {
      setIsSearching(false);
    }
  };

  const calculateDuration = (created: string, completed?: string | null) => {
    if (!completed) return "N/A";
    const start = new Date(created).getTime();
    const end = new Date(completed).getTime();
    const diffMs = end - start;
    if (isNaN(diffMs) || diffMs < 0) return "N/A";
    if (diffMs < 1000) return `${diffMs} ms`;
    return `${(diffMs / 1000).toFixed(2)} s`;
  };

  return (
    <div className="space-y-6">
      {/* 1. Execution Lookup by ID (Backend Authoritative Query) */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs">
        <div className="max-w-2xl">
          <h3 className="text-sm font-bold text-gray-900">
            Query Execution by ID
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Query the authoritative AI Agent service backend directly via{" "}
            <code className="font-mono bg-gray-100 px-1 py-0.5 rounded text-gray-800">
              GET /api/v1/agents/executions/&#123;id&#125;
            </code>
            . Enforces strict tenant isolation and returns full execution state.
          </p>

          <form onSubmit={handleLookup} className="mt-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Enter execution identifier (e.g., exec_d94ab62f3b80)..."
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-4 py-2 font-mono text-xs text-gray-900 shadow-2xs placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching || !lookupId.trim()}
              className="inline-flex items-center space-x-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSearching ? (
                <>
                  <Clock className="h-3.5 w-3.5 animate-spin" />
                  <span>Querying...</span>
                </>
              ) : (
                <span>Fetch Execution</span>
              )}
            </button>
          </form>

          {lookupError && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{lookupError}</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Honest Backend Limitation Notice */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 text-xs text-amber-900 shadow-2xs">
        <div className="flex items-start space-x-3">
          <Database className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1.5">
            <h4 className="font-bold text-amber-950">
              Backend Execution Storage Architecture Note
            </h4>
            <p className="leading-relaxed text-amber-800">
              The AI Agent FastAPI service currently implements an in-memory
              execution store (
              <code className="font-mono bg-amber-100/70 px-1 py-0.5 rounded text-amber-950">
                InMemoryExecutionStorage
              </code>
              ). The backend provides single-record retrieval via{" "}
              <code className="font-mono bg-amber-100/70 px-1 py-0.5 rounded text-amber-950">
                GET /api/v1/agents/executions/&#123;id&#125;
              </code>
              , but does not yet expose a global/tenant-wide collection listing
              endpoint.
            </p>
            <p className="font-medium text-amber-900">
              Proposed Backend Extension for Phase 3 Module 4: Expose{" "}
              <code className="font-mono bg-amber-100/70 px-1 py-0.5 rounded text-amber-950">
                GET /api/v1/agents/executions?limit=50&amp;cursor=...
              </code>{" "}
              backed by PostgreSQL persistence to support cross-restart audit
              logs. In the meantime, all executions launched within this session
              are tracked below.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Session Execution History Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-xs overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Active Session Executions ({sessionExecutions.length})
            </h3>
            <p className="text-xs text-gray-500">
              Authoritative records captured from task executions run in this
              browser session
            </p>
          </div>
          <button
            onClick={onNavigateToRun}
            className="inline-flex items-center space-x-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700"
          >
            <PlayCircle className="h-3.5 w-3.5" />
            <span>New Task</span>
          </button>
        </div>

        {sessionExecutions.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <FileText className="h-10 w-10 text-gray-300 mb-3" />
            <h4 className="text-sm font-semibold text-gray-800">
              No Executions Recorded in Current Session
            </h4>
            <p className="mt-1 max-w-sm text-xs text-gray-500">
              Submit an agent task in the "Run an Agent" tab or search by ID
              above to view authoritative backend execution details.
            </p>
            <button
              onClick={onNavigateToRun}
              className="mt-4 inline-flex items-center space-x-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700"
            >
              <span>Go to Task Runner</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-gray-200 bg-gray-50/75 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-6 py-3">Execution ID</th>
                  <th className="px-6 py-3">Agent</th>
                  <th className="px-6 py-3">Task Prompt</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Duration</th>
                  <th className="px-6 py-3">Timestamp</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessionExecutions.map((exec) => (
                  <tr
                    key={exec.execution_id}
                    onClick={() => onSelectExecution(exec)}
                    className="cursor-pointer transition hover:bg-gray-50/80"
                  >
                    <td className="whitespace-nowrap px-6 py-3 font-mono font-medium text-gray-900">
                      {exec.execution_id}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 font-medium text-gray-800">
                      {exec.result?.agent_name || exec.agent_id}
                    </td>
                    <td className="max-w-xs truncate px-6 py-3 text-gray-600">
                      {exec.task}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          exec.status === "COMPLETED"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : exec.status === "FAILED"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-blue-50 text-blue-700 border border-blue-200"
                        }`}
                      >
                        {exec.status === "COMPLETED" ? (
                          <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-600" />
                        ) : exec.status === "FAILED" ? (
                          <AlertCircle className="mr-1 h-3 w-3 text-rose-600" />
                        ) : (
                          <Clock className="mr-1 h-3 w-3 text-blue-600 animate-spin" />
                        )}
                        {exec.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 font-mono text-gray-600">
                      {calculateDuration(exec.created_at, exec.completed_at)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-gray-500">
                      {new Date(exec.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectExecution(exec);
                        }}
                        className="font-semibold text-indigo-600 hover:text-indigo-800"
                      >
                        Details →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
