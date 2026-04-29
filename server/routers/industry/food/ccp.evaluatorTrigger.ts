/**
 * CCP 평가기 트리거 — F-3 IoT 폐쇄 루프 PoC (CP-3-c)
 *
 * ============================================================================
 * ccp_monitoring_records INSERT 후 비동기 호출. env flag 로 활성화.
 *
 * 흐름:
 *   1. env 체크 (ENABLE_CCP_EVAL / per-tenant)
 *   2. record 의 ccpType + tenantId 로 ccp_limits 조회
 *   3. mapCcpLimitToControlPoint → ControlPoint
 *   4. evaluateCcpRecord(record, controlPoint) → EvaluationResult
 *   5. deviation 시:
 *      a. console.warn (감사 로그)
 *      b. h_notifications INSERT (관리자 알림)
 *
 * 미구현 (다음 사이클 — F-3 본격):
 *   - LOT HOLD (h_inventory_lots.status='reserved' 또는 'on_hold' enum 추가)
 *   - 손실 분개 자동 생성
 *   - 시정조치 워크플로 자동 트리거 (h_corrective_actions INSERT)
 *
 * ============================================================================
 * 환경변수:
 *   ENABLE_CCP_EVAL=false (기본)         — 평가기 비활성 (운영 안전)
 *   ENABLE_CCP_EVAL=true                 — 모든 tenant 평가
 *   ENABLE_CCP_EVAL_TENANTS="2,5,7"      — 명시 tenant 만 평가
 *
 * ============================================================================
 * 트리거: PR #131 CP-3 PoC 평가기 / 특허 [0016] F-3 IoT 폐쇄 루프
 *
 * 비동기 패턴: 호출자가 catch 무시 (메인 INSERT 실패하면 안 됨).
 * ============================================================================
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../../../db";
import { ccpLimits, ccpMonitoringRecords } from "../../../../drizzle/schema/ccpMonitoring";
import { hNotifications } from "../../../../drizzle/schema/part2_system";
import { evaluateCcpRecord, mapCcpLimitToControlPoint } from "./ccp.evaluator";
import type { Deviation, DeviationSeverity } from "../../../core-mes/quality";

/** ccp_monitoring_records row 타입 */
type CcpRecordRow = typeof ccpMonitoringRecords.$inferSelect;

/**
 * tenant 가 평가 활성화 대상인지.
 *
 * 우선순위:
 *   1. ENABLE_CCP_EVAL_TENANTS — 명시 tenant 목록
 *   2. ENABLE_CCP_EVAL — 전체 활성
 */
export function isCcpEvalEnabled(tenantId: number): boolean {
  const tenantsRaw = process.env.ENABLE_CCP_EVAL_TENANTS?.trim();
  if (tenantsRaw) {
    const enabled = tenantsRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));
    if (enabled.length > 0) {
      return enabled.includes(Number(tenantId));
    }
  }

  const flag = process.env.ENABLE_CCP_EVAL?.toLowerCase().trim();
  return flag === "true" || flag === "1" || flag === "yes";
}

/** Deviation severity → notification priority 매핑 */
function severityToPriority(
  severity: DeviationSeverity,
): "low" | "medium" | "high" | "urgent" {
  switch (severity) {
    case "critical":
      return "urgent";
    case "major":
      return "high";
    case "minor":
      return "medium";
  }
}

/** Deviation → 알림 메시지 생성 */
function formatDeviationMessage(
  deviation: Deviation,
  controlPointCode: string,
  productName: string,
): { title: string; message: string } {
  const limit = deviation.violatedLimit;
  const measurement = deviation.measurement;
  const limitDesc = formatLimit(limit);
  const measurementDesc = formatMeasurement(measurement.value, limit.unit);

  return {
    title: `[CCP 이탈] ${controlPointCode} — ${limit.label ?? "한계 위반"} (${productName})`,
    message:
      `한계 이탈 감지\n` +
      `  • CCP: ${controlPointCode}\n` +
      `  • 항목: ${limit.label ?? "?"}\n` +
      `  • 한계: ${limitDesc}\n` +
      `  • 측정값: ${measurementDesc}\n` +
      `  • 시각: ${measurement.measuredAt.toISOString()}\n` +
      `\n자동 시정조치 / LOT HOLD 는 다음 사이클 (F-3 본격 구현) 에서 추가 예정.`,
  };
}

function formatLimit(limit: Deviation["violatedLimit"]): string {
  switch (limit.type) {
    case "min":
      return `≥ ${limit.value}${limit.unit ?? ""}`;
    case "max":
      return `≤ ${limit.value}${limit.unit ?? ""}`;
    case "range": {
      const r = limit.value as { min: number; max: number };
      return `${r.min} ~ ${r.max}${limit.unit ?? ""}`;
    }
    case "boolean":
      return limit.value === true ? "통과 (O)" : "실패 (X)";
    case "categorical":
      return `[${(limit.value as readonly string[]).join(", ")}]`;
  }
}

function formatMeasurement(value: number | boolean | string, unit?: string): string {
  if (typeof value === "boolean") return value ? "통과 (O)" : "실패 (X)";
  if (typeof value === "string") return value;
  return `${value}${unit ?? ""}`;
}

/**
 * CCP 측정 record 후처리 트리거 — 비동기, 에러 무시.
 *
 * 호출 방법 (ccpRecords 라우터에서):
 *   triggerCcpEvaluator({ recordId, tenantId, operatorId }).catch(() => {});
 *
 * @returns
 *   { evaluated: boolean, deviationCount: number, notificationsCreated: number }
 *   - evaluated: env flag 활성화로 실제 평가 수행했는지
 *   - deviationCount: 이탈 감지 수
 *   - notificationsCreated: 발송된 알림 수
 */
export async function triggerCcpEvaluator(params: {
  recordId: number;
  tenantId: number;
  operatorId: number;
}): Promise<{
  evaluated: boolean;
  deviationCount: number;
  notificationsCreated: number;
  reason?: string;
}> {
  const { recordId, tenantId, operatorId } = params;

  // 1. env flag 체크 — 비활성 시 0 작업
  if (!isCcpEvalEnabled(tenantId)) {
    return {
      evaluated: false,
      deviationCount: 0,
      notificationsCreated: 0,
      reason: "ENABLE_CCP_EVAL 미활성 (env)",
    };
  }

  const db = await getDb();
  if (!db) {
    return {
      evaluated: false,
      deviationCount: 0,
      notificationsCreated: 0,
      reason: "DB 연결 실패",
    };
  }

  // 2. record + matching ccp_limits 조회
  const [record] = await db
    .select()
    .from(ccpMonitoringRecords)
    .where(
      and(
        eq(ccpMonitoringRecords.id, recordId),
        eq(ccpMonitoringRecords.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!record) {
    return {
      evaluated: false,
      deviationCount: 0,
      notificationsCreated: 0,
      reason: `record not found: id=${recordId}`,
    };
  }

  // 3. 매칭 ccp_limits 조회 (같은 ccpType + productName + tenant)
  // 단순화: ccpType + tenant 만 매칭 (productName 정확 매칭은 추후)
  const limits = await db
    .select()
    .from(ccpLimits)
    .where(
      and(
        eq(ccpLimits.ccpType, record.ccpType),
        eq(ccpLimits.tenantId, tenantId),
      ),
    );

  if (limits.length === 0) {
    return {
      evaluated: true,
      deviationCount: 0,
      notificationsCreated: 0,
      reason: `no ccp_limits for ${record.ccpType}`,
    };
  }

  // 4. 각 ccp_limits → ControlPoint → 평가
  let deviationCount = 0;
  let notificationsCreated = 0;

  for (const limitRow of limits) {
    const controlPoint = mapCcpLimitToControlPoint(limitRow);
    const result = evaluateCcpRecord(record as CcpRecordRow, controlPoint, {
      batchId: record.batchId ? Number(record.batchId) : undefined,
    });

    if (result.type === "deviation") {
      deviationCount++;
      const { title, message } = formatDeviationMessage(
        result.deviation,
        controlPoint.code,
        record.productName,
      );

      console.warn(
        `[ccpEvaluator] 이탈 감지 — recordId=${recordId} ${controlPoint.code} ` +
        `${result.deviation.violatedLimit.label}`,
      );

      // 5. h_notifications INSERT (관리자 알림)
      try {
        await db.insert(hNotifications).values({
          tenantId,
          userId: operatorId, // PoC: 작업자에게 발송 (관리자 매핑은 다음 PR)
          notificationType: "ccp_deviation",
          title,
          message,
          referenceType: "ccp_record",
          referenceId: recordId,
          priority: severityToPriority(result.deviation.severity),
          isRead: 0,
          isResolved: 0,
        });
        notificationsCreated++;
      } catch (notifErr: any) {
        console.warn(
          `[ccpEvaluator] 알림 INSERT 실패 — recordId=${recordId}: ${notifErr?.message ?? notifErr}`,
        );
      }
    }
  }

  if (deviationCount > 0) {
    console.warn(
      `[ccpEvaluator] recordId=${recordId} 이탈 ${deviationCount}건, ` +
      `알림 ${notificationsCreated}건 발송 (env: ENABLE_CCP_EVAL)`,
    );
  }

  return {
    evaluated: true,
    deviationCount,
    notificationsCreated,
  };
}
