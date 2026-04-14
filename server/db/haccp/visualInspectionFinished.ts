/**
 * 완제품 출고검사
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

export async function fetchCompletedBatchesForMonth(
  db: any, tenantId: number, year: number, month: number
) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

  const items: any[] = [];
  const seenKeys = new Set<string>();

  // 제품별 최신 LOT 번호 맵 조회 (매출 데이터에 LOT 없으므로 보충용)
  const lotMap = new Map<string, string>();
  try {
    const lotResult = await db.execute(sql`
      SELECT COALESCE(p.product_name, lot.sku_name) as product_name, lot.lot_number
      FROM h_inventory_lots lot
      LEFT JOIN h_products_v2 p ON p.id = lot.product_id AND p.tenant_id = ${tenantId}
      WHERE lot.tenant_id = ${tenantId}
        AND lot.product_id IS NOT NULL
        AND lot.lot_number IS NOT NULL
      ORDER BY lot.created_at DESC
    `);
    for (const r of ((lotResult as any)[0] || []) as any[]) {
      const name = r.product_name;
      if (name && !lotMap.has(name)) lotMap.set(name, r.lot_number);
    }
  } catch (e) { /* LOT 매핑 실패 시 빈 값 유지 */ }

  // 1차: 매출(accounting_sales) 데이터
  try {
    const salesResult = await db.execute(sql`
      SELECT s.id, s.transaction_date, s.item_name, s.quantity, s.unit,
             s.status, s.notes,
             p.company_name as partner_name
      FROM accounting_sales s
      LEFT JOIN partners p ON p.id = s.partner_id AND p.tenant_id = ${tenantId}
      WHERE s.tenant_id = ${tenantId}
        AND REPLACE(REPLACE(s.transaction_date, '.', '-'), ' ', '') >= ${startDate}
        AND REPLACE(REPLACE(s.transaction_date, '.', '-'), ' ', '') < ${endDate}
        AND s.status != 'cancelled'
      ORDER BY s.transaction_date ASC, s.id ASC
    `);
    const salesRows = (salesResult as any)[0] || [];
    for (const r of salesRows as any[]) {
      if (!r.item_name) continue;  // 제품명 없는 항목 제외
      const dateStr = r.transaction_date ? String(r.transaction_date).replace(/\./g, '-').replace(/\s/g, '') : '';
      const key = `sale:${r.id}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const productName = r.item_name;
      items.push({
        shipDate: dateStr.length >= 5 ? dateStr.substring(5) : dateStr,
        productName,
        lotNumber: lotMap.get(productName) || '',
        quantity: r.quantity || '',
        packagingStatus: '○',
        labelStatus: '○',
        temperature: '',
        result: '적합',
        correctiveAction: '',
        note: r.partner_name ? `거래처: ${r.partner_name}` : '',
      });
    }
  } catch (e) { console.error('[fetchCompletedBatches] sales query error:', e); }

  // 2차: 제품출고(h_product_outbound) 데이터 (매출에 없는 건 보충)
  try {
    const outboundResult = await db.execute(sql`
      SELECT o.id, o.release_date, o.product_name, o.quantity, o.unit,
             o.lot_number, o.partner_name, o.release_type, o.status
      FROM h_product_outbound o
      WHERE o.tenant_id = ${tenantId}
        AND REPLACE(REPLACE(o.release_date, '.', '-'), ' ', '') >= ${startDate}
        AND REPLACE(REPLACE(o.release_date, '.', '-'), ' ', '') < ${endDate}
        AND o.status != 'cancelled'
      ORDER BY o.release_date ASC, o.id ASC
    `);
    const outRows = (outboundResult as any)[0] || [];
    for (const r of outRows as any[]) {
      if (!r.product_name) continue;  // 제품명 없는 항목 제외
      const dateStr = r.release_date ? String(r.release_date).replace(/\./g, '-').replace(/\s/g, '') : '';
      const key = `outbound:${r.id}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      items.push({
        shipDate: dateStr.length >= 5 ? dateStr.substring(5) : dateStr,
        productName: r.product_name,
        lotNumber: r.lot_number || '',
        quantity: r.quantity || '',
        packagingStatus: '○',
        labelStatus: '○',
        temperature: '',
        result: '적합',
        correctiveAction: '',
        note: r.partner_name ? `거래처: ${r.partner_name}` : '',
      });
    }
  } catch (e) { console.error('[fetchCompletedBatches] outbound query error:', e); }

  return items;
}

/** 완제품출고검사 자동 동기화 (신규 출고건만 추가) */
export async function syncOutboundsToFinishedProductLog(
  db: any, tenantId: number, logId: number, year: number, month: number
) {
  const outbounds = await fetchCompletedBatchesForMonth(db, tenantId, year, month);
  if (!outbounds.length) return { synced: 0 };

  // 기존 항목 확인
  const existingResult = await db.execute(sql`
    SELECT ship_date, product_name, lot_number, note FROM h_finished_product_inspection_items
    WHERE log_id = ${logId} AND tenant_id = ${tenantId}
  `);
  const existingItems = (existingResult as any)[0] || [];
  const existingSet = new Set<string>();
  for (const e of existingItems as any[]) {
    existingSet.add(`${e.ship_date}|${e.product_name}|${e.lot_number || ''}`);
  }

  let synced = 0;
  const maxSort = await db.execute(sql`
    SELECT COALESCE(MAX(sort_order), -1) as max_sort FROM h_finished_product_inspection_items
    WHERE log_id = ${logId} AND tenant_id = ${tenantId}
  `);
  let sortOrder = Number(((maxSort as any)[0] as any[])[0]?.max_sort ?? -1) + 1;

  for (const r of outbounds) {
    // 제품명이 없는 항목은 동기화하지 않음
    if (!r.productName || r.productName === '알 수 없음') continue;

    const key = `${r.shipDate}|${r.productName}|${r.lotNumber || ''}`;
    if (existingSet.has(key)) continue;

    await db.execute(sql`
      INSERT INTO h_finished_product_inspection_items
        (tenant_id, log_id, ship_date, product_name, lot_number, quantity,
         packaging_status, label_status, temperature, result,
         corrective_action, note, sort_order)
      VALUES
        (${tenantId}, ${logId}, ${r.shipDate}, ${r.productName}, ${r.lotNumber || ''},
         ${String(r.quantity)}, ${r.packagingStatus}, ${r.labelStatus}, ${r.temperature || ''},
         ${r.result}, ${r.correctiveAction || ''}, ${r.note || ''}, ${sortOrder})
    `);
    existingSet.add(key);
    sortOrder++;
    synced++;
  }

  return { synced };
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
  // ★ 2026-04-14: u_creator JOIN + creator_name 폴백 (원재료 육안검사와 동일 패턴)
  const logResult = await db.execute(sql`
    SELECT fpl.*,
      ar.id as approval_id, ar.status as approval_status,
      ar.requested_at, ar.approved_at, ar.reviewed_at,
      ar.requested_by, ar.approved_by, ar.reviewed_by,
      u_req.name as requester_name,
      u_rev.name as reviewer_name,
      u_app.name as approver_name,
      u_creator.name as creator_name
    FROM h_finished_product_inspection_logs fpl
    LEFT JOIN h_approval_requests ar
      ON ar.reference_type = 'finished_product_inspection'
      AND ar.reference_id = fpl.id
      AND ar.request_type = 'finished_product_inspection'
      AND ar.tenant_id = ${tenantId}
    LEFT JOIN users u_req ON u_req.id = ar.requested_by
    LEFT JOIN users u_rev ON u_rev.id = ar.reviewed_by
    LEFT JOIN users u_app ON u_app.id = ar.approved_by
    LEFT JOIN users u_creator ON u_creator.id = fpl.created_by
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

  // 최근 날짜 우선 정렬
  const itemResult = await db.execute(sql`
    SELECT * FROM h_finished_product_inspection_items
    WHERE log_id = ${logId} AND tenant_id = ${tenantId}
    ORDER BY ship_date DESC, id DESC
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
    // ★ 2026-04-14: 작성자 = 설정 > 결재요청 > 로그 생성자 우선순위
    requesterName: cfg.cfg_author_name || log.requester_name || log.creator_name || null,
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
      shipMethod: i.ship_method || '택배(아이스박스)',
      temperature: i.temperature || '',
      iceBoxStatus: i.ice_box_status || '○',
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
  // ship_method, ice_box_status 컬럼 자동 추가 (없으면)
  try {
    await db.execute(sql`ALTER TABLE h_finished_product_inspection_items ADD COLUMN ship_method VARCHAR(30) DEFAULT '택배(아이스박스)' AFTER label_status`);
  } catch { /* already exists */ }
  try {
    await db.execute(sql`ALTER TABLE h_finished_product_inspection_items ADD COLUMN ice_box_status VARCHAR(10) DEFAULT '○' AFTER temperature`);
  } catch { /* already exists */ }

  await db.execute(sql`
    DELETE FROM h_finished_product_inspection_items WHERE log_id = ${logId} AND tenant_id = ${tenantId}
  `);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    await db.execute(sql`
      INSERT INTO h_finished_product_inspection_items
        (tenant_id, log_id, ship_date, product_name, lot_number, quantity,
         packaging_status, label_status, ship_method, temperature, ice_box_status, result,
         corrective_action, note, batch_id, sort_order)
      VALUES
        (${tenantId}, ${logId}, ${item.shipDate || ''}, ${item.productName || ''}, ${item.lotNumber || ''}, ${item.quantity || ''},
         ${item.packagingStatus || '○'}, ${item.labelStatus || '○'}, ${item.shipMethod || '택배(아이스박스)'}, ${item.temperature || ''}, ${item.iceBoxStatus || '○'}, ${item.result || '적합'},
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
      AND das.is_active = 1 LIMIT 1
  `);
  const setting = ((settingResult as any)[0] || [])[0] || null;
  const authorId = setting?.author_user_id || userId;

  const existResult = await db.execute(sql`
    SELECT id FROM h_approval_requests
    WHERE reference_type = 'finished_product_inspection' AND reference_id = ${logId}
      AND request_type = 'finished_product_inspection' AND tenant_id = ${tenantId} LIMIT 1
  `);
  const existRows = (existResult as any)[0] || [];

  // ★ 즉시 승인 처리 (작성자=검토자=승인자 단일단계 — 검사일지 특성상 작성 = 확정)
  // → h_approval_requests.status='approved' 로 바로 등록되어 문서출력 페이지에 즉시 노출
  if ((existRows as any[]).length > 0) {
    await db.execute(sql`
      UPDATE h_approval_requests SET status = 'approved',
        requested_by = ${authorId}, requested_at = NOW(),
        reviewed_by = ${userId}, reviewed_at = NOW(),
        approved_by = ${userId}, approved_at = NOW()
      WHERE id = ${(existRows as any[])[0].id}
    `);
    return { success: true, message: `${log.log_year}년 ${log.log_month}월 출고검사일지 재승인 완료 (문서출력 가능)` };
  }

  const title = `완제품 출고검사일지 - ${log.log_year}년 ${log.log_month}월`;
  const desc = `${log.log_year}년 ${log.log_month}월 완제품 출고검사일지\n검사 항목: ${itemCount}건`;
  await pool.execute(
    `INSERT INTO h_approval_requests (site_id, tenant_id, request_type, reference_type, reference_id, title, description, status, priority, requested_by, requested_at, reviewed_by, reviewed_at, approved_by, approved_at)
     VALUES (?, ?, 'finished_product_inspection', 'finished_product_inspection', ?, ?, ?, 'approved', 'medium', ?, NOW(), ?, NOW(), ?, NOW())`,
    [siteId, tenantId, logId, title, desc, authorId, userId, userId]
  );
  return { success: true, message: `${log.log_year}년 ${log.log_month}월 출고검사일지 승인 완료 (${itemCount}건, 문서출력 가능)` };
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
      AND das.is_active = 1
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
  
  // ★ 즉시 승인 처리 (작성자=검토자=승인자 단일단계)
  // → h_approval_requests.status='approved' 로 바로 등록되어 문서출력 페이지에 즉시 노출
  if ((existRows as any[]).length > 0) {
    await db.execute(sql`
      UPDATE h_approval_requests
      SET status = 'approved',
          requested_by = ${authorId},
          requested_at = NOW(),
          reviewed_by = ${userId}, reviewed_at = NOW(),
          approved_by = ${userId}, approved_at = NOW()
      WHERE id = ${(existRows as any[])[0].id}
    `);
    return { success: true, message: `${log.log_year}년 ${log.log_month}월 육안검사일지 재승인 완료 (문서출력 가능)` };
  }

  const title = `육안검사일지 - ${log.log_year}년 ${log.log_month}월`;
  const description = `${log.log_year}년 ${log.log_month}월 육안검사일지\n검사 항목: ${itemCount}건`;

  await pool.execute(
    `INSERT INTO h_approval_requests
      (site_id, tenant_id, request_type, reference_type, reference_id,
       title, description, status, priority, requested_by, requested_at, reviewed_by, reviewed_at, approved_by, approved_at)
     VALUES (?, ?, 'visual_inspection', 'visual_inspection', ?, ?, ?, 'approved', 'medium', ?, NOW(), ?, NOW(), ?, NOW())`,
    [siteId, tenantId, logId, title, description, authorId, userId, userId]
  );

  return { success: true, message: `${log.log_year}년 ${log.log_month}월 육안검사일지 승인 완료 (${itemCount}건, 문서출력 가능)` };
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
    : todayKST().replace(/-/g, '');
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
  const receiptDate = params.receiptDate || todayKST();
  
  // 1. LOT 번호 자동 생성
  const lotNumber = await generateMaterialLotNumber(db, tenantId, params.materialCode, receiptDate);

  // 2. h_inventory 재고 업데이트 (있으면 증가, 없으면 생성) — LOT에 inventory_id를 설정하기 위해 먼저 처리
  const invCheck = await db.execute(sql`
    SELECT id, total_quantity, available_quantity FROM h_inventory
    WHERE tenant_id = ${tenantId} AND material_id = ${params.materialId}
    LIMIT 1
  `);
  const invRows = (invCheck as any)[0] || [];
  let inventoryId: number;
  if ((invRows as any[]).length > 0) {
    const inv = (invRows as any[])[0];
    inventoryId = Number(inv.id);
    const newTotal = parseFloat(inv.total_quantity) + params.quantity;
    const newAvail = parseFloat(inv.available_quantity) + params.quantity;
    await db.execute(sql`
      UPDATE h_inventory SET total_quantity = ${newTotal}, available_quantity = ${newAvail},
        last_updated = NOW() WHERE id = ${inv.id}
    `);
  } else {
    const insResult = await db.execute(sql`
      INSERT INTO h_inventory (tenant_id, material_id, total_quantity, available_quantity, reserved_quantity, unit)
      VALUES (${tenantId}, ${params.materialId}, ${params.quantity}, ${params.quantity}, 0, ${params.unit})
    `);
    inventoryId = Number((insResult as any)[0]?.insertId || 0);
  }

  // 3. h_inventory_lots에 LOT 생성 (inventory_id 연결 — FEFO 할당에 필수)
  const lotResult = await db.execute(sql`
    INSERT INTO h_inventory_lots
      (tenant_id, inventory_id, material_id, lot_number, quantity, available_quantity, unit,
       unit_price, receipt_date, expiry_date, supplier_name, status)
    VALUES
      (${tenantId}, ${inventoryId}, ${params.materialId}, ${lotNumber},
       ${params.quantity}, ${params.quantity}, ${params.unit},
       ${params.unitPrice || null}, ${receiptDate}, ${params.expiryDate || null},
       ${params.supplierName || null}, 'available')
  `);
  const lotId = Number((lotResult as any)[0]?.insertId || 0);

  // 4. h_inventory_transactions에 입고 기록
  await db.execute(sql`
    INSERT INTO h_inventory_transactions
      (tenant_id, inventory_id, lot_id, transaction_type, quantity, unit, unit_cost,
       transaction_date, reference_type, source_type, action_type, notes, created_by)
    VALUES
      (${tenantId}, ${inventoryId}, ${lotId}, 'receipt', ${params.quantity}, ${params.unit},
       ${params.unitPrice || null}, ${receiptDate}, 'material_receiving', 'inbound', 'receipt',
       ${params.notes || `원재료 입고 - ${lotNumber}`}, ${params.userId})
  `);

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
