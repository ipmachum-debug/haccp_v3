/**
 * 배치 완료 시 승인 대기 문서 자동 등록 서비스
 * 
 * 워크플로우:
 * 1. 배치 완료 후 생성된 PDF/문서 정보 조회
 * 2. document_instances에 자동 생성 문서 등록 (is_auto_generated = 1)
 * 3. h_approval_requests에 승인 요청 자동 등록
 * 4. 승인 대기 상태로 전환
 */

import { getDb } from "../db";
import { sql, eq } from "drizzle-orm";

interface AutoApprovalResult {
  success: boolean;
  documentInstanceId: number | null;
  approvalRequestId: number | null;
  message: string;
}

export async function autoCreateApprovalRequest(
  batchId: number,
  userId: number,
  pdfUrl?: string | null,
  ccpInfo?: { ccpCount: number; groups: string[]; mode: string }
): Promise<AutoApprovalResult> {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  try {
    // 1. 배치 정보 조회
    const { hBatches } = await import("../../drizzle/schema");
    const [batch] = await db.select().from(hBatches).where(eq(hBatches.id, batchId)).limit(1);
    
    if (!batch) {
      throw new Error(`배치 ID ${batchId}를 찾을 수 없습니다.`);
    }

    const siteId = Number(batch.siteId);
    const tenantId = Number(batch.tenantId);
    const productId = Number(batch.productId);
    // 배치 계획일자 사용 (없으면 오늘)
    const workDate = batch.plannedDate
      ? new Date(batch.plannedDate as any).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    // 2. 제품 정보 조회 (h_products_v2 우선, 폴백: h_products)
    let product = { product_name: "미확인", product_code: "" };
    try {
      const v2Info = await db.execute(sql`
        SELECT product_name, product_code FROM h_products_v2 WHERE id = ${productId} LIMIT 1
      `);
      const v2Row = (v2Info as any)[0]?.[0];
      if (v2Row?.product_name) {
        product = v2Row;
      } else {
        const v1Info = await db.execute(sql`
          SELECT product_name, product_code FROM h_products WHERE id = ${productId} LIMIT 1
        `);
        const v1Row = (v1Info as any)[0]?.[0];
        if (v1Row?.product_name) product = v1Row;
      }
    } catch (e) {
      // 폴백: h_products
      try {
        const v1Info = await db.execute(sql`
          SELECT product_name, product_code FROM h_products WHERE id = ${productId} LIMIT 1
        `);
        const v1Row = (v1Info as any)[0]?.[0];
        if (v1Row?.product_name) product = v1Row;
      } catch (_) { /* use default */ }
    }

    // 3. 생산일지 문서 타입 ID 조회 (code = 'production_log')
    const docTypeResult = await db.execute(sql`
      SELECT id FROM document_types WHERE code = 'production_log' LIMIT 1
    `);
    const docTypeId = (docTypeResult as any)[0]?.[0]?.id;
    
    if (!docTypeId) {
      throw new Error("생산일지 문서 타입이 등록되지 않았습니다.");
    }

    // 4. 중복 확인 - 이미 해당 배치의 문서가 있는지
    const existingDoc = await db.execute(sql`
      SELECT id FROM document_instances 
      WHERE batch_id = ${batchId} 
        AND document_type_id = ${docTypeId}
        AND tenant_id = ${tenantId}
      LIMIT 1
    `);

    if ((existingDoc as any)[0]?.length > 0) {
      const existingId = (existingDoc as any)[0][0].id;
      return {
        success: true,
        documentInstanceId: Number(existingId),
        approvalRequestId: null,
        message: `이미 등록된 문서가 있습니다 (ID: ${existingId})`
      };
    }

    // 5. document_instances에 문서 자동 등록
    const documentData = {
      batchId: batchId,
      batchCode: batch.batchCode,
      productName: product.product_name,
      productCode: product.product_code,
      plannedQuantity: parseFloat(batch.plannedQuantity?.toString() || "0"),
      actualQuantity: parseFloat(batch.actualQuantity?.toString() || "0"),
      completedAt: batch.completedAt || new Date().toISOString(),
      lotNumber: batch.lotNumber,
      expiryDate: batch.expiryDate
    };

    const docInsertResult = await db.execute(sql`
      INSERT INTO document_instances 
        (site_id, document_type_id, batch_id, product_id, work_date, status, 
         created_by, is_auto_generated, auto_approval_enabled, document_data, 
         pdf_url, pdf_generated_at, tenant_id)
      VALUES 
        (${siteId}, ${docTypeId}, ${batchId}, ${productId}, ${workDate}, 
         'pending_approval', ${userId}, 1, 0, ${JSON.stringify(documentData)},
         ${pdfUrl || null}, ${pdfUrl ? sql`NOW()` : sql`NULL`}, ${tenantId})
    `);

    const documentInstanceId = Number((docInsertResult as any)[0]?.insertId || 0);

    // 6. h_approval_requests에 승인 요청 등록
    const ccpGroupList = ccpInfo?.groups?.length ? ccpInfo.groups.join(', ') : '';
    const modeLabel = ccpInfo?.mode === 'auto' ? '자동' : '수동';
    const title = `[자동] 배치 CCP 승인 - ${batch.batchCode || `#${batchId}`} (${product.product_name})`;
    const description = [
      `배치: ${batch.batchCode || `#${batchId}`}`,
      `제품: ${product.product_name}`,
      ccpInfo ? `CCP 공정: ${ccpInfo.ccpCount}건${ccpGroupList ? ` [${ccpGroupList}]` : ''}` : '',
      ccpInfo ? `처리방식: ${modeLabel}배치` : '',
      `계획수량: ${batch.plannedQuantity || 0}`,
      batch.lotNumber ? `LOT: ${batch.lotNumber}` : '',
    ].filter(Boolean).join('\n');

    const approvalInsertResult = await db.execute(sql`
      INSERT INTO h_approval_requests 
        (site_id, request_type, reference_type, reference_id, title, description, 
         status, priority, requested_by, tenant_id)
      VALUES 
        (${siteId}, 'batch_production', 'batch', ${batchId}, 
         ${title}, ${description}, 'pending_review', 'medium', ${userId}, ${tenantId})
    `);

    const approvalRequestId = Number((approvalInsertResult as any)[0]?.insertId || 0);

    console.log(`[autoApprovalRequest] 배치 #${batchId} → 문서 #${documentInstanceId}, 승인요청 #${approvalRequestId} 생성 완료`);

    return {
      success: true,
      documentInstanceId,
      approvalRequestId,
      message: `승인 대기 문서가 자동 등록되었습니다 (문서 ID: ${documentInstanceId}, 승인요청 ID: ${approvalRequestId})`
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
 * 일괄 승인 처리 (승인 허브용)
 */
export async function bulkApproveDocuments(
  approvalRequestIds: number[],
  approverId: number,
  comments?: string
): Promise<{ success: boolean; approved: number; failed: number; errors: string[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  let approved = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const requestId of approvalRequestIds) {
    try {
      // 승인 요청 상태 업데이트
      await db.execute(sql`
        UPDATE h_approval_requests 
        SET status = 'approved', 
            approved_by = ${approverId}, 
            approved_at = NOW(),
            notes = ${comments || '일괄 승인'}
        WHERE id = ${requestId} AND status = 'pending'
      `);

      // 관련 document_instance 상태도 업데이트
      const request = await db.execute(sql`
        SELECT reference_type, reference_id FROM h_approval_requests WHERE id = ${requestId}
      `);
      const req = (request as any)[0]?.[0];

      if (req?.reference_type === 'document_instance' && req?.reference_id) {
        await db.execute(sql`
          UPDATE document_instances 
          SET status = 'approved', 
              approver_id = ${approverId}, 
              approved_at = NOW(),
              approval_comments = ${comments || '일괄 승인'}
          WHERE id = ${req.reference_id}
        `);
      }

      approved++;
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
  if (!db) throw new Error("Database connection not available");

  try {
    const workDate = new Date().toISOString().split("T")[0];

    // 출력 그룹 생성
    const groupResult = await db.execute(sql`
      INSERT INTO document_batch_print_groups 
        (site_id, work_date, group_name, description, total_documents, printed_by, tenant_id)
      VALUES 
        (${siteId}, ${workDate}, ${groupName}, 
         ${`${documentInstanceIds.length}건의 문서 일괄 출력`},
         ${documentInstanceIds.length}, ${userId}, ${tenantId})
    `);

    const groupId = Number((groupResult as any)[0]?.insertId || 0);

    // 출력 그룹 항목 등록
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
