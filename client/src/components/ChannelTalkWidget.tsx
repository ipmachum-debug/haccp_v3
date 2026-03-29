/**
 * 채널톡 (Channel Talk) 위젯 통합
 *
 * 핵심: SDK를 한 번만 로드하고 절대 shutdown하지 않음
 * 런처 버튼은 index.html CSS로 숨김
 * 하나 챗봇에서 openChannelTalk()/closeChannelTalk()으로만 제어
 */
import { useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";

declare global {
  interface Window {
    ChannelIO?: any;
    ChannelIOBooted?: boolean;
  }
}

const PLUGIN_KEY = import.meta.env.VITE_CHANNEL_TALK_PLUGIN_KEY || "";

/** 채널톡 채팅창 열기 */
export function openChannelTalk() {
  if (window.ChannelIO) {
    window.ChannelIO("showMessenger");
  }
}

/** 채널톡 채팅창 닫기 */
export function closeChannelTalk() {
  if (window.ChannelIO) {
    window.ChannelIO("hideMessenger");
  }
}

export default function ChannelTalkWidget() {
  const { user } = useAuth();
  const bootedRef = useRef(false);

  useEffect(() => {
    if (!PLUGIN_KEY) return;
    // 이미 부팅됐으면 사용자 정보만 업데이트
    if (window.ChannelIOBooted) {
      if (user && window.ChannelIO) {
        window.ChannelIO("updateUser", {
          profile: {
            name: (user as any).name || (user as any).email,
            email: (user as any).email,
            role: (user as any).role,
            tenantId: (user as any).tenantId,
          },
        });
      }
      return; // shutdown 하지 않음!
    }

    // 최초 1회만 SDK 로드 + boot
    if (bootedRef.current) return;
    bootedRef.current = true;

    // SDK 스크립트 로드
    const ch = function (...args: any[]) { ch.c(args); } as any;
    ch.q = [] as any[];
    ch.c = function (args: any[]) { ch.q.push(args); };
    window.ChannelIO = ch;

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://cdn.channel.io/plugin/ch-plugin-web.js";
    document.head.appendChild(script);

    // boot
    window.ChannelIO("boot", {
      pluginKey: PLUGIN_KEY,
      hideChannelButtonOnBoot: true,
      ...(user ? {
        memberId: String(user.id),
        profile: {
          name: (user as any).name || (user as any).email,
          email: (user as any).email,
          role: (user as any).role,
          tenantId: (user as any).tenantId,
        },
      } : {}),
    });

    window.ChannelIOBooted = true;
    // cleanup 없음 — shutdown 하지 않아서 깜빡임 없음
  }, [user]);

  return null;
}
