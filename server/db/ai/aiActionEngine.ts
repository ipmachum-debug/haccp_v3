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

import { invokeLLM } from "../../_core/llm";
import { ENV } from "../../_core/env";
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
import { getRawConnection } from "../connection";
import { buildKnowledgeContext } from "./knowledgeBase";

import { formatLocalDate, todayKST } from "../../utils/timezone";

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
  | "prediction"
  | "anomaly_detection"
  // ERP AI intents
  | "expense_query"
  | "cashflow_query"
  | "payment_risk_query"
  | "purchase_recommend"
  | "shortage_predict"
  | "cost_anomaly"
  | "journal_query"
  | "financial_summary"
  | "training_query"
  | "general";

/** 키워드 기반 의도 분류 (폴백용) */
export function classifyIntentKeyword(message: string): UserIntent {
  const msg = message.toLowerCase();

  if (/위험|리스크|risk|경고|alert|주의|문제/.test(msg)) return "risk_check";
  if (/ccp|중요관리|온도.*이탈|시간.*이탈|압력.*이탈|금속검출/.test(msg)) return "ccp_summary";
  if (/체크리스트|점검.*누락|미작성|작성.*안|체크.*현황/.test(msg)) return "checklist_status";
  if (/배치.*분석|batch.*분석|배치.*B-|수율.*분석/.test(msg)) return "batch_analysis";
  if (/부적합|이탈.*이력|이탈.*요약|불량|deviation|클레임/.test(msg)) return "deviation_history";
  if (/설비|장비|equipment|검교정|교정.*기한/.test(msg)) return "equipment_status";
  if (/감사|점검.*준비|심사|audit|대비/.test(msg)) return "audit_prep";
  if (/시정조치|corrective|조치.*작성|조치.*초안/.test(msg)) return "corrective_draft";
  if (/온도|냉장|냉동|보관.*온도|temperature/.test(msg)) return "temperature_check";
  if (/수율.*떨어|수율.*하락|생산.*분석|왜.*수율|production/.test(msg)) return "production_analysis";
  if (/예측|forecast|전망|추세|트렌드|앞으로/.test(msg)) return "prediction";
  if (/이상.*탐지|anomal|패턴.*이상|비정상/.test(msg)) return "anomaly_detection";

  // ERP intents
  if (/비용|지출|경비|전표|expense|매입.*비용/.test(msg)) return "expense_query";
  if (/현금.*흐름|캐시.*플로|자금|현금.*잔고|cashflow|통장.*잔고/.test(msg)) return "cashflow_query";
  if (/연체|미수|미지급|ap.*ar|외상|결제.*기한|수금/.test(msg)) return "payment_risk_query";
  if (/분개|journal|회계.*오류|대차|차변|대변|전기/.test(msg)) return "journal_query";
  if (/매출|수익|손익|재무|이익|margin|profit|매출.*현황/.test(msg)) return "financial_summary";
  if (/발주.*추천|뭐.*주문|부족.*원재료|재고.*발주|order.*recommend/.test(msg)) return "purchase_recommend";
  if (/재고.*부족|재고.*예측|소진.*예상|shortage|언제.*떨어/.test(msg)) return "shortage_predict";
  if (/원가.*이상|단가.*상승|원가율|cost.*anomal|왜.*비싸/.test(msg)) return "cost_anomaly";

  // Training intent
  if (/교육|훈련|이수|5분.*haccp|오늘.*교육|교육.*완료|교육.*현황|training/.test(msg)) return "training_query";

  return "general";
}

/** 엔티티 추출 결과 */
export type ExtractedEntities = {
  dateRange?: { startDate: string; endDate: string };
  batchCode?: string;
  productName?: string;
  equipmentName?: string;
  temperature?: number;
};

/** LLM 기반 의도 분류 + 엔티티 추출 */
export async function classifyIntentAI(message: string): Promise<{
  intent: UserIntent;
  entities: ExtractedEntities;
  confidence: number;
}> {
  if (!ENV.forgeApiKey) {
    return { intent: classifyIntentKeyword(message), entities: {}, confidence: 0.5 };
  }

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `당신은 HACCP 시스템의 의도 분류기입니다.
사용자 메시지를 분석하여 의도(intent)와 엔티티를 추출하세요.

가능한 intent:
- risk_check: 위험/리스크/경고 관련
- ccp_summary: CCP 모니터링/이탈 관련
- checklist_status: 체크리스트 현황
- batch_analysis: 배치/LOT 분석
- deviation_history: 이탈/부적합 이력
- equipment_status: 설비/장비 상태
- audit_prep: 감사/심사 대비
- corrective_draft: 시정조치서 작성
- temperature_check: 온도 모니터링
- production_analysis: 생산/수율 분석
- prediction: 예측/전망/트렌드
- anomaly_detection: 이상 패턴 탐지
- expense_query: 비용/지출/경비/전표 관련
- cashflow_query: 현금흐름/자금/잔고 관련
- payment_risk_query: 연체/미수/미지급/외상 관련
- journal_query: 분개/회계오류/대차 관련
- financial_summary: 매출/수익/손익/재무 관련
- training_query: 교육/훈련/이수율/오늘의 5분 HACCP 관련
- general: 일반 HACCP/ERP 질문

반드시 아래 JSON 형식으로만 응답하세요:
{"intent":"...","confidence":0.0~1.0,"entities":{"dateRange":null,"batchCode":null,"productName":null,"equipmentName":null,"temperature":null}}`,
        },
        { role: "user", content: message },
      ],
      maxTokens: 200,
      responseFormat: { type: "json_object" },
    });

    const text = typeof result.choices[0]?.message?.content === "string"
      ? result.choices[0].message.content : "{}";
    const parsed = JSON.parse(text);

    const validIntents: UserIntent[] = [
      "risk_check", "ccp_summary", "checklist_status", "batch_analysis",
      "deviation_history", "equipment_status", "audit_prep", "corrective_draft",
      "temperature_check", "production_analysis", "prediction", "anomaly_detection",
      "expense_query", "cashflow_query", "payment_risk_query", "journal_query", "financial_summary",
      "training_query", "general",
    ];

    const intent = validIntents.includes(parsed.intent) ? parsed.intent : classifyIntentKeyword(message);

    return {
      intent,
      entities: parsed.entities || {},
      confidence: parsed.confidence || 0.8,
    };
  } catch (error: any) {
    console.error("[AI Intent Classification Error]", error?.message);
    return { intent: classifyIntentKeyword(message), entities: {}, confidence: 0.5 };
  }
}

/** 하위호환 - 기존 코드에서 classifyIntent 호출 시 키워드 폴백 사용 */
export function classifyIntent(message: string): UserIntent {
  return classifyIntentKeyword(message);
}

// ============================================================================
// AI Action Engine 메인 함수
// ============================================================================

export type ActionResult = {
  intent: UserIntent;
  context: Record<string, any>;
  response: string;
  dataSources: string[];
  knowledgeSources?: Array<{ title: string; docType: string; score: number }>;
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
  // 1. AI 기반 의도 분류 (폴백: 키워드)
  const { intent, entities } = await classifyIntentAI(message);

  // 2. 데이터 수집 + 지식베이스 검색 (병렬)
  const [{ context, dataSources }, knowledgeResult] = await Promise.all([
    gatherContext(tenantId, intent, message),
    buildKnowledgeContext(tenantId, message).catch(() => ({
      hasContext: false, contextText: "", sources: [],
    })),
  ]);

  // 3. LLM 응답 생성
  if (!ENV.forgeApiKey) {
    return {
      intent,
      context,
      response: "AI 서비스가 설정되지 않았습니다.",
      dataSources,
    };
  }

  const systemPrompt = buildSystemPrompt(intent, context, knowledgeResult.contextText);
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
      knowledgeSources: knowledgeResult.sources.length > 0 ? knowledgeResult.sources : undefined,
      tokensUsed: result.usage?.total_tokens,
    };
  } catch (error: any) {
    console.error("[AI Action Engine Error]", error?.message);
    return {
      intent,
      context,
      response: `데이터 조회는 완료했으나 AI 응답 생성 중 오류가 발생했습니다.\n\n**조회된 데이터:**\n${formatContextAsText(intent, context)}`,
      dataSources,
      knowledgeSources: knowledgeResult.sources.length > 0 ? knowledgeResult.sources : undefined,
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

      case "prediction": {
        // 예측 분석: 최근 데이터 트렌드 수집
        const { generatePredictions } = await import("./aiPrediction");
        const predictions = await generatePredictions(tenantId, message);
        context = { predictions };
        dataSources.push("prediction_engine", "historical_data");
        break;
      }

      case "anomaly_detection": {
        const { detectAnomalies } = await import("./aiAnomalyDetection");
        const anomalies = await detectAnomalies(tenantId);
        context = { anomalies };
        dataSources.push("anomaly_detection", "sensor_data");
        break;
      }

      // ── ERP AI intents ──
      case "expense_query": {
        const { detectExpenseAnomalies } = await import("./aiExpenseAnomaly");
        const expReport = await detectExpenseAnomalies(tenantId);
        context = { expenseAnomalies: expReport };
        dataSources.push("expense_vouchers", "journal_lines");
        break;
      }

      case "cashflow_query": {
        const { forecastCashFlow } = await import("./aiCashFlowForecast");
        const forecast = await forecastCashFlow(tenantId, 30);
        context = { cashFlowForecast: { summary: forecast.summary, recommendations: forecast.recommendations, currentBalance: forecast.currentBalance } };
        dataSources.push("cash_balance", "ap_ledger", "ar_ledger");
        break;
      }

      case "payment_risk_query": {
        const { analyzePaymentRisk } = await import("./aiPaymentRiskAnalysis");
        const payRisk = await analyzePaymentRisk(tenantId);
        context = { paymentRisk: { apSummary: payRisk.apSummary, arSummary: payRisk.arSummary, topApPartners: payRisk.apProfiles.slice(0, 5), topArPartners: payRisk.arProfiles.slice(0, 5), recommendations: payRisk.recommendations } };
        dataSources.push("ap_ledger", "ar_ledger", "partners");
        break;
      }

      case "purchase_recommend": {
        const { generatePurchaseRecommendations } = await import("../../services/ai/aiErpAdvanced.service");
        const recs = await generatePurchaseRecommendations(tenantId);
        context = { purchaseRecommendations: recs.slice(0, 10) };
        dataSources.push("inventory", "item_master");
        break;
      }

      case "shortage_predict": {
        const { predictInventoryShortages } = await import("../../services/ai/aiErpAdvanced.service");
        const shortages = await predictInventoryShortages(tenantId, 30);
        context = { shortagePredicitions: shortages.slice(0, 10) };
        dataSources.push("inventory", "transactions");
        break;
      }

      case "cost_anomaly": {
        const { detectCostAnomalies } = await import("../../services/ai/aiErpAdvanced.service");
        const anomalies = await detectCostAnomalies(tenantId);
        context = { costAnomalies: anomalies };
        dataSources.push("purchases", "journal_lines");
        break;
      }

      case "journal_query": {
        const { validateJournalEntries } = await import("./aiJournalValidation");
        const validation = await validateJournalEntries(tenantId);
        context = { journalValidation: validation };
        dataSources.push("journal_entries", "journal_lines");
        break;
      }

      case "financial_summary": {
        const { generatePredictions } = await import("./aiPrediction");
        const preds = await generatePredictions(tenantId);
        const financialPreds = preds.predictions.filter((p) => p.type === "financial_trend");
        context = { financialPredictions: financialPreds, aiNarrative: preds.aiNarrative };
        dataSources.push("journal_lines", "financial_reports");
        break;
      }

      case "training_query": {
        // 교육 현황 조회
        const conn = await getRawConnection();
        const today = todayKST();

        // 오늘 배정
        const [assignment] = await conn.execute<any[]>(
          "SELECT day_no FROM h_training_assignments WHERE assignment_date = ? AND tenant_id = ?",
          [today, tenantId]
        );
        const dayNo = assignment[0]?.day_no;

        // 오늘 교육 내용
        let todayTopic = null;
        if (dayNo) {
          const [topics] = await conn.execute<any[]>(
            "SELECT title, question, content, action, category FROM h_training_topics WHERE day_no = ? AND (tenant_id = 0 OR tenant_id = ?) ORDER BY tenant_id DESC LIMIT 1",
            [dayNo, tenantId]
          );
          todayTopic = topics[0] || null;
        }

        // 전체 직원수 & 완료수
        const [userCount] = await conn.execute<any[]>(
          "SELECT COUNT(*) as cnt FROM users WHERE tenant_id = ? AND status = 'approved'", [tenantId]
        );
        const [doneCount] = await conn.execute<any[]>(
          "SELECT COUNT(*) as cnt FROM h_training_logs WHERE day_no = ? AND assignment_date = ? AND tenant_id = ? AND status = 'DONE'",
          [dayNo || 0, today, tenantId]
        );

        // 30일 이수율
        const [totalAssign] = await conn.execute<any[]>(
          "SELECT COUNT(*) as cnt FROM h_training_assignments WHERE tenant_id = ? AND assignment_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)", [tenantId]
        );
        const [totalLogs] = await conn.execute<any[]>(
          "SELECT COUNT(*) as cnt FROM h_training_logs WHERE tenant_id = ? AND assignment_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND status = 'DONE'", [tenantId]
        );
        const expected = totalAssign[0].cnt * userCount[0].cnt;
        const rate = expected > 0 ? Math.round((totalLogs[0].cnt / expected) * 100) : 0;

        context = {
          today,
          dayNo,
          todayTopic,
          todayStatus: { total: userCount[0].cnt, done: doneCount[0].cnt, incomplete: userCount[0].cnt - doneCount[0].cnt },
          completionRate30d: rate,
        };
        dataSources.push("training_topics", "training_logs", "training_assignments");
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

function buildSystemPrompt(intent: UserIntent, context: Record<string, any>, knowledgeContext?: string): string {
  let base = `당신은 HACCP-ONE 시스템의 AI 어시스턴트 "하나"입니다.
식품공장의 HACCP 관리, 생산, 품질, 안전은 물론 회계/ERP(비용, 현금흐름, AP/AR, 분개)도 담당하는 통합 AI입니다.

## 중요 규칙
1. 반드시 아래 제공된 실제 데이터를 기반으로 답변하세요.
2. 데이터에 없는 내용은 추측하지 말고 "확인 불가"라고 답하세요.
3. 법적/품질 판단은 "참고용"임을 명시하세요.
4. 수치 데이터는 정확히 인용하세요.
5. 핵심을 먼저 말하고, 상세 설명을 이어가세요.
6. 답변은 한국어로, 마크다운 형식으로 작성하세요.
7. 참고자료가 제공된 경우, 해당 내용을 인용하여 근거를 제시하세요.

## 현재 시스템 데이터
${JSON.stringify(context, null, 2)}
`;

  // 지식베이스 참고자료가 있으면 추가
  if (knowledgeContext) {
    base += `
## 참고자료 (Knowledge Base)
아래는 질문과 관련된 HACCP 규정/기준서/매뉴얼 내용입니다. 답변 시 참고하세요.

${knowledgeContext}
`;
  }

  const intentInstructions: Partial<Record<UserIntent, string>> = {
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

    prediction: `
## 지시사항: 예측 분석
- 제공된 예측 데이터를 기반으로 트렌드를 설명하세요.
- 향후 예상되는 변화와 그 근거를 구체적으로 제시하세요.
- 대비해야 할 사항과 권장 조치를 제안하세요.
- 예측의 신뢰도를 함께 표시하세요.`,

    anomaly_detection: `
## 지시사항: 이상 패턴 탐지
- 감지된 이상 패턴을 심각도 순으로 정리하세요.
- 각 이상 패턴의 가능한 원인을 분석하세요.
- 즉시 조치가 필요한 항목을 명확히 구분하세요.
- 유사 패턴의 과거 사례가 있으면 언급하세요.`,

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
  const todayStr = formatLocalDate(today);

  if (/오늘/.test(message)) {
    return { startDate: todayStr, endDate: todayStr };
  }
  if (/이번\s*주|금주/.test(message)) {
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
    return { startDate: formatLocalDate(monday), endDate: todayStr };
  }
  if (/지난\s*주|전주/.test(message)) {
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - today.getDay() - 6);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    return { startDate: formatLocalDate(lastMonday), endDate: formatLocalDate(lastSunday) };
  }
  if (/이번\s*달|이달|금월/.test(message)) {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    return { startDate: formatLocalDate(firstDay), endDate: todayStr };
  }
  if (/최근\s*(\d+)\s*일/.test(message)) {
    const match = message.match(/최근\s*(\d+)\s*일/);
    const days = parseInt(match![1]);
    const start = new Date(today.getTime() - days * 86400000);
    return { startDate: formatLocalDate(start), endDate: todayStr };
  }
  if (/최근\s*(\d+)\s*개월/.test(message)) {
    const match = message.match(/최근\s*(\d+)\s*개월/);
    const months = parseInt(match![1]);
    const start = new Date(today);
    start.setMonth(start.getMonth() - months);
    return { startDate: formatLocalDate(start), endDate: todayStr };
  }

  // 기본: 최근 7일
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  return { startDate: formatLocalDate(weekAgo), endDate: todayStr };
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
