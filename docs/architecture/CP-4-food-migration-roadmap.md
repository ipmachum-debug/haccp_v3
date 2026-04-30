# CP-4 — 식품 (food) industry 점진 이주 로드맵

> 작성: 2026-04-30 — Phase 2 cosmetic lifecycle 완성 직후, 식품 (haccp) 라우터 군을
> Layer 4 industry/food 로 점진 이주하는 Strangler Fig 계획.

---

## 배경

현재 식품 도메인 라우터는 `server/routers/haccp/` 평탄 구조에 위치 (haccpRouterMap).
화장품 (cosmetic) 은 처음부터 `server/routers/industry/cosmetic/` 에 정의되어
industryRouterMap 에 등록.

→ 같은 업종 라우터인데 위치가 다름 (구조 비대칭). CP-4 의 목표는 **food 도 industry/food 로 통합**.

---

## 이주 단계 (Strangler Fig)

### 1단계 — 골격 + dashboard/trends re-export ✅ (이번 PR)
- `server/routers/industry/food/dashboard.router.ts` (re-export of f3DashboardRouter)
- `server/routers/industry/food/trends.router.ts` (re-export of f3TrendsRouter)
- `industryRouterMap.food = { dashboard, trends }` 등록
- haccpMap 의 f3Dashboard / f3Trends 그대로 유지 (양쪽 노출)

영향: 클라이언트는 `trpc.industry.food.dashboard.*` 신규 사용 가능. 기존 호출도 동작.

### 2단계 — CCP 핵심 라우터 이주
대상: `ccpRouter`, `ccpFormRouter`, `ccpScheduleRouter`, `ccpTemplateRouter`, `ccpMonitoringRouter`

방식:
- `industry/food/ccp/` 서브디렉토리 생성
- 기존 `routers/haccp/ccp*.router.ts` 파일을 이동 (git mv)
- `routers/haccp/index.ts` 에서 re-export 만 유지 (호환)
- `industryRouterMap.food.ccp` 등 등록
- `haccpMap.ccp` 도 그대로 유지 (양쪽 노출)

### 3단계 — 검사 / LOT / 추적 라우터 이주
대상: `inspectionRouter`, `visualInspectionRouter`, `finishedProductInspectionRouter`,
       `lotManagementRouter`, `metalDetectionRouter`, `traceabilityRouter`

### 4단계 — 위해분석 / 검증 / 감사 라우터 이주
대상: `hazardAnalysisRouter`, `haccpPlanVerificationRouter`, `internalAuditRouter`,
       `supplierAuditRouter`

### 5단계 — 부적합 / 시정조치 / 회수 라우터 이주
대상: `nonconformingProductRouter`, `correctiveActionRouter`, `recallSimulationRouter`

### 6단계 — haccpIntegration 이주
대상: `haccpIntegrationRouter` (식품-회계 연동)

이주 시 주의: `accountingMap` 과의 의존 방향 검토 (industry → core-erp 는 룰 위반).
필요 시 hooks pattern (이벤트 발행) 으로 분리.

### 7단계 — haccpMap 정리 + 클라이언트 호출 일괄 전환 (마지막)
- 클라이언트 모든 `trpc.ccp.*` / `trpc.f3Dashboard.*` 등을 `trpc.industry.food.*` 로 grep + 일괄 치환
- haccpMap 에서 food 관련 키 모두 제거 → haccpMap 자체 폐기
- `_root.ts` 에서 `haccpRouterMap` import 제거

---

## 안전 원칙

1. **각 단계 PR 단위로 분할** (한 번에 1~3개 라우터만 이동)
2. **양쪽 노출 기간 충분히 확보** (각 단계 후 클라이언트 전환 1주~1달 관찰)
3. **운영 영향 0** — re-export 만 추가하는 단계는 코드 경로 변경 없음
4. **dependency-cruiser 통과 확인** 매 단계
5. **rebase 후 마커 검증 필수** (`grep -rn '<<<<<<<\|>>>>>>>'`)

---

## 라우터 인벤토리 (CP-4 이주 대상 — haccpMap 21개)

| # | 라우터 | 1차 이주 단계 | 비고 |
|---|--------|---------------|------|
| 1 | ccp | 2단계 | 핵심 |
| 2 | ccpForm | 2단계 | |
| 3 | ccpSchedule | 2단계 | |
| 4 | ccpTemplate | 2단계 | |
| 5 | ccpMonitoring | 2단계 | |
| 6 | inspection | 3단계 | |
| 7 | visualInspection | 3단계 | |
| 8 | finishedProductInspection | 3단계 | |
| 9 | lotManagement | 3단계 | |
| 10 | metalDetection | 3단계 | |
| 11 | traceability | 3단계 | |
| 12 | hazardAnalysis | 4단계 | |
| 13 | haccpPlanVerification | 4단계 | |
| 14 | internalAudit | 4단계 | |
| 15 | supplierAudit | 4단계 | |
| 16 | nonconformingProduct | 5단계 | |
| 17 | correctiveAction | 5단계 | |
| 18 | recallSimulation | 5단계 | |
| 19 | haccpIntegration | 6단계 | 회계 의존 — 별도 검토 |
| 20 | f3Dashboard | **1단계 ✅** | re-export 완료 |
| 21 | f3Trends | **1단계 ✅** | re-export 완료 |

---

## 클라이언트 영향 (단계별)

### 1단계 (이번 PR) — 클라이언트 변경 0
- `trpc.f3Dashboard.summary` 호출 그대로 동작
- 신규 호출 (`trpc.industry.food.dashboard.summary`) 도 사용 가능

### 2단계~ — 점진 호출 변경
- 각 단계 후 `client/src/` 에서 grep 으로 호출처 파악 → 점진 변경
- 예: 2단계 후 `trpc.ccp.*` → `trpc.industry.food.ccp.*` (페이지 단위)

### 7단계 (마지막) — 일괄 정리
- 모든 호출이 `industry.food.*` 로 이동 완료 확인 후
- 레거시 호출 제거 + haccpMap 제거

---

## ADR 준수 확인

- [ ] **ADR-001 shared-kernel**: food 가 cosmetic 과 공통 패턴 발견 시 shared-kernel 로 승격
- [ ] **ADR-002 no-core-to-industry**: core (erp/mes) 가 industry/food 를 import 하지 않음 확인
- [ ] **industry-cannot-use-other-industry**: industry/food 가 industry/cosmetic import 금지

---

## 후속 사고 대응

이주 중 운영 영향 발견 시 즉시 롤백:
1. `industryRouterMap.food.*` 키 주석 → 클라이언트는 레거시 경로로 자동 폴백
2. PR revert + Genspark 핫픽스
3. 문제 분석 → 다음 단계로 재시도

---

## 진행 추적

```
✅ 1단계: dashboard/trends re-export (PR #164)
⏳ 2단계: CCP 핵심 5개
⏳ 3단계: 검사/LOT/추적 6개
⏳ 4단계: 위해분석/검증/감사 4개
⏳ 5단계: 부적합/시정/회수 3개
⏳ 6단계: haccpIntegration (회계)
⏳ 7단계: haccpMap 정리 + 클라이언트 일괄 전환
```
