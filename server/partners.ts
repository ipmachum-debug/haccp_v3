/**
 * 거래처 및 원장 관리 데이터베이스 함수
 * partners, apLedger, arLedger 관련 CRUD
 * [P2-1] tenant 격리 전면 적용 + accountingAccountId 연결
 */
import { getDb } from "./db";
import { getRows } from "./utils/dbHelpers";
import {
  partners, 
  apLedger, 
  arLedger,
  type InsertPartner,
  type InsertApLedgerEntry,
  type InsertArLedgerEntry
} from "../drizzle/schema/schema_main";
import { eq, and, desc, sql, or, like, asc, type SQL } from "drizzle-orm";

// ============================================
// 거래처 관리 (Partners) - tenantId 필터링 추가
// ============================================

/**
 * 거래처 생성
 */
export async function createPartner(data: InsertPartner & { tenantId?: number }) {
  try {
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");
    
    // 빈 문자열을 null로 변환 (MySQL varchar 컬럼 호환성)
    const cleanData: Record<string, unknown> = { ...data };
    const nullableFields = [
      'bizNo', 'supplierCode', 'supplierType', 'certifications', 'rating',
      'ceoName', 'contactPerson', 'bizType', 'bizItem', 'address',
      'phone', 'fax', 'email', 'bankName', 'bankAccount'
    ];
    for (const field of nullableFields) {
      if (cleanData[field] === '' || cleanData[field] === undefined) {
        cleanData[field] = null;
      }
    }
    
    const [result] = await db.insert(partners).values(cleanData as any);
    return result.insertId;
  } catch (error: unknown) {
    console.error("[createPartner] Error:", error);
    // 사업자번호 중복 에러 처리
    const err = error as { code?: string; message?: string };
    if (err?.code === 'ER_DUP_ENTRY' || err?.message?.includes('Duplicate entry') || err?.message?.includes('partners_tenant_biz_no_unique')) {
      throw new Error("동일한 사업자등록번호가 이미 등록되어 있습니다.");
    }
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
  if (!db) throw new Error("DB 연결 실패");

  const conditions: SQL[] = [];
  
  if (tenantId) {
    conditions.push(eq(partners.tenantId, tenantId));
  }
  if (filters?.partnerType) {
    conditions.push(eq(partners.partnerType, filters.partnerType));
  }
  // is_active 필터: 명시적으로 지정하지 않으면 기본값 1 (활성만 조회)
  if (filters?.isActive !== undefined) {
    conditions.push(eq(partners.isActive, filters.isActive));
  } else {
    conditions.push(eq(partners.isActive, 1));
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
export async function getPartnerById(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions: SQL[] = [eq(partners.id, id)];
  if (tenantId) conditions.push(eq(partners.tenantId, tenantId as any));
  const [partner] = await db.select().from(partners).where(and(...conditions));
  return partner;
}

/**
 * 거래처 수정
 */
export async function updatePartner(id: number, data: Partial<InsertPartner>, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions: SQL[] = [eq(partners.id, id)];
  if (tenantId) conditions.push(eq(partners.tenantId, tenantId as any));
  await db.update(partners).set(data).where(and(...conditions));
}

/**
 * Phase B (2026-04-14): 결제 만기일 자동 계산
 * - partner.paymentTermsDays 를 occurredAt 에 더해서 dueDate 반환
 * - 기본값(30일) 은 partner.paymentTermsDays 가 null 일 때 사용
 * - explicitDueDate 가 있으면 그대로 사용 (수동 지정 우선)
 */
export async function resolveDueDate(
  tenantId: number,
  partnerId: number,
  occurredAt: Date | string,
  explicitDueDate?: Date | string | null,
): Promise<Date | null> {
  if (explicitDueDate) {
    return typeof explicitDueDate === "string" ? new Date(explicitDueDate) : explicitDueDate;
  }
  const db = await getDb();
  if (!db) return null;

  const [partner] = await db
    .select({ paymentTermsDays: partners.paymentTermsDays })
    .from(partners)
    .where(and(eq(partners.id, partnerId), eq(partners.tenantId, tenantId)))
    .limit(1);

  const days = partner?.paymentTermsDays ?? 30; // 기본 30일
  const base = typeof occurredAt === "string" ? new Date(occurredAt) : occurredAt;
  if (!base || isNaN(base.getTime())) return null;

  const due = new Date(base);
  due.setDate(due.getDate() + days);
  return due;
}

/**
 * 거래처 삭제 (소프트 삭제)
 */
export async function deletePartner(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions: SQL[] = [eq(partners.id, id)];
  if (tenantId) conditions.push(eq(partners.tenantId, tenantId as any));
  await db.update(partners).set({ isActive: 0 }).where(and(...conditions));
}

/**
 * 사업자등록번호로 거래처 검색
 */
export async function getPartnerByBizNo(bizNo: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions: SQL[] = [eq(partners.bizNo, bizNo)];
  if (tenantId) conditions.push(eq(partners.tenantId, tenantId as any));
  const [partner] = await db.select().from(partners).where(and(...conditions));
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
  if (!db) throw new Error("DB 연결 실패");

  const page = params.page || 1;
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;

  const conditions: SQL[] = [
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
    contactPerson: p.contactPerson || p.ceoName,
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
  if (!db) throw new Error("DB 연결 실패");

  // supplier_code 자동 생성
  let supplierCode = data.supplierCode;
  if (!supplierCode) {
    const maxResult = await db.execute(
      sql`SELECT MAX(CAST(SUBSTRING(supplier_code, 5) AS UNSIGNED)) as maxNum FROM partners WHERE tenant_id = ${data.tenantId} AND supplier_code REGEXP '^SUP-[0-9]+$'`
    );
    const maxRows = getRows<{ maxNum: number | null }>(maxResult);
    const maxNum = Number(maxRows[0]?.maxNum || 0);
    supplierCode = "SUP-" + String(maxNum + 1).padStart(3, "0");
  }

  try {
    const [result] = await db.insert(partners).values({
      tenantId: data.tenantId,
      partnerType: "supplier",
      companyName: data.supplierName,
      bizNo: data.businessNumber || null,
      supplierCode,
      supplierType: data.supplierType || "거래처",
      ceoName: data.contactPerson || null,
      contactPerson: data.contactPerson || null,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      certifications: data.certifications || null,
      rating: data.rating || null,
    });

    return result.insertId;
  } catch (error: unknown) {
    console.error("[createSupplierPartner] Error:", error);
    const err = error as { code?: string; message?: string };
    if (err?.code === 'ER_DUP_ENTRY' || err?.message?.includes('Duplicate entry') || err?.message?.includes('partners_tenant_biz_no_unique')) {
      throw new Error("동일한 사업자등록번호가 이미 등록되어 있습니다.");
    }
    throw error;
  }
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
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const updateData: Partial<InsertPartner> = {};
  if (data.supplierName !== undefined) updateData.companyName = data.supplierName;
  if (data.supplierCode !== undefined) updateData.supplierCode = data.supplierCode;
  if (data.businessNumber !== undefined) updateData.bizNo = data.businessNumber;
  if (data.contactPerson !== undefined) updateData.contactPerson = data.contactPerson;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.address !== undefined) updateData.address = data.address;
  if (data.supplierType !== undefined) updateData.supplierType = data.supplierType;
  if (data.certifications !== undefined) updateData.certifications = data.certifications;
  if (data.rating !== undefined) updateData.rating = data.rating;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  const conditions: SQL[] = [eq(partners.id, id)];
  if (tenantId) conditions.push(eq(partners.tenantId, tenantId as any));
  await db.update(partners).set(updateData).where(and(...conditions));
}

/**
 * 거래처 삭제 (HACCP 마스터데이터 호환 - 소프트 삭제)
 */
export async function deleteSupplierPartner(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  await db.update(partners).set({ isActive: 0 }).where(
    and(eq(partners.id, id), eq(partners.tenantId, tenantId))
  );
}

// ============================================
// 매입 원장 (AP Ledger) - [P2-1] tenant 격리 + accountingAccountId 연결
// ============================================

/**
 * 매입 거래 생성 (accountingAccountId 지원)
 */
export async function createApLedgerEntry(data: InsertApLedgerEntry) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [result] = await db.insert(apLedger).values(data);
  return result.insertId;
}

/**
 * 매입 원장 조회 (tenant 격리 + accountingAccountId 조인)
 */
export async function getApLedger(filters?: {
  supplierPartnerId?: number;
  startDate?: string;
  endDate?: string;
  apEntryType?: "bill" | "payment" | "credit" | "adjust";
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions: SQL[] = [];
  
  if (filters?.tenantId) {
    conditions.push(eq(apLedger.tenantId, filters.tenantId));
  }
  if (filters?.supplierPartnerId) {
    conditions.push(eq(apLedger.supplierPartnerId, filters.supplierPartnerId));
  }
  if (filters?.startDate) {
    conditions.push(sql`${apLedger.occurredAt} >= ${filters.startDate}`);
  }
  if (filters?.endDate) {
    conditions.push(sql`${apLedger.occurredAt} <= ${filters.endDate}`);
  }
  if (filters?.apEntryType) {
    conditions.push(eq(apLedger.apEntryType, filters.apEntryType));
  }

  let query = db
    .select({
      id: apLedger.id,
      tenantId: apLedger.tenantId,
      supplierPartnerId: apLedger.supplierPartnerId,
      supplierName: partners.companyName,
      occurredAt: apLedger.occurredAt,
      apEntryType: apLedger.apEntryType,
      amount: apLedger.amount,
      refType: apLedger.refType,
      refId: apLedger.refId,
      memo: apLedger.memo,
      accountingAccountId: apLedger.accountingAccountId,
      createdAt: apLedger.createdAt
    })
    .from(apLedger)
    .leftJoin(
      partners,
      and(
        eq(apLedger.supplierPartnerId, partners.id),
        eq(partners.tenantId, apLedger.tenantId),
      ),
    );

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query.orderBy(desc(apLedger.occurredAt));
}

/**
 * 매입 원장 상세 조회 (tenant 격리)
 */
export async function getApLedgerById(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions: SQL[] = [eq(apLedger.id, id)];
  if (tenantId) {
    conditions.push(eq(apLedger.tenantId, tenantId));
  }

  const [entry] = await db
    .select({
      id: apLedger.id,
      tenantId: apLedger.tenantId,
      supplierPartnerId: apLedger.supplierPartnerId,
      supplierName: partners.companyName,
      occurredAt: apLedger.occurredAt,
      apEntryType: apLedger.apEntryType,
      amount: apLedger.amount,
      refType: apLedger.refType,
      refId: apLedger.refId,
      memo: apLedger.memo,
      accountingAccountId: apLedger.accountingAccountId,
      createdAt: apLedger.createdAt
    })
    .from(apLedger)
    .leftJoin(
      partners,
      and(
        eq(apLedger.supplierPartnerId, partners.id),
        eq(partners.tenantId, apLedger.tenantId),
      ),
    )
    .where(and(...conditions));

  return entry;
}

/**
 * 공급업체별 매입 집계 (tenant 격리)
 */
export async function getApSummaryBySupplier(startDate?: string, endDate?: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions: SQL[] = [];
  
  if (tenantId) {
    conditions.push(eq(apLedger.tenantId, tenantId));
  }
  if (startDate) {
    conditions.push(sql`${apLedger.occurredAt} >= ${startDate}`);
  }
  if (endDate) {
    conditions.push(sql`${apLedger.occurredAt} <= ${endDate}`);
  }

  let query = db
    .select({
      supplierPartnerId: apLedger.supplierPartnerId,
      supplierName: partners.companyName,
      totalAmount: sql<number>`SUM(${apLedger.amount})`,
      transactionCount: sql<number>`COUNT(*)`
    })
    .from(apLedger)
    .leftJoin(
      partners,
      and(
        eq(apLedger.supplierPartnerId, partners.id),
        eq(partners.tenantId, apLedger.tenantId),
      ),
    )
    .groupBy(apLedger.supplierPartnerId, partners.companyName);

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query;
}

// ============================================
// 매출 원장 (AR Ledger) - [P2-1] tenant 격리 + accountingAccountId 연결
// ============================================

/**
 * 매출 거래 생성 (accountingAccountId 지원)
 */
export async function createArLedgerEntry(data: InsertArLedgerEntry) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [result] = await db.insert(arLedger).values(data);
  return result.insertId;
}

/**
 * 매출 원장 조회 (tenant 격리 + accountingAccountId 조인)
 */
export async function getArLedger(filters?: {
  customerPartnerId?: number;
  startDate?: string;
  endDate?: string;
  arEntryType?: "debit" | "payment" | "credit" | "writeoff" | "adjust";
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions: SQL[] = [];
  
  if (filters?.tenantId) {
    conditions.push(eq(arLedger.tenantId, filters.tenantId));
  }
  if (filters?.customerPartnerId) {
    conditions.push(eq(arLedger.customerPartnerId, filters.customerPartnerId));
  }
  if (filters?.startDate) {
    conditions.push(sql`${arLedger.occurredAt} >= ${filters.startDate}`);
  }
  if (filters?.endDate) {
    conditions.push(sql`${arLedger.occurredAt} <= ${filters.endDate}`);
  }
  if (filters?.arEntryType) {
    conditions.push(eq(arLedger.arEntryType, filters.arEntryType));
  }

  let query = db
    .select({
      id: arLedger.id,
      tenantId: arLedger.tenantId,
      customerPartnerId: arLedger.customerPartnerId,
      customerName: partners.companyName,
      occurredAt: arLedger.occurredAt,
      arEntryType: arLedger.arEntryType,
      amount: arLedger.amount,
      dueDate: arLedger.dueDate,
      refType: arLedger.refType,
      refId: arLedger.refId,
      memo: arLedger.memo,
      accountingAccountId: arLedger.accountingAccountId,
      createdAt: arLedger.createdAt
    })
    .from(arLedger)
    .leftJoin(
      partners,
      and(
        eq(arLedger.customerPartnerId, partners.id),
        eq(partners.tenantId, arLedger.tenantId),
      ),
    );

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query.orderBy(desc(arLedger.occurredAt));
}

/**
 * 매출 원장 상세 조회 (tenant 격리)
 */
export async function getArLedgerById(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions: SQL[] = [eq(arLedger.id, id)];
  if (tenantId) {
    conditions.push(eq(arLedger.tenantId, tenantId));
  }

  const [entry] = await db
    .select({
      id: arLedger.id,
      tenantId: arLedger.tenantId,
      customerPartnerId: arLedger.customerPartnerId,
      customerName: partners.companyName,
      occurredAt: arLedger.occurredAt,
      arEntryType: arLedger.arEntryType,
      amount: arLedger.amount,
      dueDate: arLedger.dueDate,
      refType: arLedger.refType,
      refId: arLedger.refId,
      memo: arLedger.memo,
      accountingAccountId: arLedger.accountingAccountId,
      createdAt: arLedger.createdAt
    })
    .from(arLedger)
    .leftJoin(
      partners,
      and(
        eq(arLedger.customerPartnerId, partners.id),
        eq(partners.tenantId, arLedger.tenantId),
      ),
    )
    .where(and(...conditions));

  return entry;
}

/**
 * 고객사별 매출 집계 (tenant 격리)
 */
export async function getArSummaryByCustomer(startDate?: string, endDate?: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions: SQL[] = [];
  
  if (tenantId) {
    conditions.push(eq(arLedger.tenantId, tenantId));
  }
  if (startDate) {
    conditions.push(sql`${arLedger.occurredAt} >= ${startDate}`);
  }
  if (endDate) {
    conditions.push(sql`${arLedger.occurredAt} <= ${endDate}`);
  }

  let query = db
    .select({
      customerPartnerId: arLedger.customerPartnerId,
      customerName: partners.companyName,
      totalAmount: sql<number>`SUM(${arLedger.amount})`,
      transactionCount: sql<number>`COUNT(*)`
    })
    .from(arLedger)
    .leftJoin(
      partners,
      and(
        eq(arLedger.customerPartnerId, partners.id),
        eq(partners.tenantId, arLedger.tenantId),
      ),
    )
    .groupBy(arLedger.customerPartnerId, partners.companyName);

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query;
}

/**
 * 매입/매출 통합 집계 (재무 현황) - tenant 격리
 */
export async function getFinancialSummary(startDate?: string, endDate?: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 매입 합계
  const apConditions: SQL[] = [];
  const arConditions: SQL[] = [];
  
  if (tenantId) {
    apConditions.push(eq(apLedger.tenantId, tenantId));
    arConditions.push(eq(arLedger.tenantId, tenantId));
  }
  if (startDate && endDate) {
    apConditions.push(sql`${apLedger.occurredAt} >= ${startDate} AND ${apLedger.occurredAt} <= ${endDate}`);
    arConditions.push(sql`${arLedger.occurredAt} >= ${startDate} AND ${arLedger.occurredAt} <= ${endDate}`);
  }

  const apTotal = await db
    .select({
      total: sql<number>`COALESCE(SUM(${apLedger.amount}), 0)`
    })
    .from(apLedger)
    .where(apConditions.length > 0 ? and(...apConditions) : undefined);

  const arTotal = await db
    .select({
      total: sql<number>`COALESCE(SUM(${arLedger.amount}), 0)`
    })
    .from(arLedger)
    .where(arConditions.length > 0 ? and(...arConditions) : undefined);

  return {
    totalPurchase: apTotal[0]?.total || 0,
    totalSales: arTotal[0]?.total || 0,
    netProfit: (arTotal[0]?.total || 0) - (apTotal[0]?.total || 0)
  };
}
