import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../../app.js";
import { TeamService } from "./team.service.js";
import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";

describe("Team & Staff Management Routes (/api/v1/team)", () => {
  const app = createApp();

  const mockUser = {
    id: "a1111111-1111-4111-8111-111111111111",
    email: "manager@bistroalpha.com",
    firstName: "Auguste",
    lastName: "Gusteau",
    status: "ACTIVE",
    emailVerified: true,
  };

  const validToken = jwt.sign(
    { sub: mockUser.id, email: mockUser.email, type: "access" },
    env.JWT_SECRET,
    { expiresIn: "15m" },
  );

  const mockOrgId = "11111111-1111-4111-8111-111111111111";
  const mockMemberId = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const mockRoleId = "bbbb1111-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const mockLocationId = "cccc1111-cccc-4ccc-8ccc-cccccccccccc";

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(prisma.user, "findUnique").mockResolvedValue(mockUser as any);

    vi.spyOn(prisma.organizationMembership, "findUnique").mockResolvedValue({
      id: "mem-1",
      userId: mockUser.id,
      organizationId: mockOrgId,
      roleId: "role-owner",
      status: "ACTIVE",
      invitedAt: new Date(),
      joinedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      organization: {
        id: mockOrgId,
        slug: "bistro-alpha",
        name: "Bistro Alpha",
        status: "ACTIVE",
      },
      role: {
        id: "role-owner",
        organizationId: mockOrgId,
        name: "Owner",
        permissions: [
          { permission: { code: "user:view" } },
          { permission: { code: "user:invite" } },
          { permission: { code: "user:manage" } },
          { permission: { code: "role:view" } },
          { permission: { code: "location:view" } },
        ],
      },
      locationMemberships: [],
    } as any);
  });

  describe("GET /api/v1/team", () => {
    it("should return 200 with all team members", async () => {
      vi.spyOn(TeamService, "getTeamMembers").mockResolvedValue([
        {
          id: mockMemberId,
          userId: mockUser.id,
          organizationId: mockOrgId,
          email: mockUser.email,
          firstName: mockUser.firstName,
          lastName: mockUser.lastName,
          status: "ACTIVE",
          role: {
            id: mockRoleId,
            name: "Owner",
            description: "Full access",
            scope: "ORGANIZATION",
          },
          locations: [
            { id: mockLocationId, name: "Main Location", code: "MAIN" },
          ],
          invitedAt: new Date().toISOString(),
          joinedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);

      const res = await request(app)
        .get("/api/v1/team")
        .set("Authorization", `Bearer ${validToken}`)
        .set("X-Organization-Id", mockOrgId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].email).toBe("manager@bistroalpha.com");
      expect(res.body.data[0].role.name).toBe("Owner");
    });
  });

  describe("GET /api/v1/team/roles", () => {
    it("should return 200 with available organization roles", async () => {
      vi.spyOn(TeamService, "getRoles").mockResolvedValue([
        { id: "r1", organizationId: mockOrgId, name: "Owner", description: "All", isSystem: true, scope: "ORGANIZATION" },
        { id: "r2", organizationId: mockOrgId, name: "Server", description: "FoH", isSystem: true, scope: "LOCATION" },
      ]);

      const res = await request(app)
        .get("/api/v1/team/roles")
        .set("Authorization", `Bearer ${validToken}`)
        .set("X-Organization-Id", mockOrgId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe("GET /api/v1/team/locations", () => {
    it("should return 200 with active locations", async () => {
      vi.spyOn(TeamService, "getLocations").mockResolvedValue([
        { id: mockLocationId, name: "Main Dining", code: "MAIN", status: "ACTIVE" },
      ]);

      const res = await request(app)
        .get("/api/v1/team/locations")
        .set("Authorization", `Bearer ${validToken}`)
        .set("X-Organization-Id", mockOrgId);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe("POST /api/v1/team/invite", () => {
    it("should return 201 on successful staff invite", async () => {
      vi.spyOn(TeamService, "inviteStaff").mockResolvedValue({
        id: "new-member-id",
        userId: "new-user-id",
        organizationId: mockOrgId,
        email: "server.new@apollo.local",
        firstName: "Alfredo",
        lastName: "Linguini",
        status: "ACTIVE",
        role: {
          id: mockRoleId,
          name: "Server",
          description: "Front of house",
          scope: "LOCATION",
        },
        invitedAt: new Date().toISOString(),
        joinedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await request(app)
        .post("/api/v1/team/invite")
        .set("Authorization", `Bearer ${validToken}`)
        .set("X-Organization-Id", mockOrgId)
        .send({
          email: "server.new@apollo.local",
          firstName: "Alfredo",
          lastName: "Linguini",
          roleId: mockRoleId,
          locationIds: [mockLocationId],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe("server.new@apollo.local");
      expect(res.body.data.role.name).toBe("Server");
    });

    it("should return 400 on invalid email or missing fields", async () => {
      const res = await request(app)
        .post("/api/v1/team/invite")
        .set("Authorization", `Bearer ${validToken}`)
        .set("X-Organization-Id", mockOrgId)
        .send({
          email: "not-an-email",
          firstName: "",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe("PATCH /api/v1/team/:id/role", () => {
    it("should return 200 on successful role update", async () => {
      vi.spyOn(TeamService, "updateStaffRole").mockResolvedValue({
        id: mockMemberId,
        userId: "usr-2",
        role: { id: mockRoleId, name: "Manager", description: null, scope: "LOCATION" } as any,
      });

      const res = await request(app)
        .patch(`/api/v1/team/${mockMemberId}/role`)
        .set("Authorization", `Bearer ${validToken}`)
        .set("X-Organization-Id", mockOrgId)
        .send({ roleId: mockRoleId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role.name).toBe("Manager");
    });
  });

  describe("PATCH /api/v1/team/:id/status", () => {
    it("should return 200 on updating status to SUSPENDED", async () => {
      vi.spyOn(TeamService, "updateStaffStatus").mockResolvedValue({
        id: mockMemberId,
        userId: "usr-2",
        status: "SUSPENDED",
      });

      const res = await request(app)
        .patch(`/api/v1/team/${mockMemberId}/status`)
        .set("Authorization", `Bearer ${validToken}`)
        .set("X-Organization-Id", mockOrgId)
        .send({ status: "SUSPENDED" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("SUSPENDED");
    });
  });

  describe("PUT /api/v1/team/:id/locations", () => {
    it("should return 200 on updating location memberships", async () => {
      vi.spyOn(TeamService, "updateStaffLocations").mockResolvedValue({
        id: mockMemberId,
        locationCount: 1,
      });

      const res = await request(app)
        .put(`/api/v1/team/${mockMemberId}/locations`)
        .set("Authorization", `Bearer ${validToken}`)
        .set("X-Organization-Id", mockOrgId)
        .send({ locationIds: [mockLocationId] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.locationCount).toBe(1);
    });
  });
});
