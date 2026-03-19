/**
 * Seed script: Insert inbound material data into h_inbound_headers + h_inbound_lines
 * 
 * Data source: inbound_materials.json (2026-01-03 ~ 2026-03-11)
 * Target tenant_id: 2
 * 
 * Usage: npx tsx scripts/seed-inbound-materials.ts
 */

import mysql from "mysql2/promise";

const TENANT_ID = 2;
const SITE_ID = 1;       // default site
const CREATED_BY = 4;    // 한상갑 (admin)

// ============================================================
// Raw inbound material data (from inbound_materials.json)
// ============================================================
interface MaterialInbound {
  date: string;
  material: string;
  vendor: string | null;
  inboundType: "자체구매" | "위탁공급" | null;
  quantityKg: number;
  pricePerKg: number | null;
  totalAmount: number | null;
  lotNumber: string | null;
  expiryDate: string | null;
  note: string | null;
}

const rawData: MaterialInbound[] = [
  { date: "2026-01-03", material: "찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 200, pricePerKg: 4000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-06", material: "냉동쑥(국내산)", vendor: "네이버파이낸셜", inboundType: "자체구매", quantityKg: 10, pricePerKg: 7800, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-06", material: "조림류(통팥앙금)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 20, pricePerKg: 6000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-06", material: "물엿(저당물엿)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 24, pricePerKg: 1330, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-06", material: "화이트초콜릿", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 5, pricePerKg: 8800, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-06", material: "설탕", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 20, pricePerKg: 2600, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-06", material: "천일염", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 5, pricePerKg: 3000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-06", material: "콩기름(대두유)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 18, pricePerKg: 2430, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-06", material: "참깨", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 2, pricePerKg: 25000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-07", material: "검정깨(흑임자)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 2, pricePerKg: 18000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-07", material: "찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 200, pricePerKg: 4000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-08", material: "두류가공품(콩고물)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 20, pricePerKg: 5500, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-09", material: "찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 200, pricePerKg: 4000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-09", material: "기타가공품(흑임자가루)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 10, pricePerKg: 10500, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-13", material: "찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 400, pricePerKg: 4000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-13", material: "조림류(통팥앙금)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 60, pricePerKg: 6000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-13", material: "냉동쑥(국내산)", vendor: "네이버파이낸셜", inboundType: "자체구매", quantityKg: 10, pricePerKg: 7800, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-14", material: "두류가공품(콩고물)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 10, pricePerKg: 5500, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-14", material: "냉동증숙고구마(중국산)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 12, pricePerKg: 2900, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-15", material: "찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 200, pricePerKg: 4000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-15", material: "물엿(저당물엿)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 24, pricePerKg: 1330, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-16", material: "조림류(통팥앙금)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 40, pricePerKg: 6000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-16", material: "흑미찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 40, pricePerKg: 4200, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-20", material: "찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 400, pricePerKg: 4000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-20", material: "냉동쑥(국내산)", vendor: "네이버파이낸셜", inboundType: "자체구매", quantityKg: 10, pricePerKg: 7800, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-20", material: "조림류(통팥앙금)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 60, pricePerKg: 6000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-21", material: "두류가공품(콩고물)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 10, pricePerKg: 5500, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-21", material: "설탕", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 20, pricePerKg: 2600, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-22", material: "찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 200, pricePerKg: 4000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-22", material: "냉동증숙고구마(중국산)", vendor: "한결제과제빵", inboundType: "자체구매", quantityKg: 12, pricePerKg: 2900, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-23", material: "조림류(통팥앙금)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 40, pricePerKg: 6000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-23", material: "두류가공품(통팥고물)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 20, pricePerKg: 5500, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-27", material: "찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 400, pricePerKg: 4000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-27", material: "조림류(통팥앙금)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 60, pricePerKg: 6000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-28", material: "두류가공품(콩고물)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 10, pricePerKg: 5500, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-01-28", material: "냉동쑥(국내산)", vendor: "네이버파이낸셜", inboundType: "자체구매", quantityKg: 10, pricePerKg: 7800, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-03", material: "찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 400, pricePerKg: 4000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-03", material: "조림류(통팥앙금)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 40, pricePerKg: 6000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-04", material: "물엿(저당물엿)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 24, pricePerKg: 1330, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-04", material: "냉동쑥(국내산)", vendor: "네이버파이낸셜", inboundType: "자체구매", quantityKg: 10, pricePerKg: 7800, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-04", material: "검정깨(흑임자)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 2, pricePerKg: 18000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-04", material: "설탕", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 20, pricePerKg: 2600, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-05", material: "두류가공품(콩고물)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 10, pricePerKg: 5500, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-05", material: "기타가공품(흑임자가루)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 10, pricePerKg: 10500, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-06", material: "찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 200, pricePerKg: 4000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-06", material: "냉동증숙고구마(중국산)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 12, pricePerKg: 2900, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-10", material: "찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 400, pricePerKg: 4000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-10", material: "조림류(통팥앙금)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 60, pricePerKg: 6000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-10", material: "두류가공품(콩고물)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 10, pricePerKg: 5500, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-10", material: "냉동쑥(국내산)", vendor: "네이버파이낸셜", inboundType: "자체구매", quantityKg: 10, pricePerKg: 7800, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-11", material: "물엿(저당물엿)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 24, pricePerKg: 1330, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-12", material: "찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 200, pricePerKg: 4000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-12", material: "조림류(통팥앙금)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 60, pricePerKg: 6000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-12", material: "두류가공품(통팥고물)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 20, pricePerKg: 5500, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-13", material: "화이트초콜릿", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 5, pricePerKg: 8800, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-14", material: "찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 200, pricePerKg: 4000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-17", material: "찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 400, pricePerKg: 4000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-17", material: "조림류(통팥앙금)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 60, pricePerKg: 6000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-17", material: "냉동쑥(국내산)", vendor: "네이버파이낸셜", inboundType: "자체구매", quantityKg: 10, pricePerKg: 7800, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-18", material: "콩기름(대두유)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 18, pricePerKg: 2430, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-18", material: "천일염", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 5, pricePerKg: 3000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-18", material: "설탕", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 40, pricePerKg: 2600, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-19", material: "두류가공품(콩고물)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 20, pricePerKg: 5500, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-19", material: "흑미찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 40, pricePerKg: 4200, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-20", material: "찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 200, pricePerKg: 4000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-20", material: "조림류(통팥앙금)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 40, pricePerKg: 6000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-20", material: "냉동증숙고구마(중국산)", vendor: "한결제과제빵", inboundType: "자체구매", quantityKg: 12, pricePerKg: 2900, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-21", material: "물엿(저당물엿)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 24, pricePerKg: 1330, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-24", material: "찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 400, pricePerKg: 4000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-24", material: "조림류(통팥앙금)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 60, pricePerKg: 6000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-24", material: "냉동쑥(국내산)", vendor: "네이버파이낸셜", inboundType: "자체구매", quantityKg: 10, pricePerKg: 7800, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-25", material: "두류가공품(콩고물)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 10, pricePerKg: 5500, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-25", material: "기타가공품(흑임자가루)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 10, pricePerKg: 10500, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-26", material: "찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 200, pricePerKg: 4000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-27", material: "두류가공품(통팥고물)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 20, pricePerKg: 5500, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-02-28", material: "조림류(통팥앙금)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 40, pricePerKg: 6000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-03-03", material: "찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 400, pricePerKg: 4000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-03-03", material: "조림류(통팥앙금)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 60, pricePerKg: 6000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-03-03", material: "냉동쑥(국내산)", vendor: "네이버파이낸셜", inboundType: "자체구매", quantityKg: 10, pricePerKg: 7800, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-03-04", material: "두류가공품(콩고물)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 10, pricePerKg: 5500, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-03-04", material: "설탕", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 20, pricePerKg: 2600, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-03-04", material: "물엿(저당물엿)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 24, pricePerKg: 1330, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-03-05", material: "찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 200, pricePerKg: 4000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-03-05", material: "냉동증숙고구마(중국산)", vendor: "한결제과제빵", inboundType: "자체구매", quantityKg: 12, pricePerKg: 2900, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-03-05", material: "검정깨(흑임자)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 2, pricePerKg: 18000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-03-06", material: "조림류(통팥앙금)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 40, pricePerKg: 6000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-03-06", material: "기타가공품(흑임자가루)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 10, pricePerKg: 10500, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-03-07", material: "찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 200, pricePerKg: 4000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-03-10", material: "찹쌀(국내산)", vendor: "농업회사법인㈜이수농산", inboundType: "자체구매", quantityKg: 400, pricePerKg: 4000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-03-10", material: "조림류(통팥앙금)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 60, pricePerKg: 6000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-03-10", material: "냉동쑥(국내산)", vendor: "네이버파이낸셜", inboundType: "자체구매", quantityKg: 10, pricePerKg: 7800, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-03-11", material: "두류가공품(콩고물)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 20, pricePerKg: 5500, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-03-11", material: "두류가공품(통팥고물)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 20, pricePerKg: 5500, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-03-11", material: "화이트초콜릿", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 5, pricePerKg: 8800, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-03-11", material: "콩기름(대두유)", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 18, pricePerKg: 2430, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
  { date: "2026-03-11", material: "천일염", vendor: "주식회사동아식품", inboundType: "자체구매", quantityKg: 5, pricePerKg: 3000, totalAmount: null, lotNumber: null, expiryDate: null, note: null },
];

// ============================================================
// Material name → item_master.id mapping
// ============================================================
const materialNameToId: Record<string, number> = {
  "찹쌀(국내산)": 198,
  "냉동쑥(국내산)": 149,
  "조림류(통팥앙금)": 194,
  "물엿(저당물엿)": 170,
  "화이트초콜릿": 211,
  "설탕": 177,
  "천일염": 199,
  "콩기름(대두유)": 202,
  "참깨": 197,  // 참깨(인도산,나이지리아산,탄자니아산,미얀마산)
  "검정깨(흑임자)": 137,
  "두류가공품(콩고물)": 162,
  "기타가공품(흑임자가루)": 147,
  "냉동증숙고구마(중국산)": 150,
  "흑미찹쌀(국내산)": 212,
  "두류가공품(통팥고물)": 163,
};

// ============================================================
// Vendor name → supplier_id mapping (existing + new ones to create)
// ============================================================
// Existing in h_suppliers:
//   id=1 주식회사 골든터틀컴퍼니 (SUP-001)
//   id=2 지티컴퍼니 (SUP-002)
//   id=3 주식회사 미미스 (SUP-003)
//   id=6 네이버파이낸셜 (SUP-007)
//   id=7 (주)케이티 (SUP-008)
// New suppliers to create:
//   농업회사법인㈜이수농산
//   주식회사동아식품
//   한결제과제빵

async function main() {
  const conn = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "G0ld3n!T1004#Sec",
    database: "haccp_tenant_db",
  });

  try {
    console.log("=== Inbound Materials Seed Script ===\n");

    // ----------------------------------------------------------
    // Step 1: Create missing suppliers
    // ----------------------------------------------------------
    const newSuppliers = [
      { name: "농업회사법인㈜이수농산", code: "SUP-009" },
      { name: "주식회사동아식품", code: "SUP-010" },
      { name: "한결제과제빵", code: "SUP-011" },
    ];

    const supplierNameToId: Record<string, number> = {
      "네이버파이낸셜": 6,
    };

    for (const sup of newSuppliers) {
      // Check if already exists
      const [existing] = await conn.execute(
        "SELECT id FROM h_suppliers WHERE supplier_name = ? AND tenant_id = ?",
        [sup.name, TENANT_ID]
      ) as any[];

      if (existing.length > 0) {
        supplierNameToId[sup.name] = existing[0].id;
        console.log(`  Supplier "${sup.name}" already exists (id=${existing[0].id})`);
      } else {
        const [result] = await conn.execute(
          `INSERT INTO h_suppliers (supplier_name, supplier_code, tenant_id, is_active) 
           VALUES (?, ?, ?, 1)`,
          [sup.name, sup.code, TENANT_ID]
        ) as any[];
        supplierNameToId[sup.name] = result.insertId;
        console.log(`  Created supplier "${sup.name}" (id=${result.insertId})`);
      }
    }

    console.log("\nSupplier mapping:", supplierNameToId);

    // ----------------------------------------------------------
    // Step 2: Group raw data by date + supplier → one header per group
    // ----------------------------------------------------------
    // Strategy: Group lines by (date, vendor) → one inbound header per group
    // This represents one delivery per supplier per day
    interface HeaderGroup {
      date: string;
      vendor: string;
      supplierId: number | null;
      inboundType: string | null;
      lines: MaterialInbound[];
    }

    const groupMap = new Map<string, HeaderGroup>();

    for (const row of rawData) {
      const key = `${row.date}__${row.vendor || "unknown"}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          date: row.date,
          vendor: row.vendor || "unknown",
          supplierId: row.vendor ? (supplierNameToId[row.vendor] || null) : null,
          inboundType: row.inboundType,
          lines: [],
        });
      }
      groupMap.get(key)!.lines.push(row);
    }

    const headers = Array.from(groupMap.values()).sort(
      (a, b) => a.date.localeCompare(b.date) || a.vendor.localeCompare(b.vendor)
    );

    console.log(`\nTotal headers to create: ${headers.length}`);
    console.log(`Total lines to create: ${rawData.length}`);

    // ----------------------------------------------------------
    // Step 3: Insert headers and lines
    // ----------------------------------------------------------
    let headerSeq = 0;
    let totalLines = 0;
    let unmatchedMaterials: string[] = [];

    for (const hdr of headers) {
      headerSeq++;
      const dateStr = hdr.date.replace(/-/g, "");
      const inboundNumber = `INB-${dateStr}-${String(headerSeq).padStart(4, "0")}`;

      const notes = hdr.inboundType ? `입고유형: ${hdr.inboundType}` : null;

      // Insert header
      const [headerResult] = await conn.execute(
        `INSERT INTO h_inbound_headers 
         (inbound_number, site_id, supplier_id, inbound_date, status, notes, created_by, tenant_id)
         VALUES (?, ?, ?, ?, 'confirmed', ?, ?, ?)`,
        [inboundNumber, SITE_ID, hdr.supplierId, hdr.date, notes, CREATED_BY, TENANT_ID]
      ) as any[];

      const headerId = headerResult.insertId;

      // Insert lines
      for (let i = 0; i < hdr.lines.length; i++) {
        const line = hdr.lines[i];
        const materialId = materialNameToId[line.material];

        if (!materialId) {
          unmatchedMaterials.push(line.material);
          console.warn(`  WARNING: No material_id for "${line.material}" - skipping line`);
          continue;
        }

        const unitPrice = line.pricePerKg || 0;
        const totalPrice = line.totalAmount || (line.quantityKg * unitPrice);

        await conn.execute(
          `INSERT INTO h_inbound_lines 
           (header_id, line_number, material_id, purchase_quantity, purchase_unit, 
            stock_quantity, stock_unit, unit_price, total_price, lot_number, expiry_date, notes, tenant_id)
           VALUES (?, ?, ?, ?, 'kg', ?, 'kg', ?, ?, ?, ?, ?, ?)`,
          [
            headerId,
            i + 1,
            materialId,
            line.quantityKg,
            line.quantityKg,   // stock_quantity = purchase_quantity (same unit)
            unitPrice,
            totalPrice,
            line.lotNumber || null,
            line.expiryDate || null,
            line.note || null,
            TENANT_ID,
          ]
        );

        totalLines++;
      }

      console.log(`  ${inboundNumber} | ${hdr.date} | ${hdr.vendor} | ${hdr.lines.length} lines`);
    }

    // ----------------------------------------------------------
    // Step 4: Summary
    // ----------------------------------------------------------
    console.log("\n=== SEED COMPLETE ===");
    console.log(`  Headers inserted: ${headerSeq}`);
    console.log(`  Lines inserted:   ${totalLines}`);

    if (unmatchedMaterials.length > 0) {
      console.log(`\n  ⚠ Unmatched materials (${unmatchedMaterials.length}):`);
      [...new Set(unmatchedMaterials)].forEach(m => console.log(`    - ${m}`));
    }

    // Verify
    const [verifyHeaders] = await conn.execute(
      "SELECT COUNT(*) as cnt FROM h_inbound_headers WHERE tenant_id = ?",
      [TENANT_ID]
    ) as any[];
    const [verifyLines] = await conn.execute(
      "SELECT COUNT(*) as cnt FROM h_inbound_lines WHERE tenant_id = ?",
      [TENANT_ID]
    ) as any[];

    console.log(`\n  DB verification: ${verifyHeaders[0].cnt} headers, ${verifyLines[0].cnt} lines`);

  } catch (error) {
    console.error("SEED ERROR:", error);
    throw error;
  } finally {
    await conn.end();
  }
}

main().catch(console.error);
