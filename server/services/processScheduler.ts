/**
 * 공정그룹 병렬/순차/일괄 운전 스케줄 서비스 (MVP)
 *
 * [MVP 범위]
 * - 공정그룹 정책(ccp_process_group_policies) 읽기
 * - 배치별 공정그룹 → 설비 배정 → h_process_schedule_tasks 생성
 * - 시작/종료 시간: 순차(SEQUENTIAL)일 때만 자동 계산
 * - 병렬(PARALLEL), 묶음(BATCHED)은 sequence만 생성 (타임라인은 향후 확장)
 *
 * [향후 확장]
 * - 타임라인 시각화 데이터 생성
 * - 설비 캘린더 뷰 연동
 * - 묶음 배치 자동 그룹핑
 */

import { getRawConnection } from "../db";

interface ScheduleBatch {
  batchId: number;
  productId: number;
  productName?: string;
  ccpGroups: Array<{ id: number; name: string; ccp_type: string }>;
}

interface ProcessGroupPolicy {
  processGroupId: number;
  runMode: "SEQUENTIAL" | "PARALLEL" | "BATCHED";
  parallelCapacity: number;
  batchingEnabled: boolean;
  defaultSequenceOrder: number;
}

/**
 * 공정그룹 정책 조회 (없으면 기본값 SEQUENTIAL)
 */
async function getProcessGroupPolicies(
  tenantId: number,
  siteId: number,
): Promise<Map<number, ProcessGroupPolicy>> {
  const conn = await getRawConnection();
  const [rows] = await conn.execute<any[]>(
    `SELECT process_group_id, run_mode, parallel_capacity,
            batching_enabled, default_sequence_order
     FROM ccp_process_group_policies
     WHERE tenant_id = ? AND (site_id = ? OR site_id IS NULL)
     ORDER BY site_id DESC`, // site_id 특정 값 우선
    [tenantId, siteId],
  );

  const map = new Map<number, ProcessGroupPolicy>();
  for (const r of rows as any[]) {
    const pgId = Number(r.process_group_id);
    if (!map.has(pgId)) {
      map.set(pgId, {
        processGroupId: pgId,
        runMode: r.run_mode || "SEQUENTIAL",
        parallelCapacity: Number(r.parallel_capacity) || 1,
        batchingEnabled: !!r.batching_enabled,
        defaultSequenceOrder: Number(r.default_sequence_order) || 0,
      });
    }
  }
  return map;
}

/**
 * 하루 공정 스케줄 생성 (메인)
 */
export async function createProcessScheduleForDay(args: {
  tenantId: number;
  siteId: number;
  workDate: string;
  dayStartTime: string; // "HH:mm"
  batches: ScheduleBatch[];
}): Promise<{ scheduleId: number; taskCount: number }> {
  const { tenantId, siteId, workDate, dayStartTime, batches } = args;
  const conn = await getRawConnection();

  // 1) 스케줄 헤더 upsert
  const dayStartAt = `${workDate} ${dayStartTime}:00`;

  const [existing] = await conn.execute<any[]>(
    `SELECT id FROM h_process_schedules
     WHERE tenant_id = ? AND site_id = ? AND work_date = ?`,
    [tenantId, siteId, workDate],
  );

  let scheduleId: number;
  if ((existing as any[]).length > 0) {
    scheduleId = (existing as any[])[0].id;
    // 기존 tasks 삭제 후 재생성
    await conn.execute(
      `DELETE FROM h_process_schedule_tasks WHERE schedule_id = ?`,
      [scheduleId],
    );
    await conn.execute(
      `UPDATE h_process_schedules SET day_start_at = ?, status = 'PLANNED' WHERE id = ?`,
      [dayStartAt, scheduleId],
    );
  } else {
    const [ins] = await conn.execute(
      `INSERT INTO h_process_schedules
         (tenant_id, site_id, work_date, day_start_at, status)
       VALUES (?, ?, ?, ?, 'PLANNED')`,
      [tenantId, siteId, workDate, dayStartAt],
    );
    scheduleId = Number((ins as any).insertId);
  }

  // 2) 공정그룹 정책 로드
  const policies = await getProcessGroupPolicies(tenantId, siteId);

  // 3) 배치별 공정그룹 → 설비 배정 → tasks 생성
  // 공정그룹별로 순서 정리
  const tasksByGroup = new Map<number, Array<{
    batchId: number;
    processGroupId: number;
    processGroupName: string;
    ccpType: string;
  }>>();

  for (const batch of batches) {
    for (const group of batch.ccpGroups) {
      if (!tasksByGroup.has(group.id)) {
        tasksByGroup.set(group.id, []);
      }
      tasksByGroup.get(group.id)!.push({
        batchId: batch.batchId,
        processGroupId: group.id,
        processGroupName: group.name,
        ccpType: group.ccp_type,
      });
    }
  }

  // 공정그룹 순서 정렬 (defaultSequenceOrder 기준)
  const sortedGroups = Array.from(tasksByGroup.entries()).sort((a, b) => {
    const pa = policies.get(a[0])?.defaultSequenceOrder ?? 999;
    const pb = policies.get(b[0])?.defaultSequenceOrder ?? 999;
    return pa - pb;
  });

  let taskCount = 0;

  for (const [groupId, groupBatches] of sortedGroups) {
    const policy = policies.get(groupId) || {
      processGroupId: groupId,
      runMode: "SEQUENTIAL" as const,
      parallelCapacity: 1,
      batchingEnabled: false,
      defaultSequenceOrder: 0,
    };

    // 설비 목록 조회
    const { getEquipmentsForProcessGroup } = await import("./ccp-batch");
    const equipments = await getEquipmentsForProcessGroup(groupId, tenantId);
    const defaultEquipmentId = equipments.length > 0 ? equipments[0].equipment_id : null;

    for (let idx = 0; idx < groupBatches.length; idx++) {
      const task = groupBatches[idx];

      await conn.execute(
        `INSERT INTO h_process_schedule_tasks
           (schedule_id, tenant_id, site_id, work_date,
            process_group_id, equipment_id, batch_id,
            sequence_no, run_mode, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PLANNED')`,
        [
          scheduleId, tenantId, siteId, workDate,
          task.processGroupId, defaultEquipmentId,
          task.batchId, idx + 1, policy.runMode,
        ],
      );
      taskCount++;
    }
  }

  console.log(
    `[processScheduler] ${workDate} 스케줄#${scheduleId}: ${taskCount}건 태스크 생성`,
  );

  return { scheduleId, taskCount };
}
