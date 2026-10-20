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
    // 예정 표시는 생산 건을 만드는 같은 INSERT 에 (따로 UPDATE 하다 멈추면 예정 아닌 계획이 남았다 — 생산계획 생애주기 검토 4)
    expect(o).toMatch(/planOnly,\s*activationPending: !planOnly,/);
    expect(read("db/production/batchCRUD.ts")).toMatch(/create_request_id, plan_only, activation_pending, setup_pending\)/);
    // 지난 날짜(즉시 실행): 실행권을 잡고 필수 단계가 다 성공해야 남음 0 (#612 추가 검토 3)
    expect(o).toMatch(/if \(!planOnly\) \{[^]*?activation_claimed_at = NOW\(\) WHERE id = \? AND tenant_id = \? AND activation_pending = 1/);
    expect(o).toMatch(/finishBatchActivation\(\{[^]*?\}, \{ startDone: false \}\);/);
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
    // 상태 변경: 진행 중만 시작 경로(첫 확인과 같은 실행), 완료는 [완료] 창으로만 (생산계획 생애주기 검토 2)
    expect(read("routers/production/batch.crud.router.ts")).toMatch(/if \(input\.status === "in_progress"\) \{[^]*?const \{ ensureBatchActivated \}/);
    expect(read("routers/production/batch.crud.router.ts")).toMatch(/if \(input\.status === "completed"\) \{\s*throw new TRPCError/);
    expect(read("routers/production/todayProduction.router.ts")).toMatch(/await ensureBatchActivated\(input\.batchId, ctx\.tenantId, ctx\.user\.id\)/);
    const gate = read("lib/production/batchApprovalGate.ts");
    expect(gate).not.toMatch(/batchOrchestrator/); // lib → services 의존 금지 (depcruise)
    expect(gate).toMatch(/if \(ov\.formBlockers\.length > 0\)/);
  });
  it("한 번만 (생산 건 행 잠금 뒤 plan_only 1→0), 원료 출고 먼저 — 남은 줄이 있으면 throw (호출자 롤백 → 예정·출고 모두 그대로), 실행 단계는 커밋 뒤 한 번", () => {
    const o = read("services/batchOrchestrator.ts");
    const inTx = o.slice(o.indexOf("export async function activateBatchInTx"), o.indexOf("export async function finishBatchActivation"));
    expect(inTx).toMatch(/WHERE b\.id = \? AND b\.tenant_id = \? FOR UPDATE/);
    expect(inTx).toMatch(/UPDATE h_batches SET plan_only = 0, activation_pending = 1 WHERE id = \? AND tenant_id = \?/);
    expect(inTx).toMatch(/throw new Error\(`원료 출고가 끝나지 않아 확인하지 않았습니다/);
    expect(inTx).not.toMatch(/runExecutionSteps|plan_only = 1/); // 되돌리기 없음 — 롤백이 되돌린다
    expect(o).toMatch(/UPDATE h_batches SET activation_claimed_at = NOW\(\) WHERE id = \? AND tenant_id = \? AND activation_pending = 1/);
    expect(o).toMatch(/ok \? `UPDATE h_batches SET activation_pending = 0, activation_claimed_at = NULL/);
    expect(o).toMatch(/\}, \{ startDone: opts\.startDone \?\? true \}\);/); // 첫 확인은 출고를 끝냈으니 시작 부분 건너뜀 (지난 날짜가 멈춘 경우만 시작부터)
    expect(o).toMatch(/withTransaction\(\(conn\) => activateBatchInTx\(conn, batchId, tenantId, userId\), "ensureBatchActivated"\)/);
  });
  it("오늘 생산 목록: 예정 생산 건은 '예정' 으로 (확인 제출 할 일로 보이지 않음)", () => {
    expect(nextBatchAction({ status: "planned", approvalStatus: null, ccpForms: { total: 1, unconfirmed: 1, approved: 0 }, planOnly: true }))
      .toEqual({ label: "예정 — 그날 첫 확인에서 시작 (원료는 그때 출고)", tone: "wait" });
    expect(nextBatchAction({ status: "planned", approvalStatus: null, ccpForms: { total: 1, unconfirmed: 1, approved: 0 } }).label).toMatch(/CCP 기록지 확인 제출/);
  });
});
