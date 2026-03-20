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

export interface ProcessGroupInfo {
  id: number;
  name: string;
  ccp_type: string;
  temperature_min: number | null;
  temperature_max: number | null;
  time_min: number | null;
  time_max: number | null;
  pressure_min: number | null;
  pressure_max: number | null;
  mapping_source: "BOM" | "MANUAL" | "ALWAYS";
  ingredient_count?: number;
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
       eq.default_time
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
  }));
}

/**
 * BOM(품목제조보고) + 수동매핑 + 금속검출(CCP-4P 항상 포함) 으로
 * 이 제품의 공정그룹 목록을 반환 (deduplication 포함)
 *
 * 우선순위:
 *  1. BOM(APPROVED 버전) 기반 공정그룹  → BOM 우선
 *  2. 수동매핑(ccp_process_group_products) → BOM에 없는 것만 추가
 *  3. CCP-4P(금속검출공정) → BOM/수동에 없어도 항상 포함
 */
export async function getProcessGroupsForProduct(args: {
  productId: number;
  tenantId: number;
}): Promise<ProcessGroupInfo[]> {
  const conn = await getRawConnection();
  const { productId, tenantId } = args;

  // ── 1. BOM 기반 (CCP-4P 제외: 별도로 항상 추가)
  const [bomRows] = await conn.execute<any[]>(
    `SELECT DISTINCT
       g.id, g.name, g.ccp_type,
       g.temperature_min, g.temperature_max,
       g.time_min, g.time_max,
       g.pressure_min, g.pressure_max,
       COUNT(i.id) AS ingredient_count
     FROM h_mf_reports r
     JOIN h_mf_report_versions v
       ON v.mf_report_id = r.id
      AND v.approval_status = 'APPROVED'
     JOIN h_mf_ingredients i
       ON i.mf_report_version_id = v.id
      AND i.process_group_id IS NOT NULL
     JOIN ccp_process_groups g
       ON g.id = i.process_group_id
      AND g.tenant_id = ?
      AND g.status = 'active'
      AND g.ccp_type != 'CCP-4P'
     WHERE r.product_id = ?
       AND r.tenant_id = ?
     GROUP BY g.id
     ORDER BY g.ccp_type, g.sort_order, g.id`,
    [tenantId, productId, tenantId],
  );

  // ── 2. 수동 매핑 (ccp_process_group_products)
  const [manualRows] = await conn.execute<any[]>(
    `SELECT
       g.id, g.name, g.ccp_type,
       g.temperature_min, g.temperature_max,
       g.time_min, g.time_max,
       g.pressure_min, g.pressure_max,
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
       g.pressure_min, g.pressure_max,
       NULL AS ingredient_count
     FROM ccp_process_groups g
     WHERE g.tenant_id = ?
       AND g.ccp_type = 'CCP-4P'
       AND g.status = 'active'
     ORDER BY g.sort_order, g.id`,
    [tenantId],
  );

  const toInfo = (r: any, source: "BOM" | "MANUAL" | "ALWAYS"): ProcessGroupInfo => ({
    id:              Number(r.id),
    name:            r.name,
    ccp_type:        r.ccp_type,
    temperature_min: r.temperature_min != null ? Number(r.temperature_min) : null,
    temperature_max: r.temperature_max != null ? Number(r.temperature_max) : null,
    time_min:        r.time_min        != null ? Number(r.time_min)        : null,
    time_max:        r.time_max        != null ? Number(r.time_max)        : null,
    pressure_min:    r.pressure_min    != null ? Number(r.pressure_min)    : null,
    pressure_max:    r.pressure_max    != null ? Number(r.pressure_max)    : null,
    mapping_source:  source,
    ingredient_count: r.ingredient_count != null ? Number(r.ingredient_count) : undefined,
  });

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
  return [...bomInfos, ...uniqueManual, ...uniqueMetal];
}

/**
 * 공정그룹 × 설비 → h_ccp_rows 자동 생성
 *
 * ── 시간 계산 원칙 ─────────────────────────────────────────────────
 *  heating_min    = ccp_process_groups.time_min (공정별 가열시간)
 *  cycle_total    = equipments.batch_operation_time (설비 유휴포함 사이클)
 *  eq_default_heat= equipments.default_time (설비 기본 가열시간)
 *  duration_min   = cycle_total + (heating_min - eq_default_heat)
 *
 *  예) 교반기(사이클70, 기본가열10) + 교반-가열공정(가열10)
 *      → 70 + (10 - 10) = 70분
 *  예) 증숙기(사이클22, 기본가열10) + 증숙(약식류)공정(가열35)
 *      → 22 + (35 - 10) = 47분
 * ────────────────────────────────────────────────────────────────────
 *
 * ── 압력 단위 변환 ───────────────────────────────────────────────
 *  설비기준: equipments.default_pressure (MPa 단위)
 *  공정기준: ccp_process_groups.pressure_min (MPa 단위)
 *  h_ccp_rows.pressure_bar 컬럼 → bar 로 저장
 *  MPa → bar: × 10
 * ────────────────────────────────────────────────────────────────────
 */
async function createCcpRowsForGroup(
  instanceId: number,
  group: ProcessGroupInfo,
  equipments: EquipmentAssignment[],
  conn: any,
  tenantId: number,
  batchCount: number = 1,
): Promise<void> {
  // ── CCP-4P: Fe + SUS 2행
  if (group.ccp_type === "CCP-4P") {
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
    return;
  }

  // ── CCP-1B / CCP-2B: 설비 없으면 공정 한계기준으로 3행 생성 (폴백)
  if (equipments.length === 0) {
    const tempC        = group.temperature_min != null ? group.temperature_min.toString() : null;
    // MPa → bar
    const pressureBar  = group.pressure_min != null ? (group.pressure_min * 10).toFixed(2) : null;
    const heatingMin   = group.time_min ?? 10;

    let sortIdx = 0;
    for (let bn = 1; bn <= batchCount; bn++) {
      for (let i = 1; i <= 3; i++) {
        sortIdx++;
        await conn.execute(
          `INSERT INTO h_ccp_rows
             (instance_id, batch_no, sort_order, row_type, temp_c, duration_min,
              heating_min, cycle_total_min, pressure_bar,
              result, auto_generated, tenant_id)
           VALUES (?, ?, ?, 'measurement', ?, ?,
                   ?, NULL, ?, 'PASS', 1, ?)`,
          [instanceId, bn, sortIdx, tempC, heatingMin, heatingMin, pressureBar, tenantId],
        );
      }
    }
    return;
  }

  // ── 배치수 × 설비 = N행 (batchCount 기반)
  let sortIdx = 0;
  for (let bn = 1; bn <= batchCount; bn++) {
    for (let idx = 0; idx < equipments.length; idx++) {
      const eq = equipments[idx];
      sortIdx++;

      // 온도: 설비기준 우선 → 공정 한계기준 폴백
      const tempC =
        eq.default_temperature != null
          ? eq.default_temperature.toString()
          : group.temperature_min != null
            ? group.temperature_min.toString()
            : null;

      // 압력: 설비기준(MPa→bar) 우선 → 공정기준(MPa→bar) 폴백
      // equipments.default_pressure는 MPa 단위이므로 ×10 으로 bar 변환
      const pressureBar =
        eq.default_pressure != null
          ? (eq.default_pressure * 10).toFixed(2)
          : group.pressure_min != null
            ? (group.pressure_min * 10).toFixed(2)
            : null;

      // 시간 계산
      const heatingMin     = group.time_min    ?? eq.default_time ?? 10;
      const cycleTotalMin  = eq.batch_operation_time ?? null;
      const eqDefaultHeat  = eq.default_time ?? heatingMin;
      const durationMin    =
        cycleTotalMin != null
          ? cycleTotalMin + (heatingMin - eqDefaultHeat)
          : heatingMin;

      await conn.execute(
        `INSERT INTO h_ccp_rows
           (instance_id, batch_no, equipment_id, equipment_name, sort_order,
            row_type, temp_c, duration_min, heating_min, cycle_total_min,
            pressure_bar, result, auto_generated, tenant_id)
         VALUES (?, ?, ?, ?, ?, 'measurement', ?, ?, ?, ?,
                 ?, 'PASS', 1, ?)`,
        [
          instanceId,
          bn,
          eq.equipment_id,
          eq.equipment_name,
          sortIdx,
          tempC,
          durationMin,
          heatingMin,
          cycleTotalMin,
          pressureBar,
          tenantId,
        ],
      );
    }
  }
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
  bomBatchKg?: number;
}): Promise<{ instanceIds: number[]; groups: ProcessGroupInfo[] }> {
  const {
    siteId, workDate, batchId,
    productId, productName,
    createdBy, tenantId = 1,
    plannedQuantity, bomBatchKg,
  } = args;

  // batch_count 계산: 총생산량 / BOM 1배치 기준 중량
  let batchCount = 1;
  let _plannedQty = plannedQuantity;
  let _bomBatchKg = bomBatchKg;

  const conn = await getRawConnection();

  // plannedQuantity 미전달 시 h_batches에서 조회
  if (!_plannedQty && batchId) {
    try {
      const [bRows] = await conn.execute<any[]>(
        `SELECT planned_quantity FROM h_batches WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [batchId, tenantId],
      );
      if ((bRows as any[]).length > 0 && (bRows as any[])[0]?.planned_quantity) {
        _plannedQty = parseFloat((bRows as any[])[0].planned_quantity);
      }
    } catch { /* ignore */ }
  }

  // bomBatchKg 미전달 시 BOM에서 조회
  if (!_bomBatchKg && productId) {
    try {
      const [vRows] = await conn.execute<any[]>(
        `SELECT v.batch_target_kg
         FROM h_mf_reports r
         JOIN h_mf_report_versions v ON v.mf_report_id = r.id AND v.approval_status = 'APPROVED'
         WHERE r.product_id = ? AND r.tenant_id = ?
         ORDER BY v.id DESC LIMIT 1`,
        [productId, tenantId],
      );
      if ((vRows as any[]).length > 0 && (vRows as any[])[0]?.batch_target_kg) {
        _bomBatchKg = parseFloat((vRows as any[])[0].batch_target_kg);
      }
    } catch { /* ignore */ }
  }

  if (_bomBatchKg && _bomBatchKg > 0 && _plannedQty && _plannedQty > 0) {
    batchCount = Math.ceil(_plannedQty / _bomBatchKg);
    if (batchCount < 1) batchCount = 1;
  }
  console.log(`[ccp-batch] batchCount=${batchCount} (planned=${_plannedQty}kg, bomBatch=${_bomBatchKg}kg)`);

  // ── 1. 이미 생성된 공정그룹 ID 조회 (dedup)
  const [existingRows] = await conn.execute<any[]>(
    `SELECT process_group_id FROM h_ccp_instances
     WHERE batch_id = ? AND tenant_id = ?`,
    [batchId, tenantId],
  );
  const existingGroupIds = new Set(
    (existingRows as any[]).map(r => Number(r.process_group_id)),
  );

  // ── 2. 공정그룹 목록 결정
  let groups: ProcessGroupInfo[] = [];

  if (productId) {
    try {
      groups = await getProcessGroupsForProduct({ productId, tenantId });
    } catch (err) {
      console.error("[ccp-batch] 공정그룹 조회 실패:", err);
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

  for (const group of groups) {
    // ── 3. dedup: 이미 이 공정그룹 인스턴스가 있으면 skip
    if (existingGroupIds.has(group.id)) {
      console.log(`[ccp-batch] 건너뜀(중복): group="${group.name}" batchId=${batchId}`);
      continue;
    }

    try {
      // ── 4. 설비 목록 조회
      const equipments = await getEquipmentsForProcessGroup(group.id, tenantId);

      // ── 5. CCP 인스턴스 생성
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

      // ── 6. 배치수 × 설비별 기본 행 생성 (CCP-4P 제외: batch_count 무시)
      const groupBatchCount = group.ccp_type === 'CCP-4P' ? 1 : batchCount;
      await createCcpRowsForGroup(instanceId, group, equipments, conn, tenantId, groupBatchCount);

      console.log(
        `[ccp-batch] ✓ "${group.name}"(${group.ccp_type}) ` +
        `instanceId=${instanceId} equipments=${equipments.length}대 ` +
        `batchCount=${groupBatchCount} rows=${groupBatchCount * (group.ccp_type === 'CCP-4P' ? 2 : equipments.length || 3)} ` +
        `[${group.mapping_source}] batchId=${batchId}`,
      );

      createdGroups.push(group);
    } catch (err) {
      console.error(`[ccp-batch] 인스턴스 생성 실패 (group=${group.name}):`, err);
    }
  }

  return { instanceIds, groups: createdGroups };
}
