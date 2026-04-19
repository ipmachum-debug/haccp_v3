#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# v2 정지 전 사전 백업 스크립트
# 목적: haccpone-v2 (pm2 id 16) 정지 전 완전 백업
# 실행: bash /root/haccp_v3/scripts/backup_v2_pre_shutdown.sh
# 서버: root@49.50.130.101 (millioai.com)
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ── 색상 정의 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()    { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"; }
ok()     { echo -e "${GREEN}[$(date '+%H:%M:%S')] ✅ $1${NC}"; }
warn()   { echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠️  $1${NC}"; }
error()  { echo -e "${RED}[$(date '+%H:%M:%S')] ❌ $1${NC}"; exit 1; }

# ── 설정 ──
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_ROOT="/root/backups"
BACKUP_DIR="${BACKUP_ROOT}/pre_v2_shutdown_${DATE}"
DB_NAME="haccp_tenant_db"
DB_USER="root"
DB_HOST="localhost"
V2_DIR="/root/haccpone-v2"
V3_DIR="/root/haccp_v3"
LOG_FILE="${BACKUP_DIR}/backup.log"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Millio AI v2 정지 전 백업 스크립트"
echo "  시작 시각: $(date '+%Y-%m-%d %H:%M:%S')"
echo "  백업 경로: ${BACKUP_DIR}"
echo "═══════════════════════════════════════════════════"
echo ""

# ── 0. 사전 검사 ──
log "PHASE 0: 사전 환경 검사"

# v2 디렉토리 존재 확인
[ -d "${V2_DIR}" ] || error "v2 디렉토리 없음: ${V2_DIR}"
[ -d "${V3_DIR}" ] || warn "v3 디렉토리 없음: ${V3_DIR}"

# mysqldump 명령어 확인
command -v mysqldump >/dev/null 2>&1 || error "mysqldump 명령어 없음"

# 백업 디렉토리 생성
mkdir -p "${BACKUP_DIR}/db" "${BACKUP_DIR}/src" "${BACKUP_DIR}/env"
ok "백업 디렉토리 생성: ${BACKUP_DIR}"

# 디스크 여유 공간 확인 (최소 3GB 필요)
AVAIL_GB=$(df -BG /root | awk 'NR==2 {print $4}' | tr -d 'G')
if [ "${AVAIL_GB}" -lt 3 ]; then
  warn "디스크 여유 공간 부족: ${AVAIL_GB}GB (권장 3GB 이상)"
  read -p "계속 진행하시겠습니까? (y/N): " CONFIRM
  [[ "$CONFIRM" == "y" || "$CONFIRM" == "Y" ]] || { echo "백업 취소"; exit 0; }
fi
ok "디스크 여유 공간: ${AVAIL_GB}GB"

# ── 1. DB 백업 ──
echo ""
log "PHASE 1: DB 백업 (haccp_tenant_db)"

DB_BACKUP="${BACKUP_DIR}/db/${DB_NAME}_${DATE}.sql.gz"

# DB 존재 확인
mysql -u "${DB_USER}" -h "${DB_HOST}" \
  -e "USE ${DB_NAME}; SELECT COUNT(*) AS tenants FROM tenants;" 2>/dev/null \
  || error "DB 접속 실패 또는 DB 없음: ${DB_NAME}"

# 덤프 실행 (무중단: --single-transaction)
log "  mysqldump 실행 중... (서비스 무중단)"
mysqldump \
  -u "${DB_USER}" \
  -h "${DB_HOST}" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --set-gtid-purged=OFF \
  --quick \
  "${DB_NAME}" 2>>"${LOG_FILE}" | gzip > "${DB_BACKUP}"

# 덤프 결과 검증
gunzip -t "${DB_BACKUP}" 2>/dev/null || error "DB 덤프 파일 손상"
DB_SIZE=$(du -sh "${DB_BACKUP}" | cut -f1)
ok "DB 백업 완료: ${DB_BACKUP} (${DB_SIZE})"

# 테이블 수 검증
TABLE_COUNT=$(mysql -u "${DB_USER}" -h "${DB_HOST}" \
  -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${DB_NAME}';" \
  -s -N 2>/dev/null || echo "?")
log "  DB 테이블 수: ${TABLE_COUNT}개"

# ── 2. v2 소스코드 + dist 백업 ──
echo ""
log "PHASE 2: v2 소스코드 백업 (/root/haccpone-v2)"

SRC_BACKUP="${BACKUP_DIR}/src/haccpone-v2_${DATE}.tar.gz"
V2_SIZE=$(du -sh "${V2_DIR}" | cut -f1)
log "  v2 디렉토리 크기: ${V2_SIZE} (node_modules 포함)"

tar -czf "${SRC_BACKUP}" \
  --exclude="${V2_DIR}/node_modules" \
  --exclude="${V2_DIR}/.git" \
  --exclude="${V2_DIR}/logs" \
  "${V2_DIR}" 2>>"${LOG_FILE}" || warn "일부 파일 백업 오류 (진행 계속)"

SRC_BACKUP_SIZE=$(du -sh "${SRC_BACKUP}" | cut -f1)
ok "v2 소스 백업 완료: ${SRC_BACKUP} (${SRC_BACKUP_SIZE})"

# ── 3. 환경설정 백업 ──
echo ""
log "PHASE 3: 환경설정 백업"

# .env 백업
if [ -f "${V2_DIR}/.env" ]; then
  cp "${V2_DIR}/.env" "${BACKUP_DIR}/env/v2.env"
  ok ".env 백업 완료"
else
  warn ".env 파일 없음 (스킵)"
fi

# ecosystem.config 백업
for f in "${V2_DIR}/ecosystem.config.js" "${V2_DIR}/ecosystem.config.cjs"; do
  [ -f "$f" ] && cp "$f" "${BACKUP_DIR}/env/" && log "  $(basename $f) 백업"
done

# v3 .env도 함께 백업 (비교용)
[ -f "${V3_DIR}/.env" ] && cp "${V3_DIR}/.env" "${BACKUP_DIR}/env/v3.env" && log "  v3 .env 백업 (비교용)"

# PM2 설정 덤프
pm2 save 2>/dev/null || warn "pm2 save 실패"
[ -f ~/.pm2/dump.pm2 ] && cp ~/.pm2/dump.pm2 "${BACKUP_DIR}/env/pm2_dump_${DATE}.pm2"
ok "PM2 설정 덤프 백업 완료"

# nginx 설정 백업
for nginx_dir in /etc/nginx/sites-available /etc/nginx/sites-enabled; do
  if [ -d "$nginx_dir" ]; then
    mkdir -p "${BACKUP_DIR}/env/nginx"
    cp "${nginx_dir}/"* "${BACKUP_DIR}/env/nginx/" 2>/dev/null && log "  nginx: ${nginx_dir} 백업"
  fi
done

# ── 4. dist 동일성 최종 검증 ──
echo ""
log "PHASE 4: dist/index.js 동일성 검증 (핵심 안전 확인)"

V3_DIST="${V3_DIR}/dist/index.js"
V2_DIST="${V2_DIR}/dist/index.js"

if [ -f "${V3_DIST}" ] && [ -f "${V2_DIST}" ]; then
  V3_MD5=$(md5sum "${V3_DIST}" | awk '{print $1}')
  V2_MD5=$(md5sum "${V2_DIST}" | awk '{print $1}')
  V3_SIZE=$(du -b "${V3_DIST}" | awk '{print $1}')
  V2_SIZE_BYTES=$(du -b "${V2_DIST}" | awk '{print $1}')

  echo "  v3 dist/index.js: ${V3_MD5} (${V3_SIZE} bytes)"
  echo "  v2 dist/index.js: ${V2_MD5} (${V2_SIZE_BYTES} bytes)"

  if [ "${V3_MD5}" == "${V2_MD5}" ]; then
    ok "dist/index.js 완전 일치 ✅ (리스크 없음 확인)"
  else
    warn "dist/index.js 불일치! 내용을 비교하여 확인 필요"
    echo "  → 실서비스는 이미 v3(millioai.com)이므로 v2 정지는 안전하나"
    echo "  → 코드 차이가 있으면 원인 파악 필요"
  fi
else
  warn "dist/index.js 파일 경로 확인 필요"
  [ ! -f "${V3_DIST}" ] && warn "  없음: ${V3_DIST}"
  [ ! -f "${V2_DIST}" ] && warn "  없음: ${V2_DIST}"
fi

# ── 5. 현재 서비스 상태 스냅샷 ──
echo ""
log "PHASE 5: 현재 서비스 상태 스냅샷 저장"

{
  echo "=== 백업 시각: $(date) ==="
  echo ""
  echo "--- PM2 상태 ---"
  pm2 list 2>/dev/null || echo "(pm2 없음)"
  echo ""
  echo "--- 포트 점유 ---"
  lsof -i :3001 -i :3002 2>/dev/null || ss -tlnp | grep -E "3001|3002"
  echo ""
  echo "--- 메모리 ---"
  free -h
  echo ""
  echo "--- 디스크 ---"
  df -h /root
  echo ""
  echo "--- v3 HTTP 응답 ---"
  curl -o /dev/null -s -w "localhost:3001 → HTTP %{http_code}\n" http://localhost:3001/ 2>/dev/null || echo "(응답 없음)"
} > "${BACKUP_DIR}/env/server_snapshot_${DATE}.txt"

ok "서버 스냅샷 저장 완료"

# ── 6. 백업 최종 요약 ──
echo ""
echo "═══════════════════════════════════════════════════"
echo "  📦 백업 완료 요약"
echo "  완료 시각: $(date '+%Y-%m-%d %H:%M:%S')"
echo "───────────────────────────────────────────────────"
echo "  전체 백업 크기: $(du -sh ${BACKUP_DIR} | cut -f1)"
echo "  위치: ${BACKUP_DIR}"
echo ""
ls -lh "${BACKUP_DIR}/db/" "${BACKUP_DIR}/src/" "${BACKUP_DIR}/env/" 2>/dev/null
echo "═══════════════════════════════════════════════════"
echo ""
echo "✅ 사전 백업 완료. 이제 v2 정지를 안전하게 진행할 수 있습니다."
echo ""
echo "다음 단계:"
echo "  1. pm2 stop 16          # v2 정지"
echo "  2. pm2 save             # 중지 상태 저장"
echo "  3. lsof -i :3002        # 포트 해제 확인"
echo "  4. 1주일 모니터링 후 rm -rf /root/haccpone-v2"
echo ""
