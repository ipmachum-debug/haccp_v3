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

# ── 1. Git fetch + hard sync ──
# 운영 서버는 항상 origin 과 정확히 일치해야 한다.
# 로컬 변경(자동 생성된 lock 파일 등)은 버리고 origin 기준으로 강제 동기화.
log "1. git fetch origin ${DEPLOY_BRANCH}"
git fetch origin "${DEPLOY_BRANCH}" 2>&1 | tee -a "${LOG_FILE}"

# 변경된 파일 있으면 로그에 기록 (디버깅용)
DIRTY_FILES=$(git status --short | head -20)
if [ -n "${DIRTY_FILES}" ]; then
  log "   ⚠️ 로컬 변경 감지 — origin 기준으로 덮어쓰기:"
  echo "${DIRTY_FILES}" | tee -a "${LOG_FILE}"
fi

log "   git checkout ${DEPLOY_BRANCH}"
git checkout "${DEPLOY_BRANCH}" 2>&1 | tee -a "${LOG_FILE}"

log "   git reset --hard origin/${DEPLOY_BRANCH}"
git reset --hard "origin/${DEPLOY_BRANCH}" 2>&1 | tee -a "${LOG_FILE}"

NEW_COMMIT=$(git rev-parse --short HEAD)
log "   ✅ 동기화 완료 (새 커밋: ${NEW_COMMIT})"

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
