/**
 * 검사 기록 PDF 리포트 자동 생성 스케줄러
 * 월간/주간 검사 통계를 PDF로 자동 생성하여 관리자에게 알림
 * [보안 수정] 테넌트별 격리 처리 적용
 */

import { getDb } from "../db";
import { materialInspectionRecords, hygieneInspectionRecords, shippingInspectionRecords, hNotifications, users, tenants } from "../../drizzle/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";

import { formatLocalDate } from "../utils/timezone";

/**
 * 주간 검사 리포트 생성 및 알림
 */
export async function generateWeeklyInspectionReport() {
  const db = await getDb();
  if (!db) {
    console.error("[검사 리포트] DB 연결 실패");
    return { success: false };
  }

  try {
    // 지난 7일간의 데이터 조회
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const startDateStr = formatLocalDate(startDate);
    const endDateStr = formatLocalDate(endDate);

    // [보안] 활성 테넌트 목록 조회
    const activeTenants = await db
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.status, "active"));

    for (const tenant of activeTenants) {
      const tenantId = tenant.id;

      // 원재료 검사 통계 (테넌트별)
      const materialStats = await db
        .select({
          total: sql<number>`COUNT(*)`,
          completed: sql<number>`SUM(CASE WHEN ${materialInspectionRecords.status} = 'completed' THEN 1 ELSE 0 END)`,
          pending: sql<number>`SUM(CASE WHEN ${materialInspectionRecords.status} = 'pending' THEN 1 ELSE 0 END)`,
          rejected: sql<number>`SUM(CASE WHEN ${materialInspectionRecords.status} = 'rejected' THEN 1 ELSE 0 END)`,
        })
        .from(materialInspectionRecords)
        .where(
          and(
            eq(materialInspectionRecords.tenantId, tenantId),
            gte(materialInspectionRecords.inspectionDate, startDateStr),
            lte(materialInspectionRecords.inspectionDate, endDateStr)
          )
        );

      // 위생 점검 통계 (테넌트별)
      const hygieneStats = await db
        .select({
          total: sql<number>`COUNT(*)`,
          completed: sql<number>`SUM(CASE WHEN ${hygieneInspectionRecords.status} = 'completed' THEN 1 ELSE 0 END)`,
          pending: sql<number>`SUM(CASE WHEN ${hygieneInspectionRecords.status} = 'pending' THEN 1 ELSE 0 END)`,
          action_required: sql<number>`SUM(CASE WHEN ${hygieneInspectionRecords.status} = 'action_required' THEN 1 ELSE 0 END)`,
        })
        .from(hygieneInspectionRecords)
        .where(
          and(
            eq(hygieneInspectionRecords.tenantId, tenantId),
            gte(hygieneInspectionRecords.inspectionDate, startDateStr),
            lte(hygieneInspectionRecords.inspectionDate, endDateStr)
          )
        );

      // 출하 검사 통계 (테넌트별)
      const shippingStats = await db
        .select({
          total: sql<number>`COUNT(*)`,
          completed: sql<number>`SUM(CASE WHEN ${shippingInspectionRecords.status} = 'completed' THEN 1 ELSE 0 END)`,
          pending: sql<number>`SUM(CASE WHEN ${shippingInspectionRecords.status} = 'pending' THEN 1 ELSE 0 END)`,
          rejected: sql<number>`SUM(CASE WHEN ${shippingInspectionRecords.status} = 'rejected' THEN 1 ELSE 0 END)`,
        })
        .from(shippingInspectionRecords)
        .where(
          and(
            eq(shippingInspectionRecords.tenantId, tenantId),
            gte(shippingInspectionRecords.inspectionDate, startDateStr),
            lte(shippingInspectionRecords.inspectionDate, endDateStr)
          )
        );

      // 리포트 내용 생성
      const reportContent = `
주간 검사 리포트 (${startDateStr} ~ ${endDateStr}) [${tenant.name}]

【원재료 검사】
- 총 검사: ${materialStats[0]?.total || 0}건
- 완료: ${materialStats[0]?.completed || 0}건
- 대기: ${materialStats[0]?.pending || 0}건
- 반려: ${materialStats[0]?.rejected || 0}건

【위생 점검】
- 총 점검: ${hygieneStats[0]?.total || 0}건
- 완료: ${hygieneStats[0]?.completed || 0}건
- 대기: ${hygieneStats[0]?.pending || 0}건
- 조치 필요: ${hygieneStats[0]?.action_required || 0}건

【출하 검사】
- 총 검사: ${shippingStats[0]?.total || 0}건
- 완료: ${shippingStats[0]?.completed || 0}건
- 대기: ${shippingStats[0]?.pending || 0}건
- 반려: ${shippingStats[0]?.rejected || 0}건
      `.trim();

      // 관리자에게 알림 발송
      const notificationSent = await notifyOwner({
        title: `주간 검사 리포트 [${tenant.name}]`,
        content: reportContent,
      });

      console.log(`[검사 리포트] [tenant:${tenantId}] 주간 리포트 생성 완료 (알림 발송: ${notificationSent ? "성공" : "실패"})`);
    }

    return { success: true };
  } catch (error) {
    console.error("[검사 리포트] 주간 리포트 생성 오류:", error);
    return { success: false, error };
  }
}

/**
 * 월간 검사 리포트 생성 및 알림
 */
export async function generateMonthlyInspectionReport() {
  const db = await getDb();
  if (!db) {
    console.error("[검사 리포트] DB 연결 실패");
    return { success: false };
  }

  try {
    // 지난 30일간의 데이터 조회
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const startDateStr = formatLocalDate(startDate);
    const endDateStr = formatLocalDate(endDate);

    // [보안] 활성 테넌트 목록 조회
    const activeTenants = await db
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.status, "active"));

    for (const tenant of activeTenants) {
      const tenantId = tenant.id;

      // 원재료 검사 통계 (테넌트별)
      const materialStats = await db
        .select({
          total: sql<number>`COUNT(*)`,
          completed: sql<number>`SUM(CASE WHEN ${materialInspectionRecords.status} = 'completed' THEN 1 ELSE 0 END)`,
          pending: sql<number>`SUM(CASE WHEN ${materialInspectionRecords.status} = 'pending' THEN 1 ELSE 0 END)`,
          rejected: sql<number>`SUM(CASE WHEN ${materialInspectionRecords.status} = 'rejected' THEN 1 ELSE 0 END)`,
        })
        .from(materialInspectionRecords)
        .where(
          and(
            eq(materialInspectionRecords.tenantId, tenantId),
            gte(materialInspectionRecords.inspectionDate, startDateStr),
            lte(materialInspectionRecords.inspectionDate, endDateStr)
          )
        );

      // 위생 점검 통계 (테넌트별)
      const hygieneStats = await db
        .select({
          total: sql<number>`COUNT(*)`,
          completed: sql<number>`SUM(CASE WHEN ${hygieneInspectionRecords.status} = 'completed' THEN 1 ELSE 0 END)`,
          pending: sql<number>`SUM(CASE WHEN ${hygieneInspectionRecords.status} = 'pending' THEN 1 ELSE 0 END)`,
          action_required: sql<number>`SUM(CASE WHEN ${hygieneInspectionRecords.status} = 'action_required' THEN 1 ELSE 0 END)`,
        })
        .from(hygieneInspectionRecords)
        .where(
          and(
            eq(hygieneInspectionRecords.tenantId, tenantId),
            gte(hygieneInspectionRecords.inspectionDate, startDateStr),
            lte(hygieneInspectionRecords.inspectionDate, endDateStr)
          )
        );

      // 출하 검사 통계 (테넌트별)
      const shippingStats = await db
        .select({
          total: sql<number>`COUNT(*)`,
          completed: sql<number>`SUM(CASE WHEN ${shippingInspectionRecords.status} = 'completed' THEN 1 ELSE 0 END)`,
          pending: sql<number>`SUM(CASE WHEN ${shippingInspectionRecords.status} = 'pending' THEN 1 ELSE 0 END)`,
          rejected: sql<number>`SUM(CASE WHEN ${shippingInspectionRecords.status} = 'rejected' THEN 1 ELSE 0 END)`,
        })
        .from(shippingInspectionRecords)
        .where(
          and(
            eq(shippingInspectionRecords.tenantId, tenantId),
            gte(shippingInspectionRecords.inspectionDate, startDateStr),
            lte(shippingInspectionRecords.inspectionDate, endDateStr)
          )
        );

      // 리포트 내용 생성
      const reportContent = `
월간 검사 리포트 (${startDateStr} ~ ${endDateStr}) [${tenant.name}]

【원재료 검사】
- 총 검사: ${materialStats[0]?.total || 0}건
- 완료: ${materialStats[0]?.completed || 0}건
- 대기: ${materialStats[0]?.pending || 0}건
- 반려: ${materialStats[0]?.rejected || 0}건

【위생 점검】
- 총 점검: ${hygieneStats[0]?.total || 0}건
- 완료: ${hygieneStats[0]?.completed || 0}건
- 대기: ${hygieneStats[0]?.pending || 0}건
- 조치 필요: ${hygieneStats[0]?.action_required || 0}건

【출하 검사】
- 총 검사: ${shippingStats[0]?.total || 0}건
- 완료: ${shippingStats[0]?.completed || 0}건
- 대기: ${shippingStats[0]?.pending || 0}건
- 반려: ${shippingStats[0]?.rejected || 0}건
      `.trim();

      // 관리자에게 알림 발송
      const notificationSent = await notifyOwner({
        title: `월간 검사 리포트 [${tenant.name}]`,
        content: reportContent,
      });

      console.log(`[검사 리포트] [tenant:${tenantId}] 월간 리포트 생성 완료 (알림 발송: ${notificationSent ? "성공" : "실패"})`);
    }

    return { success: true };
  } catch (error) {
    console.error("[검사 리포트] 월간 리포트 생성 오류:", error);
    return { success: false, error };
  }
}
