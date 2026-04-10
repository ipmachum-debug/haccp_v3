/**
 * 배치 Hydration 서비스
 *
 * 일괄 등록(DB 직접 INSERT)된 배치에 대해 누락된 연관 레코드를 자동 생성
 * SaaS 테넌트 데이터 마이그레이션/백업 복원 시 필수
 *
 * 생성되는 연관 레코드:
 * 1. h_batch_inputs       - 원재료 투입 (BOM 기반)
 * 2. h_ccp_instances      - CCP 인스턴스
 * 3. h_ccp_form_records   - CCP 인쇄용 양식
 * 4. h_batch_schedules    - 배치 스케줄
 * 5. h_approval_requests  - 승인요청
 * 6. h_generic_checklist_records - 일일일지
 * 7. h_daily_reports      - 일일보고서 요약
 * 8. material_ledger_daily - 원료수불부 (completed 배치만)
 */

import { getRawConnection, getDb } from "../db";

import { todayKST } from "../utils/timezone";

export interface HydrationOptions {
  tenantId: number;
  siteId: number;
  userId: number;
  /** 특정 배치 ID만 처리 (없으면 누락된 모든 배치 처리) */
  batchIds?: number[];
  /** 처리할 항목 선택 (기본: 전부) */
  steps?: {
    batchInputs?: boolean;
    ccp?: boolean;
    schedule?: boolean;
    approval?: boolean;
    dailyReport?: boolean;
    materialLedger?: boolean;
  };
  /** dry-run: 실제 INSERT 없이 분석만 */
  dryRun?: boolean;
}

export interface HydrationResult {
  totalBatches: number;
  processed: number;
  skipped: number;
  errors: Array<{ batchId: number; step: string; error: string }>;
  created: {
    batchInputs: number;
    ccpInstances: number;
    ccpFormRecords: number;
    schedules: number;
    approvalRequests: number;
    dailyReports: number;
    materialLedgerEntries: number;
  };
}

/**
 * 누락된 연관 레코드를 가진 배치 목록 조회
 */
export async function findBatchesNeedingHydration(
  tenantId: number,
  batchIds?: number[]
): Promise<Array<{
  id: number;
  batchCode: string;
  productId: number;
  plannedDate: string;
  status: string;
  hasBatchInputs: boolean;
  hasCcpInstances: boolean;
  hasSchedule: boolean;
  hasDailyReport: boolean;
}>> {
  const conn = await getRawConnection();
  if (!conn) return [];

  const batchFilter = batchIds && batchIds.length > 0
    ? `AND b.id IN (${batchIds.map(() => '?').join(',')})`
    : '';
  const params: any[] = [tenantId];
  if (batchIds && batchIds.length > 0) params.push(...batchIds);

  const [rows] = await conn.execute<any[]>(
    `SELECT
      b.id, b.batch_code, b.product_id, b.planned_date, b.status,
      (SELECT COUNT(*) FROM h_batch_inputs bi WHERE bi.batch_id = b.id AND bi.tenant_id = b.tenant_id) as input_count,
      (SELECT COUNT(*) FROM h_ccp_instances ci WHERE ci.batch_id = b.id AND ci.tenant_id = b.tenant_id) as ccp_count,
      (SELECT COUNT(*) FROM h_batch_schedules bs WHERE bs.batch_id = b.id AND bs.tenant_id = b.tenant_id) as schedule_count
    FROM h_batches b
    WHERE b.tenant_id = ? ${batchFilter}
    ORDER BY b.planned_date ASC`,
    params
  );

  return (rows as any[]).map((r: any) => ({
    id: r.id,
    batchCode: r.batch_code,
    productId: r.product_id,
    plannedDate: r.planned_date,
    status: r.status,
    hasBatchInputs: Number(r.input_count) > 0,
    hasCcpInstances: Number(r.ccp_count) > 0,
    hasSchedule: Number(r.schedule_count) > 0,
    hasDailyReport: false, // checked separately per date
  }));
}

/**
 * 배치 Hydration 실행
 * 누락된 연관 레코드를 자동 생성
 */
export async function hydrateBatches(
  options: HydrationOptions
): Promise<HydrationResult> {
  const { tenantId, siteId, userId, batchIds, dryRun = false } = options;
  const steps = options.steps || {
    batchInputs: true,
    ccp: true,
    schedule: true,
    approval: true,
    dailyReport: true,
    materialLedger: true,
  };

  const result: HydrationResult = {
    totalBatches: 0,
    processed: 0,
    skipped: 0,
    errors: [],
    created: {
      batchInputs: 0,
      ccpInstances: 0,
      ccpFormRecords: 0,
      schedules: 0,
      approvalRequests: 0,
      dailyReports: 0,
      materialLedgerEntries: 0,
    },
  };

  // 1. 대상 배치 조회
  const batches = await findBatchesNeedingHydration(tenantId, batchIds);
  result.totalBatches = batches.length;

  if (dryRun) {
    console.log(`[hydrateBatches] DRY RUN: ${batches.length}건 배치 분석 완료`);
    return result;
  }

  // 날짜별 그룹핑 (일일일지는 날짜별로 하나)
  const batchesByDate = new Map<string, typeof batches>();
  for (const batch of batches) {
    const dateKey = formatDate(batch.plannedDate);
    if (!batchesByDate.has(dateKey)) batchesByDate.set(dateKey, []);
    batchesByDate.get(dateKey)!.push(batch);
  }

  // 2. 배치별 처리
  for (const batch of batches) {
    try {
      // 2a. 원재료 투입 (BOM 기반)
      if (steps.batchInputs && !batch.hasBatchInputs) {
        try {
          const count = await hydrateBatchInputs(batch.id, batch.productId, tenantId);
          result.created.batchInputs += count;
        } catch (err: any) {
          result.errors.push({ batchId: batch.id, step: 'batchInputs', error: err.message });
        }
      }

      // 2b. CCP 인스턴스 생성
      if (steps.ccp && !batch.hasCcpInstances) {
        try {
          const { autoCreateCcpInstancesForBatch } = await import("./ccp-batch");
          const product = await getProductName(batch.productId, tenantId);
          const ccpResult = await autoCreateCcpInstancesForBatch({
            siteId,
            workDate: formatDate(batch.plannedDate),
            batchId: batch.id,
            productId: batch.productId,
            productName: product,
            createdBy: userId,
            tenantId,
          });
          result.created.ccpInstances += ccpResult.instanceIds.length;

          // CCP form records 생성
          if (ccpResult.groups && ccpResult.groups.length > 0) {
            try {
              const { getOrCreateCcpFormRecord, syncCcpRowsToFormRows } = await import("../db/ccpFormRecords");
              const conn = await getRawConnection();
              // BOM batch_target_kg 조회
              let bomBatchKg: number | undefined;
              const [bomRows] = await conn.execute<any[]>(
                `SELECT rv.batch_target_kg
                 FROM h_mf_report_versions rv
                 JOIN h_mf_reports mr ON rv.mf_report_id = mr.id
                 WHERE mr.product_id = ? AND mr.tenant_id = ?
                   AND rv.approval_status = 'APPROVED'
                 ORDER BY rv.id DESC LIMIT 1`,
                [batch.productId, tenantId]
              );
              const btkVal = (bomRows as any[])[0]?.batch_target_kg;
              if (btkVal) bomBatchKg = parseFloat(btkVal);

              // 각 공정그룹별 CCP form record 생성
              for (const group of ccpResult.groups) {
                await getOrCreateCcpFormRecord({
                  tenantId,
                  siteId,
                  batchId: batch.id,
                  ccpType: group.ccp_type,
                  workDate: formatDate(batch.plannedDate),
                  productId: batch.productId,
                  productName: product,
                  processGroupId: group.id,
                  processGroupName: group.name,
                  bomBatchKg,
                  writerId: userId,
                });
                result.created.ccpFormRecords++;
              }

              // CCP rows → form rows 동기화
              await syncCcpRowsToFormRows({ batchId: batch.id, tenantId });
            } catch (formErr: any) {
              result.errors.push({ batchId: batch.id, step: 'ccpFormRecords', error: formErr.message });
            }
          }
        } catch (err: any) {
          result.errors.push({ batchId: batch.id, step: 'ccp', error: err.message });
        }
      }

      // 2c. 배치 스케줄 생성
      if (steps.schedule && !batch.hasSchedule) {
        try {
          const { createBatchSchedule } = await import("../db/batchSchedules");
          await createBatchSchedule({
            tenantId,
            batchId: batch.id,
            scheduledDate: new Date(batch.plannedDate),
            status: batch.status === 'completed' ? 'completed' : 'scheduled',
            notes: `[hydration] 배치: ${batch.batchCode}`,
          });
          result.created.schedules++;
        } catch (err: any) {
          result.errors.push({ batchId: batch.id, step: 'schedule', error: err.message });
        }
      }

      result.processed++;
    } catch (err: any) {
      result.errors.push({ batchId: batch.id, step: 'general', error: err.message });
      result.skipped++;
    }
  }

  // 3. 날짜별 일일일지 생성 (배치가 아닌 날짜 단위)
  if (steps.dailyReport) {
    for (const [dateKey, dateBatches] of batchesByDate.entries()) {
      try {
        // 해당 날짜에 이미 일일일지가 있는지 확인
        const conn = await getRawConnection();
        const [existing] = await conn.execute<any[]>(
          `SELECT id FROM h_generic_checklist_records
           WHERE form_type = 'daily_log' AND form_date = ? AND tenant_id = ? LIMIT 1`,
          [dateKey, tenantId]
        );

        if ((existing as any[]).length === 0) {
          // 해당 날짜의 첫 번째 배치로 일일일지 생성, 나머지는 추가
          const { autoGenerateDailyReport } = await import("../lib/autoDailyReport");
          for (const batch of dateBatches) {
            try {
              await autoGenerateDailyReport(batch.id, userId);
            } catch (err: any) {
              result.errors.push({ batchId: batch.id, step: 'dailyReport', error: err.message });
            }
          }
          result.created.dailyReports++;
        } else {
          // 기존 일일일지에 누락된 배치 추가
          const { autoGenerateDailyReport } = await import("../lib/autoDailyReport");
          for (const batch of dateBatches) {
            try {
              await autoGenerateDailyReport(batch.id, userId);
            } catch (err: any) {
              result.errors.push({ batchId: batch.id, step: 'dailyReport', error: err.message });
            }
          }
        }
      } catch (err: any) {
        result.errors.push({ batchId: dateBatches[0]?.id || 0, step: 'dailyReport', error: err.message });
      }
    }
  }

  // 4. 승인요청 생성 (CCP가 있는 배치만)
  if (steps.approval) {
    const conn = await getRawConnection();
    for (const batch of batches) {
      try {
        // CCP가 있는데 승인요청이 없는 경우
        const [ccpCheck] = await conn.execute<any[]>(
          `SELECT COUNT(*) as cnt FROM h_ccp_instances WHERE batch_id = ? AND tenant_id = ?`,
          [batch.id, tenantId]
        );
        const hasCcp = Number((ccpCheck as any[])[0]?.cnt) > 0;

        const [approvalCheck] = await conn.execute<any[]>(
          `SELECT COUNT(*) as cnt FROM h_approval_requests
           WHERE reference_type = 'batch' AND reference_id = ? AND tenant_id = ?`,
          [batch.id, tenantId]
        );
        const hasApproval = Number((approvalCheck as any[])[0]?.cnt) > 0;

        if (hasCcp && !hasApproval) {
          const { autoCreateApprovalRequest } = await import("../lib/autoApprovalRequest");
          const approvalResult = await autoCreateApprovalRequest(batch.id, userId, null);
          if (approvalResult.success) {
            result.created.approvalRequests++;
          }
        }
      } catch (err: any) {
        result.errors.push({ batchId: batch.id, step: 'approval', error: err.message });
      }
    }
  }

  // 5. 원료수불부 업데이트 (completed 배치만)
  if (steps.materialLedger) {
    for (const batch of batches) {
      if (batch.status === 'completed') {
        try {
          const { onBatchCompleted } = await import("../db/materialLedger");
          await onBatchCompleted({
            batchId: batch.id,
            completionDate: formatDate(batch.plannedDate),
          }, tenantId);
          result.created.materialLedgerEntries++;
        } catch (err: any) {
          result.errors.push({ batchId: batch.id, step: 'materialLedger', error: err.message });
        }
      }
    }
  }

  console.log(`[hydrateBatches] 완료: ${result.processed}/${result.totalBatches}건 처리, 에러 ${result.errors.length}건`);
  return result;
}

// === Helper functions ===

function formatDate(d: any): string {
  if (!d) return todayKST();
  if (typeof d === 'string') {
    // "YYYY-MM-DD" or ISO string
    return d.split('T')[0];
  }
  if (d instanceof Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return String(d).split('T')[0];
}

async function getProductName(productId: number, tenantId: number): Promise<string> {
  const conn = await getRawConnection();
  if (!conn) return "미확인";
  const [rows] = await conn.execute<any[]>(
    `SELECT p.product_name
     FROM h_products_v2 p
     WHERE p.id = ? AND p.tenant_id = ?
     LIMIT 1`,
    [productId, tenantId]
  );
  return (rows as any[])[0]?.product_name || "미확인";
}

/**
 * 특정 배치에 대해 BOM 기반 원재료 투입 자동생성
 * createBatch 내부 로직과 동일하지만, 이미 존재하는 배치에 대해 실행
 */
async function hydrateBatchInputs(
  batchId: number,
  productId: number,
  tenantId: number
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const { hMfReports, hMfReportVersions, hMfIngredients, hBatchInputs, hBatches } =
    await import("../../drizzle/schema");
  const { eq, and, desc } = await import("drizzle-orm");

  // 배치의 생산량 조회
  const [batch] = await db.select({ plannedQuantity: hBatches.plannedQuantity })
    .from(hBatches).where(eq(hBatches.id, batchId)).limit(1);
  if (!batch) return 0;
  const plannedQty = parseFloat(batch.plannedQuantity);

  // 품목제조보고 조회
  const mfReport = await db
    .select({ id: hMfReports.id })
    .from(hMfReports)
    .where(and(eq(hMfReports.productId, productId), eq(hMfReports.tenantId, tenantId)))
    .limit(1);
  if (mfReport.length === 0) return 0;

  // 최신 승인 버전
  let latestVersion = await db
    .select({ id: hMfReportVersions.id })
    .from(hMfReportVersions)
    .where(and(
      eq(hMfReportVersions.mfReportId, mfReport[0].id),
      eq(hMfReportVersions.approvalStatus, "APPROVED")
    ))
    .orderBy(desc(hMfReportVersions.versionNo))
    .limit(1);

  if (latestVersion.length === 0) {
    latestVersion = await db
      .select({ id: hMfReportVersions.id })
      .from(hMfReportVersions)
      .where(eq(hMfReportVersions.mfReportId, mfReport[0].id))
      .orderBy(desc(hMfReportVersions.versionNo))
      .limit(1);
  }
  if (latestVersion.length === 0) return 0;

  // 배합비 조회
  const { itemMaster } = await import("../../drizzle/schema/schema_dual_unit");
  const ingredients = await db
    .select({
      materialId: hMfIngredients.materialId,
      quantity: hMfIngredients.quantity,
      correctedQuantity: hMfIngredients.correctedQuantity,
      isDeductible: hMfIngredients.isDeductible,
      processGroupId: hMfIngredients.processGroupId,
      materialUnit: itemMaster.baseUnit,
    })
    .from(hMfIngredients)
    .leftJoin(itemMaster, eq(hMfIngredients.materialId, itemMaster.id))
    .where(eq(hMfIngredients.mfReportVersionId, latestVersion[0].id))
    .orderBy(hMfIngredients.lineNo);

  if (ingredients.length === 0) return 0;

  const batchInputs = ingredients
    .filter((ing: any) => ing.materialId !== null && ing.materialId !== 191 && ing.isDeductible !== 0)
    .map((ing: any) => {
      const ratio = ing.correctedQuantity
        ? parseFloat(ing.correctedQuantity)
        : parseFloat(ing.quantity);
      return {
        batchId,
        materialId: ing.materialId!,
        plannedQuantity: ((ratio / 100) * plannedQty).toFixed(3),
        unit: ing.materialUnit || "kg",
        processGroupId: ing.processGroupId ?? null,
        tenantId,
      };
    });

  if (batchInputs.length > 0) {
    await db.insert(hBatchInputs).values(batchInputs as any);
    console.log(`[hydrateBatchInputs] 배치 #${batchId}: ${batchInputs.length}건 원재료 투입 생성`);
  }

  return batchInputs.length;
}
