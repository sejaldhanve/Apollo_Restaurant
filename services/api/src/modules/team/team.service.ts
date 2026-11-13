import crypto from "crypto";
import { hash } from "@node-rs/argon2";
import { withTenantContext } from "../../db/tenant-context.js";
import { AppError } from "../../utils/app-error.js";
import { createAuditLog } from "../../services/audit.service.js";
import type {
  InviteStaffInput,
  UpdateStaffRoleInput,
  UpdateStaffStatusInput,
  UpdateStaffLocationsInput,
} from "./team.schemas.js";

export class TeamService {
  /**
   * Retrieves all team members for the organization with their roles and location access.
   */
  static async getTeamMembers(orgId: string) {
    return withTenantContext(orgId, async (tx) => {
      const memberships = await tx.organizationMembership.findMany({
        where: { organizationId: orgId },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          role: {
            select: { id: true, name: true, description: true, scope: true },
          },
          locationMemberships: {
            include: {
              location: {
                select: { id: true, name: true, code: true, status: true },
              },
            },
          },
        },
        orderBy: [{ role: { name: "asc" } }, { user: { firstName: "asc" } }],
      });

      return memberships.map((m) => ({
        id: m.id,
        userId: m.userId,
        organizationId: m.organizationId,
        email: m.user.email,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        status: m.status,
        role: {
          id: m.role.id,
          name: m.role.name,
          description: m.role.description,
          scope: m.role.scope,
        },
        locations: m.locationMemberships.map((lm) => ({
          id: lm.location.id,
          name: lm.location.name,
          code: lm.location.code,
          status: lm.location.status,
        })),
        invitedAt: m.invitedAt.toISOString(),
        joinedAt: m.joinedAt?.toISOString() || null,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      }));
    });
  }

  /**
   * Retrieves all available roles for the organization.
   */
  static async getRoles(orgId: string) {
    return withTenantContext(orgId, async (tx) => {
      const roles = await tx.role.findMany({
        where: { organizationId: orgId },
        orderBy: { name: "asc" },
      });

      return roles.map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        scope: r.scope,
      }));
    });
  }

  /**
   * Retrieves active locations for the organization.
   */
  static async getLocations(orgId: string) {
    return withTenantContext(orgId, async (tx) => {
      const locations = await tx.location.findMany({
        where: { organizationId: orgId, status: "ACTIVE" },
        orderBy: { name: "asc" },
      });

      return locations.map((l) => ({
        id: l.id,
        name: l.name,
        code: l.code,
        status: l.status,
      }));
    });
  }

  /**
   * Invites or adds a staff member to the organization.
   * Reuses existing global User account or creates a new one securely.
   */
  static async inviteStaff(
    orgId: string,
    actorId: string,
    input: InviteStaffInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      // 1. Verify role belongs to organization
      const role = await tx.role.findFirst({
        where: { id: input.roleId, organizationId: orgId },
      });
      if (!role) {
        throw AppError.notFound("Specified role not found in this organization");
      }

      // 2. Check if user already exists globally
      let user = await tx.user.findUnique({
        where: { email: input.email },
      });

      if (user) {
        // Ensure user is not already a member of this organization
        const existingMember = await tx.organizationMembership.findUnique({
          where: {
            userId_organizationId: {
              userId: user.id,
              organizationId: orgId,
            },
          },
        });
        if (existingMember) {
          throw AppError.conflict("User is already a member of this organization");
        }
      } else {
        // Create new global user
        const rawPassword =
          input.temporaryPassword || crypto.randomUUID().slice(0, 16) + "!Aa1";
        const passwordHash = await hash(rawPassword, {
          memoryCost: 19456,
          timeCost: 2,
          outputLen: 32,
          parallelism: 1,
        });

        user = await tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            status: "ACTIVE",
            emailVerified: true,
          },
        });
      }

      // 3. Create organization membership
      const membership = await tx.organizationMembership.create({
        data: {
          userId: user.id,
          organizationId: orgId,
          roleId: role.id,
          status: "ACTIVE",
          joinedAt: new Date(),
        },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          role: { select: { id: true, name: true, description: true, scope: true } },
        },
      });

      // 4. Assign location memberships
      let targetLocationIds = input.locationIds || [];
      if (targetLocationIds.length === 0) {
        // If not specified, default to all active locations of this organization
        const orgLocations = await tx.location.findMany({
          where: { organizationId: orgId, status: "ACTIVE" },
          select: { id: true },
        });
        targetLocationIds = orgLocations.map((l) => l.id);
      }

      for (const locId of targetLocationIds) {
        const loc = await tx.location.findFirst({
          where: { id: locId, organizationId: orgId },
        });
        if (loc) {
          await tx.locationMembership.create({
            data: {
              organizationMembershipId: membership.id,
              locationId: loc.id,
              organizationId: orgId,
            },
          });
        }
      }

      // 5. Audit Log
      await createAuditLog(
        {
          action: "team:member_added",
          organizationId: orgId,
          actorId,
          entityType: "OrganizationMembership",
          entityId: membership.id,
          metadata: {
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            roleName: role.name,
            roleId: role.id,
            locationCount: targetLocationIds.length,
          },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return {
        id: membership.id,
        userId: membership.userId,
        organizationId: membership.organizationId,
        email: membership.user.email,
        firstName: membership.user.firstName,
        lastName: membership.user.lastName,
        status: membership.status,
        role: {
          id: membership.role.id,
          name: membership.role.name,
          description: membership.role.description,
          scope: membership.role.scope,
        },
        invitedAt: membership.invitedAt.toISOString(),
        joinedAt: membership.joinedAt?.toISOString() || null,
        createdAt: membership.createdAt.toISOString(),
        updatedAt: membership.updatedAt.toISOString(),
      };
    });
  }

  /**
   * Updates a team member's role with protection for the last remaining active Owner.
   */
  static async updateStaffRole(
    orgId: string,
    actorId: string,
    membershipId: string,
    input: UpdateStaffRoleInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const membership = await tx.organizationMembership.findFirst({
        where: { id: membershipId, organizationId: orgId },
        include: { role: true },
      });
      if (!membership) {
        throw AppError.notFound("Team member not found");
      }

      const targetRole = await tx.role.findFirst({
        where: { id: input.roleId, organizationId: orgId },
      });
      if (!targetRole) {
        throw AppError.notFound("Target role not found in this organization");
      }

      // Protection: cannot demote the only active Owner
      if (membership.role.name === "Owner" && targetRole.name !== "Owner") {
        const ownerRole = await tx.role.findFirst({
          where: { organizationId: orgId, name: "Owner" },
        });
        if (ownerRole) {
          const ownerCount = await tx.organizationMembership.count({
            where: {
              organizationId: orgId,
              roleId: ownerRole.id,
              status: "ACTIVE",
            },
          });
          if (ownerCount <= 1) {
            throw AppError.badRequest(
              "Cannot demote the organization's sole active Owner",
            );
          }
        }
      }

      const updated = await tx.organizationMembership.update({
        where: { id: membershipId },
        data: { roleId: targetRole.id },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          role: { select: { id: true, name: true, description: true, scope: true } },
        },
      });

      await createAuditLog(
        {
          action: "team:role_updated",
          organizationId: orgId,
          actorId,
          entityType: "OrganizationMembership",
          entityId: membershipId,
          metadata: {
            fromRole: membership.role.name,
            toRole: targetRole.name,
            userId: membership.userId,
          },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return {
        id: updated.id,
        userId: updated.userId,
        role: updated.role,
      };
    });
  }

  /**
   * Updates a team member's active status (activate/suspend).
   */
  static async updateStaffStatus(
    orgId: string,
    actorId: string,
    membershipId: string,
    input: UpdateStaffStatusInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const membership = await tx.organizationMembership.findFirst({
        where: { id: membershipId, organizationId: orgId },
        include: { role: true },
      });
      if (!membership) {
        throw AppError.notFound("Team member not found");
      }

      // Protection: cannot suspend the only active Owner
      if (membership.role.name === "Owner" && input.status !== "ACTIVE") {
        const ownerRole = await tx.role.findFirst({
          where: { organizationId: orgId, name: "Owner" },
        });
        if (ownerRole) {
          const activeOwnerCount = await tx.organizationMembership.count({
            where: {
              organizationId: orgId,
              roleId: ownerRole.id,
              status: "ACTIVE",
            },
          });
          if (activeOwnerCount <= 1) {
            throw AppError.badRequest(
              "Cannot suspend the organization's sole active Owner",
            );
          }
        }
      }

      const updated = await tx.organizationMembership.update({
        where: { id: membershipId },
        data: { status: input.status },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          role: { select: { id: true, name: true, description: true, scope: true } },
        },
      });

      await createAuditLog(
        {
          action: "team:status_updated",
          organizationId: orgId,
          actorId,
          entityType: "OrganizationMembership",
          entityId: membershipId,
          metadata: {
            fromStatus: membership.status,
            toStatus: input.status,
            userId: membership.userId,
          },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return {
        id: updated.id,
        userId: updated.userId,
        status: updated.status,
      };
    });
  }

  /**
   * Updates location assignments for a team member.
   */
  static async updateStaffLocations(
    orgId: string,
    actorId: string,
    membershipId: string,
    input: UpdateStaffLocationsInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const membership = await tx.organizationMembership.findFirst({
        where: { id: membershipId, organizationId: orgId },
      });
      if (!membership) {
        throw AppError.notFound("Team member not found");
      }

      // Delete existing location memberships
      await tx.locationMembership.deleteMany({
        where: { organizationMembershipId: membershipId },
      });

      // Add new location memberships
      for (const locId of input.locationIds) {
        const loc = await tx.location.findFirst({
          where: { id: locId, organizationId: orgId },
        });
        if (loc) {
          await tx.locationMembership.create({
            data: {
              organizationMembershipId: membership.id,
              locationId: loc.id,
              organizationId: orgId,
            },
          });
        }
      }

      await createAuditLog(
        {
          action: "team:locations_updated",
          organizationId: orgId,
          actorId,
          entityType: "OrganizationMembership",
          entityId: membershipId,
          metadata: {
            locationCount: input.locationIds.length,
            locationIds: input.locationIds,
          },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return {
        id: membership.id,
        locationCount: input.locationIds.length,
      };
    });
  }
}

