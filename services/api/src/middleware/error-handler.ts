import type { Request, Response, NextFunction } from "express";
import { logger } from "../config/logger.js";
import { AppError } from "../utils/app-error.js";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId;

  if (res.headersSent) {
    return _next(err);
  }

  // Ensure JSON response header
  res.setHeader("Content-Type", "application/json");

  // Handle body-parser / express.json malformed payload errors
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "Malformed JSON payload in request body",
      },
      requestId,
    });
    return;
  }

  if (err instanceof AppError) {
    logger.warn({ err, requestId, statusCode: err.statusCode }, err.message);
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
      requestId,
    });
    return;
  }

  // Handle database connection errors (e.g. Docker / PostgreSQL down)
  if (
    err.name === "PrismaClientInitializationError" ||
    (err.message && err.message.includes("Can't reach database server"))
  ) {
    logger.error(
      { err, requestId },
      "Database connection failure — database server unreachable",
    );
    res.status(503).json({
      success: false,
      error: {
        code: "DATABASE_UNAVAILABLE",
        message:
          "Database server is unreachable. Please ensure Docker Desktop is running and PostgreSQL is started (docker compose up -d).",
      },
      requestId,
    });
    return;
  }

  // Handle errors from external middleware that attach statusCode/status
  const anyErr = err as unknown as { statusCode?: number; status?: number };
  const statusCode = anyErr.statusCode || anyErr.status || 500;
  const isDev = process.env.NODE_ENV !== "production";
  const errorMessage =
    statusCode === 500 && !isDev
      ? "An unexpected error occurred"
      : err.message || "An unexpected error occurred";

  logger.error({ err, requestId, statusCode }, "Unhandled error");
  res.status(statusCode).json({
    success: false,
    error: {
      code: statusCode === 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED",
      message: errorMessage,
    },
    requestId,
  });
}
