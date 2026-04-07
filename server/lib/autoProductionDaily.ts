/**
 * 생산일지(production_daily) 자동 생성/갱신 모듈
 * 배치 생성, 배치 완료, 배치 상태 변경 시 자동으로 호출되어
 * 해당 날짜의 생산일지를 생성하거나 갱신합니다.
 *
 * 데이터 소스:
 * - 생산량(실제): production_sku_output.total_kg (배치 생성 시 입력한 실제 생산량)
 * - 배치 상태: h_approval_requests (request_type='batch_production') 파이프라인 상태
 * - 시작 시간: h_ccp_form_rows.measurement_time MIN → h_batches.start_time fallback (KST)
 * - 종료 시간: h_ccp_form_rows.measurement_time MAX → h_batches.end_time fallback (KST)
 * - CCP 상세: h_ccp_form_records + h_ccp_form_rows (실제 CCP 기록지 데이터)
 * - CCP 통계: h_ccp_form_records 레코드 수 (정상 = 총건수 - 이탈건수)
 */
export async function autoRegenerateProductionDaily(
  tenantId: number,
  dateStr: string,
): Promise<{ success: boolean; message: string }> {
  const { getDb } = await import("../db");
  const { sql } = await import("drizzle-orm");
  const db = await getDb();
  if (!db) return { success: false, message: "DB 연결 실패" };

  try {
    // ── 1. 배치 기본 정보 + SKU 생산량 + 파이프라인 상태 + CCP 기록지 시각 ──
    const batchResult = await db.execute(sql`
      SELECT b.id, b.batch_code, b.status, b.planned_quantity, b.actual_quantity,
        b.start_time, b.end_time, b.planned_date,
        COALESCE(p1.product_name, p.product_name) as product_name, COALESCE(p1.product_code, p.product_code) as product_code,
        COALESCE(sku.total_kg_sum, 0) as sku_actual_kg,
        COALESCE(pp.actual_quantity, 0) as perf_actual_quantity,
        ps.start_time as prod_start_time,
        ar.status as pipeline_status,
        ar.approved_at as pipeline_approved_at,
        ar.reviewed_at as pipeline_reviewed_at,
        ar.requested_at as pipeline_requested_at,
        ccp_time.ccp_first_time,
        ccp_time.ccp_last_time
      FROM h_batches b
      LEFT JOIN h_products p1 ON p1.id = b.product_id AND p1.tenant_id = ${tenantId}
      LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = ${tenantId}
      LEFT JOIN (
        SELECT batch_id, SUM(total_kg) as total_kg_sum
        FROM production_sku_output
        WHERE tenant_id = ${tenantId}
        GROUP BY batch_id
      ) sku ON sku.batch_id = b.id
      LEFT JOIN h_production_performance pp ON pp.batch_id = b.id AND pp.tenant_id = ${tenantId}
      LEFT JOIN h_production_start ps ON ps.batch_id = b.id AND ps.tenant_id = ${tenantId}
      LEFT JOIN h_approval_requests ar
        ON ar.reference_id = b.id
        AND ar.reference_type = 'batch'
        AND ar.request_type = 'batch_production'
        AND ar.tenant_id = ${tenantId}
      LEFT JOIN (
        SELECT fr2.batch_id,
          MIN(r2.measurement_time) as ccp_first_time,
          MAX(r2.measurement_time) as ccp_last_time
        FROM h_ccp_form_records fr2
        JOIN h_ccp_form_rows r2 ON r2.form_record_id = fr2.id AND r2.tenant_id = ${tenantId}
        WHERE fr2.tenant_id = ${tenantId}
          AND r2.measurement_time IS NOT NULL
        GROUP BY fr2.batch_id
      ) ccp_time ON ccp_time.batch_id = b.id
      WHERE b.tenant_id = ${tenantId}
        AND (DATE(b.planned_date) = ${dateStr} OR DATE(b.created_at) = ${dateStr})
      ORDER BY b.created_at ASC
    `);
    const batches = Array.isArray(batchResult) && Array.isArray(batchResult[0])
      ? batchResult[0]
      : batchResult;

    // ── 2. 배치별 CCP 상세 정보 (h_ccp_form_records 기반) ──
    const ccpDetailResult = await db.execute(sql`
      SELECT fr.batch_id, fr.ccp_type, fr.status as ccp_status,
        COUNT(r.id) as row_count,
        SUM(CASE WHEN r.is_deviation = 0 THEN 1 ELSE 0 END) as pass_count,
        SUM(CASE WHEN r.is_deviation = 1 THEN 1 ELSE 0 END) as fail_count
      FROM h_ccp_form_records fr
      INNER JOIN h_batches b ON fr.batch_id = b.id
      LEFT JOIN h_ccp_form_rows r ON r.form_record_id = fr.id AND r.tenant_id = ${tenantId}
      WHERE fr.tenant_id = ${tenantId}
        AND (DATE(b.planned_date) = ${dateStr} OR DATE(b.created_at) = ${dateStr})
      GROUP BY fr.batch_id, fr.ccp_type, fr.status
    `);
    const ccpDetails = Array.isArray(ccpDetailResult) && Array.isArray(ccpDetailResult[0])
      ? ccpDetailResult[0]
      : ccpDetailResult;

    // ── 3. CCP 통계 (h_ccp_form_records 기반, 정상 = 총건수 - 이탈건수) ──
    const ccpResult = await db.execute(sql`
      SELECT COUNT(fr.id) as total_ccp,
        SUM(CASE WHEN EXISTS (
          SELECT 1 FROM h_ccp_form_rows r WHERE r.form_record_id = fr.id AND r.is_deviation = 1
        ) THEN 1 ELSE 0 END) as deviation_count
      FROM h_ccp_form_records fr
      INNER JOIN h_batches b ON fr.batch_id = b.id
      WHERE fr.tenant_id = ${tenantId}
        AND (DATE(b.planned_date) = ${dateStr} OR DATE(b.created_at) = ${dateStr})
    `);
    const ccpStatsRaw = (ccpResult as any)[0]?.[0] || { total_ccp: 0, deviation_count: 0 };
    const ccpStats = {
      total_ccp: Number(ccpStatsRaw.total_ccp) || 0,
      normal_count: (Number(ccpStatsRaw.total_ccp) || 0) - (Number(ccpStatsRaw.deviation_count) || 0),
      deviation_count: Number(ccpStatsRaw.deviation_count) || 0,
    };

    // ── 4. 이슈 (CCP 부적합) ──
    const issueResult = await db.execute(sql`
      SELECT r.id as row_id, r.is_deviation, r.deviation_note as note, r.measurement_time,
        fr.ccp_type, b.batch_code, COALESCE(p1x.product_name, px.product_name) as product_name, fr.work_date
      FROM h_ccp_form_rows r
      INNER JOIN h_ccp_form_records fr ON r.form_record_id = fr.id
      INNER JOIN h_batches b ON fr.batch_id = b.id
      LEFT JOIN h_products p1x ON b.product_id = p1x.id AND p1x.tenant_id = ${tenantId}
      LEFT JOIN h_products_v2 px ON b.product_id = px.id AND px.tenant_id = ${tenantId}
      WHERE r.tenant_id = ${tenantId} AND r.is_deviation = 1
        AND (DATE(b.planned_date) = ${dateStr} OR DATE(b.created_at) = ${dateStr})
      ORDER BY r.measurement_time ASC
    `);
    const issues = Array.isArray(issueResult) && Array.isArray(issueResult[0])
      ? issueResult[0]
      : issueResult;

    // ── 배치가 없으면 생산일지를 생성하지 않음 ──
    if (!(batches as any[]).length) {
      return {
        success: true,
        message: `${dateStr} 배치 없음 → 생산일지 미생성`,
      };
    }

    // ── CCP 상세 맵 생성 (batch_id -> ccpDetails) ──
    const ccpByBatch = new Map<number, any[]>();
    for (const c of ccpDetails as any[]) {
      const bId = Number(c.batch_id);
      if (!ccpByBatch.has(bId)) ccpByBatch.set(bId, []);
      ccpByBatch.get(bId)!.push({
        ccpType: c.ccp_type,
        status: c.ccp_status,
        rowCount: Number(c.row_count || 0),
        passCount: Number(c.pass_count || 0),
        failCount: Number(c.fail_count || 0),
      });
    }

    // ── 배치 파이프라인 상태 매핑 ──
    // h_batches.status는 계획단계에서 변하지 않으므로,
    // h_approval_requests (batch_production) 상태를 기준으로 실제 파이프라인 상태를 결정
    const mapPipelineStatus = (batchStatus: string, pipelineStatus: string | null): string => {
      // 파이프라인 승인 상태가 있으면 그것을 사용
      if (pipelineStatus === 'approved') return 'completed';      // 승인완료 = 생산완료
      if (pipelineStatus === 'pending_review') return 'in_progress'; // 검토대기 = 진행중
      if (pipelineStatus === 'pending_approval') return 'in_progress';
      if (pipelineStatus === 'rejected') return 'rejected';       // 반려
      // 파이프라인 없으면 h_batches.status 사용
      if (batchStatus === 'completed') return 'completed';
      if (batchStatus === 'in_progress') return 'in_progress';
      if (batchStatus === 'approved') return 'in_progress'; // h_batches approved = CCP 승인됨 = 진행중
      return batchStatus; // planned, paused, cancelled 등
    };

    const batchList = (batches as any[]).map((b: any) => {
      // 실제 생산량 우선순위: production_sku_output > h_batches.actual_quantity > h_production_performance
      const actualQty =
        parseFloat(b.sku_actual_kg || "0") ||
        parseFloat(b.actual_quantity || "0") ||
        parseFloat(b.perf_actual_quantity || "0") ||
        0;

      // 시작 시간: CCP 기록지 measurement_time MIN (HH:MM:SS 형식의 TIME)
      // h_ccp_form_rows.measurement_time은 TIME 필드 (KST) → "HH:MM:SS"
      // fallback: h_batches.start_time (UTC timestamp)
      let startTime: string | null = null;
      if (b.ccp_first_time) {
        // TIME 값 → work_date와 결합하여 datetime string 생성 (KST 기준)
        startTime = `${dateStr} ${String(b.ccp_first_time)}`;
      } else if (b.start_time) {
        startTime = String(b.start_time);
      } else if (b.prod_start_time) {
        startTime = String(b.prod_start_time);
      }

      // 종료 시간: CCP 기록지 measurement_time MAX → fallback
      let endTime: string | null = null;
      if (b.ccp_last_time) {
        endTime = `${dateStr} ${String(b.ccp_last_time)}`;
      } else if (b.end_time) {
        endTime = String(b.end_time);
      } else if (b.pipeline_approved_at) {
        endTime = String(b.pipeline_approved_at);
      }

      // 파이프라인 상태
      const status = mapPipelineStatus(b.status, b.pipeline_status);

      return {
        batchId: b.id,
        batchCode: b.batch_code,
        productName: b.product_name || "미확인",
        productCode: b.product_code || "",
        plannedQuantity: parseFloat(b.planned_quantity || "0"),
        actualQuantity: actualQty,
        status,
        pipelineStatus: b.pipeline_status || null,
        startTime,
        endTime,
        ccpDetails: ccpByBatch.get(Number(b.id)) || [],
      };
    });

    const totalPlanned = batchList.reduce((s: number, b: any) => s + b.plannedQuantity, 0);
    const totalActual = batchList.reduce((s: number, b: any) => s + b.actualQuantity, 0);

    const reportSummary = {
      date: dateStr,
      tenantId,
      autoGenerated: true,
      generatedAt: new Date().toISOString(),
      production: {
        batches: batchList,
        totalBatches: batchList.length,
        completedBatches: batchList.filter((b: any) => b.status === "completed").length,
        activeBatches: batchList.filter(
          (b: any) => b.status === "in_progress",
        ).length,
        totalPlannedQty: totalPlanned,
        totalActualQty: totalActual,
        achievementRate: totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0,
      },
      ccp: {
        totalRecords: ccpStats.total_ccp,
        normalCount: ccpStats.normal_count,
        deviationCount: ccpStats.deviation_count,
        complianceRate:
          ccpStats.total_ccp > 0
            ? (((ccpStats.total_ccp - ccpStats.deviation_count) /
                ccpStats.total_ccp) * 100).toFixed(1)
            : "100.0",
      },
      issues: (issues as any[]).map((i: any) => ({
        rowId: i.row_id,
        batchCode: i.batch_code,
        productName: i.product_name,
        ccpType: i.ccp_type,
        result: i.is_deviation ? 'FAIL' : 'PASS',
        note: i.note,
        measuredAt: i.measurement_time ? `${dateStr} ${String(i.measurement_time)}` : null,
      })),
    };

    // ── UPSERT: 기존 레코드 있으면 UPDATE, 없으면 INSERT ──
    const existing = await db.execute(sql`
      SELECT id FROM h_daily_reports
      WHERE tenant_id = ${tenantId} AND report_date = ${dateStr} AND report_type = 'production_daily'
      LIMIT 1
    `);
    const existRows = (existing as any)[0] || [];
    if ((existRows as any[]).length > 0) {
      await db.execute(sql`
        UPDATE h_daily_reports SET summary = ${JSON.stringify(reportSummary)}, generated_at = NOW()
        WHERE id = ${(existRows as any[])[0].id}
      `);
    } else {
      await db.execute(sql`
        INSERT INTO h_daily_reports (site_id, report_date, report_type, summary, generated_at, tenant_id)
        VALUES (0, ${dateStr}, 'production_daily', ${JSON.stringify(reportSummary)}, NOW(), ${tenantId})
      `);
    }

    return {
      success: true,
      message: `${dateStr} 생산일지 자동 갱신 완료 (배치 ${batchList.length}건)`,
    };
  } catch (err) {
    console.error("[autoRegenerateProductionDaily] 오류:", err);
    return { success: false, message: "생산일지 자동 갱신 실패" };
  }
}
