# 01. 의존성 규칙

> 목적: 레이어 간 의존이 **코드로 강제**되도록 `dependency-cruiser` 로 CI 에서 검증.

---

## 핵심 원칙

**상위 레이어는 하위 레이어를 소비할 수 있지만, 반대는 절대 금지.**

```
addon ───────────────→ industry ──────────→ core-mes ──→ core-erp ──→ shared-kernel ──→ platform
                                                  ↖_________ 양쪽에서 참조 _________↗
```

---

## 금지 규칙 (반드시 CI 에서 차단)

| # | 규칙 이름 | from | to | 설명 |
|---|---|---|---|---|
| 1 | `core-cannot-use-industry` | `server/core-*/**` | `server/industry/**` | core 가 업종 특화 코드를 import 하면 오염됨 |
| 2 | `core-cannot-use-addon` | `server/core-*/**` | `server/addon/**` | core 가 addon 에 의존하면 유료 기능 없이는 core 가 못 돎 |
| 3 | `platform-cannot-use-core` | `server/platform/**` | `server/core-*/**` | platform 은 업무 개념 모름 |
| 4 | `platform-cannot-use-industry` | `server/platform/**` | `server/industry/**` | 상동 |
| 5 | `shared-kernel-pure` | `server/shared-kernel/**` | `server/core-*/**`, `server/industry/**`, `server/addon/**`, `server/platform/**` | shared-kernel 은 타입/상수/스키마만 포함 (어떤 레이어도 import 금지) |
| 6 | `erp-cannot-use-mes` | `server/core-erp/**` | `server/core-mes/**` | 역방향 금지. 필요 시 shared-kernel 로 타입 승격 |
| 7 | `industry-cannot-use-other-industry` | `server/industry/food/**` | `server/industry/cosmetic/**`, `server/industry/health/**` ... | 업종끼리는 독립. 공통 패턴은 core 또는 shared-kernel 로 승격 |
| 8 | `addon-cannot-use-other-addon` | `server/addon/ai/**` | `server/addon/hr/**`, `server/addon/bi/**` ... | addon 끼리는 독립 |

---

## 허용 규칙 (명시적으로 열어둠)

| from | to | 이유 |
|---|---|---|
| `server/**` | `server/platform/**` | 누구나 platform 사용 가능 |
| `server/**` | `server/shared-kernel/**` | 누구나 shared-kernel 참조 가능 |
| `server/core-mes/**` | `server/core-erp/**` (inventory, costing 만) | MES 가 재고 차감 / 원가 반영 시 필요 |
| `server/industry/**` | `server/core-*/**` | industry 는 core 를 확장 |
| `server/addon/**` | `server/**` (industry 포함) | addon 은 모든 하위 레이어 소비 가능 |

---

## 현재 코드 → 새 구조 매핑

**경과 단계 (Strangler Fig)**: 기존 `server/routers/*.ts` / `server/db/*.ts` 는 그대로 두되, **신규 파일은 새 구조로 작성**.

현재 | → | 이주 후 (점진)
---|---|---
`server/routers/auth/` | → | `server/platform/auth/`
`server/routers/system/` | → | `server/platform/*`
`server/routers/accounting/` | → | `server/core-erp/accounting/`
`server/routers/master/partners.ts` | → | `server/core-erp/partner/`
`server/routers/master/materials.ts` | → | `server/shared-kernel/item/` + `server/core-erp/inventory/`
`server/routers/inventory/` | → | `server/core-erp/inventory/`
`server/routers/haccp/haccpIntegration.router.ts` | → | `server/core-erp/purchase/`, `server/core-erp/sales/` (업종 무관)
`server/routers/haccp/*` (CCP, 검사, 체크리스트) | → | `server/industry/food/*`
`server/routers/production/` | → | `server/core-mes/production/`
`server/routers-ai.ts` | → | `server/addon/ai/`

> 구체적 이주 PR 단위는 별도 issue / 체크리스트로 관리.

---

## dependency-cruiser 실행

```bash
npx depcruise server --config .dependency-cruiser.cjs
```

CI 워크플로우 (`/.github/workflows/deploy.yml` 의 validate 단계에 추가):
```yaml
- name: 레이어 의존성 검증
  run: npx depcruise --config .dependency-cruiser.cjs server
```

위반 시 CI 실패. PR merge 차단됨.

---

## 예외 처리

정말 불가피한 경우 `.dependency-cruiser.cjs` 에 **explicitly allowed exception** 으로 주석과 함께 등록:

```js
{
  name: "tmp-exception-haccp-router",
  comment: "2026-04-21: haccpIntegration.router.ts 가 food/ 로 이주되기 전 한시적 허용. Issue #XX 참조",
  severity: "ignore",
  from: { path: "^server/routers/haccp/haccpIntegration" },
  to: { path: "^server/industry/food" }
}
```

**예외는 반드시 issue 번호 + 제거 목표일**을 코멘트에 남긴다.
