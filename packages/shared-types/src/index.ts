export interface HealthCheckResponse {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  environment: string;
  timestamp: string;
  services?: Record<string, ServiceHealth>;
}

export interface ServiceHealth {
  status: "up" | "down" | "degraded";
  latencyMs?: number;
  message?: string;
}

export interface TenantEntity {
  id: string;
  organizationId: string;
  locationId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiErrorResponse {
  success: false;
  error: { code: string; message: string; details?: unknown };
  requestId?: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: { page?: number; pageSize?: number; total?: number };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// === Phase 1: Auth & Domain Types ===

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  emailVerified: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  organizationName: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
  organizations: OrgMembershipInfo[];
}

export interface OrgMembershipInfo {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: string;
  permissions: string[];
}

export interface MeResponse {
  user: AuthUser;
  memberships: OrgMembershipInfo[];
}

// === Phase 2 — Module 1: Restaurant Configuration & Menu Types ===

export type StationType =
  | "KITCHEN"
  | "BAR"
  | "GRILL"
  | "SALAD"
  | "PIZZA"
  | "EXPO"
  | "DESSERT";

export interface KitchenStationDto {
  id: string;
  organizationId: string;
  locationId: string;
  name: string;
  code: string;
  type: StationType;
  isExpo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateKitchenStationRequest {
  locationId: string;
  name: string;
  code: string;
  type?: StationType;
  isExpo?: boolean;
}

export interface UpdateKitchenStationRequest {
  name?: string;
  code?: string;
  type?: StationType;
  isExpo?: boolean;
}

export interface TaxRateDto {
  id: string;
  organizationId: string;
  name: string;
  rateBasisPoints: number; // e.g. 825 = 8.25%
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaxRateRequest {
  name: string;
  rateBasisPoints: number;
  isDefault?: boolean;
}

export interface UpdateTaxRateRequest {
  name?: string;
  rateBasisPoints?: number;
  isDefault?: boolean;
}

export interface MenuDto {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  schedule?: Record<string, unknown> | null;
  categories?: MenuCategoryDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateMenuRequest {
  name: string;
  description?: string;
  isActive?: boolean;
  schedule?: Record<string, unknown>;
}

export interface UpdateMenuRequest {
  name?: string;
  description?: string;
  isActive?: boolean;
  schedule?: Record<string, unknown>;
}

export interface MenuCategoryDto {
  id: string;
  organizationId: string;
  menuId: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
  items?: MenuItemDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateMenuCategoryRequest {
  menuId: string;
  name: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateMenuCategoryRequest {
  name?: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface MenuItemDto {
  id: string;
  organizationId: string;
  categoryId: string;
  kitchenStationId?: string | null;
  taxRateId?: string | null;
  name: string;
  description?: string | null;
  sku?: string | null;
  basePriceCents: number;
  isAvailable: boolean; // 86 stock status
  prepTimeMinutes: number;
  calories?: number | null;
  allergens: string[];
  modifierGroups?: ModifierGroupDto[];
  overrides?: LocationMenuOverrideDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateMenuItemRequest {
  categoryId: string;
  name: string;
  description?: string;
  sku?: string;
  basePriceCents: number;
  isAvailable?: boolean;
  prepTimeMinutes?: number;
  calories?: number;
  allergens?: string[];
  kitchenStationId?: string;
  taxRateId?: string;
  modifierGroupIds?: string[];
}

export interface UpdateMenuItemRequest {
  categoryId?: string;
  name?: string;
  description?: string;
  sku?: string;
  basePriceCents?: number;
  isAvailable?: boolean;
  prepTimeMinutes?: number;
  calories?: number;
  allergens?: string[];
  kitchenStationId?: string | null;
  taxRateId?: string | null;
  modifierGroupIds?: string[];
}

export interface UpdateItemAvailabilityRequest {
  isAvailable: boolean;
  reason?: string;
}

export interface ModifierOptionDto {
  id: string;
  organizationId: string;
  modifierGroupId: string;
  name: string;
  priceDeltaCents: number;
  isAvailable: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateModifierOptionRequest {
  name: string;
  priceDeltaCents?: number;
  isAvailable?: boolean;
  isDefault?: boolean;
}

export interface UpdateModifierOptionRequest {
  name?: string;
  priceDeltaCents?: number;
  isAvailable?: boolean;
  isDefault?: boolean;
}

export interface ModifierGroupDto {
  id: string;
  organizationId: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  isRequired: boolean;
  options: ModifierOptionDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateModifierGroupRequest {
  name: string;
  minSelections?: number;
  maxSelections?: number;
  isRequired?: boolean;
  options?: CreateModifierOptionRequest[];
}

export interface UpdateModifierGroupRequest {
  name?: string;
  minSelections?: number;
  maxSelections?: number;
  isRequired?: boolean;
}

export interface LocationMenuOverrideDto {
  id: string;
  organizationId: string;
  locationId: string;
  menuItemId: string;
  overridePriceCents?: number | null;
  isAvailable?: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertLocationMenuOverrideRequest {
  locationId: string;
  menuItemId: string;
  overridePriceCents?: number | null;
  isAvailable?: boolean | null;
}

// === Phase 2 — Module 2: FoH Floor Plan & Table Management Types ===

export type TableShape =
  | "RECTANGLE"
  | "ROUND"
  | "SQUARE"
  | "BOOTH"
  | "BAR_STOOL";

export type TableStatus =
  | "AVAILABLE"
  | "SEATED"
  | "ORDERED"
  | "SERVED"
  | "PAYMENT_PENDING"
  | "DIRTY"
  | "RESERVED"
  | "BLOCKED";

export type SessionStatus = "ACTIVE" | "COMPLETED" | "TRANSFERRED";

export interface DiningAreaDto {
  id: string;
  organizationId: string;
  locationId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  tables?: TableDto[];
  createdAt: string;
  updatedAt: string;
}

export interface TableSessionDto {
  id: string;
  organizationId: string;
  locationId: string;
  tableId: string;
  serverUserId?: string | null;
  serverName?: string | null;
  guestCount: number;
  seatedAt: string;
  closedAt?: string | null;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TableDto {
  id: string;
  organizationId: string;
  locationId: string;
  diningAreaId: string;
  tableNumber: string;
  shape: TableShape;
  minCovers: number;
  maxCovers: number;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  status: TableStatus;
  isActive: boolean;
  activeSession?: TableSessionDto | null;
  createdAt: string;
  updatedAt: string;
}

export interface FloorPlanDto {
  diningAreas: DiningAreaDto[];
  tables: TableDto[];
}

export interface CreateDiningAreaRequest {
  locationId: string;
  name: string;
  sortOrder?: number;
}

export interface UpdateDiningAreaRequest {
  name?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface CreateTableRequest {
  locationId: string;
  diningAreaId: string;
  tableNumber: string;
  shape?: TableShape;
  minCovers?: number;
  maxCovers?: number;
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
  rotation?: number;
}

export interface UpdateTableRequest {
  tableNumber?: string;
  diningAreaId?: string;
  shape?: TableShape;
  minCovers?: number;
  maxCovers?: number;
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
  rotation?: number;
  isActive?: boolean;
}

export interface TableLayoutItem {
  id: string;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
}

export interface UpdateTableLayoutRequest {
  tables: TableLayoutItem[];
}

export interface SeatTableRequest {
  guestCount: number;
  serverUserId?: string;
}

export interface UpdateTableStatusRequest {
  status: TableStatus;
}

export interface TransferTableRequest {
  targetTableId?: string;
  targetServerUserId?: string;
}
