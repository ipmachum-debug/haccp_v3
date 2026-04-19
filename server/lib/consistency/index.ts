/**
 * 정합성 검증 진입점 (Module 0)
 * ═══════════════════════════════════════════════════════════════
 * runConsistencyAudit(tenantId?) — 모든 검증 실행 후 리포트 반환
 * ═══════════════════════════════════════════════════════════════
 */

import { getRawConnection } from "../../db/connection";
import { runInventoryChecks } from "./inventoryChecks";
import { runAccountingChecks } from "./accountingChecks";
import { runCrossChecks } from "./crossChecks";
import { sortFindings, summarize, type ConsistencyReport } from "./types";

export async function runConsistencyAudit(
  tenantId: number | null = null,
): Promise<ConsistencyReport> {
  const start = Date.now();
  const conn = await getRawConnection();

  const [inv, acc, cross] = await Promise.all([
    runInventoryChecks(conn, tenantId),
    runAccountingChecks(conn, tenantId),
    runCrossChecks(conn, tenantId),
  ]);

  const all = [...inv, ...acc, ...cross];
  const sorted = sortFindings(all);

  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    duration_ms: Date.now() - start,
    findings: sorted,
    summary: summarize(sorted),
  };
}

export { formatConsoleReport, formatJsonReport } from "./reportFormatter";
export type { ConsistencyReport, Finding, Severity } from "./types";
