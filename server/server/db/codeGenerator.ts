import { getDb } from "../db.js";
import { hMaterials, hSuppliers } from "../../drizzle/schema_main.js";
import { sql } from "drizzle-orm";

/**
 * 원재료 코드 자동 생성 (MAT-001, MAT-002...)
 * 전체 테넌트 기준으로 최대 번호를 조회하여 순차 생성 (테넌트 간 충돌 방지)
 */
export async function generateMaterialCode(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  try {
    const result = await db.execute(
      sql`SELECT MAX(CAST(SUBSTRING(material_code, 5) AS UNSIGNED)) as maxNum FROM h_materials WHERE material_code REGEXP '^MAT-[0-9]+$'`
    );
    
    const maxNum = Number((result as any)[0]?.[0]?.maxNum || (result as any)[0]?.maxNum || 0);
    const nextNum = maxNum + 1;
    return `MAT-${nextNum.toString().padStart(3, "0")}`;
  } catch (error: any) {
    console.error("[코드 생성 오류] generateMaterialCode:", error.message);
    return "MAT-001";
  }
}

/**
 * 제품 코드 자동 생성 (30001, 30002...)
 * 전체 테넌트 기준으로 최대 번호를 조회하여 순차 생성 (테넌트 간 충돌 방지)
 */
export async function generateProductCode(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  try {
    // h_products_v2와 item_master 양쪽에서 최대 코드 조회
    const result1 = await db.execute(
      sql`SELECT MAX(CAST(product_code AS UNSIGNED)) as maxNum FROM h_products_v2 WHERE product_code REGEXP '^[0-9]+$' AND CAST(product_code AS UNSIGNED) BETWEEN 30000 AND 39999`
    );
    const result2 = await db.execute(
      sql`SELECT MAX(CAST(item_code AS UNSIGNED)) as maxNum FROM item_master WHERE item_code REGEXP '^[0-9]+$' AND CAST(item_code AS UNSIGNED) BETWEEN 30000 AND 39999`
    );
    
    const maxNum1 = Number((result1 as any)[0]?.[0]?.maxNum || (result1 as any)[0]?.maxNum || 0);
    const maxNum2 = Number((result2 as any)[0]?.[0]?.maxNum || (result2 as any)[0]?.maxNum || 0);
    const maxNum = Math.max(maxNum1, maxNum2);
    const nextNum = maxNum > 0 ? maxNum + 1 : 30001;
    return String(nextNum);
  } catch (error: any) {
    console.error("[코드 생성 오류] generateProductCode:", error.message);
    return "30001";
  }
}

/**
 * 외부제품 코드 자동 생성 (OEM-001, OEM-002...)
 * 전체 테넌트 기준으로 최대 번호를 조회하여 순차 생성
 */
export async function generateExternalProductCode(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  try {
    const result = await db.execute(
      sql`SELECT MAX(CAST(SUBSTRING(item_code, 5) AS UNSIGNED)) as maxNum FROM item_master WHERE item_code REGEXP '^OEM-[0-9]+$'`
    );
    
    const maxNum = Number((result as any)[0]?.[0]?.maxNum || (result as any)[0]?.maxNum || 0);
    const nextNum = maxNum + 1;
    return `OEM-${nextNum.toString().padStart(3, "0")}`;
  } catch (error: any) {
    console.error("[코드 생성 오류] generateExternalProductCode:", error.message);
    return "OEM-001";
  }
}

/**
 * 부자재 코드 자동 생성 (SUB-001, SUB-002...)
 * 전체 테넌트 기준으로 최대 번호를 조회하여 순차 생성
 */
export async function generateSubsidiaryCode(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  try {
    const result = await db.execute(
      sql`SELECT MAX(CAST(SUBSTRING(item_code, 5) AS UNSIGNED)) as maxNum FROM item_master WHERE item_code REGEXP '^SUB-[0-9]+$'`
    );
    
    const maxNum = Number((result as any)[0]?.[0]?.maxNum || (result as any)[0]?.maxNum || 0);
    const nextNum = maxNum + 1;
    return `SUB-${nextNum.toString().padStart(3, "0")}`;
  } catch (error: any) {
    console.error("[코드 생성 오류] generateSubsidiaryCode:", error.message);
    return "SUB-001";
  }
}

/**
 * SKU 코드 자동 생성 (모코드-01, 모코드-02...)
 * 모품목 코드를 기반으로 해당 품목의 SKU 중 최대 번호를 조회하여 순차 생성
 */
export async function generateSkuCode(parentItemCode: string): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  try {
    const prefix = `${parentItemCode}-`;
    const result = await db.execute(
      sql`SELECT MAX(CAST(SUBSTRING(sku_code, ${prefix.length + 1}) AS UNSIGNED)) as maxNum FROM product_skus WHERE sku_code LIKE ${prefix + '%'} AND SUBSTRING(sku_code, ${prefix.length + 1}) REGEXP '^[0-9]+$'`
    );
    
    const maxNum = Number((result as any)[0]?.[0]?.maxNum || (result as any)[0]?.maxNum || 0);
    const nextNum = maxNum + 1;
    return `${parentItemCode}-${nextNum.toString().padStart(2, "0")}`;
  } catch (error: any) {
    console.error("[코드 생성 오류] generateSkuCode:", error.message);
    return `${parentItemCode}-01`;
  }
}

/**
 * 공급업체 코드 자동 생성 (SUP-001, SUP-002...)
 * 전체 테넌트 기준으로 최대 번호를 조회하여 순차 생성 (테넌트 간 충돌 방지)
 */
export async function generateSupplierCode(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  try {
    const result = await db.execute(
      sql`SELECT MAX(CAST(SUBSTRING(supplier_code, 5) AS UNSIGNED)) as maxNum FROM h_suppliers WHERE supplier_code REGEXP '^SUP-[0-9]+$'`
    );
    
    const maxNum = Number((result as any)[0]?.[0]?.maxNum || (result as any)[0]?.maxNum || 0);
    const nextNum = maxNum + 1;
    return `SUP-${nextNum.toString().padStart(3, "0")}`;
  } catch (error: any) {
    console.error("[코드 생성 오류] generateSupplierCode:", error.message);
    return "SUP-001";
  }
}

/**
 * 매입 거래 코드 자동 생성 (PUR-001, PUR-002...)
 */
export async function generatePurchaseCode(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { accountingPurchases } = await import("../../drizzle/schema_accounting_extended.js");
  
  const result = await db
    .select({ maxCode: sql<string>`MAX(${accountingPurchases.id})` })
    .from(accountingPurchases);
  
  const maxId = result[0]?.maxCode ? parseInt(result[0].maxCode, 10) : 0;
  const nextNum = maxId + 1;
  return `PUR-${nextNum.toString().padStart(3, "0")}`;
}

/**
 * 매출 거래 코드 자동 생성 (SAL-001, SAL-002...)
 */
export async function generateSaleCode(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const { accountingSales } = await import("../../drizzle/schema_accounting_extended.js");
  
  const result = await db
    .select({ maxCode: sql<string>`MAX(${accountingSales.id})` })
    .from(accountingSales);
  
  const maxId = result[0]?.maxCode ? parseInt(result[0].maxCode, 10) : 0;
  const nextNum = maxId + 1;
  return `SAL-${nextNum.toString().padStart(3, "0")}`;
}
