// Service Worker 등록
// ★ PR-T (2026-05-20): SW 가 업데이트되어도 사용자가 confirm 다이얼로그를
//   놓치거나 거절하면 영원히 stale 한 화면을 보게 됨 (PR-Q/PR-S 미수신 사고).
//   → 자동 reload + SW 의 SW_UPDATED 메시지를 react 단에서도 수신해 강제 새로고침.
//   사용자 데이터 손실 우려가 있을 수 있으므로 sessionStorage 가드로 무한루프 차단.
const RELOAD_GUARD_KEY = "haccp:sw-reloaded-at";
const RELOAD_GUARD_TTL_MS = 30_000; // 30초 안에 또 reload 시도 안 함

function maybeReloadForSwUpdate(reason: string) {
  try {
    const prev = sessionStorage.getItem(RELOAD_GUARD_KEY);
    const now = Date.now();
    if (prev) {
      const prevTs = parseInt(prev, 10);
      if (!isNaN(prevTs) && now - prevTs < RELOAD_GUARD_TTL_MS) {
        console.log(`[SW] reload guard active (last ${now - prevTs}ms ago) — skip (${reason})`);
        return;
      }
    }
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(now));
    console.log(`[SW] auto reload triggered: ${reason}`);
    window.location.reload();
  } catch (e) {
    console.error("[SW] reload failed:", e);
  }
}

// v11-2026-07-01: SW 완전 제거 모드
// 배경: v10 pass-through 로 수정해도 일부 브라우저에서 저장/승인요청이
//   서버에 도달하지 못하는 사고 지속. SW 를 완전히 없애기로 결정.
//   기존 사용자 브라우저에 남은 SW 는 페이지 로드 시 강제 unregister.
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // SW 가 보낸 SW_UPDATED (kill-switch 완료 신호) → 자동 새로고침
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SW_UPDATED') {
      console.log('[SW] SW_UPDATED received (kill-switch), version=', event.data.version);
      maybeReloadForSwUpdate(`SW_UPDATED ${event.data.version}`);
    }
  });

  window.addEventListener('load', async () => {
    try {
      // ① 이미 등록된 SW 가 있으면 즉시 unregister 시도
      const existing = await navigator.serviceWorker.getRegistrations();
      if (existing.length > 0) {
        console.log(`[SW] found ${existing.length} existing registration(s) — unregistering all`);
        await Promise.all(existing.map((r) => r.unregister().catch(() => false)));
        // 모든 캐시 정리
        try {
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
        } catch {
          // ignore
        }
        // 한 번만 새로고침 (guard 가 무한루프 방지)
        maybeReloadForSwUpdate('unregister-existing');
        return;
      }

      // ② 등록된 SW 가 없으면, 새 kill-switch SW 를 한 번 등록해서
      //    브라우저에 남아있을 수 있는 stale SW 를 확실히 제거하도록 한다.
      //    (kill-switch SW 는 activate 시 자기 자신을 unregister 함)
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('[SW] kill-switch SW registered:', registration.scope);
    } catch (error) {
      console.error('[SW] registration/cleanup failed:', error);
    }
  });
}

// PWA 설치 프롬프트
let deferredPrompt: any;

export function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // 기본 설치 프롬프트 방지
    e.preventDefault();
    deferredPrompt = e;
    
    // 설치 버튼 표시 (선택 사항)
    console.log('PWA install prompt available');
  });
  
  window.addEventListener('appinstalled', () => {
    console.log('PWA installed successfully');
    deferredPrompt = null;
  });
}

// 설치 프롬프트 트리거
export function triggerInstallPrompt() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult: any) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      deferredPrompt = null;
    });
  }
}
