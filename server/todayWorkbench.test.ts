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
    expect(crud).toMatch(/r\.batchId > 0 && !r\.reused/);
    expect(crud).toMatch(/excludedEquipmentIds: input\.excludedEquipmentIds/);
  });
});
