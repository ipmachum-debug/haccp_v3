#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# v2 긴급 롤백 스크립트 (v2 디렉토리 삭제 전에만 유효)
# 목적: v2 정지 후 문제 발생 시 v2 즉시 재시작
# 실행: bash /root/haccp_v3/scripts/rollback_restart_v2.sh
# 주의: /root/haccpone-v2 디렉토리가 존재할 때만 동작
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"; }
ok()   { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✅ $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠️  $1${NC}"; }
error(){ echo -e "${RED}[$(date '+%H:%M:%S')] ❌ $1${NC}"; exit 1; }

echo ""
echo "══════════════════════════════════════"
echo "  🔄 v2 긴급 롤백 스크립트"
echo "  시각: $(date '+%Y-%m-%d %H:%M:%S')"
echo "══════════════════════════════════════"
echo ""

V2_DIR="/root/haccpone-v2"
V2_PM2_ID=16

# ── 1. v2 디렉토리 존재 확인 ──
log "v2 디렉토리 확인: ${V2_DIR}"
[ -d "${V2_DIR}" ] || error "v2 디렉토리 없음 - 이미 삭제됐거나 경로 오류. 백업에서 복구 필요"
ok "v2 디렉토리 존재 확인"

# ── 2. v2 PM2 상태 확인 ──
log "PM2에서 v2 상태 확인"
PM2_STATUS=$(pm2 describe "${V2_PM2_ID}" 2>/dev/null | grep "status" | awk '{print $4}' | head -1 || echo "not_found")
log "  현재 상태: ${PM2_STATUS}"

# ── 3. v2 재시작 ──
log "v2 재시작 (pm2 start ${V2_PM2_ID})"

if [[ "${PM2_STATUS}" == *"stopped"* ]] || [[ "${PM2_STATUS}" == *"errored"* ]]; then
  pm2 start "${V2_PM2_ID}" && ok "pm2 start 성공" || error "pm2 start 실패"
elif [[ "${PM2_STATUS}" == *"online"* ]]; then
  warn "v2가 이미 실행 중: ${PM2_STATUS}"
  pm2 restart "${V2_PM2_ID}" && ok "pm2 restart 완료"
else
  warn "알 수 없는 상태: ${PM2_STATUS}"
  # ecosystem.config으로 직접 시작 시도
  log "  ecosystem.config으로 직접 시작 시도..."
  cd "${V2_DIR}" && pm2 start ecosystem.config.js --env production 2>/dev/null \
    || pm2 start ecosystem.config.cjs --env production 2>/dev/null \
    || error "ecosystem.config 시작 실패 - 수동 확인 필요"
fi

# ── 4. 포트 3002 응답 확인 ──
log "포트 3002 응답 대기 (최대 15초)"
for i in $(seq 1 5); do
  sleep 3
  HTTP_CODE=$(curl -o /dev/null -s -w "%{http_code}" --max-time 5 http://localhost:3002/ 2>/dev/null || echo "000")
  if [[ "${HTTP_CODE}" =~ ^(200|301|302|304)$ ]]; then
    ok "v2 응답 확인: HTTP ${HTTP_CODE} (${i}번째 시도)"
    break
  fi
  log "  시도 ${i}/5: HTTP ${HTTP_CODE} - 대기 중..."
done

# ── 5. pm2 save ──
pm2 save 2>/dev/null && ok "pm2 save 완료 (재부팅 후 유지)"

# ── 6. 현재 상태 출력 ──
echo ""
echo "── 현재 PM2 상태 ──"
pm2 list | grep -E "id|name|status|cpu|mem|port" 2>/dev/null || pm2 list

echo ""
echo "── 포트 점유 확인 ──"
lsof -i :3001 -i :3002 2>/dev/null | grep LISTEN || ss -tlnp | grep -E "3001|3002"

echo ""
echo "═══════════════════════════════════════"
echo "  v2 롤백 완료"
echo "  v2: v2.millioai.com → localhost:3002"
echo "  v3: millioai.com    → localhost:3001"
echo "═══════════════════════════════════════"
echo ""
warn "롤백 이유를 파악하고 v3 이슈를 수정 후 다시 v3만 운영하세요."
echo ""
