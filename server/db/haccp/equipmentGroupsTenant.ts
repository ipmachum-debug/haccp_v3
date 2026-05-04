import { eq, and, desc, sql, count } from "drizzle-orm";
import { getDb, getRawConnection } from "../connection";

// ============================================================================
// Equipment Profile Management (설비 프로필 관리)
// ============================================================================

/**
 * 설비 프로필 생성
 */
export async function createEquipment(equipment: {
  code: string;
  name: string;
  type: string;
  ccpType?: string;
  defaultTemperature?: string;
  defaultPressure?: string;
    edgeTemperature?: string;
    centerTemperature?: string;
    batchOperationTime?: number;
  defaultTime?: number;
  monitoringInterval?: number;
  rowsPerBatch?: number;
  status?: string;
  notes?: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { equipments } = await import("../../../drizzle/schema");

  const [result] = await db.insert(equipments).values({
    code: equipment.code,
    name: equipment.name,
    type: equipment.type,
    ccpType: equipment.ccpType || null,
    defaultTemperature: equipment.defaultTemperature || null,
    defaultPressure: equipment.defaultPressure || null,
    defaultTime: equipment.defaultTime || null,
    monitoringInterval: equipment.monitoringInterval || 10,
    rowsPerBatch: equipment.rowsPerBatch || 4,
    status: equipment.status || "active",
    notes: equipment.notes || null,
    ...(tenantId ? { tenantId } : {}),
  } as any);

  return Number(result.insertId);
}

/**
 * 설비 프로필 목록 조회
 */
export async function getAllEquipments(filters?: {
  type?: string;
  ccpType?: string;
  status?: string;
  page?: number;
  limit?: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) return { items: [], total: 0, page: 1, limit: 50 };

  const { equipments } = await import("../../../drizzle/schema");
  const { count, and: andOp } = await import("drizzle-orm");

  // ✅ P0 FIX: tenant_id 필터 강제
  const conditions: any[] = [];
  if (tenantId) {
    conditions.push(eq(equipments.tenantId, tenantId));
  }
  if (filters?.type) {
    conditions.push(eq(equipments.type, filters.type));
  }
  if (filters?.ccpType) {
    conditions.push(eq(equipments.ccpType, filters.ccpType));
  }
  if (filters?.status) {
    conditions.push(eq(equipments.status, filters.status));
  }

  const page = filters?.page || 1;
  const limit = filters?.limit || 50;
  const offset = (page - 1) * limit;

  const whereClause = conditions.length > 0 ? andOp(...conditions) : undefined;

  const items = await db.select().from(equipments).where(whereClause).limit(limit).offset(offset);

  const [{ count: total }] = await db.select({ count: count() }).from(equipments).where(whereClause);

  return { items, total, page, limit };
}

/**
 * 설비 프로필 상세 조회
 */
export async function getEquipmentById(equipmentId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { equipments } = await import("../../../drizzle/schema");
  const { and: andOp } = await import("drizzle-orm");

  // ✅ P0 FIX: tenant_id 필터 강제
  const conditions: any[] = [eq(equipments.id, equipmentId)];
  if (tenantId) {
    conditions.push(eq(equipments.tenantId, tenantId));
  }

  const result = await db.select().from(equipments).where(andOp(...conditions)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * 설비 프로필 수정
 */
export async function updateEquipment(
  equipmentId: number,
  updates: {
    code?: string;
    name?: string;
    type?: string;
    ccpType?: string;
    defaultTemperature?: string;
    defaultPressure?: string;
    edgeTemperature?: string;
    centerTemperature?: string;
    batchOperationTime?: number;
    defaultTime?: number;
    feSensitivity?: string;
    stsSensitivity?: string;
    detectionSpeed?: string;
    dailyProductCount?: number;
    workStartTime?: string;
    workEndTime?: string;
    lunchStartTime?: string;
    lunchEndTime?: string;
    monitoringInterval?: number;
    rowsPerBatch?: number;
    status?: string;
    notes?: string;
  },
  tenantId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { equipments } = await import("../../../drizzle/schema");

  // undefined/빈 값 제거 - decimal 필드 올바르게 처리
  const cleanUpdates: Record<string, any> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined && value !== null && value !== '') {
      cleanUpdates[key] = value;
    }
  }

  if (Object.keys(cleanUpdates).length === 0) {
    return { success: true };
  }

  // ✅ P0 FIX: tenant_id 필터 강제
  const { and: andOp } = await import("drizzle-orm");
  const conditions: any[] = [eq(equipments.id, equipmentId)];
  if (tenantId) {
    conditions.push(eq(equipments.tenantId, tenantId));
  }

  await db.update(equipments).set(cleanUpdates as any).where(andOp(...conditions));

  return { success: true };
}

/**
 * 설비 프로필 삭제
 */
export async function deleteEquipment(equipmentId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { equipments } = await import("../../../drizzle/schema");
  const { and: andOp } = await import("drizzle-orm");

  // ✅ P0 FIX: tenant_id 필터 강제
  const conditions: any[] = [eq(equipments.id, equipmentId)];
  if (tenantId) {
    conditions.push(eq(equipments.tenantId, tenantId));
  }

  await db.delete(equipments).where(andOp(...conditions));

  return { success: true };
}

/**
 * CCP 유형별 설비 목록 조회
 */
export async function getEquipmentsByCcpType(ccpType: string, tenantId?: number) {
  const db = await getDb();
  if (!db) return [];

  const { equipments } = await import("../../../drizzle/schema");

  const { and } = await import("drizzle-orm");

  // ✅ P0 FIX: tenant_id 필터 강제
  const conditions: any[] = [
    eq(equipments.ccpType, ccpType),
    eq(equipments.status, "active")
  ];
  if (tenantId) {
    conditions.push(eq(equipments.tenantId, tenantId));
  }

  const result = await db
    .select()
    .from(equipments)
    .where(and(...conditions));

  return result;
}

// ============================================================================
// 생산 일정 관리 (Production Schedule)
// ============================================================================

/**
 * 기간별 배치 일정 조회 (캘린더용)
 */
export async function getBatchSchedule(params: {
  startDate: string;
  endDate: string;
  siteId?: number;
  status?: string;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatches, hProductsV2 } = await import("../../../drizzle/schema");
  const { and, eq, sql } = await import("drizzle-orm");

  const conditions = [
    eq(hBatches.tenantId, params.tenantId),
    sql`${hBatches.plannedDate} >= ${params.startDate}`,
    sql`${hBatches.plannedDate} <= ${params.endDate}`,
  ];

  if (params.siteId) {
    conditions.push(eq(hBatches.siteId, params.siteId));
  }

  if (params.status) {
    conditions.push(eq(hBatches.status, params.status as any));
  }

  const batches = await db
    .select({
      batch: hBatches,
      product: hProductsV2
    })
    .from(hBatches)
    .leftJoin(hProductsV2, and(eq(hBatches.productId, hProductsV2.id), eq(hProductsV2.tenantId, params.tenantId)))
    .where(and(...conditions))
    .orderBy(hBatches.plannedDate);

  return batches.map((row) => ({
    ...row.batch,
    productName: row.product?.productName || "\uc54c \uc218 \uc5c6\uc74c",
    productCode: row.product?.productCode || ""
  }));
}

/**
 * 배치별 원재료 소요량 계산 (BOM 기반)
 */
export async function calculateMaterialRequirements(batchId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatches, hMfReports, hMfReportVersions, hMfIngredients, hMaterials, hInventoryLots } = await import("../../../drizzle/schema");
  const { eq, and, sql, desc } = await import("drizzle-orm");

  // 1. 배치 정보 조회 (tenantId가 있으면 격리 적용)
  const batchConditions = [eq(hBatches.id, batchId)];
  if (tenantId) {
    batchConditions.push(eq(hBatches.tenantId, tenantId));
  }
  const [batch] = await db
    .select()
    .from(hBatches)
    .where(and(...batchConditions))
    .limit(1);

  if (!batch) throw new Error("배치를 찾을 수 없습니다");

  // 2. 제품의 BOM(품목제조보고) 조회
  const bomConditions: any[] = [
    eq(hMfReports.productId, batch.productId),
    eq(hMfReports.status, "ACTIVE"),
  ];
  if (tenantId) {
    bomConditions.push(eq(hMfReports.tenantId, tenantId));
  }
  const [bomReport] = await db
    .select()
    .from(hMfReports)
    .where(and(...bomConditions))
    .orderBy(desc(hMfReports.createdAt))
    .limit(1);

  if (!bomReport) {
    return {
      batchId,
      plannedQuantity: batch.plannedQuantity,
      materials: [],
      totalCost: 0
    };
  }

  // 3. 최신 버전 조회
  const [latestVersion] = await db
    .select()
    .from(hMfReportVersions)
    .where(eq(hMfReportVersions.mfReportId, bomReport.id))
    .orderBy(desc(hMfReportVersions.versionNo))
    .limit(1);

  if (!latestVersion) {
    return {
      batchId,
      plannedQuantity: batch.plannedQuantity,
      materials: [],
      totalCost: 0
    };
  }

  // 4. BOM 원재료 구성 조회
  const ingredientsData = await db
    .select({
      ingredient: hMfIngredients,
      material: hMaterials,
    })
    .from(hMfIngredients)
    .leftJoin(hMaterials, eq(hMfIngredients.materialId, hMaterials.id))
    .where(eq(hMfIngredients.mfReportVersionId, latestVersion.id))
    .orderBy(hMfIngredients.lineNo);

  // 5. 각 원재료별 필요 수량 및 재고 현황 계산
  const materialRequirements = await Promise.all(
    ingredientsData.map(async (line) => {
      const material = line.material;
      const ingredient = line.ingredient;

      if (!material || !ingredient) return null;

      // 필요 수량 계산: correctedQuantity 또는 adjustedWeightKg 우선 사용
      const ingredientQty = parseFloat(
        ingredient.correctedQuantity || ingredient.adjustedWeightKg?.toString() || ingredient.quantity || "0"
      );
      const requiredQuantity = parseFloat(batch.plannedQuantity) * ingredientQty;

      // 현재 재고 조회 (가용 수량 합계)
      const [stockResult] = await db
        .select({
          totalStock: sql<number>`SUM(${hInventoryLots.availableQuantity})`
        })
        .from(hInventoryLots)
        .where(and(
          eq(hInventoryLots.materialId, material.id),
          eq(hInventoryLots.status, "available")
        ));

      const currentStock = stockResult?.totalStock || 0;
      const shortage = Math.max(0, requiredQuantity - currentStock);

      // 비용 계산
      const unitPrice = parseFloat(material.unitPrice || "0");
      const totalCost = requiredQuantity * unitPrice;

      return {
        materialId: material.id,
        materialName: material.materialName,
        materialCode: material.materialCode,
        requiredQuantity,
        currentStock,
        shortage,
        unit: ingredient.unit,
        unitPrice,
        totalCost,
        isShortage: shortage > 0
      };
    })
  );

  const validMaterials = materialRequirements.filter((m) => m !== null);
  const totalCost = validMaterials.reduce((sum, m) => sum + (m?.totalCost || 0), 0);

  return {
    batchId,
    plannedQuantity: batch.plannedQuantity,
    materials: validMaterials,
    totalCost
  };
}

/**
 * 생산 능력 분석 (일별/주별)
 */
export async function analyzeProductionCapacity(params: {
  startDate: string;
  endDate: string;
  siteId?: number;
  groupBy?: "day" | "week";
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatches, hProductsV2 } = await import("../../../drizzle/schema");
  const { and, eq, sql } = await import("drizzle-orm");

  const conditions = [
    sql`${hBatches.plannedDate} >= ${params.startDate}`,
    sql`${hBatches.plannedDate} <= ${params.endDate}`,
  ];

  if (params.siteId) {
    conditions.push(eq(hBatches.siteId, params.siteId));
  }

  const groupBy = params.groupBy || "day";
  const dateFormat = groupBy === "week" ? "%Y-%u" : "%Y-%m-%d";

  // 일별/주별 생산량 집계 (raw SQL로 GROUP BY 오류 회피)
  const result = await db.execute(sql`
    SELECT
      DATE_FORMAT(planned_date, ${dateFormat}) as date,
      COUNT(*) as totalBatches,
      COALESCE(SUM(planned_quantity), 0) as totalPlannedQuantity,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedBatches,
      COALESCE(SUM(CASE WHEN status = 'completed' THEN actual_quantity ELSE 0 END), 0) as totalActualQuantity
    FROM h_batches
    WHERE tenant_id = ${params.tenantId}
      AND planned_date >= ${params.startDate} AND planned_date <= ${params.endDate}
    GROUP BY DATE_FORMAT(planned_date, ${dateFormat})
    ORDER BY DATE_FORMAT(planned_date, ${dateFormat})
  `);
   // ★ db.execute(sql) 는 [rows, fields] 튜플 반환 — [0] 으로 rows 추출
   const rows = ((result as any)?.[0] ?? []) as any[];
   return rows.map((row: any) => ({
    period: row.date,
    plannedCount: Number(row.totalBatches) || 0,
    completedCount: Number(row.completedBatches) || 0,
    plannedQuantity: parseFloat(row.totalPlannedQuantity?.toString() || "0"),
    actualQuantity: parseFloat(row.totalActualQuantity?.toString() || "0"),
    utilizationRate: Number(row.totalBatches) > 0 ? (Number(row.completedBatches) / Number(row.totalBatches)) * 100 : 0
  }));
}

/**
 * 제품별 생산 능력 분석
 */
export async function analyzeProductionCapacityByProduct(params: {
  startDate: string;
  endDate: string;
  siteId?: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hBatches, hProductsV2 } = await import("../../../drizzle/schema");
  const { and, eq, sql } = await import("drizzle-orm");

  const conditions = [
    eq(hBatches.tenantId, params.tenantId),
    sql`${hBatches.plannedDate} >= ${params.startDate}`,
    sql`${hBatches.plannedDate} <= ${params.endDate}`,
  ];

  if (params.siteId) {
    conditions.push(eq(hBatches.siteId, params.siteId));
  }

  const result = await db
    .select({
      productId: hBatches.productId,
      productName: hProductsV2.productName,
      productCode: hProductsV2.productCode,
      batchCount: sql<number>`COUNT(*)`,
      totalPlannedQuantity: sql<number>`SUM(${hBatches.plannedQuantity})`,
      totalActualQuantity: sql<number>`SUM(${hBatches.actualQuantity})`,
      completedCount: sql<number>`SUM(CASE WHEN ${hBatches.status} = 'completed' THEN 1 ELSE 0 END)`
    })
    .from(hBatches)
    .leftJoin(hProductsV2, eq(hBatches.productId, hProductsV2.id))
    .where(and(...conditions))
    .groupBy(hBatches.productId, hProductsV2.productName, hProductsV2.productCode)
    .orderBy(sql`SUM(${hBatches.plannedQuantity}) DESC`);

  return result.map((row) => ({
    productId: row.productId,
    productName: row.productName || "알 수 없음",
    productCode: row.productCode || "",
    batchCount: row.batchCount || 0,
    totalPlannedQuantity: row.totalPlannedQuantity || 0,
    totalActualQuantity: row.totalActualQuantity || 0,
    completedCount: row.completedCount || 0,
    completionRate: row.batchCount > 0
      ? ((row.completedCount || 0) / row.batchCount) * 100
      : 0
  }));
}

// ==================== 사용자 그룹 관리 ====================

/**
 * 그룹 생성
 */
export async function createGroup(data: {
  name: string;
  description?: string;
  groupType: "department" | "team" | "project" | "custom";
  createdBy: number;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

  const { userGroups } = await import("../../../drizzle/schema/schema_main");

  const [result] = await db.insert(userGroups).values({
    name: data.name,
    description: data.description,
    groupType: data.groupType,
    createdBy: data.createdBy
  });

  return result.insertId;
}

/**
 * 모든 그룹 조회
 */
export async function getAllGroups(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

  const { userGroups, users } = await import("../../../drizzle/schema/schema_main");

  const groups = await db
    .select({
      id: userGroups.id,
      name: userGroups.name,
      description: userGroups.description,
      groupType: userGroups.groupType,
      createdAt: userGroups.createdAt,
      updatedAt: userGroups.updatedAt,
      createdBy: userGroups.createdBy,
      creatorName: users.name
    })
    .from(userGroups)
    .leftJoin(users, eq(userGroups.createdBy, users.id))
    .where(tenantId ? eq(userGroups.tenantId, tenantId) : undefined)
    .orderBy(desc(userGroups.createdAt));

  return groups;
}

/**
 * 그룹 정보 수정
 */
export async function updateGroup(
  groupId: number,
  data: {
    name?: string;
    description?: string;
    groupType?: "department" | "team" | "project" | "custom";
  },
  tenantId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

  const { userGroups } = await import("../../../drizzle/schema/schema_main");

  const conditions: any[] = [eq(userGroups.id, groupId)];
  if (tenantId) conditions.push(eq(userGroups.tenantId, tenantId));

  await db
    .update(userGroups)
    .set(data)
    .where(and(...conditions));

  return true;
}

/**
 * 그룹 삭제
 */
export async function deleteGroup(groupId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

  const { userGroups } = await import("../../../drizzle/schema/schema_main");

  const conditions: any[] = [eq(userGroups.id, groupId)];
  if (tenantId) conditions.push(eq(userGroups.tenantId, tenantId));

  await db.delete(userGroups).where(and(...conditions));

  return true;
}

/**
 * 그룹에 멤버 추가
 */
export async function addGroupMember(data: {
  groupId: number;
  userId: number;
  role: "member" | "leader" | "admin";
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

  const { userGroupMembers } = await import("../../../drizzle/schema/schema_main");

  await db.insert(userGroupMembers).values({
    groupId: data.groupId,
    userId: data.userId,
    role: data.role
  });

  return true;
}

/**
 * 그룹에서 멤버 제거
 */
export async function removeGroupMember(groupId: number, userId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

  const { userGroupMembers } = await import("../../../drizzle/schema/schema_main");

  await db
    .delete(userGroupMembers)
    .where(
      and(
        eq(userGroupMembers.groupId, groupId),
        eq(userGroupMembers.userId, userId)
      )
    );

  return true;
}

/**
 * 그룹 멤버 목록 조회
 */
export async function getGroupMembers(groupId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

  const { userGroupMembers, users } = await import("../../../drizzle/schema/schema_main");

  const members = await db
    .select({
      id: userGroupMembers.id,
      groupId: userGroupMembers.groupId,
      userId: userGroupMembers.userId,
      role: userGroupMembers.role,
      joinedAt: userGroupMembers.joinedAt,
      userName: users.name,
      userEmail: users.email,
      userRole: users.role
    })
    .from(userGroupMembers)
    .innerJoin(users, eq(userGroupMembers.userId, users.id))
    .where(eq(userGroupMembers.groupId, groupId))
    .orderBy(desc(userGroupMembers.joinedAt));

  return members;
}

/**
 * 사용자가 속한 그룹 목록 조회
 */
export async function getUserGroups(userId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("데이터베이스에 연결할 수 없습니다");

  const { userGroupMembers, userGroups } = await import("../../../drizzle/schema/schema_main");

  const groups = await db
    .select({
      id: userGroups.id,
      name: userGroups.name,
      description: userGroups.description,
      groupType: userGroups.groupType,
      memberRole: userGroupMembers.role,
      joinedAt: userGroupMembers.joinedAt
    })
    .from(userGroupMembers)
    .innerJoin(userGroups, eq(userGroupMembers.groupId, userGroups.id))
    .where(eq(userGroupMembers.userId, userId))
    .orderBy(desc(userGroupMembers.joinedAt));

  return groups;
}

// ==================== 테넌트 관리 ====================

/**
 * 테넌트 상세 정보 조회
 */
export async function getTenantDetail(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const rawConn = await getRawConnection();
  if (!rawConn) throw new Error("Raw connection failed");

  // 1) 테넌트 기본 정보
  const [tenantInfo] = await rawConn.execute(
    "SELECT id, name, status, created_at as createdAt FROM tenants WHERE id = ?",
    [tenantId]
  );

  if (!tenantInfo || (tenantInfo as any[]).length === 0) {
    throw new Error("Tenant not found");
  }

  // 2) 구성원 목록
  const [members] = await rawConn.execute(
    "SELECT id, email, name, role, approval_status as approvalStatus, is_active as isActive, last_login_at as lastLoginAt, created_at as createdAt FROM users WHERE tenant_id = ? ORDER BY created_at",
    [tenantId]
  );

  // 3) 사용 데이터량 통계
  const [batchCount] = await rawConn.execute(
    "SELECT COUNT(*) as count FROM h_batches WHERE tenant_id = ?",
    [tenantId]
  );

  const [ccpCount] = await rawConn.execute(
    "SELECT COUNT(*) as count FROM h_ccp_instances WHERE tenant_id = ?",
    [tenantId]
  );

  const [docCount] = await rawConn.execute(
    "SELECT COUNT(*) as count FROM h_documents WHERE tenant_id = ?",
    [tenantId]
  );

  const [checklistCount] = await rawConn.execute(
    "SELECT COUNT(*) as count FROM h_checklist_instances WHERE tenant_id = ?",
    [tenantId]
  );

  // 4) 활동 통계
  const [loginStats] = await rawConn.execute(
    "SELECT COUNT(DISTINCT user_id) as active_users, COUNT(*) as total_logins FROM h_audit_logs WHERE tenant_id = ? AND action = 'auth.login' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)",
    [tenantId]
  );

  const [lastActivity] = await rawConn.execute(
    "SELECT MAX(created_at) as last_activity FROM h_audit_logs WHERE tenant_id = ?",
    [tenantId]
  );

  return {
    tenant: (tenantInfo as any[])[0],
    members: (members as any[]) || [],
    memberCount: ((members as any[]) || []).length,
    dataUsage: {
      batches: (batchCount as any[])[0]?.count || 0,
      ccpInstances: (ccpCount as any[])[0]?.count || 0,
      documents: (docCount as any[])[0]?.count || 0,
      checklists: (checklistCount as any[])[0]?.count || 0
    },
    activityStats: {
      activeUsersLast7Days: (loginStats as any[])[0]?.active_users || 0,
      totalLoginsLast7Days: (loginStats as any[])[0]?.total_logins || 0,
      lastActivity: (lastActivity as any[])[0]?.last_activity || null
    }
  };
}

/**
 * 모든 테넌트 목록 조회
 */
export async function getAllTenants() {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const rawConn = await getRawConnection();
  if (!rawConn) throw new Error("Raw connection failed");

  const [tenants] = await rawConn.execute(
    "SELECT id, name, status, created_at as createdAt FROM tenants ORDER BY created_at"
  );

  return (tenants as any[]) || [];
}
