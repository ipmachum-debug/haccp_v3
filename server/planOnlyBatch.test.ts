/**
 * 현장 1 (2026-10-19, CEO 정책) — 미래 날짜 생산 건은 '예정' 으로만, 원료는 그날 첫 확인에서
 *   만들 때: 진행 중·원료 출고·승인요청·기록지 자동 제출·일지 없음 (plan_only = 1)
 *   그날 첫 확인(시트 확인·시작·상태 변경·승인 요청): ensureBatchActivated 가 같은 실행 단계를 한 번 — 출고가 안 끝나면 예정으로 되돌림
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nextBatchAction } from "./lib/production/todayBoard";

const read = (p: string) => readFileSync(join(__dirname, p), "utf-8");

describe("미래 날짜 = 예정", () => {
  it("생산 건 만들기: 오늘 KST 보다 뒤 날짜면 실행 단계를 건너뛰고 plan_only = 1", () => {
    const o = read("services/batchOrchestrator.ts");
    expect(o).toMatch(/const planOnly = input\.workDate >= todayKST\(\);/); // 오늘도 예정 (하루 생산 흐름)
    expect(o).toMatch(/if \(planOnly\) \{\s*await \(await getRawConnection\(\)\)\.execute\(`UPDATE h_batches SET plan_only = 1/);
    // 실행 단계(진행 중·출고·승인요청·기록지 제출·일지)는 한 함수 — 만들 때와 그날 확인 때 같은 코드
    expect(o).toMatch(/async function runExecutionSteps\(/);
    expect(o.match(/await runExecutionSteps\(/g)?.length).toBe(2);
  });
  it("여러 건 한꺼번에(하루 단위): 미래 날짜면 일지·금속검출 승인요청·생산일지를 미리 만들지 않음", () => {
    const r = read("routers/production/batch.crud.router.ts");
    expect(r).toMatch(/const planOnlyDay = input\.workDate >= _today\(\);/);
    expect(r.match(/if \(!planOnlyDay && successResults\.length > 0\)/g)?.length).toBe(2);
    expect(r).toMatch(/if \(!planOnlyDay\) try \{\s*const \{ autoRegenerateProductionDaily \}/);
  });
});

describe("그날 첫 확인에서 한 번", () => {
  it("확인·시작·상태 변경은 먼저 ensureBatchActivated (예정일 전이면 거부), 승인은 기록지 미확인으로 이미 막힘", () => {
    expect(read("routers/haccp/ccpForm.router.ts")).toMatch(/ensureActivatedForFormRecord\(input\.formRecordId, ctx\.tenantId, ctx\.user\.id\)/);
    expect(read("routers/production/batch.crud.router.ts")).toMatch(/input\.status === "in_progress" \|\| input\.status === "completed"\) \{\s*const \{ ensureBatchActivated \}/);
    expect(read("routers/production/todayProduction.router.ts")).toMatch(/await ensureBatchActivated\(input\.batchId, ctx\.tenantId, ctx\.user\.id\)/);
    const gate = read("lib/production/batchApprovalGate.ts");
    expect(gate).not.toMatch(/batchOrchestrator/); // lib → services 의존 금지 (depcruise)
    expect(gate).toMatch(/if \(ov\.formBlockers\.length > 0\)/);
  });
  it("한 번만 (plan_only 1→0 을 먼저 잡음), 원료 출고 먼저 — 남은 줄이 있으면 예정으로 되돌리고 확인 완료로 만들지 않음", () => {
    const o = read("services/batchOrchestrator.ts");
    expect(o).toMatch(/UPDATE h_batches SET plan_only = 0 WHERE id = \? AND tenant_id = \? AND plan_only = 1/);
    expect(o).toMatch(/const revert = \(\) => conn\.execute\(\s*`UPDATE h_batches SET plan_only = 1, status = \? WHERE id = \? AND tenant_id = \?`/);
    expect(o).toMatch(/if \(left > 0\) \{\s*await revert\(\);/);
    // 출고 중 오류(상태 변경·출고·남은 줄 세기)도 예정으로 되돌림 — plan_only = 0 이 남으면 다시 확인할 때 출고를 건너뛴다 (#610 시범 전 재확인)
    expect(o).toMatch(/\} catch \(e\) \{\s*try \{ await revert\(\); \}[^\n]*\n\s*throw e;/);
    expect(o).toMatch(/throw new Error\(`원료 출고가 끝나지 않아 확인하지 않았습니다/);
    expect(o).toMatch(/\}, \{ startDone: true \}\);/); // 출고는 위에서 끝냈으니 실행 단계는 시작 부분 건너뜀
  });
  it("오늘 생산 목록: 예정 생산 건은 '예정' 으로 (확인 제출 할 일로 보이지 않음)", () => {
    expect(nextBatchAction({ status: "planned", approvalStatus: null, ccpForms: { total: 1, unconfirmed: 1, approved: 0 }, planOnly: true }))
      .toEqual({ label: "예정 — 그날 확인하면 시작 (원료는 그때 출고)", tone: "wait" });
    expect(nextBatchAction({ status: "planned", approvalStatus: null, ccpForms: { total: 1, unconfirmed: 1, approved: 0 } }).label).toMatch(/CCP 기록지 확인 제출/);
  });
});
