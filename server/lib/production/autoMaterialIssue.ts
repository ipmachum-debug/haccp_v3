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
 * ★ 2026-04-14 Module 3 노트:
 *   재고 음수 방지: LOT/inventory 차감 모두 GREATEST(?, 0) 방어 이미 적용됨 ✅
 *
 *   Technical Debt (향후 개선 필요):
 *   - 현재 각 원재료별 처리가 독립적인 try-catch 패턴이라 "일부 원재료만 부분 차감"
 *     이 가능함. 이상적으로는 각 원재료당 withTransaction 래핑이 필요하지만,
 *     FEFO 할당 + 거래 기록 + 인벤토리 업데이트 + 수불부 반영이 복잡하게 얽혀
 *     있어 리팩터 시 운영 리스크가 큼. 실제 운영 데이터에서 문제 발견 시 도입.
 *   - completeBatch 와의 2중 차감 방지는 현재 inventory_deducted 플래그에 의존.
 *     FOR UPDATE 잠금으로 race condition 완전 차단 필요 (별도 세션).
 */

import { getDb } from "../../db";
import { getRawConnection } from "../../db/connection";
import { eq, and, sql } from "drizzle-orm";
import { resolveMaterialIds, resolvePriceFallback } from "./materialIdResolver";
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
function resolveBatchTransactionDate(batch: { completed_at?: any; planned_date?: any }): string {
  const candidate = batch?.completed_at ?? batch?.planned_date ?? null;
  const d = candidate ? new Date(candidate) : new Date();
  // KST(UTC+9) 변환 후 YYYY-MM-DD
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split("T")[0];
}

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
  userId: number
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

    // 이미 전부 출고 완료인지 체크
    const allDeducted = batchInputs.every((bi: any) => Number(bi.inventory_deducted) === 1);
    if (allDeducted) {
      result.warnings.push(`배치 #${batchId} 원재료가 이미 전량 출고되었습니다.`);
      return result;
    }

    // PR-W3: 배치 일자 우선 (completed_at → planned_date → 오늘 폴백)
    const transactionDate = resolveBatchTransactionDate(batch);

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
      const requiredQuantity = parseFloat(input.planned_quantity?.toString() || "0");
      const unit = input.unit || "kg";
      const materialName = input.material_name || `원재료 #${rawMaterialId}`;
      const isWater = isWaterMaterial(materialName);

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
        const r = await resolveMaterialIds(rawMaterialId, tenantId, rawConn);
        canonicalId = r.canonicalId;
        itemMasterId = r.itemMasterId;
        resolveSource = r.source;
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
          const fb = await resolvePriceFallback(canonicalId, itemMasterId, tenantId, rawConn);
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
        let issuedQuantity = requiredQuantity;
        let materialCost = requiredQuantity * unitPrice; // 정제수: 0
        let actuallyDeducted = false; // ★ 실제 lot 차감 성공 여부 (inventory_deducted 플래그 결정용)

        // FEFO 로트 할당 시도 (재고 로트가 있는 경우)
        let lotAllocations: Array<{ lotId: number; quantity: number; unitCost: number }> = [];
        
        try {
          // h_inventory에서 해당 원재료의 재고 확인 (canonicalId 사용)
          const [invRows]: any = await db.execute(sql`
            SELECT id, total_quantity, available_quantity
            FROM h_inventory
            WHERE material_id = ${canonicalId} AND tenant_id = ${tenantId}
            LIMIT 1
          `);

          const inventory = (invRows as any[])?.[0];

          if (inventory) {
            const inventoryId = Number(inventory.id);
            let availableQty = parseFloat(inventory.available_quantity?.toString() || "0");

            // [lot0-trace] G2 자동 보정 (Phase 1, 2026-04-27):
            // h_inventory 마스터의 available_quantity 가 LOT 합계와 어긋난 경우
            // (마스터 < 요청량 BUT LOT 합계 ≥ 요청량) → LOT 합계로 재검증 후 마스터 동기화.
            if (availableQty < requiredQuantity) {
              const [lotSumRows]: any = await db.execute(sql`
                SELECT COALESCE(SUM(available_quantity), 0) as total_lot_qty
                FROM h_inventory_lots
                WHERE material_id = ${canonicalId} AND tenant_id = ${tenantId}
                  AND COALESCE(status, 'available') = 'available'
                  AND available_quantity > 0
              `);
              const lotTotalQty = parseFloat(
                (lotSumRows as any[])?.[0]?.total_lot_qty?.toString() || "0"
              );

              if (lotTotalQty >= requiredQuantity) {
                console.warn(
                  `[lot0-trace] master_lot_mismatch_recovery material=${canonicalId}/${materialName} ` +
                  `master=${availableQty} lot_sum=${lotTotalQty} required=${requiredQuantity} ` +
                  `batch=${batchId} input=${input.id}`
                );
                await db.execute(sql`
                  UPDATE h_inventory
                  SET available_quantity = ${lotTotalQty.toString()},
                      total_quantity = GREATEST(total_quantity, ${lotTotalQty.toString()}),
                      last_updated = NOW()
                  WHERE id = ${inventoryId} AND tenant_id = ${tenantId}
                `);
                availableQty = lotTotalQty;
              }
            }

            if (availableQty >= requiredQuantity) {
              // FEFO 로트 할당 시도
              try {
                const { allocateLotsFEFO } = await import("../inventory/fefoLotAllocation");
                const allocations = await allocateLotsFEFO(inventoryId, requiredQuantity, unit, tenantId, canonicalId);
                
                let totalAllocated = 0;
                for (const alloc of allocations) {
                  const amount = alloc.quantity * alloc.unitCost;
                  
                  // h_inventory_transactions에 출고 기록 (canonicalId 사용)
                  await db.execute(sql`
                    INSERT INTO h_inventory_transactions
                    (inventory_id, lot_id, material_id, transaction_type, quantity, unit, unit_cost, amount,
                     transaction_date, source_type, source_id, source_line_id,
                     action_type, purpose, performed_by, created_by, tenant_id)
                    VALUES
                    (${inventoryId}, ${alloc.lotId}, ${canonicalId}, 'usage', ${alloc.quantity.toString()}, ${unit},
                     ${alloc.unitCost.toString()}, ${amount.toString()},
                     ${transactionDate}, 'BATCH', ${batchId}, ${input.id},
                     'AUTO_ISSUE', 'production', ${userId}, ${userId}, ${tenantId})
                  `);

                  // h_inventory_lots 가용 재고 차감
                  await db.execute(sql`
                    UPDATE h_inventory_lots
                    SET available_quantity = GREATEST(available_quantity - ${alloc.quantity}, 0)
                    WHERE id = ${alloc.lotId} AND tenant_id = ${tenantId}
                  `);

                  totalAllocated += alloc.quantity;
                  lotAllocations.push({
                    lotId: alloc.lotId,
                    quantity: alloc.quantity,
                    unitCost: alloc.unitCost
                  });
                }
                
                if (totalAllocated > 0) {
                  issuedQuantity = totalAllocated;
                  materialCost = allocations.reduce((sum, a) => sum + a.quantity * a.unitCost, 0);
                  actuallyDeducted = true; // ★ 실제 차감 성공
                }

                // h_inventory 총 재고 차감
                await db.execute(sql`
                  UPDATE h_inventory
                  SET total_quantity = GREATEST(total_quantity - ${issuedQuantity}, 0),
                      available_quantity = GREATEST(available_quantity - ${issuedQuantity}, 0),
                      last_updated = NOW()
                  WHERE id = ${inventoryId} AND tenant_id = ${tenantId}
                `);
              } catch (fefoErr: any) {
                console.warn(
                  `[lot0-trace] fefo_throw material=${canonicalId}/${materialName} ` +
                  `batch=${batchId} input=${input.id} required=${requiredQuantity} ` +
                  `err="${fefoErr.message}"`
                );
                result.warnings.push(`${materialName}: FEFO 할당 실패, 직접 출고 기록 생성 (${fefoErr.message})`);
              }
            } else {
              console.warn(
                `[lot0-trace] master_short material=${canonicalId}/${materialName} ` +
                `batch=${batchId} input=${input.id} master=${availableQty} required=${requiredQuantity}`
              );
              result.warnings.push(`${materialName}: 재고 부족 (가용: ${availableQty}, 필요: ${requiredQuantity}). 출고 기록만 생성합니다.`);
            }
          } else {
            // 재고 레코드가 없는 경우 - 출고 기록만 생성 (재고 시스템 미구축 상태 대응)
            console.warn(
              `[lot0-trace] no_master raw=${rawMaterialId} canonical=${canonicalId} ` +
              `name="${materialName}" batch=${batchId} input=${input.id} required=${requiredQuantity} ` +
              `resolve_src=${resolveSource}`
            );
            result.warnings.push(`${materialName}: 재고 레코드 없음. 출고 기록만 생성합니다.`);
          }
        } catch (invErr: any) {
          console.warn(
            `[lot0-trace] inventory_query_error material=${canonicalId}/${materialName} ` +
            `batch=${batchId} input=${input.id} err="${invErr.message}"`
          );
          result.warnings.push(`${materialName}: 재고 조회 실패 (${invErr.message}). 출고 기록만 생성합니다.`);
        }

        // 로트 할당이 안 되었으면 로트 없이 거래 기록만 생성
        if (lotAllocations.length === 0) {
          console.warn(
            `[lot0-trace] fallback_lot0_insert material=${canonicalId}/${materialName} ` +
            `batch=${batchId} input=${input.id} required=${requiredQuantity} ` +
            `price=${unitPrice} price_src=${priceFallbackSource}`
          );
          try {
            // 2026-04-28 (근본 작업 A): sentinel lot_id=0 → NULL 로 전환.
            // 의미: "LOT 매칭 실패" 를 sentinel 0 대신 NULL 로 표현.
            await db.execute(sql`
              INSERT INTO h_inventory_transactions
              (lot_id, material_id, transaction_type, quantity, unit, unit_cost, amount,
               transaction_date, source_type, source_id, source_line_id,
               action_type, purpose, performed_by, created_by, tenant_id,
               reference_type, reference_id, notes)
              VALUES
              (NULL, ${canonicalId}, 'usage', ${requiredQuantity.toString()}, ${unit},
               ${unitPrice.toString()}, ${materialCost.toString()},
               ${transactionDate}, 'BATCH', ${batchId}, ${input.id},
               'AUTO_ISSUE', 'production', ${userId}, ${userId}, ${tenantId},
               'batch', ${batchId}, ${`${materialName} 자동출고 (재고미등록, price_src=${priceFallbackSource})`})
            `);
          } catch (txnErr: any) {
            result.warnings.push(`${materialName}: 거래 기록 생성 실패 (${txnErr.message})`);
          }
        }

        // h_batch_inputs 업데이트
        // ★ inventory_deducted 는 actuallyDeducted (실제 lot 차감 성공) 인 경우에만 1
        //   lot 매칭 실패해도 단가는 폴백 가격으로 채워서 원가 표시는 가능하게 함
        const effectiveUnitPrice = isWater ? 0 : (
          lotAllocations.length > 0 && issuedQuantity > 0
            ? materialCost / issuedQuantity  // LOT 가중평균 단가
            : unitPrice                       // 폴백: 마스터/마지막 입고가
        );
        const effectiveTotalPrice = isWater ? 0 : (
          lotAllocations.length > 0 && issuedQuantity > 0
            ? materialCost
            : requiredQuantity * unitPrice
        );

        await db.execute(sql`
          UPDATE h_batch_inputs
          SET inventory_deducted = ${actuallyDeducted ? 1 : 0},
              actual_quantity = ${issuedQuantity},
              unit_price = ${effectiveUnitPrice.toFixed(2)},
              total_price = ${effectiveTotalPrice.toFixed(2)},
              input_time = NOW(),
              input_by = ${userId}
          WHERE id = ${input.id} AND tenant_id = ${tenantId}
        `);

        // 수불부(material_ledger_daily) 반영 — canonicalId 사용 (lot 시스템과 정합)
        try {
          await db.execute(sql`
            INSERT INTO material_ledger_daily 
            (tenant_id, material_id, ledger_date, usage_qty, notes, source)
            VALUES 
            (${tenantId}, ${canonicalId}, ${transactionDate}, ${issuedQuantity},
             ${`배치#${batchId} 자동출고`}, 'auto')
            ON DUPLICATE KEY UPDATE
              usage_qty = usage_qty + ${issuedQuantity},
              notes = CONCAT(COALESCE(notes, ''), ', ', ${`배치#${batchId} 자동출고`})
          `);
        } catch (ledgerErr: any) {
          result.warnings.push(`${materialName}: 수불부 반영 실패 (${ledgerErr.message})`);
        }

        // ★ 2026-05-10 (PR #299 F5-4): h_inventory_deduction_log INSERT
        //   조건: 실제 lot 차감 성공 + 수량 > 0 + 정제수 제외
        //   실패해도 main flow 영향 없음 (best-effort).
        if (
          productionLogIdForDeduction &&
          actuallyDeducted &&
          issuedQuantity > 0 &&
          !isWater
        ) {
          try {
            const rawConn = await getRawConnection();
            await insertInventoryDeductionLog(
              {
                productionLogId: productionLogIdForDeduction,
                materialId: canonicalId,
                materialType: "raw_material",
                deductedQuantity: issuedQuantity,
                unit,
              },
              rawConn,
            );
          } catch (dlErr: any) {
            console.warn(
              `[deductionLog] insert 예외 batch=${batchId} material=${canonicalId}: ${dlErr?.message || dlErr}`,
            );
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
