/**
 * CCP 이탈 자동 시정조치 — F-3 본격 마지막 단계 (CP-3-f)
 *
 * ============================================================================
 * 흐름:
 *   PR #134 (손실분개) 후 자동으로 시정조치 요청 (CAR) 등록.
 *   `h_corrective_action_requests` 테이블에 source_type='ccp_deviation' 행 INSERT.
 *
 *   기존 라우터/UI/DB 헬퍼 활용 — 이 파일은 env flag + 트리거 어댑터만.
 *     • 라우터: server/routers/haccp/correctiveAction.router.ts
 *     • UI:    client/src/pages/haccp/CorrectiveActionList.tsx (`/corrective-actions`)
 *     • DB:    server/db/haccp/correctiveAction.ts → createCorrectiveActionFromCcpDeviation()
 *
 * 환경변수 (운영 .env):
 *   ENABLE_CCP_CAR=false (기본)            — 자동 시정조치 비활성
 *   ENABLE_CCP_CAR_TENANTS="2,5,7"         — 명시 tenant 만
 *
 * 점진 활성화 5단계 (이 PR 으로 4번째 추가):
 *   1. 평가만        (ENABLE_CCP_EVAL)
 *   2. + LOT HOLD   (ENABLE_CCP_LOT_HOLD)
 *   3. + 손실분개    (ENABLE_CCP_AUTO_JOURNAL)
 *   4. + 시정조치    (ENABLE_CCP_CAR)            ← 이 PR
 *   5. 운영 전체 활성
 *
 * 멱등성 (CP-3-g 추가):
 *   같은 (tenant_id, source_type='ccp_deviation', source_id=ccpRecordId) 조합은
 *   1건만 등록. 재호출 시 기존 CAR id 를 existingRequestId 로 반환하고 신규는 스킵.
 *   schema-level UNIQUE 인덱스 (uniq_car_source) 는 후속 마이그레이션 PR 에서 추가됨 —
 *   app-level + DB-level 이중 fence (race condition 시에도 DB 가 강제 거부).
 *
 * 트리거: PR #134 CP-3-e 손실분개 / 특허 [0016] F-3 IoT 폐쇄 루프 (마지막 단계)
 * ============================================================================
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../../../db";
import { hCorrectiveActionRequests } from "../../../../drizzle/schema";
import { createCorrectiveActionFromCcpDeviation } from "../../../db/haccp/correctiveAction";
import type { Deviation, DeviationSeverity } from "../../../core-mes/quality";

export interface CarResult {
  /** CAR 신규 생성 여부 (env 비활성 / 데이터 부족 / 멱등성 단축 시 false) */
  posted: boolean;
  /** 생성된 h_corrective_action_requests.id (posted=true 시) */
  requestId?: number;
  /** 멱등성 단축 시 기존 CAR id (이미 존재) */
  existingRequestId?: number;
  reason?: string;
}

/**
 * tenant 가 자동 시정조치 활성화 대상인지.
 *
 * 우선순위:
 *   1. ENABLE_CCP_CAR_TENANTS — 명시 tenant 목록
 *   2. ENABLE_CCP_CAR — 전체 활성
 */
export function isCcpCarEnabled(tenantId: number): boolean {
  const tenantsRaw = process.env.ENABLE_CCP_CAR_TENANTS?.trim();
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

  const flag = process.env.ENABLE_CCP_CAR?.toLowerCase().trim();
  return flag === "true" || flag === "1" || flag === "yes";
}

/** Deviation severity → CAR priority 매핑 */
function severityToCarPriority(
  severity: DeviationSeverity,
): "low" | "medium" | "high" | "critical" {
  switch (severity) {
    case "critical":
      return "critical";
    case "major":
      return "high";
    case "minor":
      return "medium";
  }
}

/**
 * CCP 이탈로 영향받은 배치에 자동 시정조치 요청 생성.
 *
 * 흐름:
 *   1. env 체크 (no-op fallback)
 *   2. problemDescription 자동 작성 (deviation + LOT HOLD + 손실분개 컨텍스트 포함)
 *   3. createCorrectiveActionFromCcpDeviation 호출 → CAR-YYYYMMDD-NNN 자동 채번
 *
 * 안전:
 *   - 호출자 (evaluatorTrigger) 는 catch 무시 — LOT HOLD / 손실분개는 이미 commit
 *   - 멱등성 ⚠️ 미보장: 같은 record 에 재호출 시 중복 CAR 가능 (CP-3-g 에서 UNIQUE 추가 예정)
 */
export async function postCcpCorrectiveAction(params: {
  batchId: number;
  ccpRecordId: number;
  tenantId: number;
  operatorId: number;
  /** 이탈 정보 (가장 심각한 1건) */
  deviation: Deviation;
  controlPointCode: string;
  productName: string;
  /** PR #133 LOT HOLD 결과 */
  lotsHeld: number;
  /** PR #134 손실분개 결과 */
  lossJournalEntryId?: number;
  lossTotal?: number;
}): Promise<CarResult> {
  const {
    batchId,
    ccpRecordId,
    tenantId,
    operatorId,
    deviation,
    controlPointCode,
    productName,
    lotsHeld,
    lossJournalEntryId,
    lossTotal,
  } = params;

  // 1. env 체크
  if (!isCcpCarEnabled(tenantId)) {
    return {
      posted: false,
      reason: "ENABLE_CCP_CAR 미활성 (env)",
    };
  }

  // 2. CP-3-g 멱등성: 같은 (tenant, source_type='ccp_deviation', source_id=ccpRecordId)
  //    가 이미 존재하면 신규 생성 스킵 (중복 CAR 방지).
  //    DB-level UNIQUE (uniq_car_source) 도 추가됨 — 이 SELECT 는 친절한 메시지를 위한
  //    1차 fence, race condition 발생 시 DB 가 ER_DUP_ENTRY 로 마지막 방어.
  try {
    const db = await getDb();
    if (db) {
      const [existing] = await db
        .select({ id: hCorrectiveActionRequests.id })
        .from(hCorrectiveActionRequests)
        .where(
          and(
            eq(hCorrectiveActionRequests.tenantId, tenantId),
            eq(hCorrectiveActionRequests.sourceType, "ccp_deviation"),
            eq(hCorrectiveActionRequests.sourceId, ccpRecordId),
          ),
        )
        .limit(1);

      if (existing) {
        console.warn(
          `[ccpCorrectiveAction] 멱등성 단축 — recordId=${ccpRecordId} ` +
          `이미 CAR #${existing.id} 존재. 신규 생성 스킵.`,
        );
        return {
          posted: false,
          existingRequestId: Number(existing.id),
          reason: `중복 — 기존 CAR #${existing.id} 존재`,
        };
      }
    }
  } catch (dupErr: any) {
    // 중복 체크 실패 시 — 보수적으로 그냥 진행 (중복 가능성 < 알림 손실)
    console.warn(
      `[ccpCorrectiveAction] 멱등성 체크 실패 (계속 진행) — recordId=${ccpRecordId}: ` +
      `${dupErr?.message ?? dupErr}`,
    );
  }

  // 3. problemDescription 자동 작성 — 운영자가 보는 첫 화면이라 충분히 상세하게
  const limit = deviation.violatedLimit;
  const measurement = deviation.measurement;
  const limitDesc =
    limit.type === "min"
      ? `≥ ${limit.value}${limit.unit ?? ""}`
      : limit.type === "max"
      ? `≤ ${limit.value}${limit.unit ?? ""}`
      : limit.type === "range"
      ? (() => {
          const r = limit.value as { min: number; max: number };
          return `${r.min} ~ ${r.max}${limit.unit ?? ""}`;
        })()
      : limit.type === "boolean"
      ? (limit.value === true ? "통과 (O)" : "실패 (X)")
      : `[${(limit.value as readonly string[]).join(", ")}]`;
  const measurementDesc =
    typeof measurement.value === "boolean"
      ? (measurement.value ? "통과 (O)" : "실패 (X)")
      : typeof measurement.value === "string"
      ? measurement.value
      : `${measurement.value}${limit.unit ?? ""}`;

  const problemDescription =
    `[자동 등록] CCP 이탈로 인한 시정조치 요청\n` +
    `\n` +
    `▣ 이탈 정보\n` +
    `  • CCP: ${controlPointCode}\n` +
    `  • 항목: ${limit.label ?? "?"}\n` +
    `  • 한계: ${limitDesc}\n` +
    `  • 측정값: ${measurementDesc}\n` +
    `  • 심각도: ${deviation.severity}\n` +
    `  • 측정 시각: ${measurement.measuredAt.toISOString()}\n` +
    `  • 제품: ${productName}\n` +
    `  • 배치: #${batchId}\n` +
    `  • 출처 기록: ccp_record #${ccpRecordId}\n` +
    `\n` +
    `▣ 자동 처리 결과\n` +
    `  • LOT HOLD: ${lotsHeld}건 (status='reserved')\n` +
    (lossJournalEntryId
      ? `  • 손실 분개: #${lossJournalEntryId} — ${(lossTotal ?? 0).toLocaleString("ko-KR")}원\n`
      : `  • 손실 분개: 미생성 (env 비활성 또는 가치 0)\n`) +
    `\n` +
    `▣ 다음 조치 (담당자 입력 필요)\n` +
    `  1. 즉시 조치 — 영향 LOT 안전 검사\n` +
    `  2. 근본 원인 분석 — 설비/원재료/공정/인적 등\n` +
    `  3. 시정 조치 — 재발 방지 계획\n` +
    `  4. 효과 검증 — 후속 측정 결과 확인`;

  // 4. CAR 생성
  try {
    const requestId = await createCorrectiveActionFromCcpDeviation(
      {
        ccpInstanceId: ccpRecordId, // ccp_monitoring_records.id 를 source 로 매핑
        batchId,
        problemDescription,
        detectedBy: operatorId,
        priority: severityToCarPriority(deviation.severity),
      },
      tenantId,
    );

    console.warn(
      `[ccpCorrectiveAction] 자동 CAR 생성 — requestId=${requestId} ` +
      `batchId=${batchId} severity=${deviation.severity} priority=${severityToCarPriority(deviation.severity)}`,
    );

    return {
      posted: true,
      requestId: Number(requestId),
    };
  } catch (err: any) {
    console.warn(
      `[ccpCorrectiveAction] CAR 생성 실패 (안전 무시) — batchId=${batchId}: ${err?.message ?? err}`,
    );
    return {
      posted: false,
      reason: `INSERT 실패: ${err?.message ?? err}`,
    };
  }
}
