# F2-2 / F2-3 V2 엔진 운영 전환 체크리스트

> 작성: 2026-04-30 — F-2 단일 트랜잭션 엔진 (PR #117 / #125 / #127) 점진 전환용.

---

## 배경

생산 도메인 핵심 2개 엔진을 v1 (legacy 다중 단계) → v2 (단일 트랜잭션) 로 점진 전환:

| 엔진 | v1 | v2 | dispatcher |
|------|----|----|------------|
| **F2-2 자동 출고** | `autoMaterialIssue.ts` | `autoMaterialIssueV2.ts` | `autoMaterialIssueDispatcher.ts` |
| **F2-3 생산 완료 분개** | `productionCompletePost.ts` | `productionCompletePostV2.ts` | `productionCompleteDispatcher.ts` |

dispatcher 는 env flag 보고 분기. 결과 타입 동일 (호출자 호환). 운영 영향 0 — 미설정 시 v1 그대로.

---

## 환경 변수 (4개)

| flag | tenants 화이트리스트 | 우선순위 |
|------|----------------------|---------|
| `USE_AUTO_ISSUE_V2` | `USE_AUTO_ISSUE_V2_TENANTS` | TENANTS > 전역 |
| `USE_PRODUCTION_COMPLETE_V2` | `USE_PRODUCTION_COMPLETE_V2_TENANTS` | TENANTS > 전역 |

값:
- `*=true` (또는 `1` / `yes`) — 전체 활성
- `*_TENANTS=2,5,7` — 명시 tenant 만 (CSV)

---

## 점진 전환 5단계

```
[1] 머지 직후                               (영향 0)
   ↓ env 미설정 → 모든 호출 v1
[2] dev/staging dual-run 검증              (운영 무영향)
   ↓ USE_*_V2=true (개발 환경)
[3] 운영 단일 tenant 점진 활성              (1주)
   ↓ USE_*_V2_TENANTS="2"
[4] 운영 전체 전환                          (1달)
   ↓ USE_*_V2=true
[5] v1 코드 제거                           (F2-2-e / F2-3-e)
```

각 단계 1주~1달 안정화 권장. 단계 단위 즉시 롤백 가능.

---

## 활성화 절차 (Genspark 운영)

### Step A: F2-2 (자동 출고) 단일 테넌트

```bash
# /root/haccpone-v2/.env 추가
echo 'USE_AUTO_ISSUE_V2_TENANTS=2' >> /root/haccpone-v2/.env
pm2 reload haccpone

# 로그 확인 — 첫 호출 시 dispatcher 로그 출력
pm2 logs haccpone --lines 100 | grep "autoIssueDispatcher"
# → "[autoIssueDispatcher] v2 사용 batch=XXX tenant=2"
```

검증 (1주):
- 배치 자동 출고 재고 차감 정상
- 출고 LOT 추적 일관성
- 에러 로그 0
- v1 호출 대비 처리시간 (단일 트랜잭션이라 더 빠름 기대)

### Step B: F2-3 (생산 완료 분개) 단일 테넌트

```bash
echo 'USE_PRODUCTION_COMPLETE_V2_TENANTS=2' >> /root/haccpone-v2/.env
pm2 reload haccpone

pm2 logs haccpone --lines 100 | grep "productionCompleteDispatcher"
# → "[productionCompleteDispatcher] v2 사용 batch=XXX tenant=2"
```

검증 (1주):
- 생산 완료 후 매출원가 / 재고 분개 정상
- 시산표 / 손익계산서 잔액 변동 없음 (v1/v2 동일 결과 기대)
- 회계 마감 시 분개 누락 0

### Step C: 전체 전환 (Step A/B 각 1달 안정 후)

```bash
# 단일 테넌트 → 전체 전환
sed -i 's/^USE_AUTO_ISSUE_V2_TENANTS=.*/USE_AUTO_ISSUE_V2=true/' /root/haccpone-v2/.env
sed -i 's/^USE_PRODUCTION_COMPLETE_V2_TENANTS=.*/USE_PRODUCTION_COMPLETE_V2=true/' /root/haccpone-v2/.env
pm2 reload haccpone
```

### Step D: v1 코드 제거 (Claude PR — Step C 이후 1달)

`F2-2-e` / `F2-3-e` PR 로 dispatcher → 직접 v2 호출 전환 후 v1 파일 삭제.
운영 안정 충분 확인 후만.

---

## 롤백 절차

각 단계 단위 즉시 롤백 가능 (env 1줄 주석 + reload).

```bash
# Step A 롤백
sed -i 's/^USE_AUTO_ISSUE_V2_TENANTS=/# USE_AUTO_ISSUE_V2_TENANTS=/' /root/haccpone-v2/.env
pm2 reload haccpone
```

이미 처리된 출고 / 분개는 v1 / v2 동일 결과 기대라 추가 정정 불필요.
단, 월 마감 직전 전환은 회피 (회계 일관성 우선).

---

## 모니터링 포인트

### F2-2 (자동 출고)
- 배치별 출고 처리 시간 (v1 vs v2)
- 출고 실패 / 재고 부족 발생률
- LOT 할당 정합성 (FEFO 순서 유지)

### F2-3 (생산 완료)
- 분개 생성 건수 / 금액
- 시산표 대차 균형 (월별 검증)
- 매출원가 vs 재고 차감 일치성

### 알림
- dispatcher 로그 `[*Dispatcher] v2 사용` 검색
- 에러 로그 (`pm2 logs --err`)

---

## E2E 스모크

```bash
# Phase 2 cosmetic + F-2 통합 시나리오 (파일럿 테넌트로)
npx tsx scripts/smoke-f2-pipeline.ts
```

검증 항목:
- 배치 생성 → 자동 출고 (F2-2 v2) → 생산 완료 (F2-3 v2)
- 재고 차감 + 매출원가 분개 정상

---

## 사고 대응

### v2 결과가 v1 과 다름 (회계 불일치)
1. 즉시 해당 phase 롤백 (env 주석 + reload)
2. 잘못된 분개 / 출고 수동 보정
3. 차이 원인 분석 → v2 코드 hotfix → 재활성화

### v2 처리 시간이 v1 보다 느림
1. 단일 트랜잭션 락 경합 가능성 검토
2. 인덱스 / 쿼리 플랜 점검
3. 일시 롤백 후 최적화 PR 후 재시도

---

## F-3 IoT 폐쇄 루프 활성화도 함께

F-3 활성화는 별도 문서:

📘 `docs/operations/f3-pilot-activation.md` — F-3 6단계 폐쇄 루프 단계별 활성화

권장 순서:
1. **DB 마이그레이션 일괄 실행** (`scripts/migrate-cosmetic-all.ts` — Step 1)
2. **F2-2 단일 테넌트** (USE_AUTO_ISSUE_V2_TENANTS — 본 문서 Step A)
3. **F2-3 단일 테넌트** (USE_PRODUCTION_COMPLETE_V2_TENANTS — 본 문서 Step B)
4. **F-3 Phase A** (IoT 브리지 + CCP 평가 — `f3-pilot-activation.md`)
5. ... (단계별 진행)
