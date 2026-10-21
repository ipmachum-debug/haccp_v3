/**
 * LOT ↔ 재고 묶음 연결 정리 — 순수 분류·지문·승인 목록 검사 (2026-10-21, 단지 재고 정합 1단계)
 *   DB 동작(잠금 뒤 재확인·조건부 변경·되돌리기)은 server/saleLotStatus.mysql.test.ts 의 실 MySQL 시험.
 */
import { describe, it, expect } from "vitest";
import { classifyRelink, isMislinked, relinkFingerprint, approvedFromPlan, type RelinkInput, type RelinkPlanFile } from "../scripts/_lib/lotRelink";

const T = 2;
const base = (o: Partial<RelinkInput> = {}): RelinkInput => ({
  lotId: 11, lotNumber: "L-1", materialId: 200, lotUnit: "kg", lotStatus: "available", fromInventoryId: 31,
  parent: { tenantId: T, materialId: 100, productId: null, unit: "kg" },
  dests: [{ id: 32, unit: "kg" }],
  tx: [{ materialId: 200, unit: "kg", n: 3 }],
  ...o,
});

describe("연결이 틀린 LOT 인가", () => {
  it("같은 회사·같은 원료 묶음이면 대상 아님, 다른 원료·없는 묶음·다른 회사 묶음이면 대상", () => {
    expect(isMislinked(base({ parent: { tenantId: T, materialId: 200, productId: null, unit: "kg" } }), T)).toBe(false);
    expect(isMislinked(base(), T)).toBe(true);
    expect(isMislinked(base({ parent: null }), T)).toBe(true);
    expect(isMislinked(base({ parent: { tenantId: 9, materialId: 200, productId: null, unit: "kg" } }), T)).toBe(true);
    expect(isMislinked(base({ parent: { tenantId: T, materialId: null, productId: 5, unit: "kg" } }), T)).toBe(true); // 제품 묶음
  });
});

describe("분류 — READY 만 적용 후보", () => {
  it("같은 원료 묶음 1개·단위 같음·거래가 모두 같은 원료·단위 → READY, 목적지 = 그 묶음", () => {
    expect(classifyRelink(base(), T)).toMatchObject({ category: "READY", fromInventoryId: 31, fromMaterialId: 100, toInventoryId: 32, txCount: 3 });
    expect(classifyRelink(base({ lotUnit: " KG ", tx: [{ materialId: 200, unit: "Kg", n: 1 }] }), T).category).toBe("READY"); // 대소문자·공백
  });
  it("보류: 목적지 없음·여럿·단위 다름, 거래 없음·다른 원료·빈 원료·다른 단위", () => {
    const cat = (o: Partial<RelinkInput>) => classifyRelink(base(o), T).category;
    expect(cat({ dests: [] })).toBe("HOLD_DEST_NONE");
    expect(cat({ dests: [{ id: 32, unit: "kg" }, { id: 33, unit: "kg" }] })).toBe("HOLD_DEST_MULTI");
    expect(cat({ dests: [{ id: 32, unit: "g" }] })).toBe("HOLD_UNIT");
    expect(cat({ tx: [] })).toBe("HOLD_NO_TX");
    expect(cat({ tx: [{ materialId: 200, unit: "kg", n: 2 }, { materialId: 100, unit: "kg", n: 1 }] })).toBe("HOLD_TX_MATERIAL");
    expect(cat({ tx: [{ materialId: null, unit: "kg", n: 1 }] })).toBe("HOLD_TX_MATERIAL_NULL");
    expect(cat({ tx: [{ materialId: 200, unit: "g", n: 1 }] })).toBe("HOLD_TX_UNIT");
  });
  it("보고만: 묶음 없음·다른 회사 묶음 (목적지를 정하지 않음)", () => {
    expect(classifyRelink(base({ parent: null }), T)).toMatchObject({ category: "REPORT_PARENT_MISSING", toInventoryId: null });
    expect(classifyRelink(base({ parent: { tenantId: 9, materialId: 200, productId: null, unit: "kg" } }), T)).toMatchObject({ category: "REPORT_PARENT_OTHER_TENANT", toInventoryId: null });
  });
  it("다른 원료 거래가 빈 원료보다 먼저 판정 (더 강한 보류 사유)", () => {
    expect(classifyRelink(base({ tx: [{ materialId: null, unit: "kg", n: 1 }, { materialId: 100, unit: "kg", n: 1 }] }), T).category).toBe("HOLD_TX_MATERIAL");
  });
});

describe("지문·승인 목록", () => {
  const entries = [classifyRelink(base(), T), classifyRelink(base({ lotId: 12, tx: [] }), T), classifyRelink(base({ lotId: 13, fromInventoryId: 34 }), T)];
  const plan: RelinkPlanFile = { tool: "lot-inventory-relink", tenant: T, generatedAt: "x", fingerprint: relinkFingerprint(T, entries), lots: entries };
  it("지문은 READY 의 (LOT·지금 연결·목적지)로만, 순서와 무관 · 연결이 바뀌면 지문도 바뀜", () => {
    expect(relinkFingerprint(T, [...entries].reverse())).toBe(plan.fingerprint);
    expect(relinkFingerprint(T, entries.filter((e) => e.category === "READY"))).toBe(plan.fingerprint); // 보류는 지문에 없음
    expect(relinkFingerprint(T, [{ ...entries[0], fromInventoryId: 99 }, entries[2]])).not.toBe(plan.fingerprint);
    expect(relinkFingerprint(T + 1, entries)).not.toBe(plan.fingerprint);
  });
  it("승인 목록: READY 만 · 다른 회사 파일·고친 파일·빈 목록·READY 아닌 LOT 이 섞이면 아무것도 하지 않고 중단", () => {
    expect(approvedFromPlan(plan, T, [13, 11]).map((e) => e.lotId)).toEqual([13, 11]);
    expect(() => approvedFromPlan(plan, T, [11, 12])).toThrow(/READY 가 아닌 LOT 이 있다: 12/);
    expect(() => approvedFromPlan(plan, T, [11, 999])).toThrow(/999/);
    expect(() => approvedFromPlan(plan, T + 1, [11])).toThrow(/같은 회사/);
    expect(() => approvedFromPlan(plan, T, [])).toThrow(/비었다/);
    const edited = { ...plan, lots: plan.lots.map((e) => (e.lotId === 11 ? { ...e, toInventoryId: 77 } : e)) };
    expect(() => approvedFromPlan(edited, T, [11])).toThrow(/지문/);
  });
});
