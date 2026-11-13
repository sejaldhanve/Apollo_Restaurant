import { describe, it, expect, vi, beforeEach } from "vitest";
import { FoHService } from "./foh.service.js";
import { withTenantContext } from "../../db/tenant-context.js";

vi.mock("../../db/tenant-context.js", () => ({
  withTenantContext: vi.fn(),
}));

vi.mock("../../services/audit.service.js", () => ({
  AuditService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("FoHService Unit Tests", () => {
  const orgId = "11111111-1111-4111-8111-111111111111";
  const locId = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const actorId = "u1111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getFloorPlan returns dining areas and tables with active session info", async () => {
    const mockTx = {
      location: {
        findFirst: vi.fn().mockResolvedValue({ id: locId, organizationId: orgId }),
      },
      diningArea: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "area-1",
            organizationId: orgId,
            locationId: locId,
            name: "Main Dining Room",
            sortOrder: 0,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      },
      table: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "tbl-1",
            organizationId: orgId,
            locationId: locId,
            diningAreaId: "area-1",
            tableNumber: "T1",
            shape: "RECTANGLE",
            minCovers: 2,
            maxCovers: 4,
            posX: 100,
            posY: 150,
            width: 120,
            height: 80,
            rotation: 0,
            status: "SEATED",
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            sessions: [
              {
                id: "sess-1",
                organizationId: orgId,
                locationId: locId,
                tableId: "tbl-1",
                serverUserId: actorId,
                guestCount: 3,
                seatedAt: new Date(),
                closedAt: null,
                status: "ACTIVE",
                createdAt: new Date(),
                updatedAt: new Date(),
                server: { id: actorId, firstName: "Alice", lastName: "Smith" },
              },
            ],
          },
        ]),
      },
    };

    vi.mocked(withTenantContext).mockImplementation(async (_id, fn) => fn(mockTx as any));

    const result = await FoHService.getFloorPlan(orgId, locId);

    expect(result.locationId).toBe(locId);
    expect(result.diningAreas.length).toBe(1);
    expect(result.diningAreas[0]?.name).toBe("Main Dining Room");
    expect(result.tables.length).toBe(1);
    expect(result.tables[0]?.tableNumber).toBe("T1");
    expect(result.tables[0]?.status).toBe("SEATED");
    expect(result.tables[0]?.activeSession?.guestCount).toBe(3);
    expect(result.tables[0]?.activeSession?.serverName).toBe("Alice Smith");
  });

  it("createDiningArea throws conflict if area name already exists at location", async () => {
    const mockTx = {
      location: {
        findFirst: vi.fn().mockResolvedValue({ id: locId, organizationId: orgId }),
      },
      diningArea: {
        findFirst: vi.fn().mockResolvedValue({ id: "existing-area", name: "Patio" }),
      },
    };

    vi.mocked(withTenantContext).mockImplementation(async (_id, fn) => fn(mockTx as any));

    await expect(
      FoHService.createDiningArea(orgId, actorId, {
        locationId: locId,
        name: "Patio",
        sortOrder: 1,
      }),
    ).rejects.toThrow("already exists in this location");
  });

  it("seatTable throws conflict if table already has an active session", async () => {
    const mockTx = {
      table: {
        findFirst: vi.fn().mockResolvedValue({
          id: "tbl-1",
          organizationId: orgId,
          locationId: locId,
          status: "SEATED",
        }),
      },
      tableSession: {
        findFirst: vi.fn().mockResolvedValue({ id: "active-sess-1", status: "ACTIVE" }),
      },
    };

    vi.mocked(withTenantContext).mockImplementation(async (_id, fn) => fn(mockTx as any));

    await expect(
      FoHService.seatTable(orgId, actorId, "tbl-1", { guestCount: 2 }),
    ).rejects.toThrow("already occupied by an active session");
  });

  it("updateTableStatus completes active session when transitioned to DIRTY or AVAILABLE", async () => {
    const mockTx = {
      table: {
        findFirst: vi.fn().mockResolvedValue({
          id: "tbl-1",
          organizationId: orgId,
          status: "SEATED",
        }),
        update: vi.fn().mockResolvedValue({
          id: "tbl-1",
          status: "DIRTY",
        }),
      },
      tableSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    vi.mocked(withTenantContext).mockImplementation(async (_id, fn) => fn(mockTx as any));

    const result = await FoHService.updateTableStatus(orgId, actorId, "tbl-1", {
      status: "DIRTY",
    });

    expect(mockTx.tableSession.updateMany).toHaveBeenCalledWith({
      where: { tableId: "tbl-1", organizationId: orgId, status: "ACTIVE" },
      data: expect.objectContaining({ status: "COMPLETED" }),
    });
    expect(result.status).toBe("DIRTY");
  });
});

