/**
 * CCP 이탈 손실분개 자동 — F-3 본격 두 번째 단계 (CP-3-e)
 *
 * ============================================================================
 * 흐름:
 *   PR #133 (LOT HOLD) 후 영향받은 LOT 의 가치 합계를 자동 손실 분개:
 *     차변: PRODUCTION_LOSS (제조손실, 비용)
 *     대변: INVENTORY_RAW   (원재료 재고, 자산 감소)
 *
 *   가치 = SUM(lot.available_quantity × lot.unit_price)
 *
 * 환경변수 (운영 .env):
 *   ENABLE_CCP_AUTO_JOURNAL=false (기본)         — 자동 분개 비활성
 *   ENABLE_CCP_AUTO_JOURNAL_TENANTS="2,5,7"      — 명시 tenant 만
 *
 * 점진 활성화 권장:
 *   1. 평가만 (ENABLE_CCP_EVAL)
 *   2. + LOT HOLD (ENABLE_CCP_LOT_HOLD)
 *   3. + 자동 분개 (ENABLE_CCP_AUTO_JOURNAL)  ← 이 PR
 *   4. (다음) 시정조치 워크플로 (CP-3-f)
 *
 * 트리거: PR #133 CP-3-d LOT HOLD / 특허 [0016] F-3 IoT 폐쇄 루프
 * ============================================================================
 */

import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { hInventoryLots } from "../../../../drizzle/schema/part2_inventory";
import {
  resolveSystemAccount,
  insertJournalLine,
} from "../../../db/accounting/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../../../drizzle/schema/accountingAccounts";
import { todayKST } from "../../../utils/timezone";

export interface LossJournalResult {
  /** 분개 생성 여부 (env 비활성 / 가치 0 시 false) */
  posted: boolean;
  /** 생성된 expense_journal_entries.id (posted=true 시) */
  journalEntryId?: number;
  /** 손실 총액 (원) */
  totalLoss: number;
  /** 영향 LOT 수 */
  lotCount: number;
  reason?: string;
}

/**
 * tenant 가 자동 분개 활성화 대상인지.
 *
 * 우선순위:
 *   1. ENABLE_CCP_AUTO_JOURNAL_TENANTS — 명시 tenant 목록
 *   2. ENABLE_CCP_AUTO_JOURNAL — 전체 활성
 */
export function isCcpAutoJournalEnabled(tenantId: number): boolean {
  const tenantsRaw = process.env.ENABLE_CCP_AUTO_JOURNAL_TENANTS?.trim();
  if (tenantsRaw) {
    const enabled = tenantsRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));
    if (enabled.length > 0) {
      return enabled.includes(Number(tenantId));
    }
  }

  const flag = process.env.ENABLE_CCP_AUTO_JOURNAL?.toLowerCase().trim();
  return flag === "true" || flag === "1" || flag === "yes";
}

/**
 * CCP 이탈로 HOLD 된 LOT 들의 손실 분개 자동 생성.
 *
 * 흐름:
 *   1. lotIds 의 h_inventory_lots 조회 (status='reserved' 만)
 *   2. 가치 = SUM(available_quantity × unit_price)
 *   3. expense_journal_entries INSERT (헤더)
 *   4. journal_lines INSERT (차/대)
 *
 * 안전:
 *   - lotIds 비어있으면 posted=false
 *   - totalLoss=0 (단가 0 또는 수량 0) 이면 posted=false
 *   - 트랜잭션 내부 처리는 caller 책임 (현재 PoC 는 별도 connection)
 *
 * @param params batchId / lotIds / tenantId / userId / ccpRecordId
 * @returns LossJournalResult
 */
export async function postCcpLossJournal(params: {
  batchId: number;
  lotIds: readonly number[];
  tenantId: number;
  userId: number;
  ccpRecordId: number;
}): Promise<LossJournalResult> {
  const { batchId, lotIds, tenantId, userId, ccpRecordId } = params;

  // 1. env 체크
  if (!isCcpAutoJournalEnabled(tenantId)) {
    return {
      posted: false,
      totalLoss: 0,
      lotCount: 0,
      reason: "ENABLE_CCP_AUTO_JOURNAL 미활성 (env)",
    };
  }

  if (lotIds.length === 0) {
    return {
      posted: false,
      totalLoss: 0,
      lotCount: 0,
      reason: "영향 LOT 0건",
    };
  }

  const db = await getDb();
  if (!db) {
    return {
      posted: false,
      totalLoss: 0,
      lotCount: 0,
      reason: "DB 연결 실패",
    };
  }

  // 2. LOT 가치 조회 (reserved 상태만 — HOLD 처리된 것)
  const lots = await db
    .select({
      id: hInventoryLots.id,
      availableQuantity: hInventoryLots.availableQuantity,
      unitPrice: hInventoryLots.unitPrice,
      status: hInventoryLots.status,
    })
    .from(hInventoryLots)
    .where(
      and(
        inArray(hInventoryLots.id, [...lotIds]),
        eq(hInventoryLots.tenantId, tenantId),
        eq(hInventoryLots.status, "reserved"),
      ),
    );

  if (lots.length === 0) {
    return {
      posted: false,
      totalLoss: 0,
      lotCount: 0,
      reason: "reserved 상태 LOT 0건",
    };
  }

  const totalLoss = lots.reduce((sum, lot) => {
    const qty = parseFloat(String(lot.availableQuantity ?? 0));
    const price = parseFloat(String(lot.unitPrice ?? 0));
    return sum + qty * price;
  }, 0);

  if (totalLoss < 0.01) {
    return {
      posted: false,
      totalLoss: 0,
      lotCount: lots.length,
      reason: "totalLoss = 0 (단가 0 또는 수량 0)",
    };
  }

  // 3. SYSTEM_ACCOUNTS 해석 (자동 생성 폴백)
  const lossAcc = await resolveSystemAccount(
    tenantId,
    SYSTEM_ACCOUNTS.PRODUCTION_LOSS,
    "5910", // 권장 코드 (5xxx 비용)
    "제조손실",
  );
  const inventoryAcc = await resolveSystemAccount(
    tenantId,
    SYSTEM_ACCOUNTS.INVENTORY_RAW,
    "1410",
    "원재료",
  );

  // 4. 분개 헤더 + 라인 INSERT
  const description =
    `[CCP 자동손실] 배치 #${batchId} — LOT ${lots.length}건 (ccp_record #${ccpRecordId})`;
  const entryDate = todayKST();

  // raw connection 으로 INSERT (postWithinTransaction 통합은 별도 PR)
  // PoC: 일반 connection — 이 PR 의 분개 INSERT 자체는 atomic 하지만
  // LOT HOLD (PR #133) 와 같은 트랜잭션은 아님. F-3 본격에서 통합.
  const { getRawConnection } = await import("../../../db/connection");
  const pool = await getRawConnection();
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [headerResult]: any = await conn.execute(
      `INSERT INTO expense_journal_entries
        (tenant_id, voucher_id, entry_date, description,
         total_debit, total_credit, posted_by)
       VALUES (?, NULL, ?, ?, ?, ?, ?)`,
      [tenantId, entryDate, description, totalLoss.toFixed(2), totalLoss.toFixed(2), userId],
    );
    const journalEntryId = Number(headerResult.insertId);

    // 차변: 제조손실
    await insertJournalLine(conn as any, {
      tenantId,
      journalEntryId,
      accountId: lossAcc.id,
      accountCode: lossAcc.code,
      accountName: lossAcc.name,
      debitAmount: totalLoss,
      creditAmount: 0,
      description,
      sortOrder: 0,
    });

    // 대변: 원재료
    await insertJournalLine(conn as any, {
      tenantId,
      journalEntryId,
      accountId: inventoryAcc.id,
      accountCode: inventoryAcc.code,
      accountName: inventoryAcc.name,
      debitAmount: 0,
      creditAmount: totalLoss,
      description,
      sortOrder: 1,
    });

    await conn.commit();

    console.warn(
      `[ccpLossJournal] 자동 분개 생성 — entryId=${journalEntryId} ` +
      `batchId=${batchId} lots=${lots.length} 총액=${totalLoss.toFixed(0)}원`,
    );

    return {
      posted: true,
      journalEntryId,
      totalLoss,
      lotCount: lots.length,
    };
  } catch (err: any) {
    await conn.rollback();
    console.warn(
      `[ccpLossJournal] 분개 실패 (rollback) — batchId=${batchId}: ${err?.message ?? err}`,
    );
    throw err;
  } finally {
    conn.release();
  }
}
