import { z } from "zod";
import { router, tenantRequiredProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { healthCertificates, employees } from "../../drizzle/schema";
import { eq, desc, asc, and, lte, gte, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { storagePut } from "../storage";
import * as XLSX from "xlsx";

/**
 * ✅ P0 SECURITY FIX: healthCertificate 라우터
 *
 * 변경 사항:
 * 1. tenantRequiredProcedure → tenantRequiredProcedure 전환
 *    - super_admin도 actingTenantId 없으면 403
 *    - fallback (ctx.tenantId ?? ctx.user?.tenantId) 패턴 완전 제거
 * 2. getById: 내 테넌트 소속 직원 소유권 검증 추가
 * 3. update/delete: ctx 없이 id만 받던 패턴 → 소유권 검증 후 실행
 * 4. getExpiringForReminder/markReminderSent: 스케줄러 전용 → 별도 주의 필요
 */

// ─────────────────────────────────────────────
// 내부 헬퍼: 테넌트 소속 직원 목록 조회
// ─────────────────────────────────────────────
async function getTenantEmployeeIds(db: any, tenantId: number): Promise<number[]> {
  const myEmployees = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.tenantId, tenantId));
  return myEmployees.map((e: any) => e.id);
}

// ─────────────────────────────────────────────
// 내부 헬퍼: 건강진단서가 내 테넌트 소속인지 검증
// ─────────────────────────────────────────────
async function assertCertificateOwnership(
  db: any,
  certificateId: number,
  tenantId: number
): Promise<any> {
  // 건강진단서 조회
  const [cert] = await db
    .select()
    .from(healthCertificates)
    .where(eq(healthCertificates.id, certificateId));

  if (!cert) {
    throw new TRPCError({ code: "NOT_FOUND", message: "건강진단서를 찾을 수 없습니다." });
  }

  // 직원이 내 테넌트 소속인지 확인
  const [emp] = await db
    .select({ id: employees.id, tenantId: employees.tenantId })
    .from(employees)
    .where(and(eq(employees.id, cert.employeeId), eq(employees.tenantId, tenantId)));

  if (!emp) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "해당 건강진단서에 접근 권한이 없습니다.",
    });
  }

  return cert;
}

export const healthCertificateRouter = router({
  /**
   * 건강진단서 목록 조회
   * ✅ fallback 패턴 제거 - tenantRequiredProcedure에서 tenantId 보장
   */
  list: tenantRequiredProcedure
    .input(
      z.object({
        status: z.enum(["valid", "expiring_soon", "expired", "all"]).optional().default("all"),
        employeeId: z.number().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { status, employeeId } = input;

      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

      // ✅ tenantId는 tenantRequiredProcedure가 보장 (null 불가)
      const tenantId = ctx.tenantId!;

      const myEmployeeIds = await getTenantEmployeeIds(db, tenantId);
      if (myEmployeeIds.length === 0) return [];

      let conditions: any[] = [inArray(healthCertificates.employeeId, myEmployeeIds)];

      if (status !== "all") {
        conditions.push(eq(healthCertificates.status, status));
      }

      if (employeeId) {
        // ✅ 요청된 employeeId가 내 테넌트 소속인지 확인
        if (!myEmployeeIds.includes(employeeId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "해당 직원에 접근 권한이 없습니다." });
        }
        conditions.push(eq(healthCertificates.employeeId, employeeId));
      }

      const result = await db
        .select()
        .from(healthCertificates)
        .where(and(...conditions))
        .orderBy(desc(healthCertificates.expiryDate));

      return result;
    }),

  /**
   * 갱신 임박 순 최근 N명 조회
   * ✅ fallback 패턴 제거
   */
  getUpcoming: tenantRequiredProcedure
    .input(z.object({ limit: z.number().default(5) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

      const tenantId = ctx.tenantId!;
      const today = new Date().toISOString().split('T')[0];

      const myEmployeeIds = await getTenantEmployeeIds(db, tenantId);
      if (myEmployeeIds.length === 0) return [];

      const result = await db
        .select()
        .from(healthCertificates)
        .where(and(
          sql`${healthCertificates.expiryDate} >= ${today}`,
          inArray(healthCertificates.employeeId, myEmployeeIds)
        ))
        .orderBy(asc(healthCertificates.expiryDate))
        .limit(input.limit);

      return result;
    }),

  /**
   * 건강진단서 상세 조회
   * ✅ P0 FIX: 단순 id 조회 → 테넌트 소유권 검증 추가
   */
  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

      const tenantId = ctx.tenantId!;

      // ✅ 소유권 검증 (내 테넌트 소속 직원의 건강진단서인지 확인)
      const certificate = await assertCertificateOwnership(db, input.id, tenantId);

      return certificate;
    }),

  /**
   * 신규 건강진단서 등록
   * ✅ 등록 시 employeeId가 내 테넌트 소속인지 검증
   */
  create: tenantRequiredProcedure
    .input(
      z.object({
        employeeId: z.number(),
        employeeName: z.string(),
        issueDate: z.date(),
        expiryDate: z.date(),
        fileUrl: z.string().optional(),
        fileKey: z.string().optional(),
        fileName: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

      const tenantId = ctx.tenantId!;

      // ✅ employeeId가 내 테넌트 소속인지 확인
      const [emp] = await db
        .select({ id: employees.id })
        .from(employees)
        .where(and(eq(employees.id, input.employeeId), eq(employees.tenantId, tenantId)));

      if (!emp) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "해당 직원에 접근 권한이 없습니다.",
        });
      }

      // 만료일 기준으로 상태 자동 계산
      const now = new Date();
      const expiryDate = new Date(input.expiryDate);
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      let status: "valid" | "expiring_soon" | "expired" = "valid";
      if (daysUntilExpiry < 0) {
        status = "expired";
      } else if (daysUntilExpiry <= 30) {
        status = "expiring_soon";
      }

      const [result] = await db.insert(healthCertificates).values({
        ...input,
        status,
        createdBy: ctx.user.id,
      });

      return { success: true, id: result.insertId };
    }),

  /**
   * 건강진단서 갱신 (수정)
   * ✅ P0 FIX: ctx 없이 id만 받던 패턴 → tenantRequiredProcedure + 소유권 검증
   */
  update: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        issueDate: z.date().optional(),
        expiryDate: z.date().optional(),
        fileUrl: z.string().optional(),
        fileKey: z.string().optional(),
        fileName: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;

      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

      const tenantId = ctx.tenantId!;

      // ✅ 소유권 검증 (내 테넌트 소속 직원의 건강진단서인지 확인)
      await assertCertificateOwnership(db, id, tenantId);

      // 만료일이 변경된 경우 상태 재계산
      let updateData: any = { ...data };

      if (data.expiryDate) {
        const now = new Date();
        const expiryDate = new Date(data.expiryDate);
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilExpiry < 0) {
          updateData.status = "expired";
        } else if (daysUntilExpiry <= 30) {
          updateData.status = "expiring_soon";
        } else {
          updateData.status = "valid";
        }

        // 알림 발송 기록 초기화 (갱신 시)
        updateData.reminderSent30Days = 0;
        updateData.reminderSent7Days = 0;
        updateData.reminderSentExpiry = 0;
      }

      await db
        .update(healthCertificates)
        .set(updateData)
        .where(eq(healthCertificates.id, id));

      return { success: true };
    }),

  /**
   * 건강진단서 삭제
   * ✅ P0 FIX: ctx 없이 id만 받던 패턴 → tenantRequiredProcedure + 소유권 검증
   */
  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

      const tenantId = ctx.tenantId!;

      // ✅ 소유권 검증
      await assertCertificateOwnership(db, input.id, tenantId);

      await db.delete(healthCertificates).where(eq(healthCertificates.id, input.id));
      return { success: true };
    }),

  /**
   * 건강진단서 통계
   * ✅ fallback 패턴 제거
   */
  getStats: tenantRequiredProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

    const tenantId = ctx.tenantId!;

    const myEmployeeIds = await getTenantEmployeeIds(db, tenantId);
    if (myEmployeeIds.length === 0) return { total: 0, valid: 0, expiringSoon: 0, expired: 0 };

    const [stats] = await db
      .select({
        total: sql<number>`COUNT(*)`,
        valid: sql<number>`SUM(CASE WHEN status = 'valid' THEN 1 ELSE 0 END)`,
        expiringSoon: sql<number>`SUM(CASE WHEN status = 'expiring_soon' THEN 1 ELSE 0 END)`,
        expired: sql<number>`SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END)`,
      })
      .from(healthCertificates)
      .where(inArray(healthCertificates.employeeId, myEmployeeIds));

    return stats;
  }),

  /**
   * 만료 알림 대상 조회 (스케줄러용)
   * ⚠️ 스케줄러에서 호출 - tenantId 미적용 (전체 조회 의도)
   * TODO: 스케줄러에도 테넌트별 처리 도입 필요
   */
  getExpiringForReminder: tenantRequiredProcedure
    .input(z.object({ days: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + input.days);

      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      let reminderField;
      if (input.days === 30) {
        reminderField = healthCertificates.reminderSent30Days;
      } else if (input.days === 7) {
        reminderField = healthCertificates.reminderSent7Days;
      } else if (input.days === 0) {
        reminderField = healthCertificates.reminderSentExpiry;
      } else {
        throw new Error("Invalid days parameter");
      }

      const result = await db
        .select()
        .from(healthCertificates)
        .where(
          and(
            gte(healthCertificates.expiryDate, startOfDay),
            lte(healthCertificates.expiryDate, endOfDay),
            eq(reminderField, 0)
          )
        );

      return result;
    }),

  /**
   * 알림 발송 기록 업데이트
   * ✅ tenantRequiredProcedure 전환
   */
  markReminderSent: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        days: z.number(), // 30, 7, 0
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

      // ✅ 소유권 검증
      const tenantId = ctx.tenantId!;
      await assertCertificateOwnership(db, input.id, tenantId);

      let updateData: any = {};
      if (input.days === 30) {
        updateData.reminderSent30Days = 1;
      } else if (input.days === 7) {
        updateData.reminderSent7Days = 1;
      } else if (input.days === 0) {
        updateData.reminderSentExpiry = 1;
      }

      await db
        .update(healthCertificates)
        .set(updateData)
        .where(eq(healthCertificates.id, input.id));

      return { success: true };
    }),

  /**
   * 파일 업로드 (S3)
   * ✅ fallback tenantId 패턴 제거
   */
  uploadFile: tenantRequiredProcedure
    .input(
      z.object({
        fileName: z.string(),
        fileData: z.string(), // base64 encoded
        mimeType: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { fileName, fileData, mimeType } = input;

      // base64 디코딩
      const buffer = Buffer.from(fileData, "base64");

      // 파일 크기 제한 (16MB)
      if (buffer.length > 16 * 1024 * 1024) {
        throw new Error("파일 크기는 16MB를 초과할 수 없습니다.");
      }

      // ✅ tenantId는 tenantRequiredProcedure가 보장
      const tenantId = ctx.tenantId!;
      const fileKey = `tenant-${tenantId}/health-certificates/${ctx.user.id}/${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${fileName}`;

      const { url } = await storagePut(fileKey, buffer, mimeType);

      return {
        success: true,
        fileUrl: url,
        fileKey,
        fileName,
      };
    }),

  /**
   * Excel 일괄 업로드
   * ✅ 직원 생성 시 tenantId 강제 저장
   */
  bulkUploadFromExcel: tenantRequiredProcedure
    .input(
      z.object({
        fileData: z.string(), // base64 encoded Excel file
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

      const tenantId = ctx.tenantId!;

      // base64 디코딩
      const buffer = Buffer.from(input.fileData, "base64");

      // Excel 파일 파싱
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json<any>(worksheet);

      const results = {
        success: 0,
        failed: 0,
        errors: [] as string[],
      };

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        try {
          if (!row["직원명"] || !row["부서"] || !row["발급일"] || !row["만료일"]) {
            results.errors.push(`${i + 2}행: 필수 필드 누락 (직원명, 부서, 발급일, 만료일)`);
            results.failed++;
            continue;
          }

          const parseExcelDate = (value: any): Date => {
            if (typeof value === "number") {
              const date = XLSX.SSF.parse_date_code(value);
              return new Date(date.y, date.m - 1, date.d);
            } else if (typeof value === "string") {
              const parsed = new Date(value);
              if (isNaN(parsed.getTime())) throw new Error("잘못된 날짜 형식");
              return parsed;
            }
            throw new Error("잘못된 날짜 형식");
          };

          const issueDate = parseExcelDate(row["발급일"]);
          const expiryDate = parseExcelDate(row["만료일"]);

          // ✅ 직원 조회 시 tenantId 필터 추가 (타 테넌트 직원 오염 방지)
          let employee = await db
            .select()
            .from(employees)
            .where(
              and(
                eq(employees.name, row["직원명"]),
                eq(employees.department, row["부서"]),
                eq(employees.tenantId, tenantId)
              )
            )
            .limit(1)
            .then((rows: any[]) => rows[0]);

          if (!employee) {
            // ✅ 직원 생성 시 tenantId 저장
            const [result] = await db.insert(employees).values({
              name: row["직원명"],
              department: row["부서"],
              position: row["직책"] || null,
              phone: row["연락처"] || null,
              email: row["이메일"] || null,
              hireDate: issueDate,
              status: "active",
              tenantId,            // ✅ 테넌트 격리
              createdBy: ctx.user.id,
            });
            employee = { id: result.insertId } as any;
          }

          const now = new Date();
          const daysUntilExpiry = Math.ceil(
            (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );

          let status: "valid" | "expiring_soon" | "expired" = "valid";
          if (daysUntilExpiry < 0) {
            status = "expired";
          } else if (daysUntilExpiry <= 30) {
            status = "expiring_soon";
          }

          await db.insert(healthCertificates).values({
            employeeId: employee.id,
            employeeName: row["직원명"],
            issueDate,
            expiryDate,
            status,
            notes: row["비고"] || null,
            createdBy: ctx.user.id,
          });

          results.success++;
        } catch (error: any) {
          results.errors.push(`${i + 2}행: ${error.message}`);
          results.failed++;
        }
      }

      return results;
    }),
});
