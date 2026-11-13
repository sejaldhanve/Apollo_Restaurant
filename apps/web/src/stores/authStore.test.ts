import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuthStore } from "./authStore";

describe("authStore — Response Parsing & Error Robustness", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      organizations: [],
      currentOrgId: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
    vi.restoreAllMocks();
  });

  it("1. Successful Login: parses valid JSON response and populates user, tokens, and currentOrgId", async () => {
    const mockSuccessResponse = {
      success: true,
      data: {
        user: {
          id: "u-123",
          email: "chef@bistroalpha.com",
          firstName: "Auguste",
          lastName: "Gusteau",
          status: "ACTIVE",
          emailVerified: true,
        },
        tokens: {
          accessToken: "valid.jwt.access",
          refreshToken: "valid-refresh-token",
          expiresIn: 900,
        },
        organizations: [
          {
            membershipId: "m-1",
            organizationId: "org-1",
            organizationName: "Gusteau Group",
            organizationSlug: "gusteau-group",
            roleName: "Owner",
            permissions: ["org:manage"],
            locationMemberships: [],
          },
        ],
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(mockSuccessResponse)),
    } as any);

    await useAuthStore.getState().login({
      email: "chef@bistroalpha.com",
      password: "CorrectPassword123!",
    });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.email).toBe("chef@bistroalpha.com");
    expect(state.accessToken).toBe("valid.jwt.access");
    expect(state.refreshToken).toBe("valid-refresh-token");
    expect(state.currentOrgId).toBe("org-1");
    expect(state.error).toBeNull();
    expect(localStorage.getItem("apollo_access_token")).toBe("valid.jwt.access");
  });

  it("2. Incorrect Password: extracts backend 401 error message without crashing", async () => {
    const mockErrorResponse = {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid email or password",
      },
      requestId: "req-err-1",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify(mockErrorResponse)),
    } as any);

    await expect(
      useAuthStore.getState().login({
        email: "chef@bistroalpha.com",
        password: "WrongPassword!",
      }),
    ).rejects.toThrow("Invalid email or password");

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.error).toBe("Invalid email or password");
  });

  it("3. Unknown Email: extracts identical 401 generic message", async () => {
    const mockErrorResponse = {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid email or password",
      },
      requestId: "req-err-2",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify(mockErrorResponse)),
    } as any);

    await expect(
      useAuthStore.getState().login({
        email: "ghost@nowhere.com",
        password: "SomePassword!",
      }),
    ).rejects.toThrow("Invalid email or password");

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.error).toBe("Invalid email or password");
  });

  it("4. Empty Response (0-byte / 504 / 502): handles gracefully without 'Unexpected end of JSON input'", async () => {
    // Simulates an empty proxy response or dropped connection
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 504,
      statusText: "Gateway Timeout",
      text: () => Promise.resolve(""), // Empty body!
    } as any);

    await expect(
      useAuthStore.getState().login({
        email: "chef@bistroalpha.com",
        password: "AnyPassword1!",
      }),
    ).rejects.toThrow(/Authentication failed \(504 Gateway Timeout\)/);

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    // CRITICAL: Ensure the error is clean and never says "Unexpected end of JSON input"
    expect(state.error).not.toContain("Unexpected end of JSON input");
    expect(state.error).toContain("Authentication failed (504 Gateway Timeout)");
  });

  it("5. Non-JSON / HTML Response: handles gracefully without crashing JSON parser", async () => {
    // Simulates upstream Nginx or gateway returning an HTML 502 page
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      text: () => Promise.resolve("<html><body>502 Bad Gateway</body></html>"),
    } as any);

    await expect(
      useAuthStore.getState().login({
        email: "chef@bistroalpha.com",
        password: "AnyPassword1!",
      }),
    ).rejects.toThrow(/Authentication failed \(502 Bad Gateway\)/);

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.error).not.toContain("Unexpected token");
    expect(state.error).toContain("Authentication failed (502 Bad Gateway)");
  });
});

