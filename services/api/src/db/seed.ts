import type { PrismaClient } from "@prisma/client";

// ─── System Permissions ───────────────────────────────────────────────────────

export const SYSTEM_PERMISSIONS = [
  // Organization
  {
    code: "org:manage",
    name: "Manage Organization",
    description: "Create, update, and delete organization settings",
    module: "organization",
  },
  {
    code: "org:view",
    name: "View Organization",
    description: "View organization details and settings",
    module: "organization",
  },

  // Location
  {
    code: "location:manage",
    name: "Manage Locations",
    description: "Create, update, and delete locations",
    module: "location",
  },
  {
    code: "location:view",
    name: "View Locations",
    description: "View location details",
    module: "location",
  },

  // User
  {
    code: "user:manage",
    name: "Manage Users",
    description: "Update and deactivate user accounts",
    module: "user",
  },
  {
    code: "user:view",
    name: "View Users",
    description: "View user profiles and listings",
    module: "user",
  },
  {
    code: "user:invite",
    name: "Invite Users",
    description: "Invite new users to the organization",
    module: "user",
  },

  // Role
  {
    code: "role:manage",
    name: "Manage Roles",
    description: "Create, update, and delete roles and permissions",
    module: "role",
  },
  {
    code: "role:view",
    name: "View Roles",
    description: "View roles and their permissions",
    module: "role",
  },

  // Menu
  {
    code: "menu:manage",
    name: "Manage Menu",
    description: "Create, update, and delete menu items and categories",
    module: "menu",
  },
  {
    code: "menu:view",
    name: "View Menu",
    description: "View menu items and categories",
    module: "menu",
  },

  // Order
  {
    code: "order:create",
    name: "Create Orders",
    description: "Create new orders",
    module: "order",
  },
  {
    code: "order:view",
    name: "View Orders",
    description: "View order details and history",
    module: "order",
  },
  {
    code: "order:manage",
    name: "Manage Orders",
    description: "Update and manage order status",
    module: "order",
  },
  {
    code: "order:void",
    name: "Void Orders",
    description: "Void or cancel existing orders",
    module: "order",
  },

  // Payment
  {
    code: "payment:process",
    name: "Process Payments",
    description: "Process customer payments",
    module: "payment",
  },
  {
    code: "payment:refund",
    name: "Refund Payments",
    description: "Issue payment refunds",
    module: "payment",
  },
  {
    code: "payment:view",
    name: "View Payments",
    description: "View payment records and history",
    module: "payment",
  },

  // Inventory
  {
    code: "inventory:manage",
    name: "Manage Inventory",
    description: "Update stock levels and manage inventory",
    module: "inventory",
  },
  {
    code: "inventory:view",
    name: "View Inventory",
    description: "View inventory levels and reports",
    module: "inventory",
  },

  // Report
  {
    code: "report:view",
    name: "View Reports",
    description: "View analytics and reports",
    module: "report",
  },
  {
    code: "report:export",
    name: "Export Reports",
    description: "Export reports and data",
    module: "report",
  },

  // Settings
  {
    code: "settings:manage",
    name: "Manage Settings",
    description: "Manage system and application settings",
    module: "settings",
  },
] as const;

// ─── System Roles ─────────────────────────────────────────────────────────────

export const SYSTEM_ROLES = [
  {
    name: "Owner",
    description: "Full access to all organization resources",
    scope: "ORGANIZATION" as const,
    permissions: SYSTEM_PERMISSIONS.map((p) => p.code),
  },
  {
    name: "Admin",
    description: "Administrative access excluding org deletion and billing",
    scope: "ORGANIZATION" as const,
    permissions: SYSTEM_PERMISSIONS.filter(
      (p) => p.code !== "org:manage" && p.code !== "settings:manage",
    ).map((p) => p.code),
  },
  {
    name: "Manager",
    description:
      "Location-level management including staff, menu, orders, and reports",
    scope: "LOCATION" as const,
    permissions: [
      "org:view",
      "location:view",
      "user:view",
      "user:invite",
      "role:view",
      "menu:manage",
      "menu:view",
      "order:create",
      "order:view",
      "order:manage",
      "order:void",
      "payment:process",
      "payment:refund",
      "payment:view",
      "inventory:manage",
      "inventory:view",
      "report:view",
      "report:export",
    ],
  },
  {
    name: "Server",
    description: "Front-of-house staff handling orders and payments",
    scope: "LOCATION" as const,
    permissions: [
      "menu:view",
      "order:create",
      "order:view",
      "payment:process",
      "payment:view",
    ],
  },
  {
    name: "Kitchen",
    description: "Back-of-house staff viewing orders and managing inventory",
    scope: "LOCATION" as const,
    permissions: ["menu:view", "order:view", "inventory:view"],
  },
  {
    name: "Viewer",
    description: "Read-only access to organization data and reports",
    scope: "ORGANIZATION" as const,
    permissions: [
      "org:view",
      "location:view",
      "user:view",
      "role:view",
      "menu:view",
      "order:view",
      "payment:view",
      "inventory:view",
      "report:view",
    ],
  },
] as const;

// ─── Seed Functions ───────────────────────────────────────────────────────────

/**
 * Upserts all system permissions into the permissions table.
 */
export async function seedPermissions(prisma: PrismaClient): Promise<void> {
  for (const perm of SYSTEM_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: {
        name: perm.name,
        description: perm.description,
        module: perm.module,
      },
      create: {
        code: perm.code,
        name: perm.name,
        description: perm.description,
        module: perm.module,
      },
    });
  }
}

/**
 * Creates system roles for a specific organization and associates them with
 * the correct permissions. Skips roles that already exist (by name).
 */
export async function seedOrganizationRoles(
  prisma: PrismaClient,
  organizationId: string,
): Promise<void> {
  // Fetch all permissions once
  const allPermissions = await prisma.permission.findMany();
  const permissionByCode = new Map(allPermissions.map((p) => [p.code, p]));

  for (const roleDef of SYSTEM_ROLES) {
    // Upsert the role
    const role = await prisma.role.upsert({
      where: {
        organizationId_name: { organizationId, name: roleDef.name },
      },
      update: {
        description: roleDef.description,
        scope: roleDef.scope,
        isSystem: true,
      },
      create: {
        organizationId,
        name: roleDef.name,
        description: roleDef.description,
        scope: roleDef.scope,
        isSystem: true,
      },
    });

    // Link permissions — skip any that don't exist yet
    for (const code of roleDef.permissions) {
      const permission = permissionByCode.get(code);
      if (!permission) continue;

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id,
          organizationId,
        },
      });
    }
  }
}
