/**
 * 체크리스트 시작 화면 라우터 (일지 PR 3, 2026-10-15) — 통합 작성 기록 · 양식 즐겨찾기
 * 로직·SQL 은 server/lib/checklist/checklistHome.ts
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getRawConnection } from "../../db/connection";
import { getEffectiveTenantId } from "./_helpers";
import { FAVORITES_KEY, FAVORITE_ID, FAVORITES_MAX, buildRecordSearch, normalizeFavorites, parseFavorites } from "../../lib/checklist/checklistHome";

const YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const checklistHomeRouter = router({
  records: tenantRequiredProcedure
    .input(z.object({
      formTypes: z.array(z.string().regex(/^[a-z0-9_]{1,100}$/)).max(60).optional(),
      from: YMD.optional(),
      to: YMD.optional(),
      writer: z.string().max(50).optional(),
      status: z.enum(["draft", "submitted", "approved", "rejected"]).optional(),
      mine: z.boolean().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(30),
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const q = buildRecordSearch(input, tenantId, Number(ctx.user.id));
      const conn = await getRawConnection();
      const [[countRow]]: any = await conn.execute(q.countSql, q.params);
      const [rows]: any = await conn.execute(q.listSql, q.params);
      return {
        total: Number(countRow?.total ?? 0),
        page: input.page,
        pageSize: input.pageSize,
        items: (rows as any[]).map((r) => ({
          id: Number(r.id), formType: String(r.formType), formDate: String(r.formDate).slice(0, 10), title: r.title ?? null,
          status: r.status ?? "draft", siteId: Number(r.siteId), writerName: r.writerName ?? null,
          createdBy: r.createdBy != null ? Number(r.createdBy) : null, createdAt: r.createdAt, updatedAt: r.updatedAt,
        })),
      };
    }),

  favorites: tenantRequiredProcedure.query(async ({ ctx }) => {
    const conn = await getRawConnection();
    const [rows]: any = await conn.execute(
      `SELECT preference_value FROM h_user_preferences WHERE tenant_id = ? AND user_id = ? AND preference_key = ? ORDER BY id DESC LIMIT 1`,
      [getEffectiveTenantId(ctx), ctx.user.id, FAVORITES_KEY],
    );
    return { items: parseFavorites(rows?.[0]?.preference_value) };
  }),

  setFavorites: tenantRequiredProcedure
    .input(z.object({ items: z.array(z.string().regex(FAVORITE_ID)).max(FAVORITES_MAX) }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = getEffectiveTenantId(ctx);
      const items = normalizeFavorites(input.items);
      const conn = await getRawConnection();
      const value = JSON.stringify(items);
      const [rows]: any = await conn.execute(
        `SELECT id FROM h_user_preferences WHERE tenant_id = ? AND user_id = ? AND preference_key = ? ORDER BY id DESC LIMIT 1`,
        [tenantId, ctx.user.id, FAVORITES_KEY],
      );
      if (rows?.[0]?.id) {
        await conn.execute(`UPDATE h_user_preferences SET preference_value = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ? AND user_id = ?`, [value, rows[0].id, tenantId, ctx.user.id]);
      } else {
        await conn.execute(`INSERT INTO h_user_preferences (tenant_id, user_id, preference_key, preference_value, updated_at) VALUES (?, ?, ?, ?, NOW())`, [tenantId, ctx.user.id, FAVORITES_KEY, value]);
      }
      return { items };
    }),
});
