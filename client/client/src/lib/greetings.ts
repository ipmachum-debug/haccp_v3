/**
 * 로그인 시 재미있는 인사 메시지를 생성하는 유틸리티
 */

// 요일별 메시지
const dayMessages: Record<number, string[]> = {
  0: [ // 일요일
    "일요일에도 일하시네요! 대단해요! 🌟",
    "주말에도 열정적이시네요! 👏",
    "일요일 출근! 멋져요! 💪",
  ],
  1: [ // 월요일
    "새로운 한 주의 시작! 파이팅! 💼",
    "월요일이지만 힘내세요! 🚀",
    "이번 주도 화이팅! 💪",
  ],
  2: [ // 화요일
    "화요일도 힘차게! 🔥",
    "이번 주 벌써 화요일이네요! ⚡",
    "화요일도 파이팅! 💪",
  ],
  3: [ // 수요일
    "수요일! 이번 주 절반 왔어요! 🎯",
    "수요일도 힘내세요! 💪",
    "벌써 수요일이네요! 화이팅! ⚡",
  ],
  4: [ // 목요일
    "목요일! 주말이 코앞이에요! 🎉",
    "목요일도 힘내세요! 거의 다 왔어요! 💪",
    "목요일! 조금만 더 힘내요! 🚀",
  ],
  5: [ // 금요일
    "불금이에요! 조금만 더 힘내요! 🎉",
    "금요일! 주말이 기다려요! 🌟",
    "금요일 파이팅! 주말이 코앞! 🎊",
  ],
  6: [ // 토요일
    "토요일에도 일하시네요! 멋져요! 🌟",
    "주말에도 열심히! 대단해요! 👏",
    "토요일 출근! 화이팅! 💪",
  ],
};

// 일반 랜덤 메시지
const generalMessages = [
  "오늘도 화이팅! 💪",
  "반가워요, 오늘도 멋진 하루 되세요! ✨",
  "어서오세요! 오늘은 어떤 일을 하실 건가요? 🚀",
  "환영합니다! 커피 한 잔 어때요? ☕",
  "좋은 하루 되세요! 🌈",
  "오늘도 최고의 하루 만드세요! 🌟",
  "반갑습니다! 오늘도 힘내세요! 💫",
  "어서오세요! 오늘도 좋은 일만 가득하길! 🍀",
  "환영합니다! 오늘도 파이팅! 🎯",
  "좋은 하루의 시작! 화이팅! 🌅",
];

// 시간대별 인사
const getTimeGreeting = (): string => {
  const hour = new Date().getHours();
  
  if (hour >= 5 && hour < 12) {
    return "좋은 아침이에요! ☀️";
  } else if (hour >= 12 && hour < 14) {
    return "점심은 드셨나요? 🍱";
  } else if (hour >= 14 && hour < 18) {
    return "오후도 힘내세요! 🌤️";
  } else if (hour >= 18 && hour < 22) {
    return "오늘 하루도 수고하셨어요! 🌙";
  } else {
    return "늦은 시간까지 수고하세요! 🌃";
  }
};

/**
 * 재미있는 인사 메시지 생성
 * 요일별 메시지와 일반 메시지를 랜덤하게 조합
 */
export const getGreetingMessage = (userName?: string): string => {
  const day = new Date().getDay();
  const messages = [...dayMessages[day], ...generalMessages];
  const randomMessage = messages[Math.floor(Math.random() * messages.length)];
  
  // 30% 확률로 시간대별 인사 추가
  const useTimeGreeting = Math.random() < 0.3;
  const greeting = useTimeGreeting ? getTimeGreeting() : randomMessage;
  
  // 사용자 이름이 있으면 추가
  if (userName) {
    return `${userName}님, ${greeting}`;
  }
  
  return greeting;
};

/**
 * 간단한 인사 메시지 (시간대별만)
 */
export const getSimpleGreeting = (userName?: string): string => {
  const greeting = getTimeGreeting();
  
  if (userName) {
    return `${userName}님, ${greeting}`;
  }
  
  return greeting;
};
