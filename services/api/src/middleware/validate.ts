import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { ZodError } from "zod";

export interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function validate(schemas: ValidationSchemas | ZodSchema) {
  const normalized: ValidationSchemas =
    "parse" in schemas && typeof (schemas as ZodSchema).parse === "function"
      ? { body: schemas as ZodSchema }
      : (schemas as ValidationSchemas);

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (normalized.body) req.body = normalized.body.parse(req.body);
      if (normalized.query) req.query = normalized.query.parse(req.query);
      if (normalized.params) req.params = normalized.params.parse(req.params);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details: error.errors.map((e) => ({
              path: e.path.join("."),
              message: e.message,
            })),
          },
          requestId: req.requestId,
        });
        return;
      }
      next(error);
    }
  };
}
