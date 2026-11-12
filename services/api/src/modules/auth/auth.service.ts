import crypto from "crypto";
import jwt from "jsonwebtoken";
import { hash, verify } from "@node-rs/argon2";
import { v4 as uuidv4 } from "uuid";
import type { PrismaClient } from "@prisma/client";
import type {
  AuthResponse,
  AuthTokens,
  AuthUser,
  MeResponse,
  OrgMembershipInfo,
} from "@apollo/shared-types";
import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/app-error.js";
import { createAuditLog } from "../../services/audit.service.js";
import { seedPermissions, seedOrganizationRoles } from "../../db/seed.js";
import type { RegisterInput, LoginInput } from "./auth.schemas.js";

const ACCESS_TOKEN_EXPIRY_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export interface TokenPayload {
  sub: string;
  email: string;
  type: "access";
}

/**
 * Generates an URL-friendly slug from an organization name.
 */
function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base || "org"}-${suffix}`;
}

/**
 * Computes the SHA-256 hash of a raw token string for secure database persistence.
 */
function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Generates a short-lived access JWT and a rotating refresh token.
 */
async function issueTokens(
  userId: string,
  email: string,
  family?: string,
  clientInfo?: { userAgent?: string; ipAddress?: string },
  client: PrismaClient = prisma,
): Promise<AuthTokens> {
  const payload: TokenPayload = {
    sub: userId,
    email,
    type: "access",
  };

  const accessToken = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
  });

  const rawRefreshToken = crypto.randomBytes(40).toString("hex");
  const tokenHash = hashToken(rawRefreshToken);
  const tokenFamily = family ?? uuidv4();
  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  );

  await client.refreshToken.create({
    data: {
      userId,
      tokenHash,
      family: tokenFamily,
      expiresAt,
      userAgent: clientInfo?.userAgent,
      ipAddress: clientInfo?.ipAddress,
    },
  });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
  };
}

/**
 * Formats a database user record to the public AuthUser shape.
 */
function formatAuthUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  emailVerified: boolean;
}): AuthUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    emailVerified: user.emailVerified,
  };
}

/**
 * Retrieves all organization memberships, assigned roles, and permissions for a user.
 */
async function getUserMemberships(
  userId: string,
  client: PrismaClient = prisma,
): Promise<OrgMembershipInfo[]> {
  const memberships = await client.organizationMembership.findMany({
    where: { userId, status: "ACTIVE" },
    include: {
      organization: true,
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  });

  return memberships.map((m) => ({
    organizationId: m.organization.id,
    organizationName: m.organization.name,
    organizationSlug: m.organization.slug,
    role: m.role.name,
    permissions: m.role.permissions.map((rp) => rp.permission.code),
  }));
}

export class AuthService {
  /**
   * Registers a new user account, creates the root organization, and seeds default roles.
   */
  static async register(
    input: RegisterInput,
    context?: { ipAddress?: string; userAgent?: string; requestId?: string },
  ): Promise<AuthResponse> {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existing) {
      throw AppError.conflict(
        "An account with this email address already exists",
      );
    }

    const passwordHash = await hash(input.password, {
      memoryCost: 19456,
      timeCost: 2,
      outputLen: 32,
      parallelism: 1,
    });

    const orgSlug = slugify(input.organizationName);

    // Make sure global permissions are seeded
    await seedPermissions(prisma);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create global user
      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          status: "ACTIVE",
          emailVerified: true, // Self-serve creator is verified
          lastLoginAt: new Date(),
        },
      });

      // 2. Create organization
      const organization = await tx.organization.create({
        data: {
          name: input.organizationName,
          slug: orgSlug,
          status: "ACTIVE",
        },
      });

      // 3. Seed system roles for the organization
      await seedOrganizationRoles(
        tx as unknown as PrismaClient,
        organization.id,
      );

      // 4. Retrieve the Owner role
      const ownerRole = await tx.role.findUniqueOrThrow({
        where: {
          organizationId_name: {
            organizationId: organization.id,
            name: "Owner",
          },
        },
      });

      // 5. Create membership linking user as Owner
      await tx.organizationMembership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          roleId: ownerRole.id,
          status: "ACTIVE",
          joinedAt: new Date(),
        },
      });

      return { user, organization, ownerRole };
    });

    const tokens = await issueTokens(
      result.user.id,
      result.user.email,
      undefined,
      { userAgent: context?.userAgent, ipAddress: context?.ipAddress },
    );

    const memberships = await getUserMemberships(result.user.id);

    await createAuditLog({
      action: "auth.register",
      organizationId: result.organization.id,
      actorId: result.user.id,
      entityType: "User",
      entityId: result.user.id,
      metadata: { organizationName: input.organizationName },
      ipAddress: context?.ipAddress,
      requestId: context?.requestId,
    });

    return {
      user: formatAuthUser(result.user),
      tokens,
      organizations: memberships,
    };
  }

  /**
   * Authenticates a user with email and password.
   */
  static async login(
    input: LoginInput,
    context?: { ipAddress?: string; userAgent?: string; requestId?: string },
  ): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    // SECURITY: Use identical generic message to prevent user enumeration
    if (!user) {
      await createAuditLog({
        action: "auth.login.failure",
        metadata: { reason: "User not found", email: input.email },
        ipAddress: context?.ipAddress,
        requestId: context?.requestId,
      });
      throw AppError.unauthorized("Invalid email or password");
    }

    const passwordValid = await verify(user.passwordHash, input.password);
    if (!passwordValid) {
      await createAuditLog({
        action: "auth.login.failure",
        actorId: user.id,
        metadata: { reason: "Invalid password" },
        ipAddress: context?.ipAddress,
        requestId: context?.requestId,
      });
      throw AppError.unauthorized("Invalid email or password");
    }

    if (user.status === "SUSPENDED" || user.status === "DEACTIVATED") {
      throw AppError.forbidden("Account is inactive or suspended");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await issueTokens(user.id, user.email, undefined, {
      userAgent: context?.userAgent,
      ipAddress: context?.ipAddress,
    });

    const memberships = await getUserMemberships(user.id);

    await createAuditLog({
      action: "auth.login.success",
      organizationId: memberships[0]?.organizationId ?? null,
      actorId: user.id,
      entityType: "User",
      entityId: user.id,
      ipAddress: context?.ipAddress,
      requestId: context?.requestId,
    });

    return {
      user: formatAuthUser(user),
      tokens,
      organizations: memberships,
    };
  }

  /**
   * Rotates a refresh token with automatic token reuse / compromise detection.
   */
  static async refreshTokens(
    rawRefreshToken: string,
    context?: { ipAddress?: string; userAgent?: string; requestId?: string },
  ): Promise<AuthTokens> {
    const tokenHash = hashToken(rawRefreshToken);

    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!storedToken) {
      throw AppError.unauthorized("Invalid or expired refresh token");
    }

    // TOKEN REUSE DETECTION: If this token was already revoked, someone is replaying it!
    // Immediately invalidate ALL tokens in this family to protect the user.
    if (storedToken.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { family: storedToken.family, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await createAuditLog({
        action: "auth.token.reuse_detected",
        actorId: storedToken.userId,
        entityType: "RefreshToken",
        entityId: storedToken.id,
        metadata: {
          family: storedToken.family,
          message: "Token reuse detected, family revoked",
        },
        ipAddress: context?.ipAddress,
        requestId: context?.requestId,
      });

      throw AppError.unauthorized(
        "Token compromise detected. Please sign in again.",
      );
    }

    if (storedToken.expiresAt < new Date()) {
      throw AppError.unauthorized(
        "Refresh token has expired. Please sign in again.",
      );
    }

    // Rotate token: revoke current token and issue new token within the same family
    const newTokens = await prisma.$transaction(async (tx) => {
      const rawNewRefreshToken = crypto.randomBytes(40).toString("hex");
      const newTokenHash = hashToken(rawNewRefreshToken);
      const newExpiresAt = new Date(
        Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
      );

      const created = await tx.refreshToken.create({
        data: {
          userId: storedToken.userId,
          tokenHash: newTokenHash,
          family: storedToken.family,
          expiresAt: newExpiresAt,
          userAgent: context?.userAgent,
          ipAddress: context?.ipAddress,
        },
      });

      await tx.refreshToken.update({
        where: { id: storedToken.id },
        data: {
          revokedAt: new Date(),
          replacedByTokenId: created.id,
        },
      });

      const accessToken = jwt.sign(
        {
          sub: storedToken.userId,
          email: storedToken.user.email,
          type: "access",
        } satisfies TokenPayload,
        env.JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS },
      );

      return {
        accessToken,
        refreshToken: rawNewRefreshToken,
        expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
      };
    });

    await createAuditLog({
      action: "auth.token.refresh",
      actorId: storedToken.userId,
      entityType: "RefreshToken",
      ipAddress: context?.ipAddress,
      requestId: context?.requestId,
    });

    return newTokens;
  }

  /**
   * Revokes a specific refresh token (single-session logout).
   */
  static async logout(
    rawRefreshToken?: string,
    userId?: string,
    context?: { ipAddress?: string; requestId?: string },
  ): Promise<void> {
    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    if (userId) {
      await createAuditLog({
        action: "auth.logout",
        actorId: userId,
        ipAddress: context?.ipAddress,
        requestId: context?.requestId,
      });
    }
  }

  /**
   * Revokes all active refresh tokens for a user across all devices.
   */
  static async logoutAll(
    userId: string,
    context?: { ipAddress?: string; requestId?: string },
  ): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await createAuditLog({
      action: "auth.logout.all",
      actorId: userId,
      ipAddress: context?.ipAddress,
      requestId: context?.requestId,
    });
  }

  /**
   * Retrieves profile and memberships for an authenticated user.
   */
  static async getMe(userId: string): Promise<MeResponse> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw AppError.notFound("User not found");
    }

    const memberships = await getUserMemberships(userId);

    return {
      user: formatAuthUser(user),
      memberships,
    };
  }
}
