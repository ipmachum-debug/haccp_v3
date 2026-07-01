// Service Worker for HACCP PWA — DEACTIVATED (v11-2026-07-01 kill switch)
//
// 배경: v9 → v10 로 pass-through 처리를 강화했음에도, 일부 사용자 브라우저에서
//   여전히 저장/승인요청 mutation 이 서버까지 도달하지 못하는 사고 지속.
//   원인은 브라우저에 이전 버전 SW 가 활성화되어 있을 때 fetch 핸들러가
//   POST/tRPC 요청을 가로채 "Failed to convert value to 'Response'" 를 유발.
//
// 조치: SW 를 사실상 no-op 로 만들고 install 즉시 자기 자신을 unregister.
//   → 다음 페이지 로드 시 브라우저는 SW 없이 통신하게 되어
//   저장/승인요청이 정상 동작.
// PWA 오프라인 지원은 HACCP 요구사항이 아니므로 SW 없이 운영.

const CACHE_NAME = 'haccp-v11-killswitch-2026-07-01';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 1) 모든 캐시 삭제
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((n) => caches.delete(n)));
    } catch (e) {
      // ignore
    }

    // 2) 클라이언트에 리로드 메시지
    try {
      const clientList = await self.clients.matchAll({ type: 'window' });
      clientList.forEach((client) => {
        client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
      });
    } catch (e) {
      // ignore
    }

    // 3) 자기 자신 unregister — 다음 새로고침부터 SW 없이 동작
    try {
      await self.registration.unregister();
    } catch (e) {
      // ignore
    }
  })());
});

// Fetch: 완전 비개입 (respondWith 호출 안 함)
self.addEventListener('fetch', (event) => {
  // 아무것도 안 하고 브라우저 기본 fetch 에 맡김
  return;
});
