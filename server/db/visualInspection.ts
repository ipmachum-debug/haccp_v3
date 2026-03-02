/**
 * 육안검사일지 (Visual Inspection Log) - DB Functions
 * 
 * 입고 원재료 육안검사 일지 관리
 * 월별 단위로 관리, 각 항목은 개별 입고 기록
 * 승인 워크플로우: 작성 → 검토 → 승인
 */
import { sql } from "drizzle-orm";

// ========== 타입 정의 ==========
export interface VisualInspectionItem {
  id?: number;
  logId?: number;
  receiptDate: string;       // 입고일시 (MM-DD or YYYY-MM-DD)
  productName: string;       // 품명
  importCertOrigin: string;  // 수입필증/원산지 (국내, 호주, etc)
  testReportAvail: string;   // 성적서 구비여부 (○,×,—)
  expiryDate: string;        // 유통기한 (YYYY.MM.DD)
  manufactureDate: string;   // 제조년월일 (YYYY.MM.DD)
  qualityRetainDate: string; // 품질유지기한 (YYYY.MM.DD)
  vehicleTemp: string;       // 차량 온도 (○,×,—)
  vehicleCondition: string;  // 차량 상태 (○,×,—)
  palletCondition: string;   // 파레트 상태 (○,×,—)
  normalApproved: string;    // 정상/결재 (○,×,—)
  foreignMatter: string;     // 이물 혼입 (○,×,—)
  labelAllergen: string;     // 표시기준-알레르기 (○,×,—)
  labelManager: string;      // 표시기준-관리자 (○,×,—)
  compliance: string;        // 적합 여부 (적합,부적합,—)
  correctiveAction: string;  // 부적합시 조치내용
  note: string;              // 비고
}

// ========== 테이블 생성 (마이그레이션) ==========
export async function createVisualInspectionTables(db: any) {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS h_visual_inspection_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        site_id BIGINT NOT NULL DEFAULT 0,
        log_year INT NOT NULL,
        log_month INT NOT NULL,
        title VARCHAR(200) DEFAULT '',
        summary_json TEXT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_vil_tenant_ym (tenant_id, log_year, log_month)
      )
    `);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS h_visual_inspection_items (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        log_id BIGINT NOT NULL,
        receipt_date VARCHAR(20) NOT NULL DEFAULT '',
        product_name VARCHAR(200) NOT NULL DEFAULT '',
        import_cert_origin VARCHAR(100) DEFAULT '',
        test_report_avail VARCHAR(10) DEFAULT '—',
        expiry_date VARCHAR(30) DEFAULT '',
        manufacture_date VARCHAR(30) DEFAULT '',
        quality_retain_date VARCHAR(30) DEFAULT '',
        vehicle_temp VARCHAR(10) DEFAULT '—',
        vehicle_condition VARCHAR(10) DEFAULT '—',
        pallet_condition VARCHAR(10) DEFAULT '—',
        normal_approved VARCHAR(10) DEFAULT '—',
        foreign_matter VARCHAR(10) DEFAULT '—',
        label_allergen VARCHAR(10) DEFAULT '—',
        label_manager VARCHAR(10) DEFAULT '—',
        compliance VARCHAR(20) DEFAULT '적합',
        corrective_action TEXT,
        note TEXT,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_vii_log (log_id),
        INDEX idx_vii_tenant (tenant_id)
      )
    `);
    
    console.log("[visualInspection] Tables created/verified successfully");
    return { success: true };
  } catch (err) {
    console.error("[visualInspection] Table creation error:", err);
    return { success: false, error: (err as Error).message };
  }
}

// ========== CRUD 함수 ==========

/** 월별 육안검사일지 리스트 조회 */
export async function listVisualInspectionLogs(db: any, tenantId: number, year: number, month: number) {
  const result = await db.execute(sql`
    SELECT 
      vil.id, vil.log_year, vil.log_month, vil.title, vil.created_at, vil.updated_at,
      COUNT(vii.id) as item_count,
      SUM(CASE WHEN vii.compliance = '적합' THEN 1 ELSE 0 END) as pass_count,
      SUM(CASE WHEN vii.compliance = '부적합' THEN 1 ELSE 0 END) as fail_count,
      ar.id as approval_id, ar.status as approval_status,
      ar.requested_at, ar.approved_at, ar.reviewed_at,
      ar.requested_by, ar.approved_by, ar.reviewed_by,
      u_req.name as requester_name,
      u_rev.name as reviewer_name,
      u_app.name as approver_name
    FROM h_visual_inspection_logs vil
    LEFT JOIN h_visual_inspection_items vii ON vii.log_id = vil.id AND vii.tenant_id = ${tenantId}
    LEFT JOIN h_approval_requests ar 
      ON ar.reference_type = 'visual_inspection'
      AND ar.reference_id = vil.id
      AND ar.request_type = 'visual_inspection'
      AND ar.tenant_id = ${tenantId}
    LEFT JOIN users u_req ON u_req.id = ar.requested_by
    LEFT JOIN users u_rev ON u_rev.id = ar.reviewed_by
    LEFT JOIN users u_app ON u_app.id = ar.approved_by
    WHERE vil.tenant_id = ${tenantId}
      AND vil.log_year = ${year}
      AND vil.log_month = ${month}
    GROUP BY vil.id
    ORDER BY vil.id DESC
  `);
  const rows = (result as any)[0] || [];
  return (rows as any[]).map((r: any) => ({
    id: r.id,
    logYear: r.log_year,
    logMonth: r.log_month,
    title: r.title || `${r.log_year}년 ${r.log_month}월 육안검사일지`,
    itemCount: Number(r.item_count || 0),
    passCount: Number(r.pass_count || 0),
    failCount: Number(r.fail_count || 0),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    approvalId: r.approval_id || null,
    approvalStatus: r.approval_status || null,
    requestedAt: r.requested_at || null,
    approvedAt: r.approved_at || null,
    reviewedAt: r.reviewed_at || null,
    requesterName: r.requester_name || null,
    reviewerName: r.reviewer_name || null,
    approverName: r.approver_name || null,
  }));
}

/** 육안검사일지 상세 조회 (items 포함) */
export async function getVisualInspectionLog(db: any, tenantId: number, logId: number) {
  // 로그 기본 정보
  const logResult = await db.execute(sql`
    SELECT vil.*, 
      ar.id as approval_id, ar.status as approval_status,
      ar.requested_at, ar.approved_at, ar.reviewed_at,
      ar.requested_by, ar.approved_by, ar.reviewed_by,
      u_req.name as requester_name,
      u_rev.name as reviewer_name,
      u_app.name as approver_name
    FROM h_visual_inspection_logs vil
    LEFT JOIN h_approval_requests ar 
      ON ar.reference_type = 'visual_inspection'
      AND ar.reference_id = vil.id
      AND ar.request_type = 'visual_inspection'
      AND ar.tenant_id = ${tenantId}
    LEFT JOIN users u_req ON u_req.id = ar.requested_by
    LEFT JOIN users u_rev ON u_rev.id = ar.reviewed_by
    LEFT JOIN users u_app ON u_app.id = ar.approved_by
    WHERE vil.id = ${logId} AND vil.tenant_id = ${tenantId}
    LIMIT 1
  `);
  const logRows = (logResult as any)[0] || [];
  if (!(logRows as any[]).length) return null;
  const log = (logRows as any[])[0];

  // 승인 설정 조회
  const settingResult = await db.execute(sql`
    SELECT das.author_employee_id, das.reviewer_employee_id, das.approver_employee_id,
      e_a.name as cfg_author_name, e_r.name as cfg_reviewer_name, e_p.name as cfg_approver_name
    FROM h_document_approval_settings das
    LEFT JOIN h_employees e_a ON e_a.id = das.author_employee_id AND e_a.tenant_id = ${tenantId}
    LEFT JOIN h_employees e_r ON e_r.id = das.reviewer_employee_id AND e_r.tenant_id = ${tenantId}
    LEFT JOIN h_employees e_p ON e_p.id = das.approver_employee_id AND e_p.tenant_id = ${tenantId}
    WHERE das.tenant_id = ${tenantId}
      AND das.document_type = 'material_inspection'
      AND das.is_active = 1
    LIMIT 1
  `);
  const cfgRows = (settingResult as any)[0] || [];
  const cfg = (cfgRows as any[])[0] || {};

  // 항목들
  const itemResult = await db.execute(sql`
    SELECT * FROM h_visual_inspection_items
    WHERE log_id = ${logId} AND tenant_id = ${tenantId}
    ORDER BY sort_order ASC, id ASC
  `);
  const items = (itemResult as any)[0] || [];
  
  return {
    id: log.id,
    logYear: log.log_year,
    logMonth: log.log_month,
    title: log.title || `${log.log_year}년 ${log.log_month}월 육안검사일지`,
    createdAt: log.created_at,
    updatedAt: log.updated_at,
    approvalId: log.approval_id || null,
    approvalStatus: log.approval_status || null,
    requestedAt: log.requested_at || null,
    approvedAt: log.approved_at || null,
    reviewedAt: log.reviewed_at || null,
    requesterName: cfg.cfg_author_name || log.requester_name || null,
    reviewerName: cfg.cfg_reviewer_name || log.reviewer_name || null,
    approverName: cfg.cfg_approver_name || log.approver_name || null,
    items: (items as any[]).map((i: any) => ({
      id: i.id,
      logId: i.log_id,
      receiptDate: i.receipt_date || '',
      productName: i.product_name || '',
      importCertOrigin: i.import_cert_origin || '',
      testReportAvail: i.test_report_avail || '—',
      expiryDate: i.expiry_date || '',
      manufactureDate: i.manufacture_date || '',
      qualityRetainDate: i.quality_retain_date || '',
      vehicleTemp: i.vehicle_temp || '—',
      vehicleCondition: i.vehicle_condition || '—',
      palletCondition: i.pallet_condition || '—',
      normalApproved: i.normal_approved || '—',
      foreignMatter: i.foreign_matter || '—',
      labelAllergen: i.label_allergen || '—',
      labelManager: i.label_manager || '—',
      compliance: i.compliance || '적합',
      correctiveAction: i.corrective_action || '',
      note: i.note || '',
    })),
  };
}

/** 육안검사일지 생성 (빈 로그) */
export async function createVisualInspectionLog(
  db: any, tenantId: number, siteId: number, year: number, month: number, userId: number
) {
  const title = `${year}년 ${month}월 육안검사일지`;
  const insertResult = await db.execute(sql`
    INSERT INTO h_visual_inspection_logs (tenant_id, site_id, log_year, log_month, title, created_by)
    VALUES (${tenantId}, ${siteId}, ${year}, ${month}, ${title}, ${userId})
  `);
  const id = Number((insertResult as any)[0]?.insertId || 0);
  return { id, title };
}

/** 육안검사 항목 저장 (전체 교체 방식) */
export async function saveVisualInspectionItems(
  db: any, tenantId: number, logId: number, items: VisualInspectionItem[]
) {
  // 기존 항목 삭제
  await db.execute(sql`
    DELETE FROM h_visual_inspection_items WHERE log_id = ${logId} AND tenant_id = ${tenantId}
  `);
  
  // 새 항목 삽입
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    await db.execute(sql`
      INSERT INTO h_visual_inspection_items 
        (tenant_id, log_id, receipt_date, product_name, import_cert_origin,
         test_report_avail, expiry_date, manufacture_date, quality_retain_date,
         vehicle_temp, vehicle_condition, pallet_condition, normal_approved,
         foreign_matter, label_allergen, label_manager, compliance,
         corrective_action, note, sort_order)
      VALUES 
        (${tenantId}, ${logId}, ${item.receiptDate || ''}, ${item.productName || ''}, ${item.importCertOrigin || ''},
         ${item.testReportAvail || '—'}, ${item.expiryDate || ''}, ${item.manufactureDate || ''}, ${item.qualityRetainDate || ''},
         ${item.vehicleTemp || '—'}, ${item.vehicleCondition || '—'}, ${item.palletCondition || '—'}, ${item.normalApproved || '—'},
         ${item.foreignMatter || '—'}, ${item.labelAllergen || '—'}, ${item.labelManager || '—'}, ${item.compliance || '적합'},
         ${item.correctiveAction || ''}, ${item.note || ''}, ${i})
    `);
  }
  
  return { success: true, count: items.length };
}

/** 육안검사일지 삭제 */
export async function deleteVisualInspectionLog(db: any, tenantId: number, logId: number) {
  // 승인요청 삭제
  await db.execute(sql`
    DELETE FROM h_approval_requests
    WHERE reference_type = 'visual_inspection' AND reference_id = ${logId}
      AND request_type = 'visual_inspection' AND tenant_id = ${tenantId}
  `);
  // 항목 삭제
  await db.execute(sql`
    DELETE FROM h_visual_inspection_items WHERE log_id = ${logId} AND tenant_id = ${tenantId}
  `);
  // 로그 삭제
  await db.execute(sql`
    DELETE FROM h_visual_inspection_logs WHERE id = ${logId} AND tenant_id = ${tenantId}
  `);
  return { success: true };
}

/** 월간 문서 자동 생성/조회 (getOrCreate) */
export async function getOrCreateMonthlyLog(
  db: any, tenantId: number, siteId: number, year: number, month: number, userId: number
) {
  // 기존 로그 확인
  const existing = await db.execute(sql`
    SELECT id FROM h_visual_inspection_logs
    WHERE tenant_id = ${tenantId} AND log_year = ${year} AND log_month = ${month}
    LIMIT 1
  `);
  const existRows = (existing as any)[0] || [];
  if ((existRows as any[]).length > 0) {
    return { id: (existRows as any[])[0].id, created: false };
  }
  // 없으면 자동 생성
  const result = await createVisualInspectionLog(db, tenantId, siteId, year, month, userId);
  return { id: result.id, created: true };
}

/** 원재료 입고 데이터 가져오기 (h_material_receivings → 육안검사 항목으로 변환) */
export async function fetchMaterialReceivingsForMonth(
  db: any, tenantId: number, year: number, month: number
) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

  const result = await db.execute(sql`
    SELECT mr.id, mr.received_date, mr.lot_number, mr.quantity, mr.unit,
           mr.expiry_date, mr.notes,
           m.material_name, m.category
    FROM h_material_receivings mr
    LEFT JOIN h_materials m ON m.id = mr.material_id AND m.tenant_id = ${tenantId}
    WHERE mr.tenant_id = ${tenantId}
      AND mr.received_date >= ${startDate}
      AND mr.received_date < ${endDate}
    ORDER BY mr.received_date ASC, mr.id ASC
  `);
  const rows = (result as any)[0] || [];
  return (rows as any[]).map((r: any) => ({
    receiptDate: r.received_date ? String(r.received_date).substring(5) : '', // MM-DD
    productName: r.material_name || '',
    importCertOrigin: '국내',
    testReportAvail: '○',
    expiryDate: r.expiry_date || '',
    manufactureDate: '',
    qualityRetainDate: '',
    vehicleTemp: '○',
    vehicleCondition: '○',
    palletCondition: '○',
    normalApproved: '○',
    foreignMatter: '○',
    labelAllergen: '○',
    labelManager: '',
    compliance: '적합',
    correctiveAction: '',
    note: r.lot_number ? `LOT: ${r.lot_number}` : '',
  }));
}

/** 이전 입력 데이터 기반 자동완성 (품명→이전 값 매핑) */
export async function fetchPreviousItemDefaults(
  db: any, tenantId: number, year: number, month: number
) {
  // 이전 3개월 데이터에서 품명별 최신 입력값 가져오기
  const result = await db.execute(sql`
    SELECT vii.product_name, vii.import_cert_origin, vii.test_report_avail,
           vii.expiry_date, vii.manufacture_date, vii.quality_retain_date,
           vii.vehicle_temp, vii.vehicle_condition, vii.pallet_condition,
           vii.normal_approved, vii.foreign_matter, vii.label_allergen,
           vii.compliance, vii.note
    FROM h_visual_inspection_items vii
    JOIN h_visual_inspection_logs vil ON vil.id = vii.log_id AND vil.tenant_id = ${tenantId}
    WHERE vii.tenant_id = ${tenantId}
      AND vii.product_name != ''
      AND (vil.log_year * 100 + vil.log_month) < (${year} * 100 + ${month})
    ORDER BY vii.id DESC
  `);
  const rows = (result as any)[0] || [];
  // 품명별 최신 데이터만 추출
  const map: Record<string, any> = {};
  for (const r of rows as any[]) {
    const name = r.product_name;
    if (!map[name]) {
      map[name] = {
        importCertOrigin: r.import_cert_origin || '',
        testReportAvail: r.test_report_avail || '○',
        expiryDate: r.expiry_date || '',
        manufactureDate: r.manufacture_date || '',
        qualityRetainDate: r.quality_retain_date || '',
        vehicleTemp: r.vehicle_temp || '○',
        vehicleCondition: r.vehicle_condition || '○',
        palletCondition: r.pallet_condition || '○',
        normalApproved: r.normal_approved || '○',
        foreignMatter: r.foreign_matter || '○',
        labelAllergen: r.label_allergen || '○',
        compliance: r.compliance || '적합',
        note: r.note || '',
      };
    }
  }
  return map;
}

/** 완제품 배치 데이터 가져오기 (h_batches → 출고검사 항목으로 변환) */
export async function fetchCompletedBatchesForMonth(
  db: any, tenantId: number, year: number, month: number
) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

  const result = await db.execute(sql`
    SELECT b.id, b.batch_code, b.planned_date, b.planned_quantity, b.actual_quantity,
           b.lot_number, b.expiry_date, b.status,
           COALESCE(p2.product_name, p.product_name) as product_name
    FROM h_batches b
    LEFT JOIN h_products_v2 p2 ON p2.id = b.product_id AND p2.tenant_id = ${tenantId}
    LEFT JOIN h_products p ON p.id = b.product_id AND p.tenant_id = ${tenantId}
    WHERE b.tenant_id = ${tenantId}
      AND b.planned_date >= ${startDate}
      AND b.planned_date < ${endDate}
    ORDER BY b.planned_date ASC, b.id ASC
  `);
  const rows = (result as any)[0] || [];
  return (rows as any[]).map((r: any) => ({
    shipDate: r.planned_date ? String(r.planned_date).substring(5) : '',
    productName: r.product_name || '알 수 없음',
    lotNumber: r.lot_number || r.batch_code || '',
    quantity: r.actual_quantity || r.planned_quantity || '',
    packagingStatus: '○',
    labelStatus: '○',
    temperature: '',
    result: '적합',
    batchId: r.id,
    batchCode: r.batch_code,
    status: r.status,
  }));
}

/** 완제품 출고검사 이전 입력 데이터 기반 자동완성 (제품명→이전 값 매핑) */
export async function fetchPreviousFinishedProductDefaults(
  db: any, tenantId: number, year: number, month: number
) {
  const result = await db.execute(sql`
    SELECT fpii.product_name, fpii.packaging_status, fpii.label_status,
           fpii.temperature, fpii.result, fpii.note
    FROM h_finished_product_inspection_items fpii
    JOIN h_finished_product_inspection_logs fpil ON fpil.id = fpii.log_id AND fpil.tenant_id = ${tenantId}
    WHERE fpii.tenant_id = ${tenantId}
      AND fpii.product_name != ''
      AND (fpil.log_year * 100 + fpil.log_month) < (${year} * 100 + ${month})
    ORDER BY fpii.id DESC
  `);
  const rows = (result as any)[0] || [];
  const map: Record<string, any> = {};
  for (const r of rows as any[]) {
    const name = r.product_name;
    if (!map[name]) {
      map[name] = {
        packagingStatus: r.packaging_status || '○',
        labelStatus: r.label_status || '○',
        temperature: r.temperature || '',
        result: r.result || '적합',
        note: r.note || '',
      };
    }
  }
  return map;
}

// ========== 완제품 출고검사 테이블 ==========
export async function createFinishedProductInspectionTables(db: any) {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS h_finished_product_inspection_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        site_id BIGINT NOT NULL DEFAULT 0,
        log_year INT NOT NULL,
        log_month INT NOT NULL,
        title VARCHAR(200) DEFAULT '',
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_fpil_tenant_ym (tenant_id, log_year, log_month)
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS h_finished_product_inspection_items (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL DEFAULT 1,
        log_id BIGINT NOT NULL,
        ship_date VARCHAR(20) NOT NULL DEFAULT '',
        product_name VARCHAR(200) NOT NULL DEFAULT '',
        lot_number VARCHAR(100) DEFAULT '',
        quantity VARCHAR(50) DEFAULT '',
        packaging_status VARCHAR(10) DEFAULT '○',
        label_status VARCHAR(10) DEFAULT '○',
        temperature VARCHAR(30) DEFAULT '',
        result VARCHAR(20) DEFAULT '적합',
        corrective_action TEXT,
        note TEXT,
        batch_id BIGINT,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_fpii_log (log_id),
        INDEX idx_fpii_tenant (tenant_id)
      )
    `);

    console.log("[finishedProductInspection] Tables created/verified successfully");
    return { success: true };
  } catch (err) {
    console.error("[finishedProductInspection] Table creation error:", err);
    return { success: false, error: (err as Error).message };
  }
}

// ========== 완제품 출고검사 CRUD ==========

export async function getOrCreateFinishedProductLog(
  db: any, tenantId: number, siteId: number, year: number, month: number, userId: number
) {
  await createFinishedProductInspectionTables(db);
  const existing = await db.execute(sql`
    SELECT id FROM h_finished_product_inspection_logs
    WHERE tenant_id = ${tenantId} AND log_year = ${year} AND log_month = ${month}
    LIMIT 1
  `);
  const existRows = (existing as any)[0] || [];
  if ((existRows as any[]).length > 0) {
    return { id: (existRows as any[])[0].id, created: false };
  }
  const title = `${year}년 ${month}월 완제품 출고검사일지`;
  const insertResult = await db.execute(sql`
    INSERT INTO h_finished_product_inspection_logs (tenant_id, site_id, log_year, log_month, title, created_by)
    VALUES (${tenantId}, ${siteId}, ${year}, ${month}, ${title}, ${userId})
  `);
  const id = Number((insertResult as any)[0]?.insertId || 0);
  return { id, created: true };
}

export async function getFinishedProductLog(db: any, tenantId: number, logId: number) {
  await createFinishedProductInspectionTables(db);
  const logResult = await db.execute(sql`
    SELECT fpl.*,
      ar.id as approval_id, ar.status as approval_status,
      ar.requested_at, ar.approved_at, ar.reviewed_at,
      ar.requested_by, ar.approved_by, ar.reviewed_by,
      u_req.name as requester_name,
      u_rev.name as reviewer_name,
      u_app.name as approver_name
    FROM h_finished_product_inspection_logs fpl
    LEFT JOIN h_approval_requests ar
      ON ar.reference_type = 'finished_product_inspection'
      AND ar.reference_id = fpl.id
      AND ar.request_type = 'finished_product_inspection'
      AND ar.tenant_id = ${tenantId}
    LEFT JOIN users u_req ON u_req.id = ar.requested_by
    LEFT JOIN users u_rev ON u_rev.id = ar.reviewed_by
    LEFT JOIN users u_app ON u_app.id = ar.approved_by
    WHERE fpl.id = ${logId} AND fpl.tenant_id = ${tenantId}
    LIMIT 1
  `);
  const logRows = (logResult as any)[0] || [];
  if (!(logRows as any[]).length) return null;
  const log = (logRows as any[])[0];

  // 승인 설정
  const settingResult = await db.execute(sql`
    SELECT das.author_employee_id, das.reviewer_employee_id, das.approver_employee_id,
      e_a.name as cfg_author_name, e_r.name as cfg_reviewer_name, e_p.name as cfg_approver_name
    FROM h_document_approval_settings das
    LEFT JOIN h_employees e_a ON e_a.id = das.author_employee_id AND e_a.tenant_id = ${tenantId}
    LEFT JOIN h_employees e_r ON e_r.id = das.reviewer_employee_id AND e_r.tenant_id = ${tenantId}
    LEFT JOIN h_employees e_p ON e_p.id = das.approver_employee_id AND e_p.tenant_id = ${tenantId}
    WHERE das.tenant_id = ${tenantId}
      AND das.document_type = 'finished_product_check'
      AND das.is_active = 1
    LIMIT 1
  `);
  const cfgRows = (settingResult as any)[0] || [];
  const cfg = (cfgRows as any[])[0] || {};

  const itemResult = await db.execute(sql`
    SELECT * FROM h_finished_product_inspection_items
    WHERE log_id = ${logId} AND tenant_id = ${tenantId}
    ORDER BY sort_order ASC, id ASC
  `);
  const items = (itemResult as any)[0] || [];

  return {
    id: log.id,
    logYear: log.log_year,
    logMonth: log.log_month,
    title: log.title,
    createdAt: log.created_at,
    approvalId: log.approval_id || null,
    approvalStatus: log.approval_status || null,
    requestedAt: log.requested_at || null,
    approvedAt: log.approved_at || null,
    reviewedAt: log.reviewed_at || null,
    requesterName: cfg.cfg_author_name || log.requester_name || null,
    reviewerName: cfg.cfg_reviewer_name || log.reviewer_name || null,
    approverName: cfg.cfg_approver_name || log.approver_name || null,
    items: (items as any[]).map((i: any) => ({
      id: i.id, logId: i.log_id,
      shipDate: i.ship_date || '',
      productName: i.product_name || '',
      lotNumber: i.lot_number || '',
      quantity: i.quantity || '',
      packagingStatus: i.packaging_status || '○',
      labelStatus: i.label_status || '○',
      temperature: i.temperature || '',
      result: i.result || '적합',
      correctiveAction: i.corrective_action || '',
      note: i.note || '',
      batchId: i.batch_id || null,
    })),
  };
}

export async function saveFinishedProductItems(
  db: any, tenantId: number, logId: number, items: any[]
) {
  await db.execute(sql`
    DELETE FROM h_finished_product_inspection_items WHERE log_id = ${logId} AND tenant_id = ${tenantId}
  `);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    await db.execute(sql`
      INSERT INTO h_finished_product_inspection_items
        (tenant_id, log_id, ship_date, product_name, lot_number, quantity,
         packaging_status, label_status, temperature, result,
         corrective_action, note, batch_id, sort_order)
      VALUES
        (${tenantId}, ${logId}, ${item.shipDate || ''}, ${item.productName || ''}, ${item.lotNumber || ''}, ${item.quantity || ''},
         ${item.packagingStatus || '○'}, ${item.labelStatus || '○'}, ${item.temperature || ''}, ${item.result || '적합'},
         ${item.correctiveAction || ''}, ${item.note || ''}, ${item.batchId || null}, ${i})
    `);
  }
  return { success: true, count: items.length };
}

export async function deleteFinishedProductLog(db: any, tenantId: number, logId: number) {
  await db.execute(sql`DELETE FROM h_approval_requests WHERE reference_type = 'finished_product_inspection' AND reference_id = ${logId} AND tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM h_finished_product_inspection_items WHERE log_id = ${logId} AND tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM h_finished_product_inspection_logs WHERE id = ${logId} AND tenant_id = ${tenantId}`);
  return { success: true };
}

export async function submitFinishedProductApproval(
  db: any, pool: any, tenantId: number, siteId: number, logId: number, userId: number
) {
  const logResult = await db.execute(sql`
    SELECT id, log_year, log_month, title FROM h_finished_product_inspection_logs
    WHERE id = ${logId} AND tenant_id = ${tenantId} LIMIT 1
  `);
  const logRows = (logResult as any)[0] || [];
  if (!(logRows as any[]).length) throw new Error("출고검사일지를 찾을 수 없습니다.");
  const log = (logRows as any[])[0];
  const countResult = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM h_finished_product_inspection_items WHERE log_id = ${logId} AND tenant_id = ${tenantId}
  `);
  const itemCount = Number((countResult as any)[0]?.[0]?.cnt || 0);

  const settingResult = await db.execute(sql`
    SELECT e_a.user_id as author_user_id FROM h_document_approval_settings das
    LEFT JOIN h_employees e_a ON e_a.id = das.author_employee_id AND e_a.tenant_id = ${tenantId}
    WHERE das.tenant_id = ${tenantId}
      AND das.document_type = 'finished_product_check'
      AND is_active = 1 LIMIT 1
  `);
  const setting = ((settingResult as any)[0] || [])[0] || null;
  const authorId = setting?.author_user_id || userId;

  const existResult = await db.execute(sql`
    SELECT id FROM h_approval_requests
    WHERE reference_type = 'finished_product_inspection' AND reference_id = ${logId}
      AND request_type = 'finished_product_inspection' AND tenant_id = ${tenantId} LIMIT 1
  `);
  const existRows = (existResult as any)[0] || [];

  if ((existRows as any[]).length > 0) {
    await db.execute(sql`
      UPDATE h_approval_requests SET status = 'pending_review', requested_by = ${authorId}, requested_at = NOW(),
        reviewed_by = NULL, reviewed_at = NULL, approved_by = NULL, approved_at = NULL
      WHERE id = ${(existRows as any[])[0].id}
    `);
    return { success: true, message: `${log.log_year}년 ${log.log_month}월 출고검사일지 승인 재요청 완료` };
  }

  const title = `완제품 출고검사일지 - ${log.log_year}년 ${log.log_month}월`;
  const desc = `${log.log_year}년 ${log.log_month}월 완제품 출고검사일지\n검사 항목: ${itemCount}건\n[검토 필요]`;
  await pool.execute(
    `INSERT INTO h_approval_requests (site_id, tenant_id, request_type, reference_type, reference_id, title, description, status, priority, requested_by)
     VALUES (?, ?, 'finished_product_inspection', 'finished_product_inspection', ?, ?, ?, 'pending_review', 'medium', ?)`,
    [siteId || 1, tenantId, logId, title, desc, authorId]
  );
  return { success: true, message: `${log.log_year}년 ${log.log_month}월 출고검사일지 승인 요청 완료 (${itemCount}건)` };
}

/** 승인 요청 */
export async function submitVisualInspectionApproval(
  db: any, pool: any, tenantId: number, siteId: number, logId: number, userId: number
) {
  // 로그 확인
  const logResult = await db.execute(sql`
    SELECT id, log_year, log_month, title FROM h_visual_inspection_logs
    WHERE id = ${logId} AND tenant_id = ${tenantId}
    LIMIT 1
  `);
  const logRows = (logResult as any)[0] || [];
  if (!(logRows as any[]).length) throw new Error("육안검사일지를 찾을 수 없습니다.");
  const log = (logRows as any[])[0];
  
  // 항목 수 조회
  const countResult = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM h_visual_inspection_items WHERE log_id = ${logId} AND tenant_id = ${tenantId}
  `);
  const itemCount = Number((countResult as any)[0]?.[0]?.cnt || 0);

  // 승인 설정 조회
  const settingResult = await db.execute(sql`
    SELECT das.author_employee_id, das.reviewer_employee_id, das.approver_employee_id,
      e_a.user_id as author_user_id, e_r.user_id as reviewer_user_id, e_p.user_id as approver_user_id
    FROM h_document_approval_settings das
    LEFT JOIN h_employees e_a ON e_a.id = das.author_employee_id AND e_a.tenant_id = ${tenantId}
    LEFT JOIN h_employees e_r ON e_r.id = das.reviewer_employee_id AND e_r.tenant_id = ${tenantId}
    LEFT JOIN h_employees e_p ON e_p.id = das.approver_employee_id AND e_p.tenant_id = ${tenantId}
    WHERE das.tenant_id = ${tenantId}
      AND das.document_type = 'material_inspection'
      AND is_active = 1
    LIMIT 1
  `);
  const settingRows = (settingResult as any)[0] || [];
  const setting = (settingRows as any[])[0] || null;
  const authorId = setting?.author_user_id || userId;
  
  // 기존 승인요청 확인
  const existResult = await db.execute(sql`
    SELECT id FROM h_approval_requests
    WHERE reference_type = 'visual_inspection' AND reference_id = ${logId}
      AND request_type = 'visual_inspection' AND tenant_id = ${tenantId}
    LIMIT 1
  `);
  const existRows = (existResult as any)[0] || [];
  
  if ((existRows as any[]).length > 0) {
    await db.execute(sql`
      UPDATE h_approval_requests
      SET status = 'pending_review',
          requested_by = ${authorId},
          requested_at = NOW(),
          reviewed_by = NULL, reviewed_at = NULL,
          approved_by = NULL, approved_at = NULL
      WHERE id = ${(existRows as any[])[0].id}
    `);
    return { success: true, message: `${log.log_year}년 ${log.log_month}월 육안검사일지 승인 재요청 완료` };
  }

  const title = `육안검사일지 - ${log.log_year}년 ${log.log_month}월`;
  const description = `${log.log_year}년 ${log.log_month}월 육안검사일지\n검사 항목: ${itemCount}건\n[검토 필요]`;

  await pool.execute(
    `INSERT INTO h_approval_requests
      (site_id, tenant_id, request_type, reference_type, reference_id,
       title, description, status, priority, requested_by)
     VALUES (?, ?, 'visual_inspection', 'visual_inspection', ?, ?, ?, 'pending_review', 'medium', ?)`,
    [siteId || 1, tenantId, logId, title, description, authorId]
  );
  
  return { success: true, message: `${log.log_year}년 ${log.log_month}월 육안검사일지 승인 요청 완료 (${itemCount}건)` };
}

// ==========================================================================
// LOT 관리 - 원재료 입고시 자동 LOT 코드 생성 + 원료수불 연동
// ==========================================================================

/** LOT 번호 자동 생성 (MAT-코드-YYYYMMDD-순번) */
export async function generateMaterialLotNumber(
  db: any, tenantId: number, materialCode: string, receiptDate?: string
) {
  const dateStr = receiptDate
    ? receiptDate.replace(/-/g, '').substring(0, 8)
    : new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `MAT-${materialCode}-${dateStr}`;

  const result = await db.execute(sql`
    SELECT lot_number FROM h_inventory_lots
    WHERE tenant_id = ${tenantId}
      AND lot_number LIKE ${prefix + '%'}
    ORDER BY lot_number DESC
    LIMIT 1
  `);
  const rows = (result as any)[0] || [];
  let nextSeq = 1;
  if ((rows as any[]).length > 0) {
    const lastLot = (rows as any[])[0].lot_number;
    const parts = lastLot.split('-');
    const lastSeq = parseInt(parts[parts.length - 1] || '0', 10);
    nextSeq = lastSeq + 1;
  }
  return `${prefix}-${String(nextSeq).padStart(3, '0')}`;
}

/** 원재료 입고 → LOT 자동 생성 + 재고 반영 + 트랜잭션 기록 */
export async function createMaterialReceivingWithLot(
  db: any, pool: any, tenantId: number, params: {
    materialId: number;
    materialCode: string;
    quantity: number;
    unit: string;
    unitPrice?: number;
    supplierName?: string;
    expiryDate?: string;
    receiptDate?: string;
    notes?: string;
    userId: number;
  }
) {
  const receiptDate = params.receiptDate || new Date().toISOString().slice(0, 10);
  
  // 1. LOT 번호 자동 생성
  const lotNumber = await generateMaterialLotNumber(db, tenantId, params.materialCode, receiptDate);

  // 2. h_inventory_lots에 LOT 생성
  const lotResult = await db.execute(sql`
    INSERT INTO h_inventory_lots 
      (tenant_id, material_id, lot_number, quantity, available_quantity, unit,
       unit_price, receipt_date, expiry_date, supplier_name, status)
    VALUES 
      (${tenantId}, ${params.materialId}, ${lotNumber}, 
       ${params.quantity}, ${params.quantity}, ${params.unit},
       ${params.unitPrice || null}, ${receiptDate}, ${params.expiryDate || null},
       ${params.supplierName || null}, 'available')
  `);
  const lotId = Number((lotResult as any)[0]?.insertId || 0);

  // 3. h_inventory_transactions에 입고 기록
  await db.execute(sql`
    INSERT INTO h_inventory_transactions
      (tenant_id, lot_id, transaction_type, quantity, unit, unit_cost,
       transaction_date, reference_type, source_type, action_type, notes, created_by)
    VALUES
      (${tenantId}, ${lotId}, 'receipt', ${params.quantity}, ${params.unit},
       ${params.unitPrice || null}, ${receiptDate}, 'material_receiving', 'inbound', 'receipt',
       ${params.notes || `원재료 입고 - ${lotNumber}`}, ${params.userId})
  `);

  // 4. h_inventory 재고 업데이트 (있으면 증가, 없으면 생성)
  const invCheck = await db.execute(sql`
    SELECT id, total_quantity, available_quantity FROM h_inventory
    WHERE tenant_id = ${tenantId} AND material_id = ${params.materialId}
    LIMIT 1
  `);
  const invRows = (invCheck as any)[0] || [];
  if ((invRows as any[]).length > 0) {
    const inv = (invRows as any[])[0];
    const newTotal = parseFloat(inv.total_quantity) + params.quantity;
    const newAvail = parseFloat(inv.available_quantity) + params.quantity;
    await db.execute(sql`
      UPDATE h_inventory SET total_quantity = ${newTotal}, available_quantity = ${newAvail},
        last_updated = NOW() WHERE id = ${inv.id}
    `);
  } else {
    await db.execute(sql`
      INSERT INTO h_inventory (tenant_id, material_id, total_quantity, available_quantity, reserved_quantity, unit)
      VALUES (${tenantId}, ${params.materialId}, ${params.quantity}, ${params.quantity}, 0, ${params.unit})
    `);
  }

  // 5. h_material_receivings에도 lot_number 업데이트 (있으면)
  await db.execute(sql`
    UPDATE h_material_receivings 
    SET lot_number = ${lotNumber}
    WHERE tenant_id = ${tenantId} AND material_id = ${params.materialId}
      AND received_date = ${receiptDate} AND (lot_number IS NULL OR lot_number = '')
    ORDER BY id DESC LIMIT 1
  `);

  return {
    success: true,
    lotId,
    lotNumber,
    materialId: params.materialId,
    quantity: params.quantity,
    unit: params.unit,
    receiptDate,
  };
}

/** 원재료 LOT 이력 조회 (입고→사용→출고 추적) */
export async function getMaterialLotHistory(
  db: any, tenantId: number, options?: { materialId?: number; lotNumber?: string; limit?: number }
) {
  const limit = options?.limit || 100;
  
  let whereClause = sql`il.tenant_id = ${tenantId}`;
  if (options?.materialId) {
    whereClause = sql`${whereClause} AND il.material_id = ${options.materialId}`;
  }
  if (options?.lotNumber) {
    whereClause = sql`${whereClause} AND il.lot_number LIKE ${options.lotNumber + '%'}`;
  }

  // LOT 목록 + 관련 트랜잭션
  const result = await db.execute(sql`
    SELECT il.id as lot_id, il.lot_number, il.material_id, il.quantity as lot_quantity,
           il.available_quantity, il.unit, il.receipt_date, il.expiry_date,
           il.supplier_name, il.status,
           m.material_name, m.material_code,
           it.id as tx_id, it.transaction_type, it.quantity as tx_quantity,
           it.transaction_date, it.reference_type, it.source_type, it.notes as tx_notes,
           it.created_at as tx_created_at
    FROM h_inventory_lots il
    LEFT JOIN h_materials m ON m.id = il.material_id AND m.tenant_id = ${tenantId}
    LEFT JOIN h_inventory_transactions it ON it.lot_id = il.id AND it.tenant_id = ${tenantId}
    WHERE ${whereClause}
    ORDER BY il.receipt_date DESC, il.id DESC, it.created_at ASC
    LIMIT ${limit * 10}
  `);
  const rows = (result as any)[0] || [];

  // Group by lot
  const lotMap: Record<number, any> = {};
  for (const r of rows as any[]) {
    const lotId = r.lot_id;
    if (!lotMap[lotId]) {
      lotMap[lotId] = {
        lotId,
        lotNumber: r.lot_number,
        materialId: r.material_id,
        materialName: r.material_name || '',
        materialCode: r.material_code || '',
        lotQuantity: parseFloat(r.lot_quantity),
        availableQuantity: parseFloat(r.available_quantity),
        unit: r.unit,
        receiptDate: r.receipt_date,
        expiryDate: r.expiry_date,
        supplierName: r.supplier_name,
        status: r.status,
        transactions: [],
      };
    }
    if (r.tx_id) {
      lotMap[lotId].transactions.push({
        id: r.tx_id,
        type: r.transaction_type,
        quantity: parseFloat(r.tx_quantity),
        date: r.transaction_date,
        referenceType: r.reference_type,
        sourceType: r.source_type,
        notes: r.tx_notes,
        createdAt: r.tx_created_at,
      });
    }
  }
  
  const lots = Object.values(lotMap).slice(0, limit);
  return lots;
}

/** 기존 material_receivings에 LOT 번호가 없는 건에 대해 일괄 LOT 생성 */
export async function backfillMaterialReceivingLots(
  db: any, pool: any, tenantId: number, userId: number
) {
  // LOT 미부여 입고 건 조회
  const result = await db.execute(sql`
    SELECT mr.id, mr.material_id, mr.quantity, mr.unit, mr.expiry_date,
           mr.received_date, mr.notes,
           m.material_code, m.material_name
    FROM h_material_receivings mr
    LEFT JOIN h_materials m ON m.id = mr.material_id AND m.tenant_id = ${tenantId}
    WHERE mr.tenant_id = ${tenantId}
      AND (mr.lot_number IS NULL OR mr.lot_number = '')
    ORDER BY mr.received_date ASC
  `);
  const rows = (result as any)[0] || [];
  
  const created: any[] = [];
  for (const r of rows as any[]) {
    if (!r.material_code) continue;
    try {
      const lotResult = await createMaterialReceivingWithLot(db, pool, tenantId, {
        materialId: r.material_id,
        materialCode: r.material_code,
        quantity: parseFloat(r.quantity) || 0,
        unit: r.unit || 'kg',
        expiryDate: r.expiry_date ? String(r.expiry_date).substring(0, 10) : undefined,
        receiptDate: r.received_date ? String(r.received_date).substring(0, 10) : undefined,
        notes: `자동 LOT 생성 (backfill) - ${r.material_name}`,
        userId,
      });
      // Update the receiving record with the lot number
      await db.execute(sql`
        UPDATE h_material_receivings SET lot_number = ${lotResult.lotNumber}
        WHERE id = ${r.id} AND tenant_id = ${tenantId}
      `);
      created.push({ id: r.id, lotNumber: lotResult.lotNumber, materialName: r.material_name });
    } catch (err) {
      console.error(`[backfillLot] Failed for receiving ${r.id}:`, err);
    }
  }
  
  return { success: true, count: created.length, items: created };
}
