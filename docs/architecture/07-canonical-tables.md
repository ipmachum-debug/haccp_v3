# 07. Canonical Tables — 같은 개념을 두 테이블이 들고 있는 부채 청산 정책

> **2026-05-08 신설** — 반복되는 "같은 개념을 다른 테이블이 바라봐서 NULL 나는" 사고의 구조적 처방.

---

## 왜 이 문서가 필요한가

이 코드베이스는 자라면서 **같은 개념의 테이블을 두 개씩 만들었음**:

| 개념 | 옛 테이블 | 새 테이블 (canonical) | 미스매치 사고 |
|---|---|---|---|
| 제품 | `h_products_v2` | `item_master` (own_product) | PR #260, PR #266 |
| 원자재 | `h_materials` | `item_master` (raw_material) | BOM tree 빈 칸 |
| 계정과목 | `accounting_categories`, `accounting_accounts_v2` | `accounting_accounts` | P5-1 매핑 버그 |
| 직원 | `users` | `h_employees` | resolveEmployeeId 헬퍼 필요 |
| 회계 거래 | `accounting_transactions` | `expense_journal_entries/lines` | (deprecated 처리됨) |

**공통 패턴**:
1. 새 테이블 도입 → 옛 테이블도 살아 있음 (backward-compat)
2. canonical 이 어느 쪽인지 **명시 안 됨**
3. 신규 등록 흐름이 두 테이블에 sync 되지 않음 (한쪽만 INSERT)
4. 라우터마다 작성자 취향대로 한쪽만 JOIN → 매칭 실패 시 NULL / row drop

→ 6개월에 한 번씩 다른 도메인에서 같은 종류의 버그가 또 터짐.

---

## 정책

### 1. Canonical 명시 — 이 테이블이 진실의 원천이다

| 도메인 | Canonical | Deprecated (단계별 제거 대상) |
|---|---|---|
| 제품 / 원자재 / 부재료 | **`item_master`** | `h_products_v2`, `h_materials`, `h_products` |
| 계정과목 | **`accounting_accounts`** | `accounting_accounts_v2`, `accounting_categories` |
| 직원 (HR) | **`h_employees`** (인사 도메인) + `users` (인증 도메인) | 양쪽 살림 — `resolveEmployeeId()` 사용 |
| 회계 분개 | **`expense_journal_entries` / `expense_journal_lines`** | `accounting_transactions` |

### 2. 신규 등록 흐름은 단일 진입점

신규 제품 등록은 **반드시 `item_master` 에 먼저 INSERT** → 옛 테이블 sync 는 트랜잭션 안에서 자동.

```typescript
// ✅ 올바른 흐름
async function createProduct(input) {
  return db.transaction(async (tx) => {
    const itemId = await tx.insert(itemMaster).values({...}).$returningId();
    // 옛 테이블 sync (Strangler Fig 기간 동안만)
    await tx.insert(hProductsV2).values({ id: itemId, ... });
    return itemId;
  });
}

// ❌ 금지
await db.insert(hProductsV2).values({...}); // canonical 누락
```

### 3. 조회는 듀얼 lookup + COALESCE — Strangler Fig 기간 동안만

옛 테이블 제거 전까지는 양쪽 다 LEFT JOIN, COALESCE 로 표시:

```sql
-- ✅ Strangler Fig 표준 패턴 (PR #266 도입)
SELECT
  b.id,
  COALESCE(p.product_name, im.item_name) AS product_name,
  COALESCE(p.product_code, im.item_code) AS product_code
FROM h_batches b
LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
LEFT JOIN item_master im ON im.id = b.product_id AND im.tenant_id = b.tenant_id
WHERE b.tenant_id = ?

-- ❌ INNER JOIN 절대 금지 — 한쪽 미등록 시 row 자체가 드랍됨
INNER JOIN h_products_v2 p ON p.id = b.product_id
```

**INNER JOIN 금지 이유**: 신규 제품이 `item_master` 에만 등록된 경우, INNER JOIN 으로 묶인 옛 테이블 라우터에서는 **해당 배치 자체가 검색에서 사라짐** (silent failure, 화면 빈 칸).

### 4. 정합성 cron — 매일 자동 감시

`scripts/check-table-drift.ts` 가 매일 새벽 1회 실행되어 다음을 카운트:

- `item_master` 에는 있는데 `h_products_v2` 에는 없는 product_id 수
- 이름이 다른 row 수
- code 가 다른 row 수

임계치 초과 시 알림 (slack / log).

---

## Strangler Fig — 옛 테이블 제거 로드맵

분기 단위로 1개씩 제거. 각 단계는 **별도 PR**:

```
[1단계] 신규 등록 흐름 단일 진입점화 (createProduct → item_master only)
[2단계] 모든 라우터 듀얼 lookup + COALESCE 적용 (PR #266 부분 완료)
[3단계] 옛 테이블에 INSERT/UPDATE 트리거로 감시 (의도치 않은 직접 INSERT 차단)
[4단계] 옛 테이블 read-only 마킹 (DB 권한 + 코드 주석)
[5단계] 라우터에서 옛 테이블 JOIN 제거 (item_master 단독 lookup)
[6단계] 옛 테이블 DROP — Strangler Fig 완성
```

**각 단계 사이 최소 1주 운영 관찰** — drift cron 알림 0건 확인 후 다음 단계.

---

## 신규 테이블 추가 시 체크리스트

- [ ] 같은 개념의 기존 테이블이 있는가? → 있다면 **새 테이블 만들지 말고 기존 확장**
- [ ] 정말 새 테이블이 필요하면, **기존 테이블을 즉시 deprecated 마킹** + 이 문서 업데이트
- [ ] Strangler Fig 6단계 로드맵을 PR 본문에 명시
- [ ] `scripts/check-table-drift.ts` 에 새 페어 추가
- [ ] 신규 등록 라우터는 canonical 단일 INSERT (트랜잭션 sync 가능)

---

## 관련

- ADR-001 shared-kernel
- `scripts/check-product-name-consistency.ts` — 기존 1회성 점검 (+상세 출력)
- `scripts/check-table-drift.ts` — cron 친화 일일 요약 (PR #267)
- PR #266 — 듀얼 lookup + COALESCE 패턴 도입
