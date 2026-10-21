# LOT ↔ 재고 묶음 연결 정리 — 운영 절차 (2026-10-21)

다른 원료의 재고 묶음(`h_inventory`)에 연결된 원료 LOT 을 **같은 원료 묶음으로 연결만** 옮긴다.
코드: `scripts/_lib/lotRelink.ts` (분류·적용·되돌리기), 명령줄: `scripts/lot-inventory-relink.ts`.

> 이 문서는 절차다. **실행 승인이 아니다.** 운영에서는 미리보기까지만 하고, 적용은 대표 승인 뒤 승인된 LOT 만.
> 미리보기·백업 파일에는 LOT·원료 번호가 들어 있다 — 비공개 폴더에만 둔다 (이 저장소·PR 에 올리지 않는다).

## 왜

- 재고 집계 공식(`recomputeAggregateFromLots`)은 LOT 의 **원료번호**로 더한다 → 연결이 틀려도 집계 숫자는 같다.
- 출고 LOT 고르기(`allocateLotsFEFO`)의 첫 조회는 **연결(inventory_id)** 로 찾는다 → 자기 원료 LOT 이 다른 묶음에 연결돼 있으면,
  재고가 충분할 때 유통기한이 더 빠른 그 LOT 을 건너뛴다 (수량이 아니라 순서·추적 문제).

## 무엇을 하고 무엇을 하지 않는가

| 하는 것 | 하지 않는 것 |
|---|---|
| 승인된 LOT 의 `h_inventory_lots.inventory_id` 를 같은 회사·같은 원료 묶음으로 (수정시각 `updated_at` 은 DB 가 자동 갱신 — 도구가 쓰는 값 아님) | LOT 수량·가용·현재수량·상태 변경 |
| 적용 전 대상 LOT 행 전체를 백업 파일로 | 거래(`h_inventory_transactions`, 그 `inventory_id` 포함) 변경 |
| LOT 을 잠근 뒤 다시 분류해 미리보기와 같을 때만 (조건부 UPDATE) | 재고 집계(`h_inventory`) 재계산·보정 |
| 되돌리기: 지금 연결이 이 도구가 바꾼 값일 때만 원래 연결로 | 연결이 빈(NULL/0) LOT — 출고 때 앱이 같은 원료 묶음으로 채운다 |

## 분류

| 분류 | 뜻 | 이 도구로 |
|---|---|---|
| `READY` | 같은 원료 묶음 1개, 단위 같음, LOT 거래가 있고 모두 같은 원료·단위 | 승인 시 적용 |
| `HOLD_DEST_NONE` / `HOLD_DEST_MULTI` | 같은 원료 묶음이 없음 / 2개 이상 | 보류 |
| `HOLD_UNIT` | 목적지 단위 ≠ LOT 단위 | 보류 |
| `HOLD_NO_TX` | LOT 거래 없음 — 원료번호만 보고 옮기지 않음 (초기재고·이관 근거 확인) | 보류 |
| `HOLD_TX_MATERIAL` | 거래 원료번호가 LOT 과 다름 (입고·취소·병합·번호 이력 확인) | 보류 |
| `HOLD_TX_MATERIAL_NULL` | 원료번호가 빈 거래 있음 (예전 기록) | 보류 |
| `HOLD_TX_UNIT` | 거래 단위가 LOT 과 다름 | 보류 |
| `REPORT_PARENT_MISSING` / `REPORT_PARENT_OTHER_TENANT` | 묶음이 없음 / 다른 회사 묶음 | 보고만 |

## 순서

1. **미리보기** (쓰기 없음): `npx tsx scripts/lot-inventory-relink.ts --tenant=<회사> --json=<비공개>/relink-preview.json`
   - 분류별 건수와 READY 지문이 나온다. 보호 범위(별도 승인 대상 LOT)와 겹치는 LOT 은 승인 목록에서 뺀다.
2. **승인표**: READY 중 적용할 LOT id 목록 + 미리보기 파일 + 지문을 대표에게.
3. **적용** (승인 뒤): `--plan=<미리보기 파일> --only=<승인 LOT id,…> --apply --backup=<새 백업 파일>`
   - 미리보기 파일이 바뀌었거나(지문 불일치), 승인 목록에 READY 가 아닌 LOT 이 있으면 **아무것도 하지 않고 중단**.
   - LOT 마다: 잠금 → 다시 분류 → 지금 연결·목적지가 미리보기와 같고 여전히 READY 일 때만 변경. 아니면 건너뜀(이유 출력).
   - 적용 직전에 미리보기를 다시 뽑는 것을 권장 (그 사이 출고·입고가 있었을 수 있다).
4. **확인**: 같은 미리보기를 다시 실행 — 적용한 LOT 이 목록에서 빠졌는지. 수량·집계·거래가 그대로인지 조회.
5. **되돌리기** (필요 시): `--restore=<백업 파일> [--only=<LOT id,…>]`
