import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { PosPage } from "./PosPage";
import { apiClient } from "../lib/api-client";
import { useAuthStore } from "../stores/authStore";

vi.mock("../lib/api-client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
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

describe("PosPage Component", () => {
  const mockLocationId = "loc-test-123";

  const mockFloorPlan = {
    locationId: mockLocationId,
    diningAreas: [
      { id: "area-1", name: "Main Dining", sortOrder: 0, isActive: true },
    ],
    tables: [
      {
        id: "tbl-1",
        diningAreaId: "area-1",
        tableNumber: "T1",
        status: "AVAILABLE",
        maxCovers: 4,
        isActive: true,
      },
      {
        id: "tbl-2",
        diningAreaId: "area-1",
        tableNumber: "T2",
        status: "SEATED",
        maxCovers: 2,
        isActive: true,
        assignedServerName: "Sejal",
      },
    ],
  };

  const mockMenus = [
    {
      id: "menu-1",
      name: "Dinner Menu",
      categories: [
        { id: "cat-starters", name: "Starters", sortOrder: 0 },
        { id: "cat-mains", name: "Mains", sortOrder: 1 },
      ],
    },
  ];

  // Already-flattened shape (used in basic tests)
  const mockMenuItemsFlat = [
    {
      id: "item-paneer",
      name: "Paneer Tikka",
      description: "Char-grilled cottage cheese skewers",
      basePriceCents: 1500,
      categoryId: "cat-starters",
      isAvailable: true,
      modifierGroups: [
        {
          id: "grp-spice",
          name: "Spice Level",
          isRequired: true,
          minSelections: 1,
          maxSelections: 1,
          options: [
            { id: "opt-mild", name: "Mild", priceDeltaCents: 0, isAvailable: true },
            { id: "opt-spicy", name: "Spicy", priceDeltaCents: 50, isAvailable: true },
          ],
        },
      ],
    },
    {
      id: "item-naan",
      name: "Garlic Naan",
      description: "Clay oven baked flatbread",
      basePriceCents: 400,
      categoryId: "cat-mains",
      isAvailable: true,
      modifierGroups: [],
    },
  ];

  // Join-table shape — exactly as the real API returns
  const mockMenuItemsJoinTable = [
    {
      id: "item-paneer",
      organizationId: "org-123",
      name: "Paneer Tikka",
      description: "Char-grilled cottage cheese skewers",
      basePriceCents: 1500,
      categoryId: "cat-starters",
      isAvailable: true,
      modifierGroups: [
        {
          id: "join-1",
          menuItemId: "item-paneer",
          modifierGroupId: "grp-spice",
          sortOrder: 0,
          modifierGroup: {
            id: "grp-spice",
            organizationId: "org-123",
            name: "Spice Level",
            isRequired: true,
            minSelections: 1,
            maxSelections: 1,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
            options: [
              {
                id: "opt-mild",
                organizationId: "org-123",
                modifierGroupId: "grp-spice",
                name: "Mild",
                priceDeltaCents: 0,
                isAvailable: true,
                isDefault: false,
                createdAt: "2026-01-01T00:00:00Z",
                updatedAt: "2026-01-01T00:00:00Z",
              },
              {
                id: "opt-spicy",
                organizationId: "org-123",
                modifierGroupId: "grp-spice",
                name: "Spicy",
                priceDeltaCents: 50,
                isAvailable: true,
                isDefault: false,
                createdAt: "2026-01-01T00:00:00Z",
                updatedAt: "2026-01-01T00:00:00Z",
              },
            ],
          },
        },
      ],
    },
    {
      id: "item-naan",
      organizationId: "org-123",
      name: "Garlic Naan",
      description: "Clay oven baked flatbread",
      basePriceCents: 400,
      categoryId: "cat-mains",
      isAvailable: true,
      modifierGroups: [],
    },
  ];

  function setupMocks(menuItems: any[]) {
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/floor-plan")) return Promise.resolve(mockFloorPlan);
      if (url.includes("/menu/menus")) return Promise.resolve(mockMenus);
      if (url.includes("/menu/items")) return Promise.resolve(menuItems);
      if (url.includes("/orders")) return Promise.resolve([]);
      return Promise.resolve([]);
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      currentOrgId: "org-123",
      isAuthenticated: true,
    });
  });

  it("renders POS interface with Floor Plan and Tables", async () => {
    setupMocks(mockMenuItemsFlat);
    render(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText("Floor Plan & Tables")).toBeInTheDocument();
      expect(screen.getByText("Menu Items")).toBeInTheDocument();
    });

    // Check table cards are rendered
    await waitFor(() => {
      expect(screen.getByText("T1")).toBeInTheDocument();
      expect(screen.getByText("T2")).toBeInTheDocument();
      expect(screen.getByText("Server: Sejal")).toBeInTheDocument();
    });
  });

  it("switches to Menu Items view and displays catalog", async () => {
    setupMocks(mockMenuItemsFlat);
    render(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText("Menu Items")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Menu Items"));

    await waitFor(() => {
      expect(screen.getByText("Paneer Tikka")).toBeInTheDocument();
      expect(screen.getByText("Garlic Naan")).toBeInTheDocument();
      expect(screen.getByText("$15.00")).toBeInTheDocument();
      expect(screen.getByText("$4.00")).toBeInTheDocument();
    });
  });

  it("opens Modifier Customization modal when clicking customizable item (flattened shape)", async () => {
    setupMocks(mockMenuItemsFlat);
    render(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText("Menu Items")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Menu Items"));

    await waitFor(() => {
      expect(screen.getByText("Paneer Tikka")).toBeInTheDocument();
    });

    // Click Paneer Tikka
    fireEvent.click(screen.getByText("Paneer Tikka"));

    // Modal should appear
    await waitFor(() => {
      expect(screen.getByText("Spice Level")).toBeInTheDocument();
      expect(screen.getByText("Required")).toBeInTheDocument();
      expect(screen.getByText("Mild")).toBeInTheDocument();
      expect(screen.getByText("Spicy")).toBeInTheDocument();
      expect(screen.getByText("+$0.50")).toBeInTheDocument();
    });
  });

  // ─── REGRESSION TEST: This is the exact scenario that caused the white-screen crash ───

  it("REGRESSION: opens Modifier modal correctly with join-table API shape (bug fix)", async () => {
    setupMocks(mockMenuItemsJoinTable);
    render(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText("Menu Items")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Menu Items"));

    await waitFor(() => {
      expect(screen.getByText("Paneer Tikka")).toBeInTheDocument();
    });

    // This click previously caused a white screen crash — TypeError: Cannot read properties of undefined (reading 'map')
    fireEvent.click(screen.getByText("Paneer Tikka"));

    // Modal should open without crashing
    await waitFor(() => {
      expect(screen.getByText("Spice Level")).toBeInTheDocument();
      expect(screen.getByText("Required")).toBeInTheDocument();
      expect(screen.getByText("Mild")).toBeInTheDocument();
      expect(screen.getByText("Spicy")).toBeInTheDocument();
      expect(screen.getByText("+$0.50")).toBeInTheDocument();
      expect(screen.getByText("Add to Order")).toBeInTheDocument();
      expect(screen.getByText("Special Instructions")).toBeInTheDocument();
    });
  });

  it("REGRESSION: validates required modifier group before adding to order", async () => {
    setupMocks(mockMenuItemsJoinTable);
    render(<PosPage />);

    await waitFor(() => expect(screen.getByText("Menu Items")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Menu Items"));
    await waitFor(() => expect(screen.getByText("Paneer Tikka")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Paneer Tikka"));
    await waitFor(() => expect(screen.getByText("Add to Order")).toBeInTheDocument());

    // Try to add without selecting a required modifier
    fireEvent.click(screen.getByText("Add to Order"));

    await waitFor(() => {
      expect(
        screen.getByText(/Spice Level.*is required/i),
      ).toBeInTheDocument();
    });
  });

  it("REGRESSION: selecting a modifier option updates the total price", async () => {
    setupMocks(mockMenuItemsJoinTable);
    render(<PosPage />);

    await waitFor(() => expect(screen.getByText("Menu Items")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Menu Items"));
    await waitFor(() => expect(screen.getByText("Paneer Tikka")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Paneer Tikka"));
    await waitFor(() => expect(screen.getByText("Mild")).toBeInTheDocument());

    // Select the Spicy option (+$0.50) — total should become $15.50
    fireEvent.click(screen.getByText("Spicy"));

    await waitFor(() => {
      expect(screen.getByText("$15.50")).toBeInTheDocument();
    });
  });

  it("REGRESSION: closing the modifier modal does not crash the page", async () => {
    setupMocks(mockMenuItemsJoinTable);
    render(<PosPage />);

    await waitFor(() => expect(screen.getByText("Menu Items")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Menu Items"));
    await waitFor(() => expect(screen.getByText("Paneer Tikka")).toBeInTheDocument());

    // Open modal
    fireEvent.click(screen.getByText("Paneer Tikka"));
    await waitFor(() => expect(screen.getByText("Add to Order")).toBeInTheDocument());

    // Close modal via Cancel button
    fireEvent.click(screen.getByText("Cancel"));

    // Should return to normal menu view without crashing
    await waitFor(() => {
      expect(screen.getByText("Paneer Tikka")).toBeInTheDocument();
      expect(screen.getByText("Garlic Naan")).toBeInTheDocument();
    });

    // Modal content should be gone
    expect(screen.queryByText("Add to Order")).not.toBeInTheDocument();
  });

  it("adds a non-customizable item directly to the cart", async () => {
    setupMocks(mockMenuItemsJoinTable);

    const mockOrder = {
      id: "order-1",
      orderNumber: "ORD-001",
      status: "DRAFT",
      currency: "USD",
      guestCount: 1,
      subtotalCents: 400,
      taxCents: 0,
      totalCents: 400,
      items: [
        {
          id: "oi-1",
          name: "Garlic Naan",
          quantity: 1,
          unitPriceCents: 400,
          subtotalCents: 400,
          modifiers: [],
        },
      ],
    };

    vi.mocked(apiClient.post).mockResolvedValue(mockOrder);

    render(<PosPage />);

    await waitFor(() => expect(screen.getByText("Menu Items")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Menu Items"));
    await waitFor(() => expect(screen.getByText("Garlic Naan")).toBeInTheDocument());

    // Clicking Garlic Naan (no modifiers) should add directly — no modal
    fireEvent.click(screen.getByText("Garlic Naan"));

    // Should NOT open the modifier modal
    expect(screen.queryByText("Add to Order")).not.toBeInTheDocument();
  });
});
