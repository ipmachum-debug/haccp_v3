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
 * F-3 본격 4단계 (이 파일):
 *   1. 이탈 감지 + 알림 (#132 CP-3-bc)
 *   2. LOT HOLD 자동 (#133 CP-3-d) — ENABLE_CCP_LOT_HOLD
 *   3. 손실 분개 자동 (#134 CP-3-e) — ENABLE_CCP_AUTO_JOURNAL
 *   4. 시정조치 자동 (#PR CP-3-f)   — ENABLE_CCP_CAR ← 폐쇄 루프 완성
 *
 * 미구현 (다음 사이클):
 *   - 관리자 알림 매핑 (작업자 → QA/관리자 role 분기) — CP-3-g
 *   - IoT 신호 통합 (sensor → ccpRecords 자동) — CP-3-h
 *   - 멱등성 UNIQUE 제약 (중복 CAR 방지)
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

import { eq, and, gt, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { ccpLimits, ccpMonitoringRecords } from "../../../../drizzle/schema/ccpMonitoring";
import { hNotifications } from "../../../../drizzle/schema/part2_system";
import { hInventoryLots, hInventoryTransactions } from "../../../../drizzle/schema/part2_inventory";
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

/**
 * tenant 가 LOT HOLD 활성화 대상인지 (CP-3-d / F-3 본격 첫 단계).
 *
 * ENABLE_CCP_EVAL 활성 + ENABLE_CCP_LOT_HOLD 별도 활성 모두 필요.
 * 평가는 활성이지만 LOT HOLD 는 비활성으로 분리 운영 가능 (점진).
 *
 * 우선순위:
 *   1. ENABLE_CCP_LOT_HOLD_TENANTS — 명시 tenant 목록
 *   2. ENABLE_CCP_LOT_HOLD — 전체 활성
 */
export function isCcpLotHoldEnabled(tenantId: number): boolean {
  const tenantsRaw = process.env.ENABLE_CCP_LOT_HOLD_TENANTS?.trim();
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

  const flag = process.env.ENABLE_CCP_LOT_HOLD?.toLowerCase().trim();
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

/** Deviation severity 정렬용 — 더 심각한 것이 큰 값 */
function severityRank(severity: DeviationSeverity): number {
  switch (severity) {
    case "critical":
      return 3;
    case "major":
      return 2;
    case "minor":
      return 1;
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
      `\n자동 LOT HOLD / 손실분개 / 시정조치는 env flag 활성 시 자동 진행.`,
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
 * 영향받은 LOT 자동 HOLD — F-3 본격 첫 단계 (CP-3-d).
 *
 * 흐름:
 *   1. h_inventory_transactions 에서 source_id=batchId AND lot_id IS NOT NULL
 *   2. 그 lot_id 들이 currently 'available' 인 것만 'reserved' 로 UPDATE
 *      (reserved = "예약됨" — F-3 의 HOLD 상태 활용. enum 'on_hold' 추가는 다음 PR)
 *   3. 차감 완료된 LOT (available_quantity=0) 도 새 출고 차단 효과
 *
 * 멱등성:
 *   - 이미 status='reserved' / 'used' / 'expired' 인 LOT 는 update 0
 *   - 같은 batch 에 여러 deviation → 1번만 호출 (caller 측에서 보장)
 *
 * @returns 영향받은 LOT 수 (status 가 'available' → 'reserved' 로 변경된 수)
 */
async function holdAffectedLots(
  batchId: number,
  tenantId: number,
): Promise<{ count: number; lotIds: number[] }> {
  const db = await getDb();
  if (!db) return { count: 0, lotIds: [] };

  // 1. batch 가 사용한 LOT id 수집
  const txnRows = await db
    .select({ lotId: hInventoryTransactions.lotId })
    .from(hInventoryTransactions)
    .where(
      and(
        eq(hInventoryTransactions.sourceType, "BATCH"),
        eq(hInventoryTransactions.sourceId, batchId),
        eq(hInventoryTransactions.tenantId, tenantId),
        // lot_id IS NOT NULL — Drizzle 의 inArray 는 NOT NULL 자동 처리
        gt(hInventoryTransactions.lotId, 0),
      ),
    );

  const lotIds = Array.from(
    new Set(txnRows.map((r) => Number(r.lotId)).filter((id) => id > 0)),
  );

  if (lotIds.length === 0) {
    return { count: 0, lotIds: [] };
  }

  // 2. status='available' 인 것만 'reserved' 로 UPDATE (멱등성)
  const result: any = await db
    .update(hInventoryLots)
    .set({ status: "reserved" })
    .where(
      and(
        inArray(hInventoryLots.id, lotIds),
        eq(hInventoryLots.tenantId, tenantId),
        eq(hInventoryLots.status, "available"),
      ),
    );

  // mysql2 의 UPDATE 결과는 affectedRows
  const affected = (result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0;
  return { count: Number(affected) || 0, lotIds };
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
  /** F-3 본격 첫 단계 (CP-3-d): 영향받은 LOT 자동 HOLD 카운트 */
  lotsHeld: number;
  /** F-3 본격 두 번째 단계 (CP-3-e): 자동 손실 분개 ID (있을 때) */
  lossJournalEntryId?: number;
  /** 손실 분개 총액 */
  lossTotal?: number;
  /** F-3 본격 마지막 단계 (CP-3-f): 자동 시정조치 요청 ID (있을 때) */
  correctiveActionRequestId?: number;
  reason?: string;
}> {
  const { recordId, tenantId, operatorId } = params;

  // 1. env flag 체크 — 비활성 시 0 작업
  if (!isCcpEvalEnabled(tenantId)) {
    return {
      evaluated: false,
      deviationCount: 0,
      notificationsCreated: 0,
      lotsHeld: 0,
      reason: "ENABLE_CCP_EVAL 미활성 (env)",
    };
  }

  const db = await getDb();
  if (!db) {
    return {
      evaluated: false,
      deviationCount: 0,
      notificationsCreated: 0,
      lotsHeld: 0,
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
      lotsHeld: 0,
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
      lotsHeld: 0,
      reason: `no ccp_limits for ${record.ccpType}`,
    };
  }

  // 4. 각 ccp_limits → ControlPoint → 평가
  let deviationCount = 0;
  let notificationsCreated = 0;
  // CP-3-f: 가장 심각한 deviation 1건을 추적 — 시정조치 1건 생성 시 사용
  let worstDeviation: Deviation | undefined = undefined;
  let worstControlPointCode: string | undefined = undefined;

  for (const limitRow of limits) {
    const controlPoint = mapCcpLimitToControlPoint(limitRow);
    const result = evaluateCcpRecord(record as CcpRecordRow, controlPoint, {
      batchId: record.batchId ? Number(record.batchId) : undefined,
    });

    if (result.type === "deviation") {
      deviationCount++;
      // 더 심각한 것을 worst 로 갱신 (critical > major > minor)
      if (
        !worstDeviation ||
        severityRank(result.deviation.severity) > severityRank(worstDeviation.severity)
      ) {
        worstDeviation = result.deviation;
        worstControlPointCode = controlPoint.code;
      }
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

  // 6. F-3 본격 첫 단계 (CP-3-d): LOT HOLD 자동 처리
  //    - 별도 env flag (ENABLE_CCP_LOT_HOLD) — 알림과 분리 운영 가능
  //    - record.batchId 있고 deviation 발생 시만
  //    - 같은 batch 의 모든 deviation 합쳐서 1회만 호출 (멱등성)
  let lotsHeld = 0;
  let heldLotIds: number[] = [];
  let lossJournalEntryId: number | undefined = undefined;
  let lossTotal: number | undefined = undefined;
  if (
    deviationCount > 0 &&
    record.batchId &&
    isCcpLotHoldEnabled(tenantId)
  ) {
    try {
      const batchIdNum = Number(record.batchId);
      const holdResult = await holdAffectedLots(batchIdNum, tenantId);
      lotsHeld = holdResult.count;
      heldLotIds = holdResult.lotIds;
      if (lotsHeld > 0) {
        console.warn(
          `[ccpEvaluator] LOT HOLD 처리 — batchId=${batchIdNum} ` +
          `recordId=${recordId} 영향 LOT ${lotsHeld}건 'reserved'`,
        );

        // LOT HOLD 결과를 추가 알림으로 발송 (분리 — caller 가 관찰 용이)
        try {
          await db.insert(hNotifications).values({
            tenantId,
            userId: operatorId,
            notificationType: "ccp_lot_hold",
            title: `[자동 LOT HOLD] 배치 #${batchIdNum} — ${lotsHeld}건 예약 처리`,
            message:
              `CCP 이탈로 인해 영향 LOT 자동 HOLD 처리됨.\n` +
              `  • 배치: #${batchIdNum}\n` +
              `  • 영향 LOT: ${lotsHeld}건 (status='reserved')\n` +
              `  • 출처 기록: ccp_record #${recordId}\n` +
              `\n조치:\n` +
              `  - LOT 안전 검사 후 정상이면 status 복원 ('available')\n` +
              `  - 부적합 시 폐기 처리 (status='disposed')\n` +
              `  - 손실 분개 / 시정조치는 ENABLE_CCP_AUTO_JOURNAL / ENABLE_CCP_CAR 활성 시 자동`,
            referenceType: "ccp_record",
            referenceId: recordId,
            priority: "urgent",
            isRead: 0,
            isResolved: 0,
          });
          notificationsCreated++;
        } catch (notifErr: any) {
          console.warn(
            `[ccpEvaluator] LOT HOLD 알림 INSERT 실패 — batchId=${batchIdNum}: ${notifErr?.message ?? notifErr}`,
          );
        }
      }
    } catch (holdErr: any) {
      console.warn(
        `[ccpEvaluator] LOT HOLD 실패 (안전 무시) — recordId=${recordId}: ${holdErr?.message ?? holdErr}`,
      );
    }
  }

  // 7. F-3 본격 두 번째 단계 (CP-3-e): 자동 손실 분개
  //    - 별도 env flag (ENABLE_CCP_AUTO_JOURNAL)
  //    - LOT HOLD 성공 + heldLotIds 있을 때만
  //    - 분개 실패 시 안전 무시 (LOT HOLD 는 이미 commit)
  if (lotsHeld > 0 && heldLotIds.length > 0 && record.batchId) {
    try {
      const { postCcpLossJournal, isCcpAutoJournalEnabled } = await import(
        "./ccp.lossJournal"
      );
      if (isCcpAutoJournalEnabled(tenantId)) {
        const lossResult = await postCcpLossJournal({
          batchId: Number(record.batchId),
          lotIds: heldLotIds,
          tenantId,
          userId: operatorId,
          ccpRecordId: recordId,
        });

        if (lossResult.posted && lossResult.journalEntryId) {
          lossJournalEntryId = lossResult.journalEntryId;
          lossTotal = lossResult.totalLoss;

          // 손실 분개 알림 (3번째 알림)
          try {
            await db.insert(hNotifications).values({
              tenantId,
              userId: operatorId,
              notificationType: "ccp_loss_journal",
              title:
                `[자동 손실분개] 배치 #${record.batchId} — ` +
                `${lossResult.totalLoss.toLocaleString("ko-KR")}원 손실`,
              message:
                `CCP 이탈로 인해 자동 손실 분개가 생성되었습니다.\n` +
                `  • 분개 ID: #${lossResult.journalEntryId}\n` +
                `  • 영향 LOT: ${lossResult.lotCount}건\n` +
                `  • 손실 총액: ${lossResult.totalLoss.toLocaleString("ko-KR")}원\n` +
                `  • 차변: 제조손실 (PRODUCTION_LOSS)\n` +
                `  • 대변: 원재료 (INVENTORY_RAW)\n` +
                `  • 출처: ccp_record #${recordId}\n` +
                `\n조치:\n` +
                `  - 회계 페이지에서 분개 검토\n` +
                `  - LOT 안전 검사 / 폐기 결정 (시정조치는 ENABLE_CCP_CAR 활성 시 자동)`,
              referenceType: "journal_entry",
              referenceId: lossResult.journalEntryId,
              priority: "urgent",
              isRead: 0,
              isResolved: 0,
            });
            notificationsCreated++;
          } catch (notifErr: any) {
            console.warn(
              `[ccpEvaluator] 손실분개 알림 INSERT 실패 — entryId=${lossResult.journalEntryId}: ` +
              `${notifErr?.message ?? notifErr}`,
            );
          }
        }
      }
    } catch (journalErr: any) {
      console.warn(
        `[ccpEvaluator] 손실분개 실패 (안전 무시) — recordId=${recordId}: ` +
        `${journalErr?.message ?? journalErr}`,
      );
    }
  }

  // 8. F-3 본격 마지막 단계 (CP-3-f): 자동 시정조치 요청 (CAR)
  //    - 별도 env flag (ENABLE_CCP_CAR) — 점진 활성화 4번째 단계
  //    - deviation 발생 + record.batchId 있을 때만 (LOT HOLD 실패해도 CAR 는 별개)
  //    - CAR 1건 / record (가장 심각한 deviation 기준)
  let correctiveActionRequestId: number | undefined = undefined;
  if (
    deviationCount > 0 &&
    record.batchId &&
    worstDeviation &&
    worstControlPointCode
  ) {
    try {
      const { postCcpCorrectiveAction, isCcpCarEnabled } = await import(
        "./ccp.correctiveAction"
      );
      if (isCcpCarEnabled(tenantId)) {
        const carResult = await postCcpCorrectiveAction({
          batchId: Number(record.batchId),
          ccpRecordId: recordId,
          tenantId,
          operatorId,
          deviation: worstDeviation,
          controlPointCode: worstControlPointCode,
          productName: record.productName,
          lotsHeld,
          lossJournalEntryId,
          lossTotal,
        });

        if (carResult.posted && carResult.requestId) {
          correctiveActionRequestId = carResult.requestId;

          // 4번째 알림 — 시정조치 자동 등록
          try {
            await db.insert(hNotifications).values({
              tenantId,
              userId: operatorId,
              notificationType: "ccp_corrective_action",
              title:
                `[자동 시정조치] 배치 #${record.batchId} — CAR #${carResult.requestId} 등록`,
              message:
                `CCP 이탈에 대한 시정조치 요청이 자동 등록되었습니다.\n` +
                `  • CAR ID: #${carResult.requestId}\n` +
                `  • 배치: #${record.batchId}\n` +
                `  • CCP: ${worstControlPointCode}\n` +
                `  • 심각도: ${worstDeviation.severity}\n` +
                `  • 출처: ccp_record #${recordId}\n` +
                `\n조치:\n` +
                `  - 시정조치 페이지(/corrective-actions)에서 즉시조치 / 근본원인 / 시정 / 검증 4단계 진행\n` +
                `  - 담당자 지정 후 status 'investigating' 으로 전환`,
              referenceType: "corrective_action_request",
              referenceId: carResult.requestId,
              priority: severityToPriority(worstDeviation.severity),
              isRead: 0,
              isResolved: 0,
            });
            notificationsCreated++;
          } catch (notifErr: any) {
            console.warn(
              `[ccpEvaluator] CAR 알림 INSERT 실패 — requestId=${carResult.requestId}: ` +
              `${notifErr?.message ?? notifErr}`,
            );
          }
        }
      }
    } catch (carErr: any) {
      console.warn(
        `[ccpEvaluator] CAR 생성 실패 (안전 무시) — recordId=${recordId}: ` +
        `${carErr?.message ?? carErr}`,
      );
    }
  }

  if (deviationCount > 0) {
    console.warn(
      `[ccpEvaluator] recordId=${recordId} 이탈 ${deviationCount}건, ` +
      `알림 ${notificationsCreated}건, LOT HOLD ${lotsHeld}건` +
      (lossJournalEntryId
        ? `, 손실분개 #${lossJournalEntryId} (${(lossTotal ?? 0).toLocaleString("ko-KR")}원)`
        : "") +
      (correctiveActionRequestId
        ? `, 시정조치 #${correctiveActionRequestId}`
        : ""),
    );
  }

  return {
    evaluated: true,
    deviationCount,
    notificationsCreated,
    lotsHeld,
    lossJournalEntryId,
    lossTotal,
    correctiveActionRequestId,
  };
}
