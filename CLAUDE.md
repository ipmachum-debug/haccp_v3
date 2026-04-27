# CLAUDE.md - Millio AI 프로젝트 AI 개발 가이드

> 최종 업데이트: 2026-04-22 (삼각 분업 정책 + 재발방지 정책 추가)
> 현재 완성도: **78/100** — 실서비스 운영 가능 / 엔터프라이즈 전 단계

---

## 🚨 최우선 — 삼각 분업 체제 (2026-04-22 확정)

**2026-04-22 서버 디스크에 141커밋이 GitHub 에 push 없이 2~3개월 쌓여있던 사고**
(`server_local_backup_20260422` 브랜치로 백업·복구 완료) 재발 방지를 위한 체제:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Claude (개발)  │ ──→ │ Genspark (배포)  │ ──→ │ 사용자 (검증)   │
│ 코드 작성       │     │ pull + build     │     │ 웹 UI 테스트    │
│ PR 생성         │     │ deploy + 로그    │     │ 최종 승인       │
│ → GitHub 올림   │     │ 데이터/DB 작업   │     │ → 브라우저만    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Genspark (서버) — 행동별 허용/금지

✅ **허용 (Genspark 의 진짜 가치)**:
- 데이터 / DB 작업 (SELECT / INSERT / UPDATE / DELETE)
- 데이터 시드, 잘못된 배치/데이터 수정, 정합성 점검
- PM2 restart / 로그 분석 / 서비스 상태 점검
- npm install / build / deploy / rsync dist
- `git fetch / pull / log / status` (읽기 전용)

⚠️ **DB 작업 시 주의 (2026-04-22 추가)**:
- **상태 필드 (`status`, `approval_status` 등) 변경은 가능하면 앱 로직 경유**
  - 이유: 상태 변경 시 파생 작업(분개 생성/재고 차감/LOT 관리)이 앱에 구현됨
  - DB 만 바꾸면 "유령 상태" 발생 (UI 는 완료, 장부는 0)
  - 예시 사고: 2026-04-22 7183/7184 매출이 과거 Genspark 가 `status='approved'` 로 직접 INSERT 해서 분개·재고 없는 유령 상태로 존재
  - **안전**: `status='pending'` 으로 INSERT → UI 에서 승인 버튼 → 정식 로직 경유
  - enum 외 값 (`'completed'` 등) 은 MySQL 모드에 따라 예측 불가

❌ **절대 금지 (딱 3개)**:
1. `git commit` — 코드 수정을 서버에서 커밋 (2026-04-22 사고 원인)
2. `git push / push -f` — 서버에서 origin 으로 직접 push
3. 소스 파일 직접 편집 (vi, nano 등 `.ts`/`.tsx` 수정)

### 긴급 hotfix 예외

운영 불능 상태 (사이트 다운·500 폭주)이고 즉시 고쳐야 할 때:
1. 서버에서 최소 수정 후 PM2 재시작 복구
2. `.githooks/pre-commit` 이 `hotfix` 입력 요구 (무의식 커밋 차단)
3. **1시간 이내 동일 변경을 GitHub PR 로 올릴 의무**
4. `/var/log/haccp-hotfix/hotfix.log` 기록

### 기술적 방어 4층

```
[1층] GitHub main branch protection       — force push 차단
[2층] .githooks/pre-commit               — 서버 커밋 시 경고 + 의도 확인
[3층] CLAUDE.md 정책 문서화              — 규칙 명시 (이 섹션)
[4층] scripts/check-server-divergence.sh — 일일 자동 감시 (cron)
```

### 신규 기능 체크리스트

- [ ] 코드 변경인가? → **반드시 Claude 세션 → PR → 머지 → 서버 pull**
- [ ] 데이터/운영 작업인가? → Genspark 서버 직접 실행 OK
- [ ] 긴급 hotfix 인가? → 1시간 이내 PR 올릴 것

### 실측 운영 사이클 (PR / 배포 / 기획 / 사고대응)

📘 **[`docs/workflow/pr-deployment-cycle.md`](./docs/workflow/pr-deployment-cycle.md)** — 새 세션 시작 시 페이스 회복용 운영 매뉴얼
- PR 라이프사이클 / 머지 권한 분담 / PR 본문 표준 구조
- 다중 PR 분할 패턴 / 기획 옵션 제시 패턴
- 운영 안전 룰 (코드 / DB / 인프라) / 의존 PR 처리
- 검증 결과 보고 형식 / 사고 대응 패턴

---

## 🚨 아키텍처 규칙

**새 기능 / 리팩토링 / 신규 파일 작성 전 반드시 확인**:

📘 **`docs/architecture/`** — CANONICAL 아키텍처 문서 (2026-04-21 확정)
- `00-layers.md` — 5계층 + shared-kernel 구조
- `01-dependency-rules.md` — 레이어 간 의존 금지/허용 규칙 (CI 강제)
- `02-naming-conventions.md` — 테이블/라우터/파일 네이밍
- `03-event-catalog.md` — 도메인 이벤트 목록
- `04-policy-registry.md` — Feature/Capability/Package/Posting/Approval 정책
- `ADR-001-shared-kernel.md`, `ADR-002-no-core-to-industry.md` — 결정 기록

### 5계층 요약

```
addon  (ai / hr-advanced / bi / iot / mobile / external-integration)
  ↑
industry  (food / cosmetic / health / electronics / apparel / general-manufacturing)
  ↑
core-mes  (bom / routing / workorder / production / quality / lot / equipment)
  ↑
core-erp  (purchase / sales / inventory / accounting / costing / partner / warehouse)
  ↑
shared-kernel  (item / uom / lot-id / partner-ref / warehouse-ref / currency)
  ↑
platform  (tenant / auth / permission / billing / audit / feature-flag / notification / workflow / event-bus)
```

### 절대 금지 (AI 가 파일 생성 시 반드시 준수)

1. ❌ `core-erp` 또는 `core-mes` 에서 `industry/*` import (ADR-002)
2. ❌ core 테이블에 업종 전용 컬럼 추가 (예: `mes_production_results` 에 `food_ccp_value` 금지)
3. ❌ 코드 안에 `if (industry === 'food')` 분기 (정책 데이터로 관리)
4. ❌ `platform` 에 업무 로직 (purchase/inventory/production 금지)
5. ❌ `shared-kernel` 에 서비스/라우터 (타입/상수/스키마만)
6. ❌ `delete` 액션 네이밍 (취소는 `cancel`, 역분개는 `unpost`)
7. ❌ `admin-hardcoded` if 문 권한 (capability 기반)
8. ❌ 대규모 Big Bang Rewrite — Strangler Fig 점진 이주

### 신규 파일 생성 시 체크리스트

- [ ] 어느 레이어에 속하는가? (00-layers.md)
- [ ] 의존 방향이 허용되는가? (01-dependency-rules.md)
- [ ] 네이밍 규칙을 따르는가? (02-naming-conventions.md)
- [ ] 이벤트 발행이 필요한가? (03-event-catalog.md)
- [ ] 권한 체크가 capability 기반인가? (04-policy-registry.md)
- [ ] 테넌트 격리 (`tenantRequiredProcedure`) 적용됐는가?

### 의존성 규칙 CI 실행

```bash
npx depcruise --config .dependency-cruiser.cjs server
```

---

## 프로젝트 개요

**Millio AI** — AI 기반 제조 ERP · "만드는 사람을 위한 ERP".
- **서비스명**: Millio AI (Manufacturing ERP powered by AI)
- **슬로건**: "AI 기반 제조 ERP" / "만드는 사람을 위한 ERP"
- **포지셔닝**: 제조업 공통 AI ERP (생산·재고·품질·LOT·회계) + 식품 HACCP 특화 모듈. Phase 2·3·4로 화장품 GMP / 건기식 / 일반 제조 / 해외 확장.
- **회사**: 주식회사 골든터틀컴퍼니 (www.goldenturtle.co.kr)
- **도메인**: millioai.com (메인), millioai.co.kr, millio.co.kr, haccpone.com/co.kr (backward-compat — 같은 ERP)
- **스택**: React (Vite) + tRPC + MySQL (Drizzle ORM) + TypeScript
- **멀티테넌트**: Row-level isolation (tenant_id 기반)
- **인증**: 로컬 JWT (회원가입 → 관리자 승인 → 로그인)
- **배포**: 외부 서버 49.50.130.101 (PM2 프로세스명은 레거시 이유로 `haccpone` 유지)

### 운영 유지 참조 (건드리지 말 것)
- PM2 프로세스명: `haccpone` (`ecosystem.config.cjs`)
- DB 이름 폴백: `haccpone` (`scripts/check-product-name-consistency.ts`)
- /root/haccpone-v2/.env 폴백 경로 (`server/_core/env.ts`, `index.ts`)
- v2 마이그레이션 스크립트 (scripts/*_v2_*)

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

### 📋 Phase 6 ✅ 완료 (2026-03-17)
#### Phase 6 (P6) - 최적화 및 확장
- [x] 재무보고서 PDF 내보내기
  - `server/db/financialReportsPdf.ts` 신규 (jsPDF + jspdf-autotable)
  - 시산표 / 재무상태표 / 손익계산서 PDF 포맷
  - tRPC mutation 엔드포인트 3개 + 프론트엔드 PDF 버튼 추가
- [x] 은행 매칭 시 자동 분개 생성 (matched → journal entry)
  - `journalHelper.ts`에 `postBankTransactionJournal()` / `cancelBankTransactionJournal()` 추가
  - `bankTransaction.service.ts` match/unmatch에 자동분개 연동
  - `bankAutoMatch.service.ts` runAutoMatch에도 자동분개 연동
  - 입금: 차변 보통예금 / 대변 매칭계정, 출금: 차변 매칭계정 / 대변 보통예금
- [x] TypeScript 에러 ~170개 → 0개 해결 완료 (환경 의존 2개 제외 - node_modules 설치 시 자동 해소)
- [x] 매입/매출 다이얼로그에서 account_categories → accounting_accounts 전환
  - `EditPurchaseDialog.tsx`, `EditSaleDialog.tsx`에서 `accountingAccounts.list` 사용
- [x] `accounting_transactions` 테이블 참조 제거
  - `materialLedger.ts`: `accounting_transactions` → `expense_journal_entries/lines` 전환
  - `financialReports.ts`: `accounting_transactions` 집계 제거 (journal_lines만 사용)
  - `purchasePost.ts`, `purchaseCancel.ts` 등 모든 post/cancel 파일 전환
  - `pipelineDashboard.ts`: 참조 제거

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

### 📋 Phase 8 — ERP 고도화 + AI 연동 ✅ 완료 (2026-04-18)

#### Phase 8-1: ERP 핵심 기능 (8개 신규)
- [x] 전표 관리 — 수기 분개 입력 + 전체 조회 (`journalEntry.router.ts`, `JournalEntries.tsx`)
- [x] 부가세 관리 — 매입/매출 세액 집계 + 신고서 미리보기 (`vatManagement.router.ts`)
- [x] 자금현황 대시보드 — 은행잔액/AP/AR/현금흐름 + 자금일보 (`cashFlow.router.ts`)
- [x] 고정자산 관리 — 취득/감가상각(정액법/정률법)/처분 (`fixedAsset.router.ts`)
- [x] 예산 관리 — 계정별 월간 예산 + 실적 비교 (`budget.router.ts`)
- [x] 거래처 신용관리 — 한도/연체/등급(A~D) + 연령분석 (`partnerCredit.router.ts`)
- [x] 급여관리 — 4대보험 자동계산 + 급여명세서 출력 + 회계전표 자동 (`payroll.router.ts`)
- [x] 인사관리 — 근태/휴가/연차 + 비회원직원등록 + 구성원매칭 (`hrManagement.router.ts`)

#### Phase 8-2: AI 연동 (9건)
- [x] **Financial AI**: 은행 자동분류 / 전표 추천 / 자금 브리핑 / 대표 리포트
  - `aiClassify.service.ts`, `aiJournalRecommend.service.ts`, `aiCashBriefing.service.ts`, `aiExecutiveReport.service.ts`
- [x] **Operational AI**: 발주 추천 / 재고 예측 / 원가 이상탐지
  - `aiErpAdvanced.service.ts` → `aiErp.router.ts`
- [x] **OCR AI**: 사업자등록증 / 견적서 / 영수증 OCR 확장 (`scanOcr.ts`)
- [x] **Conversational AI**: 챗봇 "하나" ERP 인텐트 3개 추가 (purchase_recommend/shortage_predict/cost_anomaly)

#### Phase 8-3: 모듈 분리
- [x] Phase 1: 환경변수 기반 ERP/HACCP 탭 ON/OFF (`featureFlags.ts` → `MODULES`)
- [x] Phase 2: 구독 DB 기반 동적 모듈 제어 (패키지별 매핑: starter→HACCP, standard→ERP, enterprise→통합)

#### Phase 8-4: ERP 보강
- [x] 급여명세서 출력 (개인별 + 전체 일괄)
- [x] 자금일보 (일별 입출금 + 지급/수금 예정)
- [x] 미수금/미지급금 연령분석 (30/60/90/90+ 구간)
- [x] 급여 → 회계 전표 자동생성 (차변: 급여 / 대변: 예수금+보통예금)
- [x] 매입 반품/차감 처리 (재고 역차감 + 역분개) (`purchaseReturn.router.ts`)
- [x] 반복 거래 (매입/매출 복사 + 템플릿) (`recurringTransaction.router.ts`)
- [x] 변경이력 로그 (`changeLog.router.ts`, `ChangeLogViewer.tsx`)
- [x] 발주서 삭제 양방향 역수행 (재고/회계 전체 복원)

#### Phase 8-5: 견적서 고도화
- [x] 견적서 복사 / 인쇄(규격 문서) / 거래처별 견적 이력
- [x] 신규 거래처 임시 입력 (미등록 업체 견적 → 거래 시 정식 등록)

#### Phase 8-6: UX 개선
- [x] AccountCombobox — 계정과목 검색/자동완성 (전표/비용/예산에 적용)
- [x] 대시보드 AI 위젯 (재고부족/발주추천/원가이상)
- [x] 탭 새로고침 유지 (useTabWithUrl 적용 — HR/VAT/CashFlow/Closing)
- [x] 사이드바 스크롤 유지 (sessionStorage)
- [x] 직원 대시보드 모바일 반응형 (grid-cols-2)
- [x] 출퇴근 위젯 사이드바 (작업자 이상)
- [x] 근무시간 점심 1시간 자동 제외 (540분+ 근무 시)
- [x] 24시 자동 마감 스케줄러 (매일 00:05)

#### Phase 8-7: 보안/안정성
- [x] 테넌트 격리 JOIN 보강 (3건)
- [x] h_employees ↔ users 양방향 연동 (resolveEmployeeId)
- [x] KST 시간 이중적용 수정 (toLocaleString Asia/Seoul)
- [x] 35개 프로시저 try/catch 일괄 추가
- [x] 휴가 중복 신청 방지
- [x] 성능 인덱스 10개 (accounting_purchases/sales/journal/bank/attendance/leave)

### 📋 주요 파일 위치 (Phase 8 추가분)

| 기능 | 파일 |
|------|------|
| 전표 관리 | `server/routers/accounting/journalEntry.router.ts` |
| 부가세 관리 | `server/routers/accounting/vatManagement.router.ts` |
| 자금현황 | `server/routers/accounting/cashFlow.router.ts` |
| 고정자산 | `server/routers/accounting/fixedAsset.router.ts` |
| 예산 관리 | `server/routers/accounting/budget.router.ts` |
| 신용관리 | `server/routers/accounting/partnerCredit.router.ts` |
| 급여관리 | `server/routers/accounting/payroll.router.ts` |
| 인사관리 | `server/routers/accounting/hrManagement.router.ts` |
| 매입 반품 | `server/routers/accounting/purchaseReturn.router.ts` |
| 반복 거래 | `server/routers/accounting/recurringTransaction.router.ts` |
| 변경이력 | `server/routers/accounting/changeLog.router.ts` |
| AI ERP | `server/routers/accounting/aiErp.router.ts` |
| AI 은행분류 | `server/services/bank/aiClassify.service.ts` |
| AI 전표추천 | `server/services/ai/aiJournalRecommend.service.ts` |
| AI 자금브리핑 | `server/services/ai/aiCashBriefing.service.ts` |
| AI 대표리포트 | `server/services/ai/aiExecutiveReport.service.ts` |
| AI ERP고급 | `server/services/ai/aiErpAdvanced.service.ts` |
| 계정 콤보박스 | `client/src/components/accounting/AccountCombobox.tsx` |
| 모듈 플래그 | `client/src/lib/featureFlags.ts` → `MODULES` |

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

---

## 전수조사 결과 (2026-03-28)

### 테넌트 격리 현황
- **전체 상태**: ✅ 안전 (99%+ 테이블 tenant_id 포함)
- **미들웨어**: `tenantRequiredProcedure` 전면 적용, super admin actingTenantId 감사 로깅
- **수정 완료**: `getCcpInstancesByBatchId()` / `getCcpInstanceById()` tenant_id 필터 추가
- **수정 완료**: `getPartnerById()` DB 레벨 tenant 필터 적용
- **수정 완료**: `deleteBatch()` tenantId 필수화 (없으면 throw)
- **주의 테이블**: `h_batch_pdf_logs` (tenant_id 미보유, batchId 간접 격리)
- **유니크 제약 개선 필요**: batch_code, biz_no, material_code → `(tenant_id, code)` 복합 유니크 권장

### 보안 개선 현황
- [x] CORS 허용 도메인 제한 (`process.env.CORS_ORIGINS` 기반)
- [x] 세션 시크릿 폴백 경고 로그 추가
- [ ] 비밀번호 정책 강화 (min 6 → min 8 + 복잡도)
- [ ] Rate Limiting 미적용
- [ ] 환경변수 유효성 검증 스키마 미구현

### 에러 처리 현황
- 에러 throw 2,173건 / catch 683건 / 조용한 catch ~40곳
- DB 연결 에러 메시지 4종 혼재 → 통일 필요
- 한국어/영어 혼재 (~60/40%) → 한국어 통일 권장
- 구조적 로깅 시스템 도입 (server/utils/logger.ts)

### 코드 품질 개선 현황
- **초대형 파일 분할 완료**: `AIDashboard.tsx` → 17개 서브컴포넌트, `dashboardAndAnalytics.ts` → 3개 모듈
- **any 타입 제거 진행중**: materialLedger.ts, productAndCcp.ts, verification.ts, partners.ts 완료
- **deprecated 테이블**: `accounting_categories`, `accounting_accounts_v2`, `accounting_transactions`
- **중복 스키마/디렉토리 제거 완료**: `drizzle/drizzle/`, `server/server/`, `server_new_files/`
- **테스트 추가**: dbHelpers, logger, useTabWithUrl, auth, journalHelper, tenantIsolation, paginatedSort
- **N+1 쿼리**: `dashboardAndAnalytics.ts` 재고부족 대시보드

### 보안 / 품질 누적 현황 (2026-04-19)

#### 보안 — 완료
- [x] CORS 허용 도메인 제한 (`process.env.CORS_ORIGINS`)
- [x] 세션/JWT 시크릿 — **production 에서 env 미설정 시 부팅 실패** (2026-04-19)
- [x] 하드코딩 DB 자격정보 전면 제거 — `ecosystem.config.js` 삭제, `excelImport`/scripts 25+ env 전환 (2026-04-19)
- [x] `excelImport` 공통 Pool 재사용 전환 — 자체 createConnection 제거 (2026-04-19)
- [x] `startupMigrations` production 기본 비활성 — `RUN_STARTUP_MIGRATIONS=true` 필요 (2026-04-19)
- [x] 비밀번호 정책 강화 (min 8자 이상)
- [x] Rate Limiting (IP당 분당 200회, 429 응답)
- [x] 환경변수 유효성 검증 (`validateEnvVars()` 서버 시작 전)
- [x] 테넌트 격리 JOIN 방어 — `partners` LEFT JOIN 18곳 `eq(partners.tenantId, parent.tenantId)` 추가 (2026-04-19)
- [x] `tenantsPublic` public 노출 축소 — id/name 만 반환, 카운트/상태 → 슈퍼관리자 전용 (2026-04-19)
- [x] `banner` 라우터 권한 검증 — 일반 admin 의 input.tenantId 조작 / 타 테넌트 배너 수정 차단 (2026-04-19)

#### 보안 — 사후 작업 필요 (코드 외)
- [ ] **운영 DB root 비밀번호 즉시 교체** (기존 자격정보 유출 가정)
- [ ] **SSH_PASS 교체**
- [ ] git 히스토리에 남은 자격정보 정리 (git-filter-repo / BFG)

#### 에러 처리
- [x] DB 연결 에러 메시지 한국어 통일 ("DB 연결 실패")
- [x] 구조적 로깅 시스템 (`server/utils/logger.ts`: logInfo/logWarn/logError/logSecurity)
- [x] 조용한 catch 블록 주요 13건 정리 (aiCashBriefing, aiExecutiveReport, partnerCredit 등)
- [ ] 에러 코드 표준화 (TRPCError 코드 통일)

#### 코드 품질
- [x] 레거시 파일 제거: `server_new_files/` (8,663줄) / `drizzle/drizzle/` / `server/server/`
- [x] 디버그 console.log 제거 72건
- [x] N+1 쿼리 수정: `getLowStockMaterials`, `costAnalysisInventory.getBatchCostAnalysisInventory` (inArray 단일 쿼리)
- [x] DB 헬퍼 유틸: `server/utils/dbHelpers.ts` (getRows/getFirstRow/getInsertId)
- [x] **any 타입 Day 1~5 정리: 3,389 → 2,208 (−1,181, 34.9%)** (2026-04-19)
  - `client/src/lib/trpc.ts` `as any` 제거 → `createTRPCReact<AppRouter>()`
  - `client/src/lib/trpcTypes.ts` 신규: `RouterInput` / `RouterOutput` 헬퍼
  - 13개 top 파일 심층 타입화 (HR, Expense, Accounting, Dashboard, Production, Purchase, Sales 등)
  - 완전 제거 0건 파일: AccountingAccounts / CCPLimits(pages) / HRManagement / PipelineDashboard
- **deprecated 테이블**: `accounting_categories`, `accounting_transactions` (@deprecated 유지)
- **테스트 커버리지**: 3% → 13 + 26 케이스 = 39 (logger, tenant격리, banner isolation, tenantsPublic, partner JOIN)

#### 아키텍처 부채 (우선순위 높음 — 아직 미해결)
- [ ] **AppRouter 초거대 구조** (`_root.ts` 413줄, 서브라우터 318 import) — tRPC v11 proxy 타입 심층 전파 한계의 근본 원인. 도메인별 bounded context 로 분리 필요.
- [ ] **초대형 TSX 파일** (50~90KB) — BatchDetail (1300줄), HRManagement (850줄) 등 page/container/table/form/dialog 단위 분해 필요
- [ ] **런타임 startup migration** — production 기본 비활성화 했으나 장기적으로 Drizzle migration 으로 완전 이관 필요
- [ ] **구조적 any** — 남은 2,208건 중 상당수는 AppRouter 분해 없이는 불가능

### 개선 로드맵 (2026-04-19 기준)
```
✅ Week 1-2: 보안 기본 (CORS, 시크릿, 테넌트격리, N+1, env검증, Rate Limiting)
✅ Week 3-4: 성능 & 보안 심화 (비밀번호, Partner tenant, deleteBatch, 하드코딩 제거)
✅ Week 5-6: 코드 품질 (파일삭제 20,000줄, DB에러 통일, console.log, 로깅)
⏳ Week 7-9: 타입 안전성 Day 1~5 완료 (3,389 → 2,208). 남은 작업: 중형 파일 + 구조적 any
⏳ Week 10-12: 테스트 강화 (회계/재고/LOT/승인 도메인 회귀 테스트)
⏳ Week 13-16: 아키텍처 분해 (AppRouter 도메인 분리 + 초대형 TSX 파일 분해)
```

### 외부 감사 완성도 평가 (2026-04-19)

| 영역 | 점수 |
|------|------|
| 기능 완성도 | 88 |
| 운영 가능성 | 82 |
| 문서/재현성 | 76 |
| 보안/테넌트 격리 | 74 (Week 1-4 작업 후 80+ 예상) |
| 코드 품질 | 72 (any 정리 진행 중) |
| 아키텍처 건강도 | 68 (AppRouter/초대형 파일 해결 전까지 제한) |
| **전체 평균** | **78** |

**다음 2~3주 목표**: 80점 돌파
- 아키텍처 68 → 73: 초대형 파일 Top 3 분해 or 라우터 분리 시작
- 코드 품질 72 → 76: any 1,500 아래로
- 보안 74 → 78: 운영 DB 자격정보 교체 + git history 정리
