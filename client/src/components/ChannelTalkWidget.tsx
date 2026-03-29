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

export default function ChannelTalkWidget() {
  const { user } = useAuth();

  useEffect(() => {
    // 플러그인키 없으면 로드하지 않음
    if (!PLUGIN_KEY) return;
    if (window.ChannelIOInitialized) return;

    bootChannelTalk();
    window.ChannelIOInitialized = true;

    window.ChannelIO("boot", {
      pluginKey: PLUGIN_KEY,
      // 로그인 사용자 정보 연동
      ...(user ? {
        memberId: String(user.id),
        profile: {
          name: (user as any).name || (user as any).email,
          email: (user as any).email,
          // 커스텀 필드
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
