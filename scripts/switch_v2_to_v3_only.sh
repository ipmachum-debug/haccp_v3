#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# v2 정지 & v3 단독 전환 스크립트 (PHASE 1)
# 목적: haccpone-v2 (pm2 id 16) 정지, v3만 운영
# 실행: bash /root/haccp_v3/scripts/switch_v2_to_v3_only.sh
# 전제: backup_v2_pre_shutdown.sh 실행 완료 후 사용
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()    { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"; }
ok()     { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✅ $1${NC}"; }
warn()   { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠️  $1${NC}"; }
error()  { echo -e "${RED}[$(date '+%H:%M:%S')] ❌ $1${NC}"; exit 1; }
header() { echo -e "\n${BOLD}${CYAN}══ $1 ══${NC}\n"; }

V2_PM2_ID=16
V3_PORT=3001
V2_PORT=3002
V3_DIR="/root/haccp_v3"
BACKUP_ROOT="/root/backups"
SWITCH_LOG="${BACKUP_ROOT}/switch_log_$(date +%Y%m%d_%H%M%S).txt"

mkdir -p "${BACKUP_ROOT}"

# 모든 출력을 로그에도 저장
exec > >(tee -a "${SWITCH_LOG}") 2>&1

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   HACCP-ONE v2 → v3 단독 전환 스크립트     ║${NC}"
echo -e "${BOLD}║   $(date '+%Y-%m-%d %H:%M:%S')                      ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── STEP 0: 사전 조건 확인 ──
header "STEP 0: 사전 조건 확인"

# 백업 완료 확인
BACKUP_EXISTS=$(ls -d "${BACKUP_ROOT}"/pre_v2_shutdown_* 2>/dev/null | tail -1 || echo "")
if [ -z "${BACKUP_EXISTS}" ]; then
  error "백업이 없습니다! 먼저 실행하세요:\n  bash /root/haccp_v3/scripts/backup_v2_pre_shutdown.sh"
fi
ok "백업 확인: ${BACKUP_EXISTS}"

# v3 서비스 응답 확인 (전환 전 v3가 살아있어야 함)
log "v3 서비스 응답 확인 (localhost:${V3_PORT})"
V3_HTTP=$(curl -o /dev/null -s -w "%{http_code}" --max-time 5 "http://localhost:${V3_PORT}/" 2>/dev/null || echo "000")
if [[ "${V3_HTTP}" =~ ^(200|301|302|304)$ ]]; then
  ok "v3 응답 정상: HTTP ${V3_HTTP}"
else
  error "v3 서비스 응답 없음 (HTTP ${V3_HTTP}) — v3가 먼저 정상 실행 중이어야 합니다"
fi

# v2 현재 상태 확인
V2_STATUS=$(pm2 describe "${V2_PM2_ID}" 2>/dev/null | grep "status" | awk '{print $4}' | head -1 || echo "not_found")
log "v2 현재 PM2 상태: ${V2_STATUS}"

# ── STEP 1: 최종 확인 프롬프트 ──
header "STEP 1: 전환 최종 확인"

echo -e "${YELLOW}  다음 작업을 실행합니다:${NC}"
echo "  • haccpone-v2 (PM2 id ${V2_PM2_ID}, 포트 ${V2_PORT}) 정지"
echo "  • haccp_v3 (포트 ${V3_PORT}) → 실서비스 단독 운영"
echo "  • nginx v2.haccpone.com → haccpone.com 리다이렉트"
echo "  • PM2 설정 저장 (재부팅 후에도 v2 중지 상태 유지)"
echo ""
echo -e "${BOLD}  ⚠️  v2 정지 후 롤백: bash /root/haccp_v3/scripts/rollback_restart_v2.sh${NC}"
echo ""
read -p "  계속 진행하시겠습니까? (yes 입력): " CONFIRM
[[ "${CONFIRM}" == "yes" ]] || { echo "취소됨"; exit 0; }

# ── STEP 2: v2 정지 ──
header "STEP 2: v2 정지 (PM2 id ${V2_PM2_ID})"

if [[ "${V2_STATUS}" == *"online"* ]]; then
  pm2 stop "${V2_PM2_ID}" && ok "pm2 stop ${V2_PM2_ID} 완료"
elif [[ "${V2_STATUS}" == *"stopped"* ]]; then
  warn "v2가 이미 정지 상태입니다"
else
  warn "v2 상태: ${V2_STATUS} — 정지 시도..."
  pm2 stop "${V2_PM2_ID}" 2>/dev/null || warn "정지 실패 (이미 중지됐을 수 있음)"
fi

# PM2 dump 저장 (재부팅 후에도 중지 상태 유지)
pm2 save && ok "PM2 설정 저장 완료 (재부팅 후에도 v2 중지)"

# 포트 해제 확인 (최대 10초 대기)
log "포트 ${V2_PORT} 해제 확인..."
for i in $(seq 1 5); do
  sleep 2
  V2_PID=$(lsof -ti :${V2_PORT} 2>/dev/null | head -1 || echo "")
  if [ -z "${V2_PID}" ]; then
    ok "포트 ${V2_PORT} 완전 해제 확인 (${i}번째 시도)"
    break
  fi
  log "  대기 중... (${i}/5)"
done

# ── STEP 3: nginx v2 도메인 처리 ──
header "STEP 3: nginx v2 도메인 리다이렉트 처리"

# nginx 설정 파일 경로 탐색
NGINX_V2_CONF=""
for path in \
  /etc/nginx/sites-available/v2.haccpone.com \
  /etc/nginx/sites-available/haccpone-v2 \
  /etc/nginx/conf.d/v2.haccpone.com.conf \
  /etc/nginx/conf.d/haccpone-v2.conf; do
  if [ -f "$path" ]; then
    NGINX_V2_CONF="$path"
    break
  fi
done

if [ -n "${NGINX_V2_CONF}" ]; then
  log "v2 nginx 설정 발견: ${NGINX_V2_CONF}"
  # 기존 설정 백업
  cp "${NGINX_V2_CONF}" "${NGINX_V2_CONF}.bak_$(date +%Y%m%d_%H%M%S)"
  ok "nginx v2 설정 백업 완료"

  # v2 도메인 → v3 리다이렉트로 교체
  cat > "${NGINX_V2_CONF}" << 'NGINX_EOF'
# v2.haccpone.com → haccpone.com 리다이렉트 (v2 정지 후)
server {
    listen 80;
    listen [::]:80;
    server_name v2.haccpone.com;
    return 301 https://haccpone.com$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name v2.haccpone.com;

    # SSL 인증서 (기존 경로 유지)
    ssl_certificate /etc/letsencrypt/live/haccpone.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/haccpone.com/privkey.pem;

    return 301 https://haccpone.com$request_uri;
}
NGINX_EOF
  ok "nginx v2 → v3 리다이렉트 설정 완료"

  # nginx 설정 검증 & 리로드
  if nginx -t 2>/dev/null; then
    systemctl reload nginx && ok "nginx 리로드 완료"
  else
    warn "nginx 설정 오류 — 백업으로 복구 중..."
    cp "${NGINX_V2_CONF}.bak_$(date +%Y%m%d)*" "${NGINX_V2_CONF}" 2>/dev/null || true
    nginx -t && systemctl reload nginx
  fi
else
  warn "nginx v2 설정 파일 없음 — 수동 확인 필요"
  log "  확인할 경로: /etc/nginx/sites-available/ 또는 /etc/nginx/conf.d/"
fi

# ── STEP 4: v3 최종 상태 확인 ──
header "STEP 4: v3 서비스 최종 상태 확인"

sleep 2

V3_STATUS=$(pm2 describe haccpone 2>/dev/null | grep "status" | awk '{print $4}' | head -1 || echo "unknown")
V3_HTTP_FINAL=$(curl -o /dev/null -s -w "%{http_code}" --max-time 8 "http://localhost:${V3_PORT}/" 2>/dev/null || echo "000")
V3_HTTP_DOMAIN=$(curl -o /dev/null -s -w "%{http_code}" --max-time 8 "https://haccpone.com/" 2>/dev/null || echo "000")

echo ""
echo "  ┌─────────────────────────────────────────┐"
echo "  │         전환 후 서비스 상태              │"
echo "  ├─────────────────────────────────────────┤"
printf "  │ v3 PM2 상태    : %-23s │\n" "${V3_STATUS}"
printf "  │ v3 로컬 응답   : HTTP %-18s │\n" "${V3_HTTP_FINAL}"
printf "  │ v3 도메인 응답 : HTTP %-18s │\n" "${V3_HTTP_DOMAIN}"
echo "  ├─────────────────────────────────────────┤"

V2_PORT_CHECK=$(lsof -ti :${V2_PORT} 2>/dev/null | head -1 || echo "")
if [ -z "${V2_PORT_CHECK}" ]; then
  echo "  │ v2 포트 3002   : ✅ 해제됨               │"
else
  echo "  │ v2 포트 3002   : ⚠️  점유 중 (확인 필요) │"
fi
echo "  └─────────────────────────────────────────┘"
echo ""

# ── STEP 5: 전환 후 테스트 실행 ──
header "STEP 5: 자동 테스트 실행"

TEST_SCRIPT="/root/haccp_v3/scripts/post_switch_test.sh"
if [ -f "${TEST_SCRIPT}" ]; then
  bash "${TEST_SCRIPT}"
else
  warn "테스트 스크립트 없음: ${TEST_SCRIPT}"
  log "  수동 테스트 진행: bash /root/haccp_v3/scripts/post_switch_test.sh"
fi

# ── STEP 6: cron 모니터링 등록 ──
header "STEP 6: 1주일 모니터링 cron 등록"

MONITOR_SCRIPT="/root/haccp_v3/scripts/monitor_v3_after_shutdown.sh"
CRON_JOB="0 9 * * * bash ${MONITOR_SCRIPT} >> /root/backups/v3_monitoring/cron.log 2>&1"

# 기존 cron에 없으면 추가
if crontab -l 2>/dev/null | grep -q "monitor_v3_after_shutdown"; then
  warn "모니터링 cron 이미 등록됨"
else
  (crontab -l 2>/dev/null; echo "${CRON_JOB}") | crontab -
  ok "cron 등록 완료: 매일 09:00 자동 모니터링"
fi

# ── 최종 요약 ──
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║         🎉 v2 → v3 전환 완료!              ║${NC}"
echo -e "${BOLD}${GREEN}╠══════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}${GREEN}║  실서비스: haccpone.com → :3001 (v3 단독)  ║${NC}"
echo -e "${BOLD}${GREEN}║  v2 상태: 정지됨 (데이터 보존)              ║${NC}"
echo -e "${BOLD}${GREEN}║  로그: ${SWITCH_LOG}${NC}"
echo -e "${BOLD}${GREEN}╠══════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}${GREEN}║  다음 단계:                                  ║${NC}"
echo -e "${BOLD}${GREEN}║  • 기능 테스트 직접 수행                     ║${NC}"
echo -e "${BOLD}${GREEN}║  • 1주일 모니터링 (매일 09:00 자동)          ║${NC}"
echo -e "${BOLD}${GREEN}║  • D+7 후: cleanup_v2_final.sh 실행         ║${NC}"
echo -e "${BOLD}${GREEN}╠══════════════════════════════════════════════╣${NC}"
echo -e "${BOLD}${YELLOW}║  롤백 필요 시:                               ║${NC}"
echo -e "${BOLD}${YELLOW}║  bash /root/haccp_v3/scripts/               ║${NC}"
echo -e "${BOLD}${YELLOW}║        rollback_restart_v2.sh               ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
