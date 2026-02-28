import { getDb } from "../db";
import { hCcpInspectionAlerts } from "../../drizzle/schema/part2";
import { eq, and, lte, gte } from "drizzle-orm";

/**
 * CCP 점검 알림 생성
 */
export async function createInspectionAlert(data: {
  instanceId: number;
  scheduledTime: Date;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [alert] = await db.insert(hCcpInspectionAlerts).values({
      tenantId,
    instanceId: data.instanceId,
    scheduledTime: data.scheduledTime,
    status: "pending"
  });
  return alert;
}

/**
 * 배치의 모든 CCP 점검 알림 조회
 */
export async function getInspectionAlertsByBatch(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const alerts = await db
    .select()
    .from(hCcpInspectionAlerts)
    .where(and(eq(hCcpInspectionAlerts.tenantId, tenantId), eq(hCcpInspectionAlerts.status, "pending")));  return alerts;
}

/**
 * 대기 중인 알림 조회 (스케줄러용)
 */
export async function getPendingAlerts(currentTime: Date, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const alerts = await db
    .select()
    .from(hCcpInspectionAlerts)
    .where(
      and(eq(hCcpInspectionAlerts.tenantId, tenantId), 
        eq(hCcpInspectionAlerts.status, "pending"),
        lte(hCcpInspectionAlerts.scheduledTime, currentTime)
      )
    );
  return alerts;
}

/**
 * 알림 상태 업데이트
 */
export async function updateAlertStatus(
  alertId: number,
  status: "notified" | "completed" | "skipped",
  timestamp?: Date, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updateData: any = { status };
  
  if (status === "notified") {
    updateData.notifiedAt = timestamp || new Date();
  } else if (status === "completed") {
    updateData.completedAt = timestamp || new Date();
  }

  await db
    .update(hCcpInspectionAlerts)
    .set(updateData)
    .where(and(eq(hCcpInspectionAlerts.tenantId, tenantId), eq(hCcpInspectionAlerts.id, alertId)));}

/**
 * 사용자별 대기 중인 알림 조회
 */
export async function getUserPendingAlerts(userId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // h_ccp_instances와 JOIN하여 batchId를 포함한 알림 조회
  const { hCcpInstances } = await import("../../drizzle/schema_main");
  
  const alerts = await db
    .select({
      id: hCcpInspectionAlerts.id,
      instanceId: hCcpInspectionAlerts.instanceId,
      scheduledTime: hCcpInspectionAlerts.scheduledTime,
      status: hCcpInspectionAlerts.status,
      batchId: hCcpInstances.batchId
    })
    .from(hCcpInspectionAlerts)
    .leftJoin(hCcpInstances, eq(hCcpInspectionAlerts.instanceId, hCcpInstances.id))
    .where(eq(hCcpInspectionAlerts.status, "pending"))
    .limit(50);
  return alerts;
}
