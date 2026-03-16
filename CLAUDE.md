# CLAUDE.md - HACCP-ONE 프로젝트 AI 개발 가이드

> 최종 업데이트: 2026-03-16

---

## 프로젝트 개요

**HACCP-ONE**은 HACCP(식품안전관리인증) + ERP + 회계를 통합한 SaaS 솔루션입니다.
- **회사**: 골든터틀컴퍼니 (www.goldenturtle.co.kr)
- **스택**: React (Vite) + tRPC + MySQL (Drizzle ORM) + TypeScript
- **멀티테넌트**: Row-level isolation (tenant_id 기반)
- **인증**: 로컬 JWT (회원가입 → 관리자 승인 → 로그인)
- **배포**: 외부 서버 haccpone.co.kr (49.50.130.101), PM2

---

## 디렉토리 구조

```
webapp/
├── client/src/          # React 프론트엔드
│   ├── components/      # 공통 컴포넌트 (UI, Form dialogs)
│   ├── pages/           # 페이지 컴포넌트
│   └── lib/             # 유틸리티
├── server/              # Express + tRPC 백엔드
│   ├── routers/         # tRPC 라우터 (기능별)
│   │   ├── accounting/  # 회계 서브라우터 (daily, monthly, AP/AR, docs, matching)
│   │   ├── haccp/       # HACCP 서브라우터 (CCP, 검사, LOT, 통합)
│   │   ├── inventory/   # 재고 서브라우터 (재고, 수불, 알림)
│   │   ├── production/  # 생산 서브라우터 (배치, 레시피, 원가, 일보)
│   │   ├── master/      # 마스터 서브라우터 (원재료, 제품, 거래처, 카테고리)
│   │   ├── auth/        # 인증 서브라우터
│   │   ├── dashboard/   # 대시보드 서브라우터
│   │   ├── system/      # 시스템 서브라우터 (알림, 승인, 엑셀, 설정)
│   │   └── *.ts         # 독립 라우터 (expense, bank 등)
│   ├── db/              # DB 헬퍼 함수 (Raw SQL + Drizzle)
│   └── index.ts         # 서버 진입점
├── drizzle/             # Drizzle ORM 스키마 정의
│   ├── schema/          # 개별 테이블 스키마
│   ├── schema_main.ts   # 메인 통합 스키마
│   └── schema_*.ts      # 도메인별 스키마
├── scripts/             # 마이그레이션/시드 스크립트
├── shared/              # 공통 타입/유틸리티
└── dist/                # 빌드 산출물
```

---

## 핵심 아키텍처 결정사항

### 1. 데이터베이스 테이블 구조

#### 계정과목 (Chart of Accounts) - **중요!**
현재 3개의 계정 테이블이 공존하는 상태 (통합 필요):

| 테이블 | 용도 | 상태 |
|--------|------|------|
| `accounting_accounts` | **주 테이블** - 5분류(자산/부채/자본/수익/비용) | ✅ 활성, system_code 추가 완료 |
| `accounting_accounts_v2` | ~~AP/AR 참조용~~ | ⛔ deprecated (P2-2에서 통합 → accounting_accounts) |
| `accounting_categories` | 비용 카테고리 (account_categories도 별도 존재) | ⚠️ @deprecated (P4-2), 계속 축소 중 |

**system_code 체계** (2026-03-04 추가):
- `accounting_accounts.system_code` 컬럼으로 역할 기반 계정 식별
- 하드코딩된 계정 코드(예: `WHERE code='1010'`) 대신 `resolveSystemAccount()` 사용
- 상수 정의: `drizzle/schema/accountingAccounts.ts` → `SYSTEM_ACCOUNTS`
- 헬퍼: `server/db/journalHelper.ts` → `resolveSystemAccount()`, `getPaymentSystemAccount()`, `insertJournalLine()`, `ensureSystemAccounts()`

#### 주요 시스템 코드 매핑
```
CASH → 현금 (1010)
BANK_DEPOSIT → 보통예금 (1020)
VAT_INPUT → 부가세대급금 (1350)
ACCOUNTS_PAYABLE → 외상매입금 (2010)
ACCOUNTS_PAYABLE_CARD → 미지급금-카드 (2020)
VAT_OUTPUT → 부가세예수금 (2350)
SALES_REVENUE → 상품매출 (4010)
COST_OF_GOODS → 매출원가 (5010)
```

### 2. 회계 모듈 연동 현황 (2026-03-05 기준)

| 모듈 | 연동 상태 | 상세 |
|------|-----------|------|
| **비용 전표 (expense.ts)** | ✅ 완전 | CRUD + 자동분개 + 반복 템플릿 + 미지급 관리 |
| **매입 (haccpIntegration)** | ⚠️ 약함 | `account_category_id` FK만 존재, 자동분개 없음 |
| **매출 (haccpIntegration)** | ❌ 없음 | 계정 연결 컬럼 자체가 없음 |
| **은행매칭 (matchingRules)** | ✅ 매칭엔진 | 규칙 CRUD + 자동매칭(keyword/amount/pattern/combined) + 통계 (P4-1) |
| **AP/AR 원장** | ✅ 연결 | tenant 격리 + accountingAccountId 활용 (P2-1) |
| **일/월 마감** | ⚠️ 부분 | 집계만, 계정과목 연동 없음 |
| **재무보고서** | ✅ 완전 | 시산표 + 재무상태표 + 손익계산서 + Excel 내보내기 (P3+P4-3) |
| **기초잔액** | ✅ 완전 | 전기이월 설정/수정/삭제, 대차 균형 검증 (P4-4) |
| **materialLedger** | ✅ 수정 | ~~잘못된 테이블 참조~~ → resolveSystemAccount + 복식부기 전환 (P0) |

### 3. UI 탭 구조
```
[WORK] - 일반 업무 (대시보드, 마스터데이터, 시스템 설정)
[회계]  - 회계 모듈 (매입/매출, 거래처, 비용전표, 은행, 마감, 계정과목)
[HACCP] - 식품안전 (체크리스트, CCP, 재고, 생산, 검사, LOT 추적)
```

---

### 현재 진행 상황 (2026-03-05)

### ✅ 완료된 작업

#### Phase 0 (P0) - 기반 정비
- [x] `accounting_accounts` 테이블에 `system_code` 컬럼 추가 (마이그레이션 완료)
- [x] `(tenant_id, code)` 복합 유니크 인덱스로 변경
- [x] `SYSTEM_ACCOUNTS` 상수 정의 (`drizzle/schema/accountingAccounts.ts`)
- [x] `journalHelper.ts` 생성 - 공통 분개 유틸리티
  - `resolveSystemAccount()` - system_code 기반 계정 조회 (폴백 포함)
  - `getPaymentSystemAccount()` - 결제수단 → 시스템계정 매핑
  - `insertJournalLine()` - 공통 분개행 INSERT
  - `ensureSystemAccounts()` - 테넌트 초기 설정 시드
  - `postExpenseVoucher()` - 비용전표 확정 분개 (P2-3 추가)
  - `cancelExpenseJournal()` - 비용전표 취소 분개 삭제 (P2-3 추가)
- [x] 마이그레이션 스크립트 (`scripts/migrate-system-code.ts`)
- [x] 계정과목 관리 UI 리디자인 (부모-자식 탭 구조)
  - Tab A "계정 구조 (5분류)": 카드뷰, 고정 5대 분류, 상위계정(그룹) 관리
  - Tab B "계정 과목 목록": 테이블뷰, CRUD, 분류(5분류)/상위계정 필수 선택
- [x] `materialLedger.ts` 잘못된 테이블 참조 수정 (`accounting_categories` → `resolveSystemAccount()`)
  - 복식부기로 전환: 차변 원재료/매출원가, 대변 외상매입금/원재료

#### Phase 1 (P1) - 자동분개 확대
- [x] `expense.ts` 하드코딩 제거 → `resolveSystemAccount()` + `insertJournalLine()` 전환
  - VAT 조회: `WHERE code='1350'` → `resolveSystemAccount(SYSTEM_ACCOUNTS.VAT_INPUT)`
  - 결제수단: switch/case 하드코딩 → `getPaymentSystemAccount()` 자동 매핑
- [x] 매입(Purchase) 확정 자동분개 (`server/lib/purchasePost.ts`)
  - 차변: 원재료(INVENTORY_RAW) + 부가세대급금(VAT_INPUT, 세액 있을 때)
  - 대변: 외상매입금(ACCOUNTS_PAYABLE) — 총액
  - tenant_id 격리 추가
- [x] 매출(Sale) 확정 자동분개 (`server/lib/productSalePost.ts`)
  - 매출 인식: 차변 외상매출금(ACCOUNTS_RECEIVABLE), 대변 매출(SALES_REVENUE)
  - 원가 인식: 차변 매출원가(COST_OF_GOODS), 대변 제품재고(INVENTORY_GOODS)
  - tenant_id 격리 추가

#### Phase 2 (P2) - 통합 및 연결 ✅ 완료 (2026-03-04)
- [x] **P2-1**: AP/AR 원장에 계정과목 ID 직접 연결
  - `ap_ledger.accounting_account_id` → `accounting_accounts.id` FK 전환 (v2 의존 제거)
  - `ar_ledger.accounting_account_id` → `accounting_accounts.id` FK 전환
  - AP/AR 라우터에 tenant 격리(`getEffectiveTenantId`) 전면 적용
  - 라우터 input에 `accountingAccountId` 옵셔널 필드 추가 (create 시 계정 연결)
  - `partners.ts` 전체 리팩토링: 모든 조회/집계 함수에 tenantId 필터 추가
  - 조회 결과에 `accountingAccountId` 포함하여 프론트엔드에서 계정 정보 표시 가능
- [x] **P2-2**: `accounting_accounts_v2` → `accounting_accounts`로 통합
  - Drizzle 스키마에서 v2 테이블 `@deprecated` 처리 (하위 호환)
  - AP/AR/은행 거래의 FK 참조를 `accounting_accounts`로 전환
  - 마이그레이션 스크립트 추가 (`scripts/migrate-accounts-v2-to-v1.ts`)
  - ID 재매핑 로직: v2 ID → v1 ID 자동 변환
- [x] **P2-3**: `expense.ts` 자동분개를 `journalHelper.ts` 공통 함수로 전환
  - `postExpenseVoucher()` - 비용전표 확정 시 분개 생성 (차변/대변/VAT/결제수단)
  - `cancelExpenseJournal()` - 비용전표 취소 시 분개 삭제
  - `expense.ts`의 `post`/`cancel` 프로시저를 공통 헬퍼 호출로 단순화

#### 이전 완료 (주요 항목만)
- [x] SaaS UI 리디자인 (색상 토큰, 헤더, 사이드바)
- [x] Control Center 대시보드
- [x] 비용 전표 시스템 (CRUD + 자동분개 + 반복 + 미지급)
- [x] 매입/매출 관리 (CRUD + 필터링 + 엑셀)
- [x] 거래처 관리 (통합 partners 테이블)
- [x] 은행 거래 매칭 (업로드 + 자동매칭 엔진 + UI)
- [x] 일/월 마감 시스템
- [x] 재고-회계 통합 Phase 1 (매입 POST → 재고+회계 원장)
- [x] LOT 추적 + FEFO 할당
- [x] 카테고리 관리 시스템 (원재료/제품/매입/매출)
- [x] 멀티테넌트 기반 구조 (row-level, tenant_id)

### 📋 다음 단계 (Phase 3) ✅ 완료 (2026-03-04)

#### Phase 3 (P3) - 보고서 및 고급 기능
- [x] **P3-1**: 시산표 (Trial Balance) 생성
  - `server/db/financialReports.ts` → `generateTrialBalance()`
  - 데이터 소스: `expense_journal_lines` + `accounting_transactions` 통합 집계
  - 계정별 차변/대변 합계 + 잔액 계산 (자산/비용: 차변잔액, 부채/자본/수익: 대변잔액)
- [x] **P3-2**: 재무상태표 (Balance Sheet) 생성
  - `generateBalanceSheet()` - 자산 = 부채 + 자본 등식 검증
  - 당기순이익을 이익잉여금에 자동 포함
  - 대차 균형 자동 체크 (`balanceCheck`)
- [x] **P3-3**: 손익계산서 (Income Statement) 생성
  - `generateIncomeStatement()` - 수익 - 비용 = 당기순이익
  - 계정별 상세 + 요약 카드 표시
- [x] **P3-4**: `accounting_categories` 구식 참조 정리
  - `server/accounting.ts`에 `@deprecated` 마킹 + 마이그레이션 안내 추가
- [x] 재무보고서 프론트엔드 (`client/src/pages/accounting/FinancialReports.tsx`)
  - 3탭 구조: 시산표 / 재무상태표 / 손익계산서
  - 기간 설정 + 빠른 선택 (올해/이번달)
  - 시산표: 계정별 상세 테이블 + 합계
  - 재무상태표: 3분할 카드 (자산/부채/자본) + 등식 표시 + 균형 체크
  - 손익계산서: 수익/비용 상세 + 당기순이익 하이라이트
- [x] tRPC 라우터 (`server/routers/accounting/financialReports.router.ts`)
- [x] 사이드바 메뉴 + App.tsx 라우트 추가

#### Phase 4 (P4) - 고급 기능 ✅ 완료 (2026-03-05)
- [x] **P4-1**: 은행 매칭 엔진 완성
  - `matchingRules.router.ts` 전면 리팩토링: conditions/actions JSON 정규화
  - `findMatchingRule()` 강화: 거래유형(deposit/withdrawal) 필터 + 복합매칭(combined) 지원
  - `MatchResult` 상세 반환 (accountingAccountId + ruleId + ruleName + partnerId + memo)
  - 매칭 통계 엔드포인트 (`stats`) 추가
- [x] **P4-2**: `accounting_categories` 레거시 정리
  - `accounting_categories`, `accounting_transactions` 테이블 `@deprecated` 마킹 강화
  - `server/accounting.ts` 이미 deprecated 코멘트 적용 완료 (P3)
- [x] **P4-3**: 재무보고서 Excel 내보내기
  - `server/db/financialReportsExcel.ts` 신규 생성 (ExcelJS)
  - 시산표 / 재무상태표 / 손익계산서 각각 전용 Excel 포맷
  - 헤더 스타일, 합계 행, 색상 코딩, 금액 포맷
  - tRPC mutation 엔드포인트 (base64 버퍼 반환)
  - 프론트엔드 다운로드 버튼 추가
- [x] **P4-4**: 기초 잔액 설정 (전기이월)
  - `server/db/openingBalances.ts` 신규 생성
  - 기존 `expense_journal_entries/lines` 활용 (신규 테이블 불필요)
  - `[기초잔액]` 마커 기반 분개 엔트리 생성/수정/삭제
  - 대차 균형 검증 후 저장
  - 재무보고서 UI에 4번째 탭 "기초잔액" 추가
  - 회계연도 선택, 계정별 차변/대변 입력, 대차균형 실시간 표시

### 📋 다음 단계 (Phase 5) ✅ 진행 중 (2026-03-05)

#### Phase 5 (P5) - 버그 수정 + UI 강화
- [x] **P5-1**: 하위계정(sub-account) API 매핑 버그 **근본 수정**
  - **근본 원인**: `account_categories`(그룹)와 `accounting_accounts`(세부계정) 사이에 FK가 없음
    - 코드 접두사 매칭(`"5010".startsWith("520")` → false) 완전 실패
    - 그룹코드 체계(100,110,520)와 계정코드 체계(1010,5010)가 독립적
  - **해결**: `accounting_accounts` 테이블에 `account_category_id` FK 컬럼 추가
    - Drizzle 스키마: `drizzle/schema/accountingAccounts.ts` + 복제본 2곳 동기화
    - `accountingAccountsRouter`: create/update에 `accountCategoryId` 필드 추가
    - `assignToGroup` 뮤테이션 + `listByGroup` 쿼리 엔드포인트 추가
    - `AccountingAccounts.tsx`: `accountsByGroup`가 `acc.accountCategoryId`로 직접 매핑 (폴백: 카테고리 매칭)
    - `SideSheetAccountList`: FK 기반 직접 조회 (폴백: 미매핑 계정)
  - **마이그레이션**: `scripts/migrate-account-category-fk.ts`
    - `account_category_id` 컬럼 추가 (ALTER TABLE)
    - 기존 계정을 같은 카테고리 그룹에 자동 할당
    - 실행: `npx tsx scripts/migrate-account-category-fk.ts`
  - `accountCategoriesRouter` 전체에 `ctx.tenantId` 전달 (테넌트 격리 완성)
  - `generateNextGroupCode` 함수 수정: "ACC-001" → 숫자 코드 (100, 110...) 생성
- [x] **P5-2**: account_categories 코드 마이그레이션 스크립트
  - `scripts/migrate-account-categories-codes.ts` 생성
  - 비숫자 코드(ACC-xxx) → 대분류별 숫자 코드(100, 200...) 자동 변환
  - 코드 충돌 감지 + 안전 실행
- [x] **P5-3**: 대시보드 재무 요약 위젯
  - `financialReports.router.ts`에 `dashboardSummary` 엔드포인트 추가
  - `IntegratedDashboard.tsx`에 이번 달 매출/비용/순이익/이익률 카드 위젯 추가

### 📋 Phase 6 ✅ 진행 중 (2026-03-16)
#### Phase 6 (P6) - 최적화 및 확장
- [ ] 재무보고서 PDF 내보내기
- [ ] 은행 매칭 시 자동 분개 생성 (matched → journal entry)
- [x] TypeScript 에러 ~170개 → 0개 해결 완료 (환경 의존 2개 제외 - node_modules 설치 시 자동 해소)
- [ ] 매입/매출 다이얼로그에서 account_categories → accounting_accounts 전환
- [ ] `accounting_categories`, `accounting_transactions` 테이블 완전 제거

### 📋 Phase 7 - HACCP AI OS ✅ 진행 중 (2026-03-16)

#### Phase 7-1 (P7-1) - AI 규칙엔진 + 기준서→체크리스트 ✅ 완료
- [x] AI 엔진 DB 스키마 (`drizzle/schema/aiEngine.ts`) - 5 테이블
- [x] 규칙엔진 (`server/db/rulesEngine.ts`) - 22개 시스템 규칙
- [x] 기준서→체크리스트 자동생성 (`server/db/standardChecklist.ts`)
- [x] AI 대시보드 UI (`client/src/pages/AIDashboard.tsx`) - 5탭
- [x] AI 라우터 21+ 엔드포인트 (`server/routers-ai.ts`)
- [x] DB 마이그레이션 스크립트 (`scripts/migrate-ai-engine-tables.ts`)

#### Phase 7-2 (P7-2) - AI Context Layer + Action Engine ✅ 완료
- [x] AI Context Layer (`server/db/aiContextLayer.ts`) - 8개 데이터 요약 함수
- [x] AI Action Engine (`server/db/aiActionEngine.ts`) - 스마트 챗봇 파이프라인
- [x] 의도 분류 (11개 intent) + 날짜 파싱 + 컨텍스트 빌더
- [x] 챗봇 "하나" 업그레이드: 일반질문 → SYSTEM_PROMPT, 데이터질문 → Action Engine

#### Phase 7-3 (P7-3) - Knowledge Base (RAG) + 자동 스케줄러 ✅ 완료
- [x] 지식베이스 DB 스키마 (`ai_knowledge_documents`, `ai_knowledge_chunks`)
- [x] 문서 청크 분할 + OpenAI 임베딩 생성 (`server/db/knowledgeBase.ts`)
- [x] 코사인 유사도 벡터 검색 (MySQL JSON 기반)
- [x] RAG 통합: 챗봇이 질문 시 지식베이스 참고자료 자동 삽입
- [x] 키워드 기반 폴백 검색 (임베딩 실패 시)
- [x] AI 대시보드 "지식베이스" 탭 추가 (문서 등록/검색/관리)
- [x] AI 규칙엔진 자동 스케줄러 (매일 오전 7시, 오후 2시)
- [x] KB 마이그레이션 스크립트 (`scripts/migrate-ai-knowledge-tables.ts`)

#### Phase 7-4 (P7-4) - 통합 및 확장 ✅ 완료
- [x] 알림 시스템 통합 (ai_alerts → h_notifications 연동, critical/high 자동 전파)
- [x] 배치 상세 페이지 "AI 리스크 요약" 카드 (`BatchDetail.tsx`)
  - 배치별 리스크 점수, CCP 이탈, 체크리스트 누락, 알림 요약
  - 자동 60초 갱신, 알림이 없으면 카드 숨김
- [x] 테넌트별 커스텀 규칙 관리 UI (AI 대시보드 내)
  - 시스템 규칙 / 커스텀 규칙 탭 전환
  - 커스텀 규칙 CRUD (생성/수정/삭제/활성화토글)
  - 시스템 규칙은 활성화/비활성화만 허용
- [x] 배치 리스크 요약 API (`batchRiskSummary` 엔드포인트)
- [ ] 감사 자료 PDF 패키지 자동 생성 (향후)

---

## 코딩 컨벤션 및 규칙

### 데이터베이스 접근
```typescript
// ✅ 올바른 방식: system_code 기반 계정 조회
import { resolveSystemAccount, SYSTEM_ACCOUNTS } from "../db/journalHelper";
const cashAccount = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.CASH, "1010", "현금");

// ❌ 잘못된 방식: 하드코딩된 계정 코드
const [rows] = await conn.execute(`SELECT * FROM accounting_accounts WHERE code = '1010'`);
```

### tRPC 라우터 패턴
```typescript
// 모든 프로시저는 tenant 격리 필수
const tenantId = getEffectiveTenantId(ctx);
// 데이터 조회 시 tenant_id 필터 필수
WHERE tenant_id = ?
```

### 스키마 정의
- 메인 스키마: `drizzle/schema_main.ts`
- 개별 스키마: `drizzle/schema/<table>.ts`
- 확장 스키마: `drizzle/schema_*.ts`

### 프론트엔드 패턴
- 페이지 레이아웃: `DashboardLayout`으로 감싸기 필수
- 상태관리: tRPC React Query 훅 사용
- UI: shadcn/ui 컴포넌트 (`client/src/components/ui/`)
- 스타일: Tailwind CSS

---

## 알려진 문제 및 기술 부채

### 높은 우선순위
1. ~~**계정 테이블 3중 중복**~~ → ✅ P2-2에서 해결 (v2 deprecated + 마이그레이션 스크립트)
2. ~~**expense.ts 하드코딩**~~ → ✅ P1-1에서 해결 (resolveSystemAccount 전환 완료)
3. ~~**materialLedger 잘못된 테이블 참조**~~ → ✅ P0-2에서 해결 (복식부기 + system_code 전환)
4. ~~**매입/매출 자동분개 미구현**~~ → ✅ P1-2, P1-3에서 해결 (system_code 기반 분개)
5. ~~**하위계정 API 매핑 버그**~~ → ✅ P5-1에서 해결 (account_category_id FK 추가 + 마이그레이션 스크립트)

### 중간 우선순위
5. ~~**AP/AR 원장 미연결**~~ → ✅ P2-1에서 해결 (tenant 격리 + accountingAccountId 활용)
6. ~~**은행 매칭 엔진 미완성**~~ → ✅ P4-1에서 해결 (conditions/actions JSON + 자동매칭 + 통계)
7. ~~**TypeScript 에러 다수**~~ → ✅ 해결 완료 (170개 → 0개, 환경 의존 2개는 npm install 시 자동 해소)
8. ~~**`accounting_categories` 테이블 참조**~~ → ✅ P3-4 + P4-2에서 deprecated 마킹 완료 (P5에서 완전 제거 예정)

### 낮은 우선순위
8. Vite 빌드 경고 - 대용량 청크 (~600KB)
9. PDF 리포트 생성 미완성
10. 소비기한 알람 스케줄러 테스트 미완료

---

## 빠른 참조

### 서버 실행
```bash
cd /home/root/haccp_v3/webapp
npm run dev        # 개발 서버
npm run build      # 프로덕션 빌드
```

### 마이그레이션 실행
```bash
cd /home/root/haccp_v3/webapp
npx tsx scripts/migrate-system-code.ts
```

### 주요 파일 위치
| 기능 | 파일 |
|------|------|
| 계정과목 스키마 | `drizzle/schema/accountingAccounts.ts` |
| 시스템계정 상수 | `drizzle/schema/accountingAccounts.ts` → `SYSTEM_ACCOUNTS` |
| 분개 헬퍼 | `server/db/journalHelper.ts` |
| 비용 전표 라우터 | `server/routers/expense.ts` |
| 계정과목 라우터 | `server/routers/accountingAccounts.ts` |
| 계정과목 UI | `client/src/pages/AccountingAccounts.tsx` |
| 매입/매출 통합 | `server/routers/haccp/haccpIntegration.router.ts` |
| AP/AR 원장 | `server/routers/accounting/apLedger.router.ts`, `arLedger.router.ts` |
| 거래처/원장 DB | `server/partners.ts` |
| 재무보고서 DB | `server/db/financialReports.ts` |
| 재무보고서 UI | `client/src/pages/accounting/FinancialReports.tsx` |
| 재무보고서 Excel | `server/db/financialReportsExcel.ts` |
| 기초잔액 DB | `server/db/openingBalances.ts` |
| 은행 매칭 | `server/routers/accounting/matchingRules.router.ts` |
| 루트 라우터 | `server/routers/_root.ts` |
| 앱 라우팅 | `client/src/App.tsx` |
| 레이아웃/메뉴 | `client/src/pages/DashboardLayout.tsx` |
| AI 엔진 스키마 | `drizzle/schema/aiEngine.ts` |
| AI 규칙엔진 | `server/db/rulesEngine.ts` |
| AI Context Layer | `server/db/aiContextLayer.ts` |
| AI Action Engine | `server/db/aiActionEngine.ts` |
| AI 지식베이스 (RAG) | `server/db/knowledgeBase.ts` |
| AI 기준서→체크리스트 | `server/db/standardChecklist.ts` |
| AI 라우터 | `server/routers-ai.ts` |
| AI 대시보드 UI | `client/src/pages/AIDashboard.tsx` |
| AI 스케줄러 | `server/scheduler.ts` |

### Git 워크플로우
```bash
# 브랜치: genspark_ai_developer
git add .
git commit -m "feat(scope): 설명"
git fetch origin main
git rebase origin/main
# 충돌 시 remote 우선
git push -f origin genspark_ai_developer
# PR #8: https://github.com/ipmachum-debug/haccp_v3/pull/8
```
