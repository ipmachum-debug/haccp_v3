import { Router } from "express";
import { loginUser } from "../localAuth";
import { COOKIE_NAME } from "../../shared/const";
import { getSessionCookieOptions } from "./cookies";

export const loginRouter = Router();

loginRouter.post("/api/login", async (req, res) => {
  try {
    console.log("[Login Route] 로그인 요청 받음:", req.body);
    
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "이메일과 비밀번호를 입력해주세요.",
      });
    }

    // 로그인 처리
    const loginResult = await loginUser(email, password);

    // JWT 토큰을 쿠키에 저장
    const cookieOptions = getSessionCookieOptions(req);
    console.log('[Login Route] Cookie options:', JSON.stringify(cookieOptions));
    console.log('[Login Route] Request protocol:', req.protocol);
    console.log('[Login Route] X-Forwarded-Proto:', req.headers['x-forwarded-proto']);
    console.log('[Login Route] Request hostname:', req.hostname);
    res.cookie(COOKIE_NAME, loginResult.token, cookieOptions);

    console.log("[Login Route] 로그인 성공, 쿠키 설정 완료");

    // 성공 응답
    return res.json({
      success: true,
      message: "로그인 성공",
      user: loginResult.user,
    });
  } catch (error) {
    console.error("[Login Route] 로그인 에러:", error);
    return res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
    });
  }
});
