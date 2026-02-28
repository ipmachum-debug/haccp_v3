/**
 * HACCP-ONE 파이프라인 대시보드 + 매끄러운 운영 보강 서비스
 * 
 * 1. 파이프라인 상태 대시보드 API
 * 2. 재고 부족 사전 경고
 * 3. 자동 알림 트리거
 * 4. 일일 마감 자동화
 * 
 * [수정 이력]
 * - 2026-02-12: DB 스키마 불일치 수정
 *   - products → h_products_v2 (product_name, product_code)
 *   - h_accounting_entries → accounting_transactions (reference_id, reference_type)
 *   - h_inventory_transactions: batch_id → reference_id + reference_type='batch'
 *   - h_ccp_monitoring → h_ccp_instances (batch_id 있음)
 *   - h_batches: started_at → start_time
 */

import { sql } from "drizzle-orm";

// ============================================================================
// 1. 파이프라인 상태 대시보드 - 오늘 배치별 진행 상태 한눈에 확인
// ============================================================================
export async function getPipelineStatus(db: any, siteId: number, workDate?: string) {
  const targetDate = workDate || new Date().toISOString().split('T')[0];
  
  try {
    // 오늘의 배치 목록 + 각 단계 진행 상태
    const batchesQuery = sql`
      SELECT 
        b.id,
        b.batch_code,
        b.lot_number,
        b.status,
        b.planned_quantity,
        b.actual_quantity,
        b.start_time,
        b.completed_at,
        b.created_at,
        p.product_name,
        p.product_code,
        -- 원료 출고 상태 (reference_type='batch'로 배치 참조)
        (SELECT COUNT(*) FROM h_inventory_transactions 
         WHERE reference_id = b.id AND reference_type = 'batch' AND transaction_type IN ('outbound', 'usage')) as material_issue_count,
        -- CCP 인스턴스 상태 (h_ccp_instances에 batch_id 있음, process_group_id 연결)
        (SELECT COUNT(*) FROM h_ccp_instances 
         WHERE batch_id = b.id AND tenant_id = b.tenant_id) as ccp_record_count,
        (SELECT COUNT(*) FROM h_ccp_instances 
         WHERE batch_id = b.id AND tenant_id = b.tenant_id AND status IN ('submitted', 'approved')) as ccp_completed_count,
        -- CCP 공정그룹별 현황 (JSON)
        (SELECT JSON_ARRAYAGG(JSON_OBJECT(
           'instanceId', ci.id,
           'ccpType', ci.ccp_type,
           'groupName', COALESCE(pg.name, ci.ccp_type),
           'status', ci.status,
           'mappingSource', CASE WHEN ci.process_group_id IS NOT NULL THEN 'BOM' ELSE 'MANUAL' END
         ))
         FROM h_ccp_instances ci
         LEFT JOIN ccp_process_groups pg ON pg.id = ci.process_group_id
         WHERE ci.batch_id = b.id AND ci.tenant_id = b.tenant_id
        ) as ccp_group_details,
        -- 문서 생성 상태
        (SELECT COUNT(*) FROM document_instances 
         WHERE batch_id = b.id) as document_count,
        (SELECT COUNT(*) FROM document_instances 
         WHERE batch_id = b.id AND status = 'approved') as approved_document_count,
        (SELECT COUNT(*) FROM document_instances 
         WHERE batch_id = b.id AND status IN ('pending_review', 'pending_approval')) as pending_document_count,
        -- 회계 전표 상태 (accounting_transactions에서 reference_type='batch'로 참조)
        (SELECT COUNT(*) FROM accounting_transactions 
         WHERE reference_id = b.id AND reference_type = 'batch') as accounting_entry_count
      FROM h_batches b
      LEFT JOIN h_products_v2 p ON b.product_id = p.id
      WHERE b.site_id = ${siteId}
        AND DATE(b.created_at) = ${targetDate}
      ORDER BY b.created_at DESC
    `;
    
    const batchesResult = await db.execute(batchesQuery);
    // drizzle-orm/mysql2의 db.execute는 [rows, fields] 형태로 반환
    const batches = Array.isArray(batchesResult) && Array.isArray(batchesResult[0]) ? batchesResult[0] : batchesResult;
    
    // 각 배치의 파이프라인 단계 상태 매핑
    const pipelineData = (batches as any[]).map((batch: any) => {
      const steps = [
        { 
          step: 1, name: '레시피', 
          status: 'completed', // 배치가 생성되었으면 레시피는 완료
          detail: `${batch.product_name || '제품'}`
        },
        { 
          step: 2, name: '배치생성', 
          status: 'completed',
          detail: `${batch.batch_code} / ${batch.lot_number || '-'}`
        },
        { 
          step: 3, name: '원료출고', 
          status: batch.material_issue_count > 0 ? 'completed' : 
                  batch.status === 'in_progress' ? 'in_progress' : 'pending',
          detail: `${batch.material_issue_count}건 출고`
        },
                { 
          step: 4, name: 'CCP관리', 
          status: batch.ccp_completed_count > 0 && batch.ccp_completed_count === batch.ccp_record_count ? 'completed' :
                  batch.ccp_record_count > 0 ? 'in_progress' : 'pending',
          detail: `${batch.ccp_completed_count}/${batch.ccp_record_count}건 완료`,
          groups: (() => {
            try {
              const d = typeof batch.ccp_group_details === 'string'
                ? JSON.parse(batch.ccp_group_details)
                : batch.ccp_group_details;
              return Array.isArray(d) ? d : [];
            } catch { return []; }
          })()
        },
        { 
          step: 5, name: '기록', 
          status: (batch.status === 'completed' || batch.status === 'approved') ? 'completed' : 
                  batch.status === 'in_progress' ? 'in_progress' : 'pending',
          detail: (batch.status === 'completed' || batch.status === 'approved') ? '기록 완료' : '진행 중'
        },
        { 
          step: 6, name: '일일일지', 
          status: (batch.status === 'completed' || batch.status === 'approved') ? 'completed' : 'pending',
          detail: (batch.status === 'completed' || batch.status === 'approved') ? '자동 생성' : '대기'
        },
        { 
          step: 7, name: '문서생성', 
          status: batch.document_count > 0 ? 'completed' : 'pending',
          detail: `${batch.document_count}건 생성`
        },
        { 
          step: 8, name: '승인', 
          status: batch.approved_document_count > 0 && batch.approved_document_count === batch.document_count ? 'completed' :
                  batch.pending_document_count > 0 ? 'in_progress' : 'pending',
          detail: `${batch.approved_document_count}/${batch.document_count}건 승인`
        },
        { 
          step: 9, name: '회계', 
          status: batch.accounting_entry_count > 0 ? 'completed' : 'pending',
          detail: `${batch.accounting_entry_count}건 전표`
        },
      ];
      
      const completedSteps = steps.filter(s => s.status === 'completed').length;
      const progressPercent = Math.round((completedSteps / steps.length) * 100);
      
      return {
        batchId: batch.id,
        batchCode: batch.batch_code,
        lotNumber: batch.lot_number,
        productName: batch.product_name,
        status: batch.status,
        plannedQuantity: batch.planned_quantity,
        actualQuantity: batch.actual_quantity,
        startedAt: batch.start_time,
        completedAt: batch.completed_at,
        steps,
        completedSteps,
        totalSteps: steps.length,
        progressPercent,
      };
    });
    
    // 요약 통계
    const summary = {
      totalBatches: pipelineData.length,
      completedBatches: pipelineData.filter((b: any) => b.status === 'completed').length,
      inProgressBatches: pipelineData.filter((b: any) => b.status === 'in_progress').length,
      pendingBatches: pipelineData.filter((b: any) => b.status === 'planned').length,
      errorBatches: pipelineData.filter((b: any) => b.status === 'failed').length,
      averageProgress: pipelineData.length > 0 
        ? Math.round(pipelineData.reduce((sum: number, b: any) => sum + b.progressPercent, 0) / pipelineData.length) 
        : 0,
    };
    
    return { batches: pipelineData, summary, workDate: targetDate };
  } catch (err) {
    console.error('[getPipelineStatus] 쿼리 실행 오류:', err);
    // 에러 시에도 빈 결과 반환 (프론트엔드 로딩 무한 방지)
    return { 
      batches: [], 
      summary: { 
        totalBatches: 0, completedBatches: 0, inProgressBatches: 0, 
        pendingBatches: 0, errorBatches: 0, averageProgress: 0 
      }, 
      workDate: targetDate 
    };
  }
}


// ============================================================================
// 2. 재고 부족 사전 경고 - 배치 시작 전 원료 재고 사전 체크
// ============================================================================
export async function checkMaterialAvailability(db: any, batchId: number, siteId: number) {
  // 배치 정보 조회
  const batchQuery = sql`
    SELECT b.*, p.product_name
    FROM h_batches b
    LEFT JOIN h_products_v2 p ON b.product_id = p.id
    WHERE b.id = ${batchId}
  `;
  const batchResultRaw = await db.execute(batchQuery);
  const batchResult = Array.isArray(batchResultRaw) && Array.isArray(batchResultRaw[0]) ? batchResultRaw[0] : batchResultRaw;
  const batch = (batchResult as any[])[0];
  
  if (!batch) throw new Error("배치를 찾을 수 없습니다");
  
  // 레시피 원료 목록 조회
  const recipeQuery = sql`
    SELECT 
      rl.material_id,
      rl.quantity as recipe_quantity,
      rl.unit,
      m.name as material_name,
      m.code as material_code
    FROM recipe_lines rl
    LEFT JOIN materials m ON rl.material_id = m.id
    WHERE rl.recipe_id = ${batch.recipe_id}
  `;
  const recipeLinesRaw = await db.execute(recipeQuery);
  const recipeLines = Array.isArray(recipeLinesRaw) && Array.isArray(recipeLinesRaw[0]) ? recipeLinesRaw[0] : recipeLinesRaw;
  
  // 필요 수량 계산 (레시피 수량 * 배치 계획 수량 / 레시피 기준 수량)
  const warnings: any[] = [];
  const results: any[] = [];
  
  for (const line of (recipeLines as any[])) {
    const requiredQty = parseFloat(line.recipe_quantity) * parseFloat(batch.planned_quantity);
    
    // 현재 재고 확인
    const stockQuery = sql`
      SELECT COALESCE(SUM(quantity), 0) as available_qty
      FROM h_inventory
      WHERE material_id = ${line.material_id}
        AND site_id = ${siteId}
        AND quantity > 0
    `;
    const stockResultRaw = await db.execute(stockQuery);
    const stockResult = Array.isArray(stockResultRaw) && Array.isArray(stockResultRaw[0]) ? stockResultRaw[0] : stockResultRaw;
    const availableQty = parseFloat((stockResult as any[])[0]?.available_qty || '0');
    
    const isShortage = availableQty < requiredQty;
    const shortageQty = isShortage ? requiredQty - availableQty : 0;
    
    const item = {
      materialId: line.material_id,
      materialName: line.material_name,
      materialCode: line.material_code,
      requiredQty,
      availableQty,
      unit: line.unit,
      isShortage,
      shortageQty,
      coveragePercent: requiredQty > 0 ? Math.round((availableQty / requiredQty) * 100) : 100,
    };
    
    results.push(item);
    if (isShortage) warnings.push(item);
  }
  
  return {
    batchId,
    batchCode: batch.batch_code,
    productName: batch.product_name,
    plannedQuantity: batch.planned_quantity,
    materials: results,
    warnings,
    hasShortage: warnings.length > 0,
    message: warnings.length > 0 
      ? `${warnings.length}개 원료 재고 부족: ${warnings.map((w: any) => `${w.materialName}(부족: ${w.shortageQty}${w.unit})`).join(', ')}`
      : '모든 원료 재고 충분',
  };
}


// ============================================================================
// 3. 자동 알림 생성 - 파이프라인 단계별 알림
// ============================================================================
export async function createPipelineNotification(
  db: any, 
  siteId: number, 
  batchId: number, 
  eventType: string, 
  message: string,
  severity: 'info' | 'warning' | 'error' = 'info',
  targetUserId?: number
) {
  const now = new Date().toISOString().replace('T', ' ').split('.')[0];
  
  try {
    await db.execute(sql`
      INSERT INTO h_notifications 
      (site_id, batch_id, event_type, message, severity, target_user_id, is_read, created_at)
      VALUES 
      (${siteId}, ${batchId}, ${eventType}, ${message}, ${severity}, ${targetUserId || null}, false, ${now})
    `);
    console.log(`[파이프라인 알림] ${severity}: ${message}`);
  } catch (err) {
    // h_notifications 테이블이 없을 수 있음 - 로그만 출력
    console.log(`[파이프라인 알림 - 로그] ${severity}: ${message}`);
  }
}

// 파이프라인 이벤트별 알림 생성 헬퍼
export async function notifyPipelineEvent(db: any, siteId: number, batchId: number, event: string, detail?: string) {
  const eventMessages: Record<string, { message: string; severity: 'info' | 'warning' | 'error' }> = {
    'batch_created': { message: `새 배치가 생성되었습니다. ${detail || ''}`, severity: 'info' },
    'batch_started': { message: `배치 생산이 시작되었습니다. ${detail || ''}`, severity: 'info' },
    'material_issued': { message: `원료가 자동 출고되었습니다. ${detail || ''}`, severity: 'info' },
    'material_shortage': { message: `원료 재고 부족 경고! ${detail || ''}`, severity: 'warning' },
    'ccp_generated': { message: `CCP 모니터링이 자동 생성되었습니다. ${detail || ''}`, severity: 'info' },
    'ccp_deviation': { message: `CCP 이탈이 감지되었습니다! ${detail || ''}`, severity: 'error' },
    'batch_completed': { message: `배치 생산이 완료되었습니다. ${detail || ''}`, severity: 'info' },
    'daily_report_created': { message: `일일일지가 자동 생성되었습니다. ${detail || ''}`, severity: 'info' },
    'documents_created': { message: `문서가 자동 생성되었습니다. ${detail || ''}`, severity: 'info' },
    'approval_requested': { message: `승인 요청이 등록되었습니다. ${detail || ''}`, severity: 'info' },
    'documents_approved': { message: `문서가 승인되었습니다. ${detail || ''}`, severity: 'info' },
    'accounting_posted': { message: `회계 전표가 생성되었습니다. ${detail || ''}`, severity: 'info' },
    'batch_incomplete': { message: `배치가 마감 시점에 미완료 상태입니다. ${detail || ''}`, severity: 'warning' },
  };
  
  const eventInfo = eventMessages[event] || { message: `파이프라인 이벤트: ${event}. ${detail || ''}`, severity: 'info' as const };
  await createPipelineNotification(db, siteId, batchId, event, eventInfo.message, eventInfo.severity);
}


// ============================================================================
// 4. 일일 마감 자동화 - 매일 특정 시간에 미완료 건 정리
// ============================================================================
export async function runDailyClosing(db: any, siteId: number, workDate?: string) {
  const targetDate = workDate || new Date().toISOString().split('T')[0];
  const now = new Date().toISOString().replace('T', ' ').split('.')[0];
  const results: string[] = [];
  
  try {
    // 4-1. 미완료 배치 확인 및 경고
    const incompleteBatchesQuery = sql`
      SELECT id, batch_code, status
      FROM h_batches
      WHERE site_id = ${siteId}
        AND DATE(created_at) = ${targetDate}
        AND status NOT IN ('completed', 'cancelled')
    `;
    const incompleteBatchesRaw = await db.execute(incompleteBatchesQuery);
    const incompleteBatches = Array.isArray(incompleteBatchesRaw) && Array.isArray(incompleteBatchesRaw[0]) ? incompleteBatchesRaw[0] : incompleteBatchesRaw;
    
    if ((incompleteBatches as any[]).length > 0) {
      const batchCodes = (incompleteBatches as any[]).map((b: any) => b.batch_code).join(', ');
      results.push(`미완료 배치 ${(incompleteBatches as any[]).length}건: ${batchCodes}`);
      
      // 미완료 배치 알림 생성
      for (const batch of (incompleteBatches as any[])) {
        await notifyPipelineEvent(db, siteId, batch.id, 'batch_incomplete', 
          `배치 ${batch.batch_code}가 일일 마감 시점에 미완료 상태(${batch.status})입니다.`);
      }
    }
    
    // 4-2. 미승인 문서 확인 및 경고
    let pendingCount = 0;
    try {
      const pendingDocsQuery = sql`
        SELECT COUNT(*) as count
        FROM document_instances
        WHERE batch_id IN (
          SELECT id FROM h_batches WHERE site_id = ${siteId} AND DATE(created_at) = ${targetDate}
        )
        AND status IN ('pending_review', 'pending_approval')
      `;
      const pendingDocsRaw = await db.execute(pendingDocsQuery);
      const pendingDocs = Array.isArray(pendingDocsRaw) && Array.isArray(pendingDocsRaw[0]) ? pendingDocsRaw[0] : pendingDocsRaw;
      pendingCount = parseInt((pendingDocs as any[])[0]?.count || '0', 10);
      
      if (pendingCount > 0) {
        results.push(`미승인 문서 ${pendingCount}건 잔여`);
      }
    } catch (docErr) {
      console.log('[일일 마감] 미승인 문서 조회 실패:', docErr);
    }
    
    // 4-3. 일일 생산 요약 생성
    const productionSummaryQuery = sql`
      SELECT 
        COUNT(*) as total_batches,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_batches,
        SUM(CASE WHEN status = 'completed' THEN actual_quantity ELSE 0 END) as total_production,
        SUM(planned_quantity) as total_planned
      FROM h_batches
      WHERE site_id = ${siteId}
        AND DATE(created_at) = ${targetDate}
    `;
    const productionSummaryRaw = await db.execute(productionSummaryQuery);
    const productionSummary = Array.isArray(productionSummaryRaw) && Array.isArray(productionSummaryRaw[0]) ? productionSummaryRaw[0] : productionSummaryRaw;
    const summary = (productionSummary as any[])[0];
    
    results.push(`생산 실적: ${summary?.completed_batches || 0}/${summary?.total_batches || 0}배치 완료, 생산량 ${summary?.total_production || 0}/${summary?.total_planned || 0}`);
    
    // 4-4. 일일 마감 기록 저장
    try {
      await db.execute(sql`
        INSERT INTO h_daily_reports 
        (site_id, report_date, report_type, summary, status, created_at, updated_at)
        VALUES 
        (${siteId}, ${targetDate}, 'daily_closing', ${JSON.stringify({ results, summary })}, 'completed', ${now}, ${now})
        ON DUPLICATE KEY UPDATE
        summary = ${JSON.stringify({ results, summary })},
        status = 'completed',
        updated_at = ${now}
      `);
    } catch (err) {
      console.log('[일일 마감] 마감 기록 저장 실패 (테이블 구조 확인 필요):', err);
    }
    
    return {
      success: true,
      workDate: targetDate,
      results,
      summary: {
        totalBatches: summary?.total_batches || 0,
        completedBatches: summary?.completed_batches || 0,
        totalProduction: summary?.total_production || 0,
        totalPlanned: summary?.total_planned || 0,
        pendingDocuments: pendingCount,
        incompleteBatches: (incompleteBatches as any[]).length,
      },
    };
  } catch (err) {
    console.error('[일일 마감 오류]', err);
    return {
      success: false,
      workDate: targetDate,
      error: err instanceof Error ? err.message : '일일 마감 처리 중 오류 발생',
      results,
    };
  }
}
