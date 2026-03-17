/**
 * AI 교육 추천 엔진
 *
 * 에러/이탈 패턴 분석 → 담당자별 맞춤 교육 추천:
 * 1. CCP 이탈 패턴 → 관련 교육 추천
 * 2. 체크리스트 누락 패턴 → 인식 개선 교육
 * 3. 시정조치 이력 → 재발 방지 교육
 * 4. 입고검사 불합격 → 품질 관리 교육
 * 5. LLM 기반 맞춤형 교육 과정 설계
 */

import { getRawConnection } from "../db";
import { invokeLLM } from "../_core/llm";
import { ENV } from "../_core/env";

// ============================================================================
// 타입 정의
// ============================================================================

export type TrainingCategory =
  | "ccp_management"
  | "hygiene"
  | "quality_control"
  | "equipment_operation"
  | "document_management"
  | "safety"
  | "haccp_principles"
  | "corrective_action";

export type TrainingRecommendation = {
  category: TrainingCategory;
  title: string;
  description: string;
  targetAudience: string[];
  priority: "urgent" | "high" | "medium" | "low";
  reason: string;
  suggestedDuration: string;
  keyTopics: string[];
  relatedIncidents: number;
};

export type TrainingPlan = {
  tenantId: number;
  generatedAt: string;
  recommendations: TrainingRecommendation[];
  overallAssessment: string;
  scheduleSuggestion: Array<{
    week: number;
    training: string;
    target: string;
  }>;
};

// ============================================================================
// 교육 필요도 분석
// ============================================================================

export async function generateTrainingRecommendations(tenantId: number): Promise<TrainingPlan> {
  const conn = await getRawConnection();
  const recommendations: TrainingRecommendation[] = [];

  // 1. CCP 이탈 패턴 (최근 90일)
  const [ccpData] = await conn.execute(
    `SELECT hci.ccp_type, hcr.result, hcr.recorded_by,
            COUNT(*) as cnt
     FROM h_ccp_rows hcr
     JOIN h_ccp_instances hci ON hci.id = hcr.instance_id
     WHERE hci.tenant_id = ? AND hcr.result = 'FAIL'
       AND hci.work_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
     GROUP BY hci.ccp_type, hcr.result, hcr.recorded_by
     ORDER BY cnt DESC`,
    [tenantId]
  );

  const ccpFails = ccpData as any[];
  if (ccpFails.length > 0) {
    const totalFails = ccpFails.reduce((sum, f) => sum + Number(f.cnt), 0);
    const topTypes = [...new Set(ccpFails.map((f) => f.ccp_type))];
    const topOperators = [...new Set(ccpFails.map((f) => f.recorded_by).filter(Boolean))];

    recommendations.push({
      category: "ccp_management",
      title: "CCP 모니터링 역량 강화 교육",
      description: `최근 90일간 CCP 이탈 ${totalFails}건 발생. ${topTypes.join(", ")} 유형 집중 교육 필요`,
      targetAudience: topOperators.length > 0 ? topOperators : ["생산팀 전원"],
      priority: totalFails > 10 ? "urgent" : totalFails > 5 ? "high" : "medium",
      reason: `CCP 이탈 ${totalFails}건, 주요 유형: ${topTypes.join(", ")}`,
      suggestedDuration: "2시간",
      keyTopics: [
        "CCP 모니터링 절차 재확인",
        "한계기준(CL) 이해",
        "이탈 시 즉시 대응 절차",
        "기록 작성 방법",
      ],
      relatedIncidents: totalFails,
    });
  }

  // 2. 체크리스트 누락 패턴
  const [checklistData] = await conn.execute(
    `SELECT ct.category, ct.name,
            COUNT(*) as missingCount
     FROM checklist_templates ct
     LEFT JOIN checklist_instances ci
       ON ci.template_id = ct.id AND ci.tenant_id = ?
       AND ci.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
     WHERE ct.tenant_id = ? AND ct.is_active = 1 AND ct.frequency = 'daily'
     GROUP BY ct.id, ct.category, ct.name
     HAVING missingCount < 20
     ORDER BY missingCount ASC
     LIMIT 10`,
    [tenantId, tenantId]
  );

  const missed = checklistData as any[];
  if (missed.length > 0) {
    const categories = [...new Set(missed.map((m) => m.category))];
    recommendations.push({
      category: "document_management",
      title: "체크리스트 작성 의무 교육",
      description: `최근 30일간 일일 체크리스트 누락 빈발. ${categories.join(", ")} 카테고리 집중`,
      targetAudience: ["현장 담당자", "조장/반장"],
      priority: missed.length > 5 ? "high" : "medium",
      reason: `${missed.length}개 체크리스트 항목 미작성 빈발`,
      suggestedDuration: "1시간",
      keyTopics: [
        "체크리스트 작성 중요성",
        "HACCP 기록 의무",
        "모바일 작성 방법",
        "누락 시 감사 리스크",
      ],
      relatedIncidents: missed.length,
    });
  }

  // 3. 시정조치 재발 패턴
  const [caData] = await conn.execute(
    `SELECT source_type, COUNT(*) as cnt,
            SUM(CASE WHEN status NOT IN ('closed', 'verified') THEN 1 ELSE 0 END) as openCount
     FROM h_corrective_action_requests
     WHERE tenant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
     GROUP BY source_type
     ORDER BY cnt DESC`,
    [tenantId]
  );

  const caByType = caData as any[];
  if (caByType.length > 0) {
    const total = caByType.reduce((sum, c) => sum + Number(c.cnt), 0);
    const open = caByType.reduce((sum, c) => sum + Number(c.openCount), 0);

    if (total > 3) {
      recommendations.push({
        category: "corrective_action",
        title: "시정조치 절차 및 근본원인 분석 교육",
        description: `6개월간 시정조치 ${total}건 중 ${open}건 미해결. 근본원인 분석 역량 강화 필요`,
        targetAudience: ["품질관리팀", "생산관리자"],
        priority: open > 5 ? "urgent" : "high",
        reason: `시정조치 ${total}건 발생, ${open}건 미해결`,
        suggestedDuration: "3시간",
        keyTopics: [
          "5Why 분석법",
          "특성요인도(Fishbone)",
          "시정조치 작성 방법",
          "효과 검증 절차",
        ],
        relatedIncidents: total,
      });
    }
  }

  // 4. 검교정 관리
  const [calData] = await conn.execute(
    `SELECT COUNT(*) as overdue FROM calibration_records cr
     JOIN calibration_equipment ce ON ce.id = cr.equipment_id
     WHERE ce.tenant_id = ? AND ce.is_active = 1
       AND cr.next_calibration_date < CURDATE()
       AND cr.id = (SELECT MAX(id) FROM calibration_records WHERE equipment_id = ce.id AND tenant_id = ?)`,
    [tenantId, tenantId]
  );

  const overdue = (calData as any[])[0]?.overdue || 0;
  if (overdue > 0) {
    recommendations.push({
      category: "equipment_operation",
      title: "설비 검교정 관리 교육",
      description: `검교정 기한 초과 장비 ${overdue}대. 검교정 관리 절차 교육 필요`,
      targetAudience: ["설비관리팀", "품질관리팀"],
      priority: overdue > 3 ? "high" : "medium",
      reason: `검교정 기한 초과 ${overdue}대`,
      suggestedDuration: "2시간",
      keyTopics: [
        "검교정 일정 관리",
        "검교정 기록 작성",
        "부적합 장비 처리 절차",
      ],
      relatedIncidents: overdue,
    });
  }

  // 5. 교육 이수 현황
  const [trainHistory] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM h_training_schedules
     WHERE tenant_id = ? AND training_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)`,
    [tenantId]
  );

  const trainCount = (trainHistory as any[])[0]?.cnt || 0;
  if (trainCount < 2) {
    recommendations.push({
      category: "haccp_principles",
      title: "HACCP 기본 원리 정기 교육",
      description: `최근 6개월간 교육 ${trainCount}회만 실시. 최소 분기 1회 정기 교육 필요`,
      targetAudience: ["전 직원"],
      priority: trainCount === 0 ? "urgent" : "high",
      reason: `6개월간 교육 실적 ${trainCount}회 (권장: 최소 2회)`,
      suggestedDuration: "2시간",
      keyTopics: [
        "HACCP 7원칙 이해",
        "개인위생 관리",
        "식품 알레르겐 관리",
        "이물 방지 대책",
      ],
      relatedIncidents: 0,
    });
  }

  // 우선순위 정렬
  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // AI 종합 평가 + 일정 제안
  let overallAssessment = "";
  let scheduleSuggestion: TrainingPlan["scheduleSuggestion"] = [];

  if (ENV.forgeApiKey && recommendations.length > 0) {
    try {
      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `당신은 식품공장 교육훈련 전문가입니다.
교육 추천 데이터를 분석하여 종합 평가와 4주 교육 일정을 제안하세요.

출력 형식 (JSON):
{
  "assessment": "종합 평가 (3~4문장)",
  "schedule": [{"week":1,"training":"교육명","target":"대상"}]
}`,
          },
          {
            role: "user",
            content: recommendations.map((r) =>
              `[${r.priority}] ${r.title} - ${r.reason} (대상: ${r.targetAudience.join(", ")})`
            ).join("\n"),
          },
        ],
        maxTokens: 800,
        responseFormat: { type: "json_object" },
      });

      const text = typeof result.choices[0]?.message?.content === "string"
        ? result.choices[0].message.content : "{}";
      const parsed = JSON.parse(text);
      overallAssessment = parsed.assessment || "";
      scheduleSuggestion = parsed.schedule || [];
    } catch { /* AI 실패 무시 */ }
  }

  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    recommendations,
    overallAssessment,
    scheduleSuggestion,
  };
}
