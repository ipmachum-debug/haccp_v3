/**
 * P9-4: 실시간 온도 알림 트리거
 *
 * CCP 모니터링 기록 또는 냉동·냉장 점검 기록이 저장될 때
 * 즉시 온도 한계 초과 여부를 판단하고, 초과 시:
 *   1. ai_alerts 테이블에 알림 저장
 *   2. h_notifications 테이블에 알림 전파 (critical/high)
 *
 * 배치 평가(evaluateAllRules)와 달리 "기록 시점"에 즉시 동작하는 트리거.
 */

import { getRawConnection } from "../db";
import { createNotification } from "./notificationFunctions";
import { SYSTEM_RULES } from "./rulesEngine";
import type { RuleEvaluationResult } from "../../drizzle/schema/aiEngine";

// ============================================================================
// CCP 모니터링 온도 트리거
// ============================================================================

interface CcpRecordInput {
  tenantId: number;
  recordId: number;
  ccpType: string;
  productName: string;
  temperatureC?: string | null;
  tempEdgeC?: string | null;
  tempCenterC?: string | null;
  heatingTimeMin?: number | null;
  pressureMpa?: string | null;
  passFail: string;
  measurementTime?: string | null;
}

/**
 * CCP 모니터링 기록 저장 직후 호출
 * - CCP 한계기준(ccpLimits) 테이블과 비교
 * - 이탈 시 ai_alerts + h_notifications 생성
 */
export async function triggerCcpTemperatureAlert(input: CcpRecordInput): Promise<RuleEvaluationResult[]> {
  const conn = await getRawConnection();
  const alerts: RuleEvaluationResult[] = [];

  try {
    // 1. 해당 CCP 타입 + 제품의 한계기준 조회
    const [limits] = await conn.execute(
      `SELECT id, ccp_type, product_name, temperature_c_min, heating_time_min_min, heating_time_min_max, pressure_mpa_min
       FROM ccp_limits
       WHERE tenant_id = ? AND ccp_type = ? AND product_name = ?
       LIMIT 1`,
      [input.tenantId, input.ccpType, input.productName]
    );

    const limit = (limits as any[])[0];
    if (!limit) {
      // 한계기준 미설정 → 부적합 판정만으로 트리거
      if (input.passFail === "부적합") {
        alerts.push(buildCcpAlert(input, null, "부적합 판정"));
      }
      await saveAndNotify(input.tenantId, alerts);
      return alerts;
    }

    // 2. 온도 이탈 체크
    const tempMin = limit.temperature_c_min ? parseFloat(limit.temperature_c_min) : null;
    if (tempMin !== null) {
      const temps = [
        { label: "중심온도", value: input.temperatureC },
        { label: "가장자리 온도", value: input.tempEdgeC },
        { label: "센터 온도", value: input.tempCenterC },
      ];

      for (const t of temps) {
        if (!t.value) continue;
        const val = parseFloat(t.value);
        if (isNaN(val)) continue;

        // 가열 공정: 최소 온도 미달 시 이탈
        if (val < tempMin) {
          alerts.push(buildCcpAlert(input, limit, `${t.label} ${val}°C < 기준 ${tempMin}°C`));
        }
      }
    }

    // 3. 가열시간 이탈 체크
    if (input.heatingTimeMin !== null && input.heatingTimeMin !== undefined) {
      const minTime = limit.heating_time_min_min;
      const maxTime = limit.heating_time_min_max;
      if (minTime !== null && input.heatingTimeMin < minTime) {
        alerts.push({
          ruleId: 0,
          ruleCode: SYSTEM_RULES.CCP_TIME_DEVIATION.code,
          triggered: true,
          severity: "critical",
          title: `[실시간] CCP 시간 기준 이탈 - ${input.productName}`,
          message: `${input.ccpType} 가열시간 ${input.heatingTimeMin}분 < 기준 ${minTime}분`,
          entityType: "ccp",
          entityId: input.recordId,
          entityCode: input.ccpType,
          contextData: {
            ccpType: input.ccpType,
            productName: input.productName,
            heatingTimeMin: input.heatingTimeMin,
            limitMin: minTime,
            limitMax: maxTime,
            triggeredAt: new Date().toISOString(),
          },
        });
      }
    }

    // 4. 압력 이탈 체크
    if (input.pressureMpa) {
      const pressureVal = parseFloat(input.pressureMpa);
      const pressureMin = limit.pressure_mpa_min ? parseFloat(limit.pressure_mpa_min) : null;
      if (pressureMin !== null && !isNaN(pressureVal) && pressureVal < pressureMin) {
        alerts.push({
          ruleId: 0,
          ruleCode: SYSTEM_RULES.CCP_PRESSURE_DEVIATION.code,
          triggered: true,
          severity: "critical",
          title: `[실시간] CCP 압력 기준 이탈 - ${input.productName}`,
          message: `${input.ccpType} 압력 ${pressureVal}MPa < 기준 ${pressureMin}MPa`,
          entityType: "ccp",
          entityId: input.recordId,
          entityCode: input.ccpType,
          contextData: {
            ccpType: input.ccpType,
            productName: input.productName,
            pressureMpa: pressureVal,
            limitMin: pressureMin,
            triggeredAt: new Date().toISOString(),
          },
        });
      }
    }

    // 5. passFail이 부적합이면 무조건 알림 (위 조건과 중복 가능 → 중복 제거)
    if (input.passFail === "부적합" && alerts.length === 0) {
      alerts.push(buildCcpAlert(input, limit, "부적합 판정 (수동)"));
    }

    await saveAndNotify(input.tenantId, alerts);
    return alerts;
  } catch (err) {
    console.error("[temperatureAlertTrigger] CCP alert error:", err);
    return [];
  }
}

function buildCcpAlert(input: CcpRecordInput, limit: any, reason: string): RuleEvaluationResult {
  return {
    ruleId: 0,
    ruleCode: SYSTEM_RULES.CCP_TEMP_DEVIATION.code,
    triggered: true,
    severity: "critical",
    title: `[실시간] CCP 온도 이탈 - ${input.productName}`,
    message: `${input.ccpType} ${reason}`,
    entityType: "ccp",
    entityId: input.recordId,
    entityCode: input.ccpType,
    contextData: {
      ccpType: input.ccpType,
      productName: input.productName,
      temperatureC: input.temperatureC,
      tempEdgeC: input.tempEdgeC,
      tempCenterC: input.tempCenterC,
      limitMin: limit?.temperature_c_min,
      passFail: input.passFail,
      triggeredAt: new Date().toISOString(),
    },
  };
}

// ============================================================================
// 냉동·냉장 점검 온도 트리거
// ============================================================================

interface RefrigerationInput {
  tenantId: number;
  recordId: number;
  equipmentName: string;
  equipmentType: string;
  temperature: number;
  targetTemperature?: number | null;
  checkResult: string;
  siteId: number;
}

/**
 * 냉동·냉장 점검 기록 저장 직후 호출
 * - targetTemperature 대비 온도 편차 체크
 * - 장비 유형별 기본 허용 범위 적용
 */
export async function triggerRefrigerationAlert(input: RefrigerationInput): Promise<RuleEvaluationResult[]> {
  const alerts: RuleEvaluationResult[] = [];

  try {
    // 기본 허용 범위 (장비 유형별)
    const defaultRanges: Record<string, { min: number; max: number }> = {
      freezer: { min: -25, max: -15 },
      refrigerator: { min: 0, max: 10 },
      cold_storage: { min: -5, max: 5 },
    };

    const range = defaultRanges[input.equipmentType] || { min: -30, max: 15 };

    // targetTemperature가 있으면 ±5°C 허용, 없으면 기본 범위
    let effectiveMin = range.min;
    let effectiveMax = range.max;
    if (input.targetTemperature !== null && input.targetTemperature !== undefined) {
      effectiveMin = input.targetTemperature - 5;
      effectiveMax = input.targetTemperature + 5;
    }

    const isOutOfRange = input.temperature < effectiveMin || input.temperature > effectiveMax;
    const isCritical = input.temperature < effectiveMin - 5 || input.temperature > effectiveMax + 5;

    if (isOutOfRange || input.checkResult === "fail") {
      const severity = isCritical ? "critical" as const : "high" as const;
      const typeNames: Record<string, string> = {
        freezer: "냉동고",
        refrigerator: "냉장고",
        cold_storage: "저온창고",
      };
      const typeName = typeNames[input.equipmentType] || input.equipmentType;

      alerts.push({
        ruleId: 0,
        ruleCode: SYSTEM_RULES.TEMPERATURE_LOG_ABNORMAL.code,
        triggered: true,
        severity,
        title: `[실시간] ${typeName} 온도 이상 - ${input.equipmentName}`,
        message: `${input.equipmentName}(${typeName}) 온도 ${input.temperature}°C ${
          input.targetTemperature !== null && input.targetTemperature !== undefined
            ? `(목표 ${input.targetTemperature}°C)`
            : `(허용 ${effectiveMin}~${effectiveMax}°C)`
        } — ${isCritical ? "위험" : "경고"} 수준`,
        entityType: "equipment",
        entityId: input.recordId,
        entityCode: input.equipmentName,
        contextData: {
          equipmentName: input.equipmentName,
          equipmentType: input.equipmentType,
          temperature: input.temperature,
          targetTemperature: input.targetTemperature,
          effectiveMin,
          effectiveMax,
          checkResult: input.checkResult,
          siteId: input.siteId,
          triggeredAt: new Date().toISOString(),
        },
      });
    }

    await saveAndNotify(input.tenantId, alerts);
    return alerts;
  } catch (err) {
    console.error("[temperatureAlertTrigger] Refrigeration alert error:", err);
    return [];
  }
}

// ============================================================================
// 공통: AI 알림 저장 + 알림 시스템 전파
// ============================================================================

async function saveAndNotify(tenantId: number, alerts: RuleEvaluationResult[]): Promise<void> {
  if (alerts.length === 0) return;
  const conn = await getRawConnection();

  for (const alert of alerts) {
    try {
      // ai_alerts 저장 (중복 체크: 같은 날 + 같은 규칙 + 같은 엔티티)
      const [existing] = await conn.execute(
        `SELECT id FROM ai_alerts
         WHERE tenant_id = ? AND rule_code = ? AND entity_type = ?
           AND COALESCE(entity_id, 0) = COALESCE(?, 0)
           AND DATE(created_at) = CURDATE()
           AND status = 'active'
         LIMIT 1`,
        [tenantId, alert.ruleCode, alert.entityType, alert.entityId || null]
      );

      if ((existing as any[]).length > 0) continue;

      await conn.execute(
        `INSERT INTO ai_alerts
         (tenant_id, rule_code, title, message, severity, entity_type, entity_id, entity_code, context_data, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW())`,
        [
          tenantId,
          alert.ruleCode,
          alert.title,
          alert.message,
          alert.severity,
          alert.entityType,
          alert.entityId || null,
          alert.entityCode || null,
          JSON.stringify(alert.contextData || {}),
        ]
      );

      // h_notifications 전파 (critical/high만)
      if (alert.severity === "critical" || alert.severity === "high") {
        const priorityMap: Record<string, "urgent" | "high" | "medium" | "low"> = {
          critical: "urgent",
          high: "high",
        };
        await createNotification({
          tenantId,
          notificationType: "ai_alert",
          title: `[AI 실시간] ${alert.title}`,
          message: alert.message,
          referenceType: alert.entityType,
          referenceId: alert.entityId,
          priority: priorityMap[alert.severity] || "medium",
          actionUrl: "/dashboard/ai-assistant",
        });
      }
    } catch (err) {
      console.error("[temperatureAlertTrigger] Save alert error:", err);
    }
  }
}
