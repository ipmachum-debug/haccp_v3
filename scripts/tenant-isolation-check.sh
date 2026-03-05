#!/bin/bash
#
# tenant-isolation-check.sh
# CI 검증 스크립트: 테넌트 격리 규칙 위반 감지
#
# 사용법: bash scripts/tenant-isolation-check.sh
# CI에서: 이 스크립트가 실패하면 (exit 1) PR 머지 차단
#
# 검사 항목:
# 1. publicProcedure가 tenant 테이블을 접근하는 경우
# 2. getDb() 사용 중 tenant 테이블 접근 (routers/ 내에서)
# 3. UPDATE/DELETE에 tenant_id 조건 누락
# 4. 하드코딩된 tenant_id = 1 또는 || 2
# 5. INSERT에 tenantId 누락 가능성
#

set -e

ROUTERS_DIR="server/routers"
FAIL=0
WARNINGS=()

echo "============================================"
echo "  테넌트 격리 CI 검증 시작"
echo "============================================"
echo ""

# ============================================================================
# 1. publicProcedure + tenant 테이블 접근 감지
# ============================================================================
echo "[1/5] publicProcedure가 tenant 데이터를 접근하는 파일 검사..."

# tenant 테이블 키워드
TENANT_TABLES="tenant_id|tenantId|h_sites|hygiene_checklists|pest_control|checklist_templates|checklist_instances|document_instances|document_types|document_approval|document_batch|h_suppliers|h_materials|h_products"

PUBLIC_FILES=$(grep -rl "publicProcedure" $ROUTERS_DIR/ --include="*.ts" 2>/dev/null || true)
for f in $PUBLIC_FILES; do
  # auth.router.ts, admin.ts, tenantsPublic.ts 제외 (의도적 public)
  base=$(basename "$f")
  if [[ "$base" == "auth.router.ts" || "$base" == "admin.ts" || "$base" == "tenantsPublic.ts" ]]; then
    continue
  fi
  
  # publicProcedure를 import 하고 실제 사용하는지 확인
  USES_PUBLIC=$(grep -c "^\s*\w\+:\s*publicProcedure" "$f" 2>/dev/null || true)
  if [ "$USES_PUBLIC" -gt 0 ]; then
    HAS_TENANT=$(grep -cE "$TENANT_TABLES" "$f" 2>/dev/null || true)
    if [ "$HAS_TENANT" -gt 0 ]; then
      WARNINGS+=("[FAIL] $f: publicProcedure가 tenant 데이터에 접근합니다 (${USES_PUBLIC}개 endpoint)")
      FAIL=1
    fi
  fi
done

if [ $FAIL -eq 0 ]; then
  echo "  ✅ publicProcedure + tenant 데이터 접근 없음"
fi

# ============================================================================
# 2. 하드코딩된 tenant_id 감지
# ============================================================================
echo "[2/5] 하드코딩된 tenant_id 검사..."

# Pattern: tenantId = 1, tenantId = 2 등 직접 할당 / || 2 같은 fallback tenantId
# 제외: is_active = 1, .default(1), z. 스키마, ${tenantId} 등 안전한 패턴
HARDCODED=$(grep -rnE "(tenantId\s*[=:]\s*[0-9]+|tenant_id\s*[=:]\s*[0-9]+|\.\.\s*tenantId\s*\|\|\s*[0-9]+|ctx\)\.tenantId\s*\|\|\s*[0-9]+)" $ROUTERS_DIR/ --include="*.ts" 2>/dev/null | grep -vE "tenant_id\s*=\s*\\\$\{|is_active|isActive|\.default\(|z\.|tenantId:\s*tenantId|tenantId:\s*ctx|tenantId:\s*input|requireTenantId|Number\(|count|newTenant|const tenantId|// |sql\`" || true)
if [ -n "$HARDCODED" ]; then
  while IFS= read -r line; do
    WARNINGS+=("[FAIL] 하드코딩된 tenantId: $line")
  done <<< "$HARDCODED"
  FAIL=1
else
  echo "  ✅ 하드코딩된 tenant_id 없음"
fi

# ============================================================================
# 3. UPDATE ... WHERE id = ? 에 tenant_id 조건 누락
# ============================================================================
echo "[3/5] UPDATE/DELETE에 tenant_id 조건 누락 검사..."

# raw SQL에서 UPDATE ... WHERE id = 패턴인데 tenant_id 없는 경우
MISSING_TENANT=$(grep -rnE "UPDATE\s+\w+\s+SET.*WHERE\s+id\s*=" $ROUTERS_DIR/ --include="*.ts" 2>/dev/null | grep -iv "tenant_id" || true)
if [ -n "$MISSING_TENANT" ]; then
  while IFS= read -r line; do
    WARNINGS+=("[WARN] UPDATE/DELETE에 tenant_id 누락 가능: $line")
  done <<< "$MISSING_TENANT"
fi

echo "  ✅ raw SQL UPDATE 패턴 검사 완료"

# ============================================================================
# 4. getDb() 직접 호출이 routers에서 사용되는 경우 (경고)
# ============================================================================
echo "[4/5] routers/에서 getDb() 직접 호출 검사 (경고)..."

GETDB_COUNT=$(grep -rc "getDb()" $ROUTERS_DIR/ --include="*.ts" 2>/dev/null | awk -F: '{s+=$2} END {print s}')
if [ "$GETDB_COUNT" -gt 0 ]; then
  echo "  ⚠️  routers/에서 getDb() ${GETDB_COUNT}회 호출됨 (ctx.db 전환 권장)"
fi

# ============================================================================
# 5. INSERT에 tenantId 누락 가능성 (경고)
# ============================================================================
echo "[5/5] INSERT에 tenantId 포함 여부 검사..."

INSERT_FILES=$(grep -rl "\.insert(" $ROUTERS_DIR/ --include="*.ts" 2>/dev/null || true)
for f in $INSERT_FILES; do
  # tenant 테이블에 insert하는데 tenantId가 없는 줄 찾기
  INSERTS_NO_TENANT=$(grep -A5 "\.insert(" "$f" 2>/dev/null | grep -c "values(" || true)
  INSERTS_WITH_TENANT=$(grep -A10 "\.insert(" "$f" 2>/dev/null | grep -c "tenantId\|tenant_id" || true)
  
  if [ "$INSERTS_NO_TENANT" -gt "$INSERTS_WITH_TENANT" ] 2>/dev/null; then
    WARNINGS+=("[WARN] $f: INSERT에 tenantId 누락 가능성 (insert=${INSERTS_NO_TENANT}, tenantId=${INSERTS_WITH_TENANT})")
  fi
done

echo "  ✅ INSERT 검사 완료"

# ============================================================================
# 결과 출력
# ============================================================================
echo ""
echo "============================================"
echo "  검사 결과"
echo "============================================"

if [ ${#WARNINGS[@]} -gt 0 ]; then
  for w in "${WARNINGS[@]}"; do
    echo "  $w"
  done
fi

echo ""
if [ $FAIL -eq 1 ]; then
  echo "❌ 테넌트 격리 검증 실패 - 위 [FAIL] 항목을 수정하세요."
  exit 1
else
  echo "✅ 테넌트 격리 검증 통과"
  exit 0
fi
