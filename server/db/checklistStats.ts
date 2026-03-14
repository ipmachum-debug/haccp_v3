import { getDb } from "../db";
import { hChecklistInstances, hChecklistTemplates } from "../../drizzle/schema_main";
import { sql, eq, and, gte, lte } from "drizzle-orm";

/**
 * 체크리스트 카테고리별 상태 조회
 */
export async function getChecklistStatsByCategory(category: string, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // 해당 카테고리의 템플릿 ID 조회
  const templates = await db
    .select({ id: hChecklistTemplates.id })
    .from(hChecklistTemplates)
    .where(and(eq(hChecklistTemplates.tenantId, tenantId) as any, eq(hChecklistTemplates.category, category)) as any);
  const templateIds = templates.map((t: any) => t.id);

  if (templateIds.length === 0) {
    return {
      total: 0,
      completed: 0,
      pending: 0,
      overdue: 0
    };
  }

  // 오늘 생성된 체크리스트 인스턴스 조회
  const instances = await db
    .select()
    .from(hChecklistInstances)
    .where(
      and(eq(hChecklistInstances.tenantId, tenantId) as any, 
        sql`${hChecklistInstances.templateId} IN (${sql.join(templateIds, sql`, `)})`,
        gte(hChecklistInstances.createdAt, today),
        lte(hChecklistInstances.createdAt, tomorrow)
      ) as any
    );

  const total = instances.length;
  const completed = instances.filter((i: any) => i.status === "completed").length;
  const overdue = instances.filter(
    (i: any) => i.status === "pending" && i.dueDate && new Date(i.dueDate) < new Date()
  ).length;
  const pending = total - completed - overdue;

  return {
    total,
    completed,
    pending,
    overdue
  };
}

/**
 * 전체 체크리스트 상태 조회 (오늘 기준)
 */
export async function getTodayChecklistStats(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // 오늘 생성된 모든 체크리스트 인스턴스 조회
  const instances = await db
    .select()
    .from(hChecklistInstances)
    .where(
      and(eq(hChecklistInstances.tenantId, tenantId) as any, 
        gte(hChecklistInstances.createdAt, today),
        lte(hChecklistInstances.createdAt, tomorrow)
      ) as any
    );

  const total = instances.length;
  const completed = instances.filter((i: any) => i.status === "completed").length;
  const overdue = instances.filter(
    (i: any) => i.status === "pending" && i.dueDate && new Date(i.dueDate) < new Date()
  ).length;
  const pending = total - completed - overdue;

  return {
    total,
    completed,
    pending,
    overdue
  };
}
