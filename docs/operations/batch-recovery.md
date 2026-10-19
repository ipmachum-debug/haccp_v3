# 이력 보존형 생산 건 복구 — 운영 절차 (2026-10-19)

같은 날 같은 제품이 중복으로 만들어진 생산 건을 **지우지 않고** 무효로 표시하고, 남길 생산 건으로 대체 관계를 남긴다.
코드: `server/services/batchRecovery.ts` (`planRecovery` = dry-run, `executeRecovery` = 실행), 명령줄: `scripts/recover-batches.ts`.

> 이 문서는 절차다. **실행 승인이 아니다.** 운영에서는 조회·dry-run 까지만 하고,
> 수정·역거래·재계획·결재 취소는 대표의 별도 승인 뒤에만 실행한다.
> 대상 번호·수량·금액이 든 비교표·입력 파일은 비공개 자료다 — 이 저장소(공개)에 올리지 않는다.

## 무엇을 하고 무엇을 하지 않는가

| 하는 것 | 하지 않는 것 |
|---|---|
| 무효 생산 건: `status='cancelled'` + `voided_at/voided_by/void_reason/superseded_by_batch_id` (행 보존) | 일반 삭제(`deleteBatch`)·물리 삭제 |
| 무효 건의 사용 거래 **하나마다** 역거래 1건 (`return`, `BATCH_VOID`, `VOID_REVERSAL`, `reversal_of_id` = 원 거래) — 원 수량·단가·금액·거래일 그대로 | 공급처 입고로 기록, 현재 단가로 다시 계산, 임의 LOT 에 몰기 |
| 같은 LOT 의 `quantity·current_quantity·available_quantity` 를 표준 관문(`applyLotDelta`)으로 복원, 그 원료 집계만 다시 맞춤 | 전 품목 재고 재계산, 마이너스 재고 0 보정, 실사 보정 |
| 수불부: 원 거래일 사용량에서 역거래 양만큼 뺌 (모자라면 멈춤) | |
| CCP: 무효 건 인스턴스·기록지 `voided_at` 표시 (상태·행은 그대로) | 기록지 상태를 '반려' 로 바꾸기 |
| 금속검출 일일 기록지: 무효 건의 **통과 행만** 보관 후 뺌, 행 버전 ↑ (다시 확인 필요) | 감도점검·사람 입력 덮어쓰기, 실제 통과 시각 만들기 |
| 남는 생산 건 가열 공정: 지금 공장 설정으로 다시 계획 (예정값, 원본은 보관표) | 다시 계획한 시각을 실측·확인 시각으로 쓰기 |
| 무효 건 결재 요청 `cancelled` + 결재 이력 / 생산 일정 `cancelled` / 생산 로그 메모(무효·대체) | 승인된 결재·기록 변경 (있으면 멈춤) |
| 남는 생산 건의 미출고 줄 → `issue_hold=1` (자동 출고 안 함, 별도 확인) | 미출고 줄 자동 출고, 완료 생산·완제품 LOT·분개 생성 |

생성 요청 키(`h_batch_create_requests`)는 `done` 그대로 둔다 — 바꾸면 같은 요청 재시도가 생산 건을 다시 만든다. 요청 → 무효 생산 건 → `superseded_by_batch_id` 로 추적한다.

## 멈추는 조건 (dry-run `errors`)

- 넘긴 번호 중 하나라도 이 회사 것이 아님 → **전부 거부**
- 생산일이 다름, 이미 무효·취소, 예정 생산 건(`plan_only=1`), 완료·실적·완제품 LOT·SKU 실적 있음
- 무효 건과 대체 건의 제품·계획량이 다름 / 같은 날 다른 생산 건이 있음
- 사용 거래에 LOT·거래일 없음, 이미 역거래 있음, 사용 외 거래가 붙어 있음
- LOT 상태가 `available/used` 가 아님, 수불부 행 없음·사용량 부족
- 남는 생산 건 기록지가 확인·수정·승인됨, CCP 행에 측정 시각·사람 입력, 원 출고 BOM 버전 ≠ 지금 계획 버전, 공정 구성이 다름
- 금속검출 통과 행과 생산 건 대응을 (제품별 생성 순서 + 수량·단위) 로 확인할 수 없음, 금속 기록지 승인됨
- 무효 대상 결재가 승인됨
- 미출고 줄 목록이 남는 생산 건의 미출고 줄과 다름

## 실행 순서 (운영)

1. **최신 dry-run** (읽기 전용 트랜잭션, 아무것도 쓰지 않음)
   ```bash
   DATABASE_URL=... npx tsx scripts/recover-batches.ts --input=<비공개 입력.json> --out=<비공개 plan.json>
   ```
   출력의 건수·kg·역거래 수·양·금액·LOT·가열 행·통과 행이 승인받은 비교표와 같은지 확인. 다르면 멈추고 다시 보고.
2. **백업** — 전체 + 대상 표
   ```bash
   mysqldump --single-transaction --routines --triggers <db> > full-<날짜>.sql
   mysqldump --single-transaction <db> h_batches h_batch_inputs h_inventory_transactions h_inventory_lots h_inventory \
     material_ledger_daily h_ccp_instances h_ccp_rows h_ccp_form_records h_ccp_form_rows h_approval_requests h_approval_history \
     h_batch_schedules h_production_log h_inventory_deduction_log h_batch_create_requests audit_logs > targets-<날짜>.sql
   ```
3. **복원 확인** — 별도 DB 에 전체 백업을 복원하고 위 표들의 `CHECKSUM TABLE` 이 백업 시점과 같은지 확인. 운영 DB 에 복원하지 않는다.
4. **대표 승인** — 비교표·dry-run 지문·백업 위치를 보고 별도 승인.
5. **실행** (승인 뒤, 같은 지문으로 한 번)
   ```bash
   RECOVERY_EXECUTE_APPROVED=yes DATABASE_URL=... npx tsx scripts/recover-batches.ts --input=<입력.json> \
     --execute --key=<복구 키> --fingerprint=<1의 지문> --actor=<실행자 users.id>
   ```
   - 생산 건을 잠그고(`FOR UPDATE`) 다시 계산 → 지문이 다르면 아무것도 하지 않고 멈춤 (`RecoveryChangedError`).
   - 한 트랜잭션 — 중간 어디서 실패해도 전부 되돌림.
   - 같은 키로 다시 실행 → `already_done` (추가 변경 0). 동시 실행 → 한 번만.
6. **적용 뒤 대조** — 정상 생산 건 수·kg, 원 거래 보존, 역거래 = 원 거래 수(`reversal_of_id` 연결), LOT 3칸·집계·수불부, 가열 행·기록지 행, 금속 통과 행, 결재 취소 이력, `h_batch_recoveries.summary_json`, `h_recovery_archive`.

## 실패 대응

| 상황 | 대응 |
|---|---|
| dry-run `errors` | 실행하지 않는다. 사유를 보고하고 데이터·입력을 다시 확인. |
| 실행이 `RecoveryChangedError` | 아무것도 바뀌지 않았다. 1번부터 다시 (새 dry-run·비교·승인). |
| 실행이 `RecoveryBlockedError`·기타 오류 | 트랜잭션이 되돌려졌다. `h_batch_recoveries` 에 행이 없는지 확인 후 원인 보고. |
| 실행 중 연결 끊김 | `h_batch_recoveries` 에 같은 키가 있으면 커밋된 것 → 6번 대조. 없으면 되돌려진 것. 같은 키로 다시 실행해도 두 번 처리되지 않는다. |
| 실행 뒤 되돌려야 함 (승인 철회) | 보관표(`h_recovery_archive`, 복구 번호별 원본 행)와 2번 대상 백업이 근거. **운영 DB 를 통째로 복원하지 않는다** (그 사이 다른 업무 기록이 사라짐). 역거래를 지우지 말고 별도 승인된 상쇄 절차로 처리. |
| 생산일지가 그대로 | 커밋 뒤 갱신이 실패한 것 (복구는 유지). 생산일지 다시 만들기를 한 번 실행. |

## 앱 동작

- 무효 생산 건은 시작·확인·승인·삭제·날짜 일괄 삭제·자동 출고가 막힌다 (`lib/production/batchVoidGuard.ts`).
- 오늘 생산 목록: `무효(중복) — #대체번호 로 대체, 원본 보존`. CCP 기록지 목록·생산일지·하루 집계에서 빠진다 (원본은 그대로).
- 보류 줄이 있는 생산 건은 승인 관문이 '원료 미출고' 로 막는다 — 별도 확인 뒤 처리.
