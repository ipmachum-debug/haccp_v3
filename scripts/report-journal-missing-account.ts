/**
 * 계정 없는 분개 행 점검 — 읽기 전용 (2026-10-18, 지티컴퍼니 QA F04)
 *
 * account_id 가 0·NULL 인 분개 행과, 같은 회사에서 그 행의 계정코드·계정명이 정확히 같은 활성 계정이 한 개일 때만 '후보' 를 보여 준다.
 * 쓰기 없음. 정정은 CEO 승인 뒤 별도 (차대 금액·전표는 그대로, account_id 만 후보로 연결).
 *
 * 실행: npx tsx scripts/report-journal-missing-account.ts [--tenant=14]
 */
import { getRawConnection } from "../server/db/connection";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? null;
const TENANT = arg("tenant") ? Number(arg("tenant")) : null;

async function main() {
  if (TENANT != null && (!Number.isSafeInteger(TENANT) || TENANT <= 0)) throw new Error("--tenant=<id> 는 양의 정수");
  const conn = await getRawConnection();
  const [rows]: any = await conn.query(
    `SELECT l.id, l.tenant_id, l.journal_entry_id, e.entry_date, e.description AS entry_desc, l.account_code, l.account_name,
            l.debit_amount + 0 AS dr, l.credit_amount + 0 AS cr,
            (SELECT GROUP_CONCAT(a.id) FROM accounting_accounts a
              WHERE a.tenant_id = l.tenant_id AND a.is_active = 'Y' AND a.code = l.account_code AND a.name = l.account_name) AS candidates
       FROM expense_journal_lines l
       LEFT JOIN expense_journal_entries e ON e.id = l.journal_entry_id AND e.tenant_id = l.tenant_id
      WHERE (l.account_id = 0 OR l.account_id IS NULL) ${TENANT ? "AND l.tenant_id = ?" : ""}
      ORDER BY l.tenant_id, l.journal_entry_id, l.sort_order, l.id`,
    TENANT ? [TENANT] : [],
  );
  const list = rows as any[];
  console.log(`계정 없는 분개 행 ${list.length}줄`);
  for (const r of list) {
    const c = String(r.candidates ?? "").split(",").filter(Boolean);
    const cand = c.length === 1 ? `후보 계정 #${c[0]}` : c.length > 1 ? `후보 여러 개(${c.join(",")}) — 고르지 않음` : "후보 없음";
    console.log(`  [회사 ${r.tenant_id}] 전표 #${r.journal_entry_id} ${r.entry_date ?? ""} 행 #${r.id} ${r.account_code} ${r.account_name} 차 ${Number(r.dr)} / 대 ${Number(r.cr)} → ${cand}`);
  }
  await (conn as any).end?.();
}

main().catch((e) => {
  console.error("❌", e?.message || e);
  process.exit(1);
});
