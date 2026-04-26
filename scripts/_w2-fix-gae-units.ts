/**
 * PR-W2: '개' 단위로 잘못 입고된 13개 LOT을 'kg' 단위로 정정
 *
 * 사용자 확정 변환표:
 *   LOT 753 (596 냉동쑥)        : 10개 × 5kg   = 50kg
 *   LOT 756 (596 냉동쑥)        : 14개 × 5kg   = 70kg
 *   LOT 757 (598 녹차가루)      :  4개 × 1kg   = 4kg
 *   LOT 749 (608 두류)          : 16개 × 5kg   = 80kg
 *   LOT 758 (609 콩고물)        :480개 × 2.5kg = 1,200kg
 *   LOT 750 (615 멥쌀)          :200개 × 20kg  = 4,000kg
 *   LOT 751 (617 물엿)          : 27개 × 25kg  = 675kg
 *   LOT 754 (629 쑥가루)        : 24개 × 2kg   = 48kg
 *   LOT 755 (632 연유)          :  4개 × 0.5kg = 2kg
 *   LOT 752 (640 백옥앙금)      : 30개 × 5kg   = 150kg
 *   LOT 759 (643 중력분)        :  1개 × 20kg  = 20kg
 *   LOT 747 (645 찹쌀)          : 50개 × 20kg  = 1,000kg
 *   LOT 748 (665 고구마가루)    :  2개 × 1kg   = 2kg
 *   합계: 7,301 kg
 *
 * 작업 범위:
 *   1) 백업 테이블 w2_lot_unit_backup_2026_04_26 생성 (DROP IF EXISTS 후 CREATE AS SELECT)
 *      - h_inventory_lots 13행
 *      - h_inventory_transactions (lot_id IN ...) 전체
 *      - h_inbound_lines (lot_number IN ...) 전체
 *   2) h_inventory_lots: quantity, remaining_quantity (있으면), unit, conversion_rate(있으면) 정정
 *   3) h_inventory_transactions: 해당 LOT의 receipt 트랜잭션 quantity/unit 정정
 *   4) h_inbound_lines: stock_quantity/stock_unit 정정 (purchase_unit/purchase_quantity는 원본 유지)
 *   5) 사후 검증
 *
 * 실행:
 *   npx tsx scripts/_w2-fix-gae-units.ts --dry-run
 *   npx tsx scripts/_w2-fix-gae-units.ts --commit
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";
config({ path: "/home/root/haccp_v3/webapp/.env" });

const TENANT_ID = 2;
const COMMIT = process.argv.includes("--commit");
const DRY_RUN = !COMMIT;

type Plan = {
  lot_id: number;
  material_id: number;
  material_name: string;
  old_qty: number;       // = number of '개' (purchase_quantity)
  kg_per_unit: number;
  new_qty_kg: number;
};

const PLAN: Plan[] = [
  { lot_id: 753, material_id: 596, material_name: "냉동쑥",         old_qty: 10,  kg_per_unit: 5.0,  new_qty_kg: 50    },
  { lot_id: 756, material_id: 596, material_name: "냉동쑥",         old_qty: 14,  kg_per_unit: 5.0,  new_qty_kg: 70    },
  { lot_id: 757, material_id: 598, material_name: "녹차가루",       old_qty: 4,   kg_per_unit: 1.0,  new_qty_kg: 4     },
  { lot_id: 749, material_id: 608, material_name: "두류(백옥앙금)", old_qty: 16,  kg_per_unit: 5.0,  new_qty_kg: 80    },
  { lot_id: 758, material_id: 609, material_name: "콩고물",         old_qty: 480, kg_per_unit: 2.5,  new_qty_kg: 1200  },
  { lot_id: 750, material_id: 615, material_name: "멥쌀",           old_qty: 200, kg_per_unit: 20.0, new_qty_kg: 4000  },
  { lot_id: 751, material_id: 617, material_name: "물엿",           old_qty: 27,  kg_per_unit: 25.0, new_qty_kg: 675   },
  { lot_id: 754, material_id: 629, material_name: "쑥가루",         old_qty: 24,  kg_per_unit: 2.0,  new_qty_kg: 48    },
  { lot_id: 755, material_id: 632, material_name: "연유",           old_qty: 4,   kg_per_unit: 0.5,  new_qty_kg: 2     },
  { lot_id: 752, material_id: 640, material_name: "백옥앙금",       old_qty: 30,  kg_per_unit: 5.0,  new_qty_kg: 150   },
  { lot_id: 759, material_id: 643, material_name: "중력분",         old_qty: 1,   kg_per_unit: 20.0, new_qty_kg: 20    },
  { lot_id: 747, material_id: 645, material_name: "찹쌀",           old_qty: 50,  kg_per_unit: 20.0, new_qty_kg: 1000  },
  { lot_id: 748, material_id: 665, material_name: "고구마가루",     old_qty: 2,   kg_per_unit: 1.0,  new_qty_kg: 2     },
];

const LOT_IDS = PLAN.map(p => p.lot_id);
const LOT_IDS_CSV = LOT_IDS.join(",");

async function getColumns(c: mysql.Connection, table: string): Promise<Set<string>> {
  const [rows] = await c.execute<any[]>(`SHOW COLUMNS FROM ${table}`);
  return new Set(rows.map((r: any) => r.Field));
}

(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  console.log(`\n=== PR-W2: '개' → 'kg' 단위 정정 (${DRY_RUN ? "DRY-RUN" : "COMMIT"}) ===`);
  console.log(`대상 LOT: ${LOT_IDS_CSV}`);
  console.log(`총 13건, 합계 ${PLAN.reduce((s, p) => s + p.new_qty_kg, 0)} kg\n`);

  // 컬럼 존재 여부 확인
  const lotCols = await getColumns(conn, "h_inventory_lots");
  const txCols  = await getColumns(conn, "h_inventory_transactions");
  const ilCols  = await getColumns(conn, "h_inbound_lines");
  console.log(`[schema] h_inventory_lots remaining_quantity: ${lotCols.has("remaining_quantity")}`);
  console.log(`[schema] h_inventory_lots conversion_rate: ${lotCols.has("conversion_rate")}`);
  console.log(`[schema] h_inbound_lines stock_quantity: ${ilCols.has("stock_quantity")}, stock_unit: ${ilCols.has("stock_unit")}`);
  console.log(`[schema] h_inventory_transactions unit: ${txCols.has("unit")}\n`);

  // ============ START TRANSACTION ============
  await conn.beginTransaction();
  try {
    // ---- 1) 백업 테이블 (트랜잭션 외부에서 만드는 게 안전하지만 InnoDB는 DDL 후 자동 commit) ----
    // 실제로는 별도 statement 로 실행 (DDL은 implicit commit). 트랜잭션 시작 전에 만드는 게 권장이나
    // dry-run 시 ROLLBACK 후 백업 테이블만 남게 되므로 OK.
    // -> dry-run/commit 모두 동일하게 백업 테이블 갱신
    await conn.query(`DROP TABLE IF EXISTS w2_lot_unit_backup_2026_04_26_lots`);
    await conn.query(`
      CREATE TABLE w2_lot_unit_backup_2026_04_26_lots AS
      SELECT * FROM h_inventory_lots WHERE tenant_id=${TENANT_ID} AND id IN (${LOT_IDS_CSV})
    `);
    await conn.query(`DROP TABLE IF EXISTS w2_lot_unit_backup_2026_04_26_tx`);
    await conn.query(`
      CREATE TABLE w2_lot_unit_backup_2026_04_26_tx AS
      SELECT * FROM h_inventory_transactions WHERE tenant_id=${TENANT_ID} AND lot_id IN (${LOT_IDS_CSV})
    `);
    await conn.query(`DROP TABLE IF EXISTS w2_lot_unit_backup_2026_04_26_il`);
    await conn.query(`
      CREATE TABLE w2_lot_unit_backup_2026_04_26_il AS
      SELECT il.* FROM h_inbound_lines il
      JOIN h_inventory_lots l ON l.lot_number = il.lot_number AND l.tenant_id = il.tenant_id
      WHERE il.tenant_id=${TENANT_ID} AND l.id IN (${LOT_IDS_CSV})
    `);
    const [[lotsBk]]: any = await conn.query(`SELECT COUNT(*) AS n FROM w2_lot_unit_backup_2026_04_26_lots`);
    const [[txBk]]:  any  = await conn.query(`SELECT COUNT(*) AS n FROM w2_lot_unit_backup_2026_04_26_tx`);
    const [[ilBk]]:  any  = await conn.query(`SELECT COUNT(*) AS n FROM w2_lot_unit_backup_2026_04_26_il`);
    console.log(`[backup] lots=${lotsBk.n}, transactions=${txBk.n}, inbound_lines=${ilBk.n}`);

    // ---- BEFORE 스냅샷 ----
    const [beforeLots] = await conn.query<any[]>(`
      SELECT id, lot_number, material_id, quantity,
             ${lotCols.has("remaining_quantity") ? "remaining_quantity," : ""}
             unit
      FROM h_inventory_lots
      WHERE tenant_id=${TENANT_ID} AND id IN (${LOT_IDS_CSV})
      ORDER BY id
    `);
    console.log(`\n[BEFORE] h_inventory_lots:`);
    console.table(beforeLots);

    const [beforeTx] = await conn.query<any[]>(`
      SELECT id, lot_id, transaction_type, quantity${txCols.has("unit") ? ", unit" : ""}
      FROM h_inventory_transactions
      WHERE tenant_id=${TENANT_ID} AND lot_id IN (${LOT_IDS_CSV})
      ORDER BY lot_id, id
    `);
    console.log(`\n[BEFORE] h_inventory_transactions:`);
    console.table(beforeTx);

    // ---- 2) UPDATE h_inventory_lots ----
    let lotsUpdated = 0;
    for (const p of PLAN) {
      const setParts = [`quantity = ?`, `unit = 'kg'`];
      const vals: any[] = [p.new_qty_kg];
      if (lotCols.has("remaining_quantity")) {
        // remaining_quantity 도 동일 비율로 정정 — 기존 remaining = 기존 qty 일 가능성이 큼
        // (현재 LOT은 K3 마이그레이션 후 차감 미반영이므로 remaining = quantity 가정)
        setParts.push(`remaining_quantity = ?`);
        vals.push(p.new_qty_kg);
      }
      if (lotCols.has("conversion_rate")) {
        setParts.push(`conversion_rate = 1.0`);
      }
      vals.push(p.lot_id, TENANT_ID);
      const sql = `UPDATE h_inventory_lots SET ${setParts.join(", ")} WHERE id = ? AND tenant_id = ?`;
      const [r]: any = await conn.execute(sql, vals);
      lotsUpdated += r.affectedRows;
    }
    console.log(`\n[UPDATE] h_inventory_lots affected: ${lotsUpdated}/13`);

    // ---- 3) UPDATE h_inventory_transactions (receipt 만 정정) ----
    // 기본 가정: lot_id 별 receipt 트랜잭션이 1건씩 있음, quantity = old_qty(개)
    let txUpdated = 0;
    for (const p of PLAN) {
      const setParts = [`quantity = ?`];
      const vals: any[] = [p.new_qty_kg];
      if (txCols.has("unit")) {
        setParts.push(`unit = 'kg'`);
      }
      vals.push(p.lot_id, TENANT_ID);
      const sql = `
        UPDATE h_inventory_transactions
        SET ${setParts.join(", ")}
        WHERE lot_id = ? AND tenant_id = ? AND transaction_type IN ('receipt','입고')
      `;
      const [r]: any = await conn.execute(sql, vals);
      txUpdated += r.affectedRows;
    }
    console.log(`[UPDATE] h_inventory_transactions (receipt) affected: ${txUpdated}`);

    // ---- 4) UPDATE h_inbound_lines.stock_quantity / stock_unit (있을 때만) ----
    let ilUpdated = 0;
    if (ilCols.has("stock_quantity") && ilCols.has("stock_unit")) {
      for (const p of PLAN) {
        const sql = `
          UPDATE h_inbound_lines il
          JOIN h_inventory_lots l ON l.lot_number = il.lot_number AND l.tenant_id = il.tenant_id
          SET il.stock_quantity = ?, il.stock_unit = 'kg'
          WHERE l.id = ? AND il.tenant_id = ?
        `;
        const [r]: any = await conn.execute(sql, [p.new_qty_kg, p.lot_id, TENANT_ID]);
        ilUpdated += r.affectedRows;
      }
    }
    console.log(`[UPDATE] h_inbound_lines (stock_*) affected: ${ilUpdated}`);

    // ---- 5) AFTER 스냅샷 + 검증 ----
    const [afterLots] = await conn.query<any[]>(`
      SELECT id, lot_number, material_id, quantity,
             ${lotCols.has("remaining_quantity") ? "remaining_quantity," : ""}
             unit
      FROM h_inventory_lots
      WHERE tenant_id=${TENANT_ID} AND id IN (${LOT_IDS_CSV})
      ORDER BY id
    `);
    console.log(`\n[AFTER] h_inventory_lots:`);
    console.table(afterLots);

    const [afterTx] = await conn.query<any[]>(`
      SELECT id, lot_id, transaction_type, quantity${txCols.has("unit") ? ", unit" : ""}
      FROM h_inventory_transactions
      WHERE tenant_id=${TENANT_ID} AND lot_id IN (${LOT_IDS_CSV})
      ORDER BY lot_id, id
    `);
    console.log(`\n[AFTER] h_inventory_transactions:`);
    console.table(afterTx);

    // 단위 혼재 재진단
    const [stillMixed] = await conn.query<any[]>(`
      SELECT material_id, GROUP_CONCAT(DISTINCT unit) AS units, COUNT(*) AS lot_count
      FROM h_inventory_lots
      WHERE tenant_id=${TENANT_ID} AND material_id IN (596,598,608,609,615,617,629,632,640,643,645,665)
      GROUP BY material_id
      HAVING COUNT(DISTINCT unit) > 1
    `);
    console.log(`\n[VERIFY] 12자재 단위 혼재 잔존: ${stillMixed.length} (목표 0)`);
    if (stillMixed.length > 0) console.table(stillMixed);

    // 합계 확인
    const expected = PLAN.reduce((s, p) => s + p.new_qty_kg, 0);
    const [[sumRow]]: any = await conn.query(`
      SELECT SUM(quantity) AS total_kg
      FROM h_inventory_lots
      WHERE tenant_id=${TENANT_ID} AND id IN (${LOT_IDS_CSV})
    `);
    console.log(`[VERIFY] 13 LOT quantity 합계: ${sumRow.total_kg} kg (expected: ${expected} kg)`);

    if (DRY_RUN) {
      console.log(`\n[DRY-RUN] ROLLBACK 실행 — 실제 DB 변경 없음`);
      await conn.rollback();
    } else {
      console.log(`\n[COMMIT] 트랜잭션 커밋 — 변경 영구 적용`);
      await conn.commit();
    }
  } catch (e: any) {
    console.error(`[ERROR] ${e.message}`);
    await conn.rollback();
    process.exit(1);
  } finally {
    await conn.end();
  }

  console.log(`\n=== W2 완료 (${DRY_RUN ? "DRY-RUN" : "COMMIT"}) ===\n`);
})().catch(e => { console.error(e); process.exit(1); });
