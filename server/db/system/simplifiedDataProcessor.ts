/**
 * 단순 데이터 처리기 (Simplified Data Processor)
 *
 * 신규 테넌트 온보딩 시 과거 운영 데이터를 한번에 축적하는 바이패스 모듈.
 * 기존 파이프라인(BOM→배치→CCP→재고→회계)의 복잡한 의존성을 우회하여
 * 이미 계산된 값을 직접 받아 모든 연동 테이블에 정상 레코드를 생성한다.
 *
 * ── 처리 규칙 9가지 ──
 * 1. 날짜순 정렬 처리 (수불부 정합성)
 * 2. 마스터 자동 등록 (제품/원료/거래처)
 * 3. BOM 바이패스 (투입량 직접 입력)
 * 4. 배치 직접 완료 (status='completed')
 * 5. 입고→차감 순서 보장 (음수 재고 방지)
 * 6. CCP 값 직접 삽입 (프로세스그룹 불필요)
 * 7. 회계 분개 선택적 (금액 있을 때만)
 * 8. 단일 트랜잭션 (전체 롤백)
 * 9. 멱등성 (중복 방지)
 */

import type { PoolConnection } from "mysql2/promise";
import { withTransaction } from "../connection";
import { resolveSystemAccount } from "../accounting/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../../drizzle/schema/accountingAccounts";
import { getRows, getFirstRow, getInsertId } from "../../utils/dbHelpers";

// ════════════════════════════════════════════
// 타입 정의
// ════════════════════════════════════════════

/** 원료 투입 데이터 */
export interface MaterialInput {
  name: string;
  qty: number;       // kg
  unitPrice?: number; // 원/kg (선택)
}

/** CCP 기록 데이터 */
export interface CcpRecord {
  type: string;       // CCP-1B, CCP-2B, CCP-4P 등
  temp?: number;      // 온도 (°C)
  time?: number;      // 시간 (분)
  pressure?: number;  // 압력 (bar)
  feMm?: number;      // 금속검출 Fe (mm)
  susMm?: number;     // 금속검출 SUS (mm)
  result?: string;    // PASS/FAIL (기본: PASS)
}

/** 출고 데이터 */
export interface OutboundData {
  qty: number;
  partner?: string;
  unitPrice?: number;
  releaseType?: string; // sale, delivery 등 (기본: sale)
}

/** 검사 항목 */
export interface InspectionItem {
  itemName: string;
  origin?: string;
  result?: string;    // 적합/부적합 (기본: 적합)
}

/** 단일 일별 생산 레코드 (입력 단위) */
export interface DailyProductionRecord {
  date: string;             // YYYY-MM-DD
  productName: string;
  productionQty: number;    // 생산량 (kg)
  materials?: MaterialInput[];
  ccpRecords?: CcpRecord[];
  outbound?: OutboundData;
  inspections?: InspectionItem[];
}

/** 입고(매입) 레코드 */
export interface PurchaseRecord {
  date: string;
  materialName: string;
  qty: number;
  unitPrice?: number;
  supplier?: string;
}

/** 전체 온보딩 데이터 입력 */
export interface OnboardingDataInput {
  purchases?: PurchaseRecord[];
  productions?: DailyProductionRecord[];
  siteId?: number;      // 기본 1
}

/** 처리 결과 */
export interface ProcessingResult {
  success: boolean;
  summary: {
    mastersCreated: { products: number; materials: number; partners: number };
    purchasesCreated: number;
    batchesCreated: number;
    ccpRecordsCreated: number;
    outboundsCreated: number;
    journalEntriesCreated: number;
    inspectionsCreated: number;
    ledgerEntriesCreated: number;
  };
  errors: string[];
}

// ════════════════════════════════════════════
// 메인 처리 함수
// ════════════════════════════════════════════

export async function processOnboardingData(
  tenantId: number,
  userId: number,
  input: OnboardingDataInput
): Promise<ProcessingResult> {
  const siteId = input.siteId ?? 1;
  const result: ProcessingResult = {
    success: false,
    summary: {
      mastersCreated: { products: 0, materials: 0, partners: 0 },
      purchasesCreated: 0,
      batchesCreated: 0,
      ccpRecordsCreated: 0,
      outboundsCreated: 0,
      journalEntriesCreated: 0,
      inspectionsCreated: 0,
      ledgerEntriesCreated: 0,
    },
    errors: [],
  };

  // 규칙 1: 날짜순 정렬
  const purchases = [...(input.purchases ?? [])].sort(
    (a, b) => a.date.localeCompare(b.date)
  );
  const productions = [...(input.productions ?? [])].sort(
    (a, b) => a.date.localeCompare(b.date) || a.productName.localeCompare(b.productName)
  );

  await withTransaction(async (conn) => {
    // ID 캐시 (마스터 자동 등록용)
    const productIdMap = new Map<string, number>();
    const materialIdMap = new Map<string, number>();
    const partnerIdMap = new Map<string, number>();

    // ── Step 1: 마스터 데이터 수집 및 자동 등록 ──
    const allProductNames = new Set(productions.map((p) => p.productName));
    const allMaterialNames = new Set<string>();
    const allPartnerNames = new Set<string>();

    for (const p of purchases) {
      allMaterialNames.add(p.materialName);
      if (p.supplier) allPartnerNames.add(p.supplier);
    }
    for (const p of productions) {
      if (p.materials) p.materials.forEach((m) => allMaterialNames.add(m.name));
      if (p.outbound?.partner) allPartnerNames.add(p.outbound.partner);
    }

    // 규칙 2: 마스터 자동 등록
    for (const name of allProductNames) {
      const id = await ensureProduct(conn, tenantId, name, userId);
      productIdMap.set(name, id);
      result.summary.mastersCreated.products++;
    }
    for (const name of allMaterialNames) {
      const id = await ensureMaterial(conn, tenantId, name, userId);
      materialIdMap.set(name, id);
      result.summary.mastersCreated.materials++;
    }
    for (const name of allPartnerNames) {
      const id = await ensurePartner(conn, tenantId, name, userId);
      partnerIdMap.set(name, id);
      result.summary.mastersCreated.partners++;
    }

    // ── Step 2: 입고(매입) 처리 — 규칙 5: 입고 먼저 ──
    for (const purchase of purchases) {
      const materialId = materialIdMap.get(purchase.materialName);
      if (!materialId) continue;
      const partnerId = purchase.supplier ? partnerIdMap.get(purchase.supplier) : null;

      await processPurchase(conn, tenantId, userId, {
        date: purchase.date,
        materialId,
        materialName: purchase.materialName,
        qty: purchase.qty,
        unitPrice: purchase.unitPrice ?? 0,
        partnerId: partnerId ?? null,
        siteId,
      });
      result.summary.purchasesCreated++;
    }

    // ── Step 3: 생산 레코드 처리 ──
    for (const prod of productions) {
      const productId = productIdMap.get(prod.productName);
      if (!productId) continue;

      // Step 3a: 배치 생성 (규칙 4: 직접 completed)
      const batchId = await createCompletedBatch(conn, tenantId, userId, {
        date: prod.date,
        productId,
        productName: prod.productName,
        qty: prod.productionQty,
        siteId,
      });
      if (!batchId) continue;
      result.summary.batchesCreated++;

      // Step 3b: 원료 투입 + 재고 차감 (규칙 3: BOM 바이패스)
      if (prod.materials) {
        for (const mat of prod.materials) {
          const materialId = materialIdMap.get(mat.name);
          if (!materialId) continue;

          await createBatchInput(conn, tenantId, {
            batchId,
            materialId,
            materialName: mat.name,
            qty: mat.qty,
            unitPrice: mat.unitPrice,
          });

          // 원료수불 기록 (규칙 5)
          await updateMaterialLedger(conn, tenantId, {
            materialId,
            date: prod.date,
            usageQty: mat.qty,
          });
          result.summary.ledgerEntriesCreated++;
        }
      }

      // Step 3c: 제품 LOT 생성 (재고 증가)
      const lotId = await createProductLot(conn, tenantId, userId, {
        batchId,
        productId,
        productName: prod.productName,
        qty: prod.productionQty,
        date: prod.date,
      });

      // Step 3d: CCP 기록 생성 (규칙 6: 직접 삽입)
      if (prod.ccpRecords) {
        for (const ccp of prod.ccpRecords) {
          await createCcpRecord(conn, tenantId, userId, {
            batchId,
            productId,
            productName: prod.productName,
            date: prod.date,
            siteId,
            ...ccp,
          });
          result.summary.ccpRecordsCreated++;
        }
      }

      // Step 3e: 출고 처리
      if (prod.outbound && prod.outbound.qty > 0) {
        const partnerId = prod.outbound.partner
          ? partnerIdMap.get(prod.outbound.partner) ?? null
          : null;

        await createOutbound(conn, tenantId, userId, {
          lotId,
          batchId,
          productName: prod.productName,
          qty: prod.outbound.qty,
          unitPrice: prod.outbound.unitPrice ?? 0,
          partnerId,
          partnerName: prod.outbound.partner ?? null,
          date: prod.date,
          releaseType: prod.outbound.releaseType ?? "sale",
        });
        result.summary.outboundsCreated++;

        // 규칙 7: 회계 분개 (금액 있을 때만)
        if (prod.outbound.unitPrice && prod.outbound.unitPrice > 0) {
          await createSalesJournal(conn, tenantId, userId, {
            date: prod.date,
            productName: prod.productName,
            qty: prod.outbound.qty,
            unitPrice: prod.outbound.unitPrice,
            partnerId,
          });
          result.summary.journalEntriesCreated++;
        }
      }

      // Step 3f: 검사 기록
      if (prod.inspections && prod.inspections.length > 0) {
        await createInspectionRecord(conn, tenantId, userId, {
          date: prod.date,
          items: prod.inspections,
        });
        result.summary.inspectionsCreated++;
      }
    }

    result.success = true;
  }, "simplifiedDataProcessor");

  return result;
}

// ════════════════════════════════════════════
// 내부 헬퍼 함수들
// ════════════════════════════════════════════

/** 제품 조회 또는 자동 등록 */
async function ensureProduct(
  conn: PoolConnection,
  tenantId: number,
  name: string,
  userId: number
): Promise<number> {
  // 정상 시스템의 진실 source 는 h_products_v2 (batch.product_id 와 일치).
  // 과거에 h_item_master 만 사용해서 batch/lot 의 product_id 와 정합성 깨지는 사고가
  // 있어서 (2026-04-25 옵션 A 로 82건 정정), h_products_v2 우선 조회/등록 으로 변경.
  // h_item_master 도 동기화 (legacy_product_id) — 다른 모듈 호환성 유지.
  const [v2Rows] = await conn.execute(
    `SELECT id FROM h_products_v2
     WHERE tenant_id = ? AND product_name = ? AND is_active = 1
     LIMIT 1`,
    [tenantId, name]
  );
  const v2Existing = getFirstRow<{ id: number }>(v2Rows);
  if (v2Existing) {
    // h_item_master 에 legacy_product_id 매핑 보강 (없으면 추가)
    await conn.execute(
      `INSERT IGNORE INTO h_item_master
         (tenant_id, item_code, item_name, item_type, base_unit,
          legacy_product_id, created_by, created_at)
       SELECT tenant_id, product_code, product_name, 'finished_product', COALESCE(unit, 'kg'),
              id, ?, NOW()
         FROM h_products_v2 WHERE id = ?`,
      [userId, v2Existing.id]
    );
    return v2Existing.id;
  }

  // 자동 코드 생성 (h_products_v2 기준 카운트 — tenant 격리)
  const [countRows] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM h_products_v2 WHERE tenant_id = ?`,
    [tenantId]
  );
  const cnt = getFirstRow<{ cnt: number }>(countRows)?.cnt ?? 0;
  const code = `FP-${String(cnt + 1).padStart(4, "0")}`;

  // h_products_v2 INSERT (정상 진실 source)
  const [insertResult] = await conn.execute(
    `INSERT INTO h_products_v2
       (tenant_id, product_code, product_name, unit, is_active, created_at)
     VALUES (?, ?, ?, 'kg', 1, NOW())`,
    [tenantId, code, name]
  );
  const productId = getInsertId(insertResult);

  // h_item_master 동기화 (다른 모듈에서 item_master 사용)
  await conn.execute(
    `INSERT INTO h_item_master
       (tenant_id, item_code, item_name, item_type, base_unit,
        legacy_product_id, created_by, created_at)
     VALUES (?, ?, ?, 'finished_product', 'kg', ?, ?, NOW())`,
    [tenantId, code, name, productId, userId]
  );

  return productId;
}

/** 원료 조회 또는 자동 등록
 *  진실 source 는 h_materials (h_inventory_lots.material_id 와 일치).
 *  h_item_master 동기화 (legacy_material_id) — 다른 모듈 호환성. */
async function ensureMaterial(
  conn: PoolConnection,
  tenantId: number,
  name: string,
  userId: number
): Promise<number> {
  const [matRows] = await conn.execute(
    `SELECT id FROM h_materials
     WHERE tenant_id = ? AND material_name = ? AND is_active = 1
     LIMIT 1`,
    [tenantId, name]
  );
  const matExisting = getFirstRow<{ id: number }>(matRows);
  if (matExisting) {
    await conn.execute(
      `INSERT IGNORE INTO h_item_master
         (tenant_id, item_code, item_name, item_type, base_unit,
          legacy_material_id, created_by, created_at)
       SELECT tenant_id, material_code, material_name, 'raw_material', COALESCE(unit, 'kg'),
              id, ?, NOW()
         FROM h_materials WHERE id = ?`,
      [userId, matExisting.id]
    );
    return matExisting.id;
  }

  const [countRows] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM h_materials WHERE tenant_id = ?`,
    [tenantId]
  );
  const cnt = getFirstRow<{ cnt: number }>(countRows)?.cnt ?? 0;
  const code = `RM-${String(cnt + 1).padStart(4, "0")}`;

  // h_materials INSERT (진실 source)
  const [insertResult] = await conn.execute(
    `INSERT INTO h_materials
       (tenant_id, material_code, material_name, unit, kind, is_active, created_at)
     VALUES (?, ?, ?, 'kg', 'RAW', 1, NOW())`,
    [tenantId, code, name]
  );
  const materialId = getInsertId(insertResult);

  // h_item_master 동기화
  await conn.execute(
    `INSERT INTO h_item_master
       (tenant_id, item_code, item_name, item_type, base_unit,
        legacy_material_id, created_by, created_at)
     VALUES (?, ?, ?, 'raw_material', 'kg', ?, ?, NOW())`,
    [tenantId, code, name, materialId, userId]
  );

  return materialId;
}

/** 거래처 조회 또는 자동 등록 */
async function ensurePartner(
  conn: PoolConnection,
  tenantId: number,
  name: string,
  userId: number
): Promise<number> {
  const [rows] = await conn.execute(
    `SELECT id FROM partners
     WHERE tenant_id = ? AND company_name = ?
     LIMIT 1`,
    [tenantId, name]
  );
  const existing = getFirstRow<{ id: number }>(rows);
  if (existing) return existing.id;

  const [insertResult] = await conn.execute(
    `INSERT INTO partners (tenant_id, company_name, partner_type, status, created_by, created_at)
     VALUES (?, ?, 'both', 'active', ?, NOW())`,
    [tenantId, name, userId]
  );
  return getInsertId(insertResult);
}

/** 매입(입고) 처리: 매입 레코드 + 재고 LOT + 수불 기록 */
async function processPurchase(
  conn: PoolConnection,
  tenantId: number,
  userId: number,
  params: {
    date: string;
    materialId: number;
    materialName: string;
    qty: number;
    unitPrice: number;
    partnerId: number | null;
    siteId: number;
  }
): Promise<void> {
  const totalAmount = params.qty * params.unitPrice;

  // 규칙 9: 멱등성 — 중복 체크
  const [dupRows] = await conn.execute(
    `SELECT id FROM accounting_purchases
     WHERE tenant_id = ? AND transaction_date = ? AND item_name = ?
       AND quantity = ? AND source_type = 'simplified_import'
     LIMIT 1`,
    [tenantId, params.date, params.materialName, params.qty]
  );
  if (getFirstRow(dupRows)) return;

  // 매입 레코드
  const [purchaseResult] = await conn.execute(
    `INSERT INTO accounting_purchases
     (tenant_id, transaction_date, partner_id, item_name, quantity, unit, unit_price, total_amount,
      status, evidence_type, source_type, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, 'kg', ?, ?, 'approved', 'none', 'simplified_import', ?, NOW())`,
    [tenantId, params.date, params.partnerId, params.materialName, params.qty, params.unitPrice, totalAmount, userId]
  );
  const purchaseId = getInsertId(purchaseResult);

  // 재고 LOT 생성
  const lotNumber = `LOT-${params.date.replace(/-/g, "")}-${purchaseId}`;
  const [lotResult] = await conn.execute(
    `INSERT INTO h_inventory_lots
     (tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity,
      unit, unit_price, receipt_date, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'kg', ?, ?, 'available', NOW())`,
    [tenantId, params.materialId, lotNumber, params.qty, params.qty, params.qty, params.unitPrice, params.date]
  );
  const lotId = getInsertId(lotResult);

  // h_inventory 집계 레코드 upsert
  await conn.execute(
    `INSERT INTO h_inventory (tenant_id, material_id, total_quantity, available_quantity, unit, last_updated)
     VALUES (?, ?, ?, ?, 'kg', NOW())
     ON DUPLICATE KEY UPDATE
       total_quantity = total_quantity + VALUES(total_quantity),
       available_quantity = available_quantity + VALUES(available_quantity),
       last_updated = NOW()`,
    [tenantId, params.materialId, params.qty, params.qty]
  );

  // 입고 트랜잭션 기록
  // PR-§5.2-2: material_id 직접 작성
  await conn.execute(
    `INSERT INTO h_inventory_transactions
     (tenant_id, lot_id, material_id, transaction_type, quantity, unit, reference_type, reference_id,
      notes, created_by, transaction_date)
     VALUES (?, ?, ?, 'receipt', ?, 'kg', 'PURCHASE', ?, '단순임포트 입고', ?, ?)`,
    [tenantId, lotId, params.materialId, params.qty, purchaseId, userId, params.date]
  );

  // 수불부 기록 (입고)
  await updateMaterialLedger(conn, tenantId, {
    materialId: params.materialId,
    date: params.date,
    receivingQty: params.qty,
  });
}

/** 배치 생성 (규칙 4: 직접 completed) */
async function createCompletedBatch(
  conn: PoolConnection,
  tenantId: number,
  userId: number,
  params: {
    date: string;
    productId: number;
    productName: string;
    qty: number;
    siteId: number;
  }
): Promise<number | null> {
  // 규칙 9: 멱등성
  const [dupRows] = await conn.execute(
    `SELECT id FROM h_batches
     WHERE tenant_id = ? AND planned_date = ? AND product_id = ?
       AND actual_quantity = ? AND notes = '단순임포트'
     LIMIT 1`,
    [tenantId, params.date, params.productId, params.qty]
  );
  const dup = getFirstRow<{ id: number }>(dupRows);
  if (dup) return dup.id;

  // 당일 배치 번호 생성
  const [countRows] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM h_batches
     WHERE tenant_id = ? AND planned_date = ?`,
    [tenantId, params.date]
  );
  const cnt = getFirstRow<{ cnt: number }>(countRows)?.cnt ?? 0;
  const dateKey = params.date.replace(/-/g, "");
  const batchCode = `BATCH-${dateKey}-${String(cnt + 1).padStart(3, "0")}`;
  const lotNumber = `${dateKey}-${String(cnt + 1).padStart(3, "0")}`;

  const [batchResult] = await conn.execute(
    `INSERT INTO h_batches
     (tenant_id, batch_code, product_id, planned_quantity, actual_quantity,
      planned_date, status, mode, lot_number, notes,
      site_id, day_batch_group, created_by, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, 'completed', 'auto', ?, '단순임포트',
             ?, ?, ?, NOW(), ?)`,
    [
      tenantId, batchCode, params.productId, params.qty, params.qty,
      params.date, lotNumber,
      params.siteId, `DAY-${dateKey}`, userId, params.date,
    ]
  );
  return getInsertId(batchResult);
}

/** 배치 원료 투입 기록 (규칙 3: BOM 바이패스) */
async function createBatchInput(
  conn: PoolConnection,
  tenantId: number,
  params: {
    batchId: number;
    materialId: number;
    materialName: string;
    qty: number;
    unitPrice?: number;
  }
): Promise<void> {
  await conn.execute(
    `INSERT INTO h_batch_inputs
     (tenant_id, batch_id, material_id, material_name, planned_qty, actual_qty,
      unit, inventory_deducted, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'kg', 1, NOW())`,
    [tenantId, params.batchId, params.materialId, params.materialName, params.qty, params.qty]
  );

  // 원료 재고 차감 (FEFO 순서: 가장 오래된 LOT부터)
  let remainingQty = params.qty;
  const [lots] = await conn.execute(
    `SELECT id, available_quantity FROM h_inventory_lots
     WHERE tenant_id = ? AND material_id = ? AND available_quantity > 0 AND status = 'available'
     ORDER BY receipt_date ASC, id ASC`,
    [tenantId, params.materialId]
  );

  for (const lot of getRows<{ id: number; available_quantity: number }>(lots)) {
    if (remainingQty <= 0) break;
    const deduct = Math.min(remainingQty, Number(lot.available_quantity));
    await conn.execute(
      `UPDATE h_inventory_lots
       SET available_quantity = available_quantity - ?,
           current_quantity = current_quantity - ?,
           status = IF(available_quantity - ? <= 0, 'used', status),
           updated_at = NOW()
       WHERE id = ?`,
      [deduct, deduct, deduct, lot.id]
    );
    remainingQty -= deduct;
  }

  // h_inventory 집계 차감
  if (params.qty > 0) {
    await conn.execute(
      `UPDATE h_inventory
       SET total_quantity = GREATEST(total_quantity - ?, 0),
           available_quantity = GREATEST(available_quantity - ?, 0),
           last_updated = NOW()
       WHERE tenant_id = ? AND material_id = ?`,
      [params.qty, params.qty, tenantId, params.materialId]
    );
  }
}

/** 수불부 기록 (material_ledger_daily) upsert */
async function updateMaterialLedger(
  conn: PoolConnection,
  tenantId: number,
  params: {
    materialId: number;
    date: string;
    receivingQty?: number;
    usageQty?: number;
  }
): Promise<void> {
  const recvQty = params.receivingQty ?? 0;
  const useQty = params.usageQty ?? 0;

  await conn.execute(
    `INSERT INTO material_ledger_daily
     (tenant_id, material_id, ledger_date, receiving_qty, usage_qty,
      adjustment_qty, running_stock, source, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, 'simplified_import', NOW())
     ON DUPLICATE KEY UPDATE
       receiving_qty = receiving_qty + VALUES(receiving_qty),
       usage_qty = usage_qty + VALUES(usage_qty),
       updated_at = NOW()`,
    [tenantId, params.materialId, params.date, recvQty, useQty]
  );
}

/** 제품 LOT 생성 (완제품 재고 증가) */
async function createProductLot(
  conn: PoolConnection,
  tenantId: number,
  userId: number,
  params: {
    batchId: number;
    productId: number;
    productName: string;
    qty: number;
    date: string;
  }
): Promise<number> {
  // 규칙 9: 동일 배치의 LOT 있으면 재사용
  const [dupRows] = await conn.execute(
    `SELECT id FROM h_inventory_lots
     WHERE tenant_id = ? AND batch_id = ? AND product_id = ?
     LIMIT 1`,
    [tenantId, params.batchId, params.productId]
  );
  const dup = getFirstRow<{ id: number }>(dupRows);
  if (dup) return dup.id;

  const dateKey = params.date.replace(/-/g, "");
  const lotNumber = `PROD-${dateKey}-${params.batchId}`;

  const [lotResult] = await conn.execute(
    `INSERT INTO h_inventory_lots
     (tenant_id, batch_id, product_id, lot_number, quantity, current_quantity,
      available_quantity, unit, production_date, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'kg', ?, 'available', NOW())`,
    [tenantId, params.batchId, params.productId, lotNumber,
     params.qty, params.qty, params.qty, params.date]
  );
  const lotId = getInsertId(lotResult);

  // 입고 트랜잭션
  await conn.execute(
    `INSERT INTO h_inventory_transactions
     (tenant_id, lot_id, transaction_type, quantity, unit,
      notes, created_by, transaction_date)
     VALUES (?, ?, 'inbound', ?, 'kg', ?, ?, ?)`,
    [tenantId, lotId, params.qty,
     `단순임포트 생산완료: ${params.productName}`, userId, params.date]
  );

  return lotId;
}

/** CCP 기록 직접 생성 (규칙 6: 프로세스그룹 불필요) */
async function createCcpRecord(
  conn: PoolConnection,
  tenantId: number,
  userId: number,
  params: {
    batchId: number;
    productId: number;
    productName: string;
    date: string;
    siteId: number;
    type: string;
    temp?: number;
    time?: number;
    pressure?: number;
    feMm?: number;
    susMm?: number;
    result?: string;
  }
): Promise<void> {
  const ccpResult = params.result ?? "PASS";

  // 규칙 9: 멱등성
  const [dupRows] = await conn.execute(
    `SELECT id FROM h_ccp_instances
     WHERE tenant_id = ? AND batch_id = ? AND ccp_type = ?
     LIMIT 1`,
    [tenantId, params.batchId, params.type]
  );
  const existingInstance = getFirstRow<{ id: number }>(dupRows);

  let instanceId: number;
  if (existingInstance) {
    instanceId = existingInstance.id;
  } else {
    // 프로세스 그룹 조회 (있으면 사용, 없으면 NULL)
    const [pgRows] = await conn.execute(
      `SELECT id FROM ccp_process_groups
       WHERE tenant_id = ? AND ccp_type = ? AND is_active = 1
       LIMIT 1`,
      [tenantId, params.type]
    );
    const pg = getFirstRow<{ id: number }>(pgRows);

    const [instResult] = await conn.execute(
      `INSERT INTO h_ccp_instances
       (tenant_id, site_id, work_date, ccp_type, process_group_id,
        product_name, product_id, batch_id, status, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, NOW())`,
      [tenantId, params.siteId, params.date, params.type, pg?.id ?? null,
       params.productName, params.productId, params.batchId, userId]
    );
    instanceId = getInsertId(instResult);
  }

  // CCP 기록 행 (h_ccp_rows)
  if (params.type === "CCP-4P") {
    // 금속검출: Fe + SUS 행
    for (const [label, val] of [["Fe", params.feMm ?? 2.0], ["SUS", params.susMm ?? 3.0]]) {
      await conn.execute(
        `INSERT INTO h_ccp_rows
         (tenant_id, instance_id, batch_no, equipment_name, sort_order,
          row_type, result, auto_generated, notes, created_at)
         VALUES (?, ?, 1, ?, 1, 'measurement', ?, 1, ?, NOW())`,
        [tenantId, instanceId, `금속검출(${label})`, ccpResult,
         `${label} ${val}mm - 단순임포트`]
      );
    }
  } else {
    // 가열/냉각: 온도 + 시간 기록
    await conn.execute(
      `INSERT INTO h_ccp_rows
       (tenant_id, instance_id, batch_no, equipment_name, sort_order,
        row_type, temp_c, duration_min, pressure_bar, result, auto_generated, notes, created_at)
       VALUES (?, ?, 1, ?, 1, 'measurement', ?, ?, ?, ?, 1, '단순임포트', NOW())`,
      [tenantId, instanceId, params.type,
       params.temp ?? null, params.time ?? null, params.pressure ?? null, ccpResult]
    );
  }

  // CCP 폼 레코드 (h_ccp_form_records) — 보고서 표시용
  const [formDup] = await conn.execute(
    `SELECT id FROM h_ccp_form_records
     WHERE tenant_id = ? AND batch_id = ? AND ccp_type = ?
     LIMIT 1`,
    [tenantId, params.batchId, params.type]
  );
  if (!getFirstRow(formDup)) {
    await conn.execute(
      `INSERT INTO h_ccp_form_records
       (tenant_id, site_id, batch_id, ccp_type, work_date,
        product_id, product_name, planned_qty_kg, batch_count,
        status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'approved', NOW(), NOW())`,
      [tenantId, params.siteId, params.batchId, params.type, params.date,
       params.type === "CCP-4P" ? null : params.productId,
       params.type === "CCP-4P" ? "금속검출 통합" : params.productName,
       params.type === "CCP-4P" ? 0 : params.batchId]  // plannedQtyKg은 나중에 재계산 가능
    );
  }
}

/** 출고 레코드 생성 */
async function createOutbound(
  conn: PoolConnection,
  tenantId: number,
  userId: number,
  params: {
    lotId: number;
    batchId: number;
    productName: string;
    qty: number;
    unitPrice: number;
    partnerId: number | null;
    partnerName: string | null;
    date: string;
    releaseType: string;
  }
): Promise<void> {
  const totalAmount = params.qty * params.unitPrice;

  // LOT 재고 차감
  await conn.execute(
    `UPDATE h_inventory_lots
     SET available_quantity = GREATEST(available_quantity - ?, 0),
         status = IF(available_quantity - ? <= 0, 'used', status),
         updated_at = NOW()
     WHERE id = ?`,
    [params.qty, params.qty, params.lotId]
  );

  // 출고 레코드
  const [outResult] = await conn.execute(
    `INSERT INTO h_product_outbound
     (tenant_id, batch_id, lot_id, product_name, quantity, unit, unit_price, total_amount,
      partner_id, partner_name, release_date, release_type, status, notes, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, 'kg', ?, ?, ?, ?, ?, ?, 'confirmed', '단순임포트', ?, NOW())`,
    [tenantId, params.batchId, params.lotId, params.productName, params.qty,
     params.unitPrice, totalAmount, params.partnerId, params.partnerName,
     params.date, params.releaseType, userId]
  );
  const outboundId = getInsertId(outResult);

  // 출고 트랜잭션
  await conn.execute(
    `INSERT INTO h_inventory_transactions
     (tenant_id, lot_id, transaction_type, quantity, unit, notes, created_by, transaction_date)
     VALUES (?, ?, 'outbound', ?, 'kg', ?, ?, ?)`,
    [tenantId, params.lotId, params.qty,
     `단순임포트 출고: ${params.productName} → ${params.partnerName ?? ""}`, userId, params.date]
  );

  // 매출 레코드 (sale/delivery만)
  if (params.releaseType === "sale" || params.releaseType === "delivery") {
    await conn.execute(
      `INSERT INTO accounting_sales
       (tenant_id, transaction_date, partner_id, item_name, quantity, unit, unit_price, total_amount,
        status, source_type, source_id, notes, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, 'kg', ?, ?, 'pending', 'product_outbound', ?, '단순임포트', ?, NOW())`,
      [tenantId, params.date, params.partnerId, params.productName, params.qty,
       params.unitPrice, totalAmount, outboundId, userId]
    );
  }
}

/** 회계 분개 생성 (규칙 7: 금액 있을 때만) */
async function createSalesJournal(
  conn: PoolConnection,
  tenantId: number,
  userId: number,
  params: {
    date: string;
    productName: string;
    qty: number;
    unitPrice: number;
    partnerId: number | null;
  }
): Promise<void> {
  const totalAmount = params.qty * params.unitPrice;
  if (totalAmount <= 0) return;

  // 시스템 계정 조회 (conn 외부에서 별도 pool 사용 — resolveSystemAccount은 getRawConnection 사용)
  const arAccount = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE, "1030", "외상매출금");
  const salesAccount = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.SALES_REVENUE, "4010", "상품매출");

  if (arAccount.id === 0 || salesAccount.id === 0) return; // 계정 미설정 시 스킵

  // 분개 헤더
  const [entryResult] = await conn.execute(
    `INSERT INTO expense_journal_entries
     (tenant_id, entry_date, description, total_debit, total_credit, posted_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [tenantId, params.date, `[단순임포트 매출] ${params.productName}`, totalAmount, totalAmount, userId]
  );
  const entryId = getInsertId(entryResult);

  // 차변: 매출채권
  await conn.execute(
    `INSERT INTO expense_journal_lines
     (tenant_id, journal_entry_id, account_id, account_code, account_name,
      debit_amount, credit_amount, description, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, 1)`,
    [tenantId, entryId, arAccount.id, arAccount.code, arAccount.name, totalAmount, `매출채권: ${params.productName}`]
  );

  // 대변: 매출
  await conn.execute(
    `INSERT INTO expense_journal_lines
     (tenant_id, journal_entry_id, account_id, account_code, account_name,
      debit_amount, credit_amount, description, sort_order)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, 2)`,
    [tenantId, entryId, salesAccount.id, salesAccount.code, salesAccount.name, totalAmount, `매출: ${params.productName}`]
  );
}

/** 검사 기록 생성 (h_generic_checklist_records) */
async function createInspectionRecord(
  conn: PoolConnection,
  tenantId: number,
  userId: number,
  params: {
    date: string;
    items: InspectionItem[];
  }
): Promise<void> {
  const formData = JSON.stringify({
    inspectionDate: params.date,
    items: params.items.map((item) => ({
      itemName: item.itemName,
      origin: item.origin ?? "",
      passStatus: item.result ?? "적합",
    })),
  });

  await conn.execute(
    `INSERT INTO h_generic_checklist_records
     (tenant_id, form_type, form_date, title, form_data, status, created_by, created_at)
     VALUES (?, 'visual_inspection', ?, ?, ?, 'approved', ?, NOW())`,
    [tenantId, params.date, `[단순임포트] 육안검사 ${params.date}`, formData, userId]
  );
}
