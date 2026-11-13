import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../../app.js";
import { FoHService } from "./foh.service.js";
import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";

describe("FoH Floor Plan & Table Management Routes", () => {
  const app = createApp();

  const mockUser = {
    id: "a1111111-1111-4111-8111-111111111111",
    email: "manager@bistroalpha.com",
    firstName: "Auguste",
    lastName: "Gusteau",
    status: "ACTIVE",
    emailVerified: true,
  };

  const validToken = jwt.sign(
    { sub: mockUser.id, email: mockUser.email, type: "access" },
    env.JWT_SECRET,
    { expiresIn: "15m" },
  );

  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockLocationId = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const mockDiningAreaId = "bbbb1111-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const mockTableId = "cccc1111-cccc-4ccc-8ccc-cccccccccccc";

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(prisma.user, "findUnique").mockResolvedValue(mockUser as any);

    vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValue({
      id: "mem-1",
      userId: mockUser.id,
      organizationId: mockOrgId,
      roleId: "role-owner",
      status: "ACTIVE",
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      organization: {
        id: mockOrgId,
        slug: "bistro-alpha",
        name: "Bistro Alpha",
        legalName: null,
        taxId: null,
        status: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      role: {
        id: "role-owner",
        organizationId: mockOrgId,
        name: "Owner",
        description: null,
        isSystem: true,
        scope: "ORGANIZATION",
        createdAt: new Date(),
        updatedAt: new Date(),
        permissions: [
          { permission: { code: "table:view" } },
          { permission: { code: "table:manage" } },
          { permission: { code: "table:seat" } },
          { permission: { code: "table:status_update" } },
          { permission: { code: "table:transfer" } },
        ],
      },
      locationMemberships: [],
    } as any);
  });

  describe("GET /api/v1/foh/locations/:locationId/floor-plan", () => {
    it("should return 200 with floor plan data", async () => {
      vi.spyOn(FoHService, "getFloorPlan").mockResolvedValue({
        locationId: mockLocationId,
        diningAreas: [
          {
            id: mockDiningAreaId,
            organizationId: mockOrgId,
            locationId: mockLocationId,
            name: "Main Dining",
            sortOrder: 0,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        tables: [
          {
            id: mockTableId,
            organizationId: mockOrgId,
            locationId: mockLocationId,
            diningAreaId: mockDiningAreaId,
            tableNumber: "T1",
            shape: "RECTANGLE",
            minCovers: 2,
            maxCovers: 4,
            posX: 100,
            posY: 100,
            width: 120,
            height: 80,
            rotation: 0,
            status: "AVAILABLE",
            isActive: true,
            activeSession: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      });

      const res = await request(app)
        .get(`/api/v1/foh/locations/${mockLocationId}/floor-plan`)
        .set("Authorization", `Bearer ${validToken}`)
        .set("X-Organization-Id", mockOrgId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.diningAreas.length).toBe(1);
      expect(res.body.data.tables.length).toBe(1);
      expect(res.body.data.tables[0].tableNumber).toBe("T1");
    });
  });

  describe("POST /api/v1/foh/dining-areas", () => {
    it("should return 201 with created dining area", async () => {
      vi.spyOn(FoHService, "createDiningArea").mockResolvedValue({
        id: mockDiningAreaId,
        organizationId: mockOrgId,
        locationId: mockLocationId,
        name: "Patio Terrace",
        sortOrder: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post("/api/v1/foh/dining-areas")
        .set("Authorization", `Bearer ${validToken}`)
        .set("X-Organization-Id", mockOrgId)
        .send({
          locationId: mockLocationId,
          name: "Patio Terrace",
          sortOrder: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Patio Terrace");
    });
  });

  describe("POST /api/v1/foh/tables", () => {
    it("should return 201 with created table", async () => {
      vi.spyOn(FoHService, "createTable").mockResolvedValue({
        id: mockTableId,
        organizationId: mockOrgId,
        locationId: mockLocationId,
        diningAreaId: mockDiningAreaId,
        tableNumber: "T12",
        shape: "ROUND",
        minCovers: 2,
        maxCovers: 4,
        posX: 200,
        posY: 150,
        width: 100,
        height: 100,
        rotation: 0,
        status: "AVAILABLE",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post("/api/v1/foh/tables")
        .set("Authorization", `Bearer ${validToken}`)
        .set("X-Organization-Id", mockOrgId)
        .send({
          locationId: mockLocationId,
          diningAreaId: mockDiningAreaId,
          tableNumber: "T12",
          shape: "ROUND",
          minCovers: 2,
          maxCovers: 4,
          posX: 200,
          posY: 150,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tableNumber).toBe("T12");
    });
  });

  describe("POST /api/v1/foh/tables/:id/seat", () => {
    it("should return 200 with active session and updated table status", async () => {
      vi.spyOn(FoHService, "seatTable").mockResolvedValue({
        session: {
          id: "sess-1",
          tableId: mockTableId,
          guestCount: 4,
          serverUserId: mockUser.id,
          serverName: "Auguste Gusteau",
          seatedAt: new Date().toISOString(),
          status: "ACTIVE",
        },
        tableStatus: "SEATED",
      });

      const res = await request(app)
        .post(`/api/v1/foh/tables/${mockTableId}/seat`)
        .set("Authorization", `Bearer ${validToken}`)
        .set("X-Organization-Id", mockOrgId)
        .send({
          guestCount: 4,
          serverUserId: mockUser.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tableStatus).toBe("SEATED");
      expect(res.body.data.session.guestCount).toBe(4);
    });
  });

  describe("PATCH /api/v1/foh/tables/:id/status", () => {
    it("should return 200 with updated table status", async () => {
      vi.spyOn(FoHService, "updateTableStatus").mockResolvedValue({
        id: mockTableId,
        organizationId: mockOrgId,
        locationId: mockLocationId,
        diningAreaId: mockDiningAreaId,
        tableNumber: "T1",
        shape: "RECTANGLE",
        minCovers: 2,
        maxCovers: 4,
        posX: 100,
        posY: 100,
        width: 120,
        height: 80,
        rotation: 0,
        status: "DIRTY",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .patch(`/api/v1/foh/tables/${mockTableId}/status`)
        .set("Authorization", `Bearer ${validToken}`)
        .set("X-Organization-Id", mockOrgId)
        .send({ status: "DIRTY" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("DIRTY");
    });
  });

  describe("POST /api/v1/foh/tables/:id/transfer", () => {
    it("should return 200 on successful table transfer", async () => {
      const targetTableId = "ffff1111-ffff-4fff-8fff-ffffffffffff";
      vi.spyOn(FoHService, "transferTable").mockResolvedValue({
        previousSessionId: "old-sess",
        newSession: { id: "new-sess", tableId: targetTableId } as any,
        targetTableStatus: "SEATED",
        sourceTableStatus: "DIRTY",
      });

      const res = await request(app)
        .post(`/api/v1/foh/tables/${mockTableId}/transfer`)
        .set("Authorization", `Bearer ${validToken}`)
        .set("X-Organization-Id", mockOrgId)
        .send({ targetTableId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.targetTableStatus).toBe("SEATED");
      expect(res.body.data.sourceTableStatus).toBe("DIRTY");
    });
  });
});
