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
    expect(read("services/batchOrchestrator.ts")).toMatch(/let planOnly = input\.workDate >= todayKST\(\);/);
  });
  it("현장 쓰기: 같은 요청 키는 한 번, 행 버전이 다르면 거부, 가열 확인·통과 시작에서만 예정 생산 건 실행, 이력은 추가만", () => {
    const f = read("services/fieldWork.ts");
    expect(f).toMatch(/const prev = await priorResult\(p, input\.tenantId, input\.requestId\);/);
    expect(f).toMatch(/if \(Number\(row\.row_version\) !== Number\(input\.expectedRowVersion\)\)/);
    expect(f).toMatch(/if \(action === "confirm" && kind === "heat"\) return form\.batch_id/);
    expect(f).toMatch(/if \(action === "pass_start" && kind === "passage"\) return row\.row_batch_id/);
    expect(f).not.toMatch(/UPDATE h_ccp_row_events|DELETE FROM h_ccp_row_events/);
  });
  it("첫 확인 = 한 트랜잭션: 행 잠금 → 거부 검사 → 생산 건 잠금·예정 해제·출고(같은 연결) → 행 저장 → 이력 → 커밋, 커밋 뒤 실행 단계 (#611 검토 P1)", () => {
    const f = read("services/fieldWork.ts");
    const body = f.slice(f.indexOf("export async function writeFieldRow"), f.indexOf("async function currentState("));
    const order = ["await c.beginTransaction();", "loadRow(c, input.rowId, input.tenantId, true)", "planWrite(form, row, input, { passCrossesMidnight: crossing });", "activateBatchInTx(c, activationBatchId", "UPDATE h_ccp_form_rows SET", "await addEvent(c,", "await c.commit();", "finishBatchActivation(activation)"];
    const at = order.map((x) => body.indexOf(x));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
    expect(body).not.toMatch(/ensureBatchActivated/);
    const o = read("services/batchOrchestrator.ts");
    expect(o).toMatch(/FROM h_batches b LEFT JOIN h_products_v2 p ON p\.id = b\.product_id AND p\.tenant_id = b\.tenant_id\s*WHERE b\.id = \? AND b\.tenant_id = \? FOR UPDATE/);
    expect(o).toMatch(/autoIssueMaterialsDispatch\(batchId, userId, tenantId, \{ txConn: conn \}\)/);
  });
  it("예전 기록지 화면으로 고친 현장 행 — 잠금·저장·확인 무효·이력이 한 트랜잭션", () => {
    const r = read("routers/haccp/ccpForm.router.ts");
    expect(r).toMatch(/saveFieldRowFromLegacy\(\{/);
    const f = read("services/fieldWork.ts");
    const body = f.slice(f.indexOf("export async function saveFieldRowFromLegacy"));
    const order = ["await c.beginTransaction();", "FOR UPDATE", "UPDATE h_ccp_form_rows SET", "bumpSheetVersion(c,", "event: \"edit_legacy\"", "await c.commit();"];
    const at = order.map((x) => body.indexOf(x));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
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

describe("금속검출 통과 행 — 생산 건 + SKU 번호, 단위 유지 (#611 추가 검토 3)", async () => {
  const { passageWants } = await import("./lib/haccp/fieldMetalRows");
  const src = (o: Record<string, unknown>) => ({ batch_id: 1, planned_quantity: 0, product_name: "떡", sku_id: null, sku_name: null, sales_unit: null, sku_quantity: 0, ...o });
  it("SKU 없음 → kg 한 줄, 소수 3자리 그대로 (20.286 → 20.286)", () => {
    expect(passageWants([src({ planned_quantity: "20.2861" })])).toEqual([{ batchId: 1, skuId: null, name: "떡", product: "떡", qty: 20.286, unit: "kg" }]);
  });
  it("수량 0 인 SKU 는 행을 만들지 않고, 유효 SKU 가 있으면 kg 대체 행도 없음", () => {
    const w = passageWants([src({ planned_quantity: 120, sku_id: 7, sku_name: "떡 1팩", sales_unit: "pack", sku_quantity: 100 }), src({ planned_quantity: 120, sku_id: 8, sku_name: "떡 박스", sales_unit: "box", sku_quantity: 0 })]);
    expect(w.map((x) => [x.skuId, x.qty, x.unit])).toEqual([[7, 100, "pack"]]);
  });
  it("이름이 같아도 SKU 번호가 다르면 따로, 단위를 섞어 더하지 않음 (10팩 + 2박스 → 두 줄)", () => {
    const w = passageWants([src({ sku_id: 7, sku_name: "떡", sales_unit: "pack", sku_quantity: 10 }), src({ sku_id: 9, sku_name: "떡", sales_unit: "box", sku_quantity: 2 })]);
    expect(w.map((x) => [x.skuId, x.qty, x.unit])).toEqual([[7, 10, "pack"], [9, 2, "box"]]);
  });
  it("같은 SKU 번호의 실적 여러 행은 합침, 생산 건이 다르면 따로", () => {
    const w = passageWants([src({ sku_id: 7, sales_unit: "pack", sku_quantity: 3 }), src({ sku_id: 7, sales_unit: "pack", sku_quantity: 4 }), src({ batch_id: 2, planned_quantity: 5 })]);
    expect(w.map((x) => [x.batchId, x.skuId, x.qty, x.unit])).toEqual([[1, 7, 7, "pack"], [2, null, 5, "kg"]]);
  });
});

describe("금속검출 제출 검사 — 수량·시간 순서 (#611 추가 검토 4)", () => {
  const pass = (o: Partial<SheetRow> = {}) => row({ equipmentType: "passage", measurementTime: null, heatTimeMin: null, heatTempC: null, passTimeStart: "09:00", passTimeEnd: "09:30", passQty: 10, passUnit: "kg", rowConfirmed: true, ...o });
  const r4 = rec({ ccpType: "CCP-4P", fieldMode: true, clHeatTimeMinLo: null });
  it("종료가 시작보다 앞서면 막음, 자정을 넘긴 것이 이력으로 확인되면 허용", () => {
    expect(validateSheetForConfirm(r4, [pass({ passTimeStart: "09:00", passTimeEnd: "08:00" })], NOW).join()).toMatch(/통과 종료\(08:00\)가 시작\(09:00\)보다 앞섭니다/);
    expect(validateSheetForConfirm(r4, [pass({ passTimeStart: "23:50", passTimeEnd: "00:20", passCrossesMidnight: true })], NOW)).toEqual([]);
  });
  it("음수·숫자 아님 막음, kg 소수 3자리까지, 개수 단위는 정수, 0 은 이 검사로 막지 않음", () => {
    expect(validateSheetForConfirm(r4, [pass({ passQty: -10 })], NOW).join()).toMatch(/음수/);
    expect(validateSheetForConfirm(r4, [pass({ passQty: 20.2861 })], NOW).join()).toMatch(/소수 3자리/);
    expect(validateSheetForConfirm(r4, [pass({ passQty: 20.286 })], NOW)).toEqual([]);
    expect(validateSheetForConfirm(r4, [pass({ passQty: 2.5, passUnit: "box" })], NOW).join()).toMatch(/정수/);
    expect(validateSheetForConfirm(r4, [pass({ passQty: 0 })], NOW)).toEqual([]);
    expect(validateSheetForConfirm(r4, [pass({ detectedQty: -1 })], NOW).join()).toMatch(/검출 수.*음수/);
  });
});

describe("#612 추가 검토 — 재전송·동기화·실행 단계", () => {
  it("재전송은 처음 요청 그대로(행 버전 포함) — 화면이 새 버전을 받아도 올려 붙이지 않음", () => {
    const ui = readFileSync(join(__dirname, "../client/src/components/production/FieldRowsPanel.tsx"), "utf-8");
    expect(ui).toMatch(/const expectedRowVersion = retry \? retry\.expectedRowVersion : row\.rowVersion;/);
    expect(ui).toMatch(/await write\.mutateAsync\(\{ rowId: row\.rowId, action: action as any, expectedRowVersion, values, requestId \}\);/);
  });
  it("금속검출 동기화: 쓰는 순간에도 손 안 댄 행만 (읽은 버전·사람 흔적 없음 조건), 같은 기록지 동기화는 하나씩, 승인된 기록지 그대로", () => {
    const f = read("lib/haccp/fieldMetalRows.ts");
    expect(f.match(/AND \$\{UNTOUCHED_AT\}`/g)?.length).toBe(3);
    expect(f).toMatch(/GET_LOCK\(\?, 15\)/);
    expect(f).toMatch(/if \(!rec \|\| String\(rec\.status\) === "approved"\) return 0;/);
  });
  it("실행 단계: 실행권과 끝남을 분리 — 필수 단계가 다 성공해야 남음 0, 같은 요청 키 재시도도 남은 단계를 이어서", () => {
    const o = read("services/batchOrchestrator.ts");
    expect(o).toMatch(/SET activation_claimed_at = NOW\(\) WHERE id = \? AND tenant_id = \? AND activation_pending = 1/);
    expect(o).toMatch(/ok \? `UPDATE h_batches SET activation_pending = 0, activation_claimed_at = NULL/);
    const fw = read("services/fieldWork.ts");
    expect(fw.match(/await resumeForRow\(p, Number\(/g)?.length).toBe(3);
  });
});
