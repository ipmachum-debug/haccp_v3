/**
 * 식품 CCP 어댑터 — ccp_limits → ControlPoint 변환
 *
 * ============================================================================
 * Layer 4 (industry / food) — 식품 HACCP 어댑터.
 *
 * 책임:
 *   ccp_limits 테이블 (식품 전용 스키마, 식품 가열 / 금속검출 등) 의 row 를
 *   업종 무관 ControlPoint entity 로 변환한다.
 *
 * Port (interface) 가 아닌 직접 함수 — 신규 업종 추가 시 동일 패턴 복제.
 * 향후 어댑터 3개 이상 (food / cosmetic / pharma) 시 Port 추출 권장.
 *
 * 트리거: PR #119 ControlPoint 추상화 설계 / PR #122 CP-1 entity 구현 후속
 *
 * 의존:
 *   - server/core-mes/quality (Layer 2) — 정상 방향 (industry → core)
 *   - drizzle/schema — 스키마 import
 *   - server/db (DB 접근) — 의존성 룰 OK
 *
 * 절대 import 금지 (ADR-002):
 *   - 다른 industry/* (cosmetic, pharma 등)
 *   - server/addon/*
 * ============================================================================
 */

import { eq } from "drizzle-orm";
import type {
  ControlPoint,
  CriticalLimit,
  MonitoringFrequency,
} from "../../../core-mes/quality";
import { ccpLimits } from "../../../../drizzle/schema/ccpMonitoring";
import { getDb } from "../../../db";

/** ccp_limits row 타입 (Drizzle 추론) */
type CcpLimitRow = typeof ccpLimits.$inferSelect;

/**
 * monitoringFrequency 텍스트 → MonitoringFrequency enum 매핑.
 *
 * 식품 운영에서 자주 등장하는 한국어 표현을 매핑.
 * 매칭 안 되면 ad_hoc (안전 기본값).
 */
function mapFrequency(raw: string | null | undefined): MonitoringFrequency {
  if (!raw) return "ad_hoc";
  const lower = raw.toLowerCase();
  if (lower.includes("연속") || lower.includes("continuous")) return "continuous";
  if (lower.includes("배치") || lower.includes("batch")) return "every_batch";
  if (lower.includes("시간") || lower.includes("hourly")) return "hourly";
  if (lower.includes("매일") || lower.includes("daily") || lower.includes("일별")) return "daily";
  if (lower.includes("주") || lower.includes("weekly")) return "weekly";
  if (lower.includes("월") || lower.includes("monthly")) return "monthly";
  return "ad_hoc";
}

/**
 * ccpType 코드 → 카테고리 매핑.
 *
 * 식품 HACCP 표준 분류:
 *   - 1B: 가열공정 (Biological 통제)
 *   - 2B: 가열 (Biological)
 *   - 3B: 살균/멸균 (Biological)
 *   - 4P: 금속검출 (Physical)
 */
function mapCategory(ccpType: string): string {
  const upper = ccpType.toUpperCase();
  if (upper.endsWith("4P")) return "금속검출";
  if (upper.endsWith("B")) return "가열공정";
  if (upper.endsWith("C")) return "화학적 통제";
  return "공정관리";
}

/**
 * ccp_limits row → CriticalLimit[] 변환.
 *
 * 컬럼별 매핑:
 *   - temperatureCMin (NOT NULL 가능) → { type: "min", value, unit: "°C" }
 *   - heatingTimeMinMin / Max 둘 다 있으면 → { type: "range", value, unit: "분" }
 *     하나만 있으면 → { type: "min" } 또는 { type: "max" }
 *   - pressureMpaMin → { type: "min", value, unit: "Mpa" }
 *
 * 컬럼 NULL 인 항목은 한계기준에 포함하지 않음.
 */
export function mapCcpLimitsToCriticalLimits(row: CcpLimitRow): CriticalLimit[] {
  const limits: CriticalLimit[] = [];

  // 온도 (CCP-1B / CCP-2B 가열공정)
  if (row.temperatureCMin !== null && row.temperatureCMin !== undefined) {
    limits.push({
      type: "min",
      value: parseFloat(String(row.temperatureCMin)),
      unit: "°C",
      label: "온도",
    });
  }

  // 가열 시간 (range 또는 min/max)
  const tMin = row.heatingTimeMinMin;
  const tMax = row.heatingTimeMinMax;
  if (tMin !== null && tMin !== undefined && tMax !== null && tMax !== undefined) {
    limits.push({
      type: "range",
      value: { min: tMin, max: tMax },
      unit: "분",
      label: "가열시간",
    });
  } else if (tMin !== null && tMin !== undefined) {
    limits.push({ type: "min", value: tMin, unit: "분", label: "가열시간 min" });
  } else if (tMax !== null && tMax !== undefined) {
    limits.push({ type: "max", value: tMax, unit: "분", label: "가열시간 max" });
  }

  // 압력 (CCP-1B 만)
  if (row.pressureMpaMin !== null && row.pressureMpaMin !== undefined) {
    limits.push({
      type: "min",
      value: parseFloat(String(row.pressureMpaMin)),
      unit: "Mpa",
      label: "압력",
    });
  }

  return limits;
}

/**
 * ccp_limits row → ControlPoint 변환 (pure function, DB 무관).
 *
 * 주: id 가 number 가 아닌 row 도 안전 처리.
 */
export function mapCcpLimitToControlPoint(row: CcpLimitRow): ControlPoint {
  return {
    id: Number(row.id),
    tenantId: Number(row.tenantId),
    code: row.ccpType,
    category: mapCategory(row.ccpType),
    limits: mapCcpLimitsToCriticalLimits(row),
    monitoringFrequency: mapFrequency(row.monitoringFrequency),
    // 식품 HACCP 의 표준 책임자 — 실제 운영에서는 별도 마스터 테이블 매핑 가능
    responsibleRole: "QA",
    isActive: true,
    // 식품 CCP 는 critical 기본값 — 한계 이탈 시 즉시 LOT HOLD + 시정조치
    defaultSeverity: "critical",
  };
}

/**
 * 특정 tenant 의 식품 CCP 모두를 ControlPoint 로 반환.
 *
 * Phase 2 (화장품) 진입 시 cosmeticCqpAdapter.list() 와 동일 형태로
 * 호출 가능 — 본 함수는 그 패턴의 식품 구현체.
 *
 * @param tenantId 테넌트 ID
 * @returns ControlPoint 배열
 */
export async function listFoodControlPoints(tenantId: number): Promise<ControlPoint[]> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const rows = await db
    .select()
    .from(ccpLimits)
    .where(eq(ccpLimits.tenantId, tenantId));

  return rows.map(mapCcpLimitToControlPoint);
}
