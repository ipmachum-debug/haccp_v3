#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# v2 완전 제거 스크립트 (PHASE 3 — D+7 안정화 후 실행)
# 목적: haccpone-v2 디렉토리 및 PM2 프로세스 완전 삭제
# 실행: bash /root/haccp_v3/scripts/cleanup_v2_final.sh
# 경고: 이 작업은 되돌릴 수 없습니다. 백업 확인 후 실행하세요.
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"; }
ok()   { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✅ $1${NC}"; }
warn() { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠️  $1${NC}"; }
error(){ echo -e "${RED}[$(date '+%H:%M:%S')] ❌ $1${NC}"; exit 1; }

V2_PM2_ID=16
V2_DIR="/root/haccpone-v2"
BACKUP_ROOT="/root/backups"

echo ""
echo -e "${BOLD}${RED}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${RED}║   v2 완전 제거 스크립트 (되돌릴 수 없음)   ║${NC}"
echo -e "${BOLD}${RED}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── 안전 조건 체크 ──

# 1. 백업 존재 확인
BACKUP_DIR=$(ls -d "${BACKUP_ROOT}"/pre_v2_shutdown_* 2>/dev/null | tail -1 || echo "")
if [ -z "${BACKUP_DIR}" ]; then
  error "백업 없음! 삭제를 진행할 수 없습니다."
fi
ok "백업 확인: ${BACKUP_DIR}"

# 2. v3 서비스 정상 확인
V3_HTTP=$(curl -o /dev/null -s -w "%{http_code}" --max-time 5 "http://localhost:3001/" || echo "000")
if [[ "${V3_HTTP}" =~ ^(200|301|302|304)$ ]]; then
  ok "v3 서비스 정상: HTTP ${V3_HTTP}"
else
  error "v3 서비스 응답 없음 (HTTP ${V3_HTTP}) — 삭제 중단"
fi

# 3. 1주일 모니터링 로그 확인
MONITOR_LOG_COUNT=$(ls /root/backups/v3_monitoring/monitor_*.log 2>/dev/null | wc -l)
log "모니터링 로그 수: ${MONITOR_LOG_COUNT}개"
if [ "${MONITOR_LOG_COUNT}" -lt 5 ]; then
  warn "모니터링 로그가 ${MONITOR_LOG_COUNT}개뿐입니다 (7일 권장)"
  read -p "  계속 진행하시겠습니까? (y/N): " C1
  [[ "${C1}" == "y" || "${C1}" == "Y" ]] || { echo "취소됨"; exit 0; }
fi

# 4. 최종 이중 확인
echo ""
echo -e "${YELLOW}  ⚠️  다음 내용을 삭제합니다:${NC}"
echo "  • PM2 프로세스 id ${V2_PM2_ID} (haccpone-v2) 완전 제거"
echo "  • 디렉토리: ${V2_DIR} ($(du -sh ${V2_DIR} 2>/dev/null | cut -f1 || echo '?') 삭제)"
echo "  • nginx v2 도메인 설정 파일 제거"
echo ""
echo -e "${RED}${BOLD}  ‼️  이 작업은 되돌릴 수 없습니다!${NC}"
echo -e "${YELLOW}  백업 위치: ${BACKUP_DIR}${NC}"
echo ""
read -p "  정말 삭제하시겠습니까? 'DELETE' 입력: " CONFIRM
[[ "${CONFIRM}" == "DELETE" ]] || { echo "취소됨 (올바른 입력: DELETE)"; exit 0; }

echo ""

# ── STEP 1: PM2 완전 제거 ──
log "STEP 1: PM2 v2 프로세스 완전 제거"

V2_STATUS=$(pm2 describe "${V2_PM2_ID}" 2>/dev/null | grep "status" | awk '{print $4}' | head -1 || echo "not_found")

if [[ "${V2_STATUS}" == *"online"* ]]; then
  pm2 stop "${V2_PM2_ID}" 2>/dev/null
  ok "v2 정지 완료"
fi

pm2 delete "${V2_PM2_ID}" 2>/dev/null && ok "PM2 id ${V2_PM2_ID} 완전 삭제" \
  || warn "PM2 삭제 실패 또는 이미 없음"

pm2 save && ok "PM2 설정 저장 (재부팅 후에도 v2 없음)"

# ── STEP 2: v2 디렉토리 삭제 ──
log "STEP 2: v2 디렉토리 삭제"

BEFORE_DISK=$(df -h /root | awk 'NR==2{print $3}')

if [ -d "${V2_DIR}" ]; then
  rm -rf "${V2_DIR}" && ok "삭제 완료: ${V2_DIR}"
else
  warn "디렉토리 없음: ${V2_DIR} (이미 삭제됨)"
fi

AFTER_DISK=$(df -h /root | awk 'NR==2{print $3}')
log "  디스크 사용: ${BEFORE_DISK} → ${AFTER_DISK}"

# ── STEP 3: nginx v2 설정 제거 ──
log "STEP 3: nginx v2 설정 정리"

for path in \
  /etc/nginx/sites-available/v2.haccpone.com \
  /etc/nginx/sites-enabled/v2.haccpone.com \
  /etc/nginx/sites-available/haccpone-v2 \
  /etc/nginx/sites-enabled/haccpone-v2 \
  /etc/nginx/conf.d/v2.haccpone.com.conf; do
  if [ -f "$path" ]; then
    # 백업 후 삭제
    cp "$path" "${BACKUP_DIR}/env/nginx/$(basename $path).final_bak" 2>/dev/null || true
    rm -f "$path" && log "  삭제: $path"
  fi
done

nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null && ok "nginx 리로드 완료" \
  || warn "nginx 리로드 실패 — 수동 확인 필요"

# ── STEP 4: v3 최종 확인 ──
log "STEP 4: 삭제 후 v3 서비스 최종 확인"

sleep 2
V3_HTTP_FINAL=$(curl -o /dev/null -s -w "%{http_code}" --max-time 8 "http://localhost:3001/" || echo "000")
V3_DOMAIN_FINAL=$(curl -o /dev/null -s -w "%{http_code}" --max-time 8 "https://haccpone.com/" || echo "000")

[[ "${V3_HTTP_FINAL}" =~ ^(200|301|302)$ ]] && ok "v3 로컬 응답: HTTP ${V3_HTTP_FINAL}" || warn "v3 로컬 응답: HTTP ${V3_HTTP_FINAL}"
[[ "${V3_DOMAIN_FINAL}" =~ ^(200|301|302)$ ]] && ok "v3 도메인 응답: HTTP ${V3_DOMAIN_FINAL}" || warn "v3 도메인 응답: HTTP ${V3_DOMAIN_FINAL}"

# ── 최종 결과 ──
echo ""
echo "  최종 디스크 사용량:"
df -h /root | awk 'NR==2{printf "  /root: %s 사용 / %s 전체 (%s)\n", $3, $2, $5}'
echo ""
echo -e "${GREEN}${BOLD}  ✅ v2 완전 제거 완료!${NC}"
echo ""
echo "  다음 단계 (PHASE 4 → SaaS 준비):"
echo "  ──────────────────────────────────────"
echo "  1. 새 서버 이미지 스냅샷 생성 (클라우드 콘솔)"
echo "     이름 권장: haccp-v3-stable-$(date +%Y%m%d)"
echo "  2. PM2 최적화 (memory limit, logrotate)"
echo "  3. SaaS 구독 플랜 개발 시작"
echo "     참고: ROADMAP_V3_SAAS.md PHASE 5"
echo ""
