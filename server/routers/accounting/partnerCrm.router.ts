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
  partnerDocuments,
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

  // ═══════════════════════════════════════════════════════════════
  // Phase 2 — 거래내역 (Transactions)
  // ═══════════════════════════════════════════════════════════════

  /**
   * 매입 + 매출 통합 거래내역 (시간순)
   */
  transactions: tenantRequiredProcedure
    .input(
      z.object({
        partnerId: z.number(),
        kind: z.enum(["all", "purchase", "sale"]).default("all"),
        limit: z.number().int().min(1).max(500).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const tenantId = Number(ctx.tenantId);

      const purchaseEnabled = input.kind === "all" || input.kind === "purchase";
      const saleEnabled = input.kind === "all" || input.kind === "sale";

      const queries: any[] = [];
      if (purchaseEnabled) {
        const r: any = await db.execute(sql`
          SELECT
            CONCAT('p-', id) AS uid,
            'purchase' AS kind,
            id, transaction_date, item_name, quantity, unit, unit_price, total_amount, tax_amount,
            evidence_type, status, memo, created_at
          FROM accounting_purchases
          WHERE tenant_id = ${tenantId} AND partner_id = ${input.partnerId}
          ORDER BY transaction_date DESC, id DESC
          LIMIT ${input.limit}
        `);
        queries.push(...(((r as any)?.[0] ?? []) as any[]));
      }
      if (saleEnabled) {
        const r: any = await db.execute(sql`
          SELECT
            CONCAT('s-', id) AS uid,
            'sale' AS kind,
            id, transaction_date, item_name, quantity, unit, unit_price, total_amount, tax_amount,
            evidence_type, status, memo, created_at
          FROM accounting_sales
          WHERE tenant_id = ${tenantId} AND partner_id = ${input.partnerId}
          ORDER BY transaction_date DESC, id DESC
          LIMIT ${input.limit}
        `);
        queries.push(...(((r as any)?.[0] ?? []) as any[]));
      }

      // 통합 + 날짜 역순
      queries.sort((a: any, b: any) => String(b.transaction_date).localeCompare(String(a.transaction_date)));

      return queries.slice(0, input.limit).map((r: any) => ({
        uid: String(r.uid),
        kind: String(r.kind),
        id: Number(r.id),
        transactionDate: String(r.transaction_date),
        itemName: String(r.item_name || ""),
        quantity: Number(r.quantity || 0),
        unit: String(r.unit || ""),
        unitPrice: Number(r.unit_price || 0),
        totalAmount: Number(r.total_amount || 0),
        taxAmount: Number(r.tax_amount || 0),
        evidenceType: r.evidence_type || null,
        status: r.status || null,
        memo: r.memo || null,
      }));
    }),

  // ═══════════════════════════════════════════════════════════════
  // Phase 2 — 견적 (Quotes)
  // ═══════════════════════════════════════════════════════════════

  quotations: tenantRequiredProcedure
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

      const r: any = await db.execute(sql`
        SELECT id, quotation_number, quote_date, valid_until, title,
               total_amount, tax_amount, grand_total, discount_amount, status,
               created_at
        FROM quotations
        WHERE tenant_id = ${tenantId} AND partner_id = ${input.partnerId}
        ORDER BY quote_date DESC, id DESC
        LIMIT ${input.limit}
      `);
      const rows = ((r as any)?.[0] ?? []) as any[];
      return rows.map((q) => ({
        id: Number(q.id),
        quotationNumber: String(q.quotation_number || ""),
        quoteDate: String(q.quote_date || ""),
        validUntil: q.valid_until ? String(q.valid_until) : null,
        title: q.title ? String(q.title) : null,
        totalAmount: Number(q.total_amount || 0),
        taxAmount: Number(q.tax_amount || 0),
        grandTotal: Number(q.grand_total || 0),
        discountAmount: Number(q.discount_amount || 0),
        status: String(q.status || "draft"),
      }));
    }),

  // ═══════════════════════════════════════════════════════════════
  // Phase 2 — 단가 추이 (Prices) — accounting_purchases 의 단가 변화
  // ═══════════════════════════════════════════════════════════════

  prices: tenantRequiredProcedure
    .input(
      z.object({
        partnerId: z.number(),
        days: z.number().int().min(7).max(720).default(180),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { items: [], series: [] };
      const tenantId = Number(ctx.tenantId);

      // 해당 거래처와 거래 한 품목별 단가 추이
      const r: any = await db.execute(sql`
        SELECT
          item_name, transaction_date, unit_price, quantity, unit
        FROM accounting_purchases
        WHERE tenant_id = ${tenantId}
          AND partner_id = ${input.partnerId}
          AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL ${input.days} DAY)
        ORDER BY transaction_date ASC
      `);
      const rows = ((r as any)?.[0] ?? []) as any[];

      // 품목별 그룹핑 → 차트 시리즈
      const byItem = new Map<string, Array<{ date: string; price: number; qty: number; unit: string }>>();
      for (const row of rows) {
        const key = String(row.item_name);
        const arr = byItem.get(key) ?? [];
        arr.push({
          date: String(row.transaction_date),
          price: Number(row.unit_price || 0),
          qty: Number(row.quantity || 0),
          unit: String(row.unit || ""),
        });
        byItem.set(key, arr);
      }

      const items = Array.from(byItem.entries()).map(([name, points]) => {
        const prices = points.map((p) => p.price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
        const last = points[points.length - 1];
        const first = points[0];
        const trend = first.price > 0 ? ((last.price - first.price) / first.price) * 100 : 0;
        return {
          name,
          unit: last.unit,
          count: points.length,
          min,
          max,
          avg,
          first: first.price,
          last: last.price,
          trendPct: trend,
          points,
        };
      });

      items.sort((a, b) => b.count - a.count);

      return { items };
    }),

  // ═══════════════════════════════════════════════════════════════
  // Phase 2 — 분석 (Analytics) — 월별 추이
  // ═══════════════════════════════════════════════════════════════

  analytics: tenantRequiredProcedure
    .input(
      z.object({
        partnerId: z.number(),
        months: z.number().int().min(3).max(36).default(12),
      }),
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { monthly: [], summary: null };
      const tenantId = Number(ctx.tenantId);

      // 월별 매입/매출 집계
      const r: any = await db.execute(sql`
        SELECT
          ym,
          SUM(purchase_amount) AS purchase_amount,
          SUM(purchase_count) AS purchase_count,
          SUM(sale_amount) AS sale_amount,
          SUM(sale_count) AS sale_count
        FROM (
          SELECT
            DATE_FORMAT(transaction_date, '%Y-%m') AS ym,
            SUM(total_amount) AS purchase_amount,
            COUNT(*) AS purchase_count,
            0 AS sale_amount,
            0 AS sale_count
          FROM accounting_purchases
          WHERE tenant_id = ${tenantId}
            AND partner_id = ${input.partnerId}
            AND transaction_date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ${input.months} MONTH), '%Y-%m-01')
          GROUP BY ym
          UNION ALL
          SELECT
            DATE_FORMAT(transaction_date, '%Y-%m') AS ym,
            0 AS purchase_amount,
            0 AS purchase_count,
            SUM(total_amount) AS sale_amount,
            COUNT(*) AS sale_count
          FROM accounting_sales
          WHERE tenant_id = ${tenantId}
            AND partner_id = ${input.partnerId}
            AND transaction_date >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ${input.months} MONTH), '%Y-%m-01')
          GROUP BY ym
        ) AS combined
        GROUP BY ym
        ORDER BY ym ASC
      `);
      const rows = ((r as any)?.[0] ?? []) as any[];
      const monthly = rows.map((row) => ({
        month: String(row.ym),
        purchaseAmount: Number(row.purchase_amount || 0),
        purchaseCount: Number(row.purchase_count || 0),
        saleAmount: Number(row.sale_amount || 0),
        saleCount: Number(row.sale_count || 0),
      }));

      // 활동 빈도 (per type)
      const actR: any = await db.execute(sql`
        SELECT activity_type, COUNT(*) AS cnt
        FROM partner_activities
        WHERE tenant_id = ${tenantId} AND partner_id = ${input.partnerId}
          AND occurred_at >= DATE_SUB(NOW(), INTERVAL ${input.months} MONTH)
        GROUP BY activity_type
      `);
      const activityByType = (((actR as any)?.[0] ?? []) as any[]).map((row) => ({
        type: String(row.activity_type),
        count: Number(row.cnt),
      }));

      return { monthly, activityByType };
    }),

  // ═══════════════════════════════════════════════════════════════
  // Phase 2 — 서류 (Documents)
  // ═══════════════════════════════════════════════════════════════

  documentList: tenantRequiredProcedure
    .input(z.object({ partnerId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      return await db
        .select()
        .from(partnerDocuments)
        .where(
          and(
            eq(partnerDocuments.tenantId, Number(ctx.tenantId)),
            eq(partnerDocuments.partnerId, input.partnerId),
          ),
        )
        .orderBy(desc(partnerDocuments.createdAt));
    }),

  documentCreate: tenantRequiredProcedure
    .input(
      z.object({
        partnerId: z.number(),
        docType: z.enum([
          "contract",
          "tax_invoice",
          "estimate",
          "purchase_order",
          "delivery_note",
          "receipt",
          "quality_cert",
          "iso_cert",
          "haccp_cert",
          "biz_license",
          "nda",
          "other",
        ]),
        title: z.string().min(1),
        docNumber: z.string().optional(),
        direction: z.enum(["issued", "received"]),
        fileUrl: z.string().optional(),
        fileName: z.string().optional(),
        fileSize: z.number().optional(),
        issuedAt: z.string().or(z.date()).optional(),
        receivedAt: z.string().or(z.date()).optional(),
        expiresAt: z.string().or(z.date()).optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");

      const result: any = await db.insert(partnerDocuments).values({
        tenantId: Number(ctx.tenantId),
        partnerId: input.partnerId,
        docType: input.docType,
        title: input.title,
        docNumber: input.docNumber || null,
        direction: input.direction,
        fileUrl: input.fileUrl || null,
        fileName: input.fileName || null,
        fileSize: input.fileSize || null,
        issuedAt: input.issuedAt ? new Date(input.issuedAt as any) : null,
        receivedAt: input.receivedAt ? new Date(input.receivedAt as any) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt as any) : null,
        notes: input.notes || null,
        createdBy: Number(ctx.user?.id) || 0,
      } as any);

      return { success: true, id: Number(result?.[0]?.insertId ?? 0) };
    }),

  documentMarkReceived: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      await db
        .update(partnerDocuments)
        .set({ receivedAt: new Date() } as any)
        .where(
          and(
            eq(partnerDocuments.id, input.id),
            eq(partnerDocuments.tenantId, Number(ctx.tenantId)),
          ),
        );
      return { success: true };
    }),

  documentDelete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      await db
        .delete(partnerDocuments)
        .where(
          and(
            eq(partnerDocuments.id, input.id),
            eq(partnerDocuments.tenantId, Number(ctx.tenantId)),
          ),
        );
      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════
  // Phase 4 — 신용/활성도 점수 (Score)
  // ═══════════════════════════════════════════════════════════════

  /**
   * 가장 최근 점수 + 30일 추이
   */
  latestScore: tenantRequiredProcedure
    .input(z.object({ partnerId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const tenantId = Number(ctx.tenantId);

      const r: any = await db.execute(sql`
        SELECT * FROM partner_scores
        WHERE tenant_id = ${tenantId} AND partner_id = ${input.partnerId}
        ORDER BY snapshot_date DESC
        LIMIT 30
      `);
      const rows = ((r as any)?.[0] ?? []) as any[];
      if (rows.length === 0) return null;

      const latest = rows[0];
      let breakdown: any = null;
      try {
        breakdown =
          typeof latest.breakdown === "string"
            ? JSON.parse(latest.breakdown)
            : latest.breakdown;
      } catch {}

      return {
        latest: {
          snapshotDate: String(latest.snapshot_date),
          paymentTimelinessScore: Number(latest.payment_timeliness_score),
          creditUtilizationScore: Number(latest.credit_utilization_score),
          activityFrequencyScore: Number(latest.activity_frequency_score),
          transactionStabilityScore: Number(latest.transaction_stability_score),
          totalScore: Number(latest.total_score),
          grade: String(latest.grade),
          breakdown,
        },
        history: rows
          .map((row: any) => ({
            date: String(row.snapshot_date),
            total: Number(row.total_score),
            grade: String(row.grade),
          }))
          .reverse(),
      };
    }),

  /**
   * 즉시 점수 재계산 (admin 수동 트리거)
   */
  recalculateScore: tenantRequiredProcedure
    .input(z.object({ partnerId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const tenantId = Number(ctx.tenantId);

      const { calculatePartnerScore } = await import("../../services/creditScoreCalculator");
      const score = await calculatePartnerScore(db, tenantId, input.partnerId);

      const today = new Date().toISOString().slice(0, 10);
      await db.execute(sql`
        INSERT INTO partner_scores
          (tenant_id, partner_id, snapshot_date,
           payment_timeliness_score, credit_utilization_score,
           activity_frequency_score, transaction_stability_score,
           total_score, grade, breakdown, created_at)
        VALUES
          (${tenantId}, ${input.partnerId}, ${today},
           ${score.paymentTimelinessScore}, ${score.creditUtilizationScore},
           ${score.activityFrequencyScore}, ${score.transactionStabilityScore},
           ${score.totalScore}, ${score.grade},
           ${JSON.stringify(score.reasoning)}, NOW())
        ON DUPLICATE KEY UPDATE
          payment_timeliness_score = VALUES(payment_timeliness_score),
          credit_utilization_score = VALUES(credit_utilization_score),
          activity_frequency_score = VALUES(activity_frequency_score),
          transaction_stability_score = VALUES(transaction_stability_score),
          total_score = VALUES(total_score),
          grade = VALUES(grade),
          breakdown = VALUES(breakdown)
      `);

      return { success: true, score };
    }),

  /**
   * 견적 응답 시간 분석 (sent → accepted/rejected 평균 일수)
   */
  quoteResponseTime: tenantRequiredProcedure
    .input(z.object({ partnerId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const tenantId = Number(ctx.tenantId);

      const r: any = await db.execute(sql`
        SELECT
          status,
          AVG(DATEDIFF(
            COALESCE(accepted_at, rejected_at, NOW()),
            sent_at
          )) AS avg_days,
          COUNT(*) AS cnt
        FROM quotations
        WHERE tenant_id = ${tenantId}
          AND partner_id = ${input.partnerId}
          AND sent_at IS NOT NULL
          AND status IN ('sent', 'accepted', 'rejected', 'expired')
        GROUP BY status
      `);
      const rows = ((r as any)?.[0] ?? []) as any[];

      let acceptedAvg = 0;
      let acceptedCnt = 0;
      let rejectedAvg = 0;
      let rejectedCnt = 0;
      let pendingCnt = 0;
      let totalCnt = 0;

      for (const row of rows) {
        const cnt = Number(row.cnt || 0);
        totalCnt += cnt;
        if (row.status === "accepted") {
          acceptedAvg = Number(row.avg_days || 0);
          acceptedCnt = cnt;
        } else if (row.status === "rejected") {
          rejectedAvg = Number(row.avg_days || 0);
          rejectedCnt = cnt;
        } else if (row.status === "sent") {
          pendingCnt = cnt;
        }
      }

      const acceptanceRate =
        acceptedCnt + rejectedCnt > 0
          ? (acceptedCnt / (acceptedCnt + rejectedCnt)) * 100
          : null;

      return {
        totalSentQuotes: totalCnt,
        acceptedCount: acceptedCnt,
        rejectedCount: rejectedCnt,
        pendingCount: pendingCnt,
        avgDaysToAccept: acceptedAvg,
        avgDaysToReject: rejectedAvg,
        acceptanceRate,
      };
    }),
});
