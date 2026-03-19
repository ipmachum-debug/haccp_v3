/**
 * AI 이벤트 트리거 (P9-4, P9-5)
 *
 * 특정 이벤트 발생 시 AI 기능 자동 실행:
 * P9-4: 온도 이상 기록 시 즉시 알림 생성
 * P9-5: CCP 이탈 발생 시 시정조치 초안 자동 생성
 */

import { getRawConnection } from "../db";
import { createNotification } from "./notificationFunctions";

// ============================================================================
// P9-4: 온도 이상 실시간 알림
// ============================================================================

/**
 * 냉장/냉동 점검 기록 후 호출 - 온도 이상 시 즉시 알림
 * checklist/refrigerationCheck.router.ts의 create mutation에서 호출
 */
export async function onTemperatureRecorded(params: {
  tenantId: number;
  location: string;
  temperature: number;
  checkResult: string;
  recordId?: number;
}) {
  const { tenantId, location, temperature, checkResult, recordId } = params;

  // pass면 무시
  if (checkResult === "pass") return;

  try {
    const conn = await getRawConnection();

    // AI 알림 생성
    await conn.execute(
      `INSERT INTO ai_alerts
       (tenant_id, rule_code, title, message, severity, entity_type, entity_code, context_data, status, created_at)
       VALUES (?, 'REALTIME_TEMP_ALERT', ?, ?, ?, 'equipment', ?, ?, 'active', NOW())`,
      [
        tenantId,
        `온도 이상 즉시 알림 - ${location}`,
        `${location}에서 온도 이상 감지: ${temperature}°C (점검결과: 부적합)`,
        temperature <= -25 || temperature >= 15 ? "critical" : "high",
        location,
        JSON.stringify({ temperature, checkResult, recordId }),
      ]
    );

    // 실시간 알림 전송
    await createNotification({
      tenantId,
      notificationType: "temperature_alert",
      title: `[긴급] 온도 이상 - ${location}`,
      message: `${location}: ${temperature}°C 감지. 즉시 확인이 필요합니다.`,
      referenceType: "equipment",
      referenceId: recordId,
      priority: "urgent",
      actionUrl: "/haccp/checklist",
    });
  } catch (error) {
    console.error("[AI Trigger] 온도 이상 알림 실패:", error);
  }
}

// ============================================================================
// P9-5: CCP 이탈 시 시정조치 자동 초안
// ============================================================================

/**
 * CCP 기록 FAIL 시 호출 - 시정조치 초안 자동 생성
 * ccpMonitoring/ccpRecords.router.ts의 create/save에서 호출
 */
export async function onCcpDeviation(params: {
  tenantId: number;
  ccpType: string;
  batchId?: number;
  batchCode?: string;
  deviationType: string;
  measuredValue: string;
  criticalLimit: string;
  instanceId?: number;
}) {
  const { tenantId, ccpType, batchId, batchCode, deviationType, measuredValue, criticalLimit } = params;

  try {
    const conn = await getRawConnection();

    // 1. AI 알림 생성
    await conn.execute(
      `INSERT INTO ai_alerts
       (tenant_id, rule_code, title, message, severity, entity_type, entity_id, entity_code, context_data, status, created_at)
       VALUES (?, 'CCP_DEVIATION_REALTIME', ?, ?, 'critical', 'ccp', ?, ?, ?, 'active', NOW())`,
      [
        tenantId,
        `CCP 이탈 - ${ccpType}`,
        `${ccpType} CCP 이탈: 측정값 ${measuredValue}, 한계기준 ${criticalLimit}${batchCode ? ` (배치: ${batchCode})` : ""}`,
        batchId || null,
        batchCode || null,
        JSON.stringify(params),
      ]
    );

    // 2. 실시간 알림
    await createNotification({
      tenantId,
      notificationType: "ccp_deviation",
      title: `[CCP 이탈] ${ccpType} - 즉시 조치 필요`,
      message: `${deviationType} 이탈: 측정값 ${measuredValue} (기준: ${criticalLimit})`,
      referenceType: "ccp",
      referenceId: batchId,
      priority: "urgent",
      actionUrl: "/haccp/ccp-monitoring",
    });

    // 3. 시정조치 초안 자동 생성 (LLM)
    try {
      const { generateCorrectiveActionDraft } = await import("./standardChecklist");
      const draft = await generateCorrectiveActionDraft({
        deviationType,
        ccpType,
        measuredValue,
        criticalLimit,
        batchCode: batchCode || undefined,
        additionalContext: `CCP 이탈 자동 감지. ${ccpType} 모니터링에서 한계기준 이탈 발생.`,
      });

      // 시정조치 요청으로 자동 저장
      await conn.execute(
        `INSERT INTO h_corrective_action_requests
         (tenant_id, source_type, source_id, problem_description, immediate_action,
          root_cause_analysis, corrective_action, preventive_action,
          priority, status, occurred_at, action_due_date, created_at, updated_at)
         VALUES (?, 'ccp_deviation', ?, ?, ?, ?, ?, ?, 'urgent', 'draft', NOW(),
                 DATE_ADD(CURDATE(), INTERVAL 3 DAY), NOW(), NOW())`,
        [
          tenantId,
          batchId || null,
          `[자동생성] ${ccpType} CCP 이탈: ${deviationType} - 측정값 ${measuredValue}, 기준 ${criticalLimit}`,
          draft.immediateAction || "해당 제품 격리 및 라인 정지",
          draft.rootCauseAnalysis || "원인 조사 중",
          draft.correctiveAction || "시정조치 수립 필요",
          draft.preventiveAction || "재발방지 대책 수립 필요",
        ]
      );

      // 시정조치 생성 알림
      await createNotification({
        tenantId,
        notificationType: "corrective_action",
        title: `[AI] 시정조치 초안 자동 생성`,
        message: `${ccpType} CCP 이탈에 대한 시정조치 초안이 자동 생성되었습니다. 검토 후 확정해주세요.`,
        referenceType: "corrective_action",
        priority: "high",
        actionUrl: "/haccp/corrective-actions",
      });
    } catch (draftError) {
      console.error("[AI Trigger] 시정조치 초안 생성 실패:", draftError);
      // 초안 생성 실패해도 알림은 이미 전송됨
    }
  } catch (error) {
    console.error("[AI Trigger] CCP 이탈 트리거 실패:", error);
  }
}

// ============================================================================
// CCP 기록 저장 시 이탈 체크 헬퍼
// ============================================================================

/**
 * CCP 기록 결과가 FAIL인지 확인하고 자동 트리거 호출
 */
export async function checkAndTriggerCcpAlert(params: {
  tenantId: number;
  result: string;
  ccpType: string;
  batchId?: number;
  batchCode?: string;
  temperature?: number;
  duration?: number;
  pressure?: number;
  criticalLimit?: string;
  instanceId?: number;
}) {
  if (params.result !== "FAIL") return;

  const measuredValue = params.temperature
    ? `${params.temperature}°C`
    : params.duration
      ? `${params.duration}분`
      : params.pressure
        ? `${params.pressure}bar`
        : "기준 초과";

  await onCcpDeviation({
    tenantId: params.tenantId,
    ccpType: params.ccpType,
    batchId: params.batchId,
    batchCode: params.batchCode,
    deviationType: params.ccpType,
    measuredValue,
    criticalLimit: params.criticalLimit || "한계기준",
    instanceId: params.instanceId,
  });
}
