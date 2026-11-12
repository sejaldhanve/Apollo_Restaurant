import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

declare global {
  var __globalPrisma__: PrismaClient | undefined;
}

/**
 * Creates or retrieves the singleton PrismaClient.
 */
function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log:
      env.NODE_ENV === "development"
        ? [
            { emit: "event", level: "query" },
            { emit: "event", level: "error" },
            { emit: "event", level: "warn" },
          ]
        : [{ emit: "event", level: "error" }],
  });

  if (env.NODE_ENV === "development") {
    client.$on("query", (e: { query: string; duration: number }) => {
      logger.trace({ query: e.query, durationMs: e.duration }, "Prisma query");
    });
  }

  client.$on("error", (e: { message: string }) => {
    logger.error({ err: e.message }, "Prisma error");
  });

  return client;
}

export const prisma = globalThis.__globalPrisma__ ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalThis.__globalPrisma__ = prisma;
}
