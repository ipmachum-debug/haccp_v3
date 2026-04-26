/**
 * 4/16 KST 일자에 (UI는 SALE 16건 + BATCH 자동출고를 보여줌)
 * getConsumptionSummary(2026, 4) 의 4/16 day 항목을 그대로 dump
 */
import { config } from "dotenv";
config({ path: "/home/root/haccp_v3/webapp/.env" });

(async () => {
  const { getConsumptionSummary } = await import(
    "../server/db/production/outboundManagement"
  );
  const r: any = await getConsumptionSummary({ year: 2026, month: 4 }, 2);
  const day416 = (r.dailyGroups || []).find((d: any) => d.date.startsWith("2026-04-16"));
  if (!day416) {
    console.log("4/16 not found. Available dates:");
    for (const d of r.dailyGroups || []) console.log(" ", d.date);
    process.exit(0);
  }
  console.log(`=== 4/16 KST: recordCount=${day416.recordCount}, totalQty=${day416.totalQuantity} ===\n`);
  for (const mg of day416.materialGroups) {
    console.log(`[matId=${mg.materialId} name="${mg.materialName}"] subtotal=${mg.subtotalQty}${mg.unit}, items=${mg.items.length}`);
    for (const it of mg.items) {
      console.log(`   sourceType='${it.sourceType}' qty=${it.quantity}${it.unit} sourceId=${it.sourceId} lotNumber=${it.lotNumber} notes="${(it.notes || "").slice(0, 80)}"`);
    }
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
