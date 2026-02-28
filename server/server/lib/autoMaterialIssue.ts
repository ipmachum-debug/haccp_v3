/**
 * 배치 시작 시 원료 자동 출고 서비스
 * 
 * 워크플로우:
 * 1. 배치 정보에서 productId, recipeId 조회
 * 2. 레시피 라인에서 원료 목록 조회
 * 3. 배치 계획 수량 / 레시피 배치 사이즈 = 배수 계산
 * 4. 각 원료별 필요 수량 = 레시피 수량 × 배수
 * 5. FEFO 로트 할당으로 자동 출고
 * 6. 재고 원장 기록 (h_inventory_transactions)
 * 7. 회계 원장 기록 (accounting_transactions) - 차변: WIP, 대변: 원재료
 * 8. h_inventory 가용 재고 차감
 */

import { getDb } from "../db";
import { hInventoryTransactions } from "../../drizzle/schema/part2";
import { accountingTransactions } from "../../drizzle/schema_inventory_accounting";
import { allocateLotsFEFO } from "./fefoLotAllocation";
import { eq, and, sql } from "drizzle-orm";

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
    const { hBatches } = await import("../../drizzle/schema");
    const [batch] = await db.select().from(hBatches).where(eq(hBatches.id, batchId)).limit(1);
    
    if (!batch) {
      throw new Error(`배치 ID ${batchId}를 찾을 수 없습니다.`);
    }

    const productId = Number(batch.productId);
    const recipeId = batch.recipeId ? Number(batch.recipeId) : null;
    const plannedQuantity = parseFloat(batch.plannedQuantity?.toString() || "0");

    if (plannedQuantity <= 0) {
      throw new Error("계획 수량이 0 이하입니다.");
    }

    // 2. 레시피 조회 (recipeId가 있으면 직접 조회, 없으면 productId로 조회)
    const { recipes, recipeLines } = await import("../../drizzle/schema");
    let recipe: any = null;
    
    if (recipeId) {
      const [r] = await db.select().from(recipes).where(eq(recipes.id, recipeId)).limit(1);
      recipe = r;
    }
    
    if (!recipe) {
      // productId로 활성 레시피 조회
      const [r] = await db.select().from(recipes)
        .where(and(
          eq(recipes.productId, productId),
          eq(recipes.isActive, 1)
        ))
        .orderBy(sql`${recipes.createdAt} DESC`)
        .limit(1);
      recipe = r;
    }

    if (!recipe) {
      result.warnings.push(`제품 ID ${productId}에 대한 레시피가 없습니다. 원료 자동 출고를 건너뜁니다.`);
      return result;
    }

    // 3. 레시피 라인 (원료 목록) 조회
    const lines = await db.select().from(recipeLines)
      .where(eq(recipeLines.recipeId, recipe.id))
      .orderBy(recipeLines.sortOrder);

    if (lines.length === 0) {
      result.warnings.push(`레시피 ID ${recipe.id}에 원료가 등록되지 않았습니다.`);
      return result;
    }

    // 4. 배수 계산: 계획 수량 / 레시피 배치 사이즈
    const recipeBatchSize = parseFloat(recipe.batchSize?.toString() || "1");
    const multiplier = plannedQuantity / recipeBatchSize;

    // 5. 각 원료별 자동 출고 처리
    const { hInventory, hMaterials, hInventoryLots } = await import("../../drizzle/schema");

    for (const line of lines) {
      const materialId = Number(line.materialId);
      const requiredQuantity = parseFloat(line.quantity?.toString() || "0") * multiplier;
      const unit = line.unit || "kg";

      try {
        // 원재료 정보 조회
        const [material] = await db.select().from(hMaterials)
          .where(eq(hMaterials.id, materialId)).limit(1);
        
        const materialName = material?.materialName || `원재료 #${materialId}`;

        // h_inventory에서 해당 원재료의 재고 ID 조회
        const [inventory] = await db.select().from(hInventory)
          .where(eq(hInventory.materialId, materialId)).limit(1);

        if (!inventory) {
          result.errors.push(`${materialName}: 재고 정보가 없습니다.`);
          result.success = false;
          continue;
        }

        const inventoryId = Number(inventory.id);

        // FEFO 로트 할당
        const allocations = await allocateLotsFEFO(inventoryId, requiredQuantity, unit);

        let issuedQuantity = 0;
        let materialCost = 0;

        // 각 LOT별 재고 원장 기록
        for (const alloc of allocations) {
          const amount = alloc.quantity * alloc.unitCost;
          
          // h_inventory_transactions에 출고 기록
          await db.insert(hInventoryTransactions).values({
            inventoryId: inventoryId,
            lotId: alloc.lotId,
            transactionType: "usage",
            quantity: (-alloc.quantity).toString(),
            unit: unit,
            transactionDate: new Date().toISOString().split("T")[0],
            sourceType: "BATCH",
            sourceId: batchId,
            sourceLineId: line.id,
            actionType: "AUTO_ISSUE",
            purpose: "production",
            unitCost: alloc.unitCost.toString(),
            amount: (-amount).toString(),
            performedBy: userId,
            createdBy: userId,
            tenantId: Number(batch.tenantId)
          } as any);

          // h_inventory_lots 가용 재고 차감
          await db.execute(sql`
            UPDATE h_inventory_lots 
            SET available_quantity = available_quantity - ${alloc.quantity}
            WHERE id = ${alloc.lotId}
          `);

          issuedQuantity += alloc.quantity;
          materialCost += amount;
        }

        // h_inventory 총 재고 및 가용 재고 차감
        await db.execute(sql`
          UPDATE h_inventory 
          SET total_quantity = total_quantity - ${issuedQuantity},
              available_quantity = available_quantity - ${issuedQuantity},
              last_updated = NOW()
          WHERE id = ${inventoryId}
        `);

        // 회계 원장 기록 (복식부기)
        const transactionDate = new Date().toISOString().split("T")[0];
        
        // 차변: WIP (재공품) 1130
        await db.insert(accountingTransactions).values({
          transactionDate,
          accountCode: "1130",
          debitAmount: materialCost.toFixed(2),
          creditAmount: "0.00",
          description: `배치 #${batchId} 원료 자동 출고 - ${materialName}`,
          sourceType: "BATCH_AUTO_ISSUE",
          sourceId: `BATCH-${batchId}`,
          sourceLineId: `BATCH-${batchId}-MAT-${materialId}`,
          actionType: "AUTO_ISSUE",
          createdBy: userId
        } as any);

        // 대변: 원재료재고 1120
        await db.insert(accountingTransactions).values({
          transactionDate,
          accountCode: "1120",
          debitAmount: "0.00",
          creditAmount: materialCost.toFixed(2),
          description: `배치 #${batchId} 원료 자동 출고 - ${materialName}`,
          sourceType: "BATCH_AUTO_ISSUE",
          sourceId: `BATCH-${batchId}`,
          sourceLineId: `BATCH-${batchId}-MAT-${materialId}`,
          actionType: "AUTO_ISSUE",
          createdBy: userId
        } as any);

        result.issuedMaterials.push({
          materialId,
          materialName,
          requiredQuantity,
          issuedQuantity,
          unit,
          lotAllocations: allocations.map(a => ({
            lotId: a.lotId,
            quantity: a.quantity,
            unitCost: a.unitCost
          }))
        });

        result.totalCost += materialCost;

      } catch (matError: any) {
        const materialName = `원재료 #${materialId}`;
        if (matError.message?.includes("재고 부족")) {
          result.errors.push(`${materialName}: ${matError.message}`);
          result.success = false;
        } else {
          result.errors.push(`${materialName}: 출고 처리 실패 - ${matError.message}`);
          result.success = false;
        }
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
