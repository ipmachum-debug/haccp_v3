/**
 * 회계 복식부기 공식 테스트 — 4대 흐름 안정화 (2026-04-19)
 *
 * SaaS 생존 조건:
 *   - 매입 → 재고 증가 (잘못되면 재고/회계 불일치)
 *   - 매출 → 재고 감소 + COGS (잘못되면 세무 사고)
 *   - LOT 추적 (잘못되면 식품안전 위반)
 *
 * 이 테스트가 깨지면: 실서비스 ship 금지 레벨
 */
import { describe, it, expect } from "vitest";
import {
  isJournalBalanced,
  assertJournalBalanced,
  calcPurchaseJournalLines,
  calcSaleJournalLines,
  calcCOGSFromAllocations,
  assertAllocationQuantityMatches,
  reverseJournalLines,
  type JournalLineShape,
} from "./accountingFormulas";

describe("복식부기 불변식 — isJournalBalanced", () => {
  it("차변 = 대변 → true", () => {
    const lines: JournalLineShape[] = [
      { side: "debit", accountCode: "CASH", amount: 1000 },
      { side: "credit", accountCode: "SALES_REVENUE", amount: 1000 },
    ];
    expect(isJournalBalanced(lines)).toBe(true);
  });

  it("여러 행 균형 확인", () => {
    const lines: JournalLineShape[] = [
      { side: "debit", accountCode: "INVENTORY_RAW", amount: 900 },
      { side: "debit", accountCode: "VAT_INPUT", amount: 100 },
      { side: "credit", accountCode: "ACCOUNTS_PAYABLE", amount: 1000 },
    ];
    expect(isJournalBalanced(lines)).toBe(true);
  });

  it("0.01 원 미만 오차 허용 (부동소수점)", () => {
    const lines: JournalLineShape[] = [
      { side: "debit", accountCode: "CASH", amount: 1000.001 },
      { side: "credit", accountCode: "SALES_REVENUE", amount: 1000 },
    ];
    expect(isJournalBalanced(lines)).toBe(true);
  });

  it("차이 0.01 이상 → false", () => {
    const lines: JournalLineShape[] = [
      { side: "debit", accountCode: "CASH", amount: 1000 },
      { side: "credit", accountCode: "SALES_REVENUE", amount: 999 },
    ];
    expect(isJournalBalanced(lines)).toBe(false);
  });

  it("assertJournalBalanced — 균형 안 맞으면 throw", () => {
    const lines: JournalLineShape[] = [
      { side: "debit", accountCode: "CASH", amount: 1000 },
      { side: "credit", accountCode: "SALES_REVENUE", amount: 500 },
    ];
    expect(() => assertJournalBalanced(lines)).toThrow(/복식부기 불균형/);
  });
});

describe("매입 분개 — calcPurchaseJournalLines", () => {
  it("세액 있는 기본 매입 (VAT 10%)", () => {
    const lines = calcPurchaseJournalLines({
      totalAmount: 11000,
      taxAmount: 1000,
      paymentMethod: "unpaid",
    });

    expect(isJournalBalanced(lines)).toBe(true);
    // DR: INVENTORY_RAW 10000 + VAT_INPUT 1000
    // CR: ACCOUNTS_PAYABLE 11000
    const dr = lines.filter((l) => l.side === "debit");
    expect(dr).toHaveLength(2);
    expect(dr.find((l) => l.accountCode === "INVENTORY_RAW")?.amount).toBe(10000);
    expect(dr.find((l) => l.accountCode === "VAT_INPUT")?.amount).toBe(1000);

    const cr = lines.filter((l) => l.side === "credit");
    expect(cr).toHaveLength(1);
    expect(cr[0].accountCode).toBe("ACCOUNTS_PAYABLE");
    expect(cr[0].amount).toBe(11000);
  });

  it("세액 0 → VAT 분개 라인 생략", () => {
    const lines = calcPurchaseJournalLines({
      totalAmount: 5000,
      taxAmount: 0,
      paymentMethod: "cash",
    });
    expect(isJournalBalanced(lines)).toBe(true);
    expect(lines.find((l) => l.accountCode === "VAT_INPUT")).toBeUndefined();
    expect(lines.find((l) => l.side === "credit")?.accountCode).toBe("CASH");
  });

  it("결제수단별 대변 계정 분기", () => {
    const byMethod = (m: "cash" | "bank" | "card" | "unpaid") =>
      calcPurchaseJournalLines({ totalAmount: 1000, taxAmount: 0, paymentMethod: m })
        .find((l) => l.side === "credit")?.accountCode;

    expect(byMethod("cash")).toBe("CASH");
    expect(byMethod("bank")).toBe("BANK_DEPOSIT");
    expect(byMethod("card")).toBe("ACCOUNTS_PAYABLE_CARD");
    expect(byMethod("unpaid")).toBe("ACCOUNTS_PAYABLE");
  });

  it("음수 금액 throw", () => {
    expect(() => calcPurchaseJournalLines({
      totalAmount: -100, taxAmount: 0, paymentMethod: "cash",
    })).toThrow(/totalAmount 음수/);
  });

  it("세액 > 총액 throw (데이터 오염 방지)", () => {
    expect(() => calcPurchaseJournalLines({
      totalAmount: 100, taxAmount: 200, paymentMethod: "unpaid",
    })).toThrow(/taxAmount > totalAmount/);
  });
});

describe("매출 + COGS 분개 — calcSaleJournalLines", () => {
  it("정상 매출 (매출 인식 + 원가 인식 2쌍)", () => {
    const lines = calcSaleJournalLines({
      totalAmount: 11000,
      taxAmount: 1000,
      costAmount: 6000,
    });

    expect(isJournalBalanced(lines)).toBe(true);

    // 매출 인식
    const ar = lines.find((l) => l.accountCode === "ACCOUNTS_RECEIVABLE" && l.side === "debit");
    expect(ar?.amount).toBe(11000);

    const revenue = lines.find((l) => l.accountCode === "SALES_REVENUE" && l.side === "credit");
    expect(revenue?.amount).toBe(10000);

    const vatOut = lines.find((l) => l.accountCode === "VAT_OUTPUT" && l.side === "credit");
    expect(vatOut?.amount).toBe(1000);

    // 원가 인식
    const cogs = lines.find((l) => l.accountCode === "COST_OF_GOODS" && l.side === "debit");
    expect(cogs?.amount).toBe(6000);

    const invGoods = lines.find((l) => l.accountCode === "INVENTORY_GOODS" && l.side === "credit");
    expect(invGoods?.amount).toBe(6000);
  });

  it("매출이익 (매출-원가) 계산 가능", () => {
    const lines = calcSaleJournalLines({
      totalAmount: 11000, taxAmount: 1000, costAmount: 6000,
    });
    const revenue = lines.find((l) => l.accountCode === "SALES_REVENUE")!.amount;
    const cogs = lines.find((l) => l.accountCode === "COST_OF_GOODS")!.amount;
    // 매출총이익 = 10000 - 6000 = 4000 (약 40% 마진)
    expect(revenue - cogs).toBe(4000);
  });

  it("costAmount 0 → 원가 분개 생략 (서비스 매출 등)", () => {
    const lines = calcSaleJournalLines({
      totalAmount: 1000, taxAmount: 0, costAmount: 0,
    });
    expect(isJournalBalanced(lines)).toBe(true);
    expect(lines.find((l) => l.accountCode === "COST_OF_GOODS")).toBeUndefined();
    expect(lines.find((l) => l.accountCode === "INVENTORY_GOODS")).toBeUndefined();
  });

  it("settlementMethod 현금 → 외상매출금 대신 현금", () => {
    const lines = calcSaleJournalLines({
      totalAmount: 1000, taxAmount: 0, costAmount: 0, settlementMethod: "cash",
    });
    expect(lines.find((l) => l.side === "debit")?.accountCode).toBe("CASH");
  });

  it("음수/오염 입력 차단", () => {
    expect(() => calcSaleJournalLines({
      totalAmount: -1, taxAmount: 0, costAmount: 0,
    })).toThrow();
    expect(() => calcSaleJournalLines({
      totalAmount: 100, taxAmount: 200, costAmount: 0,
    })).toThrow(/taxAmount > totalAmount/);
  });
});

describe("COGS 계산 — calcCOGSFromAllocations", () => {
  it("단일 LOT", () => {
    const cogs = calcCOGSFromAllocations([
      { lotId: 1, quantity: 10, unitCost: 100 },
    ]);
    expect(cogs).toBe(1000);
  });

  it("다중 LOT 합산 (FEFO 할당 시나리오)", () => {
    const cogs = calcCOGSFromAllocations([
      { lotId: 1, quantity: 3, unitCost: 100 }, // 300
      { lotId: 2, quantity: 5, unitCost: 120 }, // 600
      { lotId: 3, quantity: 2, unitCost: 150 }, // 300
    ]);
    expect(cogs).toBe(1200);
  });

  it("빈 배열 → 0", () => {
    expect(calcCOGSFromAllocations([])).toBe(0);
  });

  it("음수 수량 / 음수 단가 throw", () => {
    expect(() => calcCOGSFromAllocations([
      { lotId: 1, quantity: -1, unitCost: 100 },
    ])).toThrow(/quantity 음수/);
    expect(() => calcCOGSFromAllocations([
      { lotId: 1, quantity: 1, unitCost: -100 },
    ])).toThrow(/unitCost 음수/);
  });
});

describe("LOT 할당 수량 검증 — assertAllocationQuantityMatches", () => {
  it("할당 합 === 요청 수량 통과", () => {
    expect(() => assertAllocationQuantityMatches(
      [{ lotId: 1, quantity: 3, unitCost: 0 }, { lotId: 2, quantity: 7, unitCost: 0 }],
      10,
    )).not.toThrow();
  });

  it("부동소수점 오차 허용 (0.001 미만)", () => {
    expect(() => assertAllocationQuantityMatches(
      [{ lotId: 1, quantity: 3.3333, unitCost: 0 }, { lotId: 2, quantity: 6.6667, unitCost: 0 }],
      10,
    )).not.toThrow();
  });

  it("수량 불일치 → throw (출고 누락/과다 방지)", () => {
    expect(() => assertAllocationQuantityMatches(
      [{ lotId: 1, quantity: 3, unitCost: 0 }, { lotId: 2, quantity: 5, unitCost: 0 }],
      10,
    )).toThrow(/할당량 불일치.*요청 10.*할당합 8/);
  });
});

describe("역분개 — reverseJournalLines (cancel)", () => {
  it("차변 ↔ 대변 반전", () => {
    const original: JournalLineShape[] = [
      { side: "debit", accountCode: "INVENTORY_RAW", amount: 1000, description: "매입" },
      { side: "credit", accountCode: "ACCOUNTS_PAYABLE", amount: 1000, description: "미지급금" },
    ];
    const reversed = reverseJournalLines(original);
    expect(reversed[0].side).toBe("credit");
    expect(reversed[0].accountCode).toBe("INVENTORY_RAW");
    expect(reversed[1].side).toBe("debit");
    expect(reversed[1].accountCode).toBe("ACCOUNTS_PAYABLE");
  });

  it("금액 보존 (부호 유지)", () => {
    const original: JournalLineShape[] = [
      { side: "debit", accountCode: "CASH", amount: 5000 },
      { side: "credit", accountCode: "SALES_REVENUE", amount: 5000 },
    ];
    const reversed = reverseJournalLines(original);
    expect(reversed[0].amount).toBe(5000);
    expect(reversed[1].amount).toBe(5000);
  });

  it("원본 + 역분개 합치면 잔액 0 (복식부기 안정성)", () => {
    const original = calcPurchaseJournalLines({
      totalAmount: 11000, taxAmount: 1000, paymentMethod: "unpaid",
    });
    const combined = [...original, ...reverseJournalLines(original)];
    // 모든 계정의 net = 0 이어야 함
    const netByAccount = new Map<string, number>();
    for (const l of combined) {
      const sign = l.side === "debit" ? 1 : -1;
      netByAccount.set(l.accountCode, (netByAccount.get(l.accountCode) || 0) + sign * l.amount);
    }
    for (const [, net] of netByAccount) {
      expect(Math.abs(net)).toBeLessThan(0.01);
    }
  });

  it("설명에 [취소] 접두어 추가 (감사로깅)", () => {
    const original: JournalLineShape[] = [
      { side: "debit", accountCode: "X", amount: 1, description: "매입분" },
    ];
    const reversed = reverseJournalLines(original);
    expect(reversed[0].description).toContain("[취소]");
  });
});

describe("통합 시나리오 — 4대 흐름 정합성", () => {
  it("매입 → 취소 → 잔액 0", () => {
    const purchase = calcPurchaseJournalLines({
      totalAmount: 110000, taxAmount: 10000, paymentMethod: "unpaid",
    });
    const cancel = reverseJournalLines(purchase);
    const total = [...purchase, ...cancel];
    const drSum = total.filter((l) => l.side === "debit").reduce((s, l) => s + l.amount, 0);
    const crSum = total.filter((l) => l.side === "credit").reduce((s, l) => s + l.amount, 0);
    expect(Math.abs(drSum - crSum)).toBeLessThan(0.01);
    // 차변 합 = 대변 합 = 110000 * 2
    expect(drSum).toBe(220000);
  });

  it("매출 + COGS 전체 균형 (매출과 원가 분개 동시 검증)", () => {
    const lines = calcSaleJournalLines({
      totalAmount: 110000, taxAmount: 10000, costAmount: 70000,
    });
    // 전체 분개 균형
    expect(isJournalBalanced(lines)).toBe(true);
    // 매출 인식 쌍만 뽑아 균형 확인
    const saleOnly = lines.filter((l) => ["ACCOUNTS_RECEIVABLE", "SALES_REVENUE", "VAT_OUTPUT"].includes(l.accountCode));
    expect(isJournalBalanced(saleOnly)).toBe(true);
    // 원가 인식 쌍만 뽑아 균형 확인
    const cogsOnly = lines.filter((l) => ["COST_OF_GOODS", "INVENTORY_GOODS"].includes(l.accountCode));
    expect(isJournalBalanced(cogsOnly)).toBe(true);
  });

  it("FEFO 할당 → COGS 계산 → 매출 분개 균형 (LOT → 재고 → 회계 일관성)", () => {
    const allocations = [
      { lotId: 1, quantity: 3, unitCost: 100 }, // 300
      { lotId: 2, quantity: 7, unitCost: 200 }, // 1400
    ];
    const cogs = calcCOGSFromAllocations(allocations);
    expect(cogs).toBe(1700);

    // 수량 검증 (재고 차감 정확성)
    assertAllocationQuantityMatches(allocations, 10);

    // 이 COGS 로 매출 분개 생성
    const lines = calcSaleJournalLines({
      totalAmount: 3300, taxAmount: 300, costAmount: cogs,
    });
    expect(isJournalBalanced(lines)).toBe(true);

    // 매출총이익 확인 = 3000 - 1700 = 1300
    const revenue = lines.find((l) => l.accountCode === "SALES_REVENUE")!.amount;
    expect(revenue - cogs).toBe(1300);
  });
});
