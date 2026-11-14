import { describe, it, expect, vi, beforeEach } from "vitest";
import { MenuService } from "./menu.service.js";
import { prisma } from "../../db/prisma.js";

vi.mock("../../db/prisma.js", () => {
  const mockTx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    menu: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    menuItem: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    menuCategory: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    kitchenStation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    taxRate: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    modifierGroup: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };

  return {
    prisma: {
      ...mockTx,
      $transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
    },
  };
});

describe("MenuService Data Retrieval & Empty States", () => {
  const orgId = "11111111-1111-4111-8111-111111111111";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getMenus returns empty array when no menus exist", async () => {
    vi.spyOn((prisma as any).menu, "findMany").mockResolvedValue([]);
    const result = await MenuService.getMenus(orgId);
    expect(result).toEqual([]);
  });

  it("getMenuItems returns empty array when no items exist", async () => {
    vi.spyOn((prisma as any).menuItem, "findMany").mockResolvedValue([]);
    const result = await MenuService.getMenuItems(orgId);
    expect(result).toEqual([]);
  });

  it("getKitchenStations returns empty array when no stations exist", async () => {
    vi.spyOn((prisma as any).kitchenStation, "findMany").mockResolvedValue([]);
    const result = await MenuService.getKitchenStations(orgId);
    expect(result).toEqual([]);
  });

  it("getTaxRates returns empty array when no tax rates exist", async () => {
    vi.spyOn((prisma as any).taxRate, "findMany").mockResolvedValue([]);
    const result = await MenuService.getTaxRates(orgId);
    expect(result).toEqual([]);
  });

  it("getModifierGroups returns empty array when no modifier groups exist", async () => {
    vi.spyOn((prisma as any).modifierGroup, "findMany").mockResolvedValue([]);
    const result = await MenuService.getModifierGroups(orgId);
    expect(result).toEqual([]);
  });
});
