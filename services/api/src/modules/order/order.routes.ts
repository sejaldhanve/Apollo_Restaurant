import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { ApiSuccessResponse } from "@apollo/shared-types";
import { authenticate } from "../../middleware/authenticate.js";
import {
  requirePermission,
  requireOrganizationMembership,
} from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { OrderService } from "./order.service.js";
import {
  createOrderSchema,
  updateOrderSchema,
  addOrderItemSchema,
  updateOrderItemSchema,
  submitOrderSchema,
  updateOrderStatusSchema,
  updateOrderItemStatusSchema,
  cancelOrderSchema,
  type CreateOrderInput,
  type UpdateOrderInput,
  type AddOrderItemInput,
  type UpdateOrderItemInput,
  type SubmitOrderInput,
  type UpdateOrderStatusInput,
  type UpdateOrderItemStatusInput,
  type CancelOrderInput,
} from "./order.schemas.js";

export const orderRouter: Router = Router();

// Protect all order routes with JWT authentication and organization context
orderRouter.use(authenticate);
orderRouter.use(requireOrganizationMembership());

/**
 * GET /orders
 * List orders filtered by location, status, table, server.
 */
orderRouter.get(
  "/",
  requirePermission("order:view"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const locationId =
        (req.query.locationId as string) ||
        (req.headers["x-location-id"] as string);
      const clientLocationId =
        (req.headers["x-location-id"] as string) || undefined;
      const status = req.query.status as any;
      const tableId = req.query.tableId as string | undefined;
      const serverUserId = req.query.serverUserId as string | undefined;
      const activeOnly = req.query.activeOnly === "true";

      const orders = await OrderService.getOrders(
        orgId,
        actorId,
        {
          locationId,
          status,
          tableId,
          serverUserId,
          activeOnly,
        },
        clientLocationId,
      );

      const response: ApiSuccessResponse<typeof orders> = {
        success: true,
        data: orders,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /orders/kitchen/active
 * Retrieve all active kitchen orders (SUBMITTED, IN_PREPARATION, READY) for a location.
 * Excludes cancelled and completed orders. Enforces location access authorization.
 */
orderRouter.get(
  "/kitchen/active",
  requirePermission("order:view"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const locationId =
        (req.query.locationId as string) ||
        (req.headers["x-location-id"] as string);
      const clientLocationId =
        (req.headers["x-location-id"] as string) || undefined;

      const orders = await OrderService.getActiveKitchenOrders(
        orgId,
        actorId,
        locationId,
        clientLocationId,
      );

      const response: ApiSuccessResponse<typeof orders> = {
        success: true,
        data: orders,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /orders/:id
 * Retrieve a single order with its items, modifiers, table, and server.
 */
orderRouter.get(
  "/:id",
  requirePermission("order:view"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const orderId = req.params.id as string;
      const clientLocationId =
        (req.headers["x-location-id"] as string) || undefined;
      const order = await OrderService.getOrderById(
        orgId,
        orderId,
        actorId,
        clientLocationId,
      );

      const response: ApiSuccessResponse<typeof order> = {
        success: true,
        data: order,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /orders
 * Create a new draft order.
 */
orderRouter.post(
  "/",
  requirePermission("order:create"),
  validate(createOrderSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const input = req.body as CreateOrderInput;
      const clientLocationId =
        (req.headers["x-location-id"] as string) || undefined;

      const order = await OrderService.createOrder(
        orgId,
        actorId,
        input,
        req.requestId,
        clientLocationId,
      );

      const response: ApiSuccessResponse<typeof order> = {
        success: true,
        data: order,
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /orders/:id
 * Update draft order metadata.
 */
orderRouter.patch(
  "/:id",
  requirePermission("order:manage"),
  validate(updateOrderSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const orderId = req.params.id as string;
      const input = req.body as UpdateOrderInput;
      const clientLocationId =
        (req.headers["x-location-id"] as string) || undefined;

      const order = await OrderService.updateOrder(
        orgId,
        actorId,
        orderId,
        input,
        req.requestId,
        clientLocationId,
      );

      const response: ApiSuccessResponse<typeof order> = {
        success: true,
        data: order,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /orders/:id/items
 * Add an item with optional modifiers to a draft order.
 */
orderRouter.post(
  "/:id/items",
  requirePermission("order:create"),
  validate(addOrderItemSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const orderId = req.params.id as string;
      const input = req.body as AddOrderItemInput;
      const clientLocationId =
        (req.headers["x-location-id"] as string) || undefined;

      const order = await OrderService.addOrderItem(
        orgId,
        actorId,
        orderId,
        input,
        req.requestId,
        clientLocationId,
      );

      const response: ApiSuccessResponse<typeof order> = {
        success: true,
        data: order,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /orders/:id/items/:itemId
 * Update line item quantity or special instructions.
 */
orderRouter.patch(
  "/:id/items/:itemId",
  requirePermission("order:create"),
  validate(updateOrderItemSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const orderId = req.params.id as string;
      const itemId = req.params.itemId as string;
      const input = req.body as UpdateOrderItemInput;
      const clientLocationId =
        (req.headers["x-location-id"] as string) || undefined;

      const order = await OrderService.updateOrderItem(
        orgId,
        actorId,
        orderId,
        itemId,
        input,
        req.requestId,
        clientLocationId,
      );

      const response: ApiSuccessResponse<typeof order> = {
        success: true,
        data: order,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /orders/:id/items/:itemId
 * Remove a line item from a draft order.
 */
orderRouter.delete(
  "/:id/items/:itemId",
  requirePermission("order:create"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const orderId = req.params.id as string;
      const itemId = req.params.itemId as string;
      const clientLocationId =
        (req.headers["x-location-id"] as string) || undefined;

      const order = await OrderService.removeOrderItem(
        orgId,
        actorId,
        orderId,
        itemId,
        req.requestId,
        clientLocationId,
      );

      const response: ApiSuccessResponse<typeof order> = {
        success: true,
        data: order,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /orders/:id/submit
 * Submit order to kitchen (transitions DRAFT -> SUBMITTED, updates table status, triggers KDS).
 */
orderRouter.post(
  "/:id/submit",
  requirePermission("order:create"),
  validate(submitOrderSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const orderId = req.params.id as string;
      const input = req.body as SubmitOrderInput;
      const clientLocationId =
        (req.headers["x-location-id"] as string) || undefined;

      const order = await OrderService.submitOrder(
        orgId,
        actorId,
        orderId,
        input,
        req.requestId,
        clientLocationId,
      );

      const response: ApiSuccessResponse<typeof order> = {
        success: true,
        data: order,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /orders/:id/status
 * Transition order status (e.g. SUBMITTED -> IN_PREPARATION -> READY -> SERVED).
 */
orderRouter.patch(
  "/:id/status",
  requirePermission("order:manage"),
  validate(updateOrderStatusSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const orderId = req.params.id as string;
      const input = req.body as UpdateOrderStatusInput;
      const clientLocationId =
        (req.headers["x-location-id"] as string) || undefined;

      const order = await OrderService.updateOrderStatus(
        orgId,
        actorId,
        orderId,
        input,
        req.requestId,
        clientLocationId,
      );

      const response: ApiSuccessResponse<typeof order> = {
        success: true,
        data: order,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /orders/:id/items/:itemId/status
 * Bump single item status in KDS.
 */
orderRouter.patch(
  "/:id/items/:itemId/status",
  requirePermission("order:manage"),
  validate(updateOrderItemStatusSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const orderId = req.params.id as string;
      const itemId = req.params.itemId as string;
      const input = req.body as UpdateOrderItemStatusInput;
      const clientLocationId =
        (req.headers["x-location-id"] as string) || undefined;

      const order = await OrderService.updateOrderItemStatus(
        orgId,
        actorId,
        orderId,
        itemId,
        input,
        req.requestId,
        clientLocationId,
      );

      const response: ApiSuccessResponse<typeof order> = {
        success: true,
        data: order,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /orders/:id/cancel
 * Cancel order.
 */
orderRouter.post(
  "/:id/cancel",
  requirePermission("order:void"),
  validate(cancelOrderSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = req.organizationId!;
      const actorId = req.user!.id;
      const orderId = req.params.id as string;
      const input = req.body as CancelOrderInput;
      const clientLocationId =
        (req.headers["x-location-id"] as string) || undefined;

      const order = await OrderService.cancelOrder(
        orgId,
        actorId,
        orderId,
        input,
        req.requestId,
        clientLocationId,
      );

      const response: ApiSuccessResponse<typeof order> = {
        success: true,
        data: order,
      };
      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  },
);
