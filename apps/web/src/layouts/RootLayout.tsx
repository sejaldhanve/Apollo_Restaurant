import { Outlet, useNavigate } from "react-router";
import { useAuthStore } from "../stores/authStore";
import { OrgSelector } from "../components/auth/OrgSelector";
import { LogOut, UserCircle2, UtensilsCrossed } from "lucide-react";

export function RootLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-6 py-3.5 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
                <UtensilsCrossed className="h-4 w-4" />
              </div>
              <h1 className="text-lg font-bold tracking-tight text-indigo-600">
                Apollo Restaurant OS
              </h1>
            </div>
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              v0.1.0-alpha
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <OrgSelector />

            {user && (
              <div className="flex items-center space-x-2 border-l border-gray-200 pl-4 text-xs">
                <UserCircle2 className="h-5 w-5 text-gray-400" />
                <span className="font-medium text-gray-700">
                  {user.firstName} {user.lastName}
                </span>
              </div>
            )}

            <button
              onClick={handleLogout}
              className="flex items-center space-x-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 shadow-2xs transition hover:bg-gray-50 hover:text-red-600 focus:outline-none"
              title="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
