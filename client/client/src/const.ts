export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// 로컬 JWT 인증 사용 - 로그인 페이지로 리다이렉트
export const getLoginUrl = () => {
  return "/login";
};
