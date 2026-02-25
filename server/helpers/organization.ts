import { getDb } from "../db";
import { hEmployees, hDepartments, hPositions, hDocumentApprovalSettings } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * 조직도 및 결재자 설정 관리 Helper
 */

// ============================================================================
// 부서 관리
// ============================================================================

export async function listDepartments() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(hDepartments).orderBy(hDepartments.departmentName);
}

export async function getDepartmentById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [department] = await db.select().from(hDepartments).where(eq(hDepartments.id, id));
  return department;
}

export async function createDepartment(data: {
  departmentName: string;
  description?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(hDepartments).values(data);
  return result;
}

export async function updateDepartment(id: number, data: {
  departmentName?: string;
  description?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(hDepartments).set(data).where(eq(hDepartments.id, id));
  return await getDepartmentById(id);
}

export async function deleteDepartment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(hDepartments).where(eq(hDepartments.id, id));
}

// ============================================================================
// 직급 관리
// ============================================================================

export async function listPositions() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return await db.select().from(hPositions).orderBy(hPositions.level);
}

export async function getPositionById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [position] = await db.select().from(hPositions).where(eq(hPositions.id, id));
  return position;
}

export async function createPosition(data: {
  positionName: string;
  level?: number;
  approvalRole?: string;
  description?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(hPositions).values(data);
  return result;
}

export async function updatePosition(id: number, data: {
  positionName?: string;
  level?: number;
  approvalRole?: string;
  description?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(hPositions).set(data).where(eq(hPositions.id, id));
  return await getPositionById(id);
}

export async function deletePosition(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(hPositions).where(eq(hPositions.id, id));
}

// ============================================================================
// 구성원 관리
// ============================================================================

export async function listEmployees(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
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

export async function getEmployeeById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
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
    .where(eq(hEmployees.id, id));
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
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
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
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(hEmployees).set(data).where(eq(hEmployees.id, id));
  return await getEmployeeById(id);
}

export async function deleteEmployee(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(hEmployees).where(eq(hEmployees.id, id));
}

// ============================================================================
// 문서 결재자 설정 관리
// ============================================================================

export async function listDocumentApprovalSettings(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions: any[] = [eq(hDocumentApprovalSettings.isActive, true)];
  if (tenantId) {
    conditions.push(eq((hDocumentApprovalSettings as any).tenantId, tenantId));
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

export async function getDocumentApprovalSettingById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [setting] = await db
    .select()
    .from(hDocumentApprovalSettings)
    .where(eq(hDocumentApprovalSettings.id, id));
  return setting;
}

export async function getDocumentApprovalSettingByType(documentType: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
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
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(hDocumentApprovalSettings).values(data);
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
  if (!db) throw new Error("Database not available");
  await db.update(hDocumentApprovalSettings).set(data).where(eq(hDocumentApprovalSettings.id, id));
  return await getDocumentApprovalSettingById(id);
}

export async function deleteDocumentApprovalSetting(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(hDocumentApprovalSettings)
    .set({ isActive: false })
    .where(eq(hDocumentApprovalSettings.id, id));
}
