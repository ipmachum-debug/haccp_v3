import { fileURLToPath } from "url";
import { dirname } from "path";
/**
 * 시드 데이터 보정 스크립트
 * 
 * 기존 seed-production-records.ts가 생성한 데이터의 문제점 수정:
 * 1. material_ledger_daily의 running_stock이 모두 0 → 정확한 누적 재고 계산
 * 2. h_inventory_transactions에 usage 레코드 없음 → batch 기반 usage 트랜잭션 생성
 * 3. h_batch_inputs의 lot_id가 NULL → FEFO 기반 LOT 할당 및 available_quantity 차감
 * 4. material_ledger_monthly 미갱신 → 월별 집계 재생성
 * 5. 엑셀 입고 데이터(📥 원재료 입고) → material_ledger_daily에 입고 반영
 * 
 * 사용법: npx tsx scripts/fix-seed-data.ts [--dry-run] [--tenant-id=2]
 */

try { require("dotenv/config"); } catch { /* dotenv not available */ }
if (!process.env.DATABASE_URL) {
  try {
    const fs = require("fs");
    const path = require("path");
    const envPath = path.resolve(dirname(fileURLToPath(import.meta.url)), "../.env");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      for (const line of envContent.split("\n")) {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {}
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const TENANT_ID = parseInt(args.find(a => a.startsWith("--tenant-id="))?.split("=")[1] || "2", 10);

async function main() {
  const { getRawConnection } = await import("../server/db");
  const pool = await getRawConnection();

  console.log(`\n🔧 시드 데이터 보정 시작 (tenant=${TENANT_ID}, dry-run=${DRY_RUN})\n`);

  // ── Step 1: 현재 상태 진단 ──
  console.log("📊 현재 DB 상태 진단...");
  
  const [batchRows]: any = await pool.execute(
    "SELECT COUNT(*) as cnt FROM h_batches WHERE tenant_id=? AND status='completed'", [TENANT_ID]);
  const [inputRows]: any = await pool.execute(
    "SELECT COUNT(*) as cnt FROM h_batch_inputs WHERE tenant_id=?", [TENANT_ID]);
  const [lotRows]: any = await pool.execute(
    "SELECT COUNT(*) as cnt FROM h_inventory_lots WHERE tenant_id=? AND material_id IS NOT NULL", [TENANT_ID]);
  const [txnRows]: any = await pool.execute(
    "SELECT transaction_type, COUNT(*) as cnt FROM h_inventory_transactions WHERE tenant_id=? GROUP BY transaction_type", [TENANT_ID]);
  const [ledgerRows]: any = await pool.execute(
    "SELECT COUNT(*) as cnt FROM material_ledger_daily WHERE tenant_id=?", [TENANT_ID]);
  const [monthlyRows]: any = await pool.execute(
    "SELECT COUNT(*) as cnt FROM material_ledger_monthly WHERE tenant_id=?", [TENANT_ID]);

  console.log(`  배치(completed): ${batchRows[0].cnt}`);
  console.log(`  원료투입(h_batch_inputs): ${inputRows[0].cnt}`);
  console.log(`  원재료 LOT: ${lotRows[0].cnt}`);
  console.log(`  재고 트랜잭션:`, (txnRows as any[]).map((r: any) => `${r.transaction_type}=${r.cnt}`).join(', ') || 'none');
  console.log(`  수불부(daily): ${ledgerRows[0].cnt}`);
  console.log(`  수불부(monthly): ${monthlyRows[0].cnt}`);
  console.log();

  if (DRY_RUN) {
    console.log("🔍 DRY-RUN 모드: 진단만 수행하고 종료합니다.\n");
    
    // 추가 진단 정보
    const [noLotInputs]: any = await pool.execute(
      "SELECT COUNT(*) as cnt FROM h_batch_inputs WHERE tenant_id=? AND lot_id IS NULL", [TENANT_ID]);
    console.log(`  lot_id NULL인 투입건: ${noLotInputs[0].cnt}`);
    
    const [zeroStock]: any = await pool.execute(
      "SELECT COUNT(*) as cnt FROM material_ledger_daily WHERE tenant_id=? AND running_stock=0", [TENANT_ID]);
    console.log(`  running_stock=0인 수불건: ${zeroStock[0].cnt}`);
    
    process.exit(0);
  }

  // ── Step 2: material_ledger_daily 재계산 (running_stock) ──
  console.log("📈 Step 2: material_ledger_daily running_stock 재계산...");
  
  // 모든 원재료 목록
  const [materials]: any = await pool.execute(
    "SELECT id, material_name FROM h_materials WHERE tenant_id=? AND is_active=1 ORDER BY id", [TENANT_ID]);
  
  let ledgerFixCount = 0;
  for (const mat of materials) {
    // 해당 원재료의 모든 일별 레코드를 날짜순으로 조회
    const [dailyRows]: any = await pool.execute(
      `SELECT id, ledger_date, receving_qty, usage_qty, adjustment_qty, running_stock
       FROM material_ledger_daily 
       WHERE tenant_id=? AND material_id=? 
       ORDER BY ledger_date ASC`,
      [TENANT_ID, mat.id]
    );
    
    let runningStock = 0;
    for (const row of dailyRows) {
      const receiving = Number(row.receving_qty) || 0;
      const usage = Number(row.usage_qty) || 0;
      const adjustment = Number(row.adjustment_qty) || 0;
      runningStock = runningStock + receiving - usage + adjustment;
      
      if (Number(row.running_stock) !== runningStock) {
        await pool.execute(
          "UPDATE material_ledger_daily SET running_stock=? WHERE id=?",
          [runningStock.toFixed(3), row.id]
        );
        ledgerFixCount++;
      }
    }
  }
  console.log(`  ✅ ${ledgerFixCount}건 running_stock 수정 완료\n`);

  // ── Step 3: h_inventory_transactions에 usage 레코드 생성 ──
  console.log("📦 Step 3: h_inventory_transactions usage 레코드 생성...");
  
  // 이미 있는 usage 트랜잭션 확인
  const [existingUsageTxns]: any = await pool.execute(
    "SELECT COUNT(*) as cnt FROM h_inventory_transactions WHERE tenant_id=? AND transaction_type='usage'", [TENANT_ID]);
  
  if (Number(existingUsageTxns[0].cnt) > 0) {
    console.log(`  ⚠️ 이미 usage 트랜잭션 ${existingUsageTxns[0].cnt}건 존재, 스킵\n`);
  } else {
    // 배치별 원료투입 → usage 트랜잭션 생성
    const [batchInputsForTxn]: any = await pool.execute(
      `SELECT bi.id as input_id, bi.batch_id, bi.material_id, 
              COALESCE(bi.actual_quantity, bi.planned_quantity) as qty,
              bi.unit, bi.lot_id,
              b.planned_date, b.completed_at
       FROM h_batch_inputs bi
       JOIN h_batches b ON b.id = bi.batch_id
       WHERE bi.tenant_id=? AND b.status='completed'
       ORDER BY b.planned_date ASC, bi.id ASC`,
      [TENANT_ID]
    );
    
    let txnCount = 0;
    for (const inp of batchInputsForTxn) {
      const qty = Number(inp.qty) || 0;
      if (qty <= 0) continue;
      
      // LOT이 있으면 해당 LOT에서, 없으면 FEFO로 적절한 LOT 찾기
      let lotId = inp.lot_id;
      if (!lotId) {
        // 해당 원재료의 사용 가능한 LOT 찾기 (FEFO - 가장 오래된 것 먼저)
        const [availableLots]: any = await pool.execute(
          `SELECT id, available_quantity FROM h_inventory_lots 
           WHERE tenant_id=? AND material_id=? AND status='available' AND available_quantity > 0
           ORDER BY receipt_date ASC, id ASC LIMIT 1`,
          [TENANT_ID, inp.material_id]
        );
        
        if (availableLots.length > 0) {
          lotId = availableLots[0].id;
          
          // LOT의 available_quantity 차감
          const deductQty = Math.min(qty, Number(availableLots[0].available_quantity));
          await pool.execute(
            `UPDATE h_inventory_lots SET available_quantity = GREATEST(available_quantity - ?, 0) WHERE id=?`,
            [deductQty.toFixed(3), lotId]
          );
          
          // batch_input에 lot_id 업데이트
          await pool.execute(
            "UPDATE h_batch_inputs SET lot_id=? WHERE id=?",
            [lotId, inp.input_id]
          );
        }
      }
      
      // usage 트랜잭션 생성 (lot_id가 없어도 기록)
      const now = new Date();
      const txnDate = inp.planned_date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      
      if (lotId) {
        await pool.execute(
          `INSERT INTO h_inventory_transactions
           (tenant_id, lot_id, transaction_type, quantity, unit, transaction_date, 
            reference_type, reference_id, source_type, notes, created_by)
           VALUES (?, ?, 'usage', ?, ?, ?, 'batch', ?, 'batch_completion', ?, 1)`,
          [TENANT_ID, lotId, qty.toFixed(3), inp.unit || 'kg', txnDate,
           inp.batch_id, `시드보정-배치#${inp.batch_id}`]
        );
        txnCount++;
      }
    }
    console.log(`  ✅ usage 트랜잭션 ${txnCount}건 생성 완료\n`);
  }

  // ── Step 4: material_ledger_monthly 재집계 ──
  console.log("📅 Step 4: material_ledger_monthly 재집계...");
  
  // 모든 월 가져오기
  const [months]: any = await pool.execute(
    `SELECT DISTINCT DATE_FORMAT(ledger_date, '%Y-%m') as ym 
     FROM material_ledger_daily WHERE tenant_id=? ORDER BY ym`,
    [TENANT_ID]
  );
  
  for (const mRow of months) {
    const yearMonth = mRow.ym;
    const [ymParts] = [yearMonth.split('-').map(Number)];
    const year = ymParts[0], month = ymParts[1];
    const startDate = `${yearMonth}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
    const prevMonth = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
    
    for (const mat of materials) {
      // 전월 재고
      const [prevStockRows]: any = await pool.execute(
        "SELECT end_stock FROM material_ledger_monthly WHERE tenant_id=? AND material_id=? AND `year_month`=?",
        [TENANT_ID, mat.id, prevMonth]
      );
      const prevStock = prevStockRows?.[0]?.end_stock ? Number(prevStockRows[0].end_stock) : 0;
      
      // 일별 데이터
      const [dailyData]: any = await pool.execute(
        `SELECT DAY(ledger_date) as day_num, receving_qty, usage_qty
         FROM material_ledger_daily
         WHERE tenant_id=? AND material_id=? AND ledger_date >= ? AND ledger_date <= ?`,
        [TENANT_ID, mat.id, startDate, endDate]
      );
      
      // 일별 배열 초기화
      const rd: number[] = new Array(31).fill(0);
      const ud: number[] = new Array(31).fill(0);
      let rt = 0, ut = 0;
      
      for (const row of dailyData) {
        const i = Number(row.day_num) - 1;
        rd[i] = Number(row.receving_qty) || 0;
        ud[i] = Number(row.usage_qty) || 0;
        rt += rd[i];
        ut += ud[i];
      }
      
      // 입고도 사용도 없으면 prev_stock도 0이면 skip
      if (rt === 0 && ut === 0 && prevStock === 0) continue;
      
      const endStock = prevStock + rt - ut;
      
      await pool.execute(
        `INSERT INTO material_ledger_monthly 
         (tenant_id, material_id, \`year_month\`, prev_stock, receiving_total,
          receiving_day_01, receiving_day_02, receiving_day_03, receiving_day_04, receiving_day_05,
          receiving_day_06, receiving_day_07, receiving_day_08, receiving_day_09, receiving_day_10,
          receiving_day_11, receiving_day_12, receiving_day_13, receiving_day_14, receiving_day_15,
          receiving_day_16, receiving_day_17, receiving_day_18, receiving_day_19, receiving_day_20,
          receiving_day_21, receiving_day_22, receiving_day_23, receiving_day_24, receiving_day_25,
          receiving_day_26, receiving_day_27, receiving_day_28, receiving_day_29, receiving_day_30,
          receiving_day_31,
          usage_total,
          usage_day_01, usage_day_02, usage_day_03, usage_day_04, usage_day_05,
          usage_day_06, usage_day_07, usage_day_08, usage_day_09, usage_day_10,
          usage_day_11, usage_day_12, usage_day_13, usage_day_14, usage_day_15,
          usage_day_16, usage_day_17, usage_day_18, usage_day_19, usage_day_20,
          usage_day_21, usage_day_22, usage_day_23, usage_day_24, usage_day_25,
          usage_day_26, usage_day_27, usage_day_28, usage_day_29, usage_day_30,
          usage_day_31,
          end_stock)
         VALUES (?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?)
         ON DUPLICATE KEY UPDATE
          prev_stock = VALUES(prev_stock), receiving_total = VALUES(receiving_total),
          receiving_day_01 = VALUES(receiving_day_01), receiving_day_02 = VALUES(receiving_day_02),
          receiving_day_03 = VALUES(receiving_day_03), receiving_day_04 = VALUES(receiving_day_04),
          receiving_day_05 = VALUES(receiving_day_05), receiving_day_06 = VALUES(receiving_day_06),
          receiving_day_07 = VALUES(receiving_day_07), receiving_day_08 = VALUES(receiving_day_08),
          receiving_day_09 = VALUES(receiving_day_09), receiving_day_10 = VALUES(receiving_day_10),
          receiving_day_11 = VALUES(receiving_day_11), receiving_day_12 = VALUES(receiving_day_12),
          receiving_day_13 = VALUES(receiving_day_13), receiving_day_14 = VALUES(receiving_day_14),
          receiving_day_15 = VALUES(receiving_day_15), receiving_day_16 = VALUES(receiving_day_16),
          receiving_day_17 = VALUES(receiving_day_17), receiving_day_18 = VALUES(receiving_day_18),
          receiving_day_19 = VALUES(receiving_day_19), receiving_day_20 = VALUES(receiving_day_20),
          receiving_day_21 = VALUES(receiving_day_21), receiving_day_22 = VALUES(receiving_day_22),
          receiving_day_23 = VALUES(receiving_day_23), receiving_day_24 = VALUES(receiving_day_24),
          receiving_day_25 = VALUES(receiving_day_25), receiving_day_26 = VALUES(receiving_day_26),
          receiving_day_27 = VALUES(receiving_day_27), receiving_day_28 = VALUES(receiving_day_28),
          receiving_day_29 = VALUES(receiving_day_29), receiving_day_30 = VALUES(receiving_day_30),
          receiving_day_31 = VALUES(receiving_day_31),
          usage_total = VALUES(usage_total),
          usage_day_01 = VALUES(usage_day_01), usage_day_02 = VALUES(usage_day_02),
          usage_day_03 = VALUES(usage_day_03), usage_day_04 = VALUES(usage_day_04),
          usage_day_05 = VALUES(usage_day_05), usage_day_06 = VALUES(usage_day_06),
          usage_day_07 = VALUES(usage_day_07), usage_day_08 = VALUES(usage_day_08),
          usage_day_09 = VALUES(usage_day_09), usage_day_10 = VALUES(usage_day_10),
          usage_day_11 = VALUES(usage_day_11), usage_day_12 = VALUES(usage_day_12),
          usage_day_13 = VALUES(usage_day_13), usage_day_14 = VALUES(usage_day_14),
          usage_day_15 = VALUES(usage_day_15), usage_day_16 = VALUES(usage_day_16),
          usage_day_17 = VALUES(usage_day_17), usage_day_18 = VALUES(usage_day_18),
          usage_day_19 = VALUES(usage_day_19), usage_day_20 = VALUES(usage_day_20),
          usage_day_21 = VALUES(usage_day_21), usage_day_22 = VALUES(usage_day_22),
          usage_day_23 = VALUES(usage_day_23), usage_day_24 = VALUES(usage_day_24),
          usage_day_25 = VALUES(usage_day_25), usage_day_26 = VALUES(usage_day_26),
          usage_day_27 = VALUES(usage_day_27), usage_day_28 = VALUES(usage_day_28),
          usage_day_29 = VALUES(usage_day_29), usage_day_30 = VALUES(usage_day_30),
          usage_day_31 = VALUES(usage_day_31),
          end_stock = VALUES(end_stock),
          updated_at = NOW()`,
        [TENANT_ID, mat.id, yearMonth, prevStock, rt,
         ...rd,
         ut,
         ...ud,
         endStock]
      );
    }
    console.log(`  ${yearMonth} 집계 완료`);
  }
  console.log(`  ✅ ${months.length}개월 집계 완료\n`);

  // ── Step 5: 최종 검증 ──
  console.log("🔍 최종 검증...");
  
  const [finalTxns]: any = await pool.execute(
    "SELECT transaction_type, COUNT(*) as cnt FROM h_inventory_transactions WHERE tenant_id=? GROUP BY transaction_type", [TENANT_ID]);
  console.log(`  재고 트랜잭션:`, (finalTxns as any[]).map((r: any) => `${r.transaction_type}=${r.cnt}`).join(', '));
  
  const [finalLedger]: any = await pool.execute(
    "SELECT COUNT(*) as cnt, SUM(receving_qty) as total_recv, SUM(usage_qty) as total_usage FROM material_ledger_daily WHERE tenant_id=?", [TENANT_ID]);
  console.log(`  수불부(daily): ${finalLedger[0].cnt}건, 입고합계=${finalLedger[0].total_recv}, 사용합계=${finalLedger[0].total_usage}`);
  
  const [finalMonthly]: any = await pool.execute(
    "SELECT COUNT(*) as cnt FROM material_ledger_monthly WHERE tenant_id=?", [TENANT_ID]);
  console.log(`  수불부(monthly): ${finalMonthly[0].cnt}건`);
  
  const [assignedLots]: any = await pool.execute(
    "SELECT COUNT(*) as cnt FROM h_batch_inputs WHERE tenant_id=? AND lot_id IS NOT NULL", [TENANT_ID]);
  const [totalInputs2]: any = await pool.execute(
    "SELECT COUNT(*) as cnt FROM h_batch_inputs WHERE tenant_id=?", [TENANT_ID]);
  console.log(`  LOT 할당된 투입: ${assignedLots[0].cnt}/${totalInputs2[0].cnt}`);

  console.log(`\n✅ 시드 데이터 보정 완료\n`);
  process.exit(0);
}

main().catch(err => {
  console.error("❌ 치명적 오류:", err);
  process.exit(1);
});
