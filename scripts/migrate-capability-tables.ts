/**
 * Capability 테이블 생성 + 표준 capability 시드
 *
 * 배경: docs/architecture/04-policy-registry.md
 *
 * 실행: npx tsx scripts/migrate-capability-tables.ts
 *
 * 이 스크립트는 멱등 (IF NOT EXISTS / INSERT IGNORE).
 * 기존 h_roles / h_user_roles 는 그대로 두고 role_capabilities 만 신규.
 */

import { getRawConnection } from "../server/db/connection";

const CAPABILITY_SEED: Array<{
  featureCode: string;
  actions: string[];
  description: string;
}> = [
  {
    featureCode: "ERP_PURCHASE",
    actions: ["READ", "WRITE", "APPROVE", "CANCEL", "POST", "EXPORT"],
    description: "매입 전표",
  },
  {
    featureCode: "ERP_SALES",
    actions: ["READ", "WRITE", "APPROVE", "CANCEL", "POST", "EXPORT"],
    description: "매출 전표",
  },
  {
    featureCode: "ERP_INVENTORY",
    actions: ["READ", "WRITE", "EXPORT"],
    description: "재고",
  },
  {
    featureCode: "ERP_ACCOUNTING",
    actions: ["READ", "WRITE", "APPROVE", "CANCEL", "POST", "EXPORT"],
    description: "회계 분개",
  },
  {
    featureCode: "ERP_PARTNER",
    actions: ["READ", "WRITE", "EXPORT"],
    description: "거래처",
  },
  {
    featureCode: "ERP_EXPENSE",
    actions: ["READ", "WRITE", "APPROVE", "CANCEL", "POST", "EXPORT"],
    description: "비용 전표",
  },
  {
    featureCode: "MES_WORK_ORDER",
    actions: ["READ", "WRITE", "CANCEL", "EXPORT"],
    description: "작업지시",
  },
  {
    featureCode: "MES_PRODUCTION",
    actions: ["READ", "WRITE", "EXPORT"],
    description: "생산 실적",
  },
  {
    featureCode: "MES_QUALITY",
    actions: ["READ", "WRITE", "APPROVE", "EXPORT"],
    description: "품질 검사",
  },
  {
    featureCode: "MES_LOT",
    actions: ["READ", "WRITE", "CANCEL", "EXPORT"],
    description: "LOT 관리",
  },
  {
    featureCode: "MES_EQUIPMENT",
    actions: ["READ", "WRITE", "EXPORT"],
    description: "설비 관리",
  },
  {
    featureCode: "HACCP_CCP",
    actions: ["READ", "WRITE", "APPROVE", "EXPORT"],
    description: "CCP 기록 (식품)",
  },
  {
    featureCode: "HACCP_CHECKLIST",
    actions: ["READ", "WRITE", "APPROVE", "EXPORT"],
    description: "체크리스트 (식품)",
  },
  {
    featureCode: "HACCP_STANDARDS",
    actions: ["READ", "WRITE", "APPROVE", "EXPORT"],
    description: "기준서 (식품)",
  },
  {
    featureCode: "PLATFORM_USER",
    actions: ["READ", "WRITE", "APPROVE"],
    description: "사용자 관리",
  },
  {
    featureCode: "PLATFORM_BILLING",
    actions: ["READ", "WRITE", "EXPORT"],
    description: "구독/과금",
  },
  {
    featureCode: "PLATFORM_TENANT",
    actions: ["READ", "WRITE"],
    description: "테넌트 설정",
  },
  {
    featureCode: "PLATFORM_AUDIT",
    actions: ["READ", "EXPORT"],
    description: "감사 로그",
  },
  {
    featureCode: "ADDON_AI",
    actions: ["READ", "WRITE"],
    description: "AI 기능",
  },
  {
    featureCode: "ADDON_HR",
    actions: ["READ", "WRITE", "APPROVE", "EXPORT"],
    description: "인사/급여",
  },
  {
    featureCode: "ADDON_BI",
    actions: ["READ", "EXPORT"],
    description: "BI 리포트",
  },
];

async function migrate() {
  console.log("[Migration] Capability 테이블 생성 + 시드 시작...");
  const conn = await getRawConnection();

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS capabilities (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(100) NOT NULL,
      feature_code VARCHAR(50) NOT NULL,
      action VARCHAR(20) NOT NULL,
      description VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_capabilities_code (code),
      UNIQUE KEY uniq_capabilities_feature_action (feature_code, action)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS role_capabilities (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      role_id BIGINT NOT NULL,
      capability_id INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_role_capabilities (tenant_id, role_id, capability_id),
      INDEX idx_role (tenant_id, role_id),
      INDEX idx_capability (capability_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS user_capability_grants (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tenant_id INT NOT NULL,
      user_id BIGINT NOT NULL,
      capability_id INT NOT NULL,
      granted_by BIGINT NULL,
      reason VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NULL,
      UNIQUE KEY uniq_user_capability_grants (tenant_id, user_id, capability_id),
      INDEX idx_user (tenant_id, user_id),
      INDEX idx_capability (capability_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  console.log("[Migration] 테이블 생성 완료. 시드 중...");

  let inserted = 0;
  for (const entry of CAPABILITY_SEED) {
    for (const action of entry.actions) {
      const code = `${entry.featureCode}:${action}`;
      const [result] = await conn.execute(
        `INSERT IGNORE INTO capabilities (code, feature_code, action, description)
         VALUES (?, ?, ?, ?)`,
        [code, entry.featureCode, action, entry.description],
      );
      const affected = (result as { affectedRows: number }).affectedRows;
      if (affected > 0) inserted++;
    }
  }

  console.log(`[Migration] 시드 완료. 신규 capability: ${inserted}개`);
  process.exit(0);
}

migrate().catch((err) => {
  console.error("[Migration] 실패:", err);
  process.exit(1);
});
