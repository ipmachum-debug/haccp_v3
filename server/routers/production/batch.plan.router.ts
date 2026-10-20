/**
 * 오늘 생산 작업대 — 미리보기 · 오늘 제외 설비 목록 · 오늘 배치 목록 (2026-10-18, PR-B)
 *
 * previewDay 는 배치 생성(bulkCreateForDay → createSingleBatch → ccp-batch)과 같은 계획 함수(planCcpForDay)를 쓴다.
 * 쓰기 없음 — 재고 차감·기록 확정·배치 생성이 일어나지 않는다.
 */
import { router, tenantRequiredProcedure, workerProcedure, adminProcedure } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getRawConnection } from "../../db";
import { nextBatchAction } from "../../lib/production/todayBoard";

const HHMM = /^\d{2}:\d{2}$/;

export const batchPlanRouter = router({
  /** 생성 전 미리보기 — 줄마다 BOM 버전·회차·공정별 설비·예정시각·예정 투입량, 막히는 이유 */
  previewDay: workerProcedure
    .input(z.object({
      workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      dayStartTime: z.string().regex(HHMM).default("09:00"),
      excludedEquipmentIds: z.array(z.number()).max(200).optional(),
      items: z.array(z.object({
        rowKey: z.string().min(1).max(64),
        productId: z.number(),
        /** 하루 총생산량 kg — 또는 batchCount (배치 수 × BOM 1회 기준량) */
        plannedQuantityKg: z.number().positive().optional(),
        batchCount: z.number().int().positive().max(1000).optional(),
        startTime: z.string().regex(HHMM).optional(),
        startTimeOverride: z.string().regex(HHMM).optional(),
        /** 같은 날 같은 제품을 실제로 따로 만드는 생산 건 — 명시할 때만 (F-PROD-01) */
        separateRun: z.boolean().optional(),
      })).min(1).max(50),
    }))
    .mutation(async ({ input, ctx }) => {
      const { planCcpForDay } = await import("../../services/ccp-batch");
      const { validateProductCcpMapping } = await import("../../services/validateProductCcpMapping");
      const conn = await getRawConnection();
      // 배치 수 → kg (BOM 1회 기준량). 계산할 수 없으면 그 줄은 막힌다
      const { resolvePlannedKg } = await import("../../lib/production/planQuantity");
      const qty = await Promise.all(input.items.map((it) => resolvePlannedKg(conn, ctx.tenantId, it)));
      const day = await planCcpForDay({
        tenantId: ctx.tenantId,
        workDate: input.workDate,
        rows: input.items.map((it, i) => ({
          rowKey: it.rowKey, productId: it.productId, plannedKg: qty[i].kg ?? 0,
          startTime: it.startTime ?? input.dayStartTime, startTimeOverride: it.startTimeOverride ?? null,
        })),
        excludedEquipmentIds: input.excludedEquipmentIds,
      });
      const ids = Array.from(new Set(input.items.map((i) => i.productId)));
      const [pRows]: any = await conn.query(
        `SELECT id, product_name FROM h_products_v2 WHERE tenant_id = ? AND id IN (?)`,
        [ctx.tenantId, ids],
      );
      const names = new Map((pRows as any[]).map((r) => [Number(r.id), String(r.product_name)]));

      // 입력량 = 하루 총생산량 — 같은 제품 여러 줄·이미 있는 생산 건은 생성 때 막힌다 (F-PROD-01)
      const guard = await import("../../lib/production/dayProductionGuard");
      const dupLines = guard.duplicateLineProblems(input.items, (id) => names.get(id) ?? `제품 #${id}`);
      const sameDay = await guard.existingSameDayRuns(conn, ctx.tenantId, input.workDate, ids, []);

      const rows = [];
      for (const [i, it] of input.items.entries()) {
        const plan = day.plans[i];
        const meta = day.meta[i];
        const productName = names.get(it.productId) ?? null;
        // 생성 때와 같은 사전 검증 — 막히면 그 줄은 만들어지지 않는다
        const blocking: string[] = [];
        if (!productName) blocking.push("이 회사 제품이 아닙니다.");
        else {
          const v = await validateProductCcpMapping({ productId: it.productId, productName, tenantId: ctx.tenantId });
          if (!v.valid) blocking.push(v.message);
        }
        if (qty[i].error) blocking.push(qty[i].error!);
        if (meta.bom.massBasis === "error") blocking.push(`원물·공정 기준 계산 불가 — ${meta.bom.error}`);
        if (meta.bom.qtyError) blocking.push(`원료 양 계산 불가 — ${meta.bom.qtyError}`);
        blocking.push(...(plan?.blocking ?? []));
        if (dupLines.has(i)) blocking.push(dupLines.get(i)!);
        const already = sameDay.get(it.productId);
        if (already && !it.separateRun) blocking.push(guard.existingRunProblem(productName ?? `제품 #${it.productId}`, already));
        rows.push({
          rowKey: it.rowKey,
          productId: it.productId,
          productName,
          plannedKg: qty[i].kg ?? 0,
          batchCount: qty[i].batchCount,
          bom: { versionId: meta.bom.versionId, versionNo: meta.bom.versionNo, approved: meta.bom.approved, subBatchKg: meta.bom.subBatchKg, massBasis: meta.bom.massBasis },
          roundsCount: plan.roundsCount,
          processes: plan.processes,
          metal: meta.groups.some((g) => g.ccp_type === "CCP-4P"),
          warnings: plan.warnings,
          blocking,
        });
      }

      // 이미 저장된 오늘 배치의 설비 사용 (시간표에 같이 그린다)
      let existing: Array<{ batchId: number; batchCode: string; productName: string | null; processName: string | null; equipmentId: number; equipmentName: string | null; start: string; end: string | null }> = [];
      try {
        const [eRows]: any = await conn.execute(
          `SELECT b.id AS batch_id, b.batch_code, p.product_name, g.name AS process_name, r.equipment_id, r.equipment_name, r.planned_start, r.planned_end
             FROM h_ccp_rows r
             JOIN h_ccp_instances i ON i.id = r.instance_id AND i.tenant_id = r.tenant_id
             JOIN h_batches b ON b.id = i.batch_id AND b.tenant_id = i.tenant_id
             LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
             LEFT JOIN ccp_process_groups g ON g.id = i.process_group_id AND g.tenant_id = i.tenant_id
            WHERE r.tenant_id = ? AND b.planned_date = ? AND b.status <> 'cancelled'
              AND r.equipment_id IS NOT NULL AND r.planned_start IS NOT NULL
            ORDER BY r.planned_start`,
          [ctx.tenantId, input.workDate],
        );
        existing = (eRows as any[]).map((r) => ({
          batchId: Number(r.batch_id), batchCode: String(r.batch_code), productName: r.product_name ?? null, processName: r.process_name ?? null,
          equipmentId: Number(r.equipment_id), equipmentName: r.equipment_name ?? null, start: String(r.planned_start), end: r.planned_end ?? null,
        }));
      } catch (e: any) {
        if (e?.code !== "ER_BAD_FIELD_ERROR") throw e;
      }
      return { workDate: input.workDate, rows, existing };
    }),

  /** 오늘 제외할 수 있는 가열공정 설비 (공정그룹에 배정된 활성 설비) */
  planEquipments: tenantRequiredProcedure.query(async ({ ctx }) => {
    const conn = await getRawConnection();
    const [rows]: any = await conn.execute(
      `SELECT e.id, e.name, GROUP_CONCAT(DISTINCT g.name ORDER BY g.sort_order SEPARATOR ', ') AS processes
         FROM ccp_process_group_equipments ge
         JOIN equipments e ON e.id = ge.equipment_id AND e.tenant_id = ge.tenant_id AND e.status = 'active'
         JOIN ccp_process_groups g ON g.id = ge.process_group_id AND g.tenant_id = ge.tenant_id AND g.status = 'active' AND g.ccp_type <> 'CCP-4P'
        WHERE ge.tenant_id = ?
        GROUP BY e.id, e.name
        ORDER BY MIN(g.sort_order), MIN(ge.sort_order), e.id`,
      [ctx.tenantId],
    );
    return (rows as any[]).map((r) => ({ id: Number(r.id), name: String(r.name), processes: r.processes ? String(r.processes) : "" }));
  }),

  /**
   * 원료 출고 확인이 필요한 줄 — 생산 건 화면 카드 (#608 검토 P1, 2026-10-20 #610 시범 전 재확인)
   *   ambiguous  — 줄 번호 없는 옛 출고와 대응이 애매 → '기존 출고로 인정' / '옛 출고와 무관 — 지금 출고'
   *   unissued   — 출고가 없는 줄(보류 줄 포함, 옛 출고 후보 없음) → 판정할 것 없이 '실제 투입 확인 — 출고' 하나
   *   pending    — '새로 출고' 로 정했지만 아직 출고 안 됨(재고·연결 오류 등) → '다시 출고' (다시 판정하지 않음)
   * 단순 미출고는 시작된 생산 건에서만 — 예정 생산 건(첫 확인 때 출고)·수동 모드 진행 중(생산완료 때 출고)은 정상 대기라 보이지 않는다.
   * 원료 연결(FK 정본 매핑)·LOT 수·남은 양을 함께 보여 준다 (출고 전 확인용, 읽기만).
   */
  lineIssueExceptions: tenantRequiredProcedure
    .input(z.object({ batchId: z.number() }))
    .query(async ({ input, ctx }) => {
      const conn = await getRawConnection();
      const [[b]]: any = await conn.execute(`SELECT id, plan_only, mode, status, voided_at FROM h_batches WHERE id = ? AND tenant_id = ?`, [input.batchId, ctx.tenantId]);
      if (!b || b.voided_at) return [];
      const { classifyBatchLines } = await import("../../lib/production/issuedBatchLines");
      const { lineExceptionKind, issueStarted } = await import("../../lib/production/dayChecks");
      const started = issueStarted(b);
      const m = await classifyBatchLines(input.batchId, ctx.tenantId, conn);
      const kindOf = (i: any) => lineExceptionKind(i, started); // 생산 화면 자동 검사와 같은 판정
      const list = Array.from(m.values()).map((i) => ({ i, kind: kindOf(i) })).filter((x) => x.kind != null);
      if (!list.length) return [];
      const [names]: any = await conn.query(
        `SELECT bi.id, bi.issue_hold_reason, COALESCE(m.material_name, im.item_name) AS name
           FROM h_batch_inputs bi LEFT JOIN h_materials m ON m.id = bi.material_id AND m.tenant_id = bi.tenant_id
           LEFT JOIN item_master im ON im.id = bi.material_id AND im.tenant_id = bi.tenant_id
          WHERE bi.tenant_id = ? AND bi.id IN (?)`,
        [ctx.tenantId, list.map((x) => x.i.lineId)],
      );
      const nm = new Map((names as any[]).map((r) => [Number(r.id), r]));
      const { toInventoryMaterialId } = await import("../../lib/identity/itemIdentityService");
      const out = [];
      for (const { i, kind } of list) {
        // 원료 연결·LOT (읽기만) — 출고하면 먼저 들어온 LOT 부터, 모자라면 회사 음수 정책대로
        let stock: { trusted: boolean; lots: number; available: number } | null = null;
        try {
          const mapped = await toInventoryMaterialId(i.materialId, ctx.tenantId, conn);
          const [[s]]: any = await conn.execute(
            // 남은 양 = 출고가 쓰는 기준과 같게 (fefoLotAllocation: 폐기·보류·만료 상태 제외, 가용량 > 0)
            `SELECT COUNT(*) AS lots,
                    COALESCE(SUM(CASE WHEN (status IS NULL OR status NOT IN ('expired', 'disposed', 'reserved')) AND available_quantity >= 0.001 THEN available_quantity ELSE 0 END), 0) AS avail
               FROM h_inventory_lots WHERE tenant_id = ? AND material_id = ? AND LOWER(COALESCE(unit, 'kg')) = ?`,
            [ctx.tenantId, mapped.id, i.unit],
          );
          stock = { trusted: mapped.trusted, lots: Number(s?.lots ?? 0), available: Math.round(Number(s?.avail ?? 0) * 1000) / 1000 };
        } catch { stock = null; }
        out.push({
          lineId: i.lineId, materialName: nm.get(i.lineId)?.name ?? `원료 #${i.materialId}`, quantity: i.quantity, unit: i.unit,
          kind, state: i.state, held: i.issueHold, reason: nm.get(i.lineId)?.issue_hold_reason ?? null, candidates: i.candidates, stock,
        });
      }
      return out;
    }),

  /** 원료 출고 확인 결정 — 기존 옛 출고로 인정 / 옛 출고와 무관 (관리자, 추가만). 무관이면 이어서 이 줄을 바로 출고 */
  resolveLineIssue: adminProcedure
    .input(z.object({
      batchInputId: z.number(),
      action: z.enum(["existing", "issue_new"]),
      txIds: z.array(z.number()).max(20).optional(),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { resolveLineIssue, issueLineNow } = await import("../../lib/production/lineIssueDecision");
      try {
        const r = await resolveLineIssue({ ...input, tenantId: ctx.tenantId, userId: ctx.user.id });
        if (input.action !== "issue_new") return { ...r, issued: true, messages: [] as string[] };
        const issued = await issueLineNow({ tenantId: ctx.tenantId, batchInputId: input.batchInputId, userId: ctx.user.id });
        return { batchId: r.batchId, state: issued.state, issued: issued.issued, messages: issued.messages };
      } catch (e: any) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: e?.message ?? "확인하지 못했습니다." });
      }
    }),

  /** 실제 투입을 확인한 줄을 지금 출고 — 단순 미출고·출고 대기 줄 (관리자). 공통 출고 엔진, 이 줄만 */
  issueLine: adminProcedure
    .input(z.object({ batchInputId: z.number(), note: z.string().max(500).optional() }))
    .mutation(async ({ input, ctx }) => {
      const { issueLineNow } = await import("../../lib/production/lineIssueDecision");
      try {
        return await issueLineNow({ tenantId: ctx.tenantId, batchInputId: input.batchInputId, userId: ctx.user.id, note: input.note ?? null });
      } catch (e: any) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: e?.message ?? "출고하지 못했습니다." });
      }
    }),

  /**
   * 그날 마감에 남은 결재 — 생산 건(batch) · 그날 CCP 기록지(ccp_form_record, 금속검출 하루 기록지 포함) 의 대기 요청 (2026-10-20 마감 한 자리).
   *   단계는 기존 그대로: pending_writer(작성자 제출) → pending_review·pending_approval·pending(승인). 읽기만 한다.
   *   실제 처리는 기존 approval.submitByWriter / approval.approve (작성자·승인 권한·CCP·일지 관문 그대로).
   */
  dayApprovals: tenantRequiredProcedure
    .input(z.object({ workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ input, ctx }) => {
      const conn = await getRawConnection();
      const [rows]: any = await conn.execute(
        `SELECT ar.id, ar.title, ar.status, ar.reference_type, ar.reference_id, ar.request_type, ar.requested_by,
                CASE WHEN ar.reference_type = 'batch' THEN ar.reference_id ELSE f.batch_id END AS batch_id, f.ccp_type
           FROM h_approval_requests ar
           LEFT JOIN h_ccp_form_records f ON ar.reference_type = 'ccp_form_record' AND f.id = ar.reference_id AND f.tenant_id = ar.tenant_id
           LEFT JOIN h_batches b ON ar.reference_type = 'batch' AND b.id = ar.reference_id AND b.tenant_id = ar.tenant_id
          WHERE ar.tenant_id = ? AND ar.status IN ('pending_writer', 'pending_review', 'pending_approval', 'pending')
            AND ((ar.reference_type = 'batch' AND b.planned_date = ? AND b.voided_at IS NULL)
              OR (ar.reference_type = 'ccp_form_record' AND f.work_date = ? AND f.voided_at IS NULL))
          ORDER BY ar.id`,
        [ctx.tenantId, input.workDate, input.workDate],
      );
      return (rows as any[]).map((r) => ({
        id: Number(r.id), title: String(r.title ?? ""), status: String(r.status), referenceType: String(r.reference_type), requestType: r.request_type ?? null,
        batchId: r.batch_id != null && r.ccp_type !== "CCP-4P" ? Number(r.batch_id) : null, ccpType: r.ccp_type ?? null,
        step: r.status === "pending_writer" ? ("writer" as const) : ("approve" as const), mine: Number(r.requested_by) === Number(ctx.user.id),
      }));
    }),

  /** 오늘 배치 목록 — 서버에 저장된 실제 배치만, 지금 할 일 한 가지 */
  todayBoard: tenantRequiredProcedure
    .input(z.object({ workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ input, ctx }) => {
      const conn = await getRawConnection();
      const [bRows]: any = await conn.execute(
        `SELECT b.id, b.batch_code, b.day_batch_group, b.batch_order, b.status, b.mode, b.product_id,
                b.planned_quantity, b.actual_quantity, p.product_name, b.plan_only, b.superseded_by_batch_id, b.voided_at, b.setup_pending,
                (SELECT ar.status FROM h_approval_requests ar
                  WHERE ar.tenant_id = b.tenant_id AND ar.reference_type = 'batch' AND ar.reference_id = b.id
                  ORDER BY ar.id DESC LIMIT 1) AS approval_status
           FROM h_batches b
           LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
          WHERE b.tenant_id = ? AND b.planned_date = ?
          ORDER BY COALESCE(b.day_batch_group, CONCAT('_', b.id)), b.batch_order, b.id`,
        [ctx.tenantId, input.workDate],
      );
      const batchIds = (bRows as any[]).map((r) => Number(r.id));
      // CCP 기록지(금속검출 일일 통합 제외) — 작성중·미확인·승인 수
      const forms = new Map<number, { total: number; unconfirmed: number; approved: number }>();
      if (batchIds.length) {
        const sql = (withConfirm: boolean) =>
          `SELECT batch_id, status${withConfirm ? ", rows_version, confirmed_at, confirmed_rows_version" : ""}
             FROM h_ccp_form_records WHERE tenant_id = ? AND batch_id IN (?) AND ccp_type <> 'CCP-4P'`;
        let fRows: any;
        let withConfirm = true;
        try {
          [fRows] = await conn.query(sql(true), [ctx.tenantId, batchIds]);
        } catch (e: any) {
          if (e?.code !== "ER_BAD_FIELD_ERROR") throw e;
          withConfirm = false;
          [fRows] = await conn.query(sql(false), [ctx.tenantId, batchIds]);
        }
        const { isConfirmed } = await import("../../lib/haccp/ccpSheetConfirm");
        for (const f of fRows as any[]) {
          const k = Number(f.batch_id);
          const cur = forms.get(k) ?? { total: 0, unconfirmed: 0, approved: 0 };
          cur.total++;
          if (f.status === "approved") cur.approved++;
          else if (withConfirm && !isConfirmed({ confirmedAt: f.confirmed_at, confirmedRowsVersion: f.confirmed_rows_version, rowsVersion: f.rows_version })) cur.unconfirmed++;
          else if (!withConfirm && f.status === "draft") cur.unconfirmed++;
          forms.set(k, cur);
        }
      }
      // 자동 검사 — 준비 미완·현장 확인 남은 행·출고 확인 줄·그날 원료 부족 (생산 화면 줄마다, 읽기만)
      const { loadDayChecks } = await import("../../lib/production/dayChecks");
      const checks = await loadDayChecks(conn, ctx.tenantId, bRows as any[]);
      return (bRows as any[]).map((r) => {
        const f = forms.get(Number(r.id)) ?? { total: 0, unconfirmed: 0, approved: 0 };
        const row = {
          id: Number(r.id), batchCode: String(r.batch_code), dayBatchGroup: r.day_batch_group ?? null, batchOrder: r.batch_order != null ? Number(r.batch_order) : null,
          productId: r.product_id != null ? Number(r.product_id) : null, productName: r.product_name ?? null, status: String(r.status), mode: r.mode ?? null,
          plannedKg: r.planned_quantity != null ? Number(r.planned_quantity) : null, actualKg: r.actual_quantity != null ? Number(r.actual_quantity) : null,
          approvalStatus: r.approval_status ?? null, ccpForms: f, planOnly: Number(r.plan_only ?? 0) === 1,
          voidedSupersededBy: r.voided_at ? (r.superseded_by_batch_id != null ? Number(r.superseded_by_batch_id) : 0) : null,
        };
        const check = checks.get(Number(r.id))!;
        return { ...row, check, next: nextBatchAction({ ...row, check }) };
      });
    }),
});
