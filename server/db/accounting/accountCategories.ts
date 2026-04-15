import { getRawConnection } from "../connection";
import { eq, and, desc } from "drizzle-orm";

/**
 * 계정 과목 관리 함수
 * P0: 모든 함수에 tenantId 필터링 적용 - 테넌트 격리
 */

// 임시 타입 정의 (drizzle schema에 추가 필요)
type AccountCategory = {
  id: number;
  code: string;
  name: string;
  majorCategory: string;
  minorCategory: string | null;
  description: string | null;
  isActive: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * 모든 계정 과목 조회
 * P0: tenantId 필수
 * tenant_id IS NULL인 글로벌 카테고리도 포함
 */
export async function getAllAccountCategories(tenantId: number) {
  const db = await getRawConnection();

  const [result] = await db.execute(
    `SELECT
      id,
      code,
      name,
      major_category as majorCategory,
      minor_category as minorCategory,
      description,
      is_active as isActive,
      created_at as createdAt,
      updated_at as updatedAt
    FROM account_categories
    WHERE is_active = 1 AND (tenant_id = ? OR tenant_id IS NULL)
    ORDER BY code ASC`,
    [tenantId]
  );

  return result as AccountCategory[];
}

/**
 * 대분류별 계정 과목 조회
 * P0: tenantId 필수
 */
export async function getAccountCategoriesByMajor(majorCategory: string, tenantId: number) {
  const db = await getRawConnection();

  const [result] = await db.execute(
    `SELECT
      id,
      code,
      name,
      major_category as majorCategory,
      minor_category as minorCategory,
      description,
      is_active as isActive,
      created_at as createdAt,
      updated_at as updatedAt
    FROM account_categories
    WHERE is_active = 1 AND major_category = ? AND (tenant_id = ? OR tenant_id IS NULL)
    ORDER BY code ASC`,
    [majorCategory, tenantId]
  );

  return result as AccountCategory[];
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
  const db = await getRawConnection();

  // 코드 중복 체크 (테넌트 범위 내 + 글로벌)
  const [existing] = await db.execute(
    `SELECT id FROM account_categories WHERE code = ? AND (tenant_id = ? OR tenant_id IS NULL) LIMIT 1`,
    [data.code, data.tenantId]
  );

  if (existing && (existing as any[]).length > 0) {
    throw new Error("이미 존재하는 계정 코드입니다");
  }

  const [result] = await db.execute(
    `INSERT INTO account_categories (code, name, major_category, minor_category, description, tenant_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.code,
      data.name,
      data.majorCategory,
      data.minorCategory || null,
      data.description || null,
      data.tenantId,
    ]
  );

  return { id: (result as any).insertId };
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
  const db = await getRawConnection();

  // 코드 변경 시 중복 체크
  if (data.code) {
    const [existing] = await db.execute(
      `SELECT id FROM account_categories WHERE code = ? AND id != ? AND (tenant_id = ? OR tenant_id IS NULL) LIMIT 1`,
      [data.code, id, tenantId]
    );

    if (existing && (existing as any[]).length > 0) {
      throw new Error("이미 존재하는 계정 코드입니다");
    }
  }

  const updates: string[] = [];
  const values: any[] = [];

  if (data.code !== undefined) {
    updates.push("code = ?");
    values.push(data.code);
  }
  if (data.name !== undefined) {
    updates.push("name = ?");
    values.push(data.name);
  }
  if (data.majorCategory !== undefined) {
    updates.push("major_category = ?");
    values.push(data.majorCategory);
  }
  if (data.minorCategory !== undefined) {
    updates.push("minor_category = ?");
    values.push(data.minorCategory || null);
  }
  if (data.description !== undefined) {
    updates.push("description = ?");
    values.push(data.description || null);
  }

  if (updates.length === 0) {
    throw new Error("수정할 내용이 없습니다");
  }

  values.push(id);
  values.push(tenantId);

  await db.execute(
    `UPDATE account_categories SET ${updates.join(", ")} WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
    values
  );

  return { success: true };
}

/**
 * 계정 과목 삭제 (소프트 삭제)
 * P0: tenantId 필수
 */
export async function deleteAccountCategory(id: number, tenantId: number) {
  const db = await getRawConnection();

  await db.execute(
    `UPDATE account_categories SET is_active = 0 WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
    [id, tenantId]
  );

  return { success: true };
}

/**
 * 계정 과목 ID로 조회
 * P0: tenantId 필수
 */
export async function getAccountCategoryById(id: number, tenantId: number) {
  const db = await getRawConnection();

  const [result] = await db.execute(
    `SELECT
      id,
      code,
      name,
      major_category as majorCategory,
      minor_category as minorCategory,
      description,
      is_active as isActive,
      created_at as createdAt,
      updated_at as updatedAt
    FROM account_categories
    WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL) LIMIT 1`,
    [id, tenantId]
  );

  const rows = result as AccountCategory[];
  if (!rows || rows.length === 0) {
    throw new Error("계정 과목을 찾을 수 없습니다");
  }

  return rows[0];
}
