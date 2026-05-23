/**
 * 테넌트 격리 감사 라우터 — PR-W (2026-05-21)
 *
 * PR-V (#330) / PR-X (#331) 의 패턴을 11개 추가 라우터로 확장한 후,
 * 실제 운영 데이터에서 cross-tenant user 매칭 사고가 있었는지를
 * 사후 검증하기 위한 read-only 감사 endpoint.
 *
 * 동작:
 *   각 (테이블, user_fk 컬럼) 쌍에 대해 SQL 한 번 실행:
 *     - candidates : tenant_id 가 같은 user 와 매칭 가능한 행 수
 *     - leaked     : tenant_id 가 다른 user 와 매칭되었을 행 수 (이번 PR 패치 전 누출 후보)
 *     - orphan     : 어떤 user 와도 매칭 안 되는 행 수
 *
 * 결과 해석:
 *   - leaked > 0 → 운영 데이터에 cross-tenant 매칭 이력 존재.
 *                  화면에 다른 회사 사용자 이름이 보였을 수 있음.
 *                  PR-W 패치 후 자동 차단되지만, 과거 데이터 점검 권장.
 *   - leaked = 0 → 누출 없었음 (예방적 패치로만 의미 있음).
 *
 * 권한: super_admin / admin 만 (다른 테넌트 데이터 SELECT 가능).
 *      adminProcedure 사용 — 자기 tenant 만 점검.
 */
import { z } from "zod";
import { adminProcedure, router } from "../../_core/trpc";
import { getPool } from "../../db/pool";

interface AuditCheck {
  router: string;            // 라우터 이름 (예: "accounting.expense")
  table: string;             // 테이블 이름
  userIdColumn: string;      // user.id 와 매칭되는 컬럼
  description: string;       // 사람이 읽을 수 있는 컨텍스트
}

const CHECKS: AuditCheck[] = [
  // ─── users 매칭 (PR-W #332) ───────────────────────────
  { router: "accounting.changeLog", table: "change_logs", userIdColumn: "user_id", description: "변경 이력 작성자" },
  { router: "accounting.communicationLog (logs)", table: "communication_logs", userIdColumn: "author_id", description: "커뮤니케이션 로그 작성자" },
  { router: "accounting.communicationLog (comments)", table: "communication_log_comments", userIdColumn: "author_id", description: "커뮤니케이션 댓글 작성자" },
  { router: "accounting.expense (vouchers created_by)", table: "expense_vouchers", userIdColumn: "created_by", description: "비용 전표 작성자" },
  { router: "accounting.expense (vouchers posted_by)", table: "expense_vouchers", userIdColumn: "posted_by", description: "비용 전표 확정자" },
  { router: "accounting.expense (recurring)", table: "expense_recurring_templates", userIdColumn: "created_by", description: "반복 비용 템플릿 작성자" },
  { router: "accounting.expense (unpaid)", table: "expense_unpaid_payments", userIdColumn: "paid_by", description: "비용 미지급 결제자" },
  { router: "accounting.fixedAsset", table: "fixed_assets", userIdColumn: "registered_by", description: "고정자산 등록자" },
  { router: "accounting.journalEntry", table: "expense_journal_entries", userIdColumn: "posted_by", description: "분개 확정자" },
  { router: "production.monthlyLogs / weeklyLogs", table: "h_generic_checklist_records", userIdColumn: "created_by", description: "월간/주간 보고 작성자" },
  { router: "system.board (notifications via log)", table: "communication_logs", userIdColumn: "author_id", description: "(board 가 동일 테이블 재사용)" },
  { router: "system.dailyTraining (monthly reports)", table: "h_training_monthly_reports", userIdColumn: "created_by", description: "교육 월간 보고 작성자" },
  { router: "system.documentApproval", table: "document_approval_history", userIdColumn: "actor_id", description: "문서 결재 행위자" },
  { router: "system.documentPrint", table: "document_batch_print_groups", userIdColumn: "printed_by", description: "문서 일괄 인쇄자" },
];

/**
 * 마스터 테이블 매칭 감사 — PR-Z (2026-05-22)
 * users 외 partners / h_employees / h_products_v2 / h_batches / item_master 등
 * 마스터 테이블과의 JOIN 에서 cross-tenant 매칭 사고 여부 점검.
 *
 * 동작은 user-match audit 과 동일 — leaked = tenant 불일치 매칭 행 수.
 */
interface MasterAuditCheck {
  router: string;
  table: string;           // 분석할 외부 테이블 (예: communication_logs)
  fkColumn: string;        // 그 테이블의 FK 컬럼 (예: partner_id)
  masterTable: string;     // 참조하는 마스터 (예: partners)
  description: string;
}

const MASTER_CHECKS: MasterAuditCheck[] = [
  // partners
  { router: "accounting.financialReports (AP)", table: "ap_ledger", fkColumn: "partner_id", masterTable: "partners", description: "AP 원장 거래처" },
  { router: "accounting.financialReports (AR)", table: "ar_ledger", fkColumn: "partner_id", masterTable: "partners", description: "AR 원장 거래처" },
  { router: "accounting.quotation", table: "quotations", fkColumn: "partner_id", masterTable: "partners", description: "견적서 거래처" },
  { router: "accounting.communicationLog", table: "communication_logs", fkColumn: "partner_id", masterTable: "partners", description: "커뮤니케이션 거래처" },
  // h_employees
  { router: "accounting.payroll", table: "payroll_records", fkColumn: "employee_id", masterTable: "h_employees", description: "급여 직원" },
  { router: "accounting.hrManagement (attendance)", table: "attendance_records", fkColumn: "employee_id", masterTable: "h_employees", description: "출퇴근 직원" },
  { router: "accounting.hrManagement (leave)", table: "leave_requests", fkColumn: "employee_id", masterTable: "h_employees", description: "연차 직원" },
  // h_products_v2 / batches
  { router: "ccpMonitoring.processGroups", table: "ccp_process_group_products", fkColumn: "product_id", masterTable: "h_products_v2", description: "CCP 공정그룹 제품" },
  { router: "system.documentPrint", table: "document_instances", fkColumn: "product_id", masterTable: "h_products_v2", description: "문서 인쇄 제품" },
  { router: "system.documentPrint", table: "document_instances", fkColumn: "batch_id", masterTable: "h_batches", description: "문서 인쇄 배치" },
];

export const tenantIsolationAuditRouter = router({
  /**
   * 모든 LEFT JOIN users 패턴이 있는 테이블의 cross-tenant 누출 감사
   *
   * 각 체크는 한 번의 빠른 COUNT 쿼리. 14개 체크 = 14 쿼리.
   * 운영 DB 부담 거의 없음.
   */
  auditCrossTenantUserJoins: adminProcedure
    .input(z.object({
      includeOrphan: z.boolean().optional().default(false),
    }).optional())
    .query(async ({ ctx }) => {
      const pool = getPool();
      const tenantId = ctx.tenantId;
      const startedAt = Date.now();

      const results: Array<{
        router: string;
        table: string;
        userIdColumn: string;
        description: string;
        total: number;
        ok: number;        // tenant_id 일치 매칭 (정상)
        leaked: number;    // tenant_id 불일치 매칭 (PR-W 패치 전 누출)
        orphan: number;    // 어떤 user 와도 매칭 안 됨 (FK 무결성 파괴)
        error?: string;
      }> = [];

      let hasAnyLeak = false;

      for (const check of CHECKS) {
        try {
          // 한 쿼리로 4 카테고리 카운트 (table 만 살펴봄)
          const sql = `
            SELECT
              COUNT(*) AS total,
              SUM(CASE WHEN u_match.id IS NOT NULL THEN 1 ELSE 0 END) AS ok,
              SUM(CASE WHEN u_match.id IS NULL AND u_any.id IS NOT NULL THEN 1 ELSE 0 END) AS leaked,
              SUM(CASE WHEN u_any.id IS NULL THEN 1 ELSE 0 END) AS orphan
            FROM \`${check.table}\` t
            LEFT JOIN users u_match
              ON u_match.id = t.\`${check.userIdColumn}\`
             AND u_match.tenant_id = t.tenant_id
            LEFT JOIN users u_any
              ON u_any.id = t.\`${check.userIdColumn}\`
            WHERE t.tenant_id = ?
              AND t.\`${check.userIdColumn}\` IS NOT NULL
          `;
          const [rows]: any = await pool.execute(sql, [tenantId]);
          const r = (rows as any[])[0] || {};
          const total = Number(r.total || 0);
          const ok = Number(r.ok || 0);
          const leaked = Number(r.leaked || 0);
          const orphan = Number(r.orphan || 0);
          if (leaked > 0) hasAnyLeak = true;
          results.push({
            router: check.router,
            table: check.table,
            userIdColumn: check.userIdColumn,
            description: check.description,
            total, ok, leaked, orphan,
          });
        } catch (err: any) {
          results.push({
            router: check.router,
            table: check.table,
            userIdColumn: check.userIdColumn,
            description: check.description,
            total: 0, ok: 0, leaked: 0, orphan: 0,
            error: err?.message || String(err),
          });
        }
      }

      const summary = {
        totalChecks: CHECKS.length,
        ranAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        hasAnyLeak,
        totalLeaked: results.reduce((s, r) => s + r.leaked, 0),
        totalOrphan: results.reduce((s, r) => s + r.orphan, 0),
        totalOk: results.reduce((s, r) => s + r.ok, 0),
      };

      // 누출만 압축 노출 (운영자가 한눈에)
      const leaks = results.filter((r) => r.leaked > 0);

      return {
        summary,
        leaks,        // ★ leaked > 0 인 라우터만 (가장 중요)
        all: results, // 전체 14개 체크 결과
      };
    }),

  /**
   * ★ PR-Z (2026-05-22): 마스터 테이블 JOIN 감사
   *
   * users 외 partners / h_employees / h_products_v2 / h_batches 등
   * 마스터 테이블 JOIN 에서 cross-tenant 매칭 사고 여부 점검.
   * 운영 데이터에 실제 누출 이력이 있었는지 확인용.
   *
   * 사용:
   *   const r = await trpc.system.tenantIsolationAudit
   *     .auditCrossTenantMasterJoins.query();
   *   if (r.summary.hasAnyLeak) { ... }
   */
  auditCrossTenantMasterJoins: adminProcedure
    .query(async ({ ctx }) => {
      const pool = getPool();
      const tenantId = ctx.tenantId;
      const startedAt = Date.now();

      const results: Array<{
        router: string;
        table: string;
        fkColumn: string;
        masterTable: string;
        description: string;
        total: number;
        ok: number;
        leaked: number;
        orphan: number;
        error?: string;
      }> = [];

      let hasAnyLeak = false;

      for (const check of MASTER_CHECKS) {
        try {
          const sql = `
            SELECT
              COUNT(*) AS total,
              SUM(CASE WHEN m_match.id IS NOT NULL THEN 1 ELSE 0 END) AS ok,
              SUM(CASE WHEN m_match.id IS NULL AND m_any.id IS NOT NULL THEN 1 ELSE 0 END) AS leaked,
              SUM(CASE WHEN m_any.id IS NULL THEN 1 ELSE 0 END) AS orphan
            FROM \`${check.table}\` t
            LEFT JOIN \`${check.masterTable}\` m_match
              ON m_match.id = t.\`${check.fkColumn}\`
             AND m_match.tenant_id = t.tenant_id
            LEFT JOIN \`${check.masterTable}\` m_any
              ON m_any.id = t.\`${check.fkColumn}\`
            WHERE t.tenant_id = ?
              AND t.\`${check.fkColumn}\` IS NOT NULL
          `;
          const [rows]: any = await pool.execute(sql, [tenantId]);
          const r = (rows as any[])[0] || {};
          const total = Number(r.total || 0);
          const ok = Number(r.ok || 0);
          const leaked = Number(r.leaked || 0);
          const orphan = Number(r.orphan || 0);
          if (leaked > 0) hasAnyLeak = true;
          results.push({
            router: check.router,
            table: check.table,
            fkColumn: check.fkColumn,
            masterTable: check.masterTable,
            description: check.description,
            total, ok, leaked, orphan,
          });
        } catch (err: any) {
          results.push({
            router: check.router,
            table: check.table,
            fkColumn: check.fkColumn,
            masterTable: check.masterTable,
            description: check.description,
            total: 0, ok: 0, leaked: 0, orphan: 0,
            error: err?.message || String(err),
          });
        }
      }

      const summary = {
        totalChecks: MASTER_CHECKS.length,
        ranAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        hasAnyLeak,
        totalLeaked: results.reduce((s, r) => s + r.leaked, 0),
        totalOrphan: results.reduce((s, r) => s + r.orphan, 0),
        totalOk: results.reduce((s, r) => s + r.ok, 0),
      };
      const leaks = results.filter((r) => r.leaked > 0);

      return { summary, leaks, all: results };
    }),

  /**
   * ★ PR-AB (2026-05-23) — Storage backend 진단 endpoint
   *
   * 배경: 사장님이 건강진단서 다운로드 시 AccessDenied XML 페이지를 받음.
   *       PR-AA2 가 presigned URL 을 새로 발급해 줘도 S3 가 거부.
   *
   * 진단 정보:
   *   - backend: 활성 backend (s3 / forge / none)
   *   - bucket, region: S3 환경변수
   *   - cdnBase: PUBLIC_BASE_URL 설정 여부
   *   - hasCredentials: AWS_ACCESS_KEY_ID 설정 여부 (값은 노출 X)
   *   - putHealthCheck: 작은 test 객체를 PutObject 했다가 즉시 GetObject 시도
   *     → IAM 권한 검증 (s3:PutObject + s3:GetObject 둘 다 있는지)
   *
   * 권한: super_admin 만 (운영 환경 정보 노출 위험)
   */
  storageHealthCheck: adminProcedure
    .query(async ({ ctx }) => {
      // super_admin 만 허용 (운영 진단)
      const isSuperAdmin = ctx.user?.role === "super_admin";

      const envInfo = {
        hasAwsBucket: !!process.env.AWS_S3_BUCKET?.trim(),
        bucketName: isSuperAdmin ? (process.env.AWS_S3_BUCKET?.trim() ?? null) : "[redacted]",
        region: process.env.AWS_S3_REGION?.trim() || "ap-northeast-2",
        hasEndpoint: !!process.env.AWS_S3_ENDPOINT?.trim(),
        endpointHost: process.env.AWS_S3_ENDPOINT?.trim()
          ? (() => { try { return new URL(process.env.AWS_S3_ENDPOINT!.trim()).host; } catch { return "invalid"; } })()
          : null,
        hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID?.trim(),
        hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY?.trim(),
        hasCdnBase: !!process.env.AWS_S3_PUBLIC_BASE_URL?.trim(),
        cdnBase: isSuperAdmin
          ? (process.env.AWS_S3_PUBLIC_BASE_URL?.trim() ?? null)
          : (process.env.AWS_S3_PUBLIC_BASE_URL?.trim() ? "[set]" : "[unset]"),
      };

      // IAM 권한 라이브 체크 (PutObject + GetObject)
      let putGetCheck: {
        ok: boolean;
        putError?: string;
        getError?: string;
        urlSample?: string;
        urlSigned?: boolean;
      } = { ok: false };

      try {
        const { storagePut, storageGet, StorageNotConfiguredError } =
          await import("../../storage");

        const testKey = `_diagnostic/storage-health-${Date.now()}.txt`;
        const testBody = Buffer.from(`storage-health-check ${new Date().toISOString()}`);

        try {
          await storagePut(testKey, testBody, "text/plain");
        } catch (err: any) {
          if (err instanceof StorageNotConfiguredError) {
            putGetCheck = { ok: false, putError: "STORAGE_NOT_CONFIGURED" };
          } else {
            putGetCheck = {
              ok: false,
              putError: `${err?.name ?? "Error"}: ${err?.message?.slice(0, 200) ?? "unknown"}`,
            };
          }
          return { env: envInfo, putGetCheck };
        }

        try {
          const { url } = await storageGet(testKey);
          putGetCheck = {
            ok: true,
            urlSample: url.slice(0, 120),
            urlSigned: url.includes("X-Amz-Signature") || url.includes("Signature="),
          };

          // 실제로 URL 이 작동하는지도 GET 시도 (HEAD 가 더 좋지만 presigned 는 GET 제한)
          try {
            const resp = await fetch(url, { method: "GET" });
            if (!resp.ok) {
              putGetCheck = {
                ...putGetCheck,
                ok: false,
                getError: `URL responded ${resp.status} ${resp.statusText}`,
              };
            }
          } catch (fetchErr: any) {
            putGetCheck = {
              ...putGetCheck,
              ok: false,
              getError: `fetch failed: ${fetchErr?.message?.slice(0, 200)}`,
            };
          }
        } catch (err: any) {
          putGetCheck = {
            ok: false,
            getError: `${err?.name ?? "Error"}: ${err?.message?.slice(0, 200) ?? "unknown"}`,
          };
        }
      } catch (err: any) {
        return {
          env: envInfo,
          putGetCheck: {
            ok: false,
            putError: `module load failed: ${err?.message?.slice(0, 200)}`,
          },
        };
      }

      return { env: envInfo, putGetCheck };
    }),

  /**
   * ★ PR-AD (2026-05-23) — Health Certificate fileKey 진단 endpoint
   *
   * 배경: PR-AC2/AC3 의 storageHealthCheck 가 PUT/GET 양방향 통과했음에도
   *       cert id 15 다운로드는 여전히 S3 403 Forbidden 받음.
   *       진단 fileKey 는 ASCII (`_diagnostic/storage-health-XXX.txt`) 라 통과했는데
   *       실제 cert id 15 의 fileKey 는 다를 가능성:
   *       - 한글/특수문자 포함 → SigV4 인코딩 mismatch
   *       - 잘못된 prefix (절대경로 / bucket prefix 중복)
   *       - 이전 환경(다른 account) 에서 업로드된 잔재
   *
   * 동작:
   *   1) cert.fileKey, fileUrl, fileName 의 raw 형태 + 바이트 길이 + 비ASCII 문자 개수
   *   2) 같은 fileKey 로 presigned URL 재발급 후 pathname 의 인코딩 형태
   *   3) 그 URL 로 직접 HEAD 요청 시도 결과 (status, statusText, body 일부)
   *   4) 위 정보를 super_admin 에게 노출 → 한 눈에 원인 식별
   *
   * 권한: adminProcedure (super_admin / admin) — 운영 진단
   *       cert id 는 query param 으로 받아 자기 tenant 인지 검증
   */
  inspectHealthCertKey: adminProcedure
    .input(z.object({ certId: z.number() }))
    .query(async ({ input, ctx }) => {
      const isSuperAdmin = ctx.user?.role === "super_admin";
      const tenantId = ctx.tenantId;

      // 1) DB 에서 cert row 조회 (raw SQL — drizzle 의존성 회피)
      const pool = getPool();
      if (!pool) {
        throw new Error("DB 연결 실패");
      }

      // super_admin 은 전체, 일반 admin 은 자기 tenant 만
      const [rows] = await pool.query(
        isSuperAdmin
          ? `SELECT id, tenant_id, file_key, file_url, file_name, created_at, updated_at
             FROM health_certificates WHERE id = ?`
          : `SELECT id, tenant_id, file_key, file_url, file_name, created_at, updated_at
             FROM health_certificates WHERE id = ? AND tenant_id = ?`,
        isSuperAdmin ? [input.certId] : [input.certId, tenantId]
      );

      const certRows = rows as Array<{
        id: number;
        tenant_id: number;
        file_key: string | null;
        file_url: string | null;
        file_name: string | null;
        created_at: Date;
        updated_at: Date;
      }>;

      if (certRows.length === 0) {
        return {
          ok: false,
          reason: "NOT_FOUND",
          message: `cert id ${input.certId} 를 찾을 수 없거나 권한이 없습니다.`,
        };
      }

      const cert = certRows[0];

      // 2) fileKey 의 raw 형태 분석
      const fileKey = cert.file_key;
      const fileUrl = cert.file_url;
      const fileName = cert.file_name;

      const keyAnalysis = fileKey
        ? {
            raw: fileKey,
            length: fileKey.length,
            byteLength: Buffer.byteLength(fileKey, "utf8"),
            nonAsciiCount: [...fileKey].filter((c) => c.charCodeAt(0) > 127).length,
            hasSpaces: /\s/.test(fileKey),
            hasLeadingSlash: fileKey.startsWith("/"),
            hasBucketPrefix: /^(millioai|haccp|bucket)/.test(fileKey),
            uriEncoded: encodeURIComponent(fileKey),
            pathEncoded: fileKey
              .split("/")
              .map((seg) => encodeURIComponent(seg))
              .join("/"),
            hexSample: Buffer.from(fileKey.slice(0, 80), "utf8")
              .toString("hex")
              .match(/.{1,2}/g)
              ?.join(" "),
          }
        : null;

      // 3) presigned URL 재발급 시도
      let presignedAttempt: any = { attempted: false };
      if (fileKey) {
        try {
          const { storageGet } = await import("../../storage");
          const { url } = await storageGet(fileKey);
          let pathnameRaw = "";
          let pathnameDecoded = "";
          try {
            const u = new URL(url);
            pathnameRaw = u.pathname;
            pathnameDecoded = decodeURIComponent(u.pathname);
          } catch {
            /* ignore */
          }
          presignedAttempt = {
            attempted: true,
            ok: true,
            urlSample: url.slice(0, 200),
            urlHost: (() => {
              try { return new URL(url).host; } catch { return "invalid"; }
            })(),
            pathnameRaw,
            pathnameDecoded,
            urlIncludesSignature: url.includes("X-Amz-Signature"),
            urlLength: url.length,
          };
        } catch (err: any) {
          presignedAttempt = {
            attempted: true,
            ok: false,
            error: `${err?.name ?? "Error"}: ${err?.message?.slice(0, 200) ?? "unknown"}`,
          };
        }
      }

      // 4) presigned URL 로 HEAD/GET 요청 직접 시도 (raw 응답 캡처)
      // PR-AE 강화: 응답 헤더 전체 dump + body 자동 판별 + GET probe 별도 캡처
      let headProbe: any = { attempted: false };
      if (presignedAttempt.ok && presignedAttempt.urlSample) {
        try {
          const { storageGet } = await import("../../storage");
          const { url: fullUrl } = await storageGet(fileKey!);

          // 헤더 전체를 plain object 로 변환하는 유틸
          const dumpHeaders = (h: Headers): Record<string, string> => {
            const out: Record<string, string> = {};
            h.forEach((value, key) => {
              out[key] = value;
            });
            return out;
          };

          // body 자동 판별 — 첫 8바이트 magic / 인쇄가능 비율 기반
          const classifyBody = (
            buf: Uint8Array
          ): {
            kind: string;
            magicHex: string;
            isPrintable: boolean;
            looksLikeXml: boolean;
            looksLikeHtml: boolean;
            looksLikePdf: boolean;
            looksLikeJpeg: boolean;
            looksLikePng: boolean;
          } => {
            const sample = buf.slice(0, 16);
            const magicHex = Array.from(sample)
              .map((b) => b.toString(16).padStart(2, "0"))
              .join(" ");
            // 인쇄가능 ASCII 비율 (첫 200 바이트)
            const head = buf.slice(0, 200);
            let printable = 0;
            for (const b of head) {
              if ((b >= 0x20 && b <= 0x7e) || b === 0x09 || b === 0x0a || b === 0x0d) {
                printable++;
              }
            }
            const isPrintable = head.length > 0 && printable / head.length > 0.85;
            // 텍스트 헤드 (XML/HTML 판별용)
            const headText = new TextDecoder("utf-8", { fatal: false })
              .decode(head)
              .trim()
              .toLowerCase();
            const looksLikePdf = magicHex.startsWith("25 50 44 46"); // %PDF
            const looksLikeJpeg = magicHex.startsWith("ff d8 ff");
            const looksLikePng = magicHex.startsWith("89 50 4e 47");
            const looksLikeXml =
              headText.startsWith("<?xml") || headText.startsWith("<error");
            const looksLikeHtml =
              headText.startsWith("<!doctype html") || headText.startsWith("<html");
            let kind = "unknown-binary";
            if (looksLikePdf) kind = "pdf";
            else if (looksLikeJpeg) kind = "jpeg";
            else if (looksLikePng) kind = "png";
            else if (looksLikeXml) kind = "xml";
            else if (looksLikeHtml) kind = "html";
            else if (isPrintable) kind = "text-like";
            return {
              kind,
              magicHex,
              isPrintable,
              looksLikeXml,
              looksLikeHtml,
              looksLikePdf,
              looksLikeJpeg,
              looksLikePng,
            };
          };

          // ── HEAD probe ──
          // PR-AF (2026-05-23): GetObject-서명 URL 에 HEAD 를 보내면
          // SigV4 SignatureDoesNotMatch → 403 이 발생. 이는 R2/S3 의 정상 동작.
          // 진단에서는 그래도 HEAD 를 시도해서 GET 과의 차이를 비교하는 게
          // 교육적 가치가 있음 (서명 mismatch 시 R2 가 어떻게 반응하는지 dump).
          // 단, contradictions 에서 "HEAD≠GET 은 정상 동작 (GET-서명)" 라벨을
          // 추가하여 오해를 방지.
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const headResp = await fetch(fullUrl, {
            method: "HEAD",
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          const headHeaders = dumpHeaders(headResp.headers);

          // ── GET probe (항상 실행 — 성공이든 실패든 body 형태가 root cause 단서) ──
          let getProbe: any = null;
          try {
            const controller2 = new AbortController();
            const timeoutId2 = setTimeout(() => controller2.abort(), 8000);
            const getResp = await fetch(fullUrl, {
              method: "GET",
              signal: controller2.signal,
            });
            clearTimeout(timeoutId2);

            const getHeaders = dumpHeaders(getResp.headers);
            // body 를 ArrayBuffer 로 읽어 magic bytes 와 텍스트 둘 다 확보
            const ab = await getResp.arrayBuffer();
            const buf = new Uint8Array(ab);
            const totalBytes = buf.byteLength;
            const classification = classifyBody(buf);
            // text 표현은 첫 500바이트만
            const textSnippet = new TextDecoder("utf-8", { fatal: false })
              .decode(buf.slice(0, 500));
            // 첫 80바이트 hex
            const headHex = Array.from(buf.slice(0, 80))
              .map((b) => b.toString(16).padStart(2, "0"))
              .join(" ");

            getProbe = {
              attempted: true,
              ok: getResp.ok,
              status: getResp.status,
              statusText: getResp.statusText,
              totalBytes,
              headers: getHeaders,
              classification,
              headHex,
              textSnippet,
            };
          } catch (err: any) {
            getProbe = {
              attempted: true,
              ok: false,
              error: `${err?.name ?? "Error"}: ${err?.message?.slice(0, 200) ?? "unknown"}`,
            };
          }

          // ── 모순 감지 (3-layer defense) ──
          // PR-AF (2026-05-23): HEAD≠GET 의 진짜 의미를 라벨링
          const contradictions: string[] = [];
          const notes: string[] = [];

          // ⭐ 가장 흔한 케이스: GetObject-서명 URL 에 HEAD 호출시 403 + GET 정상
          //   이건 모순이 아니라 R2/S3 의 정상 SigV4 동작.
          const headIs403 = headResp.status === 403;
          const getIsOk = !!getProbe?.ok;
          if (headIs403 && getIsOk) {
            notes.push(
              `HEAD 403 + GET 200 → 정상 동작 (presigned URL 이 GetObjectCommand 로 서명되어 HEAD 호출시 SignatureDoesNotMatch). 다운로드 자체에는 영향 없음.`
            );
          }

          // status 가 4xx/5xx 인데 body 가 PDF/이미지/text-like 이면 매우 의심
          // (단, HEAD 의 403 은 위에서 설명됐으므로 GET 기준으로만 판단)
          if (
            getProbe?.attempted &&
            !getProbe.ok &&
            (getProbe.classification?.looksLikePdf ||
              getProbe.classification?.looksLikeJpeg ||
              getProbe.classification?.looksLikePng)
          ) {
            contradictions.push(
              `GET status ${getProbe.status} 인데 body 가 ${getProbe.classification.kind} — Cloudflare 중간 가공 가능성`
            );
          }
          if (
            getProbe?.attempted &&
            getProbe.ok &&
            getProbe.headers?.["content-type"] &&
            getProbe.classification?.looksLikePdf &&
            !/pdf|octet-stream/i.test(getProbe.headers["content-type"])
          ) {
            contradictions.push(
              `Content-Type "${getProbe.headers["content-type"]}" 이지만 body 는 PDF — Content-Type 미스매치`
            );
          }
          // HEAD vs GET status 불일치는 위에서 라벨된 경우(403→200) 외에만 모순
          if (
            headResp.status !== (getProbe?.status ?? headResp.status) &&
            !(headIs403 && getIsOk)
          ) {
            contradictions.push(
              `HEAD status ${headResp.status} ≠ GET status ${getProbe?.status} — proxy 불일치 의심`
            );
          }

          headProbe = {
            attempted: true,
            ok: headResp.ok,
            status: headResp.status,
            statusText: headResp.statusText,
            contentType: headResp.headers.get("content-type") ?? null,
            contentLength: headResp.headers.get("content-length") ?? null,
            cfRay: headResp.headers.get("cf-ray") ?? null,
            cfCacheStatus: headResp.headers.get("cf-cache-status") ?? null,
            server: headResp.headers.get("server") ?? null,
            via: headResp.headers.get("via") ?? null,
            allHeaders: headHeaders,
            getProbe,
            contradictions,
            notes, // ★ PR-AF: 정상 동작 라벨 (오해 방지)
            // ★ PR-AF: GET 기준의 최종 판정 (다운로드 가능 여부)
            downloadable: !!getProbe?.ok,
          };
        } catch (err: any) {
          headProbe = {
            attempted: true,
            ok: false,
            error: `${err?.name ?? "Error"}: ${err?.message?.slice(0, 200) ?? "unknown"}`,
          };
        }
      }

      // 5) URL 에서 추출된 추가 정보
      let urlAnalysis = null;
      if (fileUrl) {
        urlAnalysis = {
          raw: fileUrl.slice(0, 300),
          length: fileUrl.length,
          nonAsciiCount: [...fileUrl].filter((c) => c.charCodeAt(0) > 127).length,
        };
      }

      return {
        ok: true,
        cert: {
          id: cert.id,
          tenantId: cert.tenant_id,
          fileName,
          createdAt: cert.created_at,
          updatedAt: cert.updated_at,
        },
        keyAnalysis,
        urlAnalysis,
        presignedAttempt,
        headProbe,
      };
    }),
});
