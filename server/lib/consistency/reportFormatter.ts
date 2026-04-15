/**
 * 정합성 검증 리포트 포맷터
 * ═══════════════════════════════════════════════════════════════
 * CLI 에서 보기 좋게 출력
 * ═══════════════════════════════════════════════════════════════
 */

import type { ConsistencyReport, Finding, Severity } from "./types";

const SEVERITY_EMOJI: Record<Severity, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  info: "🔵",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "CRITICAL",
  high: "HIGH    ",
  medium: "MEDIUM  ",
  info: "INFO    ",
};

/**
 * 콘솔 출력용 리포트 포맷 (컬러 + 구조화)
 */
export function formatConsoleReport(report: ConsistencyReport): string {
  const lines: string[] = [];
  const hr = "═".repeat(75);
  const sr = "─".repeat(75);

  lines.push(hr);
  lines.push("  정합성 검증 리포트 (Consistency Audit Report)");
  lines.push(hr);
  lines.push(
    `  tenant_id: ${report.tenantId === null ? "ALL (전체)" : report.tenantId}`,
  );
  lines.push(`  생성 시각: ${report.generatedAt}`);
  lines.push(`  소요 시간: ${report.duration_ms}ms`);
  lines.push("");
  lines.push(`  📊 요약`);
  lines.push(
    `    🔴 Critical: ${report.summary.critical}  ` +
      `🟠 High: ${report.summary.high}  ` +
      `🟡 Medium: ${report.summary.medium}  ` +
      `🔵 Info: ${report.summary.info}`,
  );
  lines.push(`    총 발견: ${report.summary.totalFindings} 규칙`);
  lines.push(hr);
  lines.push("");

  if (report.findings.length === 0) {
    lines.push("  🎉 발견된 정합성 문제 없음!");
    return lines.join("\n");
  }

  // 카운트가 0인 것과 0 아닌 것 분리
  const withIssues = report.findings.filter((f) => f.count > 0);
  const clean = report.findings.filter((f) => f.count === 0);

  if (withIssues.length === 0) {
    lines.push("  🎉 모든 검증 규칙 통과 (0건 발견)");
    lines.push("");
    lines.push(`  통과한 규칙 (${clean.length}):`);
    for (const f of clean) {
      lines.push(`    ✅ ${f.code.padEnd(32)} ${f.title}`);
    }
    return lines.join("\n");
  }

  // 이슈 있는 것 먼저
  lines.push(`  ⚠️  발견된 이슈 (${withIssues.length} 규칙)`);
  lines.push(sr);

  for (const f of withIssues) {
    lines.push("");
    lines.push(
      `  ${SEVERITY_EMOJI[f.severity]} [${SEVERITY_LABEL[f.severity]}] ${f.code}`,
    );
    lines.push(`     ${f.title}`);
    lines.push(`     발견 건수: ${f.count.toLocaleString()}`);
    if (f.totalDelta !== undefined) {
      lines.push(`     총 차이: ${f.totalDelta.toLocaleString()}`);
    }
    if (f.message) {
      lines.push(`     설명: ${f.message}`);
    }
    if (f.samples && f.samples.length > 0) {
      lines.push(`     샘플 (최대 ${f.samples.length}건):`);
      const sampleStr = formatSamples(f.samples, f.code);
      lines.push(sampleStr);
    }
    lines.push(sr);
  }

  if (clean.length > 0) {
    lines.push("");
    lines.push(`  ✅ 통과한 규칙 (${clean.length})`);
    for (const f of clean) {
      lines.push(`     ${f.code.padEnd(32)} ${f.title}`);
    }
  }

  lines.push("");
  lines.push(hr);
  lines.push("  다음 단계:");
  lines.push("    - Critical / High 이슈 우선 수정");
  lines.push("    - Module 1~6 리팩터 수행 후 이 스크립트 재실행");
  lines.push("    - 목표: Critical 0건, High 0건");
  lines.push(hr);

  return lines.join("\n");
}

/**
 * 샘플 데이터를 테이블처럼 포맷
 */
function formatSamples(samples: Array<Record<string, any>>, code: string): string {
  if (samples.length === 0) return "     (샘플 없음)";

  // code 별로 중요 컬럼만 골라서 표시
  const columns = pickColumns(code, samples[0]);
  const lines: string[] = [];

  // 헤더
  const header = columns.map((c) => c.padEnd(c.length + 2)).join(" | ");
  lines.push("       " + header);
  lines.push("       " + "-".repeat(header.length));

  // 데이터 (최대 5건)
  for (const s of samples.slice(0, 5)) {
    const row = columns
      .map((c) => {
        const v = s[c];
        if (v === null || v === undefined) return "—";
        if (typeof v === "number") return v.toString();
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        return String(v).slice(0, 30);
      })
      .join(" | ");
    lines.push("       " + row);
  }

  if (samples.length > 5) {
    lines.push(`       ... 외 ${samples.length - 5}건 더`);
  }
  return lines.join("\n");
}

/**
 * finding code 별로 표시할 주요 컬럼 선택
 */
function pickColumns(code: string, sampleRow: Record<string, any>): string[] {
  const preferredByCode: Record<string, string[]> = {
    INV_NEG_STOCK: ["id", "lot_number", "material_id", "current_quantity", "available_quantity", "status"],
    INV_LOT_VS_TX: ["lot_id", "lot_number", "lot_current", "tx_net"],
    INV_NULL_MATERIAL: ["id", "lot_number", "supplier_name", "created_at"],
    INV_EXPIRED_ACTIVE: ["id", "lot_number", "expiry_date", "qty"],
    INV_NEGATIVE_TX: ["id", "lot_id", "transaction_type", "quantity", "transaction_date"],
    ACC_JOURNAL_UNBALANCED: ["id", "description", "sum_debit", "sum_credit"],
    ACC_ORPHAN_LINES: ["id", "journal_entry_id", "account_code", "description"],
    ACC_PAID_NO_JOURNAL: ["id", "transaction_date", "item_name", "total_amount"],
    ACC_RECEIVED_NO_JOURNAL: ["id", "transaction_date", "item_name", "total_amount"],
    ACC_SALE_NO_COGS: ["sale_id", "transaction_date", "item_name", "total_amount"],
    XCHK_REF_TYPE_CASE: ["normalized", "variants", "total"],
    XCHK_PURCHASE_VS_TX: ["id", "transaction_date", "item_name", "quantity", "status"],
    XCHK_PURCHASE_VS_LEDGER: ["tenant_id", "material_id", "purchase_qty", "ledger_qty"],
    XCHK_CANCELLED_LEFTOVER: ["purchase_id", "item_name", "inbound_header_id", "inbound_status"],
    XCHK_SALE_NO_DEDUCTION: ["id", "transaction_date", "item_name", "quantity"],
    XCHK_LEDGER_VS_TX: ["material_id", "ledger_in", "tx_in", "ledger_out", "tx_out"],
    XCHK_PURCHASE_TX_NO_SOURCE: ["id", "lot_id", "quantity", "transaction_date"],
    XCHK_STALE_APPROVED: ["id", "transaction_date", "item_name", "total_amount", "created_at"],
    XCHK_PURCHASE_AMOUNT_MATCH: ["tenant_id", "purchase_count", "purchase_supply", "journal_debit", "diff"],
  };

  const preferred = preferredByCode[code];
  if (preferred) {
    // 샘플에 실제 존재하는 것만 반환
    return preferred.filter((c) => c in sampleRow);
  }
  // 기본: 샘플의 모든 키 중 처음 6개
  return Object.keys(sampleRow).slice(0, 6);
}

/**
 * JSON 형식 리포트 (프로그램 처리용)
 */
export function formatJsonReport(report: ConsistencyReport): string {
  return JSON.stringify(report, null, 2);
}
