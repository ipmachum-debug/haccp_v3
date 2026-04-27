# 원재료 파이프라인 수정 종합 정리 (2026-04-26 ~ 04-27)

> 다른 에이전트/개발자가 이 영역을 이어받기 위한 **단일 진입 문서**.
> 관련 아키텍처 문서: [06-material-pipeline.md](./06-material-pipeline.md) (H1~H9 material_id 분석)

---

## 0. TL;DR (한 줄 요약)

배치 생산 → LOT 자동 차감 → 재고 트랜잭션 → 일별 소모 화면까지의 파이프라인에서 **`material_id` 기준 불일치, NULL 표시, 잘못된 날짜/source_type, 그리고 자동출고 raw notes 노출** 등 6개 결함을 PR #71~#81 로 순차 수정. **현재 화면은 정확한 원재료명·수량·일자를 표시하며, 재고미등록 케이스는 amber 뱃지로 명시.**

---

## 1. 영향 받는 핵심 테이블·기능

### 1.1 데이터 모델 (MySQL)

| 테이블 | 역할 | 주요 컬럼 |
|---|---|---|
| `h_materials` | **신** 원재료 마스터 (HACCP 도메인) | `id`, `material_name`, `unit`, `tenant_id` |
| `item_master` | **레거시** 품목 마스터 (구매·매출 통합) | `id`, `item_name`, `is_active`, `tenant_id` |
| `h_inventory` | 원재료 재고 마스터 | `material_id`, `total_quantity`, `available_quantity`, `tenant_id` |
| `h_inventory_lots` | LOT 단위 입고 이력 | `id`, `material_id`, `lot_number`, `available_quantity`, `expiry_date`, `product_id` |
| `h_inventory_transactions` | 입출고 트랜잭션 원장 | `id`, `lot_id`, `inventory_id`, `transaction_type`, `quantity`, `source_type`, `source_id`, `source_line_id`, `transaction_date`, `notes`, `tenant_id` |
| `h_batches` | 배치 헤더 | `id`, `batch_code`, `product_id`, `start_time`, `status`, `tenant_id` |
| `h_batch_inputs` | 배치별 원재료 투입 라인 | `id`, `batch_id`, `material_id`, `planned_quantity`, `actual_quantity`, `inventory_deducted`, `unit_price`, `total_price` |

### 1.2 핵심 비즈니스 흐름

```
  ┌──────────────┐    배치 완료    ┌──────────────────────┐
  │ h_batches    │ ──────────────> │ autoMaterialIssue.ts │
  │ (in_progress │                 │  (자동출고 처리)     │
  │  /completed) │                 └──────────┬───────────┘
  └──────────────┘                            │
                                              ▼
                              ┌───────────────────────────────┐
                              │ FIFO 로 h_inventory_lots 차감 │
                              │  + h_inventory_transactions   │
                              │    (transaction_type=usage)   │
                              └───────────────┬───────────────┘
                                              │
                       ┌──────────────────────┴──────────────────────┐
                       │ LOT 매칭 성공                LOT 매칭 실패    │
                       ▼                                              ▼
            lot_id=<실제>                                lot_id=0
            inventory_id=<실제>                          inventory_id=NULL
            notes="배치 N 투입"                          notes="원재료 #<ID> 자동출고 (재고미등록)"
                       │                                              │
                       └──────────────────────┬──────────────────────┘
                                              │
                                              ▼
                              ┌───────────────────────────────┐
                              │ getConsumptionSummary()       │
                              │   (월간 일별 소모 화면)       │
                              │   = 화면: ReleaseTab.tsx      │
                              └───────────────────────────────┘
```

### 1.3 영향 받는 화면·파일

| 영역 | 파일 | 역할 |
|---|---|---|
| **자동출고 로직** | `server/lib/production/autoMaterialIssue.ts` | 배치 완료 시 FIFO LOT 차감 + 트랜잭션 기록 |
| **출고 SQL** | `server/db/production/outboundManagement.ts` | `getConsumptionSummary` (월간), `getOutboundHistory` (이력) |
| **구매 입고** | `server/db/purchase/purchasePost.ts` | 입고 시 `h_inventory` 마스터 UPSERT |
| **재고 함수** | `server/db/inventory/inventoryFunctions.ts` | 재고 조회·LOT 추적 |
| **일별 소모 화면** | `client/src/pages/inventory/_inventoryManagement/ReleaseTab.tsx` | 일자→원재료→세부 행 3단 트리 표시 |
| **재고 메인** | `client/src/pages/inventory/InventoryManagement*.tsx` | 탭 컨테이너 |

---

## 2. 시간순 PR 정리 (2026-04-26 ~ 04-27)

| PR | 코드 | 머지 | 제목 | 핵심 변경 |
|----|------|------|------|----------|
| #71 | docs | 04-26 14:07 | architecture/06-material-pipeline.md | H1~H9 material_id 분석 문서화 |
| #72 | K2 | 04-26 14:57 | h_inventory 마스터 동시 UPSERT | 입고 시 마스터 누락 → `h_inventory` 자동 생성 |
| #73 | K1 | 04-26 15:17 | item_master 폴백 LEFT JOIN | `material_name/unit_price` NULL 해결 |
| #74 | K3 | 04-26 16:02 | canonical PK 통일 후속 코드 정리 | `h_materials.id` 일원화 후속 정리 |
| #76 | W3 | 04-26 18:35 | **재고 트랜잭션 정합성 종합 정정** | `transaction_date` + `source_type` 일관성 |
| #77 | W5 | 04-26 19:01 | **재고미등록 NULL 원재료명 수정** | `lot_id=0` fallback (`bi → h_materials`) |
| #78 | W6 | 04-26 20:31 | **orphan 트랜잭션 item_master fallback** | "알수없음" 116건 → 0건 |
| #81 | W7 | 04-27 14:30 | **자동출고 raw notes 표시 정제** | `원재료 #147 자동출고 (재고미등록)` 노출 제거 |

### 2.1 PR-K1 (#73) — `autoMaterialIssue.ts` item_master 폴백

**문제**: 자동출고 시 `h_materials` 에서 매칭 실패한 일부 자재(레거시 `item_master.id` 만 가진 것들)가 `material_name=NULL`, `unit_price=NULL` 로 트랜잭션에 기록.

**수정**: `autoMaterialIssue.ts` 에 `LEFT JOIN item_master` 추가하여 폴백 매칭. notes 에는 `"원재료 #<ID> 자동출고 (재고미등록)"` 형태로 ID 기록 (W6 의 사후 추적용).

### 2.2 PR-K2 (#72) — 입고 시 `h_inventory` 마스터 UPSERT

**문제**: 입고 트랜잭션은 들어와도 `h_inventory` 마스터 레코드가 없어 재고 차감 시 `"재고가 존재하지 않습니다"` 에러.

**수정**: `purchasePost.ts` 의 입고 처리에 `h_inventory` 동시 UPSERT 추가.

### 2.3 PR-W3 (#76) — 재고 트랜잭션 정합성 종합 정정

**문제**:
1. `transaction_date` 가 NULL 이거나 UTC 기준이라 한국 시간 기준 일별 그룹핑 어긋남
2. `source_type` 이 `'BATCH'`, `'batch_completion'`, `'자공출고'` 등 혼재

**수정**:
- 모든 사용 시점에 `transaction_date = COALESCE(transaction_date, created_at)` 적용
- `source_type` 정규화 (`BATCH` / `batch_completion` 둘 다 인정)
- KST 변환: `DATE(CONVERT_TZ(..., '+00:00', '+09:00'))`

### 2.4 PR-W5 (#77) — 재고미등록 트랜잭션 원재료명 NULL 수정

**문제**: `autoMaterialIssue` 가 LOT 매칭 실패 시 `lot_id=0 + inventory_id=NULL` 로 기록 → `h_inventory_lots`/`h_inventory` 두 LEFT JOIN 모두 실패 → `materialName=NULL`.

**수정**: `getConsumptionSummary` 의 SQL 에 3차 fallback 추가:
```sql
LEFT JOIN h_batch_inputs bi
  ON bi.id = t.source_line_id
 AND bi.batch_id = t.source_id
 AND bi.tenant_id = t.tenant_id
 AND t.source_type IN ('BATCH','batch_completion')
LEFT JOIN h_materials m3 ON m3.id = bi.material_id

-- 최종 머지
COALESCE(m1.material_name, m2.material_name, m3.material_name) AS materialName
```

### 2.5 PR-W6 (#78) — orphan 트랜잭션 item_master fallback

**문제**: `h_batch_inputs` row 가 없는 트랜잭션 (orphan, 116건) 은 m3 마저 NULL → 화면에 "알수없음" 표시.

**원인**: `autoMaterialIssue` 의 일부 경로가 `bi` row 생성 전에 트랜잭션을 먼저 기록하거나, 마이그레이션 중 데이터 손실로 `bi` 가 사라짐. notes 에는 `"원재료 #198 자동출고 (재고미등록)"` 형태로 **레거시 `item_master.id`** 가 보존됨.

**수정**: 4차 fallback 추가:
```sql
LEFT JOIN item_master im
  ON im.tenant_id = t.tenant_id
 AND im.is_active = 1
 AND t.notes LIKE '원재료 #%자동출고%'
 AND im.id = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(t.notes, '#', -1), ' ', 1) AS UNSIGNED)

-- 최종 4단 fallback
COALESCE(m1.material_name, m2.material_name, m3.material_name, im.item_name) AS materialName
COALESCE(m1.id,            m2.id,            m3.id,            im.id)         AS materialId
```

**효과**: 4/17 데이터 기준 "알수없음" 116건 → **0건**.

### 2.6 PR-W7 (#81) — 자동출고 raw notes 표시 정제

**문제**: 일별 소모 상세를 펼치면 세부 행에 `"원재료 #147 자동출고 (재고미등록)"` 같은 **내부 ID 텍스트**가 그대로 노출. 사용자에겐 무의미한 정보.

**원인**: `getConsumptionSummary` 가 `t.notes` 를 그대로 클라이언트로 전달 + `ReleaseTab.tsx` 가 `{item.notes}` 로 출력.

**수정**:
- **백엔드**: SQL 단에서 `'원재료 #%자동출고%'` 패턴이면 `notes=NULL` 로 정제
- **백엔드**: `isLotMissing` 플래그 신설 (lot_id=0 + notes 에 '재고미등록')
- **프론트**: LOT 번호 없고 `isLotMissing=true` 면 amber `재고미등록` 뱃지 표시

**효과**:
```
Before:  [배치#580]  원재료 #147 자동출고 (재고미등록)   3.5 kg
After:   [배치#580]  [재고미등록]                        3.5 kg
```
+ 그룹 헤더에 `기타가공품(흑임자가루)` 정확히 표시됨

---

## 3. 4단 fallback (현재 운영 중인 final state)

`getConsumptionSummary` SQL 의 원재료명 매칭 우선순위:

| 우선순위 | 출처 | 조건 |
|---|---|---|
| **m1** | `h_inventory_lots.material_id → h_materials` | 정상 LOT 매칭 |
| **m2** | `h_inventory.material_id → h_materials` | LOT 없지만 inventory 있음 |
| **m3** | `h_batch_inputs.material_id → h_materials` (PR-W5) | 둘 다 없을 때 batch_inputs fallback |
| **im** | `item_master.id` (notes 파싱, PR-W6) | orphan (bi row 없음) → 레거시 ID |

추가로 PR-W7 에서:
- `notes` raw 텍스트가 자동출고 패턴이면 NULL 정제
- `isLotMissing` 플래그 (UI 뱃지 표시용)

---

## 4. 검증 스크립트 (이어받을 때 실행)

서버 `/root/haccp_v3/scripts/` 에 진단 스크립트 있음:

| 스크립트 | 목적 |
|---|---|
| `_w7-diag-april17.ts` | 4/17 데이터 기준 4단 fallback 매칭 분포 확인 |
| `_w7-verify-fix.ts` | PR-W7 수정 후 notes 정제 + isLotMissing 플래그 검증 |
| `_w6-find-orphan-ids.ts` | orphan 트랜잭션 ID 목록 (item_master 매칭 대상) |
| `_w6-verify-fix.ts` | PR-W6 수정 후 "알수없음" 카운트 |
| `_w5-diag-screen-rows.ts` | 화면에 표시되는 row 단위 매칭 디버그 |

실행:
```bash
ssh root@49.50.130.101 -p 2222
cd /root/haccp_v3
npx tsx scripts/_w7-verify-fix.ts
```

---

## 5. 알려진 미해결 / 후속 과제

### 5.1 근본 원인 — 왜 `lot_id=0` 자동출고가 계속 발생하나

`autoMaterialIssue.ts` 가 LOT 매칭 실패 시 (= 입고 LOT 부족 / 입고 누락 / 마이그레이션 시점 데이터 결손) `lot_id=0` 으로 트랜잭션 기록 후 진행. 화면에는 W5~W7 로 깔끔히 보이지만 **데이터 정합성 면에서는 "장부에는 출고됐는데 LOT 가 없다"** 는 상태가 누적됨.

**TODO (별도 PR)**:
- 입고 LOT 자동 생성 로직 강화 (구매 입고가 누락된 경우 자동 보충 LOT 생성 옵션)
- 또는 명시적인 "재고 조정" 화면에서 사용자가 lot_id=0 트랜잭션을 검토·LOT 매칭 처리하도록 UI 추가
- 진단 대시보드: 일별 lot_id=0 발생 건수·금액 모니터링

### 5.2 `notes` 파싱 의존 (PR-W6)

W6 의 item_master fallback 은 **notes 의 문자열 파싱**에 의존하므로 `autoMaterialIssue` 가 notes 포맷을 바꾸면 깨짐.

**TODO**:
- `h_inventory_transactions` 에 `material_id` 직접 컬럼 추가 (현재는 lot/inventory 통해 간접 추적)
- 마이그레이션: 기존 데이터에 W5/W6 의 fallback 로직으로 `material_id` 백필

### 5.3 모든 fallback 매칭 비율 추적

**TODO**: `getConsumptionSummary` 응답에 `matchSource: 'm1'|'m2'|'m3'|'im'` 디버그 필드 추가 → 운영 대시보드에서 fallback 의존도 시각화.

---

## 6. 배포 인프라 (참고)

PR-D1 (#79, #80) 으로 **GitHub Release 자산 기반 배포**로 전환 (서버 OOM 근본 해결):

```
PR 머지 → main push → auto-release.yml → v0.X.Y 릴리스 자동 생성
                  → release.published → deploy.yml 빌드 + tar.gz 업로드
                  → POST /api/system/deploy → deploy.sh
                  → git sync + 자산 다운로드 + atomic dist swap + pm2 reload
```

자세히는 `docs/deploy-flow.md` 참조.

---

## 7. 다른 에이전트가 이어받을 때 체크리스트

- [ ] 이 문서 + `06-material-pipeline.md` 읽기
- [ ] `scripts/_w7-verify-fix.ts` 실행해 현재 상태 확인 (모두 ✅ 나와야 정상)
- [ ] `getConsumptionSummary` SQL (`server/db/production/outboundManagement.ts:343~422`) 의 4단 COALESCE 구조 이해
- [ ] `ReleaseTab.tsx` (line 408 그룹 헤더, line 419~445 세부 행) 의 표시 로직 확인
- [ ] 새 화면 만들 때 **반드시 4단 fallback + isLotMissing 동일하게 적용** (재고 트랜잭션을 직접 SELECT 하면 안 됨)
- [ ] 후속 작업은 §5 의 TODO 에서 우선순위 결정

---

**작성일**: 2026-04-27
**최종 PR**: #81 (PR-W7) — d5e8a9d
**작성자**: ipmachum-debug (Genspark agent)
