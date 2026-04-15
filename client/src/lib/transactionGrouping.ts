/**
 * 거래 그룹화 유틸 — 매입/매출 조회 화면 공용 (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * 문제 배경:
 *   - accounting_purchases / accounting_sales 테이블이 "한 row = 한 품목" 구조
 *   - 한 번의 거래에 5개 품목이 있으면 5개 row 로 나열됨 (거래명세표 관점에서 잘못된 UX)
 *
 * 해결:
 *   - 프론트엔드에서 (transaction_date, partner_id, evidence_number) 조합으로 그룹화
 *   - 헤더 행 + 하위 품목 행(expandable) 으로 렌더
 *   - 그룹 단위 액션(승인/지급/수금/취소) 지원
 *
 * 그룹 키 우선순위:
 *   1. evidence_number 가 있으면: `${date}|${partnerId}|ev:${evidence_number}`
 *      (같은 세금계산서 번호는 확실히 같은 거래)
 *   2. 없으면: `${date}|${partnerId}|NO_EV`
 *      (같은 날 같은 거래처 = 소프트 그룹화)
 * ═══════════════════════════════════════════════════════════════
 */

export interface TransactionRow {
  id: number;
  transactionDate: string;
  partnerId: number | null;
  partnerName?: string | null;
  itemName: string;
  quantity: string | number;
  unit?: string | null;
  unitPrice: string | number;
  totalAmount?: string | number;
  amount?: string | number;
  taxAmount?: string | number;
  evidenceNumber?: string | null;
  documentType?: string | null;
  status: string;
  notes?: string | null;
  [key: string]: any;
}

export interface TransactionGroup<T extends TransactionRow = TransactionRow> {
  /** 그룹 식별자 (유니크) */
  groupKey: string;
  /** 거래일 (YYYY-MM-DD) */
  transactionDate: string;
  /** 거래처 ID */
  partnerId: number | null;
  /** 거래처명 (첫 번째 item 기준) */
  partnerName: string;
  /** 증빙 번호 (있는 경우) */
  evidenceNumber: string | null;
  /** 공급가액 합계 */
  totalAmount: number;
  /** 세액 합계 */
  totalTax: number;
  /** 합계 금액 (공급가 + 세액) */
  grandTotal: number;
  /** 품목 개수 */
  itemCount: number;
  /** 품목 목록 */
  items: T[];
  /**
   * 대표 상태
   * - 모든 item 이 같은 상태 → 그 상태
   * - 섞여 있으면 → "mixed"
   */
  dominantStatus: string;
  /** 전체 상태가 섞여있는지 여부 */
  isMixed: boolean;
}

/**
 * 숫자 안전 변환 (null/undefined/"" → 0)
 */
function toNumber(v: any): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

/**
 * flat row 배열 → 그룹 배열로 변환
 *
 * @param rows 매입/매출 flat 배열
 * @returns 그룹 배열 (원본 rows 순서 유지)
 */
export function groupTransactions<T extends TransactionRow>(
  rows: T[] | undefined | null,
): TransactionGroup<T>[] {
  if (!rows || rows.length === 0) return [];

  const groupMap = new Map<string, TransactionGroup<T>>();

  for (const row of rows) {
    // 그룹 키: 증빙번호 있으면 그걸로, 없으면 (날짜|거래처)
    const partnerKey = row.partnerId ?? "no_partner";
    const evKey = row.evidenceNumber && row.evidenceNumber.trim()
      ? `ev:${row.evidenceNumber.trim()}`
      : "NO_EV";
    const groupKey = `${row.transactionDate}|${partnerKey}|${evKey}`;

    let group = groupMap.get(groupKey);
    if (!group) {
      group = {
        groupKey,
        transactionDate: row.transactionDate,
        partnerId: row.partnerId,
        partnerName: row.partnerName || "-",
        evidenceNumber: row.evidenceNumber || null,
        totalAmount: 0,
        totalTax: 0,
        grandTotal: 0,
        itemCount: 0,
        items: [],
        dominantStatus: row.status,
        isMixed: false,
      };
      groupMap.set(groupKey, group);
    }

    const amt = toNumber(row.amount ?? row.totalAmount);
    const tax = toNumber(row.taxAmount);

    group.items.push(row);
    group.totalAmount += amt;
    group.totalTax += tax;
    group.grandTotal += amt + tax;
    group.itemCount = group.items.length;

    // 상태 혼재 체크
    if (!group.isMixed && group.dominantStatus !== row.status) {
      group.isMixed = true;
      group.dominantStatus = "mixed";
    }
  }

  // 거래일 내림차순 정렬 (최신 거래가 위)
  return Array.from(groupMap.values()).sort((a, b) => {
    if (a.transactionDate < b.transactionDate) return 1;
    if (a.transactionDate > b.transactionDate) return -1;
    // 같은 날짜면 거래처명 오름차순
    return a.partnerName.localeCompare(b.partnerName);
  });
}

/**
 * 상태 기반 "다음 가능한 액션" 반환
 *
 * @param status 현재 상태
 * @param type "purchase" | "sale"
 * @returns 해당 상태에서 가능한 액션 배열
 */
export type TransactionActionType =
  | "approve"      // 승인 (pending → approved)
  | "markPaid"     // 지급 완료 (approved → paid, 매입 전용)
  | "markReceived" // 수금 완료 (approved → received, 매출 전용)
  | "cancel"       // 취소 (pending/approved → cancelled)
  | "restore"      // 복구 (cancelled → pending)
  | "edit"         // 수정 (pending/approved 만)
  | "delete";      // 삭제 (pending 만)

export function getAvailableActions(
  status: string,
  type: "purchase" | "sale",
): TransactionActionType[] {
  switch (status) {
    case "pending":
      return ["approve", "edit", "cancel", "delete"];
    case "approved":
      return type === "purchase"
        ? ["markPaid", "edit", "cancel"]
        : ["markReceived", "edit", "cancel"];
    case "paid":
    case "received":
      // 지급/수금 완료 상태는 더 이상 변경 불가 (조회/PDF만)
      return [];
    case "cancelled":
      return ["restore"];
    case "mixed":
      // 혼재 상태는 모든 액션 노출 (그룹 단위 일괄 작업)
      return type === "purchase"
        ? ["approve", "markPaid", "cancel"]
        : ["approve", "markReceived", "cancel"];
    default:
      return [];
  }
}

/**
 * 상태 라벨 (한국어)
 */
export const STATUS_LABELS: Record<string, string> = {
  pending: "대기 중",
  approved: "승인됨",
  paid: "지급 완료",
  received: "수금 완료",
  cancelled: "취소됨",
  mixed: "혼재",
};

/**
 * 상태 색상 클래스 (Tailwind)
 */
export const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700 border-yellow-300",
  approved: "bg-blue-50 text-blue-700 border-blue-300",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-300",
  received: "bg-emerald-50 text-emerald-700 border-emerald-300",
  cancelled: "bg-zinc-200 text-zinc-600 border-zinc-300",
  mixed: "bg-orange-50 text-orange-700 border-orange-300",
};
