import { withTenantContext } from "../../db/tenant-context.js";
import { AppError } from "../../utils/app-error.js";
import { AuditService } from "../../services/audit.service.js";
import type {
  CreateDiningAreaInput,
  UpdateDiningAreaInput,
  CreateTableInput,
  UpdateTableInput,
  UpdateTableLayoutInput,
  SeatTableInput,
  UpdateTableStatusInput,
  TransferTableInput,
} from "./foh.schemas.js";

export class FoHService {
  // ─── Floor Plan & Dining Areas ─────────────────────────────────────────────

  static async getFloorPlan(orgId: string, locationId: string) {
    return withTenantContext(orgId, async (tx) => {
      // Ensure location belongs to organization or resolve first location
      let location = await tx.location.findFirst({
        where: { id: locationId, organizationId: orgId },
      });
      if (!location) {
        location = await tx.location.findFirst({
          where: { organizationId: orgId },
        });
        if (!location) {
          const org = await tx.organization.findUnique({ where: { id: orgId } });
          const orgName = org?.name || "Main";
          location = await tx.location.create({
            data: {
              organizationId: orgId,
              name: `${orgName} Main`,
              code: "MAIN",
              timezone: "America/New_York",
              currency: "USD",
            },
          });
        }
      }

      const effectiveLocationId = location.id;

      const diningAreas = await tx.diningArea.findMany({
        where: { organizationId: orgId, locationId: effectiveLocationId },
        include: {
          assignedServer: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { sortOrder: "asc" },
      });

      const tables = await tx.table.findMany({
        where: { organizationId: orgId, locationId: effectiveLocationId, isActive: true },
        include: {
          assignedServer: {
            select: { id: true, firstName: true, lastName: true },
          },
          sessions: {
            where: { status: "ACTIVE" },
            include: {
              server: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
            take: 1,
            orderBy: { seatedAt: "desc" },
          },
        },
        orderBy: { tableNumber: "asc" },
      });

      const formattedTables = tables.map((t) => {
        const activeSession = t.sessions[0];
        return {
          id: t.id,
          organizationId: t.organizationId,
          locationId: t.locationId,
          diningAreaId: t.diningAreaId,
          tableNumber: t.tableNumber,
          shape: t.shape,
          minCovers: t.minCovers,
          maxCovers: t.maxCovers,
          posX: t.posX,
          posY: t.posY,
          width: t.width,
          height: t.height,
          rotation: t.rotation,
          status: t.status,
          isActive: t.isActive,
          assignedServerId: t.assignedServerId ?? null,
          assignedServerName: t.assignedServer
            ? `${t.assignedServer.firstName} ${t.assignedServer.lastName}`.trim()
            : null,
          activeSession: activeSession
            ? {
                id: activeSession.id,
                organizationId: activeSession.organizationId,
                locationId: activeSession.locationId,
                tableId: activeSession.tableId,
                serverUserId: activeSession.serverUserId,
                serverName: activeSession.server
                  ? `${activeSession.server.firstName} ${activeSession.server.lastName}`.trim()
                  : null,
                guestCount: activeSession.guestCount,
                seatedAt: activeSession.seatedAt.toISOString(),
                closedAt: activeSession.closedAt?.toISOString() || null,
                status: activeSession.status,
                createdAt: activeSession.createdAt.toISOString(),
                updatedAt: activeSession.updatedAt.toISOString(),
              }
            : null,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        };
      });

      return {
        locationId: effectiveLocationId,
        diningAreas: diningAreas.map((a) => ({
          id: a.id,
          organizationId: a.organizationId,
          locationId: a.locationId,
          name: a.name,
          sortOrder: a.sortOrder,
          isActive: a.isActive,
          assignedServerId: a.assignedServerId ?? null,
          assignedServerName: a.assignedServer
            ? `${a.assignedServer.firstName} ${a.assignedServer.lastName}`.trim()
            : null,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
        })),
        tables: formattedTables,
      };
    });
  }

  static async createDiningArea(
    orgId: string,
    actorId: string,
    input: CreateDiningAreaInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      let location = await tx.location.findFirst({
        where: { id: input.locationId, organizationId: orgId },
      });
      if (!location) {
        location = await tx.location.findFirst({
          where: { organizationId: orgId },
        });
        if (!location) {
          const org = await tx.organization.findUnique({ where: { id: orgId } });
          const orgName = org?.name || "Main";
          location = await tx.location.create({
            data: {
              organizationId: orgId,
              name: `${orgName} Main`,
              code: "MAIN",
              timezone: "America/New_York",
              currency: "USD",
            },
          });
        }
      }

      const existing = await tx.diningArea.findFirst({
        where: { locationId: location.id, name: input.name },
      });
      if (existing) {
        throw AppError.conflict(
          `Dining area '${input.name}' already exists in this location`,
        );
      }

      const diningArea = await tx.diningArea.create({
        data: {
          organizationId: orgId,
          locationId: location.id,
          name: input.name,
          sortOrder: input.sortOrder ?? 0,
          assignedServerId: input.assignedServerId ?? null,
        },
      });

      await AuditService.log(
        {
          action: "dining_area:created",
          organizationId: orgId,
          actorId,
          entityType: "DiningArea",
          entityId: diningArea.id,
          metadata: { name: diningArea.name, locationId: location.id },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return diningArea;
    });
  }

  static async updateDiningArea(
    orgId: string,
    actorId: string,
    id: string,
    input: UpdateDiningAreaInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const area = await tx.diningArea.findFirst({
        where: { id, organizationId: orgId },
      });
      if (!area) {
        throw AppError.notFound("Dining area not found");
      }

      if (input.name && input.name !== area.name) {
        const conflict = await tx.diningArea.findFirst({
          where: { locationId: area.locationId, name: input.name, id: { not: id } },
        });
        if (conflict) {
          throw AppError.conflict(
            `Dining area '${input.name}' already exists in this location`,
          );
        }
      }

      const updated = await tx.diningArea.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.assignedServerId !== undefined ? { assignedServerId: input.assignedServerId } : {}),
        },
      });

      await AuditService.log(
        {
          action: "dining_area:updated",
          organizationId: orgId,
          actorId,
          entityType: "DiningArea",
          entityId: id,
          metadata: input,
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return updated;
    });
  }

  // ─── Tables ─────────────────────────────────────────────────────────────────

  static async createTable(
    orgId: string,
    actorId: string,
    input: CreateTableInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const area = await tx.diningArea.findFirst({
        where: { id: input.diningAreaId, organizationId: orgId },
      });
      if (!area) {
        throw AppError.notFound("Dining area not found in this organization");
      }

      const existing = await tx.table.findFirst({
        where: { locationId: area.locationId, tableNumber: input.tableNumber },
      });
      if (existing) {
        throw AppError.conflict(
          `Table number '${input.tableNumber}' already exists at this location`,
        );
      }

      const table = await tx.table.create({
        data: {
          organizationId: orgId,
          locationId: area.locationId,
          diningAreaId: area.id,
          tableNumber: input.tableNumber,
          shape: input.shape ?? "RECTANGLE",
          minCovers: input.minCovers ?? 1,
          maxCovers: input.maxCovers ?? 4,
          posX: input.posX ?? 0,
          posY: input.posY ?? 0,
          width: input.width ?? 100,
          height: input.height ?? 100,
          rotation: input.rotation ?? 0,
          status: "AVAILABLE",
          assignedServerId: input.assignedServerId ?? null,
        },
      });

      await AuditService.log(
        {
          action: "table:created",
          organizationId: orgId,
          actorId,
          entityType: "Table",
          entityId: table.id,
          metadata: { tableNumber: table.tableNumber, diningAreaId: table.diningAreaId },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return table;
    });
  }

  static async updateTable(
    orgId: string,
    actorId: string,
    id: string,
    input: UpdateTableInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const table = await tx.table.findFirst({
        where: { id, organizationId: orgId },
      });
      if (!table) {
        throw AppError.notFound("Table not found");
      }

      if (input.tableNumber && input.tableNumber !== table.tableNumber) {
        const conflict = await tx.table.findFirst({
          where: {
            locationId: table.locationId,
            tableNumber: input.tableNumber,
            id: { not: id },
          },
        });
        if (conflict) {
          throw AppError.conflict(
            `Table number '${input.tableNumber}' already exists at this location`,
          );
        }
      }

      const updated = await tx.table.update({
        where: { id },
        data: {
          ...(input.tableNumber !== undefined ? { tableNumber: input.tableNumber } : {}),
          ...(input.diningAreaId !== undefined ? { diningAreaId: input.diningAreaId } : {}),
          ...(input.shape !== undefined ? { shape: input.shape } : {}),
          ...(input.minCovers !== undefined ? { minCovers: input.minCovers } : {}),
          ...(input.maxCovers !== undefined ? { maxCovers: input.maxCovers } : {}),
          ...(input.posX !== undefined ? { posX: input.posX } : {}),
          ...(input.posY !== undefined ? { posY: input.posY } : {}),
          ...(input.width !== undefined ? { width: input.width } : {}),
          ...(input.height !== undefined ? { height: input.height } : {}),
          ...(input.rotation !== undefined ? { rotation: input.rotation } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.assignedServerId !== undefined ? { assignedServerId: input.assignedServerId } : {}),
        },
      });

      await AuditService.log(
        {
          action: "table:updated",
          organizationId: orgId,
          actorId,
          entityType: "Table",
          entityId: id,
          metadata: input,
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return updated;
    });
  }

  static async updateTableLayout(
    orgId: string,
    actorId: string,
    locationId: string,
    input: UpdateTableLayoutInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const updatedTables = [];
      for (const item of input.tables) {
        const updated = await tx.table.updateMany({
          where: { id: item.id, organizationId: orgId, locationId },
          data: {
            posX: item.posX,
            posY: item.posY,
            width: item.width,
            height: item.height,
            rotation: item.rotation,
          },
        });
        if (updated.count > 0) {
          updatedTables.push(item.id);
        }
      }

      await AuditService.log(
        {
          action: "table_layout:updated",
          organizationId: orgId,
          actorId,
          entityType: "Location",
          entityId: locationId,
          metadata: { updatedCount: updatedTables.length },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return { count: updatedTables.length, tableIds: updatedTables };
    });
  }

  // ─── Table Seating & Status State Machine ───────────────────────────────────

  static async seatTable(
    orgId: string,
    actorId: string,
    tableId: string,
    input: SeatTableInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const table = await tx.table.findFirst({
        where: { id: tableId, organizationId: orgId },
        include: { diningArea: true },
      });
      if (!table) {
        throw AppError.notFound("Table not found");
      }

      if (table.status === "BLOCKED") {
        throw AppError.badRequest("Cannot seat a blocked table");
      }

      // Check if there is already an active session
      const existingSession = await tx.tableSession.findFirst({
        where: { tableId, organizationId: orgId, status: "ACTIVE" },
      });
      if (existingSession) {
        throw AppError.conflict("Table is already occupied by an active session");
      }

      const serverId =
        input.serverUserId ||
        table.assignedServerId ||
        table.diningArea?.assignedServerId ||
        actorId;

      const session = await tx.tableSession.create({
        data: {
          organizationId: orgId,
          locationId: table.locationId,
          tableId: table.id,
          serverUserId: serverId,
          guestCount: input.guestCount,
          status: "ACTIVE",
          seatedAt: new Date(),
        },
        include: {
          server: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await tx.table.update({
        where: { id: tableId },
        data: { status: "SEATED" },
      });

      await AuditService.log(
        {
          action: "table:seated",
          organizationId: orgId,
          actorId,
          entityType: "TableSession",
          entityId: session.id,
          metadata: {
            tableId,
            guestCount: input.guestCount,
            serverUserId: serverId,
          },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return {
        session: {
          id: session.id,
          tableId: session.tableId,
          guestCount: session.guestCount,
          serverUserId: session.serverUserId,
          serverName: session.server
            ? `${session.server.firstName} ${session.server.lastName}`.trim()
            : null,
          seatedAt: session.seatedAt.toISOString(),
          status: session.status,
        },
        tableStatus: "SEATED",
      };
    });
  }

  static async updateTableStatus(
    orgId: string,
    actorId: string,
    tableId: string,
    input: UpdateTableStatusInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const table = await tx.table.findFirst({
        where: { id: tableId, organizationId: orgId },
      });
      if (!table) {
        throw AppError.notFound("Table not found");
      }

      const prevStatus = table.status;
      const newStatus = input.status;

      // If resetting to DIRTY or AVAILABLE, close any active session
      if (newStatus === "DIRTY" || newStatus === "AVAILABLE") {
        await tx.tableSession.updateMany({
          where: { tableId, organizationId: orgId, status: "ACTIVE" },
          data: {
            status: "COMPLETED",
            closedAt: new Date(),
          },
        });
      }

      const updated = await tx.table.update({
        where: { id: tableId },
        data: { status: newStatus },
      });

      await AuditService.log(
        {
          action: "table:status_updated",
          organizationId: orgId,
          actorId,
          entityType: "Table",
          entityId: tableId,
          metadata: { from: prevStatus, to: newStatus },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return updated;
    });
  }

  static async transferTable(
    orgId: string,
    actorId: string,
    tableId: string,
    input: TransferTableInput,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const sourceTable = await tx.table.findFirst({
        where: { id: tableId, organizationId: orgId },
      });
      if (!sourceTable) {
        throw AppError.notFound("Source table not found");
      }

      const activeSession = await tx.tableSession.findFirst({
        where: { tableId, organizationId: orgId, status: "ACTIVE" },
      });
      if (!activeSession) {
        throw AppError.badRequest("No active party session to transfer on this table");
      }

      // 1. Transfer Server Only
      if (input.targetServerUserId && !input.targetTableId) {
        const updated = await tx.tableSession.update({
          where: { id: activeSession.id },
          data: { serverUserId: input.targetServerUserId },
          include: { server: { select: { id: true, firstName: true, lastName: true } } },
        });

        await AuditService.log(
          {
            action: "table:server_transferred",
            organizationId: orgId,
            actorId,
            entityType: "TableSession",
            entityId: activeSession.id,
            metadata: { newServerUserId: input.targetServerUserId },
            ipAddress: clientInfo?.ip,
            requestId: clientInfo?.requestId,
          },
          tx,
        );

        return {
          session: updated,
          message: "Server transferred successfully",
        };
      }

      // 2. Transfer Party to Another Table
      if (input.targetTableId) {
        const targetTable = await tx.table.findFirst({
          where: { id: input.targetTableId, organizationId: orgId },
        });
        if (!targetTable) {
          throw AppError.notFound("Target table not found");
        }
        if (targetTable.status !== "AVAILABLE") {
          throw AppError.conflict(
            `Target table ${targetTable.tableNumber} is not available (status: ${targetTable.status})`,
          );
        }

        // Close old session as TRANSFERRED
        await tx.tableSession.update({
          where: { id: activeSession.id },
          data: { status: "TRANSFERRED", closedAt: new Date() },
        });

        // Set source table to DIRTY
        await tx.table.update({
          where: { id: sourceTable.id },
          data: { status: "DIRTY" },
        });

        // Open new session on target table
        const newServerId = input.targetServerUserId || activeSession.serverUserId || actorId;
        const newSession = await tx.tableSession.create({
          data: {
            organizationId: orgId,
            locationId: targetTable.locationId,
            tableId: targetTable.id,
            serverUserId: newServerId,
            guestCount: activeSession.guestCount,
            status: "ACTIVE",
            seatedAt: activeSession.seatedAt,
          },
          include: { server: { select: { id: true, firstName: true, lastName: true } } },
        });

        // Set target table to SEATED
        await tx.table.update({
          where: { id: targetTable.id },
          data: { status: "SEATED" },
        });

        await AuditService.log(
          {
            action: "table:party_transferred",
            organizationId: orgId,
            actorId,
            entityType: "TableSession",
            entityId: newSession.id,
            metadata: {
              fromTableId: sourceTable.id,
              toTableId: targetTable.id,
              guestCount: activeSession.guestCount,
            },
            ipAddress: clientInfo?.ip,
            requestId: clientInfo?.requestId,
          },
          tx,
        );

        return {
          previousSessionId: activeSession.id,
          newSession,
          targetTableStatus: "SEATED",
          sourceTableStatus: "DIRTY",
        };
      }

      throw AppError.badRequest("Invalid transfer parameters");
    });
  }

  // ─── Staff & Server Assignments ──────────────────────────────────────────

  static async getStaffMembers(orgId: string) {
    return withTenantContext(orgId, async (tx) => {
      const memberships = await tx.organizationMembership.findMany({
        where: { organizationId: orgId, status: "ACTIVE" },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          role: {
            select: { name: true },
          },
        },
        orderBy: { user: { firstName: "asc" } },
      });

      return memberships.map((m) => ({
        id: m.user.id,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        email: m.user.email,
        role: m.role.name,
      }));
    });
  }

  static async assignSectionServer(
    orgId: string,
    actorId: string,
    areaId: string,
    serverUserId: string | null,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const area = await tx.diningArea.findFirst({
        where: { id: areaId, organizationId: orgId },
      });
      if (!area) {
        throw AppError.notFound("Dining area not found");
      }

      if (serverUserId) {
        const staff = await tx.organizationMembership.findFirst({
          where: { organizationId: orgId, userId: serverUserId, status: "ACTIVE" },
        });
        if (!staff) {
          throw AppError.badRequest("Selected server is not an active member of this organization");
        }
      }

      const updated = await tx.diningArea.update({
        where: { id: areaId },
        data: { assignedServerId: serverUserId },
        include: {
          assignedServer: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await AuditService.log(
        {
          action: "dining_area:server_assigned",
          organizationId: orgId,
          actorId,
          entityType: "DiningArea",
          entityId: areaId,
          metadata: { assignedServerId: serverUserId },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return {
        id: updated.id,
        name: updated.name,
        assignedServerId: updated.assignedServerId,
        assignedServerName: updated.assignedServer
          ? `${updated.assignedServer.firstName} ${updated.assignedServer.lastName}`.trim()
          : null,
      };
    });
  }

  static async assignTableServer(
    orgId: string,
    actorId: string,
    tableId: string,
    serverUserId: string | null,
    clientInfo?: { ip?: string; requestId?: string },
  ) {
    return withTenantContext(orgId, async (tx) => {
      const table = await tx.table.findFirst({
        where: { id: tableId, organizationId: orgId },
      });
      if (!table) {
        throw AppError.notFound("Table not found");
      }

      if (serverUserId) {
        const staff = await tx.organizationMembership.findFirst({
          where: { organizationId: orgId, userId: serverUserId, status: "ACTIVE" },
        });
        if (!staff) {
          throw AppError.badRequest("Selected server is not an active member of this organization");
        }
      }

      const updated = await tx.table.update({
        where: { id: tableId },
        data: { assignedServerId: serverUserId },
        include: {
          assignedServer: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      // If table has an active session and a new server is assigned, update active session's server too
      if (serverUserId) {
        await tx.tableSession.updateMany({
          where: { tableId, organizationId: orgId, status: "ACTIVE" },
          data: { serverUserId },
        });
      }

      await AuditService.log(
        {
          action: "table:server_assigned",
          organizationId: orgId,
          actorId,
          entityType: "Table",
          entityId: tableId,
          metadata: { assignedServerId: serverUserId },
          ipAddress: clientInfo?.ip,
          requestId: clientInfo?.requestId,
        },
        tx,
      );

      return {
        id: updated.id,
        tableNumber: updated.tableNumber,
        assignedServerId: updated.assignedServerId,
        assignedServerName: updated.assignedServer
          ? `${updated.assignedServer.firstName} ${updated.assignedServer.lastName}`.trim()
          : null,
      };
    });
  }
}

