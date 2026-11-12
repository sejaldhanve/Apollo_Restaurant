import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createRateLimiter, createRedisStore } from "./rate-limiter.js";
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

  it("createRedisStore should invoke redis.call via sendCommand", async () => {
    let calledCommand = "";
    let calledArgs: string[] = [];

    const mockRedis = {
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
});
