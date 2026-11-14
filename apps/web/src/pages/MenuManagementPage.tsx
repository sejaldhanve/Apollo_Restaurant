import React, { useState, useEffect } from "react";
import { apiClient } from "../lib/api-client";
import { useAuthStore } from "../stores/authStore";
import type {
  MenuDto,
  MenuItemDto,
  KitchenStationDto,
  TaxRateDto,
  ModifierGroupDto,
} from "@apollo/shared-types";
import {
  UtensilsCrossed,
  Flame,
  Receipt,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Tag,
  Clock,
  AlertTriangle,
  RefreshCw,
  BookOpen,
  Sparkles,
  Pencil,
  Trash2,
  Layers,
} from "lucide-react";

export function MenuManagementPage() {
  const { currentOrgId } = useAuthStore();
  const [activeTab, setActiveTab] = useState<
    "catalog" | "stockboard" | "modifiers" | "stations" | "taxes"
  >("catalog");

  // Domain data
  const [menus, setMenus] = useState<MenuDto[]>([]);
  const [items, setItems] = useState<MenuItemDto[]>([]);
  const [stations, setStations] = useState<KitchenStationDto[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRateDto[]>([]);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroupDto[]>([]);

  // Selection & Filters
  const [selectedMenuId, setSelectedMenuId] = useState<string>("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showStationModal, setShowStationModal] = useState(false);
  const [showTaxModal, setShowTaxModal] = useState(false);
  const [showModifierModal, setShowModifierModal] = useState(false);

  // Form states - Menu Item (Create / Edit)
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [newItemSku, setNewItemSku] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("14.99");
  const [newItemPrepTime, setNewItemPrepTime] = useState("15");
  const [newItemCategoryId, setNewItemCategoryId] = useState("");
  const [newItemStationId, setNewItemStationId] = useState("");
  const [newItemTaxRateId, setNewItemTaxRateId] = useState("");
  const [selectedModifierGroupIds, setSelectedModifierGroupIds] = useState<
    string[]
  >([]);

  // Form states - Menu, Category, Station, Tax
  const [newMenuName, setNewMenuName] = useState("");
  const [newMenuDescription, setNewMenuDescription] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [targetCategoryMenuId, setTargetCategoryMenuId] = useState("");
  const [newStationName, setNewStationName] = useState("");
  const [newStationCode, setNewStationCode] = useState("");
  const [newStationType, setNewStationType] = useState("KITCHEN");
  const [newTaxName, setNewTaxName] = useState("");
  const [newTaxRatePercent, setNewTaxRatePercent] = useState("8.25");

  // Form states - Modifier Group
  const [newModGroupName, setNewModGroupName] = useState("");
  const [newModGroupRequired, setNewModGroupRequired] = useState(false);
  const [newModGroupMin, setNewModGroupMin] = useState("0");
  const [newModGroupMax, setNewModGroupMax] = useState("1");
  const [newModGroupOptions, setNewModGroupOptions] = useState<
    Array<{ name: string; priceDelta: string; isDefault: boolean }>
  >([
    { name: "Mild", priceDelta: "0.00", isDefault: true },
    { name: "Medium", priceDelta: "0.00", isDefault: false },
    { name: "Spicy", priceDelta: "0.50", isDefault: false },
  ]);

  const loadData = async () => {
    if (!currentOrgId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [menusRes, itemsRes, stationsRes, taxRes, groupsRes] =
        await Promise.allSettled([
          apiClient.get<MenuDto[]>("/api/v1/menu/menus"),
          apiClient.get<MenuItemDto[]>("/api/v1/menu/items"),
          apiClient.get<KitchenStationDto[]>("/api/v1/menu/stations"),
          apiClient.get<TaxRateDto[]>("/api/v1/menu/tax-rates"),
          apiClient.get<ModifierGroupDto[]>("/api/v1/menu/modifier-groups"),
        ]);

      if (menusRes.status === "fulfilled") {
        const loadedMenus = menusRes.value;
        setMenus(loadedMenus);
        if (loadedMenus.length > 0) {
          const currentValid = loadedMenus.some((m) => m.id === selectedMenuId);
          const activeMenuId = currentValid
            ? selectedMenuId
            : loadedMenus[0]!.id;
          setSelectedMenuId(activeMenuId);
          setTargetCategoryMenuId(activeMenuId);

          const activeMenu = loadedMenus.find((m) => m.id === activeMenuId);
          const firstCat = activeMenu?.categories?.[0];
          if (firstCat && !selectedCategoryId) {
            setSelectedCategoryId(firstCat.id);
            setNewItemCategoryId(firstCat.id);
          }
        } else {
          setSelectedMenuId("");
          setSelectedCategoryId("");
        }
      } else {
        setError(menusRes.reason?.message || "Failed to load menus");
      }

      if (itemsRes.status === "fulfilled") setItems(itemsRes.value);
      if (stationsRes.status === "fulfilled") setStations(stationsRes.value);
      if (taxRes.status === "fulfilled") setTaxRates(taxRes.value);
      if (groupsRes.status === "fulfilled") setModifierGroups(groupsRes.value);
    } catch (err: any) {
      setError(err.message || "Failed to load restaurant menu data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentOrgId]);

  // Fast 86 Toggle
  const toggle86 = async (itemId: string, currentStatus: boolean) => {
    try {
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId ? { ...it, isAvailable: !currentStatus } : it,
        ),
      );

      await apiClient.patch(`/api/v1/menu/items/${itemId}/availability`, {
        isAvailable: !currentStatus,
      });
    } catch (err: any) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId ? { ...it, isAvailable: currentStatus } : it,
        ),
      );
      setError("Failed to update item 86 status: " + err.message);
    }
  };

  // Open Create Item Modal
  const handleOpenCreateItem = () => {
    setEditingItemId(null);
    setNewItemName("");
    setNewItemDescription("");
    setNewItemSku("");
    setNewItemPrice("14.99");
    setNewItemPrepTime("15");
    setNewItemCategoryId(selectedCategoryId || categories[0]?.id || "");
    setNewItemStationId("");
    setNewItemTaxRateId("");
    setSelectedModifierGroupIds([]);
    setShowItemModal(true);
  };

  // Open Edit Item Modal
  const handleOpenEditItem = (item: MenuItemDto) => {
    setEditingItemId(item.id);
    setNewItemName(item.name);
    setNewItemDescription(item.description || "");
    setNewItemSku(item.sku || "");
    setNewItemPrice((item.basePriceCents / 100).toFixed(2));
    setNewItemPrepTime((item.prepTimeMinutes || 15).toString());
    setNewItemCategoryId(item.categoryId);
    setNewItemStationId(item.kitchenStationId || "");
    setNewItemTaxRateId(item.taxRateId || "");

    const groupIds = (item.modifierGroups || [])
      .map((mg: any) => mg.modifierGroupId || mg.modifierGroup?.id || mg.id)
      .filter(Boolean);
    setSelectedModifierGroupIds(groupIds);

    setShowItemModal(true);
  };

  // Save Item (Create or Update)
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveCategoryId = newItemCategoryId || selectedCategoryId;
    if (!effectiveCategoryId) {
      setError("Please select or create a category first.");
      return;
    }
    setIsSubmitting(true);
    try {
      const priceCents = Math.round(parseFloat(newItemPrice) * 100);
      const prepMinutes = parseInt(newItemPrepTime, 10) || 15;

      if (editingItemId) {
        // UPDATE existing menu item
        const updated = await apiClient.put<MenuItemDto>(
          `/api/v1/menu/items/${editingItemId}`,
          {
            categoryId: effectiveCategoryId,
            name: newItemName.trim(),
            description: newItemDescription.trim() || undefined,
            sku: newItemSku.trim() || undefined,
            basePriceCents: priceCents,
            prepTimeMinutes: prepMinutes,
            kitchenStationId: newItemStationId || null,
            taxRateId: newItemTaxRateId || null,
            modifierGroupIds: selectedModifierGroupIds,
          },
        );

        setItems((prev) =>
          prev.map((it) => (it.id === editingItemId ? updated : it)),
        );
      } else {
        // CREATE new menu item
        const created = await apiClient.post<MenuItemDto>(
          "/api/v1/menu/items",
          {
            categoryId: effectiveCategoryId,
            name: newItemName.trim(),
            description: newItemDescription.trim() || undefined,
            sku: newItemSku.trim() || undefined,
            basePriceCents: priceCents,
            prepTimeMinutes: prepMinutes,
            kitchenStationId: newItemStationId || undefined,
            taxRateId: newItemTaxRateId || undefined,
            modifierGroupIds: selectedModifierGroupIds,
          },
        );

        setItems((prev) => [...prev, created]);
      }

      setShowItemModal(false);
      setEditingItemId(null);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to save menu item");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Item Handler
  const handleDeleteItem = async (itemId: string, itemName: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete "${itemName}"? This cannot be undone.`,
      )
    ) {
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient.delete(`/api/v1/menu/items/${itemId}`);
      setItems((prev) => prev.filter((it) => it.id !== itemId));
    } catch (err: any) {
      setError(err.message || "Failed to delete menu item");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Create Modifier Group Modal
  const handleOpenCreateModifierGroup = () => {
    setNewModGroupName("");
    setNewModGroupRequired(false);
    setNewModGroupMin("0");
    setNewModGroupMax("1");
    setNewModGroupOptions([
      { name: "Mild", priceDelta: "0.00", isDefault: true },
      { name: "Medium", priceDelta: "0.00", isDefault: false },
      { name: "Spicy", priceDelta: "0.50", isDefault: false },
    ]);
    setShowModifierModal(true);
  };

  // Create Modifier Group Handler
  const handleCreateModifierGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModGroupName.trim()) return;

    const validOptions = newModGroupOptions
      .filter((o) => o.name.trim())
      .map((o) => ({
        name: o.name.trim(),
        priceDeltaCents: Math.round(parseFloat(o.priceDelta || "0") * 100),
        isDefault: o.isDefault,
        isAvailable: true,
      }));

    if (validOptions.length === 0) {
      setError("Please add at least one option to the modifier group.");
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await apiClient.post<ModifierGroupDto>(
        "/api/v1/menu/modifier-groups",
        {
          name: newModGroupName.trim(),
          isRequired: newModGroupRequired,
          minSelections: parseInt(newModGroupMin, 10) || 0,
          maxSelections: parseInt(newModGroupMax, 10) || 1,
          options: validOptions,
        },
      );

      setModifierGroups((prev) => [...prev, created]);
      setShowModifierModal(false);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to create modifier group");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Modifier Group Handler
  const handleDeleteModifierGroup = async (
    groupId: string,
    groupName: string,
  ) => {
    if (
      !window.confirm(
        `Are you sure you want to delete modifier group "${groupName}"?`,
      )
    ) {
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient.delete(`/api/v1/menu/modifier-groups/${groupId}`);
      setModifierGroups((prev) => prev.filter((g) => g.id !== groupId));
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to delete modifier group");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick Starter: Create Spice Level Group
  const handleCreateSpiceLevelGroup = async () => {
    setIsSubmitting(true);
    try {
      const created = await apiClient.post<ModifierGroupDto>(
        "/api/v1/menu/modifier-groups",
        {
          name: "Spice Level",
          isRequired: true,
          minSelections: 1,
          maxSelections: 1,
          options: [
            {
              name: "Mild",
              priceDeltaCents: 0,
              isDefault: true,
              isAvailable: true,
            },
            {
              name: "Medium",
              priceDeltaCents: 0,
              isDefault: false,
              isAvailable: true,
            },
            {
              name: "Spicy",
              priceDeltaCents: 50,
              isDefault: false,
              isAvailable: true,
            },
            {
              name: "Extra Hot",
              priceDeltaCents: 100,
              isDefault: false,
              isAvailable: true,
            },
          ],
        },
      );
      setModifierGroups((prev) => [...prev, created]);
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to create Spice Level modifier group");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create Menu Handler
  const handleCreateMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMenuName.trim()) return;
    setIsSubmitting(true);
    try {
      const created = await apiClient.post<MenuDto>("/api/v1/menu/menus", {
        name: newMenuName.trim(),
        description: newMenuDescription.trim() || undefined,
      });

      setMenus((prev) => [...prev, created]);
      setSelectedMenuId(created.id);
      setTargetCategoryMenuId(created.id);
      setShowMenuModal(false);
      setNewMenuName("");
      setNewMenuDescription("");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to create menu");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create Starter Menu (Quick Start with Tandoor, Spice Level & Paneer Tikka)
  const handleCreateStarterMenu = async () => {
    setIsSubmitting(true);
    try {
      const starterMenu = await apiClient.post<MenuDto>("/api/v1/menu/menus", {
        name: "Main Dining Menu",
        description: "Primary restaurant service menu",
      });

      const appetizers = await apiClient.post<{ id: string }>(
        "/api/v1/menu/categories",
        {
          menuId: starterMenu.id,
          name: "Appetizers & Starters",
        },
      );

      await apiClient.post("/api/v1/menu/categories", {
        menuId: starterMenu.id,
        name: "Entrees & Mains",
      });

      // Ensure Tandoor station exists
      let tandoorStation = stations.find(
        (s) =>
          s.name.toLowerCase().includes("tandoor") || s.code === "GRILL-01",
      );
      if (!tandoorStation) {
        tandoorStation = await apiClient.post<KitchenStationDto>(
          "/api/v1/menu/stations",
          {
            locationId:
              stations[0]?.locationId || "00000000-0000-0000-0000-000000000000",
            name: "Tandoor",
            code: "GRILL-01",
            type: "GRILL",
          },
        );
      }

      // Ensure Spice Level modifier group exists
      let spiceGroup = modifierGroups.find((g) =>
        g.name.toLowerCase().includes("spice"),
      );
      if (!spiceGroup) {
        spiceGroup = await apiClient.post<ModifierGroupDto>(
          "/api/v1/menu/modifier-groups",
          {
            name: "Spice Level",
            isRequired: true,
            minSelections: 1,
            maxSelections: 1,
            options: [
              {
                name: "Mild",
                priceDeltaCents: 0,
                isDefault: true,
                isAvailable: true,
              },
              {
                name: "Medium",
                priceDeltaCents: 0,
                isDefault: false,
                isAvailable: true,
              },
              {
                name: "Spicy",
                priceDeltaCents: 50,
                isDefault: false,
                isAvailable: true,
              },
            ],
          },
        );
      }

      // Create Paneer Tikka dish assigned to Tandoor with Spice Level attached
      await apiClient.post("/api/v1/menu/items", {
        categoryId: appetizers.id,
        name: "Paneer Tikka",
        description:
          "Fresh cottage cheese marinated in spiced yogurt and grilled in traditional tandoor oven",
        sku: "APP-PANEER-01",
        basePriceCents: 1499,
        prepTimeMinutes: 15,
        kitchenStationId: tandoorStation.id,
        modifierGroupIds: [spiceGroup.id],
      });

      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to generate starter menu");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create Category Handler
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveMenuId =
      targetCategoryMenuId || selectedMenuId || (menus[0]?.id ?? "");
    if (!effectiveMenuId) {
      setError("Please create a menu first before adding categories.");
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient.post("/api/v1/menu/categories", {
        menuId: effectiveMenuId,
        name: newCategoryName,
      });
      setShowCategoryModal(false);
      setNewCategoryName("");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to create category");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create Station Handler
  const handleCreateStation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const locId =
        stations[0]?.locationId || "00000000-0000-0000-0000-000000000000";
      const created = await apiClient.post<KitchenStationDto>(
        "/api/v1/menu/stations",
        {
          locationId: locId,
          name: newStationName,
          code: newStationCode.toUpperCase(),
          type: newStationType,
        },
      );
      setStations((prev) => [...prev, created]);
      setShowStationModal(false);
      setNewStationName("");
      setNewStationCode("");
    } catch (err: any) {
      setError(err.message || "Failed to create station");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create Tax Rate Handler
  const handleCreateTaxRate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const basisPoints = Math.round(parseFloat(newTaxRatePercent) * 100);
      const created = await apiClient.post<TaxRateDto>(
        "/api/v1/menu/tax-rates",
        {
          name: newTaxName,
          rateBasisPoints: basisPoints,
          isDefault: taxRates.length === 0,
        },
      );
      setTaxRates((prev) => [...prev, created]);
      setShowTaxModal(false);
      setNewTaxName("");
    } catch (err: any) {
      setError(err.message || "Failed to create tax rate");
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeMenu = menus.find((m) => m.id === selectedMenuId) || menus[0];
  const categories = activeMenu?.categories || [];

  const filteredItems = items.filter((it) => {
    const matchesCategory =
      activeTab === "stockboard" ||
      !selectedCategoryId ||
      it.categoryId === selectedCategoryId;
    const matchesSearch =
      !searchQuery ||
      it.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (it.sku && it.sku.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">
            Menu & Catalog Management
          </h2>
          <p className="text-sm text-gray-500">
            Configure menus, dish categories, modifier groups, kitchen station
            routing, and live 86 availability.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {menus.length > 0 && (
            <div className="flex items-center space-x-2">
              <select
                value={selectedMenuId}
                onChange={(e) => {
                  setSelectedMenuId(e.target.value);
                  setTargetCategoryMenuId(e.target.value);
                  const chosen = menus.find((m) => m.id === e.target.value);
                  const first = chosen?.categories?.[0];
                  setSelectedCategoryId(first ? first.id : "");
                  setNewItemCategoryId(first ? first.id : "");
                }}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow-xs focus:border-indigo-500 focus:outline-none"
              >
                {menus.map((m) => (
                  <option key={m.id} value={m.id}>
                    📖 {m.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => setShowMenuModal(true)}
            className="flex items-center space-x-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-xs hover:bg-gray-50 focus:outline-none"
          >
            <Plus className="h-4 w-4 text-gray-500" />
            <span>New Menu</span>
          </button>

          <button
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center space-x-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-xs hover:bg-gray-50 focus:outline-none disabled:opacity-50"
            title="Refresh Catalog Data"
          >
            <RefreshCw
              className={`h-4 w-4 text-gray-500 ${isLoading ? "animate-spin" : ""}`}
            />
          </button>

          {activeTab === "catalog" &&
            menus.length > 0 &&
            categories.length > 0 && (
              <button
                onClick={handleOpenCreateItem}
                className="flex items-center space-x-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus:outline-none"
              >
                <Plus className="h-4 w-4" />
                <span>New Menu Item</span>
              </button>
            )}

          {activeTab === "modifiers" && (
            <button
              onClick={handleOpenCreateModifierGroup}
              className="flex items-center space-x-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus:outline-none"
            >
              <Plus className="h-4 w-4" />
              <span>New Modifier Group</span>
            </button>
          )}

          {activeTab === "stations" && (
            <button
              onClick={() => setShowStationModal(true)}
              className="flex items-center space-x-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus:outline-none"
            >
              <Plus className="h-4 w-4" />
              <span>New Kitchen Station</span>
            </button>
          )}

          {activeTab === "taxes" && (
            <button
              onClick={() => setShowTaxModal(true)}
              className="flex items-center space-x-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500 focus:outline-none"
            >
              <Plus className="h-4 w-4" />
              <span>New Tax Policy</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center space-x-2.5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("catalog")}
            className={`flex items-center space-x-2 border-b-2 py-3 px-1 text-sm font-medium ${
              activeTab === "catalog"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            <UtensilsCrossed className="h-4 w-4" />
            <span>Menu Catalog</span>
          </button>

          <button
            onClick={() => setActiveTab("stockboard")}
            className={`flex items-center space-x-2 border-b-2 py-3 px-1 text-sm font-medium ${
              activeTab === "stockboard"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
            <span>86 Stockboard (Live Availability)</span>
          </button>

          <button
            onClick={() => setActiveTab("modifiers")}
            className={`flex items-center space-x-2 border-b-2 py-3 px-1 text-sm font-medium ${
              activeTab === "modifiers"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Modifier Groups</span>
          </button>

          <button
            onClick={() => setActiveTab("stations")}
            className={`flex items-center space-x-2 border-b-2 py-3 px-1 text-sm font-medium ${
              activeTab === "stations"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            <Flame className="h-4 w-4" />
            <span>Kitchen Stations</span>
          </button>

          <button
            onClick={() => setActiveTab("taxes")}
            className={`flex items-center space-x-2 border-b-2 py-3 px-1 text-sm font-medium ${
              activeTab === "taxes"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            <Receipt className="h-4 w-4" />
            <span>Tax Policies</span>
          </button>
        </nav>
      </div>

      {/* TAB 1: MENU CATALOG */}
      {activeTab === "catalog" &&
        (menus.length === 0 ? (
          /* Empty State when Organization has no Menus */
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-xs">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <BookOpen className="h-8 w-8" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-gray-900">
              No Menus Created Yet
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
              Your restaurant catalog needs at least one menu to organize dish
              categories, items, modifier groups, and kitchen routing.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => setShowMenuModal(true)}
                className="flex items-center space-x-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500"
              >
                <Plus className="h-4 w-4" />
                <span>Create First Menu</span>
              </button>
              <button
                onClick={handleCreateStarterMenu}
                disabled={isSubmitting}
                className="flex items-center space-x-2 rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4 text-indigo-600" />
                <span>
                  Quick Start: Generate Starter Menu (Includes Paneer Tikka &
                  Tandoor)
                </span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
            {/* Categories Sidebar */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs lg:col-span-1">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                  Menu Categories
                </h3>
                <button
                  onClick={() => {
                    setTargetCategoryMenuId(
                      selectedMenuId || menus[0]?.id || "",
                    );
                    setShowCategoryModal(true);
                  }}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  + Add
                </button>
              </div>

              <div className="space-y-1">
                {categories.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-xs text-gray-400">
                      No categories in this menu.
                    </p>
                    <button
                      onClick={() => {
                        setTargetCategoryMenuId(
                          selectedMenuId || menus[0]?.id || "",
                        );
                        setShowCategoryModal(true);
                      }}
                      className="mt-2 text-xs font-semibold text-indigo-600 hover:underline"
                    >
                      + Add First Category
                    </button>
                  </div>
                ) : (
                  categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setSelectedCategoryId(cat.id);
                        setNewItemCategoryId(cat.id);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                        selectedCategoryId === cat.id
                          ? "bg-indigo-50 text-indigo-700"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <span>{cat.name}</span>
                      <span className="text-xs text-gray-400">
                        {items.filter((it) => it.categoryId === cat.id).length}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Menu Items Grid */}
            <div className="space-y-4 lg:col-span-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search dishes by name or SKU..."
                    className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-4 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                {categories.length > 0 && (
                  <button
                    onClick={handleOpenCreateItem}
                    className="flex items-center space-x-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-500"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Dish</span>
                  </button>
                )}
              </div>

              {filteredItems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
                  <UtensilsCrossed className="mx-auto h-8 w-8 text-gray-400" />
                  <h4 className="mt-2 text-sm font-semibold text-gray-900">
                    No dishes found
                  </h4>
                  <p className="mt-1 text-xs text-gray-500">
                    {categories.length === 0
                      ? "Add a category first to begin creating dishes."
                      : "Create a new menu item to start building your restaurant offering."}
                  </p>
                  {categories.length > 0 && (
                    <button
                      onClick={handleOpenCreateItem}
                      className="mt-4 inline-flex items-center space-x-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Add Dish</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {filteredItems.map((item) => {
                    const assignedStation = stations.find(
                      (s) => s.id === item.kitchenStationId,
                    );
                    const attachedGroups = (item.modifierGroups || []).map(
                      (mg: any) => {
                        if (mg.modifierGroup) return mg.modifierGroup;
                        return (
                          modifierGroups.find(
                            (g) => g.id === (mg.modifierGroupId || mg.id),
                          ) || mg
                        );
                      },
                    );

                    return (
                      <div
                        key={item.id}
                        className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-xs transition hover:border-gray-300"
                      >
                        <div>
                          <div className="flex items-start justify-between">
                            <div className="flex-1 pr-2">
                              <h4 className="font-semibold text-gray-900">
                                {item.name}
                              </h4>
                              <span className="text-sm font-bold text-gray-900">
                                ${(item.basePriceCents / 100).toFixed(2)}
                              </span>
                            </div>

                            {/* Edit & Delete Action Buttons */}
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => handleOpenEditItem(item)}
                                className="rounded-md p-1.5 text-gray-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                                title={`Edit ${item.name}`}
                                aria-label={`Edit ${item.name}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() =>
                                  handleDeleteItem(item.id, item.name)
                                }
                                className="rounded-md p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                                title={`Delete ${item.name}`}
                                aria-label={`Delete ${item.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {item.description && (
                            <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                              {item.description}
                            </p>
                          )}

                          <div className="mt-3 flex flex-wrap gap-1.5 text-2xs">
                            {item.sku && (
                              <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
                                <Tag className="mr-1 h-3 w-3" />
                                {item.sku}
                              </span>
                            )}
                            <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                              <Clock className="mr-1 h-3 w-3" />
                              {item.prepTimeMinutes}m
                            </span>
                            {assignedStation && (
                              <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 border border-amber-200">
                                <Flame className="mr-1 h-3 w-3 text-amber-600" />
                                Station: {assignedStation.name} (
                                {assignedStation.code})
                              </span>
                            )}
                            {attachedGroups.map((g: any, idx: number) => (
                              <span
                                key={g.id || idx}
                                className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 font-medium text-purple-700 border border-purple-200"
                              >
                                <Layers className="mr-1 h-3 w-3 text-purple-600" />
                                {g.name}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                          <span
                            className={`inline-flex items-center text-xs font-semibold ${
                              item.isAvailable
                                ? "text-emerald-600"
                                : "text-rose-600"
                            }`}
                          >
                            {item.isAvailable ? (
                              <>
                                <CheckCircle2 className="mr-1 h-4 w-4 text-emerald-500" />
                                Available
                              </>
                            ) : (
                              <>
                                <XCircle className="mr-1 h-4 w-4 text-rose-500" />
                                86'd (Out of Stock)
                              </>
                            )}
                          </span>

                          <button
                            onClick={() => toggle86(item.id, item.isAvailable)}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                              item.isAvailable
                                ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
                                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            }`}
                          >
                            {item.isAvailable ? "Mark 86" : "Restock"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

      {/* TAB 2: 86 STOCKBOARD */}
      {activeTab === "stockboard" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <strong>Kitchen & FoH 86 Stockboard:</strong> Toggling availability
            here instantly prevents POS registers from submitting out-of-stock
            dishes and alerts kitchen display screens.
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {items.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between rounded-xl border p-4 shadow-xs transition ${
                  item.isAvailable
                    ? "border-gray-200 bg-white"
                    : "border-rose-300 bg-rose-50/50"
                }`}
              >
                <div>
                  <h4 className="font-semibold text-gray-900">{item.name}</h4>
                  <p className="text-xs text-gray-500">
                    ${(item.basePriceCents / 100).toFixed(2)} •{" "}
                    {stations.find((s) => s.id === item.kitchenStationId)
                      ?.name || "Kitchen"}
                  </p>
                </div>

                <button
                  onClick={() => toggle86(item.id, item.isAvailable)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition shadow-xs ${
                    item.isAvailable
                      ? "bg-rose-600 text-white hover:bg-rose-700"
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  }`}
                >
                  {item.isAvailable ? "86 IT" : "IN STOCK"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: MODIFIER GROUPS */}
      {activeTab === "modifiers" && (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-sm text-indigo-900">
            <div>
              <strong>Modifier Groups & Options:</strong> Define choices such as
              Spice Level, Cooking Temperatures, Dressings, and Add-ons. Attach
              them to menu items to customize POS order taking.
            </div>
            {!modifierGroups.some((g) =>
              g.name.toLowerCase().includes("spice"),
            ) && (
              <button
                onClick={handleCreateSpiceLevelGroup}
                disabled={isSubmitting}
                className="inline-flex shrink-0 items-center space-x-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Quick Add: Spice Level Group</span>
              </button>
            )}
          </div>

          {modifierGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center shadow-xs">
              <Layers className="mx-auto h-8 w-8 text-gray-400" />
              <h4 className="mt-2 text-sm font-semibold text-gray-900">
                No Modifier Groups Configured
              </h4>
              <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500">
                Create customizable options like "Spice Level" (Mild, Medium,
                Spicy) to allow guests to customize their orders.
              </p>
              <div className="mt-4 flex justify-center space-x-3">
                <button
                  onClick={handleOpenCreateModifierGroup}
                  className="inline-flex items-center space-x-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create Modifier Group</span>
                </button>
                <button
                  onClick={handleCreateSpiceLevelGroup}
                  disabled={isSubmitting}
                  className="inline-flex items-center space-x-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4 text-indigo-600" />
                  <span>Quick Add: Spice Level</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {modifierGroups.map((group) => {
                const attachedItems = items.filter((it) =>
                  (it.modifierGroups || []).some(
                    (mg: any) =>
                      mg.modifierGroupId === group.id ||
                      mg.id === group.id ||
                      mg.modifierGroup?.id === group.id,
                  ),
                );

                return (
                  <div
                    key={group.id}
                    className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-xs"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-base font-bold text-gray-900">
                            {group.name}
                          </h4>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs">
                            <span
                              className={`rounded-md px-2 py-0.5 font-bold ${
                                group.isRequired
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {group.isRequired ? "Required" : "Optional"}
                            </span>
                            <span className="rounded-md bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                              Min: {group.minSelections} • Max:{" "}
                              {group.maxSelections}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() =>
                            handleDeleteModifierGroup(group.id, group.name)
                          }
                          className="rounded-md p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                          title={`Delete ${group.name}`}
                          aria-label={`Delete ${group.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Options list */}
                      <div className="mt-4 space-y-1.5 border-t border-gray-100 pt-3">
                        <span className="text-2xs font-bold uppercase tracking-wider text-gray-400">
                          Options ({group.options?.length || 0})
                        </span>
                        <div className="space-y-1">
                          {group.options && group.options.length > 0 ? (
                            group.options.map((opt) => (
                              <div
                                key={opt.id}
                                className="flex items-center justify-between rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs"
                              >
                                <span className="font-medium text-gray-800">
                                  {opt.name}
                                  {opt.isDefault && (
                                    <span className="ml-1.5 text-2xs text-indigo-600 font-semibold">
                                      (Default)
                                    </span>
                                  )}
                                </span>
                                <span className="font-semibold text-gray-600">
                                  {opt.priceDeltaCents > 0
                                    ? `+$${(opt.priceDeltaCents / 100).toFixed(2)}`
                                    : "Free"}
                                </span>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-gray-400 italic">
                              No options listed
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-gray-100 pt-3 text-2xs text-gray-500">
                      Attached to {attachedItems.length} dish
                      {attachedItems.length === 1 ? "" : "es"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: KITCHEN STATIONS */}
      {activeTab === "stations" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stations.map((st) => (
            <div
              key={st.id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                  {st.code}
                </span>
                <span className="text-xs text-gray-500 font-medium">
                  {st.type}
                </span>
              </div>
              <h4 className="mt-2 text-lg font-bold text-gray-900">
                {st.name}
              </h4>
              <p className="mt-1 text-xs text-gray-500">
                {st.isExpo ? "Expo Finishing Station" : "Primary Line Station"}
              </p>
              <div className="mt-3 text-2xs text-gray-500">
                Routing:{" "}
                {items.filter((it) => it.kitchenStationId === st.id).length}{" "}
                menu items
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 5: TAX POLICIES */}
      {activeTab === "taxes" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {taxRates.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-gray-900">{t.name}</h4>
                {t.isDefault && (
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                    Default
                  </span>
                )}
              </div>
              <p className="mt-3 text-2xl font-black text-gray-900">
                {(t.rateBasisPoints / 100).toFixed(2)}%
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {t.rateBasisPoints} basis points applicable to line items
              </p>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: CREATE MENU */}
      {showMenuModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">Create New Menu</h3>
            <form onSubmit={handleCreateMenu} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Menu Name
                </label>
                <input
                  type="text"
                  required
                  value={newMenuName}
                  onChange={(e) => setNewMenuName(e.target.value)}
                  placeholder="e.g. Dinner, Lunch, Late Night, Catering"
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Description (Optional)
                </label>
                <textarea
                  rows={2}
                  value={newMenuDescription}
                  onChange={(e) => setNewMenuDescription(e.target.value)}
                  placeholder="Seasonal dishes served from 5 PM to 10 PM..."
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowMenuModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newMenuName.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {isSubmitting ? "Creating..." : "Save Menu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT MENU ITEM */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900">
              {editingItemId ? "Edit Menu Item" : "New Menu Item"}
            </h3>
            <form onSubmit={handleSaveItem} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Dish / Item Name
                </label>
                <input
                  type="text"
                  required
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="e.g. Paneer Tikka, Dry-Aged Ribeye"
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Category
                </label>
                <select
                  required
                  value={newItemCategoryId || selectedCategoryId}
                  onChange={(e) => setNewItemCategoryId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700">
                    Base Price (USD $)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700">
                    Prep Time (Minutes)
                  </label>
                  <input
                    type="number"
                    required
                    value={newItemPrepTime}
                    onChange={(e) => setNewItemPrepTime(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700">
                  SKU / Shortcode
                </label>
                <input
                  type="text"
                  value={newItemSku}
                  onChange={(e) => setNewItemSku(e.target.value)}
                  placeholder="e.g. APP-PANEER-01"
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={newItemDescription}
                  onChange={(e) => setNewItemDescription(e.target.value)}
                  placeholder="Ingredients, marinade, preparation method..."
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700">
                    Kitchen Station
                  </label>
                  <select
                    value={newItemStationId}
                    onChange={(e) => setNewItemStationId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="">None / Unassigned</option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700">
                    Tax Rate
                  </label>
                  <select
                    value={newItemTaxRateId}
                    onChange={(e) => setNewItemTaxRateId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="">Default Tax Rate</option>
                    {taxRates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({(t.rateBasisPoints / 100).toFixed(2)}%)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Modifier Groups Multi-Select */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Attach Modifier Groups
                </label>
                {modifierGroups.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">
                    No modifier groups available. Create one in the "Modifier
                    Groups" tab.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 max-h-36 overflow-y-auto rounded-lg border border-gray-200 p-2.5 bg-gray-50/50">
                    {modifierGroups.map((group) => {
                      const isChecked = selectedModifierGroupIds.includes(
                        group.id,
                      );
                      return (
                        <label
                          key={group.id}
                          className={`flex items-center space-x-2.5 rounded-md p-2 text-xs font-medium transition cursor-pointer ${
                            isChecked
                              ? "bg-indigo-50 border border-indigo-200 text-indigo-900"
                              : "bg-white border border-gray-200 text-gray-700 hover:border-gray-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedModifierGroupIds((prev) => [
                                  ...prev,
                                  group.id,
                                ]);
                              } else {
                                setSelectedModifierGroupIds((prev) =>
                                  prev.filter((id) => id !== group.id),
                                );
                              }
                            }}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="flex-1 truncate">
                            <span className="font-semibold">{group.name}</span>
                            <span className="ml-1 text-gray-400 text-2xs">
                              ({group.options?.length || 0} options
                              {group.isRequired ? ", required" : ""})
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {isSubmitting
                    ? "Saving..."
                    : editingItemId
                      ? "Update Dish"
                      : "Save Dish"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE MODIFIER GROUP */}
      {showModifierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900">
              New Modifier Group
            </h3>
            <form
              onSubmit={handleCreateModifierGroup}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Group Name
                </label>
                <input
                  type="text"
                  required
                  value={newModGroupName}
                  onChange={(e) => setNewModGroupName(e.target.value)}
                  placeholder="e.g. Spice Level, Temperature, Choice of Side"
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex items-center pt-5">
                  <label className="flex items-center space-x-2 text-xs font-medium text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newModGroupRequired}
                      onChange={(e) => setNewModGroupRequired(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Required Choice</span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700">
                    Min Selections
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={newModGroupMin}
                    onChange={(e) => setNewModGroupMin(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700">
                    Max Selections
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newModGroupMax}
                    onChange={(e) => setNewModGroupMax(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Dynamic Options List */}
              <div className="space-y-2 border-t border-gray-200 pt-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-600">
                    Modifier Options
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setNewModGroupOptions((prev) => [
                        ...prev,
                        { name: "", priceDelta: "0.00", isDefault: false },
                      ])
                    }
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    + Add Option
                  </button>
                </div>

                <div className="space-y-2">
                  {newModGroupOptions.map((opt, idx) => (
                    <div
                      key={idx}
                      className="flex items-center space-x-2 rounded-lg border border-gray-200 bg-gray-50/50 p-2"
                    >
                      <input
                        type="text"
                        required
                        value={opt.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewModGroupOptions((prev) =>
                            prev.map((o, i) =>
                              i === idx ? { ...o, name: val } : o,
                            ),
                          );
                        }}
                        placeholder="Option name (e.g. Mild)"
                        className="flex-1 rounded-md border border-gray-300 bg-white p-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                      />

                      <div className="flex items-center space-x-1">
                        <span className="text-xs text-gray-400">+$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={opt.priceDelta}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNewModGroupOptions((prev) =>
                              prev.map((o, i) =>
                                i === idx ? { ...o, priceDelta: val } : o,
                              ),
                            );
                          }}
                          placeholder="0.00"
                          className="w-16 rounded-md border border-gray-300 bg-white p-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                        />
                      </div>

                      <label className="flex items-center space-x-1 text-2xs text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={opt.isDefault}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setNewModGroupOptions((prev) =>
                              prev.map((o, i) =>
                                i === idx ? { ...o, isDefault: checked } : o,
                              ),
                            );
                          }}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>Default</span>
                      </label>

                      {newModGroupOptions.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setNewModGroupOptions((prev) =>
                              prev.filter((_, i) => i !== idx),
                            )
                          }
                          className="p-1 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModifierModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : "Create Modifier Group"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE CATEGORY */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">
              New Menu Category
            </h3>
            <form onSubmit={handleCreateCategory} className="mt-4 space-y-4">
              {menus.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700">
                    Target Menu
                  </label>
                  <select
                    value={targetCategoryMenuId}
                    onChange={(e) => setTargetCategoryMenuId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    {menus.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Category Name
                </label>
                <input
                  type="text"
                  required
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g. Starters, Steaks, Cocktails"
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE STATION */}
      {showStationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">
              New Kitchen Station
            </h3>
            <form onSubmit={handleCreateStation} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Station Name
                </label>
                <input
                  type="text"
                  required
                  value={newStationName}
                  onChange={(e) => setNewStationName(e.target.value)}
                  placeholder="e.g. Woodfire Grill, Tandoor"
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Routing Code (Uppercase)
                </label>
                <input
                  type="text"
                  required
                  value={newStationCode}
                  onChange={(e) => setNewStationCode(e.target.value)}
                  placeholder="e.g. GRILL-01"
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm uppercase focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Station Type
                </label>
                <select
                  value={newStationType}
                  onChange={(e) => setNewStationType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="KITCHEN">General Kitchen</option>
                  <option value="GRILL">Grill Station</option>
                  <option value="BAR">Bar & Beverages</option>
                  <option value="SALAD">Garde Manger / Salad</option>
                  <option value="PIZZA">Pizza Station</option>
                  <option value="EXPO">Expo Dispatch</option>
                  <option value="DESSERT">Pastry & Dessert</option>
                </select>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowStationModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  Create Station
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE TAX */}
      {showTaxModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900">New Tax Policy</h3>
            <form onSubmit={handleCreateTaxRate} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Tax Policy Name
                </label>
                <input
                  type="text"
                  required
                  value={newTaxName}
                  onChange={(e) => setNewTaxName(e.target.value)}
                  placeholder="e.g. State Sales Tax"
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Rate Percentage (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newTaxRatePercent}
                  onChange={(e) => setNewTaxRatePercent(e.target.value)}
                  placeholder="8.25"
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowTaxModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  Save Tax Rate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
