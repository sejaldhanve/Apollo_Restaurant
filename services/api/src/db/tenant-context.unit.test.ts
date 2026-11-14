import { describe, it, expect, vi } from "vitest";
import { withTenantContext } from "./tenant-context.js";

describe("withTenantContext", () => {
  it("rejects empty tenant ID with invariant error", async () => {
    await expect(withTenantContext("", async () => {})).rejects.toThrow(
      "Security Invariant Violation",
    );
  });

  it("executes transaction setting config and running callback", async () => {
    const mockTx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const mockClient = {
      $transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
    };

    const res = await withTenantContext(
      "tenant-123",
      async (tx) => {
        expect(tx).toBe(mockTx);
        return "success";
      },
      mockClient as any,
    );

    expect(res).toBe("success");
    expect(mockTx.$executeRaw).toHaveBeenCalled();
  });
});
