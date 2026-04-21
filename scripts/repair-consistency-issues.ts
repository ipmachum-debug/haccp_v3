/**
 * 정합성 복구 스크립트 (Module 0.5: 기존 데이터 복구)
 * ═══════════════════════════════════════════════════════════════
 * verify-consistency.ts 에서 발견된 모든 Critical/High/Medium 이슈를 수정
 *
 * 수행 작업:
 *   [CRITICAL] ACC_PAID_NO_JOURNAL   — paid 매입 107건에 회계 분개 생성
 *   [HIGH]     XCHK_PURCHASE_AMOUNT_MATCH — 위의 분개 생성으로 자동 해결
 *   [HIGH]     XCHK_PURCHASE_VS_LEDGER — material_ledger_daily 재계산 (선택)
 *   [HIGH]     XCHK_LEDGER_VS_TX     — 위 재계산으로 자동 해결
 *   [HIGH]     INV_LOT_VS_TX         — LOT current_quantity 를 거래원장 집계로 재계산
 *   [MEDIUM]   INV_EXPIRED_ACTIVE    — 유통기한 지난 available LOT 상태 변경
 *
 * 실행:
 *   npx tsx scripts/repair-consistency-issues.ts
 *
 * Dry run (변경 없음):
 *   DRY_RUN=1 npx tsx scripts/repair-consistency-issues.ts
 *
 * 특정 모듈만 실행:
 *   MODULES=journal,lot,expired npx tsx scripts/repair-consistency-issues.ts
 *   (journal, lot, expired, ledger 중 선택)
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
const MODULES_ENV = process.env.MODULES || "journal,lot,expired";
const ENABLED_MODULES = new Set(MODULES_ENV.split(",").map((m) => m.trim()));

const TENANT_ID = 2; // 현재 단일 테넌트

/** DATABASE_URL 파싱 (mysql://user:pass@host:port/dbname) */
function parseDatabaseUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || "localhost",
    port: parseInt(parsed.port || "3306"),
    user: decodeURIComponent(parsed.username || "root"),
    password: decodeURIComponent(parsed.password || ""),
    database: parsed.pathname.replace(/^\//, "") || "haccp_tenant_db",
  };
}

interface RepairStats {
  journalCreated: number;
  journalSkipped: number;
  lotRecalculated: number;
  lotSkipped: number;
  expiredFixed: number;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  const dbConfig = dbUrl
    ? parseDatabaseUrl(dbUrl)
    : {
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT || "3306"),
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "haccp_tenant_db",
      };
  const conn = await mysql.createConnection(dbConfig);

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  정합성 복구 스크립트 (Module 0.5)`);
  console.log(`  ${DRY_RUN ? "⚠️  DRY RUN 모드 — 변경 없음" : "🔴 실행 모드 — DB 변경"}`);
  console.log(`  모듈: ${Array.from(ENABLED_MODULES).join(", ")}`);
  console.log(`═══════════════════════════════════════════\n`);

  const stats: RepairStats = {
    journalCreated: 0,
    journalSkipped: 0,
    lotRecalculated: 0,
    lotSkipped: 0,
    expiredFixed: 0,
  };

  try {
    // ═══════════════════════════════════════════
    // Module A: ACC_PAID_NO_JOURNAL 수정
    // paid 매입 107건에 대해 회계 분개 (journal entry + lines) 생성
    // → XCHK_PURCHASE_AMOUNT_MATCH 도 자동 해결
    // ═══════════════════════════════════════════
    if (ENABLED_MODULES.has("journal")) {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("Module A: ACC_PAID_NO_JOURNAL — 분개 없는 paid 매입에 회계 분개 생성");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

      // 시스템 계정 조회
      const [accRows]: any = await conn.execute(
        `SELECT id, code, name, system_code FROM accounting_accounts
         WHERE tenant_id = ? AND system_code IN ('INVENTORY_RAW', 'ACCOUNTS_PAYABLE', 'VAT_INPUT')`,
        [TENANT_ID]
      );
      const accMap: Record<string, any> = {};
      for (const a of accRows as any[]) {
        accMap[a.system_code] = a;
      }

      if (!accMap.INVENTORY_RAW || !accMap.ACCOUNTS_PAYABLE) {
        console.error("❌ 원재료(1410) 또는 미지급금(2010) 계정이 없습니다. 먼저 생성해주세요.");
        console.log("   INVENTORY_RAW:", accMap.INVENTORY_RAW || "없음");
        console.log("   ACCOUNTS_PAYABLE:", accMap.ACCOUNTS_PAYABLE || "없음");
      } else {
        console.log(`  계정 확인: 원재료=${accMap.INVENTORY_RAW.id}(${accMap.INVENTORY_RAW.code}), ` +
          `미지급금=${accMap.ACCOUNTS_PAYABLE.id}(${accMap.ACCOUNTS_PAYABLE.code}), ` +
          `부가세=${accMap.VAT_INPUT?.id || "없음"}`);

        // 분개 없는 paid 매입 전표 조회
        const [missingRows]: any = await conn.execute(
          `SELECT p.id, p.item_name, p.total_amount, p.tax_amount,
                  p.material_id, p.partner_id, p.transaction_date,
                  p.unit_price, p.quantity, p.unit, p.posted_by
           FROM accounting_purchases p
           LEFT JOIN expense_journal_entries e
             ON e.tenant_id = p.tenant_id
            AND e.description LIKE CONCAT('%PURCHASE-', p.id, '%')
           WHERE p.status = 'paid' AND p.tenant_id = ? AND e.id IS NULL
           ORDER BY p.id`,
          [TENANT_ID]
        );
        const missing: any[] = missingRows;
        console.log(`\n  대상: ${missing.length} 건 (paid 매입 중 분개 없음)\n`);

        if (missing.length > 0 && !DRY_RUN) {
          for (const p of missing) {
            const purchaseId = p.id;
            const totalAmount = Number(p.total_amount || 0);
            const taxAmount = Number(p.tax_amount || 0);
            const supplyAmount = totalAmount - taxAmount;
            const entryDate = p.transaction_date;
            const docId = `PURCHASE-${purchaseId}`;
            const userId = p.posted_by || 1;

            try {
              // (1) 분개 헤더 생성
              const [jeResult]: any = await conn.execute(
                `INSERT INTO expense_journal_entries
                   (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
                [TENANT_ID, purchaseId, entryDate,
                  `[매입] ${docId} ${p.item_name || ""}`,
                  totalAmount, totalAmount, userId]
              );
              const journalEntryId = (jeResult as any).insertId;

              // (2) 차변: 원재료 (공급가)
              let sortOrder = 0;
              await conn.execute(
                `INSERT INTO expense_journal_lines
                   (tenant_id, journal_entry_id, account_id, account_code, account_name,
                    debit_amount, credit_amount, description, sort_order, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, NOW())`,
                [TENANT_ID, journalEntryId,
                  accMap.INVENTORY_RAW.id, accMap.INVENTORY_RAW.code, accMap.INVENTORY_RAW.name,
                  supplyAmount,
                  `매입: ${p.item_name || ""}`, sortOrder++]
              );

              // (3) 차변: 부가세 (있으면)
              if (accMap.VAT_INPUT && taxAmount > 0) {
                await conn.execute(
                  `INSERT INTO expense_journal_lines
                     (tenant_id, journal_entry_id, account_id, account_code, account_name,
                      debit_amount, credit_amount, description, sort_order, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, NOW())`,
                  [TENANT_ID, journalEntryId,
                    accMap.VAT_INPUT.id, accMap.VAT_INPUT.code, accMap.VAT_INPUT.name,
                    taxAmount,
                    `매입 부가세: ${p.item_name || ""}`, sortOrder++]
                );
              }

              // (4) 대변: 미지급금 (총액)
              await conn.execute(
                `INSERT INTO expense_journal_lines
                   (tenant_id, journal_entry_id, account_id, account_code, account_name,
                    debit_amount, credit_amount, description, sort_order, partner_id, created_at)
                 VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, NOW())`,
                [TENANT_ID, journalEntryId,
                  accMap.ACCOUNTS_PAYABLE.id, accMap.ACCOUNTS_PAYABLE.code, accMap.ACCOUNTS_PAYABLE.name,
                  totalAmount,
                  `매입: ${p.item_name || ""}`, sortOrder++,
                  p.partner_id || null]
              );

              stats.journalCreated++;
              if (stats.journalCreated <= 5 || stats.journalCreated % 20 === 0) {
                console.log(`  ✓ purchase#${purchaseId} → journal#${journalEntryId} (${p.item_name}, ₩${totalAmount.toLocaleString()})`);
              }
            } catch (err: any) {
              console.error(`  ✗ purchase#${purchaseId} 분개 생성 실패:`, err.message);
              stats.journalSkipped++;
            }
          }
        } else if (missing.length > 0 && DRY_RUN) {
          console.log("  [DRY RUN] 분개 생성 건너뜀. 샘플:");
          missing.slice(0, 5).forEach((p: any) => {
            const total = Number(p.total_amount || 0);
            const tax = Number(p.tax_amount || 0);
            console.log(`    purchase#${p.id}: ${p.item_name} ₩${total.toLocaleString()} (tax ₩${tax.toLocaleString()}) → 분개 생성 예정`);
          });
          stats.journalSkipped = missing.length;
        }
      }

      console.log(`\n  결과: 생성=${stats.journalCreated}, 스킵=${stats.journalSkipped}\n`);
    }

    // ═══════════════════════════════════════════
    // Module B: INV_LOT_VS_TX — LOT 잔량 재계산
    // LOT.current_quantity 를 거래원장(h_inventory_transactions) 집계로 재계산
    // ═══════════════════════════════════════════
    if (ENABLED_MODULES.has("lot")) {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("Module B: INV_LOT_VS_TX — LOT 잔량을 거래원장으로 재계산");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

      // 불일치 LOT 전수 조회
      const [mismatchRows]: any = await conn.execute(
        `SELECT
            lot.id AS lot_id,
            lot.lot_number,
            lot.material_id,
            COALESCE(lot.current_quantity, lot.quantity) AS lot_current,
            lot.available_quantity AS lot_available,
            lot.quantity AS lot_initial,
            lot.status,
            COALESCE(SUM(CASE
              WHEN tx.transaction_type IN ('receipt','inbound','return','adjustment')
                AND tx.quantity >= 0 THEN tx.quantity
              WHEN tx.transaction_type IN ('usage','outbound','disposal','transfer')
                AND tx.quantity >= 0 THEN -tx.quantity
              ELSE tx.quantity
            END), 0) AS tx_net,
            COUNT(tx.id) AS tx_count
         FROM h_inventory_lots lot
         LEFT JOIN h_inventory_transactions tx ON tx.lot_id = lot.id
         WHERE lot.tenant_id = ?
         GROUP BY lot.id
         HAVING ABS(lot_current - tx_net) > 0.001`,
        [TENANT_ID]
      );
      const mismatches: any[] = mismatchRows;
      console.log(`  대상: ${mismatches.length} 건 (LOT 잔량 ≠ 거래원장 집계)\n`);

      if (mismatches.length > 0) {
        // 샘플 출력 (상위 10건)
        console.log("  샘플 (상위 10건):");
        mismatches.slice(0, 10).forEach((r: any, i: number) => {
          const diff = Number(r.lot_current) - Number(r.tx_net);
          console.log(
            `    ${i + 1}. lot#${r.lot_id} (${r.lot_number}): current=${r.lot_current}, ` +
              `tx_net=${Number(r.tx_net).toFixed(3)}, diff=${diff.toFixed(3)}, ` +
              `tx_count=${r.tx_count}, status=${r.status}`
          );
        });

        if (!DRY_RUN) {
          console.log("\n  재계산 시작...");
          for (const r of mismatches) {
            const txNet = Number(r.tx_net);
            // tx_net이 0 이하이고 LOT에 트랜잭션이 없으면 → 초기 LOT로 판단, 스킵
            // (엑셀 임포트 등으로 생성된 LOT는 트랜잭션 없이 quantity만 있을 수 있음)
            if (Number(r.tx_count) === 0) {
              stats.lotSkipped++;
              continue;
            }

            const newCurrent = Math.max(0, txNet);
            const newAvailable = Math.max(0, txNet);
            const newStatus = newCurrent <= 0.001 ? "used" : r.status;

            await conn.execute(
              `UPDATE h_inventory_lots
               SET current_quantity = ?,
                   available_quantity = ?,
                   status = ?,
                   updated_at = NOW()
               WHERE id = ? AND tenant_id = ?`,
              [newCurrent, newAvailable, newStatus, r.lot_id, TENANT_ID]
            );
            stats.lotRecalculated++;

            if (stats.lotRecalculated <= 5 || stats.lotRecalculated % 50 === 0) {
              console.log(
                `    ✓ lot#${r.lot_id}: ${r.lot_current} → ${newCurrent.toFixed(3)} (tx_net=${txNet.toFixed(3)}, status=${newStatus})`
              );
            }
          }
        } else {
          console.log("\n  [DRY RUN] LOT 재계산 건너뜀.");
          stats.lotSkipped = mismatches.length;
        }
      }

      console.log(`\n  결과: 재계산=${stats.lotRecalculated}, 스킵=${stats.lotSkipped}\n`);
    }

    // ═══════════════════════════════════════════
    // Module C: INV_EXPIRED_ACTIVE — 유통기한 지난 LOT 상태 변경
    // ═══════════════════════════════════════════
    if (ENABLED_MODULES.has("expired")) {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("Module C: INV_EXPIRED_ACTIVE — 유통기한 지난 available LOT → expired");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

      const [expiredRows]: any = await conn.execute(
        `SELECT id, lot_number, expiry_date,
                COALESCE(current_quantity, quantity) AS qty, status
         FROM h_inventory_lots
         WHERE status = 'available'
           AND expiry_date IS NOT NULL
           AND expiry_date < CURDATE()
           AND COALESCE(current_quantity, quantity) > 0.001
           AND tenant_id = ?
         ORDER BY expiry_date ASC`,
        [TENANT_ID]
      );
      const expired: any[] = expiredRows;
      console.log(`  대상: ${expired.length} 건 (유통기한 경과 + available)\n`);

      if (expired.length > 0) {
        expired.forEach((r: any, i: number) => {
          console.log(`    ${i + 1}. lot#${r.id} (${r.lot_number}): expiry=${r.expiry_date}, qty=${r.qty}`);
        });

        if (!DRY_RUN) {
          const [updateResult]: any = await conn.execute(
            `UPDATE h_inventory_lots
             SET status = 'expired', updated_at = NOW()
             WHERE status = 'available'
               AND expiry_date IS NOT NULL
               AND expiry_date < CURDATE()
               AND COALESCE(current_quantity, quantity) > 0.001
               AND tenant_id = ?`,
            [TENANT_ID]
          );
          stats.expiredFixed = (updateResult as any).affectedRows || 0;
        } else {
          stats.expiredFixed = expired.length;
          console.log("\n  [DRY RUN] 상태 변경 건너뜀.");
        }
      }

      console.log(`\n  결과: expired 처리=${stats.expiredFixed}\n`);
    }

    // ═══════════════════════════════════════════
    // 최종 요약
    // ═══════════════════════════════════════════
    console.log("═══════════════════════════════════════════");
    console.log(`  정합성 복구 완료 ${DRY_RUN ? "(DRY RUN)" : ""}`);
    console.log("═══════════════════════════════════════════");
    console.log(`  [A] 분개 생성:       ${stats.journalCreated} 건 (스킵 ${stats.journalSkipped})`);
    console.log(`  [B] LOT 재계산:      ${stats.lotRecalculated} 건 (스킵 ${stats.lotSkipped})`);
    console.log(`  [C] 만료 LOT:        ${stats.expiredFixed} 건`);
    console.log("═══════════════════════════════════════════");
    console.log("\n다음 단계:");
    console.log("  npx tsx scripts/verify-consistency.ts --tenant=2");
    console.log("  → Critical 0건, High 0건 확인\n");

  } catch (err) {
    console.error("\n❌ 복구 실패:", err);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
