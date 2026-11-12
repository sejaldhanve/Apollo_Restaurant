import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { env } from "./config/env.js";
import { requestLogger } from "./middleware/request-logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { requestId } from "./middleware/request-id.js";
import { globalRateLimiter } from "./middleware/rate-limiter.js";
import { apiRouter } from "./routes/index.js";
import { setupSwagger } from "./config/swagger.js";

export function createApp(): express.Application {
  const app = express();

  // Security
  app.use(helmet());
  app.use(cors({ origin: env.API_CORS_ORIGIN, credentials: true }));

  // Parsing
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // Compression
  app.use(compression());

  // Request tracking
  app.use(requestId);
  app.use(requestLogger);

  // Rate Limiting (Redis-backed with fail-open resiliency)
  app.use("/api/v1", globalRateLimiter);

  // API documentation
  setupSwagger(app);

  // Routes
  app.use("/api/v1", apiRouter);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
