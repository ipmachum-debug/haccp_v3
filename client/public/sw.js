// Service Worker for HACCP PWA
// v7: 2026-04-11 — 강제 캐시 전체 삭제 + 클라이언트 자동 리로드
const CACHE_NAME = 'haccp-v7';

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
  const url = new URL(event.request.url);

  // /assets/ 경로 → 서비스워커 비개입 (Vite 해시 파일명 + Nginx 캐시)
  if (url.pathname.startsWith('/assets/')) {
    return;
  }

  // API 요청 → 비개입
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 나머지 (HTML 등) → Network First, 캐시 없음
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
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
