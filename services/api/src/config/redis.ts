import { Redis } from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

let redisClient: Redis | null = null;
let isConnected = false;
let isReady = false;

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
    isReady = true;
    logger.info("Redis client ready for commands");
  });

  redisClient.on("reconnecting", (delay: number) => {
    isConnected = false;
    isReady = false;
    logger.warn({ delay }, "Redis reconnecting");
  });

  redisClient.on("error", (err: Error) => {
    isConnected = false;
    isReady = false;
    // Log as warning rather than error so intermittent connectivity doesn't flood alert channels
    logger.warn(
      { err: err.message },
      "Redis connection error — rate limiting will fail open",
    );
  });

  redisClient.on("close", () => {
    isConnected = false;
    isReady = false;
    logger.warn("Redis connection closed");
  });

  redisClient.on("end", () => {
    isConnected = false;
    isReady = false;
    logger.warn("Redis connection ended");
  });

  // Attempt initial connect without throwing
  if (redisClient.status === "wait") {
    redisClient.connect().catch((err: Error) => {
      logger.warn(
        { err: err.message },
        "Initial Redis connection attempt failed — operating in fallback mode",
      );
    });
  }

  return redisClient;
}

/**
 * Checks if the Redis connection is active.
 */
export function isRedisConnected(): boolean {
  return isConnected;
}

/**
 * Checks if the Redis client is ready to accept commands.
 */
export function isRedisReady(): boolean {
  return isReady && redisClient?.status === "ready";
}

/**
 * Connects to Redis and waits until the client reaches the 'ready' state.
 * Resolves null instead of throwing if connection fails or times out,
 * allowing services to operate in fail-open mode.
 */
export async function initRedis(timeoutMs = 3000): Promise<Redis | null> {
  const client = getRedisClient();

  if (client.status === "ready") {
    isReady = true;
    isConnected = true;
    return client;
  }

  return new Promise((resolve) => {
    let resolved = false;

    const cleanup = () => {
      client.removeListener("ready", onReady);
      client.removeListener("error", onError);
      if (timer) clearTimeout(timer);
    };

    const onReady = () => {
      if (!resolved) {
        resolved = true;
        cleanup();
        isReady = true;
        isConnected = true;
        resolve(client);
      }
    };

    const onError = (err: Error) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        isReady = false;
        isConnected = false;
        logger.warn(
          { err: err.message },
          "Redis failed to connect during initialization — operating in fail-open mode",
        );
        resolve(null);
      }
    };

    client.once("ready", onReady);
    client.once("error", onError);

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        isReady = false;
        isConnected = false;
        logger.warn(
          { timeoutMs },
          "Redis connection initialization timed out — operating in fail-open mode",
        );
        resolve(null);
      }
    }, timeoutMs);

    if (client.status === "wait") {
      client.connect().catch((err: Error) => {
        logger.warn(
          { err: err.message },
          "Initial Redis connection attempt failed — operating in fallback mode",
        );
      });
    }
  });
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
      isReady = false;
    }
  }
}
