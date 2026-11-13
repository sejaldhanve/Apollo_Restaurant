import { useState, useEffect, useMemo, useCallback } from "react";
import { apiClient } from "../lib/api-client";
import { useAuthStore } from "../stores/authStore";
import { useOrderSocket } from "../lib/socket";
import type { OrderDto, OrderStatus, KitchenStationDto } from "@apollo/shared-types";
import {
  ChefHat,
  Clock,
  CheckCircle2,
  Play,
  RotateCcw,
  Flame,
  Filter,
  Check,
} from "lucide-react";

export function KitchenPage() {
  const { currentOrgId } = useAuthStore();
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [stations, setStations] = useState<KitchenStationDto[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>("all");
  const [viewTab, setViewTab] = useState<"active" | "history">("active");
  const [locationId, setLocationId] = useState<string>("");
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Live timer tick every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  // Fetch initial location and kitchen stations
  const loadInitialData = useCallback(async () => {
    if (!currentOrgId) return;
    try {
      const [floorRes, stationsRes] = await Promise.allSettled([
        apiClient.get<{ locationId: string }>("/api/v1/foh/locations/default/floor-plan"),
        apiClient.get<KitchenStationDto[]>("/api/v1/menu/stations"),
      ]);

      if (floorRes.status === "fulfilled" && floorRes.value?.locationId) {
        setLocationId(floorRes.value.locationId);
      }
      if (stationsRes.status === "fulfilled" && Array.isArray(stationsRes.value)) {
        setStations(stationsRes.value);
      }
    } catch (err) {
      console.error("Failed to load initial KDS data:", err);
    }
  }, [currentOrgId]);

  // Load orders from API
  const loadOrders = useCallback(async () => {
    if (!currentOrgId || !locationId) return;
    try {
      setIsLoading(true);
      const res = await apiClient.get<OrderDto[]>(
        `/api/v1/orders?locationId=${locationId}`,
      );
      if (Array.isArray(res)) {
        setOrders(res);
      }
    } catch (err) {
      console.error("Failed to load orders for KDS:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentOrgId, locationId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (locationId) {
      loadOrders();
    }
  }, [locationId, loadOrders]);

  // Subscribe to real-time order events
  useOrderSocket(locationId, {
    onOrderSubmitted: (newOrder) => {
      setOrders((prev) => {
        const exists = prev.some((o) => o.id === newOrder.id);
        if (exists) {
          return prev.map((o) => (o.id === newOrder.id ? newOrder : o));
        }
        return [newOrder, ...prev];
      });
    },
    onOrderUpdated: (updatedOrder) => {
      setOrders((prev) =>
        prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)),
      );
    },
    onOrderStatusChanged: (updatedOrder) => {
      setOrders((prev) =>
        prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)),
      );
    },
    onOrderCancelled: (cancelledOrder) => {
      setOrders((prev) =>
        prev.map((o) => (o.id === cancelledOrder.id ? cancelledOrder : o)),
      );
    },
  });

  // Filter orders by active vs history
  const activeOrders = useMemo(() => {
    return orders
      .filter((o) => ["SUBMITTED", "IN_PREPARATION", "READY"].includes(o.status))
      .sort((a, b) => {
        const timeA = a.submittedAt ? new Date(a.submittedAt).getTime() : new Date(a.createdAt).getTime();
        const timeB = b.submittedAt ? new Date(b.submittedAt).getTime() : new Date(b.createdAt).getTime();
        return timeA - timeB; // FIFO: oldest first
      });
  }, [orders]);

  const historyOrders = useMemo(() => {
    return orders
      .filter((o) => ["SERVED", "CANCELLED"].includes(o.status))
      .slice(0, 20);
  }, [orders]);

  const displayedOrders = viewTab === "active" ? activeOrders : historyOrders;

  // Update order status action
  const handleUpdateOrderStatus = async (orderId: string, status: OrderStatus) => {
    try {
      const updated = await apiClient.patch<OrderDto>(`/api/v1/orders/${orderId}/status`, {
        status,
      });
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    } catch (err: any) {
      alert(err.message || "Failed to update order status");
    }
  };

  // Bump individual line item
  const handleBumpItem = async (orderId: string, itemId: string, currentItemStatus: string) => {
    try {
      const nextStatus = currentItemStatus === "PENDING"
        ? "IN_PREPARATION"
        : currentItemStatus === "IN_PREPARATION"
        ? "READY"
        : "SERVED";

      const updated = await apiClient.patch<OrderDto>(
        `/api/v1/orders/${orderId}/items/${itemId}/status`,
        { status: nextStatus },
      );
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
    } catch (err: any) {
      alert(err.message || "Failed to bump item");
    }
  };

  // Calculate elapsed ticket time in minutes and color code
  const getElapsedInfo = (order: OrderDto) => {
    const timestamp = order.submittedAt ? new Date(order.submittedAt).getTime() : new Date(order.createdAt).getTime();
    const diffMs = currentTime - timestamp;
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffSeconds = Math.floor((diffMs % 60000) / 1000);

    let color = "text-emerald-700 bg-emerald-50 border-emerald-200";
    if (diffMinutes >= 20) {
      color = "text-rose-700 bg-rose-50 border-rose-300 animate-pulse";
    } else if (diffMinutes >= 10) {
      color = "text-amber-700 bg-amber-50 border-amber-300";
    }

    return {
      formatted: `${diffMinutes}m ${diffSeconds < 10 ? `0${diffSeconds}` : diffSeconds}s`,
      color,
    };
  };

  return (
    <div className="flex h-[calc(100vh-60px)] flex-col bg-gray-900 text-gray-100">
      {/* ─── KDS TOP BAR ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between border-b border-gray-800 bg-gray-950 px-6 py-3">
        <div className="flex items-center space-x-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-600 text-white shadow-xs">
            <Flame className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white">
              Kitchen Display System (KDS)
            </h1>
            <div className="flex items-center space-x-2 text-[11px] text-gray-400">
              <span className="flex items-center space-x-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Live Real-time</span>
              </span>
              <span>•</span>
              <span>{activeOrders.length} active tickets</span>
            </div>
          </div>
        </div>

        {/* View Toggle Tabs */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setViewTab("active")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              viewTab === "active"
                ? "bg-orange-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            Active Tickets ({activeOrders.length})
          </button>
          <button
            onClick={() => setViewTab("history")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              viewTab === "history"
                ? "bg-orange-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            Recent History
          </button>
        </div>
      </div>

      {/* ─── STATION FILTER TABS ─────────────────────────────────────────── */}
      <div className="flex items-center space-x-2 border-b border-gray-800 bg-gray-900/80 px-6 py-2 overflow-x-auto">
        <span className="text-[11px] font-semibold text-gray-400 flex items-center space-x-1 mr-2">
          <Filter className="h-3 w-3" />
          <span>Station:</span>
        </span>

        <button
          onClick={() => setSelectedStationId("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition ${
            selectedStationId === "all"
              ? "bg-gray-100 text-gray-900 font-bold"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          All Stations
        </button>

        {stations.map((station) => (
          <button
            key={station.id}
            onClick={() => setSelectedStationId(station.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition ${
              selectedStationId === station.id
                ? "bg-orange-600 text-white font-bold"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            {station.name}
          </button>
        ))}
      </div>

      {/* ─── TICKETS GRID ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && orders.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-gray-500">
            <span>Loading kitchen tickets...</span>
          </div>
        ) : displayedOrders.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center text-gray-500">
            <ChefHat className="h-12 w-12 stroke-1 text-gray-600 mb-2" />
            <p className="text-sm font-medium">All caught up!</p>
            <p className="text-xs text-gray-600 mt-1">No active kitchen orders at this time</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {displayedOrders.map((order) => {
              // Filter items if station is selected
              const visibleItems =
                selectedStationId === "all"
                  ? order.items
                  : order.items.filter(
                      (it) => it.kitchenStationId === selectedStationId,
                    );

              if (selectedStationId !== "all" && visibleItems.length === 0) {
                return null;
              }

              const elapsed = getElapsedInfo(order);

              return (
                <div
                  key={order.id}
                  className={`flex flex-col justify-between rounded-xl border bg-gray-850 shadow-lg transition ${
                    order.status === "READY"
                      ? "border-emerald-500/80 ring-1 ring-emerald-500/50"
                      : order.status === "IN_PREPARATION"
                      ? "border-amber-500/80"
                      : "border-gray-700"
                  }`}
                >
                  {/* Ticket Header */}
                  <div className="border-b border-gray-750 bg-gray-900/90 p-3 rounded-t-xl">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-black tracking-wide text-white">
                        {order.orderNumber}
                      </span>
                      <div
                        className={`flex items-center space-x-1 rounded-md border px-2 py-0.5 text-xs font-bold ${elapsed.color}`}
                      >
                        <Clock className="h-3 w-3" />
                        <span>{elapsed.formatted}</span>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-gray-300">
                      <span className="font-semibold text-orange-400">
                        {order.tableNumber ? `Table ${order.tableNumber}` : "Bar / Takeout"}
                      </span>
                      <span>
                        Server: {order.serverName || "Unassigned"}
                      </span>
                    </div>

                    {order.notes && (
                      <div className="mt-1.5 rounded bg-gray-800 p-1.5 text-[11px] text-amber-300 italic">
                        Note: {order.notes}
                      </div>
                    )}
                  </div>

                  {/* Line Items List */}
                  <div className="flex-1 divide-y divide-gray-800/80 p-3 space-y-2">
                    {visibleItems.map((item) => (
                      <div key={item.id} className="pt-2 first:pt-0">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-2">
                            <span className="rounded bg-gray-750 px-1.5 py-0.5 text-xs font-black text-orange-400">
                              {item.quantity}x
                            </span>
                            <div>
                              <span
                                className={`text-xs font-bold ${
                                  item.status === "READY"
                                    ? "text-emerald-400 line-through"
                                    : item.status === "SERVED"
                                    ? "text-gray-500 line-through"
                                    : "text-gray-100"
                                }`}
                              >
                                {item.name}
                              </span>

                              {/* Modifier Pills */}
                              {item.modifiers && item.modifiers.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {item.modifiers.map((mod) => (
                                    <span
                                      key={mod.id}
                                      className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-300 font-medium"
                                    >
                                      {mod.optionName}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Special Instructions */}
                              {item.specialInstructions && (
                                <p className="mt-1 rounded bg-amber-950/60 border border-amber-800/60 px-1.5 py-0.5 text-[11px] text-amber-200 font-semibold">
                                  ⚠ {item.specialInstructions}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Item bump checkbox button */}
                          <button
                            onClick={() => handleBumpItem(order.id, item.id, item.status)}
                            className={`flex h-6 w-6 items-center justify-center rounded border transition ${
                              item.status === "READY"
                                ? "border-emerald-500 bg-emerald-600/30 text-emerald-400"
                                : item.status === "SERVED"
                                ? "border-gray-600 bg-gray-800 text-gray-500"
                                : "border-gray-600 hover:border-orange-500 text-gray-400"
                            }`}
                            title={`Status: ${item.status}. Click to bump.`}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Ticket Actions Footer */}
                  <div className="border-t border-gray-750 bg-gray-900/60 p-3 rounded-b-xl">
                    <div className="flex items-center space-x-2">
                      {order.status === "SUBMITTED" && (
                        <button
                          onClick={() => handleUpdateOrderStatus(order.id, "IN_PREPARATION")}
                          className="flex flex-1 items-center justify-center space-x-1.5 rounded-lg bg-amber-600 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-500 transition"
                        >
                          <Play className="h-3.5 w-3.5" />
                          <span>Start Prep</span>
                        </button>
                      )}

                      {order.status === "IN_PREPARATION" && (
                        <button
                          onClick={() => handleUpdateOrderStatus(order.id, "READY")}
                          className="flex flex-1 items-center justify-center space-x-1.5 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Mark Ready</span>
                        </button>
                      )}

                      {order.status === "READY" && (
                        <button
                          onClick={() => handleUpdateOrderStatus(order.id, "SERVED")}
                          className="flex flex-1 items-center justify-center space-x-1.5 rounded-lg bg-purple-600 py-2 text-xs font-bold text-white shadow-xs hover:bg-purple-500 transition"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Bump / Serve</span>
                        </button>
                      )}

                      {viewTab === "history" && order.status === "SERVED" && (
                        <button
                          onClick={() => handleUpdateOrderStatus(order.id, "READY")}
                          className="flex flex-1 items-center justify-center space-x-1.5 rounded-lg border border-gray-700 bg-gray-800 py-2 text-xs font-semibold text-gray-300 hover:bg-gray-700 transition"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Recall Ticket</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
