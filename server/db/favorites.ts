import { getDb } from "../db";
import { hUserFavorites } from "../../drizzle/schema/auth";
import { eq, and, desc } from "drizzle-orm";
export async function getUserFavorites(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return await db
    .select()
    .from(hUserFavorites)
    .where(eq(hUserFavorites.userId, userId))
    .orderBy(hUserFavorites.sortOrder);
}
export async function addUserFavorite(userId: number, menuPath: string, menuLabel: string, menuIcon?: string, tenantId?: number) {
  const db = await getDb();
  if (!db) return 0;
  
  // 중복 체크: 동일한 menuPath가 이미 있는지 확인
  const existing = await db
    .select()
    .from(hUserFavorites)
    .where(
      and(
        eq(hUserFavorites.userId, userId),
        eq(hUserFavorites.menuPath, menuPath)
      )
    )
    .limit(1);
  
  if (existing.length > 0) {
    return existing[0].id; // 이미 존재하면 기존 ID 반환
  }
  
  // 현재 최대 sortOrder 조회
  const maxOrder = await db
    .select({ maxOrder: hUserFavorites.sortOrder })
    .from(hUserFavorites)
    .where(eq(hUserFavorites.userId, userId))
    .orderBy(desc(hUserFavorites.sortOrder))
    .limit(1);
  
  const nextOrder = (maxOrder[0]?.maxOrder ?? 0) + 1;
  
  // tenantId가 없으면 users 테이블에서 조회
  let resolvedTenantId = tenantId;
  if (!resolvedTenantId) {
    try {
      const { users } = await import("../../drizzle/schema/auth");
      const [user] = await db.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, userId)).limit(1);
      resolvedTenantId = user?.tenantId ?? 1;
    } catch {
      resolvedTenantId = 1;
    }
  }
  
  const [result] = await db
    .insert(hUserFavorites)
    .values({
      userId,
      tenantId: resolvedTenantId,
      menuPath,
      menuLabel,
      menuIcon: menuIcon ?? "",
      sortOrder: nextOrder
    })
    .$returningId();
  
  return result.id;
}
export async function removeUserFavorite(userId: number, favoriteId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(hUserFavorites)
    .where(
      and(
        eq(hUserFavorites.id, favoriteId),
        eq(hUserFavorites.userId, userId)
      )
    );
}
export async function updateFavoriteOrder(userId: number, favoriteId: number, newOrder: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(hUserFavorites)
    .set({ sortOrder: newOrder })
    .where(
      and(
        eq(hUserFavorites.id, favoriteId),
        eq(hUserFavorites.userId, userId)
      )
    );
}
// 신규 사용자 기본 즐겨찾기 생성
export async function createDefaultFavorites(userId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) return;
  
  // 기본 즐겨찾기 항목 정의
  const defaultFavorites = [
    { menuPath: "/dashboard/ccp", menuLabel: "CCP 관리", menuIcon: "Shield", sortOrder: 1 },
    { menuPath: "/dashboard/batch-management", menuLabel: "배치 관리", menuIcon: "Package", sortOrder: 2 },
    { menuPath: "/dashboard/inspections", menuLabel: "검사 관리", menuIcon: "ClipboardCheck", sortOrder: 3 },
  ];
  
  // 기존 즐겨찾기 확인
  const existingFavorites = await getUserFavorites(userId);
  if (existingFavorites.length > 0) {
    return; // 이미 즐겨찾기가 있으면 생성하지 않음
  }
  
  // tenantId가 없으면 users 테이블에서 조회
  let resolvedTenantId = tenantId;
  if (!resolvedTenantId) {
    try {
      const { users } = await import("../../drizzle/schema/auth");
      const [user] = await db.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, userId)).limit(1);
      resolvedTenantId = user?.tenantId ?? 1;
    } catch {
      resolvedTenantId = 1;
    }
  }
  
  // 기본 즐겨찾기 일괄 삽입
  await db.insert(hUserFavorites).values(
    defaultFavorites.map(fav => ({
      userId,
      tenantId: resolvedTenantId!,
      menuPath: fav.menuPath,
      menuLabel: fav.menuLabel,
      menuIcon: fav.menuIcon,
      sortOrder: fav.sortOrder
    }))
  );
}
