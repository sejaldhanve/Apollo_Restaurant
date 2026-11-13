import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { KitchenPage } from "./KitchenPage";
import { apiClient } from "../lib/api-client";
import { useAuthStore } from "../stores/authStore";

vi.mock("../lib/api-client", () => ({
  apiClient: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("../lib/socket", () => ({
  useOrderSocket: vi.fn(),
  getSocket: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  })),
}));

describe("KitchenPage Component", () => {
  const mockStations = [
    { id: "st-tandoor", name: "Tandoor", stationType: "GRILL", isActive: true },
    { id: "st-bar", name: "Bar", stationType: "BAR", isActive: true },
  ];

  const mockOrders = [
    {
      id: "ord-1",
      orderNumber: "ORD-501",
      status: "SUBMITTED",
      paymentStatus: "UNPAID",
      tableNumber: "T3",
      serverName: "Alice",
      guestCount: 2,
      subtotalCents: 1550,
      taxCents: 128,
      totalCents: 1678,
      currency: "USD",
      submittedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 mins ago
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: [
        {
          id: "item-1",
          orderId: "ord-1",
          menuItemId: "item-paneer",
          kitchenStationId: "st-tandoor",
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
    useAuthStore.setState({
      currentOrgId: "org-123",
      isAuthenticated: true,
    });

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/floor-plan")) return Promise.resolve({ locationId: "loc-123" });
      if (url.includes("/menu/stations")) return Promise.resolve(mockStations);
      if (url.includes("/orders")) return Promise.resolve(mockOrders);
      return Promise.resolve([]);
    });

    vi.mocked(apiClient.patch).mockResolvedValue({
      ...mockOrders[0],
      status: "IN_PREPARATION",
    });
  });

  it("renders KDS interface with stations and active tickets", async () => {
    render(<KitchenPage />);

    await waitFor(() => {
      expect(screen.getByText("Kitchen Display System (KDS)")).toBeInTheDocument();
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
  });

  it("allows bumping ticket to Start Prep", async () => {
    render(<KitchenPage />);

    await waitFor(() => {
      expect(screen.getByText("Start Prep")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Start Prep"));

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        "/api/v1/orders/ord-1/status",
        { status: "IN_PREPARATION" },
      );
    });
  });
});
