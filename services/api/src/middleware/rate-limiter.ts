import type { Request, Response, NextFunction, RequestHandler } from "express";
import rateLimit, {
  type Options,
  type Store,
  type RateLimitRequestHandler,
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
 * Guards against executing commands when the Redis client is not in 'ready' state.
 */
export function createRedisStore(client?: Redis, prefix = "rl:global:"): Store {
  const redis = client ?? getRedisClient();

  const store = new RedisStore({
    // @ts-expect-error - sendCommand signature matches ioredis.call
    sendCommand: async (...args: string[]) => {
      if (redis.status !== "ready") {
        throw new Error(
          `Redis client is not ready for commands (current status: ${redis.status})`,
        );
      }
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

  // Suppress unhandled promise rejections on initial script load
  // if Redis is still establishing its connection when the store is constructed.
  // rate-limit-redis will reload scripts on-demand once connection becomes ready.
  const anyStore = store as unknown as {
    incrementScriptSha?: Promise<string>;
    getScriptSha?: Promise<string>;
  };
  if (anyStore.incrementScriptSha?.catch) {
    anyStore.incrementScriptSha.catch(() => {});
  }
  if (anyStore.getScriptSha?.catch) {
    anyStore.getScriptSha.catch(() => {});
  }

  return store;
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

// Module-internal limiter instances, lazily initialized or eagerly initialized via initRateLimiters()
let _globalLimiter: RateLimitRequestHandler | null = null;
let _sensitiveLimiter: RateLimitRequestHandler | null = null;

/**
 * Eagerly initializes the rate limiters after Redis has established connection.
 */
export function initRateLimiters(): void {
  _globalLimiter = createRateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    prefix: "rl:api:global:",
  }) as RateLimitRequestHandler;

  _sensitiveLimiter = createRateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.AUTH_RATE_LIMIT_MAX,
    prefix: "rl:api:sensitive:",
  }) as RateLimitRequestHandler;

  logger.info("Rate limiters initialized with Redis store");
}

/**
 * Global rate limiter middleware for /api/v1 (e.g. 300 req/min for general operations).
 * Lazily initializes on first request if initRateLimiters() was not invoked.
 */
export const globalRateLimiter: RequestHandler = (req, res, next) => {
  if (!_globalLimiter) {
    initRateLimiters();
  }
  return (_globalLimiter as RateLimitRequestHandler)(req, res, next);
};

/**
 * Strict rate limiter middleware for sensitive authentication / credential endpoints (e.g. 20 req/min).
 * Lazily initializes on first request if initRateLimiters() was not invoked.
 */
export const sensitiveRateLimiter: RequestHandler = (req, res, next) => {
  if (!_sensitiveLimiter) {
    initRateLimiters();
  }
  return (_sensitiveLimiter as RateLimitRequestHandler)(req, res, next);
};
