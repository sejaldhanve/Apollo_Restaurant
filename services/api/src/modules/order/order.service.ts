import { withTenantContext } from "../../db/tenant-context.js";
import { AppError } from "../../utils/app-error.js";
import { AuditService } from "../../services/audit.service.js";
import { emitToLocation } from "../../services/socket.service.js";
import type {
  CreateOrderInput,
  UpdateOrderInput,
  AddOrderItemInput,
  UpdateOrderItemInput,
  SubmitOrderInput,
  UpdateOrderStatusInput,
  UpdateOrderItemStatusInput,
  CancelOrderInput,
} from "./order.schemas.js";
import type { OrderDto, OrderItemDto, OrderItemModifierDto, OrderStatus } from "@apollo/shared-types";

/**
 * Explicit state machine transition map.
 * Enforces valid restaurant order lifecycle:
 * DRAFT -> SUBMITTED -> IN_PREPARATION -> READY -> SERVED
 * (SERVED -> READY is permitted exclusively for authorized KDS Ticket Recall).
 * CANCELLED is terminal and only reachable via cancelOrder().
 */
export const VALID_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["IN_PREPARATION", "READY"],
  IN_PREPARATION: ["READY"],
  READY: ["SERVED"],
  SERVED: ["READY"], // Authorized KDS Ticket Recall workflow
  CANCELLED: [],     // Terminal state: cannot transition out
};

export class OrderService {
  /**
   * Helper to format an Order model to OrderDto
   */
  private static formatOrderDto(order: any): OrderDto {
    const items: OrderItemDto[] = (order.items || []).map((item: any) => ({
      id: item.id,
      orderId: item.orderId,
      menuItemId: item.menuItemId,
      kitchenStationId: item.kitchenStationId ?? null,
      kitchenStationName: item.kitchenStation?.name ?? null,
      name: item.name,
      basePriceCents: item.basePriceCents,
      quantity: item.quantity,
      subtotalCents: item.subtotalCents,
      taxRateBasisPoints: item.taxRateBasisPoints,
      taxCents: item.taxCents,
      totalCents: item.totalCents,
      status: item.status,
      specialInstructions: item.specialInstructions ?? null,
      modifiers: (item.modifiers || []).map((m: any): OrderItemModifierDto => ({
        id: m.id,
        modifierGroupId: m.modifierGroupId ?? null,
        modifierOptionId: m.modifierOptionId ?? null,
        groupName: m.groupName,
        optionName: m.optionName,
        priceDeltaCents: m.priceDeltaCents,
      })),
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : new Date().toISOString(),
    }));

    return {
      id: order.id,
      organizationId: order.organizationId,
      locationId: order.locationId,
      tableId: order.tableId ?? null,
      tableNumber: order.table?.tableNumber ?? null,
      diningAreaName: order.table?.diningArea?.name ?? null,
      tableSessionId: order.tableSessionId ?? null,
      serverUserId: order.serverUserId ?? null,
      serverName: order.server ? `${order.server.firstName} ${order.server.lastName}` : null,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      subtotalCents: order.subtotalCents,
      taxCents: order.taxCents,
      totalCents: order.totalCents,
      currency: order.currency,
      guestCount: order.guestCount,
      notes: order.notes ?? null,
      idempotencyKey: order.idempotencyKey ?? null,
      submittedAt: order.submittedAt ? new Date(order.submittedAt).toISOString() : null,
      preparedAt: order.preparedAt ? new Date(order.preparedAt).toISOString() : null,
      servedAt: order.servedAt ? new Date(order.servedAt).toISOString() : null,
      cancelledAt: order.cancelledAt ? new Date(order.cancelledAt).toISOString() : null,
      cancelReason: order.cancelReason ?? null,
      items,
      createdAt: order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: order.updatedAt ? new Date(order.updatedAt).toISOString() : new Date().toISOString(),
    };
  }

  /**
   * Helper to recalculate order subtotal, tax, and total from items
   */
  private static async recalculateOrderTotals(tx: any, orderId: string, orgId: string) {
    const items = await tx.orderItem.findMany({
      where: { orderId, organizationId: orgId, status: { not: "CANCELLED" } },
    });

    const subtotalCents = items.reduce((sum: number, it: any) => sum + it.subtotalCents, 0);
    const taxCents = items.reduce((sum: number, it: any) => sum + it.taxCents, 0);
    const totalCents = subtotalCents + taxCents;

    return tx.order.update({
      where: { id: orderId },
      data: {
        subtotalCents,
        taxCents,
        totalCents,
      },
    });
  }

  /**
   * Create a new draft order
   */
  static async createOrder(
    orgId: string,
    actorId: string,
    input: CreateOrderInput,
    requestId?: string,
  ): Promise<OrderDto> {
    return withTenantContext(orgId, async (tx) => {
      // Validate location belongs to organization
      const location = await tx.location.findFirst({
        where: { id: input.locationId, organizationId: orgId },
      });
      if (!location) {
        throw AppError.notFound("Location not found");
      }

      let activeSessionId = input.tableSessionId;
      let assignedServerId = input.serverUserId;

      // Validate table if specified
      if (input.tableId) {
        const table = await tx.table.findFirst({
          where: { id: input.tableId, organizationId: orgId, locationId: input.locationId },
          include: {
            sessions: {
              where: { status: "ACTIVE" },
              take: 1,
              orderBy: { seatedAt: "desc" },
            },
          },
        });
        if (!table) {
          throw AppError.notFound("Table not found in this location");
        }

        const activeSession = table.sessions && table.sessions.length > 0 ? table.sessions[0] : null;

        // Link active session if exists
        if (!activeSessionId && activeSession) {
          activeSessionId = activeSession.id;
        }

        // Inherit table's assigned server if not explicitly passed
        if (!assignedServerId) {
          assignedServerId = activeSession?.serverUserId || table.assignedServerId || actorId;
        }
      }

      // Generate human-readable order number e.g. ORD-6842
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const orderNumber = `ORD-${randomSuffix}`;

      const created = await tx.order.create({
        data: {
          organizationId: orgId,
          locationId: input.locationId,
          tableId: input.tableId || null,
          tableSessionId: activeSessionId || null,
          serverUserId: assignedServerId || actorId,
          orderNumber,
          status: "DRAFT",
          paymentStatus: "UNPAID",
          subtotalCents: 0,
          taxCents: 0,
          totalCents: 0,
          currency: location.currency || "USD",
          guestCount: input.guestCount || 1,
          notes: input.notes || null,
        },
        include: {
          table: { include: { diningArea: true } },
          server: { select: { id: true, firstName: true, lastName: true } },
          items: {
            include: {
              kitchenStation: true,
              modifiers: true,
            },
          },
        },
      });

      await AuditService.log({
        action: "ORDER_CREATED",
        organizationId: orgId,
        actorId,
        entityType: "order",
        entityId: created.id,
        metadata: { orderNumber: created.orderNumber, tableId: created.tableId },
        requestId,
      }, tx);

      const dto = OrderService.formatOrderDto(created);
      emitToLocation(orgId, input.locationId, "order:created", dto);
      return dto;
    });
  }

  /**
   * Update draft order metadata
   */
  static async updateOrder(
    orgId: string,
    actorId: string,
    orderId: string,
    input: UpdateOrderInput,
    requestId?: string,
  ): Promise<OrderDto> {
    return withTenantContext(orgId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, organizationId: orgId },
      });
      if (!order) {
        throw AppError.notFound("Order not found");
      }
      if (order.status !== "DRAFT") {
        throw AppError.badRequest("Only draft orders can be modified");
      }

      const updateData: any = {};
      if (input.guestCount !== undefined) updateData.guestCount = input.guestCount;
      if (input.notes !== undefined) updateData.notes = input.notes;
      if (input.serverUserId !== undefined) updateData.serverUserId = input.serverUserId;

      const updated = await tx.order.update({
        where: { id: order.id },
        data: updateData,
        include: {
          table: { include: { diningArea: true } },
          server: { select: { id: true, firstName: true, lastName: true } },
          items: {
            include: {
              kitchenStation: true,
              modifiers: true,
            },
          },
        },
      });

      await AuditService.log({
        action: "ORDER_UPDATED",
        organizationId: orgId,
        actorId,
        entityType: "order",
        entityId: order.id,
        metadata: updateData,
        requestId,
      }, tx);

      const dto = OrderService.formatOrderDto(updated);
      emitToLocation(orgId, order.locationId, "order:updated", dto);
      return dto;
    });
  }

  /**
   * Add a menu item with modifiers to a draft order
   */
  static async addOrderItem(
    orgId: string,
    actorId: string,
    orderId: string,
    input: AddOrderItemInput,
    requestId?: string,
  ): Promise<OrderDto> {
    return withTenantContext(orgId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, organizationId: orgId },
      });
      if (!order) {
        throw AppError.notFound("Order not found");
      }
      if (order.status !== "DRAFT") {
        throw AppError.badRequest(`Cannot add items to order with status ${order.status}`);
      }

      // Fetch MenuItem
      const menuItem = await tx.menuItem.findFirst({
        where: { id: input.menuItemId, organizationId: orgId },
        include: {
          taxRate: true,
          kitchenStation: true,
          modifierGroups: {
            include: {
              modifierGroup: {
                include: {
                  options: true,
                },
              },
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      });
      if (!menuItem) {
        throw AppError.notFound("Menu item not found");
      }

      // Check LocationMenuOverride
      const override = await tx.locationMenuOverride.findFirst({
        where: {
          organizationId: orgId,
          locationId: order.locationId,
          menuItemId: menuItem.id,
        },
      });

      const isAvailable = override?.isAvailable !== null && override?.isAvailable !== undefined
        ? override.isAvailable
        : menuItem.isAvailable;

      if (!isAvailable) {
        throw AppError.badRequest(`Menu item "${menuItem.name}" is currently 86'd / unavailable`);
      }

      const basePriceCents = override?.overridePriceCents !== null && override?.overridePriceCents !== undefined
        ? override.overridePriceCents
        : menuItem.basePriceCents;

      // Validate modifier selections against attached groups
      const attachedGroups = menuItem.modifierGroups.map((mg: any) => mg.modifierGroup);
      const selectedMods = input.selectedModifiers || [];

      // Group selections by modifierGroupId
      const selectionsByGroupId = new Map<string, string[]>();
      for (const sel of selectedMods) {
        const arr = selectionsByGroupId.get(sel.modifierGroupId) || [];
        arr.push(sel.modifierOptionId);
        selectionsByGroupId.set(sel.modifierGroupId, arr);
      }

      // Verify required modifier groups and min/max limits
      for (const group of attachedGroups) {
        const chosenOptions = selectionsByGroupId.get(group.id) || [];
        const count = chosenOptions.length;

        if (group.isRequired && count < 1) {
          throw AppError.badRequest(`Modifier group "${group.name}" is required`);
        }
        if (group.minSelections > 0 && count < group.minSelections) {
          throw AppError.badRequest(
            `Modifier group "${group.name}" requires at least ${group.minSelections} selection(s)`,
          );
        }
        if (group.maxSelections > 0 && count > group.maxSelections) {
          throw AppError.badRequest(
            `Modifier group "${group.name}" allows at most ${group.maxSelections} selection(s)`,
          );
        }
      }

      // Prepare snapshot of modifiers and calculate total modifier delta
      const modifierSnapshots: {
        modifierGroupId: string;
        modifierOptionId: string;
        groupName: string;
        optionName: string;
        priceDeltaCents: number;
      }[] = [];

      let modifierDeltaTotal = 0;
      for (const sel of selectedMods) {
        const group = attachedGroups.find((g: any) => g.id === sel.modifierGroupId);
        if (!group) {
          throw AppError.badRequest(`Modifier group ${sel.modifierGroupId} is not attached to this item`);
        }
        const option = group.options.find((opt: any) => opt.id === sel.modifierOptionId);
        if (!option) {
          throw AppError.badRequest(`Modifier option ${sel.modifierOptionId} not found in group "${group.name}"`);
        }
        if (!option.isAvailable) {
          throw AppError.badRequest(`Modifier option "${option.name}" is currently unavailable`);
        }

        modifierDeltaTotal += option.priceDeltaCents;
        modifierSnapshots.push({
          modifierGroupId: group.id,
          modifierOptionId: option.id,
          groupName: group.name,
          optionName: option.name,
          priceDeltaCents: option.priceDeltaCents,
        });
      }

      const quantity = input.quantity && input.quantity > 0 ? input.quantity : 1;
      const unitPriceCents = basePriceCents + modifierDeltaTotal;
      const subtotalCents = unitPriceCents * quantity;

      // Tax calculation
      const taxRateBasisPoints = menuItem.taxRate?.rateBasisPoints || 0;
      const taxCents = Math.round((subtotalCents * taxRateBasisPoints) / 10000);
      const totalCents = subtotalCents + taxCents;

      // Create OrderItem
      await tx.orderItem.create({
        data: {
          organizationId: orgId,
          orderId: order.id,
          menuItemId: menuItem.id,
          kitchenStationId: menuItem.kitchenStationId || null,
          name: menuItem.name,
          basePriceCents,
          quantity,
          subtotalCents,
          taxRateBasisPoints,
          taxCents,
          totalCents,
          status: "PENDING",
          specialInstructions: input.specialInstructions || null,
          modifiers: {
            create: modifierSnapshots.map((m) => ({
              organizationId: orgId,
              modifierGroupId: m.modifierGroupId,
              modifierOptionId: m.modifierOptionId,
              groupName: m.groupName,
              optionName: m.optionName,
              priceDeltaCents: m.priceDeltaCents,
            })),
          },
        },
      });

      // Recalculate order totals
      await OrderService.recalculateOrderTotals(tx, order.id, orgId);

      await AuditService.log({
        action: "ORDER_ITEM_ADDED",
        organizationId: orgId,
        actorId,
        entityType: "order",
        entityId: order.id,
        metadata: {
          menuItemId: menuItem.id,
          name: menuItem.name,
          quantity,
          subtotalCents,
        },
        requestId,
      }, tx);

      // Return refreshed full order
      const updatedOrder = await tx.order.findUnique({
        where: { id: order.id },
        include: {
          table: { include: { diningArea: true } },
          server: { select: { id: true, firstName: true, lastName: true } },
          items: {
            include: {
              kitchenStation: true,
              modifiers: true,
            },
          },
        },
      });

      const dto = OrderService.formatOrderDto(updatedOrder);
      emitToLocation(orgId, order.locationId, "order:updated", dto);
      return dto;
    });
  }

  /**
   * Update order item (quantity or special instructions)
   */
  static async updateOrderItem(
    orgId: string,
    actorId: string,
    orderId: string,
    itemId: string,
    input: UpdateOrderItemInput,
    requestId?: string,
  ): Promise<OrderDto> {
    return withTenantContext(orgId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, organizationId: orgId },
      });
      if (!order) {
        throw AppError.notFound("Order not found");
      }
      if (order.status !== "DRAFT") {
        throw AppError.badRequest("Only draft orders can have items modified");
      }

      const item = await tx.orderItem.findFirst({
        where: { id: itemId, orderId, organizationId: orgId },
        include: { modifiers: true },
      });
      if (!item) {
        throw AppError.notFound("Order item not found");
      }

      const newQuantity = input.quantity ?? item.quantity;
      if (newQuantity <= 0) {
        throw AppError.badRequest("Quantity must be greater than zero");
      }

      const modifierDelta = item.modifiers.reduce((sum: number, m: any) => sum + m.priceDeltaCents, 0);
      const unitPriceCents = item.basePriceCents + modifierDelta;
      const subtotalCents = unitPriceCents * newQuantity;
      const taxCents = Math.round((subtotalCents * item.taxRateBasisPoints) / 10000);
      const totalCents = subtotalCents + taxCents;

      await tx.orderItem.update({
        where: { id: itemId },
        data: {
          quantity: newQuantity,
          subtotalCents,
          taxCents,
          totalCents,
          specialInstructions: input.specialInstructions !== undefined ? input.specialInstructions : item.specialInstructions,
        },
      });

      await OrderService.recalculateOrderTotals(tx, order.id, orgId);

      await AuditService.log({
        action: "ORDER_ITEM_UPDATED",
        organizationId: orgId,
        actorId,
        entityType: "order",
        entityId: order.id,
        metadata: { itemId, newQuantity },
        requestId,
      }, tx);

      const updatedOrder = await tx.order.findUnique({
        where: { id: order.id },
        include: {
          table: { include: { diningArea: true } },
          server: { select: { id: true, firstName: true, lastName: true } },
          items: {
            include: {
              kitchenStation: true,
              modifiers: true,
            },
          },
        },
      });

      const dto = OrderService.formatOrderDto(updatedOrder);
      emitToLocation(orgId, order.locationId, "order:updated", dto);
      return dto;
    });
  }

  /**
   * Remove an item from a draft order
   */
  static async removeOrderItem(
    orgId: string,
    actorId: string,
    orderId: string,
    itemId: string,
    requestId?: string,
  ): Promise<OrderDto> {
    return withTenantContext(orgId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, organizationId: orgId },
      });
      if (!order) {
        throw AppError.notFound("Order not found");
      }
      if (order.status !== "DRAFT") {
        throw AppError.badRequest("Only draft orders can have items removed");
      }

      const item = await tx.orderItem.findFirst({
        where: { id: itemId, orderId, organizationId: orgId },
      });
      if (!item) {
        throw AppError.notFound("Order item not found");
      }

      await tx.orderItem.delete({
        where: { id: itemId },
      });

      await OrderService.recalculateOrderTotals(tx, order.id, orgId);

      await AuditService.log({
        action: "ORDER_ITEM_REMOVED",
        organizationId: orgId,
        actorId,
        entityType: "order",
        entityId: order.id,
        metadata: { itemId },
        requestId,
      }, tx);

      const updatedOrder = await tx.order.findUnique({
        where: { id: order.id },
        include: {
          table: { include: { diningArea: true } },
          server: { select: { id: true, firstName: true, lastName: true } },
          items: {
            include: {
              kitchenStation: true,
              modifiers: true,
            },
          },
        },
      });

      const dto = OrderService.formatOrderDto(updatedOrder);
      emitToLocation(orgId, order.locationId, "order:updated", dto);
      return dto;
    });
  }

  /**
   * Submit draft order to kitchen with idempotency
   */
  static async submitOrder(
    orgId: string,
    actorId: string,
    orderId: string,
    input: SubmitOrderInput,
    requestId?: string,
  ): Promise<OrderDto> {
    return withTenantContext(orgId, async (tx) => {
      // 1. Idempotency Check: if this idempotency key was already processed, return existing order
      const existing = await tx.order.findFirst({
        where: { organizationId: orgId, idempotencyKey: input.idempotencyKey },
        include: {
          table: { include: { diningArea: true } },
          server: { select: { id: true, firstName: true, lastName: true } },
          items: {
            include: {
              kitchenStation: true,
              modifiers: true,
            },
          },
        },
      });

      if (existing) {
        return OrderService.formatOrderDto(existing);
      }

      // 2. Fetch target order
      const order = await tx.order.findFirst({
        where: { id: orderId, organizationId: orgId },
        include: {
          items: true,
        },
      });
      if (!order) {
        throw AppError.notFound("Order not found");
      }
      if (order.status !== "DRAFT") {
        throw AppError.badRequest(`Order is already ${order.status}`);
      }
      if (order.items.length === 0) {
        throw AppError.badRequest("Cannot submit an empty order without items");
      }

      // 3. Update order status to SUBMITTED
      const now = new Date();
      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: "SUBMITTED",
          submittedAt: now,
          idempotencyKey: input.idempotencyKey,
        },
        include: {
          table: { include: { diningArea: true } },
          server: { select: { id: true, firstName: true, lastName: true } },
          items: {
            include: {
              kitchenStation: true,
              modifiers: true,
            },
          },
        },
      });

      // 4. Update associated table status to ORDERED if table is attached
      if (order.tableId) {
        await tx.table.update({
          where: { id: order.tableId },
          data: { status: "ORDERED" },
        });
      }

      await AuditService.log({
        action: "ORDER_SUBMITTED",
        organizationId: orgId,
        actorId,
        entityType: "order",
        entityId: order.id,
        metadata: {
          orderNumber: order.orderNumber,
          totalCents: order.totalCents,
          itemCount: order.items.length,
          idempotencyKey: input.idempotencyKey,
        },
        requestId,
      }, tx);

      const dto = OrderService.formatOrderDto(updated);
      emitToLocation(orgId, order.locationId, "order:submitted", dto);
      return dto;
    });
  }

  /**
   * Update order status (KDS / Expediter state machine)
   */
  static async updateOrderStatus(
    orgId: string,
    actorId: string,
    orderId: string,
    input: UpdateOrderStatusInput,
    requestId?: string,
  ): Promise<OrderDto> {
    return withTenantContext(orgId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, organizationId: orgId },
        include: { items: true },
      });
      if (!order) {
        throw AppError.notFound("Order not found");
      }

      if (order.status === "CANCELLED") {
        throw AppError.badRequest("Cannot update status of a cancelled order");
      }

      const newStatus = input.status;

      if (newStatus === "CANCELLED") {
        throw AppError.badRequest("Cancellation must be performed via the cancellation endpoint");
      }

      if (newStatus === order.status) {
        throw AppError.badRequest(`Order is already ${order.status}`);
      }

      const allowedTransitions = VALID_ORDER_TRANSITIONS[order.status] || [];
      if (!allowedTransitions.includes(newStatus)) {
        throw AppError.badRequest(
          `Invalid order status transition from ${order.status} to ${newStatus}`,
        );
      }

      const now = new Date();
      const updateData: any = { status: newStatus };

      if (newStatus === "IN_PREPARATION") {
        // Update pending items to IN_PREPARATION
        await tx.orderItem.updateMany({
          where: { orderId: order.id, organizationId: orgId, status: "PENDING" },
          data: { status: "IN_PREPARATION" },
        });
      } else if (newStatus === "READY") {
        updateData.preparedAt = now;
        // If coming from SERVED (KDS Ticket Recall), revert served items back to READY
        if (order.status === "SERVED") {
          await tx.orderItem.updateMany({
            where: {
              orderId: order.id,
              organizationId: orgId,
              status: "SERVED",
            },
            data: { status: "READY" },
          });
          // Also revert table back to ORDERED if it was marked SERVED
          if (order.tableId) {
            await tx.table.update({
              where: { id: order.tableId },
              data: { status: "ORDERED" },
            });
          }
        } else {
          await tx.orderItem.updateMany({
            where: {
              orderId: order.id,
              organizationId: orgId,
              status: { in: ["PENDING", "IN_PREPARATION"] },
            },
            data: { status: "READY" },
          });
        }
      } else if (newStatus === "SERVED") {
        updateData.servedAt = now;
        await tx.orderItem.updateMany({
          where: {
            orderId: order.id,
            organizationId: orgId,
            status: { not: "CANCELLED" },
          },
          data: { status: "SERVED" },
        });

        // If table attached, update table to SERVED
        if (order.tableId) {
          await tx.table.update({
            where: { id: order.tableId },
            data: { status: "SERVED" },
          });
        }
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: updateData,
        include: {
          table: { include: { diningArea: true } },
          server: { select: { id: true, firstName: true, lastName: true } },
          items: {
            include: {
              kitchenStation: true,
              modifiers: true,
            },
          },
        },
      });

      await AuditService.log({
        action: "ORDER_STATUS_CHANGED",
        organizationId: orgId,
        actorId,
        entityType: "order",
        entityId: order.id,
        metadata: { from: order.status, to: newStatus },
        requestId,
      }, tx);

      const dto = OrderService.formatOrderDto(updated);
      emitToLocation(orgId, order.locationId, "order:status_changed", dto);
      return dto;
    });
  }

  /**
   * Update single line item status (KDS per-station bump)
   * Automatically advances order to READY when all active items are ready or served.
   */
  static async updateOrderItemStatus(
    orgId: string,
    actorId: string,
    orderId: string,
    itemId: string,
    input: UpdateOrderItemStatusInput,
    requestId?: string,
  ): Promise<OrderDto> {
    return withTenantContext(orgId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, organizationId: orgId },
      });
      if (!order) {
        throw AppError.notFound("Order not found");
      }

      if (order.status === "CANCELLED") {
        throw AppError.badRequest("Cannot update items of a cancelled order");
      }

      if (order.status === "DRAFT") {
        throw AppError.badRequest("Cannot update item preparation status for draft orders");
      }

      const item = await tx.orderItem.findFirst({
        where: { id: itemId, orderId, organizationId: orgId },
      });
      if (!item) {
        throw AppError.notFound("Order item not found");
      }

      if (item.status === "CANCELLED") {
        throw AppError.badRequest("Cannot update a cancelled item");
      }

      await tx.orderItem.update({
        where: { id: itemId },
        data: { status: input.status },
      });

      // Check all active items across all kitchen stations
      // Cancelled items are excluded and do NOT block readiness
      const allActiveItems = await tx.orderItem.findMany({
        where: { orderId: order.id, organizationId: orgId, status: { not: "CANCELLED" } },
      });

      let orderStatusToSet: OrderStatus | undefined;
      const now = new Date();
      const orderUpdateData: any = {};

      if (allActiveItems.length > 0) {
        const allServed = allActiveItems.every((it: any) => it.status === "SERVED");
        const allReadyOrServed = allActiveItems.every(
          (it: any) => it.status === "READY" || it.status === "SERVED",
        );
        const anyInPrep = allActiveItems.some((it: any) => it.status === "IN_PREPARATION");

        if (allServed && order.status !== "SERVED") {
          orderStatusToSet = "SERVED";
          orderUpdateData.status = "SERVED";
          orderUpdateData.servedAt = now;
          if (order.tableId) {
            await tx.table.update({
              where: { id: order.tableId },
              data: { status: "SERVED" },
            });
          }
        } else if (
          allReadyOrServed &&
          (order.status === "SUBMITTED" || order.status === "IN_PREPARATION")
        ) {
          orderStatusToSet = "READY";
          orderUpdateData.status = "READY";
          orderUpdateData.preparedAt = now;
        } else if (anyInPrep && order.status === "SUBMITTED") {
          // When first item starts preparation, advance order to IN_PREPARATION
          orderStatusToSet = "IN_PREPARATION";
          orderUpdateData.status = "IN_PREPARATION";
        }
      }

      if (orderStatusToSet) {
        await tx.order.update({
          where: { id: order.id },
          data: orderUpdateData,
        });

        await AuditService.log({
          action: "ORDER_STATUS_CHANGED",
          organizationId: orgId,
          actorId,
          entityType: "order",
          entityId: order.id,
          metadata: { from: order.status, to: orderStatusToSet, reason: "kitchen_auto_advance" },
          requestId,
        }, tx);
      }

      await AuditService.log({
        action: "ORDER_ITEM_STATUS_UPDATED",
        organizationId: orgId,
        actorId,
        entityType: "order_item",
        entityId: itemId,
        metadata: { from: item.status, to: input.status },
        requestId,
      }, tx);

      const updated = await tx.order.findUnique({
        where: { id: order.id },
        include: {
          table: { include: { diningArea: true } },
          server: { select: { id: true, firstName: true, lastName: true } },
          items: {
            include: {
              kitchenStation: true,
              modifiers: true,
            },
          },
        },
      });

      const dto = OrderService.formatOrderDto(updated);
      emitToLocation(orgId, order.locationId, "order:updated", dto);
      if (orderStatusToSet) {
        emitToLocation(orgId, order.locationId, "order:status_changed", dto);
      }
      return dto;
    });
  }

  /**
   * Cancel an order
   */
  static async cancelOrder(
    orgId: string,
    actorId: string,
    orderId: string,
    input: CancelOrderInput,
    requestId?: string,
  ): Promise<OrderDto> {
    return withTenantContext(orgId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, organizationId: orgId },
      });
      if (!order) {
        throw AppError.notFound("Order not found");
      }
      if (order.status === "SERVED") {
        throw AppError.badRequest("Cannot cancel an order that is already served");
      }
      if (order.status === "CANCELLED") {
        throw AppError.badRequest("Order is already cancelled");
      }

      const now = new Date();
      await tx.orderItem.updateMany({
        where: { orderId: order.id, organizationId: orgId },
        data: { status: "CANCELLED" },
      });

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          cancelReason: input.reason || "Cancelled by user",
        },
        include: {
          table: { include: { diningArea: true } },
          server: { select: { id: true, firstName: true, lastName: true } },
          items: {
            include: {
              kitchenStation: true,
              modifiers: true,
            },
          },
        },
      });

      await AuditService.log({
        action: "ORDER_CANCELLED",
        organizationId: orgId,
        actorId,
        entityType: "order",
        entityId: order.id,
        metadata: { reason: input.reason },
        requestId,
      }, tx);

      const dto = OrderService.formatOrderDto(updated);
      emitToLocation(orgId, order.locationId, "order:cancelled", dto);
      return dto;
    });
  }

  /**
   * Get orders with filtering
   */
  static async getOrders(
    orgId: string,
    params: {
      locationId: string;
      status?: OrderStatus;
      tableId?: string;
      serverUserId?: string;
      activeOnly?: boolean;
    },
  ): Promise<OrderDto[]> {
    return withTenantContext(orgId, async (tx) => {
      const where: any = {
        organizationId: orgId,
        locationId: params.locationId,
      };

      if (params.status) {
        where.status = params.status;
      } else if (params.activeOnly) {
        where.status = { in: ["SUBMITTED", "IN_PREPARATION", "READY"] };
      }

      if (params.tableId) {
        where.tableId = params.tableId;
      }

      if (params.serverUserId) {
        where.serverUserId = params.serverUserId;
      }

      const orders = await tx.order.findMany({
        where,
        include: {
          table: { include: { diningArea: true } },
          server: { select: { id: true, firstName: true, lastName: true } },
          items: {
            include: {
              kitchenStation: true,
              modifiers: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return orders.map((o: any) => OrderService.formatOrderDto(o));
    });
  }

  /**
   * Get single order by ID
   */
  static async getOrderById(orgId: string, orderId: string): Promise<OrderDto> {
    return withTenantContext(orgId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, organizationId: orgId },
        include: {
          table: { include: { diningArea: true } },
          server: { select: { id: true, firstName: true, lastName: true } },
          items: {
            include: {
              kitchenStation: true,
              modifiers: true,
            },
          },
        },
      });

      if (!order) {
        throw AppError.notFound("Order not found");
      }

      return OrderService.formatOrderDto(order);
    });
  }
}
