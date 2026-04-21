# platform/ — 플랫폼 레이어

> 최하위 레이어. 업무 로직이 아닌 **인프라성 관심사** 만.

## 속하는 것

| 하위 도메인 | 책임 |
|---|---|
| `tenant/` | 테넌트 생성/승인/컨텍스트 |
| `auth/` | 로컬 JWT, 세션, 비밀번호 정책 |
| `permission/` | Capability 레지스트리 · 평가 |
| `billing/` | 플랜 / 구독 / 오버라이드 / 과금 매핑 |
| `feature-flag/` | 기능 ON/OFF, 업종별 노출 제어 |
| `audit/` | 정책 변경 / 민감 작업 감사 로그 |
| `notification/` | 이메일 / 알림 발송 추상화 |
| `workflow/` | 승인 워크플로우 엔진 |
| `event-bus/` | Outbox 패턴 · `domain_events` 발행/구독 |

## 속하지 않는 것 (절대 금지)

- ❌ 매입 / 매출 / 재고 / 생산 / 회계 같은 **업무 로직**
- ❌ 업종 특화 코드 (HACCP, 화장품 GMP 등)
- ❌ 위 상위 레이어(`core-erp`, `core-mes`, `industry`, `addon`) 를 import

## 의존 규칙

```
platform → (없음 — 자기 자신만 참조)
```

`platform` 은 모든 레이어가 의존하는 가장 낮은 레이어. 여기서 상위를 참조하면 즉시 순환.

## 이주 소스 (기존 → 여기로)

| 기존 위치 | 이주 대상 |
|---|---|
| `server/routers/auth*` | `platform/auth/` |
| `server/routers/system/` (일부) | `platform/notification/`, `platform/audit/` |
| `server/_core/env.ts` | `platform/config/` (후보) |
| `server/utils/logger.ts` | `platform/observability/` (후보) |

## 참고

- `docs/architecture/00-layers.md`
- `docs/architecture/04-policy-registry.md`
- `docs/architecture/03-event-catalog.md`
