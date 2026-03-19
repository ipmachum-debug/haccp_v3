// Service Worker for HACCP PWA
// v3: 배포 시 캐시 충돌 방지 - Vite 해시 에셋은 캐시하지 않음
const CACHE_NAME = 'haccp-v3';

// 설치 이벤트 - 즉시 활성화
self.addEventListener('install', (event) => {
  // 이전 SW를 기다리지 않고 즉시 활성화
  self.skipWaiting();
});

// 활성화 이벤트 - 이전 캐시 모두 삭제
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // 모든 이전 캐시 삭제 (v1, v2 포함)
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // 즉시 모든 클라이언트 제어
      return self.clients.claim();
    })
  );
});

// Fetch 이벤트 - 에셋 파일은 캐시하지 않음 (Nginx + 브라우저 캐시로 충분)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // /assets/ 경로의 JS/CSS 파일은 서비스워커가 개입하지 않음
  // Vite가 해시된 파일명을 생성하므로 브라우저 캐시 + Nginx 1년 캐시로 충분
  if (url.pathname.startsWith('/assets/')) {
    return; // event.respondWith 호출 안함 → 브라우저 기본 동작
  }

  // API 요청도 캐시하지 않음
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 나머지 요청 (HTML 페이지 등)은 Network First
  event.respondWith(
    fetch(event.request)
      .catch(() => {
        // 네트워크 실패 시에만 캐시에서 반환 (오프라인 지원)
        return caches.match(event.request);
      })
  );
});

// Push 알림 이벤트
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'HACCP 알림';
  const options = {
    body: data.body || '새로운 알림이 있습니다',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 알림 클릭 이벤트
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});
