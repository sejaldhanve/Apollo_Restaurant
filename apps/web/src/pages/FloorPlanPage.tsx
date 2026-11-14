import React, { useState, useEffect } from "react";
import { apiClient } from "../lib/api-client";
import { useAuthStore } from "../stores/authStore";
import type {
  DiningAreaDto,
  TableDto,
  TableShape,
  TableStatus,
  StaffMemberDto,
} from "@apollo/shared-types";
import {
  Grid3X3,
  Plus,
  RefreshCw,
  Users,
  CheckCircle2,
  AlertTriangle,
  Move,
  Layers,
  ArrowRightLeft,
  Sparkles,
  UserCheck,
  User,
} from "lucide-react";

export function FloorPlanPage() {
  const { currentOrgId } = useAuthStore();

  // State
  const [locationId, setLocationId] = useState<string>("");
  const [diningAreas, setDiningAreas] = useState<DiningAreaDto[]>([]);
  const [tables, setTables] = useState<TableDto[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMemberDto[]>([]);
  const [activeAreaId, setActiveAreaId] = useState<string>("");
  const [selectedTable, setSelectedTable] = useState<TableDto | null>(null);
  const [designerMode, setDesignerMode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [hasLayoutChanges, setHasLayoutChanges] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showAreaModal, setShowAreaModal] = useState<boolean>(false);
  const [showTableModal, setShowTableModal] = useState<boolean>(false);
  const [showTransferModal, setShowTransferModal] = useState<boolean>(false);

  // Form states
  const [newAreaName, setNewAreaName] = useState<string>("");
  const [newAreaServerId, setNewAreaServerId] = useState<string>("");
  const [newTableNumber, setNewTableNumber] = useState<string>("");
  const [newTableServerId, setNewTableServerId] = useState<string>("");
  const [newTableShape, setNewTableShape] = useState<TableShape>("RECTANGLE");
  const [newMinCovers, setNewMinCovers] = useState<number>(2);
  const [newMaxCovers, setNewMaxCovers] = useState<number>(4);
  const [seatGuestCount, setSeatGuestCount] = useState<number>(2);
  const [seatServerUserId, setSeatServerUserId] = useState<string>("");
  const [transferTargetTableId, setTransferTargetTableId] =
    useState<string>("");

  // Dragging state in Designer Mode
  const [draggingTableId, setDraggingTableId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  const loadFloorPlan = async () => {
    if (!currentOrgId) return;
    setIsLoading(true);
    setError(null);
    try {
      // Use fallback locationId if not yet set
      const targetLoc = locationId || "00000000-0000-0000-0000-000000000000";
      const res = await apiClient.get<{
        locationId: string;
        diningAreas: DiningAreaDto[];
        tables: TableDto[];
      }>(`/api/v1/foh/locations/${targetLoc}/floor-plan`);

      setLocationId(res.locationId);
      setDiningAreas(res.diningAreas);
      setTables(res.tables);

      try {
        const staffRes =
          await apiClient.get<StaffMemberDto[]>("/api/v1/foh/staff");
        if (Array.isArray(staffRes)) {
          setStaffMembers(staffRes);
        }
      } catch {
        // Staff listing optional if restricted
      }

      if (res.diningAreas.length > 0) {
        if (
          !activeAreaId ||
          !res.diningAreas.some((a) => a.id === activeAreaId)
        ) {
          setActiveAreaId(res.diningAreas[0]!.id);
        }
      } else {
        setActiveAreaId("");
      }

      setHasLayoutChanges(false);
    } catch (err: any) {
      setError(err.message || "Failed to load floor plan data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFloorPlan();
  }, [currentOrgId]);

  // Create Area Handler
  const handleCreateArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAreaName.trim()) return;
    setIsSubmitting(true);
    try {
      await apiClient.post("/api/v1/foh/dining-areas", {
        locationId: locationId || "00000000-0000-0000-0000-000000000000",
        name: newAreaName.trim(),
        sortOrder: diningAreas.length,
        assignedServerId: newAreaServerId || undefined,
      });
      setShowAreaModal(false);
      setNewAreaName("");
      setNewAreaServerId("");
      await loadFloorPlan();
    } catch (err: any) {
      setError(err.message || "Failed to create dining area");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Section Server Assignment Handler
  const handleAssignSectionServer = async (
    areaId: string,
    serverUserId: string | null,
  ) => {
    setIsSubmitting(true);
    try {
      await apiClient.patch(`/api/v1/foh/dining-areas/${areaId}/server`, {
        serverUserId,
      });
      await loadFloorPlan();
    } catch (err: any) {
      setError(err.message || "Failed to assign server to section");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Table Server Assignment Handler
  const handleAssignTableServer = async (
    tableId: string,
    serverUserId: string | null,
  ) => {
    setIsSubmitting(true);
    try {
      await apiClient.patch(`/api/v1/foh/tables/${tableId}/server`, {
        serverUserId,
      });
      await loadFloorPlan();
      if (selectedTable && selectedTable.id === tableId) {
        const updatedStaff = staffMembers.find((s) => s.id === serverUserId);
        setSelectedTable((prev) =>
          prev
            ? {
                ...prev,
                assignedServerId: serverUserId,
                assignedServerName: updatedStaff
                  ? `${updatedStaff.firstName} ${updatedStaff.lastName}`.trim()
                  : null,
              }
            : null,
        );
      }
    } catch (err: any) {
      setError(err.message || "Failed to assign server to table");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick Start Floor Plan Generator
  const handleGenerateStarterFloorPlan = async () => {
    setIsSubmitting(true);
    try {
      const area = await apiClient.post<DiningAreaDto>(
        "/api/v1/foh/dining-areas",
        {
          locationId: locationId || "00000000-0000-0000-0000-000000000000",
          name: "Main Dining Room",
          sortOrder: 0,
        },
      );

      const starterTables = [
        {
          tableNumber: "T1",
          shape: "SQUARE" as TableShape,
          minCovers: 1,
          maxCovers: 2,
          posX: 60,
          posY: 60,
          width: 90,
          height: 90,
        },
        {
          tableNumber: "T2",
          shape: "RECTANGLE" as TableShape,
          minCovers: 2,
          maxCovers: 4,
          posX: 200,
          posY: 60,
          width: 130,
          height: 90,
        },
        {
          tableNumber: "T3",
          shape: "ROUND" as TableShape,
          minCovers: 2,
          maxCovers: 4,
          posX: 380,
          posY: 60,
          width: 100,
          height: 100,
        },
        {
          tableNumber: "T4",
          shape: "BOOTH" as TableShape,
          minCovers: 4,
          maxCovers: 6,
          posX: 60,
          posY: 220,
          width: 150,
          height: 100,
        },
        {
          tableNumber: "T5",
          shape: "RECTANGLE" as TableShape,
          minCovers: 2,
          maxCovers: 4,
          posX: 260,
          posY: 220,
          width: 130,
          height: 90,
        },
        {
          tableNumber: "B1",
          shape: "BAR_STOOL" as TableShape,
          minCovers: 1,
          maxCovers: 1,
          posX: 440,
          posY: 240,
          width: 70,
          height: 70,
        },
      ];

      for (const t of starterTables) {
        await apiClient.post("/api/v1/foh/tables", {
          locationId: locationId || "00000000-0000-0000-0000-000000000000",
          diningAreaId: area.id,
          ...t,
        });
      }

      await loadFloorPlan();
    } catch (err: any) {
      setError(err.message || "Failed to generate starter floor plan");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create Table Handler
  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableNumber.trim() || !activeAreaId) return;
    setIsSubmitting(true);
    try {
      const defaultDimensions =
        newTableShape === "ROUND" || newTableShape === "SQUARE"
          ? { width: 100, height: 100 }
          : newTableShape === "BAR_STOOL"
            ? { width: 70, height: 70 }
            : newTableShape === "BOOTH"
              ? { width: 140, height: 90 }
              : { width: 120, height: 80 };

      await apiClient.post("/api/v1/foh/tables", {
        locationId,
        diningAreaId: activeAreaId,
        tableNumber: newTableNumber.trim().toUpperCase(),
        shape: newTableShape,
        minCovers: newMinCovers,
        maxCovers: newMaxCovers,
        posX: 100 + (tables.length % 5) * 30,
        posY: 100 + Math.floor(tables.length / 5) * 30,
        assignedServerId: newTableServerId || undefined,
        ...defaultDimensions,
      });

      setShowTableModal(false);
      setNewTableNumber("");
      setNewTableServerId("");
      await loadFloorPlan();
    } catch (err: any) {
      setError(err.message || "Failed to create table");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Seat Party Handler
  const handleSeatParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTable) return;
    setIsSubmitting(true);
    try {
      await apiClient.post(`/api/v1/foh/tables/${selectedTable.id}/seat`, {
        guestCount: seatGuestCount,
        serverUserId: seatServerUserId || undefined,
      });
      setSelectedTable(null);
      await loadFloorPlan();
    } catch (err: any) {
      setError(err.message || "Failed to seat table");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fast Status Transition Handler
  const handleUpdateStatus = async (tableId: string, status: TableStatus) => {
    setIsSubmitting(true);
    try {
      await apiClient.patch(`/api/v1/foh/tables/${tableId}/status`, { status });
      setSelectedTable(null);
      await loadFloorPlan();
    } catch (err: any) {
      setError(err.message || "Failed to update table status");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Transfer Table Handler
  const handleTransferTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTable || !transferTargetTableId) return;
    setIsSubmitting(true);
    try {
      await apiClient.post(`/api/v1/foh/tables/${selectedTable.id}/transfer`, {
        targetTableId: transferTargetTableId,
      });
      setShowTransferModal(false);
      setSelectedTable(null);
      setTransferTargetTableId("");
      await loadFloorPlan();
    } catch (err: any) {
      setError(err.message || "Failed to transfer table party");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Designer Mode: Save Layout
  const handleSaveLayout = async () => {
    setIsSubmitting(true);
    try {
      const layoutPayload = tables.map((t) => ({
        id: t.id,
        posX: Math.round(t.posX),
        posY: Math.round(t.posY),
        width: Math.round(t.width),
        height: Math.round(t.height),
        rotation: t.rotation,
      }));

      await apiClient.put(`/api/v1/foh/locations/${locationId}/tables/layout`, {
        tables: layoutPayload,
      });
      setHasLayoutChanges(false);
    } catch (err: any) {
      setError(err.message || "Failed to save layout changes");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Dragging logic for designer mode
  const handleMouseDown = (e: React.MouseEvent, table: TableDto) => {
    if (!designerMode) return;
    setDraggingTableId(table.id);
    const canvas = e.currentTarget.parentElement?.getBoundingClientRect();
    if (canvas) {
      setDragOffset({
        x: e.clientX - canvas.left - table.posX,
        y: e.clientY - canvas.top - table.posY,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!designerMode || !draggingTableId) return;
    const canvas = e.currentTarget.getBoundingClientRect();
    const newX = Math.max(
      0,
      Math.min(canvas.width - 80, e.clientX - canvas.left - dragOffset.x),
    );
    const newY = Math.max(
      0,
      Math.min(canvas.height - 80, e.clientY - canvas.top - dragOffset.y),
    );

    // Snap to 10px grid
    const snappedX = Math.round(newX / 10) * 10;
    const snappedY = Math.round(newY / 10) * 10;

    setTables((prev) =>
      prev.map((t) =>
        t.id === draggingTableId ? { ...t, posX: snappedX, posY: snappedY } : t,
      ),
    );
    setHasLayoutChanges(true);
  };

  const handleMouseUp = () => {
    setDraggingTableId(null);
  };

  // Active dining area and filtered tables
  const activeArea = diningAreas.find((a) => a.id === activeAreaId);
  const areaTables = tables.filter((t) => t.diningAreaId === activeAreaId);

  // Status Styling Configuration
  const getStatusConfig = (status: TableStatus) => {
    switch (status) {
      case "AVAILABLE":
        return {
          bg: "bg-emerald-50",
          border: "border-emerald-500",
          badge: "bg-emerald-500 text-white",
          text: "text-emerald-700",
          label: "Available",
        };
      case "SEATED":
        return {
          bg: "bg-indigo-50",
          border: "border-indigo-600",
          badge: "bg-indigo-600 text-white",
          text: "text-indigo-700",
          label: "Seated",
        };
      case "ORDERED":
        return {
          bg: "bg-amber-50",
          border: "border-amber-500",
          badge: "bg-amber-500 text-white",
          text: "text-amber-800",
          label: "Ordered",
        };
      case "SERVED":
        return {
          bg: "bg-orange-50",
          border: "border-orange-500",
          badge: "bg-orange-500 text-white",
          text: "text-orange-800",
          label: "Served",
        };
      case "PAYMENT_PENDING":
        return {
          bg: "bg-purple-50",
          border: "border-purple-600",
          badge: "bg-purple-600 text-white",
          text: "text-purple-700",
          label: "Pay Pending",
        };
      case "DIRTY":
        return {
          bg: "bg-rose-50",
          border: "border-rose-400",
          badge: "bg-rose-500 text-white",
          text: "text-rose-700",
          label: "Dirty (Bus)",
        };
      case "BLOCKED":
        return {
          bg: "bg-gray-100",
          border: "border-gray-400",
          badge: "bg-gray-500 text-white",
          text: "text-gray-600",
          label: "Blocked",
        };
      default:
        return {
          bg: "bg-gray-50",
          border: "border-gray-300",
          badge: "bg-gray-400 text-white",
          text: "text-gray-600",
          label: status,
        };
    }
  };

  // Calculate status summary counts
  const summaryCounts = {
    available: tables.filter((t) => t.status === "AVAILABLE").length,
    seated: tables.filter((t) => t.status === "SEATED").length,
    ordered: tables.filter((t) => t.status === "ORDERED").length,
    served: tables.filter((t) => t.status === "SERVED").length,
    payment: tables.filter((t) => t.status === "PAYMENT_PENDING").length,
    dirty: tables.filter((t) => t.status === "DIRTY").length,
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">
              Front of House & Table Management
            </h2>
            <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-800">
              Phase 2 • FoH
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Live seating state machine, server station assignments, and
            interactive 2D floor designer.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Designer Mode Toggle */}
          <button
            onClick={() => setDesignerMode(!designerMode)}
            className={`flex items-center space-x-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition shadow-xs ${
              designerMode
                ? "bg-amber-600 text-white hover:bg-amber-700"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Move className="h-4 w-4" />
            <span>{designerMode ? "Exit Designer" : "Floor Designer"}</span>
          </button>

          {designerMode && hasLayoutChanges && (
            <button
              onClick={handleSaveLayout}
              disabled={isSubmitting}
              className="flex items-center space-x-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Save Layout</span>
            </button>
          )}

          <button
            onClick={() => setShowAreaModal(true)}
            className="flex items-center space-x-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-xs hover:bg-gray-50"
          >
            <Layers className="h-4 w-4 text-gray-500" />
            <span>New Section</span>
          </button>

          {diningAreas.length > 0 && (
            <button
              onClick={() => setShowTableModal(true)}
              className="flex items-center space-x-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" />
              <span>Add Table</span>
            </button>
          )}

          <button
            onClick={loadFloorPlan}
            disabled={isLoading}
            className="rounded-lg border border-gray-300 bg-white p-2 text-gray-600 shadow-xs hover:bg-gray-50 disabled:opacity-50"
            title="Refresh Floor Plan"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center space-x-2.5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Live Status Summary Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 shadow-xs">
          <div>
            <p className="text-2xs font-bold uppercase tracking-wider text-emerald-800">
              Available
            </p>
            <p className="text-xl font-extrabold text-emerald-900">
              {summaryCounts.available}
            </p>
          </div>
          <div className="h-3 w-3 rounded-full bg-emerald-500" />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 shadow-xs">
          <div>
            <p className="text-2xs font-bold uppercase tracking-wider text-indigo-800">
              Seated
            </p>
            <p className="text-xl font-extrabold text-indigo-900">
              {summaryCounts.seated}
            </p>
          </div>
          <div className="h-3 w-3 rounded-full bg-indigo-600" />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/70 p-3 shadow-xs">
          <div>
            <p className="text-2xs font-bold uppercase tracking-wider text-amber-800">
              Ordered
            </p>
            <p className="text-xl font-extrabold text-amber-900">
              {summaryCounts.ordered}
            </p>
          </div>
          <div className="h-3 w-3 rounded-full bg-amber-500" />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50/70 p-3 shadow-xs">
          <div>
            <p className="text-2xs font-bold uppercase tracking-wider text-orange-800">
              Served
            </p>
            <p className="text-xl font-extrabold text-orange-900">
              {summaryCounts.served}
            </p>
          </div>
          <div className="h-3 w-3 rounded-full bg-orange-500" />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-purple-200 bg-purple-50/70 p-3 shadow-xs">
          <div>
            <p className="text-2xs font-bold uppercase tracking-wider text-purple-800">
              Payment Pending
            </p>
            <p className="text-xl font-extrabold text-purple-900">
              {summaryCounts.payment}
            </p>
          </div>
          <div className="h-3 w-3 rounded-full bg-purple-600" />
        </div>

        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/70 p-3 shadow-xs">
          <div>
            <p className="text-2xs font-bold uppercase tracking-wider text-rose-800">
              Dirty / Bus
            </p>
            <p className="text-xl font-extrabold text-rose-900">
              {summaryCounts.dirty}
            </p>
          </div>
          <div className="h-3 w-3 rounded-full bg-rose-500" />
        </div>
      </div>

      {/* Dining Area Tabs & Section Server Assignment */}
      {diningAreas.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-2 sm:pb-0">
          <nav className="-mb-px flex space-x-6 overflow-x-auto">
            {diningAreas.map((area) => (
              <button
                key={area.id}
                onClick={() => setActiveAreaId(area.id)}
                className={`flex items-center space-x-2 border-b-2 py-3 px-1 text-sm font-semibold transition shrink-0 ${
                  activeAreaId === area.id
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                <span>{area.name}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {tables.filter((t) => t.diningAreaId === area.id).length}
                </span>
                {area.assignedServerName && (
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-2xs font-bold text-indigo-700 border border-indigo-200">
                    {area.assignedServerName.split(" ")[0]}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {activeArea && (
            <div className="mb-2 sm:mb-0 flex items-center space-x-2 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-1.5 text-xs">
              <UserCheck className="h-4 w-4 text-indigo-600 shrink-0" />
              <span className="font-semibold text-gray-700 whitespace-nowrap">
                Section Server:
              </span>
              <select
                value={activeArea.assignedServerId || ""}
                onChange={(e) =>
                  handleAssignSectionServer(
                    activeArea.id,
                    e.target.value || null,
                  )
                }
                disabled={isSubmitting}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-800 shadow-2xs focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Unassigned</option>
                {staffMembers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName} ({s.role})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Main Floor Plan Canvas */}
      {diningAreas.length === 0 ? (
        /* Empty State */
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-xs">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <Grid3X3 className="h-8 w-8" />
          </div>
          <h3 className="mt-4 text-lg font-bold text-gray-900">
            No Floor Plan Configured
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            Configure dining rooms, seating zones, and tables to start seating
            guests, tracking dining durations, and routing orders.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => setShowAreaModal(true)}
              className="flex items-center space-x-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" />
              <span>Create Dining Area</span>
            </button>
            <button
              onClick={handleGenerateStarterFloorPlan}
              disabled={isSubmitting}
              className="flex items-center space-x-2 rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4 text-indigo-600" />
              <span>⚡ Generate Starter Floor Plan</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="relative">
          {designerMode && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-800 border border-amber-300">
              <div className="flex items-center space-x-2">
                <Move className="h-4 w-4 text-amber-600" />
                <span>
                  Designer Mode Active: Drag tables to reposition on the floor
                  canvas. Click Save Layout when finished.
                </span>
              </div>
            </div>
          )}

          {/* Interactive 2D Canvas */}
          <div
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className="relative h-[550px] w-full select-none overflow-hidden rounded-2xl border border-gray-300 bg-slate-900/5 shadow-inner"
            style={{
              backgroundImage:
                "radial-gradient(circle, #cbd5e1 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          >
            {areaTables.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <p className="text-sm font-semibold text-gray-500">
                  No tables placed in this dining section yet.
                </p>
                <button
                  onClick={() => setShowTableModal(true)}
                  className="mt-3 flex items-center space-x-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add First Table</span>
                </button>
              </div>
            ) : (
              areaTables.map((table) => {
                const config = getStatusConfig(table.status);
                const isRound =
                  table.shape === "ROUND" || table.shape === "BAR_STOOL";

                return (
                  <div
                    key={table.id}
                    onMouseDown={(e) => handleMouseDown(e, table)}
                    onClick={() => {
                      if (!designerMode) {
                        setSelectedTable(table);
                        const area = diningAreas.find(
                          (a) => a.id === table.diningAreaId,
                        );
                        setSeatServerUserId(
                          table.assignedServerId ||
                            area?.assignedServerId ||
                            "",
                        );
                        setSeatGuestCount(table.minCovers || 2);
                      }
                    }}
                    style={{
                      left: `${table.posX}px`,
                      top: `${table.posY}px`,
                      width: `${table.width}px`,
                      height: `${table.height}px`,
                      transform: `rotate(${table.rotation}deg)`,
                    }}
                    className={`absolute flex cursor-pointer flex-col items-center justify-center border-2 transition-shadow shadow-md hover:shadow-lg ${
                      config.border
                    } ${config.bg} ${
                      isRound
                        ? "rounded-full"
                        : table.shape === "BOOTH"
                          ? "rounded-2xl border-t-8"
                          : "rounded-xl"
                    } ${designerMode ? "cursor-move ring-2 ring-amber-400 ring-offset-1" : ""}`}
                  >
                    {/* Table Number & Status Pill */}
                    <div className="flex flex-col items-center text-center">
                      <span className="text-base font-extrabold tracking-tight text-gray-900">
                        {table.tableNumber}
                      </span>
                      <span
                        className={`mt-0.5 rounded-full px-1.5 py-0.2 text-2xs font-extrabold uppercase ${config.badge}`}
                      >
                        {config.label}
                      </span>
                    </div>

                    {/* Active Party Info or Assigned Server */}
                    {table.activeSession ? (
                      <div className="mt-1 flex items-center space-x-1 text-2xs font-semibold text-indigo-900">
                        <Users className="h-3 w-3" />
                        <span>{table.activeSession.guestCount}p</span>
                        {table.activeSession.serverName && (
                          <span className="truncate max-w-[60px] text-gray-600">
                            • {table.activeSession.serverName.split(" ")[0]}
                          </span>
                        )}
                      </div>
                    ) : table.assignedServerName ? (
                      <div className="mt-1 flex items-center space-x-1 text-2xs font-medium text-indigo-700">
                        <User className="h-3 w-3 shrink-0" />
                        <span className="truncate max-w-[65px]">
                          {table.assignedServerName.split(" ")[0]}
                        </span>
                      </div>
                    ) : (
                      <span className="mt-1 text-2xs font-medium text-gray-400">
                        {table.minCovers}-{table.maxCovers}p
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* MODAL: TABLE ACTIONS & SEATING */}
      {selectedTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">
                  Table {selectedTable.tableNumber}
                </h3>
                <p className="text-xs text-gray-500">
                  Capacity: {selectedTable.minCovers} -{" "}
                  {selectedTable.maxCovers} guests • Shape:{" "}
                  {selectedTable.shape}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  getStatusConfig(selectedTable.status).badge
                }`}
              >
                {getStatusConfig(selectedTable.status).label}
              </span>
            </div>

            {/* TABLE SERVER ASSIGNMENT CONTROL */}
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50/70 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <UserCheck className="h-4 w-4 text-indigo-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                    Dedicated Server
                  </span>
                </div>
                {selectedTable.assignedServerName && (
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-2xs font-bold text-indigo-700 border border-indigo-200">
                    {selectedTable.assignedServerName}
                  </span>
                )}
              </div>
              <select
                value={selectedTable.assignedServerId || ""}
                onChange={(e) =>
                  handleAssignTableServer(
                    selectedTable.id,
                    e.target.value || null,
                  )
                }
                disabled={isSubmitting}
                className="w-full rounded-lg border border-gray-300 bg-white p-2 text-xs font-medium text-gray-800 shadow-2xs focus:border-indigo-500 focus:outline-none"
              >
                <option value="">
                  {diningAreas.find((a) => a.id === selectedTable.diningAreaId)
                    ?.assignedServerName
                    ? `Inherit from Section (${diningAreas.find((a) => a.id === selectedTable.diningAreaId)?.assignedServerName})`
                    : "Unassigned (No dedicated server)"}
                </option>
                {staffMembers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName} ({s.role})
                  </option>
                ))}
              </select>
            </div>

            {/* SEATING FORM (When Available) */}
            {selectedTable.status === "AVAILABLE" && (
              <form onSubmit={handleSeatParty} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                    Guest Party Size
                  </label>
                  <div className="mt-1.5 flex items-center space-x-3">
                    <input
                      type="number"
                      required
                      min={1}
                      max={selectedTable.maxCovers + 4}
                      value={seatGuestCount}
                      onChange={(e) =>
                        setSeatGuestCount(parseInt(e.target.value, 10) || 1)
                      }
                      className="w-24 rounded-lg border border-gray-300 p-2 text-center text-lg font-bold focus:border-indigo-500 focus:outline-none"
                    />
                    <span className="text-xs text-gray-500">
                      Recommended: {selectedTable.minCovers}–
                      {selectedTable.maxCovers} covers
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
                    Assigned Server for Party
                  </label>
                  <select
                    value={seatServerUserId}
                    onChange={(e) => setSeatServerUserId(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-gray-300 p-2 text-xs font-medium focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="">
                      Default (Assigned Server or Current User)
                    </option>
                    {staffMembers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.firstName} {s.lastName} ({s.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex w-full items-center justify-center space-x-2 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-md hover:bg-indigo-500 disabled:opacity-50"
                  >
                    <Users className="h-4 w-4" />
                    <span>
                      {isSubmitting ? "Seating..." : "Seat Party Now"}
                    </span>
                  </button>
                </div>
              </form>
            )}

            {/* ACTIVE SESSION DETAILS & TRANSITIONS */}
            {selectedTable.activeSession && (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-600">Guests:</span>
                    <span className="font-bold text-indigo-950">
                      {selectedTable.activeSession.guestCount} guests
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-600">
                      Seated At:
                    </span>
                    <span className="font-bold text-indigo-950">
                      {new Date(
                        selectedTable.activeSession.seatedAt,
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {selectedTable.activeSession.serverName && (
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-600">
                        Server:
                      </span>
                      <span className="font-bold text-indigo-950">
                        {selectedTable.activeSession.serverName}
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-2 pt-1">
                  <p className="text-2xs font-bold uppercase tracking-wider text-gray-400">
                    Update Dining Stage
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() =>
                        handleUpdateStatus(selectedTable.id, "ORDERED")
                      }
                      disabled={isSubmitting}
                      className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
                    >
                      Mark Ordered
                    </button>
                    <button
                      onClick={() =>
                        handleUpdateStatus(selectedTable.id, "SERVED")
                      }
                      disabled={isSubmitting}
                      className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-800 hover:bg-orange-100"
                    >
                      Mark Served
                    </button>
                    <button
                      onClick={() =>
                        handleUpdateStatus(selectedTable.id, "PAYMENT_PENDING")
                      }
                      disabled={isSubmitting}
                      className="rounded-lg border border-purple-300 bg-purple-50 px-3 py-2 text-xs font-bold text-purple-800 hover:bg-purple-100"
                    >
                      Drop Check
                    </button>
                    <button
                      onClick={() => setShowTransferModal(true)}
                      className="flex items-center justify-center space-x-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
                    >
                      <ArrowRightLeft className="h-3 w-3" />
                      <span>Transfer Table</span>
                    </button>
                  </div>

                  <button
                    onClick={() =>
                      handleUpdateStatus(selectedTable.id, "DIRTY")
                    }
                    disabled={isSubmitting}
                    className="mt-2 w-full rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-rose-700 disabled:opacity-50"
                  >
                    Close Check & Bus Table (Mark Dirty)
                  </button>
                </div>
              </div>
            )}

            {/* DIRTY STATE RECOVERY */}
            {selectedTable.status === "DIRTY" && (
              <div className="mt-5 space-y-4">
                <p className="text-xs text-gray-500">
                  This table has been cleared and is ready to be sanitized and
                  reset.
                </p>
                <button
                  onClick={() =>
                    handleUpdateStatus(selectedTable.id, "AVAILABLE")
                  }
                  disabled={isSubmitting}
                  className="flex w-full items-center justify-center space-x-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-md hover:bg-emerald-500"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Sanitized & Ready (Set Available)</span>
                </button>
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedTable(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: TRANSFER TABLE */}
      {showTransferModal && selectedTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900">Transfer Party</h3>
            <p className="mt-1 text-xs text-gray-500">
              Move guests from Table {selectedTable.tableNumber} to an available
              table.
            </p>

            <form onSubmit={handleTransferTable} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700">
                  Target Table
                </label>
                <select
                  required
                  value={transferTargetTableId}
                  onChange={(e) => setTransferTargetTableId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">Select available table...</option>
                  {tables
                    .filter(
                      (t) =>
                        t.id !== selectedTable.id && t.status === "AVAILABLE",
                    )
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        Table {t.tableNumber} ({t.minCovers}-{t.maxCovers}p •{" "}
                        {t.shape})
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !transferTargetTableId}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {isSubmitting ? "Transferring..." : "Confirm Move"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE DINING AREA */}
      {showAreaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900">
              New Dining Section
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              e.g. Main Dining Room, Outdoor Patio, Mezzanine, Bar Lounge
            </p>
            <form onSubmit={handleCreateArea} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Section Name
                </label>
                <input
                  type="text"
                  required
                  value={newAreaName}
                  onChange={(e) => setNewAreaName(e.target.value)}
                  placeholder="e.g. Patio Terrace"
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Assign Section Server (Optional)
                </label>
                <select
                  value={newAreaServerId}
                  onChange={(e) => setNewAreaServerId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">No server assigned</option>
                  {staffMembers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} ({s.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowAreaModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newAreaName.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {isSubmitting ? "Creating..." : "Save Section"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE TABLE */}
      {showTableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900">Add Table</h3>
            <p className="mt-1 text-xs text-gray-500">
              Place a new physical table in{" "}
              {diningAreas.find((a) => a.id === activeAreaId)?.name}
            </p>
            <form onSubmit={handleCreateTable} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Table Number / Label
                </label>
                <input
                  type="text"
                  required
                  value={newTableNumber}
                  onChange={(e) => setNewTableNumber(e.target.value)}
                  placeholder="e.g. T1, P4, BAR-02"
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm uppercase focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Table Shape
                </label>
                <select
                  value={newTableShape}
                  onChange={(e) =>
                    setNewTableShape(e.target.value as TableShape)
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="RECTANGLE">Rectangle (Standard)</option>
                  <option value="ROUND">Round Table</option>
                  <option value="SQUARE">Square 2-Top</option>
                  <option value="BOOTH">Booth</option>
                  <option value="BAR_STOOL">Bar Stool / High Top</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700">
                    Min Covers
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={newMinCovers}
                    onChange={(e) =>
                      setNewMinCovers(parseInt(e.target.value, 10) || 1)
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700">
                    Max Covers
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={newMaxCovers}
                    onChange={(e) =>
                      setNewMaxCovers(parseInt(e.target.value, 10) || 1)
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Assign Dedicated Server (Optional)
                </label>
                <select
                  value={newTableServerId}
                  onChange={(e) => setNewTableServerId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">Inherit from section / unassigned</option>
                  {staffMembers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} ({s.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowTableModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newTableNumber.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {isSubmitting ? "Adding..." : "Place Table"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
