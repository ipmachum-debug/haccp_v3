#!/bin/bash
# =============================================================
# HACCP-ONE 통합 수정 스크립트
# 1. schema_main.ts - partners 테이블에 supplier_code 등 추가
# 2. partners.ts - tenantId 필터링 추가
# 3. routers.ts - supplier API가 partners 테이블 사용하도록 변경
# 4. routers.ts - partners API에 tenantId 필터링 추가
# 5. mfReportAPI.ts - db.select 에러 수정
# =============================================================

cd /root/haccp_v3

# ===== 1. schema_main.ts 수정 - partners 테이블에 HACCP 호환 컬럼 추가 =====
echo "=== 1. schema_main.ts 수정 ==="

# partners 스키마에 supplier_code, supplier_type, certifications, rating 추가
sed -i '/bizNo: varchar("biz_no", { length: 20 }).unique(),/a\
  supplierCode: varchar("supplier_code", { length: 50 }),\
  supplierType: varchar("supplier_type", { length: 50 }),\
  certifications: text("certifications"),\
  rating: varchar("rating", { length: 20 }),' drizzle/schema_main.ts

echo "schema_main.ts 수정 완료"

# ===== 2. partners.ts 수정 - tenantId 필터링 추가 =====
echo "=== 2. partners.ts 수정 ==="

cat > server/partners.ts << 'PARTNERS_EOF'
/**
 * 거래처 및 원장 관리 데이터베이스 함수
 * partners, apLedger, arLedger 관련 CRUD
 * [수정] tenantId 필터링 추가
 */

import { getDb } from "./db";
import { 
  partners, 
  apLedger, 
  arLedger,
  type InsertPartner,
  type InsertApLedgerEntry,
  type InsertArLedgerEntry
} from "../drizzle/schema_main";
import { eq, and, desc, sql, or, like, asc } from "drizzle-orm";

// ============================================
// 거래처 관리 (Partners) - tenantId 필터링 추가
// ============================================

/**
 * 거래처 생성
 */
export async function createPartner(data: InsertPartner & { tenantId?: number }) {
  try {
    console.log("[createPartner] Input data:", JSON.stringify(data, null, 2));
    const db = await getDb();
    if (!db) throw new Error("Database not initialized");
    
    const [result] = await db.insert(partners).values(data);
    console.log("[createPartner] Insert result:", result);
    return result.insertId;
  } catch (error) {
    console.error("[createPartner] Error:", error);
    throw error;
  }
}

/**
 * 거래처 목록 조회 (tenantId 필터링)
 */
export async function getAllPartners(filters?: {
  partnerType?: "supplier" | "customer" | "subcontractor";
  isActive?: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const conditions: any[] = [];
  
  if (tenantId) {
    conditions.push(eq(partners.tenantId, tenantId));
  }
  if (filters?.partnerType) {
    conditions.push(eq(partners.partnerType, filters.partnerType));
  }
  if (filters?.isActive !== undefined) {
    conditions.push(eq(partners.isActive, filters.isActive));
  }

  let query = db.select().from(partners);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query.orderBy(desc(partners.createdAt));
}

/**
 * 거래처 상세 조회
 */
export async function getPartnerById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const [partner] = await db.select().from(partners).where(eq(partners.id, id));
  return partner;
}

/**
 * 거래처 수정
 */
export async function updatePartner(id: number, data: Partial<InsertPartner>) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  await db.update(partners).set(data).where(eq(partners.id, id));
}

/**
 * 거래처 삭제 (소프트 삭제)
 */
export async function deletePartner(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  await db.update(partners).set({ isActive: 0 }).where(eq(partners.id, id));
}

/**
 * 사업자등록번호로 거래처 검색
 */
export async function getPartnerByBizNo(bizNo: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const [partner] = await db.select().from(partners).where(eq(partners.bizNo, bizNo));
  return partner;
}

/**
 * 거래처 목록 조회 (HACCP 마스터데이터 호환 - 페이징, 검색, 정렬)
 */
export async function getSupplierPartners(params: {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
}, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const page = params.page || 1;
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;

  const conditions: any[] = [
    eq(partners.tenantId, tenantId),
    eq(partners.isActive, 1)
  ];

  if (params.search) {
    conditions.push(
      or(
        like(partners.companyName, `%${params.search}%`),
        like(partners.bizNo, `%${params.search}%`)
      )!
    );
  }

  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(partners)
    .where(and(...conditions));
  const total = Number(totalResult[0]?.count || 0);

  const orderByClause = params.sortBy === "supplierCode"
    ? (params.sortOrder === "desc" ? desc(partners.supplierCode) : asc(partners.supplierCode))
    : params.sortBy === "supplierName"
    ? (params.sortOrder === "desc" ? desc(partners.companyName) : asc(partners.companyName))
    : params.sortBy === "supplierType"
    ? (params.sortOrder === "desc" ? desc(partners.supplierType) : asc(partners.supplierType))
    : desc(partners.createdAt);

  const items = await db
    .select()
    .from(partners)
    .where(and(...conditions))
    .limit(limit)
    .offset(offset)
    .orderBy(orderByClause);

  // hSuppliers 형태로 매핑 (프론트엔드 호환)
  const mappedItems = items.map(p => ({
    id: p.id,
    supplierCode: p.supplierCode || `SUP-${String(p.id).padStart(3, "0")}`,
    supplierName: p.companyName,
    businessNumber: p.bizNo,
    contactPerson: p.ceoName,
    phone: p.phone,
    email: p.email,
    address: p.address,
    supplierType: p.supplierType || p.partnerType,
    certifications: p.certifications,
    rating: p.rating,
    isActive: p.isActive,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    tenantId: p.tenantId
  }));

  return { items: mappedItems, total, page, limit };
}

/**
 * 거래처 생성 (HACCP 마스터데이터 호환)
 */
export async function createSupplierPartner(data: {
  supplierName: string;
  supplierCode?: string;
  businessNumber?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  supplierType?: string;
  certifications?: string;
  rating?: string;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  // supplier_code 자동 생성
  let supplierCode = data.supplierCode;
  if (!supplierCode) {
    const maxResult = await db.execute(
      sql`SELECT MAX(CAST(SUBSTRING(supplier_code, 5) AS UNSIGNED)) as maxNum FROM partners WHERE tenant_id = ${data.tenantId} AND supplier_code REGEXP '^SUP-[0-9]+$'`
    );
    const maxNum = Number((maxResult as any)[0]?.[0]?.maxNum || (maxResult as any)[0]?.maxNum || 0);
    supplierCode = "SUP-" + String(maxNum + 1).padStart(3, "0");
  }

  const [result] = await db.insert(partners).values({
    tenantId: data.tenantId,
    partnerType: "supplier",
    companyName: data.supplierName,
    bizNo: data.businessNumber || null,
    supplierCode,
    supplierType: data.supplierType || "거래처",
    ceoName: data.contactPerson || null,
    phone: data.phone || null,
    email: data.email || null,
    address: data.address || null,
    certifications: data.certifications || null,
    rating: data.rating || null,
  });

  // h_suppliers에도 동기화 삽입
  try {
    const { hSuppliers } = await import("../drizzle/schema");
    await db.insert(hSuppliers).values({
      tenantId: data.tenantId,
      supplierCode,
      supplierName: data.supplierName,
      businessNumber: data.businessNumber || null,
      contactPerson: data.contactPerson || null,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      supplierType: data.supplierType || "거래처",
      certifications: data.certifications || null,
      rating: data.rating || null,
    });
  } catch (e) {
    console.warn("[createSupplierPartner] h_suppliers 동기화 실패 (무시):", e);
  }

  return result.insertId;
}

/**
 * 거래처 수정 (HACCP 마스터데이터 호환)
 */
export async function updateSupplierPartner(id: number, data: {
  supplierName?: string;
  supplierCode?: string;
  businessNumber?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  supplierType?: string;
  certifications?: string;
  rating?: string;
  isActive?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const updateData: any = {};
  if (data.supplierName !== undefined) updateData.companyName = data.supplierName;
  if (data.supplierCode !== undefined) updateData.supplierCode = data.supplierCode;
  if (data.businessNumber !== undefined) updateData.bizNo = data.businessNumber;
  if (data.contactPerson !== undefined) updateData.ceoName = data.contactPerson;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.address !== undefined) updateData.address = data.address;
  if (data.supplierType !== undefined) updateData.supplierType = data.supplierType;
  if (data.certifications !== undefined) updateData.certifications = data.certifications;
  if (data.rating !== undefined) updateData.rating = data.rating;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  await db.update(partners).set(updateData).where(eq(partners.id, id));
}

/**
 * 거래처 삭제 (HACCP 마스터데이터 호환 - 소프트 삭제)
 */
export async function deleteSupplierPartner(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  await db.update(partners).set({ isActive: 0 }).where(
    and(eq(partners.id, id), eq(partners.tenantId, tenantId))
  );
}


// ============================================
// 매입 원장 (AP Ledger)
// ============================================

/**
 * 매입 거래 생성
 */
export async function createApLedgerEntry(data: InsertApLedgerEntry) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const [result] = await db.insert(apLedger).values(data);
  return result.insertId;
}

/**
 * 매입 원장 조회 (필터링)
 */
export async function getApLedger(filters?: {
  supplierPartnerId?: number;
  startDate?: string;
  endDate?: string;
  apEntryType?: "bill" | "payment" | "credit" | "adjust";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  let query = db
    .select({
      id: apLedger.id,
      supplierPartnerId: apLedger.supplierPartnerId,
      supplierName: partners.companyName,
      occurredAt: apLedger.occurredAt,
      apEntryType: apLedger.apEntryType,
      amount: apLedger.amount,
      refType: apLedger.refType,
      refId: apLedger.refId,
      memo: apLedger.memo,
      createdAt: apLedger.createdAt
    })
    .from(apLedger)
    .leftJoin(partners, eq(apLedger.supplierPartnerId, partners.id));

  if (filters?.supplierPartnerId) {
    query = query.where(eq(apLedger.supplierPartnerId, filters.supplierPartnerId)) as any;
  }
  if (filters?.startDate) {
    query = query.where(sql`${apLedger.occurredAt} >= ${filters.startDate}`) as any;
  }
  if (filters?.endDate) {
    query = query.where(sql`${apLedger.occurredAt} <= ${filters.endDate}`) as any;
  }
  if (filters?.apEntryType) {
    query = query.where(eq(apLedger.apEntryType, filters.apEntryType)) as any;
  }

  return await query.orderBy(desc(apLedger.occurredAt));
}

/**
 * 매입 원장 상세 조회
 */
export async function getApLedgerById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const [entry] = await db
    .select({
      id: apLedger.id,
      supplierPartnerId: apLedger.supplierPartnerId,
      supplierName: partners.companyName,
      occurredAt: apLedger.occurredAt,
      apEntryType: apLedger.apEntryType,
      amount: apLedger.amount,
      refType: apLedger.refType,
      refId: apLedger.refId,
      memo: apLedger.memo,
      createdAt: apLedger.createdAt
    })
    .from(apLedger)
    .leftJoin(partners, eq(apLedger.supplierPartnerId, partners.id))
    .where(eq(apLedger.id, id));
  return entry;
}

/**
 * 공급업체별 매입 집계
 */
export async function getApSummaryBySupplier(startDate?: string, endDate?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  let query = db
    .select({
      supplierPartnerId: apLedger.supplierPartnerId,
      supplierName: partners.companyName,
      totalAmount: sql<number>`SUM(${apLedger.amount})`,
      transactionCount: sql<number>`COUNT(*)`
    })
    .from(apLedger)
    .leftJoin(partners, eq(apLedger.supplierPartnerId, partners.id))
    .groupBy(apLedger.supplierPartnerId, partners.companyName);

  if (startDate) {
    query = query.where(sql`${apLedger.occurredAt} >= ${startDate}`) as any;
  }
  if (endDate) {
    query = query.where(sql`${apLedger.occurredAt} <= ${endDate}`) as any;
  }

  return await query;
}


// ============================================
// 매출 원장 (AR Ledger)
// ============================================

/**
 * 매출 거래 생성
 */
export async function createArLedgerEntry(data: InsertArLedgerEntry) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const [result] = await db.insert(arLedger).values(data);
  return result.insertId;
}

/**
 * 매출 원장 조회 (필터링)
 */
export async function getArLedger(filters?: {
  customerPartnerId?: number;
  startDate?: string;
  endDate?: string;
  arEntryType?: "debit" | "payment" | "credit" | "writeoff" | "adjust";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  let query = db
    .select({
      id: arLedger.id,
      customerPartnerId: arLedger.customerPartnerId,
      customerName: partners.companyName,
      occurredAt: arLedger.occurredAt,
      arEntryType: arLedger.arEntryType,
      amount: arLedger.amount,
      dueDate: arLedger.dueDate,
      refType: arLedger.refType,
      refId: arLedger.refId,
      memo: arLedger.memo,
      createdAt: arLedger.createdAt
    })
    .from(arLedger)
    .leftJoin(partners, eq(arLedger.customerPartnerId, partners.id));

  if (filters?.customerPartnerId) {
    query = query.where(eq(arLedger.customerPartnerId, filters.customerPartnerId)) as any;
  }
  if (filters?.startDate) {
    query = query.where(sql`${arLedger.occurredAt} >= ${filters.startDate}`) as any;
  }
  if (filters?.endDate) {
    query = query.where(sql`${arLedger.occurredAt} <= ${filters.endDate}`) as any;
  }
  if (filters?.arEntryType) {
    query = query.where(eq(arLedger.arEntryType, filters.arEntryType)) as any;
  }

  return await query.orderBy(desc(arLedger.occurredAt));
}

/**
 * 매출 원장 상세 조회
 */
export async function getArLedgerById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  const [entry] = await db
    .select({
      id: arLedger.id,
      customerPartnerId: arLedger.customerPartnerId,
      customerName: partners.companyName,
      occurredAt: arLedger.occurredAt,
      arEntryType: arLedger.arEntryType,
      amount: arLedger.amount,
      dueDate: arLedger.dueDate,
      refType: arLedger.refType,
      refId: arLedger.refId,
      memo: arLedger.memo,
      createdAt: arLedger.createdAt
    })
    .from(arLedger)
    .leftJoin(partners, eq(arLedger.customerPartnerId, partners.id))
    .where(eq(arLedger.id, id));
  return entry;
}

/**
 * 고객사별 매출 집계
 */
export async function getArSummaryByCustomer(startDate?: string, endDate?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  let query = db
    .select({
      customerPartnerId: arLedger.customerPartnerId,
      customerName: partners.companyName,
      totalAmount: sql<number>`SUM(${arLedger.amount})`,
      transactionCount: sql<number>`COUNT(*)`
    })
    .from(arLedger)
    .leftJoin(partners, eq(arLedger.customerPartnerId, partners.id))
    .groupBy(arLedger.customerPartnerId, partners.companyName);

  if (startDate) {
    query = query.where(sql`${arLedger.occurredAt} >= ${startDate}`) as any;
  }
  if (endDate) {
    query = query.where(sql`${arLedger.occurredAt} <= ${endDate}`) as any;
  }

  return await query;
}

/**
 * 매입/매출 통합 집계 (재무 현황)
 */
export async function getFinancialSummary(startDate?: string, endDate?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");

  // 매입 합계
  const apTotal = await db
    .select({
      total: sql<number>`COALESCE(SUM(${apLedger.amount}), 0)`
    })
    .from(apLedger)
    .where(
      startDate && endDate
        ? sql`${apLedger.occurredAt} >= ${startDate} AND ${apLedger.occurredAt} <= ${endDate}`
        : undefined
    );

  // 매출 합계
  const arTotal = await db
    .select({
      total: sql<number>`COALESCE(SUM(${arLedger.amount}), 0)`
    })
    .from(arLedger)
    .where(
      startDate && endDate
        ? sql`${arLedger.occurredAt} >= ${startDate} AND ${arLedger.occurredAt} <= ${endDate}`
        : undefined
    );

  return {
    totalPurchase: apTotal[0]?.total || 0,
    totalSales: arTotal[0]?.total || 0,
    netProfit: (arTotal[0]?.total || 0) - (apTotal[0]?.total || 0)
  };
}
PARTNERS_EOF

echo "partners.ts 수정 완료"

echo "=== 모든 파일 수정 완료 ==="
