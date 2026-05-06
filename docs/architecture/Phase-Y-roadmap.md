# Phase Y — Industry-First 아키텍처 마이그레이션 로드맵

> 작성: 2026-04-30 — ADR-003 (Industry-First Menu) 구현 단계.
> Strangler Fig 패턴, 7단계 분할.
> 운영 영향: 각 단계 0 (URL 호환 유지, 점진 전환).

---

## 배경 / 목표

현재 메뉴는 industry 컨텍스트 모름 → 식품 잔재 메뉴가 화장품 탭에 노출 + Phase 3 (의약품/건기식/의료기기) 진입 시 컴플라이언스 리스크.

**목표** (ADR-003):
- 모든 메뉴에 `scope` 필드 강제 (TS 컴파일 보증)
- 사이드바 탭 활성 industry 기반 자동 생성
- Cross-cutting 도메인 (부적합/CAPA/감사) core-mes 추출 + view filter
- Phase 3 진입 시 신규 industry 추가 비용 최소화

---

## 단계 개요

| Phase | 영역 | PR 수 | 위험도 | 의존 |
|-------|------|------|--------|------|
| **Y-1** | ADR-003 + 인벤토리 + 로드맵 (문서) | **1** ✅ 본 PR | 0 | — |
| Y-2 | Cross-cutting 도메인 core-mes 추출 (부적합/CAPA/감사/변경) | 4 | 중 | Y-1 |
| Y-3 | 메뉴 데이터 모델 재구성 (`scope` discriminated union) | 1 | 낮음 | Y-1 |
| Y-4 | 식품 잔재 메뉴 industry 분류 + 누락 메뉴 추가 | 2 | 낮음 | Y-3 |
| Y-5 | 마스터 데이터 / 카테고리 industry 분리 | 2 | 중 | Y-4 |
| Y-6 | 사이드바 industry 탭 자동 생성 | 1 | 낮음 | Y-3, Y-4 |
| Y-7 | 화장품 GMP 부족 도메인 신설 (Change Control / 교육) | 3~4 | 중 | Y-2 |

총 **15~17 PR**. CP-4 / Phase 3 진입과 동시 진행 가능.

---

## Phase Y-1 ✅ — ADR + 인벤토리 + 로드맵 (본 PR)

### 산출물

- `docs/architecture/ADR-003-industry-first-menu.md` — 결정 + 거부 대안 + 구현 가이드
- `docs/architecture/menu-inventory.md` — 메뉴 60+ 항목 scope 분류 매트릭스
- `docs/architecture/Phase-Y-roadmap.md` — 본 문서

### 의사결정 확정

1. ✅ Industry-First 메뉴 모델 (discriminated union scope)
2. ✅ 사이드바 탭 활성 industry 자동 생성
3. ✅ Cross-cutting 도메인 = core-mes 통합 + view filter (대안 B)
4. ✅ URL path 호환 (식품 사용자 변경 0)

---

## Phase Y-2 — Cross-cutting 도메인 core-mes 추출

### 대상 4개 도메인

각 도메인을 `server/core-mes/quality/` 또는 `server/core-mes/audit/` 로 추출 + `industry` 컬럼 추가 + view filter.

| 도메인 | 현재 위치 | Y-2 대상 위치 | PR |
|--------|----------|---------------|-----|
| 부적합 (Nonconforming) | `routers/haccp/nonconformingProduct.router.ts` | `core-mes/quality/nonconforming.router.ts` | Y-2-1 |
| CAPA (시정조치) | `routers/haccp/correctiveAction.router.ts` | `core-mes/quality/capa.router.ts` | Y-2-2 |
| 감사 (Audit) | `routers/haccp/internalAudit.router.ts` + `supplierAudit.router.ts` | `core-mes/audit/*.ts` | Y-2-3 |
| 변경관리 (Change Control) | (현재 부재) | `core-mes/lifecycle/changeControl.router.ts` | Y-2-4 (신규) |

### 마이그레이션 패턴 (Y-2-1 부적합 예시)

#### 1. DB 스키마 변경
```ts
// drizzle/schema/coreMes/nonconforming.ts (신규)
export const nonconformings = mysqlTable("nonconformings", {
  id: bigint().primaryKey().autoincrement(),
  tenant_id: int().notNull(),
  industry: mysqlEnum(["food", "cosmetic", "pharmaceutical", ...]).notNull(),  // ★ 신규
  title: varchar(255).notNull(),
  // ...
  industry_metadata: json(),  // industry-specific 확장
});
```

#### 2. 마이그레이션 스크립트
```bash
scripts/migrate-nonconforming-extract.ts
  - 기존 h_nonconforming_products → nonconformings 복사 + industry='food' 자동 채움
  - 신규 테이블에 cosmetic/pharma 등 추가 가능
  - h_nonconforming_products 는 read-only view 로 변경 (호환 기간)
```

#### 3. 라우터 + DB 어댑터
```ts
// server/core-mes/quality/nonconforming.router.ts
listForIndustry: tenantRequiredProcedure
  .input(z.object({ industry: industrySchema }))
  .query(async ({ ctx, input }) => {
    return await db.select().from(nonconformings)
      .where(and(
        eq(tenant_id, ctx.tenantId),
        eq(industry, input.industry),
      ));
  });
```

#### 4. Industry 별 사용 패턴
```ts
// 화장품 페이지
trpc.coreMes.nonconforming.listForIndustry({ industry: "cosmetic" });

// 식품 페이지
trpc.coreMes.nonconforming.listForIndustry({ industry: "food" });
```

### Y-2 검증 체크리스트

- [ ] 기존 식품 부적합 데이터 자동 마이그레이션 (industry='food')
- [ ] 식품 사용자 URL/UI 변경 0
- [ ] cross-industry 보고 대시보드 (전체 부적합 통계 + industry 분리)
- [ ] core-mes/quality 가 industry/* import 안 함 (ADR-002 준수)

---

## Phase Y-3 — 메뉴 데이터 모델 재구성

### 변경 파일

- `client/src/components/dashboard/DashboardLayout.tsx` — `MenuItem` 타입 + 60개 menu 분류
- `client/src/lib/menuTypes.ts` (신규) — `MenuScope` discriminated union + `IndustryKey` enum + 헬퍼

### 핵심 코드

```ts
// client/src/lib/menuTypes.ts
export type IndustryKey =
  | "food" | "cosmetic"
  | "pharmaceutical" | "health-functional"
  | "medical-device" | "general-manufacturing";

export type MenuScope =
  | { kind: "platform" }
  | { kind: "common" }
  | { kind: "accounting" }
  | { kind: "industry"; industry: IndustryKey };

export type MenuItem = {
  icon: LucideIcon;
  label: string;
  path: string;
  roles: Role[];
  scope: MenuScope;  // ★ 필수
  group?: string;    // 회계 sub-group 유지
  category?: string; // 슈퍼관리자 work 유지 (호환)
};

export const INDUSTRY_LABELS: Record<IndustryKey, string> = {
  food: "식품 HACCP",
  cosmetic: "화장품 GMP",
  pharmaceutical: "의약품 KGMP",
  "health-functional": "건강기능식품",
  "medical-device": "의료기기 GMP",
  "general-manufacturing": "일반제조",
};
```

### 회귀 위험 차단

- 모든 60+ 메뉴 `scope` 추가 누락 시 **TypeScript 컴파일 실패** → 빌드 차단
- 신규 메뉴 추가 시 자동 강제

### Y-3 검증

- [ ] `npx tsc --noEmit` 통과
- [ ] `requireModule` 폴백 코드 유지 (Y-4 까지 호환)
- [ ] 사이드바 렌더링 동일 (스크린샷 비교)

---

## Phase Y-4 — 식품 잔재 메뉴 industry 분류 + 누락 메뉴

### Y-4-1: 식품 잔재 메뉴 분류 (8개)

`menu-inventory.md` 의 D 섹션 기준:

```ts
// 변경 전
{ icon: Package, label: "생산관리", path: "/dashboard/production-management", roles: [...] }

// 변경 후
{ icon: Package, label: "생산관리", path: "/dashboard/production-management", roles: [...],
  scope: { kind: "industry", industry: "food" } }
```

대상:
- 생산관리 / 생산운영 / 제조기준관리
- 검사 관리 / 모바일 빠른 점검
- HACCP 검증 / 스캔 체크리스트 입력
- (CCP 관리 / 체크리스트 / F-3 운영 / Deviation 트렌드 — `requireModule` 에서 `scope.industry` 로 변환)

### Y-4-2: 화장품 누락 메뉴 추가

```ts
{ icon: FileText, label: "KFDA 신고서", path: "/dashboard/cosmetic/kfda-report",
  roles: ["super_admin", "admin"],
  scope: { kind: "industry", industry: "cosmetic" } }
```

라우터는 #158 이미 머지됨. UI 페이지만 추가 (BMR detail 의 PDF 생성 버튼 호출).

### Y-4 검증

- [ ] 화장품 탭에 식품 메뉴 노출 0 (실제 브라우저 검증)
- [ ] 식품 사용자 URL / 메뉴 변경 0
- [ ] KFDA 신고서 메뉴 정상 동작

---

## Phase Y-5 — 마스터 데이터 / 카테고리 industry 분리

### Y-5-1: 카테고리 화면 분리

현재 `/dashboard/master-data?tab=categories` 한 화면에 4개 탭 (원료/화장품/매입/매출).

변경:
- 매입/매출 카테고리 → 회계 탭 `/dashboard/accounting/categories` 로 이동
- 원료/품목 카테고리 → 공통 탭 마스터 데이터 (industry view filter)
- industry-specific (화장품-CCP 매핑) → industry 탭 sub-page

### Y-5-2: 마스터 데이터 industry view filter

원료 / 품목 마스터 페이지가 활성 industry 컨텍스트 보고 filter:

```ts
const items = trpc.master.items.list.useQuery({
  industry: activeIndustry  // food / cosmetic / pharma...
});
```

### Y-5 검증

- [ ] 식품 탭에서 원료 마스터 → 식품 원료만 노출
- [ ] 화장품 탭에서 원료 마스터 → 화장품 원료만 노출
- [ ] 회계 탭에 매입/매출 카테고리 정상 노출
- [ ] cross-industry 거래처 (식품 + 화장품 둘 다) 양쪽 표시

---

## Phase Y-6 — 사이드바 industry 탭 자동 생성

### 변경

```ts
// DashboardLayout.tsx
const tabs = useMemo(() => [
  { id: "common", label: "공통", scopeFilter: ["platform", "common"] },
  { id: "accounting", label: "회계", scopeFilter: ["accounting"] },
  ...tenant.activeIndustries.map(industry => ({
    id: industry,
    label: INDUSTRY_LABELS[industry],  // "식품 HACCP" / "화장품 GMP"
    icon: INDUSTRY_ICONS[industry],
    scopeFilter: { kind: "industry", industry },
  })),
], [tenant]);
```

### tenant.activeIndustries 출처

- `h_tenants.active_industries` (JSON 배열) — DB 스키마 추가
- 슈퍼관리자 UI 에서 enable/disable
- 기존 `MODULES` (gmp/haccp) 자동 매핑 → activeIndustries (마이그레이션)

### Y-6 검증

- [ ] 식품 단일 tenant: [공통] [회계] [식품]
- [ ] 화장품 단일 tenant: [공통] [회계] [화장품]
- [ ] 멀티 (식품+화장품): [공통] [회계] [식품] [화장품]
- [ ] 슈퍼관리자: 모든 industry 탭 + 플랫폼 탭

---

## Phase Y-7 — 화장품 GMP 부족 도메인 신설

### Y-7-1: Change Control (변경관리)

KGMP / cGMP 핵심. 모든 industry 공통 → core-mes/lifecycle 에 정의.

```
- 변경 요청 (CR) 등록
- 영향 평가 (Impact Assessment)
- 승인 워크플로 (다단계)
- 실행 + 검증
- 변경 이력 (감사 자료)
```

### Y-7-2: 교육 / 훈련 기록

KGMP / KFDA 검사 시 필수 자료. cross-industry common.

```
- 교육 과정 등록
- 교육 이수 기록 (작업자별)
- 자격 인증 (CCP 모니터링 자격 등)
- 만료 알림
```

### Y-7-3: 화장품 부적합 / CAPA UI 신설

Y-2-1 / Y-2-2 의 core-mes 라우터를 화장품 컨텍스트 페이지로 추가.

```
/dashboard/cosmetic/nonconforming
/dashboard/cosmetic/capa
```

(라우터는 core-mes/quality 단일, UI 만 industry 별)

### Y-7-4: 감사 자료 패키지 (KGMP 대비)

화장품 GMP 정기 검사 시 자동 PDF 패키지:
- BMR + IPC + Formula + Label + Release + Stability + KFDA Report 통합
- 변경관리 이력
- 교육 기록
- 부적합 / CAPA 처리 내역
- 감사 trail

---

## Phase 3 진입 검증 (Y-1~Y-7 완료 후)

가상 시나리오: 의약품 GMP 사업 진입 결정 → Phase 3-A 첫 PR 진행 시.

### 작업

```ts
// 1. IndustryKey 추가 (1줄)
type IndustryKey = ... | "pharmaceutical";

// 2. INDUSTRY_LABELS / ICONS 추가 (3줄)
INDUSTRY_LABELS.pharmaceutical = "의약품 KGMP";

// 3. tenant.activeIndustries 에 등록 가능 (관리자 UI 자동)

// 4. 라우터 / 페이지 추가 (Phase 3-A-1 ~ 3-A-11 별도 PR)
//    → Phase 2 cosmetic 패턴 그대로 재사용 (90%)
```

### 자동 검증

- 의약품 탭 자동 생성 ✅
- 의약품 탭에 식품/화장품 메뉴 노출 0 ✅ (TS 컴파일 강제)
- 부적합 / CAPA 의약품 컨텍스트 자동 view filter ✅
- KGMP 감사 자료 추출 (`WHERE industry = "pharmaceutical"`) ✅

---

## 진행 추적

```
✅ Y-1: ADR-003 + 인벤토리 + 로드맵 (본 PR)
⏳ Y-2: Cross-cutting 도메인 core-mes 추출 (4 PR)
⏳ Y-3: 메뉴 데이터 모델 재구성 (1 PR)
⏳ Y-4: 식품 잔재 메뉴 분류 + 누락 메뉴 (2 PR)
⏳ Y-5: 마스터 데이터 / 카테고리 분리 (2 PR)
⏳ Y-6: 사이드바 자동 탭 (1 PR)
⏳ Y-7: 화장품 부족 도메인 신설 (3~4 PR)
```

---

## 후속 사고 대응

각 단계 운영 영향 발견 시 즉시 롤백:

1. PR revert + Genspark 핫픽스
2. 식품 사용자 URL 변경 0 보장 (path 호환) → revert 시 데이터 영향 0
3. core-mes 추출 PR 롤백 시 view 호환 유지 (라우터 양쪽 노출)

---

## 참조

- ADR-001 — Shared kernel
- ADR-002 — No core to industry
- **ADR-003 — Industry-first menu (본 로드맵의 근거)**
- CP-4-food-migration-roadmap — 식품 라우터 industry/food 이주 (병행 진행)
- Phase-3-industry-roadmap — 신규 업종 진입 (Y 완료 후 가속)
