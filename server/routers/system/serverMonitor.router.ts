/**
 * 서버 모니터링 라우터 (관리자 전용)
 * - 서버 상태 조회
 * - 느림 원인 진단
 * - 백업 현황
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getServerStatus, diagnoseSlow } from "../../utils/serverMonitor";
import { TRPCError } from "@trpc/server";
import { execSync } from "child_process";

function adminOnly(ctx: any) {
  if (!["super_admin", "admin"].includes(ctx.user?.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "관리자만 접근 가능합니다." });
  }
}

export const serverMonitorRouter = router({
  // ── 서버 상태 조회 ──
  getStatus: tenantRequiredProcedure.query(async ({ ctx }) => {
    adminOnly(ctx);
    return await getServerStatus();
  }),

  // ── 느림 원인 진단 ──
  diagnose: tenantRequiredProcedure.query(async ({ ctx }) => {
    adminOnly(ctx);
    return await diagnoseSlow();
  }),

  // ── 백업 현황 ──
  getBackupInfo: tenantRequiredProcedure.query(async ({ ctx }) => {
    adminOnly(ctx);
    try {
      const backupDir = "/home/root/backups/haccp";
      const dbFiles = execSync(`ls -lt ${backupDir}/db/*.sql.gz 2>/dev/null | head -5`, { encoding: "utf-8", timeout: 3000 }).trim();
      const totalSize = execSync(`du -sh ${backupDir} 2>/dev/null | cut -f1`, { encoding: "utf-8", timeout: 3000 }).trim();
      const dbCount = execSync(`ls -1 ${backupDir}/db/*.sql.gz 2>/dev/null | wc -l`, { encoding: "utf-8", timeout: 3000 }).trim();

      const recentBackups = dbFiles.split("\n").filter(Boolean).map((line) => {
        const parts = line.split(/\s+/);
        return {
          size: parts[4],
          date: `${parts[5]} ${parts[6]} ${parts[7]}`,
          file: parts[parts.length - 1],
        };
      });

      return {
        totalSize,
        backupCount: parseInt(dbCount) || 0,
        recentBackups,
        backupDir,
      };
    } catch {
      return {
        totalSize: "N/A",
        backupCount: 0,
        recentBackups: [],
        backupDir: "/home/root/backups/haccp",
        note: "백업 디렉토리가 없거나 아직 백업이 실행되지 않았습니다.",
      };
    }
  }),

  // ── 서버 상태 이력 기록 (5분마다 호출 → 슬로우 로그 저장) ──
  recordSnapshot: tenantRequiredProcedure.mutation(async ({ ctx }) => {
    adminOnly(ctx);
    const status = await getServerStatus();

    // h_server_snapshots 테이블에 기록 (있으면)
    try {
      const { getPool } = await import("../../db/pool");
      const pool = getPool();
      await pool.execute(
        `INSERT INTO h_server_snapshots (cpu_usage, memory_percent, disk_percent, mysql_connections, mysql_threads_running, slow_queries, alerts, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [status.cpu.usage, status.memory.usagePercent, status.disk.usagePercent,
         status.mysql.connections, status.mysql.threadsRunning, status.mysql.slowQueries,
         JSON.stringify(status.alerts)]
      );
    } catch {
      // 테이블 없으면 무시
    }

    return { recorded: true, alerts: status.alerts };
  }),
});
