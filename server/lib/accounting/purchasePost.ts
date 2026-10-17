import { documentAmounts } from "./amountContract";
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
export async function postPurchase(purchaseId: number, userId: number, expectedTenantId?: number): Promise<{ alreadyProcessed: boolean }> {
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
  // ★ 2026-10-16: 호출자 회사와 다르면 거부 (postDispatcher 와 이중 방어)
  if (expectedTenantId != null && Number(expectedTenantId) !== Number(tenantId)) {
    throw new Error(`매입 전표 ID ${purchaseId}를 찾을 수 없습니다.`);
  }

  // 이미 처리됨(승인·지급) → 멱등 반환 — 트랜잭션 안에서 다시 확인
  if (purchase.status === "paid" || purchase.status === "approved") {
    return { alreadyProcessed: true };
  }

  const docId = `PURCHASE-${purchaseId}`;
  const lotNumber = `LOT-${Date.now()}-${purchaseId}`;
  const qty = purchase.quantity?.toString() || "0";
  // ★ 2026-10-15 금액 계약 (amountContract): total_amount = 공급가, 외상매입금 = 공급가 + 세액.
  //   이전엔 total − tax 를 공급가로 써서 원재료·외상매입금이 세액만큼 적게 전기됐다.
  const { supply: supplyAmount, tax: taxAmount, gross: grossAmount } = documentAmounts(purchase);
  const totalAmount = grossAmount; // 이벤트 payload 호환 (합계)
  const entryDate = typeof purchase.transactionDate === 'string'
    ? purchase.transactionDate
    : formatLocalDate(purchase.transactionDate as Date);

  let { resolvedMaterialId, resolvedItemType } = await resolvePurchaseItem(db, purchase, tenantId);

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

  const accounts = await resolvePurchaseAccounts(tenantId, resolvedItemType, taxAmount);

  // 2. 트랜잭션 + FOR UPDATE 잠금
  return await withTransaction(async (conn) => {
    // (0) 비관적 잠금: 트랜잭션 내 재검증
    const [lockRows] = await conn.execute(
      `SELECT status FROM accounting_purchases WHERE id = ? AND tenant_id = ? FOR UPDATE`,
      [purchaseId, tenantId]
    );
    const currentStatus = (lockRows as any[])[0]?.status;
    // ★ 2026-10-17 (입고 정본화 PR-0): 확정은 대기(pending) 에서만. 승인·지급 상태는 이미 확정된 매입 —
    //   다시 확정하면 재고·분개가 한 벌 더 생긴다 (운영 10건 이중 입고: 4/13 재확정).
    //   분개가 빠진 확정 매입은 backfillPurchaseJournal(분개만, 재고 무관) 로 보충한다.
    if (currentStatus === "paid" || currentStatus === "approved") {
      return { alreadyProcessed: true };
    }
    if (currentStatus === "cancelled") {
      throw new Error(`취소된 전표는 확정할 수 없습니다. (ID: ${purchaseId})`);
    }
    if (currentStatus !== "pending") {
      throw new Error(`대기 상태 매입만 확정할 수 있습니다 (ID: ${purchaseId}, 상태: ${currentStatus})`);
    }
    // 이 매입의 분개가 이미 있으면 확정된 것으로 본다 (상태만 어긋난 경우의 이중 분개·이중 재고 방지)
    if (await purchaseJournalExists(conn, tenantId, purchaseId)) {
      return { alreadyProcessed: true };
    }

    // (0-2) 이 매입에 대한 입고 재고가 이미 기록됐는지 확인 — 이중 생성 방지
    // ★ 2026-08-21 추가
    //   진입부 가드는 status === 'paid' 만 봤다. 그래서 approved/pending 상태에서
    //   다시 호출되면 LOT·재고가 한 벌 더 생겼다. 승인 버튼 두 번 클릭이 곧 재고 2배였다.
    //
    //   두 생성 경로가 서로 다른 참조 규약을 쓰는 점을 이용해 출처를 구분한다:
    //     createPurchase : reference_type='accounting_purchase', reference_id=매입ID
    //     postPurchase   : source_type='accounting_purchases',   source_id=매입ID
    //
    //   · postPurchase 가 이미 돌았으면  → 전체 멱등 반환 (중복 클릭 차단)
    //   · createPurchase 가 만든 재고면  → 재고 단계만 건너뛰고 그 LOT 을 재사용.
    //     입고전표·수불부·분개는 아직 없으므로 계속 진행해야 장부가 온전해진다.
    const [priorRows] = await conn.execute(
      `SELECT lot_id,
              (source_type = 'accounting_purchases' AND source_id = ?) AS from_post
         FROM h_inventory_transactions
        WHERE tenant_id = ?
          AND transaction_type = 'receipt'
          AND ( (reference_type = 'accounting_purchase' AND reference_id = ?)
             OR (source_type = 'accounting_purchases'  AND source_id = ?) )
        ORDER BY id ASC
        LIMIT 1`,
      [purchaseId, tenantId, purchaseId, purchaseId]
    );
    const prior = (priorRows as any[])[0];
    if (prior && Number(prior.from_post) === 1) {
      // 이미 확정 처리된 매입 — 재고/분개가 모두 있다
      return { alreadyProcessed: true };
    }
    let reuseLotId: number | null = prior?.lot_id != null ? Number(prior.lot_id) : null;
    // ★ 2026-10-17 (입고 정본화 PR-3): 입고 문서 줄에 연결된 전표(inbound_line_id) — 재고는 입고 확정이 이미 반영했다.
    //   재고·원장·입고전표·수불부는 건너뛰고 분개·상태만 (재고를 다시 만들지 않는다).
    let inboundLinked = false;
    const inboundLineId = (purchase as any).inboundLineId != null ? Number((purchase as any).inboundLineId) : null;
    if (inboundLineId) {
      // 살아 있는 확정 입고 줄인지·금액 기준(입고 금액 / 무단가 첫 평가) 검사 + 무단가 LOT 첫 평가 (Codex #561·562 검증 R2·R3)
      const { assertInboundVoucherPostable } = await import("../inventory/inbound/inboundVoucherGuard");
      const line = await assertInboundVoucherPostable(conn, { tenantId, purchaseId, inboundLineId, supplyAmount });
      if (!line.lotId) {
        // 회계 전용으로 받은 입고 (LOT 없음) — 재고 경로가 아니다. 디스패처가 문서 기준으로 보낸다 (R6)
        throw new Error(`연결된 입고 줄 #${inboundLineId} 은 회계 전용 입고입니다 — 재고 없이 분개만 확정됩니다 (회계 경로).`);
      }
      inboundLinked = true;
      reuseLotId = line.lotId;
      resolvedMaterialId = line.materialId;
      resolvedItemType = "raw_material";
    }
    // ★ 2026-10-17 (입고 정본화 PR-0): 입고 탭(lotManagement.createReceivingWithLot) 이 LOT 을 먼저 만들고
    //   이 대기 전표(source_type='material_receipt', source_id=LOT) 를 만든다 — 승인하면 LOT 이 한 벌 더 생겼다.
    //   그 LOT 을 재사용한다 (재고는 입고 때 이미 들어옴).
    if (reuseLotId === null && (purchase as any).sourceType === "material_receipt" && Number((purchase as any).sourceId) > 0) {
      const [mrRows]: any = await conn.execute(
        `SELECT id, material_id FROM h_inventory_lots WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [Number((purchase as any).sourceId), tenantId],
      );
      const mr = (mrRows as any[])[0];
      if (mr) {
        reuseLotId = Number(mr.id);
        if (mr.material_id != null) { resolvedMaterialId = Number(mr.material_id); resolvedItemType = "raw_material"; }
      }
    }
    const skipInventory = reuseLotId !== null;
    if (skipInventory) {
      console.log(
        `[purchasePost] 매입 ${purchaseId}: 등록 시 생성된 재고 발견 (lot_id=${reuseLotId}) — ` +
        `LOT/재고 단계 건너뛰고 입고전표·수불부·분개만 생성합니다.`
      );
    }

    // (A) LOT 생성
    // ★ 2026-04-13 수정:
    //   - material_id 포함 → 재고관리 입고내역 INNER JOIN 에서 정상 표시
    //   - supplier_name 포함 → 공급업체 표시
    let lotId: number;
    // 입고전표·수불부에 쓰는 LOT 번호와 재고 수량·단위 — 실제 LOT 과 같아야 한다 (2026-10-16, Codex DB 감사).
    //   이전: 등록 때 만든 LOT(MAT-…, 85kg) 을 재사용하면서도 입고전표엔 새로 지은 LOT-… 번호와 매입 단위(5개),
    //   수불부엔 5(개) 를 더해 kg 수불부에 개수가 섞였다 (매입 422~427).
    let stockLotNumber = lotNumber;
    let stockQty = qty;
    let stockUnit = purchase.unit || "EA";
    if (skipInventory) {
      // 등록 시 이미 만들어진 LOT 을 재사용한다 (새로 만들면 재고가 두 배가 된다)
      lotId = reuseLotId as number;
      const [reuseRows] = await conn.execute(
        `SELECT lot_number, quantity, unit FROM h_inventory_lots WHERE id = ? AND tenant_id = ?`,
        [lotId, tenantId],
      );
      const reuse = (reuseRows as any[])[0];
      if (reuse) {
        stockLotNumber = String(reuse.lot_number);
        stockQty = String(reuse.quantity);
        stockUnit = String(reuse.unit || stockUnit);
      }
    } else {
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
      lotId = (lotResult as any).insertId;
    }

    // (A-2) h_inventory 마스터 동시 UPSERT (PR-K2)
    // ★ 2026-04-26 추가:
    //   - docs/architecture/06-material-pipeline.md H2 발견: h_inventory 마스터 0행 →
    //     autoMaterialIssue.ts:140 SELECT 가 0행 반환 → garbage 경로 진입.
    //   - 매입 확정마다 (tenant_id, material_id) 단위 +qty 누적으로 마스터 동기 유지.
    //   - 전제: 운영 DB 에 ALTER TABLE h_inventory ADD UNIQUE KEY uk_inv_material
    //     (tenant_id, material_id) + 96자재 1회 백필 적용 완료 후 머지.
    //     (수동 SQL 기록: scripts/migrations-manual/2026-04-26-k2-h-inventory.sql)
    if (resolvedMaterialId && !skipInventory) {
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

      // (A-3) 음수 LOT 자동 상쇄 (negativeStockPolicy, 2026-10-08)
      //   입고 전에 생산 투입돼 음수로 내려간 LOT 가 있으면 방금 들어온 LOT 로 메꾼다.
      try {
        const { reconcileNegativeLots } = await import("../inventory/negativeLotReconcile");
        await reconcileNegativeLots(conn, {
          materialId: resolvedMaterialId, tenantId, userId,
          transactionDate: purchase.transactionDate, source: "purchasePost",
        });
      } catch (recErr) {
        console.warn(`[purchasePost] 음수 LOT 상쇄 실패 (계속):`, recErr);
      }
    }

    // (B) 재고 원장 생성
    // ★ PR-W3 (2026-04-26): source_type 누락 수정
    //   기존: source_type 컬럼을 INSERT 안 함 → NULL 저장 → 14건 NULL 누적
    //   수정: 'accounting_purchases' 명시 (기존 매입승인 트랜잭션과 동일 표기)
    // ★ PR-§5.2-2 (2026-04-27): material_id 직접 작성 (resolvedMaterialId)
    if (!skipInventory) {
      await conn.execute(
        `INSERT INTO h_inventory_transactions
           (tenant_id, lot_id, material_id, transaction_type, quantity, unit, transaction_date,
            reference_type, source_type, source_id, unit_cost, amount, created_by)
         VALUES (?, ?, ?, 'receipt', ?, ?, ?, 'PURCHASE', 'accounting_purchases', ?, ?, ?, ?)`,
        [tenantId, lotId, resolvedMaterialId ?? null, qty, purchase.unit || "EA", purchase.transactionDate,
         purchaseId, purchase.unitPrice?.toString() || "0", purchase.totalAmount?.toString() || "0", userId]
      );
    }

    // (B-2) 입고전표 생성 (visual inspection / h_inbound_headers 쿼리 호환)
    // ★ 2026-04-13 추가: 육안검사일지 sync 가 h_inbound_headers 를 조회하므로
    //   매입 확정 시 입고전표도 동시 생성. resolvedMaterialId 가 있을 때만.
    if (resolvedMaterialId && !inboundLinked) {
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
            qty, purchase.unit || "EA",          // 매입 수량·단위 (문서 기준)
            stockQty, stockUnit,                  // 재고 수량·단위 (LOT 기준)
            purchase.unitPrice?.toString() || "0",
            purchase.totalAmount?.toString() || "0",
            stockLotNumber,
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
    // ★ 2026-10-16: 매입 입고의 수불부 기록은 여기 한 곳만 (createPurchase 의 onPurchaseCreated 제거 — 이중 가산).
    //   수량은 LOT 기준 재고 수량·단위 (수불부는 원료 기준 단위, 매입 단위 '개' 를 섞지 않음).
    if (resolvedMaterialId && !inboundLinked) {
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
            stockQty,
            `매입 확정 PURCHASE-${purchaseId}`,
          ]
        );
      } catch (mldErr) {
        console.error(`[purchasePost] material_ledger_daily 반영 실패 (계속):`, mldErr);
      }
    }

    // (C) 회계 분개
    const journalEntryId = await insertPurchaseJournal(conn, {
      tenantId, purchaseId, purchase, entryDate, supplyAmount, taxAmount, grossAmount, accounts, userId,
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


// ─────────────────────────────────────────────────────────────────────────────
// 공용 — 품목 해석 · 계정 · 분개 (postPurchase 와 분개 보충이 같은 규칙을 쓴다)
// ─────────────────────────────────────────────────────────────────────────────

type PurchaseAccounts = {
  inventoryAcc: { id: number; code: string; name: string };
  payableAcc: { id: number; code: string; name: string };
  vatAcc: { id: number; code: string; name: string } | null;
};

async function resolvePurchaseItem(db: any, purchase: any, tenantId: number): Promise<{ resolvedMaterialId: number | null; resolvedItemType: string }> {
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

  return { resolvedMaterialId, resolvedItemType };
}

async function resolvePurchaseAccounts(tenantId: number, resolvedItemType: string, taxAmount: number): Promise<PurchaseAccounts> {
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
  return { inventoryAcc, payableAcc, vatAcc } as PurchaseAccounts;
}

/** 이 매입의 분개 ([매입] PURCHASE-id) 가 있는가 */
export async function purchaseJournalExists(conn: any, tenantId: number, purchaseId: number): Promise<boolean> {
  const [rows]: any = await conn.execute(
    `SELECT id FROM expense_journal_entries
      WHERE tenant_id = ? AND voucher_id = ? AND (description = ? OR description LIKE ?) LIMIT 1`,
    [tenantId, purchaseId, `[매입] PURCHASE-${purchaseId}`, `[매입] PURCHASE-${purchaseId} %`],
  );
  return (rows as any[]).length > 0;
}

async function insertPurchaseJournal(conn: any, p: {
  tenantId: number; purchaseId: number; purchase: any; entryDate: string;
  supplyAmount: number; taxAmount: number; grossAmount: number; accounts: PurchaseAccounts; userId: number;
}): Promise<number> {
  const { tenantId, purchaseId, purchase, entryDate, supplyAmount, taxAmount, grossAmount, userId } = p;
  const { inventoryAcc, payableAcc, vatAcc } = p.accounts;
  const [jeResult] = await conn.execute(
    `INSERT INTO expense_journal_entries
       (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, purchaseId, entryDate, `[매입] PURCHASE-${purchaseId} ${purchase.itemName || ""}`, grossAmount, grossAmount, userId]
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
    debitAmount: 0, creditAmount: grossAmount,
    description: `매입: ${purchase.itemName || ""}`, sortOrder: sortOrder++,
    partnerId: purchase.partnerId || null,
  });
  return journalEntryId;
}

export type PurchaseJournalBackfill =
  | { purchaseId: number; status: "would_post" | "posted"; amount: number; entryDate: string; itemName: string | null; hasStock: boolean; journalEntryId?: number }
  | { purchaseId: number; status: "skip"; reason: "not_found" | "not_confirmed" | "already_posted" | "other_journal" | "zero_amount" | "missing_date"; detail?: string };

/**
 * 누락 분개 보충 — 확정(승인·지급)됐는데 분개가 없는 매입의 **분개만** 만든다 (2026-10-17, 입고 정본화 PR-0 / CEO·Codex 결정).
 * 매입 확정·입고 함수를 다시 부르지 않는다. 쓰는 것은 분개 헤더·줄과 감사 기록뿐.
 * 건너뜀: 대기·취소 매입, 이미 분개, 다른 이름으로 이 매입을 가리키는 분개(역분개·취소 이력), 금액 0, 일자 없음.
 * 실행은 서버 운영자 도구(scripts/purchase-journal-backfill.ts)만 — API 없음, 대표 승인 후.
 * 재고·LOT·원장·입고전표·수불부·상태는 건드리지 않는다. 기본 미리보기(apply=false).
 * 같은 매입에 두 번 불러도 분개는 한 벌 (매입 행 FOR UPDATE + 분개 존재 확인).
 */
export async function backfillPurchaseJournal(
  purchaseId: number, tenantId: number, userId: number, opts: { apply: boolean },
): Promise<PurchaseJournalBackfill> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const purchase = await db.select().from(accountingPurchases)
    .where(sql`${accountingPurchases.id} = ${purchaseId} AND ${accountingPurchases.tenantId} = ${tenantId}`)
    .limit(1).then((r: any[]) => r[0]);
  if (!purchase) return { purchaseId, status: "skip", reason: "not_found" };
  if (purchase.status !== "approved" && purchase.status !== "paid") {
    return { purchaseId, status: "skip", reason: "not_confirmed", detail: String(purchase.status) };
  }
  const { supply, tax, gross } = documentAmounts(purchase);
  if (!(gross > 0)) return { purchaseId, status: "skip", reason: "zero_amount" };
  // 원 거래 일자가 없으면 만들지 않는다 (추정 금지 — Codex 설계 결정)
  if (!purchase.transactionDate) return { purchaseId, status: "skip", reason: "missing_date" };
  const entryDate = typeof purchase.transactionDate === "string" ? purchase.transactionDate : formatLocalDate(purchase.transactionDate as Date);
  const { resolvedItemType } = await resolvePurchaseItem(db, purchase, tenantId);
  const accounts = await resolvePurchaseAccounts(tenantId, resolvedItemType, tax);

  return withTransaction(async (conn) => {
    const [lock]: any = await conn.execute(
      `SELECT status FROM accounting_purchases WHERE id = ? AND tenant_id = ? FOR UPDATE`, [purchaseId, tenantId],
    );
    const st = (lock as any[])[0]?.status;
    if (st !== "approved" && st !== "paid") return { purchaseId, status: "skip", reason: "not_confirmed", detail: String(st) } as PurchaseJournalBackfill;
    if (await purchaseJournalExists(conn, tenantId, purchaseId)) return { purchaseId, status: "skip", reason: "already_posted" } as PurchaseJournalBackfill;
    // 다른 이름으로 이 매입을 가리키는 분개(역분개·취소·옛 형식 등)가 있으면 사람이 먼저 판단 — 보충하지 않는다
    const [other]: any = await conn.execute(
      `SELECT id, description FROM expense_journal_entries
        WHERE tenant_id = ? AND description REGEXP ? LIMIT 3`,
      [tenantId, `PURCHASE-${purchaseId}([^0-9]|$)`],
    );
    if ((other as any[]).length > 0) {
      return { purchaseId, status: "skip", reason: "other_journal", detail: (other as any[]).map((o) => `#${o.id} ${o.description}`).join(" / ") } as PurchaseJournalBackfill;
    }
    const [stock]: any = await conn.execute(
      `SELECT COUNT(*) AS n FROM h_inventory_transactions
        WHERE tenant_id = ? AND transaction_type = 'receipt'
          AND ((reference_type = 'accounting_purchase' AND reference_id = ?) OR (source_type = 'accounting_purchases' AND source_id = ?))`,
      [tenantId, purchaseId, purchaseId],
    );
    const hasStock = Number((stock as any[])[0]?.n ?? 0) > 0;
    const base = { purchaseId, amount: gross, entryDate, itemName: purchase.itemName ?? null, hasStock };
    if (!opts.apply) return { ...base, status: "would_post" } as PurchaseJournalBackfill;
    const journalEntryId = await insertPurchaseJournal(conn, {
      tenantId, purchaseId, purchase, entryDate, supplyAmount: supply, taxAmount: tax, grossAmount: gross, accounts, userId,
    });
    return { ...base, status: "posted", journalEntryId } as PurchaseJournalBackfill;
  }, `backfillPurchaseJournal:${purchaseId}`).then(async (r) => {
    if (r.status === "posted") {
      // 감사 기록 (커밋 뒤, 실패해도 분개는 유지)
      try {
        const { createAuditLog } = await import("../../db/system/auditApprovalSupplier");
        await createAuditLog({
          action: "purchase.journal_backfill", entityType: "accounting_purchase", entityId: purchaseId, userId,
          description: `누락 분개 보충 — 분개 #${r.journalEntryId} ${r.amount}원 (재고·상태 무변경)`,
          changes: { journalEntryId: r.journalEntryId, amount: r.amount, entryDate: r.entryDate },
        } as any, tenantId);
      } catch (e) {
        console.warn(`[backfillPurchaseJournal] 감사 기록 실패 (분개는 유지) #${purchaseId}:`, e);
      }
    }
    return r;
  });
}
