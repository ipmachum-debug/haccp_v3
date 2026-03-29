/**
 * 채널톡 (Channel Talk) 위젯 통합
 *
 * 플랜별 동작:
 *   - Starter: 봇 자동응답만 (운영 시간 외)
 *   - Standard: 실시간 채팅 상담
 *   - Enterprise: 전담 매니저 채널 배정
 *
 * 설정:
 *   .env에 VITE_CHANNEL_TALK_PLUGIN_KEY 추가
 *   채널톡 가입: https://channel.io
 *
 * 사용:
 *   DashboardLayout에서 <ChannelTalkWidget /> 렌더링
 */
import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";

declare global {
  interface Window {
    ChannelIO?: any;
    ChannelIOInitialized?: boolean;
  }
}

const PLUGIN_KEY = import.meta.env.VITE_CHANNEL_TALK_PLUGIN_KEY || "";

function bootChannelTalk() {
  const ch = function (...args: any[]) {
    ch.c(args);
  } as any;
  ch.q = [] as any[];
  ch.c = function (args: any[]) {
    ch.q.push(args);
  };
  window.ChannelIO = ch;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://cdn.channel.io/plugin/ch-plugin-web.js";
  const firstScript = document.getElementsByTagName("script")[0];
  firstScript?.parentNode?.insertBefore(script, firstScript);
}

/** 채널톡 채팅창 열기 (하나 챗봇에서 호출) */
export function openChannelTalk() {
  if (window.ChannelIO) {
    window.ChannelIO("showMessenger");
  }
}

// 채널톡 기본 버튼을 CSS로 완전히 숨김 (깜빡임 방지)
const HIDE_STYLE_ID = "channel-talk-hide-btn";
function injectHideStyle() {
  if (document.getElementById(HIDE_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = HIDE_STYLE_ID;
  style.textContent = `#ch-plugin-entry { display: none !important; }`;
  document.head.appendChild(style);
}

export default function ChannelTalkWidget() {
  const { user } = useAuth();

  useEffect(() => {
    // 플러그인키 없으면 로드하지 않음
    if (!PLUGIN_KEY) return;

    // 기본 버튼 CSS로 즉시 숨김 (SDK 로드 전부터 적용)
    injectHideStyle();

    if (window.ChannelIOInitialized) return;

    bootChannelTalk();
    window.ChannelIOInitialized = true;

    window.ChannelIO("boot", {
      pluginKey: PLUGIN_KEY,
      hideChannelButtonOnBoot: true, // 기본 버튼 숨김 (하나에서 열기)
      // 로그인 사용자 정보 연동
      ...(user ? {
        memberId: String(user.id),
        profile: {
          name: (user as any).name || (user as any).email,
          email: (user as any).email,
          role: (user as any).role,
          tenantId: (user as any).tenantId,
          plan: (user as any).plan || "starter",
        },
      } : {}),
    });

    return () => {
      if (window.ChannelIO) {
        window.ChannelIO("shutdown");
        window.ChannelIOInitialized = false;
      }
    };
  }, [user]);

  // 채널톡 SDK가 UI를 직접 렌더링하므로 컴포넌트 자체는 빈 div
  return null;
}
