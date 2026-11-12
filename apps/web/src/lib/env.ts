import { z } from "zod";

const envSchema = z.object({
  VITE_API_URL: z.string().url().optional().default("http://localhost:3001"),
  VITE_WS_URL: z.string().url().optional().default("http://localhost:3001"),
  MODE: z.enum(["development", "production", "test"]).default("development"),
});

export const env = envSchema.parse({
  VITE_API_URL: import.meta.env.VITE_API_URL,
  VITE_WS_URL: import.meta.env.VITE_WS_URL,
  MODE: import.meta.env.MODE,
});
