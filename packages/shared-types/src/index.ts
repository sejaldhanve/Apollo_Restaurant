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

// === Phase 1: Auth & Domain Types ===

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  emailVerified: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
  organizations: OrgMembershipInfo[];
}

export interface OrgMembershipInfo {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
  permissions: string[];
}

export interface MeResponse {
  user: AuthUser;
  memberships: OrgMembershipInfo[];
}
