/**
 * 수익성 예측 + 이력
 */
// ═══════════════════════════════════════════════════════════════
// costAnalysis.ts - 원가 분석 DB 함수
// 배치 원가, 수익성, 재고 회전율, 단가 이력,
// 수익성 예측(지수 평활법), 재고 소진 예측, 발주 알림
// ═══════════════════════════════════════════════════════════════
import { getDb } from "../connection";
import { eq, and, or, lte, gte, gt, desc, asc, sql, lt, inArray, count, isNotNull, sum } from "drizzle-orm";
import { toKSTDate, todayKST, formatLocalDate } from "../../utils/timezone";
import { createNotification } from "../system/notificationFunctions";

import {
  hBatches,
  hBatchInputs,
  hMaterials,
  hInventoryLots,
  hInventoryTransactions,
  hProductsV2,
  hMaterialPriceHistory,
} from "../../../drizzle/schema";

// ═══════════════════════════════════════════════════════════════
// 배치 원가 계산
// ═══════════════════════════════════════════════════════════════

/** 정제수(purified water) 여부 판별 - 가격/재고 계산에서 제외 대상 */
function isWaterMaterial(materialName: string | null | undefined): boolean {
  if (!materialName) return false;
  const name = materialName.toLowerCase();
  return name.includes("정제수") || name.includes("purified water");
}

/**
 * 배치별 원재료 투입 비용 계산
 * 정제수는 투입량 표시는 하되 가격 계산에서 제외
 */

export async function saveProfitabilityForecast(data: {
  targetMonth: string;
  predictedRevenue: number;
  predictedCost: number;
  predictedProfitMargin: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const { hProfitabilityForecasts } = await import("../../../drizzle/schema.js");
  
  await db.insert(hProfitabilityForecasts).values({
    forecastDate: new Date(),
    targetMonth: data.targetMonth,
    predictedRevenue: data.predictedRevenue.toString(),
    predictedCost: data.predictedCost.toString(),
    predictedProfitMargin: data.predictedProfitMargin.toString()
  } as any);
  
  return { success: true };
}

// 과거 예측값 조회 (실제값과 비교)
export async function getProfitabilityForecastHistory(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hProfitabilityForecasts } = await import("../../../drizzle/schema.js");
  const { desc, eq: drizzleEq } = await import("drizzle-orm");

  let query = db
    .select()
    .from(hProfitabilityForecasts);

  if (tenantId) {
    query = query.where(drizzleEq(hProfitabilityForecasts.tenantId, tenantId)) as any;
  }

  const forecasts = await query
    .orderBy(desc(hProfitabilityForecasts.targetMonth))
    .limit(12); // 최근 12개월
  
  return forecasts.map(f => ({
    targetMonth: f.targetMonth,
    predictedRevenue: parseFloat(f.predictedRevenue),
    predictedCost: parseFloat(f.predictedCost),
    predictedProfitMargin: parseFloat(f.predictedProfitMargin),
    actualRevenue: f.actualRevenue ? parseFloat(f.actualRevenue) : null,
    actualCost: f.actualCost ? parseFloat(f.actualCost) : null,
    actualProfitMargin: f.actualProfitMargin ? parseFloat(f.actualProfitMargin) : null,
    forecastDate: f.forecastDate
  }));
}

// 실제값 업데이트 (월 마감 후)
export async function updateActualProfitability(data: {
  targetMonth: string;
  actualRevenue: number;
  actualCost: number;
  actualProfitMargin: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const { hProfitabilityForecasts } = await import("../../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");
  
  await db
    .update(hProfitabilityForecasts)
    .set({
      actualRevenue: data.actualRevenue.toString(),
      actualCost: data.actualCost.toString(),
      actualProfitMargin: data.actualProfitMargin.toString()
    })
    .where(eq(hProfitabilityForecasts.targetMonth, data.targetMonth));
  
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════
// 재고 소진 예측 및 발주 알림
// ═══════════════════════════════════════════════════════════════

/**
 * 재고 소비 패턴 분석 (과거 30일 기준) — tenant 격리 강제
 */
export async function getInventoryConsumptionPattern(materialId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { sql } = await import("drizzle-orm");

  // ★ db.execute(sql) 는 [rows, fields] 튜플 반환 — [0] 으로 rows 추출 필수
  // 과거 30일간의 재고 변화 데이터 조회 (tenant 격리)
  const consumptionResult: any = await db.execute(sql`
    SELECT
      DATE(created_at) as date,
      SUM(CASE WHEN transaction_type = 'outbound' THEN ABS(quantity) ELSE 0 END) as dailyConsumption
    FROM h_inventory_transactions
    WHERE tenant_id = ${tenantId}
      AND lot_id IN (SELECT id FROM h_inventory_lots WHERE material_id = ${materialId} AND tenant_id = ${tenantId})
      AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `);
  const consumptionData = ((consumptionResult as any)?.[0] ?? []) as any[];

  const consumptions = consumptionData.map((row: any) => Number(row.dailyConsumption || 0));
  
  if (consumptions.length === 0) {
    return { averageDailyConsumption: 0, trend: 0 };
  }
  
  // 평균 일일 소비량 계산
  const averageDailyConsumption = consumptions.reduce((a, b) => a + b, 0) / consumptions.length;
  
  // 트렌드 계산 (최근 7일 vs 이전 23일)
  const recent7Days = consumptions.slice(0, 7);
  const previous23Days = consumptions.slice(7);
  
  const recent7DaysAvg = recent7Days.length > 0 
    ? recent7Days.reduce((a, b) => a + b, 0) / recent7Days.length 
    : 0;
  const previous23DaysAvg = previous23Days.length > 0 
    ? previous23Days.reduce((a, b) => a + b, 0) / previous23Days.length 
    : 0;
  
  const trend = previous23DaysAvg > 0 
    ? ((recent7DaysAvg - previous23DaysAvg) / previous23DaysAvg) * 100 
    : 0;
  
  return { averageDailyConsumption, trend };
}

/**
 * 재고 소진 예측
 */
export async function predictInventoryDepletion(materialId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { sql } = await import("drizzle-orm");

  // 현재 재고 수량 조회 — tenant 격리
  const currentStockRaw = await db.execute(sql`
    SELECT
      COALESCE(inv.available_quantity, 0) as currentStock,
      COALESCE(mat.safety_stock_level, 0) as safetyStock,
      COALESCE(inv.reorder_point, inv.min_stock_level, 0) as reorderPoint
    FROM h_materials mat
    LEFT JOIN h_inventory inv ON inv.material_id = mat.id AND inv.tenant_id = ${tenantId}
    WHERE mat.id = ${materialId} AND mat.tenant_id = ${tenantId}
    LIMIT 1
  `);

  if ((currentStockRaw as any[]).length === 0) {
    throw new Error("Material not found");
  }

  const row = currentStockRaw[0] as any;
  const currentStock = Number(row.currentStock || 0);
  const safetyStock = Number(row.safetyStock || 0);
  const reorderPoint = Number(row.reorderPoint || 0);

  // 소비 패턴 분석
  const { averageDailyConsumption, trend } = await getInventoryConsumptionPattern(materialId, tenantId);
  
  if (averageDailyConsumption === 0) {
    return {
      currentStock,
      safetyStock,
      reorderPoint,
      averageDailyConsumption: 0,
      predictedDepletionDays: null,
      shouldReorder: false,
      urgencyLevel: "normal"
    };
  }
  
  // 트렌드를 반영한 예상 일일 소비량 계산
  const adjustedDailyConsumption = averageDailyConsumption * (1 + trend / 100);
  
  // 예상 소진 일수 계산
  const predictedDepletionDays = Math.floor(currentStock / adjustedDailyConsumption);
  
  // 발주 필요 여부 판단
  const shouldReorder = currentStock <= reorderPoint;
  
  // 긴급도 판단
  let urgencyLevel = "normal";
  if (currentStock <= safetyStock) {
    urgencyLevel = "urgent";
  } else if (currentStock <= reorderPoint) {
    urgencyLevel = "high";
  } else if (predictedDepletionDays <= 7) {
    urgencyLevel = "medium";
  }
  
  return {
    currentStock,
    safetyStock,
    reorderPoint,
    averageDailyConsumption: adjustedDailyConsumption,
    predictedDepletionDays,
    shouldReorder,
    urgencyLevel
  };
}

/**
 * 재고 예측 기반 자동 발주 알림 생성 — 테넌트별 격리
 *
 * 2026-05-04: cross-tenant 누출 버그 수정 (Tool 9 발견).
 *   - 이전: 모든 테넌트의 h_materials / users 를 한꺼번에 순회하면서 tenantId=1 하드코딩 으로 알림 INSERT
 *   - 현재: tenants 테이블 전체 루프 → 각 테넌트의 materials / users 만 순회 → 해당 테넌트 사용자에게만 알림
 */
export async function checkAndCreateReorderAlerts() {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { sql } = await import("drizzle-orm");

  // 활성 테넌트 목록
  const tenantsRaw: any = await db.execute(sql`SELECT id FROM tenants`);
  const tenantsList = ((tenantsRaw as any)?.[0] ?? tenantsRaw) as any[];

  let alertCount = 0;

  for (const tenant of tenantsList) {
    const tenantId = Number(tenant.id);
    if (!tenantId) continue;

    try {
      // 해당 테넌트의 활성 원재료
      const materialsRaw: any = await db.execute(sql`
        SELECT id, material_name
        FROM h_materials
        WHERE is_active = 1 AND tenant_id = ${tenantId}
      `);
      const materials = ((materialsRaw as any)?.[0] ?? materialsRaw) as any[];

      // 해당 테넌트의 사용자
      const usersRaw: any = await db.execute(sql`
        SELECT id FROM users WHERE tenant_id = ${tenantId}
      `);
      const usersList = ((usersRaw as any)?.[0] ?? usersRaw) as any[];

      if (materials.length === 0 || usersList.length === 0) continue;

      for (const material of materials) {
        try {
          const materialId = material.id;
          const materialName = material.material_name;

          if (!materialId) {
            console.error("Material ID is undefined:", material);
            continue;
          }

          const prediction = await predictInventoryDepletion(materialId, tenantId);

          if (!prediction.shouldReorder) continue;

          // 중복 알림 방지 (24시간 이내) — 테넌트 격리
          const existingAlertsRaw: any = await db.execute(sql`
            SELECT id
            FROM h_notifications
            WHERE tenant_id = ${tenantId}
              AND notification_type = 'reorder'
              AND JSON_EXTRACT(metadata, '$.materialId') = ${materialId}
              AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          `);
          const existingAlerts = ((existingAlertsRaw as any)?.[0] ?? existingAlertsRaw) as any[];

          if (existingAlerts.length > 0) continue;

          for (const user of usersList) {
            await createNotification({
              tenantId,
              userId: user.id,
              notificationType: "reorder",
              title: `재고 발주 필요: ${materialName}`,
              message: `현재 재고: ${prediction.currentStock}, 안전 재고: ${prediction.safetyStock}, 예상 소진: ${prediction.predictedDepletionDays}일 후`,
              priority:
                prediction.urgencyLevel === "urgent"
                  ? "urgent"
                  : prediction.urgencyLevel === "high"
                  ? "high"
                  : "medium",
              actionUrl: `/materials?materialId=${materialId}`,
              metadata: JSON.stringify({
                materialId,
                materialName,
                currentStock: prediction.currentStock,
                predictedDepletionDays: prediction.predictedDepletionDays,
              }),
            });
          }

          alertCount++;
        } catch (error) {
          console.error(`재고 예측 실패 (tenantId: ${tenantId}, materialId: ${material?.id}):`, error);
        }
      }
    } catch (error) {
      console.error(`테넌트별 발주 알림 실패 (tenantId: ${tenantId}):`, error);
    }
  }

  return { alertCount };
}
