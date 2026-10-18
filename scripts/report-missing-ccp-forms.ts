/**
 * 공정별 CCP 기록지 누락 점검 — 읽기 전용 (2026-10-18)
 *
 * 한 배치가 같은 CCP 유형 공정을 둘 이상 거칠 때(예: CCP-1B 교반 + 증숙) 이전 생성 로직은 기록지를 하나만 만들었다.
 * 이 스크립트는 CCP 인스턴스(공정)는 있는데 그 공정의 공식 기록지가 없는 배치를 나열한다.
 *
 * 쓰기 없음. 과거 기록지를 자동으로 만들지 않는다 — 측정하지 않은 값이 '적합' 으로 미리 채워진 소급 기록이 되기 때문.
 * 현장 기록(종이 등) 확인 뒤 입력 방법은 별도 승인으로 정한다.
 *
 * 실행: npx tsx scripts/report-missing-ccp-forms.ts --tenant=2 [--from=2026-01-01] [--to=2026-12-31]
 */
import { getRawConnection } from "../server/db/connection";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? null;
const TENANT = Number(arg("tenant"));
const FROM = arg("from") ?? "2000-01-01";
const TO = arg("to") ?? "2999-12-31";

async function main() {
  if (!Number.isSafeInteger(TENANT) || TENANT <= 0) throw new Error("--tenant=<id> 필수");
  const conn = await getRawConnection();
  const [rows]: any = await conn.query(
    `SELECT b.id AS batch_id, b.batch_code, DATE_FORMAT(b.planned_date, '%Y-%m-%d') AS d, b.status,
            p.product_name, i.ccp_type, i.process_group_id, g.name AS group_name
       FROM h_ccp_instances i
       JOIN h_batches b ON b.id = i.batch_id AND b.tenant_id = i.tenant_id
       LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
       LEFT JOIN ccp_process_groups g ON g.id = i.process_group_id AND g.tenant_id = i.tenant_id
      WHERE i.tenant_id = ? AND i.ccp_type IN ('CCP-1B', 'CCP-2B') AND i.process_group_id IS NOT NULL
        AND b.planned_date BETWEEN ? AND ?
        AND NOT EXISTS (SELECT 1 FROM h_ccp_form_records f
                         WHERE f.tenant_id = i.tenant_id AND f.batch_id = i.batch_id
                           AND f.ccp_type = i.ccp_type AND f.process_group_id = i.process_group_id)
      ORDER BY b.planned_date, b.id, i.ccp_type, i.process_group_id`,
    [TENANT, FROM, TO],
  );
  const list = rows as any[];
  const batches = new Set(list.map((r) => r.batch_id));
  console.log(`공정 기록지 누락: ${list.length}건 (배치 ${batches.size}개), 회사 ${TENANT}, ${FROM} ~ ${TO}`);
  const byGroup = new Map<string, number>();
  for (const r of list) byGroup.set(`${r.ccp_type} ${r.group_name ?? `#${r.process_group_id}`}`, (byGroup.get(`${r.ccp_type} ${r.group_name ?? `#${r.process_group_id}`}`) ?? 0) + 1);
  for (const [k, n] of byGroup) console.log(`  · ${k}: ${n}건`);
  for (const r of list) {
    console.log(`  ${r.d} 배치 #${r.batch_id} ${r.batch_code} (${r.product_name ?? "-"}, ${r.status}) — ${r.ccp_type} ${r.group_name ?? `공정 #${r.process_group_id}`} 기록지 없음`);
  }
  await (conn as any).end?.();
}

main().catch((e) => {
  console.error("❌", e?.message || e);
  process.exit(1);
});
