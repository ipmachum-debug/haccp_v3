import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcrypt";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "haccp-default-secret-change-in-production"
);

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
