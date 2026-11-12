import { Router } from "express";
import type { Request, Response } from "express";
import type {
  HealthCheckResponse,
  ApiSuccessResponse,
} from "@apollo/shared-types";
import { env } from "../config/env.js";

export const healthRouter: Router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check
 *     description: Returns service health status and metadata
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service is healthy
 */
healthRouter.get("/", (_req: Request, res: Response) => {
  const healthData: HealthCheckResponse & { uptime: number } = {
    status: "healthy",
    version: "0.1.0",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {},
  };

  const response: ApiSuccessResponse<typeof healthData> = {
    success: true,
    data: healthData,
  };

  res.json(response);
});
