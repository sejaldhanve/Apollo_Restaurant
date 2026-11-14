import { env } from "./env";
import { useAuthStore } from "../stores/authStore";
import type {
  AgentHealthResponse,
  AgentListResponse,
  ExecuteTaskRequest,
  ExecuteTaskResponse,
  ExecutionDetailResponse,
} from "../types/agent";

export class AgentApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = "AGENT_API_ERROR",
    public details?: unknown,
  ) {
    super(message);
    this.name = "AgentApiError";
  }
}

function getAgentBaseUrl(): string {
  if (env.VITE_AGENT_API_URL && env.VITE_AGENT_API_URL.trim()) {
    // If user provided a base URL (e.g. http://127.0.0.1:8000)
    const base = env.VITE_AGENT_API_URL.replace(/\/+$/, "");
    return base.endsWith("/api/v1/agents") ? base : `${base}/api/v1/agents`;
  }
  // Default to relative proxy path
  return "/api/v1/agents";
}

interface AgentRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  locationId?: string;
  skipAuth?: boolean;
}

async function agentRequest<T>(
  path: string,
  options: AgentRequestOptions = {},
): Promise<T> {
  const {
    body,
    locationId,
    skipAuth,
    headers: customHeaders,
    ...rest
  } = options;
  const baseUrl = getAgentBaseUrl();
  const endpoint = path.startsWith("/") ? path : `/${path}`;
  const url = `${baseUrl}${endpoint}`;

  const authState = useAuthStore.getState();
  const token = authState.accessToken;
  const orgId = authState.currentOrgId;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token && !skipAuth ? { Authorization: `Bearer ${token}` } : {}),
    ...(orgId ? { "x-organization-id": orgId } : {}),
    ...(locationId ? { "x-location-id": locationId } : {}),
    ...((customHeaders as Record<string, string>) || {}),
  };

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (networkErr) {
    throw new AgentApiError(
      0,
      `Failed to connect to AI Agent service at ${baseUrl}. Ensure the FastAPI service is active on port 8000.`,
      "NETWORK_ERROR",
      networkErr,
    );
  }

  const rawText = await response.text();
  let json: any = null;
  if (rawText && rawText.trim()) {
    try {
      json = JSON.parse(rawText);
    } catch {
      json = null;
    }
  }

  if (!response.ok) {
    const errorDetail =
      (json && (json.detail || json.message || json.error)) ||
      `Request failed with status ${response.status} (${response.statusText})`;
    throw new AgentApiError(
      response.status,
      typeof errorDetail === "string"
        ? errorDetail
        : JSON.stringify(errorDetail),
      `HTTP_${response.status}`,
      json,
    );
  }

  return json as T;
}

export const agentApi = {
  /**
   * Fetch health and LLM provider configuration status.
   */
  async getHealth(): Promise<AgentHealthResponse> {
    return agentRequest<AgentHealthResponse>("/health", { skipAuth: true });
  },

  /**
   * Fetch registered AI agents from registry.
   */
  async listAgents(): Promise<AgentListResponse> {
    return agentRequest<AgentListResponse>("", { method: "GET" });
  },

  /**
   * Execute an agent task.
   */
  async executeTask(
    payload: ExecuteTaskRequest,
    locationId?: string,
  ): Promise<ExecuteTaskResponse> {
    const authState = useAuthStore.getState();
    const resolvedOrgId =
      payload.organization_id || authState.currentOrgId || undefined;
    const resolvedLocId = payload.location_id || locationId || undefined;

    return agentRequest<ExecuteTaskResponse>("/execute", {
      method: "POST",
      body: {
        ...payload,
        organization_id: resolvedOrgId,
        location_id: resolvedLocId,
      },
      locationId: resolvedLocId,
    });
  },

  /**
   * Fetch details of a specific execution by ID.
   */
  async getExecution(
    executionId: string,
    locationId?: string,
  ): Promise<ExecutionDetailResponse> {
    return agentRequest<ExecutionDetailResponse>(`/executions/${executionId}`, {
      method: "GET",
      locationId,
    });
  },
};
