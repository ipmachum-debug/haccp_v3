#!/bin/bash
# ====================================================
# HACCP-ONE 배포 스크립트
# 
# 사용법: ./deploy.sh
#
# 이 스크립트는 다음 작업을 수행합니다:
# 1. 프론트엔드 빌드 (vite build)
# 2. 서버 빌드 (esbuild)
# 3. 서버 index.js를 /root/haccp_v3/dist/에 복사
# 4. 프론트엔드 assets를 /root/haccp_v3/dist/public/에 동기화 (rsync)
# 5. PM2 재시작
# 6. 헬스체크
# ====================================================
set -e

WEBAPP_DIR="/home/root/haccp_v3/webapp"
DEPLOY_DIR="/root/haccp_v3/dist"
BUILD_DIR="${WEBAPP_DIR}/dist"

echo "============================================"
echo "  HACCP-ONE 배포 시작"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"

cd "$WEBAPP_DIR"

# Step 1: 프론트엔드 빌드
echo ""
echo "[1/6] 프론트엔드 빌드 (vite)..."
npx vite build 2>&1 | tail -5
echo "  -> 프론트엔드 빌드 완료"

# Step 2: 서버 빌드
echo ""
echo "[2/6] 서버 빌드 (esbuild)..."
npx esbuild server/_core/index.ts \
  --platform=node \
  --packages=external \
  --bundle \
  --format=esm \
  --outdir=dist \
  --log-level=warning 2>&1
echo "  -> 서버 빌드 완료"

# Step 3: 서버 파일 복사
echo ""
echo "[3/6] 서버 index.js 복사..."
cp "${BUILD_DIR}/index.js" "${DEPLOY_DIR}/index.js"
echo "  -> ${DEPLOY_DIR}/index.js ($(md5sum ${DEPLOY_DIR}/index.js | cut -d' ' -f1))"

# Step 4: 프론트엔드 assets 동기화 (핵심!)
echo ""
echo "[4/6] 프론트엔드 assets 동기화..."
# public 디렉토리 전체를 rsync (--delete로 오래된 파일 정리)
rsync -a --delete "${BUILD_DIR}/public/" "${DEPLOY_DIR}/public/"
echo "  -> ${DEPLOY_DIR}/public/ 동기화 완료"

# 빌드 무결성 검증
BUILD_ENTRY=$(grep -o 'assets/index-[^"]*\.js' "${BUILD_DIR}/public/index.html")
DEPLOY_ENTRY=$(grep -o 'assets/index-[^"]*\.js' "${DEPLOY_DIR}/public/index.html")
if [ "$BUILD_ENTRY" = "$DEPLOY_ENTRY" ]; then
  echo "  -> 엔트리 파일 일치 확인: $DEPLOY_ENTRY"
else
  echo "  !! 경고: 엔트리 파일 불일치!"
  echo "     빌드: $BUILD_ENTRY"
  echo "     배포: $DEPLOY_ENTRY"
  exit 1
fi

# 엔트리 파일 존재 확인
if [ ! -f "${DEPLOY_DIR}/public/${DEPLOY_ENTRY}" ]; then
  echo "  !! 오류: 엔트리 JS 파일이 없습니다: ${DEPLOY_DIR}/public/${DEPLOY_ENTRY}"
  exit 1
fi
echo "  -> 엔트리 JS 파일 존재 확인"

# Step 5: PM2 재시작
echo ""
echo "[5/6] PM2 재시작..."
pm2 restart haccpone 2>&1 | grep -E "online|error" || true
echo "  -> PM2 재시작 완료"

# Step 6: 헬스체크 (5초 대기 후)
echo ""
echo "[6/6] 헬스체크 (5초 대기)..."
sleep 5

# PM2 상태 확인
PM2_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json; data=json.load(sys.stdin); [print(p['pm2_env']['status']) for p in data if p['name']=='haccpone']" 2>/dev/null || echo "unknown")
if [ "$PM2_STATUS" = "online" ]; then
  echo "  -> PM2 상태: online"
else
  echo "  !! PM2 상태: $PM2_STATUS"
  pm2 logs haccpone --nostream --lines 20 2>&1
  exit 1
fi

# 서버 응답 확인
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  echo "  -> HTTP 응답: 200 OK"
else
  echo "  !! HTTP 응답: $HTTP_CODE"
fi

echo ""
echo "============================================"
echo "  배포 완료!"
echo "  서버: ${DEPLOY_DIR}/index.js"
echo "  Assets: $(ls ${DEPLOY_DIR}/public/assets/*.js 2>/dev/null | wc -l) JS + $(ls ${DEPLOY_DIR}/public/assets/*.css 2>/dev/null | wc -l) CSS"
echo "  엔트리: $DEPLOY_ENTRY"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"
