import jwt from "jsonwebtoken";
import type { Socket, Server as SocketIOServer } from "socket.io";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { logger } from "../config/logger.js";
import type { TokenPayload } from "../modules/auth/auth.service.js";

export interface AuthenticatedSocketUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

let ioInstance: SocketIOServer | null = null;

export function setSocketIO(io: SocketIOServer): void {
  ioInstance = io;
}

export function getSocketIO(): SocketIOServer | null {
  return ioInstance;
}

/**
 * Socket.IO handshake authentication middleware.
 * Validates JWT access token passed via socket.handshake.auth.token
 * or Authorization header, verifies user account status, and attaches
 * authenticated user identity to socket.data.user.
 */
export async function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void,
): Promise<void> {
  const token =
    (socket.handshake.auth?.token as string | undefined) ||
    (socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "") as string | undefined);

  if (!token) {
    logger.warn({ socketId: socket.id }, "Socket connection rejected: No authentication token provided");
    return next(new Error("Authentication error: Token required"));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload;

    if (decoded.type !== "access" || !decoded.sub) {
      logger.warn({ socketId: socket.id }, "Socket connection rejected: Invalid token payload");
      return next(new Error("Authentication error: Invalid token"));
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
      },
    });

    if (!user) {
      logger.warn({ socketId: socket.id, userId: decoded.sub }, "Socket connection rejected: User not found");
      return next(new Error("Authentication error: User not found"));
    }

    if (user.status === "SUSPENDED" || user.status === "DEACTIVATED") {
      logger.warn({ socketId: socket.id, userId: user.id }, "Socket connection rejected: Account inactive or suspended");
      return next(new Error("Authentication error: Account is inactive or suspended"));
    }

    socket.data.user = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };

    logger.info({ socketId: socket.id, userId: user.id }, "Socket authenticated successfully");
    next();
  } catch (err: any) {
    if (err instanceof jwt.TokenExpiredError) {
      logger.warn({ socketId: socket.id }, "Socket connection rejected: Token expired");
      return next(new Error("Authentication error: Token expired"));
    }
    if (err instanceof jwt.JsonWebTokenError) {
      logger.warn({ socketId: socket.id }, "Socket connection rejected: Invalid token");
      return next(new Error("Authentication error: Invalid token"));
    }
    logger.error({ socketId: socket.id, err: err.message }, "Socket authentication error");
    next(new Error("Authentication error"));
  }
}

/**
 * Validates organization and location membership, checks permissions,
 * and subscribes the authenticated socket to the location room.
 */
export async function authorizeAndJoinLocation(
  socket: Socket,
  data: { orgId?: string; organizationId?: string; locationId?: string },
  callback?: (response: { success: boolean; error?: string; room?: string }) => void,
): Promise<boolean> {
  const user = socket.data.user as AuthenticatedSocketUser | undefined;
  if (!user) {
    logger.warn({ socketId: socket.id }, "join-location rejected: socket unauthenticated");
    socket.emit("error", { message: "Authentication required" });
    callback?.({ success: false, error: "Authentication required" });
    return false;
  }

  const orgId = data.orgId || data.organizationId;
  const locationId = data.locationId;

  if (!orgId || !locationId) {
    logger.warn({ socketId: socket.id, userId: user.id }, "join-location rejected: missing orgId or locationId");
    socket.emit("error", { message: "Organization and location identifiers are required" });
    callback?.({ success: false, error: "Organization and location identifiers are required" });
    return false;
  }

  try {
    // 1. Verify user's active membership in target organization
    const membership = await prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: orgId,
        },
      },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
        locationMemberships: true,
      },
    });

    if (!membership || membership.status !== "ACTIVE") {
      logger.warn(
        { socketId: socket.id, userId: user.id, orgId },
        "join-location rejected: user is not an active member of organization",
      );
      socket.emit("error", { message: "Access denied: Not authorized for this organization" });
      callback?.({ success: false, error: "Access denied: Not authorized for this organization" });
      return false;
    }

    // 2. Verify target location belongs to the target organization
    const location = await prisma.location.findFirst({
      where: { id: locationId, organizationId: orgId },
    });

    if (!location) {
      logger.warn(
        { socketId: socket.id, userId: user.id, orgId, locationId },
        "join-location rejected: location not found in organization",
      );
      socket.emit("error", { message: "Access denied: Location not found in this organization" });
      callback?.({ success: false, error: "Access denied: Location not found in this organization" });
      return false;
    }

    // 3. Verify location access:
    // Org-level roles ("Owner", "Organization Owner", "Admin") or org:manage / * permissions have access to all locations.
    const roleName = membership.role?.name || "";
    const permissions = new Set(
      membership.role?.permissions?.map((rp) => rp.permission.code) || [],
    );

    const isOrgWideAdmin =
      roleName === "Owner" ||
      roleName === "Organization Owner" ||
      roleName === "Admin" ||
      permissions.has("org:manage") ||
      permissions.has("*");

    const hasLocationAccess =
      isOrgWideAdmin ||
      membership.locationMemberships.some((lm) => lm.locationId === locationId);

    if (!hasLocationAccess) {
      logger.warn(
        { socketId: socket.id, userId: user.id, orgId, locationId },
        "join-location rejected: user not assigned to location",
      );
      socket.emit("error", { message: "Access denied: Not authorized for this location" });
      callback?.({ success: false, error: "Access denied: Not authorized for this location" });
      return false;
    }

    // 4. Verify order/KDS permissions
    const hasOrderPermission =
      isOrgWideAdmin ||
      permissions.has("order:view") ||
      permissions.has("order:create") ||
      permissions.has("order:manage") ||
      permissions.has("kds:view") ||
      permissions.has("foh:view");

    if (!hasOrderPermission) {
      logger.warn(
        { socketId: socket.id, userId: user.id, orgId, locationId },
        "join-location rejected: insufficient permissions for order events",
      );
      socket.emit("error", { message: "Access denied: Insufficient permissions" });
      callback?.({ success: false, error: "Access denied: Insufficient permissions" });
      return false;
    }

    // 5. Join room after passing all authorization gates
    const room = `org_${orgId}_loc_${locationId}`;
    socket.join(room);
    logger.info(
      { socketId: socket.id, userId: user.id, room },
      "Client authorized and joined location room",
    );
    socket.emit("location-joined", { orgId, locationId, room });
    callback?.({ success: true, room });
    return true;
  } catch (err: any) {
    logger.error(
      { socketId: socket.id, userId: user.id, orgId, locationId, err: err.message },
      "Error during join-location authorization",
    );
    socket.emit("error", { message: "Internal authorization error" });
    callback?.({ success: false, error: "Internal authorization error" });
    return false;
  }
}

/**
 * Handles leaving a location room safely.
 */
export function leaveLocation(
  socket: Socket,
  data: { orgId?: string; organizationId?: string; locationId?: string },
  callback?: (response: { success: boolean; room?: string }) => void,
): void {
  const orgId = data.orgId || data.organizationId;
  const locationId = data.locationId;
  if (orgId && locationId) {
    const room = `org_${orgId}_loc_${locationId}`;
    socket.leave(room);
    logger.info({ socketId: socket.id, room }, "Client left location room");
    socket.emit("location-left", { orgId, locationId, room });
    callback?.({ success: true, room });
  }
}

/**
 * Registers authentication middleware and connection handlers for Socket.IO.
 */
export function registerSocketHandlers(io: SocketIOServer): void {
  // Enforce handshake authentication
  io.use(socketAuthMiddleware);

  io.on("connection", (socket) => {
    logger.info(
      { socketId: socket.id, userId: socket.data.user?.id },
      "Authenticated Socket.IO client connected",
    );

    socket.on("join-location", (data, callback) => {
      authorizeAndJoinLocation(socket, data, callback);
    });

    socket.on("leave-location", (data, callback) => {
      leaveLocation(socket, data, callback);
    });

    socket.on("disconnect", (reason) => {
      logger.info(
        { socketId: socket.id, userId: socket.data.user?.id, reason },
        "Socket.IO client disconnected",
      );
    });
  });
}

/**
 * Broadcast an event to all authorized subscribers of a specific location room.
 */
export function emitToLocation(
  organizationId: string,
  locationId: string,
  event: string,
  payload: unknown,
): void {
  if (!ioInstance) {
    logger.debug({ event, organizationId, locationId }, "Socket.IO not initialized; skipping emit");
    return;
  }
  const room = `org_${organizationId}_loc_${locationId}`;
  ioInstance.to(room).emit(event, payload);
  logger.info({ room, event }, "Socket.IO event broadcast to location");
}

/**
 * Broadcast an event to all authorized subscribers of an entire organization room.
 */
export function emitToOrg(
  organizationId: string,
  event: string,
  payload: unknown,
): void {
  if (!ioInstance) {
    logger.debug({ event, organizationId }, "Socket.IO not initialized; skipping emit");
    return;
  }
  const room = `org_${organizationId}`;
  ioInstance.to(room).emit(event, payload);
  logger.info({ room, event }, "Socket.IO event broadcast to org");
}
