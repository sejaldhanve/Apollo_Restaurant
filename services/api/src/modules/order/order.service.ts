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
import type {
  OrderDto,
  OrderItemDto,
  OrderItemModifierDto,
  OrderStatus,
  TableStatus,
} from "@apollo/shared-types";

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
  CANCELLED: [], // Terminal state: cannot transition out
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
      createdAt: item.createdAt
        ? new Date(item.createdAt).toISOString()
        : new Date().toISOString(),
      updatedAt: item.updatedAt
        ? new Date(item.updatedAt).toISOString()
        : new Date().toISOString(),
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
      serverName: order.server
        ? `${order.server.firstName} ${order.server.lastName}`
        : null,
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
      submittedAt: order.submittedAt
        ? new Date(order.submittedAt).toISOString()
        : null,
      preparedAt: order.preparedAt
        ? new Date(order.preparedAt).toISOString()
        : null,
      servedAt: order.servedAt ? new Date(order.servedAt).toISOString() : null,
      cancelledAt: order.cancelledAt
        ? new Date(order.cancelledAt).toISOString()
        : null,
      cancelReason: order.cancelReason ?? null,
      items,
      createdAt: order.createdAt
        ? new Date(order.createdAt).toISOString()
        : new Date().toISOString(),
      updatedAt: order.updatedAt
        ? new Date(order.updatedAt).toISOString()
        : new Date().toISOString(),
    };
  }

  /**
   * Helper to acquire exclusive row lock on an order within the tenant context.
   */
  private static async lockOrderRow(
    tx: any,
    orgId: string,
    orderId: string,
  ): Promise<void> {
    if (typeof tx.$queryRaw === "function") {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} AND "organizationId" = ${orgId} FOR UPDATE`;
    }
  }

  /**
   * Helper to acquire exclusive row lock on a table or session within the tenant context.
   */
  private static async lockTableOrSessionRow(
    tx: any,
    orgId: string,
    tableId?: string | null,
    sessionId?: string | null,
  ): Promise<void> {
    if (typeof tx.$queryRaw === "function") {
      if (tableId) {
        await tx.$queryRaw`SELECT id FROM tables WHERE id = ${tableId} AND "organizationId" = ${orgId} FOR UPDATE`;
      } else if (sessionId) {
        await tx.$queryRaw`SELECT id FROM table_sessions WHERE id = ${sessionId} AND "organizationId" = ${orgId} FOR UPDATE`;
      }
    }
  }

  /**
   * Helper to validate that:
   * 1. If clientLocationId is provided, it matches the target locationId (rejects with 400 Bad Request).
   * 2. The location exists and belongs to the specified organization (rejects with 404 Not Found).
   * 3. The actor has active membership and location authorization (either org-wide admin or assigned location membership, rejects with 403 Forbidden).
   */
  public static async validateLocationAccess(
    tx: any,
    orgId: string,
    actorId: string | undefined,
    locationId: string,
    clientLocationId?: string,
  ): Promise<any> {
    if (clientLocationId && clientLocationId !== locationId) {
      throw AppError.badRequest(
        "Order does not belong to the specified location",
      );
    }

    // 1. Verify location exists and belongs to organization
    let location: any = null;
    if (tx.location && typeof tx.location.findFirst === "function") {
      location = await tx.location.findFirst({
        where: { id: locationId, organizationId: orgId },
      });
      if (!location) {
        throw AppError.notFound("Location not found");
      }
    }

    // 2. Verify actor's location access if actorId is provided and organizationMembership is available on tx
    if (
      actorId &&
      tx.organizationMembership &&
      typeof tx.organizationMembership.findUnique === "function"
    ) {
      const membership = await tx.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: actorId,
            organizationId: orgId,
          },
        },
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
          locationMemberships: true,
        },
      });

      if (!membership || membership.status !== "ACTIVE") {
        throw AppError.forbidden(
          "Access denied: You do not have an active membership in this organization",
        );
      }

      const roleName = membership.role?.name || "";
      const permissions = new Set<string>(
        membership.role?.permissions?.map(
          (rp: any) => rp.permission?.code || rp.permission,
        ) || [],
      );

      const isOrgWideAdmin =
        roleName === "Owner" ||
        roleName === "Organization Owner" ||
        roleName === "Admin" ||
        permissions.has("org:manage") ||
        permissions.has("*");

      const hasLocationAccess =
        isOrgWideAdmin ||
        (membership.locationMemberships || []).some(
          (lm: any) => lm.locationId === locationId,
        );

      if (!hasLocationAccess) {
        throw AppError.forbidden(
          "Access denied: You are not authorized for this location",
        );
      }
    }

    return location;
  }

  /**
   * Helper to validate selected modifiers against attached modifier groups for a menu item.
   * Enforces:
   * - Modifier groups must be attached to the menu item.
   * - Selected modifier options must belong to the modifier group and be available (not 86'd).
   * - No duplicate modifier options within the same modifier group.
   * - Required groups and minSelections / maxSelections rules.
   * - Authoritative server-side price calculation (client prices / deltas are never trusted).
   */
  public static validateAndSnapshotModifiers(
    menuItem: any,
    selectedMods: {
      modifierGroupId: string;
      modifierOptionId: string;
      [key: string]: any;
    }[],
  ): {
    modifierSnapshots: {
      modifierGroupId: string;
      modifierOptionId: string;
      groupName: string;
      optionName: string;
      priceDeltaCents: number;
    }[];
    modifierDeltaTotal: number;
  } {
    const attachedGroups = (menuItem.modifierGroups || []).map(
      (mg: any) => mg.modifierGroup,
    );
    const attachedGroupMap = new Map<string, any>(
      attachedGroups.map((g: any) => [g.id, g]),
    );

    // Group and validate selections per modifier group
    const selectionsByGroupId = new Map<
      string,
      { optionIds: Set<string>; options: any[] }
    >();

    for (const sel of selectedMods) {
      const group = attachedGroupMap.get(sel.modifierGroupId);
      if (!group) {
        throw AppError.badRequest(
          `Modifier group "${sel.modifierGroupId}" is not attached to this item`,
        );
      }

      let groupSelections = selectionsByGroupId.get(group.id);
      if (!groupSelections) {
        groupSelections = { optionIds: new Set<string>(), options: [] };
        selectionsByGroupId.set(group.id, groupSelections);
      }

      if (groupSelections.optionIds.has(sel.modifierOptionId)) {
        throw AppError.badRequest(
          `Duplicate modifier option "${sel.modifierOptionId}" submitted within modifier group "${group.name}"`,
        );
      }

      const option = (group.options || []).find(
        (opt: any) => opt.id === sel.modifierOptionId,
      );
      if (!option) {
        throw AppError.badRequest(
          `Modifier option "${sel.modifierOptionId}" not found in group "${group.name}"`,
        );
      }

      if (!option.isAvailable) {
        throw AppError.badRequest(
          `Modifier option "${option.name}" is currently unavailable`,
        );
      }

      groupSelections.optionIds.add(sel.modifierOptionId);
      groupSelections.options.push(option);
    }

    // Verify required modifier groups and min/max limits
    for (const group of attachedGroups) {
      const groupSelections = selectionsByGroupId.get(group.id);
      const count = groupSelections ? groupSelections.options.length : 0;

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

    // Prepare authoritative snapshot of modifiers and calculate total modifier delta
    const modifierSnapshots: {
      modifierGroupId: string;
      modifierOptionId: string;
      groupName: string;
      optionName: string;
      priceDeltaCents: number;
    }[] = [];

    let modifierDeltaTotal = 0;
    for (const sel of selectedMods) {
      const group = attachedGroupMap.get(sel.modifierGroupId)!;
      const option = (group.options || []).find(
        (opt: any) => opt.id === sel.modifierOptionId,
      )!;

      modifierDeltaTotal += option.priceDeltaCents;
      modifierSnapshots.push({
        modifierGroupId: group.id,
        modifierOptionId: option.id,
        groupName: group.name,
        optionName: option.name,
        priceDeltaCents: option.priceDeltaCents,
      });
    }

    return { modifierSnapshots, modifierDeltaTotal };
  }

  /**
   * Derives and updates the aggregate table status based on all active orders and sessions for the table.
   *
   * Business rules:
   * - Never mark a table SERVED while another active order is SUBMITTED, IN_PREPARATION, or READY.
   * - When all submitted orders for a table are SERVED, transition table status to SERVED.
   * - Ticket recall (moving an order from SERVED -> READY) returns table status to ORDERED.
   * - If no submitted orders remain (e.g. only drafts or all cancelled):
   *     - If an active TableSession exists, table is SEATED.
   *     - Else table is AVAILABLE.
   * - Preserves manual operational states: BLOCKED, DIRTY, RESERVED.
   */
  public static async deriveAndUpdateTableStatus(
    tx: any,
    orgId: string,
    tableId: string,
  ): Promise<void> {
    if (!tx.table || typeof tx.table.findFirst !== "function") {
      return;
    }

    const table = await tx.table.findFirst({
      where: { id: tableId, organizationId: orgId },
      include: {
        sessions: {
          where: { status: "ACTIVE" },
          take: 1,
        },
      },
    });

    if (!table) return;

    // Do not overwrite manual operational states
    if (["BLOCKED", "DIRTY", "RESERVED"].includes(table.status)) {
      return;
    }

    const orders = await tx.order.findMany({
      where: {
        tableId,
        organizationId: orgId,
        status: { not: "CANCELLED" },
      },
      select: {
        id: true,
        status: true,
      },
    });

    // Check if any order is active in kitchen/bar/expo
    const hasInFlightOrders = orders.some((o: any) =>
      ["SUBMITTED", "IN_PREPARATION", "READY"].includes(o.status),
    );

    const submittedOrders = orders.filter((o: any) => o.status !== "DRAFT");
    const allSubmittedAreServed =
      submittedOrders.length > 0 &&
      submittedOrders.every((o: any) => o.status === "SERVED");

    let newStatus: TableStatus;

    if (hasInFlightOrders) {
      newStatus = "ORDERED";
    } else if (allSubmittedAreServed) {
      newStatus = "SERVED";
    } else if (table.sessions && table.sessions.length > 0) {
      newStatus = "SEATED";
    } else {
      newStatus = "AVAILABLE";
    }

    if (table.status !== newStatus) {
      await tx.table.update({
        where: { id: tableId },
        data: { status: newStatus },
      });
    }
  }

  /**
   * Helper to recalculate order subtotal, tax, and total from items
   */
  public static async recalculateOrderTotals(
    tx: any,
    orderId: string,
    orgId: string,
  ) {
    const items = await tx.orderItem.findMany({
      where: { orderId, organizationId: orgId, status: { not: "CANCELLED" } },
    });

    const subtotalCents = items.reduce(
      (sum: number, it: any) => sum + it.subtotalCents,
      0,
    );
    const taxCents = items.reduce(
      (sum: number, it: any) => sum + it.taxCents,
      0,
    );
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
   * Ensures safe draft-order creation preventing duplicate active drafts for the same table session or table.
   */
  static async createOrder(
    orgId: string,
    actorId: string,
    input: CreateOrderInput,
    requestId?: string,
    clientLocationId?: string,
  ): Promise<OrderDto> {
    try {
      return await withTenantContext(orgId, async (tx) => {
        // Validate location belongs to organization and actor has access
        const location = await OrderService.validateLocationAccess(
          tx,
          orgId,
          actorId,
          input.locationId,
          clientLocationId,
        );

        let activeSessionId = input.tableSessionId;
        let assignedServerId = input.serverUserId;

        // Validate table if specified
        if (input.tableId) {
          const table = await tx.table.findFirst({
            where: {
              id: input.tableId,
              organizationId: orgId,
            },
            include: {
              sessions: {
                where: { status: "ACTIVE" },
                take: 1,
                orderBy: { seatedAt: "desc" },
              },
            },
          });
          if (!table) {
            throw AppError.notFound("Table not found");
          }
          if (table.locationId !== input.locationId) {
            throw AppError.badRequest(
              "Table does not belong to the requested location",
            );
          }

          const activeSession =
            table.sessions && table.sessions.length > 0
              ? table.sessions[0]
              : null;

          // Link active session if exists
          if (!activeSessionId && activeSession) {
            activeSessionId = activeSession.id;
          }

          // Inherit table's assigned server if not explicitly passed
          if (!assignedServerId) {
            assignedServerId =
              activeSession?.serverUserId || table.assignedServerId || actorId;
          }
        }

        // Validate table session if specified
        if (
          input.tableSessionId &&
          tx.tableSession &&
          typeof tx.tableSession.findFirst === "function"
        ) {
          const session = await tx.tableSession.findFirst({
            where: {
              id: input.tableSessionId,
              organizationId: orgId,
            },
          });
          if (!session) {
            throw AppError.notFound("Table session not found");
          }
          if (session.locationId !== input.locationId) {
            throw AppError.badRequest(
              "Table session does not belong to the requested location",
            );
          }
          if (input.tableId && session.tableId !== input.tableId) {
            throw AppError.badRequest(
              "Table session does not belong to the requested table",
            );
          }
          if (!input.tableId) {
            input.tableId = session.tableId;
          }
        }

        // Lock table or session to serialize concurrent draft creation
        await OrderService.lockTableOrSessionRow(
          tx,
          orgId,
          input.tableId,
          activeSessionId,
        );

        // Check for existing active draft for this session or table
        if (
          (activeSessionId || input.tableId) &&
          typeof tx.order?.findFirst === "function"
        ) {
          const existingDraft = await tx.order.findFirst({
            where: {
              organizationId: orgId,
              status: "DRAFT",
              OR: [
                ...(activeSessionId
                  ? [{ tableSessionId: activeSessionId }]
                  : []),
                ...(input.tableId ? [{ tableId: input.tableId }] : []),
              ],
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

          if (existingDraft) {
            return OrderService.formatOrderDto(existingDraft);
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

        await AuditService.log(
          {
            action: "ORDER_CREATED",
            organizationId: orgId,
            actorId,
            entityType: "order",
            entityId: created.id,
            metadata: {
              orderNumber: created.orderNumber,
              tableId: created.tableId,
            },
            requestId,
          },
          tx,
        );

        const dto = OrderService.formatOrderDto(created);
        emitToLocation(orgId, input.locationId, "order:created", dto);
        return dto;
      });
    } catch (err: any) {
      // Gracefully recover if a concurrent transaction created an active draft in the interim
      if (err?.code === "P2002" && (input.tableId || input.tableSessionId)) {
        const existing = await withTenantContext(orgId, async (tx) => {
          return tx.order.findFirst({
            where: {
              organizationId: orgId,
              status: "DRAFT",
              OR: [
                ...(input.tableSessionId
                  ? [{ tableSessionId: input.tableSessionId }]
                  : []),
                ...(input.tableId ? [{ tableId: input.tableId }] : []),
              ],
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
        });
        if (existing) {
          await withTenantContext(orgId, async (tx) => {
            await OrderService.validateLocationAccess(
              tx,
              orgId,
              actorId,
              existing.locationId,
              clientLocationId,
            );
          });
          return OrderService.formatOrderDto(existing);
        }
      }
      throw err;
    }
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
    clientLocationId?: string,
  ): Promise<OrderDto> {
    return withTenantContext(orgId, async (tx) => {
      await OrderService.lockOrderRow(tx, orgId, orderId);

      const order = await tx.order.findFirst({
        where: { id: orderId, organizationId: orgId },
      });
      if (!order) {
        throw AppError.notFound("Order not found");
      }

      await OrderService.validateLocationAccess(
        tx,
        orgId,
        actorId,
        order.locationId,
        clientLocationId,
      );

      if (order.status !== "DRAFT") {
        throw AppError.badRequest("Only draft orders can be modified");
      }

      const updateData: any = {};
      if (input.guestCount !== undefined)
        updateData.guestCount = input.guestCount;
      if (input.notes !== undefined) updateData.notes = input.notes;
      if (input.serverUserId !== undefined)
        updateData.serverUserId = input.serverUserId;

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

      await AuditService.log(
        {
          action: "ORDER_UPDATED",
          organizationId: orgId,
          actorId,
          entityType: "order",
          entityId: order.id,
          metadata: updateData,
          requestId,
        },
        tx,
      );

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
    clientLocationId?: string,
  ): Promise<OrderDto> {
    return withTenantContext(orgId, async (tx) => {
      await OrderService.lockOrderRow(tx, orgId, orderId);

      const order = await tx.order.findFirst({
        where: { id: orderId, organizationId: orgId },
      });
      if (!order) {
        throw AppError.notFound("Order not found");
      }

      await OrderService.validateLocationAccess(
        tx,
        orgId,
        actorId,
        order.locationId,
        clientLocationId,
      );

      if (order.status !== "DRAFT") {
        throw AppError.badRequest(
          `Cannot add items to order with status ${order.status}`,
        );
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

      const isAvailable =
        override?.isAvailable !== null && override?.isAvailable !== undefined
          ? override.isAvailable
          : menuItem.isAvailable;

      if (!isAvailable) {
        throw AppError.badRequest(
          `Menu item "${menuItem.name}" is currently 86'd / unavailable`,
        );
      }

      const basePriceCents =
        override?.overridePriceCents !== null &&
        override?.overridePriceCents !== undefined
          ? override.overridePriceCents
          : menuItem.basePriceCents;

      // Validate modifier selections against attached groups and calculate authoritative snapshots
      const selectedMods = input.selectedModifiers || [];
      const { modifierSnapshots, modifierDeltaTotal } =
        OrderService.validateAndSnapshotModifiers(menuItem, selectedMods);

      const quantity =
        input.quantity && input.quantity > 0 ? input.quantity : 1;
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

      await AuditService.log(
        {
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
        },
        tx,
      );

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
    clientLocationId?: string,
  ): Promise<OrderDto> {
    return withTenantContext(orgId, async (tx) => {
      await OrderService.lockOrderRow(tx, orgId, orderId);

      const order = await tx.order.findFirst({
        where: { id: orderId, organizationId: orgId },
      });
      if (!order) {
        throw AppError.notFound("Order not found");
      }

      await OrderService.validateLocationAccess(
        tx,
        orgId,
        actorId,
        order.locationId,
        clientLocationId,
      );

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

      const modifierDelta = item.modifiers.reduce(
        (sum: number, m: any) => sum + m.priceDeltaCents,
        0,
      );
      const unitPriceCents = item.basePriceCents + modifierDelta;
      const subtotalCents = unitPriceCents * newQuantity;
      const taxCents = Math.round(
        (subtotalCents * item.taxRateBasisPoints) / 10000,
      );
      const totalCents = subtotalCents + taxCents;

      await tx.orderItem.update({
        where: { id: itemId },
        data: {
          quantity: newQuantity,
          subtotalCents,
          taxCents,
          totalCents,
          specialInstructions:
            input.specialInstructions !== undefined
              ? input.specialInstructions
              : item.specialInstructions,
        },
      });

      await OrderService.recalculateOrderTotals(tx, order.id, orgId);

      await AuditService.log(
        {
          action: "ORDER_ITEM_UPDATED",
          organizationId: orgId,
          actorId,
          entityType: "order",
          entityId: order.id,
          metadata: { itemId, newQuantity },
          requestId,
        },
        tx,
      );

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
    clientLocationId?: string,
  ): Promise<OrderDto> {
    return withTenantContext(orgId, async (tx) => {
      await OrderService.lockOrderRow(tx, orgId, orderId);

      const order = await tx.order.findFirst({
        where: { id: orderId, organizationId: orgId },
      });
      if (!order) {
        throw AppError.notFound("Order not found");
      }

      await OrderService.validateLocationAccess(
        tx,
        orgId,
        actorId,
        order.locationId,
        clientLocationId,
      );

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

      await AuditService.log(
        {
          action: "ORDER_ITEM_REMOVED",
          organizationId: orgId,
          actorId,
          entityType: "order",
          entityId: order.id,
          metadata: { itemId },
          requestId,
        },
        tx,
      );

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
   * Submit draft order to kitchen with idempotency and transaction locking
   */
  static async submitOrder(
    orgId: string,
    actorId: string,
    orderId: string,
    input: SubmitOrderInput,
    requestId?: string,
    clientLocationId?: string,
  ): Promise<OrderDto> {
    try {
      return await withTenantContext(orgId, async (tx) => {
        // 1. Acquire exclusive row lock on target order
        await OrderService.lockOrderRow(tx, orgId, orderId);

        // 2. Idempotency Check: if this idempotency key was already processed, return existing order
        const existing = await tx.order.findFirst({
          where: {
            organizationId: orgId,
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

        if (existing) {
          await OrderService.validateLocationAccess(
            tx,
            orgId,
            actorId,
            existing.locationId,
            clientLocationId,
          );
          return OrderService.formatOrderDto(existing);
        }

        // 3. Fetch target order
        const order = await tx.order.findFirst({
          where: { id: orderId, organizationId: orgId },
          include: {
            items: true,
          },
        });
        if (!order) {
          throw AppError.notFound("Order not found");
        }

        await OrderService.validateLocationAccess(
          tx,
          orgId,
          actorId,
          order.locationId,
          clientLocationId,
        );
        if (order.status !== "DRAFT") {
          // If already submitted with this idempotency key, return the order safely
          if (order.idempotencyKey === input.idempotencyKey) {
            const fullOrder = await tx.order.findUnique({
              where: { id: order.id },
              include: {
                table: { include: { diningArea: true } },
                server: {
                  select: { id: true, firstName: true, lastName: true },
                },
                items: {
                  include: {
                    kitchenStation: true,
                    modifiers: true,
                  },
                },
              },
            });
            if (fullOrder) {
              return OrderService.formatOrderDto(fullOrder);
            }
          }
          throw AppError.badRequest(`Order is already ${order.status}`);
        }
        if (order.items.length === 0) {
          throw AppError.badRequest(
            "Cannot submit an empty order without items",
          );
        }

        // 4. Update order status to SUBMITTED
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

        // 5. Update associated table status based on aggregate orders and sessions
        if (order.tableId) {
          await OrderService.deriveAndUpdateTableStatus(
            tx,
            orgId,
            order.tableId,
          );
        }

        await AuditService.log(
          {
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
          },
          tx,
        );

        const dto = OrderService.formatOrderDto(updated);
        emitToLocation(orgId, order.locationId, "order:submitted", dto);
        return dto;
      });
    } catch (err: any) {
      // Safely handle unique constraint race condition on (organizationId, idempotencyKey)
      if (
        err?.code === "P2002" ||
        err?.message?.includes("idempotencyKey") ||
        err?.message?.includes("orders_org_idempotency_idx")
      ) {
        const existing = await withTenantContext(orgId, async (tx) => {
          return tx.order.findFirst({
            where: {
              organizationId: orgId,
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
        });
        if (existing) {
          await withTenantContext(orgId, async (tx) => {
            await OrderService.validateLocationAccess(
              tx,
              orgId,
              actorId,
              existing.locationId,
              clientLocationId,
            );
          });
          return OrderService.formatOrderDto(existing);
        }
      }
      throw err;
    }
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
    clientLocationId?: string,
  ): Promise<OrderDto> {
    return withTenantContext(orgId, async (tx) => {
      await OrderService.lockOrderRow(tx, orgId, orderId);

      const order = await tx.order.findFirst({
        where: { id: orderId, organizationId: orgId },
        include: { items: true },
      });
      if (!order) {
        throw AppError.notFound("Order not found");
      }

      await OrderService.validateLocationAccess(
        tx,
        orgId,
        actorId,
        order.locationId,
        clientLocationId,
      );

      if (order.status === "CANCELLED") {
        throw AppError.badRequest("Cannot update status of a cancelled order");
      }

      const newStatus = input.status;

      if (newStatus === "CANCELLED") {
        throw AppError.badRequest(
          "Cancellation must be performed via the cancellation endpoint",
        );
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
          where: {
            orderId: order.id,
            organizationId: orgId,
            status: "PENDING",
          },
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

      // Derive aggregate table status based on all active orders and sessions
      if (order.tableId) {
        await OrderService.deriveAndUpdateTableStatus(tx, orgId, order.tableId);
      }

      await AuditService.log(
        {
          action: "ORDER_STATUS_CHANGED",
          organizationId: orgId,
          actorId,
          entityType: "order",
          entityId: order.id,
          metadata: { from: order.status, to: newStatus },
          requestId,
        },
        tx,
      );

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
    clientLocationId?: string,
  ): Promise<OrderDto> {
    return withTenantContext(orgId, async (tx) => {
      await OrderService.lockOrderRow(tx, orgId, orderId);

      const order = await tx.order.findFirst({
        where: { id: orderId, organizationId: orgId },
      });
      if (!order) {
        throw AppError.notFound("Order not found");
      }

      await OrderService.validateLocationAccess(
        tx,
        orgId,
        actorId,
        order.locationId,
        clientLocationId,
      );

      if (order.status === "CANCELLED") {
        throw AppError.badRequest("Cannot update items of a cancelled order");
      }

      if (order.status === "DRAFT") {
        throw AppError.badRequest(
          "Cannot update item preparation status for draft orders",
        );
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
        where: {
          orderId: order.id,
          organizationId: orgId,
          status: { not: "CANCELLED" },
        },
      });

      let orderStatusToSet: OrderStatus | undefined;
      const now = new Date();
      const orderUpdateData: any = {};

      if (allActiveItems.length > 0) {
        const allServed = allActiveItems.every(
          (it: any) => it.status === "SERVED",
        );
        const allReadyOrServed = allActiveItems.every(
          (it: any) => it.status === "READY" || it.status === "SERVED",
        );
        const anyInPrep = allActiveItems.some(
          (it: any) => it.status === "IN_PREPARATION",
        );

        if (allServed && order.status !== "SERVED") {
          orderStatusToSet = "SERVED";
          orderUpdateData.status = "SERVED";
          orderUpdateData.servedAt = now;
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

        await AuditService.log(
          {
            action: "ORDER_STATUS_CHANGED",
            organizationId: orgId,
            actorId,
            entityType: "order",
            entityId: order.id,
            metadata: {
              from: order.status,
              to: orderStatusToSet,
              reason: "kitchen_auto_advance",
            },
            requestId,
          },
          tx,
        );
      }

      // Update aggregate table status if table attached
      if (order.tableId) {
        await OrderService.deriveAndUpdateTableStatus(tx, orgId, order.tableId);
      }

      await AuditService.log(
        {
          action: "ORDER_ITEM_STATUS_UPDATED",
          organizationId: orgId,
          actorId,
          entityType: "order_item",
          entityId: itemId,
          metadata: { from: item.status, to: input.status },
          requestId,
        },
        tx,
      );

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
    clientLocationId?: string,
  ): Promise<OrderDto> {
    return withTenantContext(orgId, async (tx) => {
      await OrderService.lockOrderRow(tx, orgId, orderId);

      const order = await tx.order.findFirst({
        where: { id: orderId, organizationId: orgId },
      });
      if (!order) {
        throw AppError.notFound("Order not found");
      }

      await OrderService.validateLocationAccess(
        tx,
        orgId,
        actorId,
        order.locationId,
        clientLocationId,
      );

      if (order.status === "SERVED") {
        throw AppError.badRequest(
          "Cannot cancel an order that is already served",
        );
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

      // Update aggregate table status if table attached
      if (order.tableId) {
        await OrderService.deriveAndUpdateTableStatus(tx, orgId, order.tableId);
      }

      await AuditService.log(
        {
          action: "ORDER_CANCELLED",
          organizationId: orgId,
          actorId,
          entityType: "order",
          entityId: order.id,
          metadata: { reason: input.reason },
          requestId,
        },
        tx,
      );

      const dto = OrderService.formatOrderDto(updated);
      emitToLocation(orgId, order.locationId, "order:cancelled", dto);
      return dto;
    });
  }

  /**
   * Fetch all active kitchen orders (SUBMITTED, IN_PREPARATION, READY) for an authorized location.
   * Excludes DRAFT, SERVED (completed), and CANCELLED orders.
   * Enforces location authorization.
   */
  static async getActiveKitchenOrders(
    orgId: string,
    actorId: string,
    locationId: string,
    clientLocationId?: string,
  ): Promise<OrderDto[]> {
    return OrderService.getOrders(
      orgId,
      actorId,
      {
        locationId,
        activeOnly: true,
      },
      clientLocationId,
    );
  }

  /**
   * Get orders with filtering and location authorization
   */
  static async getOrders(
    orgId: string,
    actorIdOrParams:
      | string
      | {
          locationId: string;
          status?: OrderStatus;
          tableId?: string;
          serverUserId?: string;
          activeOnly?: boolean;
        },
    paramsOrClientLoc?:
      | {
          locationId: string;
          status?: OrderStatus;
          tableId?: string;
          serverUserId?: string;
          activeOnly?: boolean;
        }
      | string,
    clientLocationId?: string,
  ): Promise<OrderDto[]> {
    const actorId =
      typeof actorIdOrParams === "string" ? actorIdOrParams : undefined;
    const params = (
      typeof actorIdOrParams === "string" ? paramsOrClientLoc : actorIdOrParams
    ) as {
      locationId: string;
      status?: OrderStatus;
      tableId?: string;
      serverUserId?: string;
      activeOnly?: boolean;
    };
    const clientLoc =
      typeof actorIdOrParams === "string"
        ? clientLocationId
        : (paramsOrClientLoc as string | undefined);

    return withTenantContext(orgId, async (tx) => {
      await OrderService.validateLocationAccess(
        tx,
        orgId,
        actorId,
        params.locationId,
        clientLoc,
      );

      if (params.tableId) {
        const table = await tx.table.findFirst({
          where: { id: params.tableId, organizationId: orgId },
        });
        if (!table) {
          throw AppError.notFound("Table not found");
        }
        if (table.locationId !== params.locationId) {
          throw AppError.badRequest(
            "Table does not belong to the requested location",
          );
        }
      }

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
   * Get single order by ID with location access verification
   */
  static async getOrderById(
    orgId: string,
    orderId: string,
    actorId?: string,
    clientLocationId?: string,
  ): Promise<OrderDto> {
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

      await OrderService.validateLocationAccess(
        tx,
        orgId,
        actorId,
        order.locationId,
        clientLocationId,
      );

      return OrderService.formatOrderDto(order);
    });
  }
}
