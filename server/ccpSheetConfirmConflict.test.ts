/**
 * 제출 확인 저장이 0건이면 성공으로 돌려주지 않는다 (2026-10-20, #611 추가 검토 5) — 실제 confirmSheet, 연결만 대역
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: string[] = [];
let updateAffected = 1;
const conn = {
  beginTransaction: vi.fn(async () => { calls.push("begin"); }),
  commit: vi.fn(async () => { calls.push("commit"); }),
  rollback: vi.fn(async () => { calls.push("rollback"); }),
  release: vi.fn(),
  query: vi.fn(async () => [[]]),
  execute: vi.fn(async (sql: string) => {
    if (/FROM h_ccp_form_records WHERE id = \? AND tenant_id = \? LIMIT 1 FOR UPDATE/.test(sql)) {
      calls.push("lock");
      return [[{ id: 1, ccp_type: "CCP-1B", wd: "2026-10-19", status: "submitted", rows_version: 3, field_mode: 0, cl_heat_time_min_lo: null, cl_heat_time_min_hi: null, cl_heat_temp_lo: null, cl_pressure_mpa_lo: null, cl_product_temp_lo: null }]];
    }
    if (/FROM h_ccp_form_rows/.test(sql)) return [[{ id: 11, batch_seq: 1, equipment_type: null, measurement_time: "05:00", heat_time_min: 10, heat_temp_c: 99, pressure_mpa: null, temp_edge_c: null, temp_center_c: null,
      result: "적합", is_deviation: 0, deviation_note: null, corrective_action: null, metal_pass_time: null, metal_fe_mid: null, metal_sus_mid: null, metal_product_only: null, metal_fe_product: null, metal_sus_product: null,
      pass_time_start: null, pass_time_end: null, pass_qty: null, pass_unit: null, detected_qty: null, row_version: 0, row_confirmed_at: null, row_confirmed_version: null }]];
    if (/^\s*UPDATE h_ccp_form_records SET confirmed_by/.test(sql)) { calls.push("update"); return [{ affectedRows: updateAffected }]; }
    throw new Error(`예상 밖 SQL: ${sql}`);
  }),
};
vi.mock("./db/connection", () => ({ getRawConnection: async () => ({ getConnection: async () => conn }) }));

describe("confirmSheet — 검사·저장 한 트랜잭션, 0건이면 충돌", () => {
  beforeEach(() => { calls.length = 0; });
  it("저장 1건 → 커밋하고 행 버전 반환", async () => {
    updateAffected = 1;
    const { confirmSheet } = await import("./lib/haccp/ccpSheetConfirm");
    await expect(confirmSheet(1, 2, 9)).resolves.toEqual({ rowsVersion: 3 });
    expect(calls).toEqual(["begin", "lock", "update", "commit"]);
  });
  it("저장 0건(그 사이 기록지가 바뀜) → 충돌 오류, 롤백, 성공으로 돌려주지 않음", async () => {
    updateAffected = 0;
    const { confirmSheet, SheetConfirmConflictError } = await import("./lib/haccp/ccpSheetConfirm");
    await expect(confirmSheet(1, 2, 9)).rejects.toBeInstanceOf(SheetConfirmConflictError);
    expect(calls).toEqual(["begin", "lock", "update", "rollback"]);
  });
});
