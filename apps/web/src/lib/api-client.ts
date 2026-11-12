import { env } from "./env";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, headers: customHeaders, ...rest } = options;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...customHeaders,
  };
  const config: RequestInit = {
    ...rest,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const response = await fetch(`${env.VITE_API_URL}${endpoint}`, config);
  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      errorData?.message || `Request failed: ${response.status}`,
      errorData,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json();
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
