/**
 * AI 보고서 내러티브 자동 작성
 *
 * 숫자 보고서 → AI가 자연어 분석 코멘트 자동 생성
 * - 재무보고서 해석
 * - 생산 보고서 해석
 * - HACCP 종합 보고서
 */

import { invokeLLM } from "../../_core/llm";
import { ENV } from "../../_core/env";
import { getRawConnection } from "../connection";
import { getDailyOverview, getChecklistStatus, getAuditReadiness } from "./aiContextLayer";

import { toKSTDate, todayKST } from "../../utils/timezone";

// ============================================================================
// 타입 정의
// ============================================================================

export type NarrativeType =
  | "financial_monthly"
  | "financial_quarterly"
  | "production_daily"
  | "production_weekly"
  | "haccp_weekly"
  | "haccp_monthly"
  | "executive_summary";

export type ReportNarrative = {
  type: NarrativeType;
  title: string;
  period: string;
  narrative: string;
  highlights: string[];
  concerns: string[];
  recommendations: string[];
  generatedAt: string;
};

// ============================================================================
// 재무 보고서 내러티브
// ============================================================================

export async function generateFinancialNarrative(
  tenantId: number,
  period: { startDate: string; endDate: string },
  type: "monthly" | "quarterly" = "monthly"
): Promise<ReportNarrative> {
  const conn = await getRawConnection();

  // 기간 재무 데이터
  const [rows] = await conn.execute(
    `SELECT
       aa.category,
       aa.name as accountName,
       SUM(ejl.debit_amount) as debit,
       SUM(ejl.credit_amount) as credit
     FROM expense_journal_lines ejl
     JOIN expense_journal_entries eje ON eje.id = ejl.journal_entry_id
     JOIN accounting_accounts aa ON aa.id = ejl.account_id AND aa.tenant_id = ?
     WHERE eje.tenant_id = ? AND eje.entry_date BETWEEN ? AND ?
     GROUP BY aa.category, aa.name
     ORDER BY aa.category, SUM(ejl.debit_amount + ejl.credit_amount) DESC`,
    [tenantId, tenantId, period.startDate, period.endDate]
  );

  const data = rows as any[];

  // 전기 비교 (같은 기간)
  const durationMs = new Date(period.endDate).getTime() - new Date(period.startDate).getTime();
  const prevStart = toKSTDate(new Date(new Date(period.startDate).getTime() - durationMs - 86400000));
  const prevEnd = toKSTDate(new Date(new Date(period.startDate).getTime() - 86400000));

  const [prevRows] = await conn.execute(
    `SELECT
       aa.category,
       SUM(CASE WHEN aa.category = 'revenue' THEN ejl.credit_amount ELSE 0 END) as revenue,
       SUM(CASE WHEN aa.category = 'expenses' THEN ejl.debit_amount ELSE 0 END) as expenses
     FROM expense_journal_lines ejl
     JOIN expense_journal_entries eje ON eje.id = ejl.journal_entry_id
     JOIN accounting_accounts aa ON aa.id = ejl.account_id AND aa.tenant_id = ?
     WHERE eje.tenant_id = ? AND eje.entry_date BETWEEN ? AND ?
     GROUP BY aa.category`,
    [tenantId, tenantId, prevStart, prevEnd]
  );

  if (!ENV.forgeApiKey) {
    return {
      type: type === "monthly" ? "financial_monthly" : "financial_quarterly",
      title: `${type === "monthly" ? "월간" : "분기"} 재무 보고서`,
      period: `${period.startDate} ~ ${period.endDate}`,
      narrative: "AI 서비스가 설정되지 않았습니다.",
      highlights: [], concerns: [], recommendations: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `당신은 식품제조업 전문 회계사입니다. 재무 데이터를 분석하여 경영진 보고서를 작성하세요.

## 출력 형식 (JSON)
{
  "narrative": "3~5문단의 재무 분석 내러티브 (마크다운)",
  "highlights": ["긍정적 지표 1", "긍정적 지표 2"],
  "concerns": ["우려 사항 1"],
  "recommendations": ["권장 사항 1"]
}`,
      },
      {
        role: "user",
        content: `기간: ${period.startDate} ~ ${period.endDate}
계정별 데이터: ${JSON.stringify(data)}
전기 비교: ${JSON.stringify(prevRows)}`,
      },
    ],
    maxTokens: 1500,
    responseFormat: { type: "json_object" },
  });

  const text = typeof result.choices[0]?.message?.content === "string"
    ? result.choices[0].message.content : "{}";
  const parsed = JSON.parse(text);

  return {
    type: type === "monthly" ? "financial_monthly" : "financial_quarterly",
    title: `${type === "monthly" ? "월간" : "분기"} 재무 분석 보고서`,
    period: `${period.startDate} ~ ${period.endDate}`,
    narrative: parsed.narrative || "",
    highlights: parsed.highlights || [],
    concerns: parsed.concerns || [],
    recommendations: parsed.recommendations || [],
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// HACCP 종합 보고서 내러티브
// ============================================================================

export async function generateHaccpNarrative(
  tenantId: number,
  period: "weekly" | "monthly" = "weekly"
): Promise<ReportNarrative> {
  const days = period === "weekly" ? 7 : 30;
  const startDate = toKSTDate(new Date(Date.now() - days * 86400000));
  const endDate = todayKST();

  // 데이터 수집
  const [overview, checklist, auditReadiness] = await Promise.all([
    getDailyOverview(tenantId),
    getChecklistStatus(tenantId),
    getAuditReadiness(tenantId),
  ]);

  const conn = await getRawConnection();

  // CCP 이탈 현황
  const [ccpStats] = await conn.execute(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN hcr.result = 'FAIL' THEN 1 ELSE 0 END) as fails
     FROM h_ccp_rows hcr
     JOIN h_ccp_instances hci ON hci.id = hcr.instance_id
     WHERE hci.tenant_id = ? AND hci.work_date BETWEEN ? AND ?
       AND hcr.row_type = 'measurement'`,
    [tenantId, startDate, endDate]
  );

  // 시정조치 현황
  const [caStats] = await conn.execute(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN status IN ('closed', 'verified') THEN 1 ELSE 0 END) as resolved
     FROM h_corrective_action_requests
     WHERE tenant_id = ? AND created_at BETWEEN ? AND ?`,
    [tenantId, startDate, endDate + " 23:59:59"]
  );

  if (!ENV.forgeApiKey) {
    return {
      type: period === "weekly" ? "haccp_weekly" : "haccp_monthly",
      title: `${period === "weekly" ? "주간" : "월간"} HACCP 보고서`,
      period: `${startDate} ~ ${endDate}`,
      narrative: "AI 서비스가 설정되지 않았습니다.",
      highlights: [], concerns: [], recommendations: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `당신은 HACCP 전문 컨설턴트입니다. HACCP 운영 데이터를 분석하여 종합 보고서를 작성하세요.

## 출력 형식 (JSON)
{
  "narrative": "4~6문단의 HACCP 운영 분석 (마크다운, 수치 포함)",
  "highlights": ["잘된 점 1", "잘된 점 2"],
  "concerns": ["개선 필요사항 1"],
  "recommendations": ["구체적 권장사항 1"]
}`,
      },
      {
        role: "user",
        content: `기간: ${startDate} ~ ${endDate}
일일 종합현황: ${JSON.stringify(overview)}
체크리스트: ${JSON.stringify(checklist)}
감사 대비: ${JSON.stringify(auditReadiness)}
CCP: 총 ${(ccpStats as any[])[0]?.total || 0}건 중 이탈 ${(ccpStats as any[])[0]?.fails || 0}건
시정조치: 총 ${(caStats as any[])[0]?.total || 0}건 중 해결 ${(caStats as any[])[0]?.resolved || 0}건`,
      },
    ],
    maxTokens: 1500,
    responseFormat: { type: "json_object" },
  });

  const text = typeof result.choices[0]?.message?.content === "string"
    ? result.choices[0].message.content : "{}";
  const parsed = JSON.parse(text);

  return {
    type: period === "weekly" ? "haccp_weekly" : "haccp_monthly",
    title: `${period === "weekly" ? "주간" : "월간"} HACCP 종합 보고서`,
    period: `${startDate} ~ ${endDate}`,
    narrative: parsed.narrative || "",
    highlights: parsed.highlights || [],
    concerns: parsed.concerns || [],
    recommendations: parsed.recommendations || [],
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 경영진 요약 보고서
// ============================================================================

export async function generateExecutiveSummary(tenantId: number): Promise<ReportNarrative> {
  const { generatePredictions } = await import("./aiPrediction");
  const { detectAnomalies } = await import("./aiAnomalyDetection");

  const [overview, auditReadiness, predictions, anomalies] = await Promise.all([
    getDailyOverview(tenantId),
    getAuditReadiness(tenantId),
    generatePredictions(tenantId).catch(() => ({ predictions: [] })),
    detectAnomalies(tenantId).catch(() => ({ anomalies: [], criticalCount: 0 })),
  ]);

  if (!ENV.forgeApiKey) {
    return {
      type: "executive_summary",
      title: "경영진 요약 보고서",
      period: todayKST(),
      narrative: "AI 서비스가 설정되지 않았습니다.",
      highlights: [], concerns: [], recommendations: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `당신은 식품제조업 경영 컨설턴트입니다. HACCP/ERP 데이터를 기반으로 경영진이 5분 안에 읽을 수 있는 핵심 요약을 작성하세요.

## 출력 형식 (JSON)
{
  "narrative": "경영진 요약 (마크다운, 핵심만 3~4문단)",
  "highlights": ["핵심 성과 1~3개"],
  "concerns": ["주의 사항 1~3개"],
  "recommendations": ["즉시 실행 가능한 조치 1~3개"]
}`,
      },
      {
        role: "user",
        content: `오늘 현황: ${JSON.stringify(overview)}
감사 대비: 종합 ${auditReadiness.overallScore}점 (${auditReadiness.overallGrade})
예측: ${predictions.predictions.slice(0, 5).map((p) => `[${p.riskLevel}] ${p.title}`).join("; ")}
이상탐지: ${anomalies.anomalies.slice(0, 5).map((a) => `[${a.severity}] ${a.title}`).join("; ")}`,
      },
    ],
    maxTokens: 1200,
    responseFormat: { type: "json_object" },
  });

  const text = typeof result.choices[0]?.message?.content === "string"
    ? result.choices[0].message.content : "{}";
  const parsed = JSON.parse(text);

  return {
    type: "executive_summary",
    title: "경영진 일일 요약 보고서",
    period: todayKST(),
    narrative: parsed.narrative || "",
    highlights: parsed.highlights || [],
    concerns: parsed.concerns || [],
    recommendations: parsed.recommendations || [],
    generatedAt: new Date().toISOString(),
  };
}
