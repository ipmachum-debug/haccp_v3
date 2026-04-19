/**
 * 회계 복식부기 핵심 공식 — 4대 흐름 안정화 (2026-04-19)
 *
 * "생산→재고→완제품 / 매입 / 매출+COGS / LOT" 의 회계 일관성을 보장하는
 * pure formula 집합. DB 접근 없이 숫자 로직만 검증 가능.
 *
 * 원칙:
 *  - 복식부기 불변식: SUM(debit) === SUM(credit)
 *  - 매입: DR 재고/VAT = CR 미지급금
 *  - 매출: DR 외상매출금 = CR 매출/VAT (수익), DR 매출원가 = CR 재고 (원가)
 *
 * 한번 잘못되면 재무제표 오염 → 세무/감사 사고
 */

export interface JournalLineShape {
  side: "debit" | "credit";
  accountCode: string; // system account code
  amount: number;
  description?: string;
}

/**
 * 복식부기 균형 검증 — 차변 합 === 대변 합
 * 부동소수점 오차 허용 (0.01 원)
 */
export function isJournalBalanced(lines: JournalLineShape[]): boolean {
  const debit = lines
    .filter((l) => l.side === "debit")
    .reduce((s, l) => s + l.amount, 0);
  const credit = lines
    .filter((l) => l.side === "credit")
    .reduce((s, l) => s + l.amount, 0);
  return Math.abs(debit - credit) < 0.01;
}

/**
 * 균형 검증 실패 시 throw (POST 직전 가드용)
 */
export function assertJournalBalanced(lines: JournalLineShape[]): void {
  const debit = lines
    .filter((l) => l.side === "debit")
    .reduce((s, l) => s + l.amount, 0);
  const credit = lines
    .filter((l) => l.side === "credit")
    .reduce((s, l) => s + l.amount, 0);
  if (Math.abs(debit - credit) >= 0.01) {
    throw new Error(
      `[회계] 복식부기 불균형: 차변 ${debit} != 대변 ${credit} (차 ${debit - credit})`,
    );
  }
}

// ═══════════════════════════════════════════════════════
// 매입 (Purchase)
// ═══════════════════════════════════════════════════════

export interface PurchaseJournalInput {
  totalAmount: number; // 부가세 포함 총액
  taxAmount: number; // VAT 금액
  paymentMethod: "cash" | "bank" | "card" | "unpaid";
}

/**
 * 매입 분개 계산
 * 차변: 재고원재료 (공급가액) + 부가세대급금 (세액)
 * 대변: 현금/보통예금/미지급금-카드/외상매입금 (총액)
 *
 * 공급가액 = 총액 - 세액 (세액 없으면 공급가액 = 총액)
 */
export function calcPurchaseJournalLines(input: PurchaseJournalInput): JournalLineShape[] {
  const { totalAmount, taxAmount, paymentMethod } = input;
  if (totalAmount < 0) throw new Error("[매입] totalAmount 음수 불가");
  if (taxAmount < 0) throw new Error("[매입] taxAmount 음수 불가");
  if (taxAmount > totalAmount) throw new Error("[매입] taxAmount > totalAmount 불가");

  const supplyAmount = totalAmount - taxAmount;

  const lines: JournalLineShape[] = [
    { side: "debit", accountCode: "INVENTORY_RAW", amount: supplyAmount, description: "매입 원재료" },
  ];
  if (taxAmount > 0) {
    lines.push({ side: "debit", accountCode: "VAT_INPUT", amount: taxAmount, description: "부가세대급금" });
  }

  // 결제수단에 따라 대변 계정 분기
  const creditAccount =
    paymentMethod === "cash" ? "CASH" :
    paymentMethod === "bank" ? "BANK_DEPOSIT" :
    paymentMethod === "card" ? "ACCOUNTS_PAYABLE_CARD" :
    "ACCOUNTS_PAYABLE";

  lines.push({ side: "credit", accountCode: creditAccount, amount: totalAmount, description: "매입 결제" });

  return lines;
}

// ═══════════════════════════════════════════════════════
// 매출 + COGS (Sale + Cost of Goods Sold)
// ═══════════════════════════════════════════════════════

export interface SaleJournalInput {
  totalAmount: number; // 부가세 포함 총액 (매출)
  taxAmount: number; // VAT 금액
  costAmount: number; // 매출원가 (FEFO LOT 단가 합계)
  settlementMethod?: "credit" | "cash" | "bank"; // 수금 방법 (기본 credit = 외상)
}

/**
 * 매출 분개 계산 — 복식부기 2쌍
 * (1) 매출 인식: DR 외상매출금(또는 현금) = CR 매출 + VAT 예수금
 * (2) 원가 인식: DR 매출원가 = CR 상품재고
 */
export function calcSaleJournalLines(input: SaleJournalInput): JournalLineShape[] {
  const { totalAmount, taxAmount, costAmount, settlementMethod = "credit" } = input;
  if (totalAmount < 0) throw new Error("[매출] totalAmount 음수 불가");
  if (taxAmount < 0) throw new Error("[매출] taxAmount 음수 불가");
  if (costAmount < 0) throw new Error("[매출] costAmount 음수 불가");
  if (taxAmount > totalAmount) throw new Error("[매출] taxAmount > totalAmount 불가");

  const supplyAmount = totalAmount - taxAmount;

  const receivableAccount =
    settlementMethod === "cash" ? "CASH" :
    settlementMethod === "bank" ? "BANK_DEPOSIT" :
    "ACCOUNTS_RECEIVABLE";

  const lines: JournalLineShape[] = [
    // (1) 매출 인식
    { side: "debit", accountCode: receivableAccount, amount: totalAmount, description: "매출 수금채권" },
    { side: "credit", accountCode: "SALES_REVENUE", amount: supplyAmount, description: "상품매출" },
  ];
  if (taxAmount > 0) {
    lines.push({ side: "credit", accountCode: "VAT_OUTPUT", amount: taxAmount, description: "부가세예수금" });
  }

  // (2) 원가 인식 (원가 > 0 인 경우만)
  if (costAmount > 0) {
    lines.push(
      { side: "debit", accountCode: "COST_OF_GOODS", amount: costAmount, description: "매출원가" },
      { side: "credit", accountCode: "INVENTORY_GOODS", amount: costAmount, description: "제품재고 차감" },
    );
  }

  return lines;
}

// ═══════════════════════════════════════════════════════
// COGS 계산 (LOT FEFO 할당 결과로부터)
// ═══════════════════════════════════════════════════════

export interface LotAllocation {
  lotId: number;
  quantity: number;
  unitCost: number;
}

/**
 * FEFO 할당 결과로부터 매출원가(COGS) 계산
 * COGS = sum(each allocation: quantity * unitCost)
 */
export function calcCOGSFromAllocations(allocations: LotAllocation[]): number {
  if (!Array.isArray(allocations)) throw new Error("[COGS] allocations 배열 필요");
  return allocations.reduce((sum, a) => {
    if (a.quantity < 0) throw new Error(`[COGS] quantity 음수 불가 (lotId=${a.lotId})`);
    if (a.unitCost < 0) throw new Error(`[COGS] unitCost 음수 불가 (lotId=${a.lotId})`);
    return sum + a.quantity * a.unitCost;
  }, 0);
}

/**
 * 할당 수량 합 검증 — FEFO 출고 총수량이 요청 수량과 일치하는지
 */
export function assertAllocationQuantityMatches(
  allocations: LotAllocation[],
  requestedQuantity: number,
): void {
  const total = allocations.reduce((s, a) => s + a.quantity, 0);
  if (Math.abs(total - requestedQuantity) >= 0.001) {
    throw new Error(
      `[LOT] 할당량 불일치: 요청 ${requestedQuantity} != 할당합 ${total} (차 ${total - requestedQuantity})`,
    );
  }
}

// ═══════════════════════════════════════════════════════
// 매입/매출 취소 (역분개)
// ═══════════════════════════════════════════════════════

/**
 * 원본 분개의 부호를 뒤집은 역분개 생성
 * cancelPurchase / cancelSale 시 원본 entry 를 0으로 만들기 위함
 */
export function reverseJournalLines(lines: JournalLineShape[]): JournalLineShape[] {
  return lines.map((l) => ({
    ...l,
    side: l.side === "debit" ? "credit" : "debit",
    description: `[취소] ${l.description || ""}`,
  }));
}
