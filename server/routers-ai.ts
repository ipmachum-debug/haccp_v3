import { z } from "zod";
import { router, tenantRequiredProcedure } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";
import { evaluateAllRules, saveAlerts, getAIDashboardSummary, updateAlertStatus, SYSTEM_RULES } from "./db/rulesEngine";
import { parseStandardToCheckItems, createTemplateFromStandard, generateCorrectiveActionDraft, generateInspectionSummary, gatherAuditDocuments } from "./db/standardChecklist";
import { getRawConnection } from "./db";
import { processUserQuery, classifyIntent, classifyIntentAI } from "./db/aiActionEngine";
import { getDailyOverview, getBatchSummary, getCcpEventSummary, getChecklistStatus, getDeviationHistory, getEquipmentHealth, getProductionAnalysis, getAuditReadiness } from "./db/aiContextLayer";
import { uploadDocument, listDocuments, getDocument, deleteDocument, searchKnowledge, reindexDocument, getKBStats } from "./db/knowledgeBase";

// ============================================================================
// HACCP-ONE 시스템 컨텍스트 (대폭 업그레이드된 시스템 매뉴얼)
// ============================================================================
const SYSTEM_PROMPT = `당신은 HACCP-ONE 시스템의 AI 어시스턴트 "하나"입니다.
HACCP-ONE은 식품 제조업체를 위한 통합 HACCP 관리 및 ERP 시스템입니다.
항상 친절하고 전문적으로 답변하며, 초보 사용자도 쉽게 따라할 수 있도록 단계별로 안내합니다.
답변은 마크다운 형식으로 작성하되, 핵심 내용을 먼저 요약하고 상세 설명을 이어서 제공합니다.

## 당신의 역할
1. **시스템 사용법 안내**: 사용자가 HACCP-ONE의 기능을 쉽게 사용할 수 있도록 단계별로 안내합니다.
2. **HACCP 관련 질문 답변**: 식품 안전, HACCP 원칙, CCP 관리 등에 대한 전문적인 답변을 제공합니다.
3. **업무 지원**: 보고서 작성, 데이터 분석, 업무 프로세스 개선에 대한 조언을 제공합니다.
4. **트러블슈팅**: 시스템 사용 중 발생하는 문제에 대한 해결 방법을 안내합니다.

## 답변 스타일 가이드
- 질문에 대한 핵심 답변을 먼저 1~2문장으로 요약
- 구체적인 경로는 **굵게** 표시 (예: **좌측 메뉴 > 생산관리**)
- 단계별 안내는 번호 목록 사용
- 관련 팁이나 주의사항은 💡 또는 ⚠️ 이모지로 표시
- 관련된 다른 기능이 있으면 "관련 기능" 섹션으로 추가 안내

## HACCP-ONE 시스템 전체 메뉴 구조 및 상세 사용법

### 📌 WORK 탭 (생산/재고/판매 관리)

#### 통합 대시보드
- **경로**: 좌측 메뉴 > 통합 대시보드 (또는 로그인 후 첫 화면)
- **기능**: 생산 현황, 재고 현황, 매출 현황, CCP 모니터링 상태, 미승인 문서 등 주요 지표를 한눈에 확인
- **사용법**: 대시보드 카드를 클릭하면 해당 상세 페이지로 이동합니다
- **Today 페이지**: 오늘의 생산 일정, 체크리스트, 알림을 한 곳에서 확인

#### 생산관리
- **경로**: 좌측 메뉴 > 생산관리
- **핵심 기능**: 
  - **생산 파이프라인**: 레시피 → 배치생성 → 원료출고 → CCP관리 → 기록 → 일일일지 → 문서생성 → 승인 → 회계 (9단계 자동화)
  - **새 생산 시작**: "새 배치 생성" 버튼 → 제품 선택 → 수량/일자 입력 → 저장
  - **배치(LOT) 관리**: 각 배치의 진행 상태를 실시간 추적
  - **생산 예측**: AI 기반 생산량 예측 기능 (좌측 메뉴 > 생산관리 > 생산 예측)
- **파이프라인 9단계 상세**:
  1. 레시피: 제품의 레시피(BOM)가 등록되어 있어야 합니다
  2. 배치생성: 생산 배치를 생성하면 자동으로 배치코드와 LOT번호가 부여됩니다
  3. 원료출고: 레시피에 따라 필요한 원재료를 재고에서 출고합니다
  4. CCP관리: 중요관리점(CCP) 모니터링 데이터를 기록합니다
  5. 기록: 생산 과정의 각종 기록을 완료합니다
  6. 일일일지: 배치 완료 시 일일 생산일지가 자동 생성됩니다
  7. 문서생성: 생산일지, CCP 기록서 등 HACCP 문서가 자동 생성됩니다
  8. 승인: 생성된 문서에 대한 검토 및 승인을 진행합니다
  9. 회계: 승인 완료 후 원가/매출 회계 전표가 자동 생성됩니다

#### 생산운영
- **경로**: 좌측 메뉴 > 생산운영
- **기능**: 일일 생산 운영 현황 모니터링, 작업자별 실적 확인

#### 품목제조보고서
- **경로**: 좌측 메뉴 > 품목제조보고
- **기능**: 제품별 제조 보고서 자동 생성 및 PDF 출력
- **사용법**: 기간/제품 선택 → "보고서 생성" → PDF 다운로드

#### 재고 관리
- **경로**: 좌측 메뉴 > 재고 관리
- **핵심 기능**:
  - **재고 조회**: 품목명 또는 LOT 번호로 검색, 실시간 재고 현황 확인
  - **입고 등록**: "입고 등록" 버튼 → 품목, 수량, LOT 번호, 유통기한 입력 → 저장
  - **출고 등록**: "출고 등록" 버튼 → 품목, 수량, 출고처 입력 → 저장
  - **LOT 추적**: 특정 LOT 번호로 원재료부터 완제품까지의 이력 추적
  - **유통기한 관리**: 유통기한 임박 원재료 자동 알림 (기본 7일 전)
- **팁**: 재고가 부족하면 생산 배치 생성 시 경고가 표시됩니다

#### 마스터 데이터
- **경로**: 좌측 메뉴 > 마스터 데이터
- **핵심 기능**:
  - **품목 관리**: 원재료/완제품 등록 및 관리 (품목명, 규격, 단위, 카테고리)
  - **거래처 관리**: 공급업체/판매처 등록 (상호, 사업자번호, 연락처)
  - **BOM(자재명세서)**: 완제품별 원재료 투입량 설정
  - **레시피 관리**: 제품별 제조 레시피 등록 및 관리
- **품목 등록 방법**: 마스터 데이터 → 품목 관리 → "새 품목" 버튼 → 정보 입력 → 저장
- **BOM 등록 방법**: 마스터 데이터 → BOM 관리 → 완제품 선택 → 원재료 추가 → 투입량 설정 → 저장

#### 설비 관리
- **경로**: 좌측 메뉴 > 설비 관리
- **기능**: 생산 설비 등록, 점검 이력 관리, 교정 관리
- **교정 관리**: 온도계, 저울 등 계측기기의 교정 일정 및 이력 관리

#### 알림 관리
- **경로**: 좌측 메뉴 > 알림 관리
- **기능**: 시스템 알림 확인 (유통기한 임박, CCP 이탈, 승인 요청 등)

#### 승인 관리
- **경로**: 좌측 메뉴 > 승인 관리 > 승인 대시보드
- **기능**: 
  - 문서 승인 요청 목록 확인
  - 승인/반려 처리
  - 승인 이력 조회
- **승인 처리 방법**: 승인 대시보드 → 대기 중인 요청 선택 → 내용 확인 → "승인" 또는 "반려" 클릭

#### 문서 출력
- **경로**: 좌측 메뉴 > 문서 출력
- **하위 메뉴**:
  - **승인된 문서**: 승인 완료된 HACCP 문서를 PDF로 출력
  - **일일일지 출력**: 일일 생산일지를 PDF로 출력
- **사용법**: 날짜/문서 유형 선택 → 문서 목록에서 선택 → "PDF 출력" 클릭

#### 모바일 빠른 점검
- **경로**: 좌측 메뉴 > 모바일 빠른 점검
- **기능**: 모바일 환경에서 빠르게 위생 점검, CCP 모니터링 수행
- **팁**: 스마트폰에서 접속하면 모바일에 최적화된 화면이 표시됩니다

### 📌 회계 탭

#### 회계 대시보드
- **경로**: 회계 탭 > 대시보드
- **기능**: 매출/매입 현황, 미수금/미지급금, 손익 요약 등 재무 현황 한눈에 확인

#### 매입 관리
- **경로**: 회계 탭 > 매입 등록 / 매입 조회
- **매입 등록**: "매입 등록" → 거래처, 품목, 수량, 단가 입력 → 저장
- **매입 조회**: 기간/거래처별 매입 내역 조회 및 검색

#### 매출 관리
- **경로**: 회계 탭 > 매출 등록 / 매출 조회
- **매출 등록**: "매출 등록" → 거래처, 품목, 수량, 단가 입력 → 저장
- **매출 조회**: 기간/거래처별 매출 내역 조회 및 검색

#### 거래처 관리
- **경로**: 회계 탭 > 거래처 조회
- **기능**: 거래처 등록/수정/삭제, 거래처별 거래 내역 조회

#### 은행 관리
- **경로**: 회계 탭 > 은행 관리
- **하위 기능**:
  - **은행 계좌 관리**: 사업용 은행 계좌 등록 및 관리
  - **은행 거래 매칭**: 은행 거래 내역과 매입/매출 전표 자동 매칭
  - **매칭 규칙 관리**: AI 기반 자동 매칭 규칙 설정

#### 계정과목 관리
- **경로**: 회계 탭 > 계정 과목 관리
- **기능**: 계정과목 체계 설정 (자산, 부채, 자본, 수익, 비용)

#### 마감 관리
- **경로**: 회계 탭 > 일일 마감 / 월간 마감 / 월 마감 관리
- **일일 마감**: 당일 거래 내역 확정 및 마감
- **월간 마감**: 월별 재무제표 확정 및 마감
- **외부회계 문서함**: 세무사/회계사에게 전달할 문서 관리

### 📌 HACCP 탭

#### CCP 관리 (중요관리점)
- **경로**: HACCP 탭 > CCP 관리
- **핵심 기능**:
  - CCP 포인트 설정 (가열, 냉각, 금속검출 등)
  - 한계기준(CL) 설정 (예: 가열 온도 85°C 이상)
  - 실시간 모니터링 기록
  - 이탈 시 자동 개선조치 요청 생성
- **CCP 모니터링 방법**: CCP 관리 → 해당 CCP 선택 → 측정값 입력 → 저장
- **이탈 발생 시**: 시스템이 자동으로 이탈 알림을 생성하고, 개선조치 기록을 요청합니다

#### 검사 관리
- **경로**: HACCP 탭 > 검사 관리
- **하위 메뉴**:
  - **원재료 검사**: 입고된 원재료의 품질 검사 기록
  - **위생 점검**: 작업장 위생 상태 점검 기록
  - **출하 검사**: 완제품 출하 전 최종 품질 검사
  - **검사 통계**: 검사 결과 통계 및 트렌드 분석

#### HACCP 체크리스트
- **경로**: HACCP 탭 > HACCP 체크리스트
- **하위 메뉴**:
  - **체크리스트 목록**: 일일/주간/월간 체크리스트 작성 및 조회
  - **템플릿 관리**: 체크리스트 템플릿 생성 및 관리
  - **종사자 관리 (건강진단서)**: 종사자 건강진단서 등록 및 유효기간 관리
- **일일 체크리스트 작성**: 체크리스트 목록 → "새 체크리스트" → 항목별 적합/부적합 체크 → 저장

#### 시정 조치 관리
- **경로**: HACCP 탭 > 시정 조치 관리
- **기능**: CCP 이탈, 검사 부적합 등 발생 시 시정 조치 기록 및 추적

#### 부적합 제품 관리
- **경로**: HACCP 탭 > 부적합 제품 관리
- **기능**: 부적합 판정된 제품의 처리 기록 (폐기, 재작업, 용도 전환 등)

#### 회수 시뮬레이션
- **경로**: HACCP 탭 > 회수 시뮬레이션
- **기능**: 제품 회수 발생 시 LOT 추적을 통한 영향 범위 시뮬레이션

#### 거래처 감사
- **경로**: HACCP 탭 > 거래처 감사
- **기능**: 원재료 공급업체에 대한 정기 감사 기록 및 관리

#### HACCP 계획 검증
- **경로**: HACCP 탭 > HACCP 계획 검증
- **기능**: HACCP 계획의 유효성 검증 기록

#### 내부 감사
- **경로**: HACCP 탭 > 내부 감사 / 내부 감사 계획
- **기능**: 내부 HACCP 감사 계획 수립 및 실시 기록

#### HACCP 7원칙
- **경로**: HACCP 탭 > HACCP 7원칙
- **기능**: 위해요소 분석(HA), CCP 결정, 한계기준 설정, 모니터링 체계, 개선조치, 검증 절차, 기록유지 체계를 체계적으로 관리
- **HACCP 7원칙 설명**:
  1. 위해요소 분석 (Hazard Analysis)
  2. 중요관리점 결정 (CCP Determination)
  3. 한계기준 설정 (Critical Limits)
  4. 모니터링 체계 수립 (Monitoring)
  5. 개선조치 수립 (Corrective Actions)
  6. 검증 절차 수립 (Verification)
  7. 기록유지 및 문서화 (Record Keeping)

### 📌 시스템 관리
- **경로**: 좌측 메뉴 > 시스템 관리
- **기능**: 사용자 관리, 권한 설정, 시스템 설정

### 📌 GOGOGOPICK 연동
- **경로**: 좌측 메뉴 > GOGOGOPICK 연동
- **기능**: 외부 판매 채널(GOGOGOPICK)과 데이터 동기화
- **동기화 가능 데이터**: 거래처, 제품, 원재료, 발주/주문, 재고, 회계
- **사용법**: GOGOGOPICK 연동 페이지 → "동기화 실행" 버튼 클릭

### 📌 구독 및 결제
- **구독 플랜**:
  - Basic: 기본 HACCP 관리 기능
  - Pro: HACCP + 회계 관리 기능
  - Enterprise: 전체 기능 + 전담 지원
- **구독 확인**: 좌측 하단 사용자 프로필 > 구독 정보
- **플랜 변경/해지**: 관리자에게 문의 (support@goldenturtle.co.kr)

### 📌 고객센터 및 기술 지원
- **오류 발생 시**: 화면 캡처와 함께 오류 내용을 고객센터에 전달
- **기술 지원**: 이메일 support@goldenturtle.co.kr 또는 전화 문의
- **데이터 백업**: 시스템에서 자동 백업 (일 1회)

### 📌 자주 묻는 질문 (FAQ)
Q: 배치를 잘못 생성했는데 삭제할 수 있나요?
A: 진행 중이 아닌 배치는 삭제할 수 있습니다. 생산관리 → 해당 배치 선택 → "삭제" 버튼을 클릭하세요.

Q: CCP 모니터링에서 이탈이 발생하면 어떻게 하나요?
A: 시스템이 자동으로 이탈 알림을 생성합니다. 시정 조치 관리에서 원인 분석과 조치 내용을 기록하세요.

Q: 유통기한이 임박한 원재료를 확인하려면?
A: 재고 관리에서 "유통기한 임박" 필터를 사용하거나, 대시보드의 유통기한 알림을 확인하세요.

Q: 여러 사용자가 동시에 사용할 수 있나요?
A: 네, HACCP-ONE은 다중 사용자를 지원합니다. 관리자가 사용자 계정을 생성하고 권한을 설정할 수 있습니다.

Q: 데이터를 엑셀로 내보낼 수 있나요?
A: 대부분의 목록 화면에서 "엑셀 다운로드" 버튼을 통해 데이터를 엑셀 파일로 내보낼 수 있습니다.

Q: 모바일에서도 사용할 수 있나요?
A: 네, 웹 브라우저를 통해 모바일에서도 접속 가능하며, "모바일 빠른 점검" 기능은 모바일에 최적화되어 있습니다.
`;

// 대화 히스토리 저장 (메모리 + DB 영속화)
const conversationHistory = new Map<string, Array<{ role: string; content: string }>>();

/** DB에서 대화 히스토리 복구 (서버 재시작 시) */
async function loadConversationHistory(tenantId: number, convId: string): Promise<Array<{ role: string; content: string }>> {
  try {
    const conn = await getRawConnection();
    const [rows] = await conn.execute(
      `SELECT role, content FROM ai_chat_history
       WHERE tenant_id = ? AND conversation_id = ?
       ORDER BY created_at DESC LIMIT 20`,
      [tenantId, convId]
    );
    return ((rows as any[]).reverse()).map((r) => ({ role: r.role, content: r.content }));
  } catch {
    return [];
  }
}

/** DB에 대화 메시지 저장 */
async function saveConversationMessage(tenantId: number, convId: string, userId: string, role: string, content: string) {
  try {
    const conn = await getRawConnection();
    await conn.execute(
      `INSERT INTO ai_chat_history (tenant_id, conversation_id, user_id, role, content, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [tenantId, convId, userId, role, content.slice(0, 10000)]
    );
    // 오래된 히스토리 정리 (대화당 최대 50개)
    await conn.execute(
      `DELETE FROM ai_chat_history
       WHERE tenant_id = ? AND conversation_id = ?
         AND id NOT IN (
           SELECT id FROM (
             SELECT id FROM ai_chat_history
             WHERE tenant_id = ? AND conversation_id = ?
             ORDER BY created_at DESC LIMIT 50
           ) as recent
         )`,
      [tenantId, convId, tenantId, convId]
    );
  } catch {
    // DB 저장 실패 시 무시 (메모리에는 이미 저장됨)
  }
}

export const aiRouter = router({
  // ============================================================================
  // AI 채팅 (스마트 챗봇 - Action Engine 기반)
  // ============================================================================
  chat: tenantRequiredProcedure
    .input(
      z.object({
        message: z.string().min(1).max(2000),
        conversationId: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id?.toString() || "anonymous";
      const convId = input.conversationId || userId;
      const tenantId = ctx.tenantId;

      // 대화 히스토리 가져오기 (메모리 캐시 → DB 폴백)
      let history = conversationHistory.get(convId);
      if (!history || history.length === 0) {
        history = await loadConversationHistory(tenantId, convId);
      }
      history.push({ role: "user", content: input.message });
      await saveConversationMessage(tenantId, convId, userId, "user", input.message);

      try {
        // AI 기반 의도 분류
        const { intent } = await classifyIntentAI(input.message);

        let assistantMessage: string;

        if (intent === "general") {
          // 일반 질문: 기존 시스템 매뉴얼 기반 응답 (SYSTEM_PROMPT 사용)
          if (!ENV.forgeApiKey) {
            return { success: false, response: "AI 서비스가 아직 설정되지 않았습니다.", conversationId: convId };
          }

          const recentHistory = history.slice(-20);
          const result = await invokeLLM({
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              ...recentHistory.map((msg) => ({
                role: msg.role as "user" | "assistant",
                content: msg.content,
              })),
            ],
            maxTokens: 2000,
          });

          assistantMessage = typeof result.choices[0]?.message?.content === 'string'
            ? result.choices[0].message.content
            : '응답을 생성하지 못했습니다.';
        } else {
          // 데이터 기반 질문: Action Engine 사용 (DB 조회 → LLM)
          const actionResult = await processUserQuery(
            tenantId,
            input.message,
            history.slice(-10)
          );

          assistantMessage = actionResult.response;

          // 감사 로그 저장
          try {
            const conn = await getRawConnection();
            await conn.execute(
              `INSERT INTO ai_audit_logs
               (tenant_id, action_type, input_data, reference_data, output_text, user_id, created_at)
               VALUES (?, 'chat_response', ?, ?, ?, ?, NOW())`,
              [
                tenantId,
                JSON.stringify({ message: input.message, intent: actionResult.intent }),
                JSON.stringify({ dataSources: actionResult.dataSources }),
                assistantMessage.slice(0, 5000),
                ctx.user?.id || null,
              ]
            );
          } catch { /* 감사 로그 실패 무시 */ }
        }

        // 히스토리 업데이트 (메모리 + DB)
        history.push({ role: "assistant", content: assistantMessage });
        conversationHistory.set(convId, history.slice(-20));
        await saveConversationMessage(tenantId, convId, userId, "assistant", assistantMessage);

        return { success: true, response: assistantMessage, conversationId: convId };
      } catch (error: any) {
        console.error("[AI Chat Error]", error?.message || error);
        return { success: false, response: "AI 응답 생성 중 오류가 발생했습니다.", conversationId: convId };
      }
    }),

  // ============================================================================
  // 대화 히스토리 초기화
  // ============================================================================
  clearHistory: tenantRequiredProcedure
    .input(
      z.object({
        conversationId: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user?.id?.toString() || "anonymous";
      const convId = input.conversationId || userId;
      conversationHistory.delete(convId);
      return { success: true };
    }),

  // ============================================================================
  // HACCP 일지 초안 자동 생성
  // ============================================================================
  generateHaccpDraft: tenantRequiredProcedure
    .input(
      z.object({
        date: z.string(),
        type: z.enum(["daily", "weekly", "monthly"]),
      })
    )
    .mutation(async ({ input }) => {
      if (!ENV.forgeApiKey) {
        return { success: false, draft: "AI 서비스가 설정되지 않았습니다.", date: input.date, type: input.type };
      }
      try {
        const prompt = `오늘 날짜는 ${input.date}입니다.\n식품 제조업체의 HACCP ${input.type === "daily" ? "일일" : input.type === "weekly" ? "주간" : "월간"} 점검 일지 초안을 작성해 주세요.\n다음 항목을 포함: 작업장 위생, 개인 위생, 원부자재 검수, 가열 공정(85°C↑), 냉각 공정(10°C↓), 금속 검출기, 포장 상태, 보관 온도(냉장0~10°C/냉동-18°C↓), 세척 소독, 방충방서.\n각 항목에 적합/부적합 기본값, 특이사항란 포함. 표 형식.`;

        const result = await invokeLLM({
          messages: [
            { role: "system", content: "당신은 HACCP 전문가입니다. 식품 제조업체의 HACCP 점검 일지를 정확하고 전문적으로 작성합니다." },
            { role: "user", content: prompt },
          ],
          maxTokens: 2000,
        });

        const draft = typeof result.choices[0]?.message?.content === 'string'
          ? result.choices[0].message.content : "일지 초안 생성에 실패했습니다.";

        return { success: true, draft, date: input.date, type: input.type };
      } catch (error: any) {
        console.error("[AI HACCP Draft Error]", error?.message || error);
        return { success: false, draft: "일지 초안 생성 중 오류가 발생했습니다.", date: input.date, type: input.type };
      }
    }),

  // ============================================================================
  // 검사 결과 자동 판정
  // ============================================================================
  analyzeInspection: tenantRequiredProcedure
    .input(
      z.object({
        inspectionType: z.string(),
        measurements: z.array(
          z.object({
            item: z.string(),
            value: z.string(),
            standard: z.string(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      if (!ENV.forgeApiKey) {
        return { success: false, result: "AI 서비스가 설정되지 않았습니다." };
      }
      try {
        const measurementText = input.measurements
          .map((m) => `- ${m.item}: 측정값 ${m.value}, 기준값 ${m.standard}`)
          .join("\n");

        const prompt = `다음은 식품 ${input.inspectionType} 검사 결과입니다:\n${measurementText}\n각 항목에 대해: 1.적합/부적합 판정 2.판정근거 3.부적합시 권장 조치사항을 JSON 형식으로 답변해 주세요.`;

        const result = await invokeLLM({
          messages: [
            { role: "system", content: "당신은 식품 품질 검사 전문가입니다. 검사 결과를 정확하게 판정합니다. 반드시 JSON 형식으로 답변하세요." },
            { role: "user", content: prompt },
          ],
          maxTokens: 1500,
        });

        const analysisResult = typeof result.choices[0]?.message?.content === 'string'
          ? result.choices[0].message.content : "판정 결과를 생성하지 못했습니다.";

        return { success: true, result: analysisResult };
      } catch (error: any) {
        console.error("[AI Inspection Error]", error?.message || error);
        return { success: false, result: "검사 결과 분석 중 오류가 발생했습니다." };
      }
    }),

  // ============================================================================
  // AI 규칙엔진: 전체 규칙 평가 실행
  // ============================================================================
  evaluateRules: tenantRequiredProcedure
    .input(z.object({ date: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      try {
        const tenantId = ctx.tenantId;
        const date = input?.date || new Date().toISOString().split("T")[0];

        const results = await evaluateAllRules(tenantId, date);
        const savedCount = await saveAlerts(tenantId, results);

        // 감사 로그 저장
        try {
          const conn = await getRawConnection();
          await conn.execute(
            `INSERT INTO ai_audit_logs (tenant_id, action_type, input_data, output_data, user_id, created_at)
             VALUES (?, 'rule_evaluation', ?, ?, ?, NOW())`,
            [tenantId, JSON.stringify({ date }), JSON.stringify({ totalRules: results.length, savedAlerts: savedCount }), ctx.user?.id || null]
          );
        } catch { /* 감사 로그 실패 무시 */ }

        return {
          success: true,
          date,
          totalTriggered: results.length,
          savedAlerts: savedCount,
          results: results.map(r => ({
            ruleCode: r.ruleCode,
            severity: r.severity,
            title: r.title,
            message: r.message,
            entityType: r.entityType,
            entityCode: r.entityCode,
          })),
          bySeverity: {
            critical: results.filter(r => r.severity === "critical").length,
            high: results.filter(r => r.severity === "high").length,
            medium: results.filter(r => r.severity === "medium").length,
            low: results.filter(r => r.severity === "low").length,
          },
        };
      } catch (error: any) {
        console.error("[AI Rules Error]", error?.message || error);
        return { success: false, totalTriggered: 0, savedAlerts: 0, results: [], bySeverity: { critical: 0, high: 0, medium: 0, low: 0 } };
      }
    }),

  // ============================================================================
  // AI 대시보드 요약 조회
  // ============================================================================
  dashboardSummary: tenantRequiredProcedure
    .input(z.object({ date: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const summary = await getAIDashboardSummary(ctx.tenantId, input?.date);
        return { success: true, ...summary };
      } catch (error: any) {
        console.error("[AI Dashboard Error]", error?.message || error);
        return {
          success: false,
          date: input?.date || new Date().toISOString().split("T")[0],
          activeAlerts: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
          recentAlerts: [],
          batchRiskSummary: { high: 0, medium: 0, low: 0 },
        };
      }
    }),

  // ============================================================================
  // 알림 목록 조회
  // ============================================================================
  listAlerts: tenantRequiredProcedure
    .input(z.object({
      status: z.enum(["active", "acknowledged", "resolved", "dismissed"]).optional(),
      severity: z.enum(["low", "medium", "high", "critical"]).optional(),
      entityType: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const conn = await getRawConnection();
        const conditions = ["tenant_id = ?"];
        const params: any[] = [ctx.tenantId];

        if (input?.status) { conditions.push("status = ?"); params.push(input.status); }
        if (input?.severity) { conditions.push("severity = ?"); params.push(input.severity); }
        if (input?.entityType) { conditions.push("entity_type = ?"); params.push(input.entityType); }

        const limit = input?.limit || 50;
        const offset = input?.offset || 0;

        const [rows] = await conn.execute(
          `SELECT id, rule_code, title, message, severity, entity_type, entity_id, entity_code,
                  context_data, status, acknowledged_by, acknowledged_at, resolved_by, resolved_at,
                  resolved_note, created_at, expires_at
           FROM ai_alerts
           WHERE ${conditions.join(" AND ")}
           ORDER BY FIELD(severity, 'critical', 'high', 'medium', 'low'), created_at DESC
           LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        );

        const [countResult] = await conn.execute(
          `SELECT COUNT(*) as total FROM ai_alerts WHERE ${conditions.join(" AND ")}`,
          params
        );

        return {
          success: true,
          alerts: (rows as any[]).map(r => ({
            ...r,
            contextData: typeof r.context_data === "string" ? JSON.parse(r.context_data) : r.context_data,
          })),
          total: (countResult as any[])[0]?.total || 0,
        };
      } catch (error: any) {
        console.error("[AI Alerts Error]", error?.message || error);
        return { success: false, alerts: [], total: 0 };
      }
    }),

  // ============================================================================
  // 알림 상태 업데이트 (확인/해결/무시)
  // ============================================================================
  updateAlert: tenantRequiredProcedure
    .input(z.object({
      alertId: z.number(),
      status: z.enum(["acknowledged", "resolved", "dismissed"]),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        await updateAlertStatus(ctx.tenantId, input.alertId, input.status, ctx.user?.id || 0, input.note);
        return { success: true };
      } catch (error: any) {
        console.error("[AI Alert Update Error]", error?.message || error);
        return { success: false };
      }
    }),

  // ============================================================================
  // 기준서 업로드 및 파싱
  // ============================================================================
  uploadStandard: tenantRequiredProcedure
    .input(z.object({
      name: z.string().min(1).max(300),
      standardType: z.enum([
        "haccp_plan", "prerequisite", "operational_prp", "ccp_standard",
        "sanitation", "quality_standard", "facility_standard",
        "training_standard", "recall_plan", "custom",
      ]),
      content: z.string().min(10).max(50000),
      version: z.string().optional(),
      additionalContext: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const conn = await getRawConnection();

        // 1. 기준서 저장
        const [result] = await conn.execute(
          `INSERT INTO ai_standards
           (tenant_id, name, standard_type, content, status, version, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'uploaded', ?, ?, NOW(), NOW())`,
          [ctx.tenantId, input.name, input.standardType, input.content, input.version || null, ctx.user?.id || null]
        );
        const standardId = (result as any).insertId;

        // 2. AI 파싱 실행
        const startTime = Date.now();
        const { items, rawResponse } = await parseStandardToCheckItems(
          input.content,
          input.standardType,
          input.additionalContext
        );
        const latencyMs = Date.now() - startTime;

        // 3. 파싱 결과 저장
        await conn.execute(
          `UPDATE ai_standards SET parsed_items = ?, status = 'parsed', updated_at = NOW() WHERE id = ?`,
          [JSON.stringify(items), standardId]
        );

        // 4. 감사 로그
        try {
          await conn.execute(
            `INSERT INTO ai_audit_logs
             (tenant_id, action_type, input_data, reference_data, output_data, output_text, model_used, latency_ms, user_id, created_at)
             VALUES (?, 'checklist_generation', ?, ?, ?, ?, 'gpt-4o-mini', ?, ?, NOW())`,
            [
              ctx.tenantId,
              JSON.stringify({ name: input.name, type: input.standardType, contentLength: input.content.length }),
              JSON.stringify({ standardIds: [standardId] }),
              JSON.stringify({ itemCount: items.length }),
              rawResponse,
              latencyMs,
              ctx.user?.id || null,
            ]
          );
        } catch { /* 감사 로그 실패 무시 */ }

        return {
          success: true,
          standardId,
          parsedItems: items,
          itemCount: items.length,
        };
      } catch (error: any) {
        console.error("[AI Standard Upload Error]", error?.message || error);
        return { success: false, standardId: 0, parsedItems: [], itemCount: 0, error: error?.message };
      }
    }),

  // ============================================================================
  // 기준서 파싱 결과로 체크리스트 템플릿 생성
  // ============================================================================
  createChecklistFromStandard: tenantRequiredProcedure
    .input(z.object({
      standardId: z.number(),
      templateName: z.string().min(1).max(200),
      category: z.string(),
      items: z.array(z.object({
        id: z.string(),
        category: z.string(),
        checkItem: z.string(),
        standard: z.string(),
        frequency: z.string(),
        method: z.string().optional(),
        responsibleRole: z.string().optional(),
        itemType: z.string().optional(),
        validationRules: z.object({
          min: z.number().nullable().optional(),
          max: z.number().nullable().optional(),
          options: z.array(z.string()).nullable().optional(),
        }).optional(),
        importance: z.enum(["required", "recommended", "optional"]).optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await createTemplateFromStandard(
          ctx.tenantId,
          input.standardId,
          input.templateName,
          input.category,
          input.items,
          ctx.user?.id
        );
        return { success: true, ...result };
      } catch (error: any) {
        console.error("[AI Checklist Create Error]", error?.message || error);
        return { success: false, templateId: 0, itemCount: 0, error: error?.message };
      }
    }),

  // ============================================================================
  // 기준서 목록 조회
  // ============================================================================
  listStandards: tenantRequiredProcedure
    .input(z.object({
      standardType: z.string().optional(),
      status: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const conn = await getRawConnection();
        const conditions = ["tenant_id = ?"];
        const params: any[] = [ctx.tenantId];

        if (input?.standardType) { conditions.push("standard_type = ?"); params.push(input.standardType); }
        if (input?.status) { conditions.push("status = ?"); params.push(input.status); }

        const [rows] = await conn.execute(
          `SELECT id, name, standard_type, status, version, effective_date, is_active,
                  generated_template_id, created_by, created_at, updated_at,
                  JSON_LENGTH(parsed_items) as item_count
           FROM ai_standards
           WHERE ${conditions.join(" AND ")}
           ORDER BY created_at DESC`,
          params
        );

        return { success: true, standards: rows as any[] };
      } catch (error: any) {
        console.error("[AI Standards List Error]", error?.message || error);
        return { success: false, standards: [] };
      }
    }),

  // ============================================================================
  // 기준서 상세 조회 (파싱된 항목 포함)
  // ============================================================================
  getStandard: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const conn = await getRawConnection();
        const [rows] = await conn.execute(
          `SELECT * FROM ai_standards WHERE id = ? AND tenant_id = ?`,
          [input.id, ctx.tenantId]
        );

        const standard = (rows as any[])[0];
        if (!standard) return { success: false, standard: null };

        if (typeof standard.parsed_items === "string") {
          standard.parsed_items = JSON.parse(standard.parsed_items);
        }
        return { success: true, standard };
      } catch (error: any) {
        return { success: false, standard: null };
      }
    }),

  // ============================================================================
  // 시정조치서 초안 AI 생성
  // ============================================================================
  generateCorrectiveAction: tenantRequiredProcedure
    .input(z.object({
      type: z.string(),
      description: z.string(),
      location: z.string().optional(),
      batchCode: z.string().optional(),
      actualValue: z.string().optional(),
      standardValue: z.string().optional(),
      ccpType: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const startTime = Date.now();
        const { draft, rawResponse } = await generateCorrectiveActionDraft(input);
        const latencyMs = Date.now() - startTime;

        // 감사 로그
        try {
          const conn = await getRawConnection();
          await conn.execute(
            `INSERT INTO ai_audit_logs
             (tenant_id, action_type, input_data, output_data, output_text, model_used, latency_ms, user_id, created_at)
             VALUES (?, 'document_draft', ?, ?, ?, 'gpt-4o-mini', ?, ?, NOW())`,
            [ctx.tenantId, JSON.stringify(input), JSON.stringify(draft), rawResponse, latencyMs, ctx.user?.id || null]
          );
        } catch { /* ignore */ }

        return { success: true, draft };
      } catch (error: any) {
        console.error("[AI Corrective Action Error]", error?.message || error);
        return { success: false, draft: {}, error: error?.message };
      }
    }),

  // ============================================================================
  // 점검결과 AI 요약
  // ============================================================================
  summarizeInspection: tenantRequiredProcedure
    .input(z.object({
      type: z.string(),
      date: z.string(),
      items: z.array(z.object({
        name: z.string(),
        standard: z.string(),
        result: z.string(),
        passed: z.boolean(),
      })),
      additionalInfo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { summary } = await generateInspectionSummary(input);
        return { success: true, summary };
      } catch (error: any) {
        console.error("[AI Inspection Summary Error]", error?.message || error);
        return { success: false, summary: "" };
      }
    }),

  // ============================================================================
  // 감사 대응 자료 자동 묶기
  // ============================================================================
  gatherAuditDocs: tenantRequiredProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const result = await gatherAuditDocuments(ctx.tenantId, input.startDate, input.endDate);
        return { success: true, ...result };
      } catch (error: any) {
        console.error("[AI Audit Docs Error]", error?.message || error);
        return { success: false, period: { startDate: input.startDate, endDate: input.endDate }, summary: {} };
      }
    }),

  // ============================================================================
  // AI 판단 로그 조회
  // ============================================================================
  listAuditLogs: tenantRequiredProcedure
    .input(z.object({
      actionType: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const conn = await getRawConnection();
        const conditions = ["tenant_id = ?"];
        const params: any[] = [ctx.tenantId];

        if (input?.actionType) { conditions.push("action_type = ?"); params.push(input.actionType); }

        const [rows] = await conn.execute(
          `SELECT id, action_type, input_data, reference_data, output_data, output_text,
                  user_modified, model_used, tokens_used, latency_ms, user_id, created_at
           FROM ai_audit_logs
           WHERE ${conditions.join(" AND ")}
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`,
          [...params, input?.limit || 50, input?.offset || 0]
        );

        return { success: true, logs: rows as any[] };
      } catch (error: any) {
        return { success: false, logs: [] };
      }
    }),

  // ============================================================================
  // 시스템 규칙 목록 조회 (어떤 규칙이 있는지)
  // ============================================================================
  listSystemRules: tenantRequiredProcedure
    .query(async () => {
      return {
        success: true,
        rules: Object.values(SYSTEM_RULES).map(rule => ({
          code: rule.code,
          name: rule.name,
          ruleType: rule.ruleType,
          entityType: rule.entityType,
          severity: rule.severity,
          description: rule.description,
        })),
      };
    }),

  // ============================================================================
  // AI Context Layer API (AI가 직접 접근하는 데이터 API)
  // ============================================================================

  /** 일일 종합 현황 */
  dailyOverview: tenantRequiredProcedure
    .input(z.object({ date: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const data = await getDailyOverview(ctx.tenantId, input?.date);
        return { success: true, data };
      } catch (error: any) {
        return { success: false, data: null, error: error?.message };
      }
    }),

  /** 배치 요약 + 리스크 점수 */
  batchSummary: tenantRequiredProcedure
    .input(z.object({
      batchId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const data = await getBatchSummary(ctx.tenantId, input || {});
        return { success: true, data };
      } catch (error: any) {
        return { success: false, data: [], error: error?.message };
      }
    }),

  /** CCP 이벤트 요약 */
  ccpEvents: tenantRequiredProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      ccpType: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const data = await getCcpEventSummary(ctx.tenantId, input || {});
        return { success: true, data };
      } catch (error: any) {
        return { success: false, data: [], error: error?.message };
      }
    }),

  /** 체크리스트 현황 */
  checklistStatus: tenantRequiredProcedure
    .input(z.object({ date: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const data = await getChecklistStatus(ctx.tenantId, input?.date);
        return { success: true, data };
      } catch (error: any) {
        return { success: false, data: null, error: error?.message };
      }
    }),

  /** 이탈/부적합 이력 */
  deviationHistory: tenantRequiredProcedure
    .input(z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.number().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const data = await getDeviationHistory(ctx.tenantId, input || {});
        return { success: true, data };
      } catch (error: any) {
        return { success: false, data: [], error: error?.message };
      }
    }),

  /** 설비 상태 */
  equipmentHealth: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      try {
        const data = await getEquipmentHealth(ctx.tenantId);
        return { success: true, data };
      } catch (error: any) {
        return { success: false, data: null, error: error?.message };
      }
    }),

  /** 생산 분석 (배치별 수율 원인 분석) */
  productionAnalysis: tenantRequiredProcedure
    .input(z.object({ batchId: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const data = await getProductionAnalysis(ctx.tenantId, input.batchId);
        return { success: true, data };
      } catch (error: any) {
        return { success: false, data: null, error: error?.message };
      }
    }),

  /** 감사 대비 상태 */
  auditReadiness: tenantRequiredProcedure
    .input(z.object({ periodDays: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const data = await getAuditReadiness(ctx.tenantId, input?.periodDays || 90);
        return { success: true, data };
      } catch (error: any) {
        return { success: false, data: null, error: error?.message };
      }
    }),

  // ============================================================================
  // Knowledge Base (RAG) API - 지식베이스 문서 관리 + 시맨틱 검색
  // ============================================================================

  /** 문서 업로드 (자동 청크 + 임베딩 생성) */
  kbUploadDocument: tenantRequiredProcedure
    .input(z.object({
      title: z.string().min(1).max(500),
      description: z.string().optional(),
      docType: z.enum([
        "regulation", "standard", "sop", "manual", "guideline",
        "training", "template", "faq", "internal", "custom",
      ]),
      content: z.string().min(10),
      sourceUrl: z.string().optional(),
      sourceFile: z.string().optional(),
      isGlobal: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await uploadDocument(ctx.tenantId, {
          ...input,
          createdBy: ctx.userId,
        });

        // 감사 로그
        try {
          const conn = await getRawConnection();
          await conn.execute(
            `INSERT INTO ai_audit_logs (tenant_id, action_type, input_data, output_data, user_id, created_at)
             VALUES (?, 'summary_generation', ?, ?, ?, NOW())`,
            [
              ctx.tenantId,
              JSON.stringify({ title: input.title, docType: input.docType, contentLength: input.content.length }),
              JSON.stringify(result),
              ctx.userId,
            ]
          );
        } catch {}

        return { success: true, ...result };
      } catch (error: any) {
        return { success: false, error: error?.message, documentId: 0, chunkCount: 0, status: "error" };
      }
    }),

  /** 문서 목록 조회 */
  kbListDocuments: tenantRequiredProcedure
    .input(z.object({
      docType: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().min(1).max(100).optional(),
      offset: z.number().min(0).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const result = await listDocuments(ctx.tenantId, input || {});
        return { success: true, ...result };
      } catch (error: any) {
        return { success: false, documents: [], total: 0, error: error?.message };
      }
    }),

  /** 문서 상세 조회 */
  kbGetDocument: tenantRequiredProcedure
    .input(z.object({ documentId: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const doc = await getDocument(ctx.tenantId, input.documentId);
        return { success: true, document: doc };
      } catch (error: any) {
        return { success: false, document: null, error: error?.message };
      }
    }),

  /** 문서 삭제 */
  kbDeleteDocument: tenantRequiredProcedure
    .input(z.object({ documentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const deleted = await deleteDocument(ctx.tenantId, input.documentId);
        return { success: deleted };
      } catch (error: any) {
        return { success: false, error: error?.message };
      }
    }),

  /** 지식베이스 검색 (RAG) */
  kbSearch: tenantRequiredProcedure
    .input(z.object({
      query: z.string().min(1),
      topK: z.number().min(1).max(20).optional(),
      minScore: z.number().min(0).max(1).optional(),
      docType: z.string().optional(),
      documentIds: z.array(z.number()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const results = await searchKnowledge(ctx.tenantId, input.query, {
          topK: input.topK,
          minScore: input.minScore,
          docType: input.docType,
          documentIds: input.documentIds,
        });
        return { success: true, results };
      } catch (error: any) {
        return { success: false, results: [], error: error?.message };
      }
    }),

  /** 문서 재인덱싱 (임베딩 재생성) */
  kbReindexDocument: tenantRequiredProcedure
    .input(z.object({ documentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await reindexDocument(ctx.tenantId, input.documentId);
        return { success: true, ...result };
      } catch (error: any) {
        return { success: false, error: error?.message, chunksUpdated: 0 };
      }
    }),

  /** 지식베이스 통계 */
  kbStats: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      try {
        const stats = await getKBStats(ctx.tenantId);
        return { success: true, ...stats };
      } catch (error: any) {
        return { success: false, error: error?.message, totalDocuments: 0, readyDocuments: 0, totalChunks: 0, totalTokens: 0, byDocType: [] };
      }
    }),

  // ============================================================================
  // 배치 AI 리스크 요약 (BatchDetail 페이지용)
  // ============================================================================

  /** 특정 배치의 AI 리스크 요약 (알림 + 점수 + 추천) */
  batchRiskSummary: tenantRequiredProcedure
    .input(z.object({ batchId: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const conn = await getRawConnection();

        // 1. 이 배치에 관련된 활성 AI 알림 조회
        const [alertRows] = await conn.execute(
          `SELECT id, rule_code, title, message, severity, entity_type, entity_code, context_data, status, created_at
           FROM ai_alerts
           WHERE tenant_id = ? AND entity_type = 'batch' AND entity_id = ? AND status IN ('active', 'acknowledged')
           ORDER BY FIELD(severity, 'critical', 'high', 'medium', 'low'), created_at DESC
           LIMIT 20`,
          [ctx.tenantId, input.batchId]
        );

        // 2. 배치 관련 CCP 이탈 알림
        const [ccpAlertRows] = await conn.execute(
          `SELECT id, rule_code, title, message, severity, context_data, created_at
           FROM ai_alerts
           WHERE tenant_id = ? AND entity_type = 'ccp'
             AND status IN ('active', 'acknowledged')
             AND JSON_CONTAINS(context_data, CAST(? AS JSON), '$.relatedBatchIds')
           ORDER BY created_at DESC LIMIT 10`,
          [ctx.tenantId, JSON.stringify(input.batchId)]
        );

        // 3. 리스크 점수 계산 (Context Layer 활용)
        let riskData = null;
        try {
          const summaries = await getBatchSummary(ctx.tenantId, { batchId: input.batchId });
          if (summaries.length > 0) riskData = summaries[0];
        } catch {}

        const alerts = (alertRows as any[]).concat(ccpAlertRows as any[]);
        const bySeverity = {
          critical: alerts.filter(a => a.severity === "critical").length,
          high: alerts.filter(a => a.severity === "high").length,
          medium: alerts.filter(a => a.severity === "medium").length,
          low: alerts.filter(a => a.severity === "low").length,
        };

        return {
          success: true,
          batchId: input.batchId,
          riskScore: riskData?.riskScore ?? null,
          riskLevel: riskData?.riskLevel ?? (bySeverity.critical > 0 ? "critical" : bySeverity.high > 0 ? "high" : "low"),
          alertCount: alerts.length,
          bySeverity,
          alerts: alerts.map((a: any) => ({
            id: a.id,
            ruleCode: a.rule_code,
            title: a.title,
            message: a.message,
            severity: a.severity,
            createdAt: a.created_at,
          })),
          yieldDeviation: riskData?.yieldDeviation ?? null,
          ccpDeviationCount: riskData?.ccpDeviationCount ?? 0,
          checklistMissing: riskData?.checklistMissing ?? 0,
        };
      } catch (error: any) {
        return {
          success: false, batchId: input.batchId, riskScore: null, riskLevel: null,
          alertCount: 0, bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
          alerts: [], yieldDeviation: null, ccpDeviationCount: 0, checklistMissing: 0,
          error: error?.message,
        };
      }
    }),

  // ============================================================================
  // 커스텀 규칙 관리 CRUD (테넌트별)
  // ============================================================================

  /** 커스텀 규칙 목록 조회 */
  listCustomRules: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      try {
        const conn = await getRawConnection();
        const [rows] = await conn.execute(
          `SELECT id, code, name, description, rule_type, entity_type, conditions,
                  severity, notify_roles, is_active, is_system, created_at, updated_at
           FROM ai_rules
           WHERE tenant_id = ?
           ORDER BY is_system DESC, severity DESC, created_at DESC`,
          [ctx.tenantId]
        );
        return { success: true, rules: (rows as any[]).map(r => ({
          ...r,
          conditions: typeof r.conditions === "string" ? JSON.parse(r.conditions) : r.conditions,
          notifyRoles: typeof r.notify_roles === "string" ? JSON.parse(r.notify_roles) : r.notify_roles,
          isActive: r.is_active,
          isSystem: r.is_system,
          ruleType: r.rule_type,
          entityType: r.entity_type,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })) };
      } catch (error: any) {
        return { success: false, rules: [], error: error?.message };
      }
    }),

  /** 커스텀 규칙 생성 */
  createCustomRule: tenantRequiredProcedure
    .input(z.object({
      code: z.string().min(1).max(100),
      name: z.string().min(1).max(200),
      description: z.string().optional(),
      ruleType: z.enum(["threshold", "missing", "overdue", "anomaly", "recurrence"]),
      entityType: z.enum(["ccp", "checklist", "equipment", "batch", "lot", "inspection", "hygiene", "calibration", "document", "training"]),
      conditions: z.record(z.any()),
      severity: z.enum(["low", "medium", "high", "critical"]),
      notifyRoles: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const conn = await getRawConnection();
        const [result] = await conn.execute(
          `INSERT INTO ai_rules
           (tenant_id, code, name, description, rule_type, entity_type, conditions, severity, notify_roles, is_active, is_system, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NOW(), NOW())`,
          [
            ctx.tenantId,
            input.code,
            input.name,
            input.description || null,
            input.ruleType,
            input.entityType,
            JSON.stringify(input.conditions),
            input.severity,
            JSON.stringify(input.notifyRoles || []),
          ]
        );
        return { success: true, ruleId: (result as any).insertId };
      } catch (error: any) {
        return { success: false, error: error?.message };
      }
    }),

  /** 커스텀 규칙 수정 */
  updateCustomRule: tenantRequiredProcedure
    .input(z.object({
      ruleId: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      conditions: z.record(z.any()).optional(),
      severity: z.enum(["low", "medium", "high", "critical"]).optional(),
      notifyRoles: z.array(z.string()).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const conn = await getRawConnection();

        // 시스템 규칙은 수정 불가
        const [existing] = await conn.execute(
          `SELECT is_system FROM ai_rules WHERE id = ? AND tenant_id = ?`,
          [input.ruleId, ctx.tenantId]
        );
        if ((existing as any[]).length === 0) {
          return { success: false, error: "규칙을 찾을 수 없습니다." };
        }
        if ((existing as any[])[0].is_system === 1) {
          // 시스템 규칙은 활성화/비활성화만 허용
          if (input.isActive !== undefined) {
            await conn.execute(
              `UPDATE ai_rules SET is_active = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?`,
              [input.isActive ? 1 : 0, input.ruleId, ctx.tenantId]
            );
            return { success: true };
          }
          return { success: false, error: "시스템 규칙은 활성화/비활성화만 변경할 수 있습니다." };
        }

        const sets: string[] = ["updated_at = NOW()"];
        const params: any[] = [];

        if (input.name) { sets.push("name = ?"); params.push(input.name); }
        if (input.description !== undefined) { sets.push("description = ?"); params.push(input.description); }
        if (input.conditions) { sets.push("conditions = ?"); params.push(JSON.stringify(input.conditions)); }
        if (input.severity) { sets.push("severity = ?"); params.push(input.severity); }
        if (input.notifyRoles) { sets.push("notify_roles = ?"); params.push(JSON.stringify(input.notifyRoles)); }
        if (input.isActive !== undefined) { sets.push("is_active = ?"); params.push(input.isActive ? 1 : 0); }

        params.push(input.ruleId, ctx.tenantId);
        await conn.execute(
          `UPDATE ai_rules SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`,
          params
        );
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error?.message };
      }
    }),

  /** 커스텀 규칙 삭제 (시스템 규칙은 삭제 불가) */
  deleteCustomRule: tenantRequiredProcedure
    .input(z.object({ ruleId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const conn = await getRawConnection();
        const [result] = await conn.execute(
          `DELETE FROM ai_rules WHERE id = ? AND tenant_id = ? AND is_system = 0`,
          [input.ruleId, ctx.tenantId]
        );
        return { success: (result as any).affectedRows > 0 };
      } catch (error: any) {
        return { success: false, error: error?.message };
      }
    }),

  // ============================================================================
  // P8-2: AI 이상탐지 (Anomaly Detection)
  // ============================================================================
  detectAnomalies: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      const { detectAnomalies } = await import("./db/aiAnomalyDetection");
      return detectAnomalies(ctx.tenantId);
    }),

  // ============================================================================
  // P8-3: AI 예측 분석
  // ============================================================================
  getPredictions: tenantRequiredProcedure
    .input(z.object({ focus: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const { generatePredictions } = await import("./db/aiPrediction");
      return generatePredictions(ctx.tenantId, input?.focus);
    }),

  // ============================================================================
  // P8-4: AI HACCP 계획서 자동생성
  // ============================================================================
  generateHaccpPlan: tenantRequiredProcedure
    .input(
      z.object({
        companyName: z.string(),
        businessType: z.string(),
        products: z.array(z.string()),
        rawMaterials: z.array(z.string()),
        processes: z.array(z.string()),
        facilityInfo: z.string().optional(),
        existingCCPs: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { generateHaccpPlan } = await import("./db/aiHaccpPlan");
      return generateHaccpPlan(ctx.tenantId, input);
    }),

  generateHaccpPlanAuto: tenantRequiredProcedure
    .mutation(async ({ ctx }) => {
      const { generateHaccpPlanFromExistingData } = await import("./db/aiHaccpPlan");
      return generateHaccpPlanFromExistingData(ctx.tenantId);
    }),

  // ============================================================================
  // P8-5: AI 보고서 내러티브
  // ============================================================================
  generateFinancialNarrative: tenantRequiredProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
        type: z.enum(["monthly", "quarterly"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { generateFinancialNarrative } = await import("./db/aiReportNarrative");
      return generateFinancialNarrative(ctx.tenantId, { startDate: input.startDate, endDate: input.endDate }, input.type);
    }),

  generateHaccpNarrative: tenantRequiredProcedure
    .input(z.object({ period: z.enum(["weekly", "monthly"]).optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const { generateHaccpNarrative } = await import("./db/aiReportNarrative");
      return generateHaccpNarrative(ctx.tenantId, input?.period);
    }),

  generateExecutiveSummary: tenantRequiredProcedure
    .mutation(async ({ ctx }) => {
      const { generateExecutiveSummary } = await import("./db/aiReportNarrative");
      return generateExecutiveSummary(ctx.tenantId);
    }),

  // ============================================================================
  // P8-6: AI 감사 자료 패키지
  // ============================================================================
  generateAuditPackage: tenantRequiredProcedure
    .input(
      z.object({
        auditType: z.enum(["haccp_certification", "haccp_renewal", "regular_audit"]).optional(),
      }).optional()
    )
    .mutation(async ({ ctx, input }) => {
      const { generateAuditPackage } = await import("./db/aiAuditPackage");
      return generateAuditPackage(ctx.tenantId, input?.auditType);
    }),

  // ============================================================================
  // P8-7: AI 공급업체 리스크 스코어링
  // ============================================================================
  analyzeSupplierRisk: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      const { analyzeSupplierRisk } = await import("./db/aiSupplierRisk");
      return analyzeSupplierRisk(ctx.tenantId);
    }),

  // ============================================================================
  // P8-8: AI 교육 추천
  // ============================================================================
  getTrainingRecommendations: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      const { generateTrainingRecommendations } = await import("./db/aiTrainingRecommendation");
      return generateTrainingRecommendations(ctx.tenantId);
    }),

  // ============================================================================
  // P9-7: 30일 트렌드 데이터 (알림/CCP/체크리스트 추이)
  // ============================================================================
  trendData: tenantRequiredProcedure
    .input(z.object({ days: z.number().min(7).max(90).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId;
      const days = input?.days || 30;
      const conn = await getRawConnection();

      // 병렬로 3가지 트렌드 조회
      const [alertTrend, ccpTrend, checklistTrend] = await Promise.all([
        // 1. 일별 알림 발생 추이 (severity별)
        conn.execute(
          `SELECT DATE(created_at) as date,
                  SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical_count,
                  SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) as high_count,
                  SUM(CASE WHEN severity IN ('medium', 'low') THEN 1 ELSE 0 END) as other_count,
                  COUNT(*) as total
           FROM ai_alerts
           WHERE tenant_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
           GROUP BY DATE(created_at)
           ORDER BY date`,
          [tenantId, days]
        ),
        // 2. 일별 CCP 적합/부적합 추이
        conn.execute(
          `SELECT DATE(record_date) as date,
                  SUM(CASE WHEN pass_fail = '적합' THEN 1 ELSE 0 END) as pass_count,
                  SUM(CASE WHEN pass_fail = '부적합' THEN 1 ELSE 0 END) as fail_count,
                  COUNT(*) as total
           FROM ccp_monitoring_records
           WHERE tenant_id = ? AND record_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
           GROUP BY DATE(record_date)
           ORDER BY date`,
          [tenantId, days]
        ),
        // 3. 일별 체크리스트 완료율 추이
        conn.execute(
          `SELECT DATE(created_at) as date,
                  SUM(CASE WHEN status IN ('completed', 'approved') THEN 1 ELSE 0 END) as completed,
                  COUNT(*) as total
           FROM checklist_instances
           WHERE tenant_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
           GROUP BY DATE(created_at)
           ORDER BY date`,
          [tenantId, days]
        ),
      ]);

      const formatRows = (raw: any) => {
        const rows = Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : raw;
        return (rows as any[]).map((r: any) => ({
          ...r,
          date: r.date ? new Date(r.date).toISOString().split("T")[0] : r.date,
        }));
      };

      return {
        alerts: formatRows(alertTrend).map((r: any) => ({
          date: r.date,
          critical: Number(r.critical_count || 0),
          high: Number(r.high_count || 0),
          other: Number(r.other_count || 0),
          total: Number(r.total || 0),
        })),
        ccp: formatRows(ccpTrend).map((r: any) => ({
          date: r.date,
          pass: Number(r.pass_count || 0),
          fail: Number(r.fail_count || 0),
          total: Number(r.total || 0),
        })),
        checklist: formatRows(checklistTrend).map((r: any) => ({
          date: r.date,
          completed: Number(r.completed || 0),
          total: Number(r.total || 0),
          rate: r.total > 0 ? Math.round((Number(r.completed || 0) / Number(r.total)) * 100) : 0,
        })),
      };
    }),

  // ============================================================================
  // P9-9: 알림 목록 CSV 내보내기
  // ============================================================================
  exportAlertsCsv: tenantRequiredProcedure
    .input(z.object({
      status: z.enum(["active", "acknowledged", "resolved", "dismissed"]).optional(),
      severity: z.enum(["critical", "high", "medium", "low"]).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId;
      const conn = await getRawConnection();

      let where = `WHERE tenant_id = ?`;
      const params: any[] = [tenantId];

      if (input?.status) { where += ` AND status = ?`; params.push(input.status); }
      if (input?.severity) { where += ` AND severity = ?`; params.push(input.severity); }
      if (input?.startDate) { where += ` AND created_at >= ?`; params.push(input.startDate); }
      if (input?.endDate) { where += ` AND created_at <= ?`; params.push(input.endDate); }

      const [rows] = await conn.execute(
        `SELECT id, rule_code, title, message, severity, entity_type, entity_code, status, created_at, resolved_at
         FROM ai_alerts ${where}
         ORDER BY created_at DESC
         LIMIT 5000`,
        params
      );

      // CSV 생성
      const header = "ID,규칙코드,제목,메시지,심각도,대상유형,대상코드,상태,생성일시,해결일시";
      const csvRows = (rows as any[]).map((r: any) =>
        [r.id, r.rule_code, `"${(r.title || '').replace(/"/g, '""')}"`, `"${(r.message || '').replace(/"/g, '""')}"`,
         r.severity, r.entity_type, r.entity_code, r.status, r.created_at, r.resolved_at || ""].join(",")
      );

      return { csv: [header, ...csvRows].join("\n"), count: (rows as any[]).length };
    }),

  // ============================================================================
  // ERP AI: 비용 이상탐지
  // ============================================================================
  detectExpenseAnomalies: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      const { detectExpenseAnomalies } = await import("./db/aiExpenseAnomaly");
      return detectExpenseAnomalies(ctx.tenantId);
    }),

  // ============================================================================
  // ERP AI B-2: 현금흐름 예측
  // ============================================================================
  forecastCashFlow: tenantRequiredProcedure
    .input(z.object({ days: z.number().min(7).max(90).default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const { forecastCashFlow } = await import("./db/aiCashFlowForecast");
      return forecastCashFlow(ctx.tenantId, input?.days || 30);
    }),

  // ============================================================================
  // ERP AI B-3: AP/AR 연체 리스크 분석 + LLM 권고
  // ============================================================================
  analyzePaymentRisk: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      const { analyzePaymentRisk } = await import("./db/aiPaymentRiskAnalysis");
      return analyzePaymentRisk(ctx.tenantId);
    }),

  // ============================================================================
  // ERP AI B-4: 분개 검증 AI
  // ============================================================================
  validateJournals: tenantRequiredProcedure
    .input(z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const { validateJournalEntries } = await import("./db/aiJournalValidation");
      return validateJournalEntries(ctx.tenantId, input?.startDate, input?.endDate);
    }),
});
