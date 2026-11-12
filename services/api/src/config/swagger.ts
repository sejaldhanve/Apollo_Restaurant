import type { Application } from "express";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Apollo Restaurant OS API",
      version: "0.1.0",
      description: "AI-Native Autonomous Restaurant Operating System API",
    },
    servers: [{ url: "/api/v1", description: "API v1" }],
  },
  apis: ["./src/routes/**/*.ts", "./src/modules/**/*.ts"],
};

export function setupSwagger(app: Application): void {
  const spec = swaggerJsdoc(options);
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(spec, { customSiteTitle: "Apollo API Docs" }),
  );
  app.get("/api-docs.json", (_req, res) => {
    res.json(spec);
  });
}
