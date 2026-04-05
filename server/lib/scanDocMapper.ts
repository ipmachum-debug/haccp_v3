/**
 * 스캔 문서 자동 매핑 엔진
 * 
 * OCR 결과를 각 문서 타입의 실제 DB 테이블에 직접 입력
 * 
 * 지원 문서 타입:
 * - training_log → h_training_logs (교육훈련일지)
 * - ccp_record → h_ccp_form_records (CCP 기록지)
 * - inspection → h_inspections (검사기록)
 * - generic_checklist → h_generic_checklist_records (범용 체크리스트)
 * - personal_hygiene, temperature_humidity, equipment_cleaning 등 → generic_checklists
 */

import { getRawConnection } from "../db";

export interface ScanMappingResult {
  success: boolean;
  targetTable: string;
  insertedId: number | null;
  mappedFields: string[];
  unmappedFields: string[];
  message: string;
}

/**
 * OCR 구조화 데이터를 실제 DB에 매핑 저장
 */
export async function mapAndSave(
  tenantId: number,
  userId: number,
  siteId: number,
  docType: string,
  ocrData: Record<string, any>
): Promise<ScanMappingResult> {
  switch (docType) {
    case "training_log":
      return await mapTrainingLog(tenantId, userId, ocrData);
    case "ccp_record":
    case "ccp_2b":
    case "ccp_1b":
    case "ccp_4p":
      return await mapCcpRecord(tenantId, userId, siteId, docType, ocrData);
    case "inspection":
    case "material_inspection":
    case "hygiene_inspection":
    case "shipping_inspection":
      return await mapInspection(tenantId, userId, docType, ocrData);
    default:
      // 범용 체크리스트로 저장
      return await mapGenericChecklist(tenantId, userId, siteId, docType, ocrData);
  }
}

/**
 * 교육훈련일지 매핑
 * OCR → h_training_logs + h_generic_checklist_records
 */
async function mapTrainingLog(
  tenantId: number,
  userId: number,
  data: Record<string, any>
): Promise<ScanMappingResult> {
  const conn = await getRawConnection();
  const mapped: string[] = [];
  const unmapped: string[] = [];

  const formDate = data.formDate || new Date().toISOString().slice(0, 10);
  const title = data.title || "스캔 교육훈련일지";
  const inspector = data.inspector || "";

  // 1) 교육 완료 기록 (h_training_logs)
  // 스캔된 교육일자에 해당하는 배정 Day 찾기
  const [assignment] = await conn.execute<any[]>(
    "SELECT day_no FROM h_training_assignments WHERE tenant_id = ? AND assignment_date = ?",
    [tenantId, formDate]
  );

  if (assignment.length > 0) {
    const dayNo = assignment[0].day_no;
    // 참석자 목록이 있으면 각각 완료 처리
    if (data.attendees && Array.isArray(data.attendees)) {
      for (const attendee of data.attendees) {
        // 이름으로 사용자 찾기
        const [users] = await conn.execute<any[]>(
          "SELECT id FROM users WHERE tenant_id = ? AND name = ? AND status = 'approved'",
          [tenantId, attendee.name || attendee]
        );
        if (users.length > 0) {
          await conn.execute(
            `INSERT IGNORE INTO h_training_logs (user_id, day_no, assignment_date, status, tenant_id)
             VALUES (?, ?, ?, 'DONE', ?)`,
            [users[0].id, dayNo, formDate, tenantId]
          );
          mapped.push(`참석자: ${attendee.name || attendee}`);
        } else {
          unmapped.push(`참석자 미매칭: ${attendee.name || attendee}`);
        }
      }
    }
    mapped.push(`교육일: ${formDate}, Day ${dayNo}`);
  } else {
    unmapped.push(`교육 배정 없음: ${formDate}`);
  }

  // 2) 체크리스트 원본 저장 (감사용)
  const [result] = await conn.execute<any>(
    `INSERT INTO h_generic_checklist_records
     (site_id, tenant_id, form_type, form_date, title, form_data, status, created_by)
     VALUES (?, ?, 'training_log', ?, ?, ?, 'submitted', ?)`,
    [tenantId, tenantId, formDate, title, JSON.stringify({ ...data, source: "scan_ocr" }), userId]
  );

  mapped.push("formDate", "title");
  if (inspector) mapped.push("inspector");

  return {
    success: true,
    targetTable: "h_training_logs + h_generic_checklist_records",
    insertedId: result.insertId,
    mappedFields: mapped,
    unmappedFields: unmapped,
    message: `교육훈련일지 저장 완료 (${mapped.length}개 필드 매핑)`,
  };
}

/**
 * CCP 기록지 매핑
 * OCR → h_ccp_form_records
 */
async function mapCcpRecord(
  tenantId: number,
  userId: number,
  siteId: number,
  docType: string,
  data: Record<string, any>
): Promise<ScanMappingResult> {
  const conn = await getRawConnection();
  const mapped: string[] = [];
  const unmapped: string[] = [];

  const workDate = data.formDate || data.workDate || new Date().toISOString().slice(0, 10);
  const ccpType = data.ccpType || docType.replace("ccp_", "CCP-").toUpperCase();
  const productName = data.productName || "";

  // 배치 찾기 (날짜 + 제품명 기준)
  let batchId = data.batchId || null;
  if (!batchId && productName) {
    const [batches] = await conn.execute<any[]>(
      `SELECT b.id FROM h_batches b
       LEFT JOIN h_products p ON b.product_id = p.id
       WHERE b.tenant_id = ? AND DATE(b.created_at) = ? AND p.name LIKE ?
       ORDER BY b.id DESC LIMIT 1`,
      [tenantId, workDate, `%${productName}%`]
    );
    if (batches.length > 0) {
      batchId = batches[0].id;
      mapped.push(`배치 자동매칭: ID ${batchId}`);
    } else {
      unmapped.push(`배치 미매칭: ${productName} (${workDate})`);
    }
  }

  // CCP 기록 저장 (기본 필드)
  const [result] = await conn.execute<any>(
    `INSERT INTO h_ccp_form_records
     (tenant_id, site_id, batch_id, ccp_type, work_date, product_name, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, siteId, batchId || 0, ccpType, workDate, productName, userId]
  );

  // 측정값이 있으면 items로 h_generic_checklist_records에도 보관
  if (data.items && data.items.length > 0) {
    await conn.execute(
      `INSERT INTO h_generic_checklist_records
       (site_id, tenant_id, form_type, form_date, title, form_data, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'submitted', ?)`,
      [siteId, tenantId, `ccp_scan_${ccpType}`, workDate,
       `${ccpType} 스캔 기록 (${workDate})`, JSON.stringify({ ...data, source: "scan_ocr" }), userId]
    );
    mapped.push(`측정항목 ${data.items.length}개`);
  }

  mapped.push("workDate", "ccpType");
  if (productName) mapped.push("productName");

  return {
    success: true,
    targetTable: "h_ccp_form_records",
    insertedId: result.insertId,
    mappedFields: mapped,
    unmappedFields: unmapped,
    message: `CCP 기록지(${ccpType}) 저장 완료`,
  };
}

/**
 * 검사기록 매핑
 * OCR → h_inspections (존재하면) 또는 generic_checklists
 */
async function mapInspection(
  tenantId: number,
  userId: number,
  docType: string,
  data: Record<string, any>
): Promise<ScanMappingResult> {
  const conn = await getRawConnection();
  const mapped: string[] = [];

  const formDate = data.formDate || new Date().toISOString().slice(0, 10);
  const inspType = docType.replace("_inspection", "") || "general";
  const title = data.title || `${inspType} 검사기록 (스캔)`;

  // h_inspections 테이블에 저장 시도
  try {
    const [result] = await conn.execute<any>(
      `INSERT INTO h_inspections
       (tenant_id, inspection_type, inspection_date, inspector_name, result, notes, form_data, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', ?)`,
      [tenantId, inspType, formDate, data.inspector || "",
       data.overallResult || "pass", data.remarks || "",
       JSON.stringify({ ...data, source: "scan_ocr" }), userId]
    );
    mapped.push("inspection_type", "inspection_date", "inspector");
    if (data.items) mapped.push(`검사항목 ${data.items.length}개`);

    return {
      success: true,
      targetTable: "h_inspections",
      insertedId: result.insertId,
      mappedFields: mapped,
      unmappedFields: [],
      message: `검사기록(${inspType}) 저장 완료`,
    };
  } catch {
    // h_inspections 테이블 구조가 다른 경우 generic으로 폴백
    return await mapGenericChecklist(tenantId, userId, tenantId, docType, data);
  }
}

/**
 * 범용 체크리스트 매핑 (폴백)
 */
async function mapGenericChecklist(
  tenantId: number,
  userId: number,
  siteId: number,
  docType: string,
  data: Record<string, any>
): Promise<ScanMappingResult> {
  const conn = await getRawConnection();

  const formDate = data.formDate || new Date().toISOString().slice(0, 10);
  const title = data.title || `${docType} 스캔 입력`;

  const [result] = await conn.execute<any>(
    `INSERT INTO h_generic_checklist_records
     (site_id, tenant_id, form_type, form_date, title, form_data, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'submitted', ?)`,
    [siteId, tenantId, docType, formDate, title, JSON.stringify({ ...data, source: "scan_ocr" }), userId]
  );

  const mapped = ["formDate", "title", "formType"];
  if (data.items) mapped.push(`점검항목 ${data.items.length}개`);
  if (data.inspector) mapped.push("inspector");

  return {
    success: true,
    targetTable: "h_generic_checklist_records",
    insertedId: result.insertId,
    mappedFields: mapped,
    unmappedFields: [],
    message: `체크리스트(${docType}) 저장 완료`,
  };
}

/**
 * 문서 타입 자동 인식 (AI가 판별 못했을 때 폴백)
 */
export function detectDocType(ocrText: string): string {
  const t = ocrText.toLowerCase();
  if (/교육.*훈련|훈련.*기록|교육.*일지/.test(t)) return "training_log";
  if (/ccp|중요관리|관리기준|한계기준|금속검출/.test(t)) return "ccp_record";
  if (/가열.*기록|굽기.*기록|증숙/.test(t)) return "ccp_2b";
  if (/금속.*검출|metal.*detect/.test(t)) return "ccp_4p";
  if (/입고.*검사|원재료.*검사|수입검사/.test(t)) return "material_inspection";
  if (/위생.*검사|위생.*점검/.test(t)) return "hygiene_inspection";
  if (/출하.*검사|출고.*검사/.test(t)) return "shipping_inspection";
  if (/개인.*위생|손.*씻기|복장.*점검/.test(t)) return "personal_hygiene";
  if (/온.*습도|온도.*습도|냉장.*온도/.test(t)) return "temperature_humidity";
  if (/설비.*세정|세척.*기록/.test(t)) return "equipment_cleaning";
  if (/수질.*검사|용수/.test(t)) return "water_quality";
  if (/냉동.*점검|냉동고/.test(t)) return "refrigeration";
  return "general";
}
