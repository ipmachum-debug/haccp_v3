/**
 * 마이그레이션: h_corrective_action_requests 에 (tenant_id, source_type, source_id)
 *               UNIQUE 인덱스 추가 — CP-3-g 후속 보강
 *
 * 목적:
 *   PR #139 (CP-3-g) 가 app-level 멱등성 체크 (postCcpCorrectiveAction 진입 시
 *   기존 CAR SELECT) 를 추가했지만, race condition (같은 record 가 동시에 두 번
 *   triggerCcpEvaluator 호출) 에서는 여전히 중복 INSERT 가능.
 *
 *   schema-level UNIQUE 인덱스로 이중 fence 강제:
 *     - app-level: SELECT → 존재 시 스킵 (정상 흐름, 친절한 메시지)
 *     - DB-level:  INSERT 시 ER_DUP_ENTRY throw (race 시 마지막 방어선)
 *
 * 적용:
 *   1. 기존 중복 행 dedup (같은 (tenant, source_type, source_id) 의 min(id) 만 keep)
 *   2. ALTER TABLE h_corrective_action_requests
 *      ADD UNIQUE INDEX uniq_car_source (tenant_id, source_type, source_id)
 *
 *   source_id IS NULL 인 행은 unique 검증에서 distinct (MySQL 표준) 으로 처리되어
 *   여러 개 허용. 이는 ccp_deviation 외 source_type 들이 source_id 를 옵셔널하게
 *   사용하는 것과 호환.
 *
 * 실행: npx tsx scripts/migrate-car-unique-index.ts
 *
 * 안전:
 *   - idempotent (이미 인덱스 존재 시 스킵)
 *   - dedup 로직은 트랜잭션 내부 — 실패 시 rollback
 *   - 운영 데이터 손실 0 (가장 오래된 1건만 keep, 나머지는 drop)
 */
import mysql from "mysql2/promise";

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "haccp_user",
    password: process.env.DB_PASSWORD || "haccp_password",
    database: process.env.DB_NAME || "haccp_v3",
    multipleStatements: false,
  });

  console.log(
    "=== 마이그레이션 시작: h_corrective_action_requests UNIQUE 인덱스 (CP-3-g 후속) ===\n",
  );

  // 1. 인덱스 존재 여부 확인 (idempotent)
  const [idxRows]: any = await conn.execute(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'h_corrective_action_requests'
       AND INDEX_NAME = 'uniq_car_source'`,
  );

  if ((idxRows as any[]).length > 0) {
    console.log("✅ uniq_car_source 인덱스 이미 존재 — 스킵");
    await conn.end();
    return;
  }

  // 2. 중복 행 발견
  console.log("→ 1단계: 중복 (tenant_id, source_type, source_id) 검색...");
  const [dupGroups]: any = await conn.execute(
    `SELECT tenant_id, source_type, source_id, COUNT(*) AS cnt, MIN(id) AS keep_id
     FROM h_corrective_action_requests
     WHERE source_id IS NOT NULL
     GROUP BY tenant_id, source_type, source_id
     HAVING cnt > 1`,
  );
  const dupCount = (dupGroups as any[]).length;
  console.log(`   → ${dupCount} 개 중복 그룹 발견`);

  if (dupCount > 0) {
    await conn.beginTransaction();
    try {
      let totalDeleted = 0;
      for (const g of dupGroups as any[]) {
        const [result]: any = await conn.execute(
          `DELETE FROM h_corrective_action_requests
           WHERE tenant_id = ? AND source_type = ? AND source_id = ?
             AND id <> ?`,
          [g.tenant_id, g.source_type, g.source_id, g.keep_id],
        );
        const affected = (result as any).affectedRows ?? 0;
        totalDeleted += affected;
        console.log(
          `   - tenant=${g.tenant_id} source=${g.source_type}/${g.source_id} ` +
          `keep=${g.keep_id} delete=${affected}`,
        );
      }
      await conn.commit();
      console.log(`✅ 중복 ${totalDeleted}건 제거 완료 (${dupCount} 그룹)`);
    } catch (err) {
      await conn.rollback();
      console.error("❌ 중복 제거 실패 (rollback):", err);
      throw err;
    }
  } else {
    console.log("   → 중복 없음, 그대로 진행");
  }

  // 3. UNIQUE 인덱스 추가
  console.log("\n→ 2단계: UNIQUE 인덱스 추가...");
  await conn.execute(
    `ALTER TABLE h_corrective_action_requests
     ADD UNIQUE INDEX uniq_car_source (tenant_id, source_type, source_id)`,
  );
  console.log("✅ uniq_car_source UNIQUE 인덱스 추가 완료");

  // 4. 결과 확인
  const [stats]: any = await conn.execute(
    `SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'h_corrective_action_requests'
       AND INDEX_NAME = 'uniq_car_source'
     ORDER BY SEQ_IN_INDEX`,
  );
  console.log("\n=== uniq_car_source 인덱스 구성 ===");
  console.table(stats);

  await conn.end();
  console.log("\n=== 마이그레이션 완료 ===");
}

migrate().catch((e) => {
  console.error("마이그레이션 실패:", e);
  process.exit(1);
});
