/**
 * 금속검출 정본·통과량 단위·생성 경로 (2026-10-18, PR-A2)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WRITE_METAL_PLAN_TABLES } from "./lib/haccp/metalRecordSource";
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf-8");

describe("금속검출 기록 정본 = 기록지 행", () => {
  it("계획 전용 표에 쓰지 않는다 (동기화·일괄 배정 모두 스위치로 막힘)", () => {
    expect(WRITE_METAL_PLAN_TABLES).toBe(false);
    expect(read("server/db/haccp/ccpFormSettings.ts")).toMatch(/if \(WRITE_METAL_PLAN_TABLES\) try \{/);
    expect(read("server/routers/production/batch.crud.router.ts")).toMatch(/if \(WRITE_METAL_PLAN_TABLES && successResults\.length > 0\)/);
  });
  it("재생성 생략은 이름뿐 아니라 통과행 수·통과량 합도 같아야 (같은 제품 2배치째·나중 SKU 실적 반영)", () => {
    expect(read("server/db/haccp/ccpFormSettings.ts")).toMatch(/linkedBatchExists && allProductsCovered && passageMatches/);
  });
});

describe("통과량 = 생산량, 단위 저장·표기", () => {
  it("SKU 실적이면 판매단위, 없으면 kg 를 행에 저장 · 인쇄는 단위를 붙인다", () => {
    const sync = read("server/db/haccp/ccpFormSettings.ts");
    expect(sync).toMatch(/passUnit: parseInt\(r\.sku_quantity\) \? \(r\.sales_unit \|\| "ea"\) : "kg"/);
    expect(sync).toMatch(/SET pass_unit = \? WHERE id = \? AND tenant_id = \?/);
    const print = read("client/src/components/print/CcpRenderers.tsx");
    expect(print).toMatch(/fmtPassQty\(row\.passQty \?\? row\.pass_qty, row\.passUnit \?\? row\.pass_unit\)/);
    expect(print).not.toMatch(/통과량\(개\)/);
  });
  it("두 생성 경로가 SKU 실적 저장 뒤 다시 동기화", () => {
    expect(read("server/routers/production/batch.crud.router.ts")).toMatch(/SKU 반영 재동기화/);
    expect(read("server/services/batchOrchestrator.ts")).toMatch(/SKU 반영 재동기화/);
  });
});

describe("기록지 생성", () => {
  it("1B/2B 는 배치 × 공정 별 — 공정 두 개인 배치의 두 번째 기록지 누락 방지", () => {
    expect(read("server/db/haccp/ccpFormRecordsCRUD.ts")).toMatch(/eq\(hCcpFormRecords\.processGroupId, params\.processGroupId\)/);
    expect(read("server/routers/production/batch.crud.router.ts")).toMatch(/batch_id=\? AND ccp_type=\? AND process_group_id=\? AND tenant_id=\?/);
  });
  it("단건 생성도 금속검출 감도 기준을 회사 설비에서 (DB 기본값 2.0/3.0/130 안 씀), 4P 인쇄 문구는 공정그룹", () => {
    expect(read("server/routers/production/batch.crud.router.ts")).toMatch(/cl_product_temp_lo, cl_fe_mm, cl_sus_mm, cl_metal_sensitivity/);
    const print = read("client/src/components/print/CcpRenderers.tsx");
    expect(print).not.toMatch(/벨트 중간 테스트피스|이물검출→작업중지/);
  });
});
