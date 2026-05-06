# ADR-003 — Industry-First Menu Architecture

> 결정일: 2026-04-30
> 상태: **Accepted**
> 결정자: Claude (architecture lead) + 사용자 (product owner)
> 트리거: Phase 2 cosmetic GMP 완성 (#145~#170) 후 화장품 탭에 식품 메뉴 잔재 노출
>          + Phase 3 의약품/건기식 진입 시 같은 문제 반복 + 컴플라이언스 리스크

---

## 1. 컨텍스트

### 현재 메뉴 모델 (Industry-Agnostic)

```ts
const menuItems: MenuItem[] = [
  { icon, label, path, roles, requireModule?, category? }
];

type MenuItem = {
  icon: LucideIcon;
  label: string;
  path: string;
  roles: Role[];
  requireModule?: "haccp" | "gmp";  // 선택 필드 — 누락 시 모든 탭에 노출
  category?: "work";                 // 슈퍼관리자 메뉴
};
```

**문제**: `requireModule` 누락된 메뉴 (= "industry 분류 없음") 가 **모든 탭에 노출**.

### 식품 잔재 메뉴 노출 사고 (스크린샷 검증)

화장품 GMP 탭 활성화 상태에서 노출되는 식품 전용 메뉴:
- 생산관리 (식품 배치)
- 생산운영 (식품 일보)
- 제조기준관리 (식품 기준서)
- 검사 관리 (식품 위생/원재료/출하 검사)
- 모바일 빠른 점검 (HACCP 일일 점검)
- 부적합제품관리 (식품 nonconforming)
- 감사관리 (HACCP 감사)
- 감사 리포트

→ 화장품 사용자가 식품 전용 화면에 접근 가능. UX 혼란 + 잘못된 데이터 입력 가능성.

### Phase 3 진입 시 위험 시나리오 (가상)

의약품 (KGMP) 사업 진입 후:

1. "생산관리" (식품 배치) 가 의약품 탭에서도 노출
2. 의약품 제조기록을 식품 화면으로 입력 → **약사법 §31 (제조 기준 적합성) 위반**
3. KFDA 정기 감사 시 발견 → 행정처분 (영업정지 / 회수 / 형사 고발)
4. 의약품과 식품의 부적합 처리 (회수 보고 / 보존 기간) 절차 다름 → 한 화면에서 처리 시 컴플라이언스 사고

**근본 원인**: 메뉴가 industry 컨텍스트를 모름 → 데이터 흐름이 industry 별로 분리 안 됨.

---

## 2. 결정

### 2-1. Industry-First Menu 모델 도입

모든 메뉴는 명시적 `scope` 필드 보유. **TypeScript 컴파일 보증** (누락 시 빌드 실패).

```ts
type MenuItem = {
  icon: LucideIcon;
  label: string;
  path: string;
  roles: Role[];
  scope: MenuScope;  // ★ 필수. discriminated union.
  // ... 기존 필드
};

type MenuScope =
  | { kind: "platform" }                    // 슈퍼관리자 / 시스템
  | { kind: "common" }                      // 모든 industry 공통 (재고/알림/마스터)
  | { kind: "accounting" }                  // 회계 (cross-industry)
  | { kind: "industry"; industry: IndustryKey };  // 특정 industry 전용

type IndustryKey =
  | "food"                  // 식품 HACCP
  | "cosmetic"              // 화장품 GMP
  | "pharmaceutical"        // 의약품 KGMP (Phase 3-A)
  | "health-functional"     // 건강기능식품 (Phase 3-B)
  | "medical-device"        // 의료기기 (ISO 13485, Phase 3-C)
  | "general-manufacturing"; // 일반제조 (ISO 9001, Phase 3-D)
```

### 2-2. 사이드바 탭 자동 생성

탭은 **테넌트 활성 industry config 기반 동적 생성**:

```
[공통] [회계] + 활성 industry 자동 탭들

단일 industry tenant (식품만):    [공통] [회계] [식품]
멀티 industry tenant (식품+화장품): [공통] [회계] [식품] [화장품]
Phase 3 진입 (+ 의약품):           [공통] [회계] [식품] [화장품] [의약품]
```

탭별 노출 메뉴:
- **공통 탭**: `scope.kind in ["platform", "common"]`
- **회계 탭**: `scope.kind === "accounting"`
- **industry 탭**: `scope.kind === "industry" && scope.industry === currentTab`

### 2-3. Cross-cutting 도메인 처리 정책

**부적합 / CAPA / 변경관리 / 감사** — 모든 industry 공통이지만 industry 컨텍스트 필요.

선택지:
- A) **Industry 별 entity 복제** — `food_nonconforming`, `cosmetic_nonconforming`, ...
- B) **Core 통합 entity + view filter** — `nonconforming` 단일 테이블, `industry` 컬럼 추가, 활성 industry 보고 필터링 ✅ **선택**

선택 이유:
- 모든 industry 의 부적합/CAPA 핵심 필드 공통 (제목/설명/심각도/담당자/처리 상태)
- industry-specific 추가 필드 는 JSON 컬럼 (`industry_metadata`) 으로 확장 가능
- 보고/통계/감사 대시보드 (cross-industry view) 손쉬움
- 데이터 동기화 / 중복 부담 0

ADR-001 (shared-kernel) 패턴 적용 — `core-mes/quality` 에 정의 + industry 별 view filter.

### 2-4. URL Path 호환

기존 식품 사용자 URL 변경 0:
- `/dashboard/production-management` 그대로 유지 (메뉴 분류만 추가)
- 점진적으로 `/food/production-management` 로 이동 (선택, redirect 호환 후)

---

## 3. 거부된 대안

### 대안 1: 메뉴별 industry whitelist 배열

```ts
{ industries: ["food", "cosmetic"] }  // 둘 다 노출
```

**거부 이유**:
- 누락 시 기본값이 모호 (모든 industry? 또는 빈 배열?)
- TypeScript 강제 어려움 (옵셔널 필드라 컴파일 보증 안 됨)
- 식품 잔재 사고 재발 가능

### 대안 2: 폴더 기반 자동 분류

```
client/src/pages/food/menu.config.ts
client/src/pages/cosmetic/menu.config.ts
```

**거부 이유**:
- 공통 / 회계 메뉴는 위치 모호
- 멀티 industry 사용자 (식품 + 화장품) 의 메뉴 머지 로직 복잡
- 기존 평탄 구조에서 점진 이주 부담 큼

### 대안 3: 그대로 두고 빠른 패치 (`requireModule` 추가만)

**거부 이유** (사용자 명시 거부):
> "솔직히 아키텍처, 메뉴구성은 잘 모르겟어. 왜냐하면 내가 다른 업종 정보가 없기때문이야. 니가 설계한 방향대로 근본 아키텍처 모델로 설계되어야 한다고 생각해"

**근본 차이**: `requireModule` 만 추가는 옵셔널 필드 누락 사고 재발. `scope` 는 discriminated union 으로 컴파일 보증.

---

## 4. 결과

### 즉시 효과

- ✅ 화장품 탭에 식품 메뉴 노출 0 (TS 컴파일 강제)
- ✅ 식품 사용자 URL / 데이터 영향 0 (path 호환)
- ✅ Phase 3 진입 시 신규 industry 탭 자동 생성
- ✅ 부적합/CAPA cross-industry 보고 가능 (단일 테이블 + filter)

### 장기 효과

- Phase 3-A (의약품) 진입 시 KGMP 컴플라이언스 안전
- Phase 3-B (건기식) 진입 시 영양기능정보 / 광고 심의 분리
- 멀티 industry 테넌트 (식품 회사 + 화장품 자회사) 자연스러운 단일 시스템 운영

### 리스크 / 단점

- **마이그레이션 작업량**: 기존 메뉴 60+ 항목 모두 `scope` 필드 추가 필요 (Phase Y-4 에서 처리)
- **Cross-cutting 도메인 추출 작업**: 부적합/CAPA 등 4개 도메인 core-mes 승격 (Phase Y-2)
- **Big Bang 위험**: 단일 PR 로 전체 변경 시 회귀 위험 → **Strangler Fig 패턴 적용** (Phase Y 7단계 분할)

---

## 5. 구현 가이드라인

### 5-1. 메뉴 추가 시

```ts
// ✅ 올바른 방식
{ icon, label, path, roles, scope: { kind: "industry", industry: "cosmetic" } }
{ icon, label, path, roles, scope: { kind: "common" } }

// ❌ 잘못된 방식 (TypeScript 컴파일 에러)
{ icon, label, path, roles }  // scope 누락
{ icon, label, path, roles, scope: { kind: "industry" } }  // industry 누락
```

### 5-2. 신규 industry 추가 시

```ts
// 1. IndustryKey 추가
type IndustryKey = ... | "pharmaceutical";

// 2. INDUSTRY_LABELS / ICONS / DESCRIPTIONS 추가
const INDUSTRY_LABELS = { ..., pharmaceutical: "의약품 KGMP" };

// 3. tenant.activeIndustries 에 등록 가능 (관리자 UI)
// 4. server/routers/industry/pharmaceutical/ 라우터 추가 (별도 PR)

// 메뉴는 자동으로 분류됨 (TS 컴파일 강제)
```

### 5-3. Cross-cutting 도메인 사용 시

```ts
// 모든 industry 의 부적합 entity 단일 테이블
table: nonconformings (
  id, tenant_id,
  industry: enum("food","cosmetic","pharmaceutical",...),  // ★ 필수
  title, description, severity, ...
  industry_metadata: JSON  // industry-specific 확장
)

// view filter
const list = await db.select().from(nonconformings)
  .where(and(
    eq(tenantId, ctx.tenantId),
    eq(industry, ctx.activeIndustry)  // ★ 컨텍스트 필터
  ));
```

---

## 6. 참조 / 후속 ADR

- **ADR-001 shared-kernel**: 공통 패턴 (UoM/LOT/Currency) 코어 추출 — 본 ADR 의 cross-cutting 도메인 추출 정책 기반
- **ADR-002 no-core-to-industry**: core 가 industry 참조 금지 — 본 ADR 의 view filter 패턴이 ADR-002 준수 보장
- **Phase-Y-roadmap.md**: 본 ADR 구현 단계 (Y-1~Y-7) 계획
- **menu-inventory.md**: 현재 모든 메뉴 (60+) 의 scope 분류 매트릭스

---

## 7. Phase 3 진입 검증 체크리스트

본 ADR 적용 후 Phase 3-A (의약품) 진입 시 다음 검증 통과 필수:

- [ ] 의약품 탭 enable 시 자동 생성
- [ ] 의약품 탭에 식품/화장품 메뉴 노출 0 (TS 컴파일 강제)
- [ ] 의약품 부적합 등록 → `nonconformings.industry = "pharmaceutical"` 정확히 기록
- [ ] cross-industry 보고 (대시보드) 에서 식품/화장품/의약품 분리 통계
- [ ] KGMP 감사 시 의약품 데이터만 추출 가능 (`WHERE industry = "pharmaceutical"`)
