import { getDb } from "../db";
import { hCcpRecords } from "../../drizzle/schema";
import { eq, and} from "drizzle-orm";

/**
 * CCP 점검 기록 저장
 */
export async function createCcpRecord(data: {
  instanceId: number;
  recordData: {
    measuredValue: string;
    result: "pass" | "fail";
    inspector: string;
    inspectorId: number;
    notes: string;
    timestamp: string;
  };
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(hCcpRecords).values({
      tenantId,
    instanceId: data.instanceId,
    recordData: JSON.stringify(data.recordData)
  });
}

/**
 * CCP 인스턴스별 점검 기록 조회
 */
export async function getCcpRecordsByInstanceId(instanceId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const records = await db
    .select()
    .from(hCcpRecords)
    .where(and(eq(hCcpRecords.tenantId, tenantId), eq(hCcpRecords.instanceId, instanceId)))    .orderBy(hCcpRecords.createdAt);

  return records.map((record: any) => ({
    id: record.id,
    instanceId: record.instanceId,
    recordData: typeof record.recordData === "string" 
      ? JSON.parse(record.recordData) 
      : record.recordData,
    createdAt: record.createdAt
  }));
}
