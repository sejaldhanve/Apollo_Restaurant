import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthService } from "./auth.service.js";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../utils/app-error.js";
import * as auditService from "../../services/audit.service.js";
import { verify as argon2Verify } from "@node-rs/argon2";

vi.mock("@node-rs/argon2", () => ({
  verify: vi.fn(),
  hash: vi.fn(),
}));

// Mock prisma and auditLog
vi.mock("../../db/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    organizationMembership: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../../services/audit.service.js", () => ({
  createAuditLog: vi.fn().mockResolvedValue(undefined),
  AuditService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("AuthService.login — Credentials Verification & Error Semantics", () => {
  const mockUser = {
    id: "00000000-0000-0000-0000-000000000001",
    email: "chef@bistroalpha.com",
    passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$mockHashValue",
    firstName: "Auguste",
    lastName: "Gusteau",
    status: "ACTIVE",
    emailVerified: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMembership = {
    id: "11111111-1111-1111-1111-111111111111",
    organizationId: "22222222-2222-2222-2222-222222222222",
    userId: mockUser.id,
    roleId: "33333333-3333-3333-3333-333333333333",
    status: "ACTIVE",
    organization: {
      id: "22222222-2222-2222-2222-222222222222",
      name: "Gusteau Group",
      slug: "gusteau-group",
    },
    role: {
      id: "33333333-3333-3333-3333-333333333333",
      name: "Owner",
      permissions: [
        {
          permission: {
            name: "org:manage",
            resource: "org",
            action: "manage",
          },
        },
      ],
    },
    locationMemberships: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Successful Login: authenticates user, updates lastLoginAt, creates tokens and audit log", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue(mockUser as any);
    vi.mocked(argon2Verify).mockResolvedValue(true);
    vi.spyOn(prisma.user, "update").mockResolvedValue({
      ...mockUser,
      lastLoginAt: new Date(),
    } as any);
    vi.spyOn(prisma.refreshToken, "create").mockResolvedValue({} as any);
    vi.spyOn(prisma.organizationMembership, "findMany").mockResolvedValue([
      mockMembership,
    ] as any);

    const result = await AuthService.login(
      {
        email: "chef@bistroalpha.com",
        password: "CorrectPassword123!",
      },
      { ipAddress: "127.0.0.1", userAgent: "Vitest", requestId: "req-1" },
    );

    // Verify user profile returned
    expect(result.user.id).toBe(mockUser.id);
    expect(result.user.email).toBe(mockUser.email);

    // Verify tokens issued
    expect(result.tokens.accessToken).toBeDefined();
    expect(result.tokens.refreshToken).toBeDefined();
    expect(result.tokens.expiresIn).toBe(900);

    // Verify memberships returned
    expect(result.organizations).toHaveLength(1);
    expect(result.organizations[0]!.organizationName).toBe("Gusteau Group");

    // Verify lastLoginAt updated
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: mockUser.id },
      data: { lastLoginAt: expect.any(Date) },
    });

    // Verify audit log recorded
    expect(auditService.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.login.success",
        actorId: mockUser.id,
      }),
    );
  });

  it("2. Incorrect Password: throws 401 UNAUTHORIZED with generic message and audits failure", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue(mockUser as any);
    vi.mocked(argon2Verify).mockResolvedValue(false);

    await expect(
      AuthService.login(
        {
          email: "chef@bistroalpha.com",
          password: "WrongPassword999!",
        },
        { ipAddress: "127.0.0.1", requestId: "req-2" },
      ),
    ).rejects.toThrowError(
      expect.objectContaining({
        message: "Invalid email or password",
        statusCode: 401,
        code: "UNAUTHORIZED",
      }),
    );

    // Verify audit log captured with reason
    expect(auditService.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.login.failure",
        actorId: mockUser.id,
        metadata: { reason: "Invalid password" },
      }),
    );
  });

  it("3. Unknown Email: throws identical 401 UNAUTHORIZED without revealing account existence", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue(null);

    await expect(
      AuthService.login(
        {
          email: "unknown-account@nowhere.com",
          password: "SomePassword123!",
        },
        { ipAddress: "127.0.0.1", requestId: "req-3" },
      ),
    ).rejects.toThrowError(
      expect.objectContaining({
        message: "Invalid email or password",
        statusCode: 401,
        code: "UNAUTHORIZED",
      }),
    );

    // Verify audit log recorded for unknown email
    expect(auditService.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.login.failure",
        metadata: {
          reason: "User not found",
          email: "unknown-account@nowhere.com",
        },
      }),
    );
  });

  it("4. Suspended Account: throws 403 FORBIDDEN when account status is SUSPENDED", async () => {
    vi.spyOn(prisma.user, "findUnique").mockResolvedValue({
      ...mockUser,
      status: "SUSPENDED",
    } as any);
    vi.mocked(argon2Verify).mockResolvedValue(true);

    await expect(
      AuthService.login({
        email: "chef@bistroalpha.com",
        password: "CorrectPassword123!",
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        message: "Account is inactive or suspended",
        statusCode: 403,
        code: "FORBIDDEN",
      }),
    );
  });
});
