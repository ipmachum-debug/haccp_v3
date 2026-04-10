import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { getDb } from "./connection";
import { toKSTTimestamp } from "../utils/timezone";
import {
  checklistTemplates,
  checklistTemplateItems,
  checklistInstances,
  checklistInstanceItems
} from "../../drizzle/schema/checklist";
import {
  materialInspectionRecords,
  materialInspectionItems,
  shippingInspectionRecords,
  shippingInspectionItems,
  hygieneInspectionRecords,
  hygieneInspectionItems
} from "../../drizzle/schema/inspection";

// ============================================================================
// 체크리스트 템플릿 관리
// ============================================================================

/**
 * 체크리스트 템플릿 목록 조회
 */
export async function getChecklistTemplates(filters: {
  category?: string;
  ccpType?: string;
  isActive?: boolean;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const conditions: any[] = [];
  if (filters.tenantId) {
    conditions.push(eq(checklistTemplates.tenantId, filters.tenantId));
  }
  if (filters.category) {
    conditions.push(eq(checklistTemplates.category, filters.category as any));
  }
  if (filters.ccpType) {
    conditions.push(eq(checklistTemplates.ccpType, filters.ccpType));
  }
  if (filters.isActive !== undefined) {
    conditions.push(eq(checklistTemplates.isActive, filters.isActive ? 1 : 0));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  return await db
    .select()
    .from(checklistTemplates)
    .where(whereClause)
    .orderBy(desc(checklistTemplates.priority), desc(checklistTemplates.createdAt));
}

/**
 * 체크리스트 템플릿 상세 조회 (항목 포함)
 */
export async function getChecklistTemplateById(templateId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const conditions: any[] = [eq(checklistTemplates.id, templateId)];
  if (tenantId) {
    conditions.push(eq(checklistTemplates.tenantId, tenantId));
  }

  const [template] = await db
    .select()
    .from(checklistTemplates)
    .where(and(...conditions))
    .limit(1);

  if (!template) return null;

  const items = await db
    .select()
    .from(checklistTemplateItems)
    .where(eq(checklistTemplateItems.templateId, templateId))
    .orderBy(checklistTemplateItems.sortOrder);

  return {
    ...template,
    items
  };
}

/**
 * 체크리스트 템플릿 생성
 */
export async function createChecklistTemplate(data: {
  name: string;
  description?: string;
  category: "CCP" | "SANITATION" | "QUALITY" | "SAFETY" | "TRAINING" | "MAINTENANCE";
  ccpType?: string;
  priority?: number;
  autoTriggerRules?: any;
  createdBy?: number;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [result] = await db.insert(checklistTemplates).values({
    name: data.name,
    description: data.description,
    category: data.category,
    ccpType: data.ccpType,
    priority: data.priority || 0,
    autoTriggerRules: data.autoTriggerRules,
    createdBy: data.createdBy,
    tenantId: data.tenantId || 1,
    isActive: 1
  } as any);

  return Number(result.insertId);
}

/**
 * 체크리스트 템플릿 항목 생성
 */
export async function createChecklistTemplateItem(data: {
  templateId: number;
  sortOrder: number;
  itemName: string;
  itemType: "checkbox" | "number" | "text" | "select" | "time" | "date" | "temperature" | "pressure" | "textarea";
  required: boolean;
  validationRules?: any;
  defaultValue?: string;
  helpText?: string;
  description?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [result] = await db.insert(checklistTemplateItems).values({
    ...data,
    required: data.required ? 1 : 0
  } as any);

  return Number(result.insertId);
}

/**
 * 체크리스트 템플릿 + 항목 일괄 생성
 */
export async function createChecklistTemplateWithItems(data: {
  name: string;
  description?: string;
  category: "CCP" | "SANITATION" | "QUALITY" | "SAFETY" | "TRAINING" | "MAINTENANCE";
  ccpType?: string;
  priority?: number;
  autoTriggerRules?: any;
  createdBy?: number;
  items: Array<{
    sortOrder: number;
    itemName: string;
    itemType: "checkbox" | "number" | "text" | "select" | "textarea" | "time" | "date" | "temperature" | "pressure";
    required: boolean;
    description?: string;
    validationRules?: any;
    defaultValue?: string;
    helpText?: string;
  }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 템플릿 생성
  const templateId = await createChecklistTemplate({
    name: data.name,
    description: data.description,
    category: data.category,
    ccpType: data.ccpType,
    priority: data.priority,
    autoTriggerRules: data.autoTriggerRules,
    createdBy: data.createdBy
  });

  // 항목 생성
  for (const item of data.items) {
    await createChecklistTemplateItem({
      templateId,
      ...item
    });
  }

  return await getChecklistTemplateById(templateId);
}

/**
 * 체크리스트 템플릿 수정
 */
export async function updateChecklistTemplate(
  templateId: number,
  data: {
    name?: string;
    description?: string;
    category?: "CCP" | "SANITATION" | "QUALITY" | "SAFETY" | "TRAINING" | "MAINTENANCE";
    ccpType?: string;
    priority?: number;
    autoTriggerRules?: any;
    isActive?: boolean;
  },
  items?: Array<{
    id?: number;
    sortOrder: number;
    itemName: string;
    itemType: "checkbox" | "number" | "text" | "select" | "time" | "date" | "temperature" | "pressure" | "textarea";
    required: boolean;
    validationRules?: any;
    description?: string;
    defaultValue?: string;
    helpText?: string;
  }>,
  tenantId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 템플릿 업데이트 (tenantId 격리)
  const updateData: any = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.ccpType !== undefined) updateData.ccpType = data.ccpType;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.autoTriggerRules !== undefined) updateData.autoTriggerRules = data.autoTriggerRules;
  if (data.isActive !== undefined) updateData.isActive = data.isActive ? 1 : 0;

  if (Object.keys(updateData).length > 0) {
    const conditions: any[] = [eq(checklistTemplates.id, templateId)];
    if (tenantId) conditions.push(eq(checklistTemplates.tenantId, tenantId));
    await db
      .update(checklistTemplates)
      .set(updateData)
      .where(and(...conditions));
  }

  // 항목 업데이트 (제공된 경우)
  if (items) {
    // 기존 항목 삭제
    await db
      .delete(checklistTemplateItems)
      .where(eq(checklistTemplateItems.templateId, templateId));

    // 새 항목 추가
    for (const item of items) {
      await createChecklistTemplateItem({
        templateId,
        sortOrder: item.sortOrder,
        itemName: item.itemName,
        itemType: item.itemType,
        required: item.required,
        validationRules: item.validationRules,
        defaultValue: item.defaultValue,
        helpText: item.helpText
      });
    }
  }

  return await getChecklistTemplateById(templateId);
}

/**
 * 체크리스트 템플릿 삭제 (비활성화)
 */
export async function deleteChecklistTemplate(templateId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const conditions: any[] = [eq(checklistTemplates.id, templateId)];
  if (tenantId) conditions.push(eq(checklistTemplates.tenantId, tenantId));

  await db
    .update(checklistTemplates)
    .set({ isActive: 0 })
    .where(and(...conditions));

  return { success: true };
}

/**
 * 체크리스트 인스턴스 삭제
 */
export async function deleteChecklistInstance(instanceId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 승인완료된 인스턴스는 삭제 불가
  const conditions: any[] = [eq(checklistInstances.id, instanceId)];
  if (tenantId) conditions.push(eq(checklistInstances.tenantId, tenantId));
  const [existing] = await db.select({ status: checklistInstances.status }).from(checklistInstances).where(and(...conditions));
  if (!existing) throw new Error("체크리스트를 찾을 수 없습니다");
  if (existing.status === 'approved') throw new Error("승인완료된 체크리스트는 삭제할 수 없습니다");

  // 인스턴스 항목 삭제
  await db.delete(checklistInstanceItems).where(eq(checklistInstanceItems.instanceId, instanceId));
  // 인스턴스 삭제
  await db.delete(checklistInstances).where(and(...conditions));

  return { success: true };
}

/**
 * 체크리스트 인스턴스 생성 (템플릿 기반)
 */
export async function createChecklistInstanceFromTemplate(data: {
  templateId: number;
  batchId?: number;
  ccpRecordId?: number;
  scheduledDate?: string;
  dueDate?: string;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 템플릿 조회
  const template = await getChecklistTemplateById(data.templateId);
  if (!template) throw new Error("Template not found");

  // 인스턴스 생성
  const [instanceResult] = await db.insert(checklistInstances).values({
    templateId: data.templateId,
    batchId: data.batchId,
    ccpRecordId: data.ccpRecordId,
    status: "pending",
    scheduledDate: data.scheduledDate,
    dueDate: data.dueDate,
    createdBy: data.createdBy
  } as any);

  const instanceId = Number(instanceResult.insertId);

  // 인스턴스 항목 생성 (템플릿 항목 복사)
  for (const item of template.items) {
    await db.insert(checklistInstanceItems).values({
      instanceId,
      templateItemId: item.id,
      sortOrder: item.sortOrder,
      itemName: item.itemName,
      itemType: item.itemType,
      value: item.defaultValue || null,
      isCompleted: 0
    } as any);
  }

  return instanceId;
}

/**
 * 체크리스트 인스턴스 조회 (항목 포함)
 */
export async function getChecklistInstanceById(instanceId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const conditions: any[] = [eq(checklistInstances.id, instanceId)];
  if (tenantId) conditions.push(eq(checklistInstances.tenantId, tenantId));

  const [instance] = await db
    .select()
    .from(checklistInstances)
    .where(and(...conditions))
    .limit(1);

  if (!instance) return null;

  // 템플릿 정보 조회
  const [template] = await db
    .select()
    .from(checklistTemplates)
    .where(eq(checklistTemplates.id, instance.templateId))
    .limit(1);

  const items = await db
    .select()
    .from(checklistInstanceItems)
    .where(eq(checklistInstanceItems.instanceId, instanceId))
    .orderBy(checklistInstanceItems.sortOrder);

  return {
    ...instance,
    template,
    items
  };
}

/**
 * 체크리스트 인스턴스 항목 업데이트
 */
export async function updateChecklistInstanceItem(
  itemId: number,
  data: {
    value?: string;
    isCompleted?: boolean;
    completedBy?: number;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const updateData: any = {};
  if (data.value !== undefined) updateData.value = data.value;
  if (data.isCompleted !== undefined) {
    updateData.isCompleted = data.isCompleted ? 1 : 0;
    if (data.isCompleted) {
      updateData.completedAt = toKSTTimestamp(new Date());
      if (data.completedBy) updateData.completedBy = data.completedBy;
    }
  }

  await db
    .update(checklistInstanceItems)
    .set(updateData)
    .where(eq(checklistInstanceItems.id, itemId));

  return { success: true };
}

/**
 * 체크리스트 인스턴스 완료 처리
 */
export async function completeChecklistInstance(
  instanceId: number,
  completedBy: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const now = toKSTTimestamp(new Date());

  await db
    .update(checklistInstances)
    .set({
      status: "completed",
      completedAt: now,
      completedBy
    })
    .where(eq(checklistInstances.id, instanceId));

  return { success: true };
}

/**
 * 배치별 체크리스트 인스턴스 목록 조회
 */
export async function getChecklistInstancesByBatch(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  return await db
    .select()
    .from(checklistInstances)
    .where(eq(checklistInstances.batchId, batchId))
    .orderBy(checklistInstances.createdAt);
}

// ============================================================================
// 검사 시스템 (Inspection System)
// ============================================================================

/**
 * 원재료 검사 기록 생성
 */
export async function createMaterialInspectionRecord(data: {
  materialId: number;
  materialCode: string;
  materialName: string;
  lotNumber: string;
  inspectionDate: string;
  inspectorId: number;
  inspectorName: string;
  supplierName?: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [record] = await db.insert(materialInspectionRecords).values(data as any).$returningId();
  return record.id;
}

/**
 * 원재료 검사 항목 추가
 */
export async function addMaterialInspectionItem(data: {
  recordId: number;
  itemName: string;
  standard?: string;
  result?: string;
  passed: "pass" | "fail" | "na";
  sortOrder: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  await db.insert(materialInspectionItems).values(data as any);
  return { success: true };
}

/**
 * 원재료 검사 기록 목록 조회
 */
export async function getMaterialInspectionRecords(filters?: {
  startDate?: string;
  endDate?: string;
  status?: string;
  inspectionResult?: string;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  let query = db.select().from(materialInspectionRecords);

  const conditions = [];
  if (filters?.startDate) {
    conditions.push(gte(materialInspectionRecords.inspectionDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(materialInspectionRecords.inspectionDate, filters.endDate));
  }
  if (filters?.status) {
    conditions.push(eq(materialInspectionRecords.status, filters.status as any));
  }
  if (filters?.inspectionResult) {
    conditions.push(eq(materialInspectionRecords.inspectionResult, filters.inspectionResult as any));
  }
  if (filters?.tenantId) {
    conditions.push(eq(materialInspectionRecords.tenantId, filters.tenantId));
  }
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query.orderBy(desc(materialInspectionRecords.inspectionDate));
}

/**
 * 원재료 검사 기록 상세 조회
 */
export async function getMaterialInspectionRecordById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [record] = await db
    .select()
    .from(materialInspectionRecords)
    .where(eq(materialInspectionRecords.id, id));

  if (!record) return null;

  const items = await db
    .select()
    .from(materialInspectionItems)
    .where(eq(materialInspectionItems.recordId, id))
    .orderBy(materialInspectionItems.sortOrder);

  return { ...record, items };
}

/**
 * 원재료 검사 기록 상태 변경
 */
export async function updateMaterialInspectionStatus(
  id: number,
  status: "pending" | "completed" | "rejected",
  inspectionResult?: "pass" | "fail" | "conditional"
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const updateData: any = { status };
  if (inspectionResult) {
    updateData.inspectionResult = inspectionResult;
  }

  await db
    .update(materialInspectionRecords)
    .set(updateData)
    .where(eq(materialInspectionRecords.id, id));

  return { success: true };
}

/**
 * 출하 검사 기록 생성
 */
export async function createShippingInspectionRecord(data: {
  batchId: number;
  batchCode: string;
  productCode: string;
  productName: string;
  inspectionDate: string;
  inspectorId: number;
  inspectorName: string;
  quantity?: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [record] = await db.insert(shippingInspectionRecords).values(data as any).$returningId();
  return record.id;
}

/**
 * 출하 검사 항목 추가
 */
export async function addShippingInspectionItem(data: {
  recordId: number;
  itemName: string;
  standard?: string;
  result?: string;
  passed: "pass" | "fail" | "na";
  sortOrder: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  await db.insert(shippingInspectionItems).values(data as any);
  return { success: true };
}

/**
 * 출하 검사 기록 목록 조회
 */
export async function getShippingInspectionRecords(filters?: {
  startDate?: string;
  endDate?: string;
  status?: string;
  inspectionResult?: string;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  let query = db.select().from(shippingInspectionRecords);

  const conditions = [];
  if (filters?.startDate) {
    conditions.push(gte(shippingInspectionRecords.inspectionDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(shippingInspectionRecords.inspectionDate, filters.endDate));
  }
  if (filters?.status) {
    conditions.push(eq(shippingInspectionRecords.status, filters.status as any));
  }
  if (filters?.inspectionResult) {
    conditions.push(eq(shippingInspectionRecords.inspectionResult, filters.inspectionResult as any));
  }
  if (filters?.tenantId) {
    conditions.push(eq(shippingInspectionRecords.tenantId, filters.tenantId));
  }
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query.orderBy(desc(shippingInspectionRecords.inspectionDate));
}

/**
 * 출하 검사 기록 상세 조회
 */
export async function getShippingInspectionRecordById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [record] = await db
    .select()
    .from(shippingInspectionRecords)
    .where(eq(shippingInspectionRecords.id, id));

  if (!record) return null;

  const items = await db
    .select()
    .from(shippingInspectionItems)
    .where(eq(shippingInspectionItems.recordId, id))
    .orderBy(shippingInspectionItems.sortOrder);

  return { ...record, items };
}

/**
 * 출하 검사 기록 상태 변경
 */
export async function updateShippingInspectionStatus(
  id: number,
  status: "pending" | "completed" | "rejected",
  inspectionResult?: "pass" | "fail" | "hold"
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const updateData: any = { status };
  if (inspectionResult) {
    updateData.inspectionResult = inspectionResult;
  }

  await db
    .update(shippingInspectionRecords)
    .set(updateData)
    .where(eq(shippingInspectionRecords.id, id));

  return { success: true };
}

/**
 * 위생 검사 기록 생성
 */
export async function createHygieneInspectionRecord(data: {
  inspectionDate: string;
  inspectionArea: string;
  inspectorId: number;
  inspectorName: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [record] = await db.insert(hygieneInspectionRecords).values(data as any).$returningId();
  return record.id;
}

/**
 * 위생 검사 항목 추가
 */
export async function addHygieneInspectionItem(data: {
  recordId: number;
  itemName: string;
  standard?: string;
  result?: string;
  passed: "pass" | "fail" | "na";
  sortOrder: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  await db.insert(hygieneInspectionItems).values(data as any);
  return { success: true };
}

/**
 * 위생 검사 기록 목록 조회
 */
export async function getHygieneInspectionRecords(filters?: {
  startDate?: string;
  endDate?: string;
  status?: string;
  result?: string;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  let query = db.select().from(hygieneInspectionRecords);

  const conditions = [];
  if (filters?.startDate) {
    conditions.push(gte(hygieneInspectionRecords.inspectionDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(hygieneInspectionRecords.inspectionDate, filters.endDate));
  }
  if (filters?.status) {
    conditions.push(eq(hygieneInspectionRecords.status, filters.status as any));
  }
  if (filters?.result) {
    conditions.push(eq(hygieneInspectionRecords.result, filters.result as any));
  }
  if (filters?.tenantId) {
    conditions.push(eq(hygieneInspectionRecords.tenantId, filters.tenantId));
  }
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query.orderBy(desc(hygieneInspectionRecords.inspectionDate));
}

/**
 * 위생 검사 기록 상세 조회
 */
export async function getHygieneInspectionRecordById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const [record] = await db
    .select()
    .from(hygieneInspectionRecords)
    .where(eq(hygieneInspectionRecords.id, id));

  if (!record) return null;

  const items = await db
    .select()
    .from(hygieneInspectionItems)
    .where(eq(hygieneInspectionItems.recordId, id))
    .orderBy(hygieneInspectionItems.sortOrder);

  return { ...record, items };
}

/**
 * 위생 검사 기록 상태 변경
 */
export async function updateHygieneInspectionStatus(
  id: number,
  status: "pending" | "completed" | "action_required",
  result?: "good" | "fair" | "poor"
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  const updateData: any = { status };
  if (result) {
    updateData.result = result;
  }

  await db
    .update(hygieneInspectionRecords)
    .set(updateData)
    .where(eq(hygieneInspectionRecords.id, id));

  return { success: true };
}

/**
 * 검사 통계 조회
 */
export async function getInspectionStatistics(filters?: {
  startDate?: string;
  endDate?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  // 원재료 검사 통계
  const materialInspections = await db
    .select({
      total: sql<number>`COUNT(*)`,
      pending: sql<number>`SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)`,
      completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
      rejected: sql<number>`SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END)`,
      pass: sql<number>`SUM(CASE WHEN inspection_result = 'pass' THEN 1 ELSE 0 END)`,
      fail: sql<number>`SUM(CASE WHEN inspection_result = 'fail' THEN 1 ELSE 0 END)`
    })
    .from(materialInspectionRecords);

  // 출하 검사 통계
  const shippingInspections = await db
    .select({
      total: sql<number>`COUNT(*)`,
      pending: sql<number>`SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)`,
      completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
      rejected: sql<number>`SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END)`,
      pass: sql<number>`SUM(CASE WHEN inspection_result = 'pass' THEN 1 ELSE 0 END)`,
      fail: sql<number>`SUM(CASE WHEN inspection_result = 'fail' THEN 1 ELSE 0 END)`
    })
    .from(shippingInspectionRecords);

  // 위생 검사 통계
  const hygieneInspections = await db
    .select({
      total: sql<number>`COUNT(*)`,
      pending: sql<number>`SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)`,
      completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
      action_required: sql<number>`SUM(CASE WHEN status = 'action_required' THEN 1 ELSE 0 END)`,
      good: sql<number>`SUM(CASE WHEN result = 'good' THEN 1 ELSE 0 END)`,
      fair: sql<number>`SUM(CASE WHEN result = 'fair' THEN 1 ELSE 0 END)`,
      poor: sql<number>`SUM(CASE WHEN result = 'poor' THEN 1 ELSE 0 END)`
    })
    .from(hygieneInspectionRecords);

  return {
    material: materialInspections[0],
    shipping: shippingInspections[0],
    hygiene: hygieneInspections[0]
  };
}

// ============================================================================
// 검사 수정 함수
// ============================================================================

// 원재료 검사 수정
export async function updateMaterialInspectionRecord(
  id: number,
  data: {
    materialName?: string;
    lotNumber?: string;
    inspectionDate?: Date;
    inspector?: string;
    supplier?: string;
    appearance?: string; // 외관
    odor?: string; // 냄새
    color?: string; // 색상
    temperature?: number; // 온도
    result?: "pass" | "fail" | "conditional"; // 검사 결과
    inspectionResult?: "pass" | "fail";
    status?: "pending" | "completed" | "rejected";
    items?: Array<{
      id?: number;
      itemName: string;
      standard: string;
      result: string;
      passed: boolean;
      sortOrder: number;
    }>;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  await db.transaction(async (tx) => {
    // 검사 기록 업데이트
    const updateData: any = {};
    if (data.materialName !== undefined) updateData.materialName = data.materialName;
    if (data.lotNumber !== undefined) updateData.lotNumber = data.lotNumber;
    if (data.inspectionDate !== undefined) updateData.inspectionDate = data.inspectionDate;
    if (data.inspector !== undefined) updateData.inspector = data.inspector;
    if (data.supplier !== undefined) updateData.supplier = data.supplier;
    if (data.appearance !== undefined) updateData.appearance = data.appearance;
    if (data.odor !== undefined) updateData.odor = data.odor;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.temperature !== undefined) updateData.temperature = data.temperature;
    if (data.result !== undefined) updateData.result = data.result;
    if (data.inspectionResult !== undefined) updateData.inspectionResult = data.inspectionResult;
    if (data.status !== undefined) updateData.status = data.status;
    updateData.updatedAt = new Date();

    await tx.update(materialInspectionRecords).set(updateData).where(eq(materialInspectionRecords.id, id));

    // 검사 항목 업데이트
    if (data.items) {
      // 기존 항목 삭제
      await tx.delete(materialInspectionItems).where(eq(materialInspectionItems.recordId, id));

      // 새 항목 추가
      if (data.items.length > 0) {
        await tx.insert(materialInspectionItems).values(
          data.items.map((item) => ({
            recordId: id,
            itemName: item.itemName,
            standard: item.standard,
            result: item.result,
            passed: (item.passed ? 'pass' : 'fail') as 'pass' | 'fail' | 'na',
            sortOrder: item.sortOrder
          })) as any);
      }
    }
  });
}

// 출하 검사 수정
export async function updateShippingInspectionRecord(
  id: number,
  data: {
    productName?: string;
    batchCode?: string;
    quantity?: number;
    inspectionDate?: Date;
    inspector?: string;
    inspectionResult?: "pass" | "fail";
    status?: "pending" | "completed" | "rejected";
    items?: Array<{
      id?: number;
      itemName: string;
      standard: string;
      result: string;
      passed: boolean;
      sortOrder: number;
    }>;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  await db.transaction(async (tx) => {
    // 검사 기록 업데이트
    const updateData: any = {};
    if (data.productName !== undefined) updateData.productName = data.productName;
    if (data.batchCode !== undefined) updateData.batchCode = data.batchCode;
    if (data.quantity !== undefined) updateData.quantity = data.quantity;
    if (data.inspectionDate !== undefined) updateData.inspectionDate = data.inspectionDate;
    if (data.inspector !== undefined) updateData.inspector = data.inspector;
    if (data.inspectionResult !== undefined) updateData.inspectionResult = data.inspectionResult;
    if (data.status !== undefined) updateData.status = data.status;
    updateData.updatedAt = new Date();

    await tx.update(shippingInspectionRecords).set(updateData).where(eq(shippingInspectionRecords.id, id));

    // 검사 항목 업데이트
    if (data.items) {
      // 기존 항목 삭제
      await tx.delete(shippingInspectionItems).where(eq(shippingInspectionItems.recordId, id));

      // 새 항목 추가
      if (data.items.length > 0) {
        await tx.insert(shippingInspectionItems).values(
          data.items.map((item) => ({
            recordId: id,
            itemName: item.itemName,
            standard: item.standard,
            result: item.result,
            passed: (item.passed ? 'pass' : 'fail') as 'pass' | 'fail' | 'na',
            sortOrder: item.sortOrder
          })) as any);
      }
    }
  });
}

// 위생 검사 수정
export async function updateHygieneInspectionRecord(
  id: number,
  data: {
    inspectionArea?: string;
    inspectionDate?: Date;
    inspector?: string;
    result?: "pass" | "fail";
    status?: "pending" | "completed" | "action_required";
    items?: Array<{
      id?: number;
      itemName: string;
      standard: string;
      result: string;
      passed: boolean;
      sortOrder: number;
    }>;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");

  await db.transaction(async (tx) => {
    // 검사 기록 업데이트
    const updateData: any = {};
    if (data.inspectionArea !== undefined) updateData.inspectionArea = data.inspectionArea;
    if (data.inspectionDate !== undefined) updateData.inspectionDate = data.inspectionDate;
    if (data.inspector !== undefined) updateData.inspector = data.inspector;
    if (data.result !== undefined) updateData.result = data.result;
    if (data.status !== undefined) updateData.status = data.status;
    updateData.updatedAt = new Date();

    await tx.update(hygieneInspectionRecords).set(updateData).where(eq(hygieneInspectionRecords.id, id));

    // 검사 항목 업데이트
    if (data.items) {
      // 기존 항목 삭제
      await tx.delete(hygieneInspectionItems).where(eq(hygieneInspectionItems.recordId, id));

      // 새 항목 추가
      if (data.items.length > 0) {
        await tx.insert(hygieneInspectionItems).values(
          data.items.map((item) => ({
            recordId: id,
            itemName: item.itemName,
            standard: item.standard,
            result: item.result,
            passed: (item.passed ? 'pass' : 'fail') as 'pass' | 'fail' | 'na',
            sortOrder: item.sortOrder
          })) as any);
      }
    }
  });
}
