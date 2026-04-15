/**
 * AI Context Layer - AI가 읽는 요약 데이터 레이어
 *
 * LLM이 raw table 50개 직접 읽으면 엉망 → AI 전용 요약 레이어 필수
 *
 * 제공 API:
 * 1. getBatchSummary()       - 배치별 핵심 지표 + 리스크 점수
 * 2. getCcpEventSummary()    - CCP 이탈/모니터링 요약
 * 3. getChecklistStatus()    - 체크리스트 현황 (작성/미작성/부적합)
 * 4. getDeviationHistory()   - 부적합/이탈 이력
 * 5. getEquipmentHealth()    - 설비 상태 요약
 * 6. getDailyOverview()      - 일일 종합 현황 (AI 대시보드용)
 * 7. getProductionAnalysis() - 생산 분석 (수율 변동 원인 추적)
 * 8. getAuditReadiness()     - 감사 대비 상태
 */

import { getRawConnection } from "../connection";

import { toKSTDate, todayKST } from "../../utils/timezone";

// ============================================================================
// 1. 배치 요약 + 리스크 점수
// ============================================================================

/** 리스크 점수 가중치 */
const RISK_WEIGHTS = {
  ccpDeviation: 30,       // CCP 이탈 건당
  checklistMissing: 10,   // 체크리스트 누락 건당
  equipmentAlert: 15,     // 설비 이상 건당
  yieldDeviation: 20,     // 수율 편차 (15% 이상 시)
  inspectionFail: 25,     // 검사 부적합 건당
};

export type BatchSummary = {
  batchId: number;
  batchCode: string;
  productName: string;
  productId: number;
  status: string;
  plannedQuantity: number;
  actualQuantity: number;
  expectedYield: number;
  actualYield: number;
  yieldDeviation: number;
  ccpDeviationCount: number;
  checklistMissingCount: number;
  equipmentIssueCount: number;
  inspectionFailCount: number;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  completedAt: string | null;
  createdAt: string;
};

export async function getBatchSummary(
  tenantId: number,
  options: { startDate?: string; endDate?: string; batchId?: number; limit?: number } = {}
): Promise<BatchSummary[]> {
  const conn = await getRawConnection();
  const conditions = ["b.tenant_id = ?"];
  const params: any[] = [tenantId];

  if (options.batchId) {
    conditions.push("b.id = ?");
    params.push(options.batchId);
  }
  if (options.startDate) {
    conditions.push("b.created_at >= ?");
    params.push(options.startDate);
  }
  if (options.endDate) {
    conditions.push("b.created_at <= ?");
    params.push(options.endDate + " 23:59:59");
  }

  const limit = options.limit || 50;

  const [rows] = await conn.execute(
    `SELECT
       b.id as batchId,
       b.batch_code as batchCode,
       b.product_id as productId,
       COALESCE(p.name, '') as productName,
       b.status,
       COALESCE(b.planned_quantity, 0) as plannedQuantity,
       COALESCE(b.actual_quantity, 0) as actualQuantity,
       COALESCE(b.actual_yield, 0) as actualYield,
       b.completed_at as completedAt,
       b.created_at as createdAt,

       -- CCP 이탈 횟수
       (SELECT COUNT(*) FROM h_ccp_rows hcr
        JOIN h_ccp_instances hci ON hci.id = hcr.instance_id
        WHERE hci.tenant_id = ? AND hcr.result = 'FAIL'
          AND hci.batch_id = b.id) as ccpDeviationCount,

       -- 체크리스트 누락 (배치 관련 미완료)
       (SELECT COUNT(*) FROM checklist_instances ci
        WHERE ci.tenant_id = ? AND ci.batch_id = b.id
          AND ci.status NOT IN ('completed', 'approved')) as checklistMissingCount,

       -- 검사 부적합
       (SELECT COUNT(*) FROM shipping_inspection_records sir
        WHERE sir.tenant_id = ? AND sir.batch_id = b.id
          AND sir.inspection_result = 'fail') as inspectionFailCount,

       -- 평균 수율 (같은 제품)
       (SELECT AVG(b2.actual_yield) FROM h_batches b2
        WHERE b2.tenant_id = ? AND b2.product_id = b.product_id
          AND b2.status = 'completed' AND b2.actual_yield IS NOT NULL
          AND b2.id != b.id) as avgYield

     FROM h_batches b
     LEFT JOIN products p ON p.id = b.product_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY b.created_at DESC
     LIMIT ?`,
    [tenantId, tenantId, tenantId, tenantId, ...params, limit]
  );

  return (rows as any[]).map((row) => {
    const expectedYield = row.avgYield || 100;
    const yieldDeviation = row.actualYield
      ? Math.round(((expectedYield - row.actualYield) / expectedYield) * 100)
      : 0;

    // 리스크 점수 계산
    let riskScore =
      row.ccpDeviationCount * RISK_WEIGHTS.ccpDeviation +
      row.checklistMissingCount * RISK_WEIGHTS.checklistMissing +
      row.inspectionFailCount * RISK_WEIGHTS.inspectionFail +
      (yieldDeviation > 15 ? RISK_WEIGHTS.yieldDeviation : 0);

    riskScore = Math.min(riskScore, 100);

    const riskLevel: BatchSummary["riskLevel"] =
      riskScore >= 60 ? "critical" : riskScore >= 40 ? "high" : riskScore >= 20 ? "medium" : "low";

    return {
      batchId: row.batchId,
      batchCode: row.batchCode,
      productName: row.productName,
      productId: row.productId,
      status: row.status,
      plannedQuantity: row.plannedQuantity,
      actualQuantity: row.actualQuantity,
      expectedYield: Math.round(expectedYield),
      actualYield: row.actualYield || 0,
      yieldDeviation,
      ccpDeviationCount: row.ccpDeviationCount,
      checklistMissingCount: row.checklistMissingCount,
      equipmentIssueCount: 0,
      inspectionFailCount: row.inspectionFailCount,
      riskScore,
      riskLevel,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
    };
  });
}

// ============================================================================
// 2. CCP 이벤트 요약
// ============================================================================

export type CcpEventSummary = {
  date: string;
  ccpType: string;
  processGroupName: string;
  totalMeasurements: number;
  passCount: number;
  failCount: number;
  deviations: Array<{
    rowId: number;
    measuredAt: string;
    temperature: number | null;
    duration: number | null;
    pressure: number | null;
    result: string;
  }>;
};

export async function getCcpEventSummary(
  tenantId: number,
  options: { startDate?: string; endDate?: string; ccpType?: string } = {}
): Promise<CcpEventSummary[]> {
  const conn = await getRawConnection();
  const date = options.startDate || todayKST();
  const endDate = options.endDate || date;

  const ccpFilter = options.ccpType ? "AND hci.ccp_type = ?" : "";
  const params: any[] = [tenantId, date, endDate];
  if (options.ccpType) params.push(options.ccpType);

  const [rows] = await conn.execute(
    `SELECT
       hci.work_date as date,
       hci.ccp_type as ccpType,
       COALESCE(cpg.name, '') as processGroupName,
       COUNT(*) as totalMeasurements,
       SUM(CASE WHEN hcr.result = 'PASS' THEN 1 ELSE 0 END) as passCount,
       SUM(CASE WHEN hcr.result = 'FAIL' THEN 1 ELSE 0 END) as failCount
     FROM h_ccp_rows hcr
     JOIN h_ccp_instances hci ON hci.id = hcr.instance_id
     LEFT JOIN ccp_process_groups cpg ON cpg.id = hci.process_group_id
     WHERE hci.tenant_id = ?
       AND hci.work_date BETWEEN ? AND ?
       AND hcr.row_type = 'measurement'
       ${ccpFilter}
     GROUP BY hci.work_date, hci.ccp_type, cpg.name
     ORDER BY hci.work_date DESC, failCount DESC`,
    params
  );

  // 이탈 상세 조회
  const results: CcpEventSummary[] = [];
  for (const row of rows as any[]) {
    const [devRows] = await conn.execute(
      `SELECT hcr.id as rowId, hcr.measured_at as measuredAt,
              hcr.temp_c as temperature, hcr.duration_min as duration,
              hcr.pressure_bar as pressure, hcr.result
       FROM h_ccp_rows hcr
       JOIN h_ccp_instances hci ON hci.id = hcr.instance_id
       LEFT JOIN ccp_process_groups cpg ON cpg.id = hci.process_group_id
       WHERE hci.tenant_id = ? AND hci.work_date = ? AND hci.ccp_type = ?
         AND COALESCE(cpg.name, '') = ? AND hcr.result = 'FAIL'
         AND hcr.row_type = 'measurement'
       LIMIT 10`,
      [tenantId, row.date, row.ccpType, row.processGroupName]
    );

    results.push({
      ...row,
      deviations: devRows as any[],
    });
  }

  return results;
}

// ============================================================================
// 3. 체크리스트 현황
// ============================================================================

export type ChecklistStatus = {
  date: string;
  totalTemplates: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  rejected: number;
  completionRate: number;
  missingItems: Array<{
    templateId: number;
    templateName: string;
    category: string;
    status: string;
  }>;
};

export async function getChecklistStatus(tenantId: number, date?: string): Promise<ChecklistStatus> {
  const conn = await getRawConnection();
  const targetDate = date || todayKST();

  // 일일 템플릿 수
  const [templates] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM checklist_templates
     WHERE tenant_id = ? AND is_active = 1 AND frequency = 'daily'`,
    [tenantId]
  );
  const totalTemplates = (templates as any[])[0]?.cnt || 0;

  // 오늘 인스턴스 상태별 집계
  const [instances] = await conn.execute(
    `SELECT
       SUM(CASE WHEN ci.status IN ('completed', 'approved') THEN 1 ELSE 0 END) as completed,
       SUM(CASE WHEN ci.status = 'in_progress' THEN 1 ELSE 0 END) as inProgress,
       SUM(CASE WHEN ci.status = 'rejected' THEN 1 ELSE 0 END) as rejected
     FROM checklist_instances ci
     WHERE ci.tenant_id = ? AND DATE(ci.created_at) = ?`,
    [tenantId, targetDate]
  );
  const stats = (instances as any[])[0] || {};
  const completed = stats.completed || 0;
  const inProgress = stats.inProgress || 0;
  const rejected = stats.rejected || 0;
  const notStarted = Math.max(0, totalTemplates - completed - inProgress - rejected);

  // 미작성 항목 상세
  const [missing] = await conn.execute(
    `SELECT ct.id as templateId, ct.name as templateName, ct.category,
            COALESCE(ci.status, 'not_started') as status
     FROM checklist_templates ct
     LEFT JOIN checklist_instances ci
       ON ci.template_id = ct.id AND DATE(ci.created_at) = ? AND ci.tenant_id = ?
     WHERE ct.tenant_id = ? AND ct.is_active = 1 AND ct.frequency = 'daily'
       AND (ci.id IS NULL OR ci.status NOT IN ('completed', 'approved'))
     ORDER BY ct.priority DESC`,
    [targetDate, tenantId, tenantId]
  );

  return {
    date: targetDate,
    totalTemplates,
    completed,
    inProgress,
    notStarted,
    rejected,
    completionRate: totalTemplates > 0 ? Math.round((completed / totalTemplates) * 100) : 100,
    missingItems: missing as any[],
  };
}

// ============================================================================
// 4. 이탈/부적합 이력
// ============================================================================

export type DeviationRecord = {
  id: number;
  type: string;       // ccp_deviation, inspection_fail, nonconforming
  source: string;
  description: string;
  severity: string;
  status: string;
  batchCode: string | null;
  ccpType: string | null;
  occurredAt: string;
  resolvedAt: string | null;
};

export async function getDeviationHistory(
  tenantId: number,
  options: { startDate?: string; endDate?: string; limit?: number } = {}
): Promise<DeviationRecord[]> {
  const conn = await getRawConnection();
  const startDate = options.startDate || toKSTDate(new Date(Date.now() - 30 * 86400000));
  const endDate = options.endDate || todayKST();
  const limit = options.limit || 50;

  // CCP 이탈
  const [ccpDevs] = await conn.execute(
    `SELECT d.id, 'ccp_deviation' as type, d.deviation_type as source,
            CONCAT(d.deviation_type, ' 이탈: 기준 ', d.critical_limit, ', 실측 ', d.actual_value) as description,
            d.severity, CASE WHEN d.resolved_at IS NOT NULL THEN 'resolved' ELSE 'open' END as status,
            b.batch_code as batchCode, hci.ccp_type as ccpType,
            d.deviation_date as occurredAt, d.resolved_at as resolvedAt
     FROM h_ccp_deviations d
     LEFT JOIN h_ccp_instances hci ON hci.id = d.ccp_instance_id
     LEFT JOIN h_batches b ON b.id = d.batch_id
     WHERE d.tenant_id = ? AND d.deviation_date BETWEEN ? AND ?
     ORDER BY d.deviation_date DESC LIMIT ?`,
    [tenantId, startDate, endDate, limit]
  );

  // 시정조치 요청
  const [cars] = await conn.execute(
    `SELECT id, 'corrective_action' as type, source_type as source,
            problem_description as description,
            priority as severity, status,
            NULL as batchCode, NULL as ccpType,
            occurred_at as occurredAt,
            action_completed_date as resolvedAt
     FROM h_corrective_action_requests
     WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
     ORDER BY created_at DESC LIMIT ?`,
    [tenantId, startDate, endDate + " 23:59:59", limit]
  );

  // 부적합 제품
  const [ncs] = await conn.execute(
    `SELECT id, 'nonconforming' as type, 'product' as source,
            COALESCE(description, product_name) as description,
            severity, status,
            batch_code as batchCode, NULL as ccpType,
            detected_date as occurredAt, disposition_date as resolvedAt
     FROM h_nonconforming_products
     WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
     ORDER BY created_at DESC LIMIT ?`,
    [tenantId, startDate, endDate + " 23:59:59", limit]
  );

  const all = [...(ccpDevs as any[]), ...(cars as any[]), ...(ncs as any[])];
  all.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  return all.slice(0, limit);
}

// ============================================================================
// 5. 설비 상태 요약
// ============================================================================

export type EquipmentHealthSummary = {
  totalEquipment: number;
  activeCount: number;
  calibrationOverdue: number;
  recentAlerts: number;
  temperatureAbnormal: number;
  equipmentList: Array<{
    id: number;
    code: string;
    name: string;
    type: string;
    status: string;
    lastCalibration: string | null;
    nextCalibration: string | null;
    isOverdue: boolean;
  }>;
};

export async function getEquipmentHealth(tenantId: number): Promise<EquipmentHealthSummary> {
  const conn = await getRawConnection();
  const today = todayKST();

  const [equipments] = await conn.execute(
    `SELECT e.id, e.code, e.name, e.type, e.status,
            cr.calibration_date as lastCalibration,
            cr.next_calibration_date as nextCalibration,
            CASE WHEN cr.next_calibration_date < ? THEN 1 ELSE 0 END as isOverdue
     FROM equipments e
     LEFT JOIN calibration_records cr ON cr.equipment_id = e.id
       AND cr.id = (SELECT MAX(id) FROM calibration_records WHERE equipment_id = e.id AND tenant_id = ?)
     WHERE e.tenant_id = ?
     ORDER BY isOverdue DESC, e.name`,
    [today, tenantId, tenantId]
  );

  const list = equipments as any[];
  const calibrationOverdue = list.filter((e) => e.isOverdue).length;

  // 오늘 온도 이상
  const [tempAlerts] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM h_temperature_logs
     WHERE tenant_id = ? AND DATE(log_time) = ? AND status IN ('warning', 'critical')`,
    [tenantId, today]
  );

  return {
    totalEquipment: list.length,
    activeCount: list.filter((e) => e.status === "active").length,
    calibrationOverdue,
    recentAlerts: 0,
    temperatureAbnormal: (tempAlerts as any[])[0]?.cnt || 0,
    equipmentList: list.map((e) => ({
      id: e.id,
      code: e.code,
      name: e.name,
      type: e.type,
      status: e.status,
      lastCalibration: e.lastCalibration,
      nextCalibration: e.nextCalibration,
      isOverdue: !!e.isOverdue,
    })),
  };
}

// ============================================================================
// 6. 일일 종합 현황 (AI 대시보드 + 챗봇용)
// ============================================================================

export type DailyOverview = {
  date: string;
  production: {
    totalBatches: number;
    completedBatches: number;
    inProgressBatches: number;
    avgYield: number;
    highRiskBatches: number;
  };
  ccp: {
    totalMeasurements: number;
    passCount: number;
    failCount: number;
    deviationRate: number;
  };
  checklist: ChecklistStatus;
  equipment: {
    calibrationOverdue: number;
    temperatureAbnormal: number;
  };
  deviations: {
    newToday: number;
    openTotal: number;
    overdueActions: number;
  };
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  summary: string; // AI가 읽을 한줄 요약
};

export async function getDailyOverview(tenantId: number, date?: string): Promise<DailyOverview> {
  const conn = await getRawConnection();
  const targetDate = date || todayKST();

  // 생산 현황
  const [prodStats] = await conn.execute(
    `SELECT
       COUNT(*) as totalBatches,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedBatches,
       SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as inProgressBatches,
       AVG(CASE WHEN actual_yield IS NOT NULL THEN actual_yield END) as avgYield
     FROM h_batches
     WHERE tenant_id = ? AND DATE(created_at) = ?`,
    [tenantId, targetDate]
  );
  const prod = (prodStats as any[])[0] || {};

  // CCP 현황
  const [ccpStats] = await conn.execute(
    `SELECT
       COUNT(*) as totalMeasurements,
       SUM(CASE WHEN hcr.result = 'PASS' THEN 1 ELSE 0 END) as passCount,
       SUM(CASE WHEN hcr.result = 'FAIL' THEN 1 ELSE 0 END) as failCount
     FROM h_ccp_rows hcr
     JOIN h_ccp_instances hci ON hci.id = hcr.instance_id
     WHERE hci.tenant_id = ? AND hci.work_date = ? AND hcr.row_type = 'measurement'`,
    [tenantId, targetDate]
  );
  const ccp = (ccpStats as any[])[0] || {};

  // 체크리스트 현황
  const checklist = await getChecklistStatus(tenantId, targetDate);

  // 설비 현황
  const equipment = await getEquipmentHealth(tenantId);

  // 이탈/시정조치 현황
  const [devStats] = await conn.execute(
    `SELECT
       (SELECT COUNT(*) FROM h_ccp_deviations WHERE tenant_id = ? AND deviation_date = ?) as newDeviations,
       (SELECT COUNT(*) FROM h_corrective_action_requests WHERE tenant_id = ? AND status NOT IN ('closed', 'verified')) as openTotal,
       (SELECT COUNT(*) FROM h_corrective_action_requests WHERE tenant_id = ? AND status NOT IN ('closed', 'verified') AND action_due_date < ?) as overdueActions`,
    [tenantId, targetDate, tenantId, tenantId, targetDate]
  );
  const devs = (devStats as any[])[0] || {};

  // 배치 리스크
  const batchSummaries = await getBatchSummary(tenantId, { startDate: targetDate, endDate: targetDate });
  const highRiskBatches = batchSummaries.filter((b) => b.riskLevel === "high" || b.riskLevel === "critical").length;

  // 종합 리스크 점수
  const failCount = ccp.failCount || 0;
  const totalRisk =
    failCount * 20 +
    checklist.notStarted * 5 +
    equipment.calibrationOverdue * 10 +
    equipment.temperatureAbnormal * 15 +
    (devs.overdueActions || 0) * 15 +
    highRiskBatches * 10;
  const riskScore = Math.min(totalRisk, 100);
  const riskLevel: DailyOverview["riskLevel"] =
    riskScore >= 60 ? "critical" : riskScore >= 40 ? "high" : riskScore >= 20 ? "medium" : "low";

  // 한줄 요약 (AI가 읽을 데이터)
  const issues: string[] = [];
  if (failCount > 0) issues.push(`CCP이탈 ${failCount}건`);
  if (checklist.notStarted > 0) issues.push(`체크리스트 미작성 ${checklist.notStarted}건`);
  if (equipment.calibrationOverdue > 0) issues.push(`검교정 초과 ${equipment.calibrationOverdue}건`);
  if (equipment.temperatureAbnormal > 0) issues.push(`온도이상 ${equipment.temperatureAbnormal}건`);
  if ((devs.overdueActions || 0) > 0) issues.push(`시정조치 기한초과 ${devs.overdueActions}건`);

  const summary = issues.length > 0
    ? `[${riskLevel.toUpperCase()}] ${issues.join(", ")}`
    : `[LOW] 특이사항 없음. 배치 ${prod.totalBatches || 0}건, 체크리스트 완료율 ${checklist.completionRate}%`;

  return {
    date: targetDate,
    production: {
      totalBatches: prod.totalBatches || 0,
      completedBatches: prod.completedBatches || 0,
      inProgressBatches: prod.inProgressBatches || 0,
      avgYield: Math.round(prod.avgYield || 0),
      highRiskBatches,
    },
    ccp: {
      totalMeasurements: ccp.totalMeasurements || 0,
      passCount: ccp.passCount || 0,
      failCount,
      deviationRate: ccp.totalMeasurements > 0 ? Math.round((failCount / ccp.totalMeasurements) * 100) : 0,
    },
    checklist,
    equipment: {
      calibrationOverdue: equipment.calibrationOverdue,
      temperatureAbnormal: equipment.temperatureAbnormal,
    },
    deviations: {
      newToday: devs.newDeviations || 0,
      openTotal: devs.openTotal || 0,
      overdueActions: devs.overdueActions || 0,
    },
    riskScore,
    riskLevel,
    summary,
  };
}

// ============================================================================
// 7. 생산 분석 (수율 변동 원인 추적)
// ============================================================================

export type ProductionAnalysis = {
  batchId: number;
  batchCode: string;
  productName: string;
  actualYield: number;
  avgYield: number;
  yieldDeviation: number;
  possibleCauses: Array<{
    factor: string;
    detail: string;
    confidence: "high" | "medium" | "low";
  }>;
};

export async function getProductionAnalysis(
  tenantId: number,
  batchId: number
): Promise<ProductionAnalysis | null> {
  const conn = await getRawConnection();

  // 배치 기본 정보
  const [batchRows] = await conn.execute(
    `SELECT b.id, b.batch_code, b.product_id, b.actual_yield, b.actual_quantity,
            b.planned_quantity, b.start_time, b.end_time,
            COALESCE(p.name, '') as productName
     FROM h_batches b
     LEFT JOIN products p ON p.id = b.product_id
     WHERE b.id = ? AND b.tenant_id = ?`,
    [batchId, tenantId]
  );

  const batch = (batchRows as any[])[0];
  if (!batch) return null;

  // 평균 수율
  const [avgRows] = await conn.execute(
    `SELECT AVG(actual_yield) as avgYield, STDDEV(actual_yield) as stdYield
     FROM h_batches
     WHERE tenant_id = ? AND product_id = ? AND status = 'completed'
       AND actual_yield IS NOT NULL AND id != ?`,
    [tenantId, batch.product_id, batchId]
  );
  const avgYield = (avgRows as any[])[0]?.avgYield || 100;
  const yieldDeviation = batch.actual_yield
    ? Math.round(((avgYield - batch.actual_yield) / avgYield) * 100)
    : 0;

  const possibleCauses: ProductionAnalysis["possibleCauses"] = [];

  // 원인 분석 1: CCP 이탈 확인
  const [ccpIssues] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM h_ccp_rows hcr
     JOIN h_ccp_instances hci ON hci.id = hcr.instance_id
     WHERE hci.tenant_id = ? AND hci.batch_id = ? AND hcr.result = 'FAIL'`,
    [tenantId, batchId]
  );
  if ((ccpIssues as any[])[0]?.cnt > 0) {
    possibleCauses.push({
      factor: "CCP 이탈",
      detail: `해당 배치에서 CCP 이탈 ${(ccpIssues as any[])[0].cnt}건 발생`,
      confidence: "high",
    });
  }

  // 원인 분석 2: 투입 원료 변경 확인
  const [materialChanges] = await conn.execute(
    `SELECT bi.material_id, m.name as materialName,
            bi.actual_quantity as usedQty,
            (SELECT AVG(bi2.actual_quantity) FROM h_batch_inputs bi2
             JOIN h_batches b2 ON b2.id = bi2.batch_id
             WHERE bi2.material_id = bi.material_id AND b2.product_id = ? AND b2.tenant_id = ?
               AND b2.id != ? AND bi2.actual_quantity IS NOT NULL) as avgQty
     FROM h_batch_inputs bi
     LEFT JOIN materials m ON m.id = bi.material_id
     WHERE bi.batch_id = ? AND bi.tenant_id = ?
     HAVING avgQty IS NOT NULL AND ABS(usedQty - avgQty) / avgQty > 0.1`,
    [batch.product_id, tenantId, batchId, batchId, tenantId]
  );
  for (const mc of materialChanges as any[]) {
    possibleCauses.push({
      factor: "원료 투입량 변동",
      detail: `${mc.materialName}: 이번 ${mc.usedQty}, 평균 ${Math.round(mc.avgQty)} (${Math.round(Math.abs(mc.usedQty - mc.avgQty) / mc.avgQty * 100)}% 차이)`,
      confidence: "medium",
    });
  }

  // 원인 분석 3: 생산 시간 이상
  if (batch.start_time && batch.end_time) {
    const [timeAvg] = await conn.execute(
      `SELECT AVG(TIMESTAMPDIFF(MINUTE, start_time, end_time)) as avgMinutes
       FROM h_batches
       WHERE tenant_id = ? AND product_id = ? AND status = 'completed'
         AND start_time IS NOT NULL AND end_time IS NOT NULL AND id != ?`,
      [tenantId, batch.product_id, batchId]
    );
    const avgMinutes = (timeAvg as any[])[0]?.avgMinutes;
    if (avgMinutes) {
      const batchMinutes = Math.round(
        (new Date(batch.end_time).getTime() - new Date(batch.start_time).getTime()) / 60000
      );
      if (Math.abs(batchMinutes - avgMinutes) / avgMinutes > 0.2) {
        possibleCauses.push({
          factor: "생산 시간 편차",
          detail: `이번 ${batchMinutes}분 vs 평균 ${Math.round(avgMinutes)}분 (${Math.round(Math.abs(batchMinutes - avgMinutes) / avgMinutes * 100)}% 차이)`,
          confidence: "medium",
        });
      }
    }
  }

  // 원인 분석 4: 설비 이상
  const [equipIssues] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM h_temperature_logs
     WHERE tenant_id = ? AND DATE(log_time) = DATE(?) AND status IN ('warning', 'critical')`,
    [tenantId, batch.start_time || batch.created_at]
  );
  if ((equipIssues as any[])[0]?.cnt > 0) {
    possibleCauses.push({
      factor: "설비 온도 이상",
      detail: `생산일에 온도 이상 ${(equipIssues as any[])[0].cnt}건 기록`,
      confidence: "medium",
    });
  }

  if (possibleCauses.length === 0) {
    possibleCauses.push({
      factor: "명확한 원인 미확인",
      detail: "데이터 상 특이사항이 발견되지 않았습니다. 현장 확인이 필요합니다.",
      confidence: "low",
    });
  }

  return {
    batchId,
    batchCode: batch.batch_code,
    productName: batch.productName,
    actualYield: batch.actual_yield || 0,
    avgYield: Math.round(avgYield),
    yieldDeviation,
    possibleCauses,
  };
}

// ============================================================================
// 8. 감사 대비 상태 점검
// ============================================================================

export type AuditReadiness = {
  overallScore: number; // 0~100
  overallGrade: "excellent" | "good" | "acceptable" | "needs_improvement";
  categories: Array<{
    category: string;
    score: number;
    status: "pass" | "warning" | "fail";
    detail: string;
  }>;
};

export async function getAuditReadiness(tenantId: number, periodDays: number = 90): Promise<AuditReadiness> {
  const conn = await getRawConnection();
  const startDate = toKSTDate(new Date(Date.now() - periodDays * 86400000));
  const today = todayKST();

  const categories: AuditReadiness["categories"] = [];

  // 1. CCP 모니터링 기록 완전성
  const [ccpCompleteness] = await conn.execute(
    `SELECT COUNT(DISTINCT work_date) as recordedDays
     FROM h_ccp_instances WHERE tenant_id = ? AND work_date BETWEEN ? AND ?`,
    [tenantId, startDate, today]
  );
  const ccpDays = (ccpCompleteness as any[])[0]?.recordedDays || 0;
  const expectedDays = Math.ceil(periodDays * 5 / 7); // 주 5일 기준
  const ccpScore = Math.min(100, Math.round((ccpDays / expectedDays) * 100));
  categories.push({
    category: "CCP 모니터링",
    score: ccpScore,
    status: ccpScore >= 90 ? "pass" : ccpScore >= 70 ? "warning" : "fail",
    detail: `${periodDays}일간 ${ccpDays}/${expectedDays}일 기록 (${ccpScore}%)`,
  });

  // 2. 시정조치 해결률
  const [caStats] = await conn.execute(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN status IN ('closed', 'verified') THEN 1 ELSE 0 END) as resolved
     FROM h_corrective_action_requests
     WHERE tenant_id = ? AND created_at >= ?`,
    [tenantId, startDate]
  );
  const caTotal = (caStats as any[])[0]?.total || 0;
  const caResolved = (caStats as any[])[0]?.resolved || 0;
  const caScore = caTotal > 0 ? Math.round((caResolved / caTotal) * 100) : 100;
  categories.push({
    category: "시정조치 관리",
    score: caScore,
    status: caScore >= 90 ? "pass" : caScore >= 70 ? "warning" : "fail",
    detail: `총 ${caTotal}건 중 ${caResolved}건 해결 (${caScore}%)`,
  });

  // 3. 검교정 현황
  const [calStats] = await conn.execute(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN cr.next_calibration_date < ? THEN 1 ELSE 0 END) as overdue
     FROM calibration_equipment ce
     LEFT JOIN calibration_records cr ON cr.equipment_id = ce.id
       AND cr.id = (SELECT MAX(id) FROM calibration_records WHERE equipment_id = ce.id AND tenant_id = ?)
     WHERE ce.tenant_id = ? AND ce.is_active = 1`,
    [today, tenantId, tenantId]
  );
  const calTotal = (calStats as any[])[0]?.total || 0;
  const calOverdue = (calStats as any[])[0]?.overdue || 0;
  const calScore = calTotal > 0 ? Math.round(((calTotal - calOverdue) / calTotal) * 100) : 100;
  categories.push({
    category: "검교정 관리",
    score: calScore,
    status: calScore >= 90 ? "pass" : calScore >= 70 ? "warning" : "fail",
    detail: `총 ${calTotal}대 중 ${calOverdue}대 기한 초과`,
  });

  // 4. 교육훈련 실시 현황
  const [trainStats] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM h_training_schedules
     WHERE tenant_id = ? AND training_date BETWEEN ? AND ?`,
    [tenantId, startDate, today]
  );
  const trainCount = (trainStats as any[])[0]?.cnt || 0;
  const trainScore = trainCount >= 4 ? 100 : trainCount >= 2 ? 70 : trainCount >= 1 ? 40 : 0;
  categories.push({
    category: "교육훈련",
    score: trainScore,
    status: trainScore >= 70 ? "pass" : trainScore >= 40 ? "warning" : "fail",
    detail: `${periodDays}일간 ${trainCount}회 실시`,
  });

  // 5. 위생점검 기록
  const [hygStats] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM hygiene_inspection_records
     WHERE tenant_id = ? AND inspection_date BETWEEN ? AND ?`,
    [tenantId, startDate, today]
  );
  const hygCount = (hygStats as any[])[0]?.cnt || 0;
  const hygScore = Math.min(100, Math.round((hygCount / expectedDays) * 100));
  categories.push({
    category: "위생점검",
    score: hygScore,
    status: hygScore >= 80 ? "pass" : hygScore >= 50 ? "warning" : "fail",
    detail: `${periodDays}일간 ${hygCount}회 실시 (${hygScore}%)`,
  });

  // 종합 점수
  const overallScore = Math.round(categories.reduce((sum, c) => sum + c.score, 0) / categories.length);
  const overallGrade: AuditReadiness["overallGrade"] =
    overallScore >= 90 ? "excellent" : overallScore >= 75 ? "good" : overallScore >= 60 ? "acceptable" : "needs_improvement";

  return { overallScore, overallGrade, categories };
}
