/**
 * 금속탐지(CCP-4P) 배치 → SKU → 시간/수량 배분 알고리즘 v2
 *
 * [핵심 로직]
 * 1. 설비 작업시간(work_start_time, work_end_time) 로드
 * 2. 점심시간(lunch_start_time, lunch_end_time) 제외
 * 3. 랜덤 시작 오프셋 0-10분 (seeded per batch for audit reproducibility)
 * 4. Sequential mode: 직렬 배정, 시간/수량 비례배분
 * 5. Parallel mode: 다중 채널, 가장 빨리 끝나는 채널에 SKU 배정
 * 6. 감도 모니터링 자동 생성: START + PERIODIC(2h) + END
 * 7. h_ccp_batch_process_runs → h_ccp_metal_sku_slots → h_ccp_metal_sensitivity_checks
 */

import { getRawConnection } from "../db";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export type MetalAllocationMode = "EQUAL" | "PROPORTIONAL";
export type PassOrder = "INPUT_ORDER" | "PLANNED_QTY_DESC" | "CUSTOM";
export type RunMode = "SEQUENTIAL" | "PARALLEL";

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
    skuName?: string;
    plannedQty: number;
  }>;
}

interface SkuPassRow {
  batchId: number;
  productId: number;
  productName: string;
  skuId: number;
  skuName: string;
  plannedQty: number;
}

// ─────────────────────────────────────────────────────────
// Seeded Random (audit-reproducible)
// seed = hash(batch_id + date + equipment_id)
// ─────────────────────────────────────────────────────────

export function seededRandom(seed: number): number {
  let s = seed;
  s = ((s ^ 0xDEADBEEF) + (s << 1)) & 0x7FFFFFFF;
  s = ((s ^ (s >> 16)) * 0x45d9f3b) & 0x7FFFFFFF;
  s = ((s ^ (s >> 16)) * 0x45d9f3b) & 0x7FFFFFFF;
  return (s & 0x7FFFFFFF) / 0x7FFFFFFF;
}

/**
 * Compute reproducible seed from batch_id + date + equipment_id
 */
export function computeSeed(batchId: number, dateStr: string, equipmentId: number): number {
  const str = `${batchId}_${dateStr}_${equipmentId}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = ((hash << 5) - hash + c) | 0;
  }
  return Math.abs(hash);
}

/**
 * Compute random offset 0-10 minutes from seed
 */
export function computeRandomOffset(seed: number, minVal = 0, maxVal = 10): number {
  return minVal + Math.floor(seededRandom(seed) * (maxVal - minVal + 1));
}

// ─────────────────────────────────────────────────────────
// Time Utilities
// ─────────────────────────────────────────────────────────

export function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minToTime(m: number): string {
  // ★ 부동소수점 방지: 정수화 후 계산
  const mi = Math.round(m);
  const h = Math.floor(mi / 60) % 24;
  const min = mi % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function addMinutesToTime(timeHHmm: string, addMin: number): string {
  const totalMin = timeToMin(timeHHmm) + addMin;
  return minToTime(totalMin);
}

function toDateTime(workDate: string, timeHHmm: string): string {
  return `${workDate} ${timeHHmm}:00`;
}

/**
 * Calculate total available work minutes (excluding lunch)
 */
export function calcAvailableMinutes(
  workStartMin: number,
  workEndMin: number,
  lunchStartMin: number,
  lunchEndMin: number,
): number {
  let total = workEndMin - workStartMin;
  // exclude lunch if overlaps
  if (workStartMin < lunchEndMin && workEndMin > lunchStartMin) {
    const overlapStart = Math.max(workStartMin, lunchStartMin);
    const overlapEnd = Math.min(workEndMin, lunchEndMin);
    if (overlapEnd > overlapStart) {
      total -= (overlapEnd - overlapStart);
    }
  }
  return Math.max(0, total);
}

/**
 * Skip lunch: if cursor is during lunch, jump to lunch end
 */
export function skipLunch(cursorMin: number, lunchStartMin: number, lunchEndMin: number): number {
  if (cursorMin >= lunchStartMin && cursorMin < lunchEndMin) {
    return lunchEndMin;
  }
  return cursorMin;
}

/**
 * Advance cursor by duration, skipping lunch if encountered
 */
export function advanceCursor(
  startMin: number,
  durationMin: number,
  lunchStartMin: number,
  lunchEndMin: number,
): number {
  let remaining = durationMin;
  let cursor = startMin;

  // If starting in lunch, jump out
  cursor = skipLunch(cursor, lunchStartMin, lunchEndMin);

  // Check if we'll cross lunch
  if (cursor < lunchStartMin && cursor + remaining > lunchStartMin) {
    const beforeLunch = lunchStartMin - cursor;
    remaining -= beforeLunch;
    cursor = lunchEndMin;
  }

  cursor += remaining;
  return cursor;
}

// ─────────────────────────────────────────────────────────
// Sorting
// ─────────────────────────────────────────────────────────

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
  return rows;
}

// ─────────────────────────────────────────────────────────
// Allocation Functions
// ─────────────────────────────────────────────────────────

function allocateProportional(
  rows: SkuPassRow[],
  totalMinutes: number,
  totalPassQty: number,
): { allocMin: number[]; allocPassQty: number[] } {
  const totalQty = rows.reduce((s, r) => s + (r.plannedQty || 0), 0);

  if (totalQty <= 0 || rows.length === 0) {
    // ★ 부동소수점 방지: 정수 분(minutes) 유지
    const each = rows.length > 0 ? totalMinutes / rows.length : 0;
    const eachPass = rows.length > 0 ? Math.round(totalPassQty / rows.length) : 0;
    return {
      allocMin: rows.map(() => Math.round(each)),
      allocPassQty: rows.map(() => eachPass),
    };
  }

  return {
    // ★ 부동소수점 방지: 정수 분(minutes) 유지
    allocMin: rows.map((r) =>
      Math.round(totalMinutes * ((r.plannedQty || 0) / totalQty))
    ),
    allocPassQty: rows.map((r) =>
      Math.round(totalPassQty * ((r.plannedQty || 0) / totalQty))
    ),
  };
}

// ─────────────────────────────────────────────────────────
// Equipment finder
// ─────────────────────────────────────────────────────────

interface EquipmentInfo {
  id: number;
  workStartTime: string;
  workEndTime: string;
  lunchStartTime: string;
  lunchEndTime: string;
  feSensitivity: number;
  stsSensitivity: number;
}

async function findMetalDetectorEquipment(
  tenantId: number,
  equipmentId?: number,
): Promise<EquipmentInfo> {
  const conn = await getRawConnection();
  const defaultResult: EquipmentInfo = {
    id: 0,
    workStartTime: "09:00",
    workEndTime: "16:30",
    lunchStartTime: "12:00",
    lunchEndTime: "13:00",
    feSensitivity: 2.0,
    stsSensitivity: 3.0,
  };

  const query = equipmentId
    ? `SELECT id, work_start_time, work_end_time, lunch_start_time, lunch_end_time,
              fe_sensitivity, sts_sensitivity
       FROM equipments WHERE id = ? AND tenant_id = ? AND status = 'active' LIMIT 1`
    : `SELECT id, work_start_time, work_end_time, lunch_start_time, lunch_end_time,
              fe_sensitivity, sts_sensitivity
       FROM equipments WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND status = 'active'
       ORDER BY id LIMIT 1`;

  const params = equipmentId ? [equipmentId, tenantId] : [tenantId];
  const [rows] = await conn.execute<any[]>(query, params);

  if ((rows as any[]).length > 0) {
    const eq = (rows as any[])[0];
    return {
      id: eq.id,
      workStartTime: eq.work_start_time || "09:00",
      workEndTime: eq.work_end_time || "16:30",
      lunchStartTime: eq.lunch_start_time || "12:00",
      lunchEndTime: eq.lunch_end_time || "13:00",
      feSensitivity: parseFloat(eq.fe_sensitivity) || 2.0,
      stsSensitivity: parseFloat(eq.sts_sensitivity) || 3.0,
    };
  }

  return defaultResult;
}

// ─────────────────────────────────────────────────────────
// Sensitivity Check Generation
// ─────────────────────────────────────────────────────────

interface SensitivityCheckRecord {
  checkType: "START" | "PERIODIC" | "END";
  checkSeq: number;
  scheduledAt: string; // datetime string
  skuSlotId?: number;
  note: string;
}

/**
 * Generate sensitivity monitoring checks for a run:
 * - START check at (or shortly after) planned start
 * - PERIODIC checks every 2 hours within any SKU slot longer than 2h
 * - END check at planned end
 */
function generateSensitivityChecks(
  slots: Array<{
    id?: number;
    sequenceNo: number;
    productName: string;
    startMin: number;
    endMin: number;
  }>,
  workDate: string,
  seed: number,
  lunchStartMin: number,
  lunchEndMin: number,
): SensitivityCheckRecord[] {
  const checks: SensitivityCheckRecord[] = [];
  let seq = 1;

  if (slots.length === 0) return [];

  const overallStart = slots[0].startMin;
  const overallEnd = slots[slots.length - 1].endMin;

  // START check: at or shortly after the overall start
  const startOffset = Math.floor(seededRandom(seed + 1) * 4); // 0-3 min
  let startCheckMin = skipLunch(overallStart + startOffset, lunchStartMin, lunchEndMin);
  checks.push({
    checkType: "START",
    checkSeq: seq++,
    scheduledAt: toDateTime(workDate, minToTime(startCheckMin)),
    note: "작업시작",
  });

  // PERIODIC checks every 2 hours from the start
  const TWO_HOURS = 120;
  let checkpoint = overallStart + TWO_HOURS;
  while (checkpoint < overallEnd) {
    const periodicOffset = Math.floor(seededRandom(seed + checkpoint) * 6); // 0-5 min
    let adjMin = skipLunch(checkpoint + periodicOffset, lunchStartMin, lunchEndMin);
    if (adjMin < overallEnd) {
      // Find which SKU slot this check falls into
      const matchingSlot = slots.find(
        (s) => adjMin >= s.startMin && adjMin < s.endMin
      );
      checks.push({
        checkType: "PERIODIC",
        checkSeq: seq++,
        scheduledAt: toDateTime(workDate, minToTime(adjMin)),
        skuSlotId: matchingSlot?.id,
        note: "2시간점검",
      });
    }
    checkpoint += TWO_HOURS;
  }

  // END check: at or shortly before the overall end
  const endOffset = Math.floor(seededRandom(seed + 99) * 4); // 0-3 min
  let endCheckMin = skipLunch(Math.max(overallStart + 5, overallEnd - 3 - endOffset), lunchStartMin, lunchEndMin);
  checks.push({
    checkType: "END",
    checkSeq: seq++,
    scheduledAt: toDateTime(workDate, minToTime(endCheckMin)),
    note: "작업종료",
  });

  return checks;
}

// ─────────────────────────────────────────────────────────
// MAIN: Generate metal detection record frame for a day
// ─────────────────────────────────────────────────────────

export interface MetalRecordFrameResult {
  runId: number;
  equipmentId: number;
  mode: RunMode;
  randomOffset: number;
  totalWorkMin: number;
  skuSlotCount: number;
  sensitivityCheckCount: number;
}

export async function generateMetalRecordFrame(args: {
  tenantId: number;
  siteId: number;
  batchId: number;
  workDate: string;
  processGroupId?: number;
  equipmentId?: number;
  mode?: RunMode;
  channels?: number;
  batches: BatchSkuSummary[];
  policy: MetalAllocationPolicy;
}): Promise<MetalRecordFrameResult> {
  const conn = await getRawConnection();
  const {
    tenantId, siteId, batchId, workDate, processGroupId,
    mode = "SEQUENTIAL", channels = 1,
    batches, policy,
  } = args;

  // 1. Find equipment and load work-time settings
  const equip = await findMetalDetectorEquipment(tenantId, args.equipmentId);

  // 2. Compute random offset: seed = hash(batchId + date + equipmentId)
  const seed = computeSeed(batchId, workDate, equip.id);
  const randomOffset = computeRandomOffset(seed, 0, 10);

  // 3. Calculate work time boundaries
  const effectiveStart = addMinutesToTime(equip.workStartTime, randomOffset);
  const workStartMin = timeToMin(effectiveStart);
  const workEndMin = timeToMin(equip.workEndTime);
  const lunchStartMin = timeToMin(equip.lunchStartTime);
  const lunchEndMin = timeToMin(equip.lunchEndTime);
  const totalWorkMin = calcAvailableMinutes(workStartMin, workEndMin, lunchStartMin, lunchEndMin);

  // 4. Flatten batch-SKU rows
  let rows: SkuPassRow[] = batches.flatMap((b) =>
    (b.skuOutputs || []).map((s) => ({
      batchId: b.batchId,
      productId: b.productId,
      productName: b.productName || "",
      skuId: s.skuId,
      skuName: s.skuName || b.productName || "",
      plannedQty: s.plannedQty ?? 0,
    }))
  );

  // Fallback: if no SKU data, create one row per batch
  if (rows.length === 0) {
    rows = batches.map((b) => ({
      batchId: b.batchId,
      productId: b.productId,
      productName: b.productName || "",
      skuId: 0,
      skuName: b.productName || "",
      plannedQty: 0,
    }));
  }

  // 5. Sort
  rows = sortSkuRows(rows, policy);

  // 6. Calculate total qty for proportional allocation
  const totalQty = rows.reduce((s, r) => s + (r.plannedQty || 0), 0);
  const totalPassQty = Math.round(totalQty); // default pass qty = planned qty rounded

  // 7. Allocate time and pass quantities
  const { allocMin, allocPassQty } = allocateProportional(rows, totalWorkMin, totalPassQty);

  // 8. Create the batch process run record
  // Delete existing run for same batch+date+equipment first
  await conn.execute(
    `DELETE FROM h_ccp_batch_process_runs
     WHERE tenant_id = ? AND batch_id = ? AND work_date = ? AND equipment_id = ?`,
    [tenantId, batchId, workDate, equip.id],
  );

  const [runResult] = await conn.execute(
    `INSERT INTO h_ccp_batch_process_runs
       (tenant_id, site_id, batch_id, process_group_id, process_code, equipment_id,
        mode, channels, planned_total_qty, work_date,
        work_start_time, work_end_time, lunch_start_time, lunch_end_time,
        random_offset_min, random_seed, planned_start_at, planned_end_at, status)
     VALUES (?, ?, ?, ?, 'METAL_DETECT', ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, 'PLANNED')`,
    [
      tenantId, siteId, batchId, processGroupId || null, equip.id,
      mode, channels, totalQty || null, workDate,
      equip.workStartTime, equip.workEndTime, equip.lunchStartTime, equip.lunchEndTime,
      randomOffset, `${batchId}_${workDate}_${equip.id}`,
      toDateTime(workDate, effectiveStart),
      toDateTime(workDate, minToTime(workEndMin)),
    ],
  );
  const runId = (runResult as any).insertId;

  // 9. Delete existing SKU slots and sensitivity checks for this run
  // (they were already deleted by cascade of deleting the run above)

  // 10. Create SKU slots
  const slotMeta: Array<{ id: number; sequenceNo: number; productName: string; startMin: number; endMin: number }> = [];

  if (mode === "SEQUENTIAL") {
    // Sequential: linear timeline, skip lunch
    let cursor = workStartMin;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const dur = allocMin[i] ?? 0;
      const passQty = allocPassQty[i] ?? 0;

      // Skip lunch if we're in it
      cursor = skipLunch(cursor, lunchStartMin, lunchEndMin);
      const slotStart = cursor;
      const slotEnd = advanceCursor(cursor, dur, lunchStartMin, lunchEndMin);
      cursor = slotEnd;

      const [slotResult] = await conn.execute(
        `INSERT INTO h_ccp_metal_sku_slots
           (tenant_id, batch_process_run_id, sku_id, product_id, product_name, sku_name,
            channel_no, sequence_no, planned_qty, planned_pass_qty, allocated_duration_min,
            planned_start_at, planned_end_at, status)
         VALUES (?, ?, ?, ?, ?, ?,
            1, ?, ?, ?, ?,
            ?, ?, 'PLANNED')`,
        [
          tenantId, runId, r.skuId || null, r.productId, r.productName, r.skuName,
          i + 1, r.plannedQty || null, passQty || null, dur,
          toDateTime(workDate, minToTime(slotStart)),
          toDateTime(workDate, minToTime(slotEnd)),
        ],
      );
      slotMeta.push({
        id: (slotResult as any).insertId,
        sequenceNo: i + 1,
        productName: r.productName,
        startMin: slotStart,
        endMin: slotEnd,
      });
    }
  } else {
    // Parallel mode: assign SKUs to earliest-finishing channel
    const channelCount = Math.max(1, channels);
    const channelCursors: number[] = new Array(channelCount).fill(workStartMin);

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const dur = allocMin[i] ?? 0;
      const passQty = allocPassQty[i] ?? 0;

      // Find earliest-finishing channel
      let minChanIdx = 0;
      for (let c = 1; c < channelCount; c++) {
        if (channelCursors[c] < channelCursors[minChanIdx]) {
          minChanIdx = c;
        }
      }

      let cursor = channelCursors[minChanIdx];
      cursor = skipLunch(cursor, lunchStartMin, lunchEndMin);
      const slotStart = cursor;
      const slotEnd = advanceCursor(cursor, dur, lunchStartMin, lunchEndMin);
      channelCursors[minChanIdx] = slotEnd;

      const [slotResult] = await conn.execute(
        `INSERT INTO h_ccp_metal_sku_slots
           (tenant_id, batch_process_run_id, sku_id, product_id, product_name, sku_name,
            channel_no, sequence_no, planned_qty, planned_pass_qty, allocated_duration_min,
            planned_start_at, planned_end_at, status)
         VALUES (?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, 'PLANNED')`,
        [
          tenantId, runId, r.skuId || null, r.productId, r.productName, r.skuName,
          minChanIdx + 1, i + 1, r.plannedQty || null, passQty || null, dur,
          toDateTime(workDate, minToTime(slotStart)),
          toDateTime(workDate, minToTime(slotEnd)),
        ],
      );
      slotMeta.push({
        id: (slotResult as any).insertId,
        sequenceNo: i + 1,
        productName: r.productName,
        startMin: slotStart,
        endMin: slotEnd,
      });
    }
  }

  // 11. Generate sensitivity checks
  const checks = generateSensitivityChecks(slotMeta, workDate, seed, lunchStartMin, lunchEndMin);

  for (const check of checks) {
    await conn.execute(
      `INSERT INTO h_ccp_metal_sensitivity_checks
         (tenant_id, batch_process_run_id, sku_slot_id, equipment_id,
          check_type, check_seq, scheduled_at,
          fe_threshold_mm, sus_threshold_mm,
          result, note)
       VALUES (?, ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          'PENDING', ?)`,
      [
        tenantId, runId, check.skuSlotId || null, equip.id,
        check.checkType, check.checkSeq, check.scheduledAt,
        equip.feSensitivity, equip.stsSensitivity,
        check.note,
      ],
    );
  }

  // 12. Also update h_ccp_metal_pass_logs (backward compatibility)
  await conn.execute(
    `DELETE FROM h_ccp_metal_pass_logs
     WHERE tenant_id = ? AND site_id = ? AND work_date = ? AND equipment_id = ?`,
    [tenantId, siteId, workDate, equip.id],
  );

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const slot = slotMeta[i];
    if (!slot) continue;

    await conn.execute(
      `INSERT INTO h_ccp_metal_pass_logs
         (tenant_id, site_id, work_date, equipment_id, sequence_no,
          batch_id, product_id, sku_id, planned_qty,
          allocated_duration_min, start_at, end_at, status)
       VALUES (?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, 'PLANNED')`,
      [
        tenantId, siteId, workDate, equip.id, i + 1,
        r.batchId, r.productId, r.skuId || null, r.plannedQty || null,
        allocMin[i] ?? 0,
        toDateTime(workDate, minToTime(slot.startMin)),
        toDateTime(workDate, minToTime(slot.endMin)),
      ],
    );
  }

  console.log(
    `[metalPassAllocator] ${workDate} batch#${batchId} equip#${equip.id}: ` +
    `${slotMeta.length} SKU slots, ${checks.length} sensitivity checks ` +
    `(mode=${mode}, offset=${randomOffset}min, totalWork=${totalWorkMin}min)`,
  );

  return {
    runId,
    equipmentId: equip.id,
    mode,
    randomOffset,
    totalWorkMin,
    skuSlotCount: slotMeta.length,
    sensitivityCheckCount: checks.length,
  };
}

// ─────────────────────────────────────────────────────────
// Backward-compatible wrapper
// ─────────────────────────────────────────────────────────

export async function allocateMetalPassLogsForDay(args: {
  tenantId: number;
  siteId: number;
  workDate: string;
  dayStartTime: string;
  metalDetectorEquipmentId?: number;
  batches: BatchSkuSummary[];
  policy: MetalAllocationPolicy;
}): Promise<{ equipmentId: number; totalMinutes: number; count: number }> {
  const { tenantId, siteId, workDate, batches, policy } = args;

  // Use first batch as the primary batch
  const primaryBatchId = batches.length > 0 ? batches[0].batchId : 0;

  const result = await generateMetalRecordFrame({
    tenantId,
    siteId,
    batchId: primaryBatchId,
    workDate,
    equipmentId: args.metalDetectorEquipmentId,
    batches,
    policy,
  });

  return {
    equipmentId: result.equipmentId,
    totalMinutes: result.totalWorkMin,
    count: result.skuSlotCount,
  };
}

// ─────────────────────────────────────────────────────────
// Deviation Handling
// ─────────────────────────────────────────────────────────

/**
 * Handle sensitivity check FAIL:
 * 1. Set run status to HOLD
 * 2. Create deviation action record
 * 3. Return action checklist
 */
export async function handleSensitivityFail(args: {
  tenantId: number;
  sensitivityCheckId: number;
  batchProcessRunId: number;
  skuSlotId?: number;
  description?: string;
  userId?: number;
}): Promise<{ deviationActionId: number; actionChecklist: string[] }> {
  const conn = await getRawConnection();
  const { tenantId, sensitivityCheckId, batchProcessRunId, skuSlotId, description, userId } = args;

  // 1. Update sensitivity check result to FAIL
  await conn.execute(
    `UPDATE h_ccp_metal_sensitivity_checks SET result = 'FAIL', checked_at = NOW()
     WHERE id = ? AND tenant_id = ?`,
    [sensitivityCheckId, tenantId],
  );

  // 2. Set run status to HOLD
  await conn.execute(
    `UPDATE h_ccp_batch_process_runs SET status = 'HOLD'
     WHERE id = ? AND tenant_id = ?`,
    [batchProcessRunId, tenantId],
  );

  // 3. If SKU slot, set it to FAIL
  if (skuSlotId) {
    await conn.execute(
      `UPDATE h_ccp_metal_sku_slots SET status = 'FAIL'
       WHERE id = ? AND tenant_id = ?`,
      [skuSlotId, tenantId],
    );
  }

  // 4. Create deviation action record
  const [daResult] = await conn.execute(
    `INSERT INTO h_ccp_deviation_actions
       (tenant_id, batch_process_run_id, sku_slot_id, sensitivity_check_id,
        deviation_type, deviation_description,
        hold_start_at, status, created_by)
     VALUES (?, ?, ?, ?,
        'SENSITIVITY_FAIL', ?,
        NOW(), 'OPEN', ?)`,
    [
      tenantId, batchProcessRunId, skuSlotId || null, sensitivityCheckId,
      description || "감도 점검 실패",
      userId || null,
    ],
  );

  const deviationActionId = (daResult as any).insertId;

  // Action checklist
  const actionChecklist = [
    "1. 금속검출기 재점검 및 재보정 실시",
    "2. 마지막 적합 판정 이후 통과된 제품 격리",
    "3. 격리 제품 재검사 실시",
    "4. 이상 원인 조사 및 기록",
    "5. 재검사 결과에 따라 폐기 또는 출하 결정",
    "6. 관리자 승인 서명 필요",
  ];

  return { deviationActionId, actionChecklist };
}

/**
 * Resolve deviation with approver signature
 */
export async function resolveDeviation(args: {
  tenantId: number;
  deviationActionId: number;
  approverId: number;
  actionTaken: string;
  disposedQty?: number;
  recheckResult?: "PASS" | "FAIL";
  resolutionNote?: string;
  approverSignature?: string;
}): Promise<{ success: boolean }> {
  const conn = await getRawConnection();
  const {
    tenantId, deviationActionId, approverId,
    actionTaken, disposedQty, recheckResult, resolutionNote, approverSignature,
  } = args;

  // Update deviation action
  await conn.execute(
    `UPDATE h_ccp_deviation_actions SET
       action_taken = ?, disposed_qty = ?, recheck_result = ?,
       resolution_note = ?, approver_signature = ?,
       approver_id = ?, approved_at = NOW(), hold_end_at = NOW(),
       status = 'RESOLVED'
     WHERE id = ? AND tenant_id = ?`,
    [
      actionTaken, disposedQty || 0, recheckResult || null,
      resolutionNote || null, approverSignature || null,
      approverId, deviationActionId, tenantId,
    ],
  );

  // If resolved, release the HOLD on the run (if no other open deviations)
  const [daRows] = await conn.execute<any[]>(
    `SELECT da.batch_process_run_id FROM h_ccp_deviation_actions da
     WHERE da.id = ? AND da.tenant_id = ?`,
    [deviationActionId, tenantId],
  );
  if ((daRows as any[]).length > 0) {
    const runId = (daRows as any[])[0].batch_process_run_id;
    if (runId) {
      const [openDeviations] = await conn.execute<any[]>(
        `SELECT COUNT(*) as cnt FROM h_ccp_deviation_actions
         WHERE batch_process_run_id = ? AND tenant_id = ? AND status IN ('OPEN', 'IN_PROGRESS')`,
        [runId, tenantId],
      );
      if ((openDeviations as any[])[0]?.cnt === 0) {
        // All deviations resolved, release HOLD
        await conn.execute(
          `UPDATE h_ccp_batch_process_runs SET status = 'RUNNING'
           WHERE id = ? AND tenant_id = ? AND status = 'HOLD'`,
          [runId, tenantId],
        );
      }
    }
  }

  return { success: true };
}
