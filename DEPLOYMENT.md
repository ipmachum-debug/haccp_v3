# HACCP v3 배포 가이드

## 개요

이 문서는 HACCP v3 시스템을 외부 서버(haccpone.co.kr)에 배포하는 방법을 설명합니다.

## 사전 요구사항

### 로컬 환경
- Node.js 22.x
- pnpm
- SSH 접근 권한 (haccpone.co.kr)

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
ssh root@haccpone.co.kr
```

비밀번호 없이 접속하려면 SSH 키를 등록하세요:

```bash
ssh-copy-id root@haccpone.co.kr
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

서버의 `/var/www/haccp_v3/.env` 파일을 생성하고 다음 내용을 입력합니다:

```env
# 데이터베이스
DATABASE_URL=mysql://haccp_user:your_password@localhost:3306/haccp_v3

# JWT 시크릿
JWT_SECRET=your_jwt_secret_key_here

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
VITE_APP_TITLE=HACCP 식품 안전 관리 시스템
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
    server_name haccpone.co.kr www.haccpone.co.kr;

    # SSL 설정 (Let's Encrypt)
    # listen 443 ssl http2;
    # listen [::]:443 ssl http2;
    # ssl_certificate /etc/letsencrypt/live/haccpone.co.kr/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/haccpone.co.kr/privkey.pem;

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
sudo certbot --nginx -d haccpone.co.kr -d www.haccpone.co.kr
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
scp haccp_v3.tar.gz root@haccpone.co.kr:/tmp/

# 4. 서버에 접속
ssh root@haccpone.co.kr

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
ssh root@haccpone.co.kr "pm2 status"
```

### 2. 로그 확인

```bash
ssh root@haccpone.co.kr "pm2 logs haccp_v3"
```

### 3. 웹사이트 접속

브라우저에서 https://haccpone.co.kr 접속하여 정상 작동 확인

## 롤백

배포 중 문제가 발생하면 이전 버전으로 롤백할 수 있습니다:

```bash
ssh root@haccpone.co.kr

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

### PM2 프로세스가 시작되지 않음

```bash
ssh root@haccpone.co.kr
cd /var/www/haccp_v3
pm2 logs haccp_v3 --lines 100
```

### 데이터베이스 연결 오류

`.env` 파일의 `DATABASE_URL` 설정을 확인하세요.

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
