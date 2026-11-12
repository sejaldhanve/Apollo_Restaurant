import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../../app.js";
import { AuthService } from "./auth.service.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/app-error.js";
import {
  requireOrganizationMembership,
  requirePermission,
  requireLocationAccess,
} from "../../middleware/authorize.js";
import type { Request, Response, NextFunction } from "express";

describe("Authentication Routes & Authorization Middleware", () => {
  const app = createApp();

  const mockUser = {
    id: "user-123",
    email: "chef@bistroalpha.com",
    firstName: "Auguste",
    lastName: "Gusteau",
    status: "ACTIVE",
    emailVerified: true,
  };

  const mockTokens = {
    accessToken: "mock.access.token",
    refreshToken: "mock-refresh-token-1234567890",
    expiresIn: 900,
  };

  const mockOrgMembership = {
    organizationId: "org-123",
    organizationName: "Gusteau Dining Group",
    organizationSlug: "gusteau-dining",
    role: "Owner",
    permissions: ["org:manage", "location:manage", "order:create"],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("POST /api/v1/auth/register", () => {
    it("should return 201 with auth response on successful registration", async () => {
      vi.spyOn(AuthService, "register").mockResolvedValue({
        user: mockUser,
        tokens: mockTokens,
        organizations: [mockOrgMembership],
      });

      const res = await request(app).post("/api/v1/auth/register").send({
        email: "chef@bistroalpha.com",
        password: "SecurePassword2026!",
        firstName: "Auguste",
        lastName: "Gusteau",
        organizationName: "Gusteau Dining Group",
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe("chef@bistroalpha.com");
      expect(res.body.data.tokens.accessToken).toBe(mockTokens.accessToken);
    });

    it("should return 400 when registration payload fails validation", async () => {
      const res = await request(app).post("/api/v1/auth/register").send({
        email: "invalid-email",
        password: "short", // too short, no uppercase/number
        firstName: "",
        lastName: "",
        organizationName: "A", // too short
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("POST /api/v1/auth/login", () => {
    it("should return 200 with tokens on valid credentials", async () => {
      vi.spyOn(AuthService, "login").mockResolvedValue({
        user: mockUser,
        tokens: mockTokens,
        organizations: [mockOrgMembership],
      });

      const res = await request(app).post("/api/v1/auth/login").send({
        email: "chef@bistroalpha.com",
        password: "SecurePassword2026!",
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tokens.refreshToken).toBe(mockTokens.refreshToken);
    });

    it("should return 401 when invalid credentials are provided", async () => {
      vi.spyOn(AuthService, "login").mockRejectedValue(
        AppError.unauthorized("Invalid email or password"),
      );

      const res = await request(app).post("/api/v1/auth/login").send({
        email: "nonexistent@bistroalpha.com",
        password: "WrongPassword1!",
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
      expect(res.body.error.message).toBe("Invalid email or password");
    });
  });

  describe("POST /api/v1/auth/refresh", () => {
    it("should rotate refresh token and return new tokens", async () => {
      const newTokens = {
        accessToken: "new.access.token",
        refreshToken: "new-refresh-token",
        expiresIn: 900,
      };

      vi.spyOn(AuthService, "refreshTokens").mockResolvedValue(newTokens);

      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: "valid-raw-refresh-token" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBe("new.access.token");
    });

    it("should return 400 when refreshToken is missing", async () => {
      const res = await request(app).post("/api/v1/auth/refresh").send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/auth/me", () => {
    it("should return 401 when Authorization header is missing", async () => {
      const res = await request(app).get("/api/v1/auth/me");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("should return 401 when token is invalid or malformed", async () => {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer invalid-garbage-token");

      expect(res.status).toBe(401);
    });

    it("should return 200 with user profile when valid token is presented", async () => {
      const validToken = jwt.sign(
        { sub: mockUser.id, email: mockUser.email, type: "access" },
        env.JWT_SECRET,
        { expiresIn: "15m" },
      );

      vi.spyOn(AuthService, "getMe").mockResolvedValue({
        user: mockUser,
        memberships: [mockOrgMembership],
      });

      // Mock Prisma user lookup inside authenticate middleware
      vi.spyOn(
        (await import("../../db/prisma.js")).prisma.user,
        "findUnique",
      ).mockResolvedValue(mockUser as never);

      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(mockUser.email);
      expect(res.body.data.memberships.length).toBe(1);
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("should return 401 without Bearer token", async () => {
      const res = await request(app).post("/api/v1/auth/logout");
      expect(res.status).toBe(401);
    });
  });

  describe("Authorization & RBAC Middleware Unit Tests", () => {
    it("requirePermission allows Owner role regardless of explicit permission", () => {
      const req = {
        user: mockUser,
        currentMembership: {
          role: "Owner",
          permissions: [],
        },
      } as unknown as Request;
      const res = {} as Response;
      const next = vi.fn() as unknown as NextFunction;

      const middleware = requirePermission("any:permission");
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it("requirePermission rejects member missing required permission", () => {
      const req = {
        user: mockUser,
        currentMembership: {
          role: "Server",
          permissions: ["order:create"],
        },
      } as unknown as Request;
      const res = {} as Response;
      let errorPassed: unknown = null;
      const next = ((err: unknown) => {
        errorPassed = err;
      }) as NextFunction;

      const middleware = requirePermission("org:manage");
      middleware(req, res, next);

      expect(errorPassed).toBeDefined();
      expect((errorPassed as { statusCode: number }).statusCode).toBe(403);
    });

    it("requirePermission accepts member holding all required permissions", () => {
      const req = {
        user: mockUser,
        currentMembership: {
          role: "Manager",
          permissions: ["order:create", "menu:manage"],
        },
      } as unknown as Request;
      const res = {} as Response;
      const next = vi.fn() as unknown as NextFunction;

      const middleware = requirePermission("order:create", "menu:manage");
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    it("requireOrganizationMembership rejects request without organization identifier", async () => {
      const req = {
        user: mockUser,
        params: {},
        headers: {},
        query: {},
      } as unknown as Request;
      const res = {} as Response;
      let errorPassed: unknown = null;
      const next = ((err: unknown) => {
        errorPassed = err;
      }) as NextFunction;

      const middleware = requireOrganizationMembership();
      await middleware(req, res, next);

      expect(errorPassed).toBeDefined();
      expect((errorPassed as { statusCode: number }).statusCode).toBe(400);
    });

    it("requireLocationAccess rejects request when location ID is missing", async () => {
      const req = {
        user: mockUser,
        organizationId: "org-123",
        params: {},
        headers: {},
        query: {},
      } as unknown as Request;
      const res = {} as Response;
      let errorPassed: unknown = null;
      const next = ((err: unknown) => {
        errorPassed = err;
      }) as NextFunction;

      const middleware = requireLocationAccess();
      await middleware(req, res, next);

      expect(errorPassed).toBeDefined();
      expect((errorPassed as { statusCode: number }).statusCode).toBe(400);
    });
  });
});
