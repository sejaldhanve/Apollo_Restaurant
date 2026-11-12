import { env } from "./env";
import { useAuthStore } from "../stores/authStore";
import type { ApiErrorResponse } from "@apollo/shared-types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = "API_ERROR",
    public data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  skipAuth?: boolean;
}

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${env.VITE_API_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return null;
    const body = await res.json();
    if (!body.success || !body.data?.accessToken) return null;

    const newAccessToken = body.data.accessToken as string;
    const newRefreshToken = body.data.refreshToken as string;

    localStorage.setItem("apollo_access_token", newAccessToken);
    localStorage.setItem("apollo_refresh_token", newRefreshToken);

    useAuthStore.setState({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });

    return newAccessToken;
  } catch {
    return null;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, headers: customHeaders, skipAuth, ...rest } = options;

  const authState = useAuthStore.getState();
  const token = authState.accessToken;
  const orgId = authState.currentOrgId;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token && !skipAuth ? { Authorization: `Bearer ${token}` } : {}),
    ...(orgId ? { "X-Organization-Id": orgId } : {}),
    ...customHeaders,
  };

  const config: RequestInit = {
    ...rest,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  };

  const response = await fetch(`${env.VITE_API_URL}${endpoint}`, config);

  // Handle 401 Unauthorized with token refresh
  if (response.status === 401 && !skipAuth && authState.refreshToken) {
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await refreshAccessToken();
      isRefreshing = false;

      if (newToken) {
        onRefreshed(newToken);
        // Retry the original failed request with the new access token
        return request<T>(endpoint, {
          ...options,
          headers: { ...customHeaders, Authorization: `Bearer ${newToken}` },
        });
      } else {
        // Refresh token invalid or expired — log out user
        await authState.logout();
      }
    } else {
      // Queue requests until refresh completes
      return new Promise<T>((resolve) => {
        refreshSubscribers.push((newToken: string) => {
          resolve(
            request<T>(endpoint, {
              ...options,
              headers: {
                ...customHeaders,
                Authorization: `Bearer ${newToken}`,
              },
            }),
          );
        });
      });
    }
  }

  if (!response.ok) {
    const errorData = (await response
      .json()
      .catch(() => null)) as ApiErrorResponse | null;
    const errorMessage =
      errorData?.error?.message ||
      `Request failed with status ${response.status}`;
    const errorCode = errorData?.error?.code || "HTTP_ERROR";

    throw new ApiError(response.status, errorMessage, errorCode, errorData);
  }

  if (response.status === 204) return undefined as T;

  const json = await response.json();
  return json.data !== undefined ? json.data : json;
}

export const apiClient = {
  get: <T>(ep: string, opts?: RequestOptions) =>
    request<T>(ep, { ...opts, method: "GET" }),
  post: <T>(ep: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(ep, { ...opts, method: "POST", body }),
  put: <T>(ep: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(ep, { ...opts, method: "PUT", body }),
  patch: <T>(ep: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(ep, { ...opts, method: "PATCH", body }),
  delete: <T>(ep: string, opts?: RequestOptions) =>
    request<T>(ep, { ...opts, method: "DELETE" }),
};
