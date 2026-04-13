# v2 정지 전 사전 준비 체크리스트
> 작성일: 2026-04-12  
> 목적: haccpone-v2 (pm2 id 16, 포트 3002) 안전 정지를 위한 사전 준비  
> 전제: dist/index.js 완전 동일 확인됨, 동일 DB(haccp_tenant_db), 실서비스는 v3(포트 3001)

---

## ✅ PHASE 1 — 백업 (v2 정지 전 필수)

### 1-1. DB 전체 백업
```bash
# 서버에서 실행 (root@49.50.130.101)
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/root/backups/pre_v2_shutdown_${DATE}"
mkdir -p ${BACKUP_DIR}/db ${BACKUP_DIR}/env ${BACKUP_DIR}/src

# haccp_tenant_db 전체 덤프 (--single-transaction: 서비스 무중단)
mysqldump \
  -u root \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --set-gtid-purged=OFF \
  haccp_tenant_db \
  | gzip > ${BACKUP_DIR}/db/haccp_tenant_db_${DATE}.sql.gz

echo "✅ DB 백업 완료: $(du -sh ${BACKUP_DIR}/db/*.gz)"
```

### 1-2. v2 소스코드 + dist 스냅샷
```bash
# /root/haccpone-v2 전체 압축 (node_modules 제외)
tar -czf ${BACKUP_DIR}/src/haccpone-v2_${DATE}.tar.gz \
  --exclude='/root/haccpone-v2/node_modules' \
  --exclude='/root/haccpone-v2/.git' \
  /root/haccpone-v2

echo "✅ v2 소스 백업 완료: $(du -sh ${BACKUP_DIR}/src/*.gz)"
```

### 1-3. v2 환경설정 백업
```bash
# .env, ecosystem.config.js, nginx 설정
cp /root/haccpone-v2/.env               ${BACKUP_DIR}/env/v2.env        2>/dev/null || echo "⚠️ .env 없음"
cp /root/haccpone-v2/ecosystem.config.* ${BACKUP_DIR}/env/               2>/dev/null || true
cp /etc/nginx/sites-available/v2*       ${BACKUP_DIR}/env/               2>/dev/null || true
cp /etc/nginx/sites-enabled/v2*         ${BACKUP_DIR}/env/               2>/dev/null || true

# PM2 설정 덤프
pm2 save
cp ~/.pm2/dump.pm2 ${BACKUP_DIR}/env/pm2_dump_${DATE}.pm2

echo "✅ 환경설정 백업 완료"
```

### 1-4. 백업 검증
```bash
# DB 덤프 무결성 확인
gunzip -t ${BACKUP_DIR}/db/haccp_tenant_db_${DATE}.sql.gz && echo "✅ DB 덤프 무결"

# 백업 크기 확인 (0바이트면 실패)
du -sh ${BACKUP_DIR}/**

# v3 dist와 v2 dist 동일성 최종 확인
md5sum /root/haccp_v3/dist/index.js /root/haccpone-v2/dist/index.js
# → 두 해시값이 동일해야 함 ✅
```

---

## ✅ PHASE 2 — v3 헬스체크 (정지 직전)

### 2-1. v3 서비스 응답 확인
```bash
# HTTP 응답 코드 확인
curl -o /dev/null -s -w "HTTP: %{http_code}\n" http://localhost:3001/
curl -o /dev/null -s -w "HTTP: %{http_code}\n" https://haccpone.com/

# v3 PM2 상태 확인
pm2 describe haccp_v3 | grep -E "status|uptime|restarts|memory"
```

### 2-2. DB 접속 확인 (v3 기준)
```bash
# v3가 DB에 정상 접속 중인지 확인
mysql -u root -e "SHOW PROCESSLIST;" | grep haccp_tenant_db
```

### 2-3. 마지막 v2 접속 시간 확인
```bash
# v2(포트 3002) 최근 접속 여부 (접속자 있으면 안내 후 정지)
pm2 describe haccp_v2 2>/dev/null || pm2 describe haccpone-v2 2>/dev/null
tail -50 /root/haccpone-v2/logs/combined.log 2>/dev/null | grep -E "GET|POST" | tail -5
```

---

## ✅ PHASE 3 — v2 정지 실행

### 3-1. v2 정지 (PM2 id 16)
```bash
# 정지 (프로세스 유지, 재시작 비활성화)
pm2 stop 16
pm2 save  # 재부팅 후에도 중지 상태 유지

# 상태 확인
pm2 list | grep -E "id|name|status|port"
```

### 3-2. 포트 점유 확인
```bash
# 3002 포트가 완전히 해제됐는지 확인
lsof -i :3002 || echo "✅ 포트 3002 해제 완료"
```

### 3-3. Nginx v2 도메인 처리 (선택)
```bash
# 옵션 A: v2.haccpone.com 접속 시 haccpone.com으로 리다이렉트
# /etc/nginx/sites-available/v2.haccpone.com 수정:
# return 301 https://haccpone.com$request_uri;

# 옵션 B: 유지보수 페이지 표시
# nginx 설정에서 proxy_pass 대신 정적 HTML 서빙

nginx -t && systemctl reload nginx
```

---

## ✅ PHASE 4 — 1주일 모니터링 기준

### 모니터링 명령어 (매일 확인)
```bash
# v3 상태 요약 (1회 실행으로 전체 확인)
echo "=== $(date) ===" && \
pm2 describe haccp_v3 | grep -E "status|uptime|restarts|memory" && \
echo "--- 최근 에러 ---" && \
pm2 logs haccp_v3 --nostream --lines 20 2>&1 | grep -i "error\|warn\|fail" | tail -10 && \
echo "--- HTTP 응답 ---" && \
curl -o /dev/null -s -w "haccpone.com: %{http_code}, 응답시간: %{time_total}s\n" https://haccpone.com/
```

### 이상 징후 기준
| 증상 | 판단 | 조치 |
|------|------|------|
| pm2 status = stopped | 🔴 긴급 | `pm2 restart haccp_v3` |
| HTTP 500 연속 3회 | 🔴 긴급 | 로그 확인 후 판단 |
| 메모리 1GB 초과 | 🟡 주의 | `pm2 restart haccp_v3` |
| 재시작 횟수 급증 | 🟡 주의 | `pm2 logs haccp_v3` 확인 |
| DB 연결 오류 | 🔴 긴급 | MySQL 상태 확인 |

---

## ✅ PHASE 5 — 1주일 후 최종 삭제 판단

### 삭제 전 최종 체크
```bash
# 1주일간 v3 재시작 횟수 (0~2회면 안정적)
pm2 describe haccp_v3 | grep restart

# v2 디렉토리 크기 최종 확인
du -sh /root/haccpone-v2

# 백업 파일 존재 확인
ls -lh /root/backups/pre_v2_shutdown_*/
```

### 삭제 실행 (안전 확인 후)
```bash
# PM2에서 v2 완전 제거
pm2 delete 16
pm2 save

# 디렉토리 삭제
rm -rf /root/haccpone-v2

# 1.1GB 회수 확인
df -h /root
```

---

## 🔄 긴급 롤백 절차 (v2 재시작)

> v2를 삭제하기 전이라면 30초 내 롤백 가능

```bash
# v2 즉시 재시작
pm2 start 16
pm2 save

# 포트 확인
lsof -i :3002 | grep LISTEN && echo "✅ v2 복구 완료"

# DB는 동일하므로 데이터 복구 불필요
```

---

## 📋 요약 타임라인

```
D-day (v2 정지 당일)
  09:00  PHASE 1 백업 실행 (~30분)
  09:30  PHASE 2 v3 헬스체크 확인
  09:45  PHASE 3 v2 정지 실행
  10:00  포트/프로세스 확인 완료

D+1 ~ D+7 (모니터링 기간)
  매일 1회  v3 상태 모니터링 명령어 실행
  이상 없음 → D+7에 최종 삭제 결정

D+7 (최종 삭제)
  PHASE 5 최종 체크 후 rm -rf /root/haccpone-v2
```
