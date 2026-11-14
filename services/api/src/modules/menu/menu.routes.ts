import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { ApiSuccessResponse } from "@apollo/shared-types";
import { authenticate } from "../../middleware/authenticate.js";
import {
  requireOrganizationMembership,
  requirePermission,
} from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import {
  createKitchenStationSchema,
  updateKitchenStationSchema,
  createTaxRateSchema,
  updateTaxRateSchema,
  createMenuSchema,
  updateMenuSchema,
  createMenuCategorySchema,
  updateMenuCategorySchema,
  createMenuItemSchema,
  updateMenuItemSchema,
  updateItemAvailabilitySchema,
  createModifierGroupSchema,
  updateModifierGroupSchema,
  createModifierOptionSchema,
  updateModifierOptionSchema,
  upsertLocationMenuOverrideSchema,
} from "./menu.schemas.js";
import { MenuService } from "./menu.service.js";

export const menuRouter: Router = Router();

// All menu routes require authentication and validated organization context
menuRouter.use(authenticate);
menuRouter.use(requireOrganizationMembership());

function getParam(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0] ?? "";
  return val ?? "";
}

function getClientInfo(req: Request) {
  return {
    ip: req.ip || req.socket.remoteAddress,
    requestId: req.requestId,
  };
}

// ─── Kitchen Stations ─────────────────────────────────────────────────────────

menuRouter.post(
  "/stations",
  requirePermission("location:manage"),
  validate(createKitchenStationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const station = await MenuService.createKitchenStation(
        req.organizationId!,
        req.user!.id,
        req.body,
        getClientInfo(req),
      );
      const response: ApiSuccessResponse<typeof station> = {
        success: true,
        data: station,
      };
      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.get(
  "/stations",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const locationId = req.query.locationId as string | undefined;
      const stations = await MenuService.getKitchenStations(
        req.organizationId!,
        locationId,
      );
      res.json({ success: true, data: stations });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.put(
  "/stations/:id",
  requirePermission("location:manage"),
  validate(updateKitchenStationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await MenuService.updateKitchenStation(
        req.organizationId!,
        getParam(req.params.id),
        req.user!.id,
        req.body,
        getClientInfo(req),
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.delete(
  "/stations/:id",
  requirePermission("location:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await MenuService.deleteKitchenStation(
        req.organizationId!,
        getParam(req.params.id),
        req.user!.id,
        getClientInfo(req),
      );
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Tax Rates ────────────────────────────────────────────────────────────────

menuRouter.post(
  "/tax-rates",
  requirePermission("settings:manage"),
  validate(createTaxRateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const taxRate = await MenuService.createTaxRate(
        req.organizationId!,
        req.user!.id,
        req.body,
        getClientInfo(req),
      );
      res.status(201).json({ success: true, data: taxRate });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.get(
  "/tax-rates",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const taxRates = await MenuService.getTaxRates(req.organizationId!);
      res.json({ success: true, data: taxRates });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.put(
  "/tax-rates/:id",
  requirePermission("settings:manage"),
  validate(updateTaxRateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await MenuService.updateTaxRate(
        req.organizationId!,
        getParam(req.params.id),
        req.user!.id,
        req.body,
        getClientInfo(req),
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.delete(
  "/tax-rates/:id",
  requirePermission("settings:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await MenuService.deleteTaxRate(
        req.organizationId!,
        getParam(req.params.id),
        req.user!.id,
        getClientInfo(req),
      );
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Menus ────────────────────────────────────────────────────────────────────

menuRouter.post(
  "/menus",
  requirePermission("menu:manage"),
  validate(createMenuSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const menu = await MenuService.createMenu(
        req.organizationId!,
        req.user!.id,
        req.body,
        getClientInfo(req),
      );
      res.status(201).json({ success: true, data: menu });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.get(
  "/menus",
  requirePermission("menu:view"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const menus = await MenuService.getMenus(req.organizationId!);
      res.json({ success: true, data: menus });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.get(
  "/menus/:id",
  requirePermission("menu:view"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const menu = await MenuService.getMenuById(
        req.organizationId!,
        getParam(req.params.id),
      );
      res.json({ success: true, data: menu });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.put(
  "/menus/:id",
  requirePermission("menu:manage"),
  validate(updateMenuSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await MenuService.updateMenu(
        req.organizationId!,
        getParam(req.params.id),
        req.user!.id,
        req.body,
        getClientInfo(req),
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.delete(
  "/menus/:id",
  requirePermission("menu:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await MenuService.deleteMenu(
        req.organizationId!,
        getParam(req.params.id),
        req.user!.id,
        getClientInfo(req),
      );
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Categories ─────────────────────────────────────────────────────────────

menuRouter.get(
  "/categories",
  requirePermission("menu:view"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const menuId = req.query.menuId as string | undefined;
      const categories = await MenuService.getCategories(
        req.organizationId!,
        menuId,
      );
      res.json({ success: true, data: categories });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.post(
  "/categories",
  requirePermission("menu:manage"),
  validate(createMenuCategorySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const category = await MenuService.createCategory(
        req.organizationId!,
        req.user!.id,
        req.body,
        getClientInfo(req),
      );
      res.status(201).json({ success: true, data: category });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.put(
  "/categories/:id",
  requirePermission("menu:manage"),
  validate(updateMenuCategorySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await MenuService.updateCategory(
        req.organizationId!,
        getParam(req.params.id),
        req.user!.id,
        req.body,
        getClientInfo(req),
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.delete(
  "/categories/:id",
  requirePermission("menu:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await MenuService.deleteCategory(
        req.organizationId!,
        getParam(req.params.id),
        req.user!.id,
        getClientInfo(req),
      );
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Items ──────────────────────────────────────────────────────────────────

menuRouter.post(
  "/items",
  requirePermission("menu:manage"),
  validate(createMenuItemSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await MenuService.createMenuItem(
        req.organizationId!,
        req.user!.id,
        req.body,
        getClientInfo(req),
      );
      res.status(201).json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.get(
  "/items",
  requirePermission("menu:view"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const categoryId = req.query.categoryId as string | undefined;
      const locationId = req.query.locationId as string | undefined;
      const items = await MenuService.getMenuItems(
        req.organizationId!,
        categoryId,
        locationId,
      );
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.get(
  "/items/:id",
  requirePermission("menu:view"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const item = await MenuService.getMenuItemById(
        req.organizationId!,
        getParam(req.params.id),
      );
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.put(
  "/items/:id",
  requirePermission("menu:manage"),
  validate(updateMenuItemSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await MenuService.updateMenuItem(
        req.organizationId!,
        getParam(req.params.id),
        req.user!.id,
        req.body,
        getClientInfo(req),
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.patch(
  "/items/:id/availability",
  requirePermission("menu:86_toggle"),
  validate(updateItemAvailabilitySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const locationId = req.query.locationId as string | undefined;
      const result = await MenuService.setItemAvailability(
        req.organizationId!,
        getParam(req.params.id),
        req.user!.id,
        req.body,
        locationId,
        getClientInfo(req),
      );
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.delete(
  "/items/:id",
  requirePermission("menu:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await MenuService.deleteMenuItem(
        req.organizationId!,
        getParam(req.params.id),
        req.user!.id,
        getClientInfo(req),
      );
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Modifier Groups & Options ──────────────────────────────────────────────

menuRouter.post(
  "/modifier-groups",
  requirePermission("menu:manage"),
  validate(createModifierGroupSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const group = await MenuService.createModifierGroup(
        req.organizationId!,
        req.user!.id,
        req.body,
        getClientInfo(req),
      );
      res.status(201).json({ success: true, data: group });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.get(
  "/modifier-groups",
  requirePermission("menu:view"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const groups = await MenuService.getModifierGroups(req.organizationId!);
      res.json({ success: true, data: groups });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.put(
  "/modifier-groups/:id",
  requirePermission("menu:manage"),
  validate(updateModifierGroupSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await MenuService.updateModifierGroup(
        req.organizationId!,
        getParam(req.params.id),
        req.user!.id,
        req.body,
        getClientInfo(req),
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.delete(
  "/modifier-groups/:id",
  requirePermission("menu:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await MenuService.deleteModifierGroup(
        req.organizationId!,
        getParam(req.params.id),
        req.user!.id,
        getClientInfo(req),
      );
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.post(
  "/modifier-groups/:id/options",
  requirePermission("menu:manage"),
  validate(createModifierOptionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const option = await MenuService.createModifierOption(
        req.organizationId!,
        getParam(req.params.id),
        req.user!.id,
        req.body,
        getClientInfo(req),
      );
      res.status(201).json({ success: true, data: option });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.put(
  "/modifier-options/:id",
  requirePermission("menu:manage"),
  validate(updateModifierOptionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updated = await MenuService.updateModifierOption(
        req.organizationId!,
        getParam(req.params.id),
        req.user!.id,
        req.body,
        getClientInfo(req),
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.delete(
  "/modifier-options/:id",
  requirePermission("menu:manage"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await MenuService.deleteModifierOption(
        req.organizationId!,
        getParam(req.params.id),
        req.user!.id,
        getClientInfo(req),
      );
      res.json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Location Menu Overrides ────────────────────────────────────────────────

menuRouter.post(
  "/overrides",
  requirePermission("location:manage"),
  validate(upsertLocationMenuOverrideSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const override = await MenuService.upsertLocationOverride(
        req.organizationId!,
        req.user!.id,
        req.body,
        getClientInfo(req),
      );
      res.json({ success: true, data: override });
    } catch (err) {
      next(err);
    }
  },
);

menuRouter.get(
  "/overrides/:locationId",
  requirePermission("menu:view"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const overrides = await MenuService.getLocationOverrides(
        req.organizationId!,
        getParam(req.params.locationId),
      );
      res.json({ success: true, data: overrides });
    } catch (err) {
      next(err);
    }
  },
);
