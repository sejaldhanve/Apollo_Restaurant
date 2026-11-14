import type { Prisma } from "@prisma/client";
import { withTenantContext } from "../../db/tenant-context.js";
import { AppError } from "../../utils/app-error.js";
import { AuditService } from "../../services/audit.service.js";
import type {
  CreateKitchenStationInput,
  UpdateKitchenStationInput,
  CreateTaxRateInput,
  UpdateTaxRateInput,
  CreateMenuInput,
  UpdateMenuInput,
  CreateMenuCategoryInput,
  UpdateMenuCategoryInput,
  CreateMenuItemInput,
  UpdateMenuItemInput,
  UpdateItemAvailabilityInput,
  CreateModifierGroupInput,
  UpdateModifierGroupInput,
  CreateModifierOptionInput,
  UpdateModifierOptionInput,
  UpsertLocationMenuOverrideInput,
} from "./menu.schemas.js";

export class MenuService {
  // ─── Kitchen Stations ───────────────────────────────────────────────────────

  static async createKitchenStation(
    orgId: string,
    actorId: string,
    input: CreateKitchenStationInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      // Check location belongs to org
      let location = await tx.location.findFirst({
        where: { id: input.locationId, organizationId: orgId },
      });
      if (!location) {
        // Fall back to first location in organization, or create default primary location
        location = await tx.location.findFirst({
          where: { organizationId: orgId },
        });
        if (!location) {
          const org = await tx.organization.findUnique({
            where: { id: orgId },
          });
          const orgName = org?.name || "Main";
          location = await tx.location.create({
            data: {
              organizationId: orgId,
              name: `${orgName} Main`,
              code: "MAIN",
              timezone: "America/New_York",
              currency: "USD",
            },
          });
        }
      }

      const existing = await tx.kitchenStation.findFirst({
        where: { locationId: location.id, code: input.code },
      });
      if (existing) {
        throw AppError.conflict(
          `Kitchen station with code '${input.code}' already exists at this location`,
        );
      }

      const station = await tx.kitchenStation.create({
        data: {
          organizationId: orgId,
          locationId: location.id,
          name: input.name,
          code: input.code,
          type: input.type,
          isExpo: input.isExpo,
        },
      });

      await AuditService.log(
        {
          action: "kitchen_station:created",
          organizationId: orgId,
          actorId,
          entityType: "KitchenStation",
          entityId: station.id,
          metadata: {
            name: station.name,
            code: station.code,
            type: station.type,
          },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return station;
    });
  }

  static async getKitchenStations(orgId: string, locationId?: string) {
    return withTenantContext(orgId, async (tx) => {
      return tx.kitchenStation.findMany({
        where: {
          organizationId: orgId,
          ...(locationId ? { locationId } : {}),
        },
        orderBy: { name: "asc" },
      });
    });
  }

  static async updateKitchenStation(
    orgId: string,
    stationId: string,
    actorId: string,
    input: UpdateKitchenStationInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const station = await tx.kitchenStation.findFirst({
        where: { id: stationId, organizationId: orgId },
      });
      if (!station) {
        throw AppError.notFound("Kitchen station not found");
      }

      if (input.code && input.code !== station.code) {
        const existing = await tx.kitchenStation.findFirst({
          where: {
            locationId: station.locationId,
            code: input.code,
            id: { not: stationId },
          },
        });
        if (existing) {
          throw AppError.conflict(
            `Kitchen station with code '${input.code}' already exists`,
          );
        }
      }

      const updated = await tx.kitchenStation.update({
        where: { id: stationId },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.code ? { code: input.code } : {}),
          ...(input.type ? { type: input.type } : {}),
          ...(typeof input.isExpo === "boolean"
            ? { isExpo: input.isExpo }
            : {}),
        },
      });

      await AuditService.log(
        {
          action: "kitchen_station:updated",
          organizationId: orgId,
          actorId,
          entityType: "KitchenStation",
          entityId: updated.id,
          metadata: { changes: input },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return updated;
    });
  }

  static async deleteKitchenStation(
    orgId: string,
    stationId: string,
    actorId: string,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const station = await tx.kitchenStation.findFirst({
        where: { id: stationId, organizationId: orgId },
      });
      if (!station) {
        throw AppError.notFound("Kitchen station not found");
      }

      await tx.kitchenStation.delete({ where: { id: stationId } });

      await AuditService.log(
        {
          action: "kitchen_station:deleted",
          organizationId: orgId,
          actorId,
          entityType: "KitchenStation",
          entityId: stationId,
          metadata: { name: station.name, code: station.code },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return { success: true };
    });
  }

  // ─── Tax Rates ──────────────────────────────────────────────────────────────

  static async createTaxRate(
    orgId: string,
    actorId: string,
    input: CreateTaxRateInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      if (input.isDefault) {
        // Clear existing default
        await tx.taxRate.updateMany({
          where: { organizationId: orgId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const taxRate = await tx.taxRate.create({
        data: {
          organizationId: orgId,
          name: input.name,
          rateBasisPoints: input.rateBasisPoints,
          isDefault: input.isDefault,
        },
      });

      await AuditService.log(
        {
          action: "tax_rate:created",
          organizationId: orgId,
          actorId,
          entityType: "TaxRate",
          entityId: taxRate.id,
          metadata: {
            name: taxRate.name,
            rateBasisPoints: taxRate.rateBasisPoints,
          },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return taxRate;
    });
  }

  static async getTaxRates(orgId: string) {
    return withTenantContext(orgId, async (tx) => {
      return tx.taxRate.findMany({
        where: { organizationId: orgId },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      });
    });
  }

  static async updateTaxRate(
    orgId: string,
    taxRateId: string,
    actorId: string,
    input: UpdateTaxRateInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const existing = await tx.taxRate.findFirst({
        where: { id: taxRateId, organizationId: orgId },
      });
      if (!existing) {
        throw AppError.notFound("Tax rate not found");
      }

      if (input.isDefault) {
        await tx.taxRate.updateMany({
          where: {
            organizationId: orgId,
            isDefault: true,
            id: { not: taxRateId },
          },
          data: { isDefault: false },
        });
      }

      const updated = await tx.taxRate.update({
        where: { id: taxRateId },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(typeof input.rateBasisPoints === "number"
            ? { rateBasisPoints: input.rateBasisPoints }
            : {}),
          ...(typeof input.isDefault === "boolean"
            ? { isDefault: input.isDefault }
            : {}),
        },
      });

      await AuditService.log(
        {
          action: "tax_rate:updated",
          organizationId: orgId,
          actorId,
          entityType: "TaxRate",
          entityId: updated.id,
          metadata: { changes: input },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return updated;
    });
  }

  static async deleteTaxRate(
    orgId: string,
    taxRateId: string,
    actorId: string,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const existing = await tx.taxRate.findFirst({
        where: { id: taxRateId, organizationId: orgId },
      });
      if (!existing) {
        throw AppError.notFound("Tax rate not found");
      }

      await tx.taxRate.delete({ where: { id: taxRateId } });

      await AuditService.log(
        {
          action: "tax_rate:deleted",
          organizationId: orgId,
          actorId,
          entityType: "TaxRate",
          entityId: taxRateId,
          metadata: { name: existing.name },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return { success: true };
    });
  }

  // ─── Menus ──────────────────────────────────────────────────────────────────

  static async createMenu(
    orgId: string,
    actorId: string,
    input: CreateMenuInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const menu = await tx.menu.create({
        data: {
          organizationId: orgId,
          name: input.name,
          description: input.description,
          isActive: input.isActive,
          schedule: input.schedule as Prisma.InputJsonValue | undefined,
        },
      });

      await AuditService.log(
        {
          action: "menu:created",
          organizationId: orgId,
          actorId,
          entityType: "Menu",
          entityId: menu.id,
          metadata: { name: menu.name },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return menu;
    });
  }

  static async getMenus(orgId: string) {
    return withTenantContext(orgId, async (tx) => {
      return tx.menu.findMany({
        where: { organizationId: orgId },
        include: {
          categories: {
            where: { isActive: true },
            orderBy: { sortOrder: "asc" },
            include: {
              items: {
                where: { isAvailable: true },
                orderBy: { name: "asc" },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      });
    });
  }

  static async getMenuById(orgId: string, menuId: string) {
    return withTenantContext(orgId, async (tx) => {
      const menu = await tx.menu.findFirst({
        where: { id: menuId, organizationId: orgId },
        include: {
          categories: {
            orderBy: { sortOrder: "asc" },
            include: {
              items: {
                orderBy: { name: "asc" },
                include: {
                  kitchenStation: true,
                  taxRate: true,
                  modifierGroups: {
                    orderBy: { sortOrder: "asc" },
                    include: {
                      modifierGroup: {
                        include: {
                          options: {
                            orderBy: { priceDeltaCents: "asc" },
                          },
                        },
                      },
                    },
                  },
                  overrides: true,
                },
              },
            },
          },
        },
      });

      if (!menu) {
        throw AppError.notFound("Menu not found");
      }

      return menu;
    });
  }

  static async updateMenu(
    orgId: string,
    menuId: string,
    actorId: string,
    input: UpdateMenuInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const existing = await tx.menu.findFirst({
        where: { id: menuId, organizationId: orgId },
      });
      if (!existing) {
        throw AppError.notFound("Menu not found");
      }

      const updated = await tx.menu.update({
        where: { id: menuId },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(typeof input.description !== "undefined"
            ? { description: input.description }
            : {}),
          ...(typeof input.isActive === "boolean"
            ? { isActive: input.isActive }
            : {}),
          ...(typeof input.schedule !== "undefined"
            ? { schedule: input.schedule as Prisma.InputJsonValue }
            : {}),
        },
      });

      await AuditService.log(
        {
          action: "menu:updated",
          organizationId: orgId,
          actorId,
          entityType: "Menu",
          entityId: updated.id,
          metadata: { changes: input },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return updated;
    });
  }

  static async deleteMenu(
    orgId: string,
    menuId: string,
    actorId: string,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const existing = await tx.menu.findFirst({
        where: { id: menuId, organizationId: orgId },
      });
      if (!existing) {
        throw AppError.notFound("Menu not found");
      }

      await tx.menu.delete({ where: { id: menuId } });

      await AuditService.log(
        {
          action: "menu:deleted",
          organizationId: orgId,
          actorId,
          entityType: "Menu",
          entityId: menuId,
          metadata: { name: existing.name },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return { success: true };
    });
  }

  // ─── Categories ─────────────────────────────────────────────────────────────

  static async getCategories(orgId: string, menuId?: string) {
    return withTenantContext(orgId, async (tx) => {
      return tx.menuCategory.findMany({
        where: {
          organizationId: orgId,
          ...(menuId ? { menuId } : {}),
        },
        include: {
          items: {
            orderBy: { name: "asc" },
          },
        },
        orderBy: { sortOrder: "asc" },
      });
    });
  }

  static async createCategory(
    orgId: string,
    actorId: string,
    input: CreateMenuCategoryInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const menu = await tx.menu.findFirst({
        where: { id: input.menuId, organizationId: orgId },
      });
      if (!menu) {
        throw AppError.notFound("Menu not found in this organization");
      }

      const category = await tx.menuCategory.create({
        data: {
          organizationId: orgId,
          menuId: input.menuId,
          name: input.name,
          description: input.description,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
        },
      });

      await AuditService.log(
        {
          action: "menu_category:created",
          organizationId: orgId,
          actorId,
          entityType: "MenuCategory",
          entityId: category.id,
          metadata: { name: category.name, menuId: category.menuId },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return category;
    });
  }

  static async updateCategory(
    orgId: string,
    categoryId: string,
    actorId: string,
    input: UpdateMenuCategoryInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const existing = await tx.menuCategory.findFirst({
        where: { id: categoryId, organizationId: orgId },
      });
      if (!existing) {
        throw AppError.notFound("Category not found");
      }

      const updated = await tx.menuCategory.update({
        where: { id: categoryId },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(typeof input.description !== "undefined"
            ? { description: input.description }
            : {}),
          ...(typeof input.sortOrder === "number"
            ? { sortOrder: input.sortOrder }
            : {}),
          ...(typeof input.isActive === "boolean"
            ? { isActive: input.isActive }
            : {}),
        },
      });

      await AuditService.log(
        {
          action: "menu_category:updated",
          organizationId: orgId,
          actorId,
          entityType: "MenuCategory",
          entityId: updated.id,
          metadata: { changes: input },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return updated;
    });
  }

  static async deleteCategory(
    orgId: string,
    categoryId: string,
    actorId: string,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const existing = await tx.menuCategory.findFirst({
        where: { id: categoryId, organizationId: orgId },
      });
      if (!existing) {
        throw AppError.notFound("Category not found");
      }

      await tx.menuCategory.delete({ where: { id: categoryId } });

      await AuditService.log(
        {
          action: "menu_category:deleted",
          organizationId: orgId,
          actorId,
          entityType: "MenuCategory",
          entityId: categoryId,
          metadata: { name: existing.name },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return { success: true };
    });
  }

  // ─── Menu Items ─────────────────────────────────────────────────────────────

  static async createMenuItem(
    orgId: string,
    actorId: string,
    input: CreateMenuItemInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const category = await tx.menuCategory.findFirst({
        where: { id: input.categoryId, organizationId: orgId },
      });
      if (!category) {
        throw AppError.notFound("Category not found in this organization");
      }

      if (input.kitchenStationId) {
        const station = await tx.kitchenStation.findFirst({
          where: { id: input.kitchenStationId, organizationId: orgId },
        });
        if (!station) {
          throw AppError.notFound(
            "Kitchen station not found in this organization",
          );
        }
      }

      if (input.taxRateId) {
        const taxRate = await tx.taxRate.findFirst({
          where: { id: input.taxRateId, organizationId: orgId },
        });
        if (!taxRate) {
          throw AppError.notFound("Tax rate not found in this organization");
        }
      }

      const item = await tx.menuItem.create({
        data: {
          organizationId: orgId,
          categoryId: input.categoryId,
          kitchenStationId: input.kitchenStationId,
          taxRateId: input.taxRateId,
          name: input.name,
          description: input.description,
          sku: input.sku,
          basePriceCents: input.basePriceCents,
          isAvailable: input.isAvailable,
          prepTimeMinutes: input.prepTimeMinutes,
          calories: input.calories,
          allergens: input.allergens,
        },
      });

      // Link modifier groups if provided
      if (input.modifierGroupIds && input.modifierGroupIds.length > 0) {
        for (let i = 0; i < input.modifierGroupIds.length; i++) {
          const modGroupId = input.modifierGroupIds[i]!;
          await tx.menuItemModifierGroup.create({
            data: {
              organizationId: orgId,
              menuItemId: item.id,
              modifierGroupId: modGroupId,
              sortOrder: i,
            },
          });
        }
      }

      await AuditService.log(
        {
          action: "menu_item:created",
          organizationId: orgId,
          actorId,
          entityType: "MenuItem",
          entityId: item.id,
          metadata: { name: item.name, basePriceCents: item.basePriceCents },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return this.getMenuItemById(orgId, item.id, tx);
    });
  }

  static async getMenuItems(
    orgId: string,
    categoryId?: string,
    locationId?: string,
  ) {
    return withTenantContext(orgId, async (tx) => {
      const items = await tx.menuItem.findMany({
        where: {
          organizationId: orgId,
          ...(categoryId ? { categoryId } : {}),
        },
        include: {
          kitchenStation: true,
          taxRate: true,
          modifierGroups: {
            orderBy: { sortOrder: "asc" },
            include: {
              modifierGroup: {
                include: {
                  options: {
                    orderBy: { priceDeltaCents: "asc" },
                  },
                },
              },
            },
          },
          overrides: locationId ? { where: { locationId } } : true,
        },
        orderBy: { name: "asc" },
      });

      // If locationId provided, compute effective price and availability
      if (locationId) {
        return items.map((item) => {
          const override = item.overrides[0];
          return {
            ...item,
            effectivePriceCents:
              override && typeof override.overridePriceCents === "number"
                ? override.overridePriceCents
                : item.basePriceCents,
            effectiveIsAvailable:
              override && typeof override.isAvailable === "boolean"
                ? override.isAvailable
                : item.isAvailable,
          };
        });
      }

      return items;
    });
  }

  static async getMenuItemById(
    orgId: string,
    itemId: string,
    txClient?: Prisma.TransactionClient,
  ) {
    const run = async (tx: Prisma.TransactionClient) => {
      const item = await tx.menuItem.findFirst({
        where: { id: itemId, organizationId: orgId },
        include: {
          kitchenStation: true,
          taxRate: true,
          modifierGroups: {
            orderBy: { sortOrder: "asc" },
            include: {
              modifierGroup: {
                include: {
                  options: {
                    orderBy: { priceDeltaCents: "asc" },
                  },
                },
              },
            },
          },
          overrides: true,
        },
      });

      if (!item) {
        throw AppError.notFound("Menu item not found");
      }

      return item;
    };

    if (txClient) {
      return run(txClient);
    }
    return withTenantContext(orgId, run);
  }

  static async updateMenuItem(
    orgId: string,
    itemId: string,
    actorId: string,
    input: UpdateMenuItemInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const existing = await tx.menuItem.findFirst({
        where: { id: itemId, organizationId: orgId },
      });
      if (!existing) {
        throw AppError.notFound("Menu item not found");
      }

      await tx.menuItem.update({
        where: { id: itemId },
        data: {
          ...(input.categoryId ? { categoryId: input.categoryId } : {}),
          ...(input.name ? { name: input.name } : {}),
          ...(typeof input.description !== "undefined"
            ? { description: input.description }
            : {}),
          ...(typeof input.sku !== "undefined" ? { sku: input.sku } : {}),
          ...(typeof input.basePriceCents === "number"
            ? { basePriceCents: input.basePriceCents }
            : {}),
          ...(typeof input.isAvailable === "boolean"
            ? { isAvailable: input.isAvailable }
            : {}),
          ...(typeof input.prepTimeMinutes === "number"
            ? { prepTimeMinutes: input.prepTimeMinutes }
            : {}),
          ...(typeof input.calories !== "undefined"
            ? { calories: input.calories }
            : {}),
          ...(input.allergens ? { allergens: input.allergens } : {}),
          ...(typeof input.kitchenStationId !== "undefined"
            ? { kitchenStationId: input.kitchenStationId }
            : {}),
          ...(typeof input.taxRateId !== "undefined"
            ? { taxRateId: input.taxRateId }
            : {}),
        },
      });

      // Update modifier groups if provided
      if (input.modifierGroupIds) {
        await tx.menuItemModifierGroup.deleteMany({
          where: { menuItemId: itemId },
        });

        for (let i = 0; i < input.modifierGroupIds.length; i++) {
          const modGroupId = input.modifierGroupIds[i]!;
          await tx.menuItemModifierGroup.create({
            data: {
              organizationId: orgId,
              menuItemId: itemId,
              modifierGroupId: modGroupId,
              sortOrder: i,
            },
          });
        }
      }

      await AuditService.log(
        {
          action: "menu_item:updated",
          organizationId: orgId,
          actorId,
          entityType: "MenuItem",
          entityId: itemId,
          metadata: { changes: input },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return this.getMenuItemById(orgId, itemId, tx);
    });
  }

  static async setItemAvailability(
    orgId: string,
    itemId: string,
    actorId: string,
    input: UpdateItemAvailabilityInput,
    locationId?: string,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const item = await tx.menuItem.findFirst({
        where: { id: itemId, organizationId: orgId },
      });
      if (!item) {
        throw AppError.notFound("Menu item not found");
      }

      if (locationId) {
        // Location-specific 86 toggle
        await tx.locationMenuOverride.upsert({
          where: {
            locationId_menuItemId: {
              locationId,
              menuItemId: itemId,
            },
          },
          update: {
            isAvailable: input.isAvailable,
          },
          create: {
            organizationId: orgId,
            locationId,
            menuItemId: itemId,
            isAvailable: input.isAvailable,
          },
        });
      } else {
        // Global item 86 toggle
        await tx.menuItem.update({
          where: { id: itemId },
          data: { isAvailable: input.isAvailable },
        });
      }

      await AuditService.log(
        {
          action: input.isAvailable
            ? "menu_item:86_cleared"
            : "menu_item:86_set",
          organizationId: orgId,
          actorId,
          entityType: "MenuItem",
          entityId: itemId,
          metadata: {
            isAvailable: input.isAvailable,
            reason: input.reason,
            locationId: locationId || "global",
          },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return {
        id: itemId,
        isAvailable: input.isAvailable,
        locationId: locationId || null,
        reason: input.reason || null,
      };
    });
  }

  static async deleteMenuItem(
    orgId: string,
    itemId: string,
    actorId: string,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const existing = await tx.menuItem.findFirst({
        where: { id: itemId, organizationId: orgId },
      });
      if (!existing) {
        throw AppError.notFound("Menu item not found");
      }

      await tx.menuItem.delete({ where: { id: itemId } });

      await AuditService.log(
        {
          action: "menu_item:deleted",
          organizationId: orgId,
          actorId,
          entityType: "MenuItem",
          entityId: itemId,
          metadata: { name: existing.name },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return { success: true };
    });
  }

  // ─── Modifier Groups & Options ──────────────────────────────────────────────

  static async createModifierGroup(
    orgId: string,
    actorId: string,
    input: CreateModifierGroupInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const group = await tx.modifierGroup.create({
        data: {
          organizationId: orgId,
          name: input.name,
          minSelections: input.minSelections,
          maxSelections: input.maxSelections,
          isRequired: input.isRequired,
        },
      });

      if (input.options && input.options.length > 0) {
        for (const opt of input.options) {
          await tx.modifierOption.create({
            data: {
              organizationId: orgId,
              modifierGroupId: group.id,
              name: opt.name,
              priceDeltaCents: opt.priceDeltaCents ?? 0,
              isAvailable: opt.isAvailable ?? true,
              isDefault: opt.isDefault ?? false,
            },
          });
        }
      }

      await AuditService.log(
        {
          action: "modifier_group:created",
          organizationId: orgId,
          actorId,
          entityType: "ModifierGroup",
          entityId: group.id,
          metadata: {
            name: group.name,
            optionsCount: input.options?.length ?? 0,
          },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return tx.modifierGroup.findUnique({
        where: { id: group.id },
        include: { options: { orderBy: { priceDeltaCents: "asc" } } },
      });
    });
  }

  static async getModifierGroups(orgId: string) {
    return withTenantContext(orgId, async (tx) => {
      return tx.modifierGroup.findMany({
        where: { organizationId: orgId },
        include: {
          options: { orderBy: { priceDeltaCents: "asc" } },
        },
        orderBy: { name: "asc" },
      });
    });
  }

  static async updateModifierGroup(
    orgId: string,
    groupId: string,
    actorId: string,
    input: UpdateModifierGroupInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const existing = await tx.modifierGroup.findFirst({
        where: { id: groupId, organizationId: orgId },
      });
      if (!existing) {
        throw AppError.notFound("Modifier group not found");
      }

      const updated = await tx.modifierGroup.update({
        where: { id: groupId },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(typeof input.minSelections === "number"
            ? { minSelections: input.minSelections }
            : {}),
          ...(typeof input.maxSelections === "number"
            ? { maxSelections: input.maxSelections }
            : {}),
          ...(typeof input.isRequired === "boolean"
            ? { isRequired: input.isRequired }
            : {}),
        },
        include: { options: true },
      });

      await AuditService.log(
        {
          action: "modifier_group:updated",
          organizationId: orgId,
          actorId,
          entityType: "ModifierGroup",
          entityId: groupId,
          metadata: { changes: input },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return updated;
    });
  }

  static async deleteModifierGroup(
    orgId: string,
    groupId: string,
    actorId: string,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const existing = await tx.modifierGroup.findFirst({
        where: { id: groupId, organizationId: orgId },
      });
      if (!existing) {
        throw AppError.notFound("Modifier group not found");
      }

      await tx.modifierGroup.delete({ where: { id: groupId } });

      await AuditService.log(
        {
          action: "modifier_group:deleted",
          organizationId: orgId,
          actorId,
          entityType: "ModifierGroup",
          entityId: groupId,
          metadata: { name: existing.name },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return { success: true };
    });
  }

  static async createModifierOption(
    orgId: string,
    groupId: string,
    actorId: string,
    input: CreateModifierOptionInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const group = await tx.modifierGroup.findFirst({
        where: { id: groupId, organizationId: orgId },
      });
      if (!group) {
        throw AppError.notFound(
          "Modifier group not found in this organization",
        );
      }

      const option = await tx.modifierOption.create({
        data: {
          organizationId: orgId,
          modifierGroupId: groupId,
          name: input.name,
          priceDeltaCents: input.priceDeltaCents ?? 0,
          isAvailable: input.isAvailable ?? true,
          isDefault: input.isDefault ?? false,
        },
      });

      await AuditService.log(
        {
          action: "modifier_option:created",
          organizationId: orgId,
          actorId,
          entityType: "ModifierOption",
          entityId: option.id,
          metadata: {
            name: option.name,
            priceDeltaCents: option.priceDeltaCents,
          },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return option;
    });
  }

  static async updateModifierOption(
    orgId: string,
    optionId: string,
    actorId: string,
    input: UpdateModifierOptionInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const existing = await tx.modifierOption.findFirst({
        where: { id: optionId, organizationId: orgId },
      });
      if (!existing) {
        throw AppError.notFound("Modifier option not found");
      }

      const updated = await tx.modifierOption.update({
        where: { id: optionId },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(typeof input.priceDeltaCents === "number"
            ? { priceDeltaCents: input.priceDeltaCents }
            : {}),
          ...(typeof input.isAvailable === "boolean"
            ? { isAvailable: input.isAvailable }
            : {}),
          ...(typeof input.isDefault === "boolean"
            ? { isDefault: input.isDefault }
            : {}),
        },
      });

      await AuditService.log(
        {
          action: "modifier_option:updated",
          organizationId: orgId,
          actorId,
          entityType: "ModifierOption",
          entityId: optionId,
          metadata: { changes: input },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return updated;
    });
  }

  static async deleteModifierOption(
    orgId: string,
    optionId: string,
    actorId: string,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const existing = await tx.modifierOption.findFirst({
        where: { id: optionId, organizationId: orgId },
      });
      if (!existing) {
        throw AppError.notFound("Modifier option not found");
      }

      await tx.modifierOption.delete({ where: { id: optionId } });

      await AuditService.log(
        {
          action: "modifier_option:deleted",
          organizationId: orgId,
          actorId,
          entityType: "ModifierOption",
          entityId: optionId,
          metadata: { name: existing.name },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return { success: true };
    });
  }

  // ─── Location Menu Overrides ────────────────────────────────────────────────

  static async upsertLocationOverride(
    orgId: string,
    actorId: string,
    input: UpsertLocationMenuOverrideInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const location = await tx.location.findFirst({
        where: { id: input.locationId, organizationId: orgId },
      });
      if (!location) {
        throw AppError.notFound("Location not found in this organization");
      }

      const item = await tx.menuItem.findFirst({
        where: { id: input.menuItemId, organizationId: orgId },
      });
      if (!item) {
        throw AppError.notFound("Menu item not found in this organization");
      }

      const override = await tx.locationMenuOverride.upsert({
        where: {
          locationId_menuItemId: {
            locationId: input.locationId,
            menuItemId: input.menuItemId,
          },
        },
        update: {
          ...(typeof input.overridePriceCents !== "undefined"
            ? { overridePriceCents: input.overridePriceCents }
            : {}),
          ...(typeof input.isAvailable !== "undefined"
            ? { isAvailable: input.isAvailable }
            : {}),
        },
        create: {
          organizationId: orgId,
          locationId: input.locationId,
          menuItemId: input.menuItemId,
          overridePriceCents: input.overridePriceCents,
          isAvailable: input.isAvailable,
        },
      });

      await AuditService.log(
        {
          action: "location_menu_override:upserted",
          organizationId: orgId,
          actorId,
          entityType: "LocationMenuOverride",
          entityId: override.id,
          metadata: {
            locationId: input.locationId,
            menuItemId: input.menuItemId,
            overridePriceCents: input.overridePriceCents,
            isAvailable: input.isAvailable,
          },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return override;
    });
  }

  static async getLocationOverrides(orgId: string, locationId: string) {
    return withTenantContext(orgId, async (tx) => {
      return tx.locationMenuOverride.findMany({
        where: { organizationId: orgId, locationId },
        include: { menuItem: true },
      });
    });
  }
}
