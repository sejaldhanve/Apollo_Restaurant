import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TeamManagementPage } from "./TeamManagementPage";
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

describe("TeamManagementPage Component", () => {
  const mockMembers = [
    {
      id: "mem-1",
      userId: "usr-1",
      organizationId: "org-1",
      email: "owner@restaurant.com",
      firstName: "Dhanve",
      lastName: "Sejal",
      status: "ACTIVE" as const,
      role: {
        id: "role-1",
        name: "Owner",
        description: "Full access",
        scope: "ORGANIZATION",
      },
      locations: [
        { id: "loc-1", name: "Main Location", code: "MAIN" },
      ],
      invitedAt: new Date().toISOString(),
      joinedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "mem-2",
      userId: "usr-2",
      organizationId: "org-1",
      email: "server.al@restaurant.com",
      firstName: "Alfredo",
      lastName: "Linguini",
      status: "ACTIVE" as const,
      role: {
        id: "role-2",
        name: "Server",
        description: "Front of house",
        scope: "LOCATION",
      },
      locations: [
        { id: "loc-1", name: "Main Location", code: "MAIN" },
      ],
      invitedAt: new Date().toISOString(),
      joinedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockRoles = [
    { id: "role-1", organizationId: "org-1", name: "Owner", description: "All", isSystem: true, scope: "ORGANIZATION" },
    { id: "role-2", organizationId: "org-1", name: "Server", description: "FoH", isSystem: true, scope: "LOCATION" },
    { id: "role-3", organizationId: "org-1", name: "Kitchen", description: "BoH", isSystem: true, scope: "LOCATION" },
  ];

  const mockLocations = [
    { id: "loc-1", name: "Main Dining", code: "MAIN", status: "ACTIVE" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      currentOrgId: "org-1",
      isAuthenticated: true,
      user: {
        id: "usr-1",
        email: "owner@restaurant.com",
        firstName: "Dhanve",
        lastName: "Sejal",
        status: "ACTIVE",
        emailVerified: true,
      },
    });

    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url === "/api/v1/team") return Promise.resolve(mockMembers);
      if (url === "/api/v1/team/roles") return Promise.resolve(mockRoles);
      if (url === "/api/v1/team/locations") return Promise.resolve(mockLocations);
      return Promise.resolve([]);
    });
  });

  it("renders team management header, summary KPI counts, and staff listing", async () => {
    render(<TeamManagementPage />);

    await waitFor(() => {
      expect(screen.getByText("Team & Staff Management")).toBeInTheDocument();
      expect(screen.getByText("Dhanve Sejal")).toBeInTheDocument();
      expect(screen.getByText("Alfredo Linguini")).toBeInTheDocument();
    });

    expect(screen.getByText("Total Staff")).toBeInTheDocument();
    expect(screen.getByText("Servers (FoH)")).toBeInTheDocument();
  });

  it("filters staff members by role pill", async () => {
    render(<TeamManagementPage />);

    await waitFor(() => {
      expect(screen.getByText("Dhanve Sejal")).toBeInTheDocument();
      expect(screen.getByText("Alfredo Linguini")).toBeInTheDocument();
    });

    // Click 'Server' filter
    const serverButton = screen.getByRole("button", { name: "Server" });
    fireEvent.click(serverButton);

    expect(screen.getByText("Alfredo Linguini")).toBeInTheDocument();
    expect(screen.queryByText("Dhanve Sejal")).not.toBeInTheDocument();
  });

  it("opens modal and submits new staff member invite", async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ success: true });

    render(<TeamManagementPage />);

    await waitFor(() => {
      expect(screen.getByText("Add Staff Member")).toBeInTheDocument();
    });

    // Open Invite modal
    fireEvent.click(screen.getByText("Add Staff Member"));

    expect(screen.getByPlaceholderText("e.g. Auguste")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("e.g. Auguste"), {
      target: { value: "Colette" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. Gusteau"), {
      target: { value: "Tatou" },
    });
    fireEvent.change(screen.getByPlaceholderText("server@restaurant.com"), {
      target: { value: "colette@restaurant.com" },
    });

    fireEvent.click(screen.getByText("Confirm & Add Staff"));

    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith(
        "/api/v1/team/invite",
        expect.objectContaining({
          email: "colette@restaurant.com",
          firstName: "Colette",
          lastName: "Tatou",
        }),
      );
    });
  });

  it("suspends active staff member when clicking Suspend", async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ success: true });

    render(<TeamManagementPage />);

    await waitFor(() => {
      expect(screen.getByText("Alfredo Linguini")).toBeInTheDocument();
    });

    // Alfredo (Server) has Suspend button (Owner is sole owner so no suspend button)
    const suspendBtn = screen.getByRole("button", { name: "Suspend" });
    fireEvent.click(suspendBtn);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        "/api/v1/team/mem-2/status",
        { status: "SUSPENDED" },
      );
    });
  });
});

