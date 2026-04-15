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
 * @deprecated v1 퇴출 완료 — h_products_v2.id를 직접 사용
 * DB 마이그레이션(migrate-products-v1-to-v2.ts) 실행 후에는
 * 모든 product_id가 h_products_v2.id이므로 변환이 불필요합니다.
 * 하위 호환을 위해 함수는 유지하되 입력값을 그대로 반환합니다.
 */
export async function resolveToHProductId(
  productId: number,
  _tenantId: number,
): Promise<number> {
  return productId; // v1 퇴출 후: 변환 불필요, ID 그대로 반환
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
  // KST 날짜를 UTC 변환 없이 정확히 유지하기 위해 noon(12:00)으로 설정
  // T00:00:00 KST → T15:00:00Z(전날) 문제 방지
  const plannedDate = new Date(`${input.workDate}T12:00:00`);
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

  // === 2. 제품 정보 조회 (테넌트 격리) ===
  const product = await getProductById(input.productId, input.tenantId);
  const productName = product?.productName || "";

  // === 3. CCP 자동 생성 ===
  let ccpCreated = false;
  let ccpCount = 0;
  let ccpGroups: Array<{ id: number; name: string; ccp_type: string }> = [];
  let ccpGroupNames: string[] = [];

  // BOM batch_target_kg 선행 조회 → CCP 인스턴스 생성 + form records 모두에서 사용
  let bomBatchKg: number | undefined = undefined;
  try {
    const bomPool = await getRawConnection();
    const [bomRows] = await bomPool.execute<any[]>(
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
    }
    if (bomBatchKg) {
      console.log(`[batchOrchestrator] BOM batch_target_kg=${bomBatchKg}kg, planned=${input.plannedQuantityKg}kg → batchCount=${Math.ceil(input.plannedQuantityKg / bomBatchKg)}`);
    }
  } catch (bomErr) {
    console.error("[batchOrchestrator] BOM batch_target_kg 조회 실패:", bomErr);
  }

  try {
    const result = await autoCreateCcpInstancesForBatch({
      siteId: input.siteId,
      workDate: input.workDate,
      batchId,
      productId: input.productId,
      productName,
      createdBy: input.userId,
      tenantId: input.tenantId,
      plannedQuantity: input.plannedQuantityKg,
      bomBatchKg: bomBatchKg ?? undefined, // 선행 조회된 값 전달
    });
    ccpCreated = result.instanceIds.length > 0;
    ccpCount = result.instanceIds.length;
    ccpGroups = (result.groups || []).map((g: any) => ({
      id: g.id, name: g.name, ccp_type: g.ccp_type,
    }));
    ccpGroupNames = ccpGroups.map(g => g.name);
    console.log(`[batchOrchestrator] CCP 자동생성 결과: batchId=${batchId}, instanceIds=${result.instanceIds}, groups=${JSON.stringify(ccpGroups.map(g => g.ccp_type))}, created=${ccpCreated}`);

    // 3.1. CCP form records 자동 생성 (인쇄용 양식)
    if (ccpCreated && result.groups.length > 0) {
      try {
        const { getOrCreateCcpFormRecord } = await import("../db/haccp/ccpFormRecords");
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
        console.log(`[batchOrchestrator] CCP form records 생성 완료: ${result.groups.length}건 (bomBatchKg=${bomBatchKg ?? "N/A"}, groups=${result.groups.map((g:any) => g.ccp_type).join(',')})`);
      } catch (formErr) {
        console.error("[batchOrchestrator] CCP form records 생성 실패:", formErr);
      }

      // 3.2. h_ccp_rows → h_ccp_form_rows 동기화 (설비 기준값 → 인쇄용 기록지)
      try {
        const { syncCcpRowsToFormRows } = await import("../db/haccp/ccpFormRecords");
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
    const { createBatchSchedule } = await import("../db/production/batchSchedules");
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

  // === 5.5. 배치 상태 → in_progress 전환 + 원료 자동 출고 (auto 모드) ===
  // ★ auto 모드이거나 endTime 이 지정되어 있으면 즉시 시작 상태로 전환하고
  //    h_batch_inputs 기준 원료 차감 + material_ledger_daily 반영
  //    (기존에는 updateStatus 뮤테이션으로만 트리거되어 auto 모드 배치는 수불 반영 누락)
  if (ccpCreated && (input.mode === "auto" || input.endTime)) {
    try {
      const { updateBatchStatus } = await import("../db/production/batchCRUD");
      await updateBatchStatus(batchId, "in_progress", input.tenantId);
      const { autoIssueMaterialsForBatch } = await import("../lib/production/autoMaterialIssue");
      const issueResult = await autoIssueMaterialsForBatch(batchId, input.userId);
      if (!issueResult?.success) {
        console.warn(`[batchOrchestrator] 원료 자동 출고 일부 실패 (batch=${batchId}):`, issueResult?.errors);
      } else {
        console.log(
          `[batchOrchestrator] 배치 #${batchId} 원료 자동 출고 완료: ${issueResult.issuedMaterials?.length || 0}건`,
        );
      }
    } catch (issueErr) {
      console.error(`[batchOrchestrator] 배치 #${batchId} 원료 자동 출고 실패:`, issueErr);
    }
  }

  // === 6. 승인요청 자동 등록 (skipGroupActions가 true면 caller가 그룹 수준에서 처리) ===
  let approvalRequestId: number | null = null;
  if (ccpCreated && !input.skipGroupActions) {
    try {
      const { autoCreateApprovalRequest } = await import("../lib/production/autoApprovalRequest");
      const approvalResult = await autoCreateApprovalRequest(
        batchId, input.userId, null,
      );
      if (approvalResult.success) {
        approvalRequestId = approvalResult.approvalRequestId;
      }
    } catch (approvalErr) {
      console.error("[batchOrchestrator] 승인요청 생성 실패:", approvalErr);
    }

    // === 6.1. CCP-4P 금속검출 통합 승인요청 (단일 배치 모드) ===
    // CCP-4P는 날짜별 1건 통합 기록지 → 승인요청이 없으면 자동 생성
    if (ccpGroups.some(g => g.ccp_type === "CCP-4P")) {
      try {
        const conn4p = await getRawConnection();
        const [ccp4pRecs] = await conn4p.execute<any[]>(
          `SELECT id, batch_id, status, approval_request_id
           FROM h_ccp_form_records
           WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND work_date = ?
           ORDER BY id ASC LIMIT 1`,
          [input.tenantId, input.workDate],
        );
        if ((ccp4pRecs as any[]).length > 0) {
          const ccp4pRec = (ccp4pRecs as any[])[0];
          if (!ccp4pRec.approval_request_id) {
            await conn4p.execute(
              `UPDATE h_ccp_form_records SET status='approved', submitted_at=NOW(), writer_id=? WHERE id=? AND tenant_id=?`,
              [input.userId, ccp4pRec.id, input.tenantId],
            );
            const title4p = `[CCP-CCP-4P] ${input.workDate} 금속검출 통합`;
            const desc4p = `금속검출공정 CCP 기록지 (일일 통합)\n작업일: ${input.workDate}`;
            // ★ 즉시 approved 로 등록 (작성자=검토자=승인자 단일 단계)
            const [approvalResult4p] = await conn4p.execute(
              `INSERT INTO h_approval_requests
                (site_id, tenant_id, request_type, reference_type, reference_id,
                 title, description, status, priority,
                 requested_by, requested_at,
                 reviewed_by, reviewed_at, review_comments,
                 approved_by, approved_at, created_at)
               VALUES (?, ?, 'ccp_form', 'ccp_form_record', ?,
                       ?, ?, 'approved', 'high',
                       ?, NOW(),
                       ?, NOW(), '작성 = 확정',
                       ?, NOW(), NOW())`,
              [
                input.siteId, input.tenantId, ccp4pRec.id,
                title4p, desc4p,
                input.userId,
                input.userId,
                input.userId,
              ],
            );
            const approvalId4p = (approvalResult4p as any).insertId;
            await conn4p.execute(
              `UPDATE h_ccp_form_records SET approval_request_id=? WHERE id=? AND tenant_id=?`,
              [approvalId4p, ccp4pRec.id, input.tenantId],
            );
            console.log(`[batchOrchestrator] CCP-4P 금속검출 통합 승인요청 즉시 승인 등록: approvalId=${approvalId4p}`);
          }
        }
      } catch (ccp4pErr) {
        console.error("[batchOrchestrator] CCP-4P 승인요청 생성 실패:", ccp4pErr);
      }
    }

  }

  // === 6.2. CCP-1B / CCP-2B h_ccp_form_records.status 만 'approved' 로 전환 ===
  // ★ 2026-04-15 수정: skipGroupActions 블록 밖으로 이동 — 일괄배치(bulk)에서도 실행
  //   기존에는 skipGroupActions=true 일 때 이 블록이 스킵되어
  //   CCP-1B form_record 가 draft 상태로 남아 승인관리에 넘어가지 않는 버그 존재
  //   batch_production 승인요청 1건(배치 단위)만 생성되도록 단순화.
  //   PrintPreviewPage 가 batch_production 을 열 때 해당 배치의 모든 CCP 기록지를
  //   렌더링하므로 개별 승인요청이 불필요 → 출력대기 리스트에 중복 표시 방지.
  //   form_record 상태만 approved 로 전환하여 잠금 효과 유지.
  if (ccpCreated) {
    try {
      const ccp1b2bConn = await getRawConnection();
      const [updateResult] = await ccp1b2bConn.execute(
        `UPDATE h_ccp_form_records
         SET status = 'approved', submitted_at = NOW(), writer_id = ?
         WHERE batch_id = ? AND tenant_id = ? AND ccp_type IN ('CCP-1B','CCP-2B')
           AND status != 'approved'`,
        [input.userId, batchId, input.tenantId],
      );
      const affected = (updateResult as any).affectedRows || 0;
      if (affected > 0) {
        console.log(`[batchOrchestrator] CCP-1B/2B form_record ${affected}건 → approved (batchId=${batchId})`);
      }
    } catch (ccp1b2bErr) {
      console.error("[batchOrchestrator] CCP-1B/2B form_record status 전환 실패:", ccp1b2bErr);
    }
  }

  // === 6.3. 배치별 batch_production 승인요청 생성 (CCP 기록지 인쇄용) ===
  // ★ 2026-04-13: 단일 배치 / 일괄 배치 모두 이 경로에서 처리
  //   - skipGroupActions 여부와 무관하게 배치 1건당 1개의 batch_production AR 생성
  //   - status='approved' 로 즉시 등록 (작성자=검토자=승인자 단일 단계)
  //   - PrintPreviewPage 가 이 AR 을 열 때 해당 배치의 CCP-1B/2B 를 모두 렌더
  //   - CCP-4P 는 별도 일일 통합 AR 로 관리됨 (중복 배제)
  // 중복 생성 방지: 동일 batch_id 의 batch_production AR 이 이미 있으면 skip
  if (ccpCreated && ccpCount > 0) {
    try {
      const bpConn = await getRawConnection();
      const [existing] = await bpConn.execute<any[]>(
        `SELECT id FROM h_approval_requests
         WHERE tenant_id = ? AND request_type = 'batch_production'
           AND reference_type = 'batch' AND reference_id = ?
         LIMIT 1`,
        [input.tenantId, batchId],
      );
      if ((existing as any[]).length === 0) {
        const ccpGroupNames = ccpGroups
          .map((g: any) => `${g.name || g.ccp_type}(${g.ccp_type})`)
          .join(", ");
        const modeLabel = input.mode === "manual" ? "[수동]" : "[자동]";
        const bpTitle = `${modeLabel} 배치 CCP 승인 - ${batchCodeFinal} (${productName})`;
        const bpDesc =
          `제품: ${productName}\n계획일: ${input.workDate}\n` +
          `CCP ${ccpCount}건 자동 생성 완료\n배치코드: ${batchCodeFinal}\n` +
          `CCP 공정: ${ccpGroupNames}`;
        await bpConn.execute(
          `INSERT INTO h_approval_requests
             (site_id, tenant_id, request_type, reference_type, reference_id,
              title, description, status, priority,
              requested_by, requested_at,
              reviewed_by, reviewed_at, review_comments,
              approved_by, approved_at, created_at)
           VALUES (?, ?, 'batch_production', 'batch', ?,
                   ?, ?, 'approved', 'high',
                   ?, NOW(),
                   ?, NOW(), '작성 = 확정',
                   ?, NOW(), NOW())`,
          [
            input.siteId, input.tenantId, batchId,
            bpTitle, bpDesc,
            input.userId,
            input.userId,
            input.userId,
          ],
        );
        console.log(`[batchOrchestrator] 배치 #${batchId} batch_production 승인요청 즉시 승인 등록`);
      }
    } catch (bpErr) {
      console.error(`[batchOrchestrator] 배치 #${batchId} batch_production 승인요청 생성 실패:`, bpErr);
    }
  }

  // === 7. 일일일지 자동생성 (skipGroupActions가 true면 caller가 그룹 수준에서 처리) ===
  let dailyReportCreated = false;
  if (!input.skipGroupActions) {
    try {
      const { autoGenerateDailyReport } = await import("../lib/production/autoDailyReport");
      const dailyResult = await autoGenerateDailyReport(batchId, input.userId, input.workDate);
      dailyReportCreated = dailyResult.success;
    } catch (dailyErr) {
      console.error("[batchOrchestrator] 일일일지 생성 실패:", dailyErr);
    }
  }

  // === 7.5 주간/월간/연간 일지 자동생성 (auto 모드 + 단일 배치 전용) ===
  let periodicLogsResult: any = null;
  if (!input.skipGroupActions) {
    try {
      const { autoGenerateAllPeriodicLogs } = await import("../lib/production/autoPeriodicLogs");
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

  // 제품 코드 조회 (h_products_v2)
  let productCode = "00000";
  try {
    const [rows] = await conn.execute<any[]>(
      "SELECT product_code FROM h_products_v2 WHERE id=? AND tenant_id=? LIMIT 1",
      [productId, tenantId],
    );
    if ((rows as any[]).length > 0 && (rows as any[])[0].product_code) {
      productCode = (rows as any[])[0].product_code;
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
