/**
 * 마이그레이션: iot_devices 테이블에 ccp_type 컬럼 추가 (CP-3-h)
 *
 * 목적: F-3 IoT 폐쇄 루프 — IoT 센서가 측정한 값을 자동으로 ccp_monitoring_records 에
 *       기록하여 평가기 트리거(LOT HOLD → 손실분개 → CAR) 발화시키기 위함.
 *
 * 적용:
 *   - ALTER TABLE iot_devices ADD COLUMN ccp_type VARCHAR(10) NULL
 *   - 기존 디바이스 영향 0 (NULL 이면 기존 동작 그대로)
 *   - 운영자가 device 별로 ccp_type 을 SET 하면 그 디바이스만 CCP 브리지 활성
 *
 * 실행: npx tsx scripts/migrate-iot-ccp-bridge.ts
 *
 * 안전:
 *   - idempotent (이미 컬럼 존재 시 스킵)
 *   - 기본값 NULL — 기존 동작과 호환
 */
import mysql from "mysql2/promise";
import { getDbConfigFromEnv } from "./_lib/db-env.js";

async function migrate() {
  const conn = await mysql.createConnection(getDbConfigFromEnv(process.env));

  console.log("=== 마이그레이션 시작: iot_devices.ccp_type 컬럼 추가 (CP-3-h) ===\n");

  // 1. 컬럼 존재 여부 확인 (idempotent)
  const [cols]: any = await conn.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'iot_devices'
       AND COLUMN_NAME = 'ccp_type'`,
  );

  if ((cols as any[]).length > 0) {
    console.log("✅ ccp_type 컬럼 이미 존재 — 스킵");
  } else {
    console.log("→ ccp_type 컬럼 추가 중...");
    await conn.execute(
      `ALTER TABLE iot_devices
       ADD COLUMN ccp_type VARCHAR(10) NULL
       COMMENT 'CCP 매핑 (예: CCP-1B). NULL 이면 일반 IoT, set 시 ccp_monitoring_records 자동 생성'
       AFTER unit`,
    );
    console.log("✅ ccp_type 컬럼 추가 완료");
  }

  // 2. 결과 확인
  const [rows] = await conn.execute(
    `SELECT id, tenant_id, device_code, device_type, unit, ccp_type, status
     FROM iot_devices
     ORDER BY tenant_id, device_code
     LIMIT 20`,
  );
  console.log("\n=== iot_devices 현황 (상위 20건) ===");
  console.table(rows);

  console.log(
    "\n💡 운영자가 ccp_type 을 SET 하려면:\n" +
    `   UPDATE iot_devices SET ccp_type = 'CCP-1B' WHERE id = ?;\n` +
    `   (예: 가열 공정 온도센서 → CCP-1B)\n`,
  );

  await conn.end();
  console.log("=== 마이그레이션 완료 ===");
}

migrate().catch((e) => {
  console.error("마이그레이션 실패:", e);
  process.exit(1);
});
