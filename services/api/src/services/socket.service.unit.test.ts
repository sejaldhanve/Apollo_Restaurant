import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import {
  socketAuthMiddleware,
  authorizeAndJoinLocation,
  leaveLocation,
  emitToLocation,
  emitToOrg,
  setSocketIO,
} from "./socket.service.js";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";

vi.mock("../db/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    organizationMembership: {
      findUnique: vi.fn(),
    },
    location: {
      findFirst: vi.fn(),
    },
  },
}));

describe("Socket.IO Authentication and Authorization", () => {
  const mockUserId = "usr-test-123";
  const mockOrgA = "org-alpha-111";
  const mockOrgB = "org-beta-222";
  const mockLocA1 = "loc-alpha-main";
  const mockLocA2 = "loc-alpha-uptown";
  const mockLocB1 = "loc-beta-main";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── 1. HANDSHAKE AUTHENTICATION TESTS ─────────────────────────────────────

  describe("socketAuthMiddleware", () => {
    it("1. Connection without token is rejected", async () => {
      const mockSocket: any = {
        id: "sock-1",
        handshake: { auth: {}, headers: {} },
        data: {},
      };
      const next = vi.fn();

      await socketAuthMiddleware(mockSocket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toBe(
        "Authentication error: Token required",
      );
      expect(mockSocket.data.user).toBeUndefined();
    });

    it("2. Invalid JWT is rejected", async () => {
      const mockSocket: any = {
        id: "sock-2",
        handshake: { auth: { token: "invalid.jwt.token" }, headers: {} },
        data: {},
      };
      const next = vi.fn();

      await socketAuthMiddleware(mockSocket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toBe(
        "Authentication error: Invalid token",
      );
      expect(mockSocket.data.user).toBeUndefined();
    });

    it("3. Expired JWT is rejected", async () => {
      // Create a real JWT signed with expired time
      const expiredToken = jwt.sign(
        { sub: mockUserId, email: "user@test.com", type: "access" },
        env.JWT_SECRET,
        { expiresIn: -10 }, // expired 10 seconds ago
      );

      const mockSocket: any = {
        id: "sock-3",
        handshake: { auth: { token: expiredToken }, headers: {} },
        data: {},
      };
      const next = vi.fn();

      await socketAuthMiddleware(mockSocket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toBe(
        "Authentication error: Token expired",
      );
      expect(mockSocket.data.user).toBeUndefined();
    });

    it("rejects token when user is suspended or deactivated", async () => {
      const validToken = jwt.sign(
        { sub: mockUserId, email: "suspended@test.com", type: "access" },
        env.JWT_SECRET,
        { expiresIn: 60 },
      );

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: mockUserId,
        email: "suspended@test.com",
        firstName: "Bad",
        lastName: "Actor",
        status: "SUSPENDED",
      } as any);

      const mockSocket: any = {
        id: "sock-suspended",
        handshake: { auth: { token: validToken }, headers: {} },
        data: {},
      };
      const next = vi.fn();

      await socketAuthMiddleware(mockSocket, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(next.mock.calls[0][0].message).toBe(
        "Authentication error: Account is inactive or suspended",
      );
      expect(mockSocket.data.user).toBeUndefined();
    });

    it("4. Valid authenticated connection succeeds and sets socket user identity", async () => {
      const validToken = jwt.sign(
        { sub: mockUserId, email: "chef@alpha.com", type: "access" },
        env.JWT_SECRET,
        { expiresIn: 300 },
      );

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: mockUserId,
        email: "chef@alpha.com",
        firstName: "Chef",
        lastName: "Sejal",
        status: "ACTIVE",
      } as any);

      const mockSocket: any = {
        id: "sock-4",
        handshake: { auth: { token: validToken }, headers: {} },
        data: {},
      };
      const next = vi.fn();

      await socketAuthMiddleware(mockSocket, next);

      expect(next).toHaveBeenCalledWith(); // called with no error
      expect(mockSocket.data.user).toEqual({
        id: mockUserId,
        email: "chef@alpha.com",
        firstName: "Chef",
        lastName: "Sejal",
      });
    });
  });

  // ─── 2. LOCATION ROOM AUTHORIZATION TESTS ──────────────────────────────────

  describe("authorizeAndJoinLocation", () => {
    const authenticatedSocketUser = {
      id: mockUserId,
      email: "chef@alpha.com",
      firstName: "Chef",
      lastName: "Sejal",
    };

    it("rejects unauthenticated socket attempting to join location", async () => {
      const mockSocket: any = {
        id: "sock-unauth",
        data: {}, // no user in socket.data
        emit: vi.fn(),
        join: vi.fn(),
      };
      const cb = vi.fn();

      const success = await authorizeAndJoinLocation(
        mockSocket,
        { orgId: mockOrgA, locationId: mockLocA1 },
        cb,
      );

      expect(success).toBe(false);
      expect(mockSocket.join).not.toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        message: "Authentication required",
      });
      expect(cb).toHaveBeenCalledWith({
        success: false,
        error: "Authentication required",
      });
    });

    it("5. Cross-tenant attempt: Organization A member CANNOT join Organization B room", async () => {
      const mockSocket: any = {
        id: "sock-cross-tenant",
        data: { user: authenticatedSocketUser },
        emit: vi.fn(),
        join: vi.fn(),
      };
      const cb = vi.fn();

      // User has no active membership in Org B
      vi.mocked(prisma.organizationMembership.findUnique).mockResolvedValueOnce(
        null,
      );

      const success = await authorizeAndJoinLocation(
        mockSocket,
        { orgId: mockOrgB, locationId: mockLocB1 },
        cb,
      );

      expect(success).toBe(false);
      expect(mockSocket.join).not.toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        message: "Access denied: Not authorized for this organization",
      });
      expect(cb).toHaveBeenCalledWith({
        success: false,
        error: "Access denied: Not authorized for this organization",
      });
    });

    it("rejects when target location does not belong to the target organization", async () => {
      const mockSocket: any = {
        id: "sock-invalid-loc",
        data: { user: authenticatedSocketUser },
        emit: vi.fn(),
        join: vi.fn(),
      };
      const cb = vi.fn();

      // User is active in Org A
      vi.mocked(prisma.organizationMembership.findUnique).mockResolvedValueOnce(
        {
          id: "mem-1",
          userId: mockUserId,
          organizationId: mockOrgA,
          status: "ACTIVE",
          role: {
            name: "Server",
            permissions: [{ permission: { code: "order:view" } }],
          },
          locationMemberships: [],
        } as any,
      );

      // But location does not belong to Org A
      vi.mocked(prisma.location.findFirst).mockResolvedValueOnce(null);

      const success = await authorizeAndJoinLocation(
        mockSocket,
        { orgId: mockOrgA, locationId: "invalid-or-foreign-loc" },
        cb,
      );

      expect(success).toBe(false);
      expect(mockSocket.join).not.toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        message: "Access denied: Location not found in this organization",
      });
    });

    it("6. User cannot join an unauthorized location within their own organization", async () => {
      const mockSocket: any = {
        id: "sock-unassigned-loc",
        data: { user: authenticatedSocketUser },
        emit: vi.fn(),
        join: vi.fn(),
      };
      const cb = vi.fn();

      // User has active membership in Org A as Server, but only assigned to locA1 (not locA2)
      vi.mocked(prisma.organizationMembership.findUnique).mockResolvedValueOnce(
        {
          id: "mem-1",
          userId: mockUserId,
          organizationId: mockOrgA,
          status: "ACTIVE",
          role: {
            name: "Server",
            permissions: [{ permission: { code: "order:view" } }],
          },
          locationMemberships: [{ locationId: mockLocA1 }],
        } as any,
      );

      // Location A2 belongs to Org A
      vi.mocked(prisma.location.findFirst).mockResolvedValueOnce({
        id: mockLocA2,
        organizationId: mockOrgA,
        name: "Uptown Branch",
      } as any);

      const success = await authorizeAndJoinLocation(
        mockSocket,
        { orgId: mockOrgA, locationId: mockLocA2 },
        cb,
      );

      expect(success).toBe(false);
      expect(mockSocket.join).not.toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        message: "Access denied: Not authorized for this location",
      });
      expect(cb).toHaveBeenCalledWith({
        success: false,
        error: "Access denied: Not authorized for this location",
      });
    });

    it("rejects user who lacks order/KDS event permissions", async () => {
      const mockSocket: any = {
        id: "sock-no-perm",
        data: { user: authenticatedSocketUser },
        emit: vi.fn(),
        join: vi.fn(),
      };
      const cb = vi.fn();

      // User is assigned to locA1, but role has no order/kds permissions (e.g. Guest/Viewer)
      vi.mocked(prisma.organizationMembership.findUnique).mockResolvedValueOnce(
        {
          id: "mem-1",
          userId: mockUserId,
          organizationId: mockOrgA,
          status: "ACTIVE",
          role: {
            name: "Guest",
            permissions: [{ permission: { code: "profile:view" } }],
          },
          locationMemberships: [{ locationId: mockLocA1 }],
        } as any,
      );

      vi.mocked(prisma.location.findFirst).mockResolvedValueOnce({
        id: mockLocA1,
        organizationId: mockOrgA,
        name: "Main Branch",
      } as any);

      const success = await authorizeAndJoinLocation(
        mockSocket,
        { orgId: mockOrgA, locationId: mockLocA1 },
        cb,
      );

      expect(success).toBe(false);
      expect(mockSocket.join).not.toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith("error", {
        message: "Access denied: Insufficient permissions",
      });
    });

    it("7. Authorized user can join their permitted location", async () => {
      const mockSocket: any = {
        id: "sock-authorized",
        data: { user: authenticatedSocketUser },
        emit: vi.fn(),
        join: vi.fn(),
      };
      const cb = vi.fn();

      // Active member, role has order:view, assigned to locA1
      vi.mocked(prisma.organizationMembership.findUnique).mockResolvedValueOnce(
        {
          id: "mem-1",
          userId: mockUserId,
          organizationId: mockOrgA,
          status: "ACTIVE",
          role: {
            name: "Kitchen",
            permissions: [{ permission: { code: "kds:view" } }],
          },
          locationMemberships: [{ locationId: mockLocA1 }],
        } as any,
      );

      vi.mocked(prisma.location.findFirst).mockResolvedValueOnce({
        id: mockLocA1,
        organizationId: mockOrgA,
        name: "Main Branch",
      } as any);

      const success = await authorizeAndJoinLocation(
        mockSocket,
        { orgId: mockOrgA, locationId: mockLocA1 },
        cb,
      );

      const expectedRoom = `org_${mockOrgA}_loc_${mockLocA1}`;
      expect(success).toBe(true);
      expect(mockSocket.join).toHaveBeenCalledWith(expectedRoom);
      expect(mockSocket.emit).toHaveBeenCalledWith("location-joined", {
        orgId: mockOrgA,
        locationId: mockLocA1,
        room: expectedRoom,
      });
      expect(cb).toHaveBeenCalledWith({
        success: true,
        room: expectedRoom,
      });
    });

    it("Organization Owner / Admin can join any location in their organization", async () => {
      const mockSocket: any = {
        id: "sock-owner",
        data: { user: authenticatedSocketUser },
        emit: vi.fn(),
        join: vi.fn(),
      };
      const cb = vi.fn();

      // Owner role has implicit organization-wide access to all locations
      vi.mocked(prisma.organizationMembership.findUnique).mockResolvedValueOnce(
        {
          id: "mem-owner",
          userId: mockUserId,
          organizationId: mockOrgA,
          status: "ACTIVE",
          role: { name: "Owner", permissions: [{ permission: { code: "*" } }] },
          locationMemberships: [], // No explicit location membership required for Owner
        } as any,
      );

      vi.mocked(prisma.location.findFirst).mockResolvedValueOnce({
        id: mockLocA2,
        organizationId: mockOrgA,
        name: "Uptown Branch",
      } as any);

      const success = await authorizeAndJoinLocation(
        mockSocket,
        { orgId: mockOrgA, locationId: mockLocA2 },
        cb,
      );

      const expectedRoom = `org_${mockOrgA}_loc_${mockLocA2}`;
      expect(success).toBe(true);
      expect(mockSocket.join).toHaveBeenCalledWith(expectedRoom);
      expect(cb).toHaveBeenCalledWith({
        success: true,
        room: expectedRoom,
      });
    });
  });

  // ─── 3. LEAVE LOCATION AND EVENT BROADCASTING TESTS ────────────────────────

  describe("leaveLocation and emitToLocation", () => {
    it("leaves location room safely", () => {
      const mockSocket: any = {
        id: "sock-leave",
        leave: vi.fn(),
        emit: vi.fn(),
      };
      const cb = vi.fn();

      leaveLocation(mockSocket, { orgId: mockOrgA, locationId: mockLocA1 }, cb);

      const expectedRoom = `org_${mockOrgA}_loc_${mockLocA1}`;
      expect(mockSocket.leave).toHaveBeenCalledWith(expectedRoom);
      expect(mockSocket.emit).toHaveBeenCalledWith("location-left", {
        orgId: mockOrgA,
        locationId: mockLocA1,
        room: expectedRoom,
      });
      expect(cb).toHaveBeenCalledWith({ success: true, room: expectedRoom });
    });

    it("8. Existing order events still work for authorized users via scoped room", () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const mockIO: any = { to: mockTo };

      setSocketIO(mockIO);

      const testPayload = {
        id: "ord-999",
        orderNumber: "ORD-999",
        status: "SUBMITTED",
        totalCents: 2500,
      };

      emitToLocation(mockOrgA, mockLocA1, "order:submitted", testPayload);

      const expectedRoom = `org_${mockOrgA}_loc_${mockLocA1}`;
      expect(mockTo).toHaveBeenCalledWith(expectedRoom);
      expect(mockEmit).toHaveBeenCalledWith("order:submitted", testPayload);
    });

    it("emitToOrg broadcasts to org room", () => {
      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      const mockIO: any = { to: mockTo };

      setSocketIO(mockIO);

      const testPayload = { message: "System maintenance in 10 minutes" };
      emitToOrg(mockOrgA, "system:announcement", testPayload);

      expect(mockTo).toHaveBeenCalledWith(`org_${mockOrgA}`);
      expect(mockEmit).toHaveBeenCalledWith("system:announcement", testPayload);
    });
  });
});
