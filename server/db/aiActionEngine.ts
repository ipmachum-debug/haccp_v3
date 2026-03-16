/**
 * AI Action Engine - 자연어 질의 → DB조회 + 규칙 + LLM 파이프라인
 *
 * 핵심 구조:
 *   User Question
 *     ↓
 *   Intent Classification (의도 분류)
 *     ↓
 *   DB Query + Rules Engine (데이터 수집)
 *     ↓
 *   Context Builder (AI용 컨텍스트 조립)
 *     ↓
 *   LLM (응답 생성)
 *
 * 지원 의도:
 * - risk_check:       "오늘 위험한 항목 뭐야?"
 * - ccp_summary:      "이번주 CCP 이탈 요약해줘"
 * - checklist_status: "오늘 체크리스트 현황"
 * - batch_analysis:   "배치 B-001 분석해줘"
 * - deviation_history:"최근 부적합 이력"
 * - equipment_status: "설비 상태 알려줘"
 * - audit_prep:       "감사 준비 상태"
 * - corrective_draft: "시정조치서 써줘"
 * - temperature_check:"냉장고 온도 이상 있었어?"
 * - production_analysis: "왜 수율 떨어졌지?"
 * - general:          일반 HACCP 질문
 */

import { invokeLLM } from "../_core/llm";
import { ENV } from "../_core/env";
import {
  getDailyOverview,
  getCcpEventSummary,
  getChecklistStatus,
  getBatchSummary,
  getDeviationHistory,
  getEquipmentHealth,
  getProductionAnalysis,
  getAuditReadiness,
} from "./aiContextLayer";
import { evaluateAllRules } from "./rulesEngine";
import { getRawConnection } from "../db";

// ============================================================================
// 의도 분류
// ============================================================================

export type UserIntent =
  | "risk_check"
  | "ccp_summary"
  | "checklist_status"
  | "batch_analysis"
  | "deviation_history"
  | "equipment_status"
  | "audit_prep"
  | "corrective_draft"
  | "temperature_check"
  | "production_analysis"
  | "general";

/** 키워드 기반 의도 분류 (빠르고 저렴) */
export function classifyIntent(message: string): UserIntent {
  const msg = message.toLowerCase();

  // 위험/리스크 체크
  if (/위험|리스크|risk|경고|alert|주의|문제/.test(msg)) return "risk_check";

  // CCP 관련
  if (/ccp|중요관리|온도.*이탈|시간.*이탈|압력.*이탈|금속검출/.test(msg)) return "ccp_summary";

  // 체크리스트
  if (/체크리스트|점검.*누락|미작성|작성.*안|체크.*현황/.test(msg)) return "checklist_status";

  // 배치 분석
  if (/배치.*분석|batch.*분석|배치.*B-|수율.*분석/.test(msg)) return "batch_analysis";

  // 이탈/부적합 이력
  if (/부적합|이탈.*이력|이탈.*요약|불량|deviation|클레임/.test(msg)) return "deviation_history";

  // 설비 상태
  if (/설비|장비|equipment|검교정|교정.*기한/.test(msg)) return "equipment_status";

  // 감사 준비
  if (/감사|점검.*준비|심사|audit|대비/.test(msg)) return "audit_prep";

  // 시정조치
  if (/시정조치|corrective|조치.*작성|조치.*초안/.test(msg)) return "corrective_draft";

  // 온도 체크
  if (/온도|냉장|냉동|보관.*온도|temperature/.test(msg)) return "temperature_check";

  // 생산 분석
  if (/수율.*떨어|수율.*하락|생산.*분석|왜.*수율|production/.test(msg)) return "production_analysis";

  return "general";
}

// ============================================================================
// AI Action Engine 메인 함수
// ============================================================================

export type ActionResult = {
  intent: UserIntent;
  context: Record<string, any>;
  response: string;
  dataSources: string[];
  tokensUsed?: number;
};

/**
 * 사용자 질문을 처리하는 메인 파이프라인
 *
 * 1. 의도 분류
 * 2. DB 데이터 수집
 * 3. 컨텍스트 조립
 * 4. LLM 응답 생성
 */
export async function processUserQuery(
  tenantId: number,
  message: string,
  conversationHistory?: Array<{ role: string; content: string }>
): Promise<ActionResult> {
  // 1. 의도 분류
  const intent = classifyIntent(message);

  // 2. 데이터 수집 (의도에 따라)
  const { context, dataSources } = await gatherContext(tenantId, intent, message);

  // 3. LLM 응답 생성
  if (!ENV.forgeApiKey) {
    return {
      intent,
      context,
      response: "AI 서비스가 설정되지 않았습니다.",
      dataSources,
    };
  }

  const systemPrompt = buildSystemPrompt(intent, context);
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt },
  ];

  // 최근 대화 히스토리 포함 (최대 10개)
  if (conversationHistory) {
    const recent = conversationHistory.slice(-10);
    for (const msg of recent) {
      messages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }
  }

  messages.push({ role: "user", content: message });

  try {
    const result = await invokeLLM({
      messages,
      maxTokens: 2000,
    });

    const response = typeof result.choices[0]?.message?.content === "string"
      ? result.choices[0].message.content
      : "응답을 생성하지 못했습니다.";

    return {
      intent,
      context,
      response,
      dataSources,
      tokensUsed: result.usage?.total_tokens,
    };
  } catch (error: any) {
    console.error("[AI Action Engine Error]", error?.message);
    return {
      intent,
      context,
      response: `데이터 조회는 완료했으나 AI 응답 생성 중 오류가 발생했습니다.\n\n**조회된 데이터:**\n${formatContextAsText(intent, context)}`,
      dataSources,
    };
  }
}

// ============================================================================
// 데이터 수집 (의도별)
// ============================================================================

async function gatherContext(
  tenantId: number,
  intent: UserIntent,
  message: string
): Promise<{ context: Record<string, any>; dataSources: string[] }> {
  const dataSources: string[] = [];
  let context: Record<string, any> = {};

  try {
    switch (intent) {
      case "risk_check": {
        const [overview, rules] = await Promise.all([
          getDailyOverview(tenantId),
          evaluateAllRules(tenantId),
        ]);
        context = {
          overview,
          triggeredRules: rules.filter((r) => r.triggered).map((r) => ({
            code: r.ruleCode,
            severity: r.severity,
            title: r.title,
            message: r.message,
          })),
        };
        dataSources.push("daily_overview", "rules_engine");
        break;
      }

      case "ccp_summary": {
        // 기간 파싱 (이번주, 오늘, 최근 7일 등)
        const { startDate, endDate } = parseDateRange(message);
        const ccpEvents = await getCcpEventSummary(tenantId, { startDate, endDate });
        context = { period: { startDate, endDate }, ccpEvents };
        dataSources.push("ccp_monitoring", "ccp_deviations");
        break;
      }

      case "checklist_status": {
        const status = await getChecklistStatus(tenantId);
        context = { checklist: status };
        dataSources.push("checklist_templates", "checklist_instances");
        break;
      }

      case "batch_analysis": {
        // 배치 코드 추출
        const batchCode = message.match(/B-[\d-]+/i)?.[0];
        if (batchCode) {
          const conn = await getRawConnection();
          const [rows] = await conn.execute(
            `SELECT id FROM h_batches WHERE tenant_id = ? AND batch_code = ?`,
            [tenantId, batchCode]
          );
          const batchId = (rows as any[])[0]?.id;
          if (batchId) {
            const [summary, analysis] = await Promise.all([
              getBatchSummary(tenantId, { batchId }),
              getProductionAnalysis(tenantId, batchId),
            ]);
            context = { batchSummary: summary[0], productionAnalysis: analysis };
            dataSources.push("batch_summary", "production_analysis");
          }
        }
        if (!context.batchSummary) {
          // 최근 배치 표시
          const summaries = await getBatchSummary(tenantId, { limit: 10 });
          context = { recentBatches: summaries };
          dataSources.push("batch_summary");
        }
        break;
      }

      case "deviation_history": {
        const { startDate, endDate } = parseDateRange(message);
        const deviations = await getDeviationHistory(tenantId, { startDate, endDate });
        context = { period: { startDate, endDate }, deviations };
        dataSources.push("ccp_deviations", "corrective_actions", "nonconforming_products");
        break;
      }

      case "equipment_status": {
        const health = await getEquipmentHealth(tenantId);
        context = { equipment: health };
        dataSources.push("equipments", "calibration_records", "temperature_logs");
        break;
      }

      case "audit_prep": {
        const [readiness, overview] = await Promise.all([
          getAuditReadiness(tenantId),
          getDailyOverview(tenantId),
        ]);
        context = { auditReadiness: readiness, overview };
        dataSources.push("audit_readiness", "daily_overview");
        break;
      }

      case "temperature_check": {
        const conn = await getRawConnection();
        const { startDate, endDate } = parseDateRange(message);
        const [logs] = await conn.execute(
          `SELECT location, temperature, humidity, status, log_time, recorded_by
           FROM h_temperature_logs
           WHERE tenant_id = ? AND DATE(log_time) BETWEEN ? AND ?
           ORDER BY log_time DESC LIMIT 50`,
          [tenantId, startDate, endDate]
        );
        const abnormal = (logs as any[]).filter((l) => l.status !== "normal");
        context = {
          period: { startDate, endDate },
          totalLogs: (logs as any[]).length,
          abnormalCount: abnormal.length,
          abnormalLogs: abnormal.slice(0, 20),
          recentLogs: (logs as any[]).slice(0, 10),
        };
        dataSources.push("temperature_logs");
        break;
      }

      case "production_analysis": {
        // 최근 수율 하락 배치 찾기
        const summaries = await getBatchSummary(tenantId, { limit: 20 });
        const lowYield = summaries.filter((b) => b.yieldDeviation > 10);

        if (lowYield.length > 0) {
          const analysis = await getProductionAnalysis(tenantId, lowYield[0].batchId);
          context = { lowYieldBatches: lowYield, detailAnalysis: analysis };
        } else {
          context = { allBatches: summaries.slice(0, 10), message: "수율 이상이 감지된 배치가 없습니다." };
        }
        dataSources.push("batch_summary", "production_analysis");
        break;
      }

      case "corrective_draft": {
        // 최근 이탈 정보를 가져와서 컨텍스트 제공
        const deviations = await getDeviationHistory(tenantId, { limit: 5 });
        context = { recentDeviations: deviations };
        dataSources.push("deviations");
        break;
      }

      default: {
        // 일반 질문: 간단한 현황만
        const overview = await getDailyOverview(tenantId);
        context = { overview };
        dataSources.push("daily_overview");
        break;
      }
    }
  } catch (error: any) {
    console.error(`[AI Context Gather Error] intent=${intent}`, error?.message);
    context = { error: "데이터 조회 중 오류가 발생했습니다." };
  }

  return { context, dataSources };
}

// ============================================================================
// 시스템 프롬프트 빌더
// ============================================================================

function buildSystemPrompt(intent: UserIntent, context: Record<string, any>): string {
  const base = `당신은 HACCP-ONE 시스템의 AI 어시스턴트 "하나"입니다.
식품공장의 HACCP 관리, 생산, 품질, 안전을 담당하는 전문 AI입니다.

## 중요 규칙
1. 반드시 아래 제공된 실제 데이터를 기반으로 답변하세요.
2. 데이터에 없는 내용은 추측하지 말고 "확인 불가"라고 답하세요.
3. 법적/품질 판단은 "참고용"임을 명시하세요.
4. 수치 데이터는 정확히 인용하세요.
5. 핵심을 먼저 말하고, 상세 설명을 이어가세요.
6. 답변은 한국어로, 마크다운 형식으로 작성하세요.

## 현재 시스템 데이터
${JSON.stringify(context, null, 2)}
`;

  const intentInstructions: Record<UserIntent, string> = {
    risk_check: `
## 지시사항: 위험 현황 분석
- 심각도 순서(critical → high → medium → low)로 위험 항목을 정리하세요.
- 각 항목에 대해 즉시 조치가 필요한지 판단하세요.
- 우선순위와 권장 조치를 제안하세요.`,

    ccp_summary: `
## 지시사항: CCP 모니터링 요약
- 기간별 CCP 모니터링 결과를 정리하세요.
- 이탈(FAIL) 건이 있으면 상세히 설명하세요.
- 반복 패턴이 있으면 지적하세요.
- 시정조치 필요 여부를 판단하세요.`,

    checklist_status: `
## 지시사항: 체크리스트 현황
- 완료/미완료/진행중 현황을 정리하세요.
- 미작성 항목은 구체적으로 나열하세요.
- 완료율을 표시하세요.`,

    batch_analysis: `
## 지시사항: 배치 분석
- 배치의 핵심 지표(수율, CCP, 품질)를 정리하세요.
- 리스크 점수와 그 이유를 설명하세요.
- 이상 징후가 있으면 가능한 원인을 분석하세요.`,

    deviation_history: `
## 지시사항: 이탈/부적합 이력
- 최근 이탈/부적합 이력을 심각도 순으로 정리하세요.
- 반복 패턴이 있으면 강조하세요.
- 미해결 건을 명시하세요.`,

    equipment_status: `
## 지시사항: 설비 상태
- 검교정 기한 초과 장비를 우선 표시하세요.
- 온도 이상이 있으면 상세히 설명하세요.
- 즉시 조치가 필요한 항목을 구분하세요.`,

    audit_prep: `
## 지시사항: 감사 대비 상태
- 각 카테고리별 준비 상태를 점수와 함께 정리하세요.
- 미흡한 항목에 대해 구체적 개선 방안을 제안하세요.
- 감사 시 주의해야 할 점을 알려주세요.`,

    corrective_draft: `
## 지시사항: 시정조치 관련
- 사용자가 특정 이탈에 대한 시정조치서를 요청하면 초안을 작성하세요.
- 최근 이탈 데이터를 참고하세요.
- 즉시조치, 근본원인, 시정조치, 재발방지 순서로 작성하세요.`,

    temperature_check: `
## 지시사항: 온도 모니터링
- 이상 온도 기록이 있으면 상세히 설명하세요.
- 기준 범위를 벗어난 시간과 위치를 정리하세요.
- 위험 수준을 판단하세요.`,

    production_analysis: `
## 지시사항: 생산 분석
- 수율 하락 원인을 데이터 기반으로 분석하세요.
- 가능한 원인을 신뢰도 순서로 나열하세요.
- 개선 방안을 제안하세요.`,

    general: `
## 지시사항: 일반 질문
- HACCP 전문 지식과 시스템 데이터를 활용하여 답변하세요.
- 현재 시스템 현황 데이터를 참고하세요.`,
  };

  return base + (intentInstructions[intent] || intentInstructions.general);
}

// ============================================================================
// 헬퍼 함수
// ============================================================================

/** 메시지에서 날짜 범위 파싱 */
function parseDateRange(message: string): { startDate: string; endDate: string } {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  if (/오늘/.test(message)) {
    return { startDate: todayStr, endDate: todayStr };
  }
  if (/이번\s*주|금주/.test(message)) {
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
    return { startDate: monday.toISOString().split("T")[0], endDate: todayStr };
  }
  if (/지난\s*주|전주/.test(message)) {
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - today.getDay() - 6);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    return { startDate: lastMonday.toISOString().split("T")[0], endDate: lastSunday.toISOString().split("T")[0] };
  }
  if (/이번\s*달|이달|금월/.test(message)) {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    return { startDate: firstDay.toISOString().split("T")[0], endDate: todayStr };
  }
  if (/최근\s*(\d+)\s*일/.test(message)) {
    const match = message.match(/최근\s*(\d+)\s*일/);
    const days = parseInt(match![1]);
    const start = new Date(today.getTime() - days * 86400000);
    return { startDate: start.toISOString().split("T")[0], endDate: todayStr };
  }
  if (/최근\s*(\d+)\s*개월/.test(message)) {
    const match = message.match(/최근\s*(\d+)\s*개월/);
    const months = parseInt(match![1]);
    const start = new Date(today);
    start.setMonth(start.getMonth() - months);
    return { startDate: start.toISOString().split("T")[0], endDate: todayStr };
  }

  // 기본: 최근 7일
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  return { startDate: weekAgo.toISOString().split("T")[0], endDate: todayStr };
}

/** 컨텍스트를 텍스트로 포맷 (LLM 실패 시 폴백) */
function formatContextAsText(intent: UserIntent, context: Record<string, any>): string {
  try {
    if (intent === "risk_check" && context.overview) {
      const o = context.overview;
      return `리스크 레벨: ${o.riskLevel}\nCCP 이탈: ${o.ccp?.failCount || 0}건\n체크리스트 미작성: ${o.checklist?.notStarted || 0}건\n검교정 초과: ${o.equipment?.calibrationOverdue || 0}건`;
    }
    if (intent === "checklist_status" && context.checklist) {
      const c = context.checklist;
      return `완료율: ${c.completionRate}%\n완료: ${c.completed}건\n미작성: ${c.notStarted}건\n진행중: ${c.inProgress}건`;
    }
    return JSON.stringify(context, null, 2).slice(0, 2000);
  } catch {
    return "데이터 포맷 오류";
  }
}
