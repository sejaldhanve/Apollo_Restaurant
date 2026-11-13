import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { ApiSuccessResponse } from "@apollo/shared-types";
import { authenticate } from "../../middleware/authenticate.js";
import {
  requirePermission,
  requireOrganizationMembership,
} from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { FoHService } from "./foh.service.js";
import {
  createDiningAreaSchema,
  updateDiningAreaSchema,
  createTableSchema,
  updateTableSchema,
  updateTableLayoutSchema,
  seatTableSchema,
  updateTableStatusSchema,
  transferTableSchema,
  type CreateDiningAreaInput,
  type UpdateDiningAreaInput,
  type CreateTableInput,
  type UpdateTableInput,
  type UpdateTableLayoutInput,
  type SeatTableInput,
  type UpdateTableStatusInput,
  type TransferTableInput,
} from "./foh.schemas.js";

export const fohRouter: Router = Router();

// Protect all FoH routes with JWT authentication and organization context
fohRouter.use(authenticate);
fohRouter.use(requireOrganizationMembership());

// ─── Floor Plan & Dining Areas ───────────────────────────────────────────────

/**
 * GET /foh/locations/:locationId/floor-plan
 * Retrieves complete floor plan with dining areas, tables, and active sessions.
 */
fohRouter.get(
  "/locations/:locationId/floor-plan",
  requirePermission("table:view"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const locationId = req.params.locationId as string;
      const result = await FoHService.getFloorPlan(orgId, locationId);

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
 * POST /foh/dining-areas
 * Creates a new dining room section.
 */
fohRouter.post(
  "/dining-areas",
  requirePermission("table:manage"),
  validate({ body: createDiningAreaSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const input = req.body as CreateDiningAreaInput;

      const result = await FoHService.createDiningArea(orgId, actorId, input, {
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
 * PUT /foh/dining-areas/:id
 * Updates an existing dining area.
 */
fohRouter.put(
  "/dining-areas/:id",
  requirePermission("table:manage"),
  validate({ body: updateDiningAreaSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const id = req.params.id as string;
      const input = req.body as UpdateDiningAreaInput;

      const result = await FoHService.updateDiningArea(orgId, actorId, id, input, {
        ip: req.ip,
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

// ─── Tables ─────────────────────────────────────────────────────────────────

/**
 * POST /foh/tables
 * Creates a physical table within a dining area.
 */
fohRouter.post(
  "/tables",
  requirePermission("table:manage"),
  validate({ body: createTableSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const input = req.body as CreateTableInput;

      const result = await FoHService.createTable(orgId, actorId, input, {
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
 * PUT /foh/tables/:id
 * Updates table properties.
 */
fohRouter.put(
  "/tables/:id",
  requirePermission("table:manage"),
  validate({ body: updateTableSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const id = req.params.id as string;
      const input = req.body as UpdateTableInput;

      const result = await FoHService.updateTable(orgId, actorId, id, input, {
        ip: req.ip,
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
 * PUT /foh/locations/:locationId/tables/layout
 * Bulk updates 2D positions, dimensions, and rotation for floor plan designer.
 */
fohRouter.put(
  "/locations/:locationId/tables/layout",
  requirePermission("table:manage"),
  validate({ body: updateTableLayoutSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const locationId = req.params.locationId as string;
      const input = req.body as UpdateTableLayoutInput;

      const result = await FoHService.updateTableLayout(
        orgId,
        actorId,
        locationId,
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

// ─── Table Seating & Status State Machine ───────────────────────────────────

/**
 * POST /foh/tables/:id/seat
 * Seats a party at a table, creating an active TableSession.
 */
fohRouter.post(
  "/tables/:id/seat",
  requirePermission("table:seat"),
  validate({ body: seatTableSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const tableId = req.params.id as string;
      const input = req.body as SeatTableInput;

      const result = await FoHService.seatTable(orgId, actorId, tableId, input, {
        ip: req.ip,
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
 * PATCH /foh/tables/:id/status
 * Manually transitions table status across state machine.
 */
fohRouter.patch(
  "/tables/:id/status",
  requirePermission("table:status_update"),
  validate({ body: updateTableStatusSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const tableId = req.params.id as string;
      const input = req.body as UpdateTableStatusInput;

      const result = await FoHService.updateTableStatus(
        orgId,
        actorId,
        tableId,
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
 * POST /foh/tables/:id/transfer
 * Transfers table party or server assignment.
 */
fohRouter.post(
  "/tables/:id/transfer",
  requirePermission("table:transfer"),
  validate({ body: transferTableSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const tableId = req.params.id as string;
      const input = req.body as TransferTableInput;

      const result = await FoHService.transferTable(orgId, actorId, tableId, input, {
        ip: req.ip,
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
