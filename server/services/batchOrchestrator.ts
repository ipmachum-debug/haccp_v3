/**
 * 배치 오케스트레이터 서비스
 *
 * 기존 batch.create 라우터 로직을 서비스로 분리하여
 * 단일 배치 생성(createSingleBatch)과 일괄 배치 생성(bulkCreateForDay)
 * 모두에서 재사용할 수 있도록 구성
 *
 * [파이프라인]
 * 1. createBatch (DB insert + 원재료 투입 자동생성)
 * 2. autoCreateCcpInstancesForBatch (공정그룹 → 설비 → CCP rows)
 * 3. getOrCreateCcpFormRecord (인쇄용 양식 기록지)
 * 4. SKU 생산수량 기록 (production_sku_output)
 * 5. CCP 점검 알림 (수동배치)
 * 6. 배치 스케줄 생성
 * 7. 승인요청 자동 등록
 * 8. 일일일지 자동생성
 */

import { getRawConnection } from "../db";

export interface SingleBatchInput {
  tenantId: number;
  siteId: number;
  workDate: string; // "YYYY-MM-DD"
  startTime: string; // "HH:mm"
  endTime?: string; // "HH:mm"
  productId: number;
  plannedQuantityKg: number;
  batchCode?: string;
  dayBatchGroup?: string;
  batchOrder?: number;
  skuOutputs?: Array<{
    skuId: number;
    plannedQty: number;
    actualQty?: number;
    defectiveQty?: number;
    note?: string;
  }>;
  mode: "auto" | "manual";
  userId: number;
  userEmail?: string;
  userRole?: string;
  /** true = skip daily report + approval (caller handles at group level) */
  skipGroupActions?: boolean;
}

export interface SingleBatchResult {
  batchId: number;
  batchCode: string;
  productId: number;
  productName: string;
  ccpCreated: boolean;
  ccpCount: number;
  ccpGroups: Array<{ id: number; name: string; ccp_type: string }>;
  approvalRequestId: number | null;
  scheduleCreated: boolean;
  dailyReportCreated: boolean;
  periodicLogsResult: any;
}

/**
 * 단일 배치 생성 파이프라인
 * batch.create 라우터의 핵심 로직을 서비스로 추출
 */
export async function createSingleBatch(
  input: SingleBatchInput,
): Promise<SingleBatchResult> {
  const { createBatch, getProductById, createAuditLog } = await import("../db");
  const { autoCreateCcpInstancesForBatch } = await import("./ccp-batch");

  // === 1. 배치 생성 ===
  const plannedDate = new Date(`${input.workDate}T00:00:00`);
  const batchCodeFinal = input.batchCode || await generateBatchCode(
    input.tenantId, input.productId, input.workDate
  );

  const batchId = await createBatch({
    tenantId: input.tenantId,
    siteId: input.siteId,
    productId: input.productId,
    batchCode: batchCodeFinal,
    dayBatchGroup: input.dayBatchGroup,
    batchOrder: input.batchOrder,
    plannedQuantity: input.plannedQuantityKg.toString(),
    plannedDate,
    batchStartTime: input.startTime,
    createdBy: input.userId,
  });

  // === 2. 제품 정보 조회 ===
  const product = await getProductById(input.productId);
  const productName = product?.productName || "";

  // === 3. CCP 자동 생성 ===
  let ccpCreated = false;
  let ccpCount = 0;
  let ccpGroups: Array<{ id: number; name: string; ccp_type: string }> = [];
  let ccpGroupNames: string[] = [];

  try {
    const result = await autoCreateCcpInstancesForBatch({
      siteId: input.siteId,
      workDate: input.workDate,
      batchId,
      productId: input.productId,
      productName,
      createdBy: input.userId,
      tenantId: input.tenantId,
    });
    ccpCreated = result.instanceIds.length > 0;
    ccpCount = result.instanceIds.length;
    ccpGroups = (result.groups || []).map((g: any) => ({
      id: g.id, name: g.name, ccp_type: g.ccp_type,
    }));
    ccpGroupNames = ccpGroups.map(g => g.name);

    // 3.1. CCP form records 자동 생성 (인쇄용 양식)
    if (ccpCreated && result.groups.length > 0) {
      // BOM batch_target_kg 조회 → 배치수 자동계산 (plannedQtyKg / bomBatchKg)
      let bomBatchKg: number | undefined = undefined;
      try {
        const pool = await getRawConnection();
        const [bomRows] = await pool.execute<any[]>(
          `SELECT rv.batch_target_kg
           FROM h_mf_report_versions rv
           JOIN h_mf_reports mr ON rv.mf_report_id = mr.id
           WHERE mr.product_id = ? AND mr.tenant_id = ?
             AND rv.approval_status = 'APPROVED'
           ORDER BY rv.id DESC LIMIT 1`,
          [input.productId, input.tenantId]
        );
        const btkVal = (bomRows as any[])[0]?.batch_target_kg;
        if (btkVal) {
          bomBatchKg = parseFloat(btkVal);
        } else {
          // fallback: h_recipe_headers
          const [rRows] = await pool.execute<any[]>(
            `SELECT target_quantity FROM h_recipe_headers WHERE product_id = ? AND unit != '%' ORDER BY id DESC LIMIT 1`,
            [input.productId]
          );
          const fallback = (rRows as any[])[0]?.target_quantity;
          if (fallback) bomBatchKg = parseFloat(fallback);
        }
        if (bomBatchKg) {
          console.log(`[batchOrchestrator] BOM batch_target_kg=${bomBatchKg}kg, planned=${input.plannedQuantityKg}kg → batchCount=${Math.ceil(input.plannedQuantityKg / bomBatchKg)}`);
        }
      } catch (bomErr) {
        console.error("[batchOrchestrator] BOM batch_target_kg 조회 실패:", bomErr);
      }

      try {
        const { getOrCreateCcpFormRecord } = await import("../db/ccpFormRecords");
        for (const group of result.groups) {
          await getOrCreateCcpFormRecord({
            tenantId: input.tenantId,
            siteId: input.siteId,
            batchId,
            ccpType: group.ccp_type,
            workDate: input.workDate,
            productId: input.productId,
            productName,
            processGroupId: group.id,
            processGroupName: group.name,
            bomBatchKg,
            plannedQtyKg: input.plannedQuantityKg,
            writerId: input.userId,
            clHeatTimeMinLo: group.time_min ?? undefined,
            clHeatTimeMinHi: group.time_max ?? undefined,
            clHeatTempLo: group.temperature_min ?? undefined,
            clPressureMpaLo: group.pressure_min ?? undefined,
            clProductTempLo: group.temperature_min ?? undefined,
          });
        }
        console.log(`[batchOrchestrator] CCP form records 생성 완료: ${result.groups.length}건 (bomBatchKg=${bomBatchKg ?? "N/A"})`);
      } catch (formErr) {
        console.error("[batchOrchestrator] CCP form records 생성 실패:", formErr);
      }

      // 3.2. h_ccp_rows → h_ccp_form_rows 동기화 (설비 기준값 → 인쇄용 기록지)
      try {
        const { syncCcpRowsToFormRows } = await import("../db/ccpFormRecords");
        const syncResult = await syncCcpRowsToFormRows({
          batchId,
          tenantId: input.tenantId,
        });
        console.log(`[batchOrchestrator] CCP form rows 동기화 완료: ${syncResult.synced}건`);
      } catch (syncErr) {
        console.error("[batchOrchestrator] CCP form rows 동기화 실패:", syncErr);
      }
    }
  } catch (error) {
    console.error("[batchOrchestrator] CCP 자동 생성 실패:", error);
  }

  // === 4. SKU 생산수량 기록 ===
  if (input.skuOutputs && input.skuOutputs.length > 0) {
    try {
      const conn = await getRawConnection();
      for (const skuOut of input.skuOutputs) {
        if (!skuOut.plannedQty && !skuOut.actualQty) continue;
        const [skuRows] = await conn.execute<any[]>(
          "SELECT kg_per_sales_unit FROM product_skus WHERE id=? AND tenant_id=?",
          [skuOut.skuId, input.tenantId],
        );
        const kgPerUnit = (skuRows as any[])[0]?.kg_per_sales_unit
          ? parseFloat((skuRows as any[])[0].kg_per_sales_unit)
          : 1;
        const qty = skuOut.actualQty ?? skuOut.plannedQty;
        const totalKg = (qty * kgPerUnit).toFixed(3);
        await conn.execute(
          `INSERT INTO production_sku_output (tenant_id, batch_id, sku_id, quantity, defective_qty, total_kg, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE quantity=VALUES(quantity), defective_qty=VALUES(defective_qty), total_kg=VALUES(total_kg)`,
          [input.tenantId, batchId, skuOut.skuId, qty, skuOut.defectiveQty || 0, totalKg, skuOut.note || null],
        );
      }
    } catch (skuErr) {
      console.error("[batchOrchestrator] SKU 기록 실패:", skuErr);
    }
  }

  // === 5. 배치 스케줄 생성 ===
  let scheduleCreated = false;
  try {
    const { createBatchSchedule } = await import("../db/batchSchedules");
    await createBatchSchedule({
      tenantId: input.tenantId,
      batchId,
      scheduledDate: plannedDate,
      status: "scheduled",
      notes: `배치: ${batchCodeFinal}, 시작: ${input.startTime}${input.endTime ? `, 종료: ${input.endTime}` : ""}`,
    });
    scheduleCreated = true;
  } catch (error) {
    console.error("[batchOrchestrator] 스케줄 생성 실패:", error);
  }

  // === 6. 승인요청 자동 등록 (skipGroupActions가 true면 caller가 그룹 수준에서 처리) ===
  let approvalRequestId: number | null = null;
  if (ccpCreated && !input.skipGroupActions) {
    try {
      const { autoCreateApprovalRequest } = await import("../lib/autoApprovalRequest");
      const approvalResult = await autoCreateApprovalRequest(
        batchId, input.userId, null,
      );
      if (approvalResult.success) {
        approvalRequestId = approvalResult.approvalRequestId;
      }
    } catch (approvalErr) {
      console.error("[batchOrchestrator] 승인요청 생성 실패:", approvalErr);
    }
  }

  // === 7. 일일일지 자동생성 (skipGroupActions가 true면 caller가 그룹 수준에서 처리) ===
  let dailyReportCreated = false;
  if (!input.skipGroupActions) {
    try {
      const { autoGenerateDailyReport } = await import("../lib/autoDailyReport");
      const dailyResult = await autoGenerateDailyReport(batchId, input.userId);
      dailyReportCreated = dailyResult.success;
    } catch (dailyErr) {
      console.error("[batchOrchestrator] 일일일지 생성 실패:", dailyErr);
    }
  }

  // === 7.5 주간/월간/연간 일지 자동생성 (auto 모드 + 단일 배치 전용) ===
  let periodicLogsResult: any = null;
  if (!input.skipGroupActions) {
    try {
      const { autoGenerateAllPeriodicLogs } = await import("../lib/autoPeriodicLogs");
      periodicLogsResult = await autoGenerateAllPeriodicLogs(
        input.mode,
        input.tenantId,
        input.siteId,
        input.workDate,
        input.userId,
        { batchId, productName, plannedQty: input.plannedQuantityKg },
      );
      if (periodicLogsResult) {
        const newLogs = [periodicLogsResult.weekly, periodicLogsResult.monthly, periodicLogsResult.yearly]
          .filter((r: any) => r?.isNew);
        if (newLogs.length > 0) {
          console.log(`[batchOrchestrator] 기간별 일지 ${newLogs.length}건 자동생성`);
        }
      }
    } catch (periodicErr) {
      console.error("[batchOrchestrator] 기간별 일지 생성 실패:", periodicErr);
    }
  }

  // === 8. 감사로그 ===
  try {
    await createAuditLog({
      action: "batch.create",
      entityType: "batch",
      entityId: batchId,
      userId: input.userId,
      userEmail: input.userEmail || "",
      userRole: input.userRole || "",
      description: `배치 생성: ${batchCodeFinal} (${productName}) ${ccpCreated ? `CCP ${ccpCount}건` : ""}`,
      changes: { mode: input.mode, workDate: input.workDate },
    });
  } catch {
    // audit log 실패는 무시
  }

  return {
    batchId,
    batchCode: batchCodeFinal,
    productId: input.productId,
    productName,
    ccpCreated,
    ccpCount,
    ccpGroups,
    approvalRequestId,
    scheduleCreated,
    dailyReportCreated,
    periodicLogsResult,
  };
}

/**
 * 배치 코드 자동 생성
 * 형식: {product_code}-{YYYYMMDD}-{시퀀스}
 */
async function generateBatchCode(
  tenantId: number,
  productId: number,
  workDate: string,
): Promise<string> {
  const conn = await getRawConnection();

  // 제품 코드 조회 (h_products_v2 우선)
  let productCode = "00000";
  try {
    const [v2Rows] = await conn.execute<any[]>(
      "SELECT product_code FROM h_products_v2 WHERE id=? AND tenant_id=? LIMIT 1",
      [productId, tenantId],
    );
    if ((v2Rows as any[]).length > 0 && (v2Rows as any[])[0].product_code) {
      productCode = (v2Rows as any[])[0].product_code;
    } else {
      const [v1Rows] = await conn.execute<any[]>(
        "SELECT product_code FROM h_products WHERE id=? LIMIT 1",
        [productId],
      );
      if ((v1Rows as any[]).length > 0 && (v1Rows as any[])[0].product_code) {
        productCode = (v1Rows as any[])[0].product_code;
      }
    }
  } catch { /* use default */ }

  // 해당 날짜의 기존 배치 수 조회
  const dateStr = workDate.replace(/-/g, "");
  const [countRows] = await conn.execute<any[]>(
    "SELECT COUNT(*) as cnt FROM h_batches WHERE tenant_id=? AND batch_code LIKE ?",
    [tenantId, `${productCode}-${dateStr}-%`],
  );
  const seq = ((countRows as any[])[0]?.cnt || 0) + 1;

  return `${productCode}-${dateStr}-${String(seq).padStart(3, "0")}`;
}
