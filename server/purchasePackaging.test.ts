import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  base: "kg", registered: false, factor: 1, execute: vi.fn(), draft: vi.fn(), confirm: vi.fn(),
}));
vi.mock("./db/connection", () => ({ getDb: async () => ({}), getRawConnection: async () => ({ execute: fixture.execute }), withTransaction: vi.fn() }));
vi.mock("./lib/inventory/inventoryTrackingPolicy", () => ({ isInventoryTrackingEnabled: async () => true }));
vi.mock("./lib/inventory/inbound/inboundService", () => ({ createInboundDraft: fixture.draft, confirmInbound: fixture.confirm }));
import { createPurchase } from "./db/haccp/haccpIntegration";

const input = { transactionDate: "2026-11-05", partnerId: 1, materialId: 713, itemName: "시험 피자치즈", quantity: 2, packagingSize: 750, packagingUnit: "g", unit: "개", unitPrice: 10455, amount: 20910, taxAmount: 2091, createdBy: 1, idempotencyKey: "synthetic-cheese" };
beforeEach(() => {
  vi.clearAllMocks(); fixture.base = "kg"; fixture.registered = false; fixture.factor = 1;
  fixture.execute.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM h_materials")) return [[{ id: 713, unit: fixture.base, material_name: "시험 피자치즈" }]];
    if (sql.includes("FROM material_pack_units")) return [fixture.registered ? [{ id: 1, base_qty: fixture.factor, base_unit: fixture.base }] : []];
    if (sql.includes("SELECT status")) return [[{ status: "draft" }]];
    return [[]];
  });
  fixture.draft.mockResolvedValue({ headerId: 1 });
  fixture.confirm.mockResolvedValue({ status: "confirmed", lots: [], voucherIds: [] });
});
describe("purchase packaging normalization before inbound", () => {
  it("asks to save 0.75kg, not 750kg; creates no inbound before consent", async () => {
    await expect(createPurchase(input, 15)).rejects.toThrow("1개 = 0.75kg");
    expect(fixture.draft).not.toHaveBeenCalled();
    expect(fixture.execute.mock.calls.every(([sql]) => sql.trim().startsWith("SELECT"))).toBe(true);
  });
  it("normalizes 750g x 2 without changing price, tax, request key or tenant", async () => {
    await createPurchase({ ...input, savePackUnit: true }, 15);
    const write = fixture.execute.mock.calls.find(([sql]) => sql.includes("INSERT INTO material_pack_units"));
    expect(write?.[1]).toEqual([15, 713, "개", 0.75, "kg", 1, 1]);
    expect(fixture.draft).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 15, idempotencyKey: input.idempotencyKey,
      lines: [expect.objectContaining({ purchaseQuantity: 2, purchaseUnit: "개", stockQuantity: 1.5, stockUnit: "kg", unitPrice: 10455, totalPrice: 20910, taxAmount: 2091 })],
    }));
  });
  it("uses existing package settings without updating their factors", async () => {
    fixture.registered = true;
    await createPurchase({ ...input, savePackUnit: true }, 15);
    expect(fixture.execute.mock.calls.every(([sql]) => sql.trim().startsWith("SELECT"))).toBe(true);
    expect(fixture.draft.mock.calls[0][0].lines[0].stockQuantity).toBe(1.5);
  });
  it.each([["L", 750, "mL", 1.5], ["g", 0.75, "kg", 1500]])("normalizes packaging to %s", async (base, size, unit, stock) => {
    fixture.base = String(base); fixture.registered = true;
    await createPurchase({ ...input, packagingSize: Number(size), packagingUnit: String(unit) }, 15);
    expect(fixture.draft.mock.calls[0][0].lines[0]).toMatchObject({ stockQuantity: stock, stockUnit: base });
  });
  it("blocks incompatible dimensions without writes or inbound creation", async () => {
    await expect(createPurchase({ ...input, packagingUnit: "mL", savePackUnit: true }, 15)).rejects.toThrow("환산 설정이 없습니다");
    expect(fixture.draft).not.toHaveBeenCalled();
    expect(fixture.execute.mock.calls.every(([sql]) => sql.trim().startsWith("SELECT"))).toBe(true);
  });
  it.each(["ea", "pack"])("uses approved mushroom pack mapping for purchase unit %s without changing settings", async (unit) => {
    fixture.base = "ea"; fixture.registered = true;
    await createPurchase({ ...input, itemName: "시험 양송이", packagingSize: 1, packagingUnit: "pack", unit }, 15);
    expect(fixture.draft.mock.calls[0][0].lines[0]).toMatchObject({ purchaseQuantity: 2, purchaseUnit: unit, stockQuantity: unit === "ea" ? null : 2, stockUnit: unit === "ea" ? null : "ea" });
    expect(fixture.execute.mock.calls.every(([sql]) => sql.trim().startsWith("SELECT"))).toBe(true);
  });
  it("does not assume every pack means one ea", async () => {
    fixture.base = "ea";
    await expect(createPurchase({ ...input, packagingSize: 1, packagingUnit: "pack" }, 15)).rejects.toThrow("환산 설정이 없습니다");
    expect(fixture.draft).not.toHaveBeenCalled();
  });
});
