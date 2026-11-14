import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../../app.js";
import { MenuService } from "./menu.service.js";
import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";

describe("Restaurant Configuration & Menu Management Routes", () => {
  const app = createApp();

  const mockUser = {
    id: "u1111111-1111-4111-8111-111111111111",
    email: "chef@bistroalpha.com",
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
  const mockMenuId = "bbbb1111-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const mockCategoryId = "cccc1111-cccc-4ccc-8ccc-cccccccccccc";
  const mockItemId = "dddd1111-dddd-4ddd-8ddd-dddddddddddd";
  const mockModifierGroupId = "eeee1111-eeee-4eee-8eee-eeeeeeeeeeee";

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(prisma.user, "findUnique").mockResolvedValue(mockUser as any);

    // Mock active membership with full Owner permissions
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
          {
            id: "rp-1",
            roleId: "role-owner",
            permissionId: "p-1",
            organizationId: mockOrgId,
            createdAt: new Date(),
            permission: {
              id: "p-1",
              code: "menu:manage",
              name: "Manage Menu",
              description: null,
              module: "menu",
              createdAt: new Date(),
            },
          },
          {
            id: "rp-2",
            roleId: "role-owner",
            permissionId: "p-2",
            organizationId: mockOrgId,
            createdAt: new Date(),
            permission: {
              id: "p-2",
              code: "menu:view",
              name: "View Menu",
              description: null,
              module: "menu",
              createdAt: new Date(),
            },
          },
          {
            id: "rp-3",
            roleId: "role-owner",
            permissionId: "p-3",
            organizationId: mockOrgId,
            createdAt: new Date(),
            permission: {
              id: "p-3",
              code: "menu:86_toggle",
              name: "Toggle Item Availability",
              description: null,
              module: "menu",
              createdAt: new Date(),
            },
          },
          {
            id: "rp-4",
            roleId: "role-owner",
            permissionId: "p-4",
            organizationId: mockOrgId,
            createdAt: new Date(),
            permission: {
              id: "p-4",
              code: "location:manage",
              name: "Manage Locations",
              description: null,
              module: "location",
              createdAt: new Date(),
            },
          },
          {
            id: "rp-5",
            roleId: "role-owner",
            permissionId: "p-5",
            organizationId: mockOrgId,
            createdAt: new Date(),
            permission: {
              id: "p-5",
              code: "settings:manage",
              name: "Manage Settings",
              description: null,
              module: "settings",
              createdAt: new Date(),
            },
          },
        ],
      },
    } as any);
  });

  // ─── Kitchen Stations ───────────────────────────────────────────────────────

  describe("POST /api/v1/menu/stations", () => {
    it("should return 201 when kitchen station is created successfully", async () => {
      const mockStation = {
        id: "ks-1",
        organizationId: mockOrgId,
        locationId: mockLocationId,
        name: "Main Grill",
        code: "GRILL-01",
        type: "GRILL" as const,
        isExpo: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.spyOn(MenuService, "createKitchenStation").mockResolvedValue(
        mockStation as any,
      );

      const res = await request(app)
        .post("/api/v1/menu/stations")
        .set("Authorization", `Bearer ${validToken}`)
        .set("x-organization-id", mockOrgId)
        .send({
          locationId: mockLocationId,
          name: "Main Grill",
          code: "GRILL-01",
          type: "GRILL",
          isExpo: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Main Grill");
      expect(res.body.data.code).toBe("GRILL-01");
    });

    it("should return 400 when station code fails regex validation", async () => {
      const res = await request(app)
        .post("/api/v1/menu/stations")
        .set("Authorization", `Bearer ${validToken}`)
        .set("x-organization-id", mockOrgId)
        .send({
          locationId: mockLocationId,
          name: "Main Grill",
          code: "INVALID CODE WITH SPACES!",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/menu/stations", () => {
    it("should return 200 with list of kitchen stations", async () => {
      vi.spyOn(MenuService, "getKitchenStations").mockResolvedValue([
        {
          id: "ks-1",
          organizationId: mockOrgId,
          locationId: mockLocationId,
          name: "Main Grill",
          code: "GRILL-01",
          type: "GRILL",
          isExpo: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any);

      const res = await request(app)
        .get("/api/v1/menu/stations")
        .set("Authorization", `Bearer ${validToken}`)
        .set("x-organization-id", mockOrgId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0].code).toBe("GRILL-01");
    });
  });

  // ─── Tax Rates ──────────────────────────────────────────────────────────────

  describe("POST /api/v1/menu/tax-rates", () => {
    it("should return 201 with created tax rate in basis points", async () => {
      const mockTax = {
        id: "tax-1",
        organizationId: mockOrgId,
        name: "Standard State Tax",
        rateBasisPoints: 825, // 8.25%
        isDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.spyOn(MenuService, "createTaxRate").mockResolvedValue(mockTax as any);

      const res = await request(app)
        .post("/api/v1/menu/tax-rates")
        .set("Authorization", `Bearer ${validToken}`)
        .set("x-organization-id", mockOrgId)
        .send({
          name: "Standard State Tax",
          rateBasisPoints: 825,
          isDefault: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rateBasisPoints).toBe(825);
    });
  });

  // ─── Menus & Categories ─────────────────────────────────────────────────────

  describe("POST /api/v1/menu/menus", () => {
    it("should return 201 when menu is created", async () => {
      const mockMenu = {
        id: mockMenuId,
        organizationId: mockOrgId,
        name: "Dinner Menu",
        description: "Evening dinner service",
        isActive: true,
        schedule: { days: [1, 2, 3, 4, 5], start: "17:00", end: "22:00" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.spyOn(MenuService, "createMenu").mockResolvedValue(mockMenu as any);

      const res = await request(app)
        .post("/api/v1/menu/menus")
        .set("Authorization", `Bearer ${validToken}`)
        .set("x-organization-id", mockOrgId)
        .send({
          name: "Dinner Menu",
          description: "Evening dinner service",
          schedule: { days: [1, 2, 3, 4, 5], start: "17:00", end: "22:00" },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Dinner Menu");
    });
  });

  describe("POST /api/v1/menu/categories", () => {
    it("should return 201 when category is created", async () => {
      const mockCategory = {
        id: mockCategoryId,
        organizationId: mockOrgId,
        menuId: mockMenuId,
        name: "Prime Steaks",
        description: "Dry-aged prime cuts",
        sortOrder: 1,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.spyOn(MenuService, "createCategory").mockResolvedValue(
        mockCategory as any,
      );

      const res = await request(app)
        .post("/api/v1/menu/categories")
        .set("Authorization", `Bearer ${validToken}`)
        .set("x-organization-id", mockOrgId)
        .send({
          menuId: mockMenuId,
          name: "Prime Steaks",
          description: "Dry-aged prime cuts",
          sortOrder: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Prime Steaks");
    });
  });

  // ─── Menu Items ─────────────────────────────────────────────────────────────

  describe("POST /api/v1/menu/items", () => {
    it("should return 201 when menu item is created with integer cents price", async () => {
      const mockItem = {
        id: mockItemId,
        organizationId: mockOrgId,
        categoryId: mockCategoryId,
        name: "Dry-Aged Ribeye 16oz",
        description: "USDA Prime 35-day dry aged",
        sku: "STEAK-RIB-01",
        basePriceCents: 5800, // $58.00 in integer cents
        isAvailable: true,
        prepTimeMinutes: 20,
        allergens: ["dairy"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.spyOn(MenuService, "createMenuItem").mockResolvedValue(
        mockItem as any,
      );

      const res = await request(app)
        .post("/api/v1/menu/items")
        .set("Authorization", `Bearer ${validToken}`)
        .set("x-organization-id", mockOrgId)
        .send({
          categoryId: mockCategoryId,
          name: "Dry-Aged Ribeye 16oz",
          description: "USDA Prime 35-day dry aged",
          sku: "STEAK-RIB-01",
          basePriceCents: 5800,
          prepTimeMinutes: 20,
          allergens: ["dairy"],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.basePriceCents).toBe(5800);
      expect(res.body.data.name).toBe("Dry-Aged Ribeye 16oz");
    });

    it("should return 400 when basePriceCents is negative", async () => {
      const res = await request(app)
        .post("/api/v1/menu/items")
        .set("Authorization", `Bearer ${validToken}`)
        .set("x-organization-id", mockOrgId)
        .send({
          categoryId: mockCategoryId,
          name: "Invalid Steak",
          basePriceCents: -500,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("PUT /api/v1/menu/items/:id", () => {
    it("should return 200 when updating item with kitchen station and modifier groups (e.g. Paneer Tikka)", async () => {
      const mockUpdatedItem = {
        id: mockItemId,
        organizationId: mockOrgId,
        categoryId: mockCategoryId,
        name: "Paneer Tikka",
        kitchenStationId: "station-tandoor-id",
        basePriceCents: 1499,
        modifierGroups: [{ modifierGroupId: mockModifierGroupId }],
        updatedAt: new Date().toISOString(),
      };

      vi.spyOn(MenuService, "updateMenuItem").mockResolvedValue(
        mockUpdatedItem as any,
      );

      const res = await request(app)
        .put(`/api/v1/menu/items/${mockItemId}`)
        .set("Authorization", `Bearer ${validToken}`)
        .set("x-organization-id", mockOrgId)
        .send({
          name: "Paneer Tikka",
          kitchenStationId: "11111111-2222-3333-4444-555555555555",
          modifierGroupIds: [mockModifierGroupId],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Paneer Tikka");
      expect(MenuService.updateMenuItem).toHaveBeenCalledWith(
        mockOrgId,
        mockItemId,
        mockUser.id,
        expect.objectContaining({
          kitchenStationId: "11111111-2222-3333-4444-555555555555",
          modifierGroupIds: [mockModifierGroupId],
        }),
        expect.any(Object),
      );
    });
  });

  describe("DELETE /api/v1/menu/items/:id", () => {
    it("should return 200 when deleting menu item", async () => {
      vi.spyOn(MenuService, "deleteMenuItem").mockResolvedValue({
        success: true,
      } as any);

      const res = await request(app)
        .delete(`/api/v1/menu/items/${mockItemId}`)
        .set("Authorization", `Bearer ${validToken}`)
        .set("x-organization-id", mockOrgId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deleted).toBe(true);
      expect(MenuService.deleteMenuItem).toHaveBeenCalledWith(
        mockOrgId,
        mockItemId,
        mockUser.id,
        expect.any(Object),
      );
    });
  });

  // ─── Menu Availability (86 Stockboard) ───────────────────────────────────────

  describe("PATCH /api/v1/menu/items/:id/availability", () => {
    it("should return 200 when item 86 status is toggled", async () => {
      vi.spyOn(MenuService, "setItemAvailability").mockResolvedValue({
        id: mockItemId,
        isAvailable: false,
        locationId: null,
        reason: "Sold out for dinner service",
      });

      const res = await request(app)
        .patch(`/api/v1/menu/items/${mockItemId}/availability`)
        .set("Authorization", `Bearer ${validToken}`)
        .set("x-organization-id", mockOrgId)
        .send({
          isAvailable: false,
          reason: "Sold out for dinner service",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isAvailable).toBe(false);
      expect(res.body.data.reason).toBe("Sold out for dinner service");
    });
  });

  // ─── Modifier Groups ────────────────────────────────────────────────────────

  describe("POST /api/v1/menu/modifier-groups", () => {
    it("should return 201 with modifier group and options", async () => {
      const mockGroup = {
        id: mockModifierGroupId,
        organizationId: mockOrgId,
        name: "Meat Temperature",
        minSelections: 1,
        maxSelections: 1,
        isRequired: true,
        options: [
          {
            id: "opt-1",
            name: "Rare",
            priceDeltaCents: 0,
            isAvailable: true,
            isDefault: false,
          },
          {
            id: "opt-2",
            name: "Medium Rare",
            priceDeltaCents: 0,
            isAvailable: true,
            isDefault: true,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.spyOn(MenuService, "createModifierGroup").mockResolvedValue(
        mockGroup as any,
      );

      const res = await request(app)
        .post("/api/v1/menu/modifier-groups")
        .set("Authorization", `Bearer ${validToken}`)
        .set("x-organization-id", mockOrgId)
        .send({
          name: "Meat Temperature",
          minSelections: 1,
          maxSelections: 1,
          isRequired: true,
          options: [
            { name: "Rare", priceDeltaCents: 0 },
            { name: "Medium Rare", priceDeltaCents: 0, isDefault: true },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Meat Temperature");
      expect(res.body.data.options.length).toBe(2);
    });

    it("should return 200 on GET /api/v1/menu/modifier-groups", async () => {
      vi.spyOn(MenuService, "getModifierGroups").mockResolvedValue([
        {
          id: mockModifierGroupId,
          name: "Spice Level",
          isRequired: true,
          options: [{ id: "opt-1", name: "Mild", priceDeltaCents: 0 }],
        } as any,
      ]);

      const res = await request(app)
        .get("/api/v1/menu/modifier-groups")
        .set("Authorization", `Bearer ${validToken}`)
        .set("x-organization-id", mockOrgId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe("Spice Level");
    });

    it("should return 200 on DELETE /api/v1/menu/modifier-groups/:id", async () => {
      vi.spyOn(MenuService, "deleteModifierGroup").mockResolvedValue({
        success: true,
      } as any);

      const res = await request(app)
        .delete(`/api/v1/menu/modifier-groups/${mockModifierGroupId}`)
        .set("Authorization", `Bearer ${validToken}`)
        .set("x-organization-id", mockOrgId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deleted).toBe(true);
    });
  });

  // ─── Location Menu Overrides ────────────────────────────────────────────────

  describe("POST /api/v1/menu/overrides", () => {
    it("should return 200 with upserted location price override", async () => {
      const mockOverride = {
        id: "ov-1",
        organizationId: mockOrgId,
        locationId: mockLocationId,
        menuItemId: mockItemId,
        overridePriceCents: 6200, // $62.00 at high-cost downtown location
        isAvailable: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      vi.spyOn(MenuService, "upsertLocationOverride").mockResolvedValue(
        mockOverride as any,
      );

      const res = await request(app)
        .post("/api/v1/menu/overrides")
        .set("Authorization", `Bearer ${validToken}`)
        .set("x-organization-id", mockOrgId)
        .send({
          locationId: mockLocationId,
          menuItemId: mockItemId,
          overridePriceCents: 6200,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.overridePriceCents).toBe(6200);
    });
  });

  // ─── RBAC & Authorization Enforcement ───────────────────────────────────────

  describe("RBAC Enforcement", () => {
    it("should return 403 when user lacks required permission", async () => {
      // Mock user with only viewer permissions
      vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValue({
        id: "mem-viewer",
        userId: mockUser.id,
        organizationId: mockOrgId,
        roleId: "role-viewer",
        status: "ACTIVE",
        organization: { id: mockOrgId, status: "ACTIVE" },
        role: {
          id: "role-viewer",
          name: "Viewer",
          permissions: [
            {
              permission: { code: "menu:view" },
            },
          ],
        },
      } as any);

      // Attempt to mutate menu with only menu:view
      const res = await request(app)
        .post("/api/v1/menu/menus")
        .set("Authorization", `Bearer ${validToken}`)
        .set("x-organization-id", mockOrgId)
        .send({
          name: "Unauthorized Menu",
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("should return 401 when Authorization header is absent", async () => {
      const res = await request(app)
        .get("/api/v1/menu/menus")
        .set("x-organization-id", mockOrgId);

      expect(res.status).toBe(401);
    });

    it("should return 400 when organization identifier header is missing", async () => {
      const res = await request(app)
        .get("/api/v1/menu/menus")
        .set("Authorization", `Bearer ${validToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain(
        "Organization identifier is required",
      );
    });
  });
});
