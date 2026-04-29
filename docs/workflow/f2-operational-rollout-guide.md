# F2-2 / F2-3 운영 전환 가이드

> 작성: 2026-04-29
> 대상: F2-2 (autoMaterialIssue v2) + F2-3 (productionComplete v2) 의 단일 트랜잭션 엔진 운영 활성화
> 청사진: 특허 [0014] 해결수단 2 / `docs/architecture/F-2-단일-트랜잭션-엔진.md`

---

## 0. TL;DR

**현재 상태**: 코드는 main 머지 완료 (#125~#130, #117 청사진), 운영 .env 미설정 → 100% v1 동작 (운영 영향 0).
**진행 단계**: dev/staging dual-run 검증 → 운영 단일 tenant 파일럿 → 1주 검증 → 전체 전환 → 1달 후 v1 제거.
**소요 시간**: 1단계당 1~10분 (.env 편집 + PM2 reload). 검증은 1주 단위.
**롤백**: env 한 줄 제거 + PM2 reload (10초).

---

## 1. F2-2 / F2-3 가 무엇인가

### F2-2: autoMaterialIssue v2 (자동출고 단일 트랜잭션)

| | |
|--|--|
| 진입점 | `server/lib/production/autoMaterialIssueDispatcher.ts` → `autoIssueMaterialsDispatch()` |
| v1 (legacy) | `autoMaterialIssue.ts` — 분할 트랜잭션 (LOT 차감 + 분개 + 재고 갱신 따로) |
| v2 (NEW) | `autoMaterialIssueV2.ts` — `allocateLotsFEFO(..., ctx.conn)` 단일 트랜잭션 |
| 호출처 | `batchOrchestrator.ts:272`, `batch.crud.router.ts:907` |
| 관련 PR | #117 (청사진), #125, #126, #127, #128 |

**v2 가 해결하는 문제**: 자동출고 도중 부분 실패 시 v1 은 LOT 만 차감되고 분개 미생성 → 데이터 정합성 깨짐. v2 는 단일 트랜잭션 롤백 → all-or-nothing.

### F2-3: postProductionComplete v2 (생산 완료 단일 트랜잭션)

| | |
|--|--|
| 진입점 | `server/lib/production/productionCompleteDispatcher.ts` → `productionCompleteDispatch()` |
| v1 (legacy) | `productionCompletePost.ts` — 다단계 INSERT/UPDATE |
| v2 (NEW) | `productionCompletePostV2.ts` — `TransactionContext` + `postWithinTransaction` |
| 호출처 | (caller 코드는 dispatcher 만 봄 — 자동 분기) |
| 관련 PR | #117 (청사진), #124 (transaction engine), #129, #130 |

**v2 가 해결하는 문제**: 생산 완료 시 제품재고 +, 원재료 - , 분개 INSERT, 도메인 이벤트 발행 — 이 4가지가 분할되어 있어 부분 실패 가능. v2 는 모두 한 번에.

### F-2 단일 트랜잭션 엔진 (#117, #124)

`server/_core/transaction/`:
- `TransactionContext` — `{ conn, tenantId, userId }` 컨텍스트
- `postWithinTransaction()` — 자동 begin / commit / rollback 래퍼

dispatcher 패턴이 적용된 v2 들은 모두 이 엔진 위에서 동작. 새 기능에서 single-transaction 보장이 필요하면 동일 패턴 적용 가능.

---

## 2. 환경변수 (총 4개)

```
# F2-2 — 자동출고
USE_AUTO_ISSUE_V2=false                    (기본 — 모든 호출 v1)
USE_AUTO_ISSUE_V2=true                     (모든 호출 v2)
USE_AUTO_ISSUE_V2_TENANTS="2,5,7"          (명시 tenant 만 v2 — 점진)

# F2-3 — 생산 완료
USE_PRODUCTION_COMPLETE_V2=false           (기본 — 모든 호출 v1)
USE_PRODUCTION_COMPLETE_V2=true            (모든 호출 v2)
USE_PRODUCTION_COMPLETE_V2_TENANTS="2,5,7" (명시 tenant 만 v2 — 점진)
```

**우선순위**:
1. `*_TENANTS` (명시 tenant 목록) — 비어있지 않으면 그것만 v2
2. `*_V2=true/1/yes` — 전체 v2

**조합 권장 (점진)**:
```bash
# 단계 1 — 운영 단일 tenant 파일럿
USE_AUTO_ISSUE_V2_TENANTS="2"
USE_PRODUCTION_COMPLETE_V2_TENANTS="2"
```

```bash
# 단계 2 — 전체 전환
USE_AUTO_ISSUE_V2=true
USE_PRODUCTION_COMPLETE_V2=true
# (TENANTS 변수는 제거 또는 무시됨)
```

---

## 3. 점진 전환 5단계

| 단계 | 환경 | 작업 | 검증 |
|------|------|------|------|
| 0 | (현재) | 운영 .env 미설정 | 100% v1 — 영향 0 |
| 1 | dev/staging | `USE_AUTO_ISSUE_V2=true` + `USE_PRODUCTION_COMPLETE_V2=true` | 모든 자동화 시나리오 회귀 테스트 |
| 2 | 운영 | `USE_AUTO_ISSUE_V2_TENANTS="2"` + `USE_PRODUCTION_COMPLETE_V2_TENANTS="2"` | tenant 2 의 1주 운영 모니터링 |
| 3 | 운영 | `USE_AUTO_ISSUE_V2_TENANTS="2,5,7"` (확대) | 추가 tenant 1주 모니터링 |
| 4 | 운영 | `USE_AUTO_ISSUE_V2=true` + `USE_PRODUCTION_COMPLETE_V2=true` (전체) | 1달 모니터링 |
| 5 | 운영 | v1 코드 제거 (별도 PR — F2-2-e / F2-3-d) | dispatcher 단순화 |

---

## 4. 운영 전환 절차 (단계 2 — 단일 tenant 파일럿)

### 4-1. 사전 점검

```bash
# 운영 서버 SSH
ssh -p 2222 root@49.50.130.101

cd /root/haccpone-v2

# 현재 main 의 dispatcher 적용 확인 (#128, #130 머지 후)
grep -l "autoIssueMaterialsDispatch\|productionCompleteDispatch" server/lib/production/

# 환경변수 현황
grep "USE_AUTO_ISSUE_V2\|USE_PRODUCTION_COMPLETE_V2" .env || echo "미설정 (= 100% v1)"

# PM2 상태
pm2 status haccpone
```

기대값:
- dispatcher 파일 2개 모두 존재
- env 미설정
- PM2 online

### 4-2. .env 추가 (단일 tenant 파일럿)

```bash
# /root/haccpone-v2/.env 끝에 추가
echo '' >> .env
echo '# F2-2/F2-3 단일 트랜잭션 엔진 운영 파일럿 (2026-04-29)' >> .env
echo 'USE_AUTO_ISSUE_V2_TENANTS="2"' >> .env
echo 'USE_PRODUCTION_COMPLETE_V2_TENANTS="2"' >> .env

# 변경 확인
tail -4 .env
```

### 4-3. PM2 reload

```bash
pm2 reload haccpone
sleep 5
pm2 status haccpone
# online + uptime 5s 이상 + restarts +1 확인

# health check
curl -sI http://localhost:3000/ | head -1
# HTTP/1.1 200 OK 기대
```

### 4-4. dispatcher 활성 검증

```bash
# tenant 2 에서 자동출고 1건 트리거 (UI 또는 API)
# 그 후 PM2 로그에서 dispatcher 로그 확인:
pm2 logs haccpone --lines 100 --nostream | grep -E "autoIssueDispatcher|productionCompleteDispatcher"

# 기대값:
# [autoIssueDispatcher] v2 사용 batch=NNN tenant=2
# [productionCompleteDispatcher] v2 사용 batch=NNN tenant=2
```

다른 tenant (예: tenant 3) 의 호출은 v1 그대로 — 로그 메시지 없음.

### 4-5. 데이터 정합성 검증 (1주)

매일 1회 (또는 24시 자동 마감 직후):

```sql
-- tenant 2 의 최근 1일 자동출고 정합성 체크
-- v2 가 정상이면: 모든 자동출고 transaction 에 대해 LOT 차감 + 분개 + 재고 갱신 모두 존재

SELECT b.id AS batch_id, b.batch_code, b.tenant_id,
  -- LOT 차감 row 수
  (SELECT COUNT(*) FROM h_inventory_transactions
   WHERE source_type='BATCH' AND source_id=b.id AND tenant_id=b.tenant_id) AS txn_cnt,
  -- 분개 row 수
  (SELECT COUNT(*) FROM expense_journal_entries
   WHERE description LIKE CONCAT('%batch #', b.id, '%') AND tenant_id=b.tenant_id) AS journal_cnt,
  -- 제품 재고 변경 (있어야 함)
  (SELECT actual_quantity FROM h_batches WHERE id=b.id) AS actual_qty
FROM h_batches b
WHERE b.tenant_id = 2
  AND b.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
  AND b.status = 'completed'
ORDER BY b.id DESC;
```

**Red flag**:
- `txn_cnt = 0` 인데 `actual_qty > 0` → v2 트랜잭션이 부분 commit 됨 (버그)
- `journal_cnt = 0` 인데 `txn_cnt > 0` → 분개 누락 (v2 의 핵심 가치가 무너짐)

이런 패턴이 발견되면 즉시 롤백 (4-6 참조).

### 4-6. 롤백 절차 (이상 발견 시)

```bash
# 운영 서버에서
sed -i '/USE_AUTO_ISSUE_V2_TENANTS/d' /root/haccpone-v2/.env
sed -i '/USE_PRODUCTION_COMPLETE_V2_TENANTS/d' /root/haccpone-v2/.env
pm2 reload haccpone

# 검증
grep "USE_AUTO_ISSUE_V2\|USE_PRODUCTION_COMPLETE_V2" /root/haccpone-v2/.env || echo "정상 — 미설정"
pm2 logs haccpone --lines 50 --nostream | grep -E "Dispatcher" | head -5
# 더 이상 'v2 사용' 로그가 안 찍혀야 정상
```

→ 즉시 100% v1 복귀. 데이터 손실 0.

문제 데이터가 있으면 별도 SQL 분석 + Genspark 데이터 보정 (CLAUDE.md "Genspark DB 작업 시 주의" 섹션 참고).

---

## 5. 단계 3~5 진행 (단계 2 통과 후)

### 단계 3 — 추가 tenant 확대

```bash
# 1주 후 tenant 2 정상이면 tenant 5, 7 추가
sed -i 's/USE_AUTO_ISSUE_V2_TENANTS="2"/USE_AUTO_ISSUE_V2_TENANTS="2,5,7"/' /root/haccpone-v2/.env
sed -i 's/USE_PRODUCTION_COMPLETE_V2_TENANTS="2"/USE_PRODUCTION_COMPLETE_V2_TENANTS="2,5,7"/' /root/haccpone-v2/.env
pm2 reload haccpone
```

### 단계 4 — 전체 전환

```bash
# 1주 후 추가 tenant 들도 정상이면 전체 전환
sed -i '/USE_AUTO_ISSUE_V2_TENANTS/d' /root/haccpone-v2/.env
sed -i '/USE_PRODUCTION_COMPLETE_V2_TENANTS/d' /root/haccpone-v2/.env
echo 'USE_AUTO_ISSUE_V2=true' >> /root/haccpone-v2/.env
echo 'USE_PRODUCTION_COMPLETE_V2=true' >> /root/haccpone-v2/.env
pm2 reload haccpone
```

### 단계 5 — v1 코드 제거

별도 PR 로 진행 (F2-2-e / F2-3-d). 작업 내용:
- `autoMaterialIssue.ts` 의 `runV1` import 제거
- dispatcher 가 단순히 v2 호출하도록 단순화 (또는 dispatcher 자체 제거)
- 테스트 갱신
- env 변수 제거

전체 운영 1달 무사고 후에만 진행 권장.

---

## 6. 자주 묻는 질문

### Q. v1 / v2 를 동시에 켜면 어떻게 되나?

→ dispatcher 가 tenant 별로 v1 또는 v2 분기. 같은 tenant 의 같은 호출이 v1 / v2 를 오가는 일은 없음 (env 변경 시점부터 일관).

### Q. dev/staging 검증은 어떻게?

→ 별도 .env 또는 직접 환경변수로:
```bash
USE_AUTO_ISSUE_V2=true USE_PRODUCTION_COMPLETE_V2=true npm run dev
```
모든 자동화 시나리오 (자동출고 → 생산완료 → 자동분개 → LOT 차감) 동일 흐름 확인.

### Q. 회귀 테스트는 어떤 게 있나?

`server/lib/production/autoMaterialIssueDispatcher.test.ts` 가 dispatcher 분기 로직 검증.
운영 시나리오 회귀는 일부 부족 — 향후 보강 필요 (CLAUDE.md "테스트 추가" 항목).

### Q. v2 의 트랜잭션 실패는 어떻게 진단?

PM2 로그에 `[postWithinTransaction]` 또는 `[autoIssueV2]` / `[productionCompleteV2]` 키워드. 실패 시 BEGIN/ROLLBACK 흔적 + 에러 메시지가 출력됨.

```bash
pm2 logs haccpone --err --lines 200 --nostream | grep -E "v2|Transaction|ROLLBACK"
```

### Q. CCP F-3 폐쇄 루프 (CP-3-*) 와 충돌하나?

→ 충돌 없음. CCP 트리거는 `triggerCcpEvaluator()` 자체 트랜잭션. F2-2/F2-3 은 자동출고/생산완료 별개. 두 시스템은 동일 batch 에 대해 작동하지만 시간/공간이 분리됨.

---

## 7. 관련 문서 / PR

- 청사진: `docs/architecture/F-2-단일-트랜잭션-엔진.md` (PR #117)
- F-2 코어: PR #124 (`TransactionContext`)
- F2-2: PR #125, #126, #127, #128
- F2-3: PR #129, #130
- 운영 매뉴얼: `docs/workflow/pr-deployment-cycle.md`
- CLAUDE.md "삼각 분업 체제" / "Genspark 허용/금지" 섹션
- 특허: [0014] 해결수단 2 — 단일 트랜잭션 엔진

---

## 8. 변경 이력

| 일자 | 변경 |
|------|------|
| 2026-04-29 | 초안 작성 (CP-3-h / UNIQUE 인덱스 작업과 함께) |
