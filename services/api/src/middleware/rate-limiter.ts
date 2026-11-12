import type { Request, Response, NextFunction } from "express";
import rateLimit, {
  type Options,
  type Store,
  MemoryStore,
} from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { Redis } from "ioredis";
import { env } from "../config/env.js";
import { getRedisClient } from "../config/redis.js";
import { logger } from "../config/logger.js";

export interface RateLimiterConfig {
  windowMs?: number;
  max?: number;
  prefix?: string;
  store?: Store;
  useMemoryStore?: boolean;
  customRedisClient?: Redis;
}

/**
 * Standard rate-limit exceeded handler formatted to Apollo API standards.
 */
function createRateLimitHandler(message: string) {
  return (
    req: Request,
    res: Response,
    _next: NextFunction,
    options: Options,
  ) => {
    const retryAfter = Math.ceil(options.windowMs / 1000);
    const limit =
      typeof options.limit === "function" ? undefined : options.limit;

    res.status(options.statusCode).json({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message,
        details: {
          retryAfterSeconds: retryAfter,
          windowMs: options.windowMs,
          limit,
        },
      },
      requestId: req.requestId,
    });
  };
}

/**
 * Creates a RedisStore backed by the configured Redis client.
 */
export function createRedisStore(client?: Redis, prefix = "rl:global:"): Store {
  const redis = client ?? getRedisClient();

  return new RedisStore({
    // @ts-expect-error - sendCommand signature matches ioredis.call
    sendCommand: async (...args: string[]) => {
      try {
        return await redis.call(args[0]!, ...args.slice(1));
      } catch (err) {
        logger.warn(
          { err: (err as Error).message },
          "Rate limiter Redis store command failed — failing open",
        );
        throw err;
      }
    },
    prefix,
  });
}

/**
 * Factory creating an Express rate limiter.
 * Backed by Redis when available, with fail-open resiliency (passOnStoreError: true).
 */
export function createRateLimiter(config: RateLimiterConfig = {}) {
  if (!env.RATE_LIMIT_ENABLED) {
    // Pass-through middleware if rate limiting is explicitly disabled
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  const windowMs = config.windowMs ?? env.RATE_LIMIT_WINDOW_MS;
  const max = config.max ?? env.RATE_LIMIT_MAX;
  const prefix = config.prefix ?? "rl:api:";

  let store: Store;
  if (config.store) {
    store = config.store;
  } else if (config.useMemoryStore || env.NODE_ENV === "test") {
    store = new MemoryStore();
  } else {
    try {
      store = createRedisStore(config.customRedisClient, prefix);
    } catch {
      logger.warn(
        "Failed to initialize RedisStore for rate limiting — falling back to MemoryStore",
      );
      store = new MemoryStore();
    }
  }

  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: "draft-6", // RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset
    legacyHeaders: true, // X-RateLimit-* for backward compatibility
    passOnStoreError: true, // CRITICAL: fail open if Redis is unreachable to avoid halting restaurant POS
    store,
    handler: createRateLimitHandler(
      "Too many requests from this client. Please retry later.",
    ),
  });
}

/**
 * Global rate limiter for /api/v1 (e.g. 300 req/min for general operations).
 */
export const globalRateLimiter = createRateLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  prefix: "rl:api:global:",
});

/**
 * Strict rate limiter for sensitive authentication / credential endpoints (e.g. 20 req/min).
 */
export const sensitiveRateLimiter = createRateLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  prefix: "rl:api:sensitive:",
});
