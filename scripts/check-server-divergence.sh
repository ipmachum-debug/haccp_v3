#!/bin/bash
# ==============================================================================
# 서버 divergence 감시 스크립트
# ==============================================================================
# 배경:
#   2026-04-22 운영 서버에서 141커밋이 GitHub 에 push 되지 않은 채
#   2~3개월 방치된 사고 발생 (server_local_backup_20260422 로 복구).
#   이 스크립트는 같은 사고를 재발 방지하기 위해 매일 실행.
#
# 사용법:
#   # 1회 실행 (수동)
#   ./scripts/check-server-divergence.sh
#
#   # cron 등록 (서버에서 매일 오전 8시)
#   crontab -e
#   0 8 * * * cd /home/root/haccp_v3/webapp && \
#     ./scripts/check-server-divergence.sh >> /var/log/divergence.log 2>&1
#
# 종료 코드:
#   0 = 정상 (서버 == origin)
#   1 = divergence 감지 (action 필요)
#   2 = 스크립트 자체 오류
#
# ==============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
ALERT_FILE="${ALERT_FILE:-/tmp/divergence-alert.txt}"

echo "======================================================================"
echo " Server Divergence Check"
echo " $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo " Repo: $REPO_ROOT"
echo " Branch: $BRANCH"
echo "======================================================================"

# 1. origin 최신 정보 fetch (읽기 전용)
git fetch origin "$BRANCH" --quiet 2>&1 || {
  echo "⚠️  fetch 실패 — 네트워크 확인 필요"
  exit 2
}

# 2. 로컬에만 있고 origin 에 없는 커밋 수
UNPUSHED=$(git log "origin/$BRANCH..HEAD" --oneline | wc -l | tr -d ' ')

# 3. origin 에만 있고 로컬에 없는 커밋 수
UNPULLED=$(git log "HEAD..origin/$BRANCH" --oneline | wc -l | tr -d ' ')

echo "로컬 전용 커밋 (push 안 됨):  $UNPUSHED"
echo "원격 전용 커밋 (pull 안 됨):  $UNPULLED"
echo ""

if [ "$UNPUSHED" -gt 0 ]; then
  echo "🚨 로컬에 push 되지 않은 커밋이 있습니다."
  echo ""
  echo "─── 미-push 커밋 목록 ───"
  git log "origin/$BRANCH..HEAD" --oneline
  echo "────────────────────────────"
  echo ""
  echo "즉시 조치:"
  echo "  1. 의도된 hotfix 인가? → 1시간 이내 GitHub PR 로 올릴 것"
  echo "  2. 실수로 서버에서 커밋된 것인가? → git reset --soft 로 되돌림 고려"
  echo "  3. 코드 리뷰 없이 운영 중? → 즉시 동기화"
  echo ""

  # 알림 파일 생성 (다른 프로세스가 읽을 수 있게)
  {
    echo "[$(date '+%Y-%m-%d %H:%M')] Divergence detected"
    echo "Branch: $BRANCH"
    echo "Unpushed commits: $UNPUSHED"
    git log "origin/$BRANCH..HEAD" --oneline
  } > "$ALERT_FILE"

  # Slack 알림 (webhook 환경변수 있을 때만)
  if [ -n "$SLACK_WEBHOOK" ]; then
    MESSAGE="🚨 [haccp_v3] 서버에 push 되지 않은 커밋 ${UNPUSHED}개 감지 (브랜치: ${BRANCH})"
    curl -s -X POST -H 'Content-type: application/json' \
      --data "{\"text\":\"${MESSAGE}\"}" \
      "$SLACK_WEBHOOK" >/dev/null 2>&1 || true
  fi

  exit 1
fi

if [ "$UNPULLED" -gt 0 ]; then
  echo "⚠️  원격에 새 커밋 ${UNPULLED}개 있음 — 배포 반영 필요할 수 있음"
  echo ""
  echo "─── 미-pull 커밋 목록 ───"
  git log "HEAD..origin/$BRANCH" --oneline
  echo "────────────────────────────"
fi

echo "✅ Divergence 없음 — 서버와 origin/$BRANCH 동기 상태"
exit 0
