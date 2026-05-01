/**
 * core-mes (Layer 2) 라우터 통합 맵 — Phase Y-2 진입점
 *
 * 작성: 2026-04-30 — Phase Y-2-0-b (Change Control 첫 라우터).
 * 갱신: 2026-04-30 — Phase Y-2-1-b (Nonconforming 추가).
 * 갱신: 2026-05-01 — Phase Y-2-2 (CAPA 풀스택 단일 PR).
 * 갱신: 2026-05-01 — Phase Y-2-3 (Audit 풀스택 단일 PR — Phase Y-2 4개 entity 완성).
 *
 * 정책 (ADR-002 + ADR-003):
 *   - core-mes 라우터는 industry 무관 단일 entity
 *   - 모든 endpoint 가 industry 컨텍스트 (z.enum) 명시 — view filter 강제
 *   - 신규 industry 진입 시 라우터 변경 0 (테이블 ENUM 만 ALTER)
 */

import { changeControlRouter } from "../coreMes/quality/changeControl.router";
import { nonconformingRouter } from "../coreMes/quality/nonconforming.router";
import { correctiveActionRouter } from "../coreMes/quality/correctiveAction.router";
import { auditRouter } from "../coreMes/quality/audit.router";
import { trainingRouter } from "../coreMes/quality/training.router";
import { calibrationRouter } from "../coreMes/quality/calibration.router";
import { supplierRouter } from "../coreMes/quality/supplier.router";

export const coreMesRouterMap = {
  /** Change Control (변경관리) — Phase Y-2-0-b */
  changeControl: changeControlRouter,

  /** Nonconforming (부적합) — Phase Y-2-1-b */
  nonconforming: nonconformingRouter,

  /**
   * CAPA (Corrective + Preventive Action) — Phase Y-2-2
   *
   * 단일 테이블 h_corrective_actions + industry view filter.
   * Nonconforming (h_nonconformings) 와 양방향 FK 연계.
   */
  correctiveAction: correctiveActionRouter,

  /**
   * Audit (감사) — Phase Y-2-3
   *
   * 단일 테이블 h_audits + findings JSON array + industry view filter.
   * internal / supplier / external 3종.
   * Findings 의 correctiveActionId 가 CAPA (Y-2-2) 와 연계.
   */
  audit: auditRouter,

  /**
   * Training (교육/훈련) — Phase Y-3
   *
   * 단일 테이블 h_trainings + attendees JSON array + industry view filter.
   * internal / external / on_the_job / regulatory 4종.
   * KGMP §6 / ISO 22716 §7 / ISO 13485 §6.2 모두 적용.
   */
  training: trainingRouter,

  /**
   * Calibration (검교정/설비 자격) — Phase Y-4
   *
   * 단일 테이블 h_calibrations + measurements JSON + nextDueDate 자동 계산.
   * IQ / OQ / PQ / routine 4종.
   * KGMP §7 / ISO 13485 §7.6 모두 적용.
   */
  calibration: calibrationRouter,

  /**
   * Supplier (공급업체 관리 AVL) — Phase Y-5
   *
   * 단일 테이블 h_suppliers + nextEvaluationDate 자동 계산.
   * raw_material / packaging / equipment / service / other 5종.
   * KGMP §11 / ISO 13485 §7.4 / HACCP 원료공급자 평가 모두 적용.
   */
  supplier: supplierRouter,
} as const;
