#!/bin/bash

# HACCP v3 배포 스크립트
# 외부 서버(haccpone.co.kr)로 배포

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 서버 정보
REMOTE_USER="root"
REMOTE_HOST="haccpone.co.kr"
REMOTE_PATH="/var/www/haccp_v3"
APP_NAME="haccp_v3"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}HACCP v3 배포 시작${NC}"
echo -e "${GREEN}========================================${NC}"

# 1. 빌드
echo -e "${YELLOW}[1/6] 프로젝트 빌드 중...${NC}"
pnpm install
pnpm build

# 2. 배포 파일 압축
echo -e "${YELLOW}[2/6] 배포 파일 압축 중...${NC}"
tar -czf /tmp/${APP_NAME}.tar.gz \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='*.log' \
  --exclude='.env.local' \
  dist/ \
  package.json \
  pnpm-lock.yaml \
  drizzle/ \
  drizzle.config.ts \
  server/ \
  shared/ \
  storage/

# 3. 서버로 파일 전송
echo -e "${YELLOW}[3/6] 서버로 파일 전송 중...${NC}"
scp /tmp/${APP_NAME}.tar.gz ${REMOTE_USER}@${REMOTE_HOST}:/tmp/

# 4. 서버에서 배포 실행
echo -e "${YELLOW}[4/6] 서버에서 배포 실행 중...${NC}"
ssh ${REMOTE_USER}@${REMOTE_HOST} << 'ENDSSH'
set -e

APP_NAME="haccp_v3"
REMOTE_PATH="/var/www/haccp_v3"

# 백업 디렉토리 생성
BACKUP_DIR="${REMOTE_PATH}_backup_$(date +%Y%m%d_%H%M%S)"
if [ -d "${REMOTE_PATH}" ]; then
  echo "기존 버전 백업 중..."
  cp -r ${REMOTE_PATH} ${BACKUP_DIR}
fi

# 배포 디렉토리 생성
mkdir -p ${REMOTE_PATH}
cd ${REMOTE_PATH}

# 압축 해제
echo "파일 압축 해제 중..."
tar -xzf /tmp/${APP_NAME}.tar.gz -C ${REMOTE_PATH}

# 의존성 설치
echo "의존성 설치 중..."
pnpm install --prod

# 환경 변수 파일 확인
if [ ! -f ".env" ]; then
  echo "⚠️  .env 파일이 없습니다. 수동으로 생성해주세요."
fi

# PM2로 애플리케이션 재시작
echo "애플리케이션 재시작 중..."
pm2 delete ${APP_NAME} || true
pm2 start dist/index.js --name ${APP_NAME} --node-args="--max-old-space-size=2048"
pm2 save

echo "✅ 배포 완료!"
ENDSSH

# 5. 데이터베이스 마이그레이션
echo -e "${YELLOW}[5/6] 데이터베이스 마이그레이션 실행 중...${NC}"
ssh ${REMOTE_USER}@${REMOTE_HOST} << 'ENDSSH'
cd /var/www/haccp_v3
pnpm db:push
ENDSSH

# 6. 서버 상태 확인
echo -e "${YELLOW}[6/6] 서버 상태 확인 중...${NC}"
ssh ${REMOTE_USER}@${REMOTE_HOST} "pm2 status"

# 임시 파일 삭제
rm /tmp/${APP_NAME}.tar.gz

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ 배포 완료!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}서버 URL: https://haccpone.co.kr${NC}"
echo -e "${GREEN}========================================${NC}"
