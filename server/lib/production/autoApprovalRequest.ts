/**
 * 배치 완료 시 승인 대기 문서 자동 등록 서비스
 *
 * 워크플로우 (작성자 자동승인 → 검토자 단계):
 * 1. 배치 완료 후 생산일지 document_instances 등록
 * 2. 작성자(배치 완료자)를 자동 승인 처리 → status = 'pending_review'
 * 3. h_approval_requests에 'pending_review' 상태로 등록
 * 4. 검토자가 다음 단계 처리 필요
 */
import { getDb } from "../../db";
import { sql, eq } from "drizzle-orm";
import { getFirstRow, getInsertId, getRows } from "../../utils/dbHelpers";

import { todayKST } from "../../utils/timezone";

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
    const { hBatches } = await import("../../../drizzle/schema");
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
          const { productionCompleteDispatch } = await import("./productionCompleteDispatcher");
          const { hBatches } = await import("../../../drizzle/schema");
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

    // === batch_production 승인 시 배치 상태를 completed로 전환 ===
    // completed_at/end_time은 생산일(planned_date) 17:00 기준으로 설정
    if (reqData?.reference_type === "batch" && reqData?.reference_id) {
      const batchId = Number(reqData.reference_id);
      try {
        await db.execute(sql`
          UPDATE h_batches
          SET status = 'completed',
              end_time = CONCAT(planned_date, ' 17:00:00'),
              completed_at = CONCAT(planned_date, ' 17:00:00'),
              updated_at = NOW()
          WHERE id = ${batchId} AND tenant_id = ${tenantId}
        `);
        console.log(`[finalApprove] 배치 #${batchId} 상태 → completed (planned_date 기준)`);
      } catch (batchErr: any) {
        console.error(`[finalApprove] 배치 상태 업데이트 실패 (승인은 완료):`, batchErr);
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
