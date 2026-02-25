/**
 * 위젯 설정 관리 함수
 */

import { getDb } from "../db";
import { hUserWidgetSettings } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export async function getUserWidgetSettings(userId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select()
    .from(hUserWidgetSettings)
    .where(and(eq(hUserWidgetSettings.tenantId, tenantId), eq(hUserWidgetSettings.userId, userId)));
  return result;
}

export async function updateWidgetVisibility(data: {
  userId: number;
  widgetId: string;
  isVisible: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 기존 설정이 있는지 확인
  const existing = await db
    .select()
    .from(hUserWidgetSettings)
    .where(
      and(eq(hUserWidgetSettings.tenantId, tenantId), 
        eq(hUserWidgetSettings.userId, data.userId),
        eq(hUserWidgetSettings.widgetId, data.widgetId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // 업데이트
    await db
      .update(hUserWidgetSettings)
      .set({ isVisible: data.isVisible, updatedAt: new Date() })
      .where(
        and(
          eq(hUserWidgetSettings.userId, data.userId),
          eq(hUserWidgetSettings.widgetId, data.widgetId)
        )
      );
  } else {
    // 삽입
    await db.insert(hUserWidgetSettings).values({
      tenantId,
      userId: data.userId,
      widgetId: data.widgetId,
      isVisible: data.isVisible
    } as any);
  }

  return { success: true };
}

export async function batchUpdateWidgetSettings(data: {
  userId: number;
  widgets: Array<{ widgetId: string; isVisible: number }>;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  for (const widget of data.widgets) {
    await updateWidgetVisibility({
      userId: data.userId,
      widgetId: widget.widgetId,
      isVisible: widget.isVisible
    });
  }

  return { success: true };
}
