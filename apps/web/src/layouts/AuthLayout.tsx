import { Outlet } from "react-router";
import { UtensilsCrossed } from "lucide-react";

export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 shadow-xl shadow-indigo-500/20">
            <UtensilsCrossed className="h-8 w-8 text-white" />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-center space-x-2">
          <h2 className="text-center text-3xl font-extrabold tracking-tight text-white">
            Apollo Restaurant OS
          </h2>
          <span className="rounded-full bg-indigo-900/60 px-2.5 py-0.5 text-xs font-medium text-indigo-300">
            v0.1.0-alpha
          </span>
        </div>
        <p className="mt-2 text-center text-sm text-slate-400">
          AI-Native Autonomous Restaurant Operating System
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="border border-slate-700/60 bg-slate-800/80 px-4 py-8 shadow-2xl backdrop-blur-xl sm:rounded-2xl sm:px-10">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
