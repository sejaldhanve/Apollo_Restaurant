import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import {
  createRateLimiter,
  createRedisStore,
  globalRateLimiter,
  sensitiveRateLimiter,
  initRateLimiters,
} from "./rate-limiter.js";
import { initRedis, isRedisReady } from "../config/redis.js";
import type { Redis } from "ioredis";

describe("Rate Limiter Middleware", () => {
  it("should allow requests under the configured threshold and set draft-6 and legacy headers", async () => {
    const app = express();
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 5,
      useMemoryStore: true,
    });

    app.use(limiter);
    app.get("/test", (_req, res) => {
      res.json({ ok: true });
    });

    const response = await request(app).get("/test");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    // Standard RFC draft-6 headers
    expect(response.headers["ratelimit-limit"]).toBe("5");
    expect(response.headers["ratelimit-remaining"]).toBe("4");
    expect(response.headers["ratelimit-reset"]).toBeDefined();
    // Legacy headers
    expect(response.headers["x-ratelimit-limit"]).toBe("5");
    expect(response.headers["x-ratelimit-remaining"]).toBe("4");
  });

  it("should block requests exceeding the limit with 429 and standard error envelope", async () => {
    const app = express();
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 2,
      useMemoryStore: true,
    });

    app.use(limiter);
    app.get("/test", (_req, res) => {
      res.json({ ok: true });
    });

    // Request 1: allowed
    const res1 = await request(app).get("/test");
    expect(res1.status).toBe(200);

    // Request 2: allowed
    const res2 = await request(app).get("/test");
    expect(res2.status).toBe(200);

    // Request 3: blocked
    const res3 = await request(app).get("/test");
    expect(res3.status).toBe(429);
    expect(res3.body).toMatchObject({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests from this client. Please retry later.",
        details: {
          limit: 2,
          windowMs: 60_000,
        },
      },
    });
    expect(res3.headers["ratelimit-remaining"]).toBe("0");
    expect(res3.headers["retry-after"]).toBeDefined();
  });

  it("should fail open and allow traffic when store encounters an error", async () => {
    const app = express();
    // Create a mock store that simulates an unexpected Redis storage fault
    const failingStore = {
      init: () => {},
      increment: async () => {
        throw new Error("Redis cluster failover in progress");
      },
      decrement: async () => {},
      resetKey: async () => {},
    };

    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 2,
      store: failingStore,
    });

    app.use(limiter);
    app.get("/test", (_req, res) => {
      res.json({ ok: true, resilient: true });
    });

    // Despite Redis store failure, the request must succeed (passOnStoreError: true)
    const response = await request(app).get("/test");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, resilient: true });
  });

  it("createRedisStore should invoke redis.call when status is ready", async () => {
    let calledCommand = "";
    let calledArgs: string[] = [];

    const mockRedis = {
      status: "ready",
      call: async (cmd: string, ...args: string[]) => {
        calledCommand = cmd;
        calledArgs = args;
        return "OK";
      },
    } as unknown as Redis;

    const store = createRedisStore(mockRedis, "test:prefix:");
    expect(store).toBeDefined();
    // @ts-expect-error - testing internal sendCommand with expected shape
    const result = await store.sendCommand({ command: ["PING", "arg1"] });
    expect(result).toBe("OK");
    expect(calledCommand).toBe("PING");
    expect(calledArgs).toEqual(["arg1"]);
  });

  it("createRedisStore should reject commands without crashing when Redis is not ready", async () => {
    const mockRedis = {
      status: "connecting",
      call: async () => {
        throw new Error(
          "Stream isn't writeable and enableOfflineQueue options is false",
        );
      },
    } as unknown as Redis;

    const store = createRedisStore(mockRedis, "test:prefix:");
    expect(store).toBeDefined();

    // Verify sending command throws descriptive error rather than raw socket write error
    await expect(
      // @ts-expect-error - testing internal sendCommand
      store.sendCommand({ command: ["PING"] }),
    ).rejects.toThrow(
      "Redis client is not ready for commands (current status: connecting)",
    );
  });

  it("globalRateLimiter and sensitiveRateLimiter functions can be mounted as middleware", async () => {
    initRateLimiters();

    const app = express();
    app.use("/api/v1/global", globalRateLimiter);
    app.use("/api/v1/auth", sensitiveRateLimiter);

    app.get("/api/v1/global/test", (_req, res) => {
      res.json({ route: "global" });
    });
    app.get("/api/v1/auth/test", (_req, res) => {
      res.json({ route: "auth" });
    });

    const res1 = await request(app).get("/api/v1/global/test");
    expect(res1.status).toBe(200);
    expect(res1.body).toEqual({ route: "global" });

    const res2 = await request(app).get("/api/v1/auth/test");
    expect(res2.status).toBe(200);
    expect(res2.body).toEqual({ route: "auth" });
  });

  it("isRedisReady reports boolean status", () => {
    expect(typeof isRedisReady()).toBe("boolean");
  });

  it("initRedis returns client when ready or times out gracefully without throwing", async () => {
    const client = await initRedis(100);
    expect(client === null || typeof client === "object").toBe(true);
  });
});
