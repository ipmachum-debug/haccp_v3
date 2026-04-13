/**
 * 원재료 외관검사 (수입검사)
 */
/**
 * 육안검사일지 (Visual Inspection Log) - DB Functions
 * 
 * 입고 원재료 육안검사 일지 관리
 * 월별 단위로 관리, 각 항목은 개별 입고 기록
 * 승인 워크플로우: 작성 → 검토 → 승인
 */
import { sql } from "drizzle-orm";
import { todayKST } from "../../utils/timezone";

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

  // 항목들 (최근 날짜 우선 정렬)
  const itemResult = await db.execute(sql`
    SELECT * FROM h_visual_inspection_items
    WHERE log_id = ${logId} AND tenant_id = ${tenantId}
    ORDER BY receipt_date DESC, id DESC
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

/** 원재료 입고 데이터 가져오기 (h_inbound + h_inventory_lots → 육안검사 항목으로 변환) */
export async function fetchMaterialReceivingsForMonth(
  db: any, tenantId: number, year: number, month: number
) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

  // 1차: 입고전표(h_inbound_headers + h_inbound_lines) 기반 조회
  const inboundResult = await db.execute(sql`
    SELECT ih.id as header_id, ih.inbound_date, ih.notes as header_notes,
           il.id as line_id, il.lot_number, il.purchase_quantity, il.purchase_unit,
           il.expiry_date,
           m.material_name, m.category
    FROM h_inbound_headers ih
    JOIN h_inbound_lines il ON il.header_id = ih.id AND il.tenant_id = ${tenantId}
    LEFT JOIN h_materials m ON m.id = il.material_id AND m.tenant_id = ${tenantId}
    WHERE ih.tenant_id = ${tenantId}
      AND ih.inbound_date >= ${startDate}
      AND ih.inbound_date < ${endDate}
    ORDER BY ih.inbound_date ASC, il.id ASC
  `);
  const inboundRows = (inboundResult as any)[0] || [];

  // 2차: 입고전표에 없는 LOT (직접 생성된 LOT) - h_inventory_lots에서 보충
  const lotResult = await db.execute(sql`
    SELECT lot.id, lot.lot_number, lot.receipt_date, lot.quantity, lot.unit,
           lot.expiry_date, lot.supplier_name,
           m.material_name, m.category
    FROM h_inventory_lots lot
    LEFT JOIN h_materials m ON m.id = lot.material_id AND m.tenant_id = ${tenantId}
    WHERE lot.tenant_id = ${tenantId}
      AND lot.material_id IS NOT NULL
      AND lot.receipt_date >= ${startDate}
      AND lot.receipt_date < ${endDate}
    ORDER BY lot.receipt_date ASC, lot.id ASC
  `);
  const lotRows = (lotResult as any)[0] || [];

  // 입고전표 기반 항목
  const seenLots = new Set<string>();
  const items: any[] = [];

  for (const r of inboundRows as any[]) {
    // 품명이 없는 입고건(연결된 원자재 없음)은 제외
    if (!r.material_name) continue;
    const lot = r.lot_number || '';
    if (lot) seenLots.add(lot);
    items.push({
      receiptDate: r.inbound_date ? String(r.inbound_date).substring(5) : '',
      productName: r.material_name || '',
      importCertOrigin: '국내',
      testReportAvail: '○',
      expiryDate: r.expiry_date ? String(r.expiry_date) : '',
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
      note: lot ? `LOT: ${lot}` : '',
    });
  }

  // LOT 테이블에서 입고전표에 없는 건 보충
  for (const r of lotRows as any[]) {
    // 품명이 없는 LOT은 제외
    if (!r.material_name) continue;
    const lot = r.lot_number || '';
    if (lot && seenLots.has(lot)) continue; // 이미 입고전표에서 가져온 건
    if (lot) seenLots.add(lot);
    items.push({
      receiptDate: r.receipt_date ? String(r.receipt_date).substring(5) : '',
      productName: r.material_name || '',
      importCertOrigin: '국내',
      testReportAvail: '○',
      expiryDate: r.expiry_date ? String(r.expiry_date) : '',
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
      note: lot ? `LOT: ${lot}` : '',
    });
  }

  return items;
}

/** 관리자용: 원재료 입고 → 육안검사 항목 자동 동기화 (신규 입고건만 추가) */
export async function syncReceivingsToInspectionLog(
  db: any, tenantId: number, logId: number, year: number, month: number
) {
  // fetchMaterialReceivingsForMonth 재사용하여 입고 데이터 조회
  const receivings = await fetchMaterialReceivingsForMonth(db, tenantId, year, month);
  if (!receivings.length) return { synced: 0 };

  // 이미 반영된 항목 확인 (LOT 또는 date+name 매칭)
  const existingResult = await db.execute(sql`
    SELECT receipt_date, product_name, note FROM h_visual_inspection_items
    WHERE log_id = ${logId} AND tenant_id = ${tenantId}
  `);
  const existingItems = (existingResult as any)[0] || [];
  const existingSet = new Set<string>();
  for (const e of existingItems as any[]) {
    const lotMatch = (e.note || '').match(/LOT:\s*(\S+)/);
    if (lotMatch) existingSet.add(`lot:${lotMatch[1]}`);
    existingSet.add(`${e.receipt_date}|${e.product_name}`);
  }

  // 신규 입고건만 필터링 후 삽입
  let synced = 0;
  const maxSort = await db.execute(sql`
    SELECT COALESCE(MAX(sort_order), -1) as max_sort FROM h_visual_inspection_items
    WHERE log_id = ${logId} AND tenant_id = ${tenantId}
  `);
  let sortOrder = Number(((maxSort as any)[0] as any[])[0]?.max_sort ?? -1) + 1;

  for (const r of receivings) {
    // 품명이 없는 항목은 동기화하지 않음
    if (!r.productName) continue;

    const lotMatch = (r.note || '').match(/LOT:\s*(\S+)/);
    const lotKey = lotMatch ? `lot:${lotMatch[1]}` : null;
    const fallbackKey = `${r.receiptDate}|${r.productName}`;

    if ((lotKey && existingSet.has(lotKey)) || existingSet.has(fallbackKey)) continue;

    await db.execute(sql`
      INSERT INTO h_visual_inspection_items
        (tenant_id, log_id, receipt_date, product_name, import_cert_origin,
         test_report_avail, expiry_date, manufacture_date, quality_retain_date,
         vehicle_temp, vehicle_condition, pallet_condition, normal_approved,
         foreign_matter, label_allergen, label_manager, compliance,
         corrective_action, note, sort_order)
      VALUES
        (${tenantId}, ${logId}, ${r.receiptDate}, ${r.productName}, ${r.importCertOrigin},
         ${r.testReportAvail}, ${r.expiryDate}, ${r.manufactureDate}, ${r.qualityRetainDate},
         ${r.vehicleTemp}, ${r.vehicleCondition}, ${r.palletCondition}, ${r.normalApproved},
         ${r.foreignMatter}, ${r.labelAllergen}, ${r.labelManager}, ${r.compliance},
         ${r.correctiveAction}, ${r.note}, ${sortOrder})
    `);
    if (lotKey) existingSet.add(lotKey);
    existingSet.add(fallbackKey);
    sortOrder++;
    synced++;
  }

  return { synced };
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

/** 완제품 출고 데이터 가져오기 (매출 + 제품출고 → 출고검사 항목으로 변환) */
