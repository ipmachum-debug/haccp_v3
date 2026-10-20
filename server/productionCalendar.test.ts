/**
 * 달력·생산 화면 표시 (2026-10-20 대표 달력 기준 + Codex 복구 후 표시 검토)
 *   3가지 상태(작업계획·진행중·완료) · 날짜 → 품목 → 생산 건 · 무효·취소는 정상 달력·합계에서 빼고 이력으로 ·
 *   모르는 상태를 '계획' 으로 바꾸지 않음 · '+N분' 대신 저장된 예정 시각 · 4P 기준 'undefined' 없음.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { batchState, batchStatusLabel, groupByProduct, productState, sumKg } from "../client/src/lib/productionState";
import { clSummary } from "../client/src/components/ccp/ccpCl";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf-8");

describe("생산 상태 3가지", () => {
  it("계획·예정 = 작업계획, 진행·일시정지 = 진행중, 완료·검토·출하·보관 = 완료, 무효·취소 = 이력", () => {
    expect(batchState({ status: "planned" })).toBe("plan");
    expect(batchState({ status: "planned", planOnly: true })).toBe("plan");
    expect(batchState({ status: "in_progress" })).toBe("work");
    expect(batchState({ status: "paused" })).toBe("work");
    for (const s of ["completed", "under_review", "shipped", "archived"]) expect(batchState({ status: s })).toBe("done");
    expect(batchState({ status: "cancelled" })).toBe("void");
    expect(batchState({ status: "completed", voidedAt: "2026-10-20 12:53:07" })).toBe("void");
  });
  it("모르는 상태는 '계획' 으로 바꾸지 않는다 — 그대로 보인다", () => {
    expect(batchState({ status: "failed" })).toBe("other");
    expect(batchState({ status: "weird" })).toBe("other");
    expect(batchStatusLabel({ status: "weird" })).toBe("weird");
    expect(batchStatusLabel({ status: "failed" })).toBe("실패");
    expect(batchStatusLabel({ status: "cancelled", voidedAt: "x" })).toBe("무효(중복)");
  });
  it("품목 색: 모두 완료 = 완료, 하나라도 시작 = 진행중, 모두 시작 전 = 작업계획, 무효는 보지 않음", () => {
    expect(productState(["done", "done"])).toBe("done");
    expect(productState(["done", "plan"])).toBe("work");
    expect(productState(["plan", "work"])).toBe("work");
    expect(productState(["plan", "plan"])).toBe("plan");
    expect(productState(["plan", "void"])).toBe("plan");
    expect(productState(["done", "void"])).toBe("done");
  });
  it("품목으로 묶기만 (생산 건은 그대로), 합계는 값 있는 것만 더함", () => {
    const g = groupByProduct([
      { id: 1, productId: 7, productName: "가", batchCode: "B1" },
      { id: 2, productId: 8, productName: "나", batchCode: "B2" },
      { id: 3, productId: 7, productName: "가", batchCode: "B3" },
    ]);
    expect(g.map((x) => [x.name, x.items.map((i) => i.id)])).toEqual([["가", [1, 3]], ["나", [2]]]);
    expect(sumKg(["10", 12.5, null, ""])).toBe(22.5);
    expect(sumKg([null])).toBeNull();
  });
});

describe("달력·생산 화면 — 무효 분리, 날짜 → 품목 → 생산 건", () => {
  it("달력: 무효·취소는 정상 칸·합계에서 빼고 날짜 상세의 접힌 이력(대체 생산 건 링크), '계획' 기본값 없음", () => {
    const s = read("client/src/pages/production/BatchList.tsx");
    expect(s).toMatch(/const map = isVoided\(b\) \? voided : live;/);
    expect(s).toMatch(/groupByProduct\(dayBatches\)/);
    expect(s).toMatch(/productState\(g\.items\.map/);
    expect(s).toMatch(/day-void-history/);
    expect(s).toMatch(/→ 대체/);
    expect(s).toMatch(/withMarks: true/);
    expect(s).not.toMatch(/\|\| "계획"/);
    expect(s).not.toMatch(/styles\.planned/);
  });
  it("서버: 목록에 무효·대체·예정 표시, 달력 표시(확인 남음·출고 보류·결재 대기)는 무효가 아닌 건만", () => {
    const s = read("server/db/production/batchCRUD.ts");
    expect(s).toMatch(/voidedAt: row\.voided_at \?\? null/);
    expect(s).toMatch(/supersededByBatchId: row\.superseded_by_batch_id/);
    expect(s).toMatch(/filter\(\(r\) => !r\.voided_at && r\.status !== "cancelled"\)/);
    const d = read("server/lib/production/dayChecks.ts");
    expect(d).toMatch(/export async function loadBatchMarks/);
    expect(d).toMatch(/f\.ccp_type <> 'CCP-4P' AND f\.batch_id IN/);
  });
  it("생산 화면: 품목 줄(하루 합계·공정 회차) → 생산 건 줄 → 회차, 무효는 품목 합계 밖 이력", () => {
    const s = read("client/src/pages/production/TodayProduction.tsx");
    expect(s).toMatch(/groupByProduct\(live\)/);
    expect(s).toMatch(/function ProductLine/);
    expect(s).toMatch(/if \(g\.items\.length === 1\)/); // 생산 건 하나뿐인 품목은 한 줄
    expect(s).toMatch(/product-rounds/);
    expect(s).toMatch(/batch-rounds/);
    expect(s).toMatch(/void-history/);
    expect(read("server/routers/production/batch.plan.router.ts")).toMatch(/productId: r\.product_id != null/);
  });
  it("상세: 무효 생산 건은 맨 위 안내 + 확인·마감·승인 동작 숨김", () => {
    const s = read("client/src/pages/production/BatchDetail.tsx");
    expect(s).toMatch(/voided-banner/);
    expect(s).toMatch(/\{!voided && <Card>/);
    expect(s).toMatch(/\{batch && !voided && \(/);
    expect(s).toMatch(/canResolve=\{!voided &&/);
    expect(s).not.toMatch(/: "계획"\}/);
  });
});

describe("기록지 표시", () => {
  it("'+N분' 계산 간격 대신 저장된 예정 시각", () => {
    const s = read("client/src/components/ccp/CcpMonitoringForms.tsx");
    expect(s).not.toMatch(/\+\{a\.timeOffset\}분|\+\{timeOffset\}분/);
    expect(s).toMatch(/existingRow\?\.plannedTime/);
    expect(read("server/db/haccp/ccpFormRowsOps.ts")).toMatch(/pass_unit, planned_time/);
  });
  it("4P 기준 요약에 정하지 않은 값은 빼고 ('감도 undefined' 없음)", () => {
    expect(clSummary("CCP-4P", {})).toBe("-");
    expect(clSummary("CCP-4P", { feMm: 1.5 })).toBe("Fe 1.5mmΦ 불검출");
    expect(clSummary("CCP-4P", { metalSensitivity: 3, feMm: 1.5, susMm: 2 })).toBe("감도 3 · Fe 1.5mmΦ 불검출 · SUS 2mmΦ 불검출");
  });
});
