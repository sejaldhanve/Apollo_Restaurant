import { z } from "zod";

export const stationTypeEnum = z.enum([
  "KITCHEN",
  "BAR",
  "GRILL",
  "SALAD",
  "PIZZA",
  "EXPO",
  "DESSERT",
]);

// ─── Kitchen Station ──────────────────────────────────────────────────────────

export const createKitchenStationSchema = z.object({
  locationId: z.string().uuid("Invalid location ID"),
  name: z.string().min(1, "Station name is required").max(100),
  code: z
    .string()
    .min(1, "Station code is required")
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/, "Code must contain only letters, numbers, hyphens, and underscores"),
  type: stationTypeEnum.default("KITCHEN"),
  isExpo: z.boolean().default(false),
});

export const updateKitchenStationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  code: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  type: stationTypeEnum.optional(),
  isExpo: z.boolean().optional(),
});

// ─── Tax Rate ─────────────────────────────────────────────────────────────────

export const createTaxRateSchema = z.object({
  name: z.string().min(1, "Tax rate name is required").max(100),
  rateBasisPoints: z
    .number()
    .int("Rate must be an integer basis point")
    .min(0, "Rate cannot be negative")
    .max(100000, "Rate cannot exceed 1000%"), // 825 = 8.25%
  isDefault: z.boolean().default(false),
});

export const updateTaxRateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  rateBasisPoints: z.number().int().min(0).max(100000).optional(),
  isDefault: z.boolean().optional(),
});

// ─── Menu ─────────────────────────────────────────────────────────────────────

export const createMenuSchema = z.object({
  name: z.string().min(1, "Menu name is required").max(100),
  description: z.string().max(500).optional(),
  isActive: z.boolean().default(true),
  schedule: z.record(z.unknown()).optional(),
});

export const updateMenuSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  schedule: z.record(z.unknown()).optional(),
});

// ─── Menu Category ────────────────────────────────────────────────────────────

export const createMenuCategorySchema = z.object({
  menuId: z.string().uuid("Invalid menu ID"),
  name: z.string().min(1, "Category name is required").max(100),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const updateMenuCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

// ─── Menu Item ────────────────────────────────────────────────────────────────

export const createMenuItemSchema = z.object({
  categoryId: z.string().uuid("Invalid category ID"),
  name: z.string().min(1, "Item name is required").max(150),
  description: z.string().max(1000).optional(),
  sku: z.string().max(50).optional(),
  basePriceCents: z
    .number()
    .int("Base price must be in integer cents")
    .min(0, "Price cannot be negative"),
  isAvailable: z.boolean().default(true),
  prepTimeMinutes: z.number().int().min(1).default(15),
  calories: z.number().int().positive().optional(),
  allergens: z.array(z.string()).default([]),
  kitchenStationId: z.string().uuid().optional(),
  taxRateId: z.string().uuid().optional(),
  modifierGroupIds: z.array(z.string().uuid()).default([]),
});

export const updateMenuItemSchema = z.object({
  categoryId: z.string().uuid().optional(),
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(1000).optional(),
  sku: z.string().max(50).optional(),
  basePriceCents: z.number().int().min(0).optional(),
  isAvailable: z.boolean().optional(),
  prepTimeMinutes: z.number().int().min(1).optional(),
  calories: z.number().int().positive().nullable().optional(),
  allergens: z.array(z.string()).optional(),
  kitchenStationId: z.string().uuid().nullable().optional(),
  taxRateId: z.string().uuid().nullable().optional(),
  modifierGroupIds: z.array(z.string().uuid()).optional(),
});

export const updateItemAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
  reason: z.string().max(200).optional(),
});

// ─── Modifier Group & Options ─────────────────────────────────────────────────

export const createModifierOptionSchema = z.object({
  name: z.string().min(1, "Option name is required").max(100),
  priceDeltaCents: z.number().int().default(0), // Can be 0 or positive or discount
  isAvailable: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});

export const updateModifierOptionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  priceDeltaCents: z.number().int().optional(),
  isAvailable: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export const createModifierGroupSchema = z.object({
  name: z.string().min(1, "Modifier group name is required").max(100),
  minSelections: z.number().int().min(0).default(0),
  maxSelections: z.number().int().min(1).default(1),
  isRequired: z.boolean().default(false),
  options: z.array(createModifierOptionSchema).optional(),
});

export const updateModifierGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  minSelections: z.number().int().min(0).optional(),
  maxSelections: z.number().int().min(1).optional(),
  isRequired: z.boolean().optional(),
});

// ─── Location Menu Override ───────────────────────────────────────────────────

export const upsertLocationMenuOverrideSchema = z.object({
  locationId: z.string().uuid("Invalid location ID"),
  menuItemId: z.string().uuid("Invalid menu item ID"),
  overridePriceCents: z.number().int().min(0).nullable().optional(),
  isAvailable: z.boolean().nullable().optional(),
});

export type CreateKitchenStationInput = z.infer<typeof createKitchenStationSchema>;
export type UpdateKitchenStationInput = z.infer<typeof updateKitchenStationSchema>;
export type CreateTaxRateInput = z.infer<typeof createTaxRateSchema>;
export type UpdateTaxRateInput = z.infer<typeof updateTaxRateSchema>;
export type CreateMenuInput = z.infer<typeof createMenuSchema>;
export type UpdateMenuInput = z.infer<typeof updateMenuSchema>;
export type CreateMenuCategoryInput = z.infer<typeof createMenuCategorySchema>;
export type UpdateMenuCategoryInput = z.infer<typeof updateMenuCategorySchema>;
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
export type UpdateItemAvailabilityInput = z.infer<typeof updateItemAvailabilitySchema>;
export type CreateModifierGroupInput = z.infer<typeof createModifierGroupSchema>;
export type UpdateModifierGroupInput = z.infer<typeof updateModifierGroupSchema>;
export type CreateModifierOptionInput = z.infer<typeof createModifierOptionSchema>;
export type UpdateModifierOptionInput = z.infer<typeof updateModifierOptionSchema>;
export type UpsertLocationMenuOverrideInput = z.infer<typeof upsertLocationMenuOverrideSchema>;

