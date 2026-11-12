import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/app-error.js";

/**
 * Extracts target organization ID from request parameters, headers, or query.
 */
function extractOrganizationId(req: Request): string | undefined {
  return (
    req.params.organizationId ||
    (req.headers["x-organization-id"] as string) ||
    (req.query.organizationId as string) ||
    req.body?.organizationId
  );
}

/**
 * Extracts target location ID from request parameters, headers, or query.
 */
function extractLocationId(req: Request): string | undefined {
  return (
    req.params.locationId ||
    (req.headers["x-location-id"] as string) ||
    (req.query.locationId as string) ||
    req.body?.locationId
  );
}

/**
 * Ensures the authenticated user has an active membership in the target organization.
 * Sets req.organizationId and req.currentMembership.
 */
export function requireOrganizationMembership() {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.user) {
      return next(AppError.unauthorized("Authentication required"));
    }

    const orgId = extractOrganizationId(req);
    if (!orgId) {
      return next(AppError.badRequest("Organization identifier is required"));
    }

    try {
      const membership = await prisma.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: req.user.id,
            organizationId: orgId,
          },
        },
        include: {
          organization: true,
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      });

      if (!membership || membership.status !== "ACTIVE") {
        return next(
          AppError.forbidden(
            "Access denied: You do not have an active membership in this organization",
          ),
        );
      }

      req.organizationId = orgId;
      req.currentMembership = {
        organizationId: membership.organization.id,
        organizationName: membership.organization.name,
        organizationSlug: membership.organization.slug,
        role: membership.role.name,
        permissions: membership.role.permissions.map(
          (rp) => rp.permission.code,
        ),
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Ensures the authenticated user holds at least one (or all) of the specified permissions
 * within the current organization membership context.
 */
export function requirePermission(...requiredPermissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.currentMembership) {
      return next(
        AppError.forbidden(
          "Organization context must be verified before checking permissions",
        ),
      );
    }

    const userPermissions = new Set(req.currentMembership.permissions);

    // Owners have wildcard or all permissions
    if (req.currentMembership.role === "Owner") {
      return next();
    }

    const hasPermission = requiredPermissions.every((perm) =>
      userPermissions.has(perm),
    );

    if (!hasPermission) {
      return next(
        AppError.forbidden(
          `Insufficient permissions: requires [${requiredPermissions.join(", ")}]`,
        ),
      );
    }

    next();
  };
}

/**
 * Ensures the authenticated user has access to a specific restaurant location.
 */
export function requireLocationAccess() {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.user || !req.organizationId) {
      return next(AppError.forbidden("Organization context required"));
    }

    const locationId = extractLocationId(req);
    if (!locationId) {
      return next(AppError.badRequest("Location identifier is required"));
    }

    try {
      // 1. Verify the location belongs to the organization
      const location = await prisma.location.findFirst({
        where: { id: locationId, organizationId: req.organizationId },
      });

      if (!location) {
        return next(
          AppError.notFound("Location not found in this organization"),
        );
      }

      // 2. Org-scoped roles (Owner, Admin) have access to all locations
      if (
        req.currentMembership?.role === "Owner" ||
        req.currentMembership?.role === "Admin"
      ) {
        req.locationId = locationId;
        return next();
      }

      // 3. Check for specific LocationMembership
      const membership = await prisma.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: req.user.id,
            organizationId: req.organizationId,
          },
        },
        include: {
          locationMemberships: {
            where: { locationId },
          },
        },
      });

      if (!membership || membership.locationMemberships.length === 0) {
        return next(
          AppError.forbidden(
            "Access denied: You are not assigned to this location",
          ),
        );
      }

      req.locationId = locationId;
      next();
    } catch (err) {
      next(err);
    }
  };
}
