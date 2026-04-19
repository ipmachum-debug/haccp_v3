/**
 * Millio AI 루프 로고 컴포넌트
 * 실제 로고 이미지 사용 (3D 리본 인피니티)
 */
export function MillioLogo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <img
      src="/millio-logo.png"
      alt="Millio AI"
      className={className}
      draggable={false}
    />
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
