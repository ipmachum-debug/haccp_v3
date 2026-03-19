/**
 * 생산 기록 시드 스크립트 - production_records.json.txt → 배치 + 원료투입 + 완제품재고
 *
 * 워크플로우:
 * 1. 제품(h_products_v2) 누락 시 자동 생성
 * 2. 원재료(h_materials) 누락 시 자동 생성
 * 3. 배치(h_batches) 생성 + 원료투입(h_batch_inputs) 생성
 * 4. 배치 완료 처리 (status='completed', actualQuantity 설정)
 * 5. 원료 수불부(material_ledger_daily) 반영
 * 6. 완제품 재고 LOT(h_inventory_lots) 생성
 *
 * 사용법: npx tsx scripts/seed-production-records.ts [--dry-run] [--tenant-id=1]
 */

// .env 파일 로드
try { require("dotenv/config"); } catch { /* dotenv not available */ }
if (!process.env.DATABASE_URL) {
  try {
    const fs = require("fs");
    const path = require("path");
    const envPath = path.resolve(__dirname, "../.env");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      for (const line of envContent.split("\n")) {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {}
}

import * as fs from "fs";
import * as path from "path";

interface ProductionRecord {
  date: string;
  product: string;
  quantityKg: number;
  materialsUsed: Record<string, number> | null;
}

// CLI 인자 파싱
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const TENANT_ID = parseInt(args.find(a => a.startsWith("--tenant-id="))?.split("=")[1] || "2", 10);
const SITE_ID = 1;
const CREATED_BY = 1;

async function main() {
  const { getDb, getRawConnection } = await import("../server/db");
  const { sql } = await import("drizzle-orm");

  const db = await getDb();
  if (!db) {
    console.error("❌ DB 연결 실패");
    process.exit(1);
  }

  const pool = await getRawConnection();

  console.log(`\n🏭 생산기록 시드 시작 (tenant=${TENANT_ID}, dry-run=${DRY_RUN})\n`);

  // ── 1. JSON 데이터 로드 ──
  const jsonPath = path.resolve(__dirname, "../production_records.json.txt");
  if (!fs.existsSync(jsonPath)) {
    // git에서 가져오기 시도
    console.error(`❌ 파일 없음: ${jsonPath}`);
    console.error("   genspark_ai_developer 브랜치에서 production_records.json.txt를 체크아웃하세요");
    process.exit(1);
  }
  const records: ProductionRecord[] = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  console.log(`📄 ${records.length}건 로드 완료\n`);

  // ── 2. 기존 제품/원재료 캐시 ──
  const [existingProducts] = await pool.execute(
    "SELECT id, product_name FROM h_products_v2 WHERE tenant_id = ?",
    [TENANT_ID]
  );
  const productMap = new Map<string, number>();
  for (const p of existingProducts as any[]) {
    productMap.set(p.product_name, Number(p.id));
  }

  const [existingMaterials] = await pool.execute(
    "SELECT id, material_name FROM h_materials WHERE tenant_id = ?",
    [TENANT_ID]
  );
  const materialMap = new Map<string, number>();
  for (const m of existingMaterials as any[]) {
    materialMap.set(m.material_name, Number(m.id));
  }

  console.log(`📦 기존 제품: ${productMap.size}건, 원재료: ${materialMap.size}건\n`);

  // ── 3. 누락 제품 자동 생성 ──
  const uniqueProducts = [...new Set(records.map(r => r.product))];
  let newProductCount = 0;
  for (const name of uniqueProducts) {
    if (productMap.has(name)) continue;
    if (DRY_RUN) {
      console.log(`  [DRY] 제품 생성: ${name}`);
      productMap.set(name, -1);
      newProductCount++;
      continue;
    }
    const code = `PROD-${String(productMap.size + newProductCount + 1).padStart(3, "0")}`;
    const [result] = await pool.execute(
      `INSERT INTO h_products_v2 (tenant_id, product_code, product_name, unit, is_active, category)
       VALUES (?, ?, ?, 'kg', 1, '떡류')`,
      [TENANT_ID, code, name]
    );
    const id = Number((result as any).insertId);
    productMap.set(name, id);
    newProductCount++;
  }
  if (newProductCount > 0) console.log(`✅ 제품 ${newProductCount}건 ${DRY_RUN ? '생성 예정' : '생성 완료'}\n`);

  // ── 4. 누락 원재료 자동 생성 ──
  const allMaterialNames = new Set<string>();
  for (const r of records) {
    if (r.materialsUsed) {
      for (const name of Object.keys(r.materialsUsed)) {
        allMaterialNames.add(name);
      }
    }
  }

  let newMaterialCount = 0;
  for (const name of allMaterialNames) {
    if (materialMap.has(name)) continue;
    if (DRY_RUN) {
      console.log(`  [DRY] 원재료 생성: ${name}`);
      materialMap.set(name, -1);
      newMaterialCount++;
      continue;
    }
    const code = `MAT-${String(materialMap.size + newMaterialCount + 1).padStart(4, "0")}`;
    const [result] = await pool.execute(
      `INSERT INTO h_materials (tenant_id, material_code, material_name, kind, unit, is_active)
       VALUES (?, ?, ?, 'RAW', 'kg', 1)`,
      [TENANT_ID, code, name]
    );
    const id = Number((result as any).insertId);
    materialMap.set(name, id);
    newMaterialCount++;
  }
  if (newMaterialCount > 0) console.log(`✅ 원재료 ${newMaterialCount}건 ${DRY_RUN ? '생성 예정' : '생성 완료'}\n`);

  if (DRY_RUN) {
    console.log(`\n🔍 DRY-RUN 모드: 실제 배치 생성 없이 종료합니다.`);
    console.log(`   제품 ${uniqueProducts.length}종 (신규 ${newProductCount}), 원재료 ${allMaterialNames.size}종 (신규 ${newMaterialCount})`);
    console.log(`   배치 ${records.length}건 생성 예정\n`);
    process.exit(0);
  }

  // ── 5. 날짜별 배치 일련번호 카운터 ──
  const dateSeqMap = new Map<string, number>();

  // ── 6. 배치 생성 + 원료투입 + 완료 처리 ──
  let batchCount = 0;
  let inputCount = 0;
  let lotCount = 0;
  let ledgerCount = 0;
  const errors: string[] = [];

  // 날짜순 정렬
  records.sort((a, b) => a.date.localeCompare(b.date) || a.product.localeCompare(b.product));

  for (const record of records) {
    try {
      const productId = productMap.get(record.product);
      if (!productId) {
        errors.push(`제품 미매핑: ${record.product}`);
        continue;
      }

      // 배치코드 생성: YYYYMMDD-SEQ
      const dateKey = record.date.replace(/-/g, "");
      const seq = (dateSeqMap.get(record.date) || 0) + 1;
      dateSeqMap.set(record.date, seq);
      const batchCode = `${dateKey}-${String(seq).padStart(3, "0")}`;

      // 중복 체크
      const [existBatch] = await pool.execute(
        "SELECT id FROM h_batches WHERE batch_code = ? AND tenant_id = ? LIMIT 1",
        [batchCode, TENANT_ID]
      );
      if ((existBatch as any[]).length > 0) {
        continue; // 이미 존재하면 skip
      }

      // 배치 생성 (status='completed')
      const [batchResult] = await pool.execute(
        `INSERT INTO h_batches
         (tenant_id, site_id, batch_code, product_id, planned_quantity, actual_quantity,
          planned_date, status, mode, created_by, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', 'auto', ?, NOW())`,
        [
          TENANT_ID, SITE_ID, batchCode, productId,
          record.quantityKg.toFixed(2), record.quantityKg.toFixed(2),
          record.date, CREATED_BY
        ]
      );
      const batchId = Number((batchResult as any).insertId);
      batchCount++;

      // 원료 투입 (h_batch_inputs) + 수불부 반영
      if (record.materialsUsed) {
        for (const [matName, qty] of Object.entries(record.materialsUsed)) {
          const materialId = materialMap.get(matName);
          if (!materialId) {
            errors.push(`원재료 미매핑: ${matName}`);
            continue;
          }

          // h_batch_inputs 생성
          await pool.execute(
            `INSERT INTO h_batch_inputs
             (tenant_id, batch_id, material_id, planned_quantity, actual_quantity, unit, inventory_deducted)
             VALUES (?, ?, ?, ?, ?, 'kg', 1)`,
            [TENANT_ID, batchId, materialId, qty.toFixed(3), qty.toFixed(3)]
          );
          inputCount++;

          // 수불부(material_ledger_daily) 반영
          try {
            await pool.execute(
              `INSERT INTO material_ledger_daily
               (tenant_id, material_id, ledger_date, usage_qty, notes, source)
               VALUES (?, ?, ?, ?, ?, 'seed')
               ON DUPLICATE KEY UPDATE
                 usage_qty = usage_qty + VALUES(usage_qty),
                 notes = CONCAT(COALESCE(notes, ''), ', ', VALUES(notes))`,
              [TENANT_ID, materialId, record.date, qty.toFixed(3), `시드-배치#${batchId}`]
            );
            ledgerCount++;
          } catch (ledgerErr: any) {
            // material_ledger_daily 테이블이 없을 수 있음
            if (!ledgerErr.message?.includes("doesn't exist")) {
              errors.push(`수불부 오류: ${matName} - ${ledgerErr.message}`);
            }
          }
        }
      }

      // 완제품 재고 LOT 생성
      try {
        const lotNumber = `PROD-${batchCode}`;
        const [existLot] = await pool.execute(
          "SELECT id FROM h_inventory_lots WHERE lot_number = ? AND tenant_id = ? LIMIT 1",
          [lotNumber, TENANT_ID]
        );
        if ((existLot as any[]).length === 0) {
          await pool.execute(
            `INSERT INTO h_inventory_lots
             (tenant_id, lot_number, batch_id, product_id, quantity, current_quantity,
              available_quantity, unit, production_date, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'kg', ?, 'available')`,
            [
              TENANT_ID, lotNumber, batchId, productId,
              record.quantityKg.toFixed(3), record.quantityKg.toFixed(3),
              record.quantityKg.toFixed(3), record.date
            ]
          );
          lotCount++;
        }
      } catch (lotErr: any) {
        errors.push(`LOT 생성 오류: ${batchCode} - ${lotErr.message}`);
      }

      // 진행 상황 출력 (50건마다)
      if (batchCount % 50 === 0) {
        console.log(`  ... ${batchCount}/${records.length}건 처리 중`);
      }

    } catch (err: any) {
      errors.push(`배치 생성 오류 (${record.date} ${record.product}): ${err.message}`);
    }
  }

  // ── 7. 결과 요약 ──
  console.log(`\n${"═".repeat(50)}`);
  console.log(`🏭 생산기록 시드 완료`);
  console.log(`${"═".repeat(50)}`);
  console.log(`  배치 생성:     ${batchCount}건`);
  console.log(`  원료 투입:     ${inputCount}건`);
  console.log(`  완제품 LOT:    ${lotCount}건`);
  console.log(`  수불부 반영:   ${ledgerCount}건`);
  console.log(`  제품(신규):    ${newProductCount}건`);
  console.log(`  원재료(신규):  ${newMaterialCount}건`);

  if (errors.length > 0) {
    console.log(`\n⚠️ 에러 ${errors.length}건:`);
    // 중복 제거 후 출력
    const uniqueErrors = [...new Set(errors)];
    for (const e of uniqueErrors.slice(0, 20)) {
      console.log(`  - ${e}`);
    }
    if (uniqueErrors.length > 20) {
      console.log(`  ... 외 ${uniqueErrors.length - 20}건`);
    }
  }

  console.log(`\n✅ 완료\n`);
  process.exit(0);
}

main().catch(err => {
  console.error("❌ 치명적 오류:", err);
  process.exit(1);
});
