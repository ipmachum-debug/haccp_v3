/**
 * GOGOGOPICK (OPSCORE) Database Connection for HACCP-ONE
 * 
 * HACCP-ONE에서 GOGOGOPICK DB에 접속하여 양방향 동기화를 수행합니다.
 */

import mysql, { Pool } from "mysql2/promise";

let pool: Pool | null = null;

export function getOpscorePool(): Pool {
  if (!pool) {
    const dbUrl = process.env.OPSCORE_DATABASE_URL;
    if (!dbUrl) {
      throw new Error("OPSCORE_DATABASE_URL is not set");
    }
    pool = mysql.createPool({
      uri: dbUrl,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return pool;
}

/**
 * GOGOGOPICK DB 연결 테스트
 */
export async function testOpscoreConnection(): Promise<{ connected: boolean; error?: string }> {
  try {
    const dbUrl = process.env.OPSCORE_DATABASE_URL;
    if (!dbUrl) {
      return { connected: false, error: "OPSCORE_DATABASE_URL is not set" };
    }
    const p = getOpscorePool();
    await p.query("SELECT 1 as ok");
    return { connected: true };
  } catch (error) {
    console.error("[OPSCORE DB] Connection test failed:", error);
    return { connected: false, error: (error as Error).message };
  }
}

// ============================================
// GOGOGOPICK 거래처 (partners)
// ============================================

export interface OpscorePartner {
  id: number;
  tenant_id: number;
  partner_type: string;
  partner_code: string;
  business_number: string | null;
  company_name: string;
  ceo_name: string | null;
  business_type: string | null;
  business_item: string | null;
  address: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  bank_name: string | null;
  bank_account: string | null;
  account_holder: string | null;
  is_active: number;
  rating: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export async function getOpscorePartners(tenantId?: number): Promise<OpscorePartner[]> {
  try {
    const p = getOpscorePool();
    let query = "SELECT * FROM partners WHERE is_active = 1 AND deleted_at IS NULL";
    const params: any[] = [];
    if (tenantId) {
      query += " AND tenant_id = ?";
      params.push(tenantId);
    }
    query += " ORDER BY id DESC";
    const [rows] = await p.query(query, params);
    return rows as OpscorePartner[];
  } catch (error) {
    console.error("[OPSCORE DB] Failed to get partners:", error);
    return [];
  }
}

// ============================================
// GOGOGOPICK 제품 (products)
// ============================================

export interface OpscoreProduct {
  id: number;
  tenant_id: number;
  sku: string;
  name: string;
  organization_id: number;
  category: string | null;
  item_type: string;
  description: string | null;
  lead_time_days: number;
  status: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export async function getOpscoreProducts(tenantId?: number): Promise<OpscoreProduct[]> {
  try {
    const p = getOpscorePool();
    let query = "SELECT * FROM products WHERE status != 'DISCONTINUED' AND deleted_at IS NULL";
    const params: any[] = [];
    if (tenantId) {
      query += " AND tenant_id = ?";
      params.push(tenantId);
    }
    query += " ORDER BY id DESC";
    const [rows] = await p.query(query, params);
    return rows as OpscoreProduct[];
  } catch (error) {
    console.error("[OPSCORE DB] Failed to get products:", error);
    return [];
  }
}

// ============================================
// 통합 상태 조회
// ============================================

export interface OpsCoreSyncStatus {
  connected: boolean;
  partners: number;
  products: number;
  error?: string;
}

export async function getOpsCoreSyncStatus(tenantId?: number): Promise<OpsCoreSyncStatus> {
  const connResult = await testOpscoreConnection();
  if (!connResult.connected) {
    return {
      connected: false,
      partners: 0,
      products: 0,
      error: connResult.error,
    };
  }

  try {
    const p = getOpscorePool();
    const tfAnd = tenantId ? `AND tenant_id = ${tenantId}` : "";

    const [[pt]] = await p.query(`SELECT COUNT(*) as c FROM partners WHERE is_active = 1 AND deleted_at IS NULL ${tfAnd}`) as any;
    const [[pr]] = await p.query(`SELECT COUNT(*) as c FROM products WHERE status != 'DISCONTINUED' AND deleted_at IS NULL ${tfAnd}`) as any;

    return {
      connected: true,
      partners: pt.c,
      products: pr.c,
    };
  } catch (error) {
    console.error("[OPSCORE DB] Failed to get sync status:", error);
    return {
      connected: false,
      partners: 0,
      products: 0,
      error: (error as Error).message,
    };
  }
}

// Alias for backward compatibility
export const getOpscoreDb = getOpscorePool;
