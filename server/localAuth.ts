import { getDb } from "./db";
import { users } from "../drizzle/schema/schema_main";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcrypt";
import { generateToken } from "./_core/jwtAuth";
import { 
  sendClientAdminApprovalRequest,
  sendEmployeeApprovalRequest 
} from "./services/emailService";
import { createAuditLog } from "./utils/auditLogger";
export async function authenticateUser(email: string, password: string, ipAddress?: string) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  
  if (!user) return null;
  
  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) return null;
  
  // 승인 대기 중인 사용자 체크
  if (user.approvalStatus === 'pending') {
    throw new Error("관리자 승인 대기 중입니다. 승인 후 로그인하실 수 있습니다.");
  }
  
  // 거부된 사용자 체크
  if (user.approvalStatus === 'rejected') {
    throw new Error("회원가입이 거부되었습니다. 관리자에게 문의하세요.");
  }
  
  // 비활성화된 사용자 체크
  if (!user.isActive) {
    throw new Error("계정이 비활성화되었습니다. 관리자에게 문의하세요.");
  }
  
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  
  // 감사 로그 기록
  // await createAuditLog({
//     action: 'login',
//     entityType: 'auth',
//     userId: user.id,
//     userEmail: user.email,
//     userRole: user.role,
//     description: `사용자 로그인 (${user.email})`,
//     ipAddress
//   });
  
  console.log("[authenticateUser] Returning user:", { 
    id: user.id, 
    email: user.email, 
    name: user.name, 
    role: user.role, 
    tenantId: user.tenantId 
  });
  
  return { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId };
}
export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  
  if (!user || !user.isActive) return null;
  
  console.log("[getUserById] Raw user from DB:", user);
  console.log("[getUserById] Returning user:", { 
    id: user.id, 
    email: user.email, 
    name: user.name, 
    role: user.role, 
    tenantId: user.tenantId 
  });
  
  return { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId };
}
export async function loginUser(email: string, password: string, ipAddress?: string) {
  const user = await authenticateUser(email, password, ipAddress);
  if (!user) {
    throw new Error("이메일 또는 비밀번호가 올바르지 않습니다");
  }
  
  // JWT 토큰 생성 (jwtAuth.ts의 generateToken 사용)
  const token = await generateToken({
    userId: user.id,
    email: user.email,
    role: user.role
  });
  
  return { user, token };
}
export async function registerUser(
  email: string,
  password: string,
  name: string,
  userType: 'b2b_partner' | 'general_user' | 'company_staff' | 'other' | 'client_admin' | 'employee',
  userMemo?: string,
  companyName?: string,
  businessNumber?: string,
  tenantId?: number,
  industryCode?: string
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 사용자 유형 검증
  if (userType === 'client_admin' && !companyName) {
    throw new Error("클라이언트 관리자는 회사명이 필수입니다.");
  }

  if (userType === 'employee' && !tenantId) {
    throw new Error("직원은 소속 회사를 선택해야 합니다.");
  }

  // 이메일 중복 체크
  const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existingUser) {
    throw new Error("이미 사용 중인 이메일입니다");
  }

  // 비밀번호 해시
  const passwordHash = await hashPassword(password);

  // 업종코드를 userMemo 에 기계가독 마커로 저장 (승인 시 parseIndustryCodeFromMemo 로 파싱해서 tenant 에 반영)
  // 예: "[INDUSTRY_CODE:C10] 사용자 메모..."
  const memoWithIndustry = industryCode
    ? `[INDUSTRY_CODE:${industryCode}] ${userMemo || ""}`.trim()
    : userMemo || null;

  // 사용자 생성 (관리자 승인 대기 상태)
  const [newUser] = await db.insert(users).values({
    tenantId: userType === 'client_admin' ? null : tenantId, // 클라이언트 관리자는 승인 후 테너트 생성
    email,
    passwordHash,
    name,
    userType,
    userMemo: memoWithIndustry,
    companyName: companyName || null,
    businessNumber: businessNumber || null,
    role: 'worker',
    isActive: 0, // 비활성 (관리자 승인 필요)
    approvalStatus: 'pending', // 승인 대기
    emailVerified: 0
  }).$returningId();
  // 승인 요청 이메일 발송
  if (userType === 'client_admin') {
    // 슈퍼관리자에게 알림
    await sendClientAdminApprovalRequest({
      email,
      name,
      companyName: companyName || '',
      businessNumber,
      createdAt: new Date(),
    });
  } else if (userType === 'employee' && tenantId) {
    // 해당 테넌트의 관리자에게 알림
    // 테넌트의 관리자 이메일 조회
    const [admin] = await db.select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.role, 'admin')))
      .limit(1);
    
    if (admin) {
      await sendEmployeeApprovalRequest(admin.email, {
        email,
        name,
        userMemo,
        createdAt: new Date(),
      });
    }
  }
  
  return { 
    success: true,
    userType,
    message: userType === 'client_admin' 
      ? '회원가입이 완료되었습니다. 슈퍼관리자의 승인을 기다려주세요.'
      : '회원가입이 완료되었습니다. 소속 회사 관리자의 승인을 기다려주세요.'
  };
}
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * `[INDUSTRY_CODE:xxx]` 마커가 들어있는 userMemo 에서 업종 코드 추출.
 * 마커가 없으면 null 반환. (원본 memo 는 stripIndustryCodeMarker 로 별도 추출)
 */
export function parseIndustryCodeFromMemo(memo: string | null | undefined): string | null {
  if (!memo) return null;
  const m = memo.match(/\[INDUSTRY_CODE:([A-Z0-9_]+)\]/);
  return m?.[1] ?? null;
}

/** `[INDUSTRY_CODE:xxx]` 마커를 제거한 사용자 메모 본문 반환. */
export function stripIndustryCodeMarker(memo: string | null | undefined): string {
  if (!memo) return "";
  return memo.replace(/\[INDUSTRY_CODE:[A-Z0-9_]+\]\s*/g, "").trim();
}
