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
# NODE_ENV=production 환경에서도 devDeps(vite/esbuild) 가 설치되도록
# --include=dev 플래그 명시.
log "2. npm install --include=dev (빌드 도구 vite/esbuild 필요)"
npm install --include=dev 2>&1 | tail -30 | tee -a "${LOG_FILE}"

# ── 3. 빌드 ──
log "3. npm run build"
if ! npm run build 2>&1 | tail -80 | tee -a "${LOG_FILE}"; then
  log "   ❌ 빌드 실패 — 운영 서버는 이전 버전 유지됨 (restart 스킵)"
  exit 1
fi
log "   ✅ 빌드 완료"

# ── 4. PM2 재시작 (detached — 자기 자신을 재시작하는 문제 회피) ──
# 지금 이 스크립트는 haccpone 서버의 자식 프로세스로 실행 중이다.
# 바로 `pm2 restart haccpone` 를 호출하면 부모(haccpone) 가 죽으면서
# 이 스크립트도 같이 SIGTERM 으로 죽어 HTTP 응답이 호출자에게 전달되지 못한다.
#
# 해결: setsid + nohup 으로 세션을 분리하고, 5초 후 background 에서 pm2 restart.
# 그 사이에 deploy.sh 가 깨끗하게 exit 0 → Node 엔드포인트가 HTTP 응답 전송 →
# GitHub Actions 수신 → 그 뒤 pm2 가 haccpone 재시작.
log "4. pm2 restart ${PM2_NAME} --update-env (5초 후 background 실행)"

setsid bash -c "
  sleep 5
  echo '[\$(date '+%Y-%m-%d %H:%M:%S')] [detached] pm2 restart 시작' >> '${LOG_FILE}'
  pm2 restart '${PM2_NAME}' --update-env >> '${LOG_FILE}' 2>&1
  echo '[\$(date '+%Y-%m-%d %H:%M:%S')] [detached] pm2 restart 완료' >> '${LOG_FILE}'
" < /dev/null > /dev/null 2>&1 &

log "═══ 배포 스크립트 완료 (커밋: ${NEW_COMMIT}) ═══"
log "   PM2 재시작은 5초 뒤 background 에서 실행됨"
log "   확인: tail -20 ${LOG_FILE}  (재시작 완료 메시지 포함)"
exit 0
