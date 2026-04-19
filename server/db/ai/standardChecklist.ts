/**
 * 기준서 → 체크리스트 자동생성 서비스
 *
 * 핵심 기능:
 * 1. 기준서 텍스트를 LLM으로 파싱 → 점검항목 추출
 * 2. 추출된 항목을 사용자가 검토/수정
 * 3. 확정된 항목으로 체크리스트 템플릿 자동 생성
 *
 * 회사마다 컨디션이 비슷하므로, 기준서만 주면 체크리스트 초안이 바로 나옴
 */

import { getRawConnection } from "../connection";
import { invokeLLM } from "../../_core/llm";
import { ENV } from "../../_core/env";
import type { ParsedStandardItem } from "../../../drizzle/schema/aiEngine";

// ============================================================================
// 기준서 파싱 프롬프트
// ============================================================================
const STANDARD_PARSING_PROMPT = `당신은 HACCP(식품안전관리인증) 전문가입니다.
주어진 기준서/관리기준 문서를 분석하여 체크리스트 점검항목을 추출해야 합니다.

## 추출 규칙
1. 각 점검항목은 현장에서 실제로 체크할 수 있는 구체적인 항목이어야 합니다
2. "~해야 한다", "~을 확인한다", "~을 점검한다" 등의 문장에서 추출합니다
3. 온도, 시간, 압력 등 수치 기준이 있으면 반드시 포함합니다
4. 점검 주기(매일, 매주, 매월 등)를 파악합니다
5. 점검 방법과 판정기준을 구분합니다

## 출력 형식
반드시 아래 JSON 배열 형식으로 출력하세요. 다른 텍스트 없이 JSON만 출력합니다.

[
  {
    "id": "고유ID (예: ITEM-001)",
    "category": "분류 (위생관리/CCP관리/설비관리/품질관리/안전관리/교육훈련/문서관리 중 하나)",
    "checkItem": "점검항목 (구체적으로, 예: '냉장고 내부 온도 확인')",
    "standard": "판정기준 (예: '0~10°C 유지')",
    "frequency": "점검주기 (매일/매주/매월/매분기/매년/수시 중 하나)",
    "method": "점검방법 (예: '온도계로 측정')",
    "responsibleRole": "담당자 역할 (예: '품질관리팀')",
    "itemType": "입력유형 (checkbox/number/text/temperature/time/select 중 하나)",
    "validationRules": {
      "min": null,
      "max": null,
      "options": null
    },
    "importance": "중요도 (required/recommended/optional 중 하나)"
  }
]

## 주의사항
- 식품공장 현장에서 실제로 사용할 수 있도록 구체적으로 작성
- 한국 HACCP 인증 기준에 맞추어 작성
- 온도/시간/압력 등 수치 기준이 있으면 validationRules에 min/max 포함
- 선택형 항목(적합/부적합, 양호/불량 등)은 itemType을 "select"로, options에 선택지 포함
- 최소 10개, 최대 50개 항목 추출`;

// ============================================================================
// 시정조치서 초안 생성 프롬프트
// ============================================================================
const CORRECTIVE_ACTION_PROMPT = `당신은 HACCP(식품안전관리인증) 전문가입니다.
주어진 이탈/부적합 정보를 바탕으로 시정조치서 초안을 작성해야 합니다.

## 작성 규칙
1. 즉시 조치사항과 근본원인 분석을 구분합니다
2. 재발방지 대책을 포함합니다
3. 한국 HACCP 인증 심사에서 인정받을 수 있는 수준으로 작성합니다
4. 현장에서 바로 사용할 수 있는 실무적 문구를 사용합니다

## 출력 형식 (JSON)
{
  "immediateAction": "즉시 조치사항",
  "rootCauseAnalysis": "근본원인 분석",
  "rootCauseCategory": "원인 분류 (human_error/equipment_failure/material_defect/process_issue/environmental 중 하나)",
  "correctiveAction": "시정조치 내용",
  "preventiveAction": "재발방지 대책",
  "verificationMethod": "효과 검증 방법",
  "timeline": "조치 기한 (예: '즉시', '3일 이내', '1주일 이내')",
  "responsiblePerson": "담당부서/담당자 역할",
  "additionalNotes": "기타 참고사항"
}`;

// ============================================================================
// 점검결과 요약 프롬프트
// ============================================================================
const INSPECTION_SUMMARY_PROMPT = `당신은 HACCP(식품안전관리인증) 전문가입니다.
주어진 점검/모니터링 데이터를 분석하여 한국어로 요약 보고서를 작성해야 합니다.

## 작성 규칙
1. 핵심 사항을 먼저 요약합니다
2. 이상 징후가 있으면 명확히 표시합니다
3. 개선이 필요한 항목을 구체적으로 제안합니다
4. 식품공장 관리자가 바로 이해할 수 있는 언어로 작성합니다

## 출력 형식
마크다운 형식으로 작성합니다:
- **요약**: 전체 현황 1~2문장
- **정상 항목**: 기준 충족 항목 목록
- **주의 항목**: 경계 수준 항목
- **이상 항목**: 기준 이탈 항목
- **권장 조치**: 필요한 조치 사항`;

// ============================================================================
// 기준서 파싱 함수
// ============================================================================

/**
 * 기준서 텍스트를 AI로 파싱하여 점검항목 추출
 */
export async function parseStandardToCheckItems(
  standardContent: string,
  standardType: string,
  additionalContext?: string
): Promise<{ items: ParsedStandardItem[]; rawResponse: string }> {
  if (!ENV.forgeApiKey) {
    throw new Error("AI API 키가 설정되지 않았습니다.");
  }

  const userMessage = `## 기준서 유형: ${standardType}
${additionalContext ? `## 추가 컨텍스트: ${additionalContext}\n` : ""}
## 기준서 내용:
${standardContent}`;

  const result = await invokeLLM({
    messages: [
      { role: "system", content: STANDARD_PARSING_PROMPT },
      { role: "user", content: userMessage },
    ],
    maxTokens: 4096,
    responseFormat: { type: "json_object" },
  });

  const rawResponse = typeof result.choices[0]?.message?.content === "string"
    ? result.choices[0].message.content
    : "";

  // JSON 파싱
  let items: ParsedStandardItem[] = [];
  try {
    const parsed = JSON.parse(rawResponse);
    items = Array.isArray(parsed) ? parsed : (parsed.items || parsed.checkItems || []);
  } catch {
    // JSON 내에서 배열 부분만 추출 시도
    const match = rawResponse.match(/\[[\s\S]*\]/);
    if (match) {
      items = JSON.parse(match[0]);
    }
  }

  // ID가 없으면 자동 생성
  items = items.map((item, idx) => ({
    ...item,
    id: item.id || `ITEM-${String(idx + 1).padStart(3, "0")}`,
    importance: item.importance || "required",
    itemType: item.itemType || "checkbox",
  }));

  return { items, rawResponse };
}

/**
 * 파싱된 항목으로 체크리스트 템플릿 생성
 */
export async function createTemplateFromStandard(
  tenantId: number,
  standardId: number,
  templateName: string,
  category: string,
  items: ParsedStandardItem[],
  createdBy?: number
): Promise<{ templateId: number; itemCount: number }> {
  const conn = await getRawConnection();

  // 1. 체크리스트 템플릿 생성
  const [templateResult] = await conn.execute(
    `INSERT INTO checklist_templates
     (tenant_id, name, description, category, priority, is_active, generation_mode, frequency, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 1, 'manual', 'daily', NOW(), NOW())`,
    [
      tenantId,
      templateName,
      `기준서 기반 자동생성 (standard_id: ${standardId})`,
      mapCategoryToEnum(category),
    ]
  );

  const templateId = (templateResult as any).insertId;

  // 2. 템플릿 항목 생성
  let sortOrder = 0;
  for (const item of items) {
    sortOrder += 1;
    await conn.execute(
      `INSERT INTO checklist_template_items
       (template_id, sort_order, item_name, item_type, description, validation_rules, required, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        templateId,
        sortOrder,
        item.checkItem,
        mapItemType(item.itemType),
        `[${item.category}] ${item.standard} | 주기: ${item.frequency} | 방법: ${item.method || "-"}`,
        JSON.stringify(item.validationRules || {}),
        item.importance === "required" ? 1 : 0,
      ]
    );
  }

  // 3. 기준서 상태 업데이트
  await conn.execute(
    `UPDATE ai_standards SET status = 'applied', generated_template_id = ?, updated_at = NOW() WHERE id = ?`,
    [templateId, standardId]
  );

  return { templateId, itemCount: sortOrder };
}

/**
 * 시정조치서 초안 생성
 */
export async function generateCorrectiveActionDraft(
  deviationInfo: {
    type: string;          // CCP 이탈, 검사 부적합, 위생 불량 등
    description: string;   // 상세 설명
    location?: string;     // 발생 장소
    batchCode?: string;    // 관련 배치
    actualValue?: string;  // 실측값
    standardValue?: string;// 기준값
    ccpType?: string;      // CCP 유형
  }
): Promise<{ draft: Record<string, string>; rawResponse: string }> {
  if (!ENV.forgeApiKey) {
    throw new Error("AI API 키가 설정되지 않았습니다.");
  }

  const userMessage = `## 이탈/부적합 정보
- 유형: ${deviationInfo.type}
- 상세: ${deviationInfo.description}
${deviationInfo.location ? `- 발생장소: ${deviationInfo.location}` : ""}
${deviationInfo.batchCode ? `- 관련배치: ${deviationInfo.batchCode}` : ""}
${deviationInfo.actualValue ? `- 실측값: ${deviationInfo.actualValue}` : ""}
${deviationInfo.standardValue ? `- 기준값: ${deviationInfo.standardValue}` : ""}
${deviationInfo.ccpType ? `- CCP 유형: ${deviationInfo.ccpType}` : ""}`;

  const result = await invokeLLM({
    messages: [
      { role: "system", content: CORRECTIVE_ACTION_PROMPT },
      { role: "user", content: userMessage },
    ],
    maxTokens: 2000,
    responseFormat: { type: "json_object" },
  });

  const rawResponse = typeof result.choices[0]?.message?.content === "string"
    ? result.choices[0].message.content
    : "";

  let draft: Record<string, string> = {};
  try {
    draft = JSON.parse(rawResponse);
  } catch {
    draft = { error: "파싱 실패", rawResponse };
  }

  return { draft, rawResponse };
}

/**
 * 점검결과 AI 요약 생성
 */
export async function generateInspectionSummary(
  inspectionData: {
    type: string;           // 점검 유형
    date: string;           // 점검 날짜
    items: Array<{
      name: string;
      standard: string;
      result: string;
      passed: boolean;
    }>;
    additionalInfo?: string;
  }
): Promise<{ summary: string; rawResponse: string }> {
  if (!ENV.forgeApiKey) {
    throw new Error("AI API 키가 설정되지 않았습니다.");
  }

  const itemsText = inspectionData.items
    .map((item, i) => `${i + 1}. ${item.name}: 기준=${item.standard}, 결과=${item.result}, 판정=${item.passed ? "적합" : "부적합"}`)
    .join("\n");

  const userMessage = `## 점검 정보
- 유형: ${inspectionData.type}
- 날짜: ${inspectionData.date}
${inspectionData.additionalInfo ? `- 기타: ${inspectionData.additionalInfo}` : ""}

## 점검 항목 (${inspectionData.items.length}건)
${itemsText}`;

  const result = await invokeLLM({
    messages: [
      { role: "system", content: INSPECTION_SUMMARY_PROMPT },
      { role: "user", content: userMessage },
    ],
    maxTokens: 2000,
  });

  const rawResponse = typeof result.choices[0]?.message?.content === "string"
    ? result.choices[0].message.content
    : "";

  return { summary: rawResponse, rawResponse };
}

/**
 * 감사 대응 자료 자동 묶기
 */
export async function gatherAuditDocuments(tenantId: number, startDate: string, endDate: string) {
  const conn = await getRawConnection();

  // 기간 내 각종 기록 현황 집계
  const [checklistCount] = await conn.execute(
    `SELECT COUNT(*) as cnt, SUM(CASE WHEN status IN ('completed','approved') THEN 1 ELSE 0 END) as completed
     FROM checklist_instances WHERE tenant_id = ? AND created_at BETWEEN ? AND ?`,
    [tenantId, startDate, endDate]
  );

  const [ccpCount] = await conn.execute(
    `SELECT COUNT(*) as cnt, SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved
     FROM h_ccp_instances WHERE tenant_id = ? AND work_date BETWEEN ? AND ?`,
    [tenantId, startDate, endDate]
  );

  const [deviationCount] = await conn.execute(
    `SELECT COUNT(*) as cnt, SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as resolved
     FROM h_corrective_action_requests WHERE tenant_id = ? AND created_at BETWEEN ? AND ?`,
    [tenantId, startDate, endDate]
  );

  const [calibrationCount] = await conn.execute(
    `SELECT COUNT(*) as cnt
     FROM calibration_records WHERE tenant_id = ? AND calibration_date BETWEEN ? AND ?`,
    [tenantId, startDate, endDate]
  );

  const [hygieneCount] = await conn.execute(
    `SELECT COUNT(*) as cnt
     FROM hygiene_inspection_records WHERE tenant_id = ? AND inspection_date BETWEEN ? AND ?`,
    [tenantId, startDate, endDate]
  );

  const [trainingCount] = await conn.execute(
    `SELECT COUNT(*) as cnt
     FROM h_training_schedules WHERE tenant_id = ? AND training_date BETWEEN ? AND ?`,
    [tenantId, startDate, endDate]
  );

  const [inspectionCount] = await conn.execute(
    `SELECT
       (SELECT COUNT(*) FROM material_inspection_records WHERE tenant_id = ? AND inspection_date BETWEEN ? AND ?) as material,
       (SELECT COUNT(*) FROM shipping_inspection_records WHERE tenant_id = ? AND inspection_date BETWEEN ? AND ?) as shipping`,
    [tenantId, startDate, endDate, tenantId, startDate, endDate]
  );

  return {
    period: { startDate, endDate },
    summary: {
      checklists: (checklistCount as any[])[0] || { cnt: 0, completed: 0 },
      ccpMonitoring: (ccpCount as any[])[0] || { cnt: 0, approved: 0 },
      correctiveActions: (deviationCount as any[])[0] || { cnt: 0, resolved: 0 },
      calibrations: (calibrationCount as any[])[0] || { cnt: 0 },
      hygieneInspections: (hygieneCount as any[])[0] || { cnt: 0 },
      trainings: (trainingCount as any[])[0] || { cnt: 0 },
      inspections: (inspectionCount as any[])[0] || { material: 0, shipping: 0 },
    },
  };
}

// ============================================================================
// 헬퍼 함수
// ============================================================================

function mapCategoryToEnum(category: string): string {
  const mapping: Record<string, string> = {
    "위생관리": "SANITATION",
    "CCP관리": "CCP",
    "설비관리": "MAINTENANCE",
    "품질관리": "QUALITY",
    "안전관리": "SAFETY",
    "교육훈련": "TRAINING",
    "문서관리": "QUALITY",
  };
  return mapping[category] || "QUALITY";
}

function mapItemType(itemType?: string): string {
  const mapping: Record<string, string> = {
    "checkbox": "checkbox",
    "number": "number",
    "text": "text",
    "textarea": "textarea",
    "temperature": "temperature",
    "time": "time",
    "date": "date",
    "select": "select",
    "pressure": "pressure",
  };
  return mapping[itemType || "checkbox"] || "checkbox";
}
