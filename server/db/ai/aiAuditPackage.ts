/**
 * AI 감사 자료 자동 생성
 *
 * HACCP 감사 대비 종합 패키지:
 * 1. 감사 준비 상태 AI 분석
 * 2. 취약점 자동 식별 + 개선안 생성
 * 3. 감사 체크리스트 자동 생성 (항목별 증빙자료 매핑)
 * 4. 감사 시뮬레이션 (예상 질문 + 모범 답변)
 */

import { invokeLLM } from "../../_core/llm";
import { ENV } from "../../_core/env";
import { getRawConnection } from "../connection";
import { getAuditReadiness, getDeviationHistory, getChecklistStatus, getEquipmentHealth } from "./aiContextLayer";

// ============================================================================
// 타입 정의
// ============================================================================

export type AuditCheckItem = {
  category: string;
  item: string;
  status: "pass" | "warning" | "fail" | "unknown";
  evidence: string;
  recommendation?: string;
};

export type AuditSimulationQA = {
  category: string;
  question: string;
  modelAnswer: string;
  keyPoints: string[];
  relatedEvidence: string;
};

export type AuditPackageResult = {
  tenantId: number;
  generatedAt: string;
  readinessScore: number;
  readinessGrade: string;
  executiveSummary: string;
  checkItems: AuditCheckItem[];
  weaknesses: Array<{ area: string; detail: string; improvement: string; priority: "high" | "medium" | "low" }>;
  simulationQA: AuditSimulationQA[];
  documentList: Array<{ document: string; status: string; location: string }>;
};

// ============================================================================
// 감사 패키지 생성
// ============================================================================

export async function generateAuditPackage(
  tenantId: number,
  auditType: "haccp_certification" | "haccp_renewal" | "regular_audit" = "regular_audit"
): Promise<AuditPackageResult> {
  const conn = await getRawConnection();

  // 데이터 수집 (병렬)
  const [readiness, deviations, checklist, equipment] = await Promise.all([
    getAuditReadiness(tenantId),
    getDeviationHistory(tenantId, { limit: 20 }),
    getChecklistStatus(tenantId),
    getEquipmentHealth(tenantId),
  ]);

  // 추가 데이터
  const [trainings] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM h_training_schedules
     WHERE tenant_id = ? AND training_date >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)`,
    [tenantId]
  );
  const [documents] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM documents
     WHERE tenant_id = ? AND status = 'approved'
       AND created_at >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)`,
    [tenantId]
  );

  const contextData = {
    readiness,
    deviations: deviations.slice(0, 10),
    checklist,
    equipment: {
      total: equipment.totalEquipment,
      calibrationOverdue: equipment.calibrationOverdue,
      temperatureAbnormal: equipment.temperatureAbnormal,
    },
    trainingCount: (trainings as any[])[0]?.cnt || 0,
    approvedDocuments: (documents as any[])[0]?.cnt || 0,
    auditType,
  };

  if (!ENV.forgeApiKey) {
    return {
      tenantId,
      generatedAt: new Date().toISOString(),
      readinessScore: readiness.overallScore,
      readinessGrade: readiness.overallGrade,
      executiveSummary: "AI 서비스가 설정되지 않았습니다.",
      checkItems: [],
      weaknesses: [],
      simulationQA: [],
      documentList: [],
    };
  }

  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `당신은 HACCP 인증 심사원 출신 컨설턴트입니다.
제공된 데이터를 기반으로 ${auditType === "haccp_certification" ? "HACCP 인증" : auditType === "haccp_renewal" ? "HACCP 갱신" : "정기"} 감사 대비 종합 패키지를 생성하세요.

## 출력 형식 (JSON)
{
  "executiveSummary": "감사 준비 상태 종합 평가 (3~5문장)",
  "checkItems": [
    {"category":"CCP관리","item":"CCP 모니터링 기록 완전성","status":"pass|warning|fail","evidence":"근거","recommendation":"개선안(필요시)"}
  ],
  "weaknesses": [
    {"area":"영역","detail":"취약점 상세","improvement":"구체적 개선방안","priority":"high|medium|low"}
  ],
  "simulationQA": [
    {"category":"카테고리","question":"심사원 예상 질문","modelAnswer":"모범 답변","keyPoints":["핵심 포인트1"],"relatedEvidence":"관련 증빙"}
  ],
  "documentList": [
    {"document":"필요 문서명","status":"있음|미확인|없음","location":"보관 위치"}
  ]
}

감사 유형별 중점:
- 인증: 12절차 전체 이행 증빙
- 갱신: 지속적 개선 활동 증빙
- 정기: 일상 관리 실태`,
      },
      {
        role: "user",
        content: JSON.stringify(contextData),
      },
    ],
    maxTokens: 3000,
    responseFormat: { type: "json_object" },
  });

  const text = typeof result.choices[0]?.message?.content === "string"
    ? result.choices[0].message.content : "{}";

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = {};
  }

  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    readinessScore: readiness.overallScore,
    readinessGrade: readiness.overallGrade,
    executiveSummary: parsed.executiveSummary || "",
    checkItems: parsed.checkItems || [],
    weaknesses: parsed.weaknesses || [],
    simulationQA: parsed.simulationQA || [],
    documentList: parsed.documentList || [],
  };
}
