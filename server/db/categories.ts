import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db";
import { categories } from "../../drizzle/schema";

/**
 * 카테고리 관리 DB 함수
 * ✅ 멀티테넌시 격리: 모든 쿼리에 tenantId 필터 적용
 */

export type CategoryType = "material" | "product" | "purchase" | "sale";

export interface CreateCategoryInput {
  type: CategoryType;
  name: string;
  code?: string;
  description?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
  isDefault?: boolean;
  dateManagementType?: "none" | "expiry" | "production" | "both";
  alertDays?: number;
}

export interface UpdateCategoryInput {
  name?: string;
  code?: string;
  description?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
  isActive?: boolean;
  dateManagementType?: "none" | "expiry" | "production" | "both";
  alertDays?: number;
}

/**
 * 카테고리 목록 조회 (유형별) - tenantId 필터 적용
 */
export async function getCategoriesByType(type: CategoryType, tenantId?: number) {
  const db = await getDb();
  const conditions = [eq(categories.type, type), eq(categories.isActive, 1)];
  if (tenantId) conditions.push(eq(categories.tenantId, tenantId));
  return await db
    .select()
    .from(categories)
    .where(and(...conditions))
    .orderBy(categories.sortOrder, categories.name);
}

/**
 * 모든 카테고리 조회 - tenantId 필터 적용
 */
export async function getAllCategories(tenantId?: number) {
  const db = await getDb();
  const conditions: any[] = [eq(categories.isActive, 1)];
  if (tenantId) conditions.push(eq(categories.tenantId, tenantId));
  return await db
    .select()
    .from(categories)
    .where(and(...conditions))
    .orderBy(categories.type, categories.sortOrder, categories.name);
}

/**
 * 카테고리 ID로 조회 - tenantId 필터 적용
 */
export async function getCategoryById(id: number, tenantId?: number) {
  const db = await getDb();
  const conditions: any[] = [eq(categories.id, id)];
  if (tenantId) conditions.push(eq(categories.tenantId, tenantId));
  const result = await db
    .select()
    .from(categories)
    .where(and(...conditions))
    .limit(1);
  return result[0] || null;
}

/**
 * 카테고리 생성 - tenantId 포함
 */
export async function createCategory(input: CreateCategoryInput, tenantId?: number) {
  const db = await getDb();
  
  // sortOrder가 없으면 마지막 순서로 설정
  if (input.sortOrder === undefined) {
    const conditions: any[] = [eq(categories.type, input.type)];
    if (tenantId) conditions.push(eq(categories.tenantId, tenantId));
    const lastCategory = await db
      .select()
      .from(categories)
      .where(and(...conditions))
      .orderBy(desc(categories.sortOrder))
      .limit(1);
    
    input.sortOrder = lastCategory.length > 0 ? (lastCategory[0].sortOrder || 0) + 1 : 0;
  }
  
  const values: any = {
    type: input.type,
    name: input.name,
    code: input.code,
    description: input.description,
    color: input.color,
    icon: input.icon,
    sortOrder: input.sortOrder,
    isActive: 1,
    isDefault: input.isDefault ? 1 : 0,
    dateManagementType: input.dateManagementType || "none",
    alertDays: input.alertDays || 0
  };
  if (tenantId) values.tenantId = tenantId;
  
  const result = await db.insert(categories).values(values);
  
  return (result as any).insertId;
}

/**
 * 카테고리 수정 - tenantId 필터 적용
 */
export async function updateCategory(id: number, input: UpdateCategoryInput, tenantId?: number) {
  const db = await getDb();
  
  const updateData: any = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.code !== undefined) updateData.code = input.code;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.color !== undefined) updateData.color = input.color;
  if (input.icon !== undefined) updateData.icon = input.icon;
  if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) updateData.isActive = input.isActive ? 1 : 0;
  if (input.dateManagementType !== undefined) updateData.dateManagementType = input.dateManagementType;
  if (input.alertDays !== undefined) updateData.alertDays = input.alertDays;
  
  const conditions: any[] = [eq(categories.id, id)];
  if (tenantId) conditions.push(eq(categories.tenantId, tenantId));
  
  await db.update(categories).set(updateData).where(and(...conditions));
  
  return true;
}

/**
 * 카테고리 삭제 (기본 카테고리는 삭제 불가) - tenantId 필터 적용
 */
export async function deleteCategory(id: number, tenantId?: number) {
  const db = await getDb();
  
  // 기본 카테고리 확인
  const category = await getCategoryById(id, tenantId);
  if (!category) {
    throw new Error("카테고리를 찾을 수 없습니다.");
  }
  
  if (category.isDefault === 1) {
    throw new Error("기본 카테고리는 삭제할 수 없습니다.");
  }
  
  const conditions: any[] = [eq(categories.id, id)];
  if (tenantId) conditions.push(eq(categories.tenantId, tenantId));
  
  // 소프트 삭제 (isActive = 0)
  await db.update(categories).set({ isActive: 0 }).where(and(...conditions));
  
  return true;
}

/**
 * 카테고리 순서 변경 - tenantId 필터 적용
 */
export async function reorderCategories(type: CategoryType, categoryIds: number[], tenantId?: number) {
  const db = await getDb();
  
  // 각 카테고리의 sortOrder 업데이트
  for (let i = 0; i < categoryIds.length; i++) {
    const conditions: any[] = [eq(categories.id, categoryIds[i]), eq(categories.type, type)];
    if (tenantId) conditions.push(eq(categories.tenantId, tenantId));
    await db
      .update(categories)
      .set({ sortOrder: i })
      .where(and(...conditions));
  }
  
  return true;
}

/**
 * 기본 카테고리 데이터 시드 - tenantId 포함
 */
export async function seedDefaultCategories(tenantId?: number) {
  const db = await getDb();
  
  // 기존 카테고리 확인
  const conditions: any[] = [];
  if (tenantId) conditions.push(eq(categories.tenantId, tenantId));
  const existingCategories = conditions.length > 0
    ? await db.select().from(categories).where(and(...conditions)).limit(1)
    : await db.select().from(categories).limit(1);
  if (existingCategories.length > 0) {
    console.log("[Categories] Default categories already exist, skipping seed.");
    return;
  }
  
  const defaultCategories: CreateCategoryInput[] = [
    // 원재료 카테고리
    { type: "material", name: "육류", code: "MAT-MEAT", color: "#EF4444", icon: "Beef", sortOrder: 0, isDefault: true },
    { type: "material", name: "채소", code: "MAT-VEG", color: "#10B981", icon: "Carrot", sortOrder: 1, isDefault: true },
    { type: "material", name: "수산물", code: "MAT-FISH", color: "#3B82F6", icon: "Fish", sortOrder: 2, isDefault: true },
    { type: "material", name: "유제품", code: "MAT-DAIRY", color: "#F59E0B", icon: "Milk", sortOrder: 3, isDefault: true },
    { type: "material", name: "곡물", code: "MAT-GRAIN", color: "#F97316", icon: "Wheat", sortOrder: 4, isDefault: true },
    { type: "material", name: "조미료", code: "MAT-SEASON", color: "#8B5CF6", icon: "Sparkles", sortOrder: 5, isDefault: true },
    { type: "material", name: "기타", code: "MAT-OTHER", color: "#6B7280", icon: "Package", sortOrder: 6, isDefault: true },
    
    // 제품 카테고리
    { type: "product", name: "완제품", code: "PRD-FINISHED", color: "#10B981", icon: "CheckCircle", sortOrder: 0, isDefault: true },
    { type: "product", name: "반제품", code: "PRD-SEMI", color: "#F59E0B", icon: "Clock", sortOrder: 1, isDefault: true },
    { type: "product", name: "기타", code: "PRD-OTHER", color: "#6B7280", icon: "Package", sortOrder: 2, isDefault: true },
    
    // 매입 카테고리
    { type: "purchase", name: "원재료", code: "PUR-RAW", color: "#3B82F6", icon: "Package", sortOrder: 0, isDefault: true },
    { type: "purchase", name: "부재료", code: "PUR-SUB", color: "#8B5CF6", icon: "Layers", sortOrder: 1, isDefault: true },
    { type: "purchase", name: "포장재", code: "PUR-PACK", color: "#F59E0B", icon: "Box", sortOrder: 2, isDefault: true },
    { type: "purchase", name: "소모품", code: "PUR-CONS", color: "#EF4444", icon: "Trash2", sortOrder: 3, isDefault: true },
    { type: "purchase", name: "기타", code: "PUR-OTHER", color: "#6B7280", icon: "MoreHorizontal", sortOrder: 4, isDefault: true },
    
    // 매출 카테고리
    { type: "sale", name: "완제품", code: "SAL-FINISHED", color: "#10B981", icon: "CheckCircle", sortOrder: 0, isDefault: true },
    { type: "sale", name: "반제품", code: "SAL-SEMI", color: "#F59E0B", icon: "Clock", sortOrder: 1, isDefault: true },
    { type: "sale", name: "기타", code: "SAL-OTHER", color: "#6B7280", icon: "Package", sortOrder: 2, isDefault: true },
  ];
  
  for (const category of defaultCategories) {
    await createCategory(category, tenantId);
  }
  
  console.log("[Categories] Default categories seeded successfully.");
}
