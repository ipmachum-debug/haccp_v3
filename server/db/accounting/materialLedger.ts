/**
 * 원료수불부 DB 함수 v3
 * - 일별 수불 조회/수정/삭제
 * - 월별 집계 생성/조회
 * - 월마감 승인 관리
 * - 매입(입고) 연동: createPurchase 후 자동 반영
 * - 배치(사용) 연동: completeBatch 후 자동 반영
 * - 일일 마감 자동 업데이트
 * ✅ 멀티테넌시 격리: 모든 쿼리에 tenantId 필터 적용
 */
import { getRawConnection } from "../connection";
import { resolveSystemAccount, insertJournalLine } from "./journalHelper";
import { SYSTEM_ACCOUNTS } from "../../../drizzle/schema/accountingAccounts";
import { getRows, getFirstRow, getInsertId } from "../../utils/dbHelpers";
import { logWarn } from "../../utils/logger";

import { todayKST } from "../../utils/timezone";

// ===== 일별 원료수불 =====

/** 특정 날짜의 원료수불 목록 조회 - 모든 활성 원재료 표시 */
export async function getDailyLedger(date: string, tenantId: number) {
  const db = await getRawConnection();
  const [rows] = await db.execute(
    `SELECT
       m.id as material_id,
       m.material_name,
       m.material_code,
       m.unit,
       COALESCE(m.unit_price, 0) as unit_price,
       COALESCE(d.id, 0) as id,
       ? as ledger_date,
       ROUND(COALESCE(d.receiving_qty, 0), 1) as receiving_qty,
       ROUND(COALESCE(d.usage_qty, 0), 1) as usage_qty,
       ROUND(COALESCE(d.adjustment_qty, 0), 1) as adjustment_qty,
       ROUND(GREATEST(COALESCE(d.running_stock, 0), 0), 1) as running_stock,
       COALESCE(d.notes, '') as notes,
       COALESCE(d.source, '') as source,
       ROUND(GREATEST(COALESCE(prev_agg.prev_running_stock, 0), 0), 1) as prev_stock,
       ROUND(GREATEST(
         COALESCE(
           d.running_stock,
           COALESCE(prev_agg.prev_running_stock, 0)
             + COALESCE(d.receiving_qty, 0)
             - COALESCE(d.usage_qty, 0)
             + COALESCE(d.adjustment_qty, 0)
         ), 0), 1) as current_stock,
       ROUND(COALESCE(d.receiving_qty, 0) * COALESCE(m.unit_price, 0), 0) as receiving_amount,
       ROUND(COALESCE(d.usage_qty, 0) * COALESCE(m.unit_price, 0), 0) as usage_amount
     FROM h_materials m
     LEFT JOIN material_ledger_daily d
       ON d.material_id = m.id AND d.tenant_id = ? AND d.ledger_date = ?
     LEFT JOIN (
       SELECT d1.material_id, d1.running_stock as prev_running_stock
       FROM material_ledger_daily d1
       INNER JOIN (
         SELECT material_id, MAX(ledger_date) as max_date
         FROM material_ledger_daily
         WHERE tenant_id = ? AND ledger_date < ?
         GROUP BY material_id
       ) d2 ON d1.material_id = d2.material_id AND d1.ledger_date = d2.max_date
       WHERE d1.tenant_id = ?
     ) prev_agg ON prev_agg.material_id = m.id
     WHERE m.tenant_id = ? AND m.is_active = 1
       AND m.material_name NOT LIKE '%정제수%'
     ORDER BY m.material_name`,
    [date, tenantId, date, tenantId, date, tenantId, tenantId]
  );
  return rows as Record<string, unknown>[];
}

/**
 * 일별 수불 데이터 upsert (자동 또는 수동)
 *
 * ★ 2026-04-14 Module 6 노트 (Technical Debt):
 *   이 함수는 material_ledger_daily 만 직접 업데이트하고 h_inventory/h_inventory_lots
 *   와 동기화하지 않음. 결과적으로 수불부와 재고 원장이 diverge 가능 (verify-consistency
 *   의 XCHK_LEDGER_VS_TX 원인).
 *
 *   이상적 구조: 항상 h_inventory_transactions 를 single source 로 기록하고
 *   `syncLedgerFromTransaction()` 트리거로 material_ledger_daily 를 파생시키는 것.
 *   기존 호출처가 많아 (매입/매출/배치/엑셀임포트 등) 전면 리팩터 시 운영 리스크가
 *   매우 크므로 별도 세션에서 단계적 처리 예정.
 *
 *   현재는 각 호출처마다 h_inventory_transactions + upsertDailyLedger 를 함께
 *   호출하는 패턴으로 완화 (매입/매출/배치 완료 로직에서 이미 적용).
 */
export async function upsertDailyLedger(data: {
  materialId: number;
  ledgerDate: string;
  receivingQty?: number;
  usageQty?: number;
  adjustmentQty?: number;
  notes?: string;
  source?: string;
}, tenantId: number) {
  const db = await getRawConnection();
  const { materialId, ledgerDate, receivingQty, usageQty, adjustmentQty, notes = '', source = 'manual' } = data;
  
  // 기존 데이터 조회 (있으면 기존 값에 누적)
  const existingResult = await db.execute(
    `SELECT receiving_qty, usage_qty, adjustment_qty FROM material_ledger_daily
     WHERE tenant_id = ? AND material_id = ? AND ledger_date = ?`,
    [tenantId, materialId, ledgerDate]
  );
  const existingRows = getRows<{ receiving_qty: number; usage_qty: number; adjustment_qty: number }>(existingResult);

  const existing = existingRows?.[0];
  const finalReceiving = receivingQty !== undefined ? receivingQty : (existing ? Number(existing.receiving_qty) : 0);
  const finalUsage = usageQty !== undefined ? usageQty : (existing ? Number(existing.usage_qty) : 0);
  const finalAdjustment = adjustmentQty !== undefined ? adjustmentQty : (existing ? Number(existing.adjustment_qty) : 0);
  
  // 전일 재고 조회
  const prevResult = await db.execute(
    `SELECT running_stock FROM material_ledger_daily
     WHERE tenant_id = ? AND material_id = ? AND ledger_date < ?
     ORDER BY ledger_date DESC LIMIT 1`,
    [tenantId, materialId, ledgerDate]
  );
  const prevRows = getRows<{ running_stock: number }>(prevResult);
  const prevStock = prevRows?.[0]?.running_stock ? Number(prevRows[0].running_stock) : 0;
  const runningStock = prevStock + finalReceiving - finalUsage + finalAdjustment;
  
  await db.execute(
    `INSERT INTO material_ledger_daily 
     (tenant_id, material_id, ledger_date, receiving_qty, usage_qty, adjustment_qty, running_stock, notes, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       receiving_qty = VALUES(receiving_qty),
       usage_qty = VALUES(usage_qty),
       adjustment_qty = VALUES(adjustment_qty),
       running_stock = VALUES(running_stock),
       notes = CASE WHEN VALUES(notes) = '' THEN notes ELSE VALUES(notes) END,
       source = VALUES(source),
       updated_at = NOW()`,
    [tenantId, materialId, ledgerDate, finalReceiving, finalUsage, finalAdjustment, runningStock, notes, source]
  );
  
  return { materialId, ledgerDate, receivingQty: finalReceiving, usageQty: finalUsage, adjustmentQty: finalAdjustment, runningStock };
}

/** 일별 수불 삭제 */
export async function deleteDailyLedger(id: number, tenantId: number) {
  const db = await getRawConnection();
  await db.execute(
    `DELETE FROM material_ledger_daily WHERE id = ? AND tenant_id = ?`,
    [id, tenantId]
  );
  return { success: true };
}

// ===== 매입(입고) 연동 =====

/**
 * 매입 등록 후 원료수불부 입고 자동 반영
 * createPurchase 완료 후 호출
 */
export async function onPurchaseCreated(params: {
  materialId: number;
  quantity: number;
  packagingSize?: number;
  transactionDate: string;
  unitPrice?: number;
}, tenantId: number) {
  try {
    const totalQty = (params.packagingSize || 1) * params.quantity;
    
    // 기존 일별 데이터에서 현재 입고량 가져오기
    const db = await getRawConnection();
    const existResult = await db.execute(
      `SELECT receiving_qty FROM material_ledger_daily
       WHERE tenant_id = ? AND material_id = ? AND ledger_date = ?`,
      [tenantId, params.materialId, params.transactionDate]
    );
    const existRows = getRows<{ receiving_qty: number }>(existResult);
    const currentReceiving = existRows?.[0] ? Number(existRows[0].receiving_qty) : 0;
    
    await upsertDailyLedger({
      materialId: params.materialId,
      ledgerDate: params.transactionDate,
      receivingQty: currentReceiving + totalQty,
      source: 'auto_purchase'
    }, tenantId);
    
    console.log(`[원료수불부] 입고 반영: material_id=${params.materialId}, qty=${totalQty}, date=${params.transactionDate}`);
    return { success: true, materialId: params.materialId, receivingQty: totalQty };
  } catch (error) {
    console.error(`[원료수불부] 입고 반영 실패:`, error);
    return { success: false, error: String(error) };
  }
}

// ===== 배치(사용) 연동 =====

/**
 * 배치 완료 후 원료수불부 사용량 자동 반영
 * completeBatch 완료 후 호출
 */
export async function onBatchCompleted(params: {
  batchId: number;
  completionDate: string;
}, tenantId: number) {
  try {
    const db = await getRawConnection();
    
    // h_batch_inputs에서 해당 배치의 원재료 투입 내역 조회
    interface BatchInput { material_id: number; used_qty: number }
    const batchInputResult = await db.execute(
      `SELECT material_id,
              COALESCE(actual_quantity, planned_quantity) as used_qty
       FROM h_batch_inputs
       WHERE batch_id = ? AND tenant_id = ?`,
      [params.batchId, tenantId]
    );
    const batchInputs = getRows<BatchInput>(batchInputResult);

    // h_batch_inputs가 비어있으면 h_production_material_usage에서 조회
    let inputs: BatchInput[] = batchInputs;
    if (!inputs || inputs.length === 0) {
      const pmuResult = await db.execute(
        `SELECT material_id,
                COALESCE(actual_quantity, planned_quantity) as used_qty
         FROM h_production_material_usage
         WHERE batch_id = ? AND tenant_id = ?`,
        [params.batchId, tenantId]
      );
      inputs = getRows<BatchInput>(pmuResult);
    }
    
    let updatedCount = 0;
    for (const input of inputs) {
      const materialId = Number(input.material_id);
      const usedQty = Number(input.used_qty) || 0;
      
      if (materialId && usedQty > 0) {
        // 기존 일별 데이터에서 현재 사용량 가져오기
        const usageResult = await db.execute(
          `SELECT usage_qty FROM material_ledger_daily
           WHERE tenant_id = ? AND material_id = ? AND ledger_date = ?`,
          [tenantId, materialId, params.completionDate]
        );
        const usageRows = getRows<{ usage_qty: number }>(usageResult);
        const currentUsage = usageRows?.[0] ? Number(usageRows[0].usage_qty) : 0;
        
        await upsertDailyLedger({
          materialId,
          ledgerDate: params.completionDate,
          usageQty: currentUsage + usedQty,
          source: 'auto_batch'
        }, tenantId);
        updatedCount++;
      }
    }
    
    console.log(`[원료수불부] 배치 사용 반영: batch_id=${params.batchId}, materials=${updatedCount}, date=${params.completionDate}`);
    return { success: true, batchId: params.batchId, updatedMaterials: updatedCount };
  } catch (error) {
    console.error(`[원료수불부] 배치 사용 반영 실패:`, error);
    return { success: false, error: String(error) };
  }
}

// ===== 월별 원료수불부 =====

/** 월별 원료수불부 조회 (엑셀 다운로드용) - 정제수 제외 */
export async function getMonthlyLedger(yearMonth: string, tenantId: number) {
  const db = await getRawConnection();
  // ★ 2026-05-09 (PR #278): 듀얼 lookup — h_materials 미등록 material_id 폴백 (item_master.raw_material)
  const [rows] = await db.execute(
    `SELECT ml.*,
            COALESCE(m.material_name, im.item_name) AS material_name,
            COALESCE(m.material_code, im.item_code) AS material_code,
            COALESCE(m.unit, im.base_unit) AS unit
     FROM material_ledger_monthly ml
     LEFT JOIN h_materials m ON m.id = ml.material_id AND m.tenant_id = ml.tenant_id
     LEFT JOIN item_master im ON im.id = ml.material_id AND im.tenant_id = ml.tenant_id AND im.item_type = 'raw_material'
     WHERE ml.tenant_id = ? AND ml.\`year_month\` = ?
       AND COALESCE(m.material_name, im.item_name) NOT LIKE '%정제수%'
       AND COALESCE(m.material_name, im.item_name) IS NOT NULL
     ORDER BY COALESCE(m.material_name, im.item_name)`,
    [tenantId, yearMonth]
  );
  return rows as Record<string, unknown>[];
}

/** 일별 데이터에서 월별 집계 생성/갱신 */
export async function aggregateMonthlyLedger(yearMonth: string, tenantId: number) {
  const db = await getRawConnection();
  const [year, month] = yearMonth.split('-').map(Number);
  const startDate = `${yearMonth}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
  const prevMonth = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
  
  // 모든 원재료 가져오기 (정제수 제외 - 재료차감 항목이 아님)
  const matResult = await db.execute(
    `SELECT id, material_name FROM h_materials WHERE tenant_id = ? AND is_active = 1 AND material_name NOT LIKE '%정제수%' ORDER BY material_name`,
    [tenantId]
  );
  const materials = getRows<{ id: number; material_name: string }>(matResult);
  
  for (const mat of materials) {
    // 전월 재고
    const prevStockResult = await db.execute(
      `SELECT end_stock FROM material_ledger_monthly
       WHERE tenant_id = ? AND material_id = ? AND \`year_month\` = ?`,
      [tenantId, mat.id, prevMonth]
    );
    const prevStockRows = getRows<{ end_stock: number }>(prevStockResult);
    const prevStock = prevStockRows?.[0]?.end_stock ? Number(prevStockRows[0].end_stock) : 0;

    // 일별 데이터 조회 (adjustment_qty 포함)
    const dailyResult = await db.execute(
      `SELECT DAY(ledger_date) as day_num, receiving_qty, usage_qty, adjustment_qty
       FROM material_ledger_daily
       WHERE tenant_id = ? AND material_id = ? AND ledger_date >= ? AND ledger_date <= ?`,
      [tenantId, mat.id, startDate, endDate]
    );
    const dailyRows = getRows<{ day_num: number; receiving_qty: number; usage_qty: number; adjustment_qty: number }>(dailyResult);
    
    // 일별 배열 초기화
    const rd: number[] = new Array(31).fill(0);
    const ud: number[] = new Array(31).fill(0);
    let rt = 0, ut = 0, at = 0;
    
    for (const row of dailyRows) {
      const i = Number(row.day_num) - 1;
      rd[i] = Number(row.receiving_qty) || 0;
      ud[i] = Number(row.usage_qty) || 0;
      rt += rd[i];
      ut += ud[i];
      at += Number(row.adjustment_qty) || 0;
    }
    
    // 음수 재고는 0으로 클램핑 (입고 누락 또는 BOM 오류 시 발생 가능)
    // adjustment_qty 포함: 재고 조정(+/-)을 반영
    const endStock = Math.max(prevStock + rt - ut + at, 0);
    
    await db.execute(
      `INSERT INTO material_ledger_monthly 
       (tenant_id, material_id, \`year_month\`, prev_stock, receiving_total,
        receiving_day_01, receiving_day_02, receiving_day_03, receiving_day_04, receiving_day_05,
        receiving_day_06, receiving_day_07, receiving_day_08, receiving_day_09, receiving_day_10,
        receiving_day_11, receiving_day_12, receiving_day_13, receiving_day_14, receiving_day_15,
        receiving_day_16, receiving_day_17, receiving_day_18, receiving_day_19, receiving_day_20,
        receiving_day_21, receiving_day_22, receiving_day_23, receiving_day_24, receiving_day_25,
        receiving_day_26, receiving_day_27, receiving_day_28, receiving_day_29, receiving_day_30,
        receiving_day_31,
        usage_total,
        usage_day_01, usage_day_02, usage_day_03, usage_day_04, usage_day_05,
        usage_day_06, usage_day_07, usage_day_08, usage_day_09, usage_day_10,
        usage_day_11, usage_day_12, usage_day_13, usage_day_14, usage_day_15,
        usage_day_16, usage_day_17, usage_day_18, usage_day_19, usage_day_20,
        usage_day_21, usage_day_22, usage_day_23, usage_day_24, usage_day_25,
        usage_day_26, usage_day_27, usage_day_28, usage_day_29, usage_day_30,
        usage_day_31,
        end_stock)
       VALUES (?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?)
       ON DUPLICATE KEY UPDATE
        prev_stock = VALUES(prev_stock), receiving_total = VALUES(receiving_total),
        receiving_day_01 = VALUES(receiving_day_01), receiving_day_02 = VALUES(receiving_day_02),
        receiving_day_03 = VALUES(receiving_day_03), receiving_day_04 = VALUES(receiving_day_04),
        receiving_day_05 = VALUES(receiving_day_05), receiving_day_06 = VALUES(receiving_day_06),
        receiving_day_07 = VALUES(receiving_day_07), receiving_day_08 = VALUES(receiving_day_08),
        receiving_day_09 = VALUES(receiving_day_09), receiving_day_10 = VALUES(receiving_day_10),
        receiving_day_11 = VALUES(receiving_day_11), receiving_day_12 = VALUES(receiving_day_12),
        receiving_day_13 = VALUES(receiving_day_13), receiving_day_14 = VALUES(receiving_day_14),
        receiving_day_15 = VALUES(receiving_day_15), receiving_day_16 = VALUES(receiving_day_16),
        receiving_day_17 = VALUES(receiving_day_17), receiving_day_18 = VALUES(receiving_day_18),
        receiving_day_19 = VALUES(receiving_day_19), receiving_day_20 = VALUES(receiving_day_20),
        receiving_day_21 = VALUES(receiving_day_21), receiving_day_22 = VALUES(receiving_day_22),
        receiving_day_23 = VALUES(receiving_day_23), receiving_day_24 = VALUES(receiving_day_24),
        receiving_day_25 = VALUES(receiving_day_25), receiving_day_26 = VALUES(receiving_day_26),
        receiving_day_27 = VALUES(receiving_day_27), receiving_day_28 = VALUES(receiving_day_28),
        receiving_day_29 = VALUES(receiving_day_29), receiving_day_30 = VALUES(receiving_day_30),
        receiving_day_31 = VALUES(receiving_day_31),
        usage_total = VALUES(usage_total),
        usage_day_01 = VALUES(usage_day_01), usage_day_02 = VALUES(usage_day_02),
        usage_day_03 = VALUES(usage_day_03), usage_day_04 = VALUES(usage_day_04),
        usage_day_05 = VALUES(usage_day_05), usage_day_06 = VALUES(usage_day_06),
        usage_day_07 = VALUES(usage_day_07), usage_day_08 = VALUES(usage_day_08),
        usage_day_09 = VALUES(usage_day_09), usage_day_10 = VALUES(usage_day_10),
        usage_day_11 = VALUES(usage_day_11), usage_day_12 = VALUES(usage_day_12),
        usage_day_13 = VALUES(usage_day_13), usage_day_14 = VALUES(usage_day_14),
        usage_day_15 = VALUES(usage_day_15), usage_day_16 = VALUES(usage_day_16),
        usage_day_17 = VALUES(usage_day_17), usage_day_18 = VALUES(usage_day_18),
        usage_day_19 = VALUES(usage_day_19), usage_day_20 = VALUES(usage_day_20),
        usage_day_21 = VALUES(usage_day_21), usage_day_22 = VALUES(usage_day_22),
        usage_day_23 = VALUES(usage_day_23), usage_day_24 = VALUES(usage_day_24),
        usage_day_25 = VALUES(usage_day_25), usage_day_26 = VALUES(usage_day_26),
        usage_day_27 = VALUES(usage_day_27), usage_day_28 = VALUES(usage_day_28),
        usage_day_29 = VALUES(usage_day_29), usage_day_30 = VALUES(usage_day_30),
        usage_day_31 = VALUES(usage_day_31),
        end_stock = VALUES(end_stock),
        updated_at = NOW()`,
      [tenantId, mat.id, yearMonth, prevStock, rt,
       ...rd,
       ut,
       ...ud,
       endStock]
    );
  }
  
  return { yearMonth, materialCount: materials.length, status: 'aggregated' };
}

// ===== 월마감 승인 =====

/** 월마감 승인 상태 조회 */
export async function getApprovalStatus(yearMonth: string, tenantId: number) {
  const db = await getRawConnection();
  const result = await db.execute(
    `SELECT * FROM material_ledger_approval WHERE tenant_id = ? AND \`year_month\` = ?`,
    [tenantId, yearMonth]
  );
  const rows = getRows(result);
  return rows?.[0] || { status: 'not_submitted', yearMonth };
}

/** 월마감 제출 */
export async function submitForApproval(yearMonth: string, userId: number, tenantId: number) {
  const db = await getRawConnection();
  await db.execute(
    `INSERT INTO material_ledger_approval (tenant_id, \`year_month\`, status, submitted_by, submitted_at)
     VALUES (?, ?, 'pending', ?, NOW())
     ON DUPLICATE KEY UPDATE status = 'pending', submitted_by = VALUES(submitted_by), submitted_at = NOW(), updated_at = NOW()`,
    [tenantId, yearMonth, userId]
  );
  await db.execute(
    `UPDATE material_ledger_monthly SET status = 'pending' WHERE tenant_id = ? AND \`year_month\` = ?`,
    [tenantId, yearMonth]
  );
  return { yearMonth, status: 'pending' };
}

/** 월마감 승인 */
export async function approveMonthlyClose(yearMonth: string, userId: number, tenantId: number) {
  const db = await getRawConnection();
  await db.execute(
    `UPDATE material_ledger_approval SET status = 'approved', approved_by = ?, approved_at = NOW(), updated_at = NOW()
     WHERE tenant_id = ? AND \`year_month\` = ?`,
    [userId, tenantId, yearMonth]
  );
  await db.execute(
    `UPDATE material_ledger_monthly SET status = 'approved' WHERE tenant_id = ? AND \`year_month\` = ?`,
    [tenantId, yearMonth]
  );
  return { yearMonth, status: 'approved' };
}

/** 월마감 반려 */
export async function rejectMonthlyClose(yearMonth: string, userId: number, reason: string, tenantId: number) {
  const db = await getRawConnection();
  await db.execute(
    `UPDATE material_ledger_approval SET status = 'rejected', approved_by = ?, rejected_reason = ?, updated_at = NOW()
     WHERE tenant_id = ? AND \`year_month\` = ?`,
    [userId, reason, tenantId, yearMonth]
  );
  await db.execute(
    `UPDATE material_ledger_monthly SET status = 'draft' WHERE tenant_id = ? AND \`year_month\` = ?`,
    [tenantId, yearMonth]
  );
  return { yearMonth, status: 'rejected', reason };
}

// ===== 일일 마감 자동 업데이트 =====

/**
 * 일일 마감 후 원료수불부 자동 업데이트
 * 실제 DB 테이블 구조에 맞춰 수정:
 * - 입고: h_inventory_lots (material_id + receipt_date 기반)
 * - 사용: h_batch_inputs 또는 h_production_material_usage (batch 완료일 기반)
 */
export async function autoUpdateFromDailyClose(closeDate: string, tenantId: number) {
  const db = await getRawConnection();
  
  // 1. 해당 날짜의 입고 데이터 집계 (h_inventory_lots 기반)
  interface DailyCloseRow { material_id: number; total_receiving?: number; total_usage?: number }
  const recvResult = await db.execute(
    `SELECT material_id, SUM(quantity) as total_receiving
     FROM h_inventory_lots
     WHERE tenant_id = ? AND receipt_date = ? AND material_id IS NOT NULL
     GROUP BY material_id`,
    [tenantId, closeDate]
  );
  const receivingRows = getRows<DailyCloseRow>(recvResult);

  // 2. 해당 날짜에 완료된 배치의 원재료 사용량 집계 (h_batch_inputs 기반)
  const usageResult = await db.execute(
    `SELECT bi.material_id, SUM(COALESCE(bi.actual_quantity, bi.planned_quantity)) as total_usage
     FROM h_batch_inputs bi
     JOIN h_batches pb ON pb.id = bi.batch_id
     WHERE bi.tenant_id = ? AND DATE(pb.completed_at) = ? AND pb.status = 'completed'
     GROUP BY bi.material_id`,
    [tenantId, closeDate]
  );
  const usageRows = getRows<DailyCloseRow>(usageResult);

  // 3. h_batch_inputs가 비어있으면 h_production_material_usage에서 조회
  let finalUsageRows = usageRows;
  if (!usageRows || usageRows.length === 0) {
    const pmuResult = await db.execute(
      `SELECT pmu.material_id, SUM(COALESCE(pmu.actual_quantity, pmu.planned_quantity)) as total_usage
       FROM h_production_material_usage pmu
       JOIN h_batches pb ON pb.id = pmu.batch_id
       WHERE pmu.tenant_id = ? AND DATE(pb.completed_at) = ? AND pb.status = 'completed'
       GROUP BY pmu.material_id`,
      [tenantId, closeDate]
    );
    finalUsageRows = getRows<DailyCloseRow>(pmuResult);
  }
  
  // 4. 입고량 반영
  for (const row of receivingRows) {
    await upsertDailyLedger({
      materialId: Number(row.material_id),
      ledgerDate: closeDate,
      receivingQty: Number(row.total_receiving) || 0,
      source: 'auto_daily_close'
    }, tenantId);
  }
  
  // 5. 사용량 반영
  for (const row of finalUsageRows) {
    await upsertDailyLedger({
      materialId: Number(row.material_id),
      ledgerDate: closeDate,
      usageQty: Number(row.total_usage) || 0,
      source: 'auto_daily_close'
    }, tenantId);
  }
  
  // 6. 해당 월 집계 갱신
  const yearMonth = closeDate.substring(0, 7);
  await aggregateMonthlyLedger(yearMonth, tenantId);
  
  console.log(`[원료수불부] 일일 마감 자동 업데이트 완료: date=${closeDate}, 입고=${receivingRows.length}건, 사용=${finalUsageRows.length}건`);
  return { closeDate, receivingCount: receivingRows.length, usageCount: finalUsageRows.length };
}

// ===== 대시보드 통계 =====

/** 원료수불부 대시보드 요약 (지정월 또는 당월 기준)
 *
 * ★ 수정 2026-04-12: material_ledger_daily 에 의존하지 않고 권위있는 소스(
 *   h_inbound_lines, h_batch_inputs) 에서 직접 집계.
 *   - 입고: h_inbound_lines (confirmed) ∪ material_ledger_daily.receiving_qty (폴백)
 *   - 사용: h_batch_inputs (planned|actual) ∪ material_ledger_daily.usage_qty (폴백)
 *   - 이 방식으로 배치가 진행중(in_progress) 이어도 BOM 기준 사용량을 즉시 반영
 */
export async function getDashboardSummary(tenantId: number, targetMonth?: string) {
  const db = await getRawConnection();
  const today = todayKST();
  const yearMonth = targetMonth || today.substring(0, 7);
  const [yr, mo] = yearMonth.split('-').map(Number);
  const lastDay = new Date(yr, mo, 0).getDate();
  const startDate = `${yearMonth}-01`;
  const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

  // ───── 1. 입고 (receiving) ─────
  // 1-a. h_inbound_lines (confirmed) 합계
  let totalReceiving = 0;
  let totalReceivingAmount = 0;
  try {
    const inbResult = await db.execute(
      `SELECT
         COALESCE(SUM(l.stock_quantity), 0) AS qty,
         COALESCE(SUM(l.stock_quantity * COALESCE(m.unit_price, 0)), 0) AS amt
       FROM h_inbound_lines l
       JOIN h_inbound_headers h ON h.id = l.header_id AND h.tenant_id = l.tenant_id
       JOIN h_materials m ON m.id = l.material_id AND m.tenant_id = l.tenant_id
       WHERE l.tenant_id = ?
         AND h.status = 'confirmed'
         AND h.inbound_date BETWEEN ? AND ?
         AND m.material_name NOT LIKE '%정제수%'`,
      [tenantId, startDate, endDate],
    );
    const r = getRows<{ qty: number; amt: number }>(inbResult);
    totalReceiving = Number(r?.[0]?.qty || 0);
    totalReceivingAmount = Number(r?.[0]?.amt || 0);
  } catch (err) {
    logWarn("원료수불: h_inbound_lines 집계 실패 — 폴백 경로 사용", { tenantId, operation: "materialLedger.receiving", error: String(err) });
  }

  // 1-b. 폴백: material_ledger_daily (h_inbound_lines 에 없는 과거 데이터)
  if (totalReceiving === 0) {
    try {
      const monthResult = await db.execute(
        `SELECT
           COALESCE(SUM(d.receiving_qty), 0) as qty,
           COALESCE(SUM(d.receiving_qty * COALESCE(m.unit_price, 0)), 0) as amt
         FROM material_ledger_daily d
         JOIN h_materials m ON m.id = d.material_id AND m.tenant_id = d.tenant_id
         WHERE d.tenant_id = ? AND d.ledger_date >= ? AND d.ledger_date <= ?
           AND m.material_name NOT LIKE '%정제수%'`,
        [tenantId, startDate, endDate],
      );
      const r = getRows<{ qty: number; amt: number }>(monthResult);
      totalReceiving = Number(r?.[0]?.qty || 0);
      totalReceivingAmount = Number(r?.[0]?.amt || 0);
    } catch (err) {
      logWarn("원료수불: material_ledger_daily 폴백 집계 실패", { tenantId, operation: "materialLedger.receiving.fallback", error: String(err) });
    }
  }

  // ───── 2. 사용 (usage) ─────
  // 2-a. h_batch_inputs 직접 집계 (in_progress/completed/approved/shipped 배치)
  //      ★ 정제수 제외, 실제량 우선 (planned_quantity 폴백)
  let totalUsage = 0;
  let totalUsageAmount = 0;
  try {
    const usageResult = await db.execute(
      `SELECT
         COALESCE(SUM(COALESCE(bi.actual_quantity, bi.planned_quantity, 0)), 0) AS qty,
         COALESCE(SUM(COALESCE(bi.actual_quantity, bi.planned_quantity, 0) * COALESCE(m.unit_price, 0)), 0) AS amt
       FROM h_batch_inputs bi
       JOIN h_batches b ON b.id = bi.batch_id AND b.tenant_id = bi.tenant_id
       JOIN h_materials m ON m.id = bi.material_id AND m.tenant_id = bi.tenant_id
       WHERE bi.tenant_id = ?
         AND b.planned_date BETWEEN ? AND ?
         AND b.status IN ('in_progress','completed','approved','shipped','archived')
         AND m.material_name NOT LIKE '%정제수%'`,
      [tenantId, startDate, endDate],
    );
    const r = getRows<{ qty: number; amt: number }>(usageResult);
    totalUsage = Number(r?.[0]?.qty || 0);
    totalUsageAmount = Number(r?.[0]?.amt || 0);
  } catch (err) {
    logWarn("원료수불: h_batch_inputs 집계 실패 — 폴백 경로 사용", { tenantId, operation: "materialLedger.usage", error: String(err) });
  }

  // 2-b. 폴백: h_production_material_usage (h_batch_inputs 가 비어있는 경우)
  if (totalUsage === 0) {
    try {
      const pmuResult = await db.execute(
        `SELECT
           COALESCE(SUM(COALESCE(pmu.actual_quantity, pmu.planned_quantity, 0)), 0) AS qty,
           COALESCE(SUM(COALESCE(pmu.actual_quantity, pmu.planned_quantity, 0) * COALESCE(m.unit_price, 0)), 0) AS amt
         FROM h_production_material_usage pmu
         JOIN h_batches b ON b.id = pmu.batch_id AND b.tenant_id = pmu.tenant_id
         JOIN h_materials m ON m.id = pmu.material_id AND m.tenant_id = pmu.tenant_id
         WHERE pmu.tenant_id = ?
           AND b.planned_date BETWEEN ? AND ?
           AND m.material_name NOT LIKE '%정제수%'`,
        [tenantId, startDate, endDate],
      );
      const r = getRows<{ qty: number; amt: number }>(pmuResult);
      totalUsage = Number(r?.[0]?.qty || 0);
      totalUsageAmount = Number(r?.[0]?.amt || 0);
    } catch (err) {
      logWarn("원료수불: h_production_material_usage 폴백 집계 실패", { tenantId, operation: "materialLedger.usage.pmuFallback", error: String(err) });
    }
  }

  // 2-c. 폴백: material_ledger_daily.usage_qty
  if (totalUsage === 0) {
    try {
      const mldResult = await db.execute(
        `SELECT
           COALESCE(SUM(d.usage_qty), 0) as qty,
           COALESCE(SUM(d.usage_qty * COALESCE(m.unit_price, 0)), 0) as amt
         FROM material_ledger_daily d
         JOIN h_materials m ON m.id = d.material_id AND m.tenant_id = d.tenant_id
         WHERE d.tenant_id = ? AND d.ledger_date >= ? AND d.ledger_date <= ?
           AND m.material_name NOT LIKE '%정제수%'`,
        [tenantId, startDate, endDate],
      );
      const r = getRows<{ qty: number; amt: number }>(mldResult);
      totalUsage = Number(r?.[0]?.qty || 0);
      totalUsageAmount = Number(r?.[0]?.amt || 0);
    } catch (err) {
      logWarn("원료수불: material_ledger_daily 폴백 집계 실패", { tenantId, operation: "materialLedger.usage.mldFallback", error: String(err) });
    }
  }

  // 이번 달 승인 상태
  const approval = await getApprovalStatus(yearMonth, tenantId);

  // 총 원재료 수 (정제수 제외)
  const matCountResult = await db.execute(
    `SELECT COUNT(*) as cnt FROM h_materials WHERE tenant_id = ? AND is_active = 1 AND material_name NOT LIKE '%정제수%'`,
    [tenantId]
  );
  const matCountRows = getRows<{ cnt: number }>(matCountResult);

  return {
    materialCount: Number(matCountRows?.[0]?.cnt) || 0,
    yearMonth,
    totalReceiving: Math.round(totalReceiving * 10) / 10,
    totalUsage: Math.round(totalUsage * 10) / 10,
    totalReceivingAmount: Math.round(totalReceivingAmount),
    totalUsageAmount: Math.round(totalUsageAmount),
    approvalStatus: approval.status || 'not_submitted',
  };
}

// ========== 회계 연동 ==========
/**
 * 원재료 수불 → 회계 원장 자동 연동 (복식부기)
 * - 입고(purchase): 차변 원재료(INVENTORY_RAW) / 대변 외상매입금(ACCOUNTS_PAYABLE)
 * - 사용(usage): 차변 매출원가(COST_OF_GOODS) / 대변 원재료(INVENTORY_RAW)
 */
export async function syncToAccounting(
  tenantId: number,
  type: 'purchase' | 'usage',
  date: string,
  materialName: string,
  quantity: number,
  unitPrice: number,
  userId: number
) {
  const conn = await getRawConnection();
  
  const amount = quantity * unitPrice;
  if (amount <= 0) return null;
  
  const description = type === 'purchase' 
    ? `원재료 입고: ${materialName} ${quantity}kg × ${unitPrice}원`
    : `원재료 사용: ${materialName} ${quantity}kg × ${unitPrice}원`;

  // system_code 기반 계정 조회
  const inventoryAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_RAW, "1410", "원재료");
  
  let debitAcc: { id: number; code: string; name: string };
  let creditAcc: { id: number; code: string; name: string };

  if (type === 'purchase') {
    // 입고: 차변 원재료, 대변 외상매입금
    debitAcc = inventoryAcc;
    creditAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE, "2010", "외상매입금");
  } else {
    // 사용: 차변 매출원가, 대변 원재료
    debitAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.COST_OF_GOODS, "5010", "매출원가");
    creditAcc = inventoryAcc;
  }
  
  // expense_journal_entries/lines에 복식부기 분개 생성
  const jeResult = await conn.execute(
    `INSERT INTO expense_journal_entries
       (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
     VALUES (?, NULL, ?, ?, ?, ?, ?)`,
    [tenantId, date, `[원재료수불] ${description}`, amount, amount, userId]
  );
  const journalEntryId = getInsertId(jeResult);

  // 차변 라인
  await insertJournalLine(conn, {
    tenantId, journalEntryId,
    accountId: debitAcc.id, accountCode: debitAcc.code, accountName: debitAcc.name,
    debitAmount: amount, creditAmount: 0,
    description, sortOrder: 0,
  });

  // 대변 라인
  await insertJournalLine(conn, {
    tenantId, journalEntryId,
    accountId: creditAcc.id, accountCode: creditAcc.code, accountName: creditAcc.name,
    debitAmount: 0, creditAmount: amount,
    description, sortOrder: 1,
  });

  return journalEntryId;
}

// ========== 체크리스트 연동 ==========
export async function getMaterialChecklistData(date: string, tenantId: number) {
  const conn = await getRawConnection();
  // 해당 일자의 원재료 입고/사용 요약 - 체크리스트 항목으로 제공
  interface ChecklistItem { material_name: string; qty: number }
  const recvResult = await conn.execute(`
    SELECT m.material_name,
           COALESCE(d.receiving_day_${String(new Date(date).getDate()).padStart(2, '0')}, 0) as qty
    FROM material_ledger_monthly d
    JOIN h_materials m ON m.id = d.material_id
    WHERE d.tenant_id = ? AND d.\`year_month\` = ?
    AND COALESCE(d.receiving_day_${String(new Date(date).getDate()).padStart(2, '0')}, 0) > 0
  `, [tenantId, date.substring(0, 7)]);
  const receiving = getRows<ChecklistItem>(recvResult);

  const usageResult = await conn.execute(`
    SELECT m.material_name,
           COALESCE(d.usage_day_${String(new Date(date).getDate()).padStart(2, '0')}, 0) as qty
    FROM material_ledger_monthly d
    JOIN h_materials m ON m.id = d.material_id
    WHERE d.tenant_id = ? AND d.\`year_month\` = ?
    AND COALESCE(d.usage_day_${String(new Date(date).getDate()).padStart(2, '0')}, 0) > 0
  `, [tenantId, date.substring(0, 7)]);
  const usage = getRows<ChecklistItem>(usageResult);

  return {
    date,
    receivingItems: receiving,
    usageItems: usage,
    receivingCount: receiving.length,
    usageCount: usage.length
  };
  // ※ getRawConnection()은 Pool 싱글턴 → release() 호출 금지
}
