import { getDb } from "../db";
import { hMaterials, hMixedMaterialComponents } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * 혼합재제(중간재) 목록 조회
 */
export async function getIntermediates(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  return db
    .select()
    .from(hMaterials)
    .where(and(eq(hMaterials.tenantId, tenantId as any) , eq(hMaterials.kind, "MIXED")) as any)
    .orderBy(desc(hMaterials.createdAt));
}

/**
 * 혼합재제 상세 조회 (구성 포함)
 */
export async function getIntermediateDetail(intermediateId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // 혼합재제 기본 정보
  const intermediate = await db
    .select()
    .from(hMaterials)
    .where(and(
      eq(hMaterials.tenantId, tenantId as any) ,
      eq(hMaterials.id, intermediateId),
      eq(hMaterials.kind, "MIXED")
    ))
    .limit(1);
  
  if (intermediate.length === 0) {
    throw new Error("혼합재제를 찾을 수 없습니다.");
  }
  
  // 혼합재제 구성 조회
  const components = await db
    .select({
      id: hMixedMaterialComponents.id,
      componentMaterialId: hMixedMaterialComponents.componentMaterialId,
      componentMaterialCode: hMaterials.materialCode,
      componentMaterialName: hMaterials.materialName,
      componentMaterialKind: hMaterials.kind,
      ratioPercent: hMixedMaterialComponents.ratioPercent,
      gramsPerKg: hMixedMaterialComponents.gramsPerKg,
      note: hMixedMaterialComponents.note
    })
    .from(hMixedMaterialComponents)
    .leftJoin(hMaterials, eq(hMixedMaterialComponents.componentMaterialId, hMaterials.id))
    .where(eq(hMixedMaterialComponents.intermediateMaterialId, intermediateId));
  
  return {
    ...intermediate[0],
    components
  };
}

/**
 * 혼합재제 생성
 */
export async function createIntermediate(data: {
  materialCode: string;
  materialName: string;
  category?: string;
  unit: string;
  supplierId?: number;
  shelfLifeDays?: number;
  unitPrice?: string;
  description?: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  const [result] = await db.insert(hMaterials).values({
      tenantId,
    ...data,
    kind: "MIXED",
    isActive: 1
  });
  
  return result.insertId;
}

/**
 * 혼합재제 구성 추가
 */
export async function addIntermediateComponent(data: {
  intermediateMaterialId: number;
  componentMaterialId: number;
  ratioPercent?: string;
  gramsPerKg?: string;
  note?: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // 혼합재제 존재 여부 확인
  const intermediate = await db
    .select()
    .from(hMaterials)
    .where(and(
      eq(hMaterials.tenantId, tenantId as any) ,
      eq(hMaterials.id, data.intermediateMaterialId),
      eq(hMaterials.kind, "MIXED")
    ))
    .limit(1);
  
  if (intermediate.length === 0) {
    throw new Error("혼합재제를 찾을 수 없습니다.");
  }
  
  // 구성 재료 존재 여부 확인
  const component = await db
    .select()
    .from(hMaterials)
    .where(and(eq(hMaterials.tenantId, tenantId as any) , eq(hMaterials.id, data.componentMaterialId)) as any)
    .limit(1);
  
  if (component.length === 0) {
    throw new Error("구성 재료를 찾을 수 없습니다.");
  }
  
  const [result] = await db.insert(hMixedMaterialComponents).values(data as any);
  
  return result.insertId;
}

/**
 * 혼합재제 구성 수정
 */
export async function updateIntermediateComponent(
  componentId: number,
  data: {
    ratioPercent?: string;
    gramsPerKg?: string;
    note?: string;
  }, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db
    .update(hMixedMaterialComponents)
    .set(data)
    .where(eq(hMixedMaterialComponents.id, componentId));
  
  return true;
}

/**
 * 혼합재제 구성 삭제
 */
export async function deleteIntermediateComponent(componentId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db
    .delete(hMixedMaterialComponents)
    .where(eq(hMixedMaterialComponents.id, componentId));
  
  return true;
}

/**
 * 혼합재제 수정
 */
export async function updateIntermediate(
  intermediateId: number,
  data: {
    materialName?: string;
    category?: string;
    unit?: string;
    supplierId?: number;
    shelfLifeDays?: number;
    unitPrice?: string;
    description?: string;
    isActive?: number;
  }, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  await db
    .update(hMaterials)
    .set(data)
    .where(and(
      eq(hMaterials.tenantId, tenantId as any) ,
      eq(hMaterials.id, intermediateId),
      eq(hMaterials.kind, "MIXED")
    ));
  
  return true;
}

/**
 * 혼합재제 삭제
 */
export async function deleteIntermediate(intermediateId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection failed");
  
  // 구성 먼저 삭제
  await db
    .delete(hMixedMaterialComponents)
    .where(eq(hMixedMaterialComponents.intermediateMaterialId, intermediateId));
  
  // 혼합재제 삭제
  await db
    .delete(hMaterials)
    .where(and(
      eq(hMaterials.tenantId, tenantId as any) ,
      eq(hMaterials.id, intermediateId),
      eq(hMaterials.kind, "MIXED")
    ));
  
  return true;
}
