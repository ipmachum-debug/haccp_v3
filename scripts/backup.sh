#!/bin/bash
# ═══════════════════════════════════════════════════════
# Millio AI 자동 백업 스크립트
# crontab: 0 2 * * * /home/root/haccp_v3/scripts/backup.sh
# ═══════════════════════════════════════════════════════

set -euo pipefail

# ── 설정 ──
BACKUP_DIR="/home/root/backups/haccp"
DB_NAME="${DB_NAME:-haccp_v3}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASSWORD:-}"
DB_HOST="${DB_HOST:-localhost}"
APP_DIR="/home/root/haccp_v3"
RETENTION_DAYS=30  # 30일 보관 후 자동 삭제
DATE=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${BACKUP_DIR}/backup.log"

# ── 디렉토리 생성 ──
mkdir -p "${BACKUP_DIR}/db"
mkdir -p "${BACKUP_DIR}/files"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

log "═══ 백업 시작 ═══"

# ── 1. MySQL 데이터베이스 백업 ──
DB_BACKUP="${BACKUP_DIR}/db/${DB_NAME}_${DATE}.sql.gz"
log "1. DB 백업: ${DB_BACKUP}"

MYSQL_PWD="${DB_PASS}" mysqldump \
  -h "${DB_HOST}" \
  -u "${DB_USER}" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --set-gtid-purged=OFF \
  "${DB_NAME}" 2>>"${LOG_FILE}" | gzip > "${DB_BACKUP}"

DB_SIZE=$(du -sh "${DB_BACKUP}" | cut -f1)
log "   ✅ DB 백업 완료 (${DB_SIZE})"

# ── 2. 업로드 파일 백업 (uploads, public) ──
FILES_BACKUP="${BACKUP_DIR}/files/uploads_${DATE}.tar.gz"
log "2. 파일 백업: ${FILES_BACKUP}"

if [ -d "${APP_DIR}/uploads" ] || [ -d "${APP_DIR}/public/uploads" ]; then
  tar -czf "${FILES_BACKUP}" \
    -C "${APP_DIR}" \
    $([ -d "${APP_DIR}/uploads" ] && echo "uploads") \
    $([ -d "${APP_DIR}/public/uploads" ] && echo "public/uploads") \
    2>>"${LOG_FILE}" || true
  FILES_SIZE=$(du -sh "${FILES_BACKUP}" 2>/dev/null | cut -f1 || echo "0")
  log "   ✅ 파일 백업 완료 (${FILES_SIZE})"
else
  log "   ⏭️ 업로드 디렉토리 없음, 스킵"
fi

# ── 3. 환경설정 백업 (.env, PM2 설정) ──
ENV_BACKUP="${BACKUP_DIR}/files/env_${DATE}.tar.gz"
log "3. 환경설정 백업"

tar -czf "${ENV_BACKUP}" \
  -C "${APP_DIR}" \
  $([ -f "${APP_DIR}/.env" ] && echo ".env") \
  $([ -f "${APP_DIR}/ecosystem.config.js" ] && echo "ecosystem.config.js") \
  $([ -f "${APP_DIR}/ecosystem.config.cjs" ] && echo "ecosystem.config.cjs") \
  2>>"${LOG_FILE}" || true
log "   ✅ 환경설정 백업 완료"

# ── 4. 오래된 백업 자동 삭제 ──
log "4. ${RETENTION_DAYS}일 이상 오래된 백업 삭제"
DELETED_DB=$(find "${BACKUP_DIR}/db" -name "*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
DELETED_FILES=$(find "${BACKUP_DIR}/files" -name "*.tar.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
log "   삭제: DB ${DELETED_DB}건, 파일 ${DELETED_FILES}건"

# ── 5. 백업 현황 요약 ──
TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" | cut -f1)
DB_COUNT=$(ls -1 "${BACKUP_DIR}/db/"*.sql.gz 2>/dev/null | wc -l)
log "═══ 백업 완료 ═══"
log "   전체 크기: ${TOTAL_SIZE}, DB 백업 ${DB_COUNT}개 보관 중"
log ""
