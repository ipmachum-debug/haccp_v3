/**
 * PR-W3: 재고 트랜잭션 정합성 종합 백필
 *
 * ============================================================================
 * 진단 결과 (scripts/_pipeline-audit*.ts):
 *  D4: transaction_date != batch.completed_at 다수 — NOW() 버그 산물
 *  D5: source_type 두 종류 공존 — 'BATCH' (497) + 'batch_completion' (2,313)
 *  D5b: source_type NULL 837건 — 레거시 임포트 산물
 *
 * 처리 범위 (단계별):
 *  S1: transaction_date 백필 — BATCH + batch_completion (~2,810행)
 *      → batch.completed_at (1순위) → planned_date → 기존값 폴백
 *  S2: source_type NULL 복구 (가능한 만큼)
 *      - usage  + reference_type='batch'  + reference_id NOT NULL
 *        → source_type='BATCH', source_id=reference_id (~301행)
 *      - receipt + reference_type='batch' + reference_id NOT NULL
 *        → source_type='BATCH', source_id=reference_id (~45행)
 *      - receipt + reference_type='PURCHASE' + source_id NOT NULL
 *        → source_type='accounting_purchases' (~14행)
 *      - usage + reference_type='fefo_split' (~7행)
 *        → source_type='fefo_split'
 *      - receipt + reference_type='historical_correction' (~8행)
 *        → source_type='historical_correction'
 *      - 'inbound' transaction_type (~48행) — notes "LOT 보강 생성"
 *        → source_type='lot_reinforcement', transaction_type 그대로 유지
 *      - outbound NULL 414 — notes "제품출고 B2C (자동임포트)"
 *        → source_type='SALE_LEGACY' (구분되도록 신규 라벨)
 *
 * ============================================================================
 * 운영 프로토콜 (★ 중요):
 *  DDL (CREATE TABLE) 은 트랜잭션 시작 *전* 에 실행 (MySQL 암묵적 commit 방지)
 *  UPDATE 만 트랜잭션 안에서 실행 (DRY-RUN 시 정확히 ROLLBACK 가능)
 *
 * 실행:
 *   npx tsx scripts/_w3-backfill-transaction-date.ts --dry-run
 *   npx tsx scripts/_w3-backfill-transaction-date.ts --commit
 *
 * 옵션:
 *   --skip-s1   : transaction_date 백필 건너뜀
 *   --skip-s2   : source_type NULL 복구 건너뜀
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";
config({ path: "/home/root/haccp_v3/webapp/.env" });

const TID = 2;
const COMMIT = process.argv.includes("--commit");
const DRY_RUN = !COMMIT;
const SKIP_S1 = process.argv.includes("--skip-s1");
const SKIP_S2 = process.argv.includes("--skip-s2");

(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  console.log(`\n========================================`);
  console.log(`PR-W3 백필 (${DRY_RUN ? "DRY-RUN" : "COMMIT"})`);
  console.log(`tenant_id = ${TID}`);
  console.log(`========================================\n`);

  // ========================================================================
  // 사전 단계: 백업 테이블 (DDL — 트랜잭션 *밖에서* 실행)
  // ========================================================================
  console.log(`[backup] 백업 테이블 생성 (트랜잭션 외부, DDL)...`);
  await conn.query(`DROP TABLE IF EXISTS w3_tx_backup_2026_04_26`);
  await conn.query(`
    CREATE TABLE w3_tx_backup_2026_04_26 AS
    SELECT * FROM h_inventory_transactions WHERE tenant_id = ${TID}
  `);
  const [[bk]]: any = await conn.query(`SELECT COUNT(*) AS n FROM w3_tx_backup_2026_04_26`);
  console.log(`[backup] w3_tx_backup_2026_04_26: ${bk.n} 행 보존\n`);

  // ========================================================================
  // ★ 트랜잭션 시작 (UPDATE 만 포함)
  // ========================================================================
  await conn.beginTransaction();
  try {
    // ====================================================================
    // S1: transaction_date 백필
    // ====================================================================
    let s1Updated = 0;
    if (!SKIP_S1) {
      console.log(`────────────────────────────────────────`);
      console.log(`[S1] transaction_date 백필`);
      console.log(`────────────────────────────────────────`);

      // BEFORE 통계
      const [s1Before] = await conn.query<any[]>(`
        SELECT COUNT(*) AS total,
               SUM(CASE
                   WHEN DATE(t.transaction_date) <> DATE(COALESCE(b.completed_at, b.planned_date))
                     AND COALESCE(b.completed_at, b.planned_date) IS NOT NULL
                   THEN 1 ELSE 0 END) AS mismatch
        FROM h_inventory_transactions t
        JOIN h_batches b ON b.id = t.source_id AND b.tenant_id = t.tenant_id
        WHERE t.tenant_id = ${TID}
          AND t.source_type IN ('BATCH', 'batch_completion')
          AND t.transaction_type IN ('usage', 'receipt')
      `);
      console.log(`[S1 BEFORE] BATCH+batch_completion 트랜잭션:`);
      console.table(s1Before);

      // UPDATE
      const [r1]: any = await conn.execute(`
        UPDATE h_inventory_transactions t
        JOIN h_batches b ON b.id = t.source_id AND b.tenant_id = t.tenant_id
        SET t.transaction_date = COALESCE(DATE(b.completed_at), DATE(b.planned_date), t.transaction_date)
        WHERE t.tenant_id = ${TID}
          AND t.source_type IN ('BATCH', 'batch_completion')
          AND t.transaction_type IN ('usage', 'receipt')
          AND COALESCE(DATE(b.completed_at), DATE(b.planned_date)) IS NOT NULL
          AND DATE(t.transaction_date) <> COALESCE(DATE(b.completed_at), DATE(b.planned_date))
      `);
      s1Updated = r1.affectedRows;
      console.log(`[S1] transaction_date UPDATE: ${s1Updated} 행`);

      // AFTER 검증
      const [s1After] = await conn.query<any[]>(`
        SELECT COUNT(*) AS still_mismatch
        FROM h_inventory_transactions t
        JOIN h_batches b ON b.id = t.source_id AND b.tenant_id = t.tenant_id
        WHERE t.tenant_id = ${TID}
          AND t.source_type IN ('BATCH', 'batch_completion')
          AND t.transaction_type IN ('usage', 'receipt')
          AND COALESCE(DATE(b.completed_at), DATE(b.planned_date)) IS NOT NULL
          AND DATE(t.transaction_date) <> COALESCE(DATE(b.completed_at), DATE(b.planned_date))
      `);
      console.log(`[S1 AFTER] 잔존 mismatch: ${(s1After[0] as any).still_mismatch} (목표 0)`);

      // 4/20·4/22·4/26 KST 가짜 일자 잔존?
      const [s1Fake] = await conn.query<any[]>(`
        SELECT DATE(transaction_date) AS d, COUNT(*) AS cnt
        FROM h_inventory_transactions
        WHERE tenant_id = ${TID}
          AND source_type IN ('BATCH', 'batch_completion')
          AND transaction_type = 'usage'
          AND DATE(transaction_date) IN ('2026-04-19', '2026-04-21', '2026-04-25')
        GROUP BY d
      `);
      console.log(`[S1] 가짜 4/20·4/22·4/26(KST) 잔존:`);
      console.table(s1Fake);
    }

    // ====================================================================
    // S2: source_type NULL 복구
    // ====================================================================
    let s2Total = 0;
    if (!SKIP_S2) {
      console.log(`\n────────────────────────────────────────`);
      console.log(`[S2] source_type NULL 복구`);
      console.log(`────────────────────────────────────────`);

      // S2-a: usage + reference_type='batch' + reference_id NOT NULL → BATCH
      const [r2a]: any = await conn.execute(`
        UPDATE h_inventory_transactions
        SET source_type = 'BATCH',
            source_id = COALESCE(source_id, reference_id)
        WHERE tenant_id = ${TID}
          AND source_type IS NULL
          AND transaction_type = 'usage'
          AND reference_type = 'batch'
          AND reference_id IS NOT NULL
      `);
      console.log(`[S2-a] usage + ref=batch  → BATCH: ${r2a.affectedRows}행`);
      s2Total += r2a.affectedRows;

      // S2-b: receipt + reference_type='batch' + reference_id NOT NULL → BATCH
      const [r2b]: any = await conn.execute(`
        UPDATE h_inventory_transactions
        SET source_type = 'BATCH',
            source_id = COALESCE(source_id, reference_id)
        WHERE tenant_id = ${TID}
          AND source_type IS NULL
          AND transaction_type = 'receipt'
          AND reference_type = 'batch'
          AND reference_id IS NOT NULL
      `);
      console.log(`[S2-b] receipt + ref=batch → BATCH: ${r2b.affectedRows}행`);
      s2Total += r2b.affectedRows;

      // S2-c: receipt + reference_type='PURCHASE' → accounting_purchases
      const [r2c]: any = await conn.execute(`
        UPDATE h_inventory_transactions
        SET source_type = 'accounting_purchases'
        WHERE tenant_id = ${TID}
          AND source_type IS NULL
          AND transaction_type = 'receipt'
          AND reference_type = 'PURCHASE'
      `);
      console.log(`[S2-c] receipt + ref=PURCHASE → accounting_purchases: ${r2c.affectedRows}행`);
      s2Total += r2c.affectedRows;

      // S2-d: usage + reference_type='fefo_split' → fefo_split
      const [r2d]: any = await conn.execute(`
        UPDATE h_inventory_transactions
        SET source_type = 'fefo_split'
        WHERE tenant_id = ${TID}
          AND source_type IS NULL
          AND reference_type = 'fefo_split'
      `);
      console.log(`[S2-d] ref=fefo_split → fefo_split: ${r2d.affectedRows}행`);
      s2Total += r2d.affectedRows;

      // S2-e: receipt + reference_type='historical_correction' → historical_correction
      const [r2e]: any = await conn.execute(`
        UPDATE h_inventory_transactions
        SET source_type = 'historical_correction'
        WHERE tenant_id = ${TID}
          AND source_type IS NULL
          AND reference_type = 'historical_correction'
      `);
      console.log(`[S2-e] ref=historical_correction → historical_correction: ${r2e.affectedRows}행`);
      s2Total += r2e.affectedRows;

      // S2-f: inbound + notes LIKE 'LOT 보강 생성%' → lot_reinforcement
      const [r2f]: any = await conn.execute(`
        UPDATE h_inventory_transactions
        SET source_type = 'lot_reinforcement'
        WHERE tenant_id = ${TID}
          AND source_type IS NULL
          AND transaction_type = 'inbound'
          AND notes LIKE 'LOT 보강 생성%'
      `);
      console.log(`[S2-f] inbound + LOT 보강 → lot_reinforcement: ${r2f.affectedRows}행`);
      s2Total += r2f.affectedRows;

      // S2-g: outbound + notes LIKE '제품출고 B2C%' → SALE_LEGACY
      const [r2g]: any = await conn.execute(`
        UPDATE h_inventory_transactions
        SET source_type = 'SALE_LEGACY'
        WHERE tenant_id = ${TID}
          AND source_type IS NULL
          AND transaction_type = 'outbound'
          AND notes LIKE '제품출고 B2C%'
      `);
      console.log(`[S2-g] outbound + 제품출고 B2C → SALE_LEGACY: ${r2g.affectedRows}행`);
      s2Total += r2g.affectedRows;

      console.log(`\n[S2] 합계 복구: ${s2Total}행`);

      // 잔존 NULL 확인
      const [s2Rest] = await conn.query<any[]>(`
        SELECT transaction_type, action_type, reference_type, COUNT(*) AS cnt
        FROM h_inventory_transactions
        WHERE tenant_id = ${TID} AND source_type IS NULL
        GROUP BY transaction_type, action_type, reference_type
        ORDER BY cnt DESC
      `);
      console.log(`[S2 AFTER] 잔존 NULL:`);
      if (s2Rest.length === 0) console.log("(전부 복구됨)");
      else console.table(s2Rest);
    }

    // ====================================================================
    // 최종 검증: source_type 분포
    // ====================================================================
    console.log(`\n────────────────────────────────────────`);
    console.log(`[FINAL] source_type 최종 분포`);
    console.log(`────────────────────────────────────────`);
    const [final] = await conn.query<any[]>(`
      SELECT source_type, transaction_type, COUNT(*) AS cnt
      FROM h_inventory_transactions
      WHERE tenant_id = ${TID}
      GROUP BY source_type, transaction_type
      ORDER BY source_type, transaction_type
    `);
    console.table(final);

    // 4/20·4/22·4/26 KST 일자 트랜잭션 (정상 분포여야 함)
    const [fakeDays] = await conn.query<any[]>(`
      SELECT DATE(transaction_date) AS d, transaction_type, COUNT(*) AS cnt
      FROM h_inventory_transactions
      WHERE tenant_id = ${TID}
        AND DATE(transaction_date) IN ('2026-04-19', '2026-04-20', '2026-04-21', '2026-04-22', '2026-04-25', '2026-04-26')
      GROUP BY d, transaction_type
      ORDER BY d, transaction_type
    `);
    console.log(`\n[FINAL] 4/20·4/22·4/26 KST 트랜잭션 (실제 배치 완료일이 있어야 함):`);
    console.table(fakeDays);

    // ====================================================================
    if (DRY_RUN) {
      console.log(`\n[DRY-RUN] ROLLBACK — UPDATE 변경 없음 (백업 테이블만 보존)`);
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

  console.log(`\n========================================`);
  console.log(`PR-W3 백필 완료 (${DRY_RUN ? "DRY-RUN" : "COMMIT"})`);
  console.log(`========================================\n`);
})().catch(e => { console.error(e); process.exit(1); });
