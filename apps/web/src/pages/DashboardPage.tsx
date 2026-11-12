import { useHealthCheck } from "@/hooks/useHealthCheck";

export function DashboardPage() {
  const { data, isLoading, isError } = useHealthCheck();

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-6 text-2xl font-semibold">Dashboard</h2>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-medium">System Status</h3>
        {isLoading && <p className="text-gray-500">Checking API health...</p>}
        {isError && (
          <p className="text-amber-600">
            API unreachable. Ensure backend runs on port 3001.
          </p>
        )}
        {data && (
          <div className="space-y-2">
            <p>
              <span className="font-medium">Status:</span>{" "}
              <span className="text-green-600">{data.status}</span>
            </p>
            <p>
              <span className="font-medium">Environment:</span>{" "}
              {data.environment}
            </p>
            <p>
              <span className="font-medium">Version:</span> {data.version}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
