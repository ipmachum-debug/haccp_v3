# 05. 데이터 임포트 / 마이그레이션 작성 가이드

> 최종 업데이트: 2026-04-25 (PR #60~#63 의 LOT 정합성 사고 후속)

## 배경 — 2026-04-25 사고

운영DB(tenant 2) 에 **82건의 LOT.product_id 가 batch.product_id 와 불일치** 하는 historical bug 발견. 옵션 A 일괄 UPDATE 로 정정 완료. 원인은 **임포트/마이그레이션 스크립트들의 ID 체계 혼용**.

| 스크립트 | 문제 |
|---------|------|
| `scripts/import_production_0320_0403.py` | `h_products` (v1 구 테이블) INSERT + `next_product_id = 43` hardcoded 가정 |
| `server/db/system/simplifiedDataProcessor.ts` (수정 전) | `h_item_master` 사용 — `h_products_v2` 와 ID 체계 불일치 |
| `scripts/migrate-products-v1-to-v2.ts` | batch + lot 둘 다 변환하지만, 그 후 임포트 스크립트가 다시 v1 ID 로 새 LOT 생성하면 미스매치 재발 |

## 진실 source 정리

| 도메인 | 진실 테이블 | ID 사용처 |
|--------|-------------|-----------|
| 제품 | `h_products_v2` | `h_batches.product_id`, `h_inventory_lots.product_id`, `h_product_outbound.product_id`, `accounting_sales.product_id` |
| 원재료 | `h_materials` | `h_inventory_lots.material_id` (원재료 LOT), `h_batch_inputs.material_id`, `accounting_purchases.material_id` |
| 동기화 사이드 인덱스 | `h_item_master` | `legacy_product_id` ↔ `h_products_v2.id`, `legacy_material_id` ↔ `h_materials.id` |

**규칙**: 새 LOT/Batch INSERT 시 `product_id` / `material_id` 는 항상 진실 테이블 (`h_products_v2`, `h_materials`) 의 ID 만 사용. `item_master.id` 직접 사용 금지.

## 작성 가이드 (필수)

### ✅ 올바른 패턴

```python
# 이름 → h_products_v2.id 매핑을 DB 조회로 빌드
def build_product_map(conn, tenant_id):
    rows = conn.execute(
        "SELECT id, product_name FROM h_products_v2 WHERE tenant_id = %s AND is_active = 1",
        (tenant_id,),
    ).fetchall()
    return {r["product_name"]: r["id"] for r in rows}

# 신규 제품은 INSERT 후 lastInsertId 받기
def ensure_product(conn, tenant_id, name):
    row = conn.execute(
        "SELECT id FROM h_products_v2 WHERE tenant_id = %s AND product_name = %s LIMIT 1",
        (tenant_id, name),
    ).fetchone()
    if row:
        return row["id"]
    cursor = conn.execute(
        "INSERT INTO h_products_v2 (tenant_id, product_code, product_name, unit, is_active) "
        "VALUES (%s, %s, %s, 'kg', 1)",
        (tenant_id, f"P-{int(time.time())}", name),
    )
    return cursor.lastrowid  # ← 실제 auto_increment 값

# batch 와 lot 의 product_id 는 반드시 같은 source
batch_id = insert_batch(conn, tenant_id, product_id=product_id, ...)
lot_id   = insert_lot(conn, tenant_id, batch_id=batch_id, product_id=product_id, ...)
```

### ❌ 금지 패턴

```python
# 1. hardcoded ID 가정 (auto_increment 값 예측 금지)
next_product_id = 43  # ❌
PRODUCT_MAP[name] = next_product_id

# 2. 구 테이블 (v1) INSERT
INSERT INTO h_products (...) VALUES (...)  # ❌ v1 사용 금지, h_products_v2 사용

# 3. h_item_master 의 id 를 batch/lot 에 직접 사용
INSERT INTO h_inventory_lots (product_id, ...)
SELECT id FROM h_item_master WHERE ...  # ❌ legacy_product_id 매핑 거쳐야 함

# 4. batch 와 lot 의 product_id source 가 다름
batch.product_id = lookup_v2(name)
lot.product_id = item_master_id      # ❌ 미스매치
```

## 임포트 후 필수 검증

```bash
# 정합성 검증 스크립트 (PR #63 추가)
npx tsx scripts/check-lot-product-mismatch.ts --tenant <id>
```

→ 0건이 정상. 1건 이상이면 임포트 스크립트 검토 후 재실행.

## 일회성 스크립트 마킹

이미 운영DB 에 반영된 일회성 임포트는 **재실행 금지**. 파일 상단에 `⚠️ DEPRECATED` 헤더 추가하고 사고 원인 + 가이드 링크 명시.

기존 deprecated 마킹된 스크립트:
- `scripts/import_production_0320_0403.py`

## 멱등성 (Idempotency)

새 임포트 스크립트는 멱등 보장 필수:
- 같은 입력 데이터 재실행 시 중복 INSERT 안 되도록
- 일반적으로 `(tenant_id, transaction_date, item_name, quantity, source_type='*_import')` 같은 고유 키로 사전 중복 체크
- 또는 `INSERT IGNORE` / `ON DUPLICATE KEY UPDATE` 활용

## 관련 PR

- PR #60: `ensureBatchLots` 헬퍼 + `updateBatchStatus` LOT 자동 생성 (재발 방지)
- PR #63: 본 가이드 + simplifiedDataProcessor 수정 + 검증 스크립트
