import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h2 className="mb-2 text-6xl font-bold text-gray-300">404</h2>
      <p className="mb-6 text-gray-600">Page not found</p>
      <Link
        to="/"
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
