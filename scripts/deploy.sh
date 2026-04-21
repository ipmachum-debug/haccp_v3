#!/bin/bash
# ═══════════════════════════════════════════════════════
# Millio AI 자동 배포 스크립트
# GitHub Actions 가 /api/system/deploy 를 호출하면 이 스크립트가 실행된다.
# 서버 안에서 실행되며, SSH 접속 없음.
# ═══════════════════════════════════════════════════════

set -euo pipefail

# ── 설정 (환경변수 오버라이드 가능) ──
APP_DIR="${APP_DIR:-/root/haccp_v3}"
PM2_NAME="${PM2_NAME:-haccpone}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-genspark_ai_developer}"
LOG_DIR="${APP_DIR}/logs"
LOG_FILE="${LOG_DIR}/deploy.log"

mkdir -p "${LOG_DIR}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

cd "${APP_DIR}"

log "═══ 배포 시작 ═══"
log "APP_DIR: ${APP_DIR}"
log "PM2_NAME: ${PM2_NAME}"
log "BRANCH: ${DEPLOY_BRANCH}"
log "현재 커밋: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"

# ── 1. Git pull (fast-forward only, 안전) ──
log "1. git fetch origin ${DEPLOY_BRANCH}"
git fetch origin "${DEPLOY_BRANCH}" 2>&1 | tee -a "${LOG_FILE}"

log "   git checkout ${DEPLOY_BRANCH}"
git checkout "${DEPLOY_BRANCH}" 2>&1 | tee -a "${LOG_FILE}"

log "   git pull --ff-only origin ${DEPLOY_BRANCH}"
if ! git pull --ff-only origin "${DEPLOY_BRANCH}" 2>&1 | tee -a "${LOG_FILE}"; then
  log "   ❌ fast-forward 실패 — 로컬에 병합되지 않은 커밋 존재 가능성"
  log "   현재 상태: $(git status --short | head -10)"
  exit 1
fi

NEW_COMMIT=$(git rev-parse --short HEAD)
log "   ✅ 업데이트 완료 (새 커밋: ${NEW_COMMIT})"

# ── 2. 의존성 설치 ──
log "2. npm install (package-lock 기반, devDeps 포함 — 빌드 필요)"
npm install 2>&1 | tail -30 | tee -a "${LOG_FILE}"

# ── 3. 빌드 ──
log "3. npm run build"
if ! npm run build 2>&1 | tail -80 | tee -a "${LOG_FILE}"; then
  log "   ❌ 빌드 실패 — 운영 서버는 이전 버전 유지됨 (restart 스킵)"
  exit 1
fi
log "   ✅ 빌드 완료"

# ── 4. PM2 재시작 ──
log "4. pm2 restart ${PM2_NAME} --update-env"
pm2 restart "${PM2_NAME}" --update-env 2>&1 | tee -a "${LOG_FILE}"

# ── 5. 헬스 확인 (5초 대기 후 PM2 상태) ──
sleep 5
PM2_STATUS=$(pm2 jlist 2>/dev/null | node -e "
try {
  const list = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
  const p = list.find(x => x.name === '${PM2_NAME}');
  if (!p) { console.log('NOT_FOUND'); process.exit(0); }
  console.log(p.pm2_env.status + ':' + (p.pm2_env.restart_time || 0));
} catch(e) { console.log('ERROR'); }
" 2>/dev/null || echo "ERROR")

log "   PM2 상태: ${PM2_STATUS}"

if [[ "${PM2_STATUS}" == online:* ]]; then
  log "═══ 배포 완료 (커밋: ${NEW_COMMIT}) ═══"
  exit 0
else
  log "   ⚠️ PM2 프로세스가 online 상태가 아님 — 로그 확인 필요"
  log "   pm2 logs ${PM2_NAME} --lines 50"
  exit 1
fi
