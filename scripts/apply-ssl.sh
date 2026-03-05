#!/bin/bash
# ============================================================
# SSL 인증서 적용 스크립트
# certbot 발급 후 실행: sudo bash scripts/apply-ssl.sh
# ============================================================

set -e

CERT_PATH="/etc/letsencrypt/live/haccpone.com"

if [ ! -f "$CERT_PATH/fullchain.pem" ]; then
    echo "ERROR: SSL 인증서가 없습니다."
    echo "먼저 certbot으로 발급하세요:"
    echo ""
    echo "  sudo certbot certonly --webroot -w /var/www/html \\"
    echo "    -d haccpone.com -d www.haccpone.com -d app.haccpone.com"
    exit 1
fi

echo "SSL 인증서 확인됨: $CERT_PATH"

# haccpone.conf 에서 자체서명 → Let's Encrypt 전환
sed -i 's|ssl_certificate /etc/nginx/ssl/haccpone-selfsigned.crt;|ssl_certificate /etc/letsencrypt/live/haccpone.com/fullchain.pem;|g' /etc/nginx/conf.d/haccpone.conf
sed -i 's|ssl_certificate_key /etc/nginx/ssl/haccpone-selfsigned.key;|ssl_certificate_key /etc/letsencrypt/live/haccpone.com/privkey.pem;|g' /etc/nginx/conf.d/haccpone.conf

# options-ssl-nginx.conf 주석 해제
sed -i 's|# include /etc/letsencrypt/options-ssl-nginx.conf;|include /etc/letsencrypt/options-ssl-nginx.conf;|g' /etc/nginx/conf.d/haccpone.conf
sed -i 's|# ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;|ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;|g' /etc/nginx/conf.d/haccpone.conf

echo "Nginx 설정 업데이트 완료"

nginx -t && systemctl reload nginx
echo "Nginx 리로드 완료"
echo ""
echo "✅ SSL 적용 완료!"
echo "   https://haccpone.com"
echo "   https://app.haccpone.com"
echo "   https://haccpone.co.kr → https://haccpone.com (301)"
