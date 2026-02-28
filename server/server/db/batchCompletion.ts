import { getDb } from "../db";
import { hBatches, hCcpInstances } from "../../drizzle/schema";
import { eq, and} from "drizzle-orm";
import { getCcpRecordsByInstanceId } from "./ccpRecords";

/**
 * 배치 완성도 체크 (미작성 문서 추적)
 */
export async function checkBatchCompletion(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 1. 배치 정보 조회
  const batch = await db
    .select()
    .from(hBatches)
    .where(and(eq(hBatches.tenantId, tenantId), eq(hBatches.id, batchId)))    .limit(1);

  if (!batch || batch.length === 0) {
    throw new Error("배치를 찾을 수 없습니다.");
  }

  const batchInfo = batch[0];

  // 2. CCP 인스턴스 조회
  const ccpInstances = await db
    .select()
    .from(hCcpInstances)
    .where(and(eq(hCcpInstances.tenantId, tenantId), eq(hCcpInstances.batchId, batchId)));
  // 3. 각 CCP 인스턴스의 점검 기록 확인
  const missingDocuments: Array<{
    type: string;
    instanceId?: number;
    ccpType?: string;
    reason: string;
  }> = [];

  for (const instance of ccpInstances) {
    const recordData = await getCcpRecordsByInstanceId(instance.id);
    const records = Array.isArray(recordData) ? recordData : (recordData as any).items || [];

    if (!records || records.length === 0) {
      missingDocuments.push({
        type: "ccp_record",
        instanceId: instance.id,
        ccpType: instance.ccpType,
        reason: `CCP 점검 기록이 없습니다: ${instance.ccpType}`
      });
    }
  }

  // 4. 완성도 계산
  const totalDocuments = ccpInstances.length;
  const completedDocuments = totalDocuments - missingDocuments.length;
  const completionRate = totalDocuments > 0
    ? Math.round((completedDocuments / totalDocuments) * 100)
    : 100;

  return {
    batchId,
    batchCode: batchInfo.batchCode,
    mode: batchInfo.mode || "manual",
    totalDocuments,
    completedDocuments,
    missingDocuments,
    completionRate,
    isComplete: missingDocuments.length === 0
  };
}
