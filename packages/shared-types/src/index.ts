export interface HealthCheckResponse {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  environment: string;
  timestamp: string;
  services?: Record<string, ServiceHealth>;
}

export interface ServiceHealth {
  status: "up" | "down" | "degraded";
  latencyMs?: number;
  message?: string;
}

export interface TenantEntity {
  id: string;
  organizationId: string;
  locationId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiErrorResponse {
  success: false;
  error: { code: string; message: string; details?: unknown };
  requestId?: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: { page?: number; pageSize?: number; total?: number };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
