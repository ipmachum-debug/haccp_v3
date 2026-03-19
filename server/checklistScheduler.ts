/**
 * 체크리스트 자동 생성 스케줄러
 * 템플릿의 autoTriggerRules에 따라 체크리스트를 자동 생성합니다
 */

import { getDb } from "./db";
import { checklistTemplates, checklistInstances, checklistTemplateItems, checklistInstanceItems } from "../drizzle/schema";
import { eq, and, desc, lt } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

/**
 * 일일 체크리스트 자동 생성
 */
export async function generateDailyChecklists() {
  console.log("[Checklist Scheduler] 일일 체크리스트 자동 생성 시작");
  
  try {
    const db = await getDb();
    if (!db) return;

    const templates = await db
      .select()
      .from(checklistTemplates)
      .where(eq(checklistTemplates.isActive, 1));

    const today = new Date().toISOString().split("T")[0];
    let createdCount = 0;

    for (const template of templates) {
      if (!template.autoTriggerRules) continue;
      const rules = template.autoTriggerRules as { triggerOn?: string };
      if (rules.triggerOn !== "daily") continue;

      const existingInstance = await db
        .select()
        .from(checklistInstances)
        .where(
          and(
            eq(checklistInstances.templateId, template.id),
            eq(checklistInstances.scheduledDate, today)
          )
        )
        .limit(1);

      if (existingInstance.length > 0) continue;

      await db.insert(checklistInstances).values({
        templateId: template.id,
        scheduledDate: today,
        status: "pending",
        createdBy: 1
      } as any);

      const [newInstance] = await db
        .select()
        .from(checklistInstances)
        .where(eq(checklistInstances.templateId, template.id))
        .orderBy(desc(checklistInstances.id))
        .limit(1);

      const templateItems = await db
        .select()
        .from(checklistTemplateItems)
        .where(eq(checklistTemplateItems.templateId, template.id))
        .orderBy(checklistTemplateItems.sortOrder);

      for (const item of templateItems) {
        await db.insert(checklistInstanceItems).values({
          instanceId: newInstance.id,
          templateItemId: item.id,
          itemName: item.itemName,
          itemType: item.itemType,
          sortOrder: item.sortOrder,
          isCompleted: 0
        } as any);
      }

      createdCount++;
    }

    console.log(`[Checklist Scheduler] 일일 체크리스트 자동 생성 완료: ${createdCount}개`);
  } catch (error) {
    console.error("[Checklist Scheduler] 오류:", error);
  }
}

/**
 * 미완료 체크리스트 알림
 */
export async function checkOverdueChecklists() {
  console.log("[Checklist Scheduler] 미완료 체크리스트 알림 시작");
  
  try {
    const db = await getDb();
    if (!db) return;

    const today = new Date().toISOString().split("T")[0];

    const overdueInstances = await db
      .select()
      .from(checklistInstances)
      .where(
        and(
          lt(checklistInstances.scheduledDate, today),
          eq(checklistInstances.status, "pending")
        )
      );

    if (overdueInstances.length > 0) {
      await notifyOwner({
        title: "미완료 체크리스트 알림",
        content: `기한이 지난 미완료 체크리스트가 ${overdueInstances.length}개 있습니다.`
      });
      console.log(`[Checklist Scheduler] 미완료 체크리스트 알림 전송: ${overdueInstances.length}개`);
    }
  } catch (error) {
    console.error("[Checklist Scheduler] 미완료 체크리스트 알림 오류:", error);
  }
}

/**
 * 스케줄러 초기화
 */
export function initChecklistScheduler() {
  console.log("[Checklist Scheduler] 스케줄러 초기화 완료 (10분마다 실행)");
  
  // 10분마다 체크 (테스트용)
  setInterval(() => {
    generateDailyChecklists();
    checkOverdueChecklists();
  }, 10 * 60 * 1000);
}
