/**
 * 템플릿 설정 DB 함수
 */

import { getDb } from "../connection";
import { hTemplateSettings } from "../../../drizzle/schema/schema_main";
import { eq, and } from "drizzle-orm";

/**
 * 사용자의 템플릿 설정 목록 조회
 */
export async function getUserTemplateSettings(userId: number, templateType: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');
  return await db
    .select()
    .from(hTemplateSettings)
    .where(and(
      eq(hTemplateSettings.tenantId, tenantId as any) ,
      eq(hTemplateSettings.userId, userId),
      eq(hTemplateSettings.templateType, templateType)
    ));
}

/**
 * 템플릿 설정 생성
 */
export async function createTemplateSetting(data: {
  userId: number;
  templateType: string;
  templateName: string;
  selectedFields: string[];
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');
  const [result] = await db.insert(hTemplateSettings).values({
      tenantId,
    userId: data.userId,
    templateType: data.templateType,
    templateName: data.templateName,
    selectedFields: JSON.stringify(data.selectedFields)
  });

  return result.insertId;
}

/**
 * 템플릿 설정 삭제
 */
export async function deleteTemplateSetting(id: number, userId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');
  await db
    .delete(hTemplateSettings)
    .where(and(
      eq(hTemplateSettings.tenantId, tenantId as any) ,
      eq(hTemplateSettings.id, id),
      eq(hTemplateSettings.userId, userId)
    ));
}

/**
 * 템플릿 설정 조회 (ID로)
 */
export async function getTemplateSetting(id: number, userId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error('Database connection failed');
  const [result] = await db
    .select()
    .from(hTemplateSettings)
    .where(and(
      eq(hTemplateSettings.tenantId, tenantId as any) ,
      eq(hTemplateSettings.id, id),
      eq(hTemplateSettings.userId, userId)
    ));

  if (!result) return null;

  return {
    ...result,
    selectedFields: JSON.parse(result.selectedFields as string) as string[]
  };
}
