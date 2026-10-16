/**
 * 증숙 공정 CCP 기록지 측정시각 정정 — 순차 → 묶음 순차 (2026-10-16)
 *
 * 사고: 증숙(설기류)·증숙(약식류) 공정 그룹 설정이 4/12~4/15 사이 '묶음 순차 3대' → '순차 1대' 로 바뀌어
 *   그 뒤 생성된 CCP-1B 기록지가 1대씩 10분 간격으로 찍혔다 (실제 운영: 1·2·3호 동시, 4·5·6호 10분 뒤).
 *   코드는 정상 — 설정값 오류. 설비·투입량·온도·압력·행 수는 그대로 두고 측정시각만 고친다.
 * 규칙: scripts/_lib/ccpGroupedTimes.ts (syncCcpRowsToFormRows 의 grouped 분기와 동일),
 *   기준 시각 = 기록지 첫 행 시각, 회차 간격 = h_ccp_rows.duration_min (설비 1회 운전 시간).
 * 승인: 기록지 상태(승인/제출)는 바꾸지 않는다 (CEO 결정 2026-10-16: 일괄 승인 유지).
 *   대신 원래 시각을 백업 표에 남기고 기록지마다 audit_logs 에 정정 사유를 남긴다. --rollback 으로 되돌린다.
 *
 * 실행 (서버, Codex — CEO 승인 후):
 *   npx tsx scripts/ccp-steam-grouped-time-fix.ts                 # 미리보기 (DB 변경 없음)
 *   npx tsx scripts/ccp-steam-grouped-time-fix.ts --apply         # 적용
 *   npx tsx scripts/ccp-steam-grouped-time-fix.ts --rollback      # 되돌리기
 *   npx tsx scripts/ccp-steam-grouped-time-fix.ts --only=1717 --apply   # 1건 시험 적용 (되돌리기도 --only 로 범위 지정)
 * 옵션: --tenant=2 --groups=2,3 --created-from=2026-04-13 --batch-size=3 --interval=10
 */
import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env";
import { groupedTimeFor, isHHmm } from "./_lib/ccpGroupedTimes";
import { parseOnlyIds } from "./_lib/onlyIds";

const arg = (name: string, def: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? def;
const APPLY = process.argv.includes("--apply");
const ROLLBACK = process.argv.includes("--rollback");
const TENANT = Number(arg("tenant", "2"));
const GROUPS = arg("groups", "2,3").split(",").map(Number).filter(Number.isFinite);
const CREATED_FROM = arg("created-from", "2026-04-13");
const BATCH_SIZE = Number(arg("batch-size", "3"));
const INTERVAL = Number(arg("interval", "10"));
// --only=1717,1718 : 이 기록지만 (1건 시험 적용용). 미지정이면 조건에 맞는 전체.
//   잘못된 값(빈 값·숫자 아님·0·음수·소수)은 DB 연결 전에 종료 — 전체로 번지지 않게 (Codex #541 재검증 P1)
let ONLY: number[] = [];
try {
  ONLY = parseOnlyIds(process.argv) ?? [];
} catch (e: any) {
  console.error(`❌ ${e.message}`);
  process.exit(2);
}
const BACKUP = "h_ccp_form_rows_time_fix_20261016";
const REASON = "2026-10-16 공정 그룹 설정 오류(순차 1대 → 실제 묶음 순차 3대)로 측정시각 정정";

async function ensureBackupTable(conn: mysql.Connection) {
  await conn.query(`CREATE TABLE IF NOT EXISTS ${BACKUP} (
    row_id bigint NOT NULL PRIMARY KEY,
    tenant_id int NOT NULL,
    form_record_id bigint NOT NULL,
    old_time varchar(10) NULL,
    new_time varchar(10) NULL,
    old_group_mode varchar(20) NULL,
    old_interval_min int NULL,
    reason varchar(255) NOT NULL,
    fixed_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_fix_record (tenant_id, form_record_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function backupExists(conn: mysql.Connection) {
  const [rows]: any = await conn.query(`SHOW TABLES LIKE '${BACKUP}'`);
  return rows.length > 0;
}

async function rollback(conn: mysql.Connection) {
  if (!(await backupExists(conn))) return console.log("백업 표가 없습니다 — 되돌릴 것 없음");
  const [recs]: any = await conn.query(
    `SELECT form_record_id, MAX(old_group_mode) AS mode, MAX(old_interval_min) AS iv, COUNT(*) AS n
       FROM ${BACKUP} WHERE tenant_id = ? ${ONLY.length ? "AND form_record_id IN (?)" : ""} GROUP BY form_record_id`,
    ONLY.length ? [TENANT, ONLY] : [TENANT]);
  console.log(`되돌릴 기록지 ${recs.length}건`);
  for (const r of recs) {
    await conn.beginTransaction();
    try {
      const [res]: any = await conn.query(
        `UPDATE h_ccp_form_rows fr JOIN ${BACKUP} b ON b.row_id = fr.id
            SET fr.measurement_time = b.old_time
          WHERE b.form_record_id = ? AND b.tenant_id = ? AND fr.tenant_id = b.tenant_id AND fr.measurement_time <=> b.new_time`,
        [r.form_record_id, TENANT]);
      if (Number(res.affectedRows) !== Number(r.n)) throw new Error(`행 ${r.n} 중 ${res.affectedRows} 만 일치 — 정정 뒤 수정된 행이 있음`);
      await conn.query(`UPDATE h_ccp_form_records SET equip_group_mode = ?, equip_interval_min = ? WHERE id = ? AND tenant_id = ?`,
        [r.mode, r.iv, r.form_record_id, TENANT]);
      await conn.query(`DELETE FROM ${BACKUP} WHERE form_record_id = ? AND tenant_id = ?`, [r.form_record_id, TENANT]);
      await conn.query(
        `INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, user_id, description, created_at)
         VALUES (?, 'ccp_form.time_correction_rollback', 'ccp_form_record', ?, 0, ?, NOW())`,
        [TENANT, r.form_record_id, `측정시각 정정 되돌림 (${r.n}행)`]);
      await conn.commit();
    } catch (e: any) {
      await conn.rollback();
      console.log(`  ❌ 기록지 #${r.form_record_id}: ${e.message}`);
    }
  }
  console.log("되돌리기 완료");
}

async function main() {
  const conn = await mysql.createConnection({ ...getDbConfigFromEnv(process.env), charset: "utf8mb4" });
  console.log(`=== 증숙 CCP 측정시각 정정 (순차 → 묶음 순차 ${BATCH_SIZE}대, 간격 ${INTERVAL}분) ===`);
  console.log(`모드: ${ROLLBACK ? "되돌리기" : APPLY ? "적용 (--apply)" : "미리보기"} / 회사 ${TENANT} / 공정 그룹 ${GROUPS.join(",")} / 기록지 생성일 ≥ ${CREATED_FROM}${ONLY.length ? ` / 대상 기록지 ${ONLY.join(",")} 만` : ""}\n`);
  if (ROLLBACK) { await rollback(conn); await conn.end(); return; }

  const already = new Set<number>();
  if (await backupExists(conn)) {
    const [done]: any = await conn.query(`SELECT DISTINCT form_record_id FROM ${BACKUP} WHERE tenant_id = ?`, [TENANT]);
    for (const d of done) already.add(Number(d.form_record_id));
  }

  const [records]: any = await conn.query(
    `SELECT r.id, r.batch_id, r.process_group_id, r.process_group_name, r.work_date, r.product_name, r.status,
            r.equip_group_mode, r.equip_interval_min,
            (SELECT cr.duration_min FROM h_ccp_instances i JOIN h_ccp_rows cr ON cr.instance_id = i.id
              WHERE i.batch_id = r.batch_id AND i.process_group_id = r.process_group_id AND i.tenant_id = r.tenant_id
              ORDER BY cr.sort_order LIMIT 1) AS cycle_min
       FROM h_ccp_form_records r
      WHERE r.tenant_id = ? AND r.process_group_id IN (?) AND r.created_at >= ? AND r.ccp_type = 'CCP-1B'
        ${ONLY.length ? "AND r.id IN (?)" : ""}
      ORDER BY r.work_date, r.id`,
    ONLY.length ? [TENANT, GROUPS, CREATED_FROM, ONLY] : [TENANT, GROUPS, CREATED_FROM]);

  const stats: Record<string, { recs: number; rows: number; changed: number }> = {};
  const skipped: string[] = [];
  let applied = 0;
  let samples = 0;

  for (const rec of records) {
    if (already.has(Number(rec.id))) { skipped.push(`#${rec.id} 이미 정정됨`); continue; }
    const [rows]: any = await conn.query(
      `SELECT id, batch_seq, equipment_name, measurement_time FROM h_ccp_form_rows
        WHERE form_record_id = ? AND tenant_id = ? ORDER BY batch_seq, id`, [rec.id, TENANT]);
    const first = rows.find((r: any) => Number(r.batch_seq) === 1);
    if (!first || !isHHmm(first.measurement_time)) { skipped.push(`#${rec.id} 첫 행 시각 없음`); continue; }
    if (rows.some((r: any) => !isHHmm(r.measurement_time))) { skipped.push(`#${rec.id} 시각 형식이 다른 행 있음`); continue; }

    const params = {
      startTime: first.measurement_time,
      equipCount: new Set(rows.map((r: any) => r.equipment_name).filter(Boolean)).size || rows.length,
      cycleMin: rec.cycle_min != null ? Number(rec.cycle_min) : 70,
      intervalMin: INTERVAL,
      batchSize: BATCH_SIZE,
    };
    const plan = rows.map((r: any) => ({ id: Number(r.id), seq: Number(r.batch_seq), eq: r.equipment_name, old: r.measurement_time, next: groupedTimeFor(Number(r.batch_seq), params) }));
    const changes = plan.filter((p: any) => p.old !== p.next);
    const key = `${rec.process_group_name} / ${rec.status}`;
    stats[key] ??= { recs: 0, rows: 0, changed: 0 };
    stats[key].rows += plan.length;
    if (changes.length === 0) continue;
    stats[key].recs++;
    stats[key].changed += changes.length;

    if (samples < 3) {
      samples++;
      console.log(`기록지 #${rec.id} ${String(rec.work_date).slice(0, 10)} ${rec.product_name} (${rec.status}) 사이클 ${params.cycleMin}분`);
      for (const p of plan) console.log(`   ${String(p.seq).padStart(2)} ${p.eq ?? "-"}  ${p.old} → ${p.next}${p.old === p.next ? "" : "  *"}`);
    }

    if (!APPLY) continue;
    await ensureBackupTable(conn);
    await conn.beginTransaction();
    try {
      for (const p of changes) {
        await conn.query(
          `INSERT INTO ${BACKUP} (row_id, tenant_id, form_record_id, old_time, new_time, old_group_mode, old_interval_min, reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [p.id, TENANT, rec.id, p.old, p.next, rec.equip_group_mode, rec.equip_interval_min, REASON]);
        const [res]: any = await conn.query(
          `UPDATE h_ccp_form_rows SET measurement_time = ? WHERE id = ? AND tenant_id = ? AND measurement_time = ?`,
          [p.next, p.id, TENANT, p.old]);
        if (Number(res.affectedRows) !== 1) throw new Error(`행 #${p.id} 이 미리보기 뒤 바뀜`);
      }
      // 상태(승인/제출)는 그대로 — 운영 방식 표시만 실제값으로
      await conn.query(
        `UPDATE h_ccp_form_records SET equip_group_mode = 'grouped', equip_interval_min = ? WHERE id = ? AND tenant_id = ?`,
        [INTERVAL, rec.id, TENANT]);
      await conn.query(
        `INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, user_id, changes, description, created_at)
         VALUES (?, 'ccp_form.time_correction', 'ccp_form_record', ?, 0, ?, ?, NOW())`,
        [TENANT, rec.id, JSON.stringify({ rows: changes.map((p: any) => ({ id: p.id, seq: p.seq, before: p.old, after: p.next })) }),
         `${REASON} — ${changes.length}행, 승인 상태 유지(${rec.status})`]);
      await conn.commit();
      applied++;
    } catch (e: any) {
      await conn.rollback();
      skipped.push(`#${rec.id} 적용 실패: ${e.message}`);
    }
  }

  console.log("\n── 요약 ──");
  for (const [k, v] of Object.entries(stats)) console.log(`${k}: 바뀌는 기록지 ${v.recs}건, 바뀌는 행 ${v.changed} / ${v.rows}`);
  if (skipped.length) console.log(`건너뜀 ${skipped.length}건:\n  ${skipped.join("\n  ")}`);
  console.log(APPLY ? `\n✅ 적용 ${applied}건 (원래 시각: ${BACKUP}, 되돌리기: --rollback)` : "\n🔍 미리보기 — DB 변경 없음. 적용은 --apply");
  await conn.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
