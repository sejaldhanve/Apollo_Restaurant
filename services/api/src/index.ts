import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { initRedis, closeRedis } from "./config/redis.js";
import { initRateLimiters } from "./middleware/rate-limiter.js";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import {
  setSocketIO,
  registerSocketHandlers,
} from "./services/socket.service.js";

async function bootstrap(): Promise<void> {
  // Ensure Redis connects successfully before rate limiters use it
  await initRedis();
  initRateLimiters();

  const app = createApp();
  const httpServer = createServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.API_CORS_ORIGIN, methods: ["GET", "POST"] },
  });
  setSocketIO(io);
  registerSocketHandlers(io);

  httpServer.listen(env.API_PORT, env.API_HOST, () => {
    logger.info(
      { port: env.API_PORT, host: env.API_HOST, env: env.NODE_ENV },
      "Apollo API server started",
    );
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down...");
    io.close();
    await closeRedis();
    httpServer.close(() => {
      logger.info("Server closed");
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
