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
});
