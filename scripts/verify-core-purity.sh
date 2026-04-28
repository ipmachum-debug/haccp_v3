#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# 코어 침투 검증 — Strangler Fig 이주 중에도 작동하는 결합도 자동 검사
# ═══════════════════════════════════════════════════════════════════════════
#
# 트리거: PR #118 외부 실사 자료 Part III, 7장 "모듈 침투 검증" 인사이트
#
# 검증 항목:
#   1. 코어 영역에서 industry 모듈 *import* 만 검출 (가장 명확한 결합)
#      — 문자열 리터럴 / 주석 / 마케팅 텍스트는 false positive 라 제외
#   2. dependency-cruiser 룰 호출 (architecture-check 와 동일)
#   3. (보류) 어댑터 분리 빌드 — Phase A-1 디렉토리 이주 후 활성화
#
# 호출:
#   bash scripts/verify-core-purity.sh
#
# CI:
#   .github/workflows/architecture-check.yml 에서 자동 실행
#
# 우리 구조 적용 (PR #118 의 monorepo 와 다름):
#   - 미래 디렉토리 (server/{core-erp, core-mes, shared-kernel, platform}/) 는
#     비어있을 때부터 검증 작동 → 채워질 때 자동으로 침투 차단
#   - 현재 평탄 코어 파일 (server/_core/, server/utils/schedulerLock.ts 등) 은
#     화이트리스트 기반 검사
#
# Strangler Fig:
#   현재 결합 0 상태에서 즉시 통과 → 향후 회귀 영구 차단
# ═══════════════════════════════════════════════════════════════════════════

set -uo pipefail
cd "$(dirname "$0")/.."

# ── 코어 영역 정의 ────────────────────────────────────────────────────────

# 미래 5계층 디렉토리 (비어있어도 검증 작동)
FUTURE_CORE_DIRS=(
  "server/core-erp"
  "server/core-mes"
  "server/shared-kernel"
  "server/platform"
)

# 현재 평탄 코어 영역 (화이트리스트)
CURRENT_CORE_PATHS=(
  "server/_core"
  "server/utils/schedulerLock.ts"
  "server/db/connection.ts"
  "server/lib/journalHelper.ts"
)

# ── industry 모듈 import 패턴 ─────────────────────────────────────────────
#
# **static import** 구문만 검출 (코드 식별자, 결합 명시).
# 문자열 리터럴 / 주석 / 마케팅 텍스트 / session prefix 등은 false positive 라 제외.
# **dynamic import (await import("..."))** 는 lazy loading 패턴으로 의도된 사용
# 케이스가 있어 검출에서 제외 (필요 시 별도 ESLint 룰).
INDUSTRY_IMPORT_PATTERNS=(
  "^[[:space:]]*import.*from[[:space:]]+['\"][^'\"]*\\bhaccp\\b"
  "^[[:space:]]*import.*from[[:space:]]+['\"][^'\"]*\\bHACCP\\b"
  "^[[:space:]]*import.*from[[:space:]]+['\"][^'\"]*\\bccp(Form|Records|Schedule|Template|Monitoring|Inspection|Stats)"
  "^[[:space:]]*import.*from[[:space:]]+['\"][^'\"]*industry/(food|cosmetic|pharma|health|electronics|apparel)"
)

# ── 검증 ──────────────────────────────────────────────────────────────────

violations=0
checked_paths=0

check_path() {
  local path="$1"
  local label="$2"

  if [ ! -e "$path" ]; then
    return 0
  fi

  checked_paths=$((checked_paths + 1))

  for pattern in "${INDUSTRY_IMPORT_PATTERNS[@]}"; do
    local result
    result=$(grep -rnE --include="*.ts" --include="*.tsx" "$pattern" "$path" 2>/dev/null || true)
    if [ -z "$result" ]; then
      continue
    fi

    # 주석 줄 제거 (// 또는 /* 또는 *)
    local filtered
    filtered=$(echo "$result" | grep -v -E '^[^:]+:[0-9]+:[[:space:]]*(//|/\*|\*[[:space:]])' || true)
    if [ -n "$filtered" ]; then
      echo "::error::[침투 위반] $label '$path' 가 industry 모듈 import:"
      echo "$filtered"
      violations=$((violations + 1))
    fi
  done
}

echo "═══════════════════════════════════════════════════════"
echo "검증 1: industry 모듈 import 침투 검사"
echo "═══════════════════════════════════════════════════════"
echo "(문자열 리터럴 / 주석 / session prefix 는 false positive 라 제외)"
echo ""

# 미래 디렉토리 검사
echo "── 미래 5계층 디렉토리 ──"
for dir in "${FUTURE_CORE_DIRS[@]}"; do
  if [ -d "$dir" ]; then
    echo "  검사 중: $dir"
    check_path "$dir" "미래 코어"
  else
    echo "  미존재 (Strangler Fig 중): $dir"
  fi
done

# 현재 평탄 코어 검사
echo ""
echo "── 현재 평탄 코어 (화이트리스트) ──"
for path in "${CURRENT_CORE_PATHS[@]}"; do
  if [ -e "$path" ]; then
    echo "  검사 중: $path"
    check_path "$path" "현재 코어"
  else
    echo "  미존재: $path"
  fi
done

echo ""
echo "검사 완료: $checked_paths 개 경로, $violations 개 import 위반"

# ── 검증 2: dependency-cruiser ────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "검증 2: dependency-cruiser 5계층 의존성 룰"
echo "═══════════════════════════════════════════════════════"

if command -v npm >/dev/null 2>&1; then
  if [ -d "node_modules/dependency-cruiser" ]; then
    if npm run --silent arch:check 2>&1; then
      echo "✅ dependency-cruiser 통과"
    else
      echo "::error::dependency-cruiser 위반"
      violations=$((violations + 1))
    fi
  else
    echo "⚠️  dependency-cruiser 미설치 (npm install 필요) — 건너뜀"
    echo "   CI 환경에서는 npm install 후 자동 실행됨"
  fi
else
  echo "⚠️  npm 미설치 — dependency-cruiser 건너뜀"
fi

# ── 검증 3: 어댑터 분리 빌드 (보류) ────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "검증 3: 어댑터 분리 빌드 (TODO)"
echo "═══════════════════════════════════════════════════════"
echo "디렉토리 이주 (Phase A-1) 완료 후 활성화 예정"
echo "현재는 평탄 구조라 단독 빌드 분리 불가능"

# ── 결과 ──────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
if [ "$violations" -gt 0 ]; then
  echo "❌ 코어 침투 검증 실패: $violations 개 import 위반"
  echo "═══════════════════════════════════════════════════════"
  echo ""
  echo "수정 가이드:"
  echo "  - core 영역이 industry 모듈을 직접 import 하면 ADR-002 위반"
  echo "  - 어댑터 패턴 (Port-Adapter) 도입 또는 의존성 역전"
  echo "  - 자세한 사항: docs/architecture/ADR-002-no-core-to-industry.md"
  exit 1
fi

echo "✅ 코어 침투 검증 통과"
echo "═══════════════════════════════════════════════════════"
exit 0
