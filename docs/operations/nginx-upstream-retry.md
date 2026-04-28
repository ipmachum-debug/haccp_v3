# nginx upstream retry — 배포 시 502 제거 가이드

> 최초 작성: 2026-04-28
> 대상: 운영 서버 (`/etc/nginx/sites-enabled/millioai.conf`)
> 적용 주체: 사용자 / Genspark (운영 서버 SSH)
> 관련: [`ecosystem.config.cjs`](../../ecosystem.config.cjs) `wait_ready: true`, [`scripts/deploy.sh`](../../scripts/deploy.sh) `pm2 reload`

---

## 🎯 배경

PM2 가 `pm2 reload` 시 단일 fork 인스턴스(`instances: 1`)에서 다음 흐름:

1. 신 worker 시작 (DB 초기화 + 스케줄러 init)
2. 신 worker `server.listen` + `process.send('ready')` ← 약 1~2초
3. PM2 가 ready 신호 받고 구 worker 종료
4. 신 worker 가 PORT 점유 시작

**3 ↔ 4 사이의 짧은 윈도우** 에 들어온 요청은 nginx 가 upstream 503/502 받음. `wait_ready: true` 적용 후에도 1~2초 윈도우 잔존 (single fork 한계).

→ nginx 측에서 **upstream 재시도** 설정하면 사용자 시점에서 502 완전히 사라짐.

---

## 📦 권장 nginx 설정

`/etc/nginx/sites-enabled/millioai.conf` 의 `location /` 블록 또는 `proxy_pass` 사용 위치:

```nginx
upstream haccpone_backend {
    server 127.0.0.1:3002 max_fails=3 fail_timeout=2s;
    keepalive 16;
}

server {
    server_name millioai.com;

    location / {
        proxy_pass http://haccpone_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # ──────────────────────────────────────────
        # 배포 시 502 제거 — upstream 재시도 (2026-04-28)
        # ──────────────────────────────────────────

        # 502/503/504 등 발생 시 다음 upstream(없으므로 자기 자신) 으로 재시도
        proxy_next_upstream error timeout invalid_header http_502 http_503 http_504;
        proxy_next_upstream_tries 3;
        proxy_next_upstream_timeout 5s;

        # connection 실패 빠른 감지 — PM2 reload 윈도우 빠르게 감지
        proxy_connect_timeout 2s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;

        # ──────────────────────────────────────────
    }

    # ssl, listen 등 기타 설정 ...
}
```

### 핵심 옵션 설명

| 옵션 | 값 | 효과 |
| --- | --- | --- |
| `proxy_next_upstream` | `error timeout invalid_header http_502 http_503 http_504` | 어떤 응답 시 재시도할지 지정 |
| `proxy_next_upstream_tries` | `3` | 최대 3번 재시도 |
| `proxy_next_upstream_timeout` | `5s` | 재시도 전체 5초 안에 끝내기 |
| `proxy_connect_timeout` | `2s` | 빠른 connection 실패 감지 |
| `max_fails` | `3` | upstream 의 실패 임계값 |
| `fail_timeout` | `2s` | 실패 후 짧은 시간만 차단 (PM2 reload 짧은 윈도우 회피) |

---

## ✅ 적용 절차 (운영 서버)

```bash
# 1. 설정 백업
cp /etc/nginx/sites-enabled/millioai.conf \
   /etc/nginx/sites-enabled/millioai.conf.bak.$(date +%Y%m%d)

# 2. 설정 수정
vi /etc/nginx/sites-enabled/millioai.conf
# ↑ 위 권장 설정의 location / 블록 내용으로 교체

# 3. 문법 검증
nginx -t
# → 'configuration file ... test is successful' 확인

# 4. 무중단 reload
systemctl reload nginx
# 또는: nginx -s reload

# 5. 즉시 검증
curl -I https://millioai.com
# → HTTP/2 200 정상 응답 확인
```

---

## 🧪 효과 검증

### Before (현재)

```bash
# 배포 전 새 터미널에서 1초 간격 모니터링
while true; do
  STATUS=$(curl -sk -o /dev/null -w "%{http_code}" https://millioai.com)
  echo "$(date +%H:%M:%S) HTTP $STATUS"
  sleep 1
done
# → 배포 시 1~2건의 502/503 관찰됨
```

### After (nginx retry 적용 후)

```bash
# 동일 모니터링
# → 모든 응답 200 (재시도가 사용자에게 보이지 않음)
```

---

## 🛡 안전 / 부작용

| 우려 | 설명 |
| --- | --- |
| 재시도 지연 | 정상 요청은 영향 없음. 502 발생 시점에만 최대 5초 추가 (사용자에게 200 응답) |
| upstream 과부하 | `max_fails=3 fail_timeout=2s` 로 짧은 시간 차단 → 무한 재시도 방지 |
| POST 요청 재시도 | 비멱등 요청은 위험. 필요 시 `proxy_next_upstream off;` 를 비멱등 라우트에만 별도 적용 |
| WebSocket | 본 프로젝트는 WS 미사용 — 우려 없음 |

### 비멱등 라우트 예외 (선택)

POST/PUT/DELETE 가 비멱등이라 재시도 시 중복 처리 위험이 있다면:

```nginx
# /api/* 의 POST 만 재시도 안 함
location /api/ {
    proxy_pass http://haccpone_backend;
    # ... 기본 헤더들 ...

    # 비멱등 메서드는 재시도 비활성
    if ($request_method = POST) {
        set $no_retry 1;
    }
    proxy_next_upstream error timeout;
    # http_502 등은 GET 만 재시도 — 별도 location 분리가 더 깔끔
}
```

→ 본 ERP 의 tRPC 는 mutation 도 idempotent 하게 설계되어 있어 (대부분 `LIMIT 1` + UNIQUE 제약), 일괄 재시도해도 안전. 특정 라우트만 격리하려면 별도 location 으로 분리 권장.

---

## 🔜 향후 — 진짜 zero-downtime

본 가이드는 nginx 측 임시 우회. 진정한 zero-downtime 은:

1. **PM2 cluster mode** (`exec_mode: 'cluster' + instances: 2`)
   - 신/구 worker 가 같은 PORT 공유 (Linux SO_REUSEPORT)
   - **선결 조건**: cron scheduler 들에 cluster lock 추가 (현재 single instance 가정)
   - 별도 PR + 충분한 검증 필요

2. **Blue/Green 배포** — 두 PORT (3001/3002) 에 신/구 인스턴스 → nginx 가 health check 후 전환
   - PM2 + nginx 설정 모두 변경
   - 더 큰 리팩토링

이 두 옵션은 별도 검토.

---

## 관련 문서

- [`ecosystem.config.cjs`](../../ecosystem.config.cjs) — `wait_ready: true` 설정
- [`docs/deploy-flow.md`](../deploy-flow.md) — Release 자산 기반 배포 흐름
- [`docs/workflow/pr-deployment-cycle.md`](../workflow/pr-deployment-cycle.md) — PR/배포 사이클
