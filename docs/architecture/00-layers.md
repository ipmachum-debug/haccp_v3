# 00. 레이어 아키텍처 (Millio AI)

> 최초 작성: 2026-04-21
> 상태: **CANONICAL** — 신규 기능 / 리팩토링 / 신규 모듈 개발 시 이 문서 기준으로 위치 결정.

---

## 전체 그림

```
┌─────────────────────────────────────────────┐
│ Layer 5: addon                              │
│  (ai / hr / bi / iot / mobile / integration)│
└─────────────────────────────────────────────┘
            ↑ 소비
┌─────────────────────────────────────────────┐
│ Layer 4: industry                           │
│  (food / cosmetic / health / electronics /  │
│   apparel / general-manufacturing)          │
└─────────────────────────────────────────────┘
            ↑ 소비
┌───────────────────────┬─────────────────────┐
│ Layer 3: core-mes     │ Layer 2: core-erp   │
│ (bom / routing /      │ (purchase / sales / │
│  workorder /          │  inventory /        │
│  production / quality │  accounting /       │
│  / lot / equipment)   │  costing / partner /│
│                       │  warehouse)         │
└───────────────────────┴─────────────────────┘
            ↑ 양쪽 모두 소비
┌─────────────────────────────────────────────┐
│ Layer 1.5: shared-kernel                    │
│  (item / uom / lot-id / partner-ref /       │
│   warehouse-ref / currency / tenant-ref)    │
└─────────────────────────────────────────────┘
            ↑ 기반
┌─────────────────────────────────────────────┐
│ Layer 1: platform                           │
│  (tenant / auth / permission / billing /    │
│   audit / feature-flag / notification /     │
│   file / workflow / event-bus)              │
└─────────────────────────────────────────────┘
```

---

## 각 레이어 정의

### Layer 1 — platform

**성격**: 운영 인프라. 업무 개념 **금지**.

**포함**:
- `tenant` — 테넌트 식별, 등록, 활성화
- `auth` — 로그인, 세션, JWT
- `permission` / `capability` — 권한 엔진 (Feature × Capability × Role × Plan)
- `billing` / `subscription` — 과금, 구독 플랜, 결제
- `audit` — 감사 로그
- `feature-flag` / `package` — 패키지별 기능 노출 매핑
- `notification` — 알림 발송 (이메일/인앱/SMS)
- `file` — 파일 스토리지 기반
- `workflow` — 승인 워크플로우 엔진 (도메인 독립)
- `event-bus` — 도메인 이벤트 발행/구독 (outbox 패턴)

**금지**:
- purchase, inventory, production, accounting 등 업무 로직 금지
- "공통이라서 일단 platform 에 넣자" ❌

**네이밍**:
- 테이블: 접두사 없음 또는 `platform_*`
- 라우터: `server/routers/platform/*`

---

### Layer 1.5 — shared-kernel

**성격**: core-erp 와 core-mes 가 **공동으로 참조**하는 최소 공통 모델.

**포함**:
- `item` — 품목 마스터 (erp: 매입/매출 단위, mes: BOM 구성품 단위)
- `uom` — 단위 (kg, EA, box ...)
- `lot-id` — LOT 식별자 (MES 생성, ERP 재고 참조)
- `partner-ref` — 거래처 ID 타입
- `warehouse-ref` — 창고 ID 타입
- `currency` — 통화
- `tenant-ref` — 테넌트 ID 타입

**핵심 원칙**: "두 레이어가 동시에 읽어야 하는 개념" 만 들어감. 변경이 드물고 변경 시 양쪽에 영향을 줌. **절대 자주 바뀌면 안 됨**.

**금지**:
- 업무 로직 (CRUD 서비스 없음, 타입/상수/스키마만)
- 한쪽만 쓰는 개념

---

### Layer 2 — core-erp

**성격**: 제조업 공통의 거래/재무/재고 흐름.

**포함**:
- `purchase` — 매입
- `sales` — 매출
- `inventory` — 재고 (입출고, 이동, 조정)
- `accounting` — 회계 (분개, 원장, 재무제표)
- `costing` — 원가 (표준원가, 실제원가, 원가 배부)
- `partner` — 거래처 마스터
- `warehouse` — 창고 마스터

**소비 가능**: platform, shared-kernel
**소비 금지**: core-mes, industry, addon

---

### Layer 3 — core-mes

**성격**: 제조 실행층.

**포함**:
- `bom` — 자재 구성
- `routing` — 공정 흐름 정의
- `workorder` — 작업 지시
- `production` — 생산 실적
- `quality` — 검사 / 판정
- `lot` — 추적성 (LOT 생성, 소진, FEFO)
- `equipment` — 설비 관리

**소비 가능**: platform, shared-kernel, core-erp (inventory/costing 참조)
**소비 금지**: industry, addon

> `lot` 은 core-mes 에서 **생성**되지만 실체 저장은 `core-erp/inventory` 의 lot 테이블과 연결됨. 이를 매개하는 것이 `shared-kernel/lot-id`.

---

### Layer 4 — industry

**성격**: 업종별 규제 / 공정 / 문서 특화.

**포함**:
- `food` — HACCP, CCP, 위생, 유통기한, 회수
- `cosmetic` — BMR, 처방서, 라벨, 전성분
- `health` — 건기식 COA, 배합, 기능성 원료
- `electronics` — Serial 추적, 공정검사, 수율
- `apparel` — 스타일, 색상/사이즈 매트릭스, 외주
- `general-manufacturing` — Fallback 템플릿 (업종 Pack 이 없을 때 core 의 기본 UI 재사용)

**원칙**: **industry 는 core 를 확장하지만 core 를 오염시키면 안 됨.**

OK:
- `industry/food` 가 `core-mes/production` 참조 → OK
- `industry/cosmetic` 이 `core-mes/workorder` 참조 → OK

금지:
- `core-mes/production` 테이블에 `food_ccp_point` 컬럼 추가 → 금지
- `core-erp/inventory` 에 `cosmetic_batch_no` 컬럼 추가 → 금지
- core 코드 안에 `if (industry === 'food')` 분기 → 금지

**연결 방식**: reference / event / mapping 테이블.

**소비 가능**: platform, shared-kernel, core-erp, core-mes
**소비 금지**: 다른 industry (food 가 cosmetic 을 import 하면 안 됨), addon

---

### Layer 5 — addon

**성격**: 선택 기능 / 채널.

**두 종류 혼재**:

**5a. Business Add-on**
- `ai` — AI 어시스턴트, 예측, 문서 자동생성
- `hr` — 고급 인사/평가/교육 (기본 급여는 core-erp 내 포함)
- `bi` — 비즈니스 인텔리전스 / 대시보드 빌더

**5b. Channel Add-on (delivery layer)**
- `mobile` — 모바일 앱 / PWA
- `iot` — 설비 IoT 연동
- `external-integration` — 외부 시스템 연동 (ERP / 세무 / 이커머스)

**소비 가능**: 모든 하위 레이어
**소비 금지**: 다른 addon 에 의존 (addon 끼리는 독립)

> channel-addon 은 엄밀히는 "delivery layer" 성격. 현재 구조에서는 addon 에 포함하되, 문서상 구분.

---

## 패키지 매핑 (과금 단위)

| 플랜 | 포함 레이어 |
|---|---|
| Starter | platform + shared-kernel + industry/food (HACCP 전용) |
| Standard | + core-erp + core-mes + 기본 HR (core-erp 내) |
| Enterprise | + industry Pack 2개 이상 + API 노출 + 멀티공장 |
| Add-on (별매) | ai / advanced-hr / bi / iot / mobile |

**업셀 체험**: 14일 (Standard 이상 기능을 기간 한정 활성화)

---

## 관련 문서

- `01-dependency-rules.md` — 의존 방향 강제 규칙
- `02-naming-conventions.md` — 테이블 / 라우터 / 파일 네이밍
- `03-event-catalog.md` — 표준 도메인 이벤트
- `04-policy-registry.md` — 정책 위치 (posting / approval / feature)
- `ADR-001-shared-kernel.md` — shared-kernel 도입 결정
- `ADR-002-no-core-to-industry.md` — core → industry 역참조 금지 결정
