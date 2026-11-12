import { useQuery } from "@tanstack/react-query";
import type {
  HealthCheckResponse,
  ApiSuccessResponse,
} from "@apollo/shared-types";

async function fetchHealth(): Promise<HealthCheckResponse> {
  const res = await fetch("/api/v1/health");
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  const json: ApiSuccessResponse<HealthCheckResponse> = await res.json();
  return json.data;
}

export function useHealthCheck() {
  return useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
  });
}
