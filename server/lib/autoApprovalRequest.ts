/**
 * 배치 완료 시 승인 대기 문서 자동 등록 서비스
 *
 * 워크플로우 (작성자 자동승인 → 검토자 단계):
 * 1. 배치 완료 후 생산일지 document_instances 등록
 * 2. 작성자(배치 완료자)를 자동 승인 처리 → status = 'pending_review'
 * 3. h_approval_requests에 'pending_review' 상태로 등록
 * 4. 검토자가 다음 단계 처리 필요
 */
import { getDb } from "../db";
import { sql, eq } from "drizzle-orm";
import { getFirstRow, getInsertId, getRows } from "../utils/dbHelpers";

import { todayKST } from "../utils/timezone";

interface AutoApprovalResult {
  success: boolean;
  documentInstanceId: number | null;
  approvalRequestId: number | null;
  message: string;
}

export async function autoCreateApprovalRequest(
  batchId: number,
  userId: number,
  pdfUrl?: string | null
): Promise<AutoApprovalResult> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  try {
    const { hBatches } = await import("../../drizzle/schema");
    const [batch] = await db.select().from(hBatches).where(eq(hBatches.id, batchId)).limit(1);

    if (!batch) {
      throw new Error(`배치 ID ${batchId}를 찾을 수 없습니다.`);
    }

    const siteId = Number(batch.siteId);
    const tenantId = Number(batch.tenantId);
    const productId = Number(batch.productId);
    const workDate = todayKST();

    const productInfo = await db.execute(sql`
      SELECT p.product_name, p.product_code
      FROM h_products_v2 p
      WHERE p.id = ${productId} AND p.tenant_id = ${tenantId}
      LIMIT 1
    `);
    const product = getFirstRow<{ product_name: string; product_code: string }>(productInfo) || { product_name: "미확인", product_code: "" };

    const docTypeResult = await db.execute(sql`
      SELECT id FROM document_types WHERE code = 'production_log' LIMIT 1
    `);
    const docTypeId = getFirstRow<{ id: number }>(docTypeResult)?.id;

    if (!docTypeId) {
      throw new Error("생산일지 문서 타입이 등록되지 않았습니다.");
    }

    const existingDoc = await db.execute(sql`
      SELECT id FROM document_instances
      WHERE batch_id = ${batchId}
        AND document_type_id = ${docTypeId}
        AND tenant_id = ${tenantId}
      LIMIT 1
    `);

    const existingDocRows = getRows<{ id: number }>(existingDoc);
    if (existingDocRows.length > 0) {
      const existingId = existingDocRows[0].id;
      return {
        success: true,
        documentInstanceId: Number(existingId),
        approvalRequestId: null,
        message: `이미 등록된 문서가 있습니다 (ID: ${existingId})`
      };
    }

    // document_instances 등록 - 작성자 자동승인 → pending_review
    const documentData = {
      batchId: batchId,
      batchCode: batch.batchCode,
      productName: product.product_name,
      productCode: product.product_code,
      plannedQuantity: parseFloat(batch.plannedQuantity?.toString() || "0"),
      actualQuantity: parseFloat(batch.actualQuantity?.toString() || "0"),
      completedAt: batch.completedAt || new Date().toISOString(),
      lotNumber: batch.lotNumber,
      expiryDate: batch.expiryDate,
      autoApprovedBy: userId,
      autoApprovedAt: new Date().toISOString()
    };

    const docInsertResult = await db.execute(sql`
      INSERT INTO document_instances
        (site_id, document_type_id, batch_id, product_id, work_date, status,
         created_by, is_auto_generated, auto_approval_enabled, document_data,
         pdf_url, pdf_generated_at, tenant_id)
      VALUES
        (${siteId}, ${docTypeId}, ${batchId}, ${productId}, ${workDate},
         'pending_review', ${userId}, 1, 0, ${JSON.stringify(documentData)},
         ${pdfUrl || null}, ${pdfUrl ? sql`NOW()` : sql`NULL`}, ${tenantId})
    `);

    const documentInstanceId = getInsertId(docInsertResult);

    // h_approval_requests 등록 - pending_review (검토자 대기)
    const title = `[생산일지] ${product.product_name} - 배치 ${batch.batchCode || `#${batchId}`}`;
    const description = `배치 #${batchId} (${product.product_name}) 생산 완료\n` +
      `계획 수량: ${batch.plannedQuantity}, 실제 수량: ${batch.actualQuantity}\n` +
      `LOT: ${batch.lotNumber || "미지정"}\n` +
      `[작성자 자동승인 처리됨 - 검토자 검토 필요]`;

    const approvalInsertResult = await db.execute(sql`
      INSERT INTO h_approval_requests
        (site_id, request_type, reference_type, reference_id, title, description,
         status, priority, requested_by, tenant_id)
      VALUES
        (${siteId}, 'batch_completion', 'document_instance', ${documentInstanceId},
         ${title}, ${description}, 'pending_review', 'medium', ${userId}, ${tenantId})
    `);

    const approvalRequestId = getInsertId(approvalInsertResult);

    console.log(`[autoApprovalRequest] 배치 #${batchId} → 문서 #${documentInstanceId}(pending_review), 승인요청 #${approvalRequestId} 생성 완료`);

    return {
      success: true,
      documentInstanceId,
      approvalRequestId,
      message: `검토자 단계로 자동 등록되었습니다 (문서 ID: ${documentInstanceId}, 승인요청 ID: ${approvalRequestId})`
    };
  } catch (error: any) {
    console.error(`[autoApprovalRequest] 배치 #${batchId} 승인 요청 생성 실패:`, error);
    return {
      success: false,
      documentInstanceId: null,
      approvalRequestId: null,
      message: error.message || "승인 요청 생성 실패"
    };
  }
}

/**
 * 검토 완료 처리 (검토자 → 승인자 단계)
 */
export async function reviewApprovalRequest(
  approvalRequestId: number,
  reviewerId: number,
  tenantId: number,
  comments?: string
): Promise<{ success: boolean; message: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  if (!tenantId) throw new Error("[보안] tenantId는 필수입니다");

  try {
    await db.execute(sql`
      UPDATE h_approval_requests
      SET status = 'pending_approval',
          reviewed_by = ${reviewerId},
          reviewed_at = NOW(),
          review_comments = ${comments || "검토 완료"}
      WHERE id = ${approvalRequestId} AND status = 'pending_review' AND tenant_id = ${tenantId}
    `);

    const req = await db.execute(sql`
      SELECT reference_type, reference_id FROM h_approval_requests
      WHERE id = ${approvalRequestId} AND tenant_id = ${tenantId}
    `);
    const reqData = getFirstRow<{ reference_type: string; reference_id: number }>(req);
    if (reqData?.reference_type === 'document_instance' && reqData?.reference_id) {
      await db.execute(sql`
        UPDATE document_instances
        SET status = 'pending_approval',
            reviewer_id = ${reviewerId},
            reviewed_at = NOW(),
            review_comments = ${comments || "검토 완료"}
        WHERE id = ${reqData.reference_id} AND tenant_id = ${tenantId}
      `);
    }

    console.log(`[reviewApproval] 승인요청 #${approvalRequestId} 검토 완료 → pending_approval`);
    return { success: true, message: "검토 완료 - 승인자 단계로 이동했습니다." };
  } catch (error: any) {
    console.error(`[reviewApproval] 검토 처리 실패:`, error);
    return { success: false, message: error.message || "검토 처리 실패" };
  }
}

/**
 * 최종 승인 완료 처리 (승인자 → approved)
 * 승인 완료 후 재고 이동 + 회계연동 트리거
 */
export async function finalApproveRequest(
  approvalRequestId: number,
  approverId: number,
  tenantId: number,
  comments?: string
): Promise<{ success: boolean; message: string; inventoryTriggered?: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  if (!tenantId) throw new Error("[보안] tenantId는 필수입니다");

  try {
    await db.execute(sql`
      UPDATE h_approval_requests
      SET status = 'approved',
          approved_by = ${approverId},
          approved_at = NOW(),
          notes = ${comments || "승인 완료"}
      WHERE id = ${approvalRequestId} AND status IN ('pending_approval', 'pending_review', 'pending')
        AND tenant_id = ${tenantId}
    `);

    const req = await db.execute(sql`
      SELECT reference_type, reference_id FROM h_approval_requests
      WHERE id = ${approvalRequestId} AND tenant_id = ${tenantId}
    `);
    const reqData = getFirstRow<{ reference_type: string; reference_id: number }>(req);

    if (reqData?.reference_type === 'document_instance' && reqData?.reference_id) {
      const documentInstanceId = Number(reqData.reference_id);

      await db.execute(sql`
        UPDATE document_instances
        SET status = 'approved',
            approver_id = ${approverId},
            approved_at = NOW(),
            approval_comments = ${comments || "승인 완료"}
        WHERE id = ${documentInstanceId} AND tenant_id = ${tenantId}
      `);

      // 배치 ID 조회 후 재고 이동 트리거
      const docInfo = await db.execute(sql`
        SELECT batch_id FROM document_instances WHERE id = ${documentInstanceId} AND tenant_id = ${tenantId}
      `);
      const batchId = getFirstRow<{ batch_id: number }>(docInfo)?.batch_id;

      if (batchId) {
        try {
          // 2026-04-29 (F2-3-b): dispatcher 경유 — env 기본 v1 (안전).
          const { productionCompleteDispatch } = await import("./production/productionCompleteDispatcher");
          const { hBatches } = await import("../../drizzle/schema");
          const { eq: drizzleEq } = await import("drizzle-orm");
          const [batch] = await db.select().from(hBatches).where(drizzleEq(hBatches.id, batchId)).limit(1);
          const actualQuantity = parseFloat(batch?.actualQuantity?.toString() || "0");

          if (actualQuantity > 0) {
            await productionCompleteDispatch(batchId, actualQuantity, approverId, tenantId);
            console.log(`[finalApprove] 배치 #${batchId} 재고이동/회계연동 완료`);
            return {
              success: true,
              message: "승인 완료 - 제품재고 이동 및 회계연동이 처리되었습니다.",
              inventoryTriggered: true
            };
          } else {
            console.warn(`[finalApprove] 배치 #${batchId} actualQuantity=0, 재고이동 건너뜀`);
          }
        } catch (invErr: any) {
          console.error(`[finalApprove] 재고이동 실패 (승인은 완료):`, invErr);
          return {
            success: true,
            message: `승인 완료 (재고이동 오류: ${invErr.message})`,
            inventoryTriggered: false
          };
        }
      }
    }


    // === batch_production 승인 시 배치 상태를 completed로 전환 + CCP-1B/2B 자동 승인 ===
    if (reqData?.reference_type === 'batch' && reqData?.reference_id) {
      const batchId = Number(reqData.reference_id);
      try {
        const rawConn = await (await import("../db")).getRawConnection();
        
        // 1) 배치 상태를 completed로 변경 (planned_date 기준 17:00)
        await rawConn.execute(
          `UPDATE h_batches SET status='completed',
            end_time=CONCAT(planned_date, ' 17:00:00'),
            completed_at=CONCAT(planned_date, ' 17:00:00')
           WHERE id=? AND tenant_id=? AND status IN ('planned','in_progress')`,
          [batchId, tenantId]
        );
        console.log(`[finalApprove] 배치 #${batchId} 상태 → completed`);

        // ★ 2026-05-09 (PR #276): h_batch_inputs 비어있으면 BOM 자동 적용 (사후 안전망)
        // - 흑임자 460/461 사고 패턴 차단: completed 인데 inputs 0 행 → 재고 0 차감 (silent failure)
        try {
          const { applyBomToBatch } = await import("./production/applyBomToBatch.js");
          const [batchInfoRows]: any = await rawConn.execute(
            `SELECT product_id, planned_quantity FROM h_batches WHERE id = ? AND tenant_id = ? LIMIT 1`,
            [batchId, tenantId],
          );
          const batchInfo = (batchInfoRows as any[])[0];
          if (batchInfo?.product_id && batchInfo?.planned_quantity) {
            const bomResult = await applyBomToBatch({
              batchId,
              productId: Number(batchInfo.product_id),
              plannedQuantity: Number(batchInfo.planned_quantity),
              tenantId,
            });
            if (bomResult.attempted && bomResult.insertedCount > 0) {
              console.log(
                `[finalApprove] 배치 #${batchId} BOM 자동 적용 (사후): ${bomResult.insertedCount}건`,
              );
            }
          }
        } catch (bomErr: any) {
          console.error(`[finalApprove] BOM 자동 적용 실패 (계속 진행):`, bomErr?.message ?? bomErr);
        }

        // ★ 2026-05-09 (PR #274): completeBatch() 우회 경로 — 자동 동기화 헬퍼 호출
        // - actual_quantity 자동 갱신 (4/22 batch 591, 4/27 batch 600 등 NULL 패턴 차단)
        // - h_batch_inputs 누락 알람
        // - h_daily_reports 캐시 무효화
        try {
          const { syncBatchOnComplete } = await import("./production/syncBatchOnComplete.js");
          const syncResult = await syncBatchOnComplete(batchId, tenantId);
          if (syncResult.warnings.length > 0) {
            console.warn(`[finalApprove] 배치 #${batchId} sync 경고:`, syncResult.warnings);
          }
        } catch (syncErr: any) {
          console.error(`[finalApprove] syncBatchOnComplete 실패 (계속 진행):`, syncErr?.message ?? syncErr);
        }

        // 2) 해당 배치의 CCP-1B/2B form_records를 approved로 변경하고 승인요청 생성
        const [draftRecords] = await rawConn.execute(
          `SELECT fr.id, fr.ccp_type, fr.work_date, fr.product_name, b.batch_code
           FROM h_ccp_form_records fr
           JOIN h_batches b ON b.id = fr.batch_id
           WHERE fr.batch_id=? AND fr.tenant_id=? AND fr.status='draft' AND fr.ccp_type IN ('CCP-1B','CCP-2B')`,
          [batchId, tenantId]
        ) as any[];
        
        for (const rec of (draftRecords as any[])) {
          // form_record를 approved로 변경
          await rawConn.execute(
            `UPDATE h_ccp_form_records SET status='approved' WHERE id=? AND tenant_id=?`,
            [rec.id, tenantId]
          );
          // 승인요청 생성
          const ccpTitle = `[CCP-${rec.ccp_type}] ${rec.work_date} ${rec.product_name}`;
          const [arResult] = await rawConn.execute(
            `INSERT INTO h_approval_requests
             (site_id, tenant_id, request_type, reference_type, reference_id,
              title, description, status, priority, requested_by, requested_at,
              reviewed_by, reviewed_at, review_comments, approved_by, approved_at)
             VALUES (?, ?, 'ccp_form', 'ccp_form_record', ?,
                     ?, ?, 'approved', 'medium', ?, CONCAT(?, ' 17:00:00'),
                     ?, CONCAT(?, ' 17:00:00'), '검토 완료', ?, CONCAT(?, ' 17:30:00'))`,
            [tenantId, tenantId, rec.id,
             ccpTitle, `CCP 기록지 작성 완료 - ${rec.product_name}`,
             approverId, rec.work_date,
             approverId, rec.work_date,
             approverId, rec.work_date]
          ) as any;
          const newArId = arResult.insertId;
          await rawConn.execute(
            `UPDATE h_ccp_form_records SET approval_request_id=? WHERE id=? AND tenant_id=?`,
            [newArId, rec.id, tenantId]
          );
          console.log(`[finalApprove] CCP ${rec.ccp_type} form_record #${rec.id} → approved (AR #${newArId})`);
        }
      } catch (batchErr: any) {
        console.error(`[finalApprove] 배치 #${batchId} 완료처리 실패:`, batchErr);
      }
    }

    console.log(`[finalApprove] 승인요청 #${approvalRequestId} 최종 승인 완료`);
    return { success: true, message: "승인 완료되었습니다.", inventoryTriggered: false };
  } catch (error: any) {
    console.error(`[finalApprove] 최종 승인 실패:`, error);
    return { success: false, message: error.message || "최종 승인 실패" };
  }
}

/**
 * 일괄 승인 처리 (승인 허브용)
 */
export async function bulkApproveDocuments(
  approvalRequestIds: number[],
  approverId: number,
  tenantId: number,
  comments?: string
): Promise<{ success: boolean; approved: number; failed: number; errors: string[] }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  if (!tenantId) throw new Error("[보안] tenantId는 필수입니다");

  let approved = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const requestId of approvalRequestIds) {
    try {
      const result = await finalApproveRequest(requestId, approverId, tenantId, comments || "일괄 승인");
      if (result.success) {
        approved++;
      } else {
        failed++;
        errors.push(`승인요청 #${requestId}: ${result.message}`);
      }
    } catch (error: any) {
      failed++;
      errors.push(`승인요청 #${requestId}: ${error.message}`);
    }
  }

  console.log(`[bulkApprove] 일괄 승인 완료: ${approved}건 승인, ${failed}건 실패`);
  return { success: failed === 0, approved, failed, errors };
}

/**
 * 일괄 출력 그룹 생성 (출력 허브용)
 */
export async function createBatchPrintGroup(
  siteId: number,
  documentInstanceIds: number[],
  groupName: string,
  userId: number,
  tenantId: number
): Promise<{ success: boolean; groupId: number | null; message: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  try {
    const workDate = todayKST();

    const groupResult = await db.execute(sql`
      INSERT INTO document_batch_print_groups
        (site_id, work_date, group_name, description, total_documents, printed_by, tenant_id)
      VALUES
        (${siteId}, ${workDate}, ${groupName},
         ${`${documentInstanceIds.length}건의 문서 일괄 출력`},
         ${documentInstanceIds.length}, ${userId}, ${tenantId})
    `);

    const groupId = getInsertId(groupResult);

    for (let i = 0; i < documentInstanceIds.length; i++) {
      await db.execute(sql`
        INSERT INTO document_batch_print_items
          (batch_print_group_id, document_instance_id, sort_order, tenant_id)
        VALUES
          (${groupId}, ${documentInstanceIds[i]}, ${i + 1}, ${tenantId})
      `);
    }

    console.log(`[createBatchPrintGroup] 출력 그룹 #${groupId} 생성: ${documentInstanceIds.length}건`);
    return {
      success: true,
      groupId,
      message: `출력 그룹이 생성되었습니다 (ID: ${groupId}, ${documentInstanceIds.length}건)`
    };
  } catch (error: any) {
    console.error(`[createBatchPrintGroup] 출력 그룹 생성 실패:`, error);
    return {
      success: false,
      groupId: null,
      message: error.message || "출력 그룹 생성 실패"
    };
  }
}
