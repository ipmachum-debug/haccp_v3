import { getDb, withTransaction } from "../../db";
import { accountingPurchases } from "../../../drizzle/schema/schema_accounting_extended";
import { eq, sql } from "drizzle-orm";
import { resolveSystemAccount, insertJournalLine, SYSTEM_ACCOUNTS } from "../../core-erp/accounting/journal";
import { formatLocalDate } from "../../utils/timezone";
import { publishEvent } from "../../platform/event-bus";

/**
 * 매입 POST 로직 (트랜잭션 + 멱등성 보장)
 *
 * pending/approved 상태의 매입 전표를 paid(확정)로 전환하고,
 * 재고 원장(h_inventory_transactions)과 회계 원장에 자동 반영
 *
 * **멱등성:**
 * - 트랜잭션 내부에서 SELECT ... FOR UPDATE로 상태를 잠금
 * - 이미 paid 상태면 조용히 반환 (중복 호출 안전)
 *
 * **트랜잭션:**
 * - LOT + 재고원장 + 회계분개 + 상태변경이 원자적으로 실행
 */
export async function postPurchase(purchaseId: number, userId: number): Promise<{ alreadyProcessed: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 1. 사전 조회 (읽기 전용 - 빠른 실패)
  const purchase = await db
    .select()
    .from(accountingPurchases)
    .where(eq(accountingPurchases.id, purchaseId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!purchase) {
    throw new Error(`매입 전표 ID ${purchaseId}를 찾을 수 없습니다.`);
  }
  if (purchase.status === "cancelled") {
    throw new Error(`취소된 전표는 확정할 수 없습니다. (ID: ${purchaseId})`);
  }

  const tenantId = purchase.tenantId;
  if (!tenantId) throw new Error('[보안] tenantId is required for purchasePost');

  // 이미 처리됨 → 멱등 반환
  if (purchase.status === "paid") {
    return { alreadyProcessed: true };
  }

  const docId = `PURCHASE-${purchaseId}`;
  const lotNumber = `LOT-${Date.now()}-${purchaseId}`;
  const qty = purchase.quantity?.toString() || "0";
  const totalAmount = Number(purchase.totalAmount || 0);
  const taxAmount = Number(purchase.taxAmount || 0);
  const supplyAmount = totalAmount - taxAmount;
  const entryDate = typeof purchase.transactionDate === 'string'
    ? purchase.transactionDate
    : formatLocalDate(purchase.transactionDate as Date);

  // PR-K3 (2026-04-26): canonical PK = h_materials.id 통일 후 폴백 체인 재정렬
  //   1순위: accounting_purchases.material_id FK (이제 h_materials.id 우선)
  //   2순위: item_name 으로 h_materials 매칭 (canonical)
  //   3순위: item_name 으로 item_master 매칭 (external_product 등 예외 폴백)
  //
  // h_materials.kind: 'RAW' / 'MIXED' (모두 raw_material 유형)
  // item_master.item_type: 'raw_material' / 'subsidiary' / 'external_product' (다양)
  let resolvedMaterialId: number | null = (purchase as any).materialId
    ? Number((purchase as any).materialId)
    : null;

  // 품목 유형 조회 (회계 계정 분기용)
  let resolvedItemType: string = "raw_material";
  if (resolvedMaterialId) {
    // 1순위: h_materials 에서 존재 확인 (있으면 raw_material 확정)
    let foundInHMaterials = false;
    try {
      const hmResult: any = await db.execute(sql`
        SELECT id FROM h_materials
        WHERE id = ${resolvedMaterialId} AND tenant_id = ${tenantId}
        LIMIT 1
      `);
      const hmRows: any[] = (hmResult as any)?.[0] || [];
      if (hmRows[0]?.id) {
        foundInHMaterials = true;
        resolvedItemType = "raw_material";
      }
    } catch (_) { /* graceful */ }

    // 폴백: item_master 의 item_type 조회 (external_product 등 h_materials 외 케이스)
    if (!foundInHMaterials) {
      try {
        const itemTypeResult: any = await db.execute(sql`
          SELECT item_type FROM item_master
          WHERE id = ${resolvedMaterialId} AND tenant_id = ${tenantId}
          LIMIT 1
        `);
        const itemTypeRows: any[] = (itemTypeResult as any)?.[0] || [];
        if (itemTypeRows[0]?.item_type) {
          resolvedItemType = String(itemTypeRows[0].item_type);
        }
      } catch (_) { /* graceful */ }
    }
  }

  if (!resolvedMaterialId && purchase.itemName) {
    try {
      const itemName = purchase.itemName;
      const likePattern = `%${itemName}%`;
      // 2순위: h_materials canonical 매칭 (PR-K3 후 우선)
      const matResult: any = await db.execute(sql`
        SELECT id FROM h_materials
        WHERE tenant_id = ${tenantId} AND is_active = 1
          AND (material_name = ${itemName} OR material_name LIKE ${likePattern})
        ORDER BY (material_name = ${itemName}) DESC, id ASC
        LIMIT 1
      `);
      const matRowsArr: any[] = (matResult as any)?.[0] || [];
      if (matRowsArr[0]?.id) {
        resolvedMaterialId = Number(matRowsArr[0].id);
        resolvedItemType = "raw_material";
      } else {
        // 3순위: item_master 폴백 (external_product 등 예외)
        const imResult: any = await db.execute(sql`
          SELECT id, item_type FROM item_master
          WHERE tenant_id = ${tenantId} AND is_active = 1
            AND (item_name = ${itemName} OR item_name LIKE ${likePattern})
          ORDER BY (item_name = ${itemName}) DESC, id ASC
          LIMIT 1
        `);
        const imRows: any[] = (imResult as any)?.[0] || [];
        if (imRows[0]?.id) {
          resolvedMaterialId = Number(imRows[0].id);
          resolvedItemType = String(imRows[0].item_type || "raw_material");
        }
      }
    } catch (matErr) {
      console.error(`[purchasePost] material_id 조회 실패 (계속):`, matErr);
    }
  }

  // 공급업체 이름 조회 (partner → supplier_name)
  // ★ 2026-04-13 버그 수정: partners.name → partners.company_name (실제 컬럼명)
  let supplierName: string | null = null;
  const partnerId = (purchase as any).partnerId;
  if (partnerId) {
    try {
      const partnerResult: any = await db.execute(sql`
        SELECT company_name FROM partners WHERE id = ${partnerId} AND tenant_id = ${tenantId} LIMIT 1
      `);
      const partnerRowsArr: any[] = (partnerResult as any)?.[0] || [];
      if (partnerRowsArr[0]?.company_name) {
        supplierName = String(partnerRowsArr[0].company_name);
      }
    } catch (_) { /* graceful */ }
  }

  // 시스템 계정 조회 (트랜잭션 밖 - 읽기 전용)
  // ★ 품목 유형에 따라 적절한 재고 계정 사용
  //   - raw_material, subsidiary → 원재료(INVENTORY_RAW, 1410)
  //   - external_product → 상품(INVENTORY_GOODS, 1420)
  const inventoryAcc = resolvedItemType === "external_product"
    ? await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_GOODS, "1420", "상품")
    : await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_RAW, "1410", "원재료");
  const payableAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE, "2010", "외상매입금");
  const vatAcc = taxAmount > 0
    ? await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.VAT_INPUT, "1350", "부가세대급금")
    : null;

  // 2. 트랜잭션 + FOR UPDATE 잠금
  return await withTransaction(async (conn) => {
    // (0) 비관적 잠금: 트랜잭션 내 재검증
    const [lockRows] = await conn.execute(
      `SELECT status FROM accounting_purchases WHERE id = ? AND tenant_id = ? FOR UPDATE`,
      [purchaseId, tenantId]
    );
    const currentStatus = (lockRows as any[])[0]?.status;
    if (currentStatus === "paid") {
      // 다른 요청이 먼저 처리 → 멱등 반환
      return { alreadyProcessed: true };
    }
    if (currentStatus === "cancelled") {
      throw new Error(`취소된 전표는 확정할 수 없습니다. (ID: ${purchaseId})`);
    }

    // (A) LOT 생성
    // ★ 2026-04-13 수정:
    //   - material_id 포함 → 재고관리 입고내역 INNER JOIN 에서 정상 표시
    //   - supplier_name 포함 → 공급업체 표시
    const [lotResult] = await conn.execute(
      `INSERT INTO h_inventory_lots
         (tenant_id, material_id, lot_number, quantity, current_quantity, available_quantity,
          unit, unit_price, receipt_date, supplier_name, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available')`,
      [
        tenantId, resolvedMaterialId, lotNumber,
        qty, qty, qty,
        purchase.unit || "EA",
        purchase.unitPrice?.toString() || "0",
        purchase.transactionDate,
        supplierName,
      ]
    );
    const lotId = (lotResult as any).insertId;

    // (A-2) h_inventory 마스터 동시 UPSERT (PR-K2)
    // ★ 2026-04-26 추가:
    //   - docs/architecture/06-material-pipeline.md H2 발견: h_inventory 마스터 0행 →
    //     autoMaterialIssue.ts:140 SELECT 가 0행 반환 → garbage 경로 진입.
    //   - 매입 확정마다 (tenant_id, material_id) 단위 +qty 누적으로 마스터 동기 유지.
    //   - 전제: 운영 DB 에 ALTER TABLE h_inventory ADD UNIQUE KEY uk_inv_material
    //     (tenant_id, material_id) + 96자재 1회 백필 적용 완료 후 머지.
    //     (수동 SQL 기록: scripts/migrations-manual/2026-04-26-k2-h-inventory.sql)
    if (resolvedMaterialId) {
      try {
        await conn.execute(
          `INSERT INTO h_inventory
             (tenant_id, material_id, item_name, unit,
              total_quantity, available_quantity, reserved_quantity,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, NOW(), NOW())
           ON DUPLICATE KEY UPDATE
             total_quantity = total_quantity + VALUES(total_quantity),
             available_quantity = available_quantity + VALUES(available_quantity),
             updated_at = NOW()`,
          [
            tenantId, resolvedMaterialId,
            purchase.itemName || null,
            purchase.unit || "EA",
            qty, qty,
          ]
        );
      } catch (invErr) {
        console.error(`[purchasePost] h_inventory UPSERT 실패 (계속):`, invErr);
      }
    }

    // (B) 재고 원장 생성
    // ★ PR-W3 (2026-04-26): source_type 누락 수정
    //   기존: source_type 컬럼을 INSERT 안 함 → NULL 저장 → 14건 NULL 누적
    //   수정: 'accounting_purchases' 명시 (기존 매입승인 트랜잭션과 동일 표기)
    // ★ PR-§5.2-2 (2026-04-27): material_id 직접 작성 (resolvedMaterialId)
    await conn.execute(
      `INSERT INTO h_inventory_transactions
         (tenant_id, lot_id, material_id, transaction_type, quantity, unit, transaction_date,
          reference_type, source_type, source_id, unit_cost, amount, created_by)
       VALUES (?, ?, ?, 'receipt', ?, ?, ?, 'PURCHASE', 'accounting_purchases', ?, ?, ?, ?)`,
      [tenantId, lotId, resolvedMaterialId ?? null, qty, purchase.unit || "EA", purchase.transactionDate,
       purchaseId, purchase.unitPrice?.toString() || "0", purchase.totalAmount?.toString() || "0", userId]
    );

    // (B-2) 입고전표 생성 (visual inspection / h_inbound_headers 쿼리 호환)
    // ★ 2026-04-13 추가: 육안검사일지 sync 가 h_inbound_headers 를 조회하므로
    //   매입 확정 시 입고전표도 동시 생성. resolvedMaterialId 가 있을 때만.
    if (resolvedMaterialId) {
      try {
        const [ibhResult] = await conn.execute(
          `INSERT INTO h_inbound_headers
             (tenant_id, inbound_number, site_id, supplier_id, inbound_date, status,
              confirmed_at, confirmed_by, notes, created_by)
           VALUES (?, ?, ?, ?, ?, 'confirmed', NOW(), ?, ?, ?)`,
          [
            tenantId,
            `INB-PURCHASE-${purchaseId}`, // 고유 입고번호
            1, // site_id (기본)
            (purchase as any).partnerId || null,
            purchase.transactionDate,
            userId,
            `매입 확정 자동생성 (PURCHASE-${purchaseId}): ${purchase.itemName || ""}`,
            userId,
          ]
        );
        const inboundHeaderId = (ibhResult as any).insertId;

        await conn.execute(
          `INSERT INTO h_inbound_lines
             (tenant_id, header_id, line_number, material_id,
              purchase_quantity, purchase_unit, stock_quantity, stock_unit,
              unit_price, total_price, lot_number, expiry_date, notes)
           VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tenantId, inboundHeaderId, resolvedMaterialId,
            qty, purchase.unit || "EA",
            qty, purchase.unit || "EA",
            purchase.unitPrice?.toString() || "0",
            purchase.totalAmount?.toString() || "0",
            lotNumber,
            null, // expiry_date (매입에 없음)
            `매입 확정: ${purchase.itemName || ""}`,
          ]
        );
      } catch (ibErr) {
        console.error(`[purchasePost] 입고전표 생성 실패 (계속):`, ibErr);
      }
    }

    // (B-3) 원료수불 material_ledger_daily 반영
    // ★ 2026-04-13 추가: 당월 총 입고량 집계에 즉시 반영
    if (resolvedMaterialId) {
      try {
        await conn.execute(
          `INSERT INTO material_ledger_daily
             (tenant_id, material_id, ledger_date, receiving_qty, source, notes)
           VALUES (?, ?, ?, ?, 'auto_purchase', ?)
           ON DUPLICATE KEY UPDATE
             receiving_qty = receiving_qty + VALUES(receiving_qty),
             updated_at = NOW()`,
          [
            tenantId, resolvedMaterialId, purchase.transactionDate,
            qty,
            `매입 확정 PURCHASE-${purchaseId}`,
          ]
        );
      } catch (mldErr) {
        console.error(`[purchasePost] material_ledger_daily 반영 실패 (계속):`, mldErr);
      }
    }

    // (C) 회계 분개 헤더
    const [jeResult] = await conn.execute(
      `INSERT INTO expense_journal_entries
         (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, purchaseId, entryDate, `[매입] ${docId} ${purchase.itemName || ""}`, totalAmount, totalAmount, userId]
    );
    const journalEntryId = Number((jeResult as any).insertId);

    let sortOrder = 0;
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: inventoryAcc.id, accountCode: inventoryAcc.code, accountName: inventoryAcc.name,
      debitAmount: supplyAmount, creditAmount: 0,
      description: `매입: ${purchase.itemName || ""}`, sortOrder: sortOrder++,
    });

    if (vatAcc && taxAmount > 0) {
      await insertJournalLine(conn, {
        tenantId, journalEntryId,
        accountId: vatAcc.id, accountCode: vatAcc.code, accountName: vatAcc.name,
        debitAmount: taxAmount, creditAmount: 0,
        description: `매입 부가세: ${purchase.itemName || ""}`, sortOrder: sortOrder++,
      });
    }

    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: payableAcc.id, accountCode: payableAcc.code, accountName: payableAcc.name,
      debitAmount: 0, creditAmount: totalAmount,
      description: `매입: ${purchase.itemName || ""}`, sortOrder: sortOrder++,
      partnerId: (purchase as any).partnerId || null,
    });

    // (D) 상태 전환: pending → approved (승인됨)
    //   ★ 2026-04-14: 상태 머신 정상화
    //     - 이전: pending → paid (단계 건너뜀, approved 도달 불가)
    //     - 현재: pending → approved 로 변경
    //     - "지급 완료(paid)" 는 별도 markPaid 뮤테이션으로 전환 (실제 대금 지급 시점)
    //   분개 / 재고 / LOT 생성은 승인(approved) 시점에 수행 (회계상 post to GL)
    await conn.execute(
      `UPDATE accounting_purchases SET status = 'approved', posted_at = NOW(), posted_by = ? WHERE id = ? AND tenant_id = ?`,
      [userId, purchaseId, tenantId]
    );

    // (E) domain_events — purchase.posted 발행 (outbox 패턴, 같은 트랜잭션)
    await publishEvent(
      {
        tenantId,
        eventType: "purchase.posted",
        aggregateType: "Purchase",
        aggregateId: purchaseId,
        payload: {
          purchaseId,
          partnerId: (purchase as any).partnerId ?? null,
          materialId: resolvedMaterialId,
          itemName: purchase.itemName ?? null,
          quantity: Number(qty),
          unit: purchase.unit ?? "EA",
          supplyAmount,
          taxAmount,
          totalAmount,
          lotId,
          lotNumber,
          journalEntryId,
          transactionDate: entryDate,
        },
        createdBy: userId,
      },
      conn,
    );

    console.log(`[POST] 매입 전표 ID ${purchaseId} 승인 완료 (LOT: ${lotNumber})`);
    return { alreadyProcessed: false };
  });
}
