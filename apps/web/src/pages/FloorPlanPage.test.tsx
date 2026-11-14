import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { FloorPlanPage } from "./FloorPlanPage";
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

describe("FloorPlanPage Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      currentOrgId: "org-1111-2222-3333-4444",
      isAuthenticated: true,
    });
  });

  it("renders empty state when organization has no dining areas", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      locationId: "loc-1",
      diningAreas: [],
      tables: [],
    });

    render(<FloorPlanPage />);

    await waitFor(() => {
      expect(screen.getByText("No Floor Plan Configured")).toBeInTheDocument();
    });

    expect(screen.getByText("Create Dining Area")).toBeInTheDocument();
    expect(
      screen.getByText("⚡ Generate Starter Floor Plan"),
    ).toBeInTheDocument();
  });

  it("renders dining areas, live status summary, and tables", async () => {
    const mockFloorPlan = {
      locationId: "loc-1",
      diningAreas: [
        {
          id: "area-1",
          organizationId: "org-1",
          locationId: "loc-1",
          name: "Main Dining",
          sortOrder: 0,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      tables: [
        {
          id: "tbl-1",
          organizationId: "org-1",
          locationId: "loc-1",
          diningAreaId: "area-1",
          tableNumber: "T1",
          shape: "RECTANGLE" as const,
          minCovers: 2,
          maxCovers: 4,
          posX: 50,
          posY: 50,
          width: 100,
          height: 100,
          rotation: 0,
          status: "AVAILABLE" as const,
          isActive: true,
          activeSession: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "tbl-2",
          organizationId: "org-1",
          locationId: "loc-1",
          diningAreaId: "area-1",
          tableNumber: "T2",
          shape: "ROUND" as const,
          minCovers: 2,
          maxCovers: 4,
          posX: 200,
          posY: 50,
          width: 100,
          height: 100,
          rotation: 0,
          status: "SEATED" as const,
          isActive: true,
          activeSession: {
            id: "sess-1",
            organizationId: "org-1",
            locationId: "loc-1",
            tableId: "tbl-2",
            serverUserId: "usr-1",
            serverName: "Chef Auguste",
            guestCount: 3,
            seatedAt: new Date().toISOString(),
            status: "ACTIVE" as const,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/floor-plan")) return Promise.resolve(mockFloorPlan);
      if (url.includes("/staff")) return Promise.resolve([]);
      return Promise.resolve(mockFloorPlan);
    });

    render(<FloorPlanPage />);

    await waitFor(() => {
      expect(screen.getByText("T1")).toBeInTheDocument();
      expect(screen.getByText("T2")).toBeInTheDocument();
    });

    expect(screen.getByText("Main Dining")).toBeInTheDocument();
    expect(screen.getByText("Floor Designer")).toBeInTheDocument();
  });

  it("renders section server control and assigns staff member to dining area", async () => {
    const mockFloorPlan = {
      locationId: "loc-1",
      diningAreas: [
        {
          id: "area-1",
          organizationId: "org-1",
          locationId: "loc-1",
          name: "Main Dining",
          sortOrder: 0,
          isActive: true,
          assignedServerId: null,
          assignedServerName: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      tables: [],
    };

    const mockStaff = [
      {
        id: "staff-1",
        firstName: "Auguste",
        lastName: "Gusteau",
        email: "gusteau@apollo.local",
        role: "Server",
      },
    ];

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/floor-plan")) return Promise.resolve(mockFloorPlan);
      if (url.includes("/staff")) return Promise.resolve(mockStaff);
      return Promise.resolve({});
    });
    vi.mocked(apiClient.patch).mockResolvedValue({ success: true });

    render(<FloorPlanPage />);

    await waitFor(() => {
      expect(screen.getByText("Section Server:")).toBeInTheDocument();
    });

    const select = screen.getByDisplayValue("Unassigned");
    expect(select).toBeInTheDocument();
  });

  it("allows selecting a table and displays dedicated server assignment control", async () => {
    const mockFloorPlan = {
      locationId: "loc-1",
      diningAreas: [
        {
          id: "area-1",
          organizationId: "org-1",
          locationId: "loc-1",
          name: "Main Dining",
          sortOrder: 0,
          isActive: true,
          assignedServerId: null,
          assignedServerName: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      tables: [
        {
          id: "tbl-1",
          organizationId: "org-1",
          locationId: "loc-1",
          diningAreaId: "area-1",
          tableNumber: "T1",
          shape: "RECTANGLE" as const,
          minCovers: 2,
          maxCovers: 4,
          posX: 50,
          posY: 50,
          width: 100,
          height: 100,
          rotation: 0,
          status: "AVAILABLE" as const,
          isActive: true,
          assignedServerId: null,
          assignedServerName: null,
          activeSession: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    const mockStaff = [
      {
        id: "staff-1",
        firstName: "Auguste",
        lastName: "Gusteau",
        email: "gusteau@apollo.local",
        role: "Server",
      },
    ];

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes("/floor-plan")) return Promise.resolve(mockFloorPlan);
      if (url.includes("/staff")) return Promise.resolve(mockStaff);
      return Promise.resolve({});
    });

    render(<FloorPlanPage />);

    await waitFor(() => {
      expect(screen.getByText("T1")).toBeInTheDocument();
    });

    // Click table T1
    const tableEl = screen.getByText("T1");
    tableEl.click();

    await waitFor(() => {
      expect(screen.getByText("Dedicated Server")).toBeInTheDocument();
      expect(screen.getByText("Seat Party Now")).toBeInTheDocument();
    });
  });
});
