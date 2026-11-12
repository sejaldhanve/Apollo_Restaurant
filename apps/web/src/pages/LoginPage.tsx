import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "../stores/authStore";
import { Lock, Mail, AlertCircle, ArrowRight } from "lucide-react";

const loginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, error, clearError } = useAuthStore();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    clearError();
    setSubmitting(true);
    try {
      await login(data);
      const from =
        (location.state as { from?: { pathname: string } })?.from?.pathname ||
        "/";
      navigate(from, { replace: true });
    } catch {
      // Error handled in store
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-xl font-bold text-white">Sign In to Terminal</h3>
        <p className="mt-1 text-sm text-slate-400">
          Access your restaurant operations and AI agents
        </p>
      </div>

      {error && (
        <div className="mb-5 flex items-start space-x-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3.5 text-red-400">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm font-medium">{error}</div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
            Email Address
          </label>
          <div className="relative mt-1.5 rounded-lg shadow-sm">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Mail className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="email"
              autoComplete="email"
              {...register("email")}
              className="block w-full rounded-lg border border-slate-600 bg-slate-900/50 py-2.5 pr-3 pl-10 text-sm text-white placeholder-slate-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="manager@bistroalpha.com"
            />
          </div>
          {errors.email && (
            <p className="mt-1.5 text-xs text-red-400">
              {errors.email.message}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
            Password
          </label>
          <div className="relative mt-1.5 rounded-lg shadow-sm">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Lock className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="password"
              autoComplete="current-password"
              {...register("password")}
              className="block w-full rounded-lg border border-slate-600 bg-slate-900/50 py-2.5 pr-3 pl-10 text-sm text-white placeholder-slate-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="••••••••••••"
            />
          </div>
          {errors.password && (
            <p className="mt-1.5 text-xs text-red-400">
              {errors.password.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 flex w-full items-center justify-center space-x-2 rounded-lg bg-indigo-600 py-2.5 px-4 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50"
        >
          {submitting ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
          ) : (
            <>
              <span>Authenticate</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-6 border-t border-slate-700/60 pt-5 text-center">
        <p className="text-xs text-slate-400">
          New restaurant group?{" "}
          <Link
            to="/register"
            className="font-medium text-indigo-400 transition hover:text-indigo-300"
          >
            Register Organization
          </Link>
        </p>
      </div>
    </div>
  );
}
