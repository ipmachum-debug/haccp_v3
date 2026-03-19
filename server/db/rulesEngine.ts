/**
 * HACCP AI 규칙엔진 서비스
 *
 * 판단 = 규칙엔진, 설명 = LLM
 *
 * 기능:
 * - 체크리스트 미작성 탐지
 * - CCP 한계기준 이탈 탐지
 * - 검교정 기한 초과 탐지
 * - 배치 수율 이상 탐지
 * - 위생점검 누락 탐지
 * - 반복 이탈 패턴 탐지
 */

import { getRawConnection } from "../db";
import { createNotification } from "./notificationFunctions";
import type { RuleEvaluationResult } from "../../drizzle/schema/aiEngine";

// ============================================================================
// 시스템 기본 규칙 정의 (20+ 규칙)
// ============================================================================
export const SYSTEM_RULES = {
  // === 누락(Missing) 규칙 ===
  CHECKLIST_DAILY_MISSING: {
    code: "CHECKLIST_DAILY_MISSING",
    name: "일일 체크리스트 미작성",
    ruleType: "missing" as const,
    entityType: "checklist" as const,
    severity: "high" as const,
    description: "오늘 작성해야 할 체크리스트 중 미완료 항목이 있습니다.",
  },
  CCP_MONITORING_MISSING: {
    code: "CCP_MONITORING_MISSING",
    name: "CCP 모니터링 기록 누락",
    ruleType: "missing" as const,
    entityType: "ccp" as const,
    severity: "critical" as const,
    description: "CCP 모니터링 기록이 누락되었습니다.",
  },
  HYGIENE_CHECK_MISSING: {
    code: "HYGIENE_CHECK_MISSING",
    name: "위생점검 기록 누락",
    ruleType: "missing" as const,
    entityType: "hygiene" as const,
    severity: "high" as const,
    description: "오늘 위생점검 기록이 작성되지 않았습니다.",
  },
  SHIPPING_INSPECTION_MISSING: {
    code: "SHIPPING_INSPECTION_MISSING",
    name: "출하검사 미실시",
    ruleType: "missing" as const,
    entityType: "inspection" as const,
    severity: "high" as const,
    description: "완료된 배치에 대한 출하검사가 실시되지 않았습니다.",
  },
  MATERIAL_INSPECTION_MISSING: {
    code: "MATERIAL_INSPECTION_MISSING",
    name: "수입검사 미실시",
    ruleType: "missing" as const,
    entityType: "inspection" as const,
    severity: "medium" as const,
    description: "입고된 원재료에 대한 수입검사가 실시되지 않았습니다.",
  },
  BATCH_RECORD_INCOMPLETE: {
    code: "BATCH_RECORD_INCOMPLETE",
    name: "배치 기록 미완료",
    ruleType: "missing" as const,
    entityType: "batch" as const,
    severity: "medium" as const,
    description: "완료된 배치의 필수 기록이 누락되었습니다.",
  },
  CLEANING_LOG_MISSING: {
    code: "CLEANING_LOG_MISSING",
    name: "세척기록 미작성",
    ruleType: "missing" as const,
    entityType: "hygiene" as const,
    severity: "high" as const,
    description: "설비 세척기록이 작성되지 않았습니다.",
  },

  // === 임계값(Threshold) 규칙 ===
  CCP_TEMP_DEVIATION: {
    code: "CCP_TEMP_DEVIATION",
    name: "CCP 온도 기준 이탈",
    ruleType: "threshold" as const,
    entityType: "ccp" as const,
    severity: "critical" as const,
    description: "CCP 모니터링 온도가 한계기준을 벗어났습니다.",
  },
  CCP_TIME_DEVIATION: {
    code: "CCP_TIME_DEVIATION",
    name: "CCP 시간 기준 이탈",
    ruleType: "threshold" as const,
    entityType: "ccp" as const,
    severity: "critical" as const,
    description: "CCP 모니터링 시간이 한계기준을 벗어났습니다.",
  },
  CCP_PRESSURE_DEVIATION: {
    code: "CCP_PRESSURE_DEVIATION",
    name: "CCP 압력 기준 이탈",
    ruleType: "threshold" as const,
    entityType: "ccp" as const,
    severity: "critical" as const,
    description: "CCP 모니터링 압력이 한계기준을 벗어났습니다.",
  },
  METAL_DETECTION_FAIL: {
    code: "METAL_DETECTION_FAIL",
    name: "금속검출 부적합",
    ruleType: "threshold" as const,
    entityType: "ccp" as const,
    severity: "critical" as const,
    description: "금속검출 테스트에서 부적합이 발생했습니다.",
  },
  BATCH_YIELD_DROP: {
    code: "BATCH_YIELD_DROP",
    name: "배치 수율 급락",
    ruleType: "threshold" as const,
    entityType: "batch" as const,
    severity: "high" as const,
    description: "배치 수율이 평균 대비 크게 하락했습니다.",
  },
  TEMPERATURE_LOG_ABNORMAL: {
    code: "TEMPERATURE_LOG_ABNORMAL",
    name: "보관온도 이상",
    ruleType: "threshold" as const,
    entityType: "equipment" as const,
    severity: "high" as const,
    description: "보관장소 온도가 허용범위를 벗어났습니다.",
  },

  // === 기한초과(Overdue) 규칙 ===
  CALIBRATION_OVERDUE: {
    code: "CALIBRATION_OVERDUE",
    name: "검교정 기한 초과",
    ruleType: "overdue" as const,
    entityType: "calibration" as const,
    severity: "high" as const,
    description: "검교정 예정일이 초과된 장비가 있습니다.",
  },
  DOCUMENT_REVIEW_OVERDUE: {
    code: "DOCUMENT_REVIEW_OVERDUE",
    name: "문서 검토 기한 초과",
    ruleType: "overdue" as const,
    entityType: "document" as const,
    severity: "medium" as const,
    description: "정기 검토 기한이 초과된 문서가 있습니다.",
  },
  TRAINING_OVERDUE: {
    code: "TRAINING_OVERDUE",
    name: "교육훈련 기한 초과",
    ruleType: "overdue" as const,
    entityType: "training" as const,
    severity: "medium" as const,
    description: "교육훈련 실시 기한이 초과되었습니다.",
  },
  CORRECTIVE_ACTION_OVERDUE: {
    code: "CORRECTIVE_ACTION_OVERDUE",
    name: "시정조치 기한 초과",
    ruleType: "overdue" as const,
    entityType: "ccp" as const,
    severity: "critical" as const,
    description: "시정조치 완료 기한이 초과되었습니다.",
  },
  LOT_EXPIRY_WARNING: {
    code: "LOT_EXPIRY_WARNING",
    name: "LOT 소비기한 임박",
    ruleType: "overdue" as const,
    entityType: "lot" as const,
    severity: "high" as const,
    description: "소비기한이 7일 이내인 LOT가 있습니다.",
  },

  // === 이상패턴(Anomaly) 규칙 ===
  BATCH_YIELD_ANOMALY: {
    code: "BATCH_YIELD_ANOMALY",
    name: "배치 수율 이상 패턴",
    ruleType: "anomaly" as const,
    entityType: "batch" as const,
    severity: "medium" as const,
    description: "최근 배치 수율에 비정상적인 변동이 감지되었습니다.",
  },

  // === 반복(Recurrence) 규칙 ===
  REPEATED_CCP_DEVIATION: {
    code: "REPEATED_CCP_DEVIATION",
    name: "CCP 이탈 반복 발생",
    ruleType: "recurrence" as const,
    entityType: "ccp" as const,
    severity: "critical" as const,
    description: "동일 CCP에서 7일 내 반복적인 이탈이 발생했습니다.",
  },
  REPEATED_EQUIPMENT_ISSUE: {
    code: "REPEATED_EQUIPMENT_ISSUE",
    name: "동일 설비 반복 이상",
    ruleType: "recurrence" as const,
    entityType: "equipment" as const,
    severity: "high" as const,
    description: "동일 설비에서 반복적으로 이상이 발생하고 있습니다.",
  },
  REPEATED_NONCONFORMITY: {
    code: "REPEATED_NONCONFORMITY",
    name: "부적합 반복 발생",
    ruleType: "recurrence" as const,
    entityType: "inspection" as const,
    severity: "high" as const,
    description: "동일 유형의 부적합이 반복 발생하고 있습니다.",
  },
};

// ============================================================================
// 규칙 평가 함수들
// ============================================================================

/**
 * 전체 규칙 평가 실행 (오늘 기준)
 */
export async function evaluateAllRules(tenantId: number, targetDate?: string): Promise<RuleEvaluationResult[]> {
  const date = targetDate || new Date().toISOString().split("T")[0];
  const results: RuleEvaluationResult[] = [];

  // 병렬 실행 (독립적인 규칙들)
  const [
    checklistMissing,
    ccpMonitoringMissing,
    ccpDeviations,
    calibrationOverdue,
    hygieneCheckMissing,
    shippingInspectionMissing,
    batchYieldDrop,
    correctiveActionOverdue,
    lotExpiryWarning,
    repeatedCcpDeviation,
    metalDetectionFail,
    temperatureAbnormal,
    cleaningLogMissing,
  ] = await Promise.all([
    detectChecklistMissing(tenantId, date),
    detectCcpMonitoringMissing(tenantId, date),
    detectCcpDeviations(tenantId, date),
    detectCalibrationOverdue(tenantId, date),
    detectHygieneCheckMissing(tenantId, date),
    detectShippingInspectionMissing(tenantId, date),
    detectBatchYieldDrop(tenantId, date),
    detectCorrectiveActionOverdue(tenantId, date),
    detectLotExpiryWarning(tenantId, date),
    detectRepeatedCcpDeviation(tenantId, date),
    detectMetalDetectionFail(tenantId, date),
    detectTemperatureAbnormal(tenantId, date),
    detectCleaningLogMissing(tenantId, date),
  ]);

  results.push(
    ...checklistMissing,
    ...ccpMonitoringMissing,
    ...ccpDeviations,
    ...calibrationOverdue,
    ...hygieneCheckMissing,
    ...shippingInspectionMissing,
    ...batchYieldDrop,
    ...correctiveActionOverdue,
    ...lotExpiryWarning,
    ...repeatedCcpDeviation,
    ...metalDetectionFail,
    ...temperatureAbnormal,
    ...cleaningLogMissing,
  );

  // === 커스텀 규칙 평가 (P9-1) ===
  const customResults = await evaluateCustomRules(tenantId, date);
  results.push(...customResults);

  return results;
}

// ============================================================================
// P9-1: 커스텀 규칙 JSON 인터프리터
// ============================================================================

/**
 * 테넌트별 커스텀 규칙을 DB에서 조회하여 동적으로 평가
 * conditions JSON 형식:
 * {
 *   "field": "temperature" | "humidity" | "yield" | "checklist_rate" | "ccp_fail_count",
 *   "operator": ">" | "<" | ">=" | "<=" | "==" | "!=",
 *   "value": number,
 *   "table": "h_temperature_logs" | "h_batches" | "checklist_instances" | "h_ccp_rows",
 *   "timeRange": "today" | "7days" | "30days"
 * }
 */
async function evaluateCustomRules(tenantId: number, date: string): Promise<RuleEvaluationResult[]> {
  const conn = await getRawConnection();
  const results: RuleEvaluationResult[] = [];

  try {
    const [rules] = await conn.execute(
      `SELECT id, code, name, description, rule_type, entity_type, conditions, severity
       FROM ai_rules
       WHERE tenant_id = ? AND is_active = 1 AND is_system = 0`,
      [tenantId]
    );

    for (const rule of rules as any[]) {
      try {
        let conditions: any;
        try {
          conditions = typeof rule.conditions === "string" ? JSON.parse(rule.conditions) : rule.conditions;
        } catch { continue; }

        if (!conditions || !conditions.field) continue;

        const triggered = await evaluateCustomCondition(tenantId, date, conditions);

        if (triggered.isTriggered) {
          results.push({
            ruleCode: rule.code,
            triggered: true,
            severity: rule.severity,
            title: rule.name,
            message: triggered.message || rule.description || `커스텀 규칙 [${rule.name}] 트리거`,
            entityType: rule.entity_type || "custom",
            entityId: triggered.entityId,
            entityCode: triggered.entityCode,
            contextData: { customRuleId: rule.id, conditions, actualValue: triggered.actualValue },
          });
        }
      } catch {
        // 개별 규칙 실패 시 계속
      }
    }
  } catch {
    // 커스텀 규칙 조회 실패 시 무시
  }

  return results;
}

async function evaluateCustomCondition(
  tenantId: number,
  date: string,
  conditions: any
): Promise<{ isTriggered: boolean; message?: string; entityId?: number; entityCode?: string; actualValue?: number }> {
  const conn = await getRawConnection();
  const { field, operator, value, timeRange } = conditions;

  if (!field || !operator || value === undefined) {
    return { isTriggered: false };
  }

  // 시간 범위 결정
  let startDate = date;
  if (timeRange === "7days") {
    startDate = new Date(new Date(date).getTime() - 7 * 86400000).toISOString().split("T")[0];
  } else if (timeRange === "30days") {
    startDate = new Date(new Date(date).getTime() - 30 * 86400000).toISOString().split("T")[0];
  }

  let actualValue: number | null = null;
  let entityInfo = { entityId: undefined as number | undefined, entityCode: undefined as string | undefined };

  switch (field) {
    case "temperature": {
      const [rows] = await conn.execute(
        `SELECT id, location, temperature FROM h_temperature_logs
         WHERE tenant_id = ? AND DATE(log_time) BETWEEN ? AND ?
           AND status IN ('warning', 'critical')
         ORDER BY log_time DESC LIMIT 1`,
        [tenantId, startDate, date]
      );
      const row = (rows as any[])[0];
      if (row) { actualValue = Number(row.temperature); entityInfo.entityCode = row.location; }
      break;
    }
    case "humidity": {
      const [rows] = await conn.execute(
        `SELECT id, location, humidity FROM h_temperature_logs
         WHERE tenant_id = ? AND DATE(log_time) BETWEEN ? AND ? AND humidity IS NOT NULL
         ORDER BY humidity DESC LIMIT 1`,
        [tenantId, startDate, date]
      );
      const row = (rows as any[])[0];
      if (row) { actualValue = Number(row.humidity); entityInfo.entityCode = row.location; }
      break;
    }
    case "yield": {
      const [rows] = await conn.execute(
        `SELECT id, batch_code, actual_yield FROM h_batches
         WHERE tenant_id = ? AND status = 'completed' AND actual_yield IS NOT NULL
           AND DATE(completed_at) BETWEEN ? AND ?
         ORDER BY actual_yield ASC LIMIT 1`,
        [tenantId, startDate, date]
      );
      const row = (rows as any[])[0];
      if (row) { actualValue = Number(row.actual_yield); entityInfo.entityId = row.id; entityInfo.entityCode = row.batch_code; }
      break;
    }
    case "checklist_rate": {
      const [rows] = await conn.execute(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status IN ('completed', 'approved') THEN 1 ELSE 0 END) as completed
         FROM checklist_instances
         WHERE tenant_id = ? AND DATE(created_at) = ?`,
        [tenantId, date]
      );
      const row = (rows as any[])[0];
      if (row && Number(row.total) > 0) { actualValue = (Number(row.completed) / Number(row.total)) * 100; }
      break;
    }
    case "ccp_fail_count": {
      const [rows] = await conn.execute(
        `SELECT COUNT(*) as cnt FROM h_ccp_rows hcr
         JOIN h_ccp_instances hci ON hci.id = hcr.instance_id
         WHERE hci.tenant_id = ? AND hcr.result = 'FAIL'
           AND hci.work_date BETWEEN ? AND ?`,
        [tenantId, startDate, date]
      );
      actualValue = Number((rows as any[])[0]?.cnt || 0);
      break;
    }
    default:
      return { isTriggered: false };
  }

  if (actualValue === null) return { isTriggered: false };

  // 연산자 비교
  let isTriggered = false;
  switch (operator) {
    case ">": isTriggered = actualValue > value; break;
    case "<": isTriggered = actualValue < value; break;
    case ">=": isTriggered = actualValue >= value; break;
    case "<=": isTriggered = actualValue <= value; break;
    case "==": isTriggered = actualValue === value; break;
    case "!=": isTriggered = actualValue !== value; break;
  }

  const fieldLabels: Record<string, string> = {
    temperature: "온도", humidity: "습도", yield: "수율",
    checklist_rate: "체크리스트 완료율", ccp_fail_count: "CCP 이탈 건수",
  };

  return {
    isTriggered,
    message: isTriggered
      ? `${fieldLabels[field] || field}: ${actualValue} (기준: ${operator} ${value})`
      : undefined,
    ...entityInfo,
    actualValue,
  };
}

// ============================================================================
// 개별 규칙 탐지 함수들
// ============================================================================

/**
 * 체크리스트 미작성 탐지
 * - 오늘 날짜에 스케줄된 체크리스트 중 미완료 항목
 */
async function detectChecklistMissing(tenantId: number, date: string): Promise<RuleEvaluationResult[]> {
  const conn = await getRawConnection();
  const rule = SYSTEM_RULES.CHECKLIST_DAILY_MISSING;

  try {
    // 활성 템플릿 중 오늘 인스턴스가 없거나 미완료인 것
    const [rows] = await conn.execute(
      `SELECT ct.id, ct.name, ct.category, ct.frequency,
              ci.id as instance_id, ci.status as instance_status
       FROM checklist_templates ct
       LEFT JOIN checklist_instances ci
         ON ci.template_id = ct.id
         AND DATE(ci.created_at) = ?
         AND ci.tenant_id = ?
       WHERE ct.tenant_id = ?
         AND ct.is_active = 1
         AND ct.frequency = 'daily'
         AND (ci.id IS NULL OR ci.status NOT IN ('completed', 'approved'))
       ORDER BY ct.priority DESC`,
      [date, tenantId, tenantId]
    );

    return (rows as any[]).map((row) => ({
      ruleId: 0,
      ruleCode: rule.code,
      triggered: true,
      severity: rule.severity,
      title: `[${rule.name}] ${row.name}`,
      message: row.instance_id
        ? `체크리스트 "${row.name}"이(가) 작성 중이지만 아직 완료되지 않았습니다. (상태: ${row.instance_status})`
        : `오늘(${date}) 체크리스트 "${row.name}"이(가) 아직 작성되지 않았습니다.`,
      entityType: "checklist",
      entityId: row.id,
      entityCode: row.name,
      contextData: {
        templateId: row.id,
        category: row.category,
        instanceStatus: row.instance_status || "not_started",
        referenceDate: date,
      },
    }));
  } catch {
    return [];
  }
}

/**
 * CCP 모니터링 기록 누락 탐지
 */
async function detectCcpMonitoringMissing(tenantId: number, date: string): Promise<RuleEvaluationResult[]> {
  const conn = await getRawConnection();
  const rule = SYSTEM_RULES.CCP_MONITORING_MISSING;

  try {
    // CCP 프로세스 그룹이 있는데 오늘 인스턴스가 없는 경우
    const [rows] = await conn.execute(
      `SELECT cpg.id, cpg.name, cpg.ccp_type,
              hci.id as instance_id
       FROM ccp_process_groups cpg
       LEFT JOIN h_ccp_instances hci
         ON hci.process_group_id = cpg.id
         AND hci.work_date = ?
         AND hci.tenant_id = ?
       WHERE cpg.tenant_id = ?
         AND cpg.is_active = 1
         AND hci.id IS NULL`,
      [date, tenantId, tenantId]
    );

    return (rows as any[]).map((row) => ({
      ruleId: 0,
      ruleCode: rule.code,
      triggered: true,
      severity: rule.severity,
      title: `[${rule.name}] ${row.ccp_type} - ${row.name}`,
      message: `오늘(${date}) ${row.ccp_type} "${row.name}" 모니터링 기록이 작성되지 않았습니다.`,
      entityType: "ccp",
      entityId: row.id,
      entityCode: `${row.ccp_type}-${row.name}`,
      contextData: {
        processGroupId: row.id,
        ccpType: row.ccp_type,
        referenceDate: date,
      },
    }));
  } catch {
    return [];
  }
}

/**
 * CCP 한계기준 이탈 탐지 (오늘 기록 중 FAIL)
 */
async function detectCcpDeviations(tenantId: number, date: string): Promise<RuleEvaluationResult[]> {
  const conn = await getRawConnection();
  const rule = SYSTEM_RULES.CCP_TEMP_DEVIATION;

  try {
    const [rows] = await conn.execute(
      `SELECT hcr.id, hci.ccp_type, hci.work_date,
              hcr.temp_c, hcr.duration_min, hcr.pressure_bar,
              hcr.result, hcr.measured_at,
              cpg.name as group_name
       FROM h_ccp_rows hcr
       JOIN h_ccp_instances hci ON hci.id = hcr.instance_id
       LEFT JOIN ccp_process_groups cpg ON cpg.id = hci.process_group_id
       WHERE hci.tenant_id = ?
         AND hci.work_date = ?
         AND hcr.result = 'FAIL'
         AND hcr.row_type = 'measurement'`,
      [tenantId, date]
    );

    return (rows as any[]).map((row) => ({
      ruleId: 0,
      ruleCode: rule.code,
      triggered: true,
      severity: "critical" as const,
      title: `[CCP 기준 이탈] ${row.ccp_type} - ${row.group_name || ""}`,
      message: `${row.ccp_type} 모니터링에서 기준 이탈이 발생했습니다. `
        + (row.temp_c ? `온도: ${row.temp_c}°C` : "")
        + (row.duration_min ? ` 시간: ${row.duration_min}분` : "")
        + (row.pressure_bar ? ` 압력: ${row.pressure_bar}bar` : ""),
      entityType: "ccp",
      entityId: row.id,
      entityCode: row.ccp_type,
      contextData: {
        temperature: row.temp_c,
        duration: row.duration_min,
        pressure: row.pressure_bar,
        measuredAt: row.measured_at,
        referenceDate: date,
      },
    }));
  } catch {
    return [];
  }
}

/**
 * 검교정 기한 초과 탐지
 */
async function detectCalibrationOverdue(tenantId: number, date: string): Promise<RuleEvaluationResult[]> {
  const conn = await getRawConnection();
  const rule = SYSTEM_RULES.CALIBRATION_OVERDUE;

  try {
    const [rows] = await conn.execute(
      `SELECT ce.id, ce.code, ce.name, ce.equipment_type,
              cr.next_calibration_date, cr.calibration_date as last_calibration
       FROM calibration_equipment ce
       LEFT JOIN calibration_records cr ON cr.equipment_id = ce.id
         AND cr.id = (
           SELECT MAX(cr2.id) FROM calibration_records cr2
           WHERE cr2.equipment_id = ce.id AND cr2.tenant_id = ?
         )
       WHERE ce.tenant_id = ?
         AND ce.is_active = 1
         AND cr.next_calibration_date IS NOT NULL
         AND cr.next_calibration_date < ?`,
      [tenantId, tenantId, date]
    );

    return (rows as any[]).map((row) => ({
      ruleId: 0,
      ruleCode: rule.code,
      triggered: true,
      severity: rule.severity,
      title: `[${rule.name}] ${row.name} (${row.code})`,
      message: `${row.equipment_type} "${row.name}"의 검교정 예정일(${row.next_calibration_date})이 초과되었습니다. 마지막 검교정: ${row.last_calibration || "기록없음"}`,
      entityType: "calibration",
      entityId: row.id,
      entityCode: row.code,
      contextData: {
        equipmentType: row.equipment_type,
        nextCalibrationDate: row.next_calibration_date,
        lastCalibration: row.last_calibration,
        referenceDate: date,
      },
    }));
  } catch {
    return [];
  }
}

/**
 * 위생점검 누락 탐지
 */
async function detectHygieneCheckMissing(tenantId: number, date: string): Promise<RuleEvaluationResult[]> {
  const conn = await getRawConnection();
  const rule = SYSTEM_RULES.HYGIENE_CHECK_MISSING;

  try {
    const [rows] = await conn.execute(
      `SELECT COUNT(*) as cnt
       FROM hygiene_inspection_records
       WHERE tenant_id = ? AND inspection_date = ?`,
      [tenantId, date]
    );

    const count = (rows as any[])[0]?.cnt || 0;
    if (count === 0) {
      return [{
        ruleId: 0,
        ruleCode: rule.code,
        triggered: true,
        severity: rule.severity,
        title: `[${rule.name}]`,
        message: `오늘(${date}) 위생점검 기록이 작성되지 않았습니다. 작업 시작 전 위생점검을 실시해주세요.`,
        entityType: "hygiene",
        entityCode: "daily_hygiene",
        contextData: { referenceDate: date },
      }];
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * 출하검사 미실시 탐지
 */
async function detectShippingInspectionMissing(tenantId: number, date: string): Promise<RuleEvaluationResult[]> {
  const conn = await getRawConnection();
  const rule = SYSTEM_RULES.SHIPPING_INSPECTION_MISSING;

  try {
    // 완료된 배치 중 출하검사가 없는 것
    const [rows] = await conn.execute(
      `SELECT b.id, b.batch_code, b.product_id
       FROM h_batches b
       LEFT JOIN shipping_inspection_records sir
         ON sir.batch_id = b.id AND sir.tenant_id = ?
       WHERE b.tenant_id = ?
         AND b.status = 'completed'
         AND DATE(b.completed_at) = ?
         AND sir.id IS NULL`,
      [tenantId, tenantId, date]
    );

    return (rows as any[]).map((row) => ({
      ruleId: 0,
      ruleCode: rule.code,
      triggered: true,
      severity: rule.severity,
      title: `[${rule.name}] 배치 ${row.batch_code}`,
      message: `완료된 배치 "${row.batch_code}"에 대한 출하검사가 실시되지 않았습니다.`,
      entityType: "inspection",
      entityId: row.id,
      entityCode: row.batch_code,
      contextData: { batchId: row.id, batchCode: row.batch_code, referenceDate: date },
    }));
  } catch {
    return [];
  }
}

/**
 * 배치 수율 급락 탐지 (평균 대비 15% 이상 하락)
 */
async function detectBatchYieldDrop(tenantId: number, date: string): Promise<RuleEvaluationResult[]> {
  const conn = await getRawConnection();
  const rule = SYSTEM_RULES.BATCH_YIELD_DROP;

  try {
    const [rows] = await conn.execute(
      `SELECT b.id, b.batch_code, b.product_id, b.actual_yield,
              (SELECT AVG(b2.actual_yield)
               FROM h_batches b2
               WHERE b2.tenant_id = ? AND b2.product_id = b.product_id
                 AND b2.status = 'completed' AND b2.actual_yield IS NOT NULL
                 AND b2.id != b.id
               ) as avg_yield
       FROM h_batches b
       WHERE b.tenant_id = ?
         AND DATE(b.completed_at) = ?
         AND b.status = 'completed'
         AND b.actual_yield IS NOT NULL
       HAVING avg_yield IS NOT NULL AND b.actual_yield < avg_yield * 0.85`,
      [tenantId, tenantId, date]
    );

    return (rows as any[]).map((row) => ({
      ruleId: 0,
      ruleCode: rule.code,
      triggered: true,
      severity: rule.severity,
      title: `[${rule.name}] 배치 ${row.batch_code}`,
      message: `배치 "${row.batch_code}"의 수율(${row.actual_yield}%)이 평균(${Math.round(row.avg_yield)}%) 대비 크게 하락했습니다.`,
      entityType: "batch",
      entityId: row.id,
      entityCode: row.batch_code,
      contextData: {
        actualYield: row.actual_yield,
        avgYield: row.avg_yield,
        dropPercent: Math.round((1 - row.actual_yield / row.avg_yield) * 100),
        referenceDate: date,
      },
    }));
  } catch {
    return [];
  }
}

/**
 * 시정조치 기한 초과 탐지
 */
async function detectCorrectiveActionOverdue(tenantId: number, date: string): Promise<RuleEvaluationResult[]> {
  const conn = await getRawConnection();
  const rule = SYSTEM_RULES.CORRECTIVE_ACTION_OVERDUE;

  try {
    const [rows] = await conn.execute(
      `SELECT id, request_number, problem_description, action_due_date, status, priority
       FROM h_corrective_action_requests
       WHERE tenant_id = ?
         AND status NOT IN ('closed', 'verified')
         AND action_due_date IS NOT NULL
         AND action_due_date < ?`,
      [tenantId, date]
    );

    return (rows as any[]).map((row) => ({
      ruleId: 0,
      ruleCode: rule.code,
      triggered: true,
      severity: row.priority === "critical" ? "critical" as const : rule.severity,
      title: `[${rule.name}] ${row.request_number}`,
      message: `시정조치 "${row.request_number}"의 완료기한(${row.action_due_date})이 초과되었습니다. 현재 상태: ${row.status}`,
      entityType: "ccp",
      entityId: row.id,
      entityCode: row.request_number,
      contextData: {
        problemDescription: row.problem_description,
        dueDate: row.action_due_date,
        status: row.status,
        priority: row.priority,
        referenceDate: date,
      },
    }));
  } catch {
    return [];
  }
}

/**
 * LOT 소비기한 임박 경고 (7일 이내)
 */
async function detectLotExpiryWarning(tenantId: number, date: string): Promise<RuleEvaluationResult[]> {
  const conn = await getRawConnection();
  const rule = SYSTEM_RULES.LOT_EXPIRY_WARNING;

  try {
    const [rows] = await conn.execute(
      `SELECT il.id, il.lot_number, il.expiry_date, il.quantity, il.material_id,
              DATEDIFF(il.expiry_date, ?) as days_remaining
       FROM h_inventory_lots il
       WHERE il.tenant_id = ?
         AND il.quantity > 0
         AND il.expiry_date IS NOT NULL
         AND il.expiry_date BETWEEN ? AND DATE_ADD(?, INTERVAL 7 DAY)`,
      [date, tenantId, date, date]
    );

    return (rows as any[]).map((row) => ({
      ruleId: 0,
      ruleCode: rule.code,
      triggered: true,
      severity: row.days_remaining <= 2 ? "critical" as const : rule.severity,
      title: `[${rule.name}] LOT ${row.lot_number}`,
      message: `LOT "${row.lot_number}"의 소비기한이 ${row.days_remaining}일 남았습니다. (만료: ${row.expiry_date}, 잔량: ${row.quantity})`,
      entityType: "lot",
      entityId: row.id,
      entityCode: row.lot_number,
      contextData: {
        lotNumber: row.lot_number,
        expiryDate: row.expiry_date,
        daysRemaining: row.days_remaining,
        quantity: row.quantity,
        referenceDate: date,
      },
    }));
  } catch {
    return [];
  }
}

/**
 * CCP 이탈 반복 발생 탐지 (7일 내 동일 CCP에서 3회 이상)
 */
async function detectRepeatedCcpDeviation(tenantId: number, date: string): Promise<RuleEvaluationResult[]> {
  const conn = await getRawConnection();
  const rule = SYSTEM_RULES.REPEATED_CCP_DEVIATION;

  try {
    const [rows] = await conn.execute(
      `SELECT hci.ccp_type, cpg.name as group_name, cpg.id as group_id,
              COUNT(*) as deviation_count,
              MIN(hci.work_date) as first_date,
              MAX(hci.work_date) as last_date
       FROM h_ccp_rows hcr
       JOIN h_ccp_instances hci ON hci.id = hcr.instance_id
       LEFT JOIN ccp_process_groups cpg ON cpg.id = hci.process_group_id
       WHERE hci.tenant_id = ?
         AND hcr.result = 'FAIL'
         AND hci.work_date BETWEEN DATE_SUB(?, INTERVAL 7 DAY) AND ?
       GROUP BY hci.ccp_type, cpg.id, cpg.name
       HAVING deviation_count >= 3`,
      [tenantId, date, date]
    );

    return (rows as any[]).map((row) => ({
      ruleId: 0,
      ruleCode: rule.code,
      triggered: true,
      severity: rule.severity,
      title: `[${rule.name}] ${row.ccp_type} - ${row.group_name || ""}`,
      message: `${row.ccp_type} "${row.group_name || ""}"에서 최근 7일간 ${row.deviation_count}회 이탈이 반복 발생했습니다. (${row.first_date} ~ ${row.last_date})`,
      entityType: "ccp",
      entityId: row.group_id,
      entityCode: row.ccp_type,
      contextData: {
        ccpType: row.ccp_type,
        deviationCount: row.deviation_count,
        firstDate: row.first_date,
        lastDate: row.last_date,
        referenceDate: date,
      },
    }));
  } catch {
    return [];
  }
}

/**
 * 금속검출 부적합 탐지
 */
async function detectMetalDetectionFail(tenantId: number, date: string): Promise<RuleEvaluationResult[]> {
  const conn = await getRawConnection();
  const rule = SYSTEM_RULES.METAL_DETECTION_FAIL;

  try {
    const [rows] = await conn.execute(
      `SELECT id, product_category, metal_type, size_mm, detection_rate, test_date
       FROM metal_detection_tests
       WHERE tenant_id = ?
         AND test_date = ?
         AND detection_rate < 100`,
      [tenantId, date]
    );

    return (rows as any[]).map((row) => ({
      ruleId: 0,
      ruleCode: rule.code,
      triggered: true,
      severity: rule.severity,
      title: `[${rule.name}] ${row.metal_type} ${row.size_mm}mm`,
      message: `금속검출 테스트에서 검출률 ${row.detection_rate}%로 부적합이 발생했습니다. (${row.metal_type} ${row.size_mm}mm, 품목: ${row.product_category})`,
      entityType: "ccp",
      entityId: row.id,
      entityCode: `METAL-${row.metal_type}`,
      contextData: {
        metalType: row.metal_type,
        sizeMm: row.size_mm,
        detectionRate: row.detection_rate,
        productCategory: row.product_category,
        referenceDate: date,
      },
    }));
  } catch {
    return [];
  }
}

/**
 * 보관온도 이상 탐지
 */
async function detectTemperatureAbnormal(tenantId: number, date: string): Promise<RuleEvaluationResult[]> {
  const conn = await getRawConnection();
  const rule = SYSTEM_RULES.TEMPERATURE_LOG_ABNORMAL;

  try {
    const [rows] = await conn.execute(
      `SELECT id, location, equipment_id, temperature, log_time, status
       FROM h_temperature_logs
       WHERE tenant_id = ?
         AND DATE(log_time) = ?
         AND status IN ('warning', 'critical')`,
      [tenantId, date]
    );

    return (rows as any[]).map((row) => ({
      ruleId: 0,
      ruleCode: rule.code,
      triggered: true,
      severity: row.status === "critical" ? "critical" as const : "high" as const,
      title: `[${rule.name}] ${row.location}`,
      message: `${row.location}의 보관온도가 ${row.temperature}°C로 ${row.status === "critical" ? "위험" : "경고"} 수준입니다.`,
      entityType: "equipment",
      entityId: row.id,
      entityCode: row.location,
      contextData: {
        temperature: row.temperature,
        location: row.location,
        logTime: row.log_time,
        status: row.status,
        referenceDate: date,
      },
    }));
  } catch {
    return [];
  }
}

/**
 * 세척기록 미작성 탐지
 */
async function detectCleaningLogMissing(tenantId: number, date: string): Promise<RuleEvaluationResult[]> {
  const conn = await getRawConnection();
  const rule = SYSTEM_RULES.CLEANING_LOG_MISSING;

  try {
    // 활성 설비 중 오늘 세척기록이 없는 것
    const [rows] = await conn.execute(
      `SELECT e.id, e.code, e.name, e.type
       FROM equipments e
       LEFT JOIN h_equipment_cleaning_logs ecl
         ON ecl.equipment_id = e.id
         AND DATE(ecl.cleaning_date) = ?
         AND ecl.tenant_id = ?
       WHERE e.tenant_id = ?
         AND e.status = 'active'
         AND ecl.id IS NULL`,
      [date, tenantId, tenantId]
    );

    if (rows && (rows as any[]).length > 0) {
      return [{
        ruleId: 0,
        ruleCode: rule.code,
        triggered: true,
        severity: rule.severity,
        title: `[${rule.name}] ${(rows as any[]).length}건`,
        message: `오늘(${date}) 세척기록이 작성되지 않은 설비가 ${(rows as any[]).length}대 있습니다: ${(rows as any[]).slice(0, 5).map((r: any) => r.name).join(", ")}${(rows as any[]).length > 5 ? " 외" : ""}`,
        entityType: "hygiene",
        entityCode: "cleaning_log",
        contextData: {
          missingCount: (rows as any[]).length,
          equipmentNames: (rows as any[]).slice(0, 10).map((r: any) => ({ id: r.id, name: r.name, code: r.code })),
          referenceDate: date,
        },
      }];
    }
    return [];
  } catch {
    return [];
  }
}

// ============================================================================
// 알림 저장/관리
// ============================================================================

/**
 * 규칙 평가 결과를 ai_alerts 테이블에 저장
 */
export async function saveAlerts(tenantId: number, results: RuleEvaluationResult[]): Promise<number> {
  if (results.length === 0) return 0;
  const conn = await getRawConnection();

  let savedCount = 0;
  for (const result of results) {
    try {
      // 중복 체크: 같은 날짜 + 같은 규칙 + 같은 엔티티
      const [existing] = await conn.execute(
        `SELECT id FROM ai_alerts
         WHERE tenant_id = ? AND rule_code = ? AND entity_type = ?
           AND COALESCE(entity_id, 0) = COALESCE(?, 0)
           AND DATE(created_at) = CURDATE()
           AND status = 'active'
         LIMIT 1`,
        [tenantId, result.ruleCode, result.entityType, result.entityId || null]
      );

      if ((existing as any[]).length > 0) continue; // 이미 있으면 스킵

      await conn.execute(
        `INSERT INTO ai_alerts
         (tenant_id, rule_code, title, message, severity, entity_type, entity_id, entity_code, context_data, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW())`,
        [
          tenantId,
          result.ruleCode,
          result.title,
          result.message,
          result.severity,
          result.entityType,
          result.entityId || null,
          result.entityCode || null,
          JSON.stringify(result.contextData || {}),
        ]
      );
      savedCount++;

      // high/critical 알림은 h_notifications에도 연동
      if (result.severity === "critical" || result.severity === "high") {
        try {
          const priorityMap: Record<string, "urgent" | "high" | "medium" | "low"> = {
            critical: "urgent",
            high: "high",
          };
          await createNotification({
            tenantId,
            notificationType: "ai_alert",
            title: `[AI] ${result.title}`,
            message: result.message,
            referenceType: result.entityType,
            referenceId: result.entityId,
            priority: priorityMap[result.severity] || "medium",
            actionUrl: "/dashboard/ai-assistant",
          });
        } catch {
          // 알림 연동 실패 시 무시 (ai_alerts에는 이미 저장됨)
        }
      }
    } catch {
      // 개별 저장 실패 시 계속 진행
    }
  }

  return savedCount;
}

/**
 * AI 대시보드 요약 조회
 */
export async function getAIDashboardSummary(tenantId: number, date?: string) {
  const conn = await getRawConnection();
  const targetDate = date || new Date().toISOString().split("T")[0];

  // 활성 알림 집계
  const [alertCounts] = await conn.execute(
    `SELECT severity, COUNT(*) as cnt
     FROM ai_alerts
     WHERE tenant_id = ? AND status = 'active'
     GROUP BY severity`,
    [tenantId]
  );

  const alerts = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
  for (const row of alertCounts as any[]) {
    alerts[row.severity as keyof typeof alerts] = row.cnt;
    alerts.total += row.cnt;
  }

  // 최근 알림 10건
  const [recentAlerts] = await conn.execute(
    `SELECT id, title, severity, entity_type, entity_code, created_at, status
     FROM ai_alerts
     WHERE tenant_id = ? AND status = 'active'
     ORDER BY
       FIELD(severity, 'critical', 'high', 'medium', 'low'),
       created_at DESC
     LIMIT 10`,
    [tenantId]
  );

  // 오늘 배치 리스크 요약
  const [batchRisk] = await conn.execute(
    `SELECT risk_level, COUNT(*) as cnt
     FROM ai_batch_summaries
     WHERE tenant_id = ? AND DATE(summary_date) = ?
     GROUP BY risk_level`,
    [tenantId, targetDate]
  );

  const batchRiskSummary = { high: 0, medium: 0, low: 0 };
  for (const row of batchRisk as any[]) {
    if (row.risk_level === "critical" || row.risk_level === "high") batchRiskSummary.high += row.cnt;
    else if (row.risk_level === "medium") batchRiskSummary.medium = row.cnt;
    else batchRiskSummary.low = row.cnt;
  }

  return {
    date: targetDate,
    activeAlerts: alerts,
    recentAlerts: (recentAlerts as any[]).map((r) => ({
      id: r.id,
      title: r.title,
      severity: r.severity,
      entityType: r.entity_type,
      entityCode: r.entity_code,
      createdAt: r.created_at,
    })),
    batchRiskSummary,
  };
}

/**
 * 알림 상태 업데이트
 */
export async function updateAlertStatus(
  tenantId: number,
  alertId: number,
  status: "acknowledged" | "resolved" | "dismissed",
  userId: number,
  note?: string
) {
  const conn = await getRawConnection();

  const updates: string[] = [`status = ?`];
  const params: any[] = [status];

  if (status === "acknowledged") {
    updates.push("acknowledged_by = ?", "acknowledged_at = NOW()");
    params.push(userId);
  } else if (status === "resolved") {
    updates.push("resolved_by = ?", "resolved_at = NOW()");
    params.push(userId);
    if (note) {
      updates.push("resolved_note = ?");
      params.push(note);
    }
  }

  params.push(alertId, tenantId);
  await conn.execute(
    `UPDATE ai_alerts SET ${updates.join(", ")} WHERE id = ? AND tenant_id = ?`,
    params
  );
}
