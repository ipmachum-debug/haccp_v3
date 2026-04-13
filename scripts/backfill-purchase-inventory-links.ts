/**
 * 매입 확정 → 재고관리/육안검사 연동 복구 백필 스크립트
 * ═══════════════════════════════════════════════════════════════
 * 배경:
 *   기존 `purchasePost()` 가 h_inventory_lots 에 material_id 를 채우지 않아
 *   재고관리 입고내역 INNER JOIN 에서 필터링되고, 육안검사일지 sync 에서도
 *   `material_id IS NOT NULL` 조건으로 제외되었음.
 *
 * 수행 작업:
 *   1. h_inventory_lots 중 material_id 가 NULL 이고 reference 가 accounting_purchases 인 건 조회
 *   2. h_inventory_transactions 의 source_id 를 통해 accounting_purchases 연결
 *   3. accounting_purchases.item_name 으로 h_materials 에서 정확 일치 → LIKE 폴백으로 material_id 해결
 *   4. h_inventory_lots.material_id 업데이트
 *   5. 동시에 h_inventory_lots.supplier_name 도 partner 조회하여 채움
 *   6. 추가로 h_inbound_headers/h_inbound_lines 신규 생성 (매입당 1건)
 *   7. material_ledger_daily.receiving_qty 반영 (중복 INSERT 방지)
 *
 * 실행:
 *   npx tsx scripts/backfill-purchase-inventory-links.ts
 *
 * Dry run (변경 없음):
 *   DRY_RUN=1 npx tsx scripts/backfill-purchase-inventory-links.ts
 * ═══════════════════════════════════════════════════════════════
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

const DRY_RUN = process.env.DRY_RUN === "1";

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "haccp_tenant_db",
  });

  console.log(`🔗 DB 연결 완료 ${DRY_RUN ? "(DRY RUN)" : ""}`);

  try {
    // ─── Step 1: 대상 조회 ───
    // accounting_purchases 가 paid 상태이고, 연결된 LOT 의 material_id 가 NULL 인 건
    console.log("\n📋 Step 1: 대상 조회 (material_id NULL LOT + accounting_purchase 연결)");
    const [targets]: any = await conn.execute(`
      SELECT DISTINCT
        lot.id AS lot_id,
        lot.tenant_id,
        lot.lot_number,
        lot.material_id AS lot_material_id,
        lot.supplier_name AS lot_supplier,
        tx.source_id AS purchase_id,
        p.item_name,
        p.transaction_date,
        p.quantity AS purchase_qty,
        p.unit AS purchase_unit,
        p.unit_price,
        p.total_amount,
        p.partner_id,
        prt.name AS partner_name
      FROM h_inventory_lots lot
      INNER JOIN h_inventory_transactions tx
        ON tx.lot_id = lot.id AND tx.reference_type = 'PURCHASE'
      INNER JOIN accounting_purchases p
        ON p.id = tx.source_id AND p.tenant_id = lot.tenant_id
      LEFT JOIN partners prt
        ON prt.id = p.partner_id AND prt.tenant_id = lot.tenant_id
      WHERE lot.material_id IS NULL
      ORDER BY p.transaction_date DESC, lot.id DESC
    `);
    const rows: any[] = targets;
    console.log(`  → ${rows.length} 건 발견`);

    if (rows.length === 0) {
      console.log("\n🎉 백필할 데이터가 없습니다. (이미 모두 정상)");
      return;
    }

    // 샘플 출력
    console.log("\n샘플 (최대 10건):");
    rows.slice(0, 10).forEach((r: any, i: number) => {
      console.log(
        `  ${i + 1}. LOT#${r.lot_id} (${r.lot_number}) | purchase#${r.purchase_id} | ` +
          `item="${r.item_name}" | qty=${r.purchase_qty} ${r.purchase_unit} | ` +
          `partner=${r.partner_name || "-"}`,
      );
    });

    // ─── Step 2: material_id 해결 ───
    console.log("\n📋 Step 2: h_materials 에서 material_id 해결");
    let resolvedCount = 0;
    let unresolvedCount = 0;
    const resolvedMap = new Map<number, number>(); // lot_id → material_id

    for (const r of rows) {
      const itemName = String(r.item_name || "").trim();
      if (!itemName) {
        unresolvedCount++;
        continue;
      }
      const [matRows]: any = await conn.execute(
        `SELECT id FROM h_materials
         WHERE tenant_id = ? AND is_active = 1
           AND (material_name = ? OR material_name LIKE ?)
         ORDER BY (material_name = ?) DESC, id ASC
         LIMIT 1`,
        [r.tenant_id, itemName, `%${itemName}%`, itemName],
      );
      const matArr: any[] = matRows;
      if (matArr[0]?.id) {
        resolvedMap.set(Number(r.lot_id), Number(matArr[0].id));
        resolvedCount++;
      } else {
        unresolvedCount++;
      }
    }
    console.log(`  ✓ 해결: ${resolvedCount} 건`);
    console.log(`  ✗ 미해결: ${unresolvedCount} 건 (h_materials 에 매칭되는 원재료 없음)`);

    if (unresolvedCount > 0) {
      console.log("\n  미해결 item_name 목록 (최대 20):");
      const unresolvedNames = new Set<string>();
      rows.forEach((r: any) => {
        if (!resolvedMap.has(Number(r.lot_id)) && r.item_name) {
          unresolvedNames.add(r.item_name);
        }
      });
      Array.from(unresolvedNames)
        .slice(0, 20)
        .forEach((n) => console.log(`    - ${n}`));
    }

    if (DRY_RUN) {
      console.log("\n⚠️  DRY RUN 모드 — 실제 변경 없음. 종료.");
      return;
    }

    // ─── Step 3: h_inventory_lots.material_id 업데이트 ───
    console.log("\n📋 Step 3: h_inventory_lots.material_id UPDATE");
    let updatedLots = 0;
    for (const r of rows) {
      const matId = resolvedMap.get(Number(r.lot_id));
      if (!matId) continue;
      const supplierName = r.partner_name || r.lot_supplier || null;
      await conn.execute(
        `UPDATE h_inventory_lots
         SET material_id = ?,
             supplier_name = COALESCE(supplier_name, ?)
         WHERE id = ? AND tenant_id = ?`,
        [matId, supplierName, r.lot_id, r.tenant_id],
      );
      updatedLots++;
    }
    console.log(`  ✓ ${updatedLots} 건 LOT 업데이트 완료`);

    // ─── Step 4: h_inbound_headers / h_inbound_lines 생성 ───
    console.log("\n📋 Step 4: 입고전표(h_inbound_headers/lines) 신규 생성");
    let createdHeaders = 0;
    let skippedHeaders = 0;
    for (const r of rows) {
      const matId = resolvedMap.get(Number(r.lot_id));
      if (!matId) continue;

      // 이미 존재하는지 확인 (inbound_number 기준)
      const inboundNumber = `INB-PURCHASE-${r.purchase_id}`;
      const [existing]: any = await conn.execute(
        `SELECT id FROM h_inbound_headers
         WHERE tenant_id = ? AND inbound_number = ?`,
        [r.tenant_id, inboundNumber],
      );
      if ((existing as any[]).length > 0) {
        skippedHeaders++;
        continue;
      }

      const [ibhResult]: any = await conn.execute(
        `INSERT INTO h_inbound_headers
           (tenant_id, inbound_number, site_id, supplier_id, inbound_date, status,
            confirmed_at, confirmed_by, notes, created_by, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, 'confirmed', NOW(), 1, ?, 1, NOW(), NOW())`,
        [
          r.tenant_id,
          inboundNumber,
          r.partner_id || null,
          r.transaction_date,
          `[백필] 매입 확정 자동 복구 (PURCHASE-${r.purchase_id}): ${r.item_name}`,
        ],
      );
      const headerId = (ibhResult as any).insertId;

      await conn.execute(
        `INSERT INTO h_inbound_lines
           (tenant_id, header_id, line_number, material_id,
            purchase_quantity, purchase_unit, stock_quantity, stock_unit,
            unit_price, total_price, lot_number, notes, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          r.tenant_id,
          headerId,
          matId,
          r.purchase_qty,
          r.purchase_unit || "EA",
          r.purchase_qty,
          r.purchase_unit || "EA",
          r.unit_price || "0",
          r.total_amount || "0",
          r.lot_number,
          `[백필] ${r.item_name}`,
        ],
      );
      createdHeaders++;
    }
    console.log(`  ✓ ${createdHeaders} 건 입고전표 생성, ${skippedHeaders} 건 기존 존재 skip`);

    // ─── Step 5: material_ledger_daily 반영 ───
    console.log("\n📋 Step 5: material_ledger_daily.receiving_qty 반영");
    let ledgerUpdates = 0;
    for (const r of rows) {
      const matId = resolvedMap.get(Number(r.lot_id));
      if (!matId) continue;
      try {
        await conn.execute(
          `INSERT INTO material_ledger_daily
             (tenant_id, material_id, ledger_date, receiving_qty, source, notes)
           VALUES (?, ?, ?, ?, 'backfill_purchase', ?)
           ON DUPLICATE KEY UPDATE
             receiving_qty = receiving_qty + VALUES(receiving_qty),
             updated_at = NOW()`,
          [
            r.tenant_id,
            matId,
            r.transaction_date,
            r.purchase_qty,
            `[백필] PURCHASE-${r.purchase_id}`,
          ],
        );
        ledgerUpdates++;
      } catch (e: any) {
        // UNIQUE key 없으면 그냥 INSERT (중복 가능)
        if (String(e.message || "").includes("no such table") || String(e.message || "").includes("Duplicate")) {
          /* ignore */
        } else {
          console.error(`  ⚠️  material_ledger_daily 반영 실패 (lot#${r.lot_id}):`, e.message);
        }
      }
    }
    console.log(`  ✓ ${ledgerUpdates} 건 수불 반영`);

    // ─── 결과 요약 ───
    console.log("\n═══════════════════════════════════════════");
    console.log("🎉 백필 완료!");
    console.log("═══════════════════════════════════════════");
    console.log(`  대상 LOT:          ${rows.length}`);
    console.log(`  material_id 해결:  ${resolvedCount}`);
    console.log(`  LOT 업데이트:       ${updatedLots}`);
    console.log(`  입고전표 생성:      ${createdHeaders}`);
    console.log(`  수불 반영:          ${ledgerUpdates}`);
    console.log(`  미해결 (수동 필요): ${unresolvedCount}`);
    console.log("═══════════════════════════════════════════");

    if (unresolvedCount > 0) {
      console.log("\n⚠️  미해결 item_name 들은 h_materials 에 추가한 후 다시 실행하세요.");
    }

    console.log("\n다음 단계:");
    console.log("  1. 브라우저에서 재고관리 → 입고 내역 확인 (4월 데이터 표시 여부)");
    console.log("  2. 검사관리 → 육안검사일지 → '동기화' 버튼 클릭");
    console.log("  3. 원료수불부 → 당월 총 입고량 재확인");
  } catch (err) {
    console.error("\n❌ 백필 실패:", err);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
