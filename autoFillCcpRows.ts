/**
 * 배치 완료 시 CCP 기록지(h_ccp_rows) 실측값 자동 채우기
 *
 * 규칙:
 * - 배치 생성 시 이미 h_ccp_rows가 auto_generated=1, result='PASS'로 생성됨
 * - 배치 완료 시 measured_at을 현재 시각으로 업데이트
 * - 실측값(temp_c, duration_min, pressure_bar)은 설비/공정그룹 기준값으로 자동 세팅
 *   (이미 배치 생성 시 기준값으로 세팅되어 있으므로, null인 경우만 보완)
 * - h_ccp_instances.status를 'submitted' → 승인 대기로 전환
 *
 * CCP 문서 한계기준 (이미지 분석):
 * - CCP-1B (증숙): 온도 90℃이상, 압력 0.12~0.28Mpa이상, 시간 10~35분이상
 * - CCP-2B (굽기): 온도 150℃이상, 시간 10~15분이상
 * - CCP-4P (금속): Fe 2.0mmΦ이상 불검출, SUS 3.0mmΦ이상 불검출
 */

import { getDb } from '../db';
import { sql } from 'drizzle-orm';

export interface CcpFillResult {
  success: boolean;
  instancesUpdated: number;
  rowsUpdated: number;
  message: string;
}

export async function autoFillCcpRowsOnBatchComplete(
  batchId: number,
  tenantId: number,
): Promise<CcpFillResult> {
  const db = await getDb();
  if (!db) throw new Error('Database connection not available');

  try {
    // ── Step 1: 이 배치에 연결된 CCP 인스턴스 조회 ─────────────────
    const instanceResult = await db.execute(sql`
      SELECT ci.id, ci.ccp_type, ci.process_group_id,
             cpg.temperature_min, cpg.temperature_max,
             cpg.pressure_min, cpg.pressure_max,
             cpg.time_min, cpg.time_max
      FROM h_ccp_instances ci
      LEFT JOIN ccp_process_groups cpg ON cpg.id = ci.process_group_id
      WHERE ci.batch_id = ${batchId}
        AND ci.tenant_id = ${tenantId}
        AND ci.status IN ('draft', 'in_progress', 'submitted')
    `);
    const instances = (instanceResult as any)[0] || [];

    if (instances.length === 0) {
      return {
        success: true,
        instancesUpdated: 0,
        rowsUpdated: 0,
        message: '연결된 CCP 인스턴스 없음',
      };
    }

    let rowsUpdated = 0;

    for (const inst of instances) {
      const instId = Number(inst.id);
      const ccpType = inst.ccp_type as string;

      // ── Step 2: 해당 인스턴스의 미기록 rows 조회 ──────────────────
      const rowsResult = await db.execute(sql`
        SELECT id, temp_c, duration_min, pressure_bar, heating_min, result
        FROM h_ccp_rows
        WHERE instance_id = ${instId}
          AND tenant_id = ${tenantId}
          AND row_type = 'measurement'
          AND measured_at IS NULL
      `);
      const rows = (rowsResult as any)[0] || [];

      for (const row of rows) {
        const rowId = Number(row.id);

        // ── CCP-4P: 금속검출 → 통과시간만 기록, result=PASS ────────
        if (ccpType === 'CCP-4P') {
          await db.execute(sql`
            UPDATE h_ccp_rows
            SET measured_at = NOW(),
                result = 'PASS',
                updated_at = NOW()
            WHERE id = ${rowId} AND tenant_id = ${tenantId}
          `);
          rowsUpdated++;
          continue;
        }

        // ── CCP-1B / CCP-2B: 온도/압력/시간 보완 ────────────────────
        // 이미 배치 생성 시 설정된 값이 있으면 유지, null이면 공정그룹 기준값으로 보완
        const tempC = row.temp_c != null
          ? row.temp_c
          : (inst.temperature_min != null ? Number(inst.temperature_min) : null);

        const pressureBar = row.pressure_bar != null
          ? row.pressure_bar
          : (inst.pressure_min != null ? (Number(inst.pressure_min) * 10).toFixed(1) : null);

        const durationMin = row.duration_min != null
          ? row.duration_min
          : (row.heating_min != null ? row.heating_min : inst.time_min);

        await db.execute(sql`
          UPDATE h_ccp_rows
          SET measured_at = NOW(),
              temp_c      = COALESCE(temp_c, ${tempC}),
              pressure_bar= COALESCE(pressure_bar, ${pressureBar}),
              duration_min= COALESCE(duration_min, ${durationMin}),
              result      = 'PASS',
              updated_at  = NOW()
          WHERE id = ${rowId} AND tenant_id = ${tenantId}
        `);
        rowsUpdated++;
      }

      // ── Step 3: 인스턴스 status를 'submitted'로 업데이트 ───────────
      await db.execute(sql`
        UPDATE h_ccp_instances
        SET status = 'submitted',
            submitted_at = NOW(),
            updated_at = NOW()
        WHERE id = ${instId} AND tenant_id = ${tenantId}
      `);
    }

    console.log(
      `[autoFillCcpRows] 배치 #${batchId}: ${instances.length}개 인스턴스, ${rowsUpdated}개 row 업데이트`,
    );

    return {
      success: true,
      instancesUpdated: instances.length,
      rowsUpdated,
      message: `CCP 기록지 ${instances.length}건 완료 처리 (측정값 ${rowsUpdated}행 업데이트)`,
    };
  } catch (error: any) {
    console.error(`[autoFillCcpRows] 배치 #${batchId} CCP 채우기 실패:`, error);
    return {
      success: false,
      instancesUpdated: 0,
      rowsUpdated: 0,
      message: error.message || 'CCP 기록지 채우기 실패',
    };
  }
}
