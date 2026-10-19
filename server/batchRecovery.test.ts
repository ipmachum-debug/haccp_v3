/**
 * 이력 보존형 복구 (2026-10-19) — 무효 생산 건 표시·차단 경로
 *   실제 DB 동작(역거래·LOT·수불부·결재·재시도·동시·중간 실패)은 saleLotStatus.mysql.test.ts '이력 보존형 복구'
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nextBatchAction } from "./lib/production/todayBoard";

const read = (p: string) => readFileSync(join(__dirname, p), "utf-8");

describe("무효(중복) 생산 건 — 오늘 생산 목록", () => {
  it("대체 생산 건 번호와 함께 '무효(중복)' — 취소·할 일로 보이지 않음", () => {
    const f = { total: 1, unconfirmed: 1, approved: 0 };
    expect(nextBatchAction({ status: "cancelled", approvalStatus: "cancelled", ccpForms: f, voidedSupersededBy: 101 }))
      .toEqual({ label: "무효(중복) — #101 로 대체, 원본 보존", tone: "stop" });
    expect(nextBatchAction({ status: "cancelled", approvalStatus: null, ccpForms: f }).label).toBe("취소됨");
  });
});

describe("무효 생산 건은 다시 시작·확인·승인·삭제하지 않는다", () => {
  it("시작·확인(그날 첫 확인)·승인 관문·삭제·날짜 일괄 삭제가 무효 검사를 먼저 한다", () => {
    expect(read("services/batchOrchestrator.ts")).toMatch(/export async function activateBatchInTx[\s\S]{0,300}assertBatchNotVoided\(conn, batchId, tenantId\)/);
    expect(read("services/batchOrchestrator.ts")).toMatch(/assertFormNotVoided\(conn, formRecordId, tenantId\)/);
    expect(read("lib/production/batchApprovalGate.ts")).toMatch(/assertBatchNotVoided\(await getRawConnection\(\), batchId, tenantId\)/);
    const crud = read("db/production/batchCRUD.ts");
    expect(crud).toMatch(/export async function deleteBatch[\s\S]{0,400}assertBatchNotVoided\(pool, batchId, tenantId\)/);
    expect(crud).toMatch(/for \(const batchId of batchIds\) await assertBatchNotVoided\(pool, Number\(batchId\), tenantId\);\s*\n\s*\n?\s*for \(const batchId of batchIds\) \{\s*await deleteBatch/);
  });
  it("자동 출고는 무효 생산 건·보류 줄을 출고하지 않는다", () => {
    const a = read("lib/production/autoMaterialIssue.ts");
    expect(a).toMatch(/SELECT voided_at FROM h_batches/);
    expect(a).toMatch(/issue_hold = 1/);
  });
  it("생산일지·하루 집계·기록지 목록은 무효 건을 뺀다 (원본은 그대로)", () => {
    expect(read("lib/production/autoProductionDaily.ts")).toMatch(/AND b\.voided_at IS NULL/);
    expect(read("routers/production/dailyReport.router.ts").match(/AND b\.voided_at IS NULL/g)?.length).toBe(3);
    expect(read("routers/haccp/ccpForm.router.ts")).toMatch(/WHERE f\.tenant_id = \? AND f\.work_date = \? AND f\.voided_at IS NULL/);
  });
  it("복구는 일반 삭제(deleteBatch)를 쓰지 않고, 지문은 실행용 필드(키·실행자)를 넣지 않는다", () => {
    const r = read("services/batchRecovery.ts");
    expect(r).not.toMatch(/import[^\n]*deleteBatch|deleteBatch\(/);
    expect(r).toMatch(/input: \{ tenantId, businessDate, reason:/);
    expect(r).toMatch(/transactionType: "return"[\s\S]{0,200}amountOverride: r\.amount/);
    expect(r).toMatch(/reversalOfId: r\.txId/);
  });
});
