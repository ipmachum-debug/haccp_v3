/**
 * 체크리스트 시작 화면 — 통합 작성 기록 검색 · 양식 즐겨찾기 (일지 PR 3, 2026-10-15)
 *
 * 작성 기록: 공통 일지(h_generic_checklist_records) 전 양식을 종류·기간·작성자·상태로 검색.
 *   작성자 = form_data.approval.writerName (결재란의 작성자) — 없으면 created_by 사용자 이름.
 * 즐겨찾기: h_user_preferences (회사·사용자별) 키 하나에 양식 식별자 목록(순서 포함)만 저장.
 *   입력값·경로는 저장하지 않는다. 메뉴 즐겨찾기(h_user_favorites)와는 별개.
 */
export const FAVORITES_KEY = "checklist.favorites";
export const FAVORITE_ID = /^[a-z0-9][a-z0-9_-]{0,59}$/;
export const FAVORITES_MAX = 50;

/** 저장 전 정리 — 형식이 맞는 것만, 중복 제거, 순서 유지, 최대 50 */
export function normalizeFavorites(ids: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const v of ids) {
    if (typeof v !== "string" || !FAVORITE_ID.test(v) || out.includes(v)) continue;
    out.push(v);
    if (out.length >= FAVORITES_MAX) break;
  }
  return out;
}

export function parseFavorites(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? normalizeFavorites(v) : []; } catch { return []; }
}

export type RecordSearch = {
  formTypes?: string[];
  from?: string;
  to?: string;
  writer?: string;
  status?: "draft" | "submitted" | "approved" | "rejected";
  mine?: boolean;
  page: number;
  pageSize: number;
};

const WRITER_EXPR = "COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.form_data, '$.approval.writerName')), 'null'), u.name)";

/** 검색 SQL — 회사 격리 필수, 값은 모두 바인딩 */
export function buildRecordSearch(q: RecordSearch, tenantId: number, userId: number) {
  const where = ["r.tenant_id = ?"];
  const params: unknown[] = [tenantId];
  if (q.formTypes?.length) { where.push(`r.form_type IN (${q.formTypes.map(() => "?").join(",")})`); params.push(...q.formTypes); }
  if (q.from) { where.push("r.form_date >= ?"); params.push(q.from); }
  if (q.to) { where.push("r.form_date <= ?"); params.push(q.to); }
  if (q.status) { where.push("r.status = ?"); params.push(q.status); }
  if (q.mine) { where.push("r.created_by = ?"); params.push(userId); }
  if (q.writer?.trim()) { where.push(`${WRITER_EXPR} LIKE ?`); params.push(`%${q.writer.trim()}%`); }
  const from = `FROM h_generic_checklist_records r LEFT JOIN users u ON u.id = r.created_by`;
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const offset = (q.page - 1) * q.pageSize;
  return {
    countSql: `SELECT COUNT(*) AS total ${from} ${whereSql}`,
    listSql: `SELECT r.id, r.form_type AS formType, r.form_date AS formDate, r.title, r.status, r.site_id AS siteId,
                     r.created_by AS createdBy, r.created_at AS createdAt, r.updated_at AS updatedAt, ${WRITER_EXPR} AS writerName
              ${from} ${whereSql}
              ORDER BY r.form_date DESC, r.id DESC
              LIMIT ${Number(q.pageSize)} OFFSET ${Number(offset)}`,
    params,
  };
}
