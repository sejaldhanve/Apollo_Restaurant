import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/app-error.js";
import type { TokenPayload } from "../modules/auth/auth.service.js";

/**
 * Middleware that validates the Bearer access token and attaches the authenticated user.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(
      AppError.unauthorized("Authorization header missing or invalid format"),
    );
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return next(AppError.unauthorized("Access token is missing"));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload;

    if (decoded.type !== "access" || !decoded.sub) {
      return next(AppError.unauthorized("Invalid token type"));
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        emailVerified: true,
      },
    });

    if (!user) {
      return next(AppError.unauthorized("User account no longer exists"));
    }

    if (user.status === "SUSPENDED" || user.status === "DEACTIVATED") {
      return next(AppError.forbidden("Account is inactive or suspended"));
    }

    req.user = user;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(AppError.unauthorized("Access token has expired"));
    }
    if (err instanceof jwt.JsonWebTokenError) {
      return next(AppError.unauthorized("Invalid access token"));
    }
    next(err);
  }
}
