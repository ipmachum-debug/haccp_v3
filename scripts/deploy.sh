#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Millio AI 자동 배포 스크립트 (PR-D1, 2026-04-27)
# ═══════════════════════════════════════════════════════════════════
#
# GitHub Actions 가 /api/system/deploy 를 호출하면 이 스크립트가 실행된다.
# 서버 안에서 실행되며, SSH 접속 없음.
#
# 흐름 (이전 흐름의 OOM 버그 해결):
#   ❌ 이전: git pull → npm install → npm run build → pm2 restart
#           → 8GB RAM 으로 vite/esbuild OOM Kill → MySQL/PM2 동반 사망
#
#   ✅ 신규: git fetch (코드 sync 만) → Release 자산 다운로드 → 검증 → atomic swap → pm2 reload
#           → 빌드는 GitHub Actions 러너에서 끝났으므로 서버 메모리 영향 거의 없음
#
# 입력 환경변수 (Node 엔드포인트가 주입):
#   RELEASE_TAG       — 배포할 release tag (예: v0.8.3) [필수]
#   ASSET_NAME        — 자산 파일명 (예: dist-v0.8.3-abc1234.tar.gz) [필수]
#   EXPECTED_SHA256   — 자산 SHA256 체크섬 [선택, 있으면 검증]
#
# 서버 측 .env 필수:
#   GITHUB_TOKEN      — Release 자산 다운로드용 (Fine-grained PAT 또는 Classic, contents:read 이상)
#
# 동작 보장:
#   - 다운로드/추출 실패 시 기존 dist 그대로 유지 (atomic swap 패턴)
#   - 직전 dist 는 dist.bak.<timestamp> 로 백업 → 즉시 롤백 가능
#   - 5개 이상 백업 누적 시 가장 오래된 것부터 자동 정리

set -euo pipefail

# ── 설정 ──
APP_DIR="${APP_DIR:-/root/haccp_v3}"
PM2_NAME="${PM2_NAME:-haccpone}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
GH_REPO="${GH_REPO:-ipmachum-debug/haccp_v3}"
LOG_DIR="${APP_DIR}/logs"
LOG_FILE="${LOG_DIR}/deploy.log"
BACKUP_KEEP="${BACKUP_KEEP:-5}"   # dist 백업 최대 개수

mkdir -p "${LOG_DIR}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

err() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ $1" | tee -a "${LOG_FILE}" >&2
}

cd "${APP_DIR}"

log "═══ 배포 시작 (PR-D1: Release 자산 기반) ═══"
log "APP_DIR:       ${APP_DIR}"
log "PM2_NAME:      ${PM2_NAME}"
log "BRANCH:        ${DEPLOY_BRANCH}"
log "RELEASE_TAG:   ${RELEASE_TAG:-(미설정)}"
log "ASSET_NAME:    ${ASSET_NAME:-(미설정)}"
log "EXPECTED_SHA:  ${EXPECTED_SHA256:-(미검증)}"

# ── 사전 검증 ──
if [ -z "${RELEASE_TAG:-}" ]; then
  err "RELEASE_TAG 환경변수 필수 (예: v0.8.3)"
  exit 2
fi

if [ -z "${ASSET_NAME:-}" ]; then
  err "ASSET_NAME 환경변수 필수 (예: dist-v0.8.3-abc1234.tar.gz)"
  exit 2
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
  err "GITHUB_TOKEN 환경변수 누락 — .env 에 추가 필요"
  exit 2
fi

# 필수 도구 점검
for cmd in curl jq tar sha256sum git pm2; do
  if ! command -v "$cmd" &>/dev/null; then
    err "필수 도구 '$cmd' 미설치"
    exit 2
  fi
done

# ── retry helper (Plan B-alt 2026-04-30) ──
#   배경: v0.8.84-86 연속 배포 실패 — GitHub release CDN 자산 다운로드가
#         암묵적 5분 timeout 을 초과하여 curl 실패. retry 없이 즉시 종료되어
#         일시적 CDN/네트워크 장애에도 무방비.
#   대응: curl 호출을 감싸는 retry helper.
#     - timeout 명시 (--connect-timeout 30, --max-time 600)
#     - exponential backoff (15s → 30s → 60s)
#     - 최대 4회 시도 (성공 시 즉시 break)
#     - curl 의 --retry 옵션과 동등하나, 로깅 + log() 포맷 + 4xx 즉시 중단 동작 추가
#
# 사용법: curl_retry <설명> [curl 옵션...]
#   helper 가 'curl' 명령을 직접 호출하며, --connect-timeout / --max-time 을
#   호출자 옵션 뒤에 추가하여 호출자 설정을 보존.
# 예:
#   curl_retry "release 메타정보 조회" -fsSL -H "..." "https://..."
#   curl_retry "자산 다운로드"        -fsSL -H "..." -o "out.tar.gz" "https://..."
#
# 환경변수로 튜닝 가능:
#   DEPLOY_CURL_MAX_ATTEMPTS    (기본 4)
#   DEPLOY_CURL_BACKOFF_BASE    (기본 15초)
#   DEPLOY_CURL_CONNECT_TIMEOUT (기본 30초)
#   DEPLOY_CURL_MAX_TIME        (기본 600초 = 10분)
curl_retry() {
  local description="$1"
  shift  # 나머지는 curl 옵션

  local max_attempts="${DEPLOY_CURL_MAX_ATTEMPTS:-4}"
  local backoff_base="${DEPLOY_CURL_BACKOFF_BASE:-15}"
  local connect_timeout="${DEPLOY_CURL_CONNECT_TIMEOUT:-30}"
  local max_time="${DEPLOY_CURL_MAX_TIME:-600}"

  local attempt=1
  local exit_code=0

  while [ "${attempt}" -le "${max_attempts}" ]; do
    # 시도별 안내는 stderr 로 (캡처되지 않도록).
    echo "[$(date '+%Y-%m-%d %H:%M:%S')]    [retry ${attempt}/${max_attempts}] ${description} (connect-timeout=${connect_timeout}s, max-time=${max_time}s)" >> "${LOG_FILE}"

    # curl 호출 — 호출자 옵션을 그대로 통과시키고 timeout 만 추가.
    curl --connect-timeout "${connect_timeout}" --max-time "${max_time}" "$@"
    exit_code=$?

    # 0 = 성공
    if [ "${exit_code}" -eq 0 ]; then
      if [ "${attempt}" -gt 1 ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')]    ✅ ${description} retry ${attempt} 회차에서 성공" >> "${LOG_FILE}"
      fi
      return 0
    fi

    # 22 = HTTP 4xx (curl -f 와 함께) → 영구 에러, retry 무의미
    if [ "${exit_code}" -eq 22 ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')]    ❌ ${description} HTTP 4xx 영구 에러 (curl exit 22) — retry 중단" >> "${LOG_FILE}"
      return 22
    fi

    # 마지막 시도였으면 retry 안 함
    if [ "${attempt}" -ge "${max_attempts}" ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')]    ❌ ${description} ${max_attempts}회 모두 실패 (마지막 curl exit=${exit_code})" >> "${LOG_FILE}"
      return "${exit_code}"
    fi

    # exponential backoff: 15s → 30s → 60s
    local backoff=$(( backoff_base * (1 << (attempt - 1)) ))
    case "${exit_code}" in
      28)  echo "[$(date '+%Y-%m-%d %H:%M:%S')]    ⚠️ timeout (curl exit 28) — ${backoff}초 후 재시도" >> "${LOG_FILE}" ;;
      6|7) echo "[$(date '+%Y-%m-%d %H:%M:%S')]    ⚠️ DNS/connection 실패 (curl exit ${exit_code}) — ${backoff}초 후 재시도" >> "${LOG_FILE}" ;;
      *)   echo "[$(date '+%Y-%m-%d %H:%M:%S')]    ⚠️ 일시 장애 (curl exit ${exit_code}) — ${backoff}초 후 재시도" >> "${LOG_FILE}" ;;
    esac
    sleep "${backoff}"

    attempt=$(( attempt + 1 ))
  done

  return "${exit_code}"
}

# ── 1. Git 코드 동기화 (메타데이터/소스용 — 빌드는 안 함) ──
# 서버에서 실제로 실행되는 건 dist/index.js 이므로 git 동기화는 사실상 메타데이터(스크립트, docs) 용.
# 그래도 서버에서 npx tsx scripts/_*.ts 로 진단 스크립트 돌릴 수 있으니 sync 는 해둔다.
log "1. git fetch + reset (코드 메타데이터 동기화)"
git fetch origin "${DEPLOY_BRANCH}" 2>&1 | tee -a "${LOG_FILE}"

DIRTY_FILES=$(git status --short | head -20)
if [ -n "${DIRTY_FILES}" ]; then
  log "   ⚠️ 로컬 변경 감지 — origin 으로 덮어쓰기:"
  echo "${DIRTY_FILES}" | tee -a "${LOG_FILE}"
fi

git checkout "${DEPLOY_BRANCH}" 2>&1 | tee -a "${LOG_FILE}"
git reset --hard "origin/${DEPLOY_BRANCH}" 2>&1 | tee -a "${LOG_FILE}"
NEW_COMMIT=$(git rev-parse --short HEAD)
log "   ✅ git sync 완료 (HEAD: ${NEW_COMMIT})"

# ── 2. Release 자산 다운로드 ──
log "2. Release 자산 다운로드"

WORK_DIR=$(mktemp -d -p "${APP_DIR}" .deploy.tmp.XXXXXX)
trap 'rm -rf "${WORK_DIR}"' EXIT

# GitHub API 로 자산 ID 조회 (retry/timeout helper 적용 — Plan B-alt)
log "   → release '${RELEASE_TAG}' 메타정보 조회"
RELEASE_JSON=$(curl_retry "release 메타정보 조회" -fsSL \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${GH_REPO}/releases/tags/${RELEASE_TAG}" 2>&1) || {
    err "release '${RELEASE_TAG}' 조회 실패 (token 권한? tag 오타? 또는 retry 4회 모두 실패)"
    exit 3
}

ASSET_ID=$(echo "${RELEASE_JSON}" | jq -r --arg n "${ASSET_NAME}" '.assets[] | select(.name == $n) | .id' | head -1)
ASSET_SIZE=$(echo "${RELEASE_JSON}" | jq -r --arg n "${ASSET_NAME}" '.assets[] | select(.name == $n) | .size' | head -1)

if [ -z "${ASSET_ID}" ] || [ "${ASSET_ID}" = "null" ]; then
  err "release '${RELEASE_TAG}' 에 자산 '${ASSET_NAME}' 없음"
  echo "   → 사용 가능한 자산:" | tee -a "${LOG_FILE}"
  echo "${RELEASE_JSON}" | jq -r '.assets[].name' | sed 's/^/      - /' | tee -a "${LOG_FILE}"
  exit 3
fi

log "   → asset_id=${ASSET_ID}, size=${ASSET_SIZE} bytes"

# 자산 다운로드 (octet-stream 으로 받아야 실제 파일이 옴) — retry/timeout helper 적용 (Plan B-alt)
#   v0.8.84-86 연속 timeout 실패 (CDN 자산 다운로드 5분 초과) 의 핵심 fix 지점.
log "   → 다운로드 진행 (retry up to ${DEPLOY_CURL_MAX_ATTEMPTS:-4} attempts, max-time ${DEPLOY_CURL_MAX_TIME:-600}s)"
curl_retry "자산 다운로드 (${ASSET_NAME})" -fsSL \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/octet-stream" \
  -o "${WORK_DIR}/${ASSET_NAME}" \
  "https://api.github.com/repos/${GH_REPO}/releases/assets/${ASSET_ID}" || {
    err "자산 다운로드 실패 (retry 4회 모두 실패 — CDN 장기 장애 가능성)"
    exit 3
}

DL_SIZE=$(stat -c%s "${WORK_DIR}/${ASSET_NAME}")
log "   ✅ 다운로드 완료 (${DL_SIZE} bytes)"

# 크기 검증
if [ -n "${ASSET_SIZE}" ] && [ "${ASSET_SIZE}" != "null" ] && [ "${DL_SIZE}" != "${ASSET_SIZE}" ]; then
  err "다운로드 크기 불일치 (기대: ${ASSET_SIZE}, 실제: ${DL_SIZE})"
  exit 3
fi

# ── 3. SHA256 검증 (선택적) ──
if [ -n "${EXPECTED_SHA256:-}" ]; then
  log "3. SHA256 체크섬 검증"
  ACTUAL_SHA256=$(sha256sum "${WORK_DIR}/${ASSET_NAME}" | cut -d' ' -f1)
  if [ "${ACTUAL_SHA256}" != "${EXPECTED_SHA256}" ]; then
    err "SHA256 불일치"
    err "   기대: ${EXPECTED_SHA256}"
    err "   실제: ${ACTUAL_SHA256}"
    exit 4
  fi
  log "   ✅ SHA256 일치 (${ACTUAL_SHA256:0:16}...)"
else
  log "3. SHA256 검증 스킵 (EXPECTED_SHA256 미제공)"
fi

# ── 4. tar 추출 → 신규 dist 디렉터리 준비 ──
log "4. 자산 추출"
tar -xzf "${WORK_DIR}/${ASSET_NAME}" -C "${WORK_DIR}" || {
  err "tar 추출 실패"
  exit 5
}

# 추출된 dist 디렉터리 검증
if [ ! -f "${WORK_DIR}/dist/index.js" ]; then
  err "추출된 자산에 dist/index.js 없음"
  exit 5
fi

if [ ! -d "${WORK_DIR}/dist/public" ]; then
  err "추출된 자산에 dist/public 디렉터리 없음"
  exit 5
fi

NEW_INDEX_SIZE=$(du -h "${WORK_DIR}/dist/index.js" | cut -f1)
NEW_PUBLIC_SIZE=$(du -sh "${WORK_DIR}/dist/public" | cut -f1)
log "   ✅ 추출 완료: index.js ${NEW_INDEX_SIZE}, public ${NEW_PUBLIC_SIZE}"

# ── 5. Atomic swap (기존 dist → 백업, 신규 dist → 활성화) ──
log "5. dist atomic swap"

TS=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="dist.bak.${TS}"

# 기존 dist 가 있으면 백업으로 rename (mv 는 같은 파일시스템에서 atomic)
if [ -d "${APP_DIR}/dist" ]; then
  mv "${APP_DIR}/dist" "${APP_DIR}/${BACKUP_NAME}"
  log "   → 기존 dist → ${BACKUP_NAME}"
fi

# 신규 dist 를 본 자리로 이동
mv "${WORK_DIR}/dist" "${APP_DIR}/dist"
log "   ✅ 신규 dist 활성화"

# 오래된 백업 정리 (BACKUP_KEEP 개 초과 시)
BACKUP_COUNT=$(ls -1d "${APP_DIR}"/dist.bak.* 2>/dev/null | wc -l)
if [ "${BACKUP_COUNT}" -gt "${BACKUP_KEEP}" ]; then
  EXCESS=$((BACKUP_COUNT - BACKUP_KEEP))
  log "   → 오래된 백업 ${EXCESS} 개 정리"
  ls -1dt "${APP_DIR}"/dist.bak.* | tail -n "${EXCESS}" | xargs -r rm -rf
fi

# ── 6. PM2 reload (detached — 자기 자신 죽이지 않도록) ──
# 본 스크립트는 haccpone 의 자식 프로세스이므로, 직접 reload 하면
# 자기 자신이 SIGTERM 받아 HTTP 응답을 호출자에게 못 돌려줌.
# setsid + nohup 으로 분리하고 5초 후 background reload.
log "6. pm2 reload ${PM2_NAME} --update-env (5초 후 background)"
setsid bash -c "
  sleep 5
  echo '[\$(date '+%Y-%m-%d %H:%M:%S')] [detached] pm2 reload 시작' >> '${LOG_FILE}'
  pm2 reload '${PM2_NAME}' --update-env >> '${LOG_FILE}' 2>&1
  echo '[\$(date '+%Y-%m-%d %H:%M:%S')] [detached] pm2 reload 완료' >> '${LOG_FILE}'
" < /dev/null > /dev/null 2>&1 &

log "═══ 배포 스크립트 완료 ═══"
log "   release:  ${RELEASE_TAG}"
log "   commit:   ${NEW_COMMIT}"
log "   backup:   ${BACKUP_NAME}"
log "   PM2 reload 는 5초 뒤 background 에서 실행됨"
log "   확인:     tail -20 ${LOG_FILE}"

exit 0
