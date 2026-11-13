import { z } from "zod";

export const tableShapeEnum = z.enum([
  "RECTANGLE",
  "ROUND",
  "SQUARE",
  "BOOTH",
  "BAR_STOOL",
]);

export const tableStatusEnum = z.enum([
  "AVAILABLE",
  "SEATED",
  "ORDERED",
  "SERVED",
  "PAYMENT_PENDING",
  "DIRTY",
  "RESERVED",
  "BLOCKED",
]);

export const sessionStatusEnum = z.enum([
  "ACTIVE",
  "COMPLETED",
  "TRANSFERRED",
]);

// ─── Dining Area Schemas ────────────────────────────────────────────────────

export const createDiningAreaSchema = z.object({
  locationId: z.string().uuid("Invalid location ID"),
  name: z.string().min(1, "Dining area name is required").max(100),
  sortOrder: z.number().int().default(0),
});

export const updateDiningAreaSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

// ─── Table Schemas ──────────────────────────────────────────────────────────

export const createTableSchema = z.object({
  locationId: z.string().uuid("Invalid location ID"),
  diningAreaId: z.string().uuid("Invalid dining area ID"),
  tableNumber: z.string().min(1, "Table number is required").max(20),
  shape: tableShapeEnum.default("RECTANGLE"),
  minCovers: z.number().int().min(1).default(1),
  maxCovers: z.number().int().min(1).default(4),
  posX: z.number().default(0),
  posY: z.number().default(0),
  width: z.number().positive().default(100),
  height: z.number().positive().default(100),
  rotation: z.number().default(0),
});

export const updateTableSchema = z.object({
  tableNumber: z.string().min(1).max(20).optional(),
  diningAreaId: z.string().uuid().optional(),
  shape: tableShapeEnum.optional(),
  minCovers: z.number().int().min(1).optional(),
  maxCovers: z.number().int().min(1).optional(),
  posX: z.number().optional(),
  posY: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  rotation: z.number().optional(),
  isActive: z.boolean().optional(),
});

export const tableLayoutItemSchema = z.object({
  id: z.string().uuid("Invalid table ID"),
  posX: z.number(),
  posY: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number(),
});

export const updateTableLayoutSchema = z.object({
  tables: z.array(tableLayoutItemSchema).min(1, "At least one table coordinate required"),
});

// ─── Table Operation Schemas ────────────────────────────────────────────────

export const seatTableSchema = z.object({
  guestCount: z.number().int().min(1, "Guest count must be at least 1").max(50),
  serverUserId: z.string().uuid().optional(),
});

export const updateTableStatusSchema = z.object({
  status: tableStatusEnum,
});

export const transferTableSchema = z.object({
  targetTableId: z.string().uuid().optional(),
  targetServerUserId: z.string().uuid().optional(),
}).refine(
  (data) => data.targetTableId || data.targetServerUserId,
  { message: "Must provide either targetTableId or targetServerUserId for transfer" }
);

export type CreateDiningAreaInput = z.infer<typeof createDiningAreaSchema>;
export type UpdateDiningAreaInput = z.infer<typeof updateDiningAreaSchema>;
export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;
export type TableLayoutItem = z.infer<typeof tableLayoutItemSchema>;
export type UpdateTableLayoutInput = z.infer<typeof updateTableLayoutSchema>;
export type SeatTableInput = z.infer<typeof seatTableSchema>;
export type UpdateTableStatusInput = z.infer<typeof updateTableStatusSchema>;
export type TransferTableInput = z.infer<typeof transferTableSchema>;

