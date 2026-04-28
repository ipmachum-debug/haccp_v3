# 업종 모듈화 결합도 진단 보고서

> 작성: 2026-04-28
> 작성자: Claude (이번 세션 근본 작업 시리즈의 일환)
> 관련 문서: [`docs/architecture/00-layers.md`](./00-layers.md), [`ADR-002-no-core-to-industry.md`](./ADR-002-no-core-to-industry.md)
> 트리거: CLAUDE.md "현재 상태 (2026-04-21 기준)" 표의 ⚠️ 위험 — "HACCP 가 `h_batches` 로 코어와 결합"

---

## 🎯 결론 먼저

**현재 결합도는 예상보다 낮음**. 디렉토리 이주 + `_maps/` 라우터 등록 정리 정도로 5계층 구조에 맞출 수 있음. **Big Bang 불필요, Strangler Fig 점진 이주 권장.**

| 영역 | 결합도 | 비고 |
| --- | --- | --- |
| 코어 테이블 (`h_batches`) | 🟢 깨끗 | food 전용 컬럼 없음 |
| 의존 방향 (`core → industry`) | 🟢 0건 | accounting / inventory / production / master 라우터 → haccp import 없음 |
| 메타데이터 인프라 | 🟢 존재 | `server/lib/industry/industryConfig.ts` (8개 업종 + 11개 모듈 + 30+ 기능 정의) |
| 라우터 등록 분리 | 🟡 부분 | `_root.ts` 의 `haccpRouterMap` 분리 완료 (2026-04-19) |
| **디렉토리 구조** | ❌ **미적용** | `routers/haccp/`, `db/haccp/`, `pages/haccp/` 가 평탄 위치, `industry/food/` 폴더 없음 |
| 의존성 CI 강제 | ❌ 미적용 | `.dependency-cruiser.cjs` 의 industry 룰 미정의 |

---

## 📦 파일 인벤토리 (분리 후보)

### Server-side

| 위치 | 항목 | 개수 |
| --- | --- | --- |
| `server/routers/haccp/` | 20개 라우터 (ccp, ccpForm, hazardAnalysis, recall, traceability, ...) | 20 |
| `server/routers/ccpMonitoring/` | 10개 라우터 (ccpLimits, ccpRecords, hazardAnalysis, metalDetection, ...) | 10 |
| `server/db/haccp/` | 24개 DB 함수 (ccpFormRecords, hazardAnalysis, recall, supplierAudit, ...) | 24 |
| `server/lib/industry/` | `industryConfig.ts` (이미 존재) | 1 |
| `server/_maps/haccpMap.ts` | 라우터 등록 맵 (2026-04-19 분리) | 1 |
| `server/scheduler.ts` | CCP 점검 알림 cron 2개 (이미 schedulerLock 적용 — PR #112) | (포함됨) |

### Client-side

| 위치 | 항목 | 개수 |
| --- | --- | --- |
| `client/src/pages/haccp/` | 30개 페이지 | 30 |
| `client/src/pages/checklist/` | (일부) HACCP 관련 체크리스트 | 일부 |
| `client/src/components/` | HACCP 다이얼로그/카드 (분산) | 미정 |

### Drizzle 스키마

| 파일 | 테이블 |
| --- | --- |
| `drizzle/schema/ccpMonitoring.ts` | CCP 모니터링 |
| `drizzle/schema/haccp7principles.ts` | HACCP 7원칙 |
| `drizzle/schema/hygiene.ts` | 위생 |
| `drizzle/schema/inspection.ts` | 검사 |
| `drizzle/schema/part2_hygiene.ts` | 위생 part 2 |
| `drizzle/schema/schema_main_ccp.ts` | CCP 메인 |
| `drizzle/schema/schema_main_haccpChecklist.ts` | HACCP 체크리스트 |

총 **7개 스키마 파일**, 모두 food 업종 전용. core 테이블 (`h_batches`, `h_inventory*`, `h_materials`) 은 별도 위치 — 결합 없음.

---

## 🔍 의존 방향 검증

### ✅ Core → Industry: 0건 (정상)

```bash
grep -rn 'from.*"@/pages/haccp\|from.*"\.\./haccp' \
  server/routers/accounting \
  server/routers/inventory \
  server/routers/production \
  server/routers/master
# → 0 matches
```

ADR-002 이미 준수.

### ✅ Industry → Core: 정상 방향 (3개 파일에서 참조)

`server/routers/haccp/*.ts` 파일들이 `h_batches`, `h_inventory`, `h_materials` 참조 — **레이어 규칙 정상** (industry 가 core 를 소비).

### ⚠️ h_batches 의 분류 — 코어 vs 업종?

| 컬럼 | 분류 | 이유 |
| --- | --- | --- |
| `id`, `tenant_id`, `site_id`, `batch_code`, `product_id`, `recipe_id` | **core-mes** | 모든 제조 업종 공통 |
| `planned_quantity`, `actual_quantity`, `actual_yield`, `loss_quantity` | **core-mes** | 생산 공통 |
| `material_cost`, `labor_cost`, `overhead_cost`, `total_cost`, `unit_cost` | **core-mes/costing** | 원가 공통 |
| `planned_date`, `start_time`, `end_time`, `status` | **core-mes** | 워크플로 공통 |

→ `h_batches` 는 100% core-mes. food/cosmetic/health 모두 동일 구조 사용 가능. **분리 불필요**.

CCP 측정값 / 위생 점검 등은 별도 테이블 (`h_ccp_*`, `h_hygiene_*`) 에 격리되어 있음 — 정상.

---

## 🧱 점진 이주 마일스톤 (Strangler Fig)

### Phase A — 디렉토리 재배치 (서버, 코드 이동만)

| 단계 | 변경 | PR 규모 |
| --- | --- | --- |
| A-1 | `server/routers/haccp/` → `server/routers/industry/food/haccp/` | 1 PR (20 파일 + import path 변경) |
| A-2 | `server/routers/ccpMonitoring/` → `server/routers/industry/food/ccp/` | 1 PR (10 파일) |
| A-3 | `server/db/haccp/` → `server/db/industry/food/` | 1 PR (24 파일) |
| A-4 | `server/_maps/haccpMap.ts` → `server/_maps/industry/food.ts` 또는 단일 `industryMap.ts` | 1 PR |

### Phase B — Drizzle 스키마 그룹화

| 단계 | 변경 | PR 규모 |
| --- | --- | --- |
| B-1 | `drizzle/schema/ccp*.ts` + `haccp*.ts` + `hygiene*.ts` + `inspection*.ts` → `drizzle/schema/industry/food/` | 1 PR (7 파일) |
| B-2 | `drizzle/schema/index.ts` 의 export 정리 | 1 PR |

### Phase C — Client 재배치

| 단계 | 변경 | PR 규모 |
| --- | --- | --- |
| C-1 | `client/src/pages/haccp/` → `client/src/pages/industry/food/haccp/` | 1 PR (30 파일 + ROUTES 추가) |
| C-2 | HACCP 관련 components 재배치 | 1 PR |

### Phase D — 의존성 CI 강제

| 단계 | 변경 | PR 규모 |
| --- | --- | --- |
| D-1 | `.dependency-cruiser.cjs` 의 industry 룰 추가 (core → industry 금지 / industry 간 cross-ref 금지) | 1 PR |
| D-2 | CI 에서 `npx depcruise` 실행 → drift 발견 시 build fail | 1 PR |

### Phase E — 신규 업종 추가 PoC

| 단계 | 변경 | 비고 |
| --- | --- | --- |
| E-1 | `server/routers/industry/cosmetic/` (빈 골격) | Phase 2 (화장품 GMP) 시작점 |
| E-2 | 첫 번째 cosmetic 모듈 (예: BMR) 시범 구현 | Strangler Fig 검증 |

---

## 🛡 안전 / 위험 평가

### ✅ 안전 요인

- **현재 결합 사고 없음** — core → industry 의존 0건 이미 확인
- **메타데이터 분리됨** — industryConfig.ts 가 단일 source
- **라우터 등록 격리됨** — haccpMap.ts 로 이미 분리
- **Strangler Fig 가능** — 한 번에 한 디렉토리씩 이주, 각 PR 독립 머지

### ⚠️ 주의 요인

- **import path 변경량 큼** — A 단계 PR 들이 수십 파일 영향. `tsc --noEmit` + 자동 배포 검증 필수
- **Drizzle 스키마 export drift** — index.ts 일관성 깨지면 빌드 실패. B-2 단계 신중
- **기존 PR (#110, #111, #112) 머지 후 진행** — 충돌 회피
- **시간 소요** — A~D 단계 합쳐 최소 6~8 PR, 검증 시간 포함 1~2주

### ❌ 비추천

- **Big Bang Rewrite** — 한 PR 으로 전체 이주 → 충돌 / 회귀 위험 ↑↑
- **새 업종 (cosmetic) 즉시 시작** — 인프라 (A~D) 정착 전엔 기존 사고 패턴 재발

---

## 🎯 다음 세션 시작 가이드

### Option 1 — 빠른 검증 (작은 PR 시작)

**A-1**: `server/routers/haccp/` → `server/routers/industry/food/haccp/` 디렉토리 이동.
- 20 파일 git mv + import path 변경
- `_maps/haccpMap.ts` 의 import 경로 갱신
- tsc + 자동 배포 검증
- PR 규모: 작지 않지만 단순 (텍스트 치환)

### Option 2 — 인프라 우선 (Phase D 먼저)

**D-1**: `.dependency-cruiser.cjs` 에 industry 룰 추가.
- 현재는 결합 없지만 CI 강제 없음 → 향후 잠재 추가 위험
- 룰 추가 후 기존 코드 위반 0 검증 (현재 상태면 통과)
- 이주 작업 (A~C) 진행 시 위반 즉시 차단

### Option 3 — 소규모 PoC (다음 업종 검증)

**E-1 부분**: `server/routers/industry/cosmetic/` 빈 골격 + 한 모듈 (예: BMR 라우터) 1개만 추가.
- 5계층 구조 실증
- A~D 작업 전에도 진행 가능 (기존 haccp 는 그대로)
- 단점: 두 구조 (`routers/haccp/` + `routers/industry/cosmetic/`) 공존

### 추천: **Option 2 (Phase D-1)** 부터

이유:
- 가장 작은 PR (.dependency-cruiser.cjs 수정 + CI 통합)
- 현재 결합 0 상태에서 룰 추가 → 즉시 통과 → 향후 회귀 영구 차단
- 이주 작업 (A~C) 시 위반 자동 검출 → 안전 보강

---

## 🏛 특허 발명 청사진 매핑 (2026-04-28 추가)

본 진단은 **5계층 디렉토리 분리** 라는 좁은 시야로 시작했으나, 사용자 공유 특허 명세서 ([0011]~[0024]) 의 9개 해결수단이 진짜 모듈화의 청사진. 본 섹션은 그 매핑.

### 9 해결수단의 현재 구현 상태

| # | 해결수단 | 현재 상태 | 핵심 위치 |
| --- | --- | --- | --- |
| 1 | **업종별 규정 자동 구성 엔진 (110)** | 🟡 부분 — 메타데이터만 | `server/lib/industry/industryConfig.ts` (정적 매핑). 동적 메뉴 / 체크리스트 / 스키마 / 워크플로 / AI 프롬프트 자동 생성기 미구현 |
| 2 | **단일 트랜잭션 엔진 (120)** | 🟡 부분 — 분리 호출 중 | `server/lib/accounting/{purchasePost, productSalePost}.ts` 이 LOT/재고/분개를 호출하지만 단일 트랜잭션 보장 미흡 (autoMaterialIssue.ts 의 known technical debt) |
| 3 | **IoT 폐쇄 루프 (130)** | 🟡 부분 | CCP 한계 이탈 감지 + 알림 ✅ / 자동 LOT HOLD + 손실 분개 + 시정조치 워크플로 ❌ |
| 4 | **OCR 파이프라인 (140)** | 🟢 거의 완성 | `server/lib/scanOcr.ts` + `scanDocMapper.ts`. 15종 분류 / 유형별 프롬프트 / 거래 이벤트 변환 — 모두 존재 |
| 5 | **룰+AI 혼합 분개 + RAG (150)** | 🟢 거의 완성 | `aiClassify.service.ts` / `aiJournalRecommend.service.ts` / `knowledgeBase.ts` (RAG) — Phase 8-2 완성 |
| 6 | **거래 취소 역트랜잭션** | 🟢 적용됨 | `purchaseCancel.ts` / `productSaleCancel.ts` — 역분개 + 재고 역차감 |
| 7 | **Financial AI (170)** | 🟢 완성 | `aiCashBriefing` + `aiExecutiveReport` + 5종 이상 탐지 — Phase 8-2 완성 |
| 8 | **Operational AI (180)** | 🟢 완성 | `aiErpAdvanced` 발주 추천 / 재고 예측 / 원가 이상 — Phase 8-2 완성 |
| 9 | **법정 교육 다일자 순환 (190)** | 🟢 완성 | `hrManagement.router.ts` + 자동 배정 + 일지 생성 — Phase 8-1 완성 |
| 멀티테넌트 (160) | Row-level + 패키지별 모듈 | 🟢 완성 | `tenantRequiredProcedure` + 구독 시스템 (Phase 8-3) |

### 진단 결과

**4개 (4, 5, 7, 8, 9, 멀티테넌트) 는 거의/완성 상태**. 본 진단의 5계층 분리 작업은 이들이 식품 외 업종에도 자연스럽게 확장되도록 골격을 정착시키는 의미.

**미완성 핵심 3개**:

1. **해결수단 1 동적 자동 구성** — `industryConfig.ts` 가 정적 매핑이라 신규 업종 추가 시 코드 수정 필요. 진짜 발명은 "업종 코드 입력 → 메뉴/체크리스트/스키마/워크플로/프롬프트 자동 생성".
2. **해결수단 2 단일 트랜잭션** — `autoMaterialIssue.ts` 의 each-material try/catch 가 부분 차감 가능. PR #103 trace + PR #111 lot_id NULL 로 무결성 강화 중이지만, 진정한 단일 트랜잭션 (LOT + 재고 + 분개 원자성) 미적용.
3. **해결수단 3 IoT 폐쇄 루프** — 감지/알림은 있지만 자동 격리 + 손실 분개 + 시정조치 트리거 자동 연쇄 미완성.

### 모듈화 마일스톤 재정렬 (특허 청사진 기반)

기존 Phase A~E 를 발명 청사진에 정렬:

| 단계 | 작업 | 기여 해결수단 |
| --- | --- | --- |
| **D-1** | dependency-cruiser industry 룰 + CI | 1 (자동 구성 엔진의 무결성 토대) |
| **A-1~A-4** | server/routers + db 디렉토리 이주 | 1, 11 (멀티테넌트 모듈 활성화 기반) |
| **B-1~B-2** | drizzle/schema/industry/food/ 그룹화 | 1 (업종별 스키마 분리) |
| **C-1~C-2** | client/pages/industry/food/ 이주 | 1 (메뉴 자동 구성 기반) |
| **🆕 F-1** | **`industryRegistry.ts` 동적 등록 엔진** — config 파일에서 업종 메뉴/체크리스트/AI 프롬프트 자동 로드 | **1 (해결수단 1 의 핵심)** |
| **🆕 F-2** | **단일 트랜잭션 엔진** `withTransaction(orderId, async (txn) => { LOT + 재고 + 분개 })` 정착 | **2 (해결수단 2)** |
| **🆕 F-3** | **IoT 폐쇄 루프 워크플로** — CCP 이탈 → LOT HOLD → 손실 분개 → 시정조치 자동 트리거 | **3 (해결수단 3)** |
| E-1 | cosmetic 골격 PoC | 1 (확장성 실증 — 화장품 GMP) |

### 우선순위 권장 (특허 청사진 반영)

**현재 가치 vs 비용 매트릭스**:

| 작업 | 가치 | 비용 | 추천 |
| --- | --- | --- | --- |
| **D-1** dependency-cruiser 룰 | 중 (회귀 영구 차단) | 작음 | ✅ **시작점** |
| A-1~C-2 디렉토리 이주 | 중 (Phase 2 화장품 확장 기반) | 큼 (수십 PR) | 🟡 점진 |
| **F-1** 동적 자동 구성 엔진 | **매우 큼 (특허 핵심)** | 매우 큼 (큰 설계) | 🔵 별도 로드맵 |
| **F-2** 단일 트랜잭션 엔진 | **매우 큼** (lot_id=0 문제의 진짜 근본) | 큼 (autoMaterialIssue 재설계) | 🔵 별도 로드맵 |
| **F-3** IoT 폐쇄 루프 | 큼 (HACCP AI OS 차별화) | 큼 (워크플로 엔진 필요) | 🔵 Phase 7 후속 |
| E-1 cosmetic 골격 PoC | 큼 (시장 확장) | 작음 (단일 라우터) | ✅ 동시 진행 가능 |

### 다음 세션 추천 순서 (수정)

1. **D-1** dependency-cruiser 룰 (작음, 즉시) — 회귀 차단
2. **E-1** cosmetic 골격 (작음, 즉시) — 5계층 구조 실증 + Phase 2 시장 시작점
3. **A-1** haccp 라우터 디렉토리 이주 (중, 검증 시간) — Phase 2 본격 시작 전 정리
4. **F-2** 단일 트랜잭션 엔진 (큼, 별도 로드맵) — 해결수단 2 정착
5. **F-1** 동적 자동 구성 엔진 (매우 큼, 별도 로드맵) — 특허 핵심 가치

**F-1, F-2, F-3 는 본 진단 범위 밖** (각각 별도 PR 시리즈 + 큰 설계). 본 보고서는 5계층 분리까지만 다룸.

---

## 📚 참고

- [`docs/architecture/00-layers.md`](./00-layers.md) — 5계층 정의
- [`docs/architecture/01-dependency-rules.md`](./01-dependency-rules.md) — 의존 방향 규칙
- [`docs/architecture/ADR-002-no-core-to-industry.md`](./ADR-002-no-core-to-industry.md) — core → industry 금지 결정
- [`server/lib/industry/industryConfig.ts`](../../server/lib/industry/industryConfig.ts) — 메타데이터 단일 source
- 본 진단의 트리거: CLAUDE.md "현재 상태 (2026-04-21 기준)" 의 ⚠️ "5. 업종 특화 분리 — 위험"
- **특허 발명 청사진**: 9개 해결수단 ([0011]~[0024], 2026-04-28 사용자 공유)

---

## 🔄 다음 세션 진행 결정 항목

이 보고서 머지 후 다음 PR:

- [ ] **A** Phase D-1 시작 (의존성 CI 강제, 가장 작은 PR)
- [ ] **B** Phase E-1 시작 (cosmetic 골격, PoC) — 특허 청사진의 확장성 실증
- [ ] **C** Phase A-1 시작 (haccp 라우터 디렉토리 이주, 영향 큼)
- [ ] **D** F-2 단일 트랜잭션 엔진 설계 시작 (특허 해결수단 2, 별도 로드맵)
- [ ] **E** F-1 동적 자동 구성 엔진 설계 시작 (특허 해결수단 1, 매우 큼)

사용자 결정 후 진행.
