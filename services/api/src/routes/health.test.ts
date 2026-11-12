import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";

describe("Health Check Route", () => {
  const app = createApp();

  it("GET /api/v1/health should return 200 with service metadata", async () => {
    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      status: "healthy",
      version: "0.1.0",
    });
    expect(response.body.data.timestamp).toBeDefined();
    expect(response.body.data.uptime).toBeGreaterThanOrEqual(0);
  });

  it("GET /api/v1/non-existent-route should return 404 envelope", async () => {
    const response = await request(app).get("/api/v1/non-existent-route");

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(response.body.requestId).toBeDefined();
  });
});
