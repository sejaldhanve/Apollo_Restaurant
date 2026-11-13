import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { logger } from "../config/logger.js";

export interface CreateAuditLogParams {
  action: string;
  organizationId?: string | null;
  actorId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  requestId?: string;
}

// Keys that must NEVER be persisted in audit log metadata
const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "accesstoken",
  "refreshtoken",
  "tokenhash",
  "secret",
  "authorization",
  "cookie",
]);

/**
 * Sanitizes metadata to strip sensitive authentication credentials before persistence.
 */
function sanitizeMetadata(
  meta?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const sanitized: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = "[REDACTED]";
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      sanitized[key] = sanitizeMetadata(val as Record<string, unknown>);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}

/**
 * Creates an immutable audit log entry for security and compliance tracking.
 */
export async function createAuditLog(
  params: CreateAuditLogParams,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const db = tx ?? prisma;
  try {
    const sanitizedMeta = sanitizeMetadata(params.metadata);

    await db.auditLog.create({
      data: {
        action: params.action,
        organizationId: params.organizationId ?? null,
        actorId: params.actorId ?? null,
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: sanitizedMeta
          ? (sanitizedMeta as Prisma.InputJsonValue)
          : undefined,
        ipAddress: params.ipAddress,
        requestId: params.requestId,
      },
    });
  } catch (err) {
    logger.warn(
      {
        err: (err as Error).message,
        action: params.action,
        requestId: params.requestId,
      },
      "Failed to write audit log entry — non-blocking",
    );
  }
}

export const AuditService = {
  log: createAuditLog,
};
