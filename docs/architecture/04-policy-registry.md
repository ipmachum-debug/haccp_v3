# 04. 정책 레지스트리

> 권한 / 과금 / 패키지 / 승인 규칙을 **if 문이 아니라 데이터** 로 관리.

---

## 핵심 원칙

```
기능 추가 = 정책 데이터 추가
기능 제거 = 정책 데이터 비활성화
```

**절대 금지**:
```typescript
if (tenant.plan === 'starter') { ... }           // ❌ 하드코딩
if (user.role === 'admin') { ... }               // ❌ 하드코딩
if (feature === 'accounting' && role === ...) { } // ❌ 하드코딩
```

**권장**:
```typescript
if (await hasCapability(userId, 'ERP_PURCHASE', 'WRITE')) { ... }
```

---

## 정책의 5종류

### 1. Feature Policy (기능 노출)

**소유**: `server/platform/feature-flag/`
**데이터**: `platform_features`, `plan_features`

| 컬럼 | 설명 |
|---|---|
| code | `ERP_PURCHASE`, `MES_WORK_ORDER`, `HACCP_CCP` |
| layer | `platform / core-erp / core-mes / industry / addon` |
| industry_pack | `null` or `food / cosmetic / ...` |

**사용**:
```typescript
const isVisible = await featurePolicy.isEnabled(tenantId, 'ERP_PURCHASE');
```

---

### 2. Capability Policy (행동 권한)

**소유**: `server/platform/permission/`
**데이터**: `capabilities`, `feature_capabilities`, `role_capabilities`, `user_roles`

**표준 capability 6종**:
- `READ` — 조회
- `WRITE` — 생성/수정
- `APPROVE` — 승인
- `CANCEL` — 취소
- `POST` — 확정 (분개 등 하류 영향)
- `EXPORT` — 다운로드 (Excel/PDF)

**사용**:
```typescript
await hasCapability(userId, 'ERP_PURCHASE', 'APPROVE');
```

---

### 3. Package Policy (과금 매핑)

**소유**: `server/platform/billing/`
**데이터**: `plans`, `plan_features`, `tenant_subscriptions`, `tenant_feature_overrides`

**override 테이블 필수**: 영업 할인 / 체험 / 프로모 대응:
```sql
tenant_feature_overrides (
  tenant_id,
  feature_code,
  enabled_from,
  enabled_until,
  price_override,
  reason                -- '2026-04 프로모', '영업 협의 (CS #123)'
)
```

**판단 순서**:
1. `tenant_feature_overrides` 에 활성 엔트리 있으면 그것 우선
2. 없으면 `tenant_subscriptions.plan_id` → `plan_features` 참조
3. 둘 다 없으면 비활성화

---

### 4. Posting Policy (회계 분개 정책)

**소유**: `server/core-erp/accounting/`
**현재 구현**: `server/db/journalHelper.ts` → `resolveSystemAccount`, `postExpenseVoucher`

**표준 분개 시점 (이벤트 기반으로 이주 예정)**:
| 이벤트 | 분개 |
|---|---|
| `purchase.posted` | 차: 원재료 + 부가세대급금 / 대: 외상매입금 |
| `sales.posted` | 차: 외상매출금 / 대: 매출 + 부가세예수금, 그리고 차: 매출원가 / 대: 재고 |
| `production.completed` | 차: 제품재고 / 대: 원재료 + 노무비 + 제조경비 |
| `bank.matched` | 차: 보통예금 / 대: 매칭 계정 (입금), 반대 (출금) |

**금지**:
- 라우터 안에 직접 분개 INSERT → `postingPolicy.post(eventType, payload)` 로 집중

---

### 5. Approval Policy (승인 워크플로우)

**소유**: `server/platform/workflow/`
**데이터**: `approval_workflows`, `approval_steps`, `approvals`

**정책 예시**:
- 5천만원 이상 매입: `사장 승인 필수`
- 급여 전표: `인사팀장 → 대표 2단계`
- 비용 전표 (일반): `승인 불필요`

**사용**:
```typescript
const workflow = await approvalPolicy.resolve(tenantId, 'purchase', amount);
// workflow 가 null 이면 자동 승인
// workflow 가 있으면 approvals 테이블에 등록 후 알림 발송
```

---

## 정책 조합 예시

"사용자 X 가 매입 전표를 승인할 수 있는가?"

```typescript
async function canApprovePurchase(userId: number, purchaseId: number) {
  const user = await getUser(userId);
  const purchase = await getPurchase(purchaseId, user.tenantId);

  // 1. Feature Policy — 매입 기능 자체가 켜져 있는가
  if (!await featurePolicy.isEnabled(user.tenantId, 'ERP_PURCHASE')) {
    return { ok: false, reason: 'feature-disabled' };
  }

  // 2. Capability Policy — 승인 권한 있는가
  if (!await hasCapability(userId, 'ERP_PURCHASE', 'APPROVE')) {
    return { ok: false, reason: 'no-permission' };
  }

  // 3. Approval Policy — 금액 한도 초과면 상위 결재 필요
  const workflow = await approvalPolicy.resolve(user.tenantId, 'purchase', purchase.amount);
  if (workflow && !workflow.isApproverForAmount(userId, purchase.amount)) {
    return { ok: false, reason: 'needs-higher-approval' };
  }

  return { ok: true };
}
```

---

## 성능 고려

**Capability 체크는 매 요청마다 실행** → 캐싱 필수.

**전략**:
- 로그인 시 `user.capabilities = [...]` 계산 후 JWT claims 에 포함
- 플랜/롤 변경 시 `capabilities_version` 증가 → JWT 재발급 유도
- 캐시 TTL 15분 (override 긴급 회수 고려)

**안티 패턴**:
```typescript
// ❌ 매 요청마다 5-way JOIN
SELECT * FROM tenant_subscriptions
  JOIN plan_features ... JOIN role_capabilities ...
```

```typescript
// ✅ JWT claims 에서 직접 읽음
const caps = ctx.user.capabilities; // Set<string>
if (!caps.has('ERP_PURCHASE:APPROVE')) throw new TRPCError(...);
```

---

## 정책 변경 감사

모든 정책 변경은 `audit_log` 에 기록:
- 누가 변경했는가 (`changed_by`)
- 언제 (`changed_at`)
- 무엇이 바뀌었는가 (`before_value`, `after_value`)

정책은 매출/보안과 직결되므로 감사 추적 불가능하면 **엔터프라이즈 판매 불가**.
