import { z } from "zod";

export const createOrderSchema = z.object({
  locationId: z.string().min(1, "Location ID is required"),
  tableId: z.string().optional(),
  tableSessionId: z.string().optional(),
  serverUserId: z.string().optional(),
  guestCount: z.number().int().positive().default(1),
  notes: z.string().max(500).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const updateOrderSchema = z.object({
  guestCount: z.number().int().positive().optional(),
  notes: z.string().max(500).optional(),
  serverUserId: z.string().optional(),
});

export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

export const addOrderItemSchema = z.object({
  menuItemId: z.string().min(1, "Menu item ID is required"),
  quantity: z.number().int().positive().default(1),
  specialInstructions: z.string().max(300).optional(),
  selectedModifiers: z
    .array(
      z.object({
        modifierGroupId: z.string().min(1, "Modifier group ID is required"),
        modifierOptionId: z.string().min(1, "Modifier option ID is required"),
      }),
    )
    .optional()
    .default([]),
});

export type AddOrderItemInput = z.infer<typeof addOrderItemSchema>;

export const updateOrderItemSchema = z.object({
  quantity: z.number().int().positive().optional(),
  specialInstructions: z.string().max(300).optional(),
});

export type UpdateOrderItemInput = z.infer<typeof updateOrderItemSchema>;

export const submitOrderSchema = z.object({
  idempotencyKey: z
    .string()
    .min(1, "Idempotency key is required")
    .max(128, "Idempotency key too long"),
});

export type SubmitOrderInput = z.infer<typeof submitOrderSchema>;

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    "DRAFT",
    "SUBMITTED",
    "IN_PREPARATION",
    "READY",
    "SERVED",
    "CANCELLED",
  ]),
});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export const updateOrderItemStatusSchema = z.object({
  status: z.enum(["PENDING", "IN_PREPARATION", "READY", "SERVED", "CANCELLED"]),
});

export type UpdateOrderItemStatusInput = z.infer<
  typeof updateOrderItemStatusSchema
>;

export const cancelOrderSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
