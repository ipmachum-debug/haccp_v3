# HACCP-ONE v3 단독 운영 → SaaS 전환 로드맵

> 작성일: 2026-04-13  
> 현재 상태: v3 실서비스 운영 중 (haccpone.com), v2 테스트용 병렬 운영  
> 목표: v2 완전 제거 → 단독 v3 운영 → SaaS 구독 서비스 출시

---

## 📍 전체 타임라인

```
2026-04-13  ── PHASE 0: 사전 백업 (backup_v2_pre_shutdown.sh 실행)
                ↓
            ── PHASE 1: v2 정지 & v3 전환 테스트 (당일)
                ↓
2026-04-13  ── PHASE 2: 1주일 v3 단독 모니터링
~ 04-20         ↓
            ── PHASE 3: 안정화 확인 & 스냅샷 재생성
                ↓
2026-04-21  ── PHASE 4: v2 코드 완전 제거 & 단독 서버 최적화
~               ↓
            ── PHASE 5: SaaS 구독 서비스 준비 & 출시
```

---

## PHASE 0 — 사전 백업 ✅ 준비완료

### 실행 방법 (서버에서)
```bash
bash /root/haccp_v3/scripts/backup_v2_pre_shutdown.sh
```

### 백업 내용
| 항목 | 저장 위치 |
|------|-----------|
| haccp_tenant_db 전체 덤프 | `/root/backups/pre_v2_shutdown_YYYYMMDD/db/` |
| v2 소스코드 tar.gz | `/root/backups/pre_v2_shutdown_YYYYMMDD/src/` |
| v2 .env + ecosystem.config | `/root/backups/pre_v2_shutdown_YYYYMMDD/env/` |
| PM2 dump + nginx 설정 | `/root/backups/pre_v2_shutdown_YYYYMMDD/env/` |
| 서버 상태 스냅샷 | `/root/backups/pre_v2_shutdown_YYYYMMDD/env/` |

> 클라우드 서버 이미지도 이미 존재: `haccp-v3-backup` (50GB, 2026-04-13 07:12 생성)

---

## PHASE 1 — v2 정지 & v3 전환 테스트 (당일)

### 실행 스크립트
```bash
bash /root/haccp_v3/scripts/switch_v2_to_v3_only.sh
```

### 수동 실행 순서
```bash
# 1. 백업 먼저 (아직 안 했다면)
bash /root/haccp_v3/scripts/backup_v2_pre_shutdown.sh

# 2. v2 정지
pm2 stop 16
pm2 save

# 3. 포트 해제 확인
lsof -i :3002 || echo "✅ 포트 3002 해제"

# 4. nginx v2 도메인 → 리다이렉트 처리
# v2.haccpone.com 접속 시 haccpone.com 으로 301 리다이렉트

# 5. v3 응답 확인
curl -I https://haccpone.com
curl -I http://localhost:3001
```

### 전환 후 즉시 테스트 항목
```
[ ] 로그인 정상 작동
[ ] 대시보드 로딩
[ ] CCP 기록 입력
[ ] 배치 기록 조회
[ ] 일일 점검일지 작성
[ ] 원료 수불부 조회
[ ] 승인 요청 발송
[ ] PDF 출력
[ ] DB 데이터 정합성 확인 (테넌트별)
```

### 긴급 롤백 (v2 재시작)
```bash
bash /root/haccp_v3/scripts/rollback_restart_v2.sh
```

---

## PHASE 2 — 1주일 v3 단독 모니터링 (04-13 ~ 04-20)

### cron 등록 (매일 09:00 자동 체크)
```bash
echo '0 9 * * * bash /root/haccp_v3/scripts/monitor_v3_after_shutdown.sh >> /root/backups/v3_monitoring/cron.log 2>&1' | crontab -
```

### 모니터링 9개 체크 항목
| # | 항목 | 기준 |
|---|------|------|
| 1 | PM2 프로세스 상태 | online |
| 2 | 재시작 횟수 | ≤ 5회 |
| 3 | 메모리 사용량 | ≤ 800MB |
| 4 | HTTP 응답 (로컬) | 200 |
| 5 | 포트 3001 점유 | 확인 |
| 6 | 포트 3002 미점유 | 해제 확인 |
| 7 | DB 연결 | 정상 |
| 8 | 디스크 사용률 | ≤ 80% |
| 9 | 에러 로그 | ≤ 10건 |

### 안정화 판단 기준 (D+7)
```
✅ 통과 기준:
  - PM2 재시작 0~2회 이하 (자연 메모리 정리 제외)
  - HTTP 500 에러 없음
  - DB 연결 에러 없음
  - 메모리 지속 증가(leak) 없음
  - 사용자 불편 신고 없음

❌ 재검토 기준 (v2 재시작 고려):
  - PM2 재시작 5회 이상
  - HTTP 500 연속 발생
  - DB 연결 실패
```

---

## PHASE 3 — 안정화 확인 & 스냅샷 재생성 (D+7, ~04-20)

### 최종 안정화 체크
```bash
bash /root/haccp_v3/scripts/monitor_v3_after_shutdown.sh
pm2 describe haccp_v3 | grep -E "status|uptime|restarts|memory"
```

### 클라우드 서버 이미지 재생성
```
1. 클라우드 콘솔 접속
2. haccp_v3 서버 → 서버 이미지 생성
3. 이름: haccp-v3-stable-YYYYMMDD
4. 기존 haccp-v3-backup (2026-04-13) 은 30일 보관 후 삭제
```

### v2 완전 제거
```bash
# PM2에서 v2 프로세스 완전 삭제
pm2 delete 16
pm2 save

# v2 디렉토리 삭제 (1.1GB 회수)
rm -rf /root/haccpone-v2

# nginx v2 가상호스트 제거
rm /etc/nginx/sites-enabled/v2.haccpone.com 2>/dev/null || true
nginx -t && systemctl reload nginx

# 디스크 확인
df -h /root
```

---

## PHASE 4 — v2 코드 제거 & 단독 서버 최적화

### 소스코드에서 v2 흔적 제거
```bash
# v2 관련 ecosystem.config 항목 정리
# nginx v2 가상호스트 설정 파일 삭제
# 불필요한 v2 환경변수 정리

# node_modules 재설치 (clean)
cd /root/haccp_v3
pm2 stop haccp_v3
pnpm install --prod
pm2 start ecosystem.config.cjs
```

### 서버 최적화
```bash
# PM2 메모리 제한 설정 (ecosystem.config.cjs 수정)
# max_memory_restart: '1G'

# 로그 로테이션 설정
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7

# MySQL slow query 로그 활성화
mysql -e "SET GLOBAL slow_query_log = 'ON'; SET GLOBAL long_query_time = 2;"
```

### 단독 서버 이전 옵션 (검토)
```
현재: 공유/멀티 서비스 서버
목표: v3 전용 독립 서버

이전 시 작업:
1. 새 서버 프로비저닝 (haccp-v3-stable 이미지에서 생성)
2. DNS 절체 (haccpone.com → 새 서버 IP)
3. SSL 인증서 재발급
4. 구 서버 종료
```

---

## PHASE 5 — SaaS 구독 서비스 준비

### 필수 개발 항목
```
[ ] 구독 플랜 테이블 설계 (plans, subscriptions, invoices)
[ ] 결제 연동 (카드/계좌이체: Toss Payments / NHN KCP)
[ ] 테넌트 온보딩 자동화 (회원가입 → 결제 → 자동 승인)
[ ] 플랜별 기능 제한 (기능 Flag: free/starter/pro/enterprise)
[ ] 구독 만료 처리 (만료 알림 → 접근 제한)
[ ] 관리자 대시보드 (테넌트 관리, 매출 현황)
[ ] 이용약관 / 개인정보처리방침 페이지
[ ] 서비스 소개 랜딩페이지 (haccpone.com)
```

### 플랜 구성 (초안)
| 플랜 | 대상 | 가격(월) | 테넌트 수 | 주요 기능 |
|------|------|----------|-----------|-----------|
| Free | 소규모 1개소 | 무료 | 1 | HACCP 기록 기본 |
| Starter | 중소식품 | 49,000원 | 1 | HACCP + ERP 기본 |
| Pro | 중견식품 | 99,000원 | 3 | 전체 기능 + AI 분석 |
| Enterprise | 대기업/체인 | 협의 | 무제한 | 전용 서버 + 커스터마이징 |

### 기술 스택 추가 (SaaS 전환 시)
```
결제: Toss Payments SDK
이메일: AWS SES or Resend
모니터링: Sentry (에러 추적)
분석: Mixpanel or PostHog (사용자 행동)
CDN: Cloudflare
```

### 출시 전 체크리스트
```
[ ] 결제 테스트 (실결제 포함)
[ ] 보안 점검 (SQL Injection, XSS, CSRF)
[ ] 부하 테스트 (동시 접속 50명 기준)
[ ] 백업 자동화 검증 (cron)
[ ] 서비스 이용약관 법무 검토
[ ] 개인정보처리방침 등록
[ ] 사업자 등록 확인 (전자상거래)
```

---

## 🔧 전체 스크립트 목록

| 스크립트 | 실행 시점 | 목적 |
|----------|-----------|------|
| `scripts/backup_v2_pre_shutdown.sh` | PHASE 0 (지금) | v2 정지 전 전체 백업 |
| `scripts/switch_v2_to_v3_only.sh` | PHASE 1 | v2 정지 & v3 전환 자동화 |
| `scripts/post_switch_test.sh` | PHASE 1 직후 | 전환 후 자동 테스트 |
| `scripts/rollback_restart_v2.sh` | 비상시 | v2 긴급 재시작 |
| `scripts/monitor_v3_after_shutdown.sh` | PHASE 2 (매일) | 1주일 모니터링 |
| `scripts/cleanup_v2_final.sh` | PHASE 3 | v2 완전 제거 |

---

## 📞 비상 연락 체계

```
v3 장애 발생 시:
  1. pm2 restart haccp_v3          (즉시, 30초)
  2. bash rollback_restart_v2.sh   (v2 재시작, 1분)
  3. 클라우드 콘솔 → haccp-v3-backup 이미지로 서버 복원 (15분)
```
