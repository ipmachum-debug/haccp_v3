/**
 * 배치 생성/완료 시 체크리스트 자동 생성
 *
 * frequency="batch_create" 또는 "batch_complete"인 활성 템플릿을 조회하여
 * 해당 배치에 연결된 체크리스트 인스턴스를 자동으로 생성합니다.
 */
import { getDb } from "../db";
import {
  checklistTemplates,
  checklistTemplateItems,
  checklistInstances,
  checklistInstanceItems,
} from "../../drizzle/schema/checklist";
import { eq, and, sql } from "drizzle-orm";

export interface AutoChecklistResult {
  created: number;
  templateNames: string[];
}

/**
 * 배치 생성 시 자동 체크리스트 생성
 */
export async function autoCreateChecklistsForBatch(
  tenantId: number,
  batchId: number,
  userId: number,
  targetDate?: string,
): Promise<AutoChecklistResult> {
  return autoCreateChecklists(tenantId, batchId, userId, "batch_create", targetDate);
}

/**
 * 배치 완료 시 자동 체크리스트 생성
 */
export async function autoCreateChecklistsForBatchComplete(
  tenantId: number,
  batchId: number,
  userId: number,
  targetDate?: string,
): Promise<AutoChecklistResult> {
  return autoCreateChecklists(tenantId, batchId, userId, "batch_complete", targetDate);
}

async function autoCreateChecklists(
  tenantId: number,
  batchId: number,
  userId: number,
  frequency: "batch_create" | "batch_complete",
  targetDate?: string,
): Promise<AutoChecklistResult> {
  const db = await getDb();
  if (!db) return { created: 0, templateNames: [] };

  const dateStr = targetDate || new Date().toISOString().split("T")[0];

  // frequency가 일치하고 활성인 템플릿 조회
  const templates = await db
    .select({
      id: checklistTemplates.id,
      name: checklistTemplates.name,
    })
    .from(checklistTemplates)
    .where(
      and(
        eq(checklistTemplates.tenantId, tenantId),
        eq(checklistTemplates.frequency, frequency),
        eq(checklistTemplates.isActive, 1),
      ),
    );

  if (templates.length === 0) {
    return { created: 0, templateNames: [] };
  }

  const templateNames: string[] = [];

  for (const tmpl of templates) {
    // 이미 동일 배치+템플릿 조합의 인스턴스가 있으면 스킵
    const existing = await db
      .select({ id: checklistInstances.id })
      .from(checklistInstances)
      .where(
        and(
          eq(checklistInstances.tenantId, tenantId),
          eq(checklistInstances.templateId, tmpl.id),
          eq(checklistInstances.batchId, batchId),
        ),
      )
      .limit(1);

    if (existing.length > 0) continue;

    // 인스턴스 생성
    const result = await db.insert(checklistInstances).values({
      tenantId,
      templateId: tmpl.id,
      batchId,
      targetDate: dateStr,
      status: "pending",
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const instanceId = Number(result[0].insertId);

    // 템플릿 항목 복사
    const items = await db
      .select()
      .from(checklistTemplateItems)
      .where(eq(checklistTemplateItems.templateId, tmpl.id))
      .orderBy(checklistTemplateItems.sortOrder);

    if (items.length > 0) {
      await db.insert(checklistInstanceItems).values(
        items.map((item) => ({
          instanceId,
          templateItemId: item.id,
          itemName: item.itemName,
          itemType: item.itemType,
          description: item.description,
          sortOrder: item.sortOrder,
          tenantId,
          isCompleted: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })) as any,
      );
    }

    templateNames.push(tmpl.name);
  }

  return { created: templateNames.length, templateNames };
}
