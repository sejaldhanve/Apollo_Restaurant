import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuthStore } from "../stores/authStore";
import {
  Lock,
  Mail,
  Building2,
  User,
  AlertCircle,
  ArrowRight,
} from "lucide-react";

const registerSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required"),
    lastName: z.string().trim().min(1, "Last name is required"),
    organizationName: z
      .string()
      .trim()
      .min(2, "Organization name must be at least 2 characters"),
    email: z.string().trim().email("Please enter a valid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must include at least one uppercase letter")
      .regex(/[a-z]/, "Must include at least one lowercase letter")
      .regex(/[0-9]/, "Must include at least one number"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const { register: registerOrg, error, clearError } = useAuthStore();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormData) => {
    clearError();
    setSubmitting(true);
    try {
      await registerOrg({
        firstName: data.firstName,
        lastName: data.lastName,
        organizationName: data.organizationName,
        email: data.email,
        password: data.password,
      });
      navigate("/", { replace: true });
    } catch {
      // Error handled in store
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h3 className="text-xl font-bold text-white">Register Organization</h3>
        <p className="mt-1 text-sm text-slate-400">
          Initialize your restaurant operating platform
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
            Restaurant Organization
          </label>
          <div className="relative mt-1.5 rounded-lg shadow-sm">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Building2 className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              {...register("organizationName")}
              className="block w-full rounded-lg border border-slate-600 bg-slate-900/50 py-2.5 pr-3 pl-10 text-sm text-white placeholder-slate-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="e.g. Gusteau Hospitality Group"
            />
          </div>
          {errors.organizationName && (
            <p className="mt-1.5 text-xs text-red-400">
              {errors.organizationName.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              First Name
            </label>
            <div className="relative mt-1.5 rounded-lg shadow-sm">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <User className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                {...register("firstName")}
                className="block w-full rounded-lg border border-slate-600 bg-slate-900/50 py-2.5 pr-3 pl-10 text-sm text-white placeholder-slate-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="Auguste"
              />
            </div>
            {errors.firstName && (
              <p className="mt-1.5 text-xs text-red-400">
                {errors.firstName.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Last Name
            </label>
            <div className="relative mt-1.5 rounded-lg shadow-sm">
              <input
                type="text"
                {...register("lastName")}
                className="block w-full rounded-lg border border-slate-600 bg-slate-900/50 py-2.5 px-3 text-sm text-white placeholder-slate-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="Gusteau"
              />
            </div>
            {errors.lastName && (
              <p className="mt-1.5 text-xs text-red-400">
                {errors.lastName.message}
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
            Work Email Address
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
              placeholder="owner@gusteau.com"
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
            Master Password
          </label>
          <div className="relative mt-1.5 rounded-lg shadow-sm">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Lock className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="password"
              autoComplete="new-password"
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

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
            Confirm Password
          </label>
          <div className="relative mt-1.5 rounded-lg shadow-sm">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Lock className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="password"
              autoComplete="new-password"
              {...register("confirmPassword")}
              className="block w-full rounded-lg border border-slate-600 bg-slate-900/50 py-2.5 pr-3 pl-10 text-sm text-white placeholder-slate-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="••••••••••••"
            />
          </div>
          {errors.confirmPassword && (
            <p className="mt-1.5 text-xs text-red-400">
              {errors.confirmPassword.message}
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
              <span>Initialize Platform</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-6 border-t border-slate-700/60 pt-5 text-center">
        <p className="text-xs text-slate-400">
          Already registered?{" "}
          <Link
            to="/login"
            className="font-medium text-indigo-400 transition hover:text-indigo-300"
          >
            Sign In to Terminal
          </Link>
        </p>
      </div>
    </div>
  );
}
