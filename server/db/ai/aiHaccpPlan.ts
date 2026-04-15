/**
 * AI HACCP 계획서 자동생성
 *
 * 업종/제품/공정 정보 → AI가 HACCP 7원칙 12절차 기반 계획서 자동 생성
 * - 위해요소 분석 (Hazard Analysis)
 * - CCP 결정 (Critical Control Points)
 * - 한계기준 설정 (Critical Limits)
 * - 모니터링 체계
 * - 시정조치 계획
 * - 검증 절차
 * - 기록 관리
 */

import { invokeLLM } from "../../_core/llm";
import { ENV } from "../../_core/env";
import { getRawConnection } from "../connection";

// ============================================================================
// 타입 정의
// ============================================================================

export type HaccpPlanInput = {
  companyName: string;
  businessType: string; // 업종 (빵류, 음료류, 유제품 등)
  products: string[]; // 생산 제품 목록
  rawMaterials: string[]; // 주요 원재료
  processes: string[]; // 공정 단계
  facilityInfo?: string; // 시설 정보
  existingCCPs?: string[]; // 기존 CCP (있으면)
};

export type HazardAnalysis = {
  step: string;
  hazardType: "biological" | "chemical" | "physical";
  hazardDescription: string;
  severity: "high" | "medium" | "low";
  likelihood: "high" | "medium" | "low";
  riskLevel: "significant" | "non-significant";
  preventiveMeasure: string;
  isCCP: boolean;
};

export type CCPPlan = {
  ccpNumber: string;
  processStep: string;
  hazard: string;
  criticalLimit: string;
  monitoringMethod: string;
  monitoringFrequency: string;
  responsiblePerson: string;
  correctiveAction: string;
  verificationMethod: string;
  recordForm: string;
};

export type HaccpPlanResult = {
  id?: number;
  companyName: string;
  generatedAt: string;
  teamMembers: Array<{ role: string; responsibility: string }>;
  productDescription: string;
  intendedUse: string;
  flowDiagram: string[];
  hazardAnalysis: HazardAnalysis[];
  ccpPlans: CCPPlan[];
  prerequisitePrograms: string[];
  verificationSchedule: Array<{ activity: string; frequency: string; responsible: string }>;
  recordManagement: Array<{ record: string; retentionPeriod: string; responsible: string }>;
  aiConfidence: number;
};

// ============================================================================
// HACCP 계획서 생성
// ============================================================================

const HACCP_PLAN_PROMPT = `당신은 대한민국 식품안전관리인증(HACCP) 전문 컨설턴트입니다.
주어진 업체 정보를 바탕으로 HACCP 7원칙 12절차에 맞는 종합 계획서를 작성하세요.

## 반드시 포함할 내용
1. HACCP 팀 구성 제안 (역할/책임)
2. 제품 설명 (특성, 유통기한, 보관방법)
3. 용도 확인 (대상 소비자)
4. 공정 흐름도 (단계별)
5. 위해요소 분석 (생물학적/화학적/물리적)
6. CCP 결정 및 관리계획
7. 선행요건 프로그램
8. 검증 일정
9. 기록 관리 계획

## 출력 형식
반드시 아래 JSON 형식으로만 출력하세요:

{
  "teamMembers": [{"role":"팀장","responsibility":"HACCP 시스템 총괄"}],
  "productDescription": "제품 특성 설명",
  "intendedUse": "소비 대상 및 용도",
  "flowDiagram": ["원재료 입고","검수","보관","전처리",...],
  "hazardAnalysis": [
    {
      "step": "공정단계",
      "hazardType": "biological|chemical|physical",
      "hazardDescription": "위해요소 설명",
      "severity": "high|medium|low",
      "likelihood": "high|medium|low",
      "riskLevel": "significant|non-significant",
      "preventiveMeasure": "예방조치",
      "isCCP": true/false
    }
  ],
  "ccpPlans": [
    {
      "ccpNumber": "CCP-1",
      "processStep": "공정단계",
      "hazard": "위해요소",
      "criticalLimit": "한계기준",
      "monitoringMethod": "모니터링 방법",
      "monitoringFrequency": "주기",
      "responsiblePerson": "담당 역할",
      "correctiveAction": "시정조치",
      "verificationMethod": "검증방법",
      "recordForm": "기록양식"
    }
  ],
  "prerequisitePrograms": ["선행요건1","선행요건2"],
  "verificationSchedule": [{"activity":"활동","frequency":"주기","responsible":"담당"}],
  "recordManagement": [{"record":"기록명","retentionPeriod":"보존기간","responsible":"담당"}],
  "confidence": 0.0~1.0
}`;

export async function generateHaccpPlan(
  tenantId: number,
  input: HaccpPlanInput
): Promise<HaccpPlanResult> {
  if (!ENV.forgeApiKey) {
    throw new Error("AI 서비스가 설정되지 않았습니다.");
  }

  // 기존 데이터에서 추가 컨텍스트 수집
  const conn = await getRawConnection();
  let existingContext = "";

  try {
    const [products] = await conn.execute(
      `SELECT name, unit, storage_method FROM products WHERE tenant_id = ? LIMIT 20`,
      [tenantId]
    );
    const [materials] = await conn.execute(
      `SELECT name, unit, storage_method FROM materials WHERE tenant_id = ? LIMIT 30`,
      [tenantId]
    );
    existingContext = `\n기존 등록 제품: ${(products as any[]).map((p) => p.name).join(", ")}
기존 등록 원재료: ${(materials as any[]).map((m) => m.name).join(", ")}`;
  } catch { /* 기존 데이터 없어도 무방 */ }

  const result = await invokeLLM({
    messages: [
      { role: "system", content: HACCP_PLAN_PROMPT },
      {
        role: "user",
        content: `업체명: ${input.companyName}
업종: ${input.businessType}
생산 제품: ${input.products.join(", ")}
주요 원재료: ${input.rawMaterials.join(", ")}
공정 단계: ${input.processes.join(" → ")}
${input.facilityInfo ? `시설 정보: ${input.facilityInfo}` : ""}
${input.existingCCPs ? `기존 CCP: ${input.existingCCPs.join(", ")}` : ""}
${existingContext}`,
      },
    ],
    maxTokens: 4000,
    responseFormat: { type: "json_object" },
  });

  const text = typeof result.choices[0]?.message?.content === "string"
    ? result.choices[0].message.content : "{}";

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("HACCP 계획서 생성 결과를 파싱할 수 없습니다.");
  }

  const plan: HaccpPlanResult = {
    companyName: input.companyName,
    generatedAt: new Date().toISOString(),
    teamMembers: parsed.teamMembers || [],
    productDescription: parsed.productDescription || "",
    intendedUse: parsed.intendedUse || "",
    flowDiagram: parsed.flowDiagram || input.processes,
    hazardAnalysis: parsed.hazardAnalysis || [],
    ccpPlans: parsed.ccpPlans || [],
    prerequisitePrograms: parsed.prerequisitePrograms || [],
    verificationSchedule: parsed.verificationSchedule || [],
    recordManagement: parsed.recordManagement || [],
    aiConfidence: parsed.confidence || 0.7,
  };

  // DB에 저장
  try {
    const [insertResult] = await conn.execute(
      `INSERT INTO ai_audit_logs
       (tenant_id, action_type, input_data, output_text, created_at)
       VALUES (?, 'haccp_plan_generation', ?, ?, NOW())`,
      [tenantId, JSON.stringify(input), JSON.stringify(plan)]
    );
    plan.id = (insertResult as any).insertId;
  } catch { /* 저장 실패 무시 */ }

  return plan;
}

// ============================================================================
// 기존 데이터 기반 HACCP 계획서 자동 초안
// ============================================================================

export async function generateHaccpPlanFromExistingData(tenantId: number): Promise<HaccpPlanResult> {
  const conn = await getRawConnection();

  // 시스템에 등록된 데이터로 자동 구성
  const [products] = await conn.execute(
    `SELECT name FROM products WHERE tenant_id = ?`, [tenantId]
  );
  const [materials] = await conn.execute(
    `SELECT name FROM materials WHERE tenant_id = ?`, [tenantId]
  );
  const [ccpTypes] = await conn.execute(
    `SELECT DISTINCT ccp_type FROM h_ccp_instances WHERE tenant_id = ?`, [tenantId]
  );
  const [tenantInfo] = await conn.execute(
    `SELECT name FROM tenants WHERE id = ?`, [tenantId]
  );

  const companyName = (tenantInfo as any[])[0]?.name || "미설정";

  return generateHaccpPlan(tenantId, {
    companyName,
    businessType: "식품 제조업",
    products: (products as any[]).map((p) => p.name).slice(0, 10),
    rawMaterials: (materials as any[]).map((m) => m.name).slice(0, 15),
    processes: ["원재료 입고", "검수", "보관", "전처리", "배합", "가공", "냉각", "포장", "검사", "출하"],
    existingCCPs: (ccpTypes as any[]).map((c) => c.ccp_type),
  });
}
