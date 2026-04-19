#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# v2 정지 후 v3 모니터링 스크립트
# 목적: v2 정지 후 1주일간 v3 안정성 모니터링
# 실행: bash /root/haccp_v3/scripts/monitor_v3_after_shutdown.sh
# 권장: crontab -e → 0 9 * * * bash /root/haccp_v3/scripts/monitor_v3_after_shutdown.sh
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

# ── 색상 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ── 설정 ──
V3_PORT=3001
V3_URL="https://millioai.com"
V3_LOCAL_URL="http://localhost:${V3_PORT}"
PM2_APP_NAME="haccpone"
LOG_DIR="/root/backups/v3_monitoring"
DATE=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${LOG_DIR}/monitor_${DATE}.log"
ALERT_FILE="${LOG_DIR}/alerts.log"
MAX_MEMORY_MB=800   # 경보 기준 (MB)
MAX_RESTARTS=5      # 누적 재시작 경보 기준
HTTP_TIMEOUT=10     # HTTP 타임아웃 (초)

mkdir -p "${LOG_DIR}"

log()   { local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"; echo -e "${BLUE}${msg}${NC}"; echo "$msg" >> "${LOG_FILE}"; }
ok()    { local msg="[$(date '+%Y-%m-%d %H:%M:%S')] ✅ $1"; echo -e "${GREEN}${msg}${NC}"; echo "$msg" >> "${LOG_FILE}"; }
warn()  { local msg="[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  $1"; echo -e "${YELLOW}${msg}${NC}"; echo "$msg" | tee -a "${LOG_FILE}" >> "${ALERT_FILE}"; }
alert() { local msg="[$(date '+%Y-%m-%d %H:%M:%S')] 🔴 ALERT: $1"; echo -e "${RED}${msg}${NC}"; echo "$msg" | tee -a "${LOG_FILE}" >> "${ALERT_FILE}"; }

ISSUES=0

echo "" | tee -a "${LOG_FILE}"
echo "═══════════════════════════════════════" | tee -a "${LOG_FILE}"
echo "  v3 모니터링: $(date '+%Y-%m-%d %H:%M:%S')" | tee -a "${LOG_FILE}"
echo "═══════════════════════════════════════" | tee -a "${LOG_FILE}"

# ── CHECK 1: PM2 프로세스 상태 ──
log "CHECK 1: PM2 프로세스 상태"

PM2_STATUS=$(pm2 describe "${PM2_APP_NAME}" 2>/dev/null | grep "status" | awk '{print $4}' | head -1 || echo "not_found")

if [[ "${PM2_STATUS}" == *"online"* ]]; then
  ok "PM2 상태: online"
else
  alert "PM2 상태 이상: '${PM2_STATUS}'"
  ((ISSUES++))
  # 자동 복구 시도
  log "  → 자동 재시작 시도..."
  pm2 restart "${PM2_APP_NAME}" 2>/dev/null && ok "재시작 성공" || alert "재시작 실패 - 수동 확인 필요"
fi

# ── CHECK 2: 재시작 횟수 ──
log "CHECK 2: 재시작 횟수 확인"

RESTART_COUNT=$(pm2 describe "${PM2_APP_NAME}" 2>/dev/null | grep "restarts" | awk '{print $4}' | head -1 || echo "0")
log "  누적 재시작: ${RESTART_COUNT}회"

if [ "${RESTART_COUNT:-0}" -gt "${MAX_RESTARTS}" ] 2>/dev/null; then
  warn "재시작 횟수 과다: ${RESTART_COUNT}회 (기준: ${MAX_RESTARTS}회)"
  ((ISSUES++))
else
  ok "재시작 횟수 정상: ${RESTART_COUNT}회"
fi

# ── CHECK 3: 메모리 사용량 ──
log "CHECK 3: 메모리 사용량"

MEM_RAW=$(pm2 describe "${PM2_APP_NAME}" 2>/dev/null | grep "memory" | awk '{print $4}' | head -1 || echo "0")
MEM_MB=$(echo "${MEM_RAW}" | grep -oP '[\d.]+(?=MB)' || echo "0")
log "  메모리: ${MEM_RAW}"

if [ -n "${MEM_MB}" ] && [ "${MEM_MB%.*}" -gt "${MAX_MEMORY_MB}" ] 2>/dev/null; then
  warn "메모리 과다 사용: ${MEM_RAW} (기준: ${MAX_MEMORY_MB}MB)"
  ((ISSUES++))
else
  ok "메모리 정상: ${MEM_RAW}"
fi

# ── CHECK 4: HTTP 응답 (로컬) ──
log "CHECK 4: HTTP 응답 확인 (localhost:${V3_PORT})"

HTTP_CODE=$(curl -o /dev/null -s -w "%{http_code}" \
  --connect-timeout "${HTTP_TIMEOUT}" \
  --max-time "${HTTP_TIMEOUT}" \
  "${V3_LOCAL_URL}/" 2>/dev/null || echo "000")

RESP_TIME=$(curl -o /dev/null -s -w "%{time_total}" \
  --connect-timeout "${HTTP_TIMEOUT}" \
  --max-time "${HTTP_TIMEOUT}" \
  "${V3_LOCAL_URL}/" 2>/dev/null || echo "0")

if [[ "${HTTP_CODE}" =~ ^(200|301|302|304)$ ]]; then
  ok "HTTP 응답: ${HTTP_CODE} (${RESP_TIME}s)"
elif [ "${HTTP_CODE}" == "000" ]; then
  alert "HTTP 응답 없음 (연결 실패) - 서버 다운 가능성"
  ((ISSUES++))
else
  warn "HTTP 응답 코드 이상: ${HTTP_CODE} (${RESP_TIME}s)"
  ((ISSUES++))
fi

# ── CHECK 5: 포트 3001 점유 확인 ──
log "CHECK 5: 포트 ${V3_PORT} 점유 확인"

PORT_PID=$(lsof -ti :${V3_PORT} 2>/dev/null | head -1 || echo "")
if [ -n "${PORT_PID}" ]; then
  ok "포트 ${V3_PORT} 점유 중 (PID: ${PORT_PID})"
else
  alert "포트 ${V3_PORT} 미점유 - 서비스 미실행"
  ((ISSUES++))
fi

# ── CHECK 6: v2 포트 3002 미점유 확인 ──
log "CHECK 6: v2 포트 3002 미점유 확인"

V2_PID=$(lsof -ti :3002 2>/dev/null | head -1 || echo "")
if [ -z "${V2_PID}" ]; then
  ok "포트 3002 미점유 (v2 정상 정지)"
else
  warn "포트 3002 점유 중 (PID: ${V2_PID}) - v2가 재실행됐을 가능성"
fi

# ── CHECK 7: DB 연결 확인 ──
log "CHECK 7: DB 연결 확인 (haccp_tenant_db)"

DB_CHECK=$(mysql -u root -h localhost \
  -e "SELECT COUNT(*) FROM tenants;" haccp_tenant_db \
  -s -N 2>/dev/null || echo "ERROR")

if [ "${DB_CHECK}" != "ERROR" ]; then
  ok "DB 연결 정상 (tenant 수: ${DB_CHECK})"
else
  alert "DB 연결 실패 - MySQL 상태 확인 필요"
  ((ISSUES++))
fi

# ── CHECK 8: 디스크 여유 공간 ──
log "CHECK 8: 디스크 여유 공간"

DISK_AVAIL=$(df -BG /root | awk 'NR==2 {print $4}' | tr -d 'G')
DISK_USE_PCT=$(df /root | awk 'NR==2 {print $5}' | tr -d '%')
log "  여유: ${DISK_AVAIL}GB, 사용률: ${DISK_USE_PCT}%"

if [ "${DISK_USE_PCT}" -gt 90 ] 2>/dev/null; then
  alert "디스크 사용률 위험: ${DISK_USE_PCT}%"
  ((ISSUES++))
elif [ "${DISK_USE_PCT}" -gt 80 ] 2>/dev/null; then
  warn "디스크 사용률 주의: ${DISK_USE_PCT}%"
else
  ok "디스크 정상: ${DISK_USE_PCT}% 사용 (${DISK_AVAIL}GB 여유)"
fi

# ── CHECK 9: 최근 에러 로그 ──
log "CHECK 9: 최근 에러 로그 확인"

ERROR_COUNT=$(pm2 logs "${PM2_APP_NAME}" --nostream --lines 100 2>/dev/null \
  | grep -ciE "error|exception|fatal|uncaught" || echo "0")

if [ "${ERROR_COUNT}" -gt 10 ] 2>/dev/null; then
  warn "에러 로그 다수 감지: 최근 100줄 중 ${ERROR_COUNT}건"
  pm2 logs "${PM2_APP_NAME}" --nostream --lines 20 2>/dev/null \
    | grep -iE "error|exception" | tail -5 >> "${LOG_FILE}"
else
  ok "에러 로그 정상: ${ERROR_COUNT}건/최근100줄"
fi

# ── 최종 결과 ──
echo "" | tee -a "${LOG_FILE}"
echo "═══════════════════════════════════════" | tee -a "${LOG_FILE}"

if [ "${ISSUES}" -eq 0 ]; then
  echo -e "${GREEN}  ✅ 모든 체크 통과 (이슈 0건)${NC}" | tee -a "${LOG_FILE}"
  echo "  v3 서비스 안정적으로 운영 중" | tee -a "${LOG_FILE}"
else
  echo -e "${RED}  🔴 이슈 ${ISSUES}건 감지 - 확인 필요!${NC}" | tee -a "${LOG_FILE}"
  echo "  알림 로그: ${ALERT_FILE}" | tee -a "${LOG_FILE}"
fi

echo "  로그: ${LOG_FILE}" | tee -a "${LOG_FILE}"
echo "═══════════════════════════════════════" | tee -a "${LOG_FILE}"
echo "" | tee -a "${LOG_FILE}"

# 이슈 있으면 비정상 종료 코드 (cron 알림 목적)
exit "${ISSUES}"
