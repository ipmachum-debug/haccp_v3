// ═══════════════════════════════════════════════════════════════
// productionAnalytics.ts - 생산 분석 DB 함수
// 생산 최적화(LLM), 스케줄 조정, 불량률 분석,
// 재고 부족 예측, 발주 제안, 대시보드 통합 데이터
// ═══════════════════════════════════════════════════════════════
import { getDb } from "../connection";
import { eq, and, or, lte, gte, gt, desc, asc, sql, lt, inArray, count, isNotNull, sum } from "drizzle-orm";
import {
  hBatches,
  hBatchInputs,
  hMaterials,
  hInventoryLots,
  hInventoryTransactions,
  hProductsV2,
  hPurchaseOrders,
  hPurchaseOrderItems,
  hSuppliers,
  hMfReports,
  hMfReportVersions,
  hMfIngredients,
  itemMaster,
} from "../../../drizzle/schema";
import { getExpiringMaterials } from "../system/dashboardStats";

import { toKSTDate, todayKST, formatLocalDate } from "../../utils/timezone";

// ═══════════════════════════════════════════════════════════════
// 원재료 소요량 계산 (내부 헬퍼)
// ═══════════════════════════════════════════════════════════════

/** 배치 BOM 기반 원재료 소요량 + 재고 부족량 계산 */
async function calculateMaterialRequirements(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 1. 배치 정보 조회 (tenantId가 있으면 격리 적용)
  const batchConditions = [eq(hBatches.id, batchId)];
  if (tenantId) {
    batchConditions.push(eq(hBatches.tenantId, tenantId));
  }
  const [batch] = await db
    .select()
    .from(hBatches)
    .where(and(...batchConditions))
    .limit(1);

  if (!batch) throw new Error("배치를 찾을 수 없습니다");

  // 2. 제품의 BOM(품목제조보고) 조회
  const bomConditions: any[] = [
    eq(hMfReports.productId, batch.productId),
    eq(hMfReports.status, "ACTIVE"),
  ];
  if (tenantId) {
    bomConditions.push(eq(hMfReports.tenantId, tenantId));
  }
  const [bomReport] = await db
    .select()
    .from(hMfReports)
    .where(and(...bomConditions))
    .orderBy(desc(hMfReports.createdAt))
    .limit(1);

  if (!bomReport) {
    return {
      batchId,
      plannedQuantity: batch.plannedQuantity,
      materials: [],
      totalCost: 0
    };
  }

  // 3. 최신 버전 조회
  const [latestVersion] = await db
    .select()
    .from(hMfReportVersions)
    .where(eq(hMfReportVersions.mfReportId, bomReport.id))
    .orderBy(desc(hMfReportVersions.versionNo))
    .limit(1);

  if (!latestVersion) {
    return {
      batchId,
      plannedQuantity: batch.plannedQuantity,
      materials: [],
      totalCost: 0
    };
  }

  // 4. BOM 원재료 구성 조회 (itemMaster 또는 hMaterials 조인)
  const ingredientsData = await db
    .select({
      ingredient: hMfIngredients,
      material: hMaterials,
    })
    .from(hMfIngredients)
    .leftJoin(hMaterials, eq(hMfIngredients.materialId, hMaterials.id))
    .where(eq(hMfIngredients.mfReportVersionId, latestVersion.id))
    .orderBy(hMfIngredients.lineNo);

  // 5. 각 원재료별 필요 수량 및 재고 현황 계산
  const materialRequirements = await Promise.all(
    ingredientsData.map(async (line) => {
      const material = line.material;
      const ingredient = line.ingredient;

      if (!material || !ingredient) return null;

      // 필요 수량 계산: correctedQuantity 또는 adjustedWeightKg 우선 사용
      const ingredientQty = parseFloat(
        ingredient.correctedQuantity || ingredient.adjustedWeightKg?.toString() || ingredient.quantity || "0"
      );
      const requiredQuantity = parseFloat(batch.plannedQuantity) * ingredientQty;

      // 현재 재고 조회 (가용 수량 합계)
      const [stockResult] = await db
        .select({
          totalStock: sql<number>`SUM(${hInventoryLots.availableQuantity})`
        })
        .from(hInventoryLots)
        .where(and(
          eq(hInventoryLots.materialId, material.id),
          eq(hInventoryLots.status, "available")
        ));

      const currentStock = stockResult?.totalStock || 0;
      const shortage = Math.max(0, requiredQuantity - currentStock);

      // 비용 계산
      const unitPrice = parseFloat(material.unitPrice || "0");
      const totalCost = requiredQuantity * unitPrice;

      return {
        materialId: material.id,
        materialName: material.materialName,
        materialCode: material.materialCode,
        requiredQuantity,
        currentStock,
        shortage,
        unit: ingredient.unit,
        unitPrice,
        totalCost,
        isShortage: shortage > 0
      };
    })
  );

  const validMaterials = materialRequirements.filter((m) => m !== null);
  const totalCost = validMaterials.reduce((sum, m) => sum + (m?.totalCost || 0), 0);

  return {
    batchId,
    plannedQuantity: batch.plannedQuantity,
    materials: validMaterials,
    totalCost
  };
}

// ═══════════════════════════════════════════════════════════════
// 재고 추이 및 회전율 분석
// ═══════════════════════════════════════════════════════════════

/** 재고 입출고 추이 조회 (일별 입고/출고/조정 집계) */
async function getInventoryTrend(params: {
  startDate?: string;
  endDate?: string;
  siteId?: number;
  materialId?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 기본값 설정 (최근 30일)
  const endDate = params.endDate || todayKST();
  const startDate = params.startDate || toKSTDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  const { hInventoryTransactions, hInventoryLots } = await import("../../../drizzle/schema");
  const { sql, and, eq } = await import("drizzle-orm");

  const conditions = [
    sql`DATE(${hInventoryTransactions.createdAt}) >= ${startDate}`,
    sql`DATE(${hInventoryTransactions.createdAt}) <= ${endDate}`,
  ];

  if (params.materialId) {
    conditions.push(eq(hInventoryLots.materialId, params.materialId));
  }

  // hInventoryLots → hMaterials JOIN으로 tenantId 필터링 (별도 서브쿼리)
  if (params.tenantId) {
    const { hMaterials } = await import("../../../drizzle/schema");
    conditions.push(sql`${hInventoryLots.materialId} IN (SELECT id FROM h_materials WHERE tenant_id = ${params.tenantId})`);
  }

  const trend = await db
    .select({
      date: sql<string>`DATE(${hInventoryTransactions.createdAt})`,
      receiptQuantity: sql<number>`SUM(CASE WHEN ${hInventoryTransactions.transactionType} = 'receipt' THEN ${hInventoryTransactions.quantity} ELSE 0 END)`,
      usageQuantity: sql<number>`SUM(CASE WHEN ${hInventoryTransactions.transactionType} = 'usage' THEN ${hInventoryTransactions.quantity} ELSE 0 END)`,
      adjustmentQuantity: sql<number>`SUM(CASE WHEN ${hInventoryTransactions.transactionType} = 'adjustment' THEN ${hInventoryTransactions.quantity} ELSE 0 END)`,
      transactionCount: sql<number>`COUNT(*)`
    })
    .from(hInventoryTransactions)
    .leftJoin(hInventoryLots, eq(hInventoryTransactions.lotId, hInventoryLots.id))
    .where(and(...conditions))
    .groupBy(sql`DATE(${hInventoryTransactions.createdAt})`)
    .orderBy(sql`DATE(${hInventoryTransactions.createdAt})`);

  return trend.map((row) => ({
    date: row.date,
    receiptQuantity: row.receiptQuantity || 0,
    usageQuantity: row.usageQuantity || 0,
    adjustmentQuantity: row.adjustmentQuantity || 0,
    netChange: (row.receiptQuantity || 0) - (row.usageQuantity || 0) + (row.adjustmentQuantity || 0),
    transactionCount: row.transactionCount || 0
  }));
}

/** 재고 회전율 분석 (원재료별 사용량/재고 비율) */
async function getInventoryTurnoverAnalysis(params: {
  startDate?: string;
  endDate?: string;
  siteId?: number;
  materialId?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 기본값 설정 (최근 30일)
  const endDate = params.endDate || todayKST();
  const startDate = params.startDate || toKSTDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  const { hInventoryTransactions, hMaterials, hInventoryLots } = await import("../../../drizzle/schema");
  const { sql, and, eq } = await import("drizzle-orm");

  // 1. 기간 내 사용량 조회 (lotId를 통해 materialId 얻기)
  const usageData = await db
    .select({
      materialId: hInventoryLots.materialId,
      totalUsage: sql<number>`SUM(${hInventoryTransactions.quantity})`
    })
    .from(hInventoryTransactions)
    .leftJoin(hInventoryLots, eq(hInventoryTransactions.lotId, hInventoryLots.id))
    .where(and(
      eq(hInventoryTransactions.transactionType, "usage"),
      sql`DATE(${hInventoryTransactions.createdAt}) >= ${startDate}`,
      sql`DATE(${hInventoryTransactions.createdAt}) <= ${endDate}`,
      params.tenantId ? sql`${hInventoryLots.materialId} IN (SELECT id FROM h_materials WHERE tenant_id = ${params.tenantId})` : undefined
    ))
    .groupBy(hInventoryLots.materialId);

  // 2. 현재 재고 조회
  const currentStock = await db
    .select({
      materialId: hInventoryLots.materialId,
      totalStock: sql<number>`SUM(${hInventoryLots.availableQuantity})`
    })
    .from(hInventoryLots)
    .where(and(
      eq(hInventoryLots.status, "available"),
      params.tenantId ? sql`${hInventoryLots.materialId} IN (SELECT id FROM h_materials WHERE tenant_id = ${params.tenantId})` : undefined
    ))
    .groupBy(hInventoryLots.materialId);

  // 3. 원재료 정보와 결합 (tenantId 필터 포함)
  const materials = await db.select().from(hMaterials).where(
    params.tenantId ? eq(hMaterials.tenantId, params.tenantId) : undefined
  );

  // 4. 회전율 계산
  const turnoverRates = materials.map((material) => {
    const usage = usageData.find((u) => u.materialId === material.id);
    const stock = currentStock.find((s) => s.materialId === material.id);

    const totalUsage = usage?.totalUsage || 0;
    const totalStock = stock?.totalStock || 0;

    // 회전율 = 사용량 / 평균 재고 (간단히 현재 재고로 근사)
    const turnoverRate = totalStock > 0 ? totalUsage / totalStock : 0;

    // 재고 일수 = 재고 / (일평균 사용량)
    const daysDiff = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
    const avgDailyUsage = daysDiff > 0 ? totalUsage / daysDiff : 0;
    const daysOfStock = avgDailyUsage > 0 ? totalStock / avgDailyUsage : 0;

    return {
      materialId: material.id,
      materialName: material.materialName,
      materialCode: material.materialCode,
      totalUsage,
      totalStock,
      turnoverRate: turnoverRate.toFixed(2),
      daysOfStock: Math.ceil(daysOfStock),
      avgDailyUsage: avgDailyUsage.toFixed(2)
    };
  });

  return turnoverRates.sort((a, b) => parseFloat(b.turnoverRate) - parseFloat(a.turnoverRate));
}

// ═══════════════════════════════════════════════════════════════
// 생산 최적화 (LLM 기반 일정 조정 제안)
// ═══════════════════════════════════════════════════════════════

/** 생산 일정 최적화 제안 (재고 부족 배치 분석 + LLM 제안) */
export async function optimizeProductionSchedule(params: {
  startDate: string;
  endDate: string;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 1. 기간 내 계획된 배치 조회 (★ hProductsV2 사용)
  const batches = await db
    .select({
      id: hBatches.id,
      batchCode: hBatches.batchCode,
      productId: hBatches.productId,
      productName: hProductsV2.productName,
      plannedDate: hBatches.plannedDate,
      plannedQuantity: hBatches.plannedQuantity,
      status: hBatches.status
    })
    .from(hBatches)
    .leftJoin(hProductsV2, eq(hBatches.productId, hProductsV2.id))
    .where(
      and(
        eq(hBatches.tenantId, params.tenantId),
        sql`${hBatches.plannedDate} >= ${params.startDate}`,
        sql`${hBatches.plannedDate} <= ${params.endDate}`,
        sql`${hBatches.status} IN ('planned', 'running')`
      )
    )
    .orderBy(hBatches.plannedDate);

  // 2. 각 배치별 필요한 원재료 조회
  const batchMaterials = await Promise.all(
    batches.map(async (batch: any) => {
      try {
        const materials = await calculateMaterialRequirements(batch.id);
        return {
          batchId: batch.id,
          batchCode: batch.batchCode,
    dayBatchGroup: batch.dayBatchGroup || null,
    batchOrder: batch.batchOrder ?? null,
          productName: batch.productName,
          plannedDate: batch.plannedDate,
          materials: materials.materials.filter((m: any) => m.shortage > 0)
        };
      } catch (error) {
        // 레시피가 없는 경우 빈 배열 반환
        return {
          batchId: batch.id,
          batchCode: batch.batchCode,
    dayBatchGroup: batch.dayBatchGroup || null,
    batchOrder: batch.batchOrder ?? null,
          productName: batch.productName,
          plannedDate: batch.plannedDate,
          materials: []
        };
      }
    })
  );

  // 3. 재고 부족이 있는 배치 필터링
  const batchesWithShortage = batchMaterials.filter((b: any) => b.materials.length > 0);

  // 4. LLM API를 사용하여 최적화 제안 생성
  let suggestions: any[] = [];

  if (batchesWithShortage.length > 0) {
    try {
      const { invokeLLM } = await import("../../_core/llm");

      // LLM에 전달할 배치 정보 준비
      const batchInfo = batchesWithShortage.map((batch: any) => ({
        batchCode: batch.batchCode,
    dayBatchGroup: batch.dayBatchGroup || null,
    batchOrder: batch.batchOrder ?? null,
        productName: batch.productName,
        plannedDate: batch.plannedDate,
        shortages: batch.materials.map((m: any) => ({
          material: m.materialName,
          shortage: `${m.shortage.toFixed(2)} ${m.unit}`,
          currentStock: `${m.currentStock.toFixed(2)} ${m.unit}`
        }))
      }));

      const prompt = `다음은 HACCP 식품 제조 공장의 생산 일정과 재고 부족 현황입니다.

배치 정보:
${JSON.stringify(batchInfo, null, 2)}

각 배치에 대해 다음 사항을 분석하고 제안해주세요:
1. 재고 부족 문제의 심각성 평가
2. 최적의 해결 방안 (일정 조정, 긴급 발주, 대체 원재료 사용 등)
3. 우선순위 (high/medium/low)

JSON 형식으로 응답해주세요:
{
  "suggestions": [
    {
      "batchCode": "배치 코드",
      "issue": "문제 설명",
      "suggestion": "구체적인 해결 방안",
      "priority": "high/medium/low"
    }
  ]
}`;

      const response = await invokeLLM({
        messages: [
          { role: "system", content: "당신은 HACCP 식품 제조 공장의 생산 계획 최적화 전문가입니다." },
          { role: "user", content: prompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "production_optimization",
            strict: true,
            schema: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      batchCode: { type: "string" },
                      issue: { type: "string" },
                      suggestion: { type: "string" },
                      priority: { type: "string", enum: ["high", "medium", "low"] }
                    },
                    required: ["batchCode", "issue", "suggestion", "priority"],
                    additionalProperties: false
                  }
                }
              },
              required: ["suggestions"],
              additionalProperties: false
            }
          }
        }
      });

      const content = response.choices[0].message.content;
      const llmResult = JSON.parse(typeof content === "string" ? content : "{}");

      // LLM 결과를 기존 배치 정보와 결합
      suggestions = batchesWithShortage.map((batch: any) => {
        const llmSuggestion = llmResult.suggestions?.find(
          (s: any) => s.batchCode === batch.batchCode
        );

        return {
          batchId: batch.batchId,
          batchCode: batch.batchCode,
    dayBatchGroup: batch.dayBatchGroup || null,
    batchOrder: batch.batchOrder ?? null,
          productName: batch.productName,
          currentDate: batch.plannedDate,
          issue: llmSuggestion?.issue || `재고 부족 (${batch.materials.length}건)`,
          suggestion: llmSuggestion?.suggestion || "일정 연기 또는 원재료 긴급 발주 필요",
          priority: (llmSuggestion?.priority || "high") as "high" | "medium" | "low"
        };
      });
    } catch (error) {
      console.error("LLM API 호출 실패, 기본 제안 사용:", error);

      // LLM API 실패 시 기본 제안 사용
      suggestions = batchesWithShortage.map((batch: any) => {
        const shortageList = batch.materials
          .map((m: any) => `${m.materialName}: ${m.shortage.toFixed(2)} ${m.unit} 부족`)
          .join(", ");

        return {
          batchId: batch.batchId,
          batchCode: batch.batchCode,
    dayBatchGroup: batch.dayBatchGroup || null,
    batchOrder: batch.batchOrder ?? null,
          productName: batch.productName,
          currentDate: batch.plannedDate,
          issue: `재고 부족 (${shortageList})`,
          suggestion: "일정 연기 또는 원재료 긴급 발주 필요",
          priority: "high" as const
        };
      });
    }
  }

  return {
    totalBatches: batches.length,
    batchesWithIssues: suggestions.length,
    suggestions
  };
}

/**
 * 최적화 제안 적용 (배치 일정 변경)
 */
export async function applyScheduleOptimization(params: {
  batchId: number;
  newPlannedDate: string;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  await db
    .update(hBatches)
    .set({
      plannedDate: new Date(params.newPlannedDate)
    })
    .where(and(eq(hBatches.id, params.batchId), eq(hBatches.tenantId, params.tenantId)));

  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// 생산 시간 추이 및 불량률 분석
// ═══════════════════════════════════════════════════════════════

/** 생산 시간 추이 분석 (일별 평균 생산시간) */
export async function getProductionTimeAnalysis(params: {
  startDate?: string;
  endDate?: string;
  siteId?: number;
  productId?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 기본값 설정 (최근 30일)
  const endDate = params.endDate || todayKST();
  const startDate = params.startDate || toKSTDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  // sql 템플릿으로 전체 쿼리 작성 (ONLY_FULL_GROUP_BY 모드 호환)
  const tenantFilter = params.tenantId ? sql`AND tenant_id = ${params.tenantId}` : sql``;
  const result = await db.execute<{
    date: string;
    avgProductionTime: number;
    totalBatches: number;
  }>(sql`
    SELECT
      DATE(start_time) as date,
      AVG(TIMESTAMPDIFF(HOUR, start_time, end_time)) as avgProductionTime,
      COUNT(*) as totalBatches
    FROM h_batches
    WHERE start_time >= ${startDate}
      AND end_time <= ${endDate}
      AND status = 'completed'
      ${tenantFilter}
    GROUP BY DATE(start_time)
    ORDER BY DATE(start_time)
  `);

  return result.map((r: any) => ({
    date: r.date,
    avgProductionTime: Number(r.avgProductionTime) || 0,
    totalBatches: Number(r.totalBatches) || 0
  }));
}

/** 불량률 분석 (제품별 계획 대비 실제 생산량 차이) */
export async function getDefectRateAnalysis(params: {
  startDate?: string;
  endDate?: string;
  siteId?: number;
  productId?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 기본값 설정 (최근 30일)
  const endDate = params.endDate || todayKST();
  const startDate = params.startDate || toKSTDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  const conditions = [
    sql`${hBatches.startTime} >= ${startDate}`,
    sql`${hBatches.endTime} <= ${endDate}`,
    eq(hBatches.status, "completed")
  ];
  if (params.tenantId) {
    conditions.push(eq(hBatches.tenantId, params.tenantId));
  }
  const result = await db
    .select({
      productId: hBatches.productId,
      productName: hProductsV2.productName,
      totalPlanned: sql<number>`SUM(${hBatches.plannedQuantity})`,
      totalActual: sql<number>`SUM(${hBatches.actualQuantity})`,
      batchCount: sql<number>`COUNT(*)`
    })
    .from(hBatches)
    .leftJoin(hProductsV2, eq(hBatches.productId, hProductsV2.id))
    .where(and(...conditions))
    .groupBy(hBatches.productId, hProductsV2.productName);

  return result.map((r: any) => {
    const totalPlanned = Number(r.totalPlanned || 0);
    const totalActual = Number(r.totalActual || 0);
    const defectRate = totalPlanned > 0
      ? ((totalPlanned - totalActual) / totalPlanned) * 100
      : 0;

    return {
      productId: r.productId,
      productName: r.productName,
      totalPlanned,
      totalActual,
      defectRate: Number(defectRate.toFixed(2)),
      batchCount: Number(r.batchCount || 0)
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// 발주 제안 승인/거부 워크플로
// ═══════════════════════════════════════════════════════════════

/** 발주 제안 승인 (LOT 자동 생성 + 입고 거래 기록) */
export async function approvePurchaseOrderSuggestion(params: {
  materialId: number;
  quantity: number;
  approvedBy: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 1. 원재료 정보 조회
  const [material] = await db
    .select()
    .from(hMaterials)
    .where(eq(hMaterials.id, params.materialId));

  if (!material) {
    throw new Error("원재료를 찾을 수 없습니다");
  }

  // 2. 발주 주문 생성 (간소화: 발주 테이블이 없으므로 재고 거래로 기록)
  const now = new Date();

  // 3. LOT 생성 (발주 승인 = 입고 예정)
  const [newLot] = await db
    .insert(hInventoryLots)
    .values({
      materialId: params.materialId,
      lotNumber: `PO-${Date.now()}`,
      quantity: params.quantity.toString(),
      availableQuantity: params.quantity.toString(),
      unit: material.unit || "kg",
      expiryDate: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), // 90일 후 유통기한
      receiptDate: now,
      status: "available"
    } as any)
    .$returningId();

  // 4. 거래 내역 기록
  // PR-§5.2-2: material_id 직접 작성 (params.materialId — 발주 제안의 material_id)
  await db.insert(hInventoryTransactions).values({
    lotId: newLot.id,
    materialId: params.materialId,
    transactionType: "receipt",
    quantity: params.quantity.toString(),
    unit: material.unit || "kg",
    createdBy: params.approvedBy,
    notes: `발주 제안 승인 - 자동 생성`
  } as any);

  return {
    success: true,
    lotId: newLot.id,
    message: "발주 제안이 승인되었으며, 입고 예정 LOT가 생성되었습니다"
  };
}

/** 발주 제안 거부 (로그 기록) */
export async function rejectPurchaseOrderSuggestion(params: {
  materialId: number;
  rejectedBy: number;
  reason?: string;
}) {
  // 간소화: 거부 내역은 로그로만 기록
  console.log(`[발주 제안 거부] 원재료 ID: ${params.materialId}, 거부자: ${params.rejectedBy}, 사유: ${params.reason || "없음"}`);

  return {
    success: true,
    message: "발주 제안이 거부되었습니다"
  };
}

/**
 * 발주 제안 이력 조회
 */
export async function getPurchaseProposalHistory(params: {
  startDate?: string;
  endDate?: string;
  status?: "draft" | "submitted" | "approved" | "received" | "cancelled";
  materialId?: number;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hPurchaseOrders, hPurchaseOrderItems, hMaterials, hSuppliers } = await import("../../../drizzle/schema");
  const { and, eq, gte, lte, sql } = await import("drizzle-orm");

  const conditions = [];

  if (params.startDate) {
    conditions.push(gte(hPurchaseOrders.orderDate, new Date(params.startDate)));
  }
  if (params.endDate) {
    conditions.push(lte(hPurchaseOrders.orderDate, new Date(params.endDate)));
  }
  if (params.status) {
    conditions.push(eq(hPurchaseOrders.status, params.status));
  }

  // 발주 주문 조회
  const orders = await db
    .select({
      id: hPurchaseOrders.id,
      poNumber: hPurchaseOrders.poNumber,
      orderDate: hPurchaseOrders.orderDate,
      expectedDeliveryDate: hPurchaseOrders.expectedDeliveryDate,
      totalAmount: hPurchaseOrders.totalAmount,
      status: hPurchaseOrders.status,
      notes: hPurchaseOrders.notes,
      createdAt: hPurchaseOrders.createdAt,
      supplierId: hPurchaseOrders.supplierId
    })
    .from(hPurchaseOrders)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${hPurchaseOrders.orderDate} DESC`);

  // 각 발주 주문의 항목 조회
  const ordersWithItems = await Promise.all(
    orders.map(async (order) => {
      const items = await db
        .select({
          id: hPurchaseOrderItems.id,
          materialId: hPurchaseOrderItems.materialId,
          materialName: hMaterials.materialName,
          materialCode: hMaterials.materialCode,
          quantity: hPurchaseOrderItems.quantity,
          unit: hPurchaseOrderItems.unit,
          unitPrice: hPurchaseOrderItems.unitPrice,
          totalPrice: hPurchaseOrderItems.totalPrice,
          notes: hPurchaseOrderItems.notes
        })
        .from(hPurchaseOrderItems)
        .leftJoin(hMaterials, eq(hPurchaseOrderItems.materialId, hMaterials.id))
        .where(eq(hPurchaseOrderItems.poId, order.id));

      // 원재료 필터링
      const filteredItems = params.materialId
        ? items.filter((item) => item.materialId === params.materialId)
        : items;

      // 원재료 필터링 후 항목이 없으면 해당 주문 제외
      if (params.materialId && filteredItems.length === 0) {
        return null;
      }

      // 공급업체 정보 조회
      const [supplier] = await db
        .select({
          supplierName: hSuppliers.supplierName
        })
        .from(hSuppliers)
        .where(eq(hSuppliers.id, order.supplierId));

      return {
        ...order,
        supplierName: supplier?.supplierName || "알 수 없음",
        items: filteredItems
      };
    })
  );

  // null 제거 (원재료 필터링으로 제외된 경우)
  return ordersWithItems.filter((order) => order !== null);
}


// ============================================================
// 통합 대시보드 탭별 API (Phase 134)
// ============================================================

/**
 * 생산 효율성 탭 통합 데이터 조회
 * - 배치별 원가 분석
 * - 생산 시간 추이
 * - 불량률 분석
 */
export async function getProductionEfficiencyData(params: {
  siteId: number;
  startDate?: string;
  endDate?: string;
  productId?: number;
  tenantId: number;
}) {
  const [costAnalysis, timeAnalysis, defectAnalysis] = await Promise.all([
    getBatchCostAnalysis(params),
    getProductionTimeAnalysis(params),
    getDefectRateAnalysis(params),
  ]);

  return {
    costAnalysis,
    timeAnalysis,
    defectAnalysis
  };
}

/**
 * 재고 추이 탭 통합 데이터 조회
 * - 재고 추이
 * - 재고 회전율
 * - 유통기한 임박 원재료
 */
export async function getInventoryTrendData(params: {
  siteId: number;
  startDate?: string;
  endDate?: string;
  materialId?: number;
  tenantId: number;
}) {
  const [inventoryTrend, turnoverAnalysis, expiringMaterials] = await Promise.all([
    getInventoryTrend(params),
    getInventoryTurnoverAnalysis(params),
    getExpiringMaterials(params.tenantId),
  ]);

  return {
    inventoryTrend,
    turnoverAnalysis,
    expiringMaterials
  };
}

// ═══════════════════════════════════════════════════════════════
// 재고 부족 예측 및 발주 제안
// ═══════════════════════════════════════════════════════════════

/** 단일 원재료 재고 부족 예측 (일평균 사용량 기반) */
export async function predictInventoryShortage(params: {
  materialId: number;
  days: number; // 예측 기간 (일)
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  // 1. 과거 30일간 재고 거래 내역 조회
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const transactions = await db
    .select({
      createdAt: hInventoryTransactions.createdAt,
      quantity: hInventoryTransactions.quantity,
      transactionType: hInventoryTransactions.transactionType
    })
    .from(hInventoryTransactions)
    .innerJoin(hInventoryLots, eq(hInventoryTransactions.lotId, hInventoryLots.id))
    .where(
      and(
        eq(hInventoryLots.materialId, params.materialId),
        sql`${hInventoryTransactions.createdAt} >= ${formatLocalDate(thirtyDaysAgo)}`,
        params.tenantId ? eq(hInventoryTransactions.tenantId, params.tenantId) : undefined
      )
    )
    .orderBy(hInventoryTransactions.createdAt);
  
  // 2. 일평균 사용량 계산 (사용 거래만)
  const usageTransactions = transactions.filter(t => t.transactionType === "usage");
  const totalUsage = usageTransactions.reduce((sum, t) => sum + Math.abs(Number(t.quantity)), 0);
  const dailyAverageUsage = usageTransactions.length > 0 ? totalUsage / 30 : 0;
  
  // 3. 현재 재고 조회 (availableQuantity 사용 - 현황 탭과 동일한 계산)
  const currentStock = await db
    .select({
      totalQuantity: sql<number>`COALESCE(SUM(${hInventoryLots.availableQuantity}), 0)`
    })
    .from(hInventoryLots)
    .where(
      and(
        eq(hInventoryLots.materialId, params.materialId),
        sql`${hInventoryLots.status} = 'available'`,
        params.tenantId ? eq(hInventoryLots.tenantId, params.tenantId) : undefined
      )
    );
  
  const currentQuantity = Number(currentStock[0]?.totalQuantity || 0);
  
  // 4. 예측: 재고 부족 예상 일자 계산
  const daysUntilShortage = dailyAverageUsage > 0 ? Math.floor(currentQuantity / dailyAverageUsage) : 999;
  const shortageDate = new Date();
  shortageDate.setDate(shortageDate.getDate() + daysUntilShortage);
  
  // 5. 권장 발주량 계산 (예측 기간 동안 필요한 수량)
  const recommendedOrderQuantity = dailyAverageUsage * params.days;
  
  return {
    materialId: params.materialId,
    currentStock: currentQuantity,
    dailyAverageUsage: dailyAverageUsage,
    daysUntilShortage: daysUntilShortage,
    shortageDate: daysUntilShortage < 999 ? formatLocalDate(shortageDate) : null,
    recommendedOrderQuantity: Math.ceil(recommendedOrderQuantity),
    isUrgent: daysUntilShortage <= 7
  };
}

/**
 * 모든 원재료 재고 부족 예측
 */
export async function predictAllInventoryShortage(days: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  // 1. 모든 원재료 조회 (tenantId 필터 포함)
  const materials = await db
    .select({
      id: hMaterials.id,
      materialCode: hMaterials.materialCode,
      materialName: hMaterials.materialName,
      unit: hMaterials.unit
    })
    .from(hMaterials)
    .where(tenantId ? eq(hMaterials.tenantId, tenantId) : undefined);
  
  // 2. 각 원재료별로 재고 부족 예측
  const predictions = await Promise.all(
    materials.map(async (material) => {
      try {
        const prediction = await predictInventoryShortage({
          materialId: material.id,
          days,
          tenantId: tenantId!
        });
        return {
          ...prediction,
          materialCode: material.materialCode,
          materialName: material.materialName,
          unit: material.unit
        };
      } catch (error) {
        console.error(`Failed to predict shortage for material ${material.id}:`, error);
        return null;
      }
    })
  );
  
  // 3. null 제거 및 부족 예상 원재료만 필터링
  return predictions
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .filter((p) => p.daysUntilShortage < 999)
    .sort((a, b) => a.daysUntilShortage - b.daysUntilShortage);
}

/**
 * 자동 발주 제안 생성 (모든 원재료 대상)
 */
export async function generatePurchaseOrderSuggestions(params: {
  days: number; // 예측 기간 (일)
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  // 1. 모든 활성 원재료 조회 (tenantId 필터 포함)
  const conditions: any[] = [eq(hMaterials.isActive, 1)];
  if (params.tenantId) {
    conditions.push(eq(hMaterials.tenantId, params.tenantId));
  }
  const materials = await db
    .select({
      id: hMaterials.id,
      materialCode: hMaterials.materialCode,
      materialName: hMaterials.materialName,
      unit: hMaterials.unit,
      safetyStockLevel: hMaterials.safetyStockLevel
    })
    .from(hMaterials)
    .where(and(...conditions));
  
  // 2. 각 원재료별 재고 예측 분석 (현황과 동일한 재고값 사용)
  const suggestions = await Promise.all(
    materials.map(async (material: any) => {
      const prediction = await predictInventoryShortage({
        materialId: material.id,
        days: params.days,
        tenantId: params.tenantId
      });

      const safetyStock = Number(material.safetyStockLevel || 0);
      const leadTime = 7; // 기본 리드타임 7일

      // 안전 재고 미달 또는 리드타임 내 부족 예상 시 발주 필요
      const needsOrder =
        (safetyStock > 0 && prediction.currentStock < safetyStock) ||
        (prediction.daysUntilShortage <= leadTime && prediction.dailyAverageUsage > 0);

      // 우선순위: 긴급(재고 0 또는 7일 내 부족), 높음(안전재고 미달), 보통
      let priority: "urgent" | "high" | "normal" = "normal";
      if (prediction.currentStock <= 0 || (prediction.daysUntilShortage <= 7 && prediction.dailyAverageUsage > 0)) {
        priority = "urgent";
      } else if (safetyStock > 0 && prediction.currentStock < safetyStock) {
        priority = "high";
      }

      return {
        materialId: material.id,
        materialCode: material.materialCode,
        materialName: material.materialName,
        unit: material.unit,
        currentStock: prediction.currentStock,
        safetyStockLevel: safetyStock,
        dailyUsage: prediction.dailyAverageUsage,
        daysUntilShortage: prediction.daysUntilShortage,
        shortageDate: prediction.shortageDate,
        recommendedOrderQuantity: prediction.recommendedOrderQuantity,
        leadTimeDays: leadTime,
        priority,
        needsOrder,
        reason: prediction.currentStock <= 0
          ? "재고 없음"
          : safetyStock > 0 && prediction.currentStock < safetyStock
            ? "안전 재고 미달"
            : prediction.daysUntilShortage <= leadTime
              ? `${prediction.daysUntilShortage}일 내 재고 부족 예상`
              : "정상"
      };
    })
  );

  // 발주 필요 항목 우선, 그 다음 전체 원재료
  return suggestions.sort((a, b) => {
    // 발주 필요 항목 먼저
    if (a.needsOrder && !b.needsOrder) return -1;
    if (!a.needsOrder && b.needsOrder) return 1;
    // 같은 그룹 내에서는 우선순위 순서
    const priorityOrder = { urgent: 0, high: 1, normal: 2 };
    return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
  });
}


/**
 * 모든 원재료 재고 부족 예측 (UI용)
 */
export async function predictAllMaterialsShortage(params: {
  days: number; // 예측 기간 (일)
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  // 1. 모든 활성 원재료 조회 (tenantId 필터 포함)
  const conditions: any[] = [eq(hMaterials.isActive, 1)];
  if (params.tenantId) {
    conditions.push(eq(hMaterials.tenantId, params.tenantId));
  }
  const materials = await db
    .select({
      id: hMaterials.id,
      materialCode: hMaterials.materialCode,
      materialName: hMaterials.materialName,
      unit: hMaterials.unit
    })
    .from(hMaterials)
    .where(and(...conditions));
  
  // 2. 각 원재료별 재고 예측
  const predictions = await Promise.all(
    materials.map(async (material: any) => {
      const prediction = await predictInventoryShortage({
        materialId: material.id,
        days: params.days,
        tenantId: params.tenantId
      });
      
      // 예측 기간 내 부족이 예상되는 경우만 반환
      if (prediction.daysUntilShortage > params.days) {
        return null;
      }
      
      return {
        materialId: material.id,
        materialCode: material.materialCode,
        materialName: material.materialName,
        unit: material.unit,
        currentStock: prediction.currentStock,
        avgDailyUsage: prediction.dailyAverageUsage,
        predictedShortageDate: prediction.shortageDate,
        daysUntilShortage: prediction.daysUntilShortage
      };
    })
  );
  
  return predictions
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => a.daysUntilShortage - b.daysUntilShortage);
}

/**
 * 배치별 원가 분석
 */
export async function getBatchCostAnalysis(params: {
  startDate?: string;
  endDate?: string;
  siteId?: number;
  productId?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  // 기본값 설정 (최근 30일)
  const endDate = params.endDate || todayKST();
  const startDate = params.startDate || toKSTDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  
  // 1. 기간 내 완료된 배치 조회
  const conditions = [
    sql`${hBatches.startTime} >= ${startDate}`,
    sql`${hBatches.endTime} <= ${endDate}`,
    eq(hBatches.status, "completed")
  ];
  if (params.tenantId) {
    conditions.push(eq(hBatches.tenantId, params.tenantId));
  }
  const batches = await db
    .select({
      id: hBatches.id,
      batchCode: hBatches.batchCode,
      productId: hBatches.productId,
      productName: hProductsV2.productName,
      plannedQuantity: hBatches.plannedQuantity,
      actualQuantity: hBatches.actualQuantity,
      startTime: hBatches.startTime,
      endTime: hBatches.endTime,
      plannedCost: hBatches.plannedCost,
      actualCost: hBatches.actualCost
    })
    .from(hBatches)
    .leftJoin(hProductsV2, eq(hBatches.productId, hProductsV2.id))
    .where(and(...conditions))
    .orderBy(hBatches.startTime);
  
  // 2. 각 배치별 원재료 비용 계산
  const batchCosts = await Promise.all(
    batches.map(async (batch: any) => {
      // 배치에 사용된 원재료 거래 내역 조회 (referenceType = 'batch', referenceId = batchId)
      const transactions = await db
        .select({
          quantity: hInventoryTransactions.quantity,
          materialId: hInventoryLots.materialId
        })
        .from(hInventoryTransactions)
        .leftJoin(hInventoryLots, eq(hInventoryTransactions.lotId, hInventoryLots.id))
        .where(
          and(
            eq(hInventoryTransactions.referenceType, "batch"),
            eq(hInventoryTransactions.referenceId, batch.id),
            eq(hInventoryTransactions.transactionType, "usage")
          )
        );
      
      // 원가 계산 (간소화: 수량만 합산)
      const totalQuantity = transactions.reduce(
        (sum: number, t: any) => sum + Math.abs(Number(t.quantity) || 0),
        0
      );
      
      // TODO: 실제 원가 계산은 원재료 단가 정보가 필요함
      const materialCost = totalQuantity * 100; // 임시 단가 100원 사용
      
      // 생산 시간 계산 (시간 단위)
      const productionTime = batch.startTime && batch.endTime
        ? (new Date(batch.endTime).getTime() - new Date(batch.startTime).getTime()) / (1000 * 60 * 60)
        : 0;
      
      // 단위당 원가 계산
      const unitCost = batch.actualQuantity > 0
        ? materialCost / batch.actualQuantity
        : 0;
      
      return {
        batchId: batch.id,
        batchCode: batch.batchCode,
    dayBatchGroup: batch.dayBatchGroup || null,
    batchOrder: batch.batchOrder ?? null,
        productName: batch.productName,
        plannedQuantity: batch.plannedQuantity,
        actualQuantity: batch.actualQuantity,
        plannedCost: Number(batch.plannedCost || 0),
        actualCost: Number(batch.actualCost || 0),
        materialCost: Number(materialCost.toFixed(2)),
        unitCost: Number(unitCost.toFixed(2)),
        productionTime: Number(productionTime.toFixed(2))
      };
    })
  );
  
  return batchCosts;
}
