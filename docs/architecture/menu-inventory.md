# 메뉴 인벤토리 + Scope 분류 매트릭스

> 작성: 2026-04-30 — ADR-003 (Industry-First Menu) 의 Phase Y-4 마이그레이션 자료.
> 모든 메뉴 항목 (현재 60+) 의 신규 `scope` 필드 분류.

---

## 분류 기준 (ADR-003)

| Scope | kind | 설명 | 노출 탭 |
|-------|------|------|---------|
| 플랫폼 | `platform` | 슈퍼관리자 / 시스템 / 테넌트 관리 | 슈퍼관리자만 |
| 공통 | `common` | 모든 industry 공통 (재고/알림/마스터/문서) | 공통 탭 |
| 회계 | `accounting` | 회계·세무·매입·매출·인사 | 회계 탭 |
| 식품 | `industry: "food"` | HACCP / CCP / 위해분석 | 식품 탭 |
| 화장품 | `industry: "cosmetic"` | GMP / BMR / Formula / Stability | 화장품 탭 |

---

## A. 슈퍼관리자 / 플랫폼 (`platform`)

| # | 메뉴 | path | scope |
|---|------|------|-------|
| 1 | 슈퍼관리자 대시보드 | /dashboard/super-admin | platform |
| 2 | 사용자 승인 | /dashboard/users/approval | platform |
| 3 | 테넌트 관리 | /dashboard/tenants | platform |
| 4 | 서버 모니터링 | /dashboard/server-monitor | platform |
| 5 | 시스템 관리 | /admin/settings | platform |

---

## B. 공통 (`common`) — 모든 industry 노출

### B-1. 대시보드 / 진입점

| # | 메뉴 | path | scope | 비고 |
|---|------|------|-------|------|
| 6 | 통합 대시보드 | /dashboard | common | |
| 7 | Today | /dashboard/today | common | |

### B-2. 재고 / 마스터 (cross-industry common)

| # | 메뉴 | path | scope | 비고 |
|---|------|------|-------|------|
| 8 | 재고 관리 | /inventory-management | common | 모든 industry 공통 |
| 9 | 마스터 데이터 | /dashboard/master-data | common | industry 별 sub-tab 으로 분리 (Y-5) |
| 10 | 품목 마스터 | /dashboard/item-master | common | |
| 11 | 거래처 | /dashboard/accounting/partners | common | 식품/화장품 공통 |

### B-3. 알림 / 문서 / 승인 (cross-industry common)

| # | 메뉴 | path | scope | 비고 |
|---|------|------|-------|------|
| 12 | 알림 관리 | /dashboard/notifications | common | |
| 13 | 승인 관리 | /dashboard/approval | common | |
| 14 | 문서 출력 | /dashboard/document-output | common | industry view filter (Y-5) |
| 15 | 데이터 임포트 | /dashboard/data-import | common | |

### B-4. 사내공지 / 시스템

| # | 메뉴 | path | scope | 비고 |
|---|------|------|-------|------|
| 16 | 사내공지관리 | /dashboard/accounting/notice-board | common | accounting 경로지만 cross-industry |

### B-5. Cross-cutting 도메인 (Y-2 에서 core-mes 추출 후 common 승격)

| # | 메뉴 | path | scope (현재) | scope (Y-2 후) | 비고 |
|---|------|------|--------------|----------------|------|
| 17 | 부적합제품관리 | /dashboard/nonconforming-management | industry: "food" (현재 식품 잔재) | common | core-mes/quality 추출 |
| 18 | 시정조치 관리 (CAPA) | /corrective-actions | industry: "food" | common | core-mes/quality 추출 |
| 19 | 감사관리 | /dashboard/audit-management | industry: "food" | common | core-mes/audit 추출 |
| 20 | 감사 리포트 | /dashboard/audit-report | industry: "food" | common | core-mes/audit 추출 |
| 21 | 변경관리 (신규 — Y-7) | /dashboard/change-control | (없음) | common | core-mes/lifecycle 신설 |
| 22 | 교육관리 (신규 — Y-7) | /dashboard/training | (없음) | common | core-mes/training 신설 |

---

## C. 회계 (`accounting`)

| # | 메뉴 | path | group | scope |
|---|------|------|-------|-------|
| 23 | 회계 대시보드 | /dashboard/accounting | 개요 | accounting |
| 24 | 발주·구매 | /dashboard/accounting/purchase-orders | 매입·구매 | accounting |
| 25 | 매입 등록 | /dashboard/accounting/purchases/create | 매입·구매 | accounting |
| 26 | 매입 조회 | /dashboard/accounting/purchases/list | 매입·구매 | accounting |
| 27 | 견적서 | /dashboard/accounting/quotations | 매출·판매 | accounting |
| 28 | 매출 등록 | /dashboard/accounting/sales/create | 매출·판매 | accounting |
| 29 | 매출 조회 | /dashboard/accounting/sales/list | 매출·판매 | accounting |
| 30 | 세금계산서 | /dashboard/accounting/tax-invoices | 매출·판매 | accounting |
| 31 | B2C 플랫폼 정산 | /dashboard/accounting/b2c-platform | 매출·판매 | accounting |
| 32 | 비용관리 | /dashboard/accounting/expense | 자금·비용 | accounting |
| 33 | 은행 관리 | /dashboard/accounting/bank-management | 자금·비용 | accounting |
| 34 | 전표 관리 | /dashboard/accounting/journal-entries | 회계·세무 | accounting |
| 35 | 부가세 | /dashboard/accounting/vat-management | 회계·세무 | accounting |
| 36 | 재무보고서 | /dashboard/accounting/financial-reports | 회계·세무 | accounting |
| 37 | 자금현황 | /dashboard/accounting/cash-flow | 회계·세무 | accounting |
| 38 | 예산 관리 | /dashboard/accounting/budget | 회계·세무 | accounting |
| 39 | 급여관리 | /dashboard/accounting/payroll | 인사·급여 | accounting |
| 40 | 인사관리 | /dashboard/accounting/hr | 인사·급여 | accounting |
| 41 | 커뮤니케이션 로그 | /dashboard/accounting/communication-log | 기준정보 | accounting |
| 42 | 신용관리 | /dashboard/accounting/partners/credit | 기준정보 | accounting |
| 43 | 단가표 | /dashboard/accounting/partners/prices | 기준정보 | accounting |
| 44 | 계정 과목 | /dashboard/accounting/accounts | 기준정보 | accounting |
| 45 | 고정자산 | /dashboard/accounting/fixed-assets | 기준정보 | accounting |
| 46 | 반복 거래 | /dashboard/accounting/recurring | 마감 | accounting |
| 47 | 마감 관리 | /dashboard/accounting/closing-management | 마감 | accounting |
| 48 | 변경이력 | /dashboard/accounting/change-log | 마감 | accounting |
| 49 | 문서함 | /accounting/documents | 마감 | accounting |

---

## D. 식품 HACCP (`industry: "food"`)

### D-1. 생산

| # | 메뉴 | path | scope | 비고 |
|---|------|------|-------|------|
| 50 | 생산관리 | /dashboard/production-management | industry: "food" | 현재 분류 누락 — Y-4 에서 추가 |
| 51 | 생산운영 | /dashboard/production-operations | industry: "food" | 동일 |
| 52 | 제조기준관리 | /dashboard/manufacturing-standards | industry: "food" | 동일 |

### D-2. HACCP 핵심

| # | 메뉴 | path | scope (현재) | scope (Y-4 후) |
|---|------|------|--------------|----------------|
| 53 | CCP 관리 | /quality/ccp-monitoring | requireModule: "haccp" | industry: "food" |
| 54 | 검사 관리 | /dashboard/inspections | (없음) | industry: "food" |
| 55 | HACCP 체크리스트 | /quality/checklists | requireModule: "haccp" | industry: "food" |
| 56 | 모바일 빠른 점검 | /mobile-quick-check | (없음) | industry: "food" |

### D-3. F-3 IoT 폐쇄 루프

| # | 메뉴 | path | scope (현재) | scope (Y-4 후) |
|---|------|------|--------------|----------------|
| 57 | F-3 운영 현황 | /dashboard/haccp/f3-dashboard | requireModule: "haccp" | industry: "food" |
| 58 | Deviation 트렌드 | /dashboard/haccp/f3-trends | requireModule: "haccp" | industry: "food" |
| 59 | HACCP 검증 | /dashboard/haccp-verification | requireModule: "haccp" | industry: "food" |
| 60 | 스캔 체크리스트 입력 | /dashboard/scan-checklist | (없음) | industry: "food" |

---

## E. 화장품 GMP (`industry: "cosmetic"`)

### E-1. Phase 2 lifecycle (현재 6개)

| # | 메뉴 | path | scope | Phase |
|---|------|------|-------|-------|
| 61 | GMP 운영 현황 | /dashboard/cosmetic/dashboard | industry: "cosmetic" | 2-10 |
| 62 | BMR (제조기록) | /dashboard/cosmetic/bmr | industry: "cosmetic" | 2-1 |
| 63 | 배합표 (Formula) | /dashboard/cosmetic/formula | industry: "cosmetic" | 2-4a |
| 64 | 라벨 / 전성분 | /dashboard/cosmetic/label | industry: "cosmetic" | 2-5 |
| 65 | QA 출고 (Release) | /dashboard/cosmetic/release | industry: "cosmetic" | 2-6 |
| 66 | 안정성시험 | /dashboard/cosmetic/stability | industry: "cosmetic" | 2-8 |

### E-2. 누락된 화장품 GMP 메뉴 (Y-4 / Y-7 에서 추가)

| # | 메뉴 | path | scope | 비고 |
|---|------|------|-------|------|
| 67 | KFDA 신고서 | /dashboard/cosmetic/kfda-report | industry: "cosmetic" | Phase 2-9 라우터 #158 — 메뉴 누락 (Y-4) |
| 68 | 화장품 부적합 (대안) | /dashboard/cosmetic/nonconforming | industry: "cosmetic" | core-mes/quality view filter 후 자동 생성 |
| 69 | 화장품 CAPA (대안) | /dashboard/cosmetic/capa | industry: "cosmetic" | core-mes/quality view filter |

---

## F. 신규 industry (Phase 3 — 본 ADR 적용 후 자동 분류)

### F-1. 의약품 KGMP (`industry: "pharmaceutical"`) — Phase 3-A 진입 시

```
- KGMP 운영 현황
- MFR (Master Formula Record)
- BMR
- IPC
- API 관리 (Active Pharmaceutical Ingredient)
- 배합 (Master Formula)
- 라벨 (약사법 §65)
- QA Release (QP 서명)
- 안정성시험 (ICH Q1A)
- KGMP / MFDS 신고서 (CTD)
- PMS (시판 후 안전관리, KAERS)  ← 신규 entity
```

### F-2. 건강기능식품 (`industry: "health-functional"`) — Phase 3-B

```
- GMP 운영 현황
- BMR
- IPC
- 배합
- 영양성분 표시 / 기능성 정보
- QA 출고
- 안정성시험
- KFDA 신고서 (건기식 양식)
- 광고 심의 자료
```

### F-3. 의료기기 (`industry: "medical-device"`) — Phase 3-C

```
- ISO 13485 운영 현황
- DHR (Device History Record)
- DMR (Device Master Record)
- IPC
- 부품 (BoM)
- UDI 관리
- QA Release
- Shelf-life 검증
- MFDS GMP 심사 자료
```

### F-4. 일반제조 (`industry: "general-manufacturing"`) — Phase 3-D

```
- ISO 9001 운영 현황
- 작업 지시서 (Work Order)
- BoM
- IPC (옵션)
- QA 검사
- 출하
```

---

## G. 카테고리 / 마스터 데이터 분리 (Y-5)

스크린샷 기준 현재 "마스터 데이터 → 카테고리" 탭 구성:

```
[원료] [화장품] [매입] [매출]    ← 현재 (모두 한 화면)
```

ADR-003 적용 후:

```
공통 탭 → 마스터 데이터:
  [원료]                          ← industry 별 view filter
  [품목 (제품)]                    ← industry 별 view filter

회계 탭 → 카테고리:
  [매입 카테고리]                   ← accounting scope
  [매출 카테고리]                   ← accounting scope

industry 탭 → industry-specific:
  food: [HACCP CCP 매핑]
  cosmetic: [화장품-CCP 매핑]
  pharmaceutical: [API 분류]
  ...
```

---

## H. 마이그레이션 체크리스트 (Y-3 / Y-4 PR 시 검증)

- [ ] `MenuItem` 타입에 `scope: MenuScope` 필수 필드 추가 (TS 컴파일 강제)
- [ ] 모든 60+ 메뉴 `scope` 분류 완료 (본 문서 매트릭스 기준)
- [ ] `requireModule` 폴백 제거 (점진 — 1주 호환 기간 후)
- [ ] 사이드바 탭 `INDUSTRY_LABELS` / `INDUSTRY_ICONS` 매핑
- [ ] 테넌트 `activeIndustries` config 스키마 추가
- [ ] 식품 단일 사용자 회귀 테스트 (URL 변경 0 검증)
- [ ] 화장품 단일 사용자 회귀 테스트 (식품 메뉴 노출 0)
- [ ] 멀티 industry 테넌트 시나리오 테스트
- [ ] Phase 3-A 가상 enable 검증 (의약품 탭 자동 생성, 식품 메뉴 노출 0)

---

## I. 통계

| 분류 | 메뉴 수 |
|------|--------|
| platform | 5 |
| common | 12 (현재 6 + Y-2 추출 6) |
| accounting | 27 |
| food | 11 |
| cosmetic | 6 (현재) → 9 (KFDA + 부적합 + CAPA Y-7 후) |
| pharmaceutical (Phase 3-A) | 11 (예상) |
| health-functional (Phase 3-B) | 9 (예상) |

→ **총 80~90개 메뉴**, 모두 `scope` 분류 강제.
