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

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    // ★ PR-T: SW 가 보낸 SW_UPDATED 메시지 처리 → 자동 reload (사용자 입력 불필요)
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_UPDATED') {
        console.log('[SW] SW_UPDATED received, version=', event.data.version);
        maybeReloadForSwUpdate(`SW_UPDATED ${event.data.version}`);
      }
    });

    // ★ PR-T: controllerchange 도 같이 — 새 SW 가 클레임한 직후 자동 새로고침
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[SW] controllerchange — new SW took control');
      maybeReloadForSwUpdate('controllerchange');
    });

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registered:', registration.scope);

          // 업데이트 확인 (수동 confirm 흐름 제거, 자동 reload 흐름으로 통일)
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[SW] New worker installed — waiting for activate/claim');
                  // ★ PR-T: 사용자에게 confirm 묻지 않음 → 자동 reload 흐름
                  //   ① SW activate → clients.claim → controllerchange → maybeReloadForSwUpdate
                  //   ② SW activate 핸들러가 보내는 SW_UPDATED 메시지 수신 → maybeReloadForSwUpdate
                  //   둘 중 먼저 도착하는 게 reload 를 트리거하고, guard 가 중복 방지.
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    });
  }
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
