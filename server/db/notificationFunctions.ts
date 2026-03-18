import { eq, and, lte, gte, desc, sql, inArray } from "drizzle-orm";
import { getDb } from "./connection";
import { hNotifications, hInventoryLots, hMaterials, hInspectionRecords, users } from "../../drizzle/schema";

// ============================================================================
// 알림 관리
// ============================================================================

export async function createNotification(data: {
  tenantId: number;
  userId?: number;
  notificationType: string;
  title: string;
  message: string;
  referenceId?: number;
  referenceType?: string;
  actionUrl?: string;
  priority?: string;
  metadata?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [notification] = await db.insert(hNotifications).values({
    ...data,
    tenantId: data.tenantId,
    userId: data.userId || 1, // 기본값: 1 (시스템 알림)
    priority: data.priority as "low" | "medium" | "high" | "urgent" | undefined
  });
  return notification;
}

export async function getNotifications(userId?: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [];
  if (userId) conditions.push(eq(hNotifications.userId, userId));
  if (tenantId) conditions.push(eq(hNotifications.tenantId, tenantId));
  if (conditions.length > 0) {
    return await db
      .select()
      .from(hNotifications)
      .where(and(...conditions))
      .orderBy(desc(hNotifications.createdAt));
  }
  return await db
    .select()
    .from(hNotifications)
    .orderBy(desc(hNotifications.createdAt));
}

export async function markNotificationAsRead(notificationId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [eq(hNotifications.id, notificationId)];
  if (tenantId) conditions.push(eq(hNotifications.tenantId, tenantId));
  await db
    .update(hNotifications)
    .set({ isRead: 1, readAt: new Date() })
    .where(and(...conditions));
}

export async function deleteNotification(notificationId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [eq(hNotifications.id, notificationId)];
  if (tenantId) conditions.push(eq(hNotifications.tenantId, tenantId));
  await db
    .delete(hNotifications)
    .where(and(...conditions));
}

export async function checkAndCreateExpiryNotifications(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  const expiringLots = await db
    .select({
      lot: hInventoryLots,
      material: hMaterials
    })
    .from(hInventoryLots)
    .leftJoin(hMaterials, eq(hInventoryLots.materialId, hMaterials.id))
    .where(
      and(
        lte(hInventoryLots.expiryDate, sevenDaysFromNow),
        eq(hInventoryLots.status, "available"),
        ...(tenantId ? [eq((hInventoryLots as any).tenantId, tenantId)] : [])
      )
    );

  for (const { lot, material } of expiringLots) {
    if (!lot || !material || !lot.expiryDate) continue;

    const daysUntilExpiry = Math.ceil(
      (new Date(lot.expiryDate).getTime() - new Date().getTime()) /
        (1000 * 60 * 60 * 24)
    );

    await createNotification({
      tenantId: (lot as any).tenantId || 1,
      notificationType: "inventory_expiry",
      title: `재고 유통기한 임박`,
      message: `${material.materialName} (LOT: ${lot.lotNumber}) 유통기한이 ${daysUntilExpiry}일 남았습니다.`,
      referenceId: lot.id,
      referenceType: "inventory_lot",
      actionUrl: `/inventory?lotId=${lot.id}`
    });
  }

  return expiringLots.length;
}

// 모든 알림 읽음 처리
export async function markAllNotificationsAsRead(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hNotifications } = await import("../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");

  await db
    .update(hNotifications)
    .set({ isRead: 1 })
    .where(eq(hNotifications.userId, userId));

  return { success: true };
}

// 모든 알림 삭제
export async function deleteAllNotifications(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hNotifications } = await import("../../drizzle/schema.js");
  const { eq } = await import("drizzle-orm");

  await db
    .delete(hNotifications)
    .where(eq(hNotifications.userId, userId));

  return { success: true };
}


// 검사 결과 부적합 발생 시 알림 생성
export async function checkAndCreateInspectionFailureAlerts() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { hInspectionRecords, hNotifications, users } = await import("../../drizzle/schema.js");
  const { eq, and, gte } = await import("drizzle-orm");

  // 최근 24시간 이내의 부적합 검사 결과 조회
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const failedInspections = await db
    .select({
      id: hInspectionRecords.id,
      inspectionType: hInspectionRecords.inspectionType,
      siteId: hInspectionRecords.siteId,
      result: hInspectionRecords.result,
      findings: hInspectionRecords.findings,
      inspectionDate: hInspectionRecords.inspectionDate
    })
    .from(hInspectionRecords)
    .where(
      and(
        eq(hInspectionRecords.result, "fail"),
        gte(hInspectionRecords.createdAt, oneDayAgo)
      )
    );

  let createdCount = 0;

  for (const inspection of failedInspections) {
    // 이미 알림이 생성되었는지 확인 (중복 방지)
    const existingAlert = await db
      .select()
      .from(hNotifications)
      .where(
        and(
          eq(hNotifications.title, `검사 부적합: 사이트 ID ${inspection.siteId}`),
          gte(hNotifications.createdAt, oneDayAgo)
        )
      )
      .limit(1);

    if (existingAlert.length > 0) continue;

    // 관리자 사용자 조회
    const adminUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"));

    // 각 관리자에게 알림 생성
    for (const admin of adminUsers) {
      await db.insert(hNotifications).values({
        userId: admin.id,
        title: `검사 부적합: 사이트 ID ${inspection.siteId}`,
        message: `${inspection.inspectionType || "검사"}에서 부적합 판정이 발생했습니다. ${inspection.findings ? `소견: ${inspection.findings}` : ""}`,
        notificationType: "error",
        priority: "urgent",
        actionUrl: `/inspections?recordId=${inspection.id}`,
        isRead: 0
      } as any);
      createdCount++;
    }
  }

  return { success: true, createdCount };
}

/**
 * 알림 조치 완료 처리
 */
export async function markNotificationAsResolved(notificationId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const conditions = [eq(hNotifications.id, notificationId)];
  if (tenantId) conditions.push(eq(hNotifications.tenantId, tenantId));

  await db
    .update(hNotifications)
    .set({ isResolved: 1, resolvedAt: new Date() })
    .where(and(...conditions));
}

/**
 * 알림 통계 조회
 */
export async function getNotificationStatistics(startDate?: string, endDate?: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const { sql } = await import("drizzle-orm");

  let dateFilter = sql``;
  if (startDate && endDate) {
    dateFilter = sql` AND createdAt >= ${startDate} AND createdAt <= ${endDate}`;
  } else if (startDate) {
    dateFilter = sql` AND createdAt >= ${startDate}`;
  } else if (endDate) {
    dateFilter = sql` AND createdAt <= ${endDate}`;
  }

  const tenantFilter = tenantId ? sql` AND tenant_id = ${tenantId}` : sql``;

  // ★ 성능 개선: 6개 쿼리 → 3개로 통합
  // 1) 총 알림 + 미해결 + 평균해결시간 통합 조회
  const summaryRaw: any = await db.execute(sql`
    SELECT
      COUNT(*) as totalCount,
      SUM(CASE WHEN isResolved = 0 THEN 1 ELSE 0 END) as unresolvedCount,
      AVG(CASE WHEN isResolved = 1 AND resolvedAt IS NOT NULL
          THEN TIMESTAMPDIFF(HOUR, createdAt, resolvedAt) ELSE NULL END) as avgHours
    FROM ${hNotifications}
    WHERE 1=1${dateFilter}${tenantFilter}
  `);
  const summary = Array.isArray(summaryRaw) && summaryRaw[0] ? (Array.isArray(summaryRaw[0]) ? summaryRaw[0][0] : summaryRaw[0]) : {};
  const totalNotifications = Number(summary?.totalCount || 0);
  const unresolvedCount = Number(summary?.unresolvedCount || 0);
  const resolvedCount = totalNotifications - unresolvedCount;
  const overallAvgResolutionHours = Number(summary?.avgHours || 0);

  // 2) 타입별 빈도 + 해결시간 통합 조회
  const typeStatsRaw = await db.execute(sql`
    SELECT
      notificationType as type,
      COUNT(*) as count,
      AVG(CASE WHEN isResolved = 1 AND resolvedAt IS NOT NULL
          THEN TIMESTAMPDIFF(HOUR, createdAt, resolvedAt) ELSE NULL END) as avgHours
    FROM ${hNotifications}
    WHERE 1=1${dateFilter}${tenantFilter}
    GROUP BY notificationType
  `);
  const typeRows = Array.isArray(typeStatsRaw) && Array.isArray(typeStatsRaw[0]) ? typeStatsRaw[0] : typeStatsRaw;
  const typeDistribution = (typeRows as any[]).map((row: any) => ({
    name: row.type || "기타",
    count: Number(row.count)
  }));
  const avgResolutionTime = (typeRows as any[])
    .filter((row: any) => row.avgHours != null)
    .map((row: any) => ({
      type: row.type || "기타",
      avgHours: Number(row.avgHours || 0)
    }));

  // 3) 미해결 알림 추이
  let trendDateFilter = dateFilter;
  if (!startDate && !endDate) {
    trendDateFilter = sql` AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)`;
  }
  const unresolvedTrendRaw = await db.execute(sql`
    SELECT DATE(createdAt) as date, COUNT(*) as count
    FROM ${hNotifications}
    WHERE isResolved = 0${trendDateFilter}${tenantFilter}
    GROUP BY DATE(createdAt)
    ORDER BY date ASC
  `);
  const trendRows = Array.isArray(unresolvedTrendRaw) && Array.isArray(unresolvedTrendRaw[0]) ? unresolvedTrendRaw[0] : unresolvedTrendRaw;
  const unresolvedTrend = (trendRows as any[]).map((row: any) => ({
    date: row.date,
    count: Number(row.count)
  }));

  return {
    totalNotifications,
    unresolvedCount,
    resolvedCount,
    typeDistribution,
    avgResolutionTime,
    overallAvgResolutionHours,
    unresolvedTrend
  };
}

export async function getNotificationCountsByType(userId?: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions = [eq(hNotifications.isRead, 0)];
  if (userId) conditions.push(eq(hNotifications.userId, userId));
  if (tenantId) conditions.push(eq(hNotifications.tenantId, tenantId));
  const whereConditions = and(...conditions);
  const results = await db
    .select({
      notificationType: hNotifications.notificationType,
      count: sql<number>`count(*)`
    })
    .from(hNotifications)
    .where(whereConditions)
    .groupBy(hNotifications.notificationType);

  // 결과를 객체로 변환 { notificationType: count }
  const counts: Record<string, number> = {};
  for (const row of results) {
    if (row.notificationType) {
      counts[row.notificationType] = row.count;
    }
  }

  return counts;
}


/**
 * 선택한 알림 읽음 처리
 */
export async function markMultipleNotificationsAsRead(notificationIds: number[], tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");

  const { inArray, and: andOp, eq: eqOp } = await import("drizzle-orm");
  const { hNotifications } = await import("../../drizzle/schema.js");

  const conditions: any[] = [inArray(hNotifications.id, notificationIds)];
  if (tenantId) conditions.push(eqOp(hNotifications.tenantId, tenantId));

  await db
    .update(hNotifications)
    .set({ isRead: 1 })
    .where(andOp(...conditions));
}

/**
 * 선택한 알림 삭제
 */
export async function deleteMultipleNotifications(notificationIds: number[], tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스 연결 실패");

  const { inArray, and: andOp, eq: eqOp } = await import("drizzle-orm");
  const { hNotifications } = await import("../../drizzle/schema.js");

  const conditions: any[] = [inArray(hNotifications.id, notificationIds)];
  if (tenantId) conditions.push(eqOp(hNotifications.tenantId, tenantId));

  await db
    .delete(hNotifications)
    .where(andOp(...conditions));
}

// 읽은 알림 자동 삭제 (30일 경과)
export async function deleteOldReadNotifications(days: number = 30, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const conditions = [
    eq(hNotifications.isRead, 1),
    lte(hNotifications.createdAt, cutoffDate)
  ];
  if (tenantId) conditions.push(eq(hNotifications.tenantId, tenantId));

  const result = await db.delete(hNotifications)
    .where(and(...conditions));

  return { deletedCount: (result as any).rowsAffected || 0 };
}

// 특정 타입 알림 자동 아카이브
export async function archiveNotificationsByType(notificationType: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const conditions = [eq(hNotifications.notificationType, notificationType)];
  if (tenantId) conditions.push(eq(hNotifications.tenantId, tenantId));

  // 아카이브 기능은 isRead를 1로 설정하여 구현
  const result = await db.update(hNotifications)
    .set({ isRead: 1 })
    .where(and(...conditions));

  return { archivedCount: (result as any).rowsAffected || 0 };
}
