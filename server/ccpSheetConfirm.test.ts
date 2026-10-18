/**
 * 제출 = 시트 확인 (2026-10-18, CEO 결정) — 서버 차단 규칙
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
vi.mock("./db/connection", () => ({ getRawConnection: vi.fn(), getDb: vi.fn() }));
import { validateSheetForConfirm, isConfirmed, type SheetRecord, type SheetRow } from "./lib/haccp/ccpSheetConfirm";

const rec = (o: Partial<SheetRecord> = {}): SheetRecord => ({
  id: 1, ccpType: "CCP-1B", workDate: "2026-10-19", status: "submitted",
  clHeatTimeMinLo: 10, clHeatTimeMinHi: 15, clHeatTempLo: 90, clPressureMpaLo: 0.16, clProductTempLo: 90, ...o,
});
const row = (o: Partial<SheetRow> = {}): SheetRow => ({
  batchSeq: 1, equipmentType: null, measurementTime: "05:09", heatTimeMin: 10, heatTempC: 99, pressureMpa: 0.18,
  tempEdgeC: 99, tempCenterC: 99, result: "적합", isDeviation: 0, deviationNote: null, correctiveAction: null,
  metalPassTime: null, metalFeMid: null, metalSusMid: null, metalProductOnly: null, metalFeProduct: null, metalSusProduct: null,
  passTimeStart: null, passTimeEnd: null, passQty: null, ...o,
});
const NOW = { date: "2026-10-19", time: "10:00:00" };

describe("validateSheetForConfirm", () => {
  it("정상 시트 → 통과", () => {
    expect(validateSheetForConfirm(rec(), [row(), row({ batchSeq: 2, measurementTime: "05:19" })], NOW)).toEqual([]);
  });
  it("아직 시점이 오지 않은 점검·미래 작업일은 막음", () => {
    expect(validateSheetForConfirm(rec(), [row({ measurementTime: "14:30" })], NOW)[0]).toMatch(/14:30 이 아직 오지 않았습니다/);
    expect(validateSheetForConfirm(rec({ workDate: "2026-10-20" }), [row()], NOW)[0]).toMatch(/미래 점검/);
  });
  it("한계기준 이탈인데 '적합' 은 막고, '부적합' 이면 이탈내용·개선조치가 있어야 함", () => {
    expect(validateSheetForConfirm(rec(), [row({ heatTimeMin: 8 })], NOW)[0]).toMatch(/가열시간 8 < 10분.*'적합'/);
    expect(validateSheetForConfirm(rec(), [row({ tempCenterC: 85 })], NOW)[0]).toMatch(/중심 품온 85 < 90℃/);
    expect(validateSheetForConfirm(rec(), [row({ pressureMpa: 0.12 })], NOW)[0]).toMatch(/압력 0.12 < 0.16MPa/);
    expect(validateSheetForConfirm(rec(), [row({ heatTimeMin: 8, result: "부적합" })], NOW)[0]).toMatch(/이탈내용·개선조치가 없습니다/);
    expect(validateSheetForConfirm(rec(), [row({ heatTimeMin: 8, result: "부적합", deviationNote: "8분 가열 — 재가열" })], NOW)).toEqual([]);
  });
  it("정하지 않은 기준은 판정에서 뺀다 (압력 기준 없는 회사)", () => {
    expect(validateSheetForConfirm(rec({ clPressureMpaLo: null }), [row({ pressureMpa: 0.05 })], NOW)).toEqual([]);
  });
  it("필수값 누락 (측정시각·가열시간·판정)", () => {
    const p = validateSheetForConfirm(rec(), [row({ measurementTime: null, heatTimeMin: null, result: null })], NOW);
    expect(p.join()).toMatch(/판정이 없습니다/);
    expect(p.join()).toMatch(/측정시각이 없습니다/);
    expect(p.join()).toMatch(/가열시간이 없습니다/);
  });
  it("금속검출: 감도 결과가 기준과 다른데 적합 → 막음, 통과행은 시각·통과량 필요", () => {
    const r4 = rec({ ccpType: "CCP-4P" });
    const sens = row({ measurementTime: null, heatTimeMin: null, metalPassTime: "08:30", metalFeMid: "O", metalSusMid: "O", metalProductOnly: "O", metalFeProduct: "O", metalSusProduct: "O" });
    expect(validateSheetForConfirm(r4, [sens], NOW)[0]).toMatch(/감도 점검 결과가 기준과 다른데/);
    const pass = row({ batchSeq: 2, measurementTime: null, heatTimeMin: null, equipmentType: "passage", passTimeStart: "08:31", passTimeEnd: "09:58", passQty: null });
    expect(validateSheetForConfirm(r4, [pass], NOW)[0]).toMatch(/통과량이 없습니다/);
  });
  it("승인된 기록지는 다시 제출할 수 없음", () => {
    expect(validateSheetForConfirm(rec({ status: "approved" }), [row()], NOW)).toEqual(["이미 승인된 기록지입니다."]);
  });
});

describe("isConfirmed — 확인 뒤 행이 바뀌면 무효", () => {
  it("확인한 버전 = 현재 버전일 때만", () => {
    expect(isConfirmed({ confirmedAt: "2026-10-19 10:00", confirmedRowsVersion: 3, rowsVersion: 3 })).toBe(true);
    expect(isConfirmed({ confirmedAt: "2026-10-19 10:00", confirmedRowsVersion: 3, rowsVersion: 4 })).toBe(false);
    expect(isConfirmed({ confirmedAt: null, confirmedRowsVersion: null, rowsVersion: 0 })).toBe(false);
  });
});

describe("연결", () => {
  const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf-8");
  it("제출 프로시저: 상태 바꾸기 전에 검사, 자동 제출된 기록지는 확인만", () => {
    const s = read("server/routers/haccp/ccpForm.router.ts");
    expect(s).toMatch(/checkSheet\(input\.formRecordId, ctx\.tenantId\)[\s\S]*pre\.record\.status === "submitted"[\s\S]*confirmSheet/);
  });
  it("행 저장·삭제는 버전을 올림(승인된 기록지 거부) · 배치 승인 관문·기록지 단독 승인은 확인을 요구", () => {
    expect(read("server/db/haccp/ccpFormRowsOps.ts").match(/bumpSheetVersion\(/g)?.length).toBe(2);
    expect(read("server/db/production/batchApprovalOverview.ts")).toMatch(/작업자가 아직 제출\(시트 확인\)하지 않았습니다/);
    expect(read("server/db/system/auditApprovalSupplier.ts")).toMatch(/assertSheetConfirmedForApproval/);
  });
  it("작업자 입력·확인된 금속검출 기록지는 재생성하지 않음", () => {
    expect(read("server/db/haccp/ccpFormSettings.ts")).toMatch(/CCP-4P 재생성 보류/);
  });
});
