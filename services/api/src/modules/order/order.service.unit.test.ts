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
        findFirst: vi.fn().mockResolvedValue({
          id: locId,
          organizationId: orgId,
          currency: "USD",
        }),
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

    (withTenantContext as any).mockImplementation(
      (_tenantId: string, fn: any) => fn(mockTx),
    );

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
    expect(emitToLocation).toHaveBeenCalledWith(
      orgId,
      locId,
      "order:created",
      expect.any(Object),
    );
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
                  {
                    id: "opt-mild",
                    name: "Mild",
                    priceDeltaCents: 0,
                    isAvailable: true,
                  },
                  {
                    id: "opt-spicy",
                    name: "Spicy",
                    priceDeltaCents: 50,
                    isAvailable: true,
                  },
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
        findMany: vi
          .fn()
          .mockResolvedValue([
            { subtotalCents: 1550, taxCents: 128, status: "PENDING" },
          ]),
      },
    };

    (withTenantContext as any).mockImplementation(
      (_tenantId: string, fn: any) => fn(mockTx),
    );

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
        findFirst: vi
          .fn()
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
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: orderId, status: "SUBMITTED" }]),
      },
      table: {
        findFirst: vi.fn().mockResolvedValue({
          id: "tbl-1",
          status: "SEATED",
          sessions: [{ status: "ACTIVE" }],
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    (withTenantContext as any).mockImplementation(
      (_tenantId: string, fn: any) => fn(mockTx),
    );

    const result = await OrderService.submitOrder(orgId, actorId, orderId, {
      idempotencyKey: "idem-key-123",
    });

    expect(result.status).toBe("SUBMITTED");
    expect(mockTx.table.update).toHaveBeenCalledWith({
      where: { id: "tbl-1" },
      data: { status: "ORDERED" },
    });
    expect(emitToLocation).toHaveBeenCalledWith(
      orgId,
      locId,
      "order:submitted",
      expect.any(Object),
    );

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
    (withTenantContext as any).mockImplementation(
      (_tenantId: string, fn: any) => fn(cachedOrderTx),
    );

    const duplicateResult = await OrderService.submitOrder(
      orgId,
      actorId,
      orderId,
      {
        idempotencyKey: "idem-key-123",
      },
    );
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
      (withTenantContext as any).mockImplementation((_t: string, fn: any) =>
        fn(mockTxPrep),
      );

      const prepResult = await OrderService.updateOrderStatus(
        orgId,
        actorId,
        orderId,
        {
          status: "IN_PREPARATION",
        },
      );
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
      (withTenantContext as any).mockImplementation((_t: string, fn: any) =>
        fn(mockTxReady),
      );

      const readyResult = await OrderService.updateOrderStatus(
        orgId,
        actorId,
        orderId,
        {
          status: "READY",
        },
      );
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
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: orderId, status: "SERVED" }]),
        },
        orderItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        table: {
          findFirst: vi.fn().mockResolvedValue({
            id: "tbl-1",
            status: "ORDERED",
            sessions: [],
          }),
          update: vi.fn().mockResolvedValue({}),
        },
      };
      (withTenantContext as any).mockImplementation((_t: string, fn: any) =>
        fn(mockTxServed),
      );

      const servedResult = await OrderService.updateOrderStatus(
        orgId,
        actorId,
        orderId,
        {
          status: "SERVED",
        },
      );
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
      (withTenantContext as any).mockImplementation((_t: string, fn: any) =>
        fn(mockTx),
      );

      await expect(
        OrderService.updateOrderStatus(orgId, actorId, orderId, {
          status: "SERVED",
        }),
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
      (withTenantContext as any).mockImplementation((_t: string, fn: any) =>
        fn(mockTx),
      );

      await expect(
        OrderService.updateOrderStatus(orgId, actorId, orderId, {
          status: "SUBMITTED",
        }),
      ).rejects.toThrow(
        "Invalid order status transition from SERVED to SUBMITTED",
      );
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
      (withTenantContext as any).mockImplementation((_t: string, fn: any) =>
        fn(mockTx),
      );

      await expect(
        OrderService.updateOrderStatus(orgId, actorId, orderId, {
          status: "DRAFT",
        }),
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
      (withTenantContext as any).mockImplementation((_t: string, fn: any) =>
        fn(mockTx),
      );

      await expect(
        OrderService.updateOrderStatus(orgId, actorId, orderId, {
          status: "IN_PREPARATION",
        }),
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
      (withTenantContext as any).mockImplementation((_t: string, fn: any) =>
        fn(mockTx),
      );

      await expect(
        OrderService.updateOrderStatus(orgId, actorId, orderId, {
          status: "CANCELLED",
        }),
      ).rejects.toThrow(
        "Cancellation must be performed via the cancellation endpoint",
      );
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
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: orderId, status: "READY" }]),
        },
        orderItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        table: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: "tbl-1", status: "SERVED", sessions: [] }),
          update: vi.fn().mockResolvedValue({}),
        },
      };
      (withTenantContext as any).mockImplementation((_t: string, fn: any) =>
        fn(mockTx),
      );

      const result = await OrderService.updateOrderStatus(
        orgId,
        actorId,
        orderId,
        {
          status: "READY",
        },
      );

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
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: "item-1", status: "READY" }]),
        },
      };
      (withTenantContext as any).mockImplementation((_t: string, fn: any) =>
        fn(mockTx),
      );

      const result = await OrderService.updateOrderItemStatus(
        orgId,
        actorId,
        orderId,
        "item-1",
        {
          status: "READY",
        },
      );

      expect(result.status).toBe("READY");
      expect(mockTx.order.update).toHaveBeenCalledWith({
        where: { id: orderId },
        data: expect.objectContaining({ status: "READY" }),
      });
      expect(emitToLocation).toHaveBeenCalledWith(
        orgId,
        locId,
        "order:status_changed",
        expect.any(Object),
      );
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
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: "item-1", status: "READY" }]),
        },
      };
      (withTenantContext as any).mockImplementation((_t: string, fn: any) =>
        fn(mockTx),
      );

      const result = await OrderService.updateOrderItemStatus(
        orgId,
        actorId,
        orderId,
        "item-1",
        {
          status: "READY",
        },
      );

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
              {
                id: "item-tandoor",
                kitchenStationId: "st-tandoor",
                status: "READY",
              },
              {
                id: "item-curry",
                kitchenStationId: "st-curry",
                status: "IN_PREPARATION",
              },
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
            {
              id: "item-tandoor",
              kitchenStationId: "st-tandoor",
              status: "READY",
            },
            {
              id: "item-curry",
              kitchenStationId: "st-curry",
              status: "IN_PREPARATION",
            },
          ]),
        },
      };
      (withTenantContext as any).mockImplementation((_t: string, fn: any) =>
        fn(mockTx),
      );

      const result = await OrderService.updateOrderItemStatus(
        orgId,
        actorId,
        orderId,
        "item-tandoor",
        {
          status: "READY",
        },
      );

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
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: "item-1", status: "READY" }]),
        },
      };
      (withTenantContext as any).mockImplementation((_t: string, fn: any) =>
        fn(mockTx),
      );

      const result = await OrderService.updateOrderItemStatus(
        orgId,
        actorId,
        orderId,
        "item-1",
        {
          status: "READY",
        },
      );

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
      (withTenantContext as any).mockImplementation((_t: string, fn: any) =>
        fn(mockTxA),
      );
      const resA = await OrderService.updateOrderStatus(
        orgId,
        actorId,
        orderId,
        { status: "READY" },
      );
      expect(resA.status).toBe("READY");

      // Execute Update B
      (withTenantContext as any).mockImplementation((_t: string, fn: any) =>
        fn(mockTxB),
      );
      await expect(
        OrderService.updateOrderStatus(orgId, actorId, orderId, {
          status: "SUBMITTED",
        }),
      ).rejects.toThrow(
        "Invalid order status transition from IN_PREPARATION to SUBMITTED",
      );
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

      (withTenantContext as any).mockImplementation(
        (_tenantId: string, fn: any) => fn(mockTx),
      );

      const result = await OrderService.cancelOrder(orgId, actorId, orderId, {
        reason: "Guest changed mind",
      });

      expect(result.status).toBe("CANCELLED");
      expect(result.cancelReason).toBe("Guest changed mind");
      expect(mockTx.orderItem.updateMany).toHaveBeenCalledWith({
        where: { orderId, organizationId: orgId },
        data: { status: "CANCELLED" },
      });
      expect(emitToLocation).toHaveBeenCalledWith(
        orgId,
        locId,
        "order:cancelled",
        expect.any(Object),
      );
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
      (withTenantContext as any).mockImplementation((_t: string, fn: any) =>
        fn(mockTx),
      );

      await expect(
        OrderService.cancelOrder(orgId, actorId, orderId, {
          reason: "Mistake",
        }),
      ).rejects.toThrow("Cannot cancel an order that is already served");
    });
  });

  // ─── CRITICAL FIX 3: CONCURRENCY & TRANSACTION SAFETY TESTS ───────────────

  describe("Order Concurrency & Transaction Safety", () => {
    it("1. Reusing an existing draft safely: returns existing active draft without creating a new order", async () => {
      const existingDraft = {
        id: "draft-existing-1",
        organizationId: orgId,
        locationId: locId,
        tableId: "tbl-1",
        tableSessionId: "session-1",
        status: "DRAFT",
        paymentStatus: "UNPAID",
        subtotalCents: 1000,
        taxCents: 80,
        totalCents: 1080,
        currency: "USD",
        guestCount: 2,
        orderNumber: "ORD-1111",
        items: [],
      };

      const mockTx = {
        location: {
          findFirst: vi.fn().mockResolvedValue({
            id: locId,
            organizationId: orgId,
            currency: "USD",
          }),
        },
        table: {
          findFirst: vi.fn().mockResolvedValue({
            id: "tbl-1",
            organizationId: orgId,
            locationId: locId,
            sessions: [{ id: "session-1", status: "ACTIVE" }],
          }),
        },
        $queryRaw: vi.fn().mockResolvedValue([]),
        order: {
          findFirst: vi.fn().mockResolvedValue(existingDraft),
          create: vi.fn(),
        },
      };

      (withTenantContext as any).mockImplementation((_t: string, fn: any) =>
        fn(mockTx),
      );

      const result = await OrderService.createOrder(orgId, actorId, {
        locationId: locId,
        tableId: "tbl-1",
      });

      expect(result.id).toBe("draft-existing-1");
      expect(result.status).toBe("DRAFT");
      // Must NOT invoke create if existing draft was found
      expect(mockTx.order.create).not.toHaveBeenCalled();
    });

    it("2. Simultaneous draft creation race: handles P2002 unique constraint and returns winning draft", async () => {
      const existingDraft = {
        id: "draft-winner-1",
        organizationId: orgId,
        locationId: locId,
        tableId: "tbl-1",
        tableSessionId: "session-1",
        status: "DRAFT",
        paymentStatus: "UNPAID",
        subtotalCents: 0,
        taxCents: 0,
        totalCents: 0,
        currency: "USD",
        guestCount: 2,
        orderNumber: "ORD-2222",
        items: [],
      };

      let attempt = 0;
      (withTenantContext as any).mockImplementation(
        async (_t: string, fn: any) => {
          attempt++;
          if (attempt === 1) {
            // First attempt simulates concurrent insert hitting P2002
            const p2002Error: any = new Error(
              "Unique constraint failed on orders_active_draft_table_session_idx",
            );
            p2002Error.code = "P2002";
            throw p2002Error;
          }
          // Second attempt is the recovery query returning the draft that won the race
          return fn({
            order: {
              findFirst: vi.fn().mockResolvedValue(existingDraft),
            },
          });
        },
      );

      const result = await OrderService.createOrder(orgId, actorId, {
        locationId: locId,
        tableId: "tbl-1",
        tableSessionId: "session-1",
      });

      expect(result.id).toBe("draft-winner-1");
      expect(result.status).toBe("DRAFT");
    });

    it("3. Duplicate Send to Kitchen requests: handles P2002 idempotency race and returns already-submitted order", async () => {
      const submittedOrder = {
        id: orderId,
        organizationId: orgId,
        locationId: locId,
        tableId: "tbl-1",
        status: "SUBMITTED",
        paymentStatus: "UNPAID",
        subtotalCents: 1550,
        taxCents: 128,
        totalCents: 1678,
        currency: "USD",
        guestCount: 2,
        orderNumber: "ORD-3333",
        idempotencyKey: "idem-key-duplicate",
        items: [],
      };

      let attempt = 0;
      (withTenantContext as any).mockImplementation(
        async (_t: string, fn: any) => {
          attempt++;
          if (attempt === 1) {
            const p2002Error: any = new Error(
              "Unique constraint failed on orders_org_idempotency_idx",
            );
            p2002Error.code = "P2002";
            throw p2002Error;
          }
          return fn({
            order: {
              findFirst: vi.fn().mockResolvedValue(submittedOrder),
            },
          });
        },
      );

      const result = await OrderService.submitOrder(orgId, actorId, orderId, {
        idempotencyKey: "idem-key-duplicate",
      });

      expect(result.id).toBe(orderId);
      expect(result.status).toBe("SUBMITTED");
      expect(result.orderNumber).toBe("ORD-3333");
    });

    it("4. Row-level locking on item addition: acquires SELECT ... FOR UPDATE on order row", async () => {
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
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
            subtotalCents: 1500,
            taxCents: 0,
            totalCents: 1500,
            items: [],
          }),
        },
        menuItem: {
          findFirst: vi.fn().mockResolvedValue({
            id: menuItemId,
            organizationId: orgId,
            name: "Burger",
            basePriceCents: 1500,
            isAvailable: true,
            modifierGroups: [],
          }),
        },
        locationMenuOverride: { findFirst: vi.fn().mockResolvedValue(null) },
        orderItem: {
          create: vi.fn().mockResolvedValue({ id: "item-new" }),
          findMany: vi.fn().mockResolvedValue([
            {
              id: "item-new",
              subtotalCents: 1500,
              taxCents: 0,
              status: "PENDING",
            },
          ]),
        },
      };

      (withTenantContext as any).mockImplementation((_t: string, fn: any) =>
        fn(mockTx),
      );

      await OrderService.addOrderItem(orgId, actorId, orderId, {
        menuItemId,
        quantity: 1,
      });

      expect(mockTx.$queryRaw).toHaveBeenCalled();
    });

    it("5. Row-level locking on item update: acquires SELECT ... FOR UPDATE before modification", async () => {
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
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
            items: [],
          }),
        },
        orderItem: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-1",
            orderId,
            organizationId: orgId,
            basePriceCents: 1000,
            quantity: 1,
            taxRateBasisPoints: 0,
            modifiers: [],
          }),
          update: vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([
            {
              id: "line-1",
              subtotalCents: 2000,
              taxCents: 0,
              status: "PENDING",
            },
          ]),
        },
      };

      (withTenantContext as any).mockImplementation((_t: string, fn: any) =>
        fn(mockTx),
      );

      await OrderService.updateOrderItem(orgId, actorId, orderId, "line-1", {
        quantity: 2,
      });

      expect(mockTx.$queryRaw).toHaveBeenCalled();
    });

    it("6. Row-level locking on item removal: acquires SELECT ... FOR UPDATE before deletion and recalculation", async () => {
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([]),
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
            items: [],
          }),
        },
        orderItem: {
          findFirst: vi.fn().mockResolvedValue({
            id: "line-to-remove",
            orderId,
            organizationId: orgId,
          }),
          delete: vi.fn().mockResolvedValue({}),
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      (withTenantContext as any).mockImplementation((_t: string, fn: any) =>
        fn(mockTx),
      );

      await OrderService.removeOrderItem(
        orgId,
        actorId,
        orderId,
        "line-to-remove",
      );

      expect(mockTx.$queryRaw).toHaveBeenCalled();
      expect(mockTx.orderItem.delete).toHaveBeenCalledWith({
        where: { id: "line-to-remove" },
      });
    });

    it("7. Correct integer-cent totals calculation in recalculateOrderTotals", async () => {
      const allItems = [
        { id: "item-1", subtotalCents: 1250, taxCents: 103, status: "PENDING" },
        {
          id: "item-2",
          subtotalCents: 2400,
          taxCents: 198,
          status: "IN_PREPARATION",
        },
        {
          id: "item-3",
          subtotalCents: 9999,
          taxCents: 825,
          status: "CANCELLED",
        },
      ];

      const mockTx = {
        orderItem: {
          findMany: vi.fn().mockImplementation(({ where }) => {
            return allItems.filter((it) => {
              if (where?.status?.not && it.status === where.status.not)
                return false;
              return true;
            });
          }),
        },
        order: {
          update: vi.fn().mockImplementation(({ data }) => data),
        },
      };

      const totals = await OrderService.recalculateOrderTotals(
        mockTx,
        orderId,
        orgId,
      );

      expect(mockTx.orderItem.findMany).toHaveBeenCalledWith({
        where: { orderId, organizationId: orgId, status: { not: "CANCELLED" } },
      });
      expect(totals.subtotalCents).toBe(3650); // 1250 + 2400
      expect(totals.taxCents).toBe(301); // 103 + 198
      expect(totals.totalCents).toBe(3951); // 3650 + 301
    });

    it("8. Table status consistency: Table is NOT marked SERVED while another active order is IN_PREPARATION", async () => {
      const mockTx = {
        table: {
          findFirst: vi.fn().mockResolvedValue({
            id: "tbl-1",
            organizationId: orgId,
            status: "ORDERED",
            sessions: [{ status: "ACTIVE" }],
          }),
          update: vi.fn(),
        },
        order: {
          findMany: vi.fn().mockResolvedValue([
            { id: "order-1", status: "SERVED" }, // Round 1 is served
            { id: "order-2", status: "IN_PREPARATION" }, // Round 2 is being cooked
          ]),
        },
      };

      await OrderService.deriveAndUpdateTableStatus(mockTx, orgId, "tbl-1");

      // Table status must remain ORDERED, never prematurely transitioned to SERVED
      expect(mockTx.table.update).not.toHaveBeenCalled();
    });

    it("9. Table status consistency: Table transitions to SERVED when ALL submitted orders are SERVED", async () => {
      const mockTx = {
        table: {
          findFirst: vi.fn().mockResolvedValue({
            id: "tbl-1",
            organizationId: orgId,
            status: "ORDERED",
            sessions: [{ status: "ACTIVE" }],
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        order: {
          findMany: vi.fn().mockResolvedValue([
            { id: "order-1", status: "SERVED" },
            { id: "order-2", status: "SERVED" },
          ]),
        },
      };

      await OrderService.deriveAndUpdateTableStatus(mockTx, orgId, "tbl-1");

      expect(mockTx.table.update).toHaveBeenCalledWith({
        where: { id: "tbl-1" },
        data: { status: "SERVED" },
      });
    });

    it("10. Table status consistency: Ticket recall (SERVED -> READY) reverts table status to ORDERED", async () => {
      const mockTx = {
        table: {
          findFirst: vi.fn().mockResolvedValue({
            id: "tbl-1",
            organizationId: orgId,
            status: "SERVED",
            sessions: [{ status: "ACTIVE" }],
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        order: {
          findMany: vi.fn().mockResolvedValue([
            { id: "order-1", status: "READY" }, // Recalled from SERVED
          ]),
        },
      };

      await OrderService.deriveAndUpdateTableStatus(mockTx, orgId, "tbl-1");

      expect(mockTx.table.update).toHaveBeenCalledWith({
        where: { id: "tbl-1" },
        data: { status: "ORDERED" },
      });
    });

    it("11. Table status consistency: Does not overwrite manual operational states (BLOCKED, DIRTY, RESERVED)", async () => {
      for (const manualStatus of ["BLOCKED", "DIRTY", "RESERVED"] as const) {
        const mockTx = {
          table: {
            findFirst: vi.fn().mockResolvedValue({
              id: "tbl-1",
              organizationId: orgId,
              status: manualStatus,
              sessions: [],
            }),
            update: vi.fn(),
          },
          order: {
            findMany: vi.fn().mockResolvedValue([]),
          },
        };

        await OrderService.deriveAndUpdateTableStatus(mockTx, orgId, "tbl-1");

        expect(mockTx.table.update).not.toHaveBeenCalled();
      }
    });

    it("12. Tenant isolation during order creation and status transitions", async () => {
      const otherTenantOrgId = "org-999";
      const mockTx = {
        location: {
          findFirst: vi.fn().mockResolvedValue(null), // Other tenant's location not found
        },
      };

      (withTenantContext as any).mockImplementation(
        (tenantId: string, fn: any) => {
          expect(tenantId).toBe(otherTenantOrgId);
          return fn(mockTx);
        },
      );

      await expect(
        OrderService.createOrder(otherTenantOrgId, actorId, {
          locationId: "loc-foreign",
        }),
      ).rejects.toThrow("Location not found");
    });
  });

  describe("Critical Fix 4: Location Access & Modifier Validation", () => {
    it("1. User attempting to create an order in an unauthorized location rejects with 403 Forbidden", async () => {
      const mockTx = {
        location: {
          findFirst: vi.fn().mockResolvedValue({
            id: locId,
            organizationId: orgId,
            currency: "USD",
          }),
        },
        organizationMembership: {
          findUnique: vi.fn().mockResolvedValue({
            status: "ACTIVE",
            role: { name: "Server", permissions: [] },
            locationMemberships: [{ locationId: "other-loc-999" }],
          }),
        },
      };

      (withTenantContext as any).mockImplementation(
        (_tenantId: string, fn: any) => fn(mockTx),
      );

      await expect(
        OrderService.createOrder(orgId, actorId, {
          locationId: locId,
        }),
      ).rejects.toThrow(
        "Access denied: You are not authorized for this location",
      );

      try {
        await OrderService.createOrder(orgId, actorId, {
          locationId: locId,
        });
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
      }
    });

    it("2. Org-wide admin can access any location without explicit LocationMembership", async () => {
      const mockTx = {
        location: {
          findFirst: vi.fn().mockResolvedValue({
            id: locId,
            organizationId: orgId,
            currency: "USD",
          }),
        },
        organizationMembership: {
          findUnique: vi.fn().mockResolvedValue({
            status: "ACTIVE",
            role: { name: "Owner", permissions: [] },
            locationMemberships: [],
          }),
        },
        order: {
          create: vi.fn().mockImplementation(({ data }) => ({
            ...data,
            id: orderId,
            createdAt: new Date(),
            updatedAt: new Date(),
            items: [],
          })),
        },
      };

      (withTenantContext as any).mockImplementation(
        (_tenantId: string, fn: any) => fn(mockTx),
      );

      const result = await OrderService.createOrder(orgId, actorId, {
        locationId: locId,
      });

      expect(result.id).toBe(orderId);
      expect(mockTx.order.create).toHaveBeenCalledOnce();
    });

    it("3. Attempting to associate an order with a table belonging to another location rejects with 400 Bad Request", async () => {
      const mockTx = {
        location: {
          findFirst: vi.fn().mockResolvedValue({
            id: locId,
            organizationId: orgId,
            currency: "USD",
          }),
        },
        table: {
          findFirst: vi.fn().mockResolvedValue({
            id: "tbl-cross",
            organizationId: orgId,
            locationId: "loc-other-diff",
            sessions: [],
          }),
        },
      };

      (withTenantContext as any).mockImplementation(
        (_tenantId: string, fn: any) => fn(mockTx),
      );

      await expect(
        OrderService.createOrder(orgId, actorId, {
          locationId: locId,
          tableId: "tbl-cross",
        }),
      ).rejects.toThrow("Table does not belong to the requested location");

      try {
        await OrderService.createOrder(orgId, actorId, {
          locationId: locId,
          tableId: "tbl-cross",
        });
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
      }
    });

    it("4. Attempting to associate an order with a table session belonging to another table rejects with 400 Bad Request", async () => {
      const mockTx = {
        location: {
          findFirst: vi.fn().mockResolvedValue({
            id: locId,
            organizationId: orgId,
            currency: "USD",
          }),
        },
        table: {
          findFirst: vi.fn().mockResolvedValue({
            id: "tbl-1",
            organizationId: orgId,
            locationId: locId,
            sessions: [],
          }),
        },
        tableSession: {
          findFirst: vi.fn().mockResolvedValue({
            id: "sess-2",
            organizationId: orgId,
            locationId: locId,
            tableId: "tbl-2", // Mismatched table
          }),
        },
      };

      (withTenantContext as any).mockImplementation(
        (_tenantId: string, fn: any) => fn(mockTx),
      );

      await expect(
        OrderService.createOrder(orgId, actorId, {
          locationId: locId,
          tableId: "tbl-1",
          tableSessionId: "sess-2",
        }),
      ).rejects.toThrow("Table session does not belong to the requested table");

      try {
        await OrderService.createOrder(orgId, actorId, {
          locationId: locId,
          tableId: "tbl-1",
          tableSessionId: "sess-2",
        });
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
      }
    });

    it("5. Attempting to associate an order with a table session belonging to another location rejects with 400 Bad Request", async () => {
      const mockTx = {
        location: {
          findFirst: vi.fn().mockResolvedValue({
            id: locId,
            organizationId: orgId,
            currency: "USD",
          }),
        },
        tableSession: {
          findFirst: vi.fn().mockResolvedValue({
            id: "sess-other-loc",
            organizationId: orgId,
            locationId: "loc-other-999",
            tableId: "tbl-1",
          }),
        },
      };

      (withTenantContext as any).mockImplementation(
        (_tenantId: string, fn: any) => fn(mockTx),
      );

      await expect(
        OrderService.createOrder(orgId, actorId, {
          locationId: locId,
          tableSessionId: "sess-other-loc",
        }),
      ).rejects.toThrow(
        "Table session does not belong to the requested location",
      );
    });

    it("6. Attempting to modify an order through a mismatched client location rejects with 400 Bad Request", async () => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "DRAFT",
          }),
        },
      };

      (withTenantContext as any).mockImplementation(
        (_tenantId: string, fn: any) => fn(mockTx),
      );

      await expect(
        OrderService.updateOrder(
          orgId,
          actorId,
          orderId,
          { notes: "New note" },
          undefined,
          "mismatched-location-id",
        ),
      ).rejects.toThrow("Order does not belong to the specified location");
    });

    it("7. Attempting to modify an order in a location the actor is not assigned to rejects with 403 Forbidden", async () => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "DRAFT",
          }),
        },
        location: {
          findFirst: vi.fn().mockResolvedValue({
            id: locId,
            organizationId: orgId,
          }),
        },
        organizationMembership: {
          findUnique: vi.fn().mockResolvedValue({
            status: "ACTIVE",
            role: { name: "Server", permissions: [] },
            locationMemberships: [{ locationId: "other-loc-111" }],
          }),
        },
      };

      (withTenantContext as any).mockImplementation(
        (_tenantId: string, fn: any) => fn(mockTx),
      );

      await expect(
        OrderService.updateOrder(orgId, actorId, orderId, { notes: "test" }),
      ).rejects.toThrow(
        "Access denied: You are not authorized for this location",
      );
    });

    it("8. Submitting duplicate modifier options within the same modifier group rejects with 400 Bad Request", async () => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "DRAFT",
          }),
        },
        menuItem: {
          findFirst: vi.fn().mockResolvedValue({
            id: menuItemId,
            organizationId: orgId,
            name: "Paneer Tikka",
            basePriceCents: 1500,
            isAvailable: true,
            modifierGroups: [
              {
                modifierGroup: {
                  id: "group-spice",
                  name: "Spice Level",
                  isRequired: true,
                  minSelections: 1,
                  maxSelections: 2,
                  options: [
                    {
                      id: "opt-spicy",
                      name: "Spicy",
                      priceDeltaCents: 50,
                      isAvailable: true,
                    },
                  ],
                },
              },
            ],
          }),
        },
        locationMenuOverride: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      (withTenantContext as any).mockImplementation(
        (_tenantId: string, fn: any) => fn(mockTx),
      );

      await expect(
        OrderService.addOrderItem(orgId, actorId, orderId, {
          menuItemId,
          quantity: 1,
          selectedModifiers: [
            { modifierGroupId: "group-spice", modifierOptionId: "opt-spicy" },
            { modifierGroupId: "group-spice", modifierOptionId: "opt-spicy" },
          ],
        }),
      ).rejects.toThrow(
        'Duplicate modifier option "opt-spicy" submitted within modifier group "Spice Level"',
      );
    });

    it("9. Selecting options from a modifier group not attached to the item rejects with 400 Bad Request", async () => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "DRAFT",
          }),
        },
        menuItem: {
          findFirst: vi.fn().mockResolvedValue({
            id: menuItemId,
            organizationId: orgId,
            name: "Paneer Tikka",
            basePriceCents: 1500,
            isAvailable: true,
            modifierGroups: [
              {
                modifierGroup: {
                  id: "group-spice",
                  name: "Spice Level",
                  isRequired: true,
                  minSelections: 1,
                  maxSelections: 1,
                  options: [
                    {
                      id: "opt-spicy",
                      name: "Spicy",
                      priceDeltaCents: 50,
                      isAvailable: true,
                    },
                  ],
                },
              },
            ],
          }),
        },
        locationMenuOverride: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      (withTenantContext as any).mockImplementation(
        (_tenantId: string, fn: any) => fn(mockTx),
      );

      await expect(
        OrderService.addOrderItem(orgId, actorId, orderId, {
          menuItemId,
          quantity: 1,
          selectedModifiers: [
            {
              modifierGroupId: "unattached-group-id",
              modifierOptionId: "opt-spicy",
            },
          ],
        }),
      ).rejects.toThrow(
        'Modifier group "unattached-group-id" is not attached to this item',
      );
    });

    it("10. Selecting fewer options than minSelections on a modifier group rejects with 400 Bad Request", async () => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "DRAFT",
          }),
        },
        menuItem: {
          findFirst: vi.fn().mockResolvedValue({
            id: menuItemId,
            organizationId: orgId,
            name: "Custom Platter",
            basePriceCents: 2500,
            isAvailable: true,
            modifierGroups: [
              {
                modifierGroup: {
                  id: "group-dips",
                  name: "Dips Selection",
                  isRequired: true,
                  minSelections: 2,
                  maxSelections: 3,
                  options: [
                    {
                      id: "opt-mint",
                      name: "Mint Chutney",
                      priceDeltaCents: 0,
                      isAvailable: true,
                    },
                    {
                      id: "opt-tamarind",
                      name: "Tamarind Chutney",
                      priceDeltaCents: 0,
                      isAvailable: true,
                    },
                  ],
                },
              },
            ],
          }),
        },
        locationMenuOverride: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      (withTenantContext as any).mockImplementation(
        (_tenantId: string, fn: any) => fn(mockTx),
      );

      await expect(
        OrderService.addOrderItem(orgId, actorId, orderId, {
          menuItemId,
          quantity: 1,
          selectedModifiers: [
            { modifierGroupId: "group-dips", modifierOptionId: "opt-mint" },
          ],
        }),
      ).rejects.toThrow(
        'Modifier group "Dips Selection" requires at least 2 selection(s)',
      );
    });

    it("11. Selecting more options than maxSelections rejects with 400 Bad Request", async () => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
            status: "DRAFT",
          }),
        },
        menuItem: {
          findFirst: vi.fn().mockResolvedValue({
            id: menuItemId,
            organizationId: orgId,
            name: "Paneer Tikka",
            basePriceCents: 1500,
            isAvailable: true,
            modifierGroups: [
              {
                modifierGroup: {
                  id: "group-spice",
                  name: "Spice Level",
                  isRequired: true,
                  minSelections: 1,
                  maxSelections: 1,
                  options: [
                    {
                      id: "opt-mild",
                      name: "Mild",
                      priceDeltaCents: 0,
                      isAvailable: true,
                    },
                    {
                      id: "opt-spicy",
                      name: "Spicy",
                      priceDeltaCents: 50,
                      isAvailable: true,
                    },
                  ],
                },
              },
            ],
          }),
        },
        locationMenuOverride: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      (withTenantContext as any).mockImplementation(
        (_tenantId: string, fn: any) => fn(mockTx),
      );

      await expect(
        OrderService.addOrderItem(orgId, actorId, orderId, {
          menuItemId,
          quantity: 1,
          selectedModifiers: [
            { modifierGroupId: "group-spice", modifierOptionId: "opt-mild" },
            { modifierGroupId: "group-spice", modifierOptionId: "opt-spicy" },
          ],
        }),
      ).rejects.toThrow(
        'Modifier group "Spice Level" allows at most 1 selection(s)',
      );
    });

    it("12. Client-submitted prices and price deltas are ignored and computed strictly from database records", async () => {
      let createdItemData: any = null;
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
            items: [],
          }),
        },
        menuItem: {
          findFirst: vi.fn().mockResolvedValue({
            id: menuItemId,
            organizationId: orgId,
            name: "Paneer Tikka",
            basePriceCents: 1500, // DB authoritative price
            isAvailable: true,
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
                    {
                      id: "opt-spicy",
                      name: "Spicy",
                      priceDeltaCents: 50,
                      isAvailable: true,
                    },
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
          create: vi.fn().mockImplementation(({ data }) => {
            createdItemData = data;
            return { id: "item-line-1", ...data };
          }),
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      (withTenantContext as any).mockImplementation(
        (_tenantId: string, fn: any) => fn(mockTx),
      );

      // Client passes malicious attempts to tamper with prices:
      // - attempts to pass priceDeltaCents: 0 or customPrice: 1
      // - attempts to pass basePriceCents: 10
      await OrderService.addOrderItem(orgId, actorId, orderId, {
        menuItemId,
        quantity: 2,
        selectedModifiers: [
          {
            modifierGroupId: "group-spice",
            modifierOptionId: "opt-spicy",
            ...({ priceDeltaCents: 0, customPrice: 1 } as any),
          },
        ],
        ...({ basePriceCents: 10, subtotalCents: 20 } as any),
      });

      expect(createdItemData).not.toBeNull();
      // Verified authoritative calculations:
      // unitPrice = 1500 + 50 = 1550
      // subtotalCents = 1550 * 2 = 3100
      // taxCents = Math.round(3100 * 825 / 10000) = 256
      // totalCents = 3100 + 256 = 3356
      expect(createdItemData.basePriceCents).toBe(1500);
      expect(createdItemData.subtotalCents).toBe(3100);
      expect(createdItemData.taxCents).toBe(256);
      expect(createdItemData.totalCents).toBe(3356);
      expect(createdItemData.modifiers.create[0].priceDeltaCents).toBe(50);
    });

    it("13. Valid Paneer Tikka / Spice Level modifier selection works properly", async () => {
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
            items: [
              {
                id: "item-1",
                name: "Paneer Tikka",
                basePriceCents: 1500,
                quantity: 1,
                subtotalCents: 1550,
                taxCents: 128,
                totalCents: 1678,
                modifiers: [
                  {
                    id: "mod-1",
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
                    {
                      id: "opt-spicy",
                      name: "Spicy",
                      priceDeltaCents: 50,
                      isAvailable: true,
                    },
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
          create: vi.fn().mockResolvedValue({ id: "item-1" }),
          findMany: vi
            .fn()
            .mockResolvedValue([
              { subtotalCents: 1550, taxCents: 128, status: "PENDING" },
            ]),
        },
      };

      (withTenantContext as any).mockImplementation(
        (_tenantId: string, fn: any) => fn(mockTx),
      );

      const result = await OrderService.addOrderItem(orgId, actorId, orderId, {
        menuItemId,
        quantity: 1,
        selectedModifiers: [
          { modifierGroupId: "group-spice", modifierOptionId: "opt-spicy" },
        ],
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].modifiers[0].optionName).toBe("Spicy");
      expect(result.items[0].modifiers[0].priceDeltaCents).toBe(50);
      expect(emitToLocation).toHaveBeenCalledWith(
        orgId,
        locId,
        "order:updated",
        expect.any(Object),
      );
    });

    it("14. getOrders verifies location authorization and rejects tables from another location", async () => {
      const mockTx = {
        location: {
          findFirst: vi.fn().mockResolvedValue({
            id: locId,
            organizationId: orgId,
          }),
        },
        table: {
          findFirst: vi.fn().mockResolvedValue({
            id: "tbl-foreign",
            organizationId: orgId,
            locationId: "loc-other-999",
          }),
        },
      };

      (withTenantContext as any).mockImplementation(
        (_tenantId: string, fn: any) => fn(mockTx),
      );

      await expect(
        OrderService.getOrders(orgId, actorId, {
          locationId: locId,
          tableId: "tbl-foreign",
        }),
      ).rejects.toThrow("Table does not belong to the requested location");
    });

    it("15. getOrderById verifies location authorization and rejects mismatched client location", async () => {
      const mockTx = {
        order: {
          findFirst: vi.fn().mockResolvedValue({
            id: orderId,
            organizationId: orgId,
            locationId: locId,
          }),
        },
      };

      (withTenantContext as any).mockImplementation(
        (_tenantId: string, fn: any) => fn(mockTx),
      );

      await expect(
        OrderService.getOrderById(
          orgId,
          orderId,
          actorId,
          "mismatched-location-header",
        ),
      ).rejects.toThrow("Order does not belong to the specified location");
    });
  });

  describe("Critical Fix 5: KDS Reconnection Synchronization & Active Orders", () => {
    it("1. getActiveKitchenOrders rejects unauthorized location with 403 Forbidden", async () => {
      const mockTx = {
        location: {
          findFirst: vi.fn().mockResolvedValue({
            id: locId,
            organizationId: orgId,
          }),
        },
        organizationMembership: {
          findUnique: vi.fn().mockResolvedValue({
            status: "ACTIVE",
            role: { name: "Server", permissions: [] },
            locationMemberships: [{ locationId: "other-loc-999" }],
          }),
        },
      };

      (withTenantContext as any).mockImplementation(
        (_tenantId: string, fn: any) => fn(mockTx),
      );

      await expect(
        OrderService.getActiveKitchenOrders(orgId, actorId, locId),
      ).rejects.toThrow(
        "Access denied: You are not authorized for this location",
      );

      try {
        await OrderService.getActiveKitchenOrders(orgId, actorId, locId);
      } catch (err: any) {
        expect(err.statusCode).toBe(403);
      }
    });

    it("2. getActiveKitchenOrders queries only active orders (SUBMITTED, IN_PREPARATION, READY) and excludes DRAFT, SERVED, and CANCELLED", async () => {
      let findManyWhere: any = null;
      const mockTx = {
        location: {
          findFirst: vi.fn().mockResolvedValue({
            id: locId,
            organizationId: orgId,
          }),
        },
        order: {
          findMany: vi.fn().mockImplementation(({ where }) => {
            findManyWhere = where;
            return [];
          }),
        },
      };

      (withTenantContext as any).mockImplementation(
        (_tenantId: string, fn: any) => fn(mockTx),
      );

      await OrderService.getActiveKitchenOrders(orgId, actorId, locId);

      expect(mockTx.order.findMany).toHaveBeenCalledOnce();
      expect(findManyWhere.organizationId).toBe(orgId);
      expect(findManyWhere.locationId).toBe(locId);
      expect(findManyWhere.status).toEqual({
        in: ["SUBMITTED", "IN_PREPARATION", "READY"],
      });
    });

    it("3. getActiveKitchenOrders rejects mismatched client location header with 400 Bad Request", async () => {
      const mockTx = {
        location: {
          findFirst: vi.fn().mockResolvedValue({
            id: locId,
            organizationId: orgId,
          }),
        },
      };

      (withTenantContext as any).mockImplementation(
        (_tenantId: string, fn: any) => fn(mockTx),
      );

      await expect(
        OrderService.getActiveKitchenOrders(
          orgId,
          actorId,
          locId,
          "mismatched-location-header",
        ),
      ).rejects.toThrow("Order does not belong to the specified location");
    });
  });
});
