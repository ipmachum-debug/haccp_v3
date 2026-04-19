import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcrypt";

// JWT_SECRET: production 에서는 env 필수, 없으면 부팅 실패
// dev/test 에서만 로컬 기본값 허용 (로컬 디버깅 목적)
function resolveJwtSecret(): Uint8Array {
  const envSecret = process.env.JWT_SECRET;
  if (envSecret && envSecret.length >= 32) {
    return new TextEncoder().encode(envSecret);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[SECURITY] JWT_SECRET 환경변수 필수 (32자 이상). production 부팅 중단.",
    );
  }
  // dev/test 전용 폴백 — production 에서는 위에서 throw
  console.warn(
    "[SECURITY] JWT_SECRET 미설정 — dev/test 전용 폴백 사용 중. production 에서는 반드시 env 설정 필요.",
  );
  return new TextEncoder().encode(
    "dev-only-jwt-secret-do-not-use-in-production-12345678",
  );
}

const JWT_SECRET = resolveJwtSecret();

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = "7d"; // 7일 유효

export interface JwtPayload {
  userId: number;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

/**
 * 비밀번호 해싱
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * 비밀번호 검증
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * JWT 토큰 생성
 */
export async function generateToken(payload: Omit<JwtPayload, "iat" | "exp">): Promise<string> {
  const token = await new SignJWT(payload as any)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(JWT_SECRET);

  return token;
}

/**
 * JWT 토큰 검증
 */
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JwtPayload;
  } catch (error) {
    console.error("[JWT] Token verification failed:", error);
    return null;
  }
}
