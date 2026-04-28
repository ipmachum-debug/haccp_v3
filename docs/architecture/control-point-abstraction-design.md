# ControlPoint 추상화 설계

> 작성: 2026-04-28
> 트리거: PR #118 외부 실사 자료 (`MillioAI_플랫폼확장성설계서_v1`) Part II 의 ControlPoint 추상화 인사이트
> 관련: PR #114 진단 보고서 / PR #117 F-2 단일 트랜잭션 엔진 설계 / 특허 명세서 [0016] 해결수단 3 (IoT 폐쇄 루프)

---

## 🎯 핵심 통찰 (PR #118 에서)

> 식품 HACCP 의 **CCP** (Critical Control Point), 화장품 GMP 의 **CQP** (Critical Quality Point), 의약품 GMP 의 **IPC** (In-Process Control) 는 **본질적으로 동일한 추상**이다 — 모두 "한계관리점".

```
CCP (식품)   ─┐
CQP (화장품) ─├── ControlPoint (추상)
IPC (의약품) ─┘
```

**현재 우리 코드의 결합**:
- `drizzle/schema/ccpMonitoring.ts`, `schema_main_ccp.ts`
- `server/routers/ccpMonitoring/ccpRecords.router.ts` 등 (10+)
- `server/routers/haccp/ccp.router.ts`, `ccpForm.router.ts`, `ccpSchedule.router.ts`, `ccpTemplate.router.ts`
- `client/src/pages/haccp/CCP*.tsx` (10+)

→ **CCP 라는 식품 전용 명칭이 코어 위치에 박혀 있음**. Phase 2 (화장품) 진입 시 cosmetic 도 같은 테이블 / 라우터 사용하면 의미적 혼란, 분리하면 코드 중복.

→ **ControlPoint 추상화 도입**으로 본질 통일 + 어댑터로 업종 차이 흡수.

---

## 🏗 설계

### 핵심 개념

```
┌──────────────────────────────────────────────────────────┐
│  Layer 4: industry/{food, cosmetic, pharma, ...}         │
│  ├─ food/ccp.adapter.ts        (Adapter: ControlPoint   │
│  │                                       → CCP 매핑)     │
│  ├─ cosmetic/cqp.adapter.ts    (Adapter: ControlPoint   │
│  │                                       → CQP 매핑)     │
│  └─ pharma/ipc.adapter.ts      (Adapter: ControlPoint   │
│                                          → IPC 매핑)     │
│         ↑ implements                                     │
├─────────┼────────────────────────────────────────────────┤
│         │                                                │
│  Layer 2: core-mes/quality/                              │
│  ├─ controlPoint.ts           (도메인 entity, 업종 무관)  │
│  ├─ criticalLimit.ts          (한계기준 추상)             │
│  ├─ deviation.ts              (이탈 이벤트)               │
│  ├─ inspection.ts             (검사 추상)                 │
│  ├─ correctiveAction.ts       (시정조치)                  │
│  └─ ports/                                              │
│      ├─ controlPointTemplate.port.ts  (업종 템플릿 제공) │
│      └─ regulationMapping.port.ts    (업종 법규 매핑)    │
└──────────────────────────────────────────────────────────┘
```

### 도메인 entity (TypeScript)

```ts
// server/core-mes/quality/domain/controlPoint.ts (신규 — 향후 PR)

/**
 * 업종 무관의 "한계관리점" 추상.
 *  - 식품 HACCP의 CCP (Critical Control Point)
 *  - 화장품 GMP의 CQP (Critical Quality Point)
 *  - 의약품 GMP의 IPC (In-Process Control)
 *  - ISO 22000의 OPRP / CCP
 */
export interface ControlPoint {
  readonly id: number;
  readonly tenantId: number;

  /** 업종별 표시 코드: "CCP-1B", "CQP-3", "IPC-A2" */
  readonly code: string;

  /** 업종별 카테고리 (어댑터가 결정): "온도", "충진량", "공정관리" */
  readonly category: string;

  /** 한계기준 (다중) */
  readonly limits: CriticalLimit[];

  /** 모니터링 주기 */
  readonly monitoringFrequency: Frequency;

  /** 책임자 역할 */
  readonly responsibleRole: string;
}

export interface CriticalLimit {
  readonly type: "min" | "max" | "range" | "boolean" | "categorical";
  readonly value: number | { min: number; max: number } | string;
  readonly unit?: string;
}

export interface Deviation {
  readonly controlPointId: number;
  readonly measurement: Measurement;
  readonly deviatedAt: Date;
  readonly severity: "minor" | "major" | "critical";
  readonly batchId?: number;
  readonly lotIds: number[];
}

export function evaluate(
  cp: ControlPoint,
  measurement: Measurement,
): { type: "normal" } | { type: "deviation"; deviation: Deviation } {
  for (const limit of cp.limits) {
    if (!isWithin(limit, measurement)) {
      return { type: "deviation", deviation: makeDeviation(cp, limit, measurement) };
    }
  }
  return { type: "normal" };
}
```

위 entity 는 **"식품" / "HACCP" / "CCP" 라는 단어가 코드 식별자에 0 회 등장**. 이게 진짜 "업종 무관 코어" 의 증거.

### 어댑터 (Layer 4)

```ts
// server/routers/industry/food/ccp.adapter.ts (향후 PR)

import { ControlPoint, ControlPointTemplateProvider } from "../../../core-mes/quality";

export class FoodCCPAdapter implements ControlPointTemplateProvider {
  async listTemplates(): Promise<ControlPoint[]> {
    // h_ccp_definitions / 식품 가공식품 4종 (1B, 2B, 3B, 4P) 등 식품 템플릿 반환
    // 식품 한정 코드명 규칙: "CCP-{공정코드}{유형}"
    // ...
  }
}
```

```ts
// server/routers/industry/cosmetic/cqp.adapter.ts (Phase 2 진입 시)

export class CosmeticCQPAdapter implements ControlPointTemplateProvider {
  async listTemplates(): Promise<ControlPoint[]> {
    // 화장품 CQP — pH / 점도 / 충진량 / 미생물
    // 화장품 한정 코드명 규칙: "CQP-{단계}"
    // ...
  }
}
```

→ **같은 `ControlPoint` interface, 다른 어댑터** 가 본 추상화의 핵심.

---

## 🔄 마이그레이션 마일스톤 (Strangler Fig)

큰 변경이라 한 PR 으로 끝낼 수 없음. 점진 이주.

### Phase CP-1 — 추상 entity 선언 (1 PR, 작음)

`server/core-mes/quality/` 신규 디렉토리:
- `controlPoint.ts` (interface + evaluate 함수)
- `criticalLimit.ts`
- `deviation.ts`
- `ports/controlPointTemplateProvider.ts`

기존 `h_ccp_*` 테이블 / `ccpRouter` 그대로. **사용처 0** → 회귀 영향 0.

### Phase CP-2 — 식품 어댑터 작성 (1 PR, 중)

`server/routers/industry/food/ccp.adapter.ts` 신규.
기존 `h_ccp_definitions` 데이터를 `ControlPoint` 형태로 변환 (DB 변경 없음, 매핑만).

### Phase CP-3 — 신규 사용처 도입 (1 PR, 중)

새로운 기능이 ControlPoint 추상을 사용. 기존 ccpRouter 는 그대로.
예: F-3 (IoT 폐쇄 루프 워크플로) 가 `ControlPoint.evaluate()` 사용.

### Phase CP-4 — 점진 이주 (다수 PR)

기존 ccpRouter 의 procedure 를 하나씩 ControlPoint 기반으로 이주.
각 PR 마다 회귀 테스트.

### Phase CP-5 — DB 스키마 추상화 (1~2 PR, 큼, 신중)

`h_ccp_*` → `h_control_point_*` 또는 어댑터에서 변환.
이건 디렉토리 이주 (Phase A-1) 와 별도 결정.

### Phase CP-6 — Phase 2 화장품 CQP 어댑터 (1 PR, 신규 시장)

`server/routers/industry/cosmetic/cqp.adapter.ts` 추가.
화장품 CQP 5종 (pH, 점도, 충진량, 미생물, 외관) 정의.

---

## 💎 가치 (특허 / ROI / 운영)

### 특허 청사진 정렬

| 특허 해결수단 | ControlPoint 의 기여 |
| --- | --- |
| **[0013] 1 — 업종별 규정 자동 구성** | 어댑터 패턴이 자동 등록 골격 제공 |
| **[0016] 3 — IoT 폐쇄 루프** | `ControlPoint.evaluate()` 가 이탈 감지 단일 진입점. 어댑터 무관 작동 |
| **[0014] 2 — 단일 트랜잭션** | F-2 의 TransactionContext 안에서 ControlPoint 검사 호출 |

### ROI (PR #118 Part V 기반)

| 시나리오 | 추상화 없음 | 추상화 도입 |
| --- | --- | --- |
| Phase 2 화장품 GMP 진입 | 6주 (CCP→CQP 재설계) | **4주** (CQP 어댑터만) |
| Phase 3 의약품 GMP 진입 | 8~10주 (IPC 신규) | **6주** (IPC 어댑터만) |
| 신규 한계기준 유형 추가 | 모든 업종 라우터 수정 | **Core entity 1곳 수정** |

→ **Phase 2 진입 시 약 2주 단축** (1500~2500만원 절감 — PR #118 Part V 환산).

### 운영 가치

- **F-3 (IoT 폐쇄 루프)** 의 토대 — 이탈 감지 / LOT HOLD / 손실 분개 / 시정조치 모두 ControlPoint 기반
- **AI 규칙 엔진** 이 ControlPoint.evaluate() 결과 기반으로 작동 → 업종 무관
- **감사 자료 자동 생성** — 어댑터가 업종별 양식만 변환

---

## 🛡 위험 / 안전 평가

### Big Risk

1. **기존 ccpRouter 사용처 다수** (`client/src/pages/haccp/` 30+ 페이지) — 이주 시 영향 큼
2. **DB 스키마 추상화** (Phase CP-5) 가 가장 큼 — `h_ccp_*` → `h_control_point_*` 마이그레이션 위험
3. **어댑터 패턴 정착 부족 시** — 현재 코드 곳곳 식품 전용. Strangler Fig 점진 이주 필수

### Mitigation

1. **Phase CP-1 (entity 선언) 단독 머지** — 사용처 0 → 회귀 영향 0
2. **DB 스키마 추상화 (Phase CP-5) 는 Phase 2 진입 직전** — 화장품 어댑터 준비된 시점에 일괄 변경
3. **어댑터 적합성 테스트**: 새 어댑터가 5종 Port 모두 구현하는지 자동 검증 (CI)
4. **회귀 테스트 강화**: 기존 ccp 라우터 동작 100% 보존 검증

---

## 🎯 다음 단계 (별도 PR)

| 우선순위 | 작업 | 가치 |
| --- | --- | --- |
| 1 | **Phase CP-1** entity 선언 | F-3 / F-2 의 토대 |
| 2 | **Phase CP-2** 식품 어댑터 | 기존 데이터 호환 |
| 3 | **Phase CP-3** F-3 IoT 폐쇄 루프 신규 — ControlPoint 사용 | 특허 [0016] 정착 |
| (Phase 2 진입 시) | **Phase CP-6** 화장품 CQP 어댑터 | 시장 확장 |

본 PR 은 **설계 문서만** — 코드 변경 0.

---

## 📚 참고

- PR #118 외부 실사 자료 `MillioAI_플랫폼확장성설계서_v1` Part II
- PR #114 `industry-coupling-audit-2026-04-28.md` — 진단 보고서
- PR #117 `single-transaction-engine-design.md` — F-2 설계
- 특허 명세서 [0013] [0014] [0016]
- `docs/architecture/00-layers.md` — 5계층 정의
- `server/lib/industry/industryConfig.ts` — 업종 메타데이터
