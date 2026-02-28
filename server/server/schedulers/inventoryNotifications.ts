import { getDb } from "../db";
import { hInventoryLots, hMaterials, hNotifications, tenants } from "../../drizzle/schema";
import { and, eq, lt, lte, sql } from "drizzle-orm";

/**
 * 유통기한 임박 알림 체크 (매일 오전 9시 실행)
 * [보안 수정] 테넌트별 격리 처리 적용
 */
export async function checkExpiryReminders() {
  const db = await getDb();
  if (!db) {
    console.error("[Inventory Notifications] Database connection failed");
    return;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  try {
    // [보안] 활성 테넌트 목록 조회
    const activeTenants = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.status, "active"));

    for (const tenant of activeTenants) {
      const tenantId = tenant.id;

      // 해당 테넌트의 원재료 expiryWarningDays 설정값 조회
      const materials = await db
        .select()
        .from(hMaterials)
        .where(eq(hMaterials.tenantId, tenantId));

      if (materials.length === 0) continue;

      const maxWarningDays = Math.max(...materials.map(m => m.expiryWarningDays || 7));
      const maxWarningDate = new Date(today);
      maxWarningDate.setDate(maxWarningDate.getDate() + maxWarningDays);

      // 유통기한이 가장 긴 expiryWarningDays 이내인 LOT 조회 (테넌트별)
      const expiringLots = await db
        .select({
          lotId: hInventoryLots.id,
          lotNumber: hInventoryLots.lotNumber,
          materialId: hInventoryLots.materialId,
          materialName: hMaterials.materialName,
          expiryDate: hInventoryLots.expiryDate,
          quantity: hInventoryLots.quantity,
          expiryWarningDays: hMaterials.expiryWarningDays,
        })
        .from(hInventoryLots)
        .leftJoin(hMaterials, eq(hInventoryLots.materialId, hMaterials.id))
        .where(
          and(
            eq(hInventoryLots.tenantId, tenantId),
            lte(hInventoryLots.expiryDate, maxWarningDate),
            eq(hInventoryLots.status, "available")
          )
        );

      console.log(`[Inventory Notifications] [tenant:${tenantId}] Found ${expiringLots.length} lots expiring within warning period`);

      for (const lot of expiringLots) {
        if (!lot.expiryDate) continue;

        const expiryDate = new Date(lot.expiryDate);
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const warningDays = lot.expiryWarningDays || 7;

        if (daysUntilExpiry > warningDays) continue;

        let notificationType: "expiry_warning_7d" | "expiry_warning_3d" | "expiry_urgent";
        let title: string;
        let content: string;

        if (daysUntilExpiry <= 0) {
          notificationType = "expiry_urgent";
          title = `[긴급] 유통기한 초과: ${lot.materialName}`;
          content = `LOT ${lot.lotNumber}의 유통기한이 초과되었습니다. 즉시 폐기 처리하세요. (수량: ${lot.quantity})`;
        } else if (daysUntilExpiry <= 3) {
          notificationType = "expiry_warning_3d";
          title = `[경고] 유통기한 임박: ${lot.materialName}`;
          content = `LOT ${lot.lotNumber}의 유통기한이 ${daysUntilExpiry}일 남았습니다. 우선 사용하세요. (수량: ${lot.quantity})`;
        } else {
          notificationType = "expiry_warning_7d";
          title = `유통기한 알림: ${lot.materialName}`;
          content = `LOT ${lot.lotNumber}의 유통기한이 ${daysUntilExpiry}일 남았습니다. (수량: ${lot.quantity})`;
        }

        // 중복 알림 방지: 오늘 이미 같은 LOT에 대한 알림이 있는지 확인 (테넌트별)
        const existingNotifications = await db
          .select()
          .from(hNotifications)
          .where(
            and(
              eq(hNotifications.tenantId, tenantId),
              eq(hNotifications.notificationType, notificationType),
              sql`${hNotifications.message} LIKE ${`%LOT ${lot.lotNumber}%`}`,
              sql`DATE(${hNotifications.createdAt}) = CURDATE()`
            )
          )
          .limit(1);

        if (existingNotifications.length > 0) {
          continue;
        }

        // 알림 생성 (tenantId 포함)
        await db.insert(hNotifications).values({
          tenantId,
          userId: 0, // 전체 알림
          notificationType,
          title,
          message: content,
          isRead: 0,
          createdAt: now,
        });

        console.log(`[Inventory Notifications] [tenant:${tenantId}] Created ${notificationType} notification for LOT ${lot.lotNumber}`);
      }
    }
  } catch (error) {
    console.error("[Inventory Notifications] Error checking expiry reminders:", error);
  }
}

/**
 * 재고 부족 알림 체크 (매일 오전 9시 실행)
 * [보안 수정] 테넌트별 격리 처리 적용
 */
export async function checkLowStockAlerts() {
  const db = await getDb();
  if (!db) {
    console.error("[Inventory Notifications] Database connection failed");
    return;
  }

  const now = new Date();

  try {
    // [보안] 활성 테넌트 목록 조회
    const activeTenants = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.status, "active"));

    for (const tenant of activeTenants) {
      const tenantId = tenant.id;

      // 원재료별 현재 재고 수량 집계 및 안전 재고 수준 비교 (테넌트별)
      const lowStockMaterials = await db
        .select({
          materialId: hMaterials.id,
          materialName: hMaterials.materialName,
          safetyStockLevel: hMaterials.safetyStockLevel,
          currentStock: sql<number>`COALESCE(SUM(CASE WHEN ${hInventoryLots.status} = 'available' THEN ${hInventoryLots.quantity} ELSE 0 END), 0)`,
        })
        .from(hMaterials)
        .leftJoin(hInventoryLots, eq(hMaterials.id, hInventoryLots.materialId))
        .where(eq(hMaterials.tenantId, tenantId))
        .groupBy(hMaterials.id, hMaterials.materialName, hMaterials.safetyStockLevel)
        .having(sql`COALESCE(SUM(CASE WHEN ${hInventoryLots.status} = 'available' THEN ${hInventoryLots.quantity} ELSE 0 END), 0) < ${hMaterials.safetyStockLevel}`);

      console.log(`[Inventory Notifications] [tenant:${tenantId}] Found ${lowStockMaterials.length} materials below safety stock level`);

      for (const material of lowStockMaterials) {
        const title = `[경고] 재고 부족: ${material.materialName}`;
        const content = `현재 재고(${material.currentStock})가 안전 재고 수준(${material.safetyStockLevel}) 이하입니다. 발주를 검토하세요.`;

        // 중복 알림 방지 (테넌트별)
        const existingNotifications = await db
          .select()
          .from(hNotifications)
          .where(
            and(
              eq(hNotifications.tenantId, tenantId),
              eq(hNotifications.notificationType, "low_stock"),
              sql`${hNotifications.message} LIKE ${`%${material.materialName}%`}`,
              sql`DATE(${hNotifications.createdAt}) = CURDATE()`
            )
          )
          .limit(1);

        if (existingNotifications.length > 0) {
          continue;
        }

        // 알림 생성 (tenantId 포함)
        await db.insert(hNotifications).values({
          tenantId,
          userId: 0, // 전체 알림
          notificationType: "low_stock",
          title,
          message: content,
          isRead: 0,
          createdAt: now,
        });

        console.log(`[Inventory Notifications] [tenant:${tenantId}] Created low stock notification for ${material.materialName}`);
      }
    }
  } catch (error) {
    console.error("[Inventory Notifications] Error checking low stock alerts:", error);
  }
}
