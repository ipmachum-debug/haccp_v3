import { config } from "dotenv";
import mysql from "mysql2/promise";
config();

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  // 자주 등장하는 ID 후보들
  const ids = [149, 162, 170, 177, 196, 198, 199, 209];

  for (const id of ids) {
    console.log(`\n=== ID ${id} 추적 ===`);
    const [hm] = await conn.query(`SELECT id, material_code, material_name, tenant_id FROM h_materials WHERE id=?`, [id]);
    const [hmm] = await conn.query(`SELECT id, material_code, material_name, tenant_id FROM h_material_master WHERE id=?`, [id]);
    const [him] = await conn.query(`SELECT id, code, name, tenant_id FROM h_intermediate_master WHERE id=?`, [id]).catch(() => [[]]);
    const [im] = await conn.query(`SELECT * FROM item_master WHERE id=?`, [id]).catch(() => [[]]);
    
    console.log(`  h_materials       :`, (hm as any[])[0] || 'NOT FOUND');
    console.log(`  h_material_master :`, (hmm as any[])[0] || 'NOT FOUND');
    console.log(`  h_intermediate_master:`, (him as any[])[0] || 'NOT FOUND');
    console.log(`  item_master       :`, (im as any[])[0] || 'NOT FOUND');
  }

  // h_materials 전체 ID 범위 확인
  console.log("\n=== h_materials ID 분포 ===");
  const [hmRange] = await conn.query(`
    SELECT MIN(id) AS min_id, MAX(id) AS max_id, COUNT(*) AS total, tenant_id
    FROM h_materials GROUP BY tenant_id
  `);
  console.table(hmRange);

  // h_material_master 전체 ID 범위
  console.log("\n=== h_material_master ID 분포 ===");
  const [hmmRange] = await conn.query(`
    SELECT MIN(id) AS min_id, MAX(id) AS max_id, COUNT(*) AS total, tenant_id
    FROM h_material_master GROUP BY tenant_id
  `);
  console.table(hmmRange);

  // item_master 확인
  console.log("\n=== item_master 컬럼 + ID 범위 ===");
  const [imCols] = await conn.query(`SHOW COLUMNS FROM item_master`);
  console.log("Columns:", (imCols as any[]).map(c => c.Field).join(', '));
  const [imRange] = await conn.query(`SELECT MIN(id) AS min_id, MAX(id) AS max_id, COUNT(*) AS total FROM item_master`);
  console.table(imRange);

  // ID 198, 170 같은 값을 item_master에서 정확히 찾기
  console.log("\n=== item_master에서 ID 149,170,177,198 검색 ===");
  const [imCheck] = await conn.query(`SELECT * FROM item_master WHERE id IN (149,170,177,198) LIMIT 10`);
  console.table(imCheck);

  await conn.end();
}
main().catch(e => { console.error(e); process.exit(1); });
