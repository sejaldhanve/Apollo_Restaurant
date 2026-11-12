import { Redis } from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

let redisClient: Redis | null = null;
let isConnected = false;

/**
 * Creates or retrieves the singleton Redis client.
 * Configured with auto-reconnect and error suppression so failures
 * do not crash the application process.
 */
export function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  redisClient = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    enableOfflineQueue: false, // Prevents command queue backlog during outages
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      // Exponential backoff with 5s cap
      return Math.min(times * 100, 5000);
    },
  });

  redisClient.on("connect", () => {
    isConnected = true;
    logger.info(
      { host: env.REDIS_HOST, port: env.REDIS_PORT },
      "Redis connected",
    );
  });

  redisClient.on("ready", () => {
    isConnected = true;
    logger.info("Redis client ready for commands");
  });

  redisClient.on("error", (err) => {
    isConnected = false;
    // Log as warning rather than error so intermittent connectivity doesn't flood alert channels
    logger.warn(
      { err: err.message },
      "Redis connection error — rate limiting will fail open",
    );
  });

  redisClient.on("close", () => {
    isConnected = false;
    logger.warn("Redis connection closed");
  });

  // Attempt initial connect without throwing
  redisClient.connect().catch((err) => {
    logger.warn(
      { err: err.message },
      "Initial Redis connection failed — operating in memory/fallback mode",
    );
  });

  return redisClient;
}

/**
 * Checks if the Redis connection is active and healthy.
 */
export function isRedisConnected(): boolean {
  return isConnected;
}

/**
 * Gracefully disconnects Redis.
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      redisClient.disconnect();
    } finally {
      redisClient = null;
      isConnected = false;
    }
  }
}
