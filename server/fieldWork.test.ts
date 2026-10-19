/**
 * 하루 생산 흐름 (2026-10-19) — 현장 확인 규칙
 *   실제 DB 종단(계획 → 첫 확인 출고 → 금속검출 통과 → 마감·결재 관문, 중복 클릭·재시도·동시·확인 후 수정)은 임시 DB 시험으로 검증.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateSheetForConfirm, type SheetRecord, type SheetRow } from "./lib/haccp/ccpSheetConfirm";

const read = (p: string) => readFileSync(join(__dirname, p), "utf-8");
const rec = (o: Partial<SheetRecord> = {}): SheetRecord => ({ id: 1, ccpType: "CCP-1B", workDate: "2026-10-19", status: "submitted", clHeatTimeMinLo: 10, clHeatTimeMinHi: null, clHeatTempLo: null, clPressureMpaLo: null, clProductTempLo: null, ...o });
const row = (o: Partial<SheetRow> = {}): SheetRow => ({
  batchSeq: 1, equipmentType: null, measurementTime: "05:00", heatTimeMin: 10, heatTempC: 99, pressureMpa: null, tempEdgeC: null, tempCenterC: null,
  result: "적합", isDeviation: 0, deviationNote: null, correctiveAction: null, metalPassTime: null, metalFeMid: null, metalSusMid: null, metalProductOnly: null,
  metalFeProduct: null, metalSusProduct: null, passTimeStart: null, passTimeEnd: null, passQty: null, ...o,
});
const NOW = { date: "2026-10-19", time: "12:00:00" };

describe("현장 확인 기록지 — 행마다 사람의 확인", () => {
  it("현장 확인 기록지는 확인 안 된 행(확인 뒤 고친 행 포함)이 있으면 제출할 수 없다", () => {
    expect(validateSheetForConfirm(rec({ fieldMode: true }), [row({ rowConfirmed: true }), row({ batchSeq: 2, rowConfirmed: false })], NOW)).toEqual(["2번 행: 현장 확인 전입니다."]);
    expect(validateSheetForConfirm(rec({ fieldMode: true }), [row({ rowConfirmed: true })], NOW)).toEqual([]);
  });
  it("예전 기록지(fieldMode 아님)는 예전 규칙 그대로", () => {
    expect(validateSheetForConfirm(rec(), [row({ rowConfirmed: false })], NOW)).toEqual([]);
  });
});

describe("배선 — 오늘도 예정, 첫 확인에서 출고, 결재 앞 단계 관문", () => {
  it("오늘·미래는 예정(plan_only), 지난 날짜만 바로 실행", () => {
    expect(read("services/batchOrchestrator.ts")).toMatch(/const planOnly = input\.workDate >= todayKST\(\);/);
  });
  it("현장 쓰기: 같은 요청 키는 한 번, 행 버전이 다르면 거부, 가열 확인·통과 시작에서만 예정 생산 건 실행, 이력은 추가만", () => {
    const f = read("services/fieldWork.ts");
    expect(f).toMatch(/const prev = await priorResult\(p, input\.tenantId, input\.requestId\);/);
    expect(f).toMatch(/if \(Number\(row\.row_version\) !== Number\(input\.expectedRowVersion\)\)/);
    expect(f).toMatch(/if \(input\.action === "confirm" && kind === "heat"\) await activateBatch/);
    expect(f).toMatch(/if \(input\.action === "pass_start" && kind === "passage"\) await activateBatch/);
    expect(f).not.toMatch(/UPDATE h_ccp_row_events|DELETE FROM h_ccp_row_events/);
  });
  it("작성자 제출·검토에도 CCP 관문", () => {
    expect(read("routers/system/approval.router.ts")).toMatch(/assertCcpRequestGate\(ctx\.tenantId, input\.approvalRequestId\)/);
    expect(read("routers/system/approval.router.ts")).toMatch(/checkCcpRequestGate\(ctx\.tenantId, reqId\)/);
    expect(read("routers/checklist/genericChecklist.router.ts")).toMatch(/assertCcpRequestGate\(ctx\.tenantId, input\.approvalRequestId\)/);
  });
  it("새 금속검출 기록지는 무작위 시각 없이 (현장 확인 기록지 분기)", () => {
    expect(read("db/haccp/ccpFormSettings.ts")).toMatch(/Number\(fr\.field_mode \?\? 0\) === 1 && fr\.work_date\) \{\s*const \{ syncFieldMetalRows \}/);
    expect(read("lib/haccp/fieldMetalRows.ts")).not.toMatch(/seededRandom|computeRandomOffset|Math\.random/);
  });
});
