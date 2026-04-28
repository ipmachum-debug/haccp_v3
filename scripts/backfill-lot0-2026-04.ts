/**
 * Phase 2 백필: lot_id=0 자동출고 트랜잭션 → 가장 오래된 활성 LOT 재연결
 *
 * ============================================================================
 * 진단 결과 요약 (scripts/diagnose-lot0-allocation-2026-04.txt):
 *   범위: tenant_id=2, transaction_date 2026-04-06 ~ 2026-04-17 (266건)
 *   분류 (현재 시점 LOT 상태 기준):
 *     G_all_pass        192건 (72%)  — 모든 게이트 통과해야 정상이지만 lot_id=0
 *     E_inv_id_missing   51건 (19%)  — LOT.inventory_id NULL/0 (G4 폴백 가능)
 *     B_normal           23건  (9%)  — 정상 fallback (3건 no_lot_ever / 20건 lot existed)
 *     C_special           1건         — h_inventory.avail < qty 인데 LOT 은 있음
 *
 *   STEP 4 시간축 분석:
 *     lot_existed_before = 192 + 51 + 20 = 263건 (트랜잭션 일자 이전 LOT 존재)
 *     no_lot_ever        = 3건 (B 분류 일부, LOT 자체 부재)
 *
 * ----------------------------------------------------------------------------
 * 백필 정책:
 *   조건:
 *     - lot_id = 0
 *     - transaction_type = 'usage'
 *     - tenant_id = 2
 *     - transaction_date BETWEEN '2026-04-06' AND '2026-04-17'
 *     - 같은 material_id + tenant_id + LOT created_at <= transaction_date 이내인
 *       활성 LOT 존재
 *
 *   매칭 LOT 선택: 가장 오래된 LOT (created_at ASC, id ASC)
 *     - 진단 보고서 권고 (b) 따름
 *     - 사후 백필이라 그 시점 FEFO 재현 불가 → 가장 오래된 LOT 으로 일관성 확보
 *
 *   매칭 안 되는 케이스 (3건 추정):
 *     - lot_id=0 그대로 유지 (fallback INSERT 의도 보존)
 *
 * ----------------------------------------------------------------------------
 * 안전 장치:
 *   1. 백업 테이블 phase2_lot0_backup_2026_04_28 (트랜잭션 외부, DDL)
 *   2. 매칭 후보 임시 테이블 (DDL 외부, 가시성용)
 *   3. UPDATE 만 BEGIN/COMMIT 안에서 실행
 *   4. dry-run 시 ROLLBACK (h_inventory_transactions 변경 X, 백업 테이블만 잔존)
 *   5. BEFORE/AFTER 통계 출력
 *
 * 실행:
 *   npx tsx scripts/backfill-lot0-2026-04.ts --dry-run
 *   npx tsx scripts/backfill-lot0-2026-04.ts --commit
 *
 * 롤백 (commit 후 문제 발견 시):
 *   docs/operations/phase2-backfill-rollback.sql 참조
 *
 * ============================================================================
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";
config();

const TID = 2;
const DATE_START = "2026-04-06";
const DATE_END = "2026-04-17";
const BACKUP_TABLE = "phase2_lot0_backup_2026_04_28";
const MATCH_TABLE = "phase2_lot0_matches_2026_04_28";

const COMMIT = process.argv.includes("--commit");
const DRY_RUN = !COMMIT;

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error("[FATAL] DATABASE_URL 환경변수 필요. 운영 .env 가 있는 디렉토리에서 실행하세요.");
    process.exit(2);
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  console.log(`\n========================================`);
  console.log(`Phase 2 백필 lot_id=0 (${DRY_RUN ? "DRY-RUN" : "COMMIT"})`);
  console.log(`tenant_id   = ${TID}`);
  console.log(`기간        = ${DATE_START} ~ ${DATE_END}`);
  console.log(`백업 테이블 = ${BACKUP_TABLE}`);
  console.log(`========================================\n`);

  try {
    // ========================================================================
    // STEP 0: 백업 테이블 (DDL — 트랜잭션 *외부*에서 실행)
    // ========================================================================
    console.log(`[STEP 0] 백업 테이블 생성 (DDL, 트랜잭션 외부)`);
    await conn.query(`DROP TABLE IF EXISTS ${BACKUP_TABLE}`);
    await conn.query(`
      CREATE TABLE ${BACKUP_TABLE} AS
      SELECT * FROM h_inventory_transactions
      WHERE lot_id = 0
        AND transaction_type = 'usage'
        AND tenant_id = ${TID}
        AND transaction_date BETWEEN '${DATE_START}' AND '${DATE_END}'
    `);
    const [[bk]]: any = await conn.query(`SELECT COUNT(*) AS n FROM ${BACKUP_TABLE}`);
    console.log(`  → ${BACKUP_TABLE}: ${bk.n} 행 보존\n`);

    // ========================================================================
    // STEP 1: 매칭 후보 테이블 (DDL — 트랜잭션 *외부*에서 실행)
    // ========================================================================
    console.log(`[STEP 1] 매칭 후보 임시 테이블 생성 (가장 오래된 LOT 매칭)`);
    await conn.query(`DROP TABLE IF EXISTS ${MATCH_TABLE}`);
    await conn.query(`
      CREATE TABLE ${MATCH_TABLE} AS
      SELECT
        t.id          AS tx_id,
        t.material_id AS material_id,
        t.transaction_date AS tx_date,
        t.quantity    AS quantity,
        (
          SELECT l.id
          FROM h_inventory_lots l
          WHERE l.material_id = t.material_id
            AND l.tenant_id   = t.tenant_id
            AND DATE(l.created_at) <= t.transaction_date
          ORDER BY l.created_at ASC, l.id ASC
          LIMIT 1
        ) AS matched_lot_id
      FROM h_inventory_transactions t
      WHERE t.lot_id = 0
        AND t.transaction_type = 'usage'
        AND t.tenant_id = ${TID}
        AND t.transaction_date BETWEEN '${DATE_START}' AND '${DATE_END}'
    `);
    const [[mt]]: any = await conn.query(`SELECT COUNT(*) AS n FROM ${MATCH_TABLE}`);
    console.log(`  → ${MATCH_TABLE}: ${mt.n} 행 (전체 후보)\n`);

    // ========================================================================
    // STEP 2: BEFORE 통계
    // ========================================================================
    console.log(`[STEP 2] BEFORE 통계`);
    const [matchStats] = await conn.query<any[]>(`
      SELECT
        SUM(CASE WHEN matched_lot_id IS NOT NULL THEN 1 ELSE 0 END) AS will_update,
        SUM(CASE WHEN matched_lot_id IS NULL     THEN 1 ELSE 0 END) AS will_skip,
        COUNT(*) AS total
      FROM ${MATCH_TABLE}
    `);
    console.table(matchStats);

    const [perMaterial] = await conn.query<any[]>(`
      SELECT material_id,
             COUNT(*) AS tx_count,
             SUM(CASE WHEN matched_lot_id IS NOT NULL THEN 1 ELSE 0 END) AS will_update,
             SUM(CASE WHEN matched_lot_id IS NULL     THEN 1 ELSE 0 END) AS will_skip
      FROM ${MATCH_TABLE}
      GROUP BY material_id
      ORDER BY tx_count DESC
      LIMIT 20
    `);
    console.log(`  material 별 분포 (Top 20):`);
    console.table(perMaterial);

    // ========================================================================
    // STEP 3: UPDATE (트랜잭션 *내부*)
    // ========================================================================
    console.log(`\n[STEP 3] BEGIN TRANSACTION + UPDATE`);
    await conn.beginTransaction();

    try {
      const [r]: any = await conn.execute(`
        UPDATE h_inventory_transactions t
        JOIN ${MATCH_TABLE} m ON m.tx_id = t.id
        SET t.lot_id = m.matched_lot_id
        WHERE m.matched_lot_id IS NOT NULL
      `);
      console.log(`  UPDATE affected rows: ${r.affectedRows}`);

      // ====================================================================
      // STEP 4: AFTER 통계 (커밋/롤백 전)
      // ====================================================================
      console.log(`\n[STEP 4] AFTER 통계 (커밋/롤백 전)`);
      const [afterStats] = await conn.query<any[]>(`
        SELECT
          SUM(CASE WHEN lot_id = 0 THEN 1 ELSE 0 END) AS remaining_lot0,
          SUM(CASE WHEN lot_id <> 0 THEN 1 ELSE 0 END) AS now_with_lot,
          COUNT(*) AS total
        FROM h_inventory_transactions
        WHERE transaction_type = 'usage'
          AND tenant_id = ${TID}
          AND transaction_date BETWEEN '${DATE_START}' AND '${DATE_END}'
          AND id IN (SELECT tx_id FROM ${MATCH_TABLE})
      `);
      console.table(afterStats);

      // ====================================================================
      // STEP 5: 검증 — UPDATE 결과의 LOT 분포
      // ====================================================================
      const [lotDist] = await conn.query<any[]>(`
        SELECT t.lot_id, COUNT(*) AS tx_count
        FROM h_inventory_transactions t
        JOIN ${MATCH_TABLE} m ON m.tx_id = t.id
        WHERE m.matched_lot_id IS NOT NULL
        GROUP BY t.lot_id
        ORDER BY tx_count DESC
        LIMIT 10
      `);
      console.log(`  매칭된 LOT 분포 (Top 10):`);
      console.table(lotDist);

      // ====================================================================
      // STEP 6: COMMIT or ROLLBACK
      // ====================================================================
      if (DRY_RUN) {
        await conn.rollback();
        console.log(`\n[STEP 6] ROLLBACK 완료 (DRY-RUN — 실제 변경 없음)`);
        console.log(`           ${BACKUP_TABLE}, ${MATCH_TABLE} 은 잔존 (검증용)`);
      } else {
        await conn.commit();
        console.log(`\n[STEP 6] COMMIT 완료 — 운영 데이터 변경됨`);
        console.log(`           롤백 필요시 ${BACKUP_TABLE} 사용`);
        console.log(`           docs/operations/phase2-backfill-rollback.sql 참조`);
      }
    } catch (txErr: any) {
      await conn.rollback();
      console.error(`\n[ERROR] 트랜잭션 실패 — ROLLBACK`);
      console.error(`        ${txErr.message}`);
      throw txErr;
    }

    // ========================================================================
    // STEP 7: 최종 검증 (트랜잭션 외부)
    // ========================================================================
    console.log(`\n[STEP 7] 최종 검증 (전체 lot_id=0 잔존 카운트)`);
    const [final] = await conn.query<any[]>(`
      SELECT COUNT(*) AS remaining_lot0_in_range
      FROM h_inventory_transactions
      WHERE lot_id = 0
        AND transaction_type = 'usage'
        AND tenant_id = ${TID}
        AND transaction_date BETWEEN '${DATE_START}' AND '${DATE_END}'
    `);
    console.table(final);

    console.log(`\n========================================`);
    console.log(`완료 (${DRY_RUN ? "DRY-RUN — 변경 없음" : "COMMIT — 영구 적용"})`);
    console.log(`========================================\n`);

  } finally {
    await conn.end();
  }
})().catch((e) => {
  console.error("\n[FATAL]", e);
  process.exit(1);
});
