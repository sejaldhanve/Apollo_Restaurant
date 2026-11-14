export type AgentCategory =
  "FRONT_OF_HOUSE" | "BACK_OF_HOUSE" | "INVENTORY" | "WORKFORCE" | "GENERAL";

export type ExecutionStatus =
  "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface AgentMetadata {
  agent_id: string;
  name: string;
  description: string;
  category: AgentCategory;
  enabled: boolean;
  is_implemented: boolean;
  supported_tasks: string[];
  registered_tools: string[];
}

export interface AgentListResponse {
  agents: AgentMetadata[];
  total_count: number;
  message: string;
}

export interface LlmHealthInfo {
  provider: string;
  model: string;
  configured: boolean;
  status: string;
  endpoint?: string;
}

export interface AgentHealthResponse {
  status: string;
  version: string;
  environment: string;
  timestamp: string;
  llm: LlmHealthInfo;
}

export interface ToolExecutionRecord {
  source: string;
  endpoint?: string;
  organization_id?: string;
  location_id?: string;
  retrieved_at?: string;
  status?: string;
  message?: string;
  data?: unknown;
  items_count?: number;
  modifier_groups_count?: number;
  active_orders_count?: number;
  dining_areas_count?: number;
  tables_count?: number;
  occupied_tables_count?: number;
  total_staff_count?: number;
  [key: string]: unknown;
}

export interface TaskExecutionResult {
  orchestrator: string;
  agent_id: string;
  agent_name: string;
  category: string;
  task: string;
  tenant_organization_id: string;
  tenant_location_id: string;
  executed_by_user: string;
  user_role: string;
  tool_executions: Record<string, ToolExecutionRecord>;
  message?: string;
  [key: string]: unknown;
}

export interface TaskExecution {
  execution_id: string;
  agent_id: string;
  task: string;
  status: ExecutionStatus;
  organization_id: string;
  location_id: string;
  user_id: string;
  session_id?: string | null;
  parameters: Record<string, unknown>;
  result?: TaskExecutionResult | null;
  error?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface ExecuteTaskRequest {
  task: string;
  agent_id?: string;
  organization_id?: string;
  location_id?: string;
  session_id?: string;
  parameters?: Record<string, unknown>;
}

export interface ExecuteTaskResponse {
  execution_id: string;
  agent_id: string;
  status: ExecutionStatus;
  message: string;
  result?: TaskExecutionResult | null;
  error?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface ExecutionDetailResponse {
  execution: TaskExecution;
}
