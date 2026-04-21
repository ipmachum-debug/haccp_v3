# ADR-001: Shared Kernel 도입

- **일자**: 2026-04-21
- **상태**: Accepted
- **결정자**: (architecture design session)

---

## 배경

5계층 구조 (platform / core-erp / core-mes / industry / addon) 에서 `core-erp` 와 `core-mes` 가 동시에 참조해야 하는 개념들이 존재:

- **Item (품목)** — ERP 에서는 매입/매출 단위, MES 에서는 BOM 구성품
- **LOT ID** — MES 에서 생성되지만 ERP 재고가 참조
- **UoM (단위)** — 양쪽에서 공통 사용
- **Partner / Warehouse** — 양쪽에서 공통 사용

이걸 한 레이어 안에 두면 다른 레이어가 그 레이어를 import 해야 함 → 의존성 역전 발생.

---

## 선택지

### 옵션 A: core-erp 가 item 을 소유, core-mes 는 core-erp 를 import
- 문제: `core-mes → core-erp` 의존성 발생. "core-mes 가 ERP 없이는 못 돎" = MES 단독 판매 불가

### 옵션 B: core-mes 가 item 을 소유, core-erp 는 core-mes 를 import
- 문제: 동일한 문제 반대 방향. ERP 만 쓰는 고객(매입/매출/회계만)이 MES 코드를 싣게 됨

### 옵션 C (채택): Shared Kernel 도입
- `shared-kernel/` 레이어 신설
- 양쪽이 공통으로 읽는 **타입 / 상수 / 스키마만** 배치
- 업무 로직(서비스/라우터)은 shared-kernel 에 없음

---

## 결정

**Shared Kernel 레이어를 platform 과 core 사이에 도입.**

```
platform → shared-kernel → core-erp, core-mes → industry → addon
```

### 포함 대상
- `shared-kernel/item/` — 품목 마스터 타입, 스키마
- `shared-kernel/uom/` — 단위 정의
- `shared-kernel/lot-id/` — LOT 식별자 타입
- `shared-kernel/partner-ref/` — 거래처 참조 타입
- `shared-kernel/warehouse-ref/` — 창고 참조 타입
- `shared-kernel/currency/` — 통화 enum
- `shared-kernel/tenant-ref/` — 테넌트 ID 타입

### 포함하지 않는 것
- 비즈니스 로직 (서비스 함수 없음)
- CRUD 라우터 (라우터 파일 없음)
- DB 접근 함수 (repo 없음)

→ "타입 / 상수 / Zod 스키마 / TS 인터페이스" 만 포함.

---

## 대가 (Consequence)

### 장점
- core-erp 와 core-mes 가 **완전 독립** 배포 가능 (미래에 모노레포 분리 시)
- 순환 참조 원천 차단
- 타입 변경이 양쪽에 자동 반영 → 드리프트 방지

### 단점
- 레이어 하나 늘어남 (학습 곡선 ↑)
- shared-kernel 변경이 양쪽에 영향 → 변경에 신중해야 함

### 리스크 완화
- shared-kernel 은 **의도적으로 작게** 유지 (오직 "두 레이어가 반드시 공유해야 하는 것만")
- shared-kernel 변경 PR 은 양쪽 도메인 담당자 **필수 리뷰**
- 의존성 규칙은 `dependency-cruiser` 로 CI 에서 강제

---

## 관련 규칙

- `01-dependency-rules.md` — shared-kernel 은 어떤 레이어도 import 금지 (순수성 유지)
- `02-naming-conventions.md` — `shared-kernel/` 테이블은 `sk_*` 접두사
- DDD 용어: Evans, "Domain-Driven Design" Chapter 14 참조
