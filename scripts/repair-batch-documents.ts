// 배치 문서 복구 도구 (CCP-4P + 일일일지 + 주간/월간/연간 일지)
//
// 배경: 2026-04-13 또는 이전 날짜에 생성된 배치 중 일부가 다음 문서를 누락:
//   1. CCP-4P 금속검출 일일 통합 AR (ccp_form)
//   2. 일일일지 daily_log AR
//   3. 주간/월간/연간 일지 AR
//
// 원인: 구버전 코드에서 status='approved' 로 즉시 등록되어 검토 단계를
//   건너뛰거나, 중간 단계에서 silent catch 로 실패가 무시된 상태.
//
// 이 스크립트는 특정 날짜 범위의 배치를 스캔하여 누락된 문서를 재생성합니다.
// 기존 문서가 있으면 건너뛰므로 중복 생성 없음.
//
// 실행:
//   npx tsx scripts/repair-batch-documents.ts              # 오늘(KST) 복구
//   npx tsx scripts/repair-batch-documents.ts 2026-04-13   # 특정 날짜
//   npx tsx scripts/repair-batch-documents.ts 2026-04-01 2026-04-15  # 범위
//   DRY_RUN=1 npx tsx scripts/repair-batch-documents.ts ...  # 미리보기

import mysql from "mysql2/promise";
import * as fs from "fs";
import * as path from "path";

// .env 파일 직접 파싱
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && m[2].trim().length > 0) {
      const key = m[1];
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const DRY_RUN = process.env.DRY_RUN === "1";

function todayKST(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().split("T")[0];
}

async function main() {
  const args = process.argv.slice(2);
  let startDate: string;
  let endDate: string;
  if (args.length === 0) {
    startDate = endDate = todayKST();
  } else if (args.length === 1) {
    startDate = endDate = args[0];
  } else {
    startDate = args[0];
    endDate = args[1];
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ DATABASE_URL 환경변수가 없습니다.");
    process.exit(1);
  }

  const url = new URL(dbUrl);
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port) || 3306,
    user: url.username,
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    charset: "utf8mb4",
  });

  console.log(`🔧 배치 문서 복구 스크립트 ${DRY_RUN ? "(DRY RUN)" : ""}`);
  console.log(`   대상 날짜: ${startDate} ~ ${endDate}\n`);

  // ─── 1. 대상 날짜 범위의 모든 테넌트/사이트/배치 조회 ───
  const [dateRows]: any = await conn.execute(
    `SELECT DISTINCT
       b.tenant_id, b.site_id, DATE_FORMAT(b.planned_date, '%Y-%m-%d') AS work_date
     FROM h_batches b
     WHERE DATE(b.planned_date) BETWEEN ? AND ?
     ORDER BY b.tenant_id, b.site_id, work_date`,
    [startDate, endDate]
  );
  const dateGroups = dateRows as Array<{ tenant_id: number; site_id: number; work_date: string }>;
  console.log(`1. ${dateGroups.length}개 (tenant, site, date) 그룹 스캔 대상\n`);

  let ccp4pCreated = 0;
  let ccp4pSkipped = 0;
  let dailyLogCreated = 0;
  let dailyLogSkipped = 0;

  for (const group of dateGroups) {
    const { tenant_id, site_id, work_date } = group;

    // 해당 (tenant, site, date) 의 배치 목록
    const [batchRows]: any = await conn.execute(
      `SELECT b.id AS batch_id, b.batch_code, b.product_id, b.planned_quantity,
              p.product_name
       FROM h_batches b
       LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
       WHERE b.tenant_id = ? AND b.site_id = ? AND DATE(b.planned_date) = ?
       ORDER BY b.id ASC`,
      [tenant_id, site_id, work_date]
    );
    const batches = batchRows as any[];
    if (batches.length === 0) continue;

    // 첫 배치 user (created_by) 조회
    const [userRows]: any = await conn.execute(
      `SELECT created_by FROM h_batches WHERE id = ? LIMIT 1`,
      [batches[0].batch_id]
    );
    const createdBy = (userRows as any[])[0]?.created_by || 1;

    console.log(`[${work_date}] tenant=${tenant_id} site=${site_id}: ${batches.length}개 배치`);

    // ─── A. CCP-4P 복구 ───
    const [ccp4pRecRows]: any = await conn.execute(
      `SELECT id, approval_request_id FROM h_ccp_form_records
       WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND work_date = ?
       ORDER BY id ASC LIMIT 1`,
      [tenant_id, work_date]
    );
    const ccp4pRec = (ccp4pRecRows as any[])[0];

    if (ccp4pRec) {
      let needsAr = !ccp4pRec.approval_request_id;
      if (ccp4pRec.approval_request_id) {
        const [arCheck]: any = await conn.execute(
          `SELECT id FROM h_approval_requests WHERE id = ? AND tenant_id = ? LIMIT 1`,
          [ccp4pRec.approval_request_id, tenant_id]
        );
        if ((arCheck as any[]).length === 0) {
          console.log(`   - CCP-4P form_record #${ccp4pRec.id} → stale AR #${ccp4pRec.approval_request_id}`);
          needsAr = true;
        }
      }

      if (needsAr) {
        const productNames = batches.map(b => b.product_name).filter(Boolean).join(", ");
        const title4p = `[CCP 기록지-CCP-4P] ${work_date} 금속검출 통합`;
        const desc4p = `금속검출공정 CCP 기록지 (일일 통합)\n작업일: ${work_date}\n제품: ${productNames}\n배치 수: ${batches.length}건\n[복구 스크립트로 재생성]`;

        if (!DRY_RUN) {
          await conn.execute(
            `UPDATE h_ccp_form_records SET status='submitted', submitted_at=NOW(), writer_id=? WHERE id=? AND tenant_id=?`,
            [createdBy, ccp4pRec.id, tenant_id]
          );
          // stale 이었으면 NULL 먼저
          if (ccp4pRec.approval_request_id) {
            await conn.execute(
              `UPDATE h_ccp_form_records SET approval_request_id=NULL WHERE id=? AND tenant_id=?`,
              [ccp4pRec.id, tenant_id]
            );
          }
          const [arResult]: any = await conn.execute(
            `INSERT INTO h_approval_requests
              (site_id, tenant_id, request_type, reference_type, reference_id,
               title, description, status, priority, requested_by, created_at)
             VALUES (?, ?, 'ccp_form', 'ccp_form_record', ?, ?, ?, 'pending_review', 'high', ?, NOW())`,
            [site_id, tenant_id, ccp4pRec.id, title4p, desc4p, createdBy]
          );
          const arId = (arResult as any).insertId;
          await conn.execute(
            `UPDATE h_ccp_form_records SET approval_request_id=? WHERE id=? AND tenant_id=?`,
            [arId, ccp4pRec.id, tenant_id]
          );
          console.log(`   ✅ CCP-4P AR #${arId} 재생성`);
        } else {
          console.log(`   (dry-run) CCP-4P AR 재생성 예정: ${title4p}`);
        }
        ccp4pCreated++;
      } else {
        ccp4pSkipped++;
      }
    } else {
      console.log(`   ⚠️  CCP-4P form_record 없음 (batchOrchestrator 생성 단계 실패)`);
    }

    // ─── B. 일일일지 복구 ───
    const [dailyChecklistRows]: any = await conn.execute(
      `SELECT id FROM h_generic_checklist_records
       WHERE tenant_id = ? AND site_id = ? AND form_type = 'daily_log' AND form_date = ?
       LIMIT 1`,
      [tenant_id, site_id, work_date]
    );
    const dailyChecklist = (dailyChecklistRows as any[])[0];

    if (!dailyChecklist) {
      // checklist 가 아예 없음 → autoGenerateDailyReport 를 호출해야 하는데
      // 스크립트에서는 간단히 checklist 삽입 + AR 생성만 수행 (form_data 는 빈 구조)
      if (!DRY_RUN) {
        const firstProductName = batches[0].product_name || "미확인";
        const emptyFormData = JSON.stringify({
          date: work_date,
          batches: batches.map(b => ({
            batchId: b.batch_id,
            batchCode: b.batch_code,
            productName: b.product_name,
            plannedQuantity: parseFloat(b.planned_quantity?.toString() || "0"),
          })),
          totalBatches: batches.length,
          autoGenerated: true,
          repairedAt: new Date().toISOString(),
        });
        const [clResult]: any = await conn.execute(
          `INSERT INTO h_generic_checklist_records
            (site_id, tenant_id, form_type, form_date, title, form_data, status, created_by, created_at, updated_at)
           VALUES (?, ?, 'daily_log', ?, ?, ?, 'draft', ?, NOW(), NOW())`,
          [site_id, tenant_id, work_date, `일일일지 - ${work_date}`, emptyFormData, createdBy]
        );
        const clId = (clResult as any).insertId;
        const [arResult]: any = await conn.execute(
          `INSERT INTO h_approval_requests
            (site_id, tenant_id, request_type, reference_type, reference_id,
             title, description, status, priority, requested_by, created_at)
           VALUES (?, ?, 'daily_log', 'checklist', ?, ?, ?, 'pending_review', 'medium', ?, NOW())`,
          [
            site_id, tenant_id, clId,
            `[일일일지] ${work_date} 일반위생관리 및 공정점검표`,
            `작업일: ${work_date}\n배치 수: ${batches.length}건\n생산 제품: ${firstProductName}\n[복구 스크립트로 재생성 - 위생점검 항목 작성 필요]`,
            createdBy,
          ]
        );
        console.log(`   ✅ daily_log checklist #${clId} + AR #${(arResult as any).insertId} 재생성`);
      } else {
        console.log(`   (dry-run) daily_log + AR 재생성 예정`);
      }
      dailyLogCreated++;
    } else {
      // checklist 는 있음 → AR 만 확인
      const [dailyArRows]: any = await conn.execute(
        `SELECT id FROM h_approval_requests
         WHERE tenant_id = ? AND request_type = 'daily_log'
           AND reference_type = 'checklist' AND reference_id = ?
         LIMIT 1`,
        [tenant_id, dailyChecklist.id]
      );
      if ((dailyArRows as any[]).length === 0) {
        // AR 없음 → 생성
        if (!DRY_RUN) {
          const firstProductName = batches[0].product_name || "미확인";
          const [arResult]: any = await conn.execute(
            `INSERT INTO h_approval_requests
              (site_id, tenant_id, request_type, reference_type, reference_id,
               title, description, status, priority, requested_by, created_at)
             VALUES (?, ?, 'daily_log', 'checklist', ?, ?, ?, 'pending_review', 'medium', ?, NOW())`,
            [
              site_id, tenant_id, dailyChecklist.id,
              `[일일일지] ${work_date} 일반위생관리 및 공정점검표`,
              `작업일: ${work_date}\n배치 수: ${batches.length}건\n생산 제품: ${firstProductName}\n[복구 스크립트로 재생성]`,
              createdBy,
            ]
          );
          console.log(`   ✅ 기존 checklist #${dailyChecklist.id} 에 daily_log AR #${(arResult as any).insertId} 추가`);
        } else {
          console.log(`   (dry-run) 기존 checklist #${dailyChecklist.id} 에 AR 추가 예정`);
        }
        dailyLogCreated++;
      } else {
        dailyLogSkipped++;
      }
    }
  }

  console.log(`\n═══════════════════════════════════════`);
  console.log(`📊 복구 결과 ${DRY_RUN ? "(DRY RUN)" : ""}`);
  console.log(`═══════════════════════════════════════`);
  console.log(`  CCP-4P AR 재생성:   ${ccp4pCreated}건 (skip: ${ccp4pSkipped})`);
  console.log(`  일일일지 AR 재생성: ${dailyLogCreated}건 (skip: ${dailyLogSkipped})`);
  console.log(`\n💡 주간/월간/연간 일지는 서버 기동 시 autoGenerateAllPeriodicLogs`);
  console.log(`   로직으로 처리되므로 별도 복구 없음 (다음 배치 생성 시 자동 체크).`);

  await conn.end();
}

main().catch((err) => {
  console.error("❌ 복구 실패:", err);
  process.exit(1);
});
