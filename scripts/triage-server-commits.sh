#!/bin/bash
# ==============================================================================
# 서버 로컬 커밋 분류 (triage) — READ-ONLY
# ==============================================================================
# 배경:
#   check-server-divergence.sh 는 "divergence 가 있는가" 만 답한다.
#   실제 수습에는 그 이상이 필요하다:
#     - 어느 저장소에 커밋이 앵커돼 있는가 (소스/배포 경로 이원화 확인)
#     - 로컬 커밋 중 어느 것이 이미 GitHub PR 에 같은 내용으로 존재하는가 (버려도 됨)
#     - 어느 것이 서버에만 있는 고유 커밋인가 (반드시 PR 로 건져야 함)
#     - 배포가 실제로 어느 스크립트/경로를 쓰는가
#
#   이 스크립트는 그 판정에 필요한 출력을 한 번에 뽑는다.
#
# 안전성:
#   git fetch / log / rev-parse / ls-files 와 pm2 조회만 수행한다.
#   checkout / pull / reset / clean / push / commit 을 절대 실행하지 않는다.
#
# 사용법:
#   bash scripts/triage-server-commits.sh
#   bash scripts/triage-server-commits.sh > /tmp/triage.txt 2>&1   # 출력 저장
#
# 종료 코드:
#   0 = 정상 완료 (판정 결과는 출력 참조)
#   2 = git 저장소를 찾지 못함
# ==============================================================================

set -uo pipefail   # -e 는 쓰지 않는다 (개별 git 실패를 삼키고 계속 진행)

# 비교 기준 브랜치
BASE_BRANCH="${BASE_BRANCH:-main}"
PR419_BRANCH="${PR419_BRANCH:-claude/demo-account-carousel-nzMEl}"
PR420_BRANCH="${PR420_BRANCH:-claude/next-session-todo-0nl3gj}"
OTHER_BRANCH="${OTHER_BRANCH:-claude/product-data-consistency-5nesyi}"

hr() { printf '%s\n' "──────────────────────────────────────────────────────────────"; }
sec() { echo; hr; echo " $1"; hr; }

echo "=============================================================="
echo " 서버 로컬 커밋 분류 (READ-ONLY)"
echo " $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo " host: $(hostname 2>/dev/null || echo unknown)"
echo "=============================================================="

# ─────────────────────────────────────────────────────────────
# [F] 후보 경로 스캔 — 어느 것이 git 저장소인가
# ─────────────────────────────────────────────────────────────
sec "[F] 저장소 후보 경로"

CANDIDATES=("/root/haccp_v3" "/home/root/haccp_v3/webapp" "/home/root/haccp_v3" "$(pwd)")
REPOS=()

for d in "${CANDIDATES[@]}"; do
  [ -d "$d" ] || { echo "  $d : (디렉터리 없음)"; continue; }
  if git -C "$d" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    top="$(git -C "$d" rev-parse --show-toplevel 2>/dev/null)"
    # 중복 제거
    dup=0
    for r in "${REPOS[@]:-}"; do [ "$r" = "$top" ] && dup=1; done
    [ "$dup" -eq 0 ] && REPOS+=("$top")
    echo "  $d"
    echo "      toplevel : $top"
    echo "      branch   : $(git -C "$d" rev-parse --abbrev-ref HEAD 2>/dev/null)"
    echo "      HEAD     : $(git -C "$d" rev-parse --short HEAD 2>/dev/null)"
    echo "      origin   : $(git -C "$d" remote get-url origin 2>/dev/null | sed 's#//[^@]*@#//***@#')"
  else
    echo "  $d : (git 저장소 아님)"
  fi
done

if [ "${#REPOS[@]}" -eq 0 ]; then
  echo; echo "❌ git 저장소를 찾지 못했습니다. 경로를 직접 지정해 재실행하세요."
  exit 2
fi

# ─────────────────────────────────────────────────────────────
# [G] 앵커 저장소 판정 — origin/main 대비 앞선 커밋이 가장 많은 곳
# ─────────────────────────────────────────────────────────────
sec "[G] 앵커 판정 (origin/$BASE_BRANCH 대비)"

ANCHOR=""
ANCHOR_AHEAD=-1

for r in "${REPOS[@]}"; do
  git -C "$r" fetch origin "$BASE_BRANCH" --quiet 2>/dev/null
  ahead="$(git -C "$r" rev-list --count "origin/$BASE_BRANCH..HEAD" 2>/dev/null || echo 0)"
  behind="$(git -C "$r" rev-list --count "HEAD..origin/$BASE_BRANCH" 2>/dev/null || echo 0)"
  untracked="$(git -C "$r" ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d ' ')"
  dirty="$(git -C "$r" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  echo "  $r"
  echo "      앞선 커밋 : $ahead   뒤진 커밋 : $behind"
  echo "      untracked : $untracked   미커밋 : $dirty"
  if [ "$ahead" -gt "$ANCHOR_AHEAD" ]; then ANCHOR="$r"; ANCHOR_AHEAD="$ahead"; fi
done

echo
echo "  ▶ 앵커 저장소 : $ANCHOR  (앞선 커밋 $ANCHOR_AHEAD 개)"

if [ "$ANCHOR_AHEAD" -eq 0 ]; then
  echo "  ▶ 서버에만 있는 커밋이 없습니다 — 구조할 것이 없습니다."
fi

R="$ANCHOR"
git -C "$R" fetch origin "$PR419_BRANCH" --quiet 2>/dev/null
git -C "$R" fetch origin "$PR420_BRANCH" --quiet 2>/dev/null
git -C "$R" fetch origin "$OTHER_BRANCH"  --quiet 2>/dev/null

# ─────────────────────────────────────────────────────────────
# [A] 서버 로컬 커밋 전체
# ─────────────────────────────────────────────────────────────
sec "[A] origin/$BASE_BRANCH 에 없는 서버 커밋 전체 ($ANCHOR_AHEAD 개)"
git -C "$R" log --oneline "origin/$BASE_BRANCH..HEAD" 2>/dev/null || echo "  (조회 실패)"

# ─────────────────────────────────────────────────────────────
# [B] #419 와 patch 동등성 — '=' 가 내용까지 같은 중복
# ─────────────────────────────────────────────────────────────
sec "[B] PR #419 와 patch 동등성  ( = 중복 / > 서버전용 / < #419전용 )"
if git -C "$R" rev-parse --verify "origin/$PR419_BRANCH" >/dev/null 2>&1; then
  git -C "$R" log --cherry-mark --left-right --oneline \
      "origin/$PR419_BRANCH...HEAD" 2>/dev/null || echo "  (조회 실패)"
else
  echo "  origin/$PR419_BRANCH 를 찾을 수 없습니다 (fetch 실패?)"
fi

# ─────────────────────────────────────────────────────────────
# [C] 구조 대상 — 중복 제외한 서버 고유 커밋
# ─────────────────────────────────────────────────────────────
sec "[C] ★ 서버 고유 커밋 = 새 PR 로 반드시 건져야 할 것"
if git -C "$R" rev-parse --verify "origin/$PR419_BRANCH" >/dev/null 2>&1; then
  # ★ 머지 커밋은 그대로 cherry-pick 할 수 없으므로 분리해서 보여준다
  UNIQUE="$(git -C "$R" log --oneline --no-merges --cherry-pick --right-only \
            "origin/$PR419_BRANCH...HEAD" 2>/dev/null)"
  MERGES="$(git -C "$R" log --oneline --merges --cherry-pick --right-only \
            "origin/$PR419_BRANCH...HEAD" 2>/dev/null)"

  if [ -z "$UNIQUE" ]; then
    echo "  (없음) — 서버 고유의 일반 커밋이 없습니다."
  else
    echo "$UNIQUE"
    echo
    echo "  ▶ 고유 커밋 수 (머지 제외) : $(printf '%s\n' "$UNIQUE" | wc -l | tr -d ' ')"
    echo "  ▶ cherry-pick 순서 (오래된 것부터):"
    git -C "$R" log --reverse --no-merges --format='     %h  %s' --cherry-pick --right-only \
        "origin/$PR419_BRANCH...HEAD" 2>/dev/null
    echo
    echo "     # 새 브랜치에 옮기는 예시 (main 머지 완료 후 실행):"
    echo "     #   git checkout -b rescue/server-unique origin/main"
    echo "     #   git cherry-pick <위 SHA 를 오래된 순서대로>"
  fi

  if [ -n "$MERGES" ]; then
    echo
    echo "  ── 머지 커밋 (cherry-pick 대상 아님, 참고용) ──"
    printf '%s\n' "$MERGES" | sed 's/^/     /'
    echo "     → 머지 커밋은 옮기지 않습니다. 위 일반 커밋만 cherry-pick 하면"
    echo "       내용은 동일하게 재현됩니다."
  fi
else
  echo "  (판정 불가 — #419 브랜치 없음)"
fi

# ─────────────────────────────────────────────────────────────
# [D] 다른 세션 브랜치 흡수 여부
# ─────────────────────────────────────────────────────────────
sec "[D] $OTHER_BRANCH 흡수 여부"
if git -C "$R" rev-parse --verify "origin/$OTHER_BRANCH" >/dev/null 2>&1; then
  N="$(git -C "$R" rev-list --count "HEAD..origin/$OTHER_BRANCH" 2>/dev/null || echo '?')"
  echo "  서버가 아직 갖지 못한 커밋 : $N 개"
  [ "$N" = "0" ] && echo "  → 이미 흡수됨. 별도 처리 불필요." \
                 || { echo "  → 미흡수. 아래 커밋은 별도 판단 필요:"; \
                      git -C "$R" log --oneline "HEAD..origin/$OTHER_BRANCH" 2>/dev/null | head -20; }
else
  echo "  origin/$OTHER_BRANCH 없음"
fi

# ─────────────────────────────────────────────────────────────
# [H] 배포 경로 / PM2
# ─────────────────────────────────────────────────────────────
sec "[H] 배포 경로 및 PM2"

echo "  ── 배포 스크립트 후보 ──"
for f in "$R/deploy.sh" "$R/scripts/deploy.sh" "$R/scripts/deploy-to-server.sh" \
         "/root/haccp_v3/scripts/deploy.sh"; do
  [ -f "$f" ] && echo "    ✅ $f" || echo "    ❌ $f (없음)"
done

echo
echo "  ── deploy.sh 가 기대하는 경로 ──"
if [ -f "$R/deploy.sh" ]; then
  grep -E '^(WEBAPP_DIR|DEPLOY_DIR|BUILD_DIR)=' "$R/deploy.sh" 2>/dev/null | sed 's/^/    /'
  for v in $(grep -E '^(WEBAPP_DIR|DEPLOY_DIR)=' "$R/deploy.sh" 2>/dev/null | cut -d'"' -f2); do
    [ -d "$v" ] && echo "    ✅ 존재: $v" || echo "    ❌ 없음: $v  ← deploy.sh 그대로 못 씀"
  done
fi

echo
echo "  ── PM2 ──"
if command -v pm2 >/dev/null 2>&1; then
  pm2 list 2>/dev/null | sed 's/^/    /'
  echo
  pm2 describe haccpone 2>/dev/null | grep -E "script path|exec cwd|status|restarts" | sed 's/^/    /'
else
  echo "    pm2 명령 없음"
fi

# ─────────────────────────────────────────────────────────────
# 요약 및 다음 조치
# ─────────────────────────────────────────────────────────────
sec "요약 / 다음 조치"
echo "  앵커 저장소   : $R"
echo "  서버 전용 커밋: $ANCHOR_AHEAD 개"
echo
echo "  ▶ 배포 전에 반드시 백업 (이 스크립트는 실행하지 않음):"
echo
echo "      git -C $R push origin HEAD:refs/heads/server_local_backup_$(date +%Y%m%d)"
echo
echo "    새 ref 만 만들고 기존 브랜치·작업트리를 건드리지 않습니다."
echo "    [C] 의 고유 커밋을 새 PR 로 올리기 전에는 checkout/pull 하지 마십시오."
echo
