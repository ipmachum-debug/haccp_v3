interface MillioMarkProps {
  className?: string;
  size?: number;
}

/**
 * Millio AI 브랜드 마크
 * — `/millio-logo.png` (512x512 투명 배경) 이미지 사용
 * — `className` 으로 w-8/w-9/w-12 등 Tailwind 크기 지정 가능
 * — `size` prop 으로 직접 px 지정 가능 (size 우선)
 */
export function MillioMark({ className = "", size }: MillioMarkProps) {
  return (
    <img
      src="/millio-logo.png"
      alt="Millio AI"
      className={className}
      draggable={false}
      {...(size
        ? { width: size, height: size, style: { width: size, height: size } }
        : {})}
    />
  );
}

/**
 * Millio AI 로고 + 텍스트 워드마크
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
      <span className="text-lg font-bold tracking-tight">
        <span className="text-[#1a1a2e]">Millio</span>
        <span className="text-orange-500 ml-0.5">AI</span>
      </span>
    </div>
  );
}
