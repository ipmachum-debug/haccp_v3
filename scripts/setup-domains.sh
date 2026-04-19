#!/bin/bash
# ============================================================
# Millio AI SaaS 도메인 + Nginx + SSL 설정 스크립트
# 실행: sudo bash /home/root/haccp_v3/webapp/scripts/setup-domains.sh
# ============================================================

set -e
echo "=========================================="
echo " Millio AI 도메인 설정 스크립트"
echo "=========================================="

# ─── 1. 기존 설정 백업 ───
echo ""
echo "[1/5] 기존 Nginx 설정 백업..."
BACKUP_DIR="/etc/nginx/conf.d/backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp /etc/nginx/conf.d/haccpone.conf "$BACKUP_DIR/" 2>/dev/null || true
echo "  → 백업 완료: $BACKUP_DIR"

# ─── 2. millioai.com + app.millioai.com Nginx 설정 ───
echo ""
echo "[2/5] Nginx 설정 파일 생성..."

cat > /etc/nginx/conf.d/haccpone.conf << 'NGINX_EOF'
# ============================================================
# Millio AI SaaS 도메인 설정
# millioai.com       → 마케팅 랜딩 + 앱 (SPA)
# app.millioai.com   → 앱 전용 (로그인 후)
# millioai.com     → millioai.com 으로 301 리디렉션
# ============================================================

# ──────────────────────────────────────
# 1) millioai.com (메인 - 랜딩 + 앱)
# ──────────────────────────────────────
server {
    listen 80;
    server_name millioai.com www.millioai.com;

    # Certbot ACME 챌린지용 (SSL 발급 시 필요)
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # SSL 발급 전: 임시로 직접 서빙
    # SSL 발급 후: Certbot이 자동으로 301 리디렉션 추가
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name millioai.com www.millioai.com;

    # SSL 인증서 (certbot 발급 후 자동 설정됨)
    # 처음에는 아래 줄을 주석 처리하고 HTTP로 먼저 테스트
    # ssl_certificate /etc/letsencrypt/live/millioai.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/millioai.com/privkey.pem;
    # include /etc/letsencrypt/options-ssl-nginx.conf;
    # ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # 임시 자체서명 인증서 (certbot 발급 전까지)
    ssl_certificate /etc/nginx/ssl/haccpone-selfsigned.crt;
    ssl_certificate_key /etc/nginx/ssl/haccpone-selfsigned.key;

    client_max_body_size 100M;

    # Gzip 압축
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml+rss font/truetype font/opentype application/vnd.ms-fontobject image/svg+xml;
    gzip_min_length 1024;

    # Service Worker (캐시 안 함)
    location = /sw.js {
        root /root/haccp_v3/dist/public;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
        try_files $uri =404;
    }

    # 정적 파일 (Vite 해시 에셋 - 1년 캐시)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp)$ {
        root /root/haccp_v3/dist/public;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
        try_files $uri =404;
    }

    # favicon
    location = /favicon.ico {
        root /root/haccp_v3/dist/public;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
        try_files $uri =404;
    }

    # manifest.json
    location = /manifest.json {
        root /root/haccp_v3/dist/public;
        expires 1d;
        add_header Cache-Control "public";
        access_log off;
        try_files $uri =404;
    }

    # SPA 라우팅 (index.html)
    location / {
        root /root/haccp_v3/dist/public;
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Expires "0";
    }

    # API → Node.js
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Cookie $http_cookie;
        proxy_pass_header Set-Cookie;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}

# ──────────────────────────────────────
# 2) app.millioai.com (앱 전용)
# ──────────────────────────────────────
server {
    listen 80;
    server_name app.millioai.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name app.millioai.com;

    # SSL (certbot 발급 후)
    # ssl_certificate /etc/letsencrypt/live/millioai.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/millioai.com/privkey.pem;
    # include /etc/letsencrypt/options-ssl-nginx.conf;
    # ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # 임시 자체서명
    ssl_certificate /etc/nginx/ssl/haccpone-selfsigned.crt;
    ssl_certificate_key /etc/nginx/ssl/haccpone-selfsigned.key;

    client_max_body_size 100M;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml+rss font/truetype font/opentype application/vnd.ms-fontobject image/svg+xml;
    gzip_min_length 1024;

    location = /sw.js {
        root /root/haccp_v3/dist/public;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        try_files $uri =404;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp)$ {
        root /root/haccp_v3/dist/public;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
        try_files $uri =404;
    }

    # app.millioai.com 접속 시 → /login 으로 보냄
    location = / {
        return 302 /login;
    }

    location / {
        root /root/haccp_v3/dist/public;
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Cookie $http_cookie;
        proxy_pass_header Set-Cookie;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}

# ──────────────────────────────────────
# 3) millioai.com → millioai.com 리디렉션
# ──────────────────────────────────────
server {
    listen 443 ssl;
    server_name millioai.com www.millioai.com;

    ssl_certificate /etc/letsencrypt/live/millioai.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/millioai.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # 모든 요청을 millioai.com 으로 301 리디렉션
    return 301 https://millioai.com$request_uri;
}

server {
    listen 80;
    server_name millioai.com www.millioai.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    return 301 https://millioai.com$request_uri;
}
NGINX_EOF

echo "  → /etc/nginx/conf.d/haccpone.conf 생성 완료"

# ─── 3. 임시 자체서명 SSL 인증서 (certbot 전까지) ───
echo ""
echo "[3/5] 임시 SSL 인증서 생성..."
mkdir -p /etc/nginx/ssl
if [ ! -f /etc/nginx/ssl/haccpone-selfsigned.crt ]; then
    openssl req -x509 -nodes -days 30 \
        -newkey rsa:2048 \
        -keyout /etc/nginx/ssl/haccpone-selfsigned.key \
        -out /etc/nginx/ssl/haccpone-selfsigned.crt \
        -subj "/CN=millioai.com/O=Millio AI/C=KR" 2>/dev/null
    echo "  → 자체서명 인증서 생성 완료 (30일 유효)"
else
    echo "  → 자체서명 인증서 이미 존재"
fi

# ─── 4. Nginx 설정 검증 ───
echo ""
echo "[4/5] Nginx 설정 검증..."
nginx -t
echo "  → 설정 검증 통과"

# ─── 5. Nginx 리로드 ───
echo ""
echo "[5/5] Nginx 리로드..."
systemctl reload nginx
echo "  → Nginx 리로드 완료"

echo ""
echo "=========================================="
echo " 설정 완료!"
echo "=========================================="
echo ""
echo "다음 단계:"
echo ""
echo "1. Gabia DNS 설정 (대표님 직접):"
echo "   millioai.com 도메인 → DNS 설정 페이지"
echo "   [추가] A 레코드: app → 49.50.130.101"
echo ""
echo "2. SSL 인증서 발급 (DNS 적용 후):"
echo "   sudo certbot certonly --webroot -w /var/www/html \\"
echo "     -d millioai.com -d www.millioai.com -d app.millioai.com"
echo ""
echo "3. SSL 적용:"
echo "   sudo bash /home/root/haccp_v3/webapp/scripts/apply-ssl.sh"
echo ""
