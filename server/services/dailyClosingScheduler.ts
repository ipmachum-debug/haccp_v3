/**
 * 일일 마감 자동 스케줄러 v2
 * 매일 18:00 KST에 실행되어 다음 작업을 수행:
 * 1. 미완료 배치 경고 알림 생성
 * 2. 승인 대기 문서 정리 및 알림
 * 3. 재고 부족 원자재 알림
 * 4. 일일 마감 보고서 생성 (h_daily_reports 저장)
 */
import { getDb } from "../db";
import { sql } from "drizzle-orm";

import { toKSTDate, formatLocalDate, toKSTTimestamp} from "../utils/timezone";

// ============================================================================
// 타입 정의
// ============================================================================
interface DailyClosingSummary {
  date: string;
  tenantId: number;
  totalBatches: number;
  completedBatches: number;
  incompleteBatches: number;
  pendingApprovals: number;
  lowStockMaterials: number;
  totalProduction: number;
  totalPlanned: number;
  warnings: string[];
  details: {
    incompleteBatchList: Array<{ id: number; batchCode: string; status: string }>;
    lowStockList: Array<{ id: number; name: string; current: number; safety: number; unit: string }>;
    pendingDocList: Array<{ id: number; title: string; status: string }>;
  };
  success: boolean;
}

// ============================================================================
// 1. 미완료 배치 경고
// ============================================================================
async function checkIncompleteBatches(db: any, tenantId: number, dateStr: string): Promise<{
  count: number;
  batches: Array<{ id: number; batchCode: string; status: string }>;
}> {
  try {
    const result = await db.execute(sql`
      SELECT id, batch_code, status
      FROM h_batches
      WHERE tenant_id = ${tenantId}
        AND DATE(created_at) = ${dateStr}
        AND status NOT IN ('completed', 'cancelled')
      ORDER BY created_at ASC
    `);
    
    const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    const batches = (rows as any[]).map((r: any) => ({
      id: r.id,
      batchCode: r.batch_code,
      status: r.status
    }));
    
    // 각 미완료 배치에 대해 알림 생성
    for (const batch of batches) {
      await createClosingNotification(db, tenantId, {
        notificationType: "batch_incomplete_warning",
        title: "미완료 배치 경고",
        message: `[일일마감] 배치 ${batch.batchCode}가 마감 시점에 미완료 상태(${batch.status})입니다. 확인이 필요합니다.`,
        referenceType: "batch",
        referenceId: batch.id,
        priority: "high",
        actionUrl: `/dashboard/production-management`
      });
    }
    
    return { count: batches.length, batches };
  } catch (err) {
    console.error("[일일마감] 미완료 배치 확인 오류:", err);
    return { count: 0, batches: [] };
  }
}

// ============================================================================
// 2. 승인 대기 문서 정리 및 알림
// ============================================================================
async function checkPendingApprovals(db: any, tenantId: number, dateStr: string): Promise<{
  count: number;
  documents: Array<{ id: number; title: string; status: string }>;
}> {
  try {
    const result = await db.execute(sql`
      SELECT di.id, 
        COALESCE(dt.name, CONCAT('문서 #', di.id)) as title,
        di.status
      FROM document_instances di
      LEFT JOIN document_types dt ON di.document_type_id = dt.id
      WHERE di.tenant_id = ${tenantId}
        AND di.status IN ('pending_review', 'pending_approval', 'draft')
      ORDER BY di.created_at ASC
      LIMIT 100
    `);
    
    const rows2 = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    const documents = (rows2 as any[]).map((r: any) => ({
      id: r.id,
      title: r.title,
      status: r.status
    }));
    
    if (documents.length > 0) {
      // 요약 알림 1건 생성 (개별 알림 대신)
      const pendingReview = documents.filter(d => d.status === 'pending_review').length;
      const pendingApproval = documents.filter(d => d.status === 'pending_approval').length;
      const draft = documents.filter(d => d.status === 'draft').length;
      
      const parts: string[] = [];
      if (pendingReview > 0) parts.push(`검토대기 ${pendingReview}건`);
      if (pendingApproval > 0) parts.push(`승인대기 ${pendingApproval}건`);
      if (draft > 0) parts.push(`작성중 ${draft}건`);
      
      await createClosingNotification(db, tenantId, {
        notificationType: "pending_approval_summary",
        title: "승인 대기 문서 정리",
        message: `[일일마감] 미처리 문서 총 ${documents.length}건이 있습니다. (${parts.join(', ')}) 확인 후 처리해 주세요.`,
        referenceType: "document",
        priority: documents.length >= 10 ? "high" : "medium",
        actionUrl: `/dashboard/approval-management`
      });
    }
    
    return { count: documents.length, documents };
  } catch (err) {
    console.error("[일일마감] 승인 대기 문서 확인 오류:", err);
    return { count: 0, documents: [] };
  }
}

// ============================================================================
// 3. 재고 부족 원자재 알림
// ============================================================================
async function checkLowStockMaterials(db: any, tenantId: number): Promise<{
  count: number;
  materials: Array<{ id: number; name: string; current: number; safety: number; unit: string }>;
}> {
  try {
    const result = await db.execute(sql`
      SELECT 
        m.id,
        m.material_name as name,
        m.unit,
        COALESCE(m.safety_stock_level, 0) as safety_level,
        COALESCE(SUM(il.available_quantity), 0) as current_stock
      FROM h_materials m
      LEFT JOIN h_inventory_lots il ON il.material_id = m.id AND il.status = 'available'
      WHERE m.tenant_id = ${tenantId}
        AND COALESCE(m.safety_stock_level, 0) > 0
      GROUP BY m.id, m.material_name, m.unit, m.safety_stock_level
      HAVING COALESCE(SUM(il.available_quantity), 0) < COALESCE(m.safety_stock_level, 0)
      ORDER BY (COALESCE(m.safety_stock_level, 0) - COALESCE(SUM(il.available_quantity), 0)) DESC
    `);
    
    const rows3 = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    const materials = (rows3 as any[]).map((r: any) => ({
      id: r.id,
      name: r.name,
      current: parseFloat(r.current_stock) || 0,
      safety: parseFloat(r.safety_level) || 0,
      unit: r.unit || ''
    }));
    
    if (materials.length > 0) {
      // 심각한 부족 (50% 이하)과 일반 부족 분리
      const critical = materials.filter(m => m.current < m.safety * 0.5);
      const warning = materials.filter(m => m.current >= m.safety * 0.5);
      
      // 심각한 부족 원자재는 개별 알림
      for (const mat of critical) {
        await createClosingNotification(db, tenantId, {
          notificationType: "low_stock_critical",
          title: "재고 심각 부족 경고",
          message: `[일일마감] "${mat.name}" 재고가 심각하게 부족합니다. 현재: ${mat.current}${mat.unit} / 안전재고: ${mat.safety}${mat.unit} (부족량: ${(mat.safety - mat.current).toFixed(1)}${mat.unit})`,
          referenceType: "material",
          referenceId: mat.id,
          priority: "urgent",
          actionUrl: `/dashboard/inventory`
        });
      }
      
      // 일반 부족은 요약 알림
      if (warning.length > 0) {
        const topItems = warning.slice(0, 5).map(m => `${m.name}(${m.current}/${m.safety}${m.unit})`).join(', ');
        await createClosingNotification(db, tenantId, {
          notificationType: "low_stock_warning",
          title: "재고 부족 알림",
          message: `[일일마감] 안전재고 미달 원자재 ${warning.length}건: ${topItems}${warning.length > 5 ? ` 외 ${warning.length - 5}건` : ''}`,
          referenceType: "material",
          priority: "medium",
          actionUrl: `/dashboard/inventory`
        });
      }
    }
    
    return { count: materials.length, materials };
  } catch (err) {
    console.error("[일일마감] 재고 부족 확인 오류:", err);
    return { count: 0, materials: [] };
  }
}

// ============================================================================
// 4. 일일 마감 보고서 생성
// ============================================================================
async function generateDailyReport(db: any, tenantId: number, dateStr: string, summary: DailyClosingSummary): Promise<boolean> {
  try {
    const now = toKSTTimestamp(new Date());
    
    // 생산 실적 조회
    const productionResult = await db.execute(sql`
      SELECT 
        COUNT(*) as total_batches,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_batches,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN actual_quantity ELSE 0 END), 0) as total_production,
        COALESCE(SUM(planned_quantity), 0) as total_planned
      FROM h_batches
      WHERE tenant_id = ${tenantId}
        AND DATE(created_at) = ${dateStr}
    `);
    
    const prodRows = Array.isArray(productionResult) && Array.isArray(productionResult[0]) ? productionResult[0] : productionResult;
    const prod = (prodRows as any[])[0] || {};
    summary.totalBatches = parseInt(prod.total_batches) || 0;
    summary.completedBatches = parseInt(prod.completed_batches) || 0;
    summary.totalProduction = parseFloat(prod.total_production) || 0;
    summary.totalPlanned = parseFloat(prod.total_planned) || 0;
    
    // 보고서 데이터 구성
    const reportSummary = JSON.stringify({
      date: dateStr,
      tenantId,
      production: {
        totalBatches: summary.totalBatches,
        completedBatches: summary.completedBatches,
        incompleteBatches: summary.incompleteBatches,
        completionRate: summary.totalBatches > 0 
          ? Math.round((summary.completedBatches / summary.totalBatches) * 100) 
          : 0,
        totalProduction: summary.totalProduction,
        totalPlanned: summary.totalPlanned,
        achievementRate: summary.totalPlanned > 0
          ? Math.round((summary.totalProduction / summary.totalPlanned) * 100)
          : 0
      },
      approvals: {
        pendingCount: summary.pendingApprovals,
        pendingDocuments: summary.details.pendingDocList.slice(0, 10)
      },
      inventory: {
        lowStockCount: summary.lowStockMaterials,
        lowStockItems: summary.details.lowStockList.slice(0, 10)
      },
      warnings: summary.warnings,
      generatedAt: now
    });
    
    // h_daily_reports에 저장 (ON DUPLICATE KEY UPDATE 대신 기존 레코드 확인)
    const existing = await db.execute(sql`
      SELECT id FROM h_daily_reports 
      WHERE tenant_id = ${tenantId} 
        AND report_date = ${dateStr} 
        AND report_type = 'daily_closing'
      LIMIT 1
    `);
    
    const existingRows = Array.isArray(existing) && Array.isArray(existing[0]) ? existing[0] : existing;
    if ((existingRows as any[]).length > 0) {
      // 기존 레코드 업데이트
      await db.execute(sql`
        UPDATE h_daily_reports 
        SET summary = ${reportSummary},
            generated_at = ${now}
        WHERE id = ${(existingRows as any[])[0].id}
      `);
    } else {
      // 새 레코드 삽입
      await db.execute(sql`
        INSERT INTO h_daily_reports 
        (site_id, report_date, report_type, summary, generated_at, tenant_id)
        VALUES 
        (0, ${dateStr}, 'daily_closing', ${reportSummary}, ${now}, ${tenantId})
      `);
    }
    
    // 보고서 생성 완료 알림
    await createClosingNotification(db, tenantId, {
      notificationType: "daily_closing_report",
      title: "일일 마감 보고서 생성 완료",
      message: `[일일마감] ${dateStr} 마감 보고서가 생성되었습니다. 배치: ${summary.completedBatches}/${summary.totalBatches}건 완료, 미처리 문서: ${summary.pendingApprovals}건, 재고부족: ${summary.lowStockMaterials}건`,
      referenceType: "report",
      priority: summary.warnings.length > 0 ? "high" : "low",
      actionUrl: `/dashboard/production-management`
    });
    
    console.log(`[일일마감] 보고서 저장 완료 - tenant:${tenantId}, date:${dateStr}`);

    // 생산일지(production_daily) 자동 생성/갱신 (일일마감 시 함께 처리)
    try {
      const { autoRegenerateProductionDaily } = await import('../lib/production/autoProductionDaily');
      await autoRegenerateProductionDaily(tenantId, dateStr);
      console.log(`[일일마감] 생산일지(production_daily) 자동 갱신 완료 - tenant:${tenantId}, date:${dateStr}`);
    } catch (pdErr) {
      console.error('[일일마감] 생산일지(production_daily) 갱신 실패:', pdErr);
    }

    return true;
  } catch (err) {
    console.error("[일일마감] 보고서 생성 오류:", err);
    return false;
  }
}

// ============================================================================
// 알림 생성 헬퍼 (h_notifications 테이블 구조에 맞춤)
// ============================================================================
async function createClosingNotification(db: any, tenantId: number, data: {
  notificationType: string;
  title: string;
  message: string;
  referenceType?: string;
  referenceId?: number;
  priority?: string;
  actionUrl?: string;
}) {
  try {
    const now = toKSTTimestamp(new Date());
    await db.execute(sql`
      INSERT INTO h_notifications 
      (user_id, notification_type, title, message, reference_type, reference_id, priority, is_read, action_url, is_resolved, created_at, tenant_id)
      VALUES 
      (1, ${data.notificationType}, ${data.title}, ${data.message}, ${data.referenceType || null}, ${data.referenceId || null}, ${data.priority || 'medium'}, 0, ${data.actionUrl || null}, 0, ${now}, ${tenantId})
    `);
  } catch (err) {
    // 알림 생성 실패 시 로그만 출력 (마감 프로세스 중단하지 않음)
    console.log(`[일일마감 알림] ${data.priority}: ${data.title} - ${data.message}`);
  }
}

// ============================================================================
// 메인 일일 마감 프로세스
// ============================================================================
export async function runDailyClosingProcess(): Promise<DailyClosingSummary[]> {
  const today = new Date();
  const dateStr = formatLocalDate(today);
  const summaries: DailyClosingSummary[] = [];
  
  console.log(`[일일마감] ========== ${dateStr} 일일 마감 시작 ==========`);
  
  try {
    const db = await getDb();
    if (!db) {
      console.error("[일일마감] 데이터베이스 연결 실패");
      return summaries;
    }
    
    // 활성 테넌트 목록 조회
    const tenants = await db.execute(sql`
      SELECT id FROM tenants WHERE status = 'active'
    `);
    
    const tenantRows = Array.isArray(tenants) && Array.isArray(tenants[0]) ? tenants[0] : tenants;
    if (!(tenantRows as any[]).length) {
      console.log("[일일마감] 활성 테넌트 없음");
      return summaries;
    }
    
    // 각 테넌트별 마감 처리
    for (const tenant of (tenantRows as any[])) {
      const tenantId = tenant.id;
      
      // ★ 생산 활동이 전혀 없는 테넌트는 스킵 (빈 알림/리포트 방지)
      try {
        const activityCheck = await db.execute(sql`
          SELECT 
            (SELECT COUNT(*) FROM h_batches WHERE tenant_id = ${tenantId} AND DATE(created_at) >= DATE_SUB(${dateStr}, INTERVAL 1 DAY)) as recent_batches,
            (SELECT COUNT(*) FROM h_batches WHERE tenant_id = ${tenantId}) as total_batches
        `);
        const actRows = Array.isArray(activityCheck) && Array.isArray(activityCheck[0]) ? activityCheck[0] : activityCheck;
        const activity = (actRows as any[])[0];
        if (Number(activity?.total_batches || 0) === 0) {
          console.log(`[일일마감] 테넌트 ${tenantId} 스킵 (생산 활동 없음)`);
          continue;
        }
      } catch (skipErr) {
        // 체크 실패 시 마감 처리 계속 진행
      }
      
      console.log(`[일일마감] --- 테넌트 ${tenantId} 마감 시작 ---`);
      
      const summary: DailyClosingSummary = {
        date: dateStr,
        tenantId,
        totalBatches: 0,
        completedBatches: 0,
        incompleteBatches: 0,
        pendingApprovals: 0,
        lowStockMaterials: 0,
        totalProduction: 0,
        totalPlanned: 0,
        warnings: [],
        details: {
          incompleteBatchList: [],
          lowStockList: [],
          pendingDocList: []
        },
        success: true
      };
      
      try {
        // 1. 미완료 배치 경고
        const batchResult = await checkIncompleteBatches(db, tenantId, dateStr);
        summary.incompleteBatches = batchResult.count;
        summary.details.incompleteBatchList = batchResult.batches;
        if (batchResult.count > 0) {
          summary.warnings.push(`미완료 배치 ${batchResult.count}건`);
        }
        
        // 2. 승인 대기 문서 정리
        const approvalResult = await checkPendingApprovals(db, tenantId, dateStr);
        summary.pendingApprovals = approvalResult.count;
        summary.details.pendingDocList = approvalResult.documents;
        if (approvalResult.count > 0) {
          summary.warnings.push(`승인 대기 문서 ${approvalResult.count}건`);
        }
        
        // 3. 재고 부족 알림
        const stockResult = await checkLowStockMaterials(db, tenantId);
        summary.lowStockMaterials = stockResult.count;
        summary.details.lowStockList = stockResult.materials;
        if (stockResult.count > 0) {
          summary.warnings.push(`재고 부족 원자재 ${stockResult.count}건`);
        }
        
        // 4. 일일 마감 보고서 생성
        // generateDailyReport 내부에서 autoRegenerateProductionDaily(planned_date 기준)도 함께 호출됨.
        // 과거에는 여기서 generateProductionDailyReport를 한 번 더 호출했으나,
        // 해당 함수는 created_at 조건을 포함해 당일 생성/수정된 타 날짜 배치까지 긁어와
        // 오늘자 생산일지에 섞여 들어가는 오염을 일으키므로 제거.
        const reportSuccess = await generateDailyReport(db, tenantId, dateStr, summary);
        if (!reportSuccess) {
          summary.warnings.push("보고서 저장 실패");
        }
        
        console.log(`[일일마감] 테넌트 ${tenantId} 완료: 배치 ${summary.completedBatches}/${summary.totalBatches}, 미처리문서 ${summary.pendingApprovals}, 재고부족 ${summary.lowStockMaterials}`);
        
      } catch (err: any) {
        summary.success = false;
        summary.warnings.push(`처리 오류: ${err?.message || '알 수 없는 오류'}`);
        console.error(`[일일마감] 테넌트 ${tenantId} 오류:`, err);
      }
      
      summaries.push(summary);
    }
    
    console.log(`[일일마감] ========== ${dateStr} 일일 마감 완료 (${summaries.length}개 테넌트) ==========`);
    
  } catch (error: any) {
    console.error('[일일마감] 전체 프로세스 오류:', error);
  }
  
  return summaries;
}

// ============================================================================
// 5. [DEPRECATED] 생산일보 (Production Daily Report) 자동 생성
// - created_at 조건으로 타 날짜 배치가 당일자 일지로 섞여 들어가는 버그가 있어 비활성화.
// - 대체 경로: generateDailyReport() 말미의 autoRegenerateProductionDaily() (planned_date 기준).
// - 호출부 모두 제거됨. 참고용으로만 남김.
// ============================================================================
/** @deprecated planned_date 기준 autoRegenerateProductionDaily를 사용할 것 */
async function generateProductionDailyReport(db: any, tenantId: number, dateStr: string): Promise<void> {
  try {
    // 1. 당일 배치 목록 + 제품정보 조회
    const batchResult = await db.execute(sql`
      SELECT 
        b.id, b.batch_code, b.status, b.planned_quantity, b.actual_quantity,
        b.start_time, b.end_time, b.planned_date,
        p.product_name, p.product_code
      FROM h_batches b
      LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = ${tenantId}
      WHERE b.tenant_id = ${tenantId}
        AND (DATE(b.planned_date) = ${dateStr} OR DATE(b.created_at) = ${dateStr})
      ORDER BY b.created_at ASC
    `);
    const batches = Array.isArray(batchResult) && Array.isArray(batchResult[0]) ? batchResult[0] : batchResult;
    if (!(batches as any[]).length) {
      console.log(`[생산일보] 테넌트 ${tenantId} / ${dateStr}: 배치 없음 → 생산일보 미생성`);
      return;
    }

    // 2. 당일 CCP 집계
    const ccpResult = await db.execute(sql`
      SELECT 
        COUNT(*) as total_ccp,
        SUM(CASE WHEN ci.status = 'completed' THEN 1 ELSE 0 END) as normal_count,
        SUM(CASE WHEN ci.status = 'deviation' THEN 1 ELSE 0 END) as deviation_count
      FROM h_ccp_instances ci
      INNER JOIN h_batches b ON ci.batch_id = b.id
      WHERE ci.tenant_id = ${tenantId}
        AND (DATE(b.planned_date) = ${dateStr} OR DATE(b.created_at) = ${dateStr})
    `);
    const ccpStats = (ccpResult as any)[0]?.[0] || { total_ccp: 0, normal_count: 0, deviation_count: 0 };

    // 3. CCP FAIL (이탈) 상세
    const issueResult = await db.execute(sql`
      SELECT 
        cr.id as row_id, cr.result, cr.note, cr.measured_at,
        ci.ccp_type, b.batch_code,
        p.product_name
      FROM h_ccp_rows cr
      INNER JOIN h_ccp_instances ci ON cr.instance_id = ci.id
      INNER JOIN h_batches b ON ci.batch_id = b.id
      LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = ${tenantId}
      WHERE cr.tenant_id = ${tenantId}
        AND cr.result = 'FAIL'
        AND (DATE(b.planned_date) = ${dateStr} OR DATE(b.created_at) = ${dateStr})
      ORDER BY cr.measured_at ASC
    `);
    const issues = Array.isArray(issueResult) && Array.isArray(issueResult[0]) ? issueResult[0] : issueResult;

    // 4. 위생점검 일일일지 데이터 (h_generic_checklist_records) 연결
    const checklistResult = await db.execute(sql`
      SELECT id, form_data, status FROM h_generic_checklist_records
      WHERE form_type = 'daily_log'
        AND form_date = ${dateStr}
        AND tenant_id = ${tenantId}
      LIMIT 1
    `);
    const checklistRows = (checklistResult as any)[0] || [];
    let checklistInfo: any = null;
    if ((checklistRows as any[]).length > 0) {
      const cl = (checklistRows as any[])[0];
      let formData: any = {};
      try {
        formData = typeof cl.form_data === 'string' ? JSON.parse(cl.form_data) : (cl.form_data || {});
      } catch {}
      checklistInfo = {
        id: cl.id,
        status: cl.status,
        hygieneCompleted: Array.isArray(formData.hygieneChecks)
          ? formData.hygieneChecks.filter((c: any) => c.checkResult).length
          : Object.values(formData.hygieneChecks || {}).filter((v: any) => v !== null && v !== '' && typeof v !== 'object').length,
        foreignCompleted: Array.isArray(formData.foreignMaterialChecks)
          ? formData.foreignMaterialChecks.filter((c: any) => c.checkResult).length
          : Object.values(formData.foreignMaterialChecks || {}).filter((v: any) => v !== null && v !== '').length,
      };
    }

    // 5. 생산일보 데이터 구성
    const batchList = (batches as any[]).map((b: any) => ({
      batchId: b.id,
      batchCode: b.batch_code,
      productName: b.product_name || '미확인',
      productCode: b.product_code || '',
      plannedQuantity: parseFloat(b.planned_quantity || '0'),
      actualQuantity: parseFloat(b.actual_quantity || '0'),
      status: b.status,
      startTime: b.start_time,
      endTime: b.end_time,
    }));

    const totalPlanned = batchList.reduce((s: number, b: any) => s + b.plannedQuantity, 0);
    const totalActual = batchList.reduce((s: number, b: any) => s + b.actualQuantity, 0);
    const completedBatches = batchList.filter((b: any) => b.status === 'completed').length;

    const reportSummary = {
      date: dateStr,
      tenantId,
      autoGenerated: true,
      generatedAt: new Date().toISOString(),
      production: {
        batches: batchList,
        totalBatches: batchList.length,
        completedBatches,
        totalPlannedQty: totalPlanned,
        totalActualQty: totalActual,
        achievementRate: totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0,
      },
      ccp: {
        totalRecords: Number(ccpStats.total_ccp) || 0,
        normalCount: Number(ccpStats.normal_count) || 0,
        deviationCount: Number(ccpStats.deviation_count) || 0,
        complianceRate: Number(ccpStats.total_ccp) > 0
          ? ((Number(ccpStats.total_ccp) - Number(ccpStats.deviation_count || 0)) / Number(ccpStats.total_ccp) * 100).toFixed(1)
          : '100.0',
      },
      issues: (issues as any[]).map((i: any) => ({
        rowId: i.row_id,
        batchCode: i.batch_code,
        productName: i.product_name,
        ccpType: i.ccp_type,
        result: i.result,
        note: i.note,
        measuredAt: i.measured_at,
      })),
      checklist: checklistInfo,
    };

    // 6. h_daily_reports UPSERT (report_type = 'production_daily')
    const existing = await db.execute(sql`
      SELECT id FROM h_daily_reports
      WHERE tenant_id = ${tenantId}
        AND report_date = ${dateStr}
        AND report_type = 'production_daily'
      LIMIT 1
    `);
    const existingRows = (existing as any)[0] || [];

    if ((existingRows as any[]).length > 0) {
      await db.execute(sql`
        UPDATE h_daily_reports
        SET summary = ${JSON.stringify(reportSummary)},
            generated_at = NOW()
        WHERE id = ${(existingRows as any[])[0].id}
      `);
    } else {
      await db.execute(sql`
        INSERT INTO h_daily_reports
        (site_id, report_date, report_type, summary, generated_at, tenant_id)
        VALUES
        (0, ${dateStr}, 'production_daily', ${JSON.stringify(reportSummary)}, NOW(), ${tenantId})
      `);
    }

    console.log(`[생산일보] 테넌트 ${tenantId} / ${dateStr}: 배치 ${batchList.length}건, CCP ${ccpStats.total_ccp}건, 이슈 ${(issues as any[]).length}건`);
  } catch (err) {
    console.error(`[생산일보] 테넌트 ${tenantId} / ${dateStr} 생성 실패:`, err);
    throw err;
  }
}

// ============================================================================
// 스케줄러 초기화 - setInterval 기반 (매일 18:00 KST)
// ============================================================================
export function initDailyClosingScheduler() {
  console.log("[Daily Closing] 일일 마감 스케줄러 초기화 중...");

  function getMillisUntilNext1800KST(): number {
    const now = new Date();
    // KST 기준 현재 시간 계산
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstNow = new Date(now.getTime() + kstOffset);
    const kstHour = kstNow.getUTCHours();
    const kstMinute = kstNow.getUTCMinutes();
    const kstSecond = kstNow.getUTCSeconds();

    let hoursUntil = 18 - kstHour;
    if (hoursUntil < 0 || (hoursUntil === 0 && (kstMinute > 0 || kstSecond > 0))) {
      hoursUntil += 24;
    }

    const msUntil = ((hoursUntil * 60 - kstMinute) * 60 - kstSecond) * 1000;
    return Math.max(msUntil, 1000); // 최소 1초
  }

  function scheduleNext() {
    const msUntil = getMillisUntilNext1800KST();
    const hoursUntil = Math.round(msUntil / (60 * 60 * 1000) * 10) / 10;
    console.log(`[Daily Closing] 다음 일일 마감까지 ${hoursUntil}시간 남음 (${new Date(Date.now() + msUntil).toISOString()})`);

    setTimeout(async () => {
      console.log(`[Daily Closing] ===== 일일 마감 실행 시작: ${new Date().toISOString()} =====`);
      try {
        const summaries = await runDailyClosingProcess();
        const totalWarnings = summaries.reduce((acc, s) => acc + s.warnings.length, 0);
        console.log(`[Daily Closing] 일일 마감 완료: ${summaries.length}개 테넌트, ${totalWarnings}개 경고`);
      } catch (err) {
        console.error(`[Daily Closing] 일일 마감 오류:`, err);
      }
      // 다음 실행 예약
      scheduleNext();
    }, msUntil);
  }

  scheduleNext();
  console.log("[Daily Closing] 일일 마감 스케줄러 초기화 완료 (매일 18:00 KST)");

  // ---- 생산일지(production_daily) 09:00 KST 자동 생성 스케줄러 ----
  function getMillisUntilNext0900KST(): number {
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstNow = new Date(now.getTime() + kstOffset);
    const kstHour = kstNow.getUTCHours();
    const kstMinute = kstNow.getUTCMinutes();
    const kstSecond = kstNow.getUTCSeconds();
    let hoursUntil = 9 - kstHour;
    if (hoursUntil < 0 || (hoursUntil === 0 && (kstMinute > 0 || kstSecond > 0))) {
      hoursUntil += 24;
    }
    const msUntil = ((hoursUntil * 60 - kstMinute) * 60 - kstSecond) * 1000;
    return Math.max(msUntil, 1000);
  }

  function scheduleMorningProductionDaily() {
    const msUntil = getMillisUntilNext0900KST();
    const hoursUntil = Math.round(msUntil / (60 * 60 * 1000) * 10) / 10;
    console.log(`[Production Daily] 다음 생산일지 자동 생성까지 ${hoursUntil}시간 남음`);

    setTimeout(async () => {
      console.log(`[Production Daily] ===== 09:00 KST 생산일지 자동 생성 시작 =====`);
      try {
        const db = await getDb();
        if (db) {
          // 전체 테넌트 목록 조회
          const tenantsResult = await db.execute(sql`SELECT DISTINCT tenant_id FROM h_batches WHERE tenant_id IS NOT NULL`);
          const tenants = ((tenantsResult as any)[0] || []) as any[];
          const todayStr = toKSTDate(new Date(Date.now() + 9 * 60 * 60 * 1000));
          const { autoRegenerateProductionDaily } = await import('../lib/production/autoProductionDaily');
          for (const t of tenants) {
            try {
              await autoRegenerateProductionDaily(t.tenant_id, todayStr);
              console.log(`[Production Daily] tenant:${t.tenant_id} - ${todayStr} 생성 완료`);
            } catch (tErr) {
              console.error(`[Production Daily] tenant:${t.tenant_id} 생성 실패:`, tErr);
            }
          }
        }
      } catch (err) {
        console.error(`[Production Daily] 09:00 자동 생성 오류:`, err);
      }
      scheduleMorningProductionDaily();
    }, msUntil);
  }

  scheduleMorningProductionDaily();
  console.log("[Production Daily] 생산일지 09:00 KST 자동 생성 스케줄러 초기화 완료");
}
