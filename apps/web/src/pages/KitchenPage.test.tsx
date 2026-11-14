import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from "@testing-library/react";
import { KitchenPage, reconcileOrders } from "./KitchenPage";
import { apiClient } from "../lib/api-client";
import { useAuthStore } from "../stores/authStore";
import type { OrderDto } from "@apollo/shared-types";

let capturedSocketCallbacks: any = {};

vi.mock("../lib/api-client", () => ({
  apiClient: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("../lib/socket", () => ({
  useOrderSocket: vi.fn((_locId, callbacks) => {
    capturedSocketCallbacks = callbacks || {};
  }),
  getSocket: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connected: true,
    io: { on: vi.fn(), off: vi.fn() },
  })),
}));

describe("KitchenPage Component", () => {
  const mockStations = [
    { id: "st-tandoor", name: "Tandoor", stationType: "GRILL", isActive: true },
    { id: "st-bar", name: "Bar", stationType: "BAR", isActive: true },
  ];

  const mockOrders: OrderDto[] = [
    {
      id: "ord-1",
      organizationId: "org-123",
      locationId: "loc-123",
      orderNumber: "ORD-501",
      status: "SUBMITTED",
      paymentStatus: "UNPAID",
      tableId: "tbl-3",
      tableNumber: "T3",
      diningAreaName: "Main",
      tableSessionId: null,
      serverUserId: "usr-1",
      serverName: "Alice",
      guestCount: 2,
      notes: null,
      idempotencyKey: null,
      submittedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 mins ago
      preparedAt: null,
      servedAt: null,
      cancelledAt: null,
      cancelReason: null,
      subtotalCents: 1550,
      taxCents: 128,
      totalCents: 1678,
      currency: "USD",
      createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      items: [
        {
          id: "item-1",
          orderId: "ord-1",
          menuItemId: "item-paneer",
          kitchenStationId: "st-tandoor",
          kitchenStationName: "Tandoor",
          name: "Paneer Tikka",
          basePriceCents: 1500,
          quantity: 2,
          subtotalCents: 3100,
          taxRateBasisPoints: 825,
          taxCents: 256,
          totalCents: 3356,
          status: "PENDING",
          specialInstructions: "Extra mint chutney",
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    capturedSocketCallbacks = {};
    useAuthStore.setState({
      currentOrgId: "org-123",
      isAuthenticated: true,
    });

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/floor-plan"))
        return Promise.resolve({ locationId: "loc-123" });
      if (url.includes("/menu/stations")) return Promise.resolve(mockStations);
      if (url.includes("/orders")) return Promise.resolve(mockOrders);
      return Promise.resolve([]);
    });

    vi.mocked(apiClient.patch).mockResolvedValue({
      ...mockOrders[0],
      status: "IN_PREPARATION",
    });
  });

  it("1. KDS initial connection fetches active tickets", async () => {
    render(<KitchenPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Kitchen Display System (KDS)"),
      ).toBeInTheDocument();
      expect(screen.getByText("All Stations")).toBeInTheDocument();
      expect(screen.getByText("Tandoor")).toBeInTheDocument();
      expect(screen.getByText("Bar")).toBeInTheDocument();
    });

    // Wait for async order load
    await waitFor(() => {
      expect(screen.getByText("ORD-501")).toBeInTheDocument();
    });

    expect(screen.getByText("Table T3")).toBeInTheDocument();
    expect(screen.getByText("Server: Alice")).toBeInTheDocument();
    expect(screen.getByText("Paneer Tikka")).toBeInTheDocument();
    expect(screen.getByText("2x")).toBeInTheDocument();
    expect(screen.getByText("Spicy")).toBeInTheDocument();
    expect(screen.getByText("⚠ Extra mint chutney")).toBeInTheDocument();
    expect(screen.getByText("Start Prep")).toBeInTheDocument();
    expect(apiClient.get).toHaveBeenCalledWith(
      "/api/v1/orders/kitchen/active?locationId=loc-123",
    );
  });

  it("2. Reconnection fetches the latest tickets", async () => {
    render(<KitchenPage />);

    await waitFor(() => {
      expect(screen.getByText("ORD-501")).toBeInTheDocument();
    });

    // Clear calls to verify reconnection trigger
    vi.mocked(apiClient.get).mockClear();

    // Trigger Socket.IO reconnection event
    await act(async () => {
      capturedSocketCallbacks.onReconnect?.();
    });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        "/api/v1/orders/kitchen/active?locationId=loc-123",
      );
    });
  });

  it("3. Duplicate socket events do not create duplicate tickets", async () => {
    render(<KitchenPage />);

    await waitFor(() => {
      expect(screen.getByText("ORD-501")).toBeInTheDocument();
    });

    // Emit duplicate order:submitted socket events
    await act(async () => {
      capturedSocketCallbacks.onOrderSubmitted?.(mockOrders[0]);
      capturedSocketCallbacks.onOrderSubmitted?.(mockOrders[0]);
      capturedSocketCallbacks.onOrderUpdated?.(mockOrders[0]);
    });

    // Exactly one instance of ticket ORD-501 must exist
    const tickets = screen.getAllByText("ORD-501");
    expect(tickets.length).toBe(1);
  });

  it("4. A missed ticket appears after reconnection", async () => {
    const originalOrder = mockOrders[0]!;
    const originalItem = originalOrder.items[0]!;
    const missedOrder: OrderDto = {
      ...originalOrder,
      id: "ord-2",
      orderNumber: "ORD-502",
      tableNumber: "T7",
      status: "SUBMITTED",
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: [
        {
          ...originalItem,
          id: "item-2",
          orderId: "ord-2",
          name: "Butter Chicken",
        },
      ],
    };

    render(<KitchenPage />);

    await waitFor(() => {
      expect(screen.getByText("ORD-501")).toBeInTheDocument();
    });

    // Mock API returning both original and missed order upon reconnection
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/orders"))
        return Promise.resolve([mockOrders[0], missedOrder]);
      return Promise.resolve([]);
    });

    // Trigger reconnection
    await act(async () => {
      capturedSocketCallbacks.onReconnect?.();
    });

    await waitFor(() => {
      expect(screen.getByText("ORD-501")).toBeInTheDocument();
      expect(screen.getByText("ORD-502")).toBeInTheDocument();
      expect(screen.getByText("Butter Chicken")).toBeInTheDocument();
    });
  });

  it("5. Cancelled tickets disappear after synchronization", async () => {
    render(<KitchenPage />);

    await waitFor(() => {
      expect(screen.getByText("ORD-501")).toBeInTheDocument();
    });

    // Order was cancelled while disconnected: backend active query returns empty list
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/orders")) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    // Trigger reconnection sync
    await act(async () => {
      capturedSocketCallbacks.onReconnect?.();
    });

    await waitFor(() => {
      expect(screen.queryByText("ORD-501")).not.toBeInTheDocument();
      expect(screen.getByText("All caught up!")).toBeInTheDocument();
    });
  });

  it("6. Completed tickets are not incorrectly restored", async () => {
    render(<KitchenPage />);

    await waitFor(() => {
      expect(screen.getByText("ORD-501")).toBeInTheDocument();
    });

    // Order was served/completed: active kitchen query excludes SERVED orders
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/orders")) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await act(async () => {
      capturedSocketCallbacks.onReconnect?.();
    });

    await waitFor(() => {
      expect(screen.queryByText("ORD-501")).not.toBeInTheDocument();
    });
  });

  it("7. Existing tickets update rather than duplicate", async () => {
    render(<KitchenPage />);

    await waitFor(() => {
      expect(screen.getByText("ORD-501")).toBeInTheDocument();
      expect(screen.getByText("Start Prep")).toBeInTheDocument();
    });

    // Update status to IN_PREPARATION
    const updatedOrder: OrderDto = {
      ...mockOrders[0]!,
      status: "IN_PREPARATION",
      updatedAt: new Date(Date.now() + 1000).toISOString(),
    };

    await act(async () => {
      capturedSocketCallbacks.onOrderStatusChanged?.(updatedOrder);
    });

    await waitFor(() => {
      expect(screen.getByText("ORD-501")).toBeInTheDocument();
      // Action button transitions to Mark Ready
      expect(screen.getByText("Mark Ready")).toBeInTheDocument();
      expect(screen.queryByText("Start Prep")).not.toBeInTheDocument();
    });

    // Verify exactly one ticket card exists
    expect(screen.getAllByText("ORD-501").length).toBe(1);
  });

  it("8. Station filtering continues working after updates", async () => {
    const multiStationOrder: OrderDto = {
      ...mockOrders[0]!,
      items: [
        mockOrders[0]!.items[0]!, // Tandoor item
        {
          id: "item-bar-1",
          orderId: "ord-1",
          menuItemId: "item-lassi",
          kitchenStationId: "st-bar",
          kitchenStationName: "Bar",
          name: "Mango Lassi",
          basePriceCents: 500,
          quantity: 1,
          subtotalCents: 500,
          taxRateBasisPoints: 825,
          taxCents: 41,
          totalCents: 541,
          status: "PENDING",
          specialInstructions: null,
          modifiers: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/floor-plan"))
        return Promise.resolve({ locationId: "loc-123" });
      if (url.includes("/menu/stations")) return Promise.resolve(mockStations);
      if (url.includes("/orders")) return Promise.resolve([multiStationOrder]);
      return Promise.resolve([]);
    });

    render(<KitchenPage />);

    await waitFor(() => {
      expect(screen.getByText("Paneer Tikka")).toBeInTheDocument();
      expect(screen.getByText("Mango Lassi")).toBeInTheDocument();
    });

    // Filter to Bar station
    fireEvent.click(screen.getByText("Bar"));

    await waitFor(() => {
      expect(screen.getByText("Mango Lassi")).toBeInTheDocument();
      expect(screen.queryByText("Paneer Tikka")).not.toBeInTheDocument();
    });

    // Filter to Tandoor station
    fireEvent.click(screen.getByText("Tandoor"));

    await waitFor(() => {
      expect(screen.getByText("Paneer Tikka")).toBeInTheDocument();
      expect(screen.queryByText("Mango Lassi")).not.toBeInTheDocument();
    });
  });

  it("9. Offline and reconnecting status indicators update correctly", async () => {
    render(<KitchenPage />);

    await waitFor(() => {
      expect(screen.getByText("Live Real-time")).toBeInTheDocument();
    });

    // Simulate disconnect
    await act(async () => {
      capturedSocketCallbacks.onDisconnect?.();
    });

    await waitFor(() => {
      expect(screen.getByText("Offline — Reconnecting...")).toBeInTheDocument();
    });

    // Simulate reconnect
    await act(async () => {
      capturedSocketCallbacks.onReconnect?.();
    });

    await waitFor(() => {
      expect(screen.getByText("Live Real-time")).toBeInTheDocument();
    });
  });
});

describe("reconcileOrders Unit Tests", () => {
  const baseOrder: OrderDto = {
    id: "ord-rec-1",
    organizationId: "org-1",
    locationId: "loc-1",
    orderNumber: "ORD-901",
    status: "SUBMITTED",
    paymentStatus: "UNPAID",
    tableId: "tbl-1",
    tableNumber: "1",
    diningAreaName: "Dining",
    tableSessionId: null,
    serverUserId: null,
    serverName: null,
    guestCount: 1,
    notes: null,
    idempotencyKey: null,
    submittedAt: "2026-11-14T10:00:00.000Z",
    preparedAt: null,
    servedAt: null,
    cancelledAt: null,
    cancelReason: null,
    subtotalCents: 1000,
    taxCents: 80,
    totalCents: 1080,
    currency: "USD",
    createdAt: "2026-11-14T10:00:00.000Z",
    updatedAt: "2026-11-14T10:00:00.000Z",
    items: [],
  };

  it("preserves newer socket state when stale API response arrives during sync", () => {
    const prevOrders = [baseOrder];

    // Live socket event arrived during sync with newer timestamp
    const liveSocketEvent: OrderDto = {
      ...baseOrder,
      status: "IN_PREPARATION",
      updatedAt: "2026-11-14T10:00:08.000Z", // Newer
    };

    const eventsDuringSync = new Map<string, OrderDto>();
    eventsDuringSync.set(liveSocketEvent.id, liveSocketEvent);

    // Stale API response snapshot taken prior to socket event
    const staleApiResponse: OrderDto[] = [
      {
        ...baseOrder,
        status: "SUBMITTED" as const,
        updatedAt: "2026-11-14T10:00:02.000Z", // Older than socket
      },
    ];

    const result = reconcileOrders(
      prevOrders,
      staleApiResponse,
      eventsDuringSync,
    );

    expect(result.length).toBe(1);
    expect(result[0]!.status).toBe("IN_PREPARATION");
    expect(result[0]!.updatedAt).toBe("2026-11-14T10:00:08.000Z");
  });

  it("updates existing order when API response is fresher than in-memory state", () => {
    const prevOrders = [
      {
        ...baseOrder,
        status: "SUBMITTED" as const,
        updatedAt: "2026-11-14T10:00:00.000Z",
      },
    ];

    const freshApiResponse: OrderDto[] = [
      {
        ...baseOrder,
        status: "READY" as const,
        updatedAt: "2026-11-14T10:00:15.000Z", // Fresh authoritative update
      },
    ];

    const result = reconcileOrders(prevOrders, freshApiResponse);

    expect(result.length).toBe(1);
    expect(result[0]!.status).toBe("READY");
    expect(result[0]!.updatedAt).toBe("2026-11-14T10:00:15.000Z");
  });

  it("preserves new in-flight order received via socket during sync window", () => {
    const prevOrders = [baseOrder];

    const newInFlightOrder: OrderDto = {
      ...baseOrder,
      id: "ord-rec-2",
      orderNumber: "ORD-902",
      status: "SUBMITTED",
      submittedAt: "2026-11-14T10:00:05.000Z",
      updatedAt: "2026-11-14T10:00:05.000Z",
    };

    const eventsDuringSync = new Map<string, OrderDto>();
    eventsDuringSync.set(newInFlightOrder.id, newInFlightOrder);

    // API snapshot only contained baseOrder because query ran before ord-rec-2 was submitted
    const apiOrders = [baseOrder];

    const result = reconcileOrders(prevOrders, apiOrders, eventsDuringSync);

    expect(result.length).toBe(2);
    expect(result.map((o) => o.id)).toContain("ord-rec-1");
    expect(result.map((o) => o.id)).toContain("ord-rec-2");
  });

  it("drops completed or cancelled orders not returned in active API response", () => {
    const prevOrders = [
      baseOrder,
      {
        ...baseOrder,
        id: "ord-to-cancel",
        orderNumber: "ORD-999",
      },
    ];

    // API returns only baseOrder because ord-to-cancel was cancelled while offline
    const activeApiOrders = [baseOrder];

    const result = reconcileOrders(prevOrders, activeApiOrders);

    expect(result.length).toBe(1);
    expect(result[0]!.id).toBe("ord-rec-1");
  });

  it("sorts reconciled orders FIFO by submittedAt timestamp", () => {
    const orderOld: OrderDto = {
      ...baseOrder,
      id: "ord-old",
      orderNumber: "ORD-001",
      submittedAt: "2026-11-14T09:00:00.000Z",
    };
    const orderNew: OrderDto = {
      ...baseOrder,
      id: "ord-new",
      orderNumber: "ORD-002",
      submittedAt: "2026-11-14T10:30:00.000Z",
    };

    // Passed in reverse order
    const result = reconcileOrders([], [orderNew, orderOld]);

    expect(result[0]!.id).toBe("ord-old");
    expect(result[1]!.id).toBe("ord-new");
  });
});
