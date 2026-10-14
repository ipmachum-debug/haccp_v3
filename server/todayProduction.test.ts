import { describe, it, expect } from "vitest";
import { checkStock, summarizeIssue, summarizeForms, computeSteps } from "../client/src/lib/todayProduction";

describe("오늘의 생산 (P-1) — 재고 확인은 표시만, 시작·차감은 호출하지 않는다", () => {
  it("③ 재고: 필요량 > 가용량이면 부족, 자재를 못 찾으면 가용 0 으로 부족", () => {
    const r = checkStock(
      [
        { materialId: 1, plannedQuantity: "10" },
        { materialId: 2, plannedQuantity: 5 },
        { materialId: 3, plannedQuantity: "2" },
      ],
      [{ materialId: 1, currentAvailable: 12 }, { materialId: 2, currentAvailable: 4.5 }],
    );
    expect(r.rows[0]).toMatchObject({ shortage: 0, ok: true, known: true });
    expect(r.rows[1]).toMatchObject({ shortage: 0.5, ok: false });
    expect(r.rows[2]).toMatchObject({ available: 0, shortage: 2, ok: false, known: false });
    expect(r.shortCount).toBe(2);
    expect(r.allOk).toBe(false);
  });

  it("⑤ 투입 결과: 출고 기록(LOT)이 붙은 투입만 출고로 센다, 음수 차감 표시", () => {
    const r = summarizeIssue([
      { materialId: 1, plannedQuantity: 1, lots: [{ quantity: 1, negative: false }] },
      { materialId: 2, plannedQuantity: 1, lots: [{ quantity: 0.4, negative: false }, { quantity: 0.6, negative: true }] },
      { materialId: 3, plannedQuantity: 1, lots: [] },
    ]);
    expect(r).toEqual({ total: 3, issued: 2, negative: 1, allIssued: false });
  });

  it("⑤ HACCP 기록: 공식 기록지가 전부 제출·승인이고 반려가 없어야 완료", () => {
    expect(summarizeForms([{ status: "submitted", deviationCount: 0 }, { status: "approved", deviationCount: 1 }]))
      .toEqual({ total: 2, drafts: 0, rejected: 0, deviations: 1, allWritten: true });
    expect(summarizeForms([{ status: "draft", deviationCount: 0 }]).allWritten).toBe(false);
    expect(summarizeForms([]).allWritten).toBe(false);
  });

  it("단계: 시작 전에는 재고 부족을 알리되(blocked) ④ 는 활성 — 막는 건 정책(§7-3)이지 화면이 아니다", () => {
    const s = computeSteps({ batchStatus: "planned", hasInputs: true, stockAllOk: false, issueAllIssued: false, formsAllWritten: false, dailyMissing: 3 });
    expect(s).toEqual(["done", "done", "blocked", "active", "pending", "pending"]);
  });

  it("단계: 진행 중이면 ①~④ 완료, 기록이 다 되면 ⑤ 완료 아니면 활성", () => {
    expect(computeSteps({ batchStatus: "in_progress", hasInputs: true, stockAllOk: true, issueAllIssued: true, formsAllWritten: true, dailyMissing: 0 }))
      .toEqual(["done", "done", "done", "done", "done", "pending"]);
    expect(computeSteps({ batchStatus: "in_progress", hasInputs: true, stockAllOk: true, issueAllIssued: true, formsAllWritten: false, dailyMissing: 0 })[4]).toBe("active");
  });

  it("단계: 완료 배치에 기록이 비어 있으면 ⑤ 를 blocked 로 보여 준다 (완료 뒤에도 기록 미비를 숨기지 않음)", () => {
    expect(computeSteps({ batchStatus: "completed", hasInputs: true, stockAllOk: true, issueAllIssued: true, formsAllWritten: false, dailyMissing: 0 }))
      .toEqual(["done", "done", "done", "done", "blocked", "done"]);
  });

  it("단계: 배치를 아직 고르지 않았으면 ① 만 활성", () => {
    expect(computeSteps({ batchStatus: null, hasInputs: false, stockAllOk: true, issueAllIssued: false, formsAllWritten: false, dailyMissing: 0 })[0]).toBe("active");
  });
});
