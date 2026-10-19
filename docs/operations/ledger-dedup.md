# 원장 중복 정리 — 운영 절차 (2026-10-19)

같은 사용 사건(배치 투입 줄 하나)이 원장에 두 번 남은 경우 — **원 출고**(투입 줄 id 연결)와 **옛 보충 출고**(줄 id 없이 배치에만 연결) —
원본을 지우거나 메모를 덮어쓰지 않고, 사건·원 거래·보충 거래·정본 원료를 잇는다.
코드: `server/services/ledgerDedup.ts` (`planLedgerDedup` dry-run, `executeLedgerDedup` 실행), 명령줄: `scripts/ledger-dedup.ts`.
생산 건 복구(`docs/operations/batch-recovery.md`)와 **다른 작업**이다 — 표·키·번호가 따로다.

> 이 문서는 절차다. **실행 승인이 아니다.** 운영에서는 조회·dry-run 까지만. 대상 번호·수량·금액이 든 비교표는 비공개 자료다.

## 분류와 처리

| 분류 | 판단 (LOT 연결로, 메모 문자열에 기대지 않음) | 처리 |
|---|---|---|
| B — 원장만 중복 | 원 거래 LOT 없음 + 보충 거래만 LOT 연결 | 원장 전용 상계 1건: `return`, `LEDGER_DEDUP` / `DUPLICATE_LEDGER_OFFSET`, `reversal_of_id` = 원 거래, **LOT 없음**, 금액 비움. LOT·집계·수불부 변화 0 (환불 아님) |
| A — 실재고 두 번 차감 근거 | 원 거래와 보충 거래 모두 LOT 연결 | 원장·재고 모두 그대로. 연결(`stock_review_pending`)과 LOT 별 영향량만. 뒤의 잔량 재설정·실사 영향을 따로 검증한 뒤 대표 결정 |
| 그 밖 | 줄이 둘 이상, 표현이 '원 1 + 보충 1' 이 아님, 수량·거래일 불일치 | 멈춤 (사람 확인) |

- 같은 원료인지는 **정본 매핑**으로만: 같은 id 또는 `item_master.legacy_material_id` FK. 이름·숫자 우연 일치로 잇지 않는다.
- 금액: 원 거래·보충 거래 중 어느 금액을 반전할지 **자동으로 고르지 않는다** — dry-run 이 후보 금액만 보여 준다.
- 연결표 `h_ledger_event_links` (사건 키 = 투입 줄, UNIQUE), 정리 기록 `h_ledger_dedup_cases` (정리 키 UNIQUE), 상계는 원 거래당 하나(`reversal_of_id` UNIQUE).

## 다시 차감하지 않는 조건 (앱에 들어감)

- **자동 출고 판정** (`lib/production/issuedBatchLines.ts` `LINE_REPRESENTED_SQL`): 줄 id 연결 출고뿐 아니라 `reference_type='batch_input'` 출고,
  그리고 같은 배치·같은 원료(정본 매핑)의 줄 id 없는 옛 보충 출고가 있으면 '이미 출고' — '거래 없음' 만 보고 다시 빼지 않는다.
  출고 트랜잭션 안의 재확인(줄 잠금 뒤)도 같은 조건.
- **LOT 붙이기 안전 검사** (`lib/inventory/usageEventGuard.ts` `checkLotAttachSafety`): LOT 없는 사용 거래에 LOT 을 붙여 차감하기 전,
  같은 배치·원료 사건에 LOT 연결 출고가 이미 있거나 상계·연결이 있으면 막는다 (옛 유령 출고 재조정 유형).
- 옛 보충·재조정 스크립트는 운영에서 다시 실행하지 않는다.

## 실행 순서 (운영)

1. 최신 dry-run (읽기 전용 트랜잭션): `DATABASE_URL=... npx tsx scripts/ledger-dedup.ts --input=<비공개 입력.json> --out=<plan.json>`
   — 사건 수, A/B 건수·kg, 원장 사용 전후, A LOT 영향, 금액 후보, LOT·집계가 승인받은 비교표와 같은지 확인.
2. 백업: `h_inventory_transactions h_inventory_lots h_inventory material_ledger_daily h_batch_inputs h_ledger_dedup_cases h_ledger_event_links audit_logs` + 전체.
3. 별도 DB 에 복원해 체크섬 확인 (운영 DB 에 복원하지 않음).
4. 대표 별도 승인.
5. 실행: `LEDGER_DEDUP_EXECUTE_APPROVED=yes ... --execute --key=<키> --fingerprint=<1의 지문> --actor=<users.id>`
   — 줄 잠금 뒤 다시 계산해 지문이 다르면 멈춤, 한 트랜잭션, 같은 키 재실행 = 이미 완료, 동시 실행 = 한 번.
6. 대조: 상계 수·양 = B, 연결 수 = A+B, LOT·집계·수불부 변화 0, 원본 거래 그대로.

## 실패 대응

| 상황 | 대응 |
|---|---|
| dry-run `errors` | 실행하지 않음. 사유 보고. |
| `LedgerDedupChangedError` | 아무것도 바뀌지 않음. 1번부터 다시. |
| 중간 오류 | 전부 되돌려짐. `h_ledger_dedup_cases` 에 키가 없는지 확인. |
| 실행 뒤 철회 | 상계·연결을 지우지 않는다. 별도 승인된 반대 상계 절차로. 운영 DB 통째 복원 금지. |
