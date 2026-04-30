# F-3 IoT 폐쇄 루프 — 단일 테넌트 파일럿 활성화 체크리스트

> 작성: 2026-04-30 — Phase 2 cosmetic lifecycle 완성 후, F-3 식품 IoT 폐쇄 루프
> 단일 테넌트 파일럿 시작용 체크리스트.

---

## F-3 폐쇄 루프 6단계 (PR #119~#143 완성)

```
[1] IoT 신호 수신
   ↓ (ENABLE_CCP_IOT_BRIDGE)
[2] CCP 자동 평가 (limit 초과 감지)
   ↓ (ENABLE_CCP_EVAL)
[3] LOT HOLD (자동 격리)
   ↓ (ENABLE_CCP_LOT_HOLD)
[4] 손실 분개 (자동 회계 처리)
   ↓ (ENABLE_CCP_AUTO_JOURNAL)
[5] CAR (시정조치) 자동 발행
   ↓ (ENABLE_CCP_CAR)
[6] CAR SLA 체크 + 알림
   ↓ (ENABLE_CCP_CAR_SLA_CHECK)
[운영 가시화] /dashboard/haccp/f3-dashboard
```

각 단계는 **env flag 로 독립 ON/OFF**. tenant 단위 점진 활성화 가능.

---

## 활성화 환경 변수 (총 12개)

### 단계별 ENABLE 플래그 (6쌍 = flag + tenants 화이트리스트)

| 단계 | 전체 활성 flag | 테넌트 화이트리스트 |
|------|----------------|---------------------|
| (1) IoT 브리지 | `ENABLE_CCP_IOT_BRIDGE` | `ENABLE_CCP_IOT_BRIDGE_TENANTS` |
| (2) CCP 평가 | `ENABLE_CCP_EVAL` | `ENABLE_CCP_EVAL_TENANTS` |
| (3) LOT HOLD | `ENABLE_CCP_LOT_HOLD` | `ENABLE_CCP_LOT_HOLD_TENANTS` |
| (4) 손실 분개 | `ENABLE_CCP_AUTO_JOURNAL` | `ENABLE_CCP_AUTO_JOURNAL_TENANTS` |
| (5) CAR 발행 | `ENABLE_CCP_CAR` | `ENABLE_CCP_CAR_TENANTS` |
| (6) CAR SLA | `ENABLE_CCP_CAR_SLA_CHECK` | (전역 cron, tenant 단위 X) |

### 우선순위 (모든 flag 공통)
1. `*_TENANTS` (CSV) — 명시 테넌트 ID 목록 → **있으면 우선 적용**
2. `*` (true/1/yes) — 전체 활성

### 권장 파일럿 패턴 — 단일 테넌트 (예: tenant_id=2)

```env
# ────────── F-3 단일 테넌트 파일럿 (tenant_id=2) ──────────
# 단계별로 점진 활성화. 단계 1~2 안정 후 3~6 순차 ON.

# Step 1-2: IoT → CCP 평가 (관찰만, 부작용 없음)
ENABLE_CCP_IOT_BRIDGE_TENANTS=2
ENABLE_CCP_EVAL_TENANTS=2

# Step 3: LOT HOLD (재고 격리, 운영자 인지 필요)
# ENABLE_CCP_LOT_HOLD_TENANTS=2

# Step 4: 손실 분개 (회계 처리, 운영자 사후 검증 필요)
# ENABLE_CCP_AUTO_JOURNAL_TENANTS=2

# Step 5: CAR 발행 (시정조치 자동 생성)
# ENABLE_CCP_CAR_TENANTS=2

# Step 6: CAR SLA cron (전역, 영향 작음)
# ENABLE_CCP_CAR_SLA_CHECK=true
```

---

## 활성화 절차 (Genspark 운영)

### 사전 조건
- [ ] DB 마이그레이션 완료 (`scripts/migrate-cosmetic-all.ts` — Step 1)
- [ ] 파일럿 테넌트 ID 확정 (운영진 합의)
- [ ] 운영자가 LOT HOLD / 회계 분개 자동화 인지 + 모니터링 SLA 합의

### 단계별 활성화 (각 단계 24~72h 관찰 권장)

#### Phase A: 관찰만 (Step 1-2) — 부작용 0
```bash
echo 'ENABLE_CCP_IOT_BRIDGE_TENANTS=2' >> /root/haccpone-v2/.env
echo 'ENABLE_CCP_EVAL_TENANTS=2' >> /root/haccpone-v2/.env
pm2 reload haccpone
# 관찰: /dashboard/haccp/f3-dashboard 에 평가 결과 누적 확인
# 24h 이상 안정 + 오탐 없으면 Phase B 진행
```

#### Phase B: 격리 (Step 3) — 재고 변경
```bash
echo 'ENABLE_CCP_LOT_HOLD_TENANTS=2' >> /root/haccpone-v2/.env
pm2 reload haccpone
# 관찰: LOT HOLD 발생 시 운영자 응답 시간 측정
# 운영자 워크플로 안정 후 Phase C 진행
```

#### Phase C: 회계 자동화 (Step 4) — 장부 변경
```bash
echo 'ENABLE_CCP_AUTO_JOURNAL_TENANTS=2' >> /root/haccpone-v2/.env
pm2 reload haccpone
# 관찰: 회계 담당자 분개 검증 (월 마감 주기)
```

#### Phase D: 시정조치 (Step 5-6) — CAR 자동 + SLA
```bash
echo 'ENABLE_CCP_CAR_TENANTS=2' >> /root/haccpone-v2/.env
echo 'ENABLE_CCP_CAR_SLA_CHECK=true' >> /root/haccpone-v2/.env
pm2 reload haccpone
# 관찰: CAR 발행 → 담당자 배정 → SLA 알림 동작 확인
```

---

## E2E 스모크 테스트

각 phase 활성화 직후 즉시 실행:

```bash
# F-3 6단계 폐쇄 루프 E2E 검증 (Phase A~D 통합)
npx tsx scripts/smoke-f3-pipeline.ts

# Phase 2 cosmetic lifecycle E2E (참고)
npx tsx scripts/smoke-f2-pipeline.ts
```

검증 항목:
- 단계별 자동 평가 / LOT HOLD / 분개 / CAR 발행 정상 동작
- CCP 정상 측정값 → 통과
- CCP 이탈 측정값 → 6단계 모두 발현

---

## 롤백 절차

각 phase 단위 롤백 가능 — env 라인 1줄 주석 + reload.

```bash
# 예: Phase C (자동 분개) 롤백
sed -i 's/^ENABLE_CCP_AUTO_JOURNAL_TENANTS=/# ENABLE_CCP_AUTO_JOURNAL_TENANTS=/' /root/haccpone-v2/.env
pm2 reload haccpone
```

이미 발생한 분개/CAR 는 수동 정리 필요 (자동 reverse 없음).

---

## 모니터링 포인트

### F-3 운영 대시보드 (`/dashboard/haccp/f3-dashboard`)
- 24h CCP 이탈 건수
- LOT HOLD 발생 + 해제 시간
- 자동 분개 건수 + 금액
- CAR 발행 → 마감 전환율
- CAR SLA 이탈

### Deviation 트렌드 (`/dashboard/haccp/f3-trends`)
- 7일 / 30일 이탈 패턴
- 디바이스별 / CCP 타입별 분류

### 알림 채널
- in-app 알림 (`h_notifications`) — 운영자 즉시 인지
- (옵션) 외부 webhook — 운영진 별도 채널

---

## 사고 대응

### 오탐 (false positive) 다수 발생
1. `/dashboard/haccp/f3-dashboard` 에서 디바이스/CCP 타입 식별
2. CCP limit 재조정 (운영자 UI) — env 변경 없이 즉시 반영
3. 24h 재관찰

### LOT HOLD 누락 / 잘못된 격리
1. 즉시 `ENABLE_CCP_LOT_HOLD_TENANTS` 주석 + reload (Phase B 롤백)
2. 격리된 LOT 수동 해제 (재고 라우터)
3. CCP 평가 로직 검토 후 단계적 재활성화

### 자동 분개 오류
1. 즉시 `ENABLE_CCP_AUTO_JOURNAL_TENANTS` 주석 + reload (Phase C 롤백)
2. 잘못 생성된 분개 역분개 (회계 라우터 cancel)
3. `journalHelper.ts` 로직 검토 + hotfix 후 재활성화

---

## Phase 2 cosmetic 알림도 함께 (병행 권장)

cosmetic GMP 사용 테넌트라면 함께 활성화:

```env
# 화장품 IPC 실패 / 회수 알림
ENABLE_COSMETIC_ALERTS_TENANTS=2
```

→ `/dashboard/cosmetic/dashboard` 에서 alert 활성화 표시 확인.

---

## F2-2 / F2-3 운영 전환 (별도 항목 — Step 3)

본 문서는 F-3 폐쇄 루프 전용. 자동 출고 (F2-2) / 생산 완료 V2 (F2-3) 는
`docs/operations/f2-v2-rollout.md` 참조.

```env
USE_AUTO_ISSUE_V2_TENANTS=2
USE_PRODUCTION_COMPLETE_V2_TENANTS=2
```
