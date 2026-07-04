/**
 * h_recipe_headers.product_id 재매핑 (레시피 화면 오표시 교정, READ-safe)
 * ============================================================================
 * 배경: h_recipe_headers.product_id 78/79 가 엉뚱한 제품을 가리킴(초기 임포트 조인 오류).
 *   ★ 영향 범위 한정: 이 테이블은 실제 원재료 차감 BOM 이 아님(차감은 h_mf_ingredients 기반).
 *     레시피 관리 UI 표시 + 원가분석 read 쿼리 + CCP 폼 target_quantity 에만 영향.
 *   교정: recipe_name 으로 올바른 h_products_v2 제품을 찾아 product_id 를 바로잡음.
 *
 * 안전: 표시용 테이블, 매칭은 이름 정확일치(TRIM). 매칭 안 되면 skip + 목록화(수동 확인).
 *
 * 실행:
 *   npx tsx scripts/fix-recipe-header-product-mapping.ts            # DRY-RUN
 *   npx tsx scripts/fix-recipe-header-product-mapping.ts --commit   # 교정
 * 옵션: --tenant=2
 * ============================================================================
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";

config();
function arg(n: string, d?: string) { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split("=")[1] : d; }
const COMMIT = process.argv.includes("--commit");
const TENANT = Number(arg("tenant", "2"));

(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  console.log(`\n=== recipe_headers.product_id 재매핑 (${COMMIT ? "COMMIT" : "DRY-RUN"}) tenant=${TENANT} ===\n`);

  const [rows]: any = await conn.query(
    `SELECT rh.id, rh.recipe_code, rh.recipe_name, rh.product_id AS cur_pid,
            (SELECT p.id FROM h_products_v2 p
              WHERE p.tenant_id=rh.tenant_id AND TRIM(p.product_name)=TRIM(rh.recipe_name) LIMIT 1) AS correct_pid
       FROM h_recipe_headers rh
      WHERE rh.tenant_id=?
      ORDER BY rh.id`, [TENANT]);

  let ok = 0, toFix = 0, noMatch = 0;
  const fixes: Array<{ id: number; code: string; name: string; from: number; to: number }> = [];
  const misses: Array<{ id: number; code: string; name: string }> = [];
  for (const r of rows as any[]) {
    if (r.correct_pid == null) { noMatch++; misses.push({ id: r.id, code: r.recipe_code, name: r.recipe_name }); continue; }
    if (Number(r.correct_pid) === Number(r.cur_pid)) { ok++; continue; }
    toFix++;
    fixes.push({ id: r.id, code: r.recipe_code, name: r.recipe_name, from: Number(r.cur_pid), to: Number(r.correct_pid) });
  }

  console.log(`전체 ${rows.length} / 이미정상 ${ok} / 교정대상 ${toFix} / 이름매칭실패 ${noMatch}\n`);
  console.log(`[교정 대상 상위 30]  recipe → product_id: 현재 → 정정`);
  for (const f of fixes.slice(0, 30)) console.log(`  #${f.id} ${f.code} ${f.name}: ${f.from} → ${f.to}`);
  if (misses.length > 0) {
    console.log(`\n[이름매칭 실패 ${misses.length} — 수동 확인 (v2 에 동명 제품 없음)]`);
    for (const m of misses.slice(0, 30)) console.log(`  #${m.id} ${m.code} "${m.name}"`);
  }

  if (!COMMIT) { console.log(`\nDRY-RUN — --commit 시 교정대상 ${toFix}건 UPDATE.`); await conn.end(); process.exit(0); }

  let done = 0;
  for (const f of fixes) {
    await conn.execute(`UPDATE h_recipe_headers SET product_id=?, updated_at=NOW() WHERE id=? AND tenant_id=?`,
      [f.to, f.id, TENANT]);
    done++;
  }
  console.log(`\n[결과] 교정 ${done}건 완료. 이름매칭 실패 ${noMatch}건은 유지(수동 확인).`);

  await conn.end();
  console.log(`\n=== 종료 ===\n`);
  process.exit(0);
})().catch(e => { console.error("재매핑 실패:", e); process.exit(1); });
