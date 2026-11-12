import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { ApiSuccessResponse } from "@apollo/shared-types";
import { validate } from "../../middleware/validate.js";
import { sensitiveRateLimiter } from "../../middleware/rate-limiter.js";
import { authenticate } from "../../middleware/authenticate.js";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  type RegisterInput,
  type LoginInput,
  type RefreshInput,
} from "./auth.schemas.js";
import { AuthService } from "./auth.service.js";

export const authRouter: Router = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register organization and owner account
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, firstName, lastName, organizationName]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: chef@bistroalpha.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: AlphaChef2026!
 *               firstName:
 *                 type: string
 *                 example: Auguste
 *               lastName:
 *                 type: string
 *                 example: Gusteau
 *               organizationName:
 *                 type: string
 *                 example: Gusteau Dining Group
 *     responses:
 *       201:
 *         description: Organization and user registered successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email address already registered
 */
authRouter.post(
  "/register",
  sensitiveRateLimiter,
  validate({ body: registerSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.body as RegisterInput;
      const result = await AuthService.register(input, {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        requestId: req.requestId,
      });

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        data: result,
      };

      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Authenticate user with credentials
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: chef@bistroalpha.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: AlphaChef2026!
 *     responses:
 *       200:
 *         description: Successfully authenticated
 *       401:
 *         description: Invalid email or password
 */
authRouter.post(
  "/login",
  sensitiveRateLimiter,
  validate({ body: loginSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = req.body as LoginInput;
      const result = await AuthService.login(input, {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        requestId: req.requestId,
      });

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Rotate refresh token and issue new access token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tokens successfully rotated
 *       401:
 *         description: Invalid, expired, or compromised token
 */
authRouter.post(
  "/refresh",
  validate({ body: refreshSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body as RefreshInput;
      const tokens = await AuthService.refreshTokens(refreshToken, {
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        requestId: req.requestId,
      });

      const response: ApiSuccessResponse<typeof tokens> = {
        success: true,
        data: tokens,
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Invalidate current refresh token
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successfully logged out
 */
authRouter.post(
  "/logout",
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawRefreshToken = req.body?.refreshToken as string | undefined;
      await AuthService.logout(rawRefreshToken, req.user?.id, {
        ipAddress: req.ip,
        requestId: req.requestId,
      });

      res.status(200).json({
        success: true,
        data: { message: "Successfully logged out" },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /auth/logout-all:
 *   post:
 *     summary: Invalidate all active sessions across all devices
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: All sessions revoked
 */
authRouter.post(
  "/logout-all",
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user) {
        await AuthService.logoutAll(req.user.id, {
          ipAddress: req.ip,
          requestId: req.requestId,
        });
      }

      res.status(200).json({
        success: true,
        data: { message: "All sessions have been revoked" },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Get profile and memberships of current user
 *     tags: [Authentication]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current user profile
 *       401:
 *         description: Unauthorized
 */
authRouter.get(
  "/me",
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await AuthService.getMe(req.user!.id);

      const response: ApiSuccessResponse<typeof result> = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

