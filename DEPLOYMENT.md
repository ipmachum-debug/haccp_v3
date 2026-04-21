# HACCP v3 배포 가이드

## 개요

이 문서는 HACCP v3 시스템을 외부 서버(millioai.com)에 배포하는 방법을 설명합니다.

## 사전 요구사항

### 로컬 환경
- Node.js 22.x
- pnpm
- SSH 접근 권한 (millioai.com)

### 서버 환경
- Ubuntu 22.04 이상
- Node.js 22.x
- pnpm
- PM2 (프로세스 관리자)
- MySQL/TiDB 데이터베이스
- Nginx (리버스 프록시)

## 배포 전 준비

### 1. 서버 SSH 접근 설정

로컬에서 서버로 SSH 접근이 가능해야 합니다:

```bash
ssh root@millioai.com
```

비밀번호 없이 접속하려면 SSH 키를 등록하세요:

```bash
ssh-copy-id root@millioai.com
```

### 2. 서버 환경 설정

서버에 접속하여 필요한 패키지를 설치합니다:

```bash
# Node.js 22.x 설치
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# pnpm 설치
npm install -g pnpm

# PM2 설치
npm install -g pm2

# PM2 자동 시작 설정
pm2 startup
pm2 save
```

### 3. 데이터베이스 설정

서버에서 MySQL/TiDB 데이터베이스를 생성합니다:

```sql
CREATE DATABASE haccp_v3 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'haccp_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON haccp_v3.* TO 'haccp_user'@'localhost';
FLUSH PRIVILEGES;
```

### 4. 환경 변수 설정

⚠️ **production 필수 변수** (2026-04-19 보안 강화):
`JWT_SECRET` / `SESSION_SECRET` 이 **미설정 또는 32자 미만이면 서버가 부팅 실패**합니다.
`DATABASE_URL` 도 필수.

```bash
# 32자 이상 랜덤 시크릿 생성 (openssl)
openssl rand -base64 48
# 또는
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

서버의 `/var/www/haccp_v3/.env` 파일을 생성하고 다음 내용을 입력합니다:

```env
# ── 필수 (production 에서 반드시) ────────────────────
# 데이터베이스
DATABASE_URL=mysql://haccp_user:your_password@localhost:3306/haccp_v3

# JWT/세션 시크릿 (32자 이상 랜덤 값 — openssl rand -base64 48)
JWT_SECRET=REPLACE_WITH_32CHAR_PLUS_RANDOM_VALUE
SESSION_SECRET=REPLACE_WITH_32CHAR_PLUS_RANDOM_VALUE

# OAuth 설정
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://portal.manus.im
VITE_APP_ID=your_app_id

# 소유자 정보
OWNER_OPEN_ID=your_owner_open_id
OWNER_NAME=your_owner_name

# Manus API
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=your_api_key
VITE_FRONTEND_FORGE_API_KEY=your_frontend_api_key
VITE_FRONTEND_FORGE_API_URL=https://api.manus.im

# 앱 정보
VITE_APP_TITLE=Millio AI | 제조기반 올인원 AI ERP
VITE_APP_LOGO=/logo.png

# 애널리틱스
VITE_ANALYTICS_ENDPOINT=https://analytics.manus.im
VITE_ANALYTICS_WEBSITE_ID=your_website_id

# 서버 포트
PORT=3000
NODE_ENV=production
```

### 5. Nginx 설정

Nginx를 리버스 프록시로 설정합니다:

```bash
sudo nano /etc/nginx/sites-available/haccp_v3
```

다음 내용을 입력합니다:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name millioai.com www.millioai.com;

    # SSL 설정 (Let's Encrypt)
    # listen 443 ssl http2;
    # listen [::]:443 ssl http2;
    # ssl_certificate /etc/letsencrypt/live/millioai.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/millioai.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Nginx 설정을 활성화하고 재시작합니다:

```bash
sudo ln -s /etc/nginx/sites-available/haccp_v3 /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 6. SSL 인증서 설정 (선택사항)

Let's Encrypt를 사용하여 SSL 인증서를 설정합니다:

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d millioai.com -d www.millioai.com
```

## 배포 실행

### 자동 배포

로컬에서 배포 스크립트를 실행합니다:

```bash
cd /home/ubuntu/haccp_v3
pnpm deploy
```

배포 스크립트는 다음 작업을 자동으로 수행합니다:
1. 프로젝트 빌드
2. 배포 파일 압축
3. 서버로 파일 전송
4. 서버에서 압축 해제 및 의존성 설치
5. PM2로 애플리케이션 재시작
6. 데이터베이스 마이그레이션 실행

### 수동 배포

자동 배포가 실패할 경우 수동으로 배포할 수 있습니다:

```bash
# 1. 로컬에서 빌드
cd /home/ubuntu/haccp_v3
pnpm install
pnpm build

# 2. 파일 압축
tar -czf haccp_v3.tar.gz \
  --exclude='node_modules' \
  --exclude='.git' \
  dist/ package.json pnpm-lock.yaml drizzle/ drizzle.config.ts server/ shared/ storage/

# 3. 서버로 전송
scp haccp_v3.tar.gz root@millioai.com:/tmp/

# 4. 서버에 접속
ssh root@millioai.com

# 5. 서버에서 배포
cd /var/www/haccp_v3
tar -xzf /tmp/haccp_v3.tar.gz
pnpm install --prod
pnpm db:push
pm2 restart haccp_v3
```

## 배포 후 확인

### 1. 서버 상태 확인

```bash
ssh root@millioai.com "pm2 status"
```

### 2. 로그 확인

```bash
ssh root@millioai.com "pm2 logs haccp_v3"
```

### 3. 웹사이트 접속

브라우저에서 https://millioai.com 접속하여 정상 작동 확인

## 롤백

배포 중 문제가 발생하면 이전 버전으로 롤백할 수 있습니다:

```bash
ssh root@millioai.com

# 백업 디렉토리 확인
ls -la /var/www/ | grep haccp_v3_backup

# 이전 버전으로 복원
cd /var/www
rm -rf haccp_v3
cp -r haccp_v3_backup_YYYYMMDD_HHMMSS haccp_v3
cd haccp_v3
pm2 restart haccp_v3
```

## 문제 해결

### 🔥 502 Bad Gateway — 서버 부팅 실패

**가장 흔한 원인 (2026-04-19 이후 보안 강화):**
- production 에서 `JWT_SECRET` / `SESSION_SECRET` env 미설정 → `throw` 로 부팅 중단
- `DATABASE_URL` 미설정 / Pool 초기화 실패
- `ecosystem.config.*` 가 env 를 주입 못 함

**복구 절차 (실제 2026-04-19 복구 사례):**

```bash
# 1. SSH 접속 후 로그 확인
ssh root@millioai.com
cd /var/www/haccp_v3
pm2 logs haccp_v3 --lines 200 --err
# → "JWT_SECRET 환경변수 필수" 같은 메시지가 보이면 env 누락

# 2. .env 필수 변수 존재 확인
grep -E "^(DATABASE_URL|JWT_SECRET|SESSION_SECRET)=" .env
# → 없거나 32자 미만이면 아래 명령으로 생성해서 추가
#   openssl rand -base64 48

# 3. PM2 에 .env 강제 주입 + 재시작
#    ⚠️ pm2 --update-env 단독으로는 .env 파일을 자동 로드하지 않음
#    반드시 아래처럼 export 로 env 를 현재 셸에 주입한 뒤 재시작
export $(grep -v '^#' .env | xargs)
pm2 restart ecosystem.config.cjs --update-env
pm2 save

# 4. 정상 확인
curl -I http://localhost:3000/
# → HTTP/1.1 200 OK
pm2 status
# → haccp_v3 online
```

**주의:** `ecosystem.config.js` (구버전, 하드코딩 자격정보 포함) 는 2026-04-19 에
삭제되었습니다. 운영 서버는 `ecosystem.config.cjs` 를 사용하며,
이 파일은 `process.env.*` 를 참조하도록 되어 있어 `.env` 파일이 반드시 필요합니다.

### PM2 프로세스가 시작되지 않음 (일반)

```bash
ssh root@millioai.com
cd /var/www/haccp_v3
pm2 logs haccp_v3 --lines 100
```

### 데이터베이스 연결 오류

`.env` 파일의 `DATABASE_URL` 설정을 확인하세요.

### startup migration 관련 오류 (production)

2026-04-19 이후 production 은 기본적으로 `runStartupMigrations` 를 실행하지 **않습니다**
(배포 재현성 / 스키마 drift 방지).

스키마 변경 후 마이그레이션이 필요하면:
```bash
# 임시 강제 실행
RUN_STARTUP_MIGRATIONS=true pm2 restart ecosystem.config.cjs --update-env
# 완료 확인 후 .env 에서 제거하거나 false 로 설정
```

### 포트 충돌

다른 애플리케이션이 3000 포트를 사용 중인지 확인:

```bash
sudo lsof -i :3000
```

## 유지보수

### 로그 확인

```bash
pm2 logs haccp_v3
```

### 프로세스 재시작

```bash
pm2 restart haccp_v3
```

### 프로세스 중지

```bash
pm2 stop haccp_v3
```

### 데이터베이스 백업

```bash
mysqldump -u haccp_user -p haccp_v3 > backup_$(date +%Y%m%d).sql
```

## 보안 권장사항

1. SSH 비밀번호 로그인 비활성화
2. 방화벽 설정 (UFW)
3. 정기적인 보안 업데이트
4. 데이터베이스 정기 백업
5. SSL 인증서 자동 갱신 설정

## 지원

문제가 발생하면 다음을 확인하세요:
- PM2 로그: `pm2 logs haccp_v3`
- Nginx 로그: `/var/log/nginx/error.log`
- 시스템 로그: `journalctl -xe`
