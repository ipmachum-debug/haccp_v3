import { getDb, withTransaction, getRawConnection } from "../../db";
import { accountingSales } from "../../../drizzle/schema/schema_accounting_extended";
import { eq, and, sql } from "drizzle-orm";
import { resolveSystemAccount, insertJournalLine } from "../../db/accounting/journalHelper";
import { assertNoSaleFootprint } from "./saleFootprint";
import { SYSTEM_ACCOUNTS } from "../../../drizzle/schema/accountingAccounts";
import { formatLocalDate } from "../../utils/timezone";
import { isNegativeStockAllowed } from "../inventory/negativeStockPolicy";
import { lotAvailableOnSql, lotDateExpr } from "../inventory/lotChronology";
import { documentAmounts } from "./amountContract";
import { loadSaleSku, resolveSaleSku, type SaleSkuInfo } from "./saleSku";

/**
 * 제품 매출 POST — 완전 통합 (Module 2, 2026-04-14)
 *
 * 이전 구현은 회계 분개만 처리하고 재고 차감과 COGS 분개가 누락되어
 * 재무제표가 심각하게 왜곡되었음 (매출원가 0, 제품재고 과다, 순이익 과대).
 *
 * 이 리팩터에서 처리하는 6가지:
 *   A. FEFO 로 h_inventory_lots 차감 (유통기한 임박한 LOT 우선)
 *   B. h_inventory_transactions INSERT (usage 타입, reference='SALE')
 *   C. material_ledger_daily.usage_qty 증가 (제품 수불)
 *   D. 매출 분개: 차변 AR / 대변 매출 + VAT_OUTPUT
 *   E. ★ COGS 분개 신규: 차변 매출원가 / 대변 제품재고
 *      (LOT 단가 × 차감량 합계 = 실제 원가)
 *   F. accounting_sales.status = 'received'
 *
 * 안전장치:
 *   - withTransaction + FOR UPDATE (sale + lot 2중 잠금)
 *   - 멱등성: 이미 received 면 조용히 반환
 *   - 재고 부족: 음수 허용(기본, 2026-10-14) 이면 부족분을 최근 LOT 에 음수 차감,
 *     금지 테넌트면 명시적 에러 (negativeStockPolicy)
 *   - 필수 계정 사전 검증 (누락 시 HALT)
 */
export async function postProductSale(
  saleId: number,
  userId: number,
  expectedTenantId?: number,
): Promise<{ alreadyProcessed: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // ── 1. 사전 조회 ────────────────────────────────────────
  const sale = await db
    .select()
    .from(accountingSales)
    .where(eq(accountingSales.id, saleId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!sale) {
    throw new Error(`매출 전표 ID ${saleId} 를 찾을 수 없습니다.`);
  }
  // 이미 확정(approved)·수금(received)된 매출은 다시 확정하지 않는다 — 재고 차감·분개가 두 번 생긴다 (2026-10-15)
  //   확정은 pending 에서만. 아래 잠금 뒤에도 같은 검사를 다시 한다 (동시 요청).
  if (sale.status === "approved" || sale.status === "received") {
    return { alreadyProcessed: true };
  }
  if (sale.status === "cancelled") {
    throw new Error(`취소된 매출은 확정할 수 없습니다. (ID: ${saleId})`);
  }
  if (sale.status !== "pending") {
    throw new Error(`확정할 수 없는 상태입니다: ${sale.status} (ID: ${saleId})`);
  }

  const tenantId = sale.tenantId;
  if (!tenantId) throw new Error("[보안] tenantId is required for productSalePost");
  // ★ 2026-10-16: 호출자 회사와 다르면 거부 (postDispatcher 와 이중 방어)
  if (expectedTenantId != null && Number(expectedTenantId) !== Number(tenantId)) {
    throw new Error(`매출 전표 ID ${saleId} 를 찾을 수 없습니다.`);
  }

  // ── 2. 공통 값 ──────────────────────────────────────────
  // ★ 2026-10-15 금액 계약 (amountContract): total_amount = 공급가, 합계 = 공급가 + 세액.
  //   이전엔 total_amount 를 합계로 보고 공급가 = total − tax 로 나눠 외상매출금·매출이 세액만큼 적게 전기됐다.
  const { supply: supplyAmount, tax: taxAmount, gross: grossAmount } = documentAmounts(sale);
  const saleQty = Number(sale.quantity || 0);
  const docId = `SALE-${saleId}`;
  const productId = (sale as any).productId as number | null;
  const materialId = (sale as any).materialId as number | null;
  const entryDate = typeof sale.transactionDate === "string"
    ? sale.transactionDate
    : formatLocalDate(sale.transactionDate as Date);

  // ── 2b. product_id/material_id 자동 해결 (레거시 호환) ──
  //   원재료/부자재/외부제품 매출 지원 (Phase 8+)
  //   우선순위: 명시된 ID → product_id(h_products_v2) 매칭 → material_id(h_materials) 매칭
  let resolvedProductId: number | null = productId;
  let resolvedMaterialId: number | null = materialId;

  // ★ 2026-10-16: SKU 가 지정된 매출은 제품을 SKU 에서 정한다 (품명 매칭보다 우선)
  const saleSkuId = Number((sale as any).skuId ?? 0) || null;
  if (saleSkuId && !resolvedProductId && !resolvedMaterialId) {
    const sku = await loadSaleSku(await getRawConnection(), tenantId, saleSkuId);
    if (!sku) throw new Error(`[${docId}] SKU #${saleSkuId} 를 찾을 수 없습니다 (이 회사 SKU 가 아님).`);
    if (sku.productId) resolvedProductId = sku.productId;
  }

  if (!resolvedProductId && !resolvedMaterialId && sale.itemName) {
    try {
      const itemName = sale.itemName;
      const likePattern = `%${itemName}%`;
      // 1순위: 완제품 매칭 시도
      const matResult: any = await db.execute(sql`
        SELECT id FROM h_products_v2
        WHERE tenant_id = ${tenantId} AND is_active = 1
          AND (product_name = ${itemName} OR product_name LIKE ${likePattern})
        ORDER BY (product_name = ${itemName}) DESC, id ASC
        LIMIT 1
      `);
      const matRowsArr: any[] = (matResult as any)?.[0] || [];
      if (matRowsArr[0]?.id) {
        resolvedProductId = Number(matRowsArr[0].id);
      } else {
        // 2순위: 원재료/부자재/외부제품 매칭
        const mResult: any = await db.execute(sql`
          SELECT id FROM h_materials
          WHERE tenant_id = ${tenantId}
            AND (material_name = ${itemName} OR material_name LIKE ${likePattern})
          ORDER BY (material_name = ${itemName}) DESC, id ASC
          LIMIT 1
        `);
        const mRows: any[] = (mResult as any)?.[0] || [];
        if (mRows[0]?.id) {
          resolvedMaterialId = Number(mRows[0].id);
        }
      }
    } catch (e) {
      console.error(`[productSalePost] product_id/material_id 조회 실패 (계속):`, e);
    }
  }

  // XOR 검증: product_id 와 material_id 동시 설정 차단
  if (resolvedProductId && resolvedMaterialId) {
    throw new Error(
      `[${docId}] product_id 와 material_id 동시 설정 불가 (XOR 제약): ` +
        `product=${resolvedProductId}, material=${resolvedMaterialId}`,
    );
  }

  // 재고 차감 대상 구분 (제품 vs 원재료/부자재/외부제품)
  const isProductSale = !!resolvedProductId;
  const isMaterialSale = !!resolvedMaterialId;

  // ── 3. 필수 계정 사전 검증 ──────────────────────────────
  const receivableAcc = await resolveSystemAccount(
    tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE, "1030", "외상매출금",
  );
  const salesRevenueAcc = await resolveSystemAccount(
    tenantId, SYSTEM_ACCOUNTS.SALES_REVENUE, "4010", "상품매출",
  );
  const cogsAcc = await resolveSystemAccount(
    tenantId, SYSTEM_ACCOUNTS.COST_OF_GOODS, "5010", "매출원가",
  );
  // COGS 분개 대변 계정: 제품재고 vs 원재료재고 (판매 품목 타입에 따라)
  // ★ 2026-10-12: 자사 제품 매출은 제품(1430, INVENTORY_FINISHED) 을 대변 처리.
  //   상품(1420) 은 외부 매입 재판매용. 계정이 없으면 ensureSystemAccounts 로 시드.
  let inventoryGoodsAcc = isProductSale
    ? await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_FINISHED, "1430", "제품")
    : null;
  if (isProductSale && inventoryGoodsAcc && !inventoryGoodsAcc.id) {
    const { ensureSystemAccounts } = await import("../../db/accounting/journalHelper");
    await ensureSystemAccounts(tenantId, userId);
    inventoryGoodsAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_FINISHED, "1430", "제품");
  }
  const inventoryRawAcc = isMaterialSale
    ? await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_RAW, "1310", "원재료")
    : null;
  const vatAcc = taxAmount > 0
    ? await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.VAT_OUTPUT, "2350", "부가세예수금")
    : null;

  const missing: string[] = [];
  if (receivableAcc.id === 0) missing.push("ACCOUNTS_RECEIVABLE");
  if (salesRevenueAcc.id === 0) missing.push("SALES_REVENUE");
  if (cogsAcc.id === 0) missing.push("COST_OF_GOODS");
  if (isProductSale && inventoryGoodsAcc && inventoryGoodsAcc.id === 0) missing.push("INVENTORY_FINISHED");
  if (isMaterialSale && inventoryRawAcc && inventoryRawAcc.id === 0) missing.push("INVENTORY_RAW");
  if (vatAcc && vatAcc.id === 0) missing.push("VAT_OUTPUT");
  if (missing.length > 0) {
    throw new Error(
      `[${docId}] 필수 회계 계정 누락: ${missing.join(", ")}. accounting_accounts 시드 필요.`,
    );
  }

  // ── 4. 원자적 실행 ──────────────────────────────────────
  return await withTransaction(async (conn) => {
    // (0) sale 잠금 + 재검증
    const [lockRows] = await conn.execute(
      `SELECT status FROM accounting_sales WHERE id = ? AND tenant_id = ? FOR UPDATE`,
      [saleId, tenantId],
    );
    const currentStatus = (lockRows as any[])[0]?.status;
    if (currentStatus === "approved" || currentStatus === "received") {
      return { alreadyProcessed: true };
    }
    if (currentStatus === "cancelled") {
      throw new Error(`취소된 매출은 확정할 수 없습니다. (ID: ${saleId})`);
    }
    if (currentStatus !== "pending") {
      throw new Error(`확정할 수 없는 상태입니다: ${currentStatus} (ID: ${saleId})`);
    }
    // ★ 2026-10-16: 상태가 pending 이어도 재고 차감·매출 분개 흔적이 남아 있으면 확정하지 않는다 (saleFootprint)
    //   — 상태만 되돌린 매출을 다시 확정해 같은 수량을 두 번 뺀 사고 (7796 등 7건) 재발 방지.
    await assertNoSaleFootprint(conn, tenantId, saleId);

    // (A) FEFO 재고 차감 — product_id 또는 material_id 있을 때
    //     없으면 재고 차감 없이 회계 분개만 수행 (레거시 호환)
    //     COGS 는 LOT 단가가 없으니 supplyAmount 를 fallback 원가로 사용
    let totalCogs = 0; // 실제 차감된 LOT 단가 × 수량 합계
    const usedLots: Array<{ lotId: number; qty: number; unitCost: number }> = [];

    // 차감 대상 식별 (제품 vs 원재료) + FEFO 쿼리용 WHERE 절
    const lotFilterColumn = isProductSale ? "product_id" : isMaterialSale ? "material_id" : null;
    const lotFilterValue = isProductSale ? resolvedProductId : resolvedMaterialId;
    const itemTypeLabel = isProductSale ? "제품" : "원재료/부자재/외부제품";

    // ────────────────────────────────────────────────────────────
    // ★ PR-C2 (2026-05-11): 혼합 SKU 자동 분해 차감 라우팅
    // ★ PR-H (2026-05-11): is_default=1 조건 제거 — 번들 등록된 SKU 우선
    // ────────────────────────────────────────────────────────────
    // 제품 매출의 productId 가 sku_bundles 의 parent_sku_id 와 연결돼 있으면
    // (= 혼합 SKU 정의 존재), 직접 FEFO 대신 decomposeBundleOutbound 호출.
    //
    // 브릿지: h_products_v2.id → item_master.legacy_product_id → product_skus
    //         → sku_bundles.parent_sku_id 존재 확인
    //
    // [수정 배경 — PR-H]
    //   기존 쿼리는 ps.is_default = 1 필터로 인해, 번들 parent 로 사용되는
    //   product_skus 가 is_default=0 인 경우 (실제 운영 데이터에서 흔함)
    //   브릿지가 0건을 반환하고 → FEFO 폴백 → product_id LOT 없음 → 차감 0건.
    //
    //   해결: is_default 필터 제거. 대신 sku_bundles 에 parent 로 등록된
    //   product_skus 만 후보로 선택. 같은 item_id 에 번들 등록된 SKU 가
    //   여러 개일 경우 is_default=1 우선, 그 다음 id ASC.
    // ★ 2026-10-14: 제품 출고 화면(createProductOutbound) 에서 만든 매출은 출고 시점에 이미 LOT 을 차감했다.
    //   여기서 다시 FEFO 차감하면 이중 차감 → 출고 기록의 LOT 으로 원가만 계산하고 재고는 건드리지 않는다.
    //   (배치 기반 레거시 출고는 lot_id 가 없고 LOT 을 차감하지 않았으므로 기존대로 차감)
    let alreadyDeductedByOutbound = false;
    const saleSourceType = (sale as any).sourceType as string | null;
    const saleSourceId = (sale as any).sourceId as number | null;
    // ★ 2026-10-17 (Codex #564 검증 S1): 재고 출고에서 자동 생성된 구형 매출(inventory_usage) — 재고는 그 출고 때 이미 빠졌다.
    //   원 출고와의 검증된 연결이 없으므로 추측해 재사용하지 않고, 일반 판매로 다시 차감하지도 않는다 → 확정 거부.
    if (saleSourceType === "inventory_usage") {
      throw new Error(`[${docId}] 재고 출고 화면에서 자동 생성된 매출입니다 — 확정하면 출고한 재고가 다시 빠져 차단합니다 (전표 취소 후 제품 출고로 등록하거나 별도 정정).`);
    }
    if (saleSourceType === "product_outbound" && saleSourceId) {
      const [obRows] = await conn.execute(
        `SELECT o.lot_id, o.quantity, o.status, l.unit_price
         FROM h_product_outbound o
         LEFT JOIN h_inventory_lots l ON l.id = o.lot_id AND l.tenant_id = o.tenant_id
         WHERE o.id = ? AND o.tenant_id = ?
         LIMIT 1`,
        [saleSourceId, tenantId],
      );
      const ob = (obRows as any[])[0];
      if (ob && ob.lot_id && ob.status !== "cancelled") {
        alreadyDeductedByOutbound = true;
        const obQty = Number(ob.quantity || 0);
        const obUnitCost = Number(ob.unit_price || 0);
        usedLots.push({ lotId: Number(ob.lot_id), qty: obQty, unitCost: obUnitCost });
        totalCogs += obQty * obUnitCost;
        console.log(`[${docId}] 제품 출고 #${saleSourceId} 에서 LOT #${ob.lot_id} 이미 차감 — 재고 차감 생략, 원가만 계산`);
      }
    }

    // ★ 2026-10-16: 판매 SKU — 그 SKU 의 LOT 만 차감 (saleSku)
    //   SKU 지정 → 확인 / 미지정이면 제품의 SKU 가 하나일 때만 자동 / 여럿이면 확정 차단 (다른 SKU·단위 LOT 에서 빠지는 것 방지).
    //   제품 출고 화면에서 만든 매출(LOT 이미 지정·차감)은 대상 아님.
    let saleSku: SaleSkuInfo | null = null;
    if (!alreadyDeductedByOutbound && isProductSale && resolvedProductId && saleQty > 0) {
      const r = await resolveSaleSku(conn, tenantId, { skuId: saleSkuId, productId: resolvedProductId });
      if (r.kind === "ambiguous") {
        throw new Error(
          `[${docId}] 이 제품은 SKU 가 ${r.candidates.length}개입니다 (${r.candidates.map((c) => `#${c.id} ${c.skuName ?? ""}`.trim()).join(", ")}) — ` +
            `매출에 판매 SKU 를 지정한 뒤 확정하세요.`,
        );
      }
      if (r.kind === "sku") saleSku = r.sku;
    }
    // 그 SKU 의 LOT + SKU 없이 만든 옛 LOT 중 단위가 같은 것 (예: kg SKU ↔ SKU 없는 kg LOT). 박스 SKU 는 kg LOT 을 쓰지 않는다.
    //   운영 백업 10/16: SKU 하나뿐인 제품의 SKU 없는 재고 LOT 63개(대부분 kg) — 이걸 막으면 재고가 있는데 음수로 빠진다.
    const saleSkuLotCond = saleSku?.salesUnit
      ? "(sku_id = ? OR (sku_id IS NULL AND LOWER(unit) = LOWER(?)))"
      : "sku_id = ?";
    const saleSkuLotParams: any[] = saleSku ? (saleSku.salesUnit ? [saleSku.skuId, saleSku.salesUnit] : [saleSku.skuId]) : [];

    let bundleParentSkuId: number | null = null;
    if (saleSku) {
      // SKU 가 정해졌으면 그 SKU 가 혼합(번들) 부모일 때만 분해 차감
      const [pRows] = await conn.execute(
        `SELECT 1 FROM sku_bundles WHERE parent_sku_id = ? AND tenant_id = ? LIMIT 1`,
        [saleSku.skuId, tenantId],
      );
      if ((pRows as any[]).length > 0) bundleParentSkuId = saleSku.skuId;
    } else if (!alreadyDeductedByOutbound && isProductSale && resolvedProductId && saleQty > 0) {
      try {
        const [bundleRows] = await conn.execute(
          `SELECT ps.id AS parent_sku_id
           FROM item_master im
           JOIN product_skus ps ON ps.item_id = im.id
             AND ps.tenant_id = im.tenant_id
             AND ps.is_active = 1
           WHERE im.legacy_product_id = ?
             AND im.tenant_id = ?
             AND EXISTS (
               SELECT 1 FROM sku_bundles sb
                WHERE sb.parent_sku_id = ps.id AND sb.tenant_id = im.tenant_id
             )
           ORDER BY ps.is_default DESC, ps.id ASC
           LIMIT 1`,
          [resolvedProductId, tenantId],
        );
        const row = (bundleRows as any[])[0];
        if (row?.parent_sku_id) {
          bundleParentSkuId = Number(row.parent_sku_id);
        }
      } catch (e: any) {
        // 브릿지 조회 실패는 fallthrough (정상 FEFO 로 계속). 로그만 남김.
        console.warn(
          `[${docId}] bundle bridge lookup 실패 (FEFO 로 폴백): ${e?.message}`,
        );
      }
    }

    if (bundleParentSkuId) {
      // ─── BUNDLE PATH: decomposeBundleOutbound 라우팅 ───
      const { decomposeBundleOutbound } = await import(
        "../production/decomposeBundleOutbound"
      );
      const result = await decomposeBundleOutbound(conn, {
        parentSkuId: bundleParentSkuId,
        parentQty: saleQty,
        outboundDate: entryDate,
        tenantId,
        referenceType: "sales",
        referenceId: saleId,
        userId,
      });
      totalCogs = result.totalCost;
      for (const c of result.children) {
        for (const l of c.lots) {
          usedLots.push({ lotId: l.lotId, qty: l.deductedKg, unitCost: l.unitCost });
        }
      }
      console.log(
        `[${docId}] BUNDLE 분해 차감 완료: parent_sku=${bundleParentSkuId} qty=${saleQty} ` +
        `children=${result.children.length} totalCost=${totalCogs} shortage=${result.hasShortage}`,
      );
      if (result.hasShortage) {
        // 부족이 있으면 워닝 로그만 (decomposeBundleOutbound 의 정책: 부분 허용).
        console.warn(
          `[${docId}] BUNDLE 부족: ${result.warnings.join("; ")}`,
        );
      }
    } else if (!alreadyDeductedByOutbound && lotFilterColumn && lotFilterValue && saleQty > 0) {
      // (A-1) FEFO 순으로 사용 가능 LOT 조회 + 각 LOT 잠금
      const [lotRows] = await conn.execute(
        `SELECT id, available_quantity, current_quantity, unit_price, expiry_date
         FROM h_inventory_lots
         WHERE tenant_id = ?
           AND ${lotFilterColumn} = ?
           AND status = 'available'
           AND available_quantity > 0.001
           AND ${lotAvailableOnSql()}
           ${saleSku ? `AND ${saleSkuLotCond}` : ""}
         ORDER BY
           CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
           expiry_date ASC,
           receipt_date ASC,
           id ASC
         FOR UPDATE`,
        // ★ 2026-10-15: 판매일에 있던 LOT 만 (10/08 매출이 10/14 생산 LOT 을 빼던 문제 — lotChronology)
        // ★ 2026-10-16: 판매 SKU 가 정해지면 그 SKU 의 LOT 만
        [tenantId, lotFilterValue, entryDate, ...saleSkuLotParams],
      );
      const availableLots = lotRows as any[];

      // (A-2) 가용 재고 총합 검증
      const totalAvailable = availableLots.reduce(
        (sum, lot) => sum + Number(lot.available_quantity || 0),
        0,
      );
      // ★ 2026-10-14 음수 재고 허용 (CEO 결정, negativeStockPolicy): 재고가 모자라도 판매는 사실대로 차감한다.
      //   이전: 부족하면 throw → 매출이 'pending' 에 남고 재고도 안 빠짐 → 실사 후 다시 어긋남.
      //   현재: 있는 LOT 은 FEFO 로 다 빼고, 모자란 나머지는 아래 (A-3b) 에서 최근 LOT 에 음수로.
      const allowNegative = isNegativeStockAllowed(tenantId);
      if (totalAvailable + 0.001 < saleQty && !allowNegative) {
        throw new Error(
          `[${docId}] ${itemTypeLabel} #${lotFilterValue} 재고 부족: ` +
            `요청 ${saleQty}, 가용 ${totalAvailable.toFixed(3)}`,
        );
      }

      // (A-3) FEFO 차감 루프
      let remaining = saleQty;
      for (const lot of availableLots) {
        if (remaining <= 0.001) break;
        const lotAvailable = Number(lot.available_quantity || 0);
        const takeQty = Math.min(remaining, lotAvailable);
        const lotUnitCost = Number(lot.unit_price || 0);
        const lotCost = takeQty * lotUnitCost;

        // LOT 수량 감소 (GREATEST 로 음수 방어)
        await conn.execute(
          `UPDATE h_inventory_lots
           SET available_quantity = GREATEST(0, available_quantity - ?),
               current_quantity = GREATEST(0, COALESCE(current_quantity, quantity) - ?),
               status = CASE
                 WHEN available_quantity <= 0.001 THEN 'used'
                 ELSE status
               END,
               updated_at = NOW()
           WHERE id = ? AND tenant_id = ?`,
          // ★ 2026-10-15: MySQL 단일 테이블 UPDATE 는 앞에서 바꾼 값을 뒤 식이 읽는다 — status 는 이미 줄어든
          //   available_quantity 로 판단 (이전: 한 번 더 빼서 358−240=118 남아도 'used', lotStatusAfterDeduct 테스트)
          [takeQty, takeQty, lot.id, tenantId],
        );

        // 재고 원장에 usage 기록 (양수 quantity + transaction_type='usage')
        // PR-§5.2-2 (part 2): material_id NULL — 제품 판매(SALE/usage). h_materials 와 무관.
        //   getConsumptionSummary 의 PR-I/J 필터가 SALE/usage 를 원재료 소비에서 제외.
        await conn.execute(
          `INSERT INTO h_inventory_transactions
             (tenant_id, lot_id, transaction_type, quantity, unit, transaction_date,
              reference_type, source_type, source_id, unit_cost, amount, notes, created_by)
           VALUES (?, ?, 'usage', ?, ?, ?, 'SALE', 'SALE', ?, ?, ?, ?, ?)`,
          [
            tenantId, lot.id,
            takeQty,
            sale.unit || "EA",
            entryDate,
            saleId,
            lotUnitCost,
            lotCost,
            `[매출] ${docId} ${sale.itemName || ""}`,
            userId,
          ],
        );

        usedLots.push({ lotId: lot.id, qty: takeQty, unitCost: lotUnitCost });
        totalCogs += lotCost;
        remaining -= takeQty;
      }

      // (A-3b) 부족분 음수 차감 — 가장 최근 LOT (없으면 자리표시 LOT) 에 음수로.
      //   재고 = LOT 합계이므로 음수 LOT 이 "팔았는데 장부에 없던 수량" 을 드러낸다. 실사 때 맞춘다.
      if (remaining > 0.001 && allowNegative) {
        const [sinkRows] = await conn.execute(
          `SELECT id, unit_price FROM h_inventory_lots
           WHERE tenant_id = ? AND ${lotFilterColumn} = ?
             AND ${lotAvailableOnSql()}
             ${saleSku ? `AND ${saleSkuLotCond}` : ""}
           ORDER BY ${lotDateExpr()} DESC, id DESC
           LIMIT 1
           FOR UPDATE`,
          // 판매일 기준 가장 최근 LOT — 판매일 뒤에 생긴 LOT 은 음수 자리로도 쓰지 않는다 (SKU 가 정해지면 그 SKU 안에서)
          [tenantId, lotFilterValue, entryDate, ...saleSkuLotParams],
        );
        let sink = (sinkRows as any[])[0] as { id: number; unit_price: any } | undefined;
        if (!sink) {
          const ymd = entryDate.replace(/-/g, "");
          const lotNumber = `NEG-${isProductSale ? "P" : "M"}${lotFilterValue}-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          const [ins] = await conn.execute(
            `INSERT INTO h_inventory_lots
               (tenant_id, ${lotFilterColumn}, sku_id, lot_number, quantity, current_quantity, available_quantity,
                unit, unit_price, ${isProductSale ? "production_date" : "receipt_date"}, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, 0, 0, 0, ?, 0, ?, 'available', NOW(), NOW())`,
            // 자리표시 LOT 도 판매 SKU·판매단위로 (다음 판매·입고가 같은 SKU 로 찾는다)
            [tenantId, lotFilterValue, saleSku?.skuId ?? null, lotNumber, saleSku?.salesUnit || sale.unit || "EA", entryDate],
          );
          sink = { id: Number((ins as any).insertId), unit_price: 0 };
          console.warn(`[negative-stock] sale_placeholder_lot ${docId} ${lotFilterColumn}=${lotFilterValue} lot=${lotNumber}`);
        }
        const sinkUnitCost = Number(sink.unit_price || 0);
        await conn.execute(
          `UPDATE h_inventory_lots
           SET available_quantity = available_quantity - ?,
               current_quantity = COALESCE(current_quantity, quantity) - ?,
               status = 'available',
               updated_at = NOW()
           WHERE id = ? AND tenant_id = ?`,
          [remaining, remaining, sink.id, tenantId],
        );
        await conn.execute(
          `INSERT INTO h_inventory_transactions
             (tenant_id, lot_id, transaction_type, quantity, unit, transaction_date,
              reference_type, source_type, source_id, unit_cost, amount, notes, created_by)
           VALUES (?, ?, 'usage', ?, ?, ?, 'SALE', 'SALE', ?, ?, ?, ?, ?)`,
          [
            tenantId, sink.id, remaining, sale.unit || "EA", entryDate, saleId,
            sinkUnitCost, remaining * sinkUnitCost,
            `[매출] ${docId} ${sale.itemName || ""} — 재고 부족분 음수 차감 (실사 때 정리)`,
            userId,
          ],
        );
        console.warn(`[negative-stock] sale_sink ${docId} ${lotFilterColumn}=${lotFilterValue} lot=${sink.id} short=${remaining.toFixed(3)}`);
        usedLots.push({ lotId: sink.id, qty: remaining, unitCost: sinkUnitCost });
        totalCogs += remaining * sinkUnitCost;
        remaining = 0;
      }

      // (A-4) 원재료 수불부 (material_ledger_daily) — 원재료/부자재/외부제품 매출만.
      // ★ 2026-10-12 (11-identity-policy-v3, Q5-R2 결정 (a)):
      //   기존에는 제품 매출도 product_id 를 material_id 컬럼에 넣어 "공용" 으로 썼다 → 4개월간 887행.
      //   material_ledger_daily.material_id 는 h_materials 네임스페이스다. 제품 id(item_master / v2)를
      //   넣으면 id 범위가 겹치는 순간 제품 판매량이 원재료 사용량으로 집계된다 (덤프 실측 1건 겹침).
      //   제품 이동은 위 (A-3) h_inventory_transactions 의 SALE/usage 행에 LOT 단위로 이미 남는다.
      if (isMaterialSale && resolvedMaterialId) {
        try {
          await conn.execute(
            `INSERT INTO material_ledger_daily
               (tenant_id, material_id, ledger_date, usage_qty, source, notes)
             VALUES (?, ?, ?, ?, 'auto_sale', ?)
             ON DUPLICATE KEY UPDATE
               usage_qty = usage_qty + VALUES(usage_qty),
               updated_at = NOW()`,
            [
              tenantId, resolvedMaterialId, entryDate,
              saleQty,
              `매출 확정 ${docId} (${itemTypeLabel})`,
            ],
          );
        } catch (mldErr) {
          console.error(`[productSalePost] material_ledger_daily 반영 실패 (계속):`, mldErr);
        }
      }
    }

    // COGS 가 0 이면 supplyAmount 를 fallback 으로 사용 (제품 원가 미설정 케이스)
    const cogsAmount = totalCogs > 0 ? Math.round(totalCogs) : 0;

    // ★ 2026-04-22: 회계 연동 제외 플래그 (B2C 전자상거래)
    //   - 재고 차감 / LOT / 수불부 / inventory_transactions 는 위에서 모두 실행됨 (HACCP 의무)
    //   - 그러나 (B) 매출 분개 + (C) COGS 분개는 skip
    //   - 별도 플랫폼 정산 모듈에서 분기별 매출 인식
    const accountingExcluded = Number((sale as any).accountingExcluded ?? 0) === 1;

    if (!accountingExcluded) {
      // (B) 매출 분개 (Entry 1) — 차변 AR / 대변 매출 + VAT_OUTPUT
      const [salesJeResult] = await conn.execute(
        `INSERT INTO expense_journal_entries
           (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by, posted_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, NOW())`,
        [
          tenantId,
          entryDate,
          `[매출] ${docId} ${sale.itemName || ""}`,
          grossAmount,
          grossAmount,
          userId,
        ],
      );
      const salesEntryId = Number((salesJeResult as any).insertId);

      let sortOrder = 0;
      // 차변: 외상매출금 (합계 = 공급가 + 세액)
      await insertJournalLine(conn, {
        tenantId, journalEntryId: salesEntryId,
        accountId: receivableAcc.id,
        accountCode: receivableAcc.code,
        accountName: receivableAcc.name,
        debitAmount: grossAmount, creditAmount: 0,
        description: `매출: ${sale.itemName || ""} (${docId})`,
        sortOrder: sortOrder++,
        partnerId: (sale as any).partnerId || null,
      });
      // 대변: 매출 (공급가)
      await insertJournalLine(conn, {
        tenantId, journalEntryId: salesEntryId,
        accountId: salesRevenueAcc.id,
        accountCode: salesRevenueAcc.code,
        accountName: salesRevenueAcc.name,
        debitAmount: 0, creditAmount: supplyAmount,
        description: `매출: ${sale.itemName || ""} (${docId})`,
        sortOrder: sortOrder++,
      });
      // 대변: 부가세예수금 (세액 있을 때만)
      if (vatAcc && taxAmount > 0) {
        await insertJournalLine(conn, {
          tenantId, journalEntryId: salesEntryId,
          accountId: vatAcc.id,
          accountCode: vatAcc.code,
          accountName: vatAcc.name,
          debitAmount: 0, creditAmount: taxAmount,
          description: `매출 부가세: ${sale.itemName || ""} (${docId})`,
          sortOrder: sortOrder++,
        });
      }

      // (C) ★ COGS 분개 (Entry 2) — 차변 매출원가 / 대변 제품재고
      //     cogsAmount 가 0 보다 클 때만 생성 (레거시/제품 없음 케이스 graceful)
      if (cogsAmount > 0) {
        const [cogsJeResult] = await conn.execute(
          `INSERT INTO expense_journal_entries
             (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by, posted_at)
           VALUES (?, NULL, ?, ?, ?, ?, ?, NOW())`,
          [
            tenantId,
            entryDate,
            `[매출원가] ${docId} ${sale.itemName || ""}`,
            cogsAmount,
            cogsAmount,
            userId,
          ],
        );
        const cogsEntryId = Number((cogsJeResult as any).insertId);

        let cogsSortOrder = 0;
        // 차변: 매출원가
        await insertJournalLine(conn, {
          tenantId, journalEntryId: cogsEntryId,
          accountId: cogsAcc.id,
          accountCode: cogsAcc.code,
          accountName: cogsAcc.name,
          debitAmount: cogsAmount, creditAmount: 0,
          description: `매출원가: ${sale.itemName || ""} (${docId})`,
          sortOrder: cogsSortOrder++,
        });
        // 대변: 제품재고(완제품 매출) vs 원재료재고(원재료/부자재/외부제품 매출)
        const creditInventoryAcc = isProductSale ? inventoryGoodsAcc! : inventoryRawAcc!;
        const creditLabel = isProductSale ? "제품재고" : "원재료재고";
        await insertJournalLine(conn, {
          tenantId, journalEntryId: cogsEntryId,
          accountId: creditInventoryAcc.id,
          accountCode: creditInventoryAcc.code,
          accountName: creditInventoryAcc.name,
          debitAmount: 0, creditAmount: cogsAmount,
          description: `${creditLabel} 감소: ${sale.itemName || ""} (${docId})`,
          sortOrder: cogsSortOrder++,
        });
      }
    } else {
      console.log(
        `[postProductSale] SALE-${saleId} accountingExcluded=1 — 분개 생성 skip ` +
        `(재고 차감만 수행, 분기별 플랫폼 정산에서 별도 인식)`,
      );
    }

    // (D) accounting_sales 상태 전환: pending → approved (승인됨)
    //   ★ 2026-04-14: 상태 머신 정상화
    //     - 이전: pending → received (단계 건너뜀)
    //     - 현재: pending → approved
    //     - "수금 완료(received)" 는 별도 markReceived 뮤테이션에서 전환
    //   FEFO 재고 차감 / COGS 분개 / 매출 분개는 승인 시점에 수행
    await conn.execute(
      `UPDATE accounting_sales
       SET status = 'approved',
           product_id = COALESCE(product_id, ?),
           material_id = COALESCE(material_id, ?),
           sku_id = COALESCE(sku_id, ?),
           posted_at = NOW(),
           posted_by = ?
       WHERE id = ? AND tenant_id = ? AND status = 'pending'`,
      [resolvedProductId, resolvedMaterialId, saleSku?.skuId ?? null, userId, saleId, tenantId],
    );

    console.log(
      `[productSalePost] 매출 #${saleId} 확정 완료 ` +
        `(타입: ${isProductSale ? "제품" : isMaterialSale ? "원재료/부자재/외부제품" : "레거시"}, ` +
        `매출: ${grossAmount} (공급가 ${supplyAmount} + 세액 ${taxAmount}), COGS: ${cogsAmount}, LOTs: ${usedLots.length}건)`,
    );
    return { alreadyProcessed: false };
  }, `postProductSale:${saleId}`);
}
