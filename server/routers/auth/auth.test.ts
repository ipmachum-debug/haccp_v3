/**
 * Auth 라우터 Zod 스키마 검증 테스트
 * 실제 tRPC 프로시저는 호출하지 않고, input 스키마만 검증
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";

// Re-define the schemas as exported by the router (extracted from auth.router.ts)
// This avoids importing the full router which requires DB/tRPC context
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "비밀번호는 최소 8자 이상이어야 합니다"),
  name: z.string().min(1),
  userType: z
    .enum([
      "b2b_partner",
      "general_user",
      "company_staff",
      "other",
      "client_admin",
      "employee",
    ])
    .default("employee"),
  userMemo: z.string().optional(),
  companyName: z.string().optional(),
  businessNumber: z.string().optional(),
  tenantId: z.number().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const requestPasswordResetSchema = z.object({
  email: z.string().email(),
});

describe("Register schema validation", () => {
  const validInput = {
    email: "test@example.com",
    password: "securepassword123",
    name: "홍길동",
  };

  it("accepts valid registration input", () => {
    const result = registerSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("applies default userType as 'employee'", () => {
    const result = registerSchema.parse(validInput);
    expect(result.userType).toBe("employee");
  });

  it("rejects password shorter than 8 characters", () => {
    const result = registerSchema.safeParse({
      ...validInput,
      password: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const pwError = result.error.issues.find((i) =>
        i.path.includes("password")
      );
      expect(pwError).toBeDefined();
      expect(pwError!.message).toContain("8");
    }
  });

  it("rejects password of exactly 7 characters", () => {
    const result = registerSchema.safeParse({
      ...validInput,
      password: "1234567",
    });
    expect(result.success).toBe(false);
  });

  it("accepts password of exactly 8 characters", () => {
    const result = registerSchema.safeParse({
      ...validInput,
      password: "12345678",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email format", () => {
    const result = registerSchema.safeParse({
      ...validInput,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("email");
    }
  });

  it("rejects missing @ in email", () => {
    const result = registerSchema.safeParse({
      ...validInput,
      email: "testexample.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = registerSchema.safeParse({
      ...validInput,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid userType values", () => {
    for (const userType of [
      "b2b_partner",
      "general_user",
      "company_staff",
      "client_admin",
      "employee",
    ]) {
      const result = registerSchema.safeParse({ ...validInput, userType });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid userType", () => {
    const result = registerSchema.safeParse({
      ...validInput,
      userType: "superadmin",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional fields", () => {
    const result = registerSchema.safeParse({
      ...validInput,
      companyName: "테스트회사",
      businessNumber: "123-45-67890",
      userMemo: "테스트 메모",
      tenantId: 1,
    });
    expect(result.success).toBe(true);
  });
});

describe("Login schema validation", () => {
  it("accepts valid login input", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "mypassword",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({
      email: "invalid",
      password: "mypassword",
    });
    expect(result.success).toBe(false);
  });

  it("login schema does not enforce password length (only register does)", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "x",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing password", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing email", () => {
    const result = loginSchema.safeParse({
      password: "mypassword",
    });
    expect(result.success).toBe(false);
  });
});

describe("Password reset schema validation", () => {
  it("accepts valid email", () => {
    const result = requestPasswordResetSchema.safeParse({
      email: "user@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = requestPasswordResetSchema.safeParse({
      email: "not-email",
    });
    expect(result.success).toBe(false);
  });
});
