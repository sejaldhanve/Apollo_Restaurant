import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/apollo_test",
      JWT_SECRET:
        "test_secret_must_be_minimum_32_characters_long_for_security!",
    },
  },
});
