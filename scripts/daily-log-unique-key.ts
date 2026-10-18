/**
 * 일일일지 한 날짜 한 건 — 고유 키 이행 (docs/architecture/17 · 5-4)
 *
 * 기본(인자 없음) = 읽기 전용 조사. DB 를 바꾸지 않는다.
 *   - daily_log 전체·회사별 건수, 회사+날짜 중복(같은 날 2건 이상), 날짜 형식 이상, 키가 이미 있는 행
 *   - h_sites 행 수, daily_log.site_id 분포 (사업장 표와 연결되는지)
 * --apply --confirm = 승인·백업 뒤에만. 순서:
 *   1) unique_key 칼럼 추가 (없을 때)
 *   2) 키가 비어 있는 daily_log 에 서버 규칙 키 채움 — daily_log:{tenant}:0:{date}
 *      (사업장 표가 비어 있어 기존 site_id 는 사업장으로 보지 않는다 → 범위 0)
 *      같은 회사+날짜가 2건 이상이면 그 날짜는 채우지 않고 보고 (자동 병합·삭제 없음)
 *   3) UNIQUE(tenant_id, unique_key) 인덱스 uq_gcr_tenant_unique_key
 *   4) 확인: 인덱스 구성·빈 키 0건 → 앱이 키 경로를 켠다 (서버 dailyLogKeyReady)
 *   중복이 남아 있으면 빈 키가 남아 앱은 이전 경로를 유지한다.
 *
 * 실행: npx tsx scripts/daily-log-unique-key.ts            (조사)
 *       npx tsx scripts/daily-log-unique-key.ts --apply --confirm
 */
import { getRawConnection } from "../server/db/connection";
import { DAILY_LOG_KEY_INDEX } from "../server/lib/production/dailyLogStore";

const APPLY = process.argv.includes("--apply");
const CONFIRM = process.argv.includes("--confirm");

async function main() {
  const conn: any = await getRawConnection();
  const [[sites]]: any = await conn.query(`SELECT COUNT(*) AS n FROM h_sites`);
  const [byTenant]: any = await conn.query(
    `SELECT tenant_id, COUNT(*) AS n, MIN(form_date) AS mn, MAX(form_date) AS mx FROM h_generic_checklist_records WHERE form_type = 'daily_log' GROUP BY tenant_id ORDER BY tenant_id`,
  );
  const [siteDist]: any = await conn.query(
    `SELECT tenant_id, site_id, COUNT(*) AS n FROM h_generic_checklist_records WHERE form_type = 'daily_log' GROUP BY tenant_id, site_id ORDER BY tenant_id, site_id`,
  );
  const [dups]: any = await conn.query(
    `SELECT tenant_id, form_date, COUNT(*) AS n, GROUP_CONCAT(id ORDER BY id) AS ids, GROUP_CONCAT(status ORDER BY id) AS st
       FROM h_generic_checklist_records WHERE form_type = 'daily_log' GROUP BY tenant_id, form_date HAVING n > 1`,
  );
  const [badDates]: any = await conn.query(
    `SELECT id, tenant_id, form_date FROM h_generic_checklist_records WHERE form_type = 'daily_log' AND form_date NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`,
  );
  const [[col]]: any = await conn.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_generic_checklist_records' AND COLUMN_NAME = 'unique_key'`,
  );
  console.log(`h_sites 행: ${sites.n}`);
  console.log(`daily_log 회사별:`); for (const r of byTenant as any[]) console.log(`  회사 ${r.tenant_id}: ${r.n}건 (${r.mn} ~ ${r.mx})`);
  console.log(`daily_log site_id 분포:`); for (const r of siteDist as any[]) console.log(`  회사 ${r.tenant_id} site_id=${r.site_id}: ${r.n}건`);
  console.log(`회사+날짜 중복: ${(dups as any[]).length}건`); for (const d of dups as any[]) console.log(`  회사 ${d.tenant_id} ${d.form_date}: ${d.n}건 (id ${d.ids}, 상태 ${d.st})`);
  console.log(`날짜 형식 이상: ${(badDates as any[]).length}건`); for (const b of badDates as any[]) console.log(`  id ${b.id} 회사 ${b.tenant_id} '${b.form_date}'`);
  console.log(`unique_key 칼럼: ${Number(col.n) ? "있음" : "없음"}`);

  if (!APPLY) { console.log("\n조사만 했습니다 (변경 없음). 적용은 승인·백업 뒤 --apply --confirm"); process.exit(0); }
  if (!CONFIRM) { console.error("--apply 는 --confirm 과 함께 — 승인·백업을 확인했다는 뜻입니다."); process.exit(1); }

  if (!Number(col.n)) {
    await conn.query(`ALTER TABLE h_generic_checklist_records ADD COLUMN unique_key varchar(80) NULL`);
    console.log("unique_key 칼럼 추가");
  }
  const dupKey = new Set((dups as any[]).map((d) => `${d.tenant_id}|${d.form_date}`));
  const bad = new Set((badDates as any[]).map((b) => Number(b.id)));
  const [rows]: any = await conn.query(`SELECT id, tenant_id, form_date FROM h_generic_checklist_records WHERE form_type = 'daily_log' AND unique_key IS NULL`);
  let filled = 0, skipped = 0;
  for (const r of rows as any[]) {
    if (bad.has(Number(r.id)) || dupKey.has(`${r.tenant_id}|${r.form_date}`)) { skipped++; continue; }
    const [res]: any = await conn.execute(
      `UPDATE h_generic_checklist_records SET unique_key = ? WHERE id = ? AND unique_key IS NULL`,
      [`daily_log:${r.tenant_id}:0:${r.form_date}`, r.id],
    );
    filled += Number(res.affectedRows ?? 0);
  }
  console.log(`키 채움 ${filled}건, 건너뜀(중복·날짜 이상) ${skipped}건`);
  const [[ix]]: any = await conn.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_generic_checklist_records' AND INDEX_NAME = ?`,
    [DAILY_LOG_KEY_INDEX],
  );
  if (!Number(ix.n)) {
    await conn.query(`ALTER TABLE h_generic_checklist_records ADD UNIQUE KEY ${DAILY_LOG_KEY_INDEX} (tenant_id, unique_key)`);
    console.log(`인덱스 ${DAILY_LOG_KEY_INDEX} 추가`);
  }
  const [[left]]: any = await conn.query(`SELECT COUNT(*) AS n FROM h_generic_checklist_records WHERE form_type = 'daily_log' AND unique_key IS NULL`);
  console.log(Number(left.n) === 0 ? "확인: 빈 키 0건 — 앱이 키 경로를 씁니다." : `확인: 빈 키 ${left.n}건 남음 — 앱은 이전 경로 유지 (중복 정리는 별도 승인)`);
  process.exit(0);
}

main().catch((e) => { console.error("❌", e?.message || e); process.exit(1); });
