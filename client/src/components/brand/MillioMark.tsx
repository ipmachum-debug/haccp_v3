import { useId } from "react";

interface MillioMarkProps {
  className?: string;
  size?: number;
  /** 배경 원형 래퍼 여부 (기존 Shield 자리에 그대로 넣기 위함) */
  withBackground?: boolean;
  /** 배경 클래스 (기본 흰색/투명). withBackground=true 일 때만 사용 */
  backgroundClassName?: string;
}

/**
 * Millio AI 브랜드 마크 — "M"자를 파랑+주황 리본 2개가 서로 교차하여 형성
 *
 * - 왼쪽 파랑 리본: 왼쪽 다리 → 왼쪽 피크 → 중앙 밸리 (아래 방향 곡선)
 * - 오른쪽 주황 리본: 오른쪽 다리 → 오른쪽 피크 → 중앙 밸리 (아래 방향 곡선)
 * - useId() 로 gradient id 충돌 방지 → 같은 페이지에 여러 번 사용 가능
 */
export function MillioMark({
  className = "",
  size,
  withBackground = false,
  backgroundClassName = "bg-white",
}: MillioMarkProps) {
  const uid = useId().replace(/:/g, "");
  const blueId = `mm-blue-${uid}`;
  const orangeId = `mm-orange-${uid}`;

  const svg = (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      {...(size ? { width: size, height: size } : {})}
      className={withBackground ? "" : className}
      aria-label="Millio AI"
    >
      <defs>
        <linearGradient id={blueId} x1="0" y1="0" x2="0.25" y2="1">
          <stop offset="0%" stopColor="#5FC5EE" />
          <stop offset="100%" stopColor="#0B3F7B" />
        </linearGradient>
        <linearGradient id={orangeId} x1="1" y1="0" x2="0.75" y2="1">
          <stop offset="0%" stopColor="#FFCD4A" />
          <stop offset="55%" stopColor="#F58629" />
          <stop offset="100%" stopColor="#E63F1B" />
        </linearGradient>
      </defs>

      {/* Blue left ribbon: left leg → left peak → valley */}
      <path
        d="M 10 54 L 10 18 Q 10 10 18 10 Q 24 10 27 16 L 32 46"
        stroke={`url(#${blueId})`}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Orange right ribbon: right leg → right peak → valley */}
      <path
        d="M 54 54 L 54 18 Q 54 10 46 10 Q 40 10 37 16 L 32 46"
        stroke={`url(#${orangeId})`}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (withBackground) {
    return (
      <div
        className={`rounded-xl flex items-center justify-center ${backgroundClassName} ${className}`}
      >
        {svg}
      </div>
    );
  }

  return svg;
}

/**
 * 풀 워드마크 — 루프 M + "Millio AI" 텍스트 (수평)
 */
export function MillioWordmark({
  className = "",
  markSize = 28,
}: {
  className?: string;
  markSize?: number;
}) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <MillioMark size={markSize} />
      <span className="text-lg font-bold tracking-tight text-[#1a1a2e]">
        Millio<span className="text-orange-500"> AI</span>
      </span>
    </div>
  );
}
