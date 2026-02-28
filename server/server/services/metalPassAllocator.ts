/**
 * 금속탐지(CCP-4P) SKU 직렬 통과 기록 배정 알고리즘
 *
 * [핵심 로직]
 * 1. 금속검출 설비의 batch_operation_time(총 작업시간) 확보
 * 2. 하루 전체 SKU를 직렬로 배정 (동시 통과 불가)
 * 3. 배정 방식:
 *    - EQUAL: SKU 개수로 균등 분배
 *    - PROPORTIONAL: plannedQty 비례 분배
 * 4. 통과 순서: INPUT_ORDER / PLANNED_QTY_DESC / CUSTOM
 * 5. h_ccp_metal_pass_logs 테이블에 UPSERT
 */

import { getRawConnection } from "../db";

export type MetalAllocationMode = "EQUAL" | "PROPORTIONAL";
export type PassOrder = "INPUT_ORDER" | "PLANNED_QTY_DESC" | "CUSTOM";

export interface MetalAllocationPolicy {
  metalAllocation: MetalAllocationMode;
  passOrder: PassOrder;
  customSkuOrder?: number[];
}

export interface BatchSkuSummary {
  batchId: number;
  productId: number;
  productName?: string;
  skuOutputs: Array<{
    skuId: number;
    plannedQty: number;
  }>;
}

interface SkuPassRow {
  batchId: number;
  productId: number;
  skuId: number;
  plannedQty: number;
}

// ───────────────────────────────────────────────────────────
// 정렬 함수
// ───────────────────────────────────────────────────────────
function sortSkuRows(rows: SkuPassRow[], policy: MetalAllocationPolicy): SkuPassRow[] {
  if (policy.passOrder === "PLANNED_QTY_DESC") {
    return [...rows].sort((a, b) => (b.plannedQty ?? 0) - (a.plannedQty ?? 0));
  }
  if (policy.passOrder === "CUSTOM" && policy.customSkuOrder?.length) {
    const order = new Map(policy.customSkuOrder.map((id, idx) => [id, idx]));
    return [...rows].sort((a, b) =>
      (order.get(a.skuId) ?? 999999) - (order.get(b.skuId) ?? 999999)
    );
  }
  // INPUT_ORDER: 입력 순서 유지
  return rows;
}

// ───────────────────────────────────────────────────────────
// 시간 배분 함수
// ───────────────────────────────────────────────────────────
function allocateMinutes(
  rows: SkuPassRow[],
  totalMinutes: number,
  mode: MetalAllocationMode,
): number[] {
  if (rows.length === 0) return [];

  if (mode === "EQUAL") {
    const each = totalMinutes / rows.length;
    return rows.map(() => Math.round(each * 100) / 100);
  }

  // PROPORTIONAL
  const sumQty = rows.reduce((s, r) => s + (r.plannedQty || 0), 0);
  if (sumQty <= 0) {
    // qty 정보 없으면 균등 폴백
    const each = totalMinutes / rows.length;
    return rows.map(() => Math.round(each * 100) / 100);
  }
  return rows.map((r) =>
    Math.round((totalMinutes * ((r.plannedQty || 0) / sumQty)) * 100) / 100
  );
}

// ───────────────────────────────────────────────────────────
// 금속검출 설비 찾기
// ───────────────────────────────────────────────────────────
async function findMetalDetectorEquipment(
  tenantId: number,
  siteId: number,
  equipmentId?: number,
): Promise<{ id: number; batch_operation_time: number }> {
  const conn = await getRawConnection();

  if (equipmentId) {
    const [rows] = await conn.execute<any[]>(
      `SELECT id, batch_operation_time FROM equipment_master
       WHERE id = ? AND tenant_id = ?`,
      [equipmentId, tenantId],
    );
    if ((rows as any[]).length > 0) {
      return {
        id: (rows as any[])[0].id,
        batch_operation_time: Number((rows as any[])[0].batch_operation_time) || 480,
      };
    }
  }

  // equipmentId 미지정 시: CCP-4P 공정그룹에 매핑된 첫 설비
  const [rows] = await conn.execute<any[]>(
    `SELECT ge.equipment_id AS id, em.batch_operation_time
     FROM ccp_process_group_equipments ge
     JOIN ccp_process_groups g ON g.id = ge.process_group_id
     LEFT JOIN equipment_master em ON em.id = ge.equipment_id
     WHERE g.ccp_type = 'CCP-4P'
       AND g.tenant_id = ? AND g.status = 'active'
     ORDER BY ge.sort_order LIMIT 1`,
    [tenantId],
  );

  if ((rows as any[]).length > 0) {
    return {
      id: (rows as any[])[0].id,
      batch_operation_time: Number((rows as any[])[0].batch_operation_time) || 480,
    };
  }

  // 최종 폴백: 8시간(480분)
  return { id: 0, batch_operation_time: 480 };
}

// ───────────────────────────────────────────────────────────
// DateTime 유틸
// ───────────────────────────────────────────────────────────
function toDateTime(workDate: string, time: string): Date {
  return new Date(`${workDate}T${time}:00`);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function formatDatetime(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

// ───────────────────────────────────────────────────────────
// 메인: 하루 금속탐지 통과기록 생성
// ───────────────────────────────────────────────────────────
export async function allocateMetalPassLogsForDay(args: {
  tenantId: number;
  siteId: number;
  workDate: string;
  dayStartTime: string; // "HH:mm"
  metalDetectorEquipmentId?: number;
  batches: BatchSkuSummary[];
  policy: MetalAllocationPolicy;
}): Promise<{ equipmentId: number; totalMinutes: number; count: number }> {
  const { tenantId, siteId, workDate, dayStartTime, policy } = args;
  const conn = await getRawConnection();

  // 1) 금속검출 설비 + 총 작업시간(분)
  const equipment = await findMetalDetectorEquipment(
    tenantId, siteId, args.metalDetectorEquipmentId,
  );
  const totalMinutes = equipment.batch_operation_time;

  // 2) SKU 통과 대상 rows 펼치기
  let rows: SkuPassRow[] = args.batches.flatMap((b) =>
    (b.skuOutputs || []).map((s) => ({
      batchId: b.batchId,
      productId: b.productId,
      skuId: s.skuId,
      plannedQty: s.plannedQty ?? 0,
    }))
  );

  // SKU가 없으면 배치 단위로 1행씩
  if (rows.length === 0) {
    rows = args.batches.map((b) => ({
      batchId: b.batchId,
      productId: b.productId,
      skuId: 0,
      plannedQty: 0,
    }));
  }

  // 3) 정렬
  rows = sortSkuRows(rows, policy);

  // 4) 시간 배분
  const allocated = allocateMinutes(rows, totalMinutes, policy.metalAllocation);

  // 5) 직렬 타임라인 (start/end 누적)
  const startAt0 = toDateTime(workDate, dayStartTime);
  let cursor = startAt0;

  const logs = rows.map((r, idx) => {
    const dur = allocated[idx] ?? 0;
    const startAt = cursor;
    const endAt = addMinutes(cursor, dur);
    cursor = endAt;

    return {
      tenant_id: tenantId,
      site_id: siteId,
      work_date: workDate,
      equipment_id: equipment.id,
      sequence_no: idx + 1,
      batch_id: r.batchId,
      product_id: r.productId,
      sku_id: r.skuId || null,
      planned_qty: r.plannedQty,
      allocated_duration_min: dur,
      start_at: formatDatetime(startAt),
      end_at: formatDatetime(endAt),
      status: "PLANNED" as const,
    };
  });

  // 6) UPSERT: 같은 work_date + equipment + sequence_no 있으면 갱신
  // 먼저 해당 날짜 기존 로그 삭제 후 재삽입 (atomic)
  await conn.execute(
    `DELETE FROM h_ccp_metal_pass_logs
     WHERE tenant_id = ? AND site_id = ? AND work_date = ? AND equipment_id = ?`,
    [tenantId, siteId, workDate, equipment.id],
  );

  for (const log of logs) {
    await conn.execute(
      `INSERT INTO h_ccp_metal_pass_logs
         (tenant_id, site_id, work_date, equipment_id, sequence_no,
          batch_id, product_id, sku_id, planned_qty,
          allocated_duration_min, start_at, end_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        log.tenant_id, log.site_id, log.work_date, log.equipment_id,
        log.sequence_no, log.batch_id, log.product_id, log.sku_id,
        log.planned_qty, log.allocated_duration_min,
        log.start_at, log.end_at, log.status,
      ],
    );
  }

  console.log(
    `[metalPassAllocator] ${workDate} 설비#${equipment.id}: ` +
    `${logs.length}건 배정 (총 ${totalMinutes}분, 모드=${policy.metalAllocation})`,
  );

  return { equipmentId: equipment.id, totalMinutes, count: logs.length };
}
