/**
 * 검사 기록 자동 알림 스케줄러
 * - 검사 기한이 임박한 항목 알림
 * - 미완료된 검사 항목 알림
 * [보안 수정] 테넌트별 격리 처리 적용
 */

import { getDb } from "../db";
import { materialInspectionRecords, hygieneInspectionRecords, shippingInspectionRecords, hNotifications, tenants } from "../../drizzle/schema";
import { eq, and, lt, gte, sql } from "drizzle-orm";

/**
 * 검사 기한 임박 알림 (매일 오전 9시 실행)
 * - 검사 예정일이 3일 이내인 미완료 검사 항목 알림
 */
export async function notifyUpcomingInspections() {
  const db = await getDb();
  if (!db) {
    console.error(`[검사 기한 임박 알림] DB 연결 실패`);
    return;
  }
  const now = new Date();
  const nowStr = now.toISOString().split('T')[0];
  const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const threeDaysLaterStr = threeDaysLater.toISOString().split('T')[0];
  
  console.log(`[검사 기한 임박 알림] 스케줄러 실행: ${now.toISOString()}`);
  
  try {
    // [보안] 활성 테넌트 목록 조회
    const activeTenants = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.status, "active"));

    for (const tenant of activeTenants) {
      const tenantId = tenant.id;

      // 원재료 검사 기한 임박 항목 조회 (테넌트별)
      const upcomingMaterialInspections = await db
        .select()
        .from(materialInspectionRecords)
        .where(
          and(
            eq(materialInspectionRecords.tenantId, tenantId),
            eq(materialInspectionRecords.status, "pending"),
            gte(materialInspectionRecords.inspectionDate, nowStr),
            lt(materialInspectionRecords.inspectionDate, threeDaysLaterStr)
          )
        );
      
      // 위생 검사 기한 임박 항목 조회 (테넌트별)
      const upcomingHygieneInspections = await db
        .select()
        .from(hygieneInspectionRecords)
        .where(
          and(
            eq(hygieneInspectionRecords.tenantId, tenantId),
            eq(hygieneInspectionRecords.status, "pending"),
            gte(hygieneInspectionRecords.inspectionDate, nowStr),
            lt(hygieneInspectionRecords.inspectionDate, threeDaysLaterStr)
          )
        );
      
      // 출하 검사 기한 임박 항목 조회 (테넌트별)
      const upcomingShippingInspections = await db
        .select()
        .from(shippingInspectionRecords)
        .where(
          and(
            eq(shippingInspectionRecords.tenantId, tenantId),
            eq(shippingInspectionRecords.status, "pending"),
            gte(shippingInspectionRecords.inspectionDate, nowStr),
            lt(shippingInspectionRecords.inspectionDate, threeDaysLaterStr)
          )
        );
      
      // 알림 생성 (tenantId 포함)
      const notifications = [];
      
      for (const inspection of upcomingMaterialInspections) {
        notifications.push({
          tenantId,
          userId: inspection.inspectorId,
          title: "원재료 검사 기한 임박",
          message: `원재료 "${inspection.materialName}" (LOT: ${inspection.lotNumber})의 검사 기한이 임박했습니다.`,
          type: "warning" as const,
          relatedEntity: "material_inspection" as const,
          relatedId: inspection.id,
          isRead: 0,
          createdAt: now,
        });
      }
      
      for (const inspection of upcomingHygieneInspections) {
        notifications.push({
          tenantId,
          userId: inspection.inspectorId,
          title: "위생 점검 기한 임박",
          message: `"${inspection.inspectionArea}" 구역의 위생 점검 기한이 임박했습니다.`,
          type: "warning" as const,
          relatedEntity: "hygiene_inspection" as const,
          relatedId: inspection.id,
          isRead: 0,
          createdAt: now,
        });
      }
      
      for (const inspection of upcomingShippingInspections) {
        notifications.push({
          tenantId,
          userId: inspection.inspectorId,
          title: "출하 검사 기한 임박",
          message: `제품 "${inspection.productName}" (배치: ${inspection.batchCode})의 출하 검사 기한이 임박했습니다.`,
          type: "warning" as const,
          relatedEntity: "shipping_inspection" as const,
          relatedId: inspection.id,
          isRead: 0,
          createdAt: now,
        });
      }
      
      if (notifications.length > 0) {
        await db.insert(hNotifications).values(notifications);
        console.log(`[검사 기한 임박 알림] [tenant:${tenantId}] ${notifications.length}건의 알림 생성 완료`);
      }
    }
  } catch (error) {
    console.error(`[검사 기한 임박 알림] 오류 발생:`, error);
  }
}

/**
 * 미완료 검사 항목 알림 (매일 오후 6시 실행)
 * - 검사 예정일이 지났지만 아직 완료되지 않은 검사 항목 알림
 */
export async function notifyOverdueInspections() {
  const db = await getDb();
  if (!db) {
    console.error(`[미완료 검사 알림] DB 연결 실패`);
    return;
  }
  const now = new Date();
  const nowStr = now.toISOString().split('T')[0];
  
  console.log(`[미완료 검사 알림] 스케줄러 실행: ${now.toISOString()}`);
  
  try {
    // [보안] 활성 테넌트 목록 조회
    const activeTenants = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.status, "active"));

    for (const tenant of activeTenants) {
      const tenantId = tenant.id;

      // 원재료 검사 미완료 항목 조회 (테넌트별)
      const overdueMaterialInspections = await db
        .select()
        .from(materialInspectionRecords)
        .where(
          and(
            eq(materialInspectionRecords.tenantId, tenantId),
            eq(materialInspectionRecords.status, "pending"),
            lt(materialInspectionRecords.inspectionDate, nowStr)
          )
        );
      
      // 위생 검사 미완료 항목 조회 (테넌트별)
      const overdueHygieneInspections = await db
        .select()
        .from(hygieneInspectionRecords)
        .where(
          and(
            eq(hygieneInspectionRecords.tenantId, tenantId),
            eq(hygieneInspectionRecords.status, "pending"),
            lt(hygieneInspectionRecords.inspectionDate, nowStr)
          )
        );
      
      // 출하 검사 미완료 항목 조회 (테넌트별)
      const overdueShippingInspections = await db
        .select()
        .from(shippingInspectionRecords)
        .where(
          and(
            eq(shippingInspectionRecords.tenantId, tenantId),
            eq(shippingInspectionRecords.status, "pending"),
            lt(shippingInspectionRecords.inspectionDate, nowStr)
          )
        );
      
      // 알림 생성 (tenantId 포함)
      const notifications = [];
      
      for (const inspection of overdueMaterialInspections) {
        const daysOverdue = Math.floor((now.getTime() - new Date(inspection.inspectionDate).getTime()) / (24 * 60 * 60 * 1000));
        notifications.push({
          tenantId,
          userId: inspection.inspectorId,
          title: "원재료 검사 미완료",
          message: `원재료 "${inspection.materialName}" (LOT: ${inspection.lotNumber})의 검사가 ${daysOverdue}일 지연되었습니다.`,
          type: "error" as const,
          relatedEntity: "material_inspection" as const,
          relatedId: inspection.id,
          isRead: 0,
          createdAt: now,
        });
      }
      
      for (const inspection of overdueHygieneInspections) {
        const daysOverdue = Math.floor((now.getTime() - new Date(inspection.inspectionDate).getTime()) / (24 * 60 * 60 * 1000));
        notifications.push({
          tenantId,
          userId: inspection.inspectorId,
          title: "위생 점검 미완료",
          message: `"${inspection.inspectionArea}" 구역의 위생 점검이 ${daysOverdue}일 지연되었습니다.`,
          type: "error" as const,
          relatedEntity: "hygiene_inspection" as const,
          relatedId: inspection.id,
          isRead: 0,
          createdAt: now,
        });
      }
      
      for (const inspection of overdueShippingInspections) {
        const daysOverdue = Math.floor((now.getTime() - new Date(inspection.inspectionDate).getTime()) / (24 * 60 * 60 * 1000));
        notifications.push({
          tenantId,
          userId: inspection.inspectorId,
          title: "출하 검사 미완료",
          message: `제품 "${inspection.productName}" (배치: ${inspection.batchCode})의 출하 검사가 ${daysOverdue}일 지연되었습니다.`,
          type: "error" as const,
          relatedEntity: "shipping_inspection" as const,
          relatedId: inspection.id,
          isRead: 0,
          createdAt: now,
        });
      }
      
      if (notifications.length > 0) {
        await db.insert(hNotifications).values(notifications);
        console.log(`[미완료 검사 알림] [tenant:${tenantId}] ${notifications.length}건의 알림 생성 완료`);
      }
    }
  } catch (error) {
    console.error(`[미완료 검사 알림] 오류 발생:`, error);
  }
}
