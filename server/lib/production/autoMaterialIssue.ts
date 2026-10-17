/**
 * 배치 시작 시 원료 자동 출고 서비스
 *
 * 워크플로우 (v2 - h_batch_inputs 기반):
 * 1. 배치 정보 조회
 * 2. h_batch_inputs에서 이미 계산된 원재료 투입 계획 조회
 *    (배치 생성 시 h_mf_ingredients로부터 자동 생성됨)
 * 3. 각 원재료별 FEFO 로트 할당 시도 (로트가 있는 경우)
 * 4. 로트가 없으면 직접 출고 기록만 생성 (재고 차감 없이)
 * 5. 재고 원장 기록 (h_inventory_transactions)
 * 6. h_batch_inputs.inventory_deducted = 1 업데이트
 * 7. 수불부 반영 (material_ledger_daily)
 *
 * ★ 2026-10-17 (재고 쓰기 경로 PR-5·6): 원재료 한 줄 = 한 트랜잭션, 재고 관문 경유.
 *   - 줄마다 withInventoryTx: 투입 행 FOR UPDATE → 이미 출고(플래그·원장)면 건너뜀 → FEFO(같은 conn) →
 *     applyLotDelta(LOT·원장·집계) → 투입 행 갱신. 중간 실패면 그 줄 전체가 되돌아간다
 *     (이전: 원장을 LOT 보다 먼저 INSERT, 문장마다 다른 풀 연결 — 유령 원장·부분 차감 가능).
 *   - 집계(h_inventory) 증감식·'마스터 LOT 합 보정' 제거 — 관문이 LOT 합으로 재계산.
 *   - 단위: LOT 단위와 투입 단위가 다르면 그 줄은 출고하지 않고 오류 (추정 환산 없음, 결정 D6).
 *   - 배치 잠금은 공통 진입점(autoIssueMaterialsDispatch) 에서 — 어느 화면에서 들어와도 같은 배치는 한 번에 하나.
 *   - 음수 허용 정책은 그대로 (0 으로 자르지 않음). 출고량 = 투입 실적(actual) 이 있으면 실적, 없으면 계획.
 */

import { getDb } from "../../db/connection";
import { getRawConnection } from "../../db/connection";
import { isNegativeStockAllowed } from "../inventory/negativeStockPolicy";
import { resolveBatchBusinessDate } from "./batchBusinessDate";
import { reconcileNegativeLots, createNegativePlaceholderLot } from "../inventory/negativeLotReconcile";
import { NoLotsForNegativeError, type FefoAllocation } from "../inventory/fefoLotAllocation";
import { eq, and, sql } from "drizzle-orm";
import { toInventoryMaterialId, resolvePriceFallback } from "../identity/itemIdentityService";
import { getIssuedBatchLineIds } from "./issuedBatchLines";
import {
  ensureProductionLogForBatch,
  insertInventoryDeductionLog,
} from "./inventoryDeductionLog";

/** 정제수(purified water) 여부 판별 - 원가 계산에서 제외 대상 */
function isWaterMaterial(materialName: string | null | undefined): boolean {
  if (!materialName) return false;
  const name = materialName.toLowerCase();
  return name.includes("정제수") || name.includes("purified water");
}

/**
 * PR-W3 (2026-04-26): 배치 자동출고 트랜잭션 일자 결정 헬퍼
 *
 * 우선순위:
 *   1. batch.completed_at (실제 완료일) — 가장 정확
 *   2. batch.planned_date (계획일) — 완료일 미설정 시
 *   3. 오늘 KST — 위 둘 다 없을 때 폴백
 *
 * 반환 형식: YYYY-MM-DD (KST 기준 날짜만)
 *
 * 효과:
 *   - 4/9 배치를 4/26 에 재처리해도 transaction_date 는 4/9 로 기록
 *   - material_ledger_daily 와 일별 그래프의 일자 정합성 회복
 */
// 2026-10-12: 업무일자 = 생산일(planned_date) 우선 (batchBusinessDate.ts 로 통일). 입력 시각 아님.
const resolveBatchTransactionDate = resolveBatchBusinessDate;

interface AutoIssueResult {
  success: boolean;
  issuedMaterials: Array<{
    materialId: number;
    materialName: string;
    requiredQuantity: number;
    issuedQuantity: number;
    unit: string;
    lotAllocations: Array<{
      lotId: number;
      quantity: number;
      unitCost: number;
    }>;
  }>;
  totalCost: number;
  warnings: string[];
  errors: string[];
}

export async function autoIssueMaterialsForBatch(
  batchId: number,
  userId: number,
  expectedTenantId?: number,
): Promise<AutoIssueResult> {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  const result: AutoIssueResult = {
    success: true,
    issuedMaterials: [],
    totalCost: 0,
    warnings: [],
    errors: []
  };

  try {
    // 1. 배치 정보 조회
    //
    // PR-W3 (2026-04-26): transaction_date 부정합 버그 수정
    //   기존: 자동출고 시점의 NOW() (KST) 를 transaction_date 로 사용 → 재처리/지연
    //         처리 시 실제 배치 일자와 무관한 일자로 기록되어 일별 그래프 왜곡 발생
    //   수정: batch.completed_at (1순위) → batch.planned_date (2순위) → 오늘 (폴백) 사용
    //   효과: 재고원장과 material_ledger_daily 의 일자 정합성 복구
    const [batchRows]: any = await db.execute(sql`
      SELECT b.id, b.tenant_id, b.product_id, b.planned_quantity, b.status,
             b.completed_at, b.planned_date,
             p.product_name
      FROM h_batches b
      LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
      WHERE b.id = ${batchId}
        ${expectedTenantId ? sql`AND b.tenant_id = ${expectedTenantId}` : sql``}
      LIMIT 1
    `);
    
    const batch = (batchRows as any[])?.[0];
    if (!batch) {
      throw new Error(`배치 ID ${batchId}를 찾을 수 없습니다.`);
    }

    const tenantId = Number(batch.tenant_id);
    const plannedQuantity = parseFloat(batch.planned_quantity?.toString() || "0");

    if (plannedQuantity <= 0) {
      throw new Error("계획 수량이 0 이하입니다.");
    }

    // 2. h_batch_inputs에서 투입 계획 조회 (배치 생성 시 MF report에서 자동 생성됨)
    //
    // PR-K3 (2026-04-26): canonical PK 통일 마이그레이션 완료 후
    //   - h_batch_inputs.material_id 2,745행 모두 h_materials.id 로 통일됨
    //   - PR-K1 의 item_master 폴백 LEFT JOIN + COALESCE 가 불필요해짐 → 제거
    //
    // 2026-05-10 (PR #298): 신규 배치가 h_mf_ingredients.material_id (= item_master.id) 를 그대로
    //   h_batch_inputs.material_id 에 저장하여 ID 네임스페이스가 다시 깨짐.
    //   해결: LEFT JOIN h_materials + LEFT JOIN item_master 두 란으로 모든 ID 출처를 흡수,
    //   단가는 NULLIF(0) + COALESCE 로 폴백, 자재명도 COALESCE.
    //   차감 lookup 은 루프 내부에서 resolveMaterialIds() 로 canonical h_materials.id 로 변환 후 진행.
    const [batchInputRows]: any = await db.execute(sql`
      SELECT bi.id, bi.material_id, bi.planned_quantity, bi.actual_quantity,
             bi.unit, bi.inventory_deducted, bi.process_group_id,
             COALESCE(m.material_name, im.item_name) AS material_name,
             m.material_code AS material_code,
             COALESCE(NULLIF(m.unit_price, 0), NULLIF(im.default_unit_price, 0)) AS unit_price,
             m.id AS hm_id_direct,
             im.id AS im_id_direct
      FROM h_batch_inputs bi
      LEFT JOIN h_materials m ON m.id = bi.material_id AND m.tenant_id = bi.tenant_id
      LEFT JOIN item_master im ON im.id = bi.material_id AND im.tenant_id = bi.tenant_id
      WHERE bi.batch_id = ${batchId} AND bi.tenant_id = ${tenantId}
      ORDER BY bi.id
    `);

    const batchInputs = batchInputRows as any[];
    if (!batchInputs || batchInputs.length === 0) {
      result.warnings.push(`배치 #${batchId}에 원재료 투입 계획이 없습니다.`);
      return result;
    }

    // 2026-10-14: 이미 출고 기록(h_inventory_transactions BATCH usage)이 있는 투입은 다시 출고하지 않는다.
    //   inventory_deducted 는 "LOT 실제 차감" 플래그라, LOT 없이 출고 기록만 남긴 과거 투입(덤프 10/14 기준 755건,
    //   음수 허용 정책 10/8 이전)은 0 으로 남아 있다. 플래그만 보면 재실행 시 같은 투입이 두 번 출고된다.
    const alreadyIssuedLineIds = await getIssuedBatchLineIds(batchId, tenantId);
    for (const bi of batchInputs) {
      if (alreadyIssuedLineIds.has(Number(bi.id))) bi.inventory_deducted = 1;
    }

    // 이미 전부 출고 완료인지 체크
    const allDeducted = batchInputs.every((bi: any) => Number(bi.inventory_deducted) === 1);
    if (allDeducted) {
      result.warnings.push(`배치 #${batchId} 원재료가 이미 전량 출고되었습니다.`);
      return result;
    }

    // PR-W3: 배치 일자 우선 (completed_at → planned_date → 오늘 폴백)
    const transactionDate = resolveBatchTransactionDate(batch);

    // 2026-10-08 음수 재고 허용 정책 (negativeStockPolicy): 재고가 모자라도 투입은 사실대로
    // 기록하고 부족분은 최근 LOT 에 음수로 차감 → inventory_deducted=1 항상 보장.
    const allowNegative = isNegativeStockAllowed(tenantId);

    // ★ 2026-05-10 (PR #299 F5-4): h_inventory_deduction_log INSERT 를 위한
    //   production_log_id 사전 보장 (배치당 1회). 실패해도 차감 main flow 는
    //   계속 — deduction_log 는 best-effort 보고용 이력일 뿐.
    let productionLogIdForDeduction: number | null = null;
    try {
      const rawConn = await getRawConnection();
      productionLogIdForDeduction = await ensureProductionLogForBatch(
        batchId,
        tenantId,
        rawConn,
      );
      if (productionLogIdForDeduction) {
        console.info(
          `[deductionLog] batch=${batchId} production_log_id=${productionLogIdForDeduction} 확보`,
        );
      }
    } catch (plErr: any) {
      console.warn(
        `[deductionLog] ensureProductionLog 실패 batch=${batchId}: ${plErr?.message || plErr}`,
      );
    }

    // 3. 각 원재료별 출고 처리
    for (const input of batchInputs) {
      if (Number(input.inventory_deducted) === 1) continue; // 이미 출고된 건 건너뜀

      const rawMaterialId = Number(input.material_id);
      // 출고량 = 투입 실적이 기록돼 있으면 실적, 없으면 계획 (생산완료 때 미출고 줄도 이 함수로 — completeBatch 와 같은 기준)
      const requiredQuantity = parseFloat((input.actual_quantity ?? input.planned_quantity)?.toString() || "0");
      const unit = input.unit || "kg";
      const materialName = input.material_name || `원재료 #${rawMaterialId}`;
      const isWater = isWaterMaterial(materialName);
      if (!(requiredQuantity > 0)) {
        result.warnings.push(`${materialName}: 출고량 0 — 건너뜀`);
        continue;
      }

      // ────────────────────────────────────────────────────────────────────
      // 2026-05-10 (PR #298): ID 네임스페이스 변환 + 4단 폴백 단가
      // ────────────────────────────────────────────────────────────────────
      // bi.material_id 가 item_master.id 일 수 있으므로 자재명 매칭으로 canonical
      // h_materials.id 를 추출. 모든 lot/inventory lookup 은 canonicalId 사용.
      let canonicalId = rawMaterialId;
      let itemMasterId: number | null = null;
      let resolveSource: string = "raw";
      try {
        const rawConn = await getRawConnection();
        const r = await toInventoryMaterialId(rawMaterialId, tenantId, rawConn);
        canonicalId = r.id;
        itemMasterId = r.itemMasterId;
        resolveSource = r.source;
        if (!r.trusted && r.id !== rawMaterialId) {
          console.warn(`[id-resolve] untrusted_path batch=${batchId} input=${input.id} raw=${rawMaterialId} canonical=${r.id} src=${r.source} — legacy_material_id 백필 필요`);
        }
        if (canonicalId !== rawMaterialId) {
          console.info(
            `[id-resolve] batch=${batchId} input=${input.id} ` +
            `raw=${rawMaterialId} canonical=${canonicalId} src=${resolveSource} name="${materialName}"`
          );
        }
      } catch (resolveErr: any) {
        console.warn(
          `[id-resolve] resolve_failed batch=${batchId} input=${input.id} ` +
          `raw=${rawMaterialId} err="${resolveErr.message}"`
        );
      }

      // 1차 단가: bi/m/im SELECT 결과의 COALESCE 값 (NULLIF(0) 적용됨)
      let baseUnitPrice = isWater ? 0 : parseFloat(input.unit_price?.toString() || "0");

      // 단가가 0 이거나 없으면 4단 폴백 시도 (마지막 입고가 → h_materials → item_master)
      let priceFallbackSource: string = "input_row";
      if (!isWater && baseUnitPrice <= 0) {
        try {
          const rawConn = await getRawConnection();
          // 2026-10-13: 업무일자(transactionDate) 기준 — 과거 생산을 나중에 입력해도 그 시점 입고가로
          const fb = await resolvePriceFallback(canonicalId, itemMasterId, tenantId, rawConn, transactionDate);
          if (fb.unitPrice > 0) {
            baseUnitPrice = fb.unitPrice;
            priceFallbackSource = fb.source;
            console.info(
              `[price-fallback] batch=${batchId} input=${input.id} ` +
              `material=${canonicalId}/${materialName} fallback=${fb.unitPrice} src=${fb.source}`
            );
          }
        } catch (fbErr: any) {
          console.warn(
            `[price-fallback] failed batch=${batchId} input=${input.id} ` +
            `material=${canonicalId}/${materialName} err="${fbErr.message}"`
          );
        }
      }

      const unitPrice = baseUnitPrice;

      try {
        const { withInventoryTx, applyLotDelta } = await import("../inventory/applyInventoryDelta");
        const { allocateLotsFEFO } = await import("../inventory/fefoLotAllocation");

        const line = await withInventoryTx(async (conn) => {
          // (a) 줄 잠금 + 재확인 — 동시에 다른 실행이 출고했으면 건너뜀
          const [bRows]: any = await conn.execute(
            `SELECT inventory_deducted FROM h_batch_inputs WHERE id = ? AND tenant_id = ? LIMIT 1 FOR UPDATE`,
            [input.id, tenantId],
          );
          if (!(bRows as any[])[0] || Number((bRows as any[])[0].inventory_deducted) === 1) return null;
          const [led]: any = await conn.execute(
            `SELECT COUNT(*) AS n FROM h_inventory_transactions
              WHERE tenant_id = ? AND source_type = 'BATCH' AND source_id = ? AND source_line_id = ? AND transaction_type = 'usage'`,
            [tenantId, batchId, input.id],
          );
          if (Number((led as any[])[0]?.n ?? 0) > 0) return null;

          // (b) 음수 허용: 이전 음수 LOT 상쇄 (같은 트랜잭션)
          if (allowNegative) {
            try {
              await reconcileNegativeLots(conn, { materialId: canonicalId, tenantId, userId, transactionDate, source: "autoIssue" });
            } catch (recErr: any) {
              console.warn(`[negative-stock] reconcile_failed material=${canonicalId} batch=${batchId}: ${recErr?.message || recErr}`);
            }
          }

          // (c) FEFO 배분 (같은 conn, 업무일자 이후 입고 LOT 제외)
          const [invRows]: any = await conn.execute(
            `SELECT id FROM h_inventory WHERE material_id = ? AND tenant_id = ? LIMIT 1`, [canonicalId, tenantId],
          );
          const inventoryId = (invRows as any[])[0]?.id != null ? Number((invRows as any[])[0].id) : 0;
          let allocations: FefoAllocation[];
          try {
            allocations = await allocateLotsFEFO(inventoryId, requiredQuantity, unit, tenantId, canonicalId, conn as any, { allowNegative, asOfDate: transactionDate });
          } catch (fefoInner: any) {
            if (allowNegative && fefoInner instanceof NoLotsForNegativeError) {
              // LOT 가 하나도 없음 → 자리표시 LOT 를 만들어 전량 음수 차감
              const ph = await createNegativePlaceholderLot(conn, {
                materialId: canonicalId, tenantId, inventoryId: inventoryId || null, unit, unitPrice, receiptDate: transactionDate,
              });
              allocations = [{ lotId: ph.lotId, quantity: requiredQuantity, unitCost: unitPrice, expiryDate: null, negative: true }];
            } else {
              throw fefoInner; // 재고 부족(음수 금지) 등 — 이 줄은 출고하지 않음
            }
          }
          // LOT 에 단가가 없으면(0) 이 자재의 폴백 단가로 (2026-10-13 원가 정합성)
          allocations = allocations.map((x) => (x.unitCost > 0 ? x : { ...x, unitCost: unitPrice }));

          // (d) 단위 확인 — LOT 단위 ≠ 투입 단위면 거부 (결정 D6)
          const lotIds = Array.from(new Set(allocations.map((x) => x.lotId)));
          const [uRows]: any = await conn.execute(
            `SELECT id, unit FROM h_inventory_lots WHERE tenant_id = ? AND id IN (${lotIds.map(() => "?").join(",")})`,
            [tenantId, ...lotIds],
          );
          const norm = (u: any) => String(u ?? "").trim().toLowerCase();
          for (const r of uRows as any[]) {
            if (norm(r.unit) !== norm(unit)) {
              throw new Error(`단위가 다릅니다: LOT#${r.id} ${r.unit}, 투입 ${unit} — 환산 근거 없이 출고하지 않습니다`);
            }
          }

          // (e) 관문으로 차감 — LOT·원장·집계 한 번에
          for (const alloc of allocations) {
            await applyLotDelta(conn, {
              tenantId,
              lotId: alloc.lotId,
              subject: { materialId: canonicalId },
              quantity: alloc.quantity,
              direction: "decrease",
              transactionType: "usage",
              unit,
              unitCost: alloc.unitCost,
              reference: { referenceType: "batch", referenceId: batchId, sourceType: "BATCH", sourceId: batchId, sourceLineId: Number(input.id), actionType: "AUTO_ISSUE" },
              notes: alloc.negative ? `${materialName} 자동출고 — 재고 부족분 음수 차감 (입고 전 투입, 다음 입고 시 자동 상쇄)` : null,
              createdBy: userId,
              transactionDate,
              allowNegative: allowNegative || !!alloc.negative,
            });
          }
          const issued = allocations.reduce((a, x) => a + x.quantity, 0);
          const cost = allocations.reduce((a, x) => a + x.quantity * x.unitCost, 0);
          const effUnitPrice = isWater ? 0 : (issued > 0 ? cost / issued : unitPrice);
          const effTotal = isWater ? 0 : cost;
          await conn.execute(
            `UPDATE h_batch_inputs
                SET inventory_deducted = 1, actual_quantity = ?, unit_price = ?, total_price = ?, input_time = NOW(), input_by = ?
              WHERE id = ? AND tenant_id = ?`,
            [issued, effUnitPrice.toFixed(2), effTotal.toFixed(2), userId, input.id, tenantId],
          );
          // 수불부(material_ledger_daily) — 같은 트랜잭션 (실패해도 줄 출고는 유지: 보고용 집계)
          try {
            await conn.execute(
              `INSERT INTO material_ledger_daily (tenant_id, material_id, ledger_date, usage_qty, notes, source)
               VALUES (?, ?, ?, ?, ?, 'auto')
               ON DUPLICATE KEY UPDATE usage_qty = usage_qty + VALUES(usage_qty), notes = CONCAT(COALESCE(notes, ''), ', ', VALUES(notes))`,
              [tenantId, canonicalId, transactionDate, issued, `배치#${batchId} 자동출고`],
            );
          } catch (ledgerErr: any) {
            result.warnings.push(`${materialName}: 수불부 반영 실패 (${ledgerErr.message})`);
          }
          return { issued, cost, allocations };
        }, `autoIssue.batch${batchId}.line${input.id}`);

        if (!line) continue; // 다른 실행이 먼저 출고함
        const issuedQuantity = line.issued;
        const materialCost = isWater ? 0 : line.cost;
        const lotAllocations = line.allocations.map((x) => ({ lotId: x.lotId, quantity: x.quantity, unitCost: x.unitCost }));

        // h_inventory_deduction_log — best-effort 보고용 이력 (커밋 뒤)
        if (productionLogIdForDeduction && issuedQuantity > 0 && !isWater) {
          try {
            const rawConn = await getRawConnection();
            await insertInventoryDeductionLog(
              { productionLogId: productionLogIdForDeduction, materialId: canonicalId, materialType: "raw_material", deductedQuantity: issuedQuantity, unit },
              rawConn,
            );
          } catch (dlErr: any) {
            console.warn(`[deductionLog] insert 예외 batch=${batchId} material=${canonicalId}: ${dlErr?.message || dlErr}`);
          }
        }

        result.issuedMaterials.push({
          materialId: canonicalId,
          materialName,
          requiredQuantity,
          issuedQuantity,
          unit,
          lotAllocations
        });

        result.totalCost += materialCost;

      } catch (matError: any) {
        result.errors.push(`${materialName}: 출고 처리 실패 - ${matError.message}`);
        // 개별 원재료 실패 시에도 다른 원재료 처리 계속
      }
    }

    // 배치의 planned_cost 업데이트
    if (result.totalCost > 0) {
      await db.execute(sql`
        UPDATE h_batches
        SET planned_cost = ${result.totalCost.toFixed(2)}
        WHERE id = ${batchId} AND tenant_id = ${tenantId}
      `);
    }

    console.log(`[autoMaterialIssue] 배치 #${batchId} 원료 자동 출고 완료: ${result.issuedMaterials.length}건, 총 원가 ${result.totalCost.toFixed(0)}원`);

  } catch (error: any) {
    console.error(`[autoMaterialIssue] 배치 #${batchId} 원료 자동 출고 실패:`, error);
    result.success = false;
    result.errors.push(error.message || "알 수 없는 오류");
  }

  return result;
}
