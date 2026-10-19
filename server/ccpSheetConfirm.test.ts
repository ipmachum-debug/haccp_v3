/**
 * 제출 = 시트 확인 (2026-10-18, CEO 결정) — 서버 차단 규칙
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
vi.mock("./db/connection", () => ({ getRawConnection: vi.fn(), getDb: vi.fn() }));
const sync = vi.hoisted(() => ({ applyCcpFormDecision: vi.fn() }));
vi.mock("./db/haccp/ccpStatusSync", () => sync);
import { getRawConnection } from "./db/connection";
import { validateSheetForConfirm, isConfirmed, approveCcpFormRecord, attachCcpSheetConfirmState, type SheetRecord, type SheetRow } from "./lib/haccp/ccpSheetConfirm";

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
    const none = validateSheetForConfirm(rec(), [row({ heatTimeMin: 8, result: "부적합" })], NOW).join();
    expect(none).toMatch(/이탈내용이 없습니다/);
    expect(none).toMatch(/개선조치가 없습니다/);
    expect(validateSheetForConfirm(rec(), [row({ heatTimeMin: 8, result: "부적합", deviationNote: "8분 가열", correctiveAction: "재가열 후 재측정" })], NOW)).toEqual([]);
  });
  it("R590-04: 부적합은 이탈내용·개선조치 둘 다 — 하나만 있으면 막음 (이탈 체크도 같음)", () => {
    expect(validateSheetForConfirm(rec(), [row({ tempCenterC: 50, result: "부적합", deviationNote: "품온 50℃" })], NOW)).toEqual(["1번 행: 부적합인데 개선조치가 없습니다."]);
    expect(validateSheetForConfirm(rec(), [row({ tempCenterC: 50, result: "부적합", correctiveAction: "재가열" })], NOW)).toEqual(["1번 행: 부적합인데 이탈내용이 없습니다."]);
    expect(validateSheetForConfirm(rec(), [row({ isDeviation: 1, deviationNote: "설비 정지" })], NOW)).toEqual(["1번 행: 부적합인데 개선조치가 없습니다."]);
  });
  it("R590-03: 기준이 정해진 실측값이 비어 있으면 막음 — 0 은 값, '적합' 글자는 실측이 아님", () => {
    // Codex 재현: 품온 75 / 압력 0.16 기준, 시간·시각만 넣고 중심·모서리·압력 NULL
    const p = validateSheetForConfirm(rec({ clProductTempLo: 75, clHeatTempLo: null }), [row({ heatTimeMin: 5, tempCenterC: null, tempEdgeC: null, pressureMpa: null, heatTempC: null })], NOW).join();
    expect(p).toMatch(/중심 품온이 없습니다/);
    expect(p).toMatch(/모서리 품온이 없습니다/);
    expect(p).toMatch(/압력이 없습니다/);
    expect(p).not.toMatch(/가열온도/); // 1B 운영온도는 기준이 아님 (CEO 결정 1)
    // 기준이 없는 항목은 비어 있어도 됨
    expect(validateSheetForConfirm(rec({ clProductTempLo: null, clHeatTempLo: null, clPressureMpaLo: null }), [row({ tempCenterC: null, tempEdgeC: null, pressureMpa: null })], NOW)).toEqual([]);
    // 0 은 NULL 과 다르다 — 값으로 보고 기준과 비교
    expect(validateSheetForConfirm(rec({ clHeatTimeMinLo: null }), [row({ heatTimeMin: 0 })], NOW).join()).not.toMatch(/가열시간이 없습니다/);
    // CCP-2B 가열온도 기준이 있으면 가열온도 필요
    expect(validateSheetForConfirm(rec({ ccpType: "CCP-2B", clHeatTempLo: 180, clProductTempLo: null, clPressureMpaLo: null }), [row({ heatTempC: null })], NOW).join()).toMatch(/가열온도가 없습니다/);
  });
  it("R590-03: 금속검출 감도 다섯 칸이 비어 있으면 막음 (판정 '적합' 이어도)", () => {
    const sens = row({ measurementTime: null, heatTimeMin: null, metalPassTime: "08:30" });
    expect(validateSheetForConfirm(rec({ ccpType: "CCP-4P" }), [sens], NOW).join()).toMatch(/감도 점검 결과\(Fe 단독·SUS 단독·제품 단독·Fe\+제품·SUS\+제품\)가 없습니다/);
    const ok = row({ measurementTime: null, heatTimeMin: null, metalPassTime: "08:30", metalFeMid: "O", metalSusMid: "O", metalProductOnly: "X", metalFeProduct: "O", metalSusProduct: "O" });
    expect(validateSheetForConfirm(rec({ ccpType: "CCP-4P" }), [ok], NOW)).toEqual([]);
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
  it("제출 프로시저: 상태 바꾸기 전에 검사, 확인(검사·저장 한 트랜잭션)을 먼저 — 충돌이면 상태·결재 요청 그대로, 자동 제출된 기록지는 확인만", () => {
    const s = read("server/routers/haccp/ccpForm.router.ts");
    expect(s).toMatch(/checkSheet\(input\.formRecordId, ctx\.tenantId\)[\s\S]*await confirmSheet\(input\.formRecordId, ctx\.tenantId, ctx\.user\.id\);[\s\S]*pre\.record\.status === "submitted"[\s\S]*submitCcpFormRecord\(/);
    expect(s).toMatch(/SheetConfirmConflictError" \? "CONFLICT"/);
  });
  it("행 저장·삭제는 버전을 올림(승인된 기록지 거부) · 배치 승인 관문·기록지 단독 승인은 확인을 요구", () => {
    expect(read("server/db/haccp/ccpFormRowsOps.ts").match(/bumpSheetVersion\(/g)?.length).toBe(2);
    expect(read("server/db/production/batchApprovalOverview.ts")).toMatch(/작업자가 아직 제출\(시트 확인\)하지 않았습니다/);
    expect(read("server/db/system/auditApprovalSupplier.ts")).toMatch(/approveCcpFormRecord\(/);
  });
  it("R590-02: CCP 기록지 단독 요청은 모든 승인 경로가 공통 승인 서비스를 요청 승인 전에 부름", () => {
    const g = read("server/routers/checklist/genericChecklist.router.ts");
    // 개별 승인 · 일괄 승인 · 바로 승인(approveWithAutoReview) = 3곳, 반려 1곳
    expect(g.match(/referenceType === "ccp_form_record"\) await approveCcpFormRecord\(/g)?.length).toBe(3);
    expect(g).toMatch(/referenceType === "ccp_form_record"\) await rejectCcpFormRecord\(/);
    const f = read("server/lib/production/autoApprovalRequest.ts");
    expect(f).toMatch(/reference_type === "ccp_form_record"[\s\S]*approveCcpFormRecord\([\s\S]*UPDATE h_approval_requests/);
  });
  it("R590-01: 작업일은 서버가 기록지에서 읽음 — 화면이 Date 를 보내도 막히지 않음", () => {
    const s = read("server/routers/haccp/ccpForm.router.ts");
    expect(s).toMatch(/workDate: z\.union\(\[z\.string\(\), z\.date\(\)\]\)\.optional\(\)/);
    expect(s).toMatch(/workDate: pre\.record\.workDate/);
    const c = read("client/src/components/ccp/CcpMonitoringForms.tsx");
    expect(c).not.toMatch(/workDate: formRecord\.workDate/);
  });
  it("작업자 입력·확인된 금속검출 기록지는 재생성하지 않음", () => {
    expect(read("server/db/haccp/ccpFormSettings.ts")).toMatch(/CCP-4P 재생성 보류/);
  });
});

describe("approveCcpFormRecord — 확인 관문 → 기록지 승인 → 실제 승인됐는지 확인 (R590-02)", () => {
  const conn = (state: { confirmed: boolean; statusAfter: string }) => ({
    execute: vi.fn(async (q: string) => {
      if (/confirmed_rows_version FROM h_ccp_form_records/.test(q)) {
        return [[{ rows_version: 0, confirmed_at: state.confirmed ? "2026-10-18 12:00" : null, confirmed_rows_version: state.confirmed ? 0 : null }]];
      }
      if (/SELECT status FROM h_ccp_form_records/.test(q)) return [[{ status: state.statusAfter }]];
      return [[]];
    }),
  });
  it("미확인 기록지 → 거부, 기록지 상태 변경 없음", async () => {
    vi.mocked(getRawConnection).mockResolvedValue(conn({ confirmed: false, statusAfter: "submitted" }) as any);
    sync.applyCcpFormDecision.mockClear();
    await expect(approveCcpFormRecord(1847, 14, 44)).rejects.toThrow(/제출\(시트 확인\) 전/);
    expect(sync.applyCcpFormDecision).not.toHaveBeenCalled();
  });
  it("확인된 기록지 → 기록지 승인", async () => {
    vi.mocked(getRawConnection).mockResolvedValue(conn({ confirmed: true, statusAfter: "approved" }) as any);
    sync.applyCcpFormDecision.mockClear();
    await expect(approveCcpFormRecord(1847, 14, 44)).resolves.toBeUndefined();
    expect(sync.applyCcpFormDecision).toHaveBeenCalledWith({ formRecordId: 1847, decision: "approved", userId: 44, tenantId: 14 });
  });
  it("기록지가 실제로 승인되지 않으면 오류 → 요청도 승인하지 않음", async () => {
    vi.mocked(getRawConnection).mockResolvedValue(conn({ confirmed: true, statusAfter: "submitted" }) as any);
    await expect(approveCcpFormRecord(1847, 14, 44)).rejects.toThrow(/승인 반영에 실패/);
  });
});

describe("attachCcpSheetConfirmState — 승인관리 '미확인' 표시", () => {
  it("CCP 기록지 요청에만 확인 여부를 붙임", async () => {
    vi.mocked(getRawConnection).mockResolvedValue({
      query: vi.fn(async () => [[{ id: 10, rows_version: 2, confirmed_at: "x", confirmed_rows_version: 2 }, { id: 11, rows_version: 1, confirmed_at: null, confirmed_rows_version: null }]]),
    } as any);
    const out = await attachCcpSheetConfirmState([
      { id: 1, referenceType: "ccp_form_record", referenceId: 10 },
      { id: 2, referenceType: "ccp_form_record", referenceId: 11 },
      { id: 3, referenceType: "batch", referenceId: 10 },
    ], 14);
    expect(out.map((o) => o.ccpSheetConfirmed)).toEqual([true, false, undefined]);
  });
});
