/**
 * Millio AI 루프 로고 SVG 컴포넌트
 * 3D 리본 인피니티 루프 — 블루↔오렌지 그라데이션
 */
export function MillioLogo({ className = "w-8 h-8" }: { className?: string }) {
  // 컴포넌트마다 고유 ID를 위해 (SSR/다중 인스턴스 안전)
  const id = "ml";
  return (
    <svg
      viewBox="0 0 200 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* 왼쪽 루프 외부: 밝은 시안 → 블루 */}
        <linearGradient id={`${id}-lo`} x1="0" y1="20" x2="80" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5FCAF9" />
          <stop offset="40%" stopColor="#3B9EF5" />
          <stop offset="100%" stopColor="#1D5ED9" />
        </linearGradient>
        {/* 왼쪽 루프 내부 (어두운 면): 네이비 */}
        <linearGradient id={`${id}-li`} x1="30" y1="40" x2="70" y2="110" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E40AF" />
          <stop offset="100%" stopColor="#172554" />
        </linearGradient>
        {/* 오른쪽 루프 외부: 밝은 옐로→오렌지 */}
        <linearGradient id={`${id}-ro`} x1="120" y1="20" x2="200" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FBC34A" />
          <stop offset="50%" stopColor="#F9971A" />
          <stop offset="100%" stopColor="#EA580C" />
        </linearGradient>
        {/* 오른쪽 루프 내부 (어두운 면): 딥 오렌지 */}
        <linearGradient id={`${id}-ri`} x1="130" y1="40" x2="170" y2="110" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#C2410C" />
          <stop offset="100%" stopColor="#7C2D12" />
        </linearGradient>
        {/* 중앙 크로스 상단: 블루→오렌지 */}
        <linearGradient id={`${id}-ct`} x1="70" y1="30" x2="140" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="40%" stopColor="#6D5BD0" />
          <stop offset="100%" stopColor="#F59E0B" />
        </linearGradient>
        {/* 중앙 크로스 하단: 어두운 퍼플→딥오렌지 */}
        <linearGradient id={`${id}-cb`} x1="60" y1="70" x2="130" y2="110" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E3A8A" />
          <stop offset="50%" stopColor="#4C1D95" />
          <stop offset="100%" stopColor="#9A3412" />
        </linearGradient>
      </defs>

      {/* === 왼쪽 루프 (블루) === */}
      {/* 뒤쪽 어두운 면 */}
      <path
        d="M72 105 C30 105, 6 85, 6 70 C6 55, 30 35, 72 35 L82 50 C50 50, 28 60, 28 70 C28 80, 50 90, 82 90 Z"
        fill={`url(#${id}-li)`}
      />
      {/* 앞쪽 밝은 면 */}
      <path
        d="M72 20 C20 20, -4 45, -4 70 C-4 95, 20 120, 72 120 L82 105 C38 105, 14 90, 14 70 C14 50, 38 35, 82 35 Z"
        fill={`url(#${id}-lo)`}
      />

      {/* === 오른쪽 루프 (오렌지) === */}
      {/* 뒤쪽 어두운 면 */}
      <path
        d="M128 35 C170 35, 194 55, 194 70 C194 85, 170 105, 128 105 L118 90 C150 90, 172 80, 172 70 C172 60, 150 50, 118 50 Z"
        fill={`url(#${id}-ri)`}
      />
      {/* 앞쪽 밝은 면 */}
      <path
        d="M128 120 C180 120, 204 95, 204 70 C204 45, 180 20, 128 20 L118 35 C162 35, 186 50, 186 70 C186 90, 162 105, 118 105 Z"
        fill={`url(#${id}-ro)`}
      />

      {/* === 중앙 크로스 (위로 지나가는 리본) === */}
      {/* 앞쪽 크로스 — 위에서 아래로, 오른쪽→왼쪽 */}
      <path
        d="M118 35 L128 20 L82 105 L72 120 Z"
        fill={`url(#${id}-ct)`}
      />
      {/* 뒤쪽 크로스 — 아래에서 위로, 왼쪽→오른쪽 */}
      <path
        d="M82 35 L72 20 L118 105 L128 120 Z"
        fill={`url(#${id}-cb)`}
        opacity="0.5"
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
