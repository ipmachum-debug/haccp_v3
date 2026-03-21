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
 */

import { getDb } from "../db";
import { eq, and, sql } from "drizzle-orm";

/** 정제수(purified water) 여부 판별 - 원가 계산에서 제외 대상 */
function isWaterMaterial(materialName: string | null | undefined): boolean {
  if (!materialName) return false;
  const name = materialName.toLowerCase();
  return name.includes("정제수") || name.includes("purified water");
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
    const [batchRows]: any = await db.execute(sql`
      SELECT b.id, b.tenant_id, b.product_id, b.planned_quantity, b.status,
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
    const [batchInputRows]: any = await db.execute(sql`
      SELECT bi.id, bi.material_id, bi.planned_quantity, bi.actual_quantity,
             bi.unit, bi.inventory_deducted, bi.process_group_id,
             m.material_name, m.material_code, m.unit_price
      FROM h_batch_inputs bi
      LEFT JOIN h_materials m ON m.id = bi.material_id AND m.tenant_id = bi.tenant_id
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

    const transactionDate = new Date(new Date().getTime() + 9 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    // 3. 각 원재료별 출고 처리
    for (const input of batchInputs) {
      if (Number(input.inventory_deducted) === 1) continue; // 이미 출고된 건 건너뜀

      const materialId = Number(input.material_id);
      const requiredQuantity = parseFloat(input.planned_quantity?.toString() || "0");
      const unit = input.unit || "kg";
      const materialName = input.material_name || `원재료 #${materialId}`;
      const isWater = isWaterMaterial(materialName);
      const unitPrice = isWater ? 0 : parseFloat(input.unit_price?.toString() || "0");

      try {
        let issuedQuantity = requiredQuantity;
        let materialCost = requiredQuantity * unitPrice; // 정제수: 0

        // FEFO 로트 할당 시도 (재고 로트가 있는 경우)
        let lotAllocations: Array<{ lotId: number; quantity: number; unitCost: number }> = [];
        
        try {
          // h_inventory에서 해당 원재료의 재고 확인
          const [invRows]: any = await db.execute(sql`
            SELECT id, total_quantity, available_quantity 
            FROM h_inventory 
            WHERE material_id = ${materialId} AND tenant_id = ${tenantId}
            LIMIT 1
          `);
          
          const inventory = (invRows as any[])?.[0];
          
          if (inventory) {
            const inventoryId = Number(inventory.id);
            const availableQty = parseFloat(inventory.available_quantity?.toString() || "0");
            
            if (availableQty >= requiredQuantity) {
              // FEFO 로트 할당 시도
              try {
                const { allocateLotsFEFO } = await import("./fefoLotAllocation");
                const allocations = await allocateLotsFEFO(inventoryId, requiredQuantity, unit, tenantId);
                
                let totalAllocated = 0;
                for (const alloc of allocations) {
                  const amount = alloc.quantity * alloc.unitCost;
                  
                  // h_inventory_transactions에 출고 기록
                  await db.execute(sql`
                    INSERT INTO h_inventory_transactions 
                    (inventory_id, lot_id, transaction_type, quantity, unit, unit_cost, amount,
                     transaction_date, source_type, source_id, source_line_id, 
                     action_type, purpose, performed_by, created_by, tenant_id)
                    VALUES 
                    (${inventoryId}, ${alloc.lotId}, 'usage', ${(-alloc.quantity).toString()}, ${unit},
                     ${alloc.unitCost.toString()}, ${(-amount).toString()},
                     ${transactionDate}, 'BATCH', ${batchId}, ${input.id},
                     'AUTO_ISSUE', 'production', ${userId}, ${userId}, ${tenantId})
                  `);

                  // h_inventory_lots 가용 재고 차감
                  await db.execute(sql`
                    UPDATE h_inventory_lots 
                    SET available_quantity = available_quantity - ${alloc.quantity}
                    WHERE id = ${alloc.lotId}
                  `);

                  totalAllocated += alloc.quantity;
                  lotAllocations.push({
                    lotId: alloc.lotId,
                    quantity: alloc.quantity,
                    unitCost: alloc.unitCost
                  });
                }
                
                issuedQuantity = totalAllocated;
                materialCost = allocations.reduce((sum, a) => sum + a.quantity * a.unitCost, 0);

                // h_inventory 총 재고 차감
                await db.execute(sql`
                  UPDATE h_inventory 
                  SET total_quantity = total_quantity - ${issuedQuantity},
                      available_quantity = available_quantity - ${issuedQuantity},
                      last_updated = NOW()
                  WHERE id = ${inventoryId}
                `);
              } catch (fefoErr: any) {
                result.warnings.push(`${materialName}: FEFO 할당 실패, 직접 출고 기록 생성 (${fefoErr.message})`);
              }
            } else {
              result.warnings.push(`${materialName}: 재고 부족 (가용: ${availableQty}, 필요: ${requiredQuantity}). 출고 기록만 생성합니다.`);
            }
          } else {
            // 재고 레코드가 없는 경우 - 출고 기록만 생성 (재고 시스템 미구축 상태 대응)
            result.warnings.push(`${materialName}: 재고 레코드 없음. 출고 기록만 생성합니다.`);
          }
        } catch (invErr: any) {
          result.warnings.push(`${materialName}: 재고 조회 실패 (${invErr.message}). 출고 기록만 생성합니다.`);
        }

        // 로트 할당이 안 되었으면 로트 없이 거래 기록만 생성
        if (lotAllocations.length === 0) {
          try {
            await db.execute(sql`
              INSERT INTO h_inventory_transactions 
              (lot_id, transaction_type, quantity, unit, unit_cost, amount,
               transaction_date, source_type, source_id, source_line_id,
               action_type, purpose, performed_by, created_by, tenant_id,
               reference_type, reference_id, notes)
              VALUES 
              (0, 'usage', ${(-requiredQuantity).toString()}, ${unit},
               ${unitPrice.toString()}, ${(-materialCost).toString()},
               ${transactionDate}, 'BATCH', ${batchId}, ${input.id},
               'AUTO_ISSUE', 'production', ${userId}, ${userId}, ${tenantId},
               'batch', ${batchId}, ${`${materialName} 자동출고 (재고미등록)`})
            `);
          } catch (txnErr: any) {
            result.warnings.push(`${materialName}: 거래 기록 생성 실패 (${txnErr.message})`);
          }
        }

        // h_batch_inputs.inventory_deducted = 1, actual_quantity + 실제단가 업데이트
        // FEFO 할당된 LOT의 가중평균 단가로 unit_price/total_price 갱신
        const effectiveUnitPrice = isWater ? 0 : (
          lotAllocations.length > 0 && issuedQuantity > 0
            ? materialCost / issuedQuantity  // LOT 가중평균 단가
            : unitPrice                       // 폴백: 마스터 단가
        );
        const effectiveTotalPrice = isWater ? 0 : materialCost;

        await db.execute(sql`
          UPDATE h_batch_inputs
          SET inventory_deducted = 1,
              actual_quantity = ${issuedQuantity},
              unit_price = ${effectiveUnitPrice.toFixed(2)},
              total_price = ${effectiveTotalPrice.toFixed(2)},
              input_time = NOW(),
              input_by = ${userId}
          WHERE id = ${input.id} AND tenant_id = ${tenantId}
        `);

        // 수불부(material_ledger_daily) 반영
        try {
          await db.execute(sql`
            INSERT INTO material_ledger_daily 
            (tenant_id, material_id, ledger_date, usage_qty, notes, source)
            VALUES 
            (${tenantId}, ${materialId}, ${transactionDate}, ${issuedQuantity},
             ${`배치#${batchId} 자동출고`}, 'auto')
            ON DUPLICATE KEY UPDATE
              usage_qty = usage_qty + ${issuedQuantity},
              notes = CONCAT(COALESCE(notes, ''), ', ', ${`배치#${batchId} 자동출고`})
          `);
        } catch (ledgerErr: any) {
          result.warnings.push(`${materialName}: 수불부 반영 실패 (${ledgerErr.message})`);
        }

        result.issuedMaterials.push({
          materialId,
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
        WHERE id = ${batchId}
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
