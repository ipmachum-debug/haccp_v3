/**
 * Framer Motion 애니메이션 유틸리티
 * 재사용 가능한 애니메이션 설정 및 variants
 */

type Variants = Record<string, any>;

// 페이드 인 애니메이션
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

// 슬라이드 업 애니메이션
export const slideUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

// 슬라이드 다운 애니메이션
export const slideDown: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

// 슬라이드 왼쪽 애니메이션
export const slideLeft: Variants = {
  hidden: { opacity: 0, x: 20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

// 슬라이드 오른쪽 애니메이션
export const slideRight: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

// 스케일 업 애니메이션
export const scaleUp: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

// 스케일 다운 애니메이션
export const scaleDown: Variants = {
  hidden: { opacity: 0, scale: 1.05 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

// 스태거 컨테이너 (자식 요소 순차 애니메이션)
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

// 스태거 아이템
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
};

// 버튼 호버 애니메이션
export const buttonHover = {
  scale: 1.02,
  transition: { duration: 0.2, ease: "easeInOut" },
};

// 버튼 탭 애니메이션
export const buttonTap = {
  scale: 0.98,
  transition: { duration: 0.1, ease: "easeInOut" },
};

// 카드 호버 애니메이션
export const cardHover = {
  y: -4,
  boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.15)",
  transition: { duration: 0.3, ease: "easeOut" },
};

// 아이콘 회전 애니메이션
export const iconRotate = {
  rotate: 360,
  transition: { duration: 0.5, ease: "easeInOut" },
};

// 아이콘 바운스 애니메이션
export const iconBounce = {
  y: [0, -10, 0],
  transition: { duration: 0.5, ease: "easeInOut" },
};

// 아이콘 펄스 애니메이션
export const iconPulse = {
  scale: [1, 1.1, 1],
  transition: { duration: 0.5, ease: "easeInOut" },
};

// 모달 오버레이 애니메이션
export const modalOverlay: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2 },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.2 },
  },
};

// 모달 컨텐츠 애니메이션
export const modalContent: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 20,
    transition: { duration: 0.2 },
  },
};

// 드롭다운 애니메이션
export const dropdown: Variants = {
  hidden: { opacity: 0, y: -10, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.2, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    y: -10,
    scale: 0.95,
    transition: { duration: 0.15 },
  },
};

// 페이지 전환 애니메이션
export const pageTransition: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    x: 20,
    transition: { duration: 0.3 },
  },
};

// 숫자 카운트업 애니메이션 (useAnimationControls와 함께 사용)
export const countUp = (from: number, to: number, duration: number = 1) => ({
  from,
  to,
  transition: { duration, ease: "easeOut" },
});

// 진행 바 애니메이션
export const progressBar = (progress: number) => ({
  width: `${progress}%`,
  transition: { duration: 0.5, ease: "easeOut" },
});

// 스켈레톤 로딩 애니메이션
export const skeletonPulse = {
  opacity: [0.5, 1, 0.5],
  transition: {
    duration: 1.5,
    repeat: Infinity,
    ease: "easeInOut",
  },
};

// 성공 체크마크 애니메이션
export const successCheck: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

// 에러 X 마크 애니메이션
export const errorX: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: {
    pathLength: 1,
    opacity: 1,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

// 로딩 스피너 애니메이션
export const spinner = {
  rotate: 360,
  transition: {
    duration: 1,
    repeat: Infinity,
    ease: "linear",
  },
};

// 툴팁 애니메이션
export const tooltip: Variants = {
  hidden: { opacity: 0, scale: 0.9, y: 5 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.15, ease: "easeOut" },
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    y: 5,
    transition: { duration: 0.1 },
  },
};

// 리플 효과 (버튼 클릭)
export const ripple = {
  scale: [0, 2],
  opacity: [0.5, 0],
  transition: { duration: 0.6, ease: "easeOut" },
};

// 플로팅 애니메이션 (FAB)
export const floating = {
  y: [0, -10, 0],
  transition: {
    duration: 2,
    repeat: Infinity,
    ease: "easeInOut",
  },
};

// 셰이크 애니메이션 (에러 표시)
export const shake = {
  x: [0, -10, 10, -10, 10, 0],
  transition: { duration: 0.5 },
};

// 글리치 애니메이션
export const glitch = {
  x: [0, -5, 5, -5, 5, 0],
  y: [0, 5, -5, 5, -5, 0],
  transition: { duration: 0.3 },
};
