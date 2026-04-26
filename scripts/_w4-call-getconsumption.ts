/**
 * 실제 getConsumptionSummary(2026, 4) 호출 결과를 그대로 출력하여
 * 4/16, 4/10 일자 행에 SALE 행이 있는지 확인
 */
import { config } from "dotenv";
config({ path: "/home/root/haccp_v3/webapp/.env" });

(async () => {
  const { getConsumptionSummary } = await import(
    "../server/db/production/outboundManagement"
  );
  const result: any = await getConsumptionSummary(
    { year: 2026, month: 4 },
    2 /* tenant_id */
  );

  // 일별 그룹 중 4/16, 4/10 추출
  const dailyGroups = result.dailyGroups || result.daily || result.days || result;
  console.log("Top-level keys:", Object.keys(result));

  // 화면 보이는 것 ─ 일별 그룹화
  if (Array.isArray(dailyGroups)) {
    for (const day of dailyGroups) {
      const date = day.date || day.txDate;
      if (date && (date.includes("2026-04-16") || date.includes("2026-04-10"))) {
        console.log(`\n=== ${date} ===`);
        console.log(`  totalQuantity: ${day.totalQuantity}, totalAmount: ${day.totalAmount}, recordCount: ${day.recordCount}`);
        for (const mg of (day.materialGroups || [])) {
          console.log(`  [material ${mg.materialId} ${mg.materialName}] subtotal ${mg.subtotalQty}${mg.unit}, items=${mg.items.length}`);
          for (const it of mg.items) {
            console.log(`     - sourceType='${it.sourceType}' qty=${it.quantity}${it.unit} matId=${it.materialId} matName=${it.materialName} notes=${(it.notes || "").slice(0, 60)}`);
          }
        }
      }
    }
  } else {
    console.log("No dailyGroups array found, raw result:", JSON.stringify(result, null, 2).slice(0, 2000));
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
