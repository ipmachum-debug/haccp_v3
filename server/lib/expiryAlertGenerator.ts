import { getDb } from "../db";
import { hStockAlerts, hInventoryLots } from "../../drizzle/schema/part2";
import { eq, and, lte, isNull } from "drizzle-orm";

/**
 * 소비기한 기반 알람 자동 생성
 * 
 * LOT 생성 시 소비기한이 있으면 자동으로 알람을 생성합니다.
 * - 만료 30일 전: "expiring_soon" 알람
 * - 만료일 당일: "expired" 알람 (스케줄러가 자동 생성)
 * 
 * @param lotId LOT ID
 * @param inventoryId 재고 ID
 * @param expiryDate 소비기한 (YYYY-MM-DD)
 * @param userId 생성자 ID
 * @param tenantId 테넌트 ID (테넌트 격리)
 */
export async function generateExpiryAlerts(
  lotId: number,
  inventoryId: number,
  expiryDate: string,
  userId: number,
  tenantId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  const expiryDateObj = new Date(expiryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 만료 30일 전 날짜 계산
  const thirtyDaysBeforeExpiry = new Date(expiryDateObj);
  thirtyDaysBeforeExpiry.setDate(thirtyDaysBeforeExpiry.getDate() - 30);

  // 1. 만료 임박 알람 생성 (만료 30일 전)
  if (expiryDateObj > today) {
    await db.insert(hStockAlerts).values({
      tenantId,
      inventoryId,
      lotId,
      alertType: "expiring_soon",
      severity: "warning",
      message: `소비기한이 30일 이내로 임박했습니다. (만료일: ${expiryDate})`,
      threshold: null,
      currentValue: null,
      scheduledDate: thirtyDaysBeforeExpiry.toISOString().split("T")[0],
      resolvedAt: null,
      resolvedBy: null,
      createdBy: userId
    } as any);

    console.log(`[ALERT] 소비기한 임박 알람 생성 (LOT: ${lotId}, 만료일: ${expiryDate})`);
  }

  // 2. 만료 알람은 스케줄러가 자동 생성 (만료일 당일)
  // 여기서는 생성하지 않고, 스케줄러가 매일 체크하여 생성
}

/**
 * 만료된 LOT 알람 자동 생성 (스케줄러용)
 * 
 * 매일 실행되는 스케줄러에서 호출하여 만료된 LOT에 대한 알람을 생성합니다.
 * @param tenantId 테넌트 ID (테넌트 격리)
 */
export async function generateExpiredAlerts(tenantId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  // 오늘 만료된 LOT 조회 (테넌트 격리)
  const expiredLots = await db
    .select()
    .from(hInventoryLots)
    .where(
      and(
        eq(hInventoryLots.tenantId, tenantId),
        eq(hInventoryLots.status, "active" as any) ,
        lte(hInventoryLots.expiryDate, todayStr as any) ,
        isNull(hInventoryLots.expiryDate)
      )
    );

  for (const lot of expiredLots) {
    // 이미 만료 알람이 있는지 확인 (테넌트 격리)
    const existingAlert = await db
      .select()
      .from(hStockAlerts)
      .where(
        and(
          eq(hStockAlerts.tenantId, tenantId),
          eq(hStockAlerts.lotId, lot.id),
          eq(hStockAlerts.alertType, "expired"),
          isNull(hStockAlerts.resolvedAt)
        )
      )
      .limit(1)
      .then((rows) => rows[0]);

    if (!existingAlert) {
      // 만료 알람 생성 (테넌트 격리)
      await db.insert(hStockAlerts).values({
        tenantId,
        inventoryId: lot.inventoryId,
        lotId: lot.id,
        alertType: "expired",
        severity: "critical",
        message: `소비기한이 만료되었습니다. (만료일: ${lot.expiryDate})`,
        threshold: null,
        currentValue: null,
        scheduledDate: todayStr,
        resolvedAt: null,
        resolvedBy: null,
        createdBy: 1, // 시스템 자동 생성
      } as any);

      console.log(`[ALERT] 소비기한 만료 알람 생성 (LOT: ${lot.id}, 만료일: ${lot.expiryDate})`);
    }
  }
}
