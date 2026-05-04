/**
 * F-3 운영 현황 대시보드 라우터 (CP-3-i)
 *
 * ============================================================================
 * 목적:
 *   특허 [0016] F-3 IoT 폐쇄 루프의 운영 활성화 상태와 지난 24시간 작동
 *   현황을 한 화면에 집계. 운영자가 점진 활성화 단계를 시각적으로 확인하고
 *   각 단계가 실제로 작동하는지 파악.
 *
 * 활용:
 *   - 영업 데모: "지금 켜진 모듈 / 지난 하루 자동 처리량" 한 번에 시연
 *   - 운영 모니터링: 활성 단계 별 동작 빈도 추이
 *   - 트러블슈팅: env flag 활성인데 카운트 0 인 stage = 트리거 미점화
 *
 * 데이터 소스:
 *   - env: ENABLE_CCP_EVAL / LOT_HOLD / AUTO_JOURNAL / CAR / IOT_BRIDGE
 *   - ccp_monitoring_records, h_notifications,
 *     h_corrective_action_requests, expense_journal_entries
 *
 * 모든 카운트는 같은 tenant 한정 (cross-tenant 격리).
 *
 * 트리거: PR #131~#140 (CP-3 시리즈 전체) 가 만든 데이터의 가시화 마무리.
 * ============================================================================
 */

import { z } from "zod";
import { sql } from "drizzle-orm";
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { getDb } from "../../db";
import {
  isCcpEvalEnabled,
  isCcpLotHoldEnabled,
} from "../industry/food/ccp.evaluatorTrigger";
import { isCcpAutoJournalEnabled } from "../industry/food/ccp.lossJournal";
import { isCcpCarEnabled } from "../industry/food/ccp.correctiveAction";

/**
 * IoT 브리지 env flag 인라인 체크.
 *
 * `server/services/iot/iotCcpBridge.ts` 의 `isIotCcpBridgeEnabled` 와 동일한
 * 로직 — PR #140 머지 후 import 로 통합 가능. 그 전에도 동작하도록 인라인.
 */
function isIotCcpBridgeEnabledLocal(tenantId: number): boolean {
  const tenantsRaw = process.env.ENABLE_CCP_IOT_BRIDGE_TENANTS?.trim();
  if (tenantsRaw) {
    const enabled = tenantsRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));
    if (enabled.length > 0) {
      return enabled.includes(Number(tenantId));
    }
  }
  const flag = process.env.ENABLE_CCP_IOT_BRIDGE?.toLowerCase().trim();
  return flag === "true" || flag === "1" || flag === "yes";
}

const HOURS_24 = `INTERVAL 24 HOUR`;
const HOURS_24_RAW = sql.raw(HOURS_24);

export const f3DashboardRouter = router({
  /**
   * F-3 폐쇄 루프 5단계 활성화 상태 + 24h 작동 카운트.
   *
   * 반환:
   *   - flags: 5개 env flag 활성 여부 (boolean)
   *   - counts24h: 각 단계별 24h 작동 카운트
   *   - lossSum24h: 24h 자동 손실분개 총액 (원)
   */
  summary: tenantRequiredProcedure.query(async ({ ctx }) => {
    const tenantId = Number(ctx.tenantId);
    const db = await getDb();

    // 1. env flags (5단계)
    const flags = {
      eval: isCcpEvalEnabled(tenantId),
      lotHold: isCcpLotHoldEnabled(tenantId),
      autoJournal: isCcpAutoJournalEnabled(tenantId),
      car: isCcpCarEnabled(tenantId),
      iotBridge: isIotCcpBridgeEnabledLocal(tenantId),
    };

    // DB 미연결 시 카운트 0 폴백
    if (!db) {
      return {
        flags,
        counts24h: {
          ccpRecords: 0,
          deviations: 0,
          lotHolds: 0,
          lossJournals: 0,
          cars: 0,
        },
        lossSum24h: 0,
      };
    }

    // 2. 24h 카운트 (병렬 실행)
    const [
      [ccpRecordsRow],
      [deviationsRow],
      [lotHoldsRow],
      [lossJournalsRow],
      [carsRow],
    ] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM ccp_monitoring_records
        WHERE tenant_id = ${tenantId}
          AND record_date >= DATE_SUB(NOW(), ${HOURS_24_RAW})
      `).then((r: any) => r as any[]),
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM h_notifications
        WHERE tenant_id = ${tenantId}
          AND notification_type = 'ccp_deviation'
          AND created_at >= DATE_SUB(NOW(), ${HOURS_24_RAW})
      `).then((r: any) => r as any[]),
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM h_notifications
        WHERE tenant_id = ${tenantId}
          AND notification_type = 'ccp_lot_hold'
          AND created_at >= DATE_SUB(NOW(), ${HOURS_24_RAW})
      `).then((r: any) => r as any[]),
      db.execute(sql`
        SELECT COUNT(*) AS cnt, COALESCE(SUM(total_debit), 0) AS total_loss
        FROM expense_journal_entries
        WHERE tenant_id = ${tenantId}
          AND description LIKE '%CCP 자동손실%'
          AND entry_date >= DATE_SUB(CURDATE(), ${HOURS_24_RAW})
      `).then((r: any) => r as any[]),
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM h_corrective_action_requests
        WHERE tenant_id = ${tenantId}
          AND source_type = 'ccp_deviation'
          AND created_at >= DATE_SUB(NOW(), ${HOURS_24_RAW})
      `).then((r: any) => r as any[]),
    ]);

    const counts24h = {
      ccpRecords: Number((ccpRecordsRow as any)?.cnt ?? 0),
      deviations: Number((deviationsRow as any)?.cnt ?? 0),
      lotHolds: Number((lotHoldsRow as any)?.cnt ?? 0),
      lossJournals: Number((lossJournalsRow as any)?.cnt ?? 0),
      cars: Number((carsRow as any)?.cnt ?? 0),
    };

    const lossSum24h = Number((lossJournalsRow as any)?.total_loss ?? 0);

    return { flags, counts24h, lossSum24h };
  }),

  /** 최근 deviation 알림 N건 (기본 5) */
  recentDeviations: tenantRequiredProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(5) }))
    .query(async ({ ctx, input }) => {
      const tenantId = Number(ctx.tenantId);
      const db = await getDb();
      if (!db) return [];

      // ★ db.execute(sql) 는 [rows, fields] 튜플 반환 — [0] 으로 rows 추출 필수
      const result: any = await db.execute(sql`
        SELECT id, title, message, priority, reference_id, created_at
        FROM h_notifications
        WHERE tenant_id = ${tenantId}
          AND notification_type = 'ccp_deviation'
        ORDER BY created_at DESC
        LIMIT ${input.limit}
      `);
      const rows = ((result as any)?.[0] ?? []) as any[];
      return rows.map((r) => ({
        id: Number(r.id),
        title: String(r.title),
        message: String(r.message ?? ""),
        priority: String(r.priority ?? "medium"),
        ccpRecordId: r.reference_id ? Number(r.reference_id) : null,
        createdAt: r.created_at,
      }));
    }),

  /** 최근 자동 시정조치(CAR) N건 (기본 5) */
  recentCars: tenantRequiredProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(5) }))
    .query(async ({ ctx, input }) => {
      const tenantId = Number(ctx.tenantId);
      const db = await getDb();
      if (!db) return [];

      // ★ db.execute(sql) 는 [rows, fields] 튜플 반환 — [0] 으로 rows 추출 필수
      const result: any = await db.execute(sql`
        SELECT id, request_number, batch_id, status, priority, occurred_at, created_at
        FROM h_corrective_action_requests
        WHERE tenant_id = ${tenantId}
          AND source_type = 'ccp_deviation'
        ORDER BY created_at DESC
        LIMIT ${input.limit}
      `);
      const rows = ((result as any)?.[0] ?? []) as any[];
      return rows.map((r) => ({
        id: Number(r.id),
        requestNumber: String(r.request_number),
        batchId: r.batch_id ? Number(r.batch_id) : null,
        status: String(r.status ?? "open"),
        priority: String(r.priority ?? "medium"),
        occurredAt: r.occurred_at,
        createdAt: r.created_at,
      }));
    }),
});
