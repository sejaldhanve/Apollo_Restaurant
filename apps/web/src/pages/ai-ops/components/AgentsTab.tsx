import { useState } from "react";
import type { AgentMetadata } from "../../../types/agent";
import {
  Bot,
  CheckCircle2,
  Clock,
  PlayCircle,
  Layers,
  Search,
  AlertCircle,
} from "lucide-react";

interface AgentsTabProps {
  agents: AgentMetadata[];
  isLoading: boolean;
  onLaunchAgent: (agentId: string) => void;
}

export function AgentsTab({
  agents,
  isLoading,
  onLaunchAgent,
}: AgentsTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  const filteredAgents = agents.filter((agent) => {
    const matchesSearch =
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.agent_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === "ALL" || agent.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = [
    { id: "ALL", label: "All Agents" },
    { id: "GENERAL", label: "General" },
    { id: "FRONT_OF_HOUSE", label: "Front of House" },
    { id: "BACK_OF_HOUSE", label: "Back of House" },
    { id: "INVENTORY", label: "Inventory" },
    { id: "WORKFORCE", label: "Workforce & Labor" },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner Explaining Agent Architecture */}
      <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-6 shadow-xs md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-900">
            Registered AI Restaurant Agents
          </h3>
          <p className="mt-1 text-xs text-gray-600 max-w-2xl leading-relaxed">
            Apollo Restaurant OS defines specialized domain agents coordinated
            by a centralized LangGraph orchestrator. To preserve operational
            integrity, only fully implemented agents can execute autonomous
            tasks. Architecture placeholders remain in development.
          </p>
        </div>
        <div className="flex shrink-0 items-center space-x-3 text-xs">
          <div className="flex items-center space-x-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-medium text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>1 Active Implemented</span>
          </div>
          <div className="flex items-center space-x-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 font-medium text-amber-800">
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            <span>4 Roadmap Placeholders</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search agents by name, ID or capability..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-4 py-2 text-xs text-gray-900 shadow-2xs placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                selectedCategory === cat.id
                  ? "bg-indigo-600 text-white shadow-2xs"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Agents Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-xl border border-gray-200 bg-white p-6 shadow-xs"
            />
          ))}
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-12 text-center shadow-xs">
          <Bot className="h-8 w-8 text-gray-300 mb-2" />
          <p className="text-sm font-semibold text-gray-700">
            No matching agents found
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Try adjusting your search terms or category filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {filteredAgents.map((agent) => {
            const isImplemented = agent.is_implemented;

            return (
              <div
                key={agent.agent_id}
                className={`flex flex-col justify-between rounded-xl border p-6 transition shadow-xs ${
                  isImplemented
                    ? "border-emerald-200 bg-white ring-1 ring-emerald-50 hover:border-emerald-300"
                    : "border-gray-200 bg-white/80 hover:border-gray-300"
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start space-x-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          isImplemented
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        <Bot className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900 leading-snug">
                          {agent.name}
                        </h4>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[11px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            {agent.agent_id}
                          </span>
                          <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                            {agent.category}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status Pill */}
                    <div>
                      {isImplemented ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-emerald-600" />
                          Ready
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                          <Clock className="mr-1 h-3.5 w-3.5 text-amber-600" />
                          Roadmap
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <p className="mt-3.5 text-xs text-gray-600 leading-relaxed">
                    {agent.description}
                  </p>

                  {/* Roadmap disclaimer for placeholders */}
                  {!isImplemented && (
                    <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/70 p-2.5 text-[11px] text-amber-800 flex items-start space-x-2">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                      <span>
                        Architecture Specification: Specialist LangGraph logic
                        is scheduled for future modules. This placeholder cannot
                        execute autonomous workflows yet.
                      </span>
                    </div>
                  )}

                  {/* Registered Tools */}
                  <div className="mt-4">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                      Permitted Tools ({agent.registered_tools.length})
                    </span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {agent.registered_tools.map((tool) => (
                        <span
                          key={tool}
                          className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 font-mono text-[11px] text-gray-700"
                        >
                          <Layers className="mr-1 h-3 w-3 text-gray-400" />
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Supported Tasks */}
                  <div className="mt-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                      Domain Capabilities
                    </span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {agent.supported_tasks.map((task) => (
                        <span
                          key={task}
                          className="rounded bg-indigo-50/60 px-2 py-0.5 text-[10px] font-medium text-indigo-700"
                        >
                          #{task}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {isImplemented
                      ? "Ready for task submission"
                      : "Disabled in current phase"}
                  </span>

                  {isImplemented ? (
                    <button
                      onClick={() => onLaunchAgent(agent.agent_id)}
                      className="inline-flex items-center space-x-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
                    >
                      <PlayCircle className="h-3.5 w-3.5" />
                      <span>Launch Task</span>
                    </button>
                  ) : (
                    <button
                      disabled
                      className="cursor-not-allowed rounded-lg border border-gray-200 bg-gray-100 px-3.5 py-1.5 text-xs font-medium text-gray-400"
                      title="Placeholder agent cannot be executed yet"
                    >
                      Not Executable
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
