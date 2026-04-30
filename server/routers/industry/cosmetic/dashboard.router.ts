/**
 * 화장품 GMP 운영 대시보드 라우터 (Phase 2-10)
 *
 * 식품 F-3 운영 대시보드 (PR #143) 의 cosmetic 버전.
 *
 * 4 endpoints:
 *   - summary       : 활성 모듈 + 24h 카운트 한눈
 *   - recentBmrs    : 최근 BMR 5건 (status 별)
 *   - recentReleases: 최근 Release 5건
 *   - recentIpcFails: 최근 IPC fail 5건 (운영자 우선 검토)
 */
import { z } from "zod";
import { sql } from "drizzle-orm";
import { router, tenantRequiredProcedure } from "../../../_core/trpc";
import { getDb } from "../../../db";

const HOURS_24 = sql.raw(`INTERVAL 24 HOUR`);

export const cosmeticDashboardRouter = router({
  summary: tenantRequiredProcedure.query(async ({ ctx }) => {
    const tenantId = Number(ctx.tenantId);
    const db = await getDb();
    if (!db) {
      return {
        flags: {
          alerts: false,
        },
        counts24h: {
          bmrCreated: 0,
          bmrCompleted: 0,
          ipcFail: 0,
          releaseApproved: 0,
          releaseRecalled: 0,
          stabilityObserved: 0,
        },
        totals: {
          bmrTotal: 0,
          formulaActive: 0,
          labelActive: 0,
          stabilityInProgress: 0,
        },
      };
    }

    // env flag
    const cosmeticAlertsFlag = (() => {
      const tenants = process.env.ENABLE_COSMETIC_ALERTS_TENANTS?.trim();
      if (tenants) {
        const enabled = tenants
          .split(",")
          .map((s) => s.trim())
          .map((s) => Number(s))
          .filter((n) => Number.isFinite(n));
        if (enabled.length > 0) return enabled.includes(tenantId);
      }
      const flag = process.env.ENABLE_COSMETIC_ALERTS?.toLowerCase().trim();
      return flag === "true" || flag === "1" || flag === "yes";
    })();

    // 24h counts (병렬)
    const [
      bmrCreated,
      bmrCompleted,
      ipcFail,
      releaseApproved,
      releaseRecalled,
      stabilityObs,
      bmrTotal,
      formulaActive,
      labelActive,
      stabilityInProgress,
    ] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM h_cosmetic_bmr
        WHERE tenant_id = ${tenantId}
          AND created_at >= DATE_SUB(NOW(), ${HOURS_24})
      `).then((r: any) => r as any[]),
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM h_cosmetic_bmr
        WHERE tenant_id = ${tenantId}
          AND status = 'completed'
          AND completed_at >= DATE_SUB(NOW(), ${HOURS_24})
      `).then((r: any) => r as any[]),
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM h_cosmetic_bmr_ipc
        WHERE tenant_id = ${tenantId}
          AND pass_fail = 'fail'
          AND created_at >= DATE_SUB(NOW(), ${HOURS_24})
      `).then((r: any) => r as any[]),
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM h_cosmetic_release
        WHERE tenant_id = ${tenantId}
          AND status IN ('approved','released')
          AND approved_at >= DATE_SUB(NOW(), ${HOURS_24})
      `).then((r: any) => r as any[]),
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM h_cosmetic_release
        WHERE tenant_id = ${tenantId}
          AND status = 'recalled'
          AND recalled_at >= DATE_SUB(NOW(), ${HOURS_24})
      `).then((r: any) => r as any[]),
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM h_cosmetic_stability_observation
        WHERE tenant_id = ${tenantId}
          AND created_at >= DATE_SUB(NOW(), ${HOURS_24})
      `).then((r: any) => r as any[]),
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM h_cosmetic_bmr WHERE tenant_id = ${tenantId}
      `).then((r: any) => r as any[]),
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM h_cosmetic_formula
        WHERE tenant_id = ${tenantId} AND status = 'active'
      `).then((r: any) => r as any[]),
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM h_cosmetic_label
        WHERE tenant_id = ${tenantId} AND status = 'active'
      `).then((r: any) => r as any[]),
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM h_cosmetic_stability_test
        WHERE tenant_id = ${tenantId} AND status = 'in_progress'
      `).then((r: any) => r as any[]),
    ]);

    const num = (rows: any[]) => Number((rows as any[])[0]?.cnt ?? 0);

    return {
      flags: {
        alerts: cosmeticAlertsFlag,
      },
      counts24h: {
        bmrCreated: num(bmrCreated),
        bmrCompleted: num(bmrCompleted),
        ipcFail: num(ipcFail),
        releaseApproved: num(releaseApproved),
        releaseRecalled: num(releaseRecalled),
        stabilityObserved: num(stabilityObs),
      },
      totals: {
        bmrTotal: num(bmrTotal),
        formulaActive: num(formulaActive),
        labelActive: num(labelActive),
        stabilityInProgress: num(stabilityInProgress),
      },
    };
  }),

  recentBmrs: tenantRequiredProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(5) }))
    .query(async ({ ctx, input }) => {
      const tenantId = Number(ctx.tenantId);
      const db = await getDb();
      if (!db) return [];
      const rows: any = await db.execute(sql`
        SELECT id, bmr_code, product_id, status, planned_quantity_kg, created_at
        FROM h_cosmetic_bmr
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
        LIMIT ${input.limit}
      `);
      return (rows as any[]).map((r) => ({
        id: Number(r.id),
        bmrCode: String(r.bmr_code),
        productId: Number(r.product_id),
        status: String(r.status),
        plannedQuantityKg: r.planned_quantity_kg ? Number(r.planned_quantity_kg) : null,
        createdAt: r.created_at,
      }));
    }),

  recentReleases: tenantRequiredProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(5) }))
    .query(async ({ ctx, input }) => {
      const tenantId = Number(ctx.tenantId);
      const db = await getDb();
      if (!db) return [];
      const rows: any = await db.execute(sql`
        SELECT id, release_code, bmr_id, product_id, status,
               release_quantity, release_unit, created_at
        FROM h_cosmetic_release
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
        LIMIT ${input.limit}
      `);
      return (rows as any[]).map((r) => ({
        id: Number(r.id),
        releaseCode: String(r.release_code),
        bmrId: Number(r.bmr_id),
        productId: Number(r.product_id),
        status: String(r.status),
        releaseQuantity: r.release_quantity ? Number(r.release_quantity) : 0,
        releaseUnit: String(r.release_unit ?? "kg"),
        createdAt: r.created_at,
      }));
    }),

  recentIpcFails: tenantRequiredProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(5) }))
    .query(async ({ ctx, input }) => {
      const tenantId = Number(ctx.tenantId);
      const db = await getDb();
      if (!db) return [];
      const rows: any = await db.execute(sql`
        SELECT id, bmr_id, measurement_type, measurement_label,
               measured_value, expected_min, expected_max, unit, created_at
        FROM h_cosmetic_bmr_ipc
        WHERE tenant_id = ${tenantId}
          AND pass_fail = 'fail'
        ORDER BY created_at DESC
        LIMIT ${input.limit}
      `);
      return (rows as any[]).map((r) => ({
        id: Number(r.id),
        bmrId: Number(r.bmr_id),
        measurementType: String(r.measurement_type),
        measurementLabel: r.measurement_label ?? null,
        measuredValue: r.measured_value !== null ? Number(r.measured_value) : null,
        expectedMin: r.expected_min !== null ? Number(r.expected_min) : null,
        expectedMax: r.expected_max !== null ? Number(r.expected_max) : null,
        unit: r.unit ?? null,
        createdAt: r.created_at,
      }));
    }),
});
