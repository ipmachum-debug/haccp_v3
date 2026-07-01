// Service Worker for HACCP PWA
// v8: 2026-04-16 — 강제 캐시 전체 삭제 (vendor-pdf 캐시 오염 해결)
// v9-2026-05-20 (PR-T): 매출 승인 무반응 사고 해결 후에도 사용자 화면에
//   PR-Q/PR-S 빌드 마커가 안 나타나는 사고 → 사용자 브라우저가 stale
//   index.html 을 보고 있을 가능성. CACHE_NAME bump 로 SW activate 시
//   기존 캐시 전체 삭제 + clients.claim + 자동 reload 메시지 전파.
// v10-2026-07-01 (승인요청 무반응 사고 해결):
//   Chrome/Safari 최신 버전에서 event.respondWith 안의 fetch(event.request) 재전송이
//   POST/PATCH 등 body 있는 요청의 tRPC 응답을 "Failed to convert value to 'Response'"
//   TypeError 로 실패시킴 → 승인요청·매출승인·저장 등 모든 mutation 무반응 사고.
//   → GET 이외의 모든 요청과 /trpc/* 경로 완전 비개입으로 수정.
const CACHE_NAME = 'haccp-v10-2026-07-01';

// 설치 이벤트 - 즉시 활성화
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 활성화 이벤트 - 이전 캐시 모두 삭제 + 클라이언트 리로드
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    }).then(() => {
      // 모든 클라이언트에 리로드 메시지 전송
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
        });
      });
    })
  );
});

// Fetch 이벤트
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // ─────────────────────────────────────────────────────────────
  // ⚠️ 절대 respondWith 하지 말아야 하는 요청들 (비개입 = SW pass-through)
  // ─────────────────────────────────────────────────────────────

  // 1. GET 이외의 모든 요청 (POST/PUT/PATCH/DELETE)
  //    → body 가 있는 요청을 respondWith 안에서 재전송하면
  //    "Failed to convert value to 'Response'" TypeError 발생
  if (req.method !== 'GET') {
    return;
  }

  // 2. tRPC 요청 (mutation/query 모두)
  if (url.pathname.startsWith('/trpc/') || url.pathname.startsWith('/api/trpc/')) {
    return;
  }

  // 3. 백엔드 API 요청 전반
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 4. Vite 해시 자산 (Nginx/브라우저가 캐시)
  if (url.pathname.startsWith('/assets/')) {
    return;
  }

  // 5. 크로스 오리진 요청 (다른 도메인)
  if (url.origin !== self.location.origin) {
    return;
  }

  // 6. WebSocket, EventSource 등 스트리밍
  if (req.headers.get('upgrade') || req.headers.get('accept')?.includes('text/event-stream')) {
    return;
  }

  // ─────────────────────────────────────────────────────────────
  // GET HTML/기타 요청 → Network First, 실패시 캐시 fallback
  // ─────────────────────────────────────────────────────────────
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});

// Push 알림
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'HACCP 알림';
  const options = {
    body: data.body || '새로운 알림이 있습니다',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 알림 클릭
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url || '/'));
});
