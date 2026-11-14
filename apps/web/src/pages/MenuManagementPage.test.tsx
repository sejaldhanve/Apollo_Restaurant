import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MenuManagementPage } from "./MenuManagementPage";
import { apiClient } from "../lib/api-client";
import { useAuthStore } from "../stores/authStore";

vi.mock("../lib/api-client", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("MenuManagementPage Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      currentOrgId: "org-1111-2222-3333-4444",
      isAuthenticated: true,
    });
    // Stub window.confirm to auto-approve deletes
    vi.spyOn(window, "confirm").mockImplementation(() => true);
  });

  it("renders elegant empty state when organization has no menus", async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === "/api/v1/menu/menus") return [];
      if (url === "/api/v1/menu/items") return [];
      if (url === "/api/v1/menu/stations") return [];
      if (url === "/api/v1/menu/tax-rates") return [];
      if (url === "/api/v1/menu/modifier-groups") return [];
      return [];
    });

    render(<MenuManagementPage />);

    await waitFor(() => {
      expect(screen.getByText("No Menus Created Yet")).toBeInTheDocument();
    });

    expect(screen.getByText("Create First Menu")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Quick Start: Generate Starter Menu (Includes Paneer Tikka & Tandoor)",
      ),
    ).toBeInTheDocument();
  });

  it("renders catalog categories and dishes when menus exist", async () => {
    const mockMenus = [
      {
        id: "menu-1",
        organizationId: "org-1111-2222-3333-4444",
        name: "Main Dining Menu",
        description: "Dinner menu",
        isActive: true,
        categories: [
          {
            id: "cat-1",
            menuId: "menu-1",
            organizationId: "org-1111-2222-3333-4444",
            name: "Starters",
            sortOrder: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const mockItems = [
      {
        id: "item-1",
        organizationId: "org-1111-2222-3333-4444",
        categoryId: "cat-1",
        name: "Truffle Fries",
        description: "Crispy fries with parmesan",
        basePriceCents: 1250,
        prepTimeMinutes: 10,
        isAvailable: true,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === "/api/v1/menu/menus") return mockMenus;
      if (url === "/api/v1/menu/items") return mockItems;
      return [];
    });

    render(<MenuManagementPage />);

    await waitFor(() => {
      expect(screen.getByText("Truffle Fries")).toBeInTheDocument();
    });

    expect(screen.getByText("$12.50")).toBeInTheDocument();
    expect(screen.getByText("Starters")).toBeInTheDocument();
  });

  it("allows editing an item, assigning to kitchen station and attaching modifier groups", async () => {
    const mockMenus = [
      {
        id: "menu-1",
        name: "Main Dining Menu",
        categories: [{ id: "cat-1", name: "Starters" }],
      },
    ];

    const mockStations = [
      {
        id: "station-tandoor",
        name: "Tandoor",
        code: "GRILL-01",
        type: "GRILL",
      },
    ];

    const mockModifierGroups = [
      {
        id: "mod-spice",
        name: "Spice Level",
        isRequired: true,
        minSelections: 1,
        maxSelections: 1,
        options: [
          { id: "opt-1", name: "Mild", priceDeltaCents: 0, isDefault: true },
          { id: "opt-2", name: "Spicy", priceDeltaCents: 50, isDefault: false },
        ],
      },
    ];

    const mockItems = [
      {
        id: "item-paneer",
        categoryId: "cat-1",
        name: "Paneer Tikka",
        description: "Fresh spiced cheese",
        basePriceCents: 1499,
        prepTimeMinutes: 15,
        isAvailable: true,
        kitchenStationId: null,
        modifierGroups: [],
      },
    ];

    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === "/api/v1/menu/menus") return mockMenus;
      if (url === "/api/v1/menu/items") return mockItems;
      if (url === "/api/v1/menu/stations") return mockStations;
      if (url === "/api/v1/menu/modifier-groups") return mockModifierGroups;
      return [];
    });

    vi.mocked(apiClient.put).mockResolvedValue({
      id: "item-paneer",
      categoryId: "cat-1",
      name: "Paneer Tikka Special",
      basePriceCents: 1599,
      prepTimeMinutes: 15,
      isAvailable: true,
      kitchenStationId: "station-tandoor",
      modifierGroups: [{ modifierGroupId: "mod-spice" }],
    });

    render(<MenuManagementPage />);

    await waitFor(() => {
      expect(screen.getByText("Paneer Tikka")).toBeInTheDocument();
    });

    // Click edit button
    const editBtn = screen.getByLabelText("Edit Paneer Tikka");
    fireEvent.click(editBtn);

    // Modal opens in Edit mode
    expect(screen.getByText("Edit Menu Item")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Paneer Tikka")).toBeInTheDocument();

    // Select Tandoor Kitchen Station
    const stationSelect = screen.getByDisplayValue("None / Unassigned");
    fireEvent.change(stationSelect, { target: { value: "station-tandoor" } });

    // Attach Spice Level modifier group
    const spiceCheckbox = screen.getByRole("checkbox", {
      name: /Spice Level/i,
    });
    fireEvent.click(spiceCheckbox);

    // Submit the update
    const saveBtn = screen.getByRole("button", { name: /Update Dish/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(apiClient.put).toHaveBeenCalledWith(
        "/api/v1/menu/items/item-paneer",
        expect.objectContaining({
          kitchenStationId: "station-tandoor",
          modifierGroupIds: ["mod-spice"],
        }),
      );
    });
  });

  it("allows deleting a menu item", async () => {
    const mockMenus = [
      {
        id: "menu-1",
        name: "Main Dining Menu",
        categories: [{ id: "cat-1", name: "Starters" }],
      },
    ];

    const mockItems = [
      {
        id: "item-to-delete",
        categoryId: "cat-1",
        name: "Old Soup",
        basePriceCents: 600,
        prepTimeMinutes: 5,
        isAvailable: true,
      },
    ];

    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === "/api/v1/menu/menus") return mockMenus;
      if (url === "/api/v1/menu/items") return mockItems;
      return [];
    });

    vi.mocked(apiClient.delete).mockResolvedValue({ success: true });

    render(<MenuManagementPage />);

    await waitFor(() => {
      expect(screen.getByText("Old Soup")).toBeInTheDocument();
    });

    const deleteBtn = screen.getByLabelText("Delete Old Soup");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith(
        "/api/v1/menu/items/item-to-delete",
      );
    });
  });

  it("navigates to Modifier Groups tab and renders groups and options", async () => {
    const mockModifierGroups = [
      {
        id: "mod-spice",
        name: "Spice Level",
        isRequired: true,
        minSelections: 1,
        maxSelections: 1,
        options: [
          { id: "opt-1", name: "Mild", priceDeltaCents: 0, isDefault: true },
          { id: "opt-2", name: "Spicy", priceDeltaCents: 50, isDefault: false },
        ],
      },
    ];

    vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
      if (url === "/api/v1/menu/modifier-groups") return mockModifierGroups;
      return [];
    });

    render(<MenuManagementPage />);

    // Switch to Modifier Groups tab
    const modTabBtn = screen.getByRole("button", { name: /Modifier Groups/i });
    fireEvent.click(modTabBtn);

    await waitFor(() => {
      expect(screen.getByText("Spice Level")).toBeInTheDocument();
    });

    expect(screen.getByText("Required")).toBeInTheDocument();
    expect(screen.getByText("Mild")).toBeInTheDocument();
    expect(screen.getByText("Spicy")).toBeInTheDocument();
    expect(screen.getByText("+$0.50")).toBeInTheDocument();
  });
});
