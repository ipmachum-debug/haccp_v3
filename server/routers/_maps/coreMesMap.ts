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
import { qualitySupplierRouter } from "../coreMes/quality/supplier.router";
import { riskAssessmentRouter } from "../coreMes/quality/riskAssessment.router";
import { foodDefenseRouter } from "../coreMes/quality/foodDefense.router";
import { foodFraudRouter } from "../coreMes/quality/foodFraud.router";
import { foodSafetyCultureRouter } from "../coreMes/quality/foodSafetyCulture.router";
import { allergenRouter } from "../coreMes/quality/allergen.router";
import { environmentalMonitoringRouter } from "../coreMes/quality/environmentalMonitoring.router";

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
   * Quality Supplier (AVL — Approved Vendor List) — Phase Y-5
   *
   * 단일 테이블 h_quality_suppliers + nextEvaluationDate 자동 계산.
   * raw_material / packaging / equipment / service / other 5종.
   * KGMP §11 / ISO 13485 §7.4 / HACCP 원료공급자 평가 모두 적용.
   *
   * 명명 주의: 기존 master.supplier (거래처) 와 도메인 분리.
   *   - master.supplier      → 거래처 (매입·매출 파트너 등록부, 영업/회계 도메인)
   *   - coreMes.qualitySupplier → AVL (품질 평가 + 승인 공급자 목록, 품질 도메인)
   * 두 시스템은 영구 공존 (다른 개념).
   */
  qualitySupplier: qualitySupplierRouter,

  /**
   * Risk Assessment (위험 평가) — Phase Y-6
   *
   * 단일 테이블 h_risk_assessments + mitigations JSON.
   * probability × severity (1~5 × 1~5) → score (1~25).
   * ICH Q9 (Pharma) / ISO 14971 (Med Device) / Codex (HACCP) / KGMP §3.5 적용.
   * Mitigations 의 correctiveActionId 가 CAPA (Y-2-2) 와 연계.
   */
  riskAssessment: riskAssessmentRouter,

  /**
   * Food Defense (식품 방어 / TACCP) — Phase Y-7
   *
   * 단일 테이블 h_food_defense_assessments + countermeasures JSON.
   * likelihood × impact (1~5 × 1~5) → threat score (1~25).
   * FSSC 22000 v6 §2.5.3 Food Defense / PAS 96 TACCP.
   * Countermeasures 의 correctiveActionId 가 CAPA (Y-2-2) 와 연계.
   *
   * riskAssessment(Y-6, 우발적 위해/HACCP) 와 도메인 구분:
   *   - riskAssessment → 위해 분석 (우발적)
   *   - foodDefense    → 위협 평가 (고의적)
   */
  foodDefense: foodDefenseRouter,

  /**
   * Food Fraud (식품 사기 취약성 / VACCP) — Phase Y-8
   *
   * 단일 테이블 h_food_fraud_assessments + controlMeasures JSON.
   * likelihood × impact (1~5 × 1~5) → vulnerability score (1~25).
   * FSSC 22000 v6 §2.5.4 Food Fraud Mitigation / GFSI VACCP.
   * ControlMeasures 의 correctiveActionId 가 CAPA (Y-2-2) 와 연계.
   *
   * foodDefense(Y-7, TACCP) 와 도메인 구분:
   *   - foodDefense → 고의적 위해 (사람을 해치려는 의도)
   *   - foodFraud   → 경제적 사기 (돈을 벌려는 의도, EMA)
   */
  foodFraud: foodFraudRouter,

  /**
   * Food Safety Culture (식품안전문화) — Phase Y-9
   *
   * 단일 테이블 h_food_safety_culture_assessments + dimensionScores/improvementActions JSON.
   * 6개 차원(리더십/소통/인식/책임/자원/지속개선) 각 1~5 → 종합점수(평균) → 성숙도 등급.
   * FSSC 22000 v6 §2.5.1 Food Safety and Quality Culture / GFSI.
   * 리스크 스코어링이 아닌 문화 성숙도 진단 + 개선활동 추적.
   */
  foodSafetyCulture: foodSafetyCultureRouter,

  /**
   * Allergen Management (알레르겐 관리) — Phase Y-11
   *
   * 단일 테이블 h_allergen_assessments + present/crossContact/controlMeasures JSON.
   * 식약처 알레르기 유발물질 표시대상(19품목) 카탈로그 기준.
   * 품목/원료별 의도적 함유 + 교차오염(may contain) + 통제수단 + 표시문구 관리.
   * 식약처 표시기준 / FSSC 22000 / Codex CXC 80-2020.
   */
  allergen: allergenRouter,

  /**
   * Environmental Monitoring (환경 모니터링 / EMP) — Phase Y-12
   *
   * 단일 테이블 h_environmental_monitoring — Zone(1~4) 기반 채취 지점별
   * 병원균(Listeria/Salmonella)/지표균/ATP 검사 결과(pass/fail/pending) 기록 + 부적합 시정조치.
   * FSSC 22000 / Codex CXC 1-1969. correctiveActionId 로 CAPA(Y-2-2) 연계.
   */
  environmentalMonitoring: environmentalMonitoringRouter,
} as const;
