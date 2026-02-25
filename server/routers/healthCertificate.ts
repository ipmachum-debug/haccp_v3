import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { healthCertificates, employees } from "../../drizzle/schema";
import { eq, desc, asc, and, lte, gte, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { storagePut } from "../storage";
import * as XLSX from "xlsx";

export const healthCertificateRouter = router({
  /**
   * 건강진단서 목록 조회
   */
  list: protectedProcedure
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

      // ✅ P0 FIX: 테넌트 격리 - 내 테넌트 소속 직원의 보건증만 조회
      const tenantId = ctx.tenantId ?? ctx.user?.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "테넌트 정보가 필요합니다." });
      }

      // 내 테넌트 소속 직원 ID 목록
      const myEmployees = await db
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.tenantId, tenantId));
      const myEmployeeIds = myEmployees.map((e: any) => e.id);

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
   */
  getUpcoming: protectedProcedure
    .input(z.object({ limit: z.number().default(5) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

      // 만료일이 현재 날짜 이후이면서 가장 가까운 순서로 정렬
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 형식
      // ✅ P0 FIX: 테넌트 격리
      const tenantId = ctx.tenantId ?? ctx.user?.tenantId;
      const myEmployees = tenantId ? await db.select({ id: employees.id }).from(employees).where(eq(employees.tenantId, tenantId)) : [];
      const myEmployeeIds = myEmployees.map((e: any) => e.id);
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
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

      const [certificate] = await db
        .select()
        .from(healthCertificates)
        .where(eq(healthCertificates.id, input.id));
      
      if (!certificate) {
        throw new Error("건강진단서를 찾을 수 없습니다.");
      }

      return certificate;
    }),

  /**
   * 신규 건강진단서 등록
   */
  create: protectedProcedure
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
   */
  update: protectedProcedure
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
    .mutation(async ({ input }) => {
      const { id, ...data } = input;

      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

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
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

      await db.delete(healthCertificates).where(eq(healthCertificates.id, input.id));
      return { success: true };
    }),

  /**
   * 건강진단서 통계
   */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

    // ✅ P0 FIX: 테넌트 격리
    const tenantId = ctx.tenantId ?? ctx.user?.tenantId;
    const myEmployees = tenantId ? await db.select({ id: employees.id }).from(employees).where(eq(employees.tenantId, tenantId)) : [];
    const myEmployeeIds = myEmployees.map((e: any) => e.id);
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
   */
  getExpiringForReminder: protectedProcedure
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
            eq(reminderField, 0) // 아직 알림 미발송
          )
        );

      return result;
    }),

  /**
   * 알림 발송 기록 업데이트
   */
  markReminderSent: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        days: z.number(), // 30, 7, 0
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

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
   */
  uploadFile: protectedProcedure
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

      // S3에 업로드 (랜덤 suffix로 열거 방지)
      const randomSuffix = Math.random().toString(36).substring(2, 15);
      const tenantId = ctx.tenantId ?? ctx.user?.tenantId;
      const fileKey = `tenant-${tenantId}/health-certificates/${ctx.user.id}/${Date.now()}-${randomSuffix}-${fileName}`;

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
   */
  bulkUploadFromExcel: protectedProcedure
    .input(
      z.object({
        fileData: z.string(), // base64 encoded Excel file
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

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

      // 각 행을 처리
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        try {
          // 필수 필드 검증
          if (!row["직원명"] || !row["부서"] || !row["발급일"] || !row["만료일"]) {
            results.errors.push(`${i + 2}행: 필수 필드 누락 (직원명, 부서, 발급일, 만료일)`);
            results.failed++;
            continue;
          }

          // 날짜 파싱 (Excel 일련번호 또는 문자열)
          const parseExcelDate = (value: any): Date => {
            if (typeof value === "number") {
              // Excel 일련번호를 Date로 변환
              const date = XLSX.SSF.parse_date_code(value);
              return new Date(date.y, date.m - 1, date.d);
            } else if (typeof value === "string") {
              // 문자열 날짜 파싱
              const parsed = new Date(value);
              if (isNaN(parsed.getTime())) {
                throw new Error("잘못된 날짜 형식");
              }
              return parsed;
            }
            throw new Error("잘못된 날짜 형식");
          };

          const issueDate = parseExcelDate(row["발급일"]);
          const expiryDate = parseExcelDate(row["만료일"]);

          // 직원 찾기 또는 생성
          let employee = await db
            .select()
            .from(employees)
            .where(
              and(
                eq(employees.name, row["직원명"]),
                eq(employees.department, row["부서"])
              )
            )
            .limit(1)
            .then((rows) => rows[0]);

          if (!employee) {
            // 직원이 없으면 생성
            const [result] = await db.insert(employees).values({
              name: row["직원명"],
              department: row["부서"],
              position: row["직책"] || null,
              phone: row["연락처"] || null,
              email: row["이메일"] || null,
              hireDate: issueDate, // 입사일을 발급일로 대체
              status: "active",
              createdBy: ctx.user.id,
            });
            employee = { id: result.insertId } as any;
          }

          // 만료일 기준으로 상태 자동 계산
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

          // 건강진단서 등록
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
