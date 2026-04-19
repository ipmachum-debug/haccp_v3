/**
 * 재고 시드 스크립트 - accounting_purchases → h_inventory + h_inventory_lots + h_inventory_transactions
 *
 * 매입(입고) 데이터를 기반으로 재고 현황을 생성합니다.
 * - h_inventory: 원재료별 총 재고량 (집계)
 * - h_inventory_lots: 입고 건별 LOT 단위 재고
 * - h_inventory_transactions: 입고(receipt) 트랜잭션 기록
 */

import mysql from "mysql2/promise";

const TENANT_ID = 2;
const SITE_ID = 1;
const CREATED_BY = 4; // 한상갑 (admin)

// 매입 item_name → h_materials material_id 매핑
const MATERIAL_MAP: Record<string, number> = {
  "검정깨(흑임자)": 584,
  "기타가공품(흑임자가루)": 594,
  "냉동쑥(국내산)": 596,
  "냉동증숙고구마(중국산)": 597,
  "두류가공품(콩고물)": 609,
  "두류가공품(통팥고물)": 610,
  "물엿(저당물엿)": 617,
  설탕: 624,
  "조림류(통팥앙금)": 641,
  참깨: 644, // 참깨(인도산,나이지리아산,탄자니아산,미얀마산)
  "찹쌀(국내산)": 645,
  천일염: 646,
  "콩기름(대두유)": 649,
  화이트초콜릿: 658,
  "흑미찹쌀(국내산)": 659,
};

// partner_id → supplier_name 매핑
const SUPPLIER_MAP: Record<number, string> = {
  38: "네이버파이낸셜",
  42: "농업회사법인㈜이수농산",
  43: "주식회사동아식품",
  44: "한결제과제빵",
};

// 원재료별 유통기한 (일) - 실제 식품 기준 합리적 추정
const SHELF_LIFE_DAYS: Record<string, number> = {
  "검정깨(흑임자)": 365,
  "기타가공품(흑임자가루)": 180,
  "냉동쑥(국내산)": 365,
  "냉동증숙고구마(중국산)": 365,
  "두류가공품(콩고물)": 90,
  "두류가공품(통팥고물)": 90,
  "물엿(저당물엿)": 365,
  설탕: 730,
  "조림류(통팥앙금)": 90,
  참깨: 365,
  "찹쌀(국내산)": 365,
  천일염: 1095,
  "콩기름(대두유)": 365,
  화이트초콜릿: 365,
  "흑미찹쌀(국내산)": 365,
};

async function main() {
  const conn = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: process.env.DB_PASSWORD || "",
    database: "haccp_tenant_db",
  });

  try {
    console.log("=== 재고 시드 스크립트 시작 ===\n");

    // 1. 기존 데이터 정리 (tenant 2만)
    await conn.execute(
      "DELETE FROM h_inventory_transactions WHERE tenant_id = ?",
      [TENANT_ID]
    );
    await conn.execute("DELETE FROM h_inventory_lots WHERE tenant_id = ?", [
      TENANT_ID,
    ]);
    await conn.execute("DELETE FROM h_inventory WHERE tenant_id = ?", [
      TENANT_ID,
    ]);
    console.log("기존 재고 데이터 초기화 완료\n");

    // 2. accounting_purchases에서 매입 데이터 가져오기
    const [purchases] = (await conn.execute(
      `SELECT ap.id, ap.transaction_date, ap.partner_id, ap.item_name, 
              ap.quantity, ap.unit, ap.unit_price, ap.total_amount
       FROM accounting_purchases ap 
       WHERE ap.tenant_id = ? AND ap.status = 'approved'
       ORDER BY ap.transaction_date, ap.id`,
      [TENANT_ID]
    )) as any[];

    console.log(`매입 데이터: ${purchases.length}건\n`);

    // 3. 원재료별 집계 (h_inventory 레코드용)
    const inventoryAgg: Record<
      number,
      {
        materialId: number;
        itemName: string;
        totalQty: number;
        unit: string;
      }
    > = {};

    for (const p of purchases) {
      const materialId = MATERIAL_MAP[p.item_name];
      if (!materialId) {
        console.warn(`⚠️ 매핑 없음: ${p.item_name}`);
        continue;
      }
      if (!inventoryAgg[materialId]) {
        inventoryAgg[materialId] = {
          materialId,
          itemName: p.item_name,
          totalQty: 0,
          unit: p.unit || "kg",
        };
      }
      inventoryAgg[materialId].totalQty += parseFloat(p.quantity);
    }

    // 4. h_inventory 삽입 (원재료별 1건)
    const inventoryIdMap: Record<number, number> = {}; // materialId → inventory.id

    for (const agg of Object.values(inventoryAgg)) {
      const [result] = (await conn.execute(
        `INSERT INTO h_inventory (tenant_id, site_id, material_id, item_name, 
         total_quantity, available_quantity, reserved_quantity, unit, location)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, '원재료 창고')`,
        [
          TENANT_ID,
          SITE_ID,
          agg.materialId,
          agg.itemName,
          agg.totalQty.toFixed(3),
          agg.totalQty.toFixed(3),
          agg.unit,
        ]
      )) as any;
      inventoryIdMap[agg.materialId] = result.insertId;
    }

    console.log(
      `h_inventory 삽입: ${Object.keys(inventoryIdMap).length}건\n`
    );

    // 5. h_inventory_lots + h_inventory_transactions 삽입 (매입 건별)
    let lotCount = 0;
    let txnCount = 0;
    // LOT 번호 생성용 일별 시퀀스
    const lotSeqByDate: Record<string, number> = {};

    for (const p of purchases) {
      const materialId = MATERIAL_MAP[p.item_name];
      if (!materialId) continue;

      const inventoryId = inventoryIdMap[materialId];
      const supplierName = SUPPLIER_MAP[p.partner_id] || "알 수 없음";
      const txDate =
        typeof p.transaction_date === "string"
          ? p.transaction_date
          : new Date(p.transaction_date).toISOString().slice(0, 10);

      // LOT 번호: LOT-YYYYMMDD-NNNN
      const dateKey = txDate.replace(/-/g, "");
      lotSeqByDate[dateKey] = (lotSeqByDate[dateKey] || 0) + 1;
      const lotNumber = `LOT-${dateKey}-${String(lotSeqByDate[dateKey]).padStart(4, "0")}`;

      // 유통기한 = 입고일 + shelf_life_days
      const shelfDays = SHELF_LIFE_DAYS[p.item_name] || 180;
      const receiptDate = new Date(txDate);
      const expiryDate = new Date(receiptDate);
      expiryDate.setDate(expiryDate.getDate() + shelfDays);
      const expiryDateStr = expiryDate.toISOString().slice(0, 10);

      const qty = parseFloat(p.quantity);
      const unitPrice = parseFloat(p.unit_price);

      // h_inventory_lots 삽입
      const [lotResult] = (await conn.execute(
        `INSERT INTO h_inventory_lots 
         (inventory_id, lot_number, material_id, quantity, available_quantity, 
          unit, unit_price, receipt_date, expiry_date, supplier_name, 
          location, status, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '원재료 창고', 'available', ?)`,
        [
          inventoryId,
          lotNumber,
          materialId,
          qty.toFixed(3),
          qty.toFixed(3),
          p.unit || "kg",
          unitPrice.toFixed(2),
          txDate,
          expiryDateStr,
          supplierName,
          TENANT_ID,
        ]
      )) as any;
      lotCount++;

      const lotId = lotResult.insertId;

      // h_inventory_transactions 삽입 (receipt 유형)
      await conn.execute(
        `INSERT INTO h_inventory_transactions 
         (lot_id, inventory_id, transaction_type, quantity, unit, unit_cost, amount,
          transaction_date, reference_type, reference_id, source_type, 
          action_type, purpose, performed_by, created_by, tenant_id, notes)
         VALUES (?, ?, 'receipt', ?, ?, ?, ?, ?, 'purchase', ?, 'accounting_purchases', 
                 'inbound', '매입 입고', ?, ?, ?, ?)`,
        [
          lotId,
          inventoryId,
          qty.toFixed(3),
          p.unit || "kg",
          unitPrice.toFixed(2),
          (qty * unitPrice).toFixed(2),
          txDate,
          p.id, // reference to accounting_purchases.id
          CREATED_BY,
          CREATED_BY,
          TENANT_ID,
          `${supplierName} - ${p.item_name} ${qty}${p.unit || "kg"} 입고`,
        ]
      );
      txnCount++;
    }

    console.log(`h_inventory_lots 삽입: ${lotCount}건`);
    console.log(`h_inventory_transactions 삽입: ${txnCount}건\n`);

    // 6. h_materials unit_price 업데이트 (최근 단가 반영)
    const [latestPrices] = (await conn.execute(
      `SELECT item_name, unit_price 
       FROM accounting_purchases 
       WHERE tenant_id = ? AND status = 'approved'
       ORDER BY transaction_date DESC`,
      [TENANT_ID]
    )) as any[];

    const priceMap: Record<string, number> = {};
    for (const row of latestPrices) {
      if (!priceMap[row.item_name]) {
        priceMap[row.item_name] = parseFloat(row.unit_price);
      }
    }

    let priceUpdateCount = 0;
    for (const [itemName, price] of Object.entries(priceMap)) {
      const materialId = MATERIAL_MAP[itemName];
      if (!materialId) continue;
      await conn.execute(
        "UPDATE h_materials SET unit_price = ? WHERE id = ? AND tenant_id = ?",
        [price.toFixed(2), materialId, TENANT_ID]
      );
      priceUpdateCount++;
    }
    console.log(
      `h_materials unit_price 업데이트: ${priceUpdateCount}건\n`
    );

    // 7. 검증
    const [invCount] = (await conn.execute(
      "SELECT COUNT(*) as cnt FROM h_inventory WHERE tenant_id = ?",
      [TENANT_ID]
    )) as any[];
    const [lotTotal] = (await conn.execute(
      "SELECT COUNT(*) as cnt FROM h_inventory_lots WHERE tenant_id = ?",
      [TENANT_ID]
    )) as any[];
    const [txnTotal] = (await conn.execute(
      "SELECT COUNT(*) as cnt FROM h_inventory_transactions WHERE tenant_id = ?",
      [TENANT_ID]
    )) as any[];

    console.log("=== 검증 결과 ===");
    console.log(`h_inventory: ${invCount[0].cnt}건`);
    console.log(`h_inventory_lots: ${lotTotal[0].cnt}건`);
    console.log(`h_inventory_transactions: ${txnTotal[0].cnt}건`);

    // 재고 현황 요약
    const [summary] = (await conn.execute(
      `SELECT m.material_name, i.total_quantity, i.unit, m.unit_price,
              ROUND(i.total_quantity * m.unit_price, 0) as total_value
       FROM h_inventory i 
       JOIN h_materials m ON i.material_id = m.id
       WHERE i.tenant_id = ?
       ORDER BY total_value DESC`,
      [TENANT_ID]
    )) as any[];

    console.log("\n=== 재고 현황 TOP 15 ===");
    console.log(
      "원재료명\t\t\t\t총수량\t단위\t단가\t\t재고금액"
    );
    for (const row of summary.slice(0, 15)) {
      const name = row.material_name.padEnd(20, " ");
      console.log(
        `${name}\t${row.total_quantity}\t${row.unit}\t${Number(row.unit_price).toLocaleString()}\t\t${Number(row.total_value).toLocaleString()}`
      );
    }

    const [grandTotal] = (await conn.execute(
      `SELECT SUM(i.total_quantity * m.unit_price) as grand_total
       FROM h_inventory i 
       JOIN h_materials m ON i.material_id = m.id
       WHERE i.tenant_id = ?`,
      [TENANT_ID]
    )) as any[];
    console.log(
      `\n총 재고 금액: ${Number(grandTotal[0].grand_total).toLocaleString()}원`
    );

    console.log("\n=== 시드 완료 ===");
  } catch (err) {
    console.error("Error:", err);
    throw err;
  } finally {
    await conn.end();
  }
}

main();
