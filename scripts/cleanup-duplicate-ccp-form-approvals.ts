/**
 * 중복 ccp_form 승인요청 정리 스크립트
 *
 * 배경: 2026-04-13 이전 코드에서 batch_production 과 ccp_form 승인요청이
 * 모두 생성되어 문서출력 리스트에 동일 배치/CCP 가 두 번씩 노출되었음.
 *
 * 정책: 배치당 1개의 batch_production AR 만 유지, CCP-1B/2B ccp_form AR 제거.
 * 단, CCP-4P(금속검출 통합) 은 별도 문서이므로 유지.
 *
 * 수행 작업:
 *   1. 배치가 있는 ccp_form_records 중 CCP-1B/2B 타입 조회
 *   2. 해당 form_record 의 approval_request_id 를 NULL 로 변경
 *   3. 연결된 h_approval_requests (request_type='ccp_form', reference_type='ccp_form_record')
 *      중 CCP-4P 가 아닌 것만 삭제
 *
 * 실행:
 *   npx tsx scripts/cleanup-duplicate-ccp-form-approvals.ts
 *   # Dry-run:
 *   DRY_RUN=1 npx tsx scripts/cleanup-duplicate-ccp-form-approvals.ts
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

async function cleanup() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "haccp_v3",
  });

  console.log(`🔗 DB 연결 완료 ${DRY_RUN ? "(DRY RUN)" : ""}`);

  try {
    // ─── 1. 대상 조회 ───
    console.log("\n📋 대상 조회: CCP-1B/2B form_record 에 연결된 ccp_form 승인요청");
    const [targets]: any = await connection.execute(`
      SELECT
        ar.id AS ar_id,
        ar.title,
        ar.tenant_id,
        fr.id AS fr_id,
        fr.ccp_type,
        fr.batch_id,
        fr.product_name
      FROM h_approval_requests ar
      JOIN h_ccp_form_records fr ON fr.id = ar.reference_id AND fr.tenant_id = ar.tenant_id
      WHERE ar.request_type = 'ccp_form'
        AND ar.reference_type = 'ccp_form_record'
        AND fr.ccp_type IN ('CCP-1B','CCP-2B')
    `);
    const rows = targets as any[];
    console.log(`  → ${rows.length}건 발견`);

    if (rows.length === 0) {
      console.log("\n🎉 정리할 중복 승인요청이 없습니다.");
      return;
    }

    // ─── 2. 샘플 출력 ───
    console.log("\n샘플 (최대 10건):");
    rows.slice(0, 10).forEach((r: any) => {
      console.log(`  AR#${r.ar_id} fr#${r.fr_id} ${r.ccp_type} - ${r.product_name} (batch=${r.batch_id})`);
    });
    if (rows.length > 10) console.log(`  ... 외 ${rows.length - 10}건`);

    if (DRY_RUN) {
      console.log("\n⚠️  DRY RUN 모드 — 실제 변경 없음");
      return;
    }

    // ─── 3. form_record.approval_request_id NULL 처리 ───
    console.log("\n📋 form_record.approval_request_id NULL 처리...");
    const arIds = rows.map((r: any) => r.ar_id);
    const placeholders = arIds.map(() => "?").join(",");
    const [updResult]: any = await connection.execute(
      `UPDATE h_ccp_form_records
       SET approval_request_id = NULL
       WHERE approval_request_id IN (${placeholders})`,
      arIds,
    );
    console.log(`  ✅ ${(updResult as any).affectedRows || 0} form_record 갱신 완료`);

    // ─── 4. h_approval_requests 삭제 ───
    console.log("\n📋 h_approval_requests 삭제...");
    const [delResult]: any = await connection.execute(
      `DELETE FROM h_approval_requests WHERE id IN (${placeholders})`,
      arIds,
    );
    console.log(`  ✅ ${(delResult as any).affectedRows || 0}건 삭제 완료`);

    console.log("\n🎉 중복 ccp_form 승인요청 정리 완료!");
    console.log("   이제 각 배치당 batch_production 승인요청 1건만 남아 있습니다.");
  } catch (err) {
    console.error("❌ 정리 실패:", err);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

cleanup();
