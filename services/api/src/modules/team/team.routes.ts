import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { ApiSuccessResponse } from "@apollo/shared-types";
import { authenticate } from "../../middleware/authenticate.js";
import {
  requirePermission,
  requireOrganizationMembership,
} from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { TeamService } from "./team.service.js";
import {
  inviteStaffSchema,
  updateStaffRoleSchema,
  updateStaffStatusSchema,
  updateStaffLocationsSchema,
  type InviteStaffInput,
  type UpdateStaffRoleInput,
  type UpdateStaffStatusInput,
  type UpdateStaffLocationsInput,
} from "./team.schemas.js";

export const teamRouter: Router = Router();

// Protect all team routes with JWT authentication and organization context
teamRouter.use(authenticate);
teamRouter.use(requireOrganizationMembership());

/**
 * GET /team
 * Lists all staff members in the active organization.
 */
teamRouter.get(
  "/",
  requirePermission("user:view"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const result = await TeamService.getTeamMembers(orgId);

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
 * GET /team/roles
 * Lists available roles for the organization.
 */
teamRouter.get(
  "/roles",
  requirePermission("user:view"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const result = await TeamService.getRoles(orgId);

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
 * GET /team/locations
 * Lists active locations for assignment.
 */
teamRouter.get(
  "/locations",
  requirePermission("user:view"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const result = await TeamService.getLocations(orgId);

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
 * POST /team/invite
 * Invites or enrolls a new staff member into the organization.
 */
teamRouter.post(
  "/invite",
  requirePermission("user:invite"),
  validate({ body: inviteStaffSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const input = req.body as InviteStaffInput;

      const result = await TeamService.inviteStaff(orgId, actorId, input, {
        ip: req.ip,
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
 * PATCH /team/:id/role
 * Updates staff member's organization role.
 */
teamRouter.patch(
  "/:id/role",
  requirePermission("user:manage"),
  validate({ body: updateStaffRoleSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const membershipId = req.params.id as string;
      const input = req.body as UpdateStaffRoleInput;

      const result = await TeamService.updateStaffRole(
        orgId,
        actorId,
        membershipId,
        input,
        {
          ip: req.ip,
          requestId: req.requestId,
        },
      );

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
 * PATCH /team/:id/status
 * Updates staff member's active/suspended status.
 */
teamRouter.patch(
  "/:id/status",
  requirePermission("user:manage"),
  validate({ body: updateStaffStatusSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const membershipId = req.params.id as string;
      const input = req.body as UpdateStaffStatusInput;

      const result = await TeamService.updateStaffStatus(
        orgId,
        actorId,
        membershipId,
        input,
        {
          ip: req.ip,
          requestId: req.requestId,
        },
      );

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
 * PUT /team/:id/locations
 * Assigns or updates location memberships for a staff member.
 */
teamRouter.put(
  "/:id/locations",
  requirePermission("user:manage"),
  validate({ body: updateStaffLocationsSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const membershipId = req.params.id as string;
      const input = req.body as UpdateStaffLocationsInput;

      const result = await TeamService.updateStaffLocations(
        orgId,
        actorId,
        membershipId,
        input,
        {
          ip: req.ip,
          requestId: req.requestId,
        },
      );

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

