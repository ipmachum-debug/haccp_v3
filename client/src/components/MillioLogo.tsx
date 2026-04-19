/**
 * Millio AI 루프 로고 SVG 컴포넌트
 * 블루→오렌지 그라데이션 인피니티 루프
 */
export function MillioLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* 왼쪽 루프: 시안 → 블루 */}
        <linearGradient id="millio-left" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="50%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#1E40AF" />
        </linearGradient>
        {/* 오른쪽 루프: 오렌지 → 앰버 */}
        <linearGradient id="millio-right" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="50%" stopColor="#F97316" />
          <stop offset="100%" stopColor="#EA580C" />
        </linearGradient>
        {/* 중앙 크로스: 블루 → 오렌지 전환 */}
        <linearGradient id="millio-cross" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#F97316" />
        </linearGradient>
      </defs>

      {/* 왼쪽 루프 (뒤) */}
      <path
        d="M30 12 C8 12, 2 30, 2 40 C2 50, 8 68, 30 68 C42 68, 48 58, 54 48"
        stroke="url(#millio-left)"
        strokeWidth="13"
        strokeLinecap="round"
        fill="none"
      />

      {/* 오른쪽 루프 (뒤) */}
      <path
        d="M90 68 C112 68, 118 50, 118 40 C118 30, 112 12, 90 12 C78 12, 72 22, 66 32"
        stroke="url(#millio-right)"
        strokeWidth="13"
        strokeLinecap="round"
        fill="none"
      />

      {/* 중앙 크로스 (앞 - 오버레이) */}
      <path
        d="M50 52 C56 42, 60 38, 70 28"
        stroke="url(#millio-cross)"
        strokeWidth="13"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Millio AI 로고 + 텍스트 조합
 */
export function MillioLogoFull({ className = "", iconClass = "w-10 h-10" }: { className?: string; iconClass?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <MillioLogo className={iconClass} />
      <span className="font-bold text-xl tracking-tight">
        <span className="text-[#1a1a2e]">Millio</span>
        <span className="text-orange-500 ml-0.5">AI</span>
      </span>
    </div>
  );
}
