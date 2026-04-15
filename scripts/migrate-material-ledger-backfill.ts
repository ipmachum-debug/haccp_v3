/**
 * material_ledger_daily 테이블 수정 + 기존 배치 데이터 백필 (backfill)
 *
 * 수행 작업:
 *   1. material_ledger_daily 에 UNIQUE 제약 추가 (tenant_id, material_id, ledger_date)
 *      → ON DUPLICATE KEY UPDATE 가 정상 동작하도록
 *   2. 기존 h_inbound_lines(confirmed) → material_ledger_daily.receiving_qty 백필
 *   3. 기존 h_batch_inputs(in_progress/completed/approved) → material_ledger_daily.usage_qty 백필
 *
 * 실행:
 *   npx tsx scripts/migrate-material-ledger-backfill.ts
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "haccp_v3",
    multipleStatements: true,
  });

  console.log("🔗 DB 연결 완료");

  try {
    // ─── 1. UNIQUE 제약 추가 ───
    console.log("\n📋 1/3 material_ledger_daily UNIQUE 제약 추가...");
    try {
      // 기존 중복 데이터 먼저 합치기 (UNIQUE 추가 시 충돌 방지)
      await connection.execute(`
        CREATE TEMPORARY TABLE mld_dedup AS
        SELECT tenant_id, material_id, ledger_date,
               SUM(receiving_qty) as receiving_qty,
               SUM(usage_qty) as usage_qty,
               SUM(adjustment_qty) as adjustment_qty,
               MAX(running_stock) as running_stock,
               MAX(source) as source,
               MAX(id) as keep_id
        FROM material_ledger_daily
        GROUP BY tenant_id, material_id, ledger_date
      `);
      const [dupRows]: any = await connection.execute(
        `SELECT COUNT(*) as dup_count FROM (
           SELECT tenant_id, material_id, ledger_date FROM material_ledger_daily
           GROUP BY tenant_id, material_id, ledger_date
           HAVING COUNT(*) > 1
         ) d`,
      );
      const dupCount = Number((dupRows as any[])[0]?.dup_count || 0);
      if (dupCount > 0) {
        console.log(`  ⚠️  중복 행 ${dupCount}건 발견 → 합쳐서 정리 중...`);
        // 중복 중 가장 최신 id 만 남기고 값 갱신
        await connection.execute(`
          UPDATE material_ledger_daily mld
          INNER JOIN mld_dedup d
            ON mld.id = d.keep_id
          SET mld.receiving_qty = d.receiving_qty,
              mld.usage_qty = d.usage_qty,
              mld.adjustment_qty = d.adjustment_qty
        `);
        await connection.execute(`
          DELETE mld FROM material_ledger_daily mld
          INNER JOIN mld_dedup d
            ON mld.tenant_id = d.tenant_id AND mld.material_id = d.material_id AND mld.ledger_date = d.ledger_date
          WHERE mld.id <> d.keep_id
        `);
      }
      await connection.execute(`DROP TEMPORARY TABLE IF EXISTS mld_dedup`);

      // UNIQUE 제약 추가 (이미 존재하면 에러 → 무시)
      try {
        await connection.execute(`
          ALTER TABLE material_ledger_daily
          ADD UNIQUE KEY uq_mld_tenant_material_date (tenant_id, material_id, ledger_date)
        `);
        console.log("  ✅ UNIQUE 제약 추가 완료");
      } catch (e: any) {
        if (String(e.message || "").includes("Duplicate")) {
          console.log("  ℹ️  이미 존재함 (skip)");
        } else {
          throw e;
        }
      }
    } catch (err: any) {
      console.error("  ❌ 단계 1 실패:", err.message);
    }

    // ─── 2. 입고 백필 (h_inbound_lines → material_ledger_daily.receiving_qty) ───
    console.log("\n📋 2/3 입고 백필 (h_inbound_lines → material_ledger_daily)...");
    try {
      const [inbResult]: any = await connection.execute(`
        INSERT INTO material_ledger_daily
          (tenant_id, material_id, ledger_date, receiving_qty, source, notes, created_at, updated_at)
        SELECT
          l.tenant_id,
          l.material_id,
          DATE_FORMAT(h.inbound_date, '%Y-%m-%d') as ledger_date,
          SUM(l.stock_quantity) as receiving_qty,
          'backfill_inbound' as source,
          '백필: h_inbound_lines' as notes,
          NOW(),
          NOW()
        FROM h_inbound_lines l
        JOIN h_inbound_headers h ON h.id = l.header_id AND h.tenant_id = l.tenant_id
        WHERE h.status = 'confirmed'
        GROUP BY l.tenant_id, l.material_id, DATE_FORMAT(h.inbound_date, '%Y-%m-%d')
        ON DUPLICATE KEY UPDATE
          receiving_qty = GREATEST(material_ledger_daily.receiving_qty, VALUES(receiving_qty)),
          updated_at = NOW()
      `);
      console.log(`  ✅ 입고 백필 완료: ${(inbResult as any).affectedRows || 0} 행`);
    } catch (err: any) {
      console.error("  ❌ 단계 2 실패:", err.message);
    }

    // ─── 3. 사용 백필 (h_batch_inputs → material_ledger_daily.usage_qty) ───
    console.log("\n📋 3/3 사용 백필 (h_batch_inputs → material_ledger_daily)...");
    try {
      const [usageResult]: any = await connection.execute(`
        INSERT INTO material_ledger_daily
          (tenant_id, material_id, ledger_date, usage_qty, source, notes, created_at, updated_at)
        SELECT
          bi.tenant_id,
          bi.material_id,
          DATE_FORMAT(b.planned_date, '%Y-%m-%d') as ledger_date,
          SUM(COALESCE(bi.actual_quantity, bi.planned_quantity, 0)) as usage_qty,
          'backfill_batch' as source,
          '백필: h_batch_inputs' as notes,
          NOW(),
          NOW()
        FROM h_batch_inputs bi
        JOIN h_batches b ON b.id = bi.batch_id AND b.tenant_id = bi.tenant_id
        WHERE b.status IN ('in_progress','completed','approved','shipped','archived')
        GROUP BY bi.tenant_id, bi.material_id, DATE_FORMAT(b.planned_date, '%Y-%m-%d')
        ON DUPLICATE KEY UPDATE
          usage_qty = GREATEST(material_ledger_daily.usage_qty, VALUES(usage_qty)),
          updated_at = NOW()
      `);
      console.log(`  ✅ 사용 백필 완료: ${(usageResult as any).affectedRows || 0} 행`);
    } catch (err: any) {
      console.error("  ❌ 단계 3 실패:", err.message);
    }

    console.log("\n🎉 마이그레이션 + 백필 완료!");
  } catch (err) {
    console.error("❌ 마이그레이션 실패:", err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

migrate();
