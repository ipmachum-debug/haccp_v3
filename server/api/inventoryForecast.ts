/**
 * 재고 예측 API
 * 사용량 패턴 분석 및 구매 추천 기능
 */

import { getDb } from "../db";
import { hInventoryTransactions, hMaterials, hInventory, hInventoryLots } from "../../drizzle/schema";
import { eq, and, gte, sql, desc } from "drizzle-orm";

/**
 * 사용량 패턴 분석
 * @param materialId 원재료 ID
 * @param days 분석 기간 (일)
 */
export async function calculateUsagePattern(materialId: number, days: number = 30) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // LOT 정보를 통해 출고 거래 내역 조회
  const transactions = await db
    .select({
      quantity: hInventoryTransactions.quantity,
      createdAt: hInventoryTransactions.createdAt,
    })
    .from(hInventoryTransactions)
    .innerJoin(hInventoryLots, eq(hInventoryTransactions.lotId, hInventoryLots.id))
    .where(
      and(
        eq(hInventoryLots.materialId, materialId),
        eq(hInventoryTransactions.transactionType, "usage"),
        gte(hInventoryTransactions.createdAt, startDate)
      )
    )
    .orderBy(desc(hInventoryTransactions.createdAt));

  if (transactions.length === 0) {
    return {
      dailyAverage: 0,
      weeklyAverage: 0,
      monthlyAverage: 0,
      totalUsage: 0,
      transactionCount: 0,
    };
  }

  // 총 사용량 계산
  const totalUsage = transactions.reduce((sum, t) => {
    const qty = typeof t.quantity === 'string' ? parseFloat(t.quantity) : t.quantity;
    return sum + Math.abs(qty);
  }, 0);

  // 일평균, 주평균, 월평균 계산
  const dailyAverage = totalUsage / days;
  const weeklyAverage = dailyAverage * 7;
  const monthlyAverage = dailyAverage * 30;

  return {
    dailyAverage: parseFloat(dailyAverage.toFixed(2)),
    weeklyAverage: parseFloat(weeklyAverage.toFixed(2)),
    monthlyAverage: parseFloat(monthlyAverage.toFixed(2)),
    totalUsage: parseFloat(totalUsage.toFixed(2)),
    transactionCount: transactions.length,
  };
}

/**
 * 재고 소진 예상 일자 계산
 * @param materialId 원재료 ID
 */
export async function predictStockout(materialId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 현재 재고 조회
  const inventory = await db
    .select({
      availableQuantity: hInventory.availableQuantity,
    })
    .from(hInventory)
    .where(eq(hInventory.materialId, materialId))
    .limit(1);

  if (inventory.length === 0) {
    return {
      daysUntilStockout: 0,
      stockoutDate: new Date(),
      currentStock: 0,
      isStockout: true,
    };
  }

  const currentStock = inventory[0].availableQuantity;
  const currentStockNum = typeof currentStock === 'string' ? parseFloat(currentStock) : currentStock;

  if (currentStockNum <= 0) {
    return {
      daysUntilStockout: 0,
      stockoutDate: new Date(),
      currentStock: currentStockNum,
      isStockout: true,
    };
  }

  // 사용량 패턴 조회 (최근 30일)
  const usagePattern = await calculateUsagePattern(materialId, 30);

  if (usagePattern.dailyAverage === 0) {
    return {
      daysUntilStockout: null,
      stockoutDate: null,
      currentStock: currentStockNum,
      isStockout: false,
    };
  }

  // 재고 소진 예상 일수 계산
  const daysUntilStockout = Math.floor(currentStockNum / usagePattern.dailyAverage);

  // 재고 소진 예상 날짜 계산
  const stockoutDate = new Date();
  stockoutDate.setDate(stockoutDate.getDate() + daysUntilStockout);

  return {
    daysUntilStockout,
    stockoutDate,
    currentStock: currentStockNum,
    isStockout: daysUntilStockout <= 0,
  };
}

/**
 * 구매 추천
 * @param materialId 원재료 ID
 */
export async function recommendPurchase(materialId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 원재료 정보 조회
  const material = await db
    .select({
      materialName: hMaterials.materialName,
      unit: hMaterials.unit,
      safetyStockLevel: hMaterials.safetyStockLevel,
    })
    .from(hMaterials)
    .where(eq(hMaterials.id, materialId))
    .limit(1);

  if (material.length === 0) {
    throw new Error("원재료를 찾을 수 없습니다.");
  }

  // 재고 소진 예상 정보 조회
  const stockoutInfo = await predictStockout(materialId);

  // 사용량 패턴 조회 (최근 30일)
  const usagePattern = await calculateUsagePattern(materialId, 30);

  // 안전 재고 수준
  const safetyStock = material[0].safetyStockLevel || 0;

  // 구매 추천 수량 계산 (30일 사용량 + 안전 재고 - 현재 재고)
  const safetyStockNum = typeof safetyStock === 'string' ? parseFloat(safetyStock) : safetyStock;
  const currentStockNum = typeof stockoutInfo.currentStock === 'string' ? parseFloat(stockoutInfo.currentStock) : stockoutInfo.currentStock;
  const recommendedQuantity = Math.max(
    0,
    usagePattern.monthlyAverage + safetyStockNum - currentStockNum
  );

  // 구매 우선순위 결정
  let priority: "high" | "medium" | "low" = "low";
  if (stockoutInfo.daysUntilStockout !== null && stockoutInfo.daysUntilStockout <= 7) {
    priority = "high";
  } else if (stockoutInfo.daysUntilStockout !== null && stockoutInfo.daysUntilStockout <= 14) {
    priority = "medium";
  }

  // 구매 추천 시점 (재고 소진 7일 전)
  let recommendedPurchaseDate: Date | null = null;
  if (stockoutInfo.stockoutDate) {
    recommendedPurchaseDate = new Date(stockoutInfo.stockoutDate);
    recommendedPurchaseDate.setDate(recommendedPurchaseDate.getDate() - 7);
  }

  return {
    materialId,
    materialName: material[0].materialName,
    unit: material[0].unit,
    currentStock: stockoutInfo.currentStock,
    safetyStock: safetyStockNum,
    recommendedQuantity: parseFloat(recommendedQuantity.toFixed(2)),
    recommendedPurchaseDate,
    priority,
    daysUntilStockout: stockoutInfo.daysUntilStockout,
    usagePattern,
  };
}

/**
 * 모든 원재료에 대한 구매 추천 목록 조회
 */
export async function getAllPurchaseRecommendations() {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 모든 원재료 조회
  const materials = await db
    .select({
      materialId: hMaterials.id,
    })
    .from(hMaterials);

  // 각 원재료에 대한 구매 추천 계산
  const recommendations = await Promise.all(
    materials.map(async (m) => {
      try {
        return await recommendPurchase(m.materialId);
      } catch (error) {
        console.error(`Failed to get recommendation for material ${m.materialId}:`, error);
        return null;
      }
    })
  );

  // null 제거 및 우선순위 순으로 정렬
  const validRecommendations = recommendations.filter((r) => r !== null);

  const priorityOrder = { high: 1, medium: 2, low: 3 };
  validRecommendations.sort((a, b) => {
    if (!a || !b) return 0;
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  return validRecommendations;
}

/**
 * 재고 부족 예상 감지 및 알림 생성
 */
export async function checkLowStockPrediction() {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const recommendations = await getAllPurchaseRecommendations();
  const notifications: Array<{
    materialId: number;
    materialName: string;
    priority: string;
    stockoutDate: Date | null;
    daysUntilStockout: number | null;
    recommendedQuantity: number;
  }> = [];

  for (const rec of recommendations) {
    // 우선순위가 높은 경우만 알림 생성
    if (rec.priority === "high" || rec.priority === "medium") {
      notifications.push({
        materialId: rec.materialId,
        materialName: rec.materialName,
        priority: rec.priority,
        stockoutDate: rec.recommendedPurchaseDate,
        daysUntilStockout: rec.daysUntilStockout,
        recommendedQuantity: rec.recommendedQuantity,
      });
    }
  }

  return notifications;
}

/**
 * 재고 부족 알림 생성
 */
export async function createLowStockNotifications() {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const notifications = await checkLowStockPrediction();
  const createdNotifications: Array<{
    materialId: number;
    materialName: string;
    message: string;
  }> = [];

  // hNotifications 테이블 import 필요
  const { hNotifications } = await import("../../drizzle/schema");

  for (const notif of notifications) {
    const message = `[재고 부족 예상] ${notif.materialName}: ${notif.daysUntilStockout}일 후 재고 소진 예상 (권장 발주량: ${notif.recommendedQuantity})`;
    
    // hNotifications 테이블에 알림 생성
    await db.insert(hNotifications).values({
      userId: 1, // 시스템 관리자 (TODO: 동적으로 변경)
      notificationType: "INVENTORY_LOW_STOCK",
      title: "재고 부족 예상 알림",
      message,
      priority: notif.priority === "high" ? "high" : "medium",
      isRead: 0,
      createdAt: new Date(),
    } as any);

    createdNotifications.push({
      materialId: notif.materialId,
      materialName: notif.materialName,
      message,
    });
  }

  return {
    count: createdNotifications.length,
    notifications: createdNotifications,
  };
}
