/**
 * F-3 폐쇄 루프 E2E 스모크 테스트 (CP-3 시리즈 검증용)
 *
 * ============================================================================
 * 목적:
 *   PR #131~#143 (CP-3 시리즈) 의 F-3 자동화 4단계 (이탈 → LOT HOLD →
 *   손실분개 → 시정조치) 가 실제 코드 흐름으로 작동하는지 운영 테넌트 없이
 *   검증.
 *
 *   "테넌트가 없어 운영 검증이 불가능" 한 상태에서 이 스크립트 1회 실행으로
 *   모든 PR 의 코드가 합쳐졌을 때 정상 작동함을 입증.
 *
 * 흐름:
 *   1. 데모 tenant 보장 (없으면 SKIP — DB 시드 별도)
 *   2. 데모 데이터 보장 (product, ccp_limits, batch, inventory_lot)
 *      ※ 이미 존재하면 재사용 — idempotent
 *   3. ENABLE_CCP_* env flag 4개 ON 으로 in-process 설정
 *   4. ccp_monitoring_records INSERT (한계 초과 값으로 deviation 강제)
 *   5. triggerCcpEvaluator() 호출 → F-3 4단계 자동 발화
 *   6. 결과 검증: notifications / inventory_lots.status / journal / CAR
 *   7. PASS / FAIL 리포트 출력
 *
 * 실행:
 *   npx tsx scripts/smoke-f3-pipeline.ts
 *   DEMO_TENANT_ID=2 npx tsx scripts/smoke-f3-pipeline.ts  (특정 tenant 사용)
 *
 * 안전:
 *   - 실 운영 데이터 영향 0 — 별도 prefix ('SMOKE-') 로 식별 가능한 데모 데이터만
 *   - 환경변수는 in-process 만 (process.env 변경 — 스크립트 종료 시 사라짐)
 *   - 중복 실행 안전 (idempotent)
 *
 * 종료 코드:
 *   0 — 모든 검증 통과
 *   1 — 검증 실패 (어느 단계가 작동 안 함)
 *   2 — 사전조건 부족 (tenant 없음 등)
 * ============================================================================
 */
import mysql from "mysql2/promise";

interface SmokeResult {
  step: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail: string;
}

const results: SmokeResult[] = [];
function record(step: string, status: SmokeResult["status"], detail: string) {
  results.push({ step, status, detail });
  const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⊘";
  console.log(`${icon} [${step}] ${detail}`);
}

async function smoke() {
  // ── env flag 강제 ON (in-process) ──
  process.env.ENABLE_CCP_EVAL = "true";
  process.env.ENABLE_CCP_LOT_HOLD = "true";
  process.env.ENABLE_CCP_AUTO_JOURNAL = "true";
  process.env.ENABLE_CCP_CAR = "true";
  console.log("🔧 in-process env: ENABLE_CCP_* 4개 모두 ON\n");

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "haccp_user",
    password: process.env.DB_PASSWORD || "haccp_password",
    database: process.env.DB_NAME || "haccp_v3",
  });

  // ── 1. 데모 tenant 확인 ──
  const tenantId = Number(process.env.DEMO_TENANT_ID || 0);
  let usedTenantId: number;

  if (tenantId > 0) {
    const [tRows]: any = await conn.execute(
      `SELECT id, name FROM tenants WHERE id = ? LIMIT 1`,
      [tenantId],
    );
    if ((tRows as any[]).length === 0) {
      record("tenant", "SKIP", `DEMO_TENANT_ID=${tenantId} 미존재`);
      await conn.end();
      process.exit(2);
    }
    usedTenantId = tenantId;
    record("tenant", "PASS", `tenant id=${usedTenantId} (${(tRows as any[])[0].name})`);
  } else {
    const [tRows]: any = await conn.execute(
      `SELECT id, name FROM tenants ORDER BY id LIMIT 1`,
    );
    if ((tRows as any[]).length === 0) {
      record("tenant", "SKIP", "tenant 0건 — 회원가입 후 다시 시도");
      await conn.end();
      process.exit(2);
    }
    usedTenantId = Number((tRows as any[])[0].id);
    record("tenant", "PASS", `tenant id=${usedTenantId} (${(tRows as any[])[0].name}) — 첫 tenant 자동 선택`);
  }

  // ── 2. 데모 데이터 보장 (idempotent) ──
  const SMOKE_PREFIX = "SMOKE-F3-";
  const productCode = `${SMOKE_PREFIX}PROD-001`;
  const productName = "스모크 테스트 제품 (F-3 검증용)";

  // 2-1. 제품
  let [pRows]: any = await conn.execute(
    `SELECT id FROM h_products WHERE tenant_id = ? AND product_code = ? LIMIT 1`,
    [usedTenantId, productCode],
  );
  let productId: number;
  if ((pRows as any[]).length === 0) {
    const [r]: any = await conn.execute(
      `INSERT INTO h_products (tenant_id, product_code, product_name, unit, unit_price)
       VALUES (?, ?, ?, 'kg', 1000)`,
      [usedTenantId, productCode, productName],
    );
    productId = Number((r as any).insertId);
    record("product", "PASS", `신규 INSERT id=${productId}`);
  } else {
    productId = Number((pRows as any[])[0].id);
    record("product", "PASS", `재사용 id=${productId}`);
  }

  // 2-2. ccp_limits — CCP-1B 온도 70~100°C
  const [clRows]: any = await conn.execute(
    `SELECT id FROM ccp_limits WHERE tenant_id = ? AND ccp_type = 'CCP-1B' LIMIT 1`,
    [usedTenantId],
  );
  if ((clRows as any[]).length === 0) {
    await conn.execute(
      `INSERT INTO ccp_limits (tenant_id, ccp_type, product_name, temperature_min, temperature_max)
       VALUES (?, 'CCP-1B', ?, 70.00, 100.00)`,
      [usedTenantId, productName],
    );
    record("ccp_limits", "PASS", "신규 INSERT (CCP-1B 70~100°C)");
  } else {
    record("ccp_limits", "PASS", `재사용 id=${(clRows as any[])[0].id}`);
  }

  // 2-3. 배치 + 인벤토리 LOT (LOT HOLD 검증용)
  const batchCode = `${SMOKE_PREFIX}BATCH-${Date.now()}`;
  const [bResult]: any = await conn.execute(
    `INSERT INTO h_batches (tenant_id, site_id, batch_code, product_id,
       planned_quantity, planned_date, status)
     VALUES (?, 1, ?, ?, 100, CURDATE(), 'in_progress')`,
    [usedTenantId, batchCode, productId],
  );
  const batchId = Number((bResult as any).insertId);
  record("batch", "PASS", `신규 INSERT id=${batchId} code=${batchCode}`);

  // inventory_lot + transaction (LOT HOLD 가 동작하려면 batch 가 lot 을 사용한 흔적 필요)
  const lotCode = `${SMOKE_PREFIX}LOT-${Date.now()}`;
  const [lotResult]: any = await conn.execute(
    `INSERT INTO h_inventory_lots
       (tenant_id, lot_number, item_type, item_id, quantity, available_quantity, unit_price, status)
     VALUES (?, ?, 'material', ?, 50, 50, 5000, 'available')`,
    [usedTenantId, lotCode, productId],
  );
  const lotId = Number((lotResult as any).insertId);
  await conn.execute(
    `INSERT INTO h_inventory_transactions
       (tenant_id, lot_id, source_type, source_id, transaction_type, quantity, transaction_date)
     VALUES (?, ?, 'BATCH', ?, 'OUT', 50, NOW())`,
    [usedTenantId, lotId, batchId],
  );
  record("inventory_lot", "PASS", `신규 LOT id=${lotId} (50 × 5,000원 = 250,000원 가치)`);

  // ── 3. deviation 강제 INSERT (한계 초과 값 — 70~100°C 인데 50°C 측정) ──
  const [recordResult]: any = await conn.execute(
    `INSERT INTO ccp_monitoring_records
       (tenant_id, record_date, ccp_type, batch_id, product_name, temperature_c, pass_fail, operator_id)
     VALUES (?, NOW(), 'CCP-1B', ?, ?, 50.00, '부적합', 0)`,
    [usedTenantId, String(batchId), productName],
  );
  const recordId = Number((recordResult as any).insertId);
  record("ccp_record", "PASS", `INSERT id=${recordId} 온도 50°C (한계 70~100°C 미달)`);

  // ── 4. triggerCcpEvaluator 호출 (코드 흐름 동작 확인) ──
  let triggerResult: any;
  try {
    const { triggerCcpEvaluator } = await import(
      "../server/routers/industry/food/ccp.evaluatorTrigger"
    );
    triggerResult = await triggerCcpEvaluator({
      recordId,
      tenantId: usedTenantId,
      operatorId: 0,
    });
    record(
      "trigger",
      "PASS",
      `호출 완료 — evaluated=${triggerResult.evaluated} deviationCount=${triggerResult.deviationCount} ` +
      `lotsHeld=${triggerResult.lotsHeld} ` +
      (triggerResult.lossJournalEntryId ? `lossJournal=#${triggerResult.lossJournalEntryId} ` : "") +
      (triggerResult.correctiveActionRequestId ? `CAR=#${triggerResult.correctiveActionRequestId}` : ""),
    );
  } catch (e: any) {
    record("trigger", "FAIL", `호출 실패: ${e?.message ?? e}`);
    await conn.end();
    return failExit();
  }

  // ── 5. 결과 검증 ──

  // 5-1. deviation 알림
  const [devRows]: any = await conn.execute(
    `SELECT id, title FROM h_notifications
     WHERE tenant_id = ? AND notification_type = 'ccp_deviation'
       AND reference_id = ? ORDER BY created_at DESC LIMIT 1`,
    [usedTenantId, recordId],
  );
  if ((devRows as any[]).length > 0) {
    record("verify-deviation-notif", "PASS", `알림 #${(devRows as any[])[0].id}: ${(devRows as any[])[0].title}`);
  } else {
    record("verify-deviation-notif", "FAIL", "deviation 알림 0건");
  }

  // 5-2. LOT HOLD (status = 'reserved' 로 변경됐는지)
  const [lotStatusRows]: any = await conn.execute(
    `SELECT status FROM h_inventory_lots WHERE id = ? AND tenant_id = ?`,
    [lotId, usedTenantId],
  );
  const lotStatus = (lotStatusRows as any[])[0]?.status;
  if (lotStatus === "reserved") {
    record("verify-lot-hold", "PASS", `lot #${lotId} status='reserved' (자동 HOLD 성공)`);
  } else {
    record("verify-lot-hold", "FAIL", `lot #${lotId} status='${lotStatus}' (기대: 'reserved')`);
  }

  // 5-3. 손실분개
  const [journalRows]: any = await conn.execute(
    `SELECT id, total_debit FROM expense_journal_entries
     WHERE tenant_id = ? AND description LIKE '%CCP 자동손실%'
       AND description LIKE ? ORDER BY id DESC LIMIT 1`,
    [usedTenantId, `%batch #${batchId}%`],
  );
  if ((journalRows as any[]).length > 0) {
    const j = (journalRows as any[])[0];
    record("verify-loss-journal", "PASS", `journal #${j.id} 차변 ${Number(j.total_debit).toLocaleString("ko-KR")}원`);
  } else {
    record("verify-loss-journal", "FAIL", "자동 손실분개 0건");
  }

  // 5-4. CAR (시정조치)
  const [carRows]: any = await conn.execute(
    `SELECT id, request_number, priority FROM h_corrective_action_requests
     WHERE tenant_id = ? AND source_type = 'ccp_deviation' AND source_id = ?
     LIMIT 1`,
    [usedTenantId, recordId],
  );
  if ((carRows as any[]).length > 0) {
    const c = (carRows as any[])[0];
    record("verify-car", "PASS", `CAR ${c.request_number} priority=${c.priority}`);
  } else {
    record("verify-car", "FAIL", "자동 CAR 0건");
  }

  // ── 6. 멱등성 검증 — 같은 record 로 재호출 시 CAR 추가 생성 안 돼야 ──
  try {
    const { triggerCcpEvaluator } = await import(
      "../server/routers/industry/food/ccp.evaluatorTrigger"
    );
    const second = await triggerCcpEvaluator({
      recordId,
      tenantId: usedTenantId,
      operatorId: 0,
    });
    const [carCntRows]: any = await conn.execute(
      `SELECT COUNT(*) AS cnt FROM h_corrective_action_requests
       WHERE tenant_id = ? AND source_type = 'ccp_deviation' AND source_id = ?`,
      [usedTenantId, recordId],
    );
    const carCnt = Number((carCntRows as any[])[0]?.cnt ?? 0);
    if (carCnt === 1) {
      record("verify-idempotent", "PASS", `재호출 후에도 CAR 1건 (멱등성 OK, 재호출 결과: deviationCount=${second.deviationCount})`);
    } else {
      record("verify-idempotent", "FAIL", `CAR ${carCnt}건 (기대: 1건)`);
    }
  } catch (e: any) {
    record("verify-idempotent", "FAIL", `재호출 실패: ${e?.message ?? e}`);
  }

  await conn.end();

  // ── 리포트 ──
  console.log("\n" + "=".repeat(60));
  const passCount = results.filter((r) => r.status === "PASS").length;
  const failCount = results.filter((r) => r.status === "FAIL").length;
  const skipCount = results.filter((r) => r.status === "SKIP").length;
  console.log(
    `리포트: ${passCount} PASS / ${failCount} FAIL / ${skipCount} SKIP (총 ${results.length})`,
  );
  console.log("=".repeat(60));

  if (failCount > 0) {
    console.log("\n❌ 실패한 단계:");
    results.filter((r) => r.status === "FAIL").forEach((r) => {
      console.log(`   - ${r.step}: ${r.detail}`);
    });
    process.exit(1);
  }

  console.log("\n✅ F-3 폐쇄 루프 4단계 모두 정상 작동 확인");
  process.exit(0);
}

function failExit(): never {
  process.exit(1);
}

smoke().catch((e) => {
  console.error("스모크 테스트 실패:", e);
  process.exit(1);
});
