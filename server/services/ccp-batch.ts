/**
 * 배치 생성 시 CCP 자동 생성 서비스 (v4 - 전면 재작성)
 *
 * [설계 원칙 - 스냅샷 기반]
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  BOM(품목제조보고) → 보정값 → 공정그룹 매핑                          │
 * │   - h_mf_reports / h_mf_report_versions / h_mf_ingredients          │
 * │   - i.process_group_id → ccp_process_groups                         │
 * │                                                                      │
 * │  공정그룹 (ccp_process_groups)                                       │
 * │   - id, name, ccp_type, time_min/max, temperature_min/max           │
 * │   - 설기류/약식류 공정은 별도 그룹으로 time_min 이 다름              │
 * │                                                                      │
 * │  설비기준 (equipments → ccp_process_group_equipments)               │
 * │   - 공정그룹별 설비 목록(sort_order 순 순차 할당)                    │
 * │   - default_temperature, default_pressure, batch_operation_time     │
 * │                                                                      │
 * │  생성 규칙                                                           │
 * │   CCP-1B/CCP-2B: 설비 × 배치수 = CCP rows (온도/압력/시간 설비기준)  │
 * │   CCP-4P(금속검출): Fe row 1개 + SUS row 1개 (항상 포함)            │
 * │                                                                      │
 * │  deduplication                                                       │
 * │   - 동일 배치+공정그룹 조합이 이미 존재하면 INSERT 건너뜀            │
 * │   - BOM과 수동매핑이 같은 공정그룹을 가리키면 BOM 우선 1개만 생성   │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { getRawConnection } from "../db";
import { selectBomVersion } from "../lib/identity/itemIdentityService";
import { planDay, type PlannedItem, type PlannerGroup, type PlannerItem } from "../lib/production/ccpDayPlanner";
import { loadPlanBom, loadDayBusy, type PlanBom } from "../lib/production/ccpPlanContext";
import { asProductionProductId } from "../../shared/identity/itemIds";

export interface ProcessGroupInfo {
  id: number;
  name: string;
  ccp_type: string;
  temperature_min: number | null;
  temperature_max: number | null;
  time_min: number | null;
  time_max: number | null;
  /** 공정 가열 운전시간 — ccp_time_profiles (활성 1개일 때만, 여러 개면 null = 확인 필요) */
  profile_time_min?: number | null;
  /** 활성 시간 프로필 수 — 0 / 1 / 여러 개를 구분해 계획에 넘긴다 (여러 개 ≠ 없음, 2026-10-20 검토 2) */
  profile_count?: number;
  pressure_min: number | null;
  pressure_max: number | null;
  mapping_source: "BOM" | "MANUAL" | "ALWAYS";
  ingredient_count?: number;
  /** 설비 운영 모드: sequential(순차), concurrent(동시), grouped(묶음순차) */
  equip_group_mode?: string;
  /** 설비 간 투입 간격(분) */
  equip_interval_min?: number;
  /** 묶음 크기 (1=순차 1대씩, 3=3대 동시 묶음) */
  equip_batch_size?: number;
}

export interface EquipmentAssignment {
  equipment_id: number;
  equipment_name: string;
  equipment_type: string;
  sort_order: number;
  /** 설비 기준: 온도(℃) */
  default_temperature: number | null;
  /** 설비 기준: 압력(bar) */
  default_pressure: number | null;
  /** 유휴시간 포함 1배치 총 소요 시간(분) */
  batch_operation_time: number | null;
  /** 설비 기본 가열(작업)시간(분) */
  default_time: number | null;
  /** 설비 작업 시작시각 HH:MM */
  work_start_time?: string | null;
}

/**
 * 공정그룹에 매핑된 설비 목록을 sort_order 순으로 반환
 * equipment 테이블에서 실제 설비 기준값(온도/압력/시간) 포함
 */
export async function getEquipmentsForProcessGroup(
  processGroupId: number,
  tenantId: number,
): Promise<EquipmentAssignment[]> {
  const conn = await getRawConnection();

  const [rows] = await conn.execute<any[]>(
    `SELECT
       ge.equipment_id,
       ge.sort_order,
       eq.name               AS equipment_name,
       COALESCE(eq.type, '') AS equipment_type,
       eq.default_temperature,
       eq.default_pressure,
       eq.batch_operation_time,
       eq.default_time,
       eq.work_start_time
     FROM ccp_process_group_equipments ge
     JOIN equipments eq
       ON eq.id = ge.equipment_id
      AND eq.tenant_id = ge.tenant_id
      AND eq.status = 'active'
     WHERE ge.process_group_id = ?
       AND ge.tenant_id = ?
     ORDER BY ge.sort_order, ge.equipment_id`,
    [processGroupId, tenantId],
  );

  return (rows as any[]).map((r: any) => ({
    equipment_id:        r.equipment_id,
    equipment_name:      r.equipment_name ?? `설비-${r.equipment_id}`,
    equipment_type:      r.equipment_type,
    sort_order:          Number(r.sort_order),
    default_temperature: r.default_temperature != null ? Number(r.default_temperature) : null,
    default_pressure:    r.default_pressure    != null ? Number(r.default_pressure)    : null,
    batch_operation_time:r.batch_operation_time != null ? Number(r.batch_operation_time) : null,
    default_time:        r.default_time        != null ? Number(r.default_time)        : null,
    work_start_time:     r.work_start_time ? String(r.work_start_time).slice(0, 5) : null,
  }));
}

/**
 * BOM(품목제조보고) + 수동매핑 + 금속검출(CCP-4P 항상 포함) 으로
 * 이 제품의 공정그룹 목록을 반환 (deduplication 포함)
 *
 * 우선순위:
 *  1. BOM(생산에 쓰는 버전 하나 — selectBomVersion) 의 원료 공정
 *  2. 수동매핑(ccp_process_group_products) → **BOM 이 없는 제품만** (2026-10-19)
 *     BOM 이 있으면 BOM 이 정본 — 배합에서 공정을 뺐는데 옛 수동 연결이 증숙 기록을 되살리던 문제 (단지 송편 6줄).
 *     옛 연결 데이터는 지우지 않고 읽지만 않는다 (정리는 별도 승인).
 *  3. CCP-4P(금속검출공정) → 항상 포함
 */
export async function getProcessGroupsForProduct(args: {
  productId: number;
  tenantId: number;
}): Promise<ProcessGroupInfo[]> {
  const conn = await getRawConnection();
  const { productId, tenantId } = args;

  const toInfo = (r: any, source: "BOM" | "MANUAL" | "ALWAYS"): ProcessGroupInfo => ({
    id:              Number(r.id),
    name:            r.name,
    ccp_type:        r.ccp_type,
    temperature_min: r.temperature_min != null ? Number(r.temperature_min) : null,
    temperature_max: r.temperature_max != null ? Number(r.temperature_max) : null,
    time_min:        r.time_min        != null ? Number(r.time_min)        : null,
    time_max:        r.time_max        != null ? Number(r.time_max)        : null,
    profile_time_min: Number(r.profile_count) === 1 && r.profile_time_min != null ? Number(r.profile_time_min) : null,
    profile_count:   Number(r.profile_count ?? 0) || 0,
    pressure_min:    r.pressure_min    != null ? Number(r.pressure_min)    : null,
    pressure_max:    r.pressure_max    != null ? Number(r.pressure_max)    : null,
    mapping_source:  source,
    ingredient_count: r.ingredient_count != null ? Number(r.ingredient_count) : undefined,
    equip_group_mode: r.equip_group_mode ?? "sequential",
    equip_interval_min: r.equip_interval_min != null ? Number(r.equip_interval_min) : undefined,
    equip_batch_size: r.equip_batch_size != null ? Number(r.equip_batch_size) : 1,
  });

  // ★ 방어 코드: 설비 운영 컬럼(equip_group_mode 등)이 DB에 없으면 폴백 쿼리 사용
  const hasEquipCols = await checkEquipColumns(conn);

  // 설비 컬럼 포함 여부에 따라 SELECT 절 결정
  const equipSelect = hasEquipCols
    ? `g.equip_group_mode, g.equip_interval_min, g.equip_batch_size,`
    : `'sequential' AS equip_group_mode, 10 AS equip_interval_min, 1 AS equip_batch_size,`;

  // ── 1. BOM 기반 (CCP-4P 제외: 별도로 항상 추가)
  // ★ 2026-10-16: 배치가 쓰는 품목제조보고 버전 하나의 원료 공정 지정만 (selectBomVersion).
  //   이전에는 APPROVED 버전 전부의 공정을 합쳐 — 새 버전에서 원료를 다른 공정으로 옮겨도(보고서 418 호두 공정4→1)
  //   옛 공정 CCP 기록지가 계속 생겼다. 공정 지정(NULL 포함)은 읽기만 한다.
  //   BOM product_id 가 v2 id 또는 item_master id 인 경우도 selectBomVersion 이 처리 (bomProductResolver).
  const bomPick = await selectBomVersion(asProductionProductId(productId), tenantId, conn);
  const [bomRows] = bomPick ? await conn.execute<any[]>(
    `SELECT DISTINCT
       g.id, g.name, g.ccp_type,
       g.temperature_min, g.temperature_max,
       g.time_min, g.time_max,
       (SELECT COUNT(*) FROM ccp_time_profiles tp WHERE tp.tenant_id = g.tenant_id AND tp.ccp_process_group_id = g.id AND tp.is_active = 1) AS profile_count,
       (SELECT MAX(tp.time_minutes) FROM ccp_time_profiles tp WHERE tp.tenant_id = g.tenant_id AND tp.ccp_process_group_id = g.id AND tp.is_active = 1) AS profile_time_min,
       g.pressure_min, g.pressure_max,
       ${equipSelect}
       COUNT(i.id) AS ingredient_count
     FROM h_mf_ingredients i
     JOIN ccp_process_groups g
       ON g.id = i.process_group_id
      AND g.tenant_id = ?
      AND g.status = 'active'
      AND g.ccp_type != 'CCP-4P'
     WHERE i.mf_report_version_id = ?
       AND i.process_group_id IS NOT NULL
     GROUP BY g.id
     ORDER BY g.ccp_type, g.sort_order, g.id`,
    [tenantId, bomPick.versionId],
  ) : [[] as any[]];

  // ── 2. 수동 매핑 (ccp_process_group_products) — BOM 이 없는 제품만
  const [manualRows] = bomPick ? [[] as any[]] : await conn.execute<any[]>(
    `SELECT
       g.id, g.name, g.ccp_type,
       g.temperature_min, g.temperature_max,
       g.time_min, g.time_max,
       (SELECT COUNT(*) FROM ccp_time_profiles tp WHERE tp.tenant_id = g.tenant_id AND tp.ccp_process_group_id = g.id AND tp.is_active = 1) AS profile_count,
       (SELECT MAX(tp.time_minutes) FROM ccp_time_profiles tp WHERE tp.tenant_id = g.tenant_id AND tp.ccp_process_group_id = g.id AND tp.is_active = 1) AS profile_time_min,
       g.pressure_min, g.pressure_max,
       ${equipSelect}
       NULL AS ingredient_count
     FROM ccp_process_group_products gp
     JOIN ccp_process_groups g
       ON g.id = gp.process_group_id
      AND g.tenant_id = ?
      AND g.status = 'active'
      AND g.ccp_type != 'CCP-4P'
     WHERE gp.product_id = ?
       AND gp.tenant_id = ?
     ORDER BY g.ccp_type, g.sort_order, g.id`,
    [tenantId, productId, tenantId],
  );

  // ── 3. CCP-4P (금속검출) 항상 포함
  const [metalRows] = await conn.execute<any[]>(
    `SELECT
       g.id, g.name, g.ccp_type,
       g.temperature_min, g.temperature_max,
       g.time_min, g.time_max,
       (SELECT COUNT(*) FROM ccp_time_profiles tp WHERE tp.tenant_id = g.tenant_id AND tp.ccp_process_group_id = g.id AND tp.is_active = 1) AS profile_count,
       (SELECT MAX(tp.time_minutes) FROM ccp_time_profiles tp WHERE tp.tenant_id = g.tenant_id AND tp.ccp_process_group_id = g.id AND tp.is_active = 1) AS profile_time_min,
       g.pressure_min, g.pressure_max,
       ${equipSelect}
       NULL AS ingredient_count
     FROM ccp_process_groups g
     WHERE g.tenant_id = ?
       AND g.ccp_type = 'CCP-4P'
       AND g.status = 'active'
     ORDER BY g.sort_order, g.id`,
    [tenantId],
  );

  const bomInfos    = (bomRows    as any[]).map(r => toInfo(r, "BOM"));
  const manualInfos = (manualRows as any[]).map(r => toInfo(r, "MANUAL"));
  const metalInfos  = (metalRows  as any[]).map(r => toInfo(r, "ALWAYS"));

  // dedup: BOM 우선, 수동은 BOM에 없는 것만
  const seenIds = new Set(bomInfos.map(g => g.id));
  const uniqueManual = manualInfos.filter(g => !seenIds.has(g.id));
  uniqueManual.forEach(g => seenIds.add(g.id));

  // 금속검출: 이미 있으면 skip
  const uniqueMetal = metalInfos.filter(g => !seenIds.has(g.id));

  // 순서: BOM → 수동 → 금속검출
  const result = [...bomInfos, ...uniqueManual, ...uniqueMetal];
  console.log(`[ccp-batch] getProcessGroupsForProduct(${productId}): ${result.length}건 (BOM=${bomInfos.length}, MANUAL=${uniqueManual.length}, METAL=${uniqueMetal.length})`);
  return result;
}

/**
 * ccp_process_groups 테이블에 equip_group_mode 컬럼이 있는지 확인
 * 없으면 false → SELECT에서 기본값 리터럴 사용
 */
let _equipColsChecked: boolean | null = null;
async function checkEquipColumns(conn: any): Promise<boolean> {
  if (_equipColsChecked !== null) return _equipColsChecked;
  try {
    await conn.execute(`SELECT equip_group_mode FROM ccp_process_groups LIMIT 0`);
    _equipColsChecked = true;
  } catch {
    console.warn("[ccp-batch] ccp_process_groups에 equip_group_mode 컬럼 없음 → 기본값 사용");
    _equipColsChecked = false;
  }
  return _equipColsChecked;
}

/** CCP-4P: 감도 시편 Fe + SUS 2행 (하루 통과 배분은 기록지 동기화가 따로) */
async function createMetalTestRows(instanceId: number, conn: any, tenantId: number): Promise<void> {
  const tests = [
    { sortOrder: 1, note: "Fe (철) 기준 시편 검출 테스트" },
    { sortOrder: 2, note: "SUS (스테인리스) 기준 시편 검출 테스트" },
  ];
  for (const t of tests) {
    await conn.execute(
      `INSERT INTO h_ccp_rows
         (instance_id, sort_order, row_type, result, note, auto_generated, tenant_id)
       VALUES (?, ?, 'measurement', 'PASS', ?, 1, ?)`,
      [instanceId, t.sortOrder, t.note, tenantId],
    );
  }
}

/**
 * 가열공정(1B/2B) h_ccp_rows — 하루 계획(planDay) 그대로 (2026-10-18, PR-B)
 *
 *  행 = 회차. 설비·가열 운전시간·설비 점유·설정온도·설정압력(MPa→bar ×10)·예정 시작/끝·예정 투입량을 계획에서 받는다.
 *  예정 시작/끝·예정 투입량(planned_*)은 계획 스냅샷이다 — 기록지 동기화가 그대로 읽어 미리보기와 같은 값이 된다.
 *  한계기준(CL)은 판정용 — 설정값 칸을 한계기준 하한으로 채우지 않는다 (이전: 설비 값이 없으면 CL 하한).
 *  계획 컬럼이 없는 DB 에서는 planned_* 없이 저장한다.
 */
export async function insertPlannedRows(instanceId: number, process: PlannedItem["processes"][number], conn: any, tenantId: number): Promise<void> {
  for (const r of process.rounds) {
    const base = [instanceId, r.roundNo, r.equipmentId, r.equipmentName, r.seq, r.tempC, r.occupancyMin, r.heatingMin, r.cycleTotalMin, r.pressureBar];
    try {
      await conn.execute(
        `INSERT INTO h_ccp_rows
           (instance_id, batch_no, equipment_id, equipment_name, sort_order,
            row_type, temp_c, duration_min, heating_min, cycle_total_min,
            pressure_bar, result, auto_generated, tenant_id, planned_start, planned_end, planned_input_kg)
         VALUES (?, ?, ?, ?, ?, 'measurement', ?, ?, ?, ?, ?, 'PASS', 1, ?, ?, ?, ?)`,
        [...base, tenantId, r.plannedStart, r.plannedEnd, r.inputKg],
      );
    } catch (e: any) {
      if (e?.code !== "ER_BAD_FIELD_ERROR") throw e;
      await conn.execute(
        `INSERT INTO h_ccp_rows
           (instance_id, batch_no, equipment_id, equipment_name, sort_order,
            row_type, temp_c, duration_min, heating_min, cycle_total_min,
            pressure_bar, result, auto_generated, tenant_id)
         VALUES (?, ?, ?, ?, ?, 'measurement', ?, ?, ?, ?, ?, 'PASS', 1, ?)`,
        [...base, tenantId],
      );
    }
  }
}

/** 공정그룹 정보 → 계획 입력 (가열공정만) */
export function toPlannerGroup(g: ProcessGroupInfo, equipments: EquipmentAssignment[]): PlannerGroup {
  const mode = g.equip_group_mode === "concurrent" || g.equip_group_mode === "grouped" ? g.equip_group_mode : "sequential";
  return {
    id: g.id, name: g.name, ccpType: g.ccp_type, mappingSource: g.mapping_source, mode,
    intervalMin: g.equip_interval_min ?? 10,
    batchSize: Math.max(1, g.equip_batch_size ?? 1),
    profileTimeMin: g.profile_time_min ?? null,
    profileCount: g.profile_count ?? (g.profile_time_min != null ? 1 : 0),
    equipments: equipments.map((e) => ({
      id: e.equipment_id, name: e.equipment_name, sortOrder: e.sort_order,
      defaultTemperature: e.default_temperature, defaultPressureMpa: e.default_pressure,
      cycleTotalMin: e.batch_operation_time, defaultTimeMin: e.default_time,
      workStartTime: e.work_start_time ?? null,
    })),
    workStartTime: equipments[0]?.work_start_time ?? null,
  };
}

export interface PlanRowInput {
  rowKey: string;
  productId: number;
  plannedKg: number;
  /** 배치 시작시각 HH:MM */
  startTime: string;
  /** 오늘만 바꾼 시작시각 (설비 작업 시작보다 우선) */
  startTimeOverride?: string | null;
}

export interface PlanRowMeta {
  rowKey: string;
  groups: ProcessGroupInfo[];
  bom: PlanBom;
}

/**
 * 하루 계획 — 미리보기와 배치 생성이 같이 쓴다. 읽기만 한다.
 *   rows 순서대로 설비를 배정하고, 오늘 이미 저장된 배치(excludeBatchId 제외)가 쓰는 설비 시각을 피한다.
 */
export async function planCcpForDay(args: {
  tenantId: number;
  workDate: string;
  rows: PlanRowInput[];
  excludedEquipmentIds?: number[];
  excludeBatchId?: number | null;
  /** 생산 설계 시험 계산 — 그날 이미 잡힌 생산 없이 빈 공장으로 계산 (읽기만) */
  ignoreBusy?: boolean;
}): Promise<{ plans: PlannedItem[]; meta: PlanRowMeta[] }> {
  const conn = await getRawConnection();
  const items: PlannerItem[] = [];
  const meta: PlanRowMeta[] = [];
  for (const row of args.rows) {
    const groups = await getProcessGroupsForProduct({ productId: row.productId, tenantId: args.tenantId });
    const bom = await loadPlanBom(conn, args.tenantId, row.productId, row.plannedKg);
    const heat: PlannerGroup[] = [];
    for (const g of groups) {
      if (g.ccp_type === "CCP-4P") continue;
      heat.push(toPlannerGroup(g, await getEquipmentsForProcessGroup(g.id, args.tenantId)));
    }
    items.push({
      rowKey: row.rowKey, productId: row.productId, plannedKg: row.plannedKg, startTime: row.startTime,
      startTimeOverride: row.startTimeOverride ?? null, subBatchKg: bom.subBatchKg, inputByGroup: bom.inputByGroup, groups: heat,
    });
    meta.push({ rowKey: row.rowKey, groups, bom });
  }
  const busy = args.ignoreBusy ? [] : await loadDayBusy(conn, args.tenantId, args.workDate, args.excludeBatchId ?? null);
  return { plans: planDay(items, { busy, excludedEquipmentIds: args.excludedEquipmentIds }), meta };
}

/**
 * 배치 생성 시 CCP 인스턴스 + 설비별 기본 행 자동 생성 (메인)
 *
 * - BOM → 수동 → 금속검출 순으로 공정그룹 결정
 * - 동일 batch_id + process_group_id 조합은 dedup (중복 생성 방지)
 * - 각 인스턴스에 설비별 기본값이 채워진 CCP row 자동 삽입
 */
export async function autoCreateCcpInstancesForBatch(args: {
  siteId: number;
  workDate: string;
  batchId: number;
  productId?: number;
  productName: string;
  createdBy?: number;
  tenantId?: number;
  plannedQuantity?: number;
  /** @deprecated 회차 기준량은 배치가 쓰는 BOM 버전에서 읽는다 (결함 #11). 넘겨도 쓰지 않는다. */
  bomBatchKg?: number;
  /** 오늘만 바꾼 시작시각 (설비 작업 시작보다 우선) */
  startTimeOverride?: string | null;
  /** 오늘만 쓰지 않는 설비 */
  excludedEquipmentIds?: number[];
}): Promise<{ instanceIds: number[]; groups: ProcessGroupInfo[]; plan: PlannedItem | null; subBatchKg: number | null }> {
  const {
    siteId, workDate, batchId,
    productId, productName,
    createdBy, tenantId = 1,
    plannedQuantity,
  } = args;

  const conn = await getRawConnection();

  // 계획량 · 배치 시작시각 (배치에 저장된 값)
  let plannedKg = plannedQuantity ?? 0;
  let startTime = "09:00";
  try {
    const [bRows] = await conn.execute<any[]>(
      `SELECT planned_quantity, DATE_FORMAT(start_time, '%H:%i') AS st FROM h_batches WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [batchId, tenantId],
    );
    const b = (bRows as any[])[0];
    if (!plannedKg && b?.planned_quantity) plannedKg = parseFloat(b.planned_quantity);
    if (b?.st) startTime = String(b.st);
  } catch { /* ignore */ }

  // ── 1. 이미 생성된 공정그룹 ID 조회 (dedup)
  const [existingRows] = await conn.execute<any[]>(
    `SELECT process_group_id FROM h_ccp_instances
     WHERE batch_id = ? AND tenant_id = ?`,
    [batchId, tenantId],
  );
  const existingGroupIds = new Set(
    (existingRows as any[]).map(r => Number(r.process_group_id)),
  );

  // ── 2. 공정그룹 + 하루 계획 (미리보기와 같은 함수 — planCcpForDay). 오늘 이미 저장된 다른 배치의 설비 시각을 피한다.
  let groups: ProcessGroupInfo[] = [];
  let plan: PlannedItem | null = null;
  let subBatchKg: number | null = null;

  if (productId) {
    try {
      const day = await planCcpForDay({
        tenantId, workDate,
        rows: [{ rowKey: `batch-${batchId}`, productId, plannedKg, startTime, startTimeOverride: args.startTimeOverride ?? null }],
        excludedEquipmentIds: args.excludedEquipmentIds,
        excludeBatchId: batchId,
      });
      groups = day.meta[0]?.groups ?? [];
      plan = day.plans[0] ?? null;
      subBatchKg = day.meta[0]?.bom.subBatchKg ?? null;
      console.log(`[ccp-batch] 계획: batch=${batchId} 회차=${plan?.roundsCount} (planned=${plannedKg}kg, BOM 버전=${day.meta[0]?.bom.versionId ?? "-"}, 1회차=${day.meta[0]?.bom.subBatchKg ?? "-"}kg)`);
    } catch (err: any) {
      console.error(`[ccp-batch] ★ 공정그룹·계획 조회 실패 (productId=${productId}, tenantId=${tenantId}):`, err?.message || err);
      console.error("[ccp-batch] SQL 오류 시 ccp_process_groups 테이블 스키마를 확인하세요 (equip_group_mode, equip_interval_min, equip_batch_size 컬럼 필요)");
    }
  }

  // 폴백: 제품 매핑 없으면 금속검출만
  if (groups.length === 0) {
    console.warn(`[ccp-batch] productId=${productId} → BOM/수동 공정그룹 없음, 금속검출만 생성`);
    const [fb] = await conn.execute<any[]>(
      `SELECT id, name, ccp_type,
              temperature_min, temperature_max, time_min, time_max,
              pressure_min, pressure_max
       FROM ccp_process_groups
       WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND status = 'active'
       ORDER BY sort_order, id LIMIT 1`,
      [tenantId],
    );
    if ((fb as any[]).length > 0) {
      const r = (fb as any[])[0];
      groups = [{
        id: Number(r.id), name: r.name, ccp_type: r.ccp_type,
        temperature_min: r.temperature_min != null ? Number(r.temperature_min) : null,
        temperature_max: r.temperature_max != null ? Number(r.temperature_max) : null,
        time_min:        r.time_min        != null ? Number(r.time_min)        : null,
        time_max:        r.time_max        != null ? Number(r.time_max)        : null,
        pressure_min:    r.pressure_min    != null ? Number(r.pressure_min)    : null,
        pressure_max:    r.pressure_max    != null ? Number(r.pressure_max)    : null,
        mapping_source: "ALWAYS" as const,
      }];
    }
  }

  const instanceIds: number[] = [];
  const createdGroups: ProcessGroupInfo[] = [];
  const skippedGroups: ProcessGroupInfo[] = [];  // ★ 2026-04-15: 이미 존재하는 그룹도 별도 추적

  for (const group of groups) {
    // ── 3. dedup: 이미 이 공정그룹 인스턴스가 있으면 skip
    if (existingGroupIds.has(group.id)) {
      console.log(`[ccp-batch] 건너뜀(중복): group="${group.name}" batchId=${batchId}`);
      skippedGroups.push(group);
      continue;
    }

    try {
      // ── 4. CCP 인스턴스 생성
      const [ins] = await conn.execute(
        `INSERT INTO h_ccp_instances
           (site_id, work_date, ccp_type, process_group_id,
            product_name, product_id, batch_id,
            status, created_by, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
        [
          siteId, workDate, group.ccp_type, group.id,
          productName || null, productId ?? null, batchId,
          createdBy ?? null, tenantId,
        ],
      );

      const instanceId = Number((ins as any).insertId);
      instanceIds.push(instanceId);
      existingGroupIds.add(group.id); // 다음 반복에서 중복 방지

      // ── 5. 행: 금속검출은 감도 시편 2행, 가열공정은 계획 그대로
      if (group.ccp_type === "CCP-4P") {
        await createMetalTestRows(instanceId, conn, tenantId);
      } else {
        const proc = plan?.processes.find((p) => p.processGroupId === group.id);
        if (proc) await insertPlannedRows(instanceId, proc, conn, tenantId);
        else console.warn(`[ccp-batch] 계획 없음 — 행 없이 인스턴스만: group="${group.name}" batchId=${batchId}`);
        console.log(`[ccp-batch] ✓ "${group.name}"(${group.ccp_type}) instanceId=${instanceId} rows=${proc?.rounds.length ?? 0} [${group.mapping_source}] batchId=${batchId}`);
      }

      createdGroups.push(group);
    } catch (err) {
      console.error(`[ccp-batch] 인스턴스 생성 실패 (group=${group.name}):`, err);
    }
  }

  // ★ 2026-04-15: 모든 그룹 반환 (신규 + 기존)
  //   form_records 생성 로직이 existingGroups 를 포함해야 form_record 가 누락되지 않음
  //   이전 버그: 배치 재생성 / recovery 후 instance 만 존재하면 groups=[] 반환 → form_record 생성 스킵
  const allGroups = [...createdGroups, ...skippedGroups];
  console.log(`[ccp-batch] 리턴: new instances=${instanceIds.length}, all groups=${allGroups.length} (created=${createdGroups.length}, existing=${skippedGroups.length})`);
  return { instanceIds, groups: allGroups, plan, subBatchKg };
}
