import { useState, useEffect, useMemo, useCallback } from "react";
import { apiClient } from "../lib/api-client";
import { useAuthStore } from "../stores/authStore";
import { useOrderSocket } from "../lib/socket";
import type {
  DiningAreaDto,
  TableDto,
  MenuDto,
  MenuItemDto,
  ModifierGroupDto,
  OrderDto,
} from "@apollo/shared-types";
import {
  Utensils,
  Search,
  Plus,
  Minus,
  Trash2,
  Send,
  AlertCircle,
  CheckCircle2,
  User,
  Sparkles,
  ShoppingBag,
  RotateCcw,
} from "lucide-react";

export function PosPage() {
  const { currentOrgId } = useAuthStore();

  // Floor & Tables state
  const [locationId, setLocationId] = useState<string>("");
  const [diningAreas, setDiningAreas] = useState<DiningAreaDto[]>([]);
  const [tables, setTables] = useState<TableDto[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string>("all");
  const [selectedTable, setSelectedTable] = useState<TableDto | null>(null);

  // Menu state
  const [menus, setMenus] = useState<MenuDto[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemDto[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Order state
  const [currentOrder, setCurrentOrder] = useState<OrderDto | null>(null);
  const [guestCount, setGuestCount] = useState<number>(1);
  const [orderNotes, setOrderNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Modifier Modal state
  const [customizingItem, setCustomizingItem] = useState<MenuItemDto | null>(null);
  const [selectedModifierOptions, setSelectedModifierOptions] = useState<
    { modifierGroupId: string; modifierOptionId: string }[]
  >([]);
  const [modalSpecialInstructions, setModalSpecialInstructions] = useState<string>("");
  const [modalQuantity, setModalQuantity] = useState<number>(1);
  const [modalValidationError, setModalValidationError] = useState<string | null>(null);

  // View state: 'tables' or 'menu'
  const [activeTab, setActiveTab] = useState<"tables" | "menu">("tables");

  // Load floor plan and tables
  const loadFloorPlan = useCallback(async () => {
    if (!currentOrgId) return;
    try {
      const res = await apiClient.get<{
        locationId: string;
        diningAreas: DiningAreaDto[];
        tables: TableDto[];
      }>("/api/v1/foh/locations/default/floor-plan");

      if (res) {
        setLocationId(res.locationId);
        setDiningAreas(res.diningAreas || []);
        setTables(res.tables || []);
      }
    } catch (err: any) {
      console.error("Failed to load floor plan:", err);
    }
  }, [currentOrgId]);

  // Flatten modifier groups from join-table shape to ModifierGroupDto[].
  // The API returns: modifierGroups: [{ id: joinId, modifierGroup: { id, name, ... options } }]
  // The UI expects:  modifierGroups: [{ id, name, isRequired, minSelections, maxSelections, options }]
  const normalizeMenuItems = useCallback((items: any[]): MenuItemDto[] => {
    return items.map((item) => {
      if (!item.modifierGroups || item.modifierGroups.length === 0) return item;

      const firstGroup = item.modifierGroups[0];
      // Already flattened — has a `name` property directly on the group object
      if (typeof firstGroup.name === "string") return item;

      // Join-table shape: each entry has a nested `modifierGroup` object
      const flattenedGroups: ModifierGroupDto[] = item.modifierGroups
        .filter((jt: any) => jt.modifierGroup)
        .map((jt: any) => ({
          id: jt.modifierGroup.id,
          organizationId: jt.modifierGroup.organizationId ?? item.organizationId,
          name: jt.modifierGroup.name,
          minSelections: jt.modifierGroup.minSelections ?? 0,
          maxSelections: jt.modifierGroup.maxSelections ?? 1,
          isRequired: jt.modifierGroup.isRequired ?? false,
          options: (jt.modifierGroup.options || []).map((opt: any) => ({
            id: opt.id,
            organizationId: opt.organizationId ?? item.organizationId,
            modifierGroupId: opt.modifierGroupId ?? jt.modifierGroup.id,
            name: opt.name,
            priceDeltaCents: opt.priceDeltaCents ?? 0,
            isAvailable: opt.isAvailable ?? true,
            isDefault: opt.isDefault ?? false,
            createdAt: opt.createdAt ?? "",
            updatedAt: opt.updatedAt ?? "",
          })),
          createdAt: jt.modifierGroup.createdAt ?? "",
          updatedAt: jt.modifierGroup.updatedAt ?? "",
        }));

      return { ...item, modifierGroups: flattenedGroups };
    });
  }, []);

  // Load menu catalog
  const loadMenu = useCallback(async () => {
    if (!currentOrgId) return;
    try {
      const [menusRes, itemsRes] = await Promise.allSettled([
        apiClient.get<MenuDto[]>("/api/v1/menu/menus"),
        apiClient.get<any[]>("/api/v1/menu/items"),
      ]);

      if (menusRes.status === "fulfilled" && Array.isArray(menusRes.value)) {
        setMenus(menusRes.value);
      }
      if (itemsRes.status === "fulfilled" && Array.isArray(itemsRes.value)) {
        setMenuItems(normalizeMenuItems(itemsRes.value));
      }
    } catch (err: any) {
      console.error("Failed to load menu catalog:", err);
    }
  }, [currentOrgId, normalizeMenuItems]);

  // Check for active draft order on table selection
  const checkActiveOrderForTable = useCallback(
    async (tableId: string, locId: string) => {
      try {
        const orders = await apiClient.get<OrderDto[]>(
          `/api/v1/orders?locationId=${locId}&tableId=${tableId}&status=DRAFT`,
        );
        if (orders && orders.length > 0 && orders[0]) {
          const firstOrder = orders[0];
          setCurrentOrder(firstOrder);
          setGuestCount(firstOrder.guestCount || 1);
          setOrderNotes(firstOrder.notes || "");
        } else {
          setCurrentOrder(null);
          setOrderNotes("");
        }
      } catch (err) {
        console.error("Error fetching table order:", err);
        setCurrentOrder(null);
      }
    },
    [],
  );

  useEffect(() => {
    loadFloorPlan();
    loadMenu();
  }, [loadFloorPlan, loadMenu]);

  // Subscribe to real-time order and table socket updates
  useOrderSocket(locationId, {
    onOrderSubmitted: (order) => {
      if (order.tableId === selectedTable?.id) {
        setCurrentOrder(null);
      }
      loadFloorPlan();
    },
    onOrderStatusChanged: () => {
      loadFloorPlan();
    },
    onOrderCreated: (order) => {
      if (selectedTable && order.tableId === selectedTable.id) {
        setCurrentOrder(order);
      }
    },
    onOrderUpdated: (order) => {
      if (currentOrder && order.id === currentOrder.id) {
        setCurrentOrder(order);
      }
    },
  });

  // Extract all categories across menus
  const allCategories = useMemo(() => {
    const cats: { id: string; name: string }[] = [];
    menus.forEach((m) => {
      (m.categories || []).forEach((c) => {
        if (!cats.some((existing) => existing.id === c.id)) {
          cats.push({ id: c.id, name: c.name });
        }
      });
    });
    return cats;
  }, [menus]);

  // Filter menu items by category and search
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesCategory =
        selectedCategoryId === "all" || item.categoryId === selectedCategoryId;
      const matchesSearch =
        !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [menuItems, selectedCategoryId, searchQuery]);

  // Filter tables by dining area
  const filteredTables = useMemo(() => {
    if (selectedAreaId === "all") return tables;
    return tables.filter((t) => t.diningAreaId === selectedAreaId);
  }, [tables, selectedAreaId]);

  // Select Table handler
  const handleSelectTable = (table: TableDto) => {
    setSelectedTable(table);
    setActiveTab("menu");
    setStatusMessage(null);
    if (locationId) {
      checkActiveOrderForTable(table.id, locationId);
    }
  };

  // Helper to ensure draft order exists before adding items
  const ensureDraftOrder = async (): Promise<OrderDto> => {
    if (currentOrder) return currentOrder;
    if (!locationId) throw new Error("Location ID not available");

    const newOrder = await apiClient.post<OrderDto>("/api/v1/orders", {
      locationId,
      tableId: selectedTable?.id,
      guestCount,
      notes: orderNotes || undefined,
    });
    setCurrentOrder(newOrder);
    return newOrder;
  };

  // Add Item Click handler: check if modifiers exist
  const handleItemClick = (item: MenuItemDto) => {
    if (!item.isAvailable) return;

    if (item.modifierGroups && item.modifierGroups.length > 0) {
      // Open Modifier modal
      setCustomizingItem(item);
      setSelectedModifierOptions([]);
      setModalSpecialInstructions("");
      setModalQuantity(1);
      setModalValidationError(null);
    } else {
      // Add directly
      addItemToCart(item.id, 1, [], "");
    }
  };

  // Add Item to Order API call
  const addItemToCart = async (
    menuItemId: string,
    quantity: number,
    selectedModifiers: { modifierGroupId: string; modifierOptionId: string }[],
    specialInstructions: string,
  ) => {
    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      const order = await ensureDraftOrder();
      const updatedOrder = await apiClient.post<OrderDto>(
        `/api/v1/orders/${order.id}/items`,
        {
          menuItemId,
          quantity,
          specialInstructions: specialInstructions.trim() || undefined,
          selectedModifiers,
        },
      );
      setCurrentOrder(updatedOrder);
      setCustomizingItem(null);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Failed to add item to order" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update item quantity in cart
  const handleUpdateItemQuantity = async (itemId: string, newQty: number) => {
    if (!currentOrder) return;
    if (newQty <= 0) {
      handleRemoveItem(itemId);
      return;
    }
    try {
      const updated = await apiClient.patch<OrderDto>(
        `/api/v1/orders/${currentOrder.id}/items/${itemId}`,
        { quantity: newQty },
      );
      setCurrentOrder(updated);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Failed to update quantity" });
    }
  };

  // Remove line item from cart
  const handleRemoveItem = async (itemId: string) => {
    if (!currentOrder) return;
    try {
      const updated = await apiClient.delete<OrderDto>(
        `/api/v1/orders/${currentOrder.id}/items/${itemId}`,
      );
      setCurrentOrder(updated);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Failed to remove item" });
    }
  };

  // Submit Order to Kitchen with idempotency
  const handleSubmitOrder = async () => {
    if (!currentOrder || currentOrder.items.length === 0) {
      setStatusMessage({ type: "error", text: "Cannot submit empty order" });
      return;
    }
    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const idempotencyKey = `idem_${currentOrder.id}_${Date.now()}`;
      const submitted = await apiClient.post<OrderDto>(
        `/api/v1/orders/${currentOrder.id}/submit`,
        { idempotencyKey },
      );

      setStatusMessage({
        type: "success",
        text: `Order ${submitted.orderNumber} successfully sent to kitchen!`,
      });
      setCurrentOrder(null);
      setSelectedTable(null);
      setActiveTab("tables");
      loadFloorPlan();
    } catch (err: any) {
      setStatusMessage({ type: "error", text: err.message || "Failed to submit order to kitchen" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Discard draft order
  const handleDiscardDraft = async () => {
    if (!currentOrder) return;
    if (window.confirm("Are you sure you want to discard this draft order?")) {
      try {
        await apiClient.post(`/api/v1/orders/${currentOrder.id}/cancel`, {
          reason: "Discarded by server",
        });
        setCurrentOrder(null);
        setStatusMessage({ type: "success", text: "Draft order discarded." });
      } catch (err: any) {
        setStatusMessage({ type: "error", text: err.message || "Failed to discard draft" });
      }
    }
  };

  // Toggle modifier option selection in modal
  const handleToggleModifier = (group: ModifierGroupDto, optionId: string) => {
    const isSingle = group.maxSelections === 1;

    setSelectedModifierOptions((prev) => {
      const existingInGroup = prev.filter((s) => s.modifierGroupId === group.id);
      const isAlreadySelected = existingInGroup.some((s) => s.modifierOptionId === optionId);

      if (isSingle) {
        // Replace selection in this group
        const withoutGroup = prev.filter((s) => s.modifierGroupId !== group.id);
        return [...withoutGroup, { modifierGroupId: group.id, modifierOptionId: optionId }];
      } else {
        if (isAlreadySelected) {
          return prev.filter(
            (s) => !(s.modifierGroupId === group.id && s.modifierOptionId === optionId),
          );
        } else {
          if (existingInGroup.length >= group.maxSelections) {
            return prev; // Reached limit
          }
          return [...prev, { modifierGroupId: group.id, modifierOptionId: optionId }];
        }
      }
    });
  };

  // Validate modifier selections in modal
  const validateAndSubmitModal = () => {
    if (!customizingItem) return;

    for (const group of customizingItem.modifierGroups || []) {
      const selections = selectedModifierOptions.filter(
        (s) => s.modifierGroupId === group.id,
      );
      if (group.isRequired && selections.length === 0) {
        setModalValidationError(`"${group.name}" is required. Please make a selection.`);
        return;
      }
      if (group.minSelections > 0 && selections.length < group.minSelections) {
        setModalValidationError(
          `"${group.name}" requires at least ${group.minSelections} selection(s).`,
        );
        return;
      }
      if (group.maxSelections > 0 && selections.length > group.maxSelections) {
        setModalValidationError(
          `"${group.name}" allows at most ${group.maxSelections} selection(s).`,
        );
        return;
      }
    }

    setModalValidationError(null);
    addItemToCart(
      customizingItem.id,
      modalQuantity,
      selectedModifierOptions,
      modalSpecialInstructions,
    );
  };

  // Compute live price delta in modal
  const modalTotalPriceCents = useMemo(() => {
    if (!customizingItem) return 0;
    let delta = 0;
    for (const sel of selectedModifierOptions) {
      for (const grp of customizingItem.modifierGroups || []) {
        if (grp.id === sel.modifierGroupId) {
          const opt = grp.options.find((o) => o.id === sel.modifierOptionId);
          if (opt) delta += opt.priceDeltaCents;
        }
      }
    }
    return (customizingItem.basePriceCents + delta) * modalQuantity;
  }, [customizingItem, selectedModifierOptions, modalQuantity]);

  // Currency formatter
  const formatCurrency = (cents: number, curr = "USD") => {
    const symbol = curr === "INR" ? "₹" : "$";
    return `${symbol}${(cents / 100).toFixed(2)}`;
  };

  return (
    <div className="flex h-[calc(100vh-60px)] flex-col bg-gray-100 lg:flex-row">
      {/* ─── LEFT / MAIN CONTENT: Table Selection & Menu Catalog ─────────── */}
      <div className="flex flex-1 flex-col overflow-hidden border-r border-gray-200 bg-white">
        {/* Top Controls Bar */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2.5">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab("tables")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === "tables"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              Floor Plan & Tables
            </button>
            <button
              onClick={() => setActiveTab("menu")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === "menu"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              Menu Items
            </button>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            {selectedTable ? (
              <div className="flex items-center space-x-1.5 rounded-md bg-indigo-50 px-2.5 py-1 text-indigo-700 font-medium">
                <span>Selected: Table {selectedTable.tableNumber}</span>
                {selectedTable.assignedServerName && (
                  <span className="text-indigo-500">({selectedTable.assignedServerName})</span>
                )}
                <button
                  onClick={() => setSelectedTable(null)}
                  className="ml-1 text-indigo-400 hover:text-indigo-600"
                  title="Deselect table"
                >
                  ×
                </button>
              </div>
            ) : (
              <span className="text-gray-500 italic">No table selected (Walk-in / Bar)</span>
            )}
          </div>
        </div>

        {/* Status Alert Banner */}
        {statusMessage && (
          <div
            className={`flex items-center justify-between px-4 py-2 text-xs font-medium ${
              statusMessage.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-b border-emerald-200"
                : "bg-rose-50 text-rose-800 border-b border-rose-200"
            }`}
          >
            <div className="flex items-center space-x-2">
              {statusMessage.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
        )}

        {/* Tab 1: Tables & Floor View */}
        {activeTab === "tables" && (
          <div className="flex flex-1 flex-col overflow-y-auto p-4">
            {/* Dining Area Filter Tabs */}
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setSelectedAreaId("all")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  selectedAreaId === "all"
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                All Sections
              </button>
              {diningAreas.map((area) => (
                <button
                  key={area.id}
                  onClick={() => setSelectedAreaId(area.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    selectedAreaId === area.id
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {area.name}
                </button>
              ))}
            </div>

            {/* Tables Grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {filteredTables.map((table) => {
                const isSelected = selectedTable?.id === table.id;
                const statusColors = {
                  AVAILABLE: "border-emerald-300 bg-emerald-50/40 text-emerald-800",
                  SEATED: "border-amber-300 bg-amber-50/50 text-amber-900",
                  ORDERED: "border-indigo-300 bg-indigo-50/50 text-indigo-900",
                  SERVED: "border-purple-300 bg-purple-50/50 text-purple-900",
                  PAYMENT_PENDING: "border-sky-300 bg-sky-50/50 text-sky-900",
                  DIRTY: "border-gray-300 bg-gray-100 text-gray-600",
                  RESERVED: "border-blue-300 bg-blue-50/50 text-blue-900",
                  BLOCKED: "border-rose-300 bg-rose-50/50 text-rose-900",
                };

                return (
                  <button
                    key={table.id}
                    onClick={() => handleSelectTable(table)}
                    className={`flex flex-col justify-between rounded-xl border-2 p-3 text-left transition hover:shadow-md ${
                      isSelected
                        ? "border-indigo-600 bg-indigo-50/80 shadow-sm ring-2 ring-indigo-400"
                        : statusColors[table.status as keyof typeof statusColors] ||
                          "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base font-bold text-gray-900">
                        {table.tableNumber}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
                          table.status === "AVAILABLE"
                            ? "bg-emerald-100 text-emerald-800"
                            : table.status === "SEATED"
                            ? "bg-amber-100 text-amber-800"
                            : table.status === "ORDERED"
                            ? "bg-indigo-100 text-indigo-800"
                            : table.status === "SERVED"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {table.status}
                      </span>
                    </div>

                    <div className="mt-3 space-y-1 text-xs text-gray-600">
                      <div className="flex items-center space-x-1">
                        <User className="h-3 w-3 text-gray-400" />
                        <span>{table.maxCovers} covers</span>
                      </div>
                      {table.assignedServerName && (
                        <div className="truncate text-[11px] font-medium text-gray-700">
                          Server: {table.assignedServerName}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Menu Selection View */}
        {activeTab === "menu" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Search & Categories Bar */}
            <div className="border-b border-gray-200 bg-white p-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search items by name or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 py-1.5 pl-9 pr-4 text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Categories Pills */}
              <div className="flex items-center space-x-1.5 overflow-x-auto pb-1">
                <button
                  onClick={() => setSelectedCategoryId("all")}
                  className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition ${
                    selectedCategoryId === "all"
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  All Items ({menuItems.length})
                </button>
                {allCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition ${
                      selectedCategoryId === cat.id
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Menu Items Grid */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {filteredMenuItems.map((item) => {
                  const hasModifiers = item.modifierGroups && item.modifierGroups.length > 0;

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      className={`group relative flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-3.5 shadow-xs transition hover:border-indigo-400 hover:shadow-md cursor-pointer ${
                        !item.isAvailable ? "opacity-60 bg-gray-50 cursor-not-allowed" : ""
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between">
                          <h4 className="text-xs font-bold text-gray-900 group-hover:text-indigo-600">
                            {item.name}
                          </h4>
                          <span className="font-semibold text-xs text-indigo-600">
                            {formatCurrency(item.basePriceCents)}
                          </span>
                        </div>

                        {item.description && (
                          <p className="mt-1 line-clamp-2 text-[11px] text-gray-500">
                            {item.description}
                          </p>
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-between pt-2 border-t border-gray-100 text-[10px]">
                        <div className="flex items-center space-x-1">
                          {hasModifiers && (
                            <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-700 flex items-center space-x-0.5">
                              <Sparkles className="h-2.5 w-2.5" />
                              <span>Customizable</span>
                            </span>
                          )}
                          {!item.isAvailable && (
                            <span className="rounded bg-rose-100 px-1.5 py-0.5 font-bold text-rose-700">
                              86'd
                            </span>
                          )}
                        </div>

                        <button
                          disabled={!item.isAvailable}
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 transition group-hover:bg-indigo-600 group-hover:text-white"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── RIGHT SECTION: Current Order Cart & Summary ──────────────────── */}
      <div className="flex w-full flex-col border-t border-gray-200 bg-white lg:w-96 lg:border-t-0">
        {/* Cart Header */}
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ShoppingBag className="h-4 w-4 text-indigo-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900">
                Current Order
              </h3>
            </div>
            {currentOrder && (
              <span className="rounded bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-800">
                {currentOrder.orderNumber}
              </span>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
            <span>
              {selectedTable ? `Table ${selectedTable.tableNumber}` : "Quick / Bar Order"}
            </span>
            <div className="flex items-center space-x-1">
              <span>Guests:</span>
              <button
                onClick={() => setGuestCount((g) => Math.max(1, g - 1))}
                className="h-5 w-5 rounded bg-gray-200 text-center font-bold text-gray-700 hover:bg-gray-300"
              >
                -
              </button>
              <span className="w-4 text-center font-semibold text-gray-800">{guestCount}</span>
              <button
                onClick={() => setGuestCount((g) => g + 1)}
                className="h-5 w-5 rounded bg-gray-200 text-center font-bold text-gray-700 hover:bg-gray-300"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Cart Line Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {(!currentOrder || currentOrder.items.length === 0) ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-gray-400 py-12">
              <Utensils className="h-8 w-8 stroke-1 text-gray-300 mb-2" />
              <p className="text-xs font-medium">Cart is empty</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Select a table and click items to begin an order
              </p>
            </div>
          ) : (
            currentOrder.items.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-gray-100 bg-gray-50/60 p-2.5 text-xs shadow-2xs space-y-1.5"
              >
                <div className="flex items-start justify-between">
                  <span className="font-semibold text-gray-900">{item.name}</span>
                  <span className="font-bold text-gray-800">
                    {formatCurrency(item.subtotalCents, currentOrder.currency)}
                  </span>
                </div>

                {/* Modifiers List */}
                {item.modifiers && item.modifiers.length > 0 && (
                  <div className="space-y-0.5 pl-2 text-[11px] text-gray-500">
                    {item.modifiers.map((mod) => (
                      <div key={mod.id} className="flex justify-between">
                        <span>
                          • {mod.groupName}: {mod.optionName}
                        </span>
                        {mod.priceDeltaCents > 0 && (
                          <span className="text-indigo-600">
                            +{formatCurrency(mod.priceDeltaCents, currentOrder.currency)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {item.specialInstructions && (
                  <p className="text-[11px] italic text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                    "{item.specialInstructions}"
                  </p>
                )}

                {/* Quantity Controls & Delete */}
                <div className="flex items-center justify-between pt-1 border-t border-gray-200/60">
                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => handleUpdateItemQuantity(item.id, item.quantity - 1)}
                      className="flex h-5 w-5 items-center justify-center rounded bg-white border border-gray-300 text-gray-600 hover:bg-gray-100"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-5 text-center font-bold text-gray-800">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => handleUpdateItemQuantity(item.id, item.quantity + 1)}
                      className="flex h-5 w-5 items-center justify-center rounded bg-white border border-gray-300 text-gray-600 hover:bg-gray-100"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>

                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    className="text-gray-400 hover:text-rose-600"
                    title="Remove item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Order Notes & Calculation Breakdown */}
        <div className="border-t border-gray-200 bg-gray-50 p-4 space-y-3">
          <input
            type="text"
            placeholder="Special order notes / table requests..."
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
            className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:border-indigo-500 focus:outline-none"
          />

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{formatCurrency(currentOrder?.subtotalCents || 0)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Taxes</span>
              <span>{formatCurrency(currentOrder?.taxCents || 0)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-1.5 text-sm font-bold text-gray-900">
              <span>Total Payable</span>
              <span className="text-indigo-600">
                {formatCurrency(currentOrder?.totalCents || 0)}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2 pt-1">
            <button
              onClick={handleDiscardDraft}
              disabled={!currentOrder || isSubmitting}
              className="flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              title="Discard Draft"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={handleSubmitOrder}
              disabled={!currentOrder || currentOrder.items.length === 0 || isSubmitting}
              className="flex flex-1 items-center justify-center space-x-2 rounded-lg bg-indigo-600 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{isSubmitting ? "Sending..." : "Send to Kitchen"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── MODIFIER CUSTOMIZATION MODAL ─────────────────────────────────── */}
      {customizingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-gray-200 p-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900">{customizingItem.name}</h3>
                <p className="text-xs text-indigo-600 font-semibold mt-0.5">
                  Base Price: {formatCurrency(customizingItem.basePriceCents)}
                </p>
              </div>
              <button
                onClick={() => setCustomizingItem(null)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {modalValidationError && (
                <div className="rounded-lg bg-rose-50 p-2.5 text-xs font-medium text-rose-800 border border-rose-200">
                  {modalValidationError}
                </div>
              )}

              {/* Modifier Groups */}
              {(customizingItem.modifierGroups || []).map((group) => {
                const isSingle = group.maxSelections === 1;
                const chosen = selectedModifierOptions.filter(
                  (s) => s.modifierGroupId === group.id,
                );

                return (
                  <div key={group.id} className="rounded-xl border border-gray-200 p-3 bg-gray-50/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-gray-900">{group.name}</span>
                        {group.isRequired ? (
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                            Required
                          </span>
                        ) : (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                            Optional
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-500">
                        {isSingle
                          ? "Select 1"
                          : `Pick ${group.minSelections > 0 ? `min ${group.minSelections}, ` : ""}up to ${group.maxSelections}`}
                      </span>
                    </div>

                    {/* Options list */}
                    <div className="space-y-1.5">
                      {(group.options || []).map((option) => {
                        const isSelected = chosen.some(
                          (s) => s.modifierOptionId === option.id,
                        );

                        return (
                          <label
                            key={option.id}
                            className={`flex items-center justify-between rounded-lg border p-2 text-xs cursor-pointer transition ${
                              isSelected
                                ? "border-indigo-500 bg-indigo-50/70 font-semibold text-indigo-900"
                                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-100"
                            } ${!option.isAvailable ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            <div className="flex items-center space-x-2">
                              <input
                                type={isSingle ? "radio" : "checkbox"}
                                name={`group-${group.id}`}
                                disabled={!option.isAvailable}
                                checked={isSelected}
                                onChange={() => handleToggleModifier(group, option.id)}
                                className="text-indigo-600 focus:ring-indigo-500"
                              />
                              <span>{option.name}</span>
                            </div>

                            <span className="text-[11px] text-gray-500">
                              {option.priceDeltaCents > 0
                                ? `+${formatCurrency(option.priceDeltaCents)}`
                                : "Included"}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Special Instructions Input */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Special Instructions
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Extra spicy, dressing on the side..."
                  value={modalSpecialInstructions}
                  onChange={(e) => setModalSpecialInstructions(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 p-2 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Modal Quantity Selector */}
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-semibold text-gray-700">Quantity</span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setModalQuantity((q) => Math.max(1, q - 1))}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 font-bold"
                  >
                    -
                  </button>
                  <span className="w-6 text-center font-bold text-gray-900 text-sm">
                    {modalQuantity}
                  </span>
                  <button
                    onClick={() => setModalQuantity((q) => q + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 p-4">
              <div>
                <span className="text-[11px] text-gray-500 block">Item Total</span>
                <span className="text-base font-bold text-indigo-600">
                  {formatCurrency(modalTotalPriceCents)}
                </span>
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={() => setCustomizingItem(null)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={validateAndSubmitModal}
                  disabled={isSubmitting}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isSubmitting ? "Adding..." : "Add to Order"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
