import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { getDb } from "../connection";
import { hBatchSchedules } from '../../../drizzle/schema/part2';

/**
 * 배치 일정 생성
 */
export async function createBatchSchedule(data: {
  tenantId: number; // ✨ 필수로 변경
  batchId: number;
  scheduledDate: Date;
  status?: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');

  // ✨ 테넌트 ID 필수 검증
  if (!data.tenantId) {
    throw new Error('Tenant ID is required');
  }

  const [schedule] = await db.insert(hBatchSchedules).values({
    batchId: data.batchId,
    scheduledDate: data.scheduledDate,
    status: data.status || 'planned',
    notes: data.notes,
    tenantId: data.tenantId
  });

  return schedule;
}

/**
 * 날짜 범위로 배치 일정 조회
 */
export async function getBatchSchedulesByDateRange(tenantId: number, startDate: Date, endDate: Date) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');

  // ✨ 테넌트 ID 필수 검증
  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  const schedules = await db
    .select()
    .from(hBatchSchedules)
    .where(
      and(
        eq(hBatchSchedules.tenantId, tenantId), // ✨ 테넌트 필터 추가
        gte(hBatchSchedules.scheduledDate, startDate),
        lte(hBatchSchedules.scheduledDate, endDate)
      )
    )
    .orderBy(desc(hBatchSchedules.scheduledDate));

  return schedules;
}

/**
 * 배치 ID로 일정 조회
 */
export async function getBatchSchedulesByBatchId(tenantId: number, batchId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');

  // ✨ 테넌트 ID 필수 검증
  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  const schedules = await db
    .select()
    .from(hBatchSchedules)
    .where(
      and(
        eq(hBatchSchedules.tenantId, tenantId), // ✨ 테넌트 필터 추가
        eq(hBatchSchedules.batchId, batchId)
      )
    )
    .orderBy(desc(hBatchSchedules.scheduledDate));

  return schedules;
}

/**
 * 배치 일정 수정
 */
export async function updateBatchSchedule(
  tenantId: number,
  id: number,
  data: {
    scheduledDate?: Date;
    status?: string;
    notes?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');

  // ✨ 테넌트 ID 필수 검증
  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  await db
    .update(hBatchSchedules)
    .set(data)
    .where(
      and(
        eq(hBatchSchedules.tenantId, tenantId), // ✨ 테넌트 필터 추가
        eq(hBatchSchedules.id, id)
      )
    );

  return { success: true };
}

/**
 * 배치 일정 삭제
 */
export async function deleteBatchSchedule(tenantId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not initialized');

  // ✨ 테넌트 ID 필수 검증
  if (!tenantId) {
    throw new Error('Tenant ID is required');
  }

  await db
    .delete(hBatchSchedules)
    .where(
      and(
        eq(hBatchSchedules.tenantId, tenantId), // ✨ 테넌트 필터 추가
        eq(hBatchSchedules.id, id)
      )
    );

  return { success: true };
}
