/**
 * Partner CRM 라우터 (Phase 1)
 *
 * 거래처 360 페이지에서 사용할 CRM 기능:
 *   - contact: 거래처 담당자 CRUD
 *   - activity: 활동 이력 CRUD + timeline 조회
 *   - tag: 자유 태그 CRUD
 *   - overview: 거래처 개요 (기존 데이터 집계)
 *
 * 기존 데이터 활용 (READ-ONLY 집계):
 *   - quotations / accounting_purchases / accounting_sales / ap_ledger / ar_ledger
 *   - communication_logs (메모 timeline 통합 노출)
 *
 * 모든 프로시저는 tenantRequiredProcedure 로 격리.
 *
 * 작성: 2026-05-05
 */
import { z } from "zod";
import { sql, and, eq, desc } from "drizzle-orm";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import {
  partnerContacts,
  partnerActivities,
  partnerTags,
} from "../../../drizzle/schema/partnerCrm";

export const partnerCrmRouter = router({
  // ═══════════════════════════════════════════════════════════════
  // 담당자 (Contact)
  // ═══════════════════════════════════════════════════════════════

  contactList: tenantRequiredProcedure
    .input(z.object({ partnerId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      return await db
        .select()
        .from(partnerContacts)
        .where(
          and(
            eq(partnerContacts.tenantId, Number(ctx.tenantId)),
            eq(partnerContacts.partnerId, input.partnerId),
          ),
        )
        .orderBy(desc(partnerContacts.isPrimary), desc(partnerContacts.createdAt));
    }),

  contactCreate: tenantRequiredProcedure
    .input(
      z.object({
        partnerId: z.number(),
        name: z.string().min(1),
        role: z.string().optional(),
        department: z.string().optional(),
        phone: z.string().optional(),
        mobile: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        isPrimary: z.boolean().default(false),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const tenantId = Number(ctx.tenantId);

      // is_primary=true 인 경우 기존 primary 해제
      if (input.isPrimary) {
        await db.execute(sql`
          UPDATE partner_contacts SET is_primary = 0
          WHERE tenant_id = ${tenantId} AND partner_id = ${input.partnerId}
        `);
      }

      const result: any = await db.insert(partnerContacts).values({
        tenantId,
        partnerId: input.partnerId,
        name: input.name,
        role: input.role || null,
        department: input.department || null,
        phone: input.phone || null,
        mobile: input.mobile || null,
        email: input.email || null,
        isPrimary: input.isPrimary ? 1 : 0,
        notes: input.notes || null,
        createdBy: Number(ctx.user?.id) || null,
      } as any);

      return { success: true, id: Number(result?.[0]?.insertId ?? 0) };
    }),

  contactUpdate: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        partnerId: z.number(),
        name: z.string().min(1),
        role: z.string().optional(),
        department: z.string().optional(),
        phone: z.string().optional(),
        mobile: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        isPrimary: z.boolean().default(false),
        isActive: z.boolean().default(true),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const tenantId = Number(ctx.tenantId);

      if (input.isPrimary) {
        await db.execute(sql`
          UPDATE partner_contacts SET is_primary = 0
          WHERE tenant_id = ${tenantId} AND partner_id = ${input.partnerId} AND id != ${input.id}
        `);
      }

      await db
        .update(partnerContacts)
        .set({
          name: input.name,
          role: input.role || null,
          department: input.department || null,
          phone: input.phone || null,
          mobile: input.mobile || null,
          email: input.email || null,
          isPrimary: input.isPrimary ? 1 : 0,
          isActive: input.isActive ? 1 : 0,
          notes: input.notes || null,
        } as any)
        .where(
          and(
            eq(partnerContacts.id, input.id),
            eq(partnerContacts.tenantId, tenantId),
          ),
        );

      return { success: true };
    }),

  contactDelete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      await db
        .delete(partnerContacts)
        .where(
          and(
            eq(partnerContacts.id, input.id),
            eq(partnerContacts.tenantId, Number(ctx.tenantId)),
          ),
        );
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════
  // 활동 이력 (Activity)
  // ═══════════════════════════════════════════════════════════════

  activityTimeline: tenantRequiredProcedure
    .input(
      z.object({
        partnerId: z.number(),
        limit: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const tenantId = Number(ctx.tenantId);

      // partner_activities + communication_logs 통합 timeline (UNION)
      const result: any = await db.execute(sql`
        (
          SELECT
            CONCAT('act-', id) AS uid,
            'activity' AS source,
            id,
            activity_type AS type,
            title,
            body,
            outcome,
            occurred_at AS occurred_at,
            created_by,
            created_at
          FROM partner_activities
          WHERE tenant_id = ${tenantId} AND partner_id = ${input.partnerId}
        )
        UNION ALL
        (
          SELECT
            CONCAT('cl-', id) AS uid,
            'comm_log' AS source,
            id,
            'note' AS type,
            CASE WHEN status = 'completed' THEN '메모 (완료)'
                 WHEN status = 'in_progress' THEN '메모 (진행중)'
                 ELSE '메모 (접수)' END AS title,
            content AS body,
            NULL AS outcome,
            created_at AS occurred_at,
            author_id AS created_by,
            created_at
          FROM communication_logs
          WHERE tenant_id = ${tenantId} AND partner_id = ${input.partnerId}
        )
        ORDER BY occurred_at DESC
        LIMIT ${input.limit}
      `);
      const rows = ((result as any)?.[0] ?? []) as any[];
      return rows.map((r) => ({
        uid: String(r.uid),
        source: String(r.source),
        id: Number(r.id),
        type: String(r.type),
        title: String(r.title || ""),
        body: r.body ? String(r.body) : null,
        outcome: r.outcome ? String(r.outcome) : null,
        occurredAt: r.occurred_at,
        createdBy: r.created_by ? Number(r.created_by) : null,
      }));
    }),

  activityCreate: tenantRequiredProcedure
    .input(
      z.object({
        partnerId: z.number(),
        contactId: z.number().optional(),
        activityType: z.enum([
          "call",
          "email",
          "meeting",
          "visit",
          "note",
          "quote_sent",
          "contract_signed",
          "payment_received",
          "payment_overdue",
          "task",
          "other",
        ]),
        title: z.string().min(1),
        body: z.string().optional(),
        outcome: z.enum(["info", "follow_up", "won", "lost", "blocked"]).optional(),
        occurredAt: z.string().or(z.date()).optional(),
        durationMinutes: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const occurredAt = input.occurredAt
        ? new Date(input.occurredAt as any)
        : new Date();

      const result: any = await db.insert(partnerActivities).values({
        tenantId: Number(ctx.tenantId),
        partnerId: input.partnerId,
        contactId: input.contactId || null,
        activityType: input.activityType,
        title: input.title,
        body: input.body || null,
        outcome: input.outcome || null,
        occurredAt,
        durationMinutes: input.durationMinutes || null,
        createdBy: Number(ctx.user?.id) || 0,
      } as any);

      return { success: true, id: Number(result?.[0]?.insertId ?? 0) };
    }),

  activityDelete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      await db
        .delete(partnerActivities)
        .where(
          and(
            eq(partnerActivities.id, input.id),
            eq(partnerActivities.tenantId, Number(ctx.tenantId)),
          ),
        );
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════
  // 태그 (Tag)
  // ═══════════════════════════════════════════════════════════════

  tagList: tenantRequiredProcedure
    .input(z.object({ partnerId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      return await db
        .select()
        .from(partnerTags)
        .where(
          and(
            eq(partnerTags.tenantId, Number(ctx.tenantId)),
            eq(partnerTags.partnerId, input.partnerId),
          ),
        );
    }),

  tagAdd: tenantRequiredProcedure
    .input(
      z.object({
        partnerId: z.number(),
        tag: z.string().min(1).max(50),
        color: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const result: any = await db.insert(partnerTags).values({
        tenantId: Number(ctx.tenantId),
        partnerId: input.partnerId,
        tag: input.tag,
        color: input.color || null,
        createdBy: Number(ctx.user?.id) || null,
      } as any);
      return { success: true, id: Number(result?.[0]?.insertId ?? 0) };
    }),

  tagRemove: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      await db
        .delete(partnerTags)
        .where(
          and(
            eq(partnerTags.id, input.id),
            eq(partnerTags.tenantId, Number(ctx.tenantId)),
          ),
        );
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════
  // 거래처 360 개요 (기존 데이터 집계)
  // ═══════════════════════════════════════════════════════════════

  overview: tenantRequiredProcedure
    .input(z.object({ partnerId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const tenantId = Number(ctx.tenantId);

      // 거래처 기본 정보
      const partnerResult: any = await db.execute(sql`
        SELECT * FROM partners WHERE id = ${input.partnerId} AND tenant_id = ${tenantId} LIMIT 1
      `);
      const partnerRow = ((partnerResult as any)?.[0] ?? [])[0];
      if (!partnerRow) throw new Error("거래처를 찾을 수 없습니다");

      // 거래 요약 (매입/매출 합계 + 건수, 최근 거래일)
      const purchaseStatsResult: any = await db.execute(sql`
        SELECT
          COUNT(*) AS cnt,
          COALESCE(SUM(total_amount), 0) AS total,
          MAX(transaction_date) AS last_at
        FROM accounting_purchases
        WHERE tenant_id = ${tenantId} AND partner_id = ${input.partnerId}
      `);
      const purchaseStats = ((purchaseStatsResult as any)?.[0] ?? [])[0] || {};

      const saleStatsResult: any = await db.execute(sql`
        SELECT
          COUNT(*) AS cnt,
          COALESCE(SUM(total_amount), 0) AS total,
          MAX(transaction_date) AS last_at
        FROM accounting_sales
        WHERE tenant_id = ${tenantId} AND partner_id = ${input.partnerId}
      `);
      const saleStats = ((saleStatsResult as any)?.[0] ?? [])[0] || {};

      // 견적 건수
      const quoteStatsResult: any = await db.execute(sql`
        SELECT COUNT(*) AS cnt, MAX(quote_date) AS last_at
        FROM quotations
        WHERE tenant_id = ${tenantId} AND partner_id = ${input.partnerId}
      `);
      const quoteStats = ((quoteStatsResult as any)?.[0] ?? [])[0] || {};

      // AP / AR 잔액
      const apResult: any = await db.execute(sql`
        SELECT COALESCE(SUM(balance), 0) AS bal
        FROM ap_ledger
        WHERE tenant_id = ${tenantId} AND partner_id = ${input.partnerId}
      `);
      const arResult: any = await db.execute(sql`
        SELECT COALESCE(SUM(balance), 0) AS bal
        FROM ar_ledger
        WHERE tenant_id = ${tenantId} AND partner_id = ${input.partnerId}
      `);
      const apBalance = Number(((apResult as any)?.[0] ?? [])[0]?.bal || 0);
      const arBalance = Number(((arResult as any)?.[0] ?? [])[0]?.bal || 0);

      // 담당자 / 활동 / 태그 카운트
      const contactCountResult: any = await db.execute(sql`
        SELECT COUNT(*) AS cnt FROM partner_contacts WHERE tenant_id = ${tenantId} AND partner_id = ${input.partnerId}
      `);
      const activityCountResult: any = await db.execute(sql`
        SELECT COUNT(*) AS cnt FROM partner_activities WHERE tenant_id = ${tenantId} AND partner_id = ${input.partnerId}
      `);
      const tagCountResult: any = await db.execute(sql`
        SELECT COUNT(*) AS cnt FROM partner_tags WHERE tenant_id = ${tenantId} AND partner_id = ${input.partnerId}
      `);

      return {
        partner: partnerRow,
        purchase: {
          count: Number(purchaseStats.cnt || 0),
          total: Number(purchaseStats.total || 0),
          lastAt: purchaseStats.last_at,
        },
        sale: {
          count: Number(saleStats.cnt || 0),
          total: Number(saleStats.total || 0),
          lastAt: saleStats.last_at,
        },
        quote: {
          count: Number(quoteStats.cnt || 0),
          lastAt: quoteStats.last_at,
        },
        apBalance,
        arBalance,
        counts: {
          contacts: Number(((contactCountResult as any)?.[0] ?? [])[0]?.cnt || 0),
          activities: Number(((activityCountResult as any)?.[0] ?? [])[0]?.cnt || 0),
          tags: Number(((tagCountResult as any)?.[0] ?? [])[0]?.cnt || 0),
        },
      };
    }),

  /**
   * partners.metadata JSON 업데이트 (자유 custom field)
   */
  metadataUpdate: tenantRequiredProcedure
    .input(
      z.object({
        partnerId: z.number(),
        metadata: z.record(z.string(), z.any()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const tenantId = Number(ctx.tenantId);

      await db.execute(sql`
        UPDATE partners SET metadata = ${JSON.stringify(input.metadata)}
        WHERE id = ${input.partnerId} AND tenant_id = ${tenantId}
      `);
      return { success: true };
    }),
});
