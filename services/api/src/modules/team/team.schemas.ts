import { z } from "zod";

export const membershipStatusEnum = z.enum(["ACTIVE", "SUSPENDED", "INVITED"]);

export const inviteStaffSchema = z.object({
  email: z.string().trim().email("Invalid email address").toLowerCase(),
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  roleId: z.string().uuid("Invalid role ID"),
  locationIds: z.array(z.string().uuid("Invalid location ID")).optional().default([]),
  temporaryPassword: z
    .string()
    .min(8, "Temporary password must be at least 8 characters")
    .optional(),
});

export const updateStaffRoleSchema = z.object({
  roleId: z.string().uuid("Invalid role ID"),
});

export const updateStaffStatusSchema = z.object({
  status: membershipStatusEnum,
});

export const updateStaffLocationsSchema = z.object({
  locationIds: z.array(z.string().uuid("Invalid location ID")),
});

export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;
export type UpdateStaffRoleInput = z.infer<typeof updateStaffRoleSchema>;
export type UpdateStaffStatusInput = z.infer<typeof updateStaffStatusSchema>;
export type UpdateStaffLocationsInput = z.infer<typeof updateStaffLocationsSchema>;

