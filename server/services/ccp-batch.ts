/**
 * 배치 생성 시 CCP 자동 생성 서비스 (v3)
 *
 * [설계 원칙]
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  설비기준 (equipment_master)                                     │
 * │   - 온도(default_temperature), 압력(default_pressure)            │
 * │   - 설비는 물리적으로 일정한 컨디션을 유지                         │
 * │                                                                  │
 * │  공정기준 (ccp_process_groups / ccp_time_profiles)               │
 * │   - 시간(time_min/time_max, batch_operation_time)                │
 * │   - 제품 종류에 따라 가열시간이 다름                               │
 * │                                                                  │
 * │  설비 순차 할당                                                   │
 * │   - ccp_process_group_equipments.sort_order 순으로 배치          │
 * │   - 교반기 1→2→3, 증숙기 1→2→3→4→5→6 순차 사용                  │
 * │   - h_ccp_rows 1행 = 설비 1대의 1회 측정                         │
 * └─────────────────────────────────────────────────────────────────┘
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
  mapping_source: "BOM" | "MANUAL";
  ingredient_count?: number;
}

export interface EquipmentAssignment {
  equipment_id: number;
  equipment_name: string;
  equipment_type: string;
  sort_order: number;
  /** 설비 기준: 온도(℃), 압력(bar) */
  default_temperature: number | null;
  default_pressure: number | null;
  /** 공정 기준: 유휴시간 포함 1배치 소요 시간(분) */
  batch_operation_time: number | null;
  default_time: number | null;
}

/**
 * 공정그룹에 매핑된 설비 목록을 sort_order 순으로 반환
 * equipment_master 기준값(온도/압력/시간) 포함
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
       COALESCE(em.equipment_name, h.equipment_name, CONCAT('설비-', ge.equipment_id)) AS equipment_name,
       COALESCE(em.equipment_type, h.equipment_type, '') AS equipment_type,
       em.default_temperature   AS default_temperature,
       em.default_pressure      AS default_pressure,
       em.batch_operation_time  AS batch_operation_time,
       em.default_time          AS default_time
     FROM ccp_process_group_equipments ge
     LEFT JOIN equipment_master em
       ON em.id = ge.equipment_id
     LEFT JOIN h_equipment h
       ON h.id = ge.equipment_id AND h.tenant_id = ?
     WHERE ge.process_group_id = ?
       AND ge.tenant_id = ?
     ORDER BY ge.sort_order`,
    [tenantId, processGroupId, tenantId],
  );

  return (rows as any[]).map((r: any) => ({
    equipment_id:        r.equipment_id,
    equipment_name:      r.equipment_name,
    equipment_type:      r.equipment_type,
    sort_order:          r.sort_order,
    default_temperature: r.default_temperature != null ? Number(r.default_temperature) : null,
    default_pressure:    r.default_pressure    != null ? Number(r.default_pressure)    : null,
    batch_operation_time:r.batch_operation_time!= null ? Number(r.batch_operation_time): null,
    default_time:        r.default_time        != null ? Number(r.default_time)        : null,
  }));
}

/**
 * BOM + 수동매핑으로 이 제품의 공정그룹 목록을 반환
 *
 * [시간 결정 원칙]
 * - ccp_process_groups.time_min 이 이미 공정그룹별 가열시간을 정의함
 *   예) 증숙(약식류)공정 time_min=35, 증숙(설기류)공정 time_min=10
 * - BOM(h_mf_ingredients.process_group_id)에서 제품→공정그룹이 연결되므로
 *   제품별 시간은 공정그룹 자체로 이미 분리되어 있음
 * - ccp_time_profiles / ccp_product_time_profile_map 은 UI 참조용이며
 *   배치 생성 로직에서 time_min을 중복 오버라이드하지 않음
 */
export async function getProcessGroupsForProduct(args: {
  productId: number;
  tenantId: number;
}): Promise<ProcessGroupInfo[]> {
  const conn = await getRawConnection();
  const { productId, tenantId } = args;

  const [bomRows] = await conn.execute<any[]>(
    `SELECT DISTINCT
       g.id, g.name, g.ccp_type,
       g.temperature_min, g.temperature_max,
       g.time_min, g.time_max,
       g.pressure_min, g.pressure_max,
       'BOM' AS mapping_source,
       COUNT(i.id) AS ingredient_count
     FROM h_mf_reports r
     JOIN h_mf_report_versions v
       ON v.mf_report_id = r.id AND v.approval_status = 'APPROVED'
     JOIN h_mf_ingredients i
       ON i.mf_report_version_id = v.id AND i.process_group_id IS NOT NULL
     JOIN ccp_process_groups g
       ON g.id = i.process_group_id AND g.tenant_id = ? AND g.status = 'active'
       AND g.ccp_type != 'CCP-4P'
     WHERE r.product_id = ? AND r.tenant_id = ?
     GROUP BY g.id
     ORDER BY g.ccp_type, g.sort_order, g.id`,
    [tenantId, productId, tenantId],
  );

  const [manualRows] = await conn.execute<any[]>(
    `SELECT
       g.id, g.name, g.ccp_type,
       g.temperature_min, g.temperature_max,
       g.time_min, g.time_max,
       g.pressure_min, g.pressure_max,
       'MANUAL' AS mapping_source,
       NULL AS ingredient_count
     FROM ccp_process_group_products gp
     JOIN ccp_process_groups g
       ON g.id = gp.process_group_id AND g.tenant_id = ? AND g.status = 'active'
     WHERE gp.product_id = ? AND gp.tenant_id = ?
     ORDER BY g.ccp_type, g.sort_order, g.id`,
    [tenantId, productId, tenantId],
  );

  const toInfo = (r: any, source: "BOM" | "MANUAL"): ProcessGroupInfo => {
    const groupId = Number(r.id);
    // time_min은 ccp_process_groups에 이미 공정그룹별로 설정된 값을 그대로 사용
    // (증숙(약식류)=35분, 증숙(설기류)=10분 등 공정그룹 자체가 제품별로 분리됨)
    return {
      id:               groupId,
      name:             r.name,
      ccp_type:         r.ccp_type,
      temperature_min:  r.temperature_min  != null ? Number(r.temperature_min)  : null,
      temperature_max:  r.temperature_max  != null ? Number(r.temperature_max)  : null,
      time_min:         r.time_min         != null ? Number(r.time_min)         : null,
      time_max:         r.time_max         != null ? Number(r.time_max)         : null,
      pressure_min:     r.pressure_min     != null ? Number(r.pressure_min)     : null,
      pressure_max:     r.pressure_max     != null ? Number(r.pressure_max)     : null,
      mapping_source:   source,
      ingredient_count: r.ingredient_count != null ? Number(r.ingredient_count) : undefined,
    };
  };

  // === BOM 우선 dedup: BOM에 이미 있는 공정그룹이면 수동은 제외 ===
  const bomGroupIds = new Set((bomRows as any[]).map((r: any) => Number(r.id)));
  const dedupedManual = (manualRows as any[]).filter((r: any) => !bomGroupIds.has(Number(r.id)));

  const merged: ProcessGroupInfo[] = [
    ...(bomRows    as any[]).map((r: any) => toInfo(r, "BOM")),
    ...(dedupedManual       .map((r: any) => toInfo(r, "MANUAL"))),
  ];

  // === CCP-4P 항상 포함: BOM/수동에 없으면 강제 추가 ===
  const hasCCP4P = merged.some(g => g.ccp_type === "CCP-4P");
  if (!hasCCP4P) {
    const [ccp4pRows] = await conn.execute<any[]>(
      `SELECT id, name, ccp_type,
              temperature_min, temperature_max, time_min, time_max,
              pressure_min, pressure_max
       FROM ccp_process_groups
       WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND status = 'active'
       ORDER BY sort_order, id LIMIT 1`,
      [tenantId],
    );
    if ((ccp4pRows as any[]).length > 0) {
      merged.push(toInfo((ccp4pRows as any[])[0], "MANUAL"));
    }
  }

  return merged;
}

/**
 * 공정그룹 × 설비 목록으로 h_ccp_rows 자동 생성
 *
 * CCP-1B / CCP-2B (교반/증숙/오븐):
 *   설비 1대 = 1행
 *   temp_c        = 설비기준(default_temperature) 우선, 없으면 공정 temperature_min
 *   pressure_bar  = 설비기준(default_pressure) 우선, 없으면 공정 pressure_min × 10
 *   heating_min   = 공정기준 가열시간(group.time_min)
 *   cycle_total_min = 설비기준 유휴포함 총사이클(eq.batch_operation_time)
 *   duration_min  = 배치 총소요시간 = cycle_total_min + (heating_min - eq.default_time)
 *                   예) 증숙기 사이클22분 + (약식류35분-기본10분) = 47분
 *
 * CCP-4P (금속검출):
 *   Fe / SUS 각 1행 (설비별 분리 불필요 - 검출기 종류 구분)
 */
async function createDefaultRowsForGroup(
  instanceId: number,
  group: ProcessGroupInfo,
  equipments: EquipmentAssignment[],
  conn: any,
  tenantId: number,
): Promise<void> {
  if (group.ccp_type === "CCP-4P") {
    const metalTypes = [
      { sortOrder: 1, note: "Fe (철) 기준 시편 검출 테스트" },
      { sortOrder: 2, note: "SUS (스테인리스) 기준 시편 검출 테스트" },
    ];
    for (const m of metalTypes) {
      await conn.execute(
        `INSERT INTO h_ccp_rows
           (instance_id, sort_order, row_type, result, note, auto_generated, tenant_id)
         VALUES (?, ?, 'measurement', 'PASS', ?, 1, ?)`,
        [instanceId, m.sortOrder, m.note, tenantId],
      );
    }
    return;
  }

  // CCP-1B / CCP-2B: 설비 순차 1행씩
  if (equipments.length === 0) {
    // 설비 매핑 없을 때 공정 한계기준으로 3행 생성
    const tempC      = group.temperature_min != null ? group.temperature_min.toString() : null;
    const pressureBar= group.pressure_min    != null ? (group.pressure_min * 10).toFixed(1) : null;
    // 설비기준 없으면 공정기준만으로 표기 (가열시간 = 총소요시간)
    const heatingMin  = group.time_min ?? 12;
    const durationMin = heatingMin; // 설비 사이클 정보 없으므로 가열시간으로 표기
    for (let i = 1; i <= 3; i++) {
      await conn.execute(
        `INSERT INTO h_ccp_rows
           (instance_id, sort_order, row_type, temp_c, duration_min,
            heating_min, cycle_total_min, pressure_bar,
            result, auto_generated, tenant_id)
         VALUES (?, ?, 'measurement', ?, ?,
                 ?, NULL, ?, 'PASS', 1, ?)`,
        [instanceId, i, tempC, durationMin, heatingMin, pressureBar, tenantId],
      );
    }
    return;
  }

  for (let idx = 0; idx < equipments.length; idx++) {
    const eq = equipments[idx];

    // 온도: 설비기준 우선, 없으면 공정 한계기준
    const tempC =
      eq.default_temperature != null
        ? eq.default_temperature.toString()
        : group.temperature_min != null
          ? group.temperature_min.toString()
          : null;

    // 압력: 설비기준(bar) 우선, 없으면 공정 pressure_min(MPa→bar)
    const pressureBar =
      eq.default_pressure != null
        ? eq.default_pressure.toString()
        : group.pressure_min != null
          ? (group.pressure_min * 10).toFixed(1)
          : null;

    // ─── 시간 계산 (핵심 로직) ───────────────────────────────────────────
    // heating_min   : 공정기준 가열시간 (제품별로 다름, ccp_process_groups.time_min)
    // cycle_total   : 설비기준 유휴포함 총사이클 (equipment.batch_operation_time)
    // eq_default_heat: 설비 기본 가열시간 기준값 (equipment.default_time)
    // duration_min  : 배치 총소요시간 = cycle_total + (heating_min - eq_default_heat)
    //   예) 증숙기(사이클22, 기본가열10) + 약식류(가열35) → 22 + (35-10) = 47분
    const heatingMin   = group.time_min ?? eq.default_time ?? 12;
    const cycleTotalMin = eq.batch_operation_time ?? null;
    // default_time이 null 또는 0이면 보정 불가 → 사이클타임 또는 가열시간 그대로 사용
    const eqDefaultHeat = (eq.default_time != null && eq.default_time > 0)
      ? eq.default_time
      : null;
    let durationMin: number;
    if (cycleTotalMin != null && eqDefaultHeat != null) {
      // 정상 보정: 총소요시간 = 사이클 + (공정가열 - 설비기본가열)
      durationMin = cycleTotalMin + (heatingMin - eqDefaultHeat);
    } else if (cycleTotalMin != null) {
      // 설비 기본가열 미정의 → 사이클타임을 총소요시간으로 사용
      durationMin = cycleTotalMin;
    } else {
      // 사이클 미정의 → 공정가열시간으로 폴백
      durationMin = heatingMin;
    }
    // 최소 1분 보장
    if (durationMin < 1) durationMin = heatingMin;

    await conn.execute(
      `INSERT INTO h_ccp_rows
         (instance_id, equipment_id, equipment_name, sort_order,
          row_type, temp_c, duration_min, heating_min, cycle_total_min,
          pressure_bar, result, auto_generated, tenant_id)
       VALUES (?, ?, ?, ?, 'measurement', ?, ?, ?, ?,
               ?, 'PASS', 1, ?)`,
      [
        instanceId,
        eq.equipment_id,
        eq.equipment_name,
        idx + 1,
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

/**
 * 배치 생성 시 CCP 인스턴스 + 설비별 기본 행 자동 생성 (메인)
 */
export async function autoCreateCcpInstancesForBatch(args: {
  siteId: number;
  workDate: string;
  batchId: number;
  productId?: number;
  productName: string;
  createdBy?: number;
  tenantId?: number;
}): Promise<{ instanceIds: number[]; groups: ProcessGroupInfo[] }> {
  const { siteId, workDate, batchId, productId, productName, createdBy, tenantId = 1 } = args;
  const conn = await getRawConnection();

  // 1. 공정그룹 목록
  let groups: ProcessGroupInfo[] = [];
  if (productId) {
    try {
      groups = await getProcessGroupsForProduct({ productId, tenantId });
    } catch (err) {
      console.error("[ccp-batch] 공정그룹 조회 실패:", err);
    }
  }

  // 2. 폴백
  if (groups.length === 0) {
    console.warn(`[ccp-batch] productId=${productId} 공정그룹 없음 → CCP-4P 폴백`);
    const [fb] = await conn.execute<any[]>(
      `SELECT id, name, ccp_type,
              temperature_min, temperature_max, time_min, time_max,
              pressure_min, pressure_max
       FROM ccp_process_groups
       WHERE tenant_id=? AND ccp_type='CCP-4P' AND status='active'
       ORDER BY sort_order, id LIMIT 1`,
      [tenantId],
    );
    if ((fb as any[]).length > 0) {
      const r = (fb as any[])[0];
      groups = [{
        id: r.id, name: r.name, ccp_type: r.ccp_type,
        temperature_min: r.temperature_min != null ? Number(r.temperature_min) : null,
        temperature_max: r.temperature_max != null ? Number(r.temperature_max) : null,
        time_min:        r.time_min        != null ? Number(r.time_min)        : null,
        time_max:        r.time_max        != null ? Number(r.time_max)        : null,
        pressure_min:    r.pressure_min    != null ? Number(r.pressure_min)    : null,
        pressure_max:    r.pressure_max    != null ? Number(r.pressure_max)    : null,
        mapping_source: "MANUAL" as const,
      }];
    }
  }

  const instanceIds: number[] = [];

  // 기존 인스턴스 확인 (중복 생성 방지)
  const [existingInstances] = await conn.execute<any[]>(
    `SELECT id, ccp_type, process_group_id FROM h_ccp_instances
     WHERE batch_id = ? AND tenant_id = ?`,
    [batchId, tenantId],
  );
  const existingKeys = new Set(
    (existingInstances as any[]).map((r: any) => `${r.ccp_type}-${r.process_group_id}`)
  );

  for (const group of groups) {
    try {
      // 이미 같은 (ccp_type, process_group_id) 인스턴스가 있으면 스킵
      const instanceKey = `${group.ccp_type}-${group.id}`;
      if (existingKeys.has(instanceKey)) {
        const existing = (existingInstances as any[]).find(
          (r: any) => r.ccp_type === group.ccp_type && r.process_group_id === group.id
        );
        if (existing) {
          instanceIds.push(Number(existing.id));
          console.log(`[ccp-batch] ⏭ group="${group.name}"(${group.ccp_type}) 이미 존재 → 스킵`);
        }
        continue;
      }

      // 3. 설비 순차 할당 목록 조회
      const equipments = await getEquipmentsForProcessGroup(group.id, tenantId);

      // 4. CCP 인스턴스 INSERT
      const [ins] = await conn.execute(
        `INSERT INTO h_ccp_instances
           (site_id, work_date, ccp_type, process_group_id,
            product_name, product_id, batch_id,
            status, created_by, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
        [
          siteId, workDate, group.ccp_type, group.id,
          productName, productId ?? null, batchId,
          createdBy ?? null, tenantId,
        ],
      );
      const instanceId = Number((ins as any).insertId);
      instanceIds.push(instanceId);

      // 5. 설비별 기본 행 생성
      try {
        await createDefaultRowsForGroup(instanceId, group, equipments, conn, tenantId);
      } catch (rowErr) {
        console.error(`[ccp-batch] 기본 행 생성 실패 (group=${group.name}):`, rowErr);
      }

      console.log(
        `[ccp-batch] ✓ group="${group.name}"(${group.ccp_type}) instanceId=${instanceId} ` +
        `equipments=${equipments.length}대 batchId=${batchId}`,
      );
    } catch (err) {
      console.error(`[ccp-batch] 인스턴스 생성 실패 (group=${group.name}):`, err);
    }
  }

  return { instanceIds, groups };
}
