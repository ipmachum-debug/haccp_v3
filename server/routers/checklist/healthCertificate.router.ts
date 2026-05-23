import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { healthCertificates, hEmployees } from "../../../drizzle/schema";
import { eq, desc, asc, and, lte, gte, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { storagePut, storageGet, StorageNotConfiguredError } from "../../storage";
import * as XLSX from "xlsx";

import { todayKST } from "../../utils/timezone";

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
    .select({ id: hEmployees.id })
    .from(hEmployees)
    .where(eq(hEmployees.tenantId, tenantId));
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
    .select({ id: hEmployees.id, tenantId: hEmployees.tenantId })
    .from(hEmployees)
    .where(and(eq(hEmployees.id, cert.employeeId), eq(hEmployees.tenantId, tenantId)));

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
      const tenantId = ctx.tenantId;

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

      const tenantId = ctx.tenantId;
      const today = todayKST();

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

      const tenantId = ctx.tenantId;

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

      const tenantId = ctx.tenantId;

      // ✅ employeeId가 내 테넌트 소속인지 확인
      console.log(`[HealthCert] create: employeeId=${input.employeeId}, tenantId=${tenantId}, userId=${ctx.user?.id}`);
      const [emp] = await db
        .select({ id: hEmployees.id })
        .from(hEmployees)
        .where(and(eq(hEmployees.id, input.employeeId), eq(hEmployees.tenantId, tenantId)));

      if (!emp) {
        console.error(`[HealthCert] FORBIDDEN: employeeId=${input.employeeId} not found in h_employees for tenantId=${tenantId}`);
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
        // ★ 2026-05-22 hotfix: presigned URL (~700자) 이 varchar(500) 초과 →
        //   "Data too long for column 'file_url'" 사고. 또 X-Amz-Expires=3600 라
        //   1시간 후 죽은 링크가 되어 DB 저장 의미 없음.
        //   해결: query string 제거하고 canonical URL 만 저장. 다운로드 시
        //   fileKey 로 새 presigned URL 발급.
        fileUrl: input.fileUrl ? input.fileUrl.split("?")[0] : input.fileUrl,
        tenantId,                  // ← 2026-04-29 hotfix: NOT NULL 누락 사고
        status,
        createdBy: ctx.user.id,
      } as any);

      return { success: true, id: result.insertId };
    }),

  /**
   * 건강진단서 파일 다운로드 URL 발급 (PR-AA2, 2026-05-22)
   *
   * 배경:
   *   PR-AA (#334) 가 INSERT 사고 해결을 위해 stored file_url 에서 query string
   *   (X-Amz-Signature 등) 을 제거. 결과로 stored url 은 unsigned →
   *   브라우저가 직접 GET 하면 R2/S3 가 "InvalidArgument: Authorization" 거부.
   *
   * 해결:
   *   화면에서 "자세히 보기" 클릭 → 본 endpoint 호출 → storageGet 으로 fresh
   *   presigned URL (1h) 발급 → 클라가 새 창으로 열어 다운로드/뷰.
   *   file_url 은 더 이상 직접 사용 X (호환을 위해 컬럼은 유지).
   *
   * 권한: tenantRequiredProcedure + assertCertificateOwnership — 내 tenant
   *   소속 직원의 인증서만 조회 가능.
   */
  getDownloadUrl: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

      const tenantId = ctx.tenantId;
      await assertCertificateOwnership(db, input.id, tenantId);

      // ★ PR-AB (2026-05-23) — fileUrl 도 같이 조회 (legacy row 대응)
      //   PR-AA2 이전에 등록된 row 는 fileKey 가 NULL 이고 fileUrl 만 있음.
      //   이 경우 unsigned canonical URL 이라 직접 GET 시 S3 AccessDenied 발생.
      //   해결: 가능한 경우 fileUrl 에서 S3 key 를 역추출해 presigned 재발급.
      const [cert] = await db
        .select({
          fileKey: healthCertificates.fileKey,
          fileUrl: healthCertificates.fileUrl,
          fileName: healthCertificates.fileName,
        })
        .from(healthCertificates)
        .where(eq(healthCertificates.id, input.id));

      if (!cert) {
        throw new TRPCError({ code: "NOT_FOUND", message: "건강진단서를 찾을 수 없습니다." });
      }

      // ── Step 1. fileKey 확보 (3단 fallback)
      //   1) cert.fileKey 가 있으면 그대로 사용 (PR-AA2 이후 등록 row)
      //   2) 없으면 fileUrl 에서 S3 key 패턴 역추출 (legacy row)
      //   3) 둘 다 실패하면 명확한 사용자 친화 에러
      let fileKey: string | null = cert.fileKey ?? null;
      let keySource: "stored" | "legacy_extract" | "missing" = "missing";

      if (fileKey) {
        keySource = "stored";
      } else if (cert.fileUrl) {
        // legacy: fileUrl 에서 S3 key 추출 시도
        // 예: https://bucket.s3.amazonaws.com/tenant-2/health-certificates/123/abc.pdf
        //  → tenant-2/health-certificates/123/abc.pdf
        // 예: https://<account>.r2.cloudflarestorage.com/bucket/tenant-2/...
        //  → tenant-2/...
        try {
          const url = new URL(cert.fileUrl.split("?")[0]);
          const path = url.pathname.replace(/^\/+/, "");
          // path 가 "tenant-N/..." 패턴이면 즉시 사용
          // R2 path-style 처럼 "bucket-name/tenant-N/..." 인 경우 첫 segment 제거
          const tenantMatch = path.match(/(tenant-\d+\/.*)/);
          if (tenantMatch) {
            fileKey = tenantMatch[1];
            keySource = "legacy_extract";
          }
        } catch {
          /* URL 파싱 실패 → fileKey 없음 처리 */
        }
      }

      if (!fileKey) {
        // ★ 진단 정보 server-side 로그 (운영 디버깅용)
        console.warn(`[healthCert.getDownloadUrl] fileKey 없음`, {
          certId: input.id,
          tenantId,
          hasFileUrl: !!cert.fileUrl,
          fileUrlSample: cert.fileUrl?.slice(0, 100),
        });
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "첨부 파일을 찾을 수 없습니다. 다시 업로드 후 시도하세요.",
        });
      }

      // ── Step 2. presigned URL 발급
      try {
        const { url } = await storageGet(fileKey);

        // ★ PR-AB: 발급된 URL 의 형태 진단 로그 (1회당 cert id 별)
        console.log(`[healthCert.getDownloadUrl] presigned OK`, {
          certId: input.id,
          tenantId,
          keySource,
          fileKey: fileKey.slice(0, 80),
          urlScheme: url.startsWith("https://") ? "https" : url.slice(0, 8),
          urlHost: (() => { try { return new URL(url).host; } catch { return "invalid"; } })(),
          urlIsSigned: url.includes("X-Amz-Signature") || url.includes("Signature="),
        });

        // ★ PR-AC (2026-05-23) — 서버 사이드 URL 검증
        //   PR-AB Layer 3 (클라이언트 fetch probe) 는 CORS 미설정 환경에서
        //   브라우저가 차단 → catch 블럭 발동 → 그래도 새 창 열기 → XML 페이지
        //   사고 재발. 사장님 2번째 보고:
        //   > "This XML file does not appear to have any style information..."
        //
        //   해결: 서버에서 HEAD 요청으로 직접 검증 (CORS 무관, 같은 서버끼리).
        //   - 200 OK  → url 그대로 반환 (정상)
        //   - 403     → 가설 B (IAM s3:GetObject 누락) 확정
        //   - 404     → 가설 D (fileKey 잘못됨, 객체 없음)
        //   - timeout → 가설 C (CDN/엔드포인트 mismatch)
        //
        //   2-3초 타임아웃으로 정상 케이스 latency 영향 최소화.
        //   실패해도 URL 은 반환하되 verified 플래그를 false 로 표시.
        let urlVerified: boolean | null = null;
        let urlVerifyError: string | undefined;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          const probe = await fetch(url, {
            method: "HEAD",
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (probe.ok) {
            urlVerified = true;
            console.log(`[healthCert.getDownloadUrl] HEAD verify OK`, {
              certId: input.id,
              status: probe.status,
            });
          } else {
            urlVerified = false;
            urlVerifyError = `S3 ${probe.status} ${probe.statusText}`;
            console.error(`[healthCert.getDownloadUrl] HEAD verify FAILED`, {
              certId: input.id,
              tenantId,
              keySource,
              fileKey: fileKey.slice(0, 80),
              status: probe.status,
              statusText: probe.statusText,
              hint:
                probe.status === 403
                  ? "IAM 권한 누락 의심 (s3:GetObject 없음)"
                  : probe.status === 404
                  ? "객체 없음 (fileKey 잘못됨 또는 hard-delete)"
                  : "기타 storage 거부",
            });
          }
        } catch (probeErr: any) {
          urlVerified = false;
          urlVerifyError = `network: ${probeErr?.name ?? "Error"}: ${probeErr?.message?.slice(0, 100) ?? "unknown"}`;
          console.error(`[healthCert.getDownloadUrl] HEAD verify network error`, {
            certId: input.id,
            tenantId,
            keySource,
            errorName: probeErr?.name,
            errorMessage: probeErr?.message?.slice(0, 200),
            hint: "CDN/엔드포인트 mismatch 또는 timeout 의심",
          });
        }

        // ★ PR-AC: 검증 실패 시 throw — 클라이언트가 새 창 절대 안 열도록 차단
        if (urlVerified === false) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `다운로드 실패 (${urlVerifyError}). 운영자에게 문의하세요. (cert id: ${input.id}, key source: ${keySource})`,
          });
        }

        return { url, fileName: cert.fileName ?? "", keySource, urlVerified };
      } catch (err: any) {
        // ★ PR-AC: TRPCError 는 그대로 re-throw (메시지 보존)
        if (err instanceof TRPCError) {
          throw err;
        }
        if (err instanceof StorageNotConfiguredError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "스토리지가 설정되지 않았습니다. 운영자에게 문의하세요.",
          });
        }
        console.error(`[healthCert.getDownloadUrl] storageGet 실패`, {
          certId: input.id,
          tenantId,
          fileKey: fileKey.slice(0, 80),
          keySource,
          errorName: err?.name,
          errorMessage: err?.message?.slice(0, 200),
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `다운로드 URL 발급 실패: ${err?.message?.slice(0, 100) ?? "unknown"}`,
        });
      }
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

      const tenantId = ctx.tenantId;

      // ✅ 소유권 검증 (내 테넌트 소속 직원의 건강진단서인지 확인)
      await assertCertificateOwnership(db, id, tenantId);

      // 만료일이 변경된 경우 상태 재계산
      let updateData: any = { ...data };

      // ★ 2026-05-22 hotfix: presigned URL query string 제거 (create 와 동일)
      if (typeof updateData.fileUrl === "string") {
        updateData.fileUrl = updateData.fileUrl.split("?")[0];
      }

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

      const tenantId = ctx.tenantId;

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

    const tenantId = ctx.tenantId;

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
   * ✅ tenant 격리 적용 - 내 테넌트 소속 직원의 건강진단서만 조회
   */
  getExpiringForReminder: tenantRequiredProcedure
    .input(z.object({ days: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

      const tenantId = ctx.tenantId;

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

      // ✅ 내 테넌트 소속 직원의 건강진단서만 조회
      const myEmployeeIds = await getTenantEmployeeIds(db, tenantId);
      if (myEmployeeIds.length === 0) return [];

      const result = await db
        .select()
        .from(healthCertificates)
        .where(
          and(
            gte(healthCertificates.expiryDate, startOfDay),
            lte(healthCertificates.expiryDate, endOfDay),
            eq(reminderField, 0),
            inArray(healthCertificates.employeeId, myEmployeeIds)
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
      const tenantId = ctx.tenantId;
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
      const tenantId = ctx.tenantId;
      const fileKey = `tenant-${tenantId}/health-certificates/${ctx.user.id}/${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${fileName}`;

      try {
        const { url } = await storagePut(fileKey, buffer, mimeType);

        return {
          success: true,
          fileUrl: url,
          fileKey,
          fileName,
        };
      } catch (err) {
        if (err instanceof StorageNotConfiguredError) {
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message: err.userMessage,
            cause: err,
          });
        }
        throw err;
      }
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

      const tenantId = ctx.tenantId;

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
            .from(hEmployees)
            .where(
              and(
                eq(hEmployees.name, row["직원명"]),
                eq(hEmployees.tenantId, tenantId)
              )
            )
            .limit(1)
            .then((rows: any[]) => rows[0]);

          if (!employee) {
            // ✅ 직원 생성 시 tenantId 저장
            const empCode = `EMP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const [result] = await db.insert(hEmployees).values({
              name: row["직원명"],
              employeeCode: empCode,
              tenantId,            // ✅ 테넌트 격리
            } as any);
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
            tenantId,                // ← 2026-04-29 hotfix: NOT NULL 누락 사고 (bulkUploadFromExcel)
            employeeId: employee.id,
            employeeName: row["직원명"],
            issueDate,
            expiryDate,
            status,
            notes: row["비고"] || null,
            createdBy: ctx.user.id,
          } as any);

          results.success++;
        } catch (error: any) {
          results.errors.push(`${i + 2}행: ${error.message}`);
          results.failed++;
        }
      }

      return results;
    }),
});
