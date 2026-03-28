import { getDb } from "../db";
import { hEmployees, hDepartments, hPositions, hDocumentApprovalSettings } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

/**
 * 조직도 및 결재자 설정 관리 Helper
 */

// ============================================================================
// 부서 관리
// ============================================================================

export async function listDepartments(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  return await db.select().from(hDepartments)
    .where(tenantId ? eq(hDepartments.tenantId, tenantId) : undefined)
    .orderBy(hDepartments.departmentName);
}

export async function getDepartmentById(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = [eq(hDepartments.id, id)];
  if (tenantId) conditions.push(eq(hDepartments.tenantId, tenantId));
  const [department] = await db.select().from(hDepartments).where(and(...conditions));
  return department;
}

export async function createDepartment(data: {
  departmentName: string;
  description?: string;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const [result] = await db.insert(hDepartments).values(data);
  return result;
}

export async function updateDepartment(id: number, data: {
  departmentName?: string;
  description?: string;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = [eq(hDepartments.id, id)];
  if (data.tenantId) conditions.push(eq(hDepartments.tenantId, data.tenantId));
  const { tenantId, ...updateData } = data;
  await db.update(hDepartments).set(updateData).where(and(...conditions));
  return await getDepartmentById(id, tenantId);
}

export async function deleteDepartment(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = [eq(hDepartments.id, id)];
  if (tenantId) conditions.push(eq(hDepartments.tenantId, tenantId));
  await db.delete(hDepartments).where(and(...conditions));
}

// ============================================================================
// 직급 관리
// ============================================================================

export async function listPositions(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  return await db.select().from(hPositions)
    .where(tenantId ? eq(hPositions.tenantId, tenantId) : undefined)
    .orderBy(hPositions.level);
}

export async function getPositionById(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = [eq(hPositions.id, id)];
  if (tenantId) conditions.push(eq(hPositions.tenantId, tenantId));
  const [position] = await db.select().from(hPositions).where(and(...conditions));
  return position;
}

export async function createPosition(data: {
  positionName: string;
  level?: number;
  approvalRole?: string;
  description?: string;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const [result] = await db.insert(hPositions).values(data as any);
  return result;
}

export async function updatePosition(id: number, data: {
  positionName?: string;
  level?: number;
  approvalRole?: string;
  description?: string;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = [eq(hPositions.id, id)];
  if (data.tenantId) conditions.push(eq(hPositions.tenantId, data.tenantId));
  const { tenantId, ...updateData } = data;
  await db.update(hPositions).set(updateData as any).where(and(...conditions));
  return await getPositionById(id, tenantId);
}

export async function deletePosition(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = [eq(hPositions.id, id)];
  if (tenantId) conditions.push(eq(hPositions.tenantId, tenantId));
  await db.delete(hPositions).where(and(...conditions));
}

// ============================================================================
// 구성원 관리
// ============================================================================

export async function listEmployees(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  return await db
    .select({
      id: hEmployees.id,
      userId: hEmployees.userId,
      employeeCode: hEmployees.employeeCode,
      name: hEmployees.name,
      departmentId: hEmployees.departmentId,
      departmentName: hDepartments.departmentName,
      positionId: hEmployees.positionId,
      positionName: hPositions.positionName,
      approvalRole: hPositions.approvalRole,
      hireDate: hEmployees.hireDate,
      isActive: hEmployees.isActive,
      createdAt: hEmployees.createdAt,
    })
    .from(hEmployees)
    .leftJoin(hDepartments, eq(hEmployees.departmentId, hDepartments.id))
    .leftJoin(hPositions, eq(hEmployees.positionId, hPositions.id))
    .where(tenantId ? eq(hEmployees.tenantId, tenantId) : undefined)
    .orderBy(hEmployees.name);
}

export async function getEmployeeById(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = [eq(hEmployees.id, id)];
  if (tenantId) conditions.push(eq(hEmployees.tenantId, tenantId));
  const [employee] = await db
    .select({
      id: hEmployees.id,
      userId: hEmployees.userId,
      employeeCode: hEmployees.employeeCode,
      name: hEmployees.name,
      departmentId: hEmployees.departmentId,
      departmentName: hDepartments.departmentName,
      positionId: hEmployees.positionId,
      positionName: hPositions.positionName,
      approvalRole: hPositions.approvalRole,
      hireDate: hEmployees.hireDate,
      isActive: hEmployees.isActive,
      createdAt: hEmployees.createdAt,
    })
    .from(hEmployees)
    .leftJoin(hDepartments, eq(hEmployees.departmentId, hDepartments.id))
    .leftJoin(hPositions, eq(hEmployees.positionId, hPositions.id))
    .where(and(...conditions));
  return employee;
}


export async function getEmployeeByUserId(userId: number) {
  const db = await getDb();
  const [employee] = await db
    .select({
      id: hEmployees.id,
      userId: hEmployees.userId,
      employeeCode: hEmployees.employeeCode,
      name: hEmployees.name,
      departmentId: hEmployees.departmentId,
      departmentName: hDepartments.departmentName,
      positionId: hEmployees.positionId,
      positionName: hPositions.positionName,
      approvalRole: hPositions.approvalRole,
      hireDate: hEmployees.hireDate,
      isActive: hEmployees.isActive,
      createdAt: hEmployees.createdAt,
    })
    .from(hEmployees)
    .leftJoin(hDepartments, eq(hEmployees.departmentId, hDepartments.id))
    .leftJoin(hPositions, eq(hEmployees.positionId, hPositions.id))
    .where(eq(hEmployees.userId, userId));
  return employee;
}
export async function createEmployee(data: {
  userId?: number;
  employeeCode: string;
  name: string;
  departmentId?: number;
  positionId?: number;
  hireDate?: Date;
  isActive?: number;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const [result] = await db.insert(hEmployees).values(data);
  return result;
}

export async function updateEmployee(id: number, data: {
  userId?: number;
  employeeCode?: string;
  name?: string;
  departmentId?: number;
  positionId?: number;
  hireDate?: Date;
  isActive?: number;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = [eq(hEmployees.id, id)];
  if (data.tenantId) conditions.push(eq(hEmployees.tenantId, data.tenantId));
  const { tenantId, ...updateData } = data;
  await db.update(hEmployees).set(updateData).where(and(...conditions));
  return await getEmployeeById(id, tenantId);
}

export async function deleteEmployee(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = [eq(hEmployees.id, id)];
  if (tenantId) conditions.push(eq(hEmployees.tenantId, tenantId));
  await db.delete(hEmployees).where(and(...conditions));
}

// ============================================================================
// 문서 결재자 설정 관리
// ============================================================================

export async function listDocumentApprovalSettings(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions: any[] = [eq(hDocumentApprovalSettings.isActive, true)];
  if (tenantId) {
    conditions.push(eq(hDocumentApprovalSettings.tenantId, tenantId));
  }
  return await db
    .select({
      id: hDocumentApprovalSettings.id,
      documentType: hDocumentApprovalSettings.documentType,
      documentTypeName: hDocumentApprovalSettings.documentTypeName,
      authorEmployeeId: hDocumentApprovalSettings.authorEmployeeId,
      reviewerEmployeeId: hDocumentApprovalSettings.reviewerEmployeeId,
      approverEmployeeId: hDocumentApprovalSettings.approverEmployeeId,
      isActive: hDocumentApprovalSettings.isActive,
      createdAt: hDocumentApprovalSettings.createdAt,
      updatedAt: hDocumentApprovalSettings.updatedAt,
    })
    .from(hDocumentApprovalSettings)
    .where(and(...conditions))
    .orderBy(desc(hDocumentApprovalSettings.createdAt));
}

export async function getDocumentApprovalSettingById(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = [eq(hDocumentApprovalSettings.id, id)];
  if (tenantId) conditions.push(eq(hDocumentApprovalSettings.tenantId, tenantId));
  const [setting] = await db
    .select()
    .from(hDocumentApprovalSettings)
    .where(and(...conditions));
  return setting;
}

export async function getDocumentApprovalSettingByType(documentType: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const [setting] = await db
    .select()
    .from(hDocumentApprovalSettings)
    .where(
      and(
        eq(hDocumentApprovalSettings.documentType, documentType),
        eq(hDocumentApprovalSettings.isActive, true),
        ...(tenantId ? [eq(hDocumentApprovalSettings.tenantId, tenantId)] : [])
      )
    );
  return setting;
}

export async function createDocumentApprovalSetting(data: {
  documentType: string;
  documentTypeName: string;
  authorEmployeeId?: number;
  reviewerEmployeeId?: number;
  approverEmployeeId?: number;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const [result] = await db.insert(hDocumentApprovalSettings).values(data as any);
  return result;
}

export async function updateDocumentApprovalSetting(id: number, data: {
  documentType?: string;
  documentTypeName?: string;
  authorEmployeeId?: number;
  reviewerEmployeeId?: number;
  approverEmployeeId?: number;
  isActive?: boolean;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = [eq(hDocumentApprovalSettings.id, id)];
  if (data.tenantId) conditions.push(eq(hDocumentApprovalSettings.tenantId, data.tenantId));
  const { tenantId, ...updateData } = data;
  await db.update(hDocumentApprovalSettings).set(updateData).where(and(...conditions));
  return await getDocumentApprovalSettingById(id, tenantId);
}

export async function deleteDocumentApprovalSetting(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const conditions = [eq(hDocumentApprovalSettings.id, id)];
  if (tenantId) conditions.push(eq(hDocumentApprovalSettings.tenantId, tenantId));
  await db.update(hDocumentApprovalSettings)
    .set({ isActive: false })
    .where(and(...conditions));
}
