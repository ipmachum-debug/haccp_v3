#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# v2→v3 전환 후 자동 테스트 스크립트 (PHASE 1 직후)
# 목적: v3 단독 전환 직후 핵심 기능 자동 검증
# 실행: bash /root/haccp_v3/scripts/post_switch_test.sh
# ═══════════════════════════════════════════════════════════════

set -uo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

log()    { echo -e "${BLUE}  [$(date '+%H:%M:%S')]${NC} $1"; }
ok()     { echo -e "${GREEN}  ✅ $1${NC}"; PASS=$((PASS+1)); }
fail()   { echo -e "${RED}  ❌ $1${NC}"; FAIL=$((FAIL+1)); }
warn()   { echo -e "${YELLOW}  ⚠️  $1${NC}"; WARN=$((WARN+1)); }
section(){ echo -e "\n${BOLD}  ── $1 ──${NC}"; }

PASS=0; FAIL=0; WARN=0
BASE_URL="http://localhost:3001"
DOMAIN_URL="https://haccpone.com"
TIMEOUT=10

echo ""
echo -e "${BOLD}  ┌──────────────────────────────────────────┐${NC}"
echo -e "${BOLD}  │    v3 전환 후 자동 테스트                │${NC}"
echo -e "${BOLD}  │    $(date '+%Y-%m-%d %H:%M:%S')                  │${NC}"
echo -e "${BOLD}  └──────────────────────────────────────────┘${NC}"

# ════════════════════════════════════════
section "TEST 1: 프로세스 & 포트 확인"
# ════════════════════════════════════════

# PM2 v3 상태
V3_PM2=$(pm2 describe haccpone 2>/dev/null | grep "status" | awk '{print $4}' | head -1 || echo "not_found")
if [[ "${V3_PM2}" == *"online"* ]]; then
  ok "PM2 haccp_v3: online"
else
  fail "PM2 haccp_v3: ${V3_PM2} (비정상)"
fi

# PM2 v2 상태 (정지됐어야 함)
V2_PM2=$(pm2 describe 16 2>/dev/null | grep "status" | awk '{print $4}' | head -1 || echo "not_found")
if [[ "${V2_PM2}" == *"stopped"* ]] || [[ "${V2_PM2}" == *"not_found"* ]]; then
  ok "PM2 haccpone-v2: 정지 확인"
else
  warn "PM2 haccpone-v2 상태: ${V2_PM2} (정지됐어야 함)"
fi

# 포트 3001 점유
PORT_3001=$(lsof -ti :3001 2>/dev/null | head -1 || echo "")
[ -n "${PORT_3001}" ] && ok "포트 3001 점유 (PID: ${PORT_3001})" || fail "포트 3001 미점유"

# 포트 3002 해제
PORT_3002=$(lsof -ti :3002 2>/dev/null | head -1 || echo "")
[ -z "${PORT_3002}" ] && ok "포트 3002 해제 확인" || warn "포트 3002 아직 점유 중 (PID: ${PORT_3002})"

# ════════════════════════════════════════
section "TEST 2: HTTP 엔드포인트 응답"
# ════════════════════════════════════════

# 함수: HTTP 응답 체크
check_http() {
  local desc="$1" url="$2" expect="$3"
  local code time
  code=$(curl -o /dev/null -s -w "%{http_code}" --max-time ${TIMEOUT} -k "${url}" 2>/dev/null || echo "000")
  time=$(curl -o /dev/null -s -w "%{time_total}" --max-time ${TIMEOUT} -k "${url}" 2>/dev/null || echo "0")
  if [[ "${code}" =~ ^(${expect})$ ]]; then
    ok "${desc}: HTTP ${code} (${time}s)"
  elif [ "${code}" == "000" ]; then
    fail "${desc}: 연결 실패"
  else
    fail "${desc}: HTTP ${code} (예상: ${expect})"
  fi
}

check_http "메인 페이지 (로컬)"    "${BASE_URL}/"         "200|301|302"
check_http "메인 페이지 (도메인)"  "${DOMAIN_URL}/"       "200|301|302"
check_http "로그인 페이지"         "${BASE_URL}/login"    "200|301|302"

# API 헬스체크 (tRPC 엔드포인트)
check_http "API 엔드포인트"        "${BASE_URL}/api/trpc" "200|400|404|405"

# ════════════════════════════════════════
section "TEST 3: DB 연결 & 데이터 무결성"
# ════════════════════════════════════════

# DB 접속
DB_CHECK=$(mysql -u root -h localhost \
  -e "SELECT COUNT(*) FROM tenants;" haccp_tenant_db \
  -s -N 2>/dev/null || echo "ERROR")

if [ "${DB_CHECK}" != "ERROR" ]; then
  ok "DB 연결 정상 (tenants: ${DB_CHECK}개)"
else
  fail "DB 연결 실패 (haccp_tenant_db)"
fi

# 주요 테이블 존재 확인
for table in tenants users h_ccp_records daily_logs batches; do
  COUNT=$(mysql -u root -h localhost \
    -e "SELECT COUNT(*) FROM ${table};" haccp_tenant_db \
    -s -N 2>/dev/null || echo "ERROR")
  if [ "${COUNT}" != "ERROR" ]; then
    ok "테이블 ${table}: ${COUNT}건"
  else
    warn "테이블 ${table}: 접근 실패 또는 없음"
  fi
done

# ════════════════════════════════════════
section "TEST 4: 시스템 리소스"
# ════════════════════════════════════════

# 메모리
MEM_TOTAL=$(free -m | awk 'NR==2{print $2}')
MEM_USED=$(free -m | awk 'NR==2{print $3}')
MEM_PCT=$((MEM_USED * 100 / MEM_TOTAL))
if [ "${MEM_PCT}" -lt 80 ]; then
  ok "메모리: ${MEM_USED}MB / ${MEM_TOTAL}MB (${MEM_PCT}%)"
else
  warn "메모리 사용률 높음: ${MEM_PCT}%"
fi

# 디스크
DISK_PCT=$(df /root | awk 'NR==2{print $5}' | tr -d '%')
DISK_AVAIL=$(df -h /root | awk 'NR==2{print $4}')
if [ "${DISK_PCT}" -lt 80 ]; then
  ok "디스크: ${DISK_PCT}% 사용 (여유: ${DISK_AVAIL})"
else
  warn "디스크 사용률 높음: ${DISK_PCT}% (여유: ${DISK_AVAIL})"
fi

# v3 프로세스 메모리
V3_MEM=$(pm2 describe haccpone 2>/dev/null | grep "memory" | awk '{print $4}' | head -1 || echo "?")
ok "v3 프로세스 메모리: ${V3_MEM}"

# ════════════════════════════════════════
section "TEST 5: 로그 에러 스캔 (최근 100줄)"
# ════════════════════════════════════════

ERROR_LOG=$(pm2 logs haccpone --nostream --lines 100 2>/dev/null || true)
ERROR_CNT=$(echo "${ERROR_LOG}" | grep -cE "uncaughtException|unhandledRejection|FATAL|Cannot connect" 2>/dev/null || true)
ERROR_CNT=${ERROR_CNT:-0}
WARN_CNT=$(echo "${ERROR_LOG}" | grep -cE "warn|deprecated" 2>/dev/null || true)
WARN_CNT=${WARN_CNT:-0}

if [ "${ERROR_CNT}" -eq 0 ]; then
  ok "치명적 에러 없음 (최근 100줄)"
else
  fail "치명적 에러 ${ERROR_CNT}건 발견 — pm2 logs haccpone 확인 필요"
fi

if [ "${WARN_CNT}" -lt 20 ]; then
  ok "경고 ${WARN_CNT}건 (정상 범위)"
else
  warn "경고 ${WARN_CNT}건 (검토 권장)"
fi

# ════════════════════════════════════════
# 최종 결과
# ════════════════════════════════════════
echo ""
echo "  ┌──────────────────────────────────────────┐"
printf "  │  테스트 결과: ✅ %d통과  ❌ %d실패  ⚠️ %d경고  │\n" "${PASS}" "${FAIL}" "${WARN}"
echo "  └──────────────────────────────────────────┘"

if [ "${FAIL}" -eq 0 ]; then
  echo ""
  echo -e "${GREEN}${BOLD}  🎉 모든 자동 테스트 통과! v3 단독 운영 준비 완료${NC}"
  echo ""
  echo "  다음 수동 테스트 항목을 직접 확인하세요:"
  echo "  ──────────────────────────────────────────"
  echo "  [ ] 브라우저에서 https://haccpone.com 로그인"
  echo "  [ ] CCP 기록 입력 & 저장"
  echo "  [ ] 배치 기록 조회"
  echo "  [ ] 일일 점검일지 작성"
  echo "  [ ] 원료 수불부 조회"
  echo "  [ ] PDF 출력 기능"
  echo "  [ ] 승인 요청 & 수신"
  echo "  ──────────────────────────────────────────"
  EXIT_CODE=0
else
  echo ""
  echo -e "${RED}${BOLD}  ⚠️  ${FAIL}개 항목 실패 — 롤백 고려:${NC}"
  echo -e "${RED}  bash /root/haccp_v3/scripts/rollback_restart_v2.sh${NC}"
  echo ""
  EXIT_CODE=1
fi

echo ""
exit ${EXIT_CODE}
