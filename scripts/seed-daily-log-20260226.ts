/**
 * 일일일지 시드 스크립트 - 2026-02-26 실 운영 데이터 입력
 * 사용법: npx tsx scripts/seed-daily-log-20260226.ts
 */
// .env 파일 로드 (dotenv가 없으면 환경변수에서 직접 읽음)
try { require("dotenv/config"); } catch { /* dotenv not available */ }
// DATABASE_URL이 없으면 .env 파일에서 직접 읽기
if (!process.env.DATABASE_URL) {
  try {
    const fs = require("fs");
    const path = require("path");
    const envPath = path.resolve(__dirname, "../.env");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      for (const line of envContent.split("\n")) {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {}
}

async function main() {
  const { getDb } = await import("../server/db");
  const { sql } = await import("drizzle-orm");

  const db = await getDb();
  if (!db) {
    console.error("❌ DB 연결 실패");
    process.exit(1);
  }

  const LOG_DATE = "2026-02-26";
  const TENANT_ID = 1;
  const SITE_ID = 1;
  const CREATED_BY = 1; // 시스템 관리자

  // ── 1. 일반위생관리 및 공정점검표 ──
  const hygieneChecks = [
    { category: "작업전", subcategory: "개인위생", itemOrder: 1, itemText: "위생복장과 외출 복장이 구분하여 보관되고 있는가?", checkResult: "yes" },
    { category: "작업전", subcategory: "개인위생", itemOrder: 2, itemText: "종사자의 건강상태가 양호하고 개인 장신구 등을 소지하지 않으며, 청결한 위생복장을 착용하고 작업하고 있는가?", checkResult: "yes" },
    { category: "작업전", subcategory: "개인위생", itemOrder: 3, itemText: "위생설비(손 세척기 등) 중 이상이 있는 것이 없으며, 종사자는 위생처리를 하고 입실하는가?", checkResult: "yes" },
    { category: "작업전", subcategory: "방충방서", itemOrder: 4, itemText: "작업장은 밀폐가 잘 이루어지고 있으며, 방충시설(방충망 파손 등)에는 이상이 없는가?", checkResult: "yes" },
    { category: "작업전", subcategory: "설비", itemOrder: 5, itemText: "파손되거나 고장 난 제조설비가 없는가?", checkResult: "yes" },
    { category: "입고시", subcategory: "보관", itemOrder: 6, itemText: "냉장/냉동창고의 온도는 적절히 관리되고 있는가? (냉장창고 : 0~10℃, 냉동창고 : -18℃이하)", checkResult: "yes" },
    { category: "출하시", subcategory: "운송", itemOrder: 7, itemText: "완제품을 운송하는 중 온도기준을 준수하였는가?(자동온도기록지 별도관리)", checkResult: "yes" },
    { category: "작업중", subcategory: "공정관리", itemOrder: 8, itemText: "청결구역작업과 일반구역작업이 분리되어 있으며 오염되지 않도록 관리되고 있는가?", checkResult: "yes" },
    { category: "작업중", subcategory: "공정관리", itemOrder: 9, itemText: "가열후 식힘 공정이 적절히 관리되고 있는가?", checkResult: "yes" },
    { category: "작업중", subcategory: "공정관리", itemOrder: 10, itemText: "완제품의 포장 상태는 양호한가?", checkResult: "yes" },
    { category: "작업중", subcategory: "공정관리", itemOrder: 11, itemText: "모니터링장비(탐침온도계 등)는 사용전후 세척·소독을 실시하고 있는가?", checkResult: "yes" },
    { category: "작업후", subcategory: "방충방서", itemOrder: 12, itemText: "작업장 주변의 음식물 폐기물은 잘 정리되어 보관되어지고 있고, 주기적으로 반출되고 있는가?", checkResult: "yes" },
    { category: "작업후", subcategory: "청소소독", itemOrder: 13, itemText: "작업장 바닥, 배수로, 위생시설, 제조설비(식품과 직접 닿는 부분)의 청소·소독 상태는 양호한가?", checkResult: "yes" },
    { category: "작업후", subcategory: "설비", itemOrder: 14, itemText: "파손되거나 고장 난 제조설비가 없는가?", checkResult: "yes" },
    { category: "작업후", subcategory: "점검", itemOrder: 15, itemText: "중요관리점(CCP) 점검표를 작성 주기에 맞게 작성하고, 한계기준 이탈 시 적절히 개선조치 하였는가?", checkResult: "yes" },
    { category: "작업후", subcategory: "보관", itemOrder: 16, itemText: "사용 후 보관하고 있는 원‧부재료 등은 교차오염의 우려가 없도록 구분, 이격관리 및 밀봉하여 관리하고 있는가?", checkResult: "yes" },
    { category: "입고시", subcategory: "입고검수", itemOrder: 17, itemText: "원·부재료 입고 시 시험성적서를 수령하거나, 육안검사를 실시하고 있는가?", checkResult: "yes" },
    { category: "출하시", subcategory: "운송", itemOrder: 18, itemText: "완제품 운송차량 내부는 청결하고 다른 물품과 구분하여 적재되어 있으며, 차량의 온도는 기준을 준수하고 있는가?", checkResult: "yes" },
  ];
  const hygieneNotes = { specialNotes: "", improvementAction: "", actionBy: "", confirmedBy: "" };

  // ── 2. 이물관리 점검표 ──
  const foreignMaterialChecks = [
    { category: "원료 입고중 이물관리", itemOrder: 1, itemText: "원·부자재 입고시 외부의 이물을 제거한 후 입고하는가?", checkResult: "yes" },
    { category: "원료 입고중 이물관리", itemOrder: 2, itemText: "원·부자재 선별시 적합하게 이루어지고 있는가?", checkResult: "yes" },
    { category: "공정중 혼입관리", itemOrder: 3, itemText: "원·부재료 전처리시 연질·경질이물이 혼입되지 않게 폐기하는가?", checkResult: "yes" },
    { category: "공정중 혼입관리", itemOrder: 4, itemText: "공정중 이용하는 작업도구 중 재질이 벗겨진 자재를 사용하지 않는가?", checkResult: "yes" },
    { category: "작업자에 의한 이물혼입 관리", itemOrder: 5, itemText: "작업장에 개인소지품등을 소지하지 않았으며 지정된 위생복 및 위생화등을 착용하였는가?", checkResult: "yes" },
    { category: "작업자에 의한 이물혼입 관리", itemOrder: 6, itemText: "장갑 등 착용상태가 올바르며 파손 부위는 없는가?", checkResult: "yes" },
    { category: "작업자에 의한 이물혼입 관리", itemOrder: 7, itemText: "작업도구, 공구, 필기도구 등은 지정된 위치에 보관되어 있는가?", checkResult: "yes" },
    { category: "작업자에 의한 이물혼입 관리", itemOrder: 8, itemText: "작업에 클립, 핀 칼날등 이물혼입 우려가 있는 불필요한 물품이 없는가?", checkResult: "yes" },
    { category: "작업자에 의한 이물혼입 관리", itemOrder: 9, itemText: "작업장에 출입하기전 끈끈이 롤러등 이물제거 후 입실하는가?", checkResult: "yes" },
    { category: "제조설비에 의한 이물혼입 관리", itemOrder: 10, itemText: "탈락의 우려가 있는 나사류 및 파손 우려가 있는 설비는 없는가?", checkResult: "yes" },
    { category: "제조설비에 의한 이물혼입 관리", itemOrder: 11, itemText: "설비등은 주기적으로 세척소독하여 오염물질이 혼입되지 않게 관리하는가?", checkResult: "yes" },
    { category: "제조설비에 의한 이물혼입 관리", itemOrder: 12, itemText: "세척소독 및 정비후 나사, 볼트 등의 누락된 곳은 없는가?", checkResult: "yes" },
    { category: "해충등 혼입관리", itemOrder: 13, itemText: "작업장 출입문, 외부의 벽 등은 틈이나 구멍이 없이 밀폐되어있는가?", checkResult: "yes" },
    { category: "해충등 혼입관리", itemOrder: 14, itemText: "포충등 및 포획장비는 정상작동되며 지정된 위치가 있는가?", checkResult: "yes" },
  ];
  const foreignMaterialNotes = { specialNotes: "", improvementAction: "", actionBy: "", confirmedBy: "" };

  // ── 3. 원재료실 온/습도 점검기록지 ──
  const temperatureHumidity = [
    { roomName: "원재료실1", timePeriod: "오전", checkTime: "07:58", temperature: "12.1", humidity: "43.6", evaluation: "yes" },
    { roomName: "원재료실1", timePeriod: "오후", checkTime: "17:56", temperature: "15.3", humidity: "48.0", evaluation: "yes" },
    { roomName: "원재료실2", timePeriod: "오전", checkTime: "07:59", temperature: "17.7", humidity: "29", evaluation: "yes" },
    { roomName: "원재료실2", timePeriod: "오후", checkTime: "17:57", temperature: "18.2", humidity: "32", evaluation: "yes" },
  ];
  const temperatureHumidityIssues = { issueDescription: "", actionTaken: "", completionDate: "", actionBy: "", confirmedBy: "" };

  // ── 4. 급속냉동고 / 냉동고 온도 점검기록지 ──
  const freezerTemperature = [
    { timePeriod: "오전", checkTime: "08:00", rapidFreezerTemp: "-32.5", freezerTemp: "-21.4", evaluation: "yes" },
    { timePeriod: "오후", checkTime: "17:58", rapidFreezerTemp: "-29.6", freezerTemp: "-18.1", evaluation: "yes" },
  ];
  const freezerIssues = { issueDescription: "", actionTaken: "", completionDate: "", actionBy: "", confirmedBy: "" };

  // ── 5. 원재료 냉장고 온도 점검 기록지 ──
  const refrigeratorTemperature = [
    { timePeriod: "오전", checkTime: "07:58", temperature: "1.0", evaluation: "yes" },
    { timePeriod: "오후", checkTime: "17:56", temperature: "1.0", evaluation: "yes" },
  ];
  const refrigeratorIssues = { issueDatetime: "", issueDescription: "", actionTaken: "", completionDate: "", actionBy: "", confirmedBy: "" };

  // ── 결재 정보 ──
  const approvalInfo = {
    writerName: "이정언",
    reviewerName: "이준석",
    approverName: "이정언",
  };

  // ── formData 통합 ──
  const formData = {
    date: LOG_DATE,
    checkerName: "이정언",
    hygieneChecks,
    hygieneNotes,
    foreignMaterialChecks,
    foreignMaterialNotes,
    temperatureHumidity,
    temperatureHumidityIssues,
    freezerTemperature,
    freezerIssues,
    refrigeratorTemperature,
    refrigeratorIssues,
    approval: approvalInfo,
    managementStandards: {
      temperatureHumidity: "온도: 1℃~35℃, 습도: 65%이하",
      freezer: "급속냉동고: -27℃ 이하, 냉동고: -18℃이하",
      refrigerator: "온도: 0℃~10℃",
    },
  };

  const title = `일일일지 - ${LOG_DATE}`;
  const formDataStr = JSON.stringify(formData);

  // 기존 데이터 확인
  const existing = await db.execute(sql`
    SELECT id FROM h_generic_checklist_records
    WHERE form_type = 'daily_log'
      AND form_date = ${LOG_DATE}
      AND tenant_id = ${TENANT_ID}
    LIMIT 1
  `);
  const existingRows = (existing as any)[0] || [];

  if (existingRows.length > 0) {
    const id = existingRows[0].id;
    await db.execute(sql`
      UPDATE h_generic_checklist_records
      SET form_data = ${formDataStr},
          status = 'draft',
          title = ${title},
          updated_at = NOW()
      WHERE id = ${id}
    `);
    console.log(`✅ 기존 일일일지 업데이트 완료 (id=${id})`);
  } else {
    // tenant_seq 계산
    const seqR = await db.execute(sql`
      SELECT COALESCE(MAX(tenant_seq), 0) + 1 as ns
      FROM h_generic_checklist_records
      WHERE form_type = 'daily_log' AND tenant_id = ${TENANT_ID} AND YEAR(created_at) = YEAR(NOW())
    `);
    const nextSeq = Number((seqR as any)[0]?.[0]?.ns || 1);

    const ins = await db.execute(sql`
      INSERT INTO h_generic_checklist_records
        (site_id, tenant_id, form_type, tenant_seq, form_date, title, form_data, status, created_by, created_at)
      VALUES
        (${SITE_ID}, ${TENANT_ID}, 'daily_log', ${nextSeq}, ${LOG_DATE}, ${title},
         ${formDataStr}, 'draft', ${CREATED_BY}, NOW())
    `);
    const newId = Number((ins as any)[0]?.insertId || 0);
    console.log(`✅ 일일일지 신규 생성 완료 (id=${newId})`);
  }

  console.log(`📋 데이터 항목:`);
  console.log(`   - 일반위생관리: ${hygieneChecks.length}개 항목`);
  console.log(`   - 이물관리: ${foreignMaterialChecks.length}개 항목`);
  console.log(`   - 원재료실 온/습도: ${temperatureHumidity.length}개 레코드`);
  console.log(`   - 냉동고 온도: ${freezerTemperature.length}개 레코드`);
  console.log(`   - 냉장고 온도: ${refrigeratorTemperature.length}개 레코드`);
  console.log(`   - 점검자: 이정언, 검토자: 이준석, 승인자: 이정언`);
  console.log(`\n🎉 완료! 웹에서 일일일지 → 2026-02-26 으로 확인하세요.`);

  process.exit(0);
}

main().catch((e) => {
  console.error("❌ 실행 실패:", e);
  process.exit(1);
});
