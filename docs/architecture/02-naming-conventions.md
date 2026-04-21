# 02. 네이밍 컨벤션

> 일관성 > 개인 취향. 이 문서에 없는 경우 **기존 파일의 패턴** 을 따른다.

---

## 폴더 구조 (목표)

```
server/
  platform/
    tenant/
    auth/
    permission/
    billing/
    audit/
    feature-flag/
    notification/
    file/
    workflow/
    event-bus/
  shared-kernel/
    item/
    uom/
    lot-id/
    partner-ref/
    ...
  core-erp/
    purchase/
    sales/
    inventory/
    accounting/
    costing/
    partner/
    warehouse/
  core-mes/
    bom/
    routing/
    workorder/
    production/
    quality/
    lot/
    equipment/
  industry/
    food/
      haccp/
      ccp/
      hygiene/
      recall/
    cosmetic/
      batch-record/
      formula/
      label/
    health/
    electronics/
    apparel/
    general-manufacturing/
  addon/
    ai/
    hr-advanced/
    bi/
    iot/
    mobile/
    external-integration/
```

각 도메인 폴더 내부:
```
<도메인>/
  <도메인>.router.ts      # tRPC 라우터
  <도메인>.service.ts     # 비즈니스 로직
  <도메인>.repo.ts        # DB 접근
  <도메인>.schema.ts      # Zod 스키마
  <도메인>.types.ts       # TypeScript 타입
  __tests__/
    <도메인>.test.ts
```

---

## 테이블 네이밍

| 레이어 | 접두사 | 예시 |
|---|---|---|
| platform | `platform_*` or 접두사 없음 | `tenants`, `users`, `audit_log`, `platform_features` |
| shared-kernel | `sk_*` | `sk_items`, `sk_uoms` |
| core-erp | `erp_*` | `erp_purchases`, `erp_sales`, `erp_inventory_lots` |
| core-mes | `mes_*` | `mes_work_orders`, `mes_production_results` |
| industry/food | `food_*` | `food_haccp_plans`, `food_ccp_logs` |
| industry/cosmetic | `cos_*` | `cos_batch_records`, `cos_formulas` |
| industry/health | `hlth_*` | `hlth_coa_records` |
| addon/ai | `ai_*` | `ai_rules`, `ai_knowledge_documents` |
| addon/hr-advanced | `hr_*` | `hr_evaluations` |

**현재 기존 테이블**: `accounting_*`, `h_*` 접두사는 **이주 전까지 유지**. 신규 테이블은 새 규칙 적용.

**공통 컬럼** (모든 테이블 필수):
- `id` (PK)
- `tenant_id` (멀티테넌트 격리) — platform 테이블 제외
- `created_at`, `updated_at`
- `created_by` (외부 작성자), `updated_by` (선택)

---

## 라우터 네이밍

tRPC 라우터 네이밍:
```
<domain>.<action>
```

예시:
```
purchase.list
purchase.create
purchase.getById
purchase.update
purchase.cancel         (delete 금지, cancel 사용)

erp.purchase.list       (AppRouter 네스팅이 필요한 경우)
```

**액션 표준**:
- `list` — 목록 조회 (페이징)
- `search` — 필터 조회
- `getById` — 단건 조회
- `create` — 생성
- `update` — 수정
- `cancel` — 취소 (원칙 6)
- `approve` — 승인
- `reject` — 반려
- `post` — 확정 (회계 분개 등 하류 영향 발생)
- `unpost` — 확정 취소 (역분개)

**금지 액션**:
- `delete` — 취소(cancel) / 역처리(unpost) 로 대체
- 특별한 경우만 `hardDelete` (테스트 데이터 정리 용도)

---

## 파일 네이밍

| 종류 | 패턴 | 예시 |
|---|---|---|
| 라우터 | `<domain>.router.ts` | `purchase.router.ts` |
| 서비스 | `<domain>.service.ts` | `purchase.service.ts` |
| DB 접근 | `<domain>.repo.ts` | `purchase.repo.ts` |
| Zod 스키마 | `<domain>.schema.ts` | `purchase.schema.ts` |
| 타입 | `<domain>.types.ts` | `purchase.types.ts` |
| 테스트 | `<domain>.test.ts` | `purchase.test.ts` |
| DDL 마이그레이션 | `<YYYYMMDD>_<설명>.sql` | `20260421_add_tax_rate.sql` |

---

## 상태 enum

거래/문서의 상태값은 모든 도메인에서 **동일한 어휘** 사용:

| 상태 | 의미 |
|---|---|
| `draft` | 작성 중 |
| `submitted` | 제출 (승인 대기) |
| `approved` | 승인 완료 (확정) |
| `posted` | 회계 분개 완료 |
| `rejected` | 반려 |
| `cancelled` | 취소 |
| `completed` | 완료 (생산/출하 등) |

**DB 에는 enum 또는 CHECK 제약**으로 고정. 문자열 자유 입력 금지.

---

## 폴더/파일 이름

- **kebab-case** — 폴더 (`core-erp`, `industry/food`)
- **camelCase** — TS 파일 변수/함수 (`createPurchase`, `tenantId`)
- **PascalCase** — React 컴포넌트 파일 (`BatchDetail.tsx`)
- **snake_case** — DB 컬럼 (`transaction_date`, `tenant_id`)

---

## 도메인 이벤트 이름

```
<domain>.<action>.<result>
```

예시:
- `purchase.created`
- `purchase.posted`
- `production.completed`
- `lot.created`
- `inventory.adjusted`
- `accounting.posted`

→ `03-event-catalog.md` 참조
