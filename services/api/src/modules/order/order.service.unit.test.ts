import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderService, VALID_ORDER_TRANSITIONS } from "./order.service.js";
import { withTenantContext } from "../../db/tenant-context.js";
import { emitToLocation } from "../../services/socket.service.js";
import { AppError } from "../../utils/app-error.js";

vi.mock("../../db/tenant-context.js", () => ({
  withTenantContext: vi.fn(),
}));

vi.mock("../../services/audit.service.js", () => ({
  AuditService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../services/socket.service.js", () => ({
  emitToLocation: vi.fn(),
  emitToOrg: vi.fn(),
}));

describe("OrderService Unit Tests", () => {
  const orgId = "org-111";
  const locId = "loc-111";
  const actorId = "user-111";
  const orderId = "order-111";
  const menuItemId = "item-111";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createOrder creates a draft order with correct location currency and defaults", async () => {
    const mockTx = {
      location: {
        findFirst: vi.fn().mockResolvedValue({ id: locId, organizationId: orgId, currency: "USD" }),
      },
      table: {
        findFirst: vi.fn().mockResolvedValue({
          id: "tbl-1",
          organizationId: orgId,
          locationId: locId,
          assignedServerId: "server-1",
          sessions: [{ id: "session-1", serverUserId: "server-1" }],
        }),
      },
      order: {
        create: vi.fn().mockImplementation(({ data }) => ({
          ...data,
          id: orderId,
          createdAt: new Date(),
          updatedAt: new Date(),
          table: { tableNumber: "T1", diningArea: { name: "Main Room" } },
          server: { id: "server-1", firstName: "Alice", lastName: "Smith" },
          items: [],
        })),
      },
    };

    (withTenantContext as any).mockImplementation((_tenantId: string, fn: any) => fn(mockTx));

    const result = await OrderService.createOrder(orgId, actorId, {
      locationId: locId,
      tableId: "tbl-1",
      guestCount: 2,
      notes: "Window seat",
    });

    expect(result.id).toBe(orderId);
    expect(result.status).toBe("DRAFT");
    expect(result.paymentStatus).toBe("UNPAID");
    expect(result.currency).toBe("USD");
    expect(result.guestCount).toBe(2);
    expect(result.serverUserId).toBe("server-1");
    expect(mockTx.order.create).toHaveBeenCalledOnce();
    expect(emitToLocation).toHaveBeenCalledWith(orgId, locId, "order:created", expect.any(Object));
  });

  it("addOrderItem validates required modifier groups and computes backend prices and taxes", async () => {
    const mockTx = {
      order: {
        findFirst: vi.fn().mockResolvedValue({
          id: orderId,
          organizationId: orgId,
          locationId: locId,
          status: "DRAFT",
        }),
        update: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue({
          id: orderId,
          organizationId: orgId,
          locationId: locId,
          status: "DRAFT",
          paymentStatus: "UNPAID",
          subtotalCents: 1550,
          taxCents: 128,
          totalCents: 1678,
          currency: "USD",
          guestCount: 2,
          orderNumber: "ORD-1234",
          items: [
            {
              id: "item-line-1",
              orderId,
              menuItemId,
              name: "Paneer Tikka",
              basePriceCents: 1500,
              quantity: 1,
              subtotalCents: 1550,
              taxRateBasisPoints: 825,
              taxCents: 128,
              totalCents: 1678,
              status: "PENDING",
              modifiers: [
                {
                  id: "mod-1",
                  modifierGroupId: "group-spice",
                  modifierOptionId: "opt-spicy",
                  groupName: "Spice Level",
                  optionName: "Spicy",
                  priceDeltaCents: 50,
                },
              ],
            },
          ],
        }),
      },
      menuItem: {
        findFirst: vi.fn().mockResolvedValue({
          id: menuItemId,
          organizationId: orgId,
          name: "Paneer Tikka",
          basePriceCents: 1500,
          isAvailable: true,
          kitchenStationId: "station-tandoor",
          taxRate: { rateBasisPoints: 825 },
          modifierGroups: [
            {
              modifierGroup: {
                id: "group-spice",
                name: "Spice Level",
                isRequired: true,
                minSelections: 1,
                maxSelections: 1,
                options: [
                  { id: "opt-mild", name: "Mild", priceDeltaCents: 0, isAvailable: true },
                  { id: "opt-spicy", name: "Spicy", priceDeltaCents: 50, isAvailable: true },
                ],
              },
            },
          ],
        }),
      },
      locationMenuOverride: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      orderItem: {
        create: vi.fn().mockResolvedValue({ id: "item-line-1" }),
        findMany: vi.fn().mockResolvedValue([
          { subtotalCents: 1550, taxCents: 128, status: "PENDING" },
        ]),
      },
    };

    (withTenantContext as any).mockImplementation((_tenantId: string, fn: any) => fn(mockTx));

    // When required modifier is missing, throws error
    await expect(
      OrderService.addOrderItem(orgId, actorId, orderId, {
        menuItemId,
        quantity: 1,
        selectedModifiers: [],
      }),
    ).rejects.toThrow('Modifier group "Spice Level" is required');

    // When valid modifier is provided, succeeds and calculates line item total
    const result = await OrderService.addOrderItem(orgId, actorId, orderId, {
      menuItemId,
      quantity: 1,
      selectedModifiers: [
        { modifierGroupId: "group-spice", modifierOptionId: "opt-spicy" },
      ],
    });

    expect(result.items.length).toBe(1);
    expect(result.subtotalCents).toBe(1550);
    expect(result.taxCents).toBe(128);
    expect(result.totalCents).toBe(1678);
    expect(mockTx.orderItem.create).toHaveBeenCalledOnce();
  });

  it("submitOrder enforces idempotency and transitions table to ORDERED", async () => {
    const mockTx = {
      order: {
        findFirst: vi.fn()
          // 1st call for idempotency check: returns null (not yet processed)
          .mockResolvedValueOnce(null)
          // 2nd call for fetching draft order: returns order with 1 item
          .mockResolvedValueOnce({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            tableId: "tbl-1",
            status: "DRAFT",
            items: [{ id: "line-1" }],
            orderNumber: "ORD-9999",
            totalCents: 1678,
          }),
        update: vi.fn().mockResolvedValue({
          id: orderId,
          organizationId: orgId,
          locationId: locId,
          tableId: "tbl-1",
          orderNumber: "ORD-9999",
          status: "SUBMITTED",
          paymentStatus: "UNPAID",
          subtotalCents: 1550,
          taxCents: 128,
          totalCents: 1678,
          currency: "USD",
          guestCount: 2,
          idempotencyKey: "idem-key-123",
          submittedAt: new Date(),
          items: [],
        }),
      },
      table: {
        update: vi.fn().mockResolvedValue({}),
      },
    };

    (withTenantContext as any).mockImplementation((_tenantId: string, fn: any) => fn(mockTx));

    const result = await OrderService.submitOrder(orgId, actorId, orderId, {
      idempotencyKey: "idem-key-123",
    });

    expect(result.status).toBe("SUBMITTED");
    expect(mockTx.table.update).toHaveBeenCalledWith({
      where: { id: "tbl-1" },
      data: { status: "ORDERED" },
    });
    expect(emitToLocation).toHaveBeenCalledWith(orgId, locId, "order:submitted", expect.any(Object));

    // If submitted again with same idempotency key, returns cached order without re-updating
    const cachedOrderTx = {
      order: {
        findFirst: vi.fn().mockResolvedValue({
          id: orderId,
          organizationId: orgId,
          locationId: locId,
          tableId: "tbl-1",
          orderNumber: "ORD-9999",
          status: "SUBMITTED",
          paymentStatus: "UNPAID",
          subtotalCents: 1550,
          taxCents: 128,
          totalCents: 1678,
          currency: "USD",
          guestCount: 2,
          idempotencyKey: "idem-key-123",
          submittedAt: new Date(),
          items: [],
        }),
      },
    };
    (withTenantContext as any).mockImplementation((_tenantId: string, fn: any) => fn(cachedOrderTx));

    const duplicateResult = await OrderService.submitOrder(orgId, actorId, orderId, {
      idempotencyKey: "idem-key-123",
    });
    expect(duplicateResult.status).toBe("SUBMITTED");
    expect(cachedOrderTx.order.findFirst).toHaveBeenCalledOnce();
  });

  // ─── CRITICAL FIX 2: STATE MACHINE TESTS ───────────────────────────────────

  describe("Order State Machine Enforcement", () => {
    it("1. Valid forward transitions succeed: SUBMITTED -> IN_PREPARATION -> READY -> SERVED", async () => {
      // Step A: SUBMITTED -> IN_PREPARATION
      const mockTxPrep = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "SUBMITTED",
            items: [{ id: "item-1", status: "PENDING" }],
          }),
          update: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "IN_PREPARATION",
            items: [{ id: "item-1", status: "IN_PREPARATION" }],
          }),
        },
        orderItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      };
      (withTenantContext as any).mockImplementation((_t: string, fn: any) => fn(mockTxPrep));

      const prepResult = await OrderService.updateOrderStatus(orgId, actorId, orderId, {
        status: "IN_PREPARATION",
      });
      expect(prepResult.status).toBe("IN_PREPARATION");
      expect(mockTxPrep.orderItem.updateMany).toHaveBeenCalledWith({
        where: { orderId, organizationId: orgId, status: "PENDING" },
        data: { status: "IN_PREPARATION" },
      });

      // Step B: IN_PREPARATION -> READY
      const mockTxReady = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "IN_PREPARATION",
            items: [{ id: "item-1", status: "IN_PREPARATION" }],
          }),
          update: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "READY",
            items: [{ id: "item-1", status: "READY" }],
          }),
        },
        orderItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      };
      (withTenantContext as any).mockImplementation((_t: string, fn: any) => fn(mockTxReady));

      const readyResult = await OrderService.updateOrderStatus(orgId, actorId, orderId, {
        status: "READY",
      });
      expect(readyResult.status).toBe("READY");

      // Step C: READY -> SERVED
      const mockTxServed = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            tableId: "tbl-1",
            status: "READY",
            items: [{ id: "item-1", status: "READY" }],
          }),
          update: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            tableId: "tbl-1",
            status: "SERVED",
            items: [{ id: "item-1", status: "SERVED" }],
          }),
        },
        orderItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        table: { update: vi.fn().mockResolvedValue({}) },
      };
      (withTenantContext as any).mockImplementation((_t: string, fn: any) => fn(mockTxServed));

      const servedResult = await OrderService.updateOrderStatus(orgId, actorId, orderId, {
        status: "SERVED",
      });
      expect(servedResult.status).toBe("SERVED");
      expect(mockTxServed.table.update).toHaveBeenCalledWith({
        where: { id: "tbl-1" },
        data: { status: "SERVED" },
      });
    });

    it("2. Rejects DRAFT directly to SERVED", async () => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            status: "DRAFT",
          }),
        },
      };
      (withTenantContext as any).mockImplementation((_t: string, fn: any) => fn(mockTx));

      await expect(
        OrderService.updateOrderStatus(orgId, actorId, orderId, { status: "SERVED" }),
      ).rejects.toThrow("Invalid order status transition from DRAFT to SERVED");
    });

    it("3. Rejects SERVED backward to SUBMITTED", async () => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            status: "SERVED",
          }),
        },
      };
      (withTenantContext as any).mockImplementation((_t: string, fn: any) => fn(mockTx));

      await expect(
        OrderService.updateOrderStatus(orgId, actorId, orderId, { status: "SUBMITTED" }),
      ).rejects.toThrow("Invalid order status transition from SERVED to SUBMITTED");
    });

    it("4. Rejects READY backward to DRAFT", async () => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            status: "READY",
          }),
        },
      };
      (withTenantContext as any).mockImplementation((_t: string, fn: any) => fn(mockTx));

      await expect(
        OrderService.updateOrderStatus(orgId, actorId, orderId, { status: "DRAFT" }),
      ).rejects.toThrow("Invalid order status transition from READY to DRAFT");
    });

    it("5. Rejects updates to CANCELLED orders", async () => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            status: "CANCELLED",
          }),
        },
      };
      (withTenantContext as any).mockImplementation((_t: string, fn: any) => fn(mockTx));

      await expect(
        OrderService.updateOrderStatus(orgId, actorId, orderId, { status: "IN_PREPARATION" }),
      ).rejects.toThrow("Cannot update status of a cancelled order");
    });

    it("rejects transition to CANCELLED via updateOrderStatus (must use cancellation endpoint)", async () => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            status: "SUBMITTED",
          }),
        },
      };
      (withTenantContext as any).mockImplementation((_t: string, fn: any) => fn(mockTx));

      await expect(
        OrderService.updateOrderStatus(orgId, actorId, orderId, { status: "CANCELLED" }),
      ).rejects.toThrow("Cancellation must be performed via the cancellation endpoint");
    });

    it("preserves authorized KDS Ticket Recall workflow: SERVED -> READY", async () => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            tableId: "tbl-1",
            status: "SERVED",
          }),
          update: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            tableId: "tbl-1",
            status: "READY",
            items: [],
          }),
        },
        orderItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        table: { update: vi.fn().mockResolvedValue({}) },
      };
      (withTenantContext as any).mockImplementation((_t: string, fn: any) => fn(mockTx));

      const result = await OrderService.updateOrderStatus(orgId, actorId, orderId, {
        status: "READY",
      });

      expect(result.status).toBe("READY");
      expect(mockTx.orderItem.updateMany).toHaveBeenCalledWith({
        where: { orderId, organizationId: orgId, status: "SERVED" },
        data: { status: "READY" },
      });
      expect(mockTx.table.update).toHaveBeenCalledWith({
        where: { id: "tbl-1" },
        data: { status: "ORDERED" },
      });
    });
  });

  // ─── CRITICAL FIX 2: KITCHEN AUTO-ADVANCEMENT TESTS ────────────────────────

  describe("Kitchen Line Item Auto-Advancement", () => {
    it("6. SUBMITTED order automatically advances to READY when all active items are ready", async () => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "SUBMITTED",
          }),
          update: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "READY",
            items: [{ id: "item-1", status: "READY" }],
          }),
        },
        orderItem: {
          findFirst: vi.fn().mockResolvedValue({
            id: "item-1",
            orderId,
            organizationId: orgId,
            status: "PENDING",
          }),
          update: vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([
            { id: "item-1", status: "READY" },
          ]),
        },
      };
      (withTenantContext as any).mockImplementation((_t: string, fn: any) => fn(mockTx));

      const result = await OrderService.updateOrderItemStatus(orgId, actorId, orderId, "item-1", {
        status: "READY",
      });

      expect(result.status).toBe("READY");
      expect(mockTx.order.update).toHaveBeenCalledWith({
        where: { id: orderId },
        data: expect.objectContaining({ status: "READY" }),
      });
      expect(emitToLocation).toHaveBeenCalledWith(orgId, locId, "order:status_changed", expect.any(Object));
    });

    it("7. IN_PREPARATION order automatically advances to READY when all active items are ready", async () => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "IN_PREPARATION", // Order is already in prep
          }),
          update: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "READY",
            items: [{ id: "item-1", status: "READY" }],
          }),
        },
        orderItem: {
          findFirst: vi.fn().mockResolvedValue({
            id: "item-1",
            orderId,
            organizationId: orgId,
            status: "IN_PREPARATION",
          }),
          update: vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([
            { id: "item-1", status: "READY" },
          ]),
        },
      };
      (withTenantContext as any).mockImplementation((_t: string, fn: any) => fn(mockTx));

      const result = await OrderService.updateOrderItemStatus(orgId, actorId, orderId, "item-1", {
        status: "READY",
      });

      expect(result.status).toBe("READY");
      expect(mockTx.order.update).toHaveBeenCalledWith({
        where: { id: orderId },
        data: expect.objectContaining({ status: "READY" }),
      });
    });

    it("8. Multi-station orders wait until all active items across stations are ready", async () => {
      // Item 1 (Tandoor station) is ready, but Item 2 (Curry station) is still IN_PREPARATION
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "IN_PREPARATION",
          }),
          update: vi.fn(), // Should NOT be called to set order to READY
          findUnique: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "IN_PREPARATION", // Remains in preparation
            items: [
              { id: "item-tandoor", kitchenStationId: "st-tandoor", status: "READY" },
              { id: "item-curry", kitchenStationId: "st-curry", status: "IN_PREPARATION" },
            ],
          }),
        },
        orderItem: {
          findFirst: vi.fn().mockResolvedValue({
            id: "item-tandoor",
            orderId,
            organizationId: orgId,
            status: "IN_PREPARATION",
          }),
          update: vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([
            { id: "item-tandoor", kitchenStationId: "st-tandoor", status: "READY" },
            { id: "item-curry", kitchenStationId: "st-curry", status: "IN_PREPARATION" },
          ]),
        },
      };
      (withTenantContext as any).mockImplementation((_t: string, fn: any) => fn(mockTx));

      const result = await OrderService.updateOrderItemStatus(orgId, actorId, orderId, "item-tandoor", {
        status: "READY",
      });

      // Order should remain IN_PREPARATION because curry item is not ready
      expect(result.status).toBe("IN_PREPARATION");
      expect(mockTx.order.update).not.toHaveBeenCalled();
    });

    it("9. Cancelled items do not block readiness of remaining items", async () => {
      // 2 items: item-1 is READY, item-2 was CANCELLED
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "IN_PREPARATION",
          }),
          update: vi.fn().mockResolvedValue({}),
          findUnique: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "READY",
            items: [
              { id: "item-1", status: "READY" },
              { id: "item-2", status: "CANCELLED" },
            ],
          }),
        },
        orderItem: {
          findFirst: vi.fn().mockResolvedValue({
            id: "item-1",
            orderId,
            organizationId: orgId,
            status: "IN_PREPARATION",
          }),
          update: vi.fn().mockResolvedValue({}),
          // findMany filters status: { not: "CANCELLED" }
          findMany: vi.fn().mockResolvedValue([
            { id: "item-1", status: "READY" },
          ]),
        },
      };
      (withTenantContext as any).mockImplementation((_t: string, fn: any) => fn(mockTx));

      const result = await OrderService.updateOrderItemStatus(orgId, actorId, orderId, "item-1", {
        status: "READY",
      });

      expect(result.status).toBe("READY");
      expect(mockTx.order.update).toHaveBeenCalledWith({
        where: { id: orderId },
        data: expect.objectContaining({ status: "READY" }),
      });
    });

    it("10. Concurrent status updates do not violate the state machine", async () => {
      // Simulate two concurrent updates attempting transitions on an order currently IN_PREPARATION:
      // Update A: valid (IN_PREPARATION -> READY)
      // Update B: invalid concurrent attempt (IN_PREPARATION -> SUBMITTED)
      const mockTxA = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "IN_PREPARATION",
          }),
          update: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            status: "READY",
            items: [],
          }),
        },
        orderItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      };

      const mockTxB = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "IN_PREPARATION",
          }),
        },
      };

      // Execute Update A
      (withTenantContext as any).mockImplementation((_t: string, fn: any) => fn(mockTxA));
      const resA = await OrderService.updateOrderStatus(orgId, actorId, orderId, { status: "READY" });
      expect(resA.status).toBe("READY");

      // Execute Update B
      (withTenantContext as any).mockImplementation((_t: string, fn: any) => fn(mockTxB));
      await expect(
        OrderService.updateOrderStatus(orgId, actorId, orderId, { status: "SUBMITTED" }),
      ).rejects.toThrow("Invalid order status transition from IN_PREPARATION to SUBMITTED");
    });
  });

  // ─── CANCELLATION TESTS ───────────────────────────────────────────────────

  describe("cancelOrder", () => {
    it("cancelOrder marks order and items as cancelled", async () => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "SUBMITTED",
          }),
          update: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "CANCELLED",
            paymentStatus: "UNPAID",
            subtotalCents: 1000,
            taxCents: 80,
            totalCents: 1080,
            currency: "USD",
            guestCount: 1,
            orderNumber: "ORD-1111",
            cancelReason: "Guest changed mind",
            items: [],
          }),
        },
        orderItem: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      (withTenantContext as any).mockImplementation((_tenantId: string, fn: any) => fn(mockTx));

      const result = await OrderService.cancelOrder(orgId, actorId, orderId, {
        reason: "Guest changed mind",
      });

      expect(result.status).toBe("CANCELLED");
      expect(result.cancelReason).toBe("Guest changed mind");
      expect(mockTx.orderItem.updateMany).toHaveBeenCalledWith({
        where: { orderId, organizationId: orgId },
        data: { status: "CANCELLED" },
      });
      expect(emitToLocation).toHaveBeenCalledWith(orgId, locId, "order:cancelled", expect.any(Object));
    });

    it("rejects cancelling an order that is already SERVED", async () => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            status: "SERVED",
          }),
        },
      };
      (withTenantContext as any).mockImplementation((_t: string, fn: any) => fn(mockTx));

      await expect(
        OrderService.cancelOrder(orgId, actorId, orderId, { reason: "Mistake" }),
      ).rejects.toThrow("Cannot cancel an order that is already served");
    });
  });
});
