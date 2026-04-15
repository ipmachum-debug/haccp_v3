import { getDb } from "../connection";
import { accountCategories } from "../../../drizzle/schema/accountCategories";
import { eq, and, or, isNull, asc } from "drizzle-orm";

/**
 * 계정 과목 관리 함수
 * P0: 모든 함수에 tenantId 필터링 적용 - 테넌트 격리
 *
 * ★ 2026-04-15: 전체 raw SQL → Drizzle 마이그레이션
 *   drizzle/schema/accountCategories.ts 정식 정의 사용.
 *   raw SQL 과 100% 동일한 동작 유지 (tenant_id IS NULL 글로벌 지원 포함).
 */

// 정식 Drizzle 타입 re-export
export type AccountCategory = typeof accountCategories.$inferSelect;

/**
 * 모든 계정 과목 조회
 * P0: tenantId 필수
 * tenant_id IS NULL인 글로벌 카테고리도 포함
 */
export async function getAllAccountCategories(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const result = await db
    .select()
    .from(accountCategories)
    .where(
      and(
        eq(accountCategories.isActive, 1),
        or(
          eq(accountCategories.tenantId, tenantId),
          isNull(accountCategories.tenantId),
        ),
      ),
    )
    .orderBy(asc(accountCategories.code));

  return result;
}

/**
 * 대분류별 계정 과목 조회
 * P0: tenantId 필수
 */
export async function getAccountCategoriesByMajor(majorCategory: string, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const result = await db
    .select()
    .from(accountCategories)
    .where(
      and(
        eq(accountCategories.isActive, 1),
        eq(accountCategories.majorCategory, majorCategory),
        or(
          eq(accountCategories.tenantId, tenantId),
          isNull(accountCategories.tenantId),
        ),
      ),
    )
    .orderBy(asc(accountCategories.code));

  return result;
}

/**
 * 계정 과목 등록
 * P0: tenantId 필수
 */
export async function createAccountCategory(data: {
  code: string;
  name: string;
  majorCategory: string;
  minorCategory?: string;
  description?: string;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 코드 중복 체크 (테넌트 범위 내 + 글로벌)
  const existing = await db
    .select({ id: accountCategories.id })
    .from(accountCategories)
    .where(
      and(
        eq(accountCategories.code, data.code),
        or(
          eq(accountCategories.tenantId, data.tenantId),
          isNull(accountCategories.tenantId),
        ),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    throw new Error("이미 존재하는 계정 코드입니다");
  }

  const [result] = await db.insert(accountCategories).values({
    code: data.code,
    name: data.name,
    majorCategory: data.majorCategory,
    minorCategory: data.minorCategory ?? null,
    description: data.description ?? null,
    tenantId: data.tenantId,
  });

  return { id: Number((result as any).insertId) };
}

/**
 * 계정 과목 수정
 * P0: tenantId 필수
 */
export async function updateAccountCategory(
  id: number,
  data: {
    code?: string;
    name?: string;
    majorCategory?: string;
    minorCategory?: string;
    description?: string;
  },
  tenantId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 코드 변경 시 중복 체크
  if (data.code) {
    const existing = await db
      .select({ id: accountCategories.id })
      .from(accountCategories)
      .where(
        and(
          eq(accountCategories.code, data.code),
          or(
            eq(accountCategories.tenantId, tenantId),
            isNull(accountCategories.tenantId),
          ),
        ),
      )
      .limit(1);

    if (existing.length > 0 && existing[0].id !== id) {
      throw new Error("이미 존재하는 계정 코드입니다");
    }
  }

  const updateData: any = {};
  if (data.code !== undefined) updateData.code = data.code;
  if (data.name !== undefined) updateData.name = data.name;
  if (data.majorCategory !== undefined) updateData.majorCategory = data.majorCategory;
  if (data.minorCategory !== undefined) updateData.minorCategory = data.minorCategory || null;
  if (data.description !== undefined) updateData.description = data.description || null;

  if (Object.keys(updateData).length === 0) {
    throw new Error("수정할 내용이 없습니다");
  }

  // tenant_id IS NULL 글로벌 카테고리도 업데이트 가능하도록 유지
  await db
    .update(accountCategories)
    .set(updateData)
    .where(
      and(
        eq(accountCategories.id, id),
        or(
          eq(accountCategories.tenantId, tenantId),
          isNull(accountCategories.tenantId),
        ),
      ),
    );

  return { success: true };
}

/**
 * 계정 과목 삭제 (소프트 삭제)
 * P0: tenantId 필수
 */
export async function deleteAccountCategory(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  await db
    .update(accountCategories)
    .set({ isActive: 0 })
    .where(
      and(
        eq(accountCategories.id, id),
        or(
          eq(accountCategories.tenantId, tenantId),
          isNull(accountCategories.tenantId),
        ),
      ),
    );

  return { success: true };
}

/**
 * 계정 과목 ID로 조회
 * P0: tenantId 필수
 */
export async function getAccountCategoryById(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const rows = await db
    .select()
    .from(accountCategories)
    .where(
      and(
        eq(accountCategories.id, id),
        or(
          eq(accountCategories.tenantId, tenantId),
          isNull(accountCategories.tenantId),
        ),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    throw new Error("계정 과목을 찾을 수 없습니다");
  }

  return rows[0];
}
