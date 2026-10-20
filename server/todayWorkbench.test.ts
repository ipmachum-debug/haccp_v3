/**
 * 오늘 생산 작업대 (PR-B) — 지금 할 일 · 화면 계약
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nextBatchAction } from "./lib/production/todayBoard";

const forms = (o: Partial<{ total: number; unconfirmed: number; approved: number }> = {}) => ({ total: 1, unconfirmed: 0, approved: 0, ...o });

describe("nextBatchAction — 생성·완료·승인은 다른 사건", () => {
  it("생성만 한 배치는 '작업 전' (완료로 보이지 않음)", () => {
    expect(nextBatchAction({ status: "planned", approvalStatus: null, ccpForms: forms() })).toEqual({ label: "작업 전", tone: "todo" });
  });
  it("CCP 기록지 미확인이 있으면 그게 먼저", () => {
    expect(nextBatchAction({ status: "completed", approvalStatus: "pending_review", ccpForms: forms({ unconfirmed: 2 }) }).label).toBe("CCP 기록지 확인 제출 2건");
  });
  it("승인 대기 · 반려 · 완료 · 취소", () => {
    expect(nextBatchAction({ status: "in_progress", approvalStatus: "pending_approval", ccpForms: forms() }).label).toBe("승인 대기");
    expect(nextBatchAction({ status: "planned", approvalStatus: "rejected", ccpForms: forms() }).tone).toBe("stop");
    expect(nextBatchAction({ status: "completed", approvalStatus: "approved", ccpForms: forms() }).label).toBe("완료");
    expect(nextBatchAction({ status: "cancelled", approvalStatus: null, ccpForms: forms({ unconfirmed: 1 }) }).label).toBe("취소됨");
  });
});

describe("화면·서버 계약", () => {
  const ui = readFileSync(join(__dirname, "../client/src/pages/production/TodayProductionWorkbench.tsx"), "utf-8");
  const crud = readFileSync(join(__dirname, "routers/production/batch.crud.router.ts"), "utf-8");
  it("요청 키 + 줄 키로 보내고, 생성 뒤 다른 화면으로 강제 이동하지 않음, 축하 효과 없음", () => {
    expect(ui).toMatch(/requestKey, siteId/);
    expect(ui).toMatch(/rowKey: e\.rowKey/);
    expect(ui).not.toMatch(/setLocation\(|navigate\(|confetti/i);
  });
  it("미리보기 뒤에만 생성, 입력이 바뀌면 다시 미리보기", () => {
    expect(ui).toMatch(/disabled=\{createMut\.isPending \|\| multiBusy \|\| !preview \|\| previewStale/);
  });
  it("SKU 는 제품 id 로 연결된 목록 (이름으로 맞추지 않음), AI 입력은 같은 제품을 합치지 않음", () => {
    expect(ui).toMatch(/productSku\.listByProduct\.useQuery\(\{ productId \}\)/);
    expect(ui).not.toMatch(/itemName === /);
  });
  it("일괄 생성: 이미 만든 줄은 재사용, 실패 줄만 다시, 새로 만든 줄만 그룹 후속 처리", () => {
    expect(crud).toMatch(/claim\.state === "done"/);
    // 이번에 준비까지 끝난 줄만 그룹 후속 처리 — 준비 미완·실패 줄은 생산 건 번호가 있어도 제외 (생산계획 생애주기 검토 4)
    expect(crud).toMatch(/results\.filter\(\(r: any\) => r\.batchId > 0 && r\.completedNow\)/);
    expect(crud).toMatch(/excludedEquipmentIds: input\.excludedEquipmentIds/);
  });
});

describe("자동 검사 — 매번 거치는 확인 단계 대신 '지금 막힌 것' (2026-10-20 생산 화면 하나로)", () => {
  const check = (o: Partial<{ setupPending: boolean; rows: { total: number; confirmed: number }; issueLines: number }> = {}) => ({ setupPending: false, rows: { total: 0, confirmed: 0 }, issueLines: 0, ...o });
  it("준비 미완 > 예정 > 원료 출고 확인 > 현장 확인 남음 > 기록지 제출", () => {
    expect(nextBatchAction({ status: "planned", approvalStatus: null, ccpForms: forms(), planOnly: true, check: check({ setupPending: true }) }).tone).toBe("stop");
    expect(nextBatchAction({ status: "planned", approvalStatus: null, ccpForms: forms(), planOnly: true, check: check({ rows: { total: 3, confirmed: 0 } }) }).tone).toBe("wait");
    expect(nextBatchAction({ status: "in_progress", approvalStatus: null, ccpForms: forms({ unconfirmed: 1 }), check: check({ issueLines: 2, rows: { total: 3, confirmed: 1 } }) }).label).toBe("원료 출고 확인 2줄");
    expect(nextBatchAction({ status: "in_progress", approvalStatus: null, ccpForms: forms({ unconfirmed: 1 }), check: check({ rows: { total: 3, confirmed: 1 } }) }).label).toBe("현장 확인 2건 남음");
    expect(nextBatchAction({ status: "in_progress", approvalStatus: null, ccpForms: forms({ unconfirmed: 1 }), check: check({ rows: { total: 3, confirmed: 3 } }) }).label).toBe("CCP 기록지 확인 제출 1건");
    // 확인·제출이 다 끝난 진행 중 → 생산 완료 입력 (승인 요청이 먼저 있어도)
    expect(nextBatchAction({ status: "in_progress", approvalStatus: "pending_approval", ccpForms: forms(), check: check({ rows: { total: 3, confirmed: 3 } }) }).label).toBe("생산 완료 입력");
  });
});

describe("생산 화면 하나 — 입력·클릭·이동이 줄었는가 (2026-10-20)", () => {
  const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf-8");
  it("출고 확인 판정은 생산 건 카드와 자동 검사가 같은 함수", async () => {
    const { lineExceptionKind, issueStarted } = await import("./lib/production/dayChecks");
    const base = { inventoryDeducted: false, quantity: 3, state: "none" as const, decision: null, issueHold: false };
    expect(lineExceptionKind(base, false)).toBeNull(); // 예정 — 정상 대기
    expect(lineExceptionKind(base, true)).toBe("unissued");
    expect(lineExceptionKind({ ...base, state: "ambiguous" as const }, false)).toBe("ambiguous");
    expect(lineExceptionKind({ ...base, inventoryDeducted: true }, true)).toBeNull();
    expect([issueStarted({ plan_only: 1, status: "planned" }), issueStarted({ plan_only: 0, status: "in_progress", mode: "manual" }), issueStarted({ plan_only: 0, status: "in_progress", mode: "auto" })]).toEqual([false, false, true]);
    expect(read("server/routers/production/batch.plan.router.ts")).toMatch(/const kindOf = \(i: any\) => lineExceptionKind\(i, started\);/);
  });
  it("한 화면: 하루 현황(파이프라인 대신)·계획(같은 날짜)·줄 펼침(현장 확인·출고 결정)·마감 한 자리·현장 보기, '생산 시작' 버튼 없음", () => {
    const ui = read("client/src/pages/production/TodayProduction.tsx");
    expect(ui).toMatch(/data-testid="day-status"/);
    expect(ui).toMatch(/<TodayProductionWorkbench embedded workDate=\{date\} hideBoard onCreated=/);
    expect(ui).toMatch(/<FieldRowsPanel pastDate=\{past\} heat=\{heat\} bare onChanged=\{onChanged\} \/>/);
    expect(ui).toMatch(/<LineIssueExceptions batchId=\{b\.id\} canResolve=\{isAdmin\} \/>/);
    expect(ui).toMatch(/scope: view === "all" \? "all" : "mine"/);
    expect(ui).not.toMatch(/todayProduction\.start|생산 시작<\/Button>/);
    // 생산 추가는 입력이 바뀌면 자동 미리보기 — [미리보기] 를 따로 누르지 않는다
    expect(read("client/src/pages/production/TodayProductionWorkbench.tsx")).toMatch(/const t = setTimeout\(\(\) => \{ if \(!previewMut\.isPending\) runPreview\(\); \}, 700\);/);
  });
  it("대표 기준 1~5 (2026-10-20): 계획 = 제품·수량만, 완료 = 계획값 기본, 현장 = 할 일만, 마감 한 자리(서버 검증·권한 그대로), 실패는 그 자리", () => {
    const ui = read("client/src/pages/production/TodayProduction.tsx");
    const wb = read("client/src/pages/production/TodayProductionWorkbench.tsx");
    // 1 — 줄에는 제품·수량·단위·삭제만, 나머지는 '예외·자세히' 안
    expect(wb).toMatch(/data-testid="plan-exceptions"/);
    expect(wb).toMatch(/data-testid="plan-summary"/);
    // 2 — 실제 생산량 기본값 = 계획값, 다를 때만 고침
    expect(ui).toMatch(/value=\{qty\[it\.b\.id\] \?\? String\(it\.b\.plannedKg \?\? ""\)\}/);
    expect(ui).toMatch(/: Number\(it\.b\.plannedKg \?\? 0\);/);
    // 3 — 작업자는 현장(지금 할 일)만, 끝난 행은 접음
    expect(ui).toMatch(/const view: "all" \| "mine" = isManager \? viewPref : "mine";/);
    expect(ui).toMatch(/const keep = \(r: any\) => !r\.confirmed \|\| !!ws\?\.pending\[r\.rowId\] \|\| !!ws\?\.editing\[r\.rowId\];/);
    // 4 — 마감: 기존 서버 경로 그대로 (제출·완료 전 점검·완료·작성자 제출·승인)
    for (const k of ["trpc.ccpForm.submit.useMutation", "utils.client.batch.checkCompletionReadiness.query", "trpc.batch.complete.useMutation", "trpc.approval.submitByWriter.useMutation", "trpc.approval.approve.useMutation"]) expect(ui).toContain(k);
    // 5 — 완료 처리 키는 성공할 때까지 같은 키, 막힌 줄에는 이유 + [고치기]
    expect(ui).toMatch(/keys\.current\[it\.b\.id\] \?\?= /);
    expect(ui).toMatch(/onClick=\{\(\) => onFix\(it\.b\.id\)\}>고치기</);
    // 기록지 확인 제출 = 작성자 단계 — 같은 확인을 결재에서 또 하지 않음 (관문 통과·pending_writer 일 때만 조건부로 넘김)
    const sub = read("server/routers/haccp/ccpForm.router.ts");
    expect(sub).toMatch(/await confirmSheet\(input\.formRecordId[\s\S]{0,900}advanceWriterStepOnSheetConfirm\(ctx\.tenantId, input\.formRecordId, ctx\.user\.id\)/);
    const gate = read("server/lib/haccp/ccpRequestGate.ts");
    expect(gate).toMatch(/const g = await checkCcpRequestGate\(tenantId, Number\(r\.id\)\);\s*if \(!g\.ok\) continue;/);
    expect(gate).toMatch(/WHERE id = \? AND tenant_id = \? AND status = 'pending_writer'/);
  });
  it("옛 화면은 같은 화면으로 — 현장 확인=내 설비, 배치 생성=생산 추가, 파이프라인=하루 현황, 파이프라인 탭 없음", () => {
    const app = read("client/src/App.tsx");
    expect(app).toMatch(/<Route path="\/dashboard\/batch\/new">\{\(\) => <LegacyRedirect to="\/dashboard\/production\/today\?add=1&view=all" \/>\}<\/Route>/);
    const reg = read("shared/navigation/menuRegistry.ts");
    expect(reg).toMatch(/\{ from: "\/dashboard\/field", to: "\/dashboard\/production\/today\?view=mine"/);
    expect(reg).toMatch(/\{ from: "\/dashboard\/pipeline", to: "\/dashboard\/production\/today\?view=all"/);
    expect(read("client/src/pages/production/ProductionManagement.tsx")).not.toMatch(/value="pipeline"/);
  });
});

describe("지난 날짜 기록 — 실제 시각 필수, 예정값을 실측으로 인정하지 않음 (2026-10-20, 10/15 복구 뒤)", () => {
  const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf-8");
  it("서버: 지난 날짜 확인·통과는 사람이 넣은 시각만 — 없으면 거부, 이력에 lateEntryOf", () => {
    const fw = read("server/services/fieldWork.ts");
    expect(fw).toMatch(/const past = String\(form\.wd \?\? ""\) !== "" && String\(form\.wd\) < todayKST\(\);/);
    expect(fw).toMatch(/if \(!past\) return t;/);
    expect(fw).toMatch(/지금 시각이나 예정 시각으로 채우지 않습니다/);
    expect(fw).toMatch(/\.\.\.\(lateEntryOf \? \{ lateEntryOf \} : \{\}\)/);
  });
  it("화면: 지난 날짜면 [확인] 이 실제 시각 칸을 열고(예정 시각 미리 채우지 않음), 예전 방식 기록지는 마감 표에서 '제출됨' 으로 보이지 않음", () => {
    const p = read("client/src/components/production/FieldRowsPanel.tsx");
    expect(p).toMatch(/r\.confirmed \? \(r\.values\?\.\[f\.key\] \?\? r\.measurementTime \?\? null\) : null/);
    expect(read("client/src/pages/production/TodayProduction.tsx")).toMatch(/const legacy = !finished && !b\.planOnly && b\.check\.rows\.total === 0 && b\.ccpForms\.total > 0;/);
    expect(read("client/src/components/ccp/CcpMonitoringForms.tsx")).toMatch(/data-testid="past-form-note"/);
  });
});

