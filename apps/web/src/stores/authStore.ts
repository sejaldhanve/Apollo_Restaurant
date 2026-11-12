import { create } from "zustand";
import type {
  AuthUser,
  OrgMembershipInfo,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  ApiSuccessResponse,
  ApiErrorResponse,
} from "@apollo/shared-types";
import { env } from "../lib/env";

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  organizations: OrgMembershipInfo[];
  currentOrgId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (credentials: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  selectOrg: (organizationId: string) => void;
  initAuth: () => Promise<void>;
  clearError: () => void;
}

const ACCESS_TOKEN_KEY = "apollo_access_token";
const REFRESH_TOKEN_KEY = "apollo_refresh_token";
const CURRENT_ORG_KEY = "apollo_current_org_id";

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: localStorage.getItem(ACCESS_TOKEN_KEY),
  refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY),
  organizations: [],
  currentOrgId: localStorage.getItem(CURRENT_ORG_KEY),
  isAuthenticated: false,
  isLoading: true,
  error: null,

  clearError: () => set({ error: null }),

  selectOrg: (organizationId: string) => {
    localStorage.setItem(CURRENT_ORG_KEY, organizationId);
    set({ currentOrgId: organizationId });
  },

  login: async (credentials: LoginRequest) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${env.VITE_API_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      const body = (await response.json()) as
        ApiSuccessResponse<AuthResponse> | ApiErrorResponse;

      if (!response.ok || !body.success) {
        const errorMsg =
          !body.success && body.error?.message
            ? body.error.message
            : "Authentication failed";
        throw new Error(errorMsg);
      }

      const { user, tokens, organizations } = body.data;
      const primaryOrgId = organizations[0]?.organizationId ?? null;

      localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      if (primaryOrgId) {
        localStorage.setItem(CURRENT_ORG_KEY, primaryOrgId);
      }

      set({
        user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        organizations,
        currentOrgId: primaryOrgId,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      set({
        isLoading: false,
        error:
          (err as Error).message || "An unexpected error occurred during login",
      });
      throw err;
    }
  },

  register: async (payload: RegisterRequest) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${env.VITE_API_URL}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as
        ApiSuccessResponse<AuthResponse> | ApiErrorResponse;

      if (!response.ok || !body.success) {
        const errorMsg =
          !body.success && body.error?.message
            ? body.error.message
            : "Registration failed";
        throw new Error(errorMsg);
      }

      const { user, tokens, organizations } = body.data;
      const primaryOrgId = organizations[0]?.organizationId ?? null;

      localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
      if (primaryOrgId) {
        localStorage.setItem(CURRENT_ORG_KEY, primaryOrgId);
      }

      set({
        user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        organizations,
        currentOrgId: primaryOrgId,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: (err as Error).message || "Registration failed",
      });
      throw err;
    }
  },

  logout: async () => {
    const { accessToken, refreshToken } = get();

    if (accessToken) {
      try {
        await fetch(`${env.VITE_API_URL}/api/v1/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // Non-blocking logout failure
      }
    }

    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(CURRENT_ORG_KEY);

    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      organizations: [],
      currentOrgId: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  },

  initAuth: async () => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }

    try {
      const response = await fetch(`${env.VITE_API_URL}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("Session expired");
      }

      const body = await response.json();
      if (!body.success) throw new Error("Invalid response");

      const savedOrgId = localStorage.getItem(CURRENT_ORG_KEY);
      const activeOrgId =
        savedOrgId &&
        body.data.memberships.some(
          (m: OrgMembershipInfo) => m.organizationId === savedOrgId,
        )
          ? savedOrgId
          : (body.data.memberships[0]?.organizationId ?? null);

      set({
        user: body.data.user,
        organizations: body.data.memberships,
        currentOrgId: activeOrgId,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      // Clear invalid session
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },
}));
