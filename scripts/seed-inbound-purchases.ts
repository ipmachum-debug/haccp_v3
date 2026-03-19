/**
 * Seed script: Insert inbound material data into the CORRECT tables
 * - partners table (거래처 관리 UI에서 사용)
 * - accounting_purchases table (매입 조회 UI에서 사용)
 * 
 * Data source: inbound_materials.json (2026-01-03 ~ 2026-03-11)
 * Target tenant_id: 2
 * 
 * Usage: npx tsx scripts/seed-inbound-purchases.ts
 */

import mysql from "mysql2/promise";

const TENANT_ID = 2;
const CREATED_BY = 4;    // 한상갑 (admin)

// ============================================================
// Raw inbound material data
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

// Existing partners in DB (tenant_id=2):
// id=39 (주)케이티, id=38 네이버파이낸셜, id=5 주식회사 골든터틀컴퍼니, id=6 지티컴퍼니, id=7 주식회사 미미스

async function main() {
  const conn = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "G0ld3n!T1004#Sec",
    database: "haccp_tenant_db",
  });

  try {
    console.log("=== Inbound Purchases Seed Script (correct tables) ===\n");

    // ----------------------------------------------------------
    // Step 1: Create missing partners (suppliers) in `partners` table
    // ----------------------------------------------------------
    const newPartners = [
      { name: "농업회사법인㈜이수농산", type: "supplier" },
      { name: "주식회사동아식품", type: "supplier" },
      { name: "한결제과제빵", type: "supplier" },
    ];

    // Known existing partner
    const vendorToPartnerId: Record<string, number> = {
      "네이버파이낸셜": 38,
    };

    for (const p of newPartners) {
      // Check if already exists
      const [existing] = await conn.execute(
        "SELECT id FROM partners WHERE company_name = ? AND tenant_id = ?",
        [p.name, TENANT_ID]
      ) as any[];

      if (existing.length > 0) {
        vendorToPartnerId[p.name] = existing[0].id;
        console.log(`  Partner "${p.name}" already exists (id=${existing[0].id})`);
      } else {
        // Auto-generate supplier_code
        const [maxRow] = await conn.execute(
          `SELECT MAX(CAST(SUBSTRING(supplier_code, 5) AS UNSIGNED)) as maxNum 
           FROM partners WHERE tenant_id = ? AND supplier_code REGEXP '^SUP-[0-9]+$'`,
          [TENANT_ID]
        ) as any[];
        const maxNum = Number(maxRow[0]?.maxNum || 0);
        const supplierCode = "SUP-" + String(maxNum + 1).padStart(3, "0");

        const [result] = await conn.execute(
          `INSERT INTO partners (partner_type, company_name, supplier_code, supplier_type, tenant_id, is_active)
           VALUES (?, ?, ?, '거래처', ?, 1)`,
          [p.type, p.name, supplierCode, TENANT_ID]
        ) as any[];
        vendorToPartnerId[p.name] = result.insertId;
        console.log(`  Created partner "${p.name}" (id=${result.insertId}, code=${supplierCode})`);
      }
    }

    console.log("\nVendor → Partner ID mapping:", vendorToPartnerId);

    // ----------------------------------------------------------
    // Step 2: Insert into accounting_purchases (매입 조회 페이지에서 사용)
    // ----------------------------------------------------------
    let insertCount = 0;

    for (const row of rawData) {
      const partnerId = row.vendor ? (vendorToPartnerId[row.vendor] || null) : null;
      const unitPrice = row.pricePerKg || 0;
      const totalAmount = row.totalAmount || (row.quantityKg * unitPrice);
      const notes = [
        row.inboundType ? `입고유형: ${row.inboundType}` : null,
        row.lotNumber ? `LOT: ${row.lotNumber}` : null,
        row.expiryDate ? `유통기한: ${row.expiryDate}` : null,
        row.note,
      ].filter(Boolean).join(", ") || null;

      await conn.execute(
        `INSERT INTO accounting_purchases 
         (transaction_date, partner_id, item_name, quantity, unit, unit_price, total_amount,
          tax_amount, evidence_type, source_type, notes, status, created_by, tenant_id)
         VALUES (?, ?, ?, ?, 'kg', ?, ?, 0.00, 'none', 'inbound_seed', ?, 'approved', ?, ?)`,
        [
          row.date,
          partnerId,
          row.material,
          row.quantityKg,
          unitPrice,
          totalAmount,
          notes,
          CREATED_BY,
          TENANT_ID,
        ]
      );

      insertCount++;
    }

    console.log(`\nInserted ${insertCount} rows into accounting_purchases`);

    // ----------------------------------------------------------
    // Step 3: Verify
    // ----------------------------------------------------------
    const [verifyPartners] = await conn.execute(
      "SELECT COUNT(*) as cnt FROM partners WHERE tenant_id = ?",
      [TENANT_ID]
    ) as any[];
    const [verifyPurchases] = await conn.execute(
      "SELECT COUNT(*) as cnt FROM accounting_purchases WHERE tenant_id = ? AND source_type = 'inbound_seed'",
      [TENANT_ID]
    ) as any[];
    const [totalAmount] = await conn.execute(
      "SELECT SUM(total_amount) as total FROM accounting_purchases WHERE tenant_id = ? AND source_type = 'inbound_seed'",
      [TENANT_ID]
    ) as any[];

    console.log(`\n=== SEED COMPLETE ===`);
    console.log(`  Partners: ${verifyPartners[0].cnt}`);
    console.log(`  Purchases: ${verifyPurchases[0].cnt}`);
    console.log(`  Total amount: ${Number(totalAmount[0].total).toLocaleString()}원`);

  } catch (error) {
    console.error("SEED ERROR:", error);
    throw error;
  } finally {
    await conn.end();
  }
}

main().catch(console.error);
