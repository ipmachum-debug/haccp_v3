# shared-kernel/ — 공유 커널 레이어

> `core-erp` 와 `core-mes` 가 공통으로 참조해야 하는 **순수 타입/상수/스키마**.
> ADR-001 참조.

## 속하는 것

| 하위 도메인 | 책임 |
|---|---|
| `item/` | 품목 마스터 타입, Zod 스키마 |
| `uom/` | 단위(Unit of Measure) 정의 |
| `lot-id/` | LOT 식별자 타입 (`LotId = string` 등) |
| `partner-ref/` | 거래처 참조 타입 (FK 타입) |
| `warehouse-ref/` | 창고 참조 타입 |
| `currency/` | 통화 enum (`KRW`, `USD`, ...) |
| `tenant-ref/` | `TenantId = number` 타입 |

## 속하지 않는 것 (절대 금지)

- ❌ 서비스 함수 (비즈니스 로직)
- ❌ 라우터 파일
- ❌ DB 접근 함수 (repo / query)
- ❌ 외부 라이브러리 import (가능한 한 순수)
- ❌ 어떤 다른 레이어도 import 하지 않음 — **import 에서 출구가 없는 레이어**

## 의존 규칙

```
shared-kernel → (platform 도 import 하지 않음)
```

`shared-kernel` 은 **가장 순수한 레이어**. 변경 시 `core-erp` / `core-mes` 양쪽이 영향받으므로 신중.

## 명명 규칙

- DB 테이블 prefix: `sk_*` (예: `sk_items`, `sk_uoms`)
- 이 레이어의 테이블은 **다른 레이어 테이블 FK 의 원점**

## 참고

- `docs/architecture/ADR-001-shared-kernel.md`
- `docs/architecture/02-naming-conventions.md`
- Evans, "Domain-Driven Design" Ch. 14 (Shared Kernel 패턴)
