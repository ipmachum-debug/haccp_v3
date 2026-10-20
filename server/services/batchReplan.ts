/**
 * 예정 생산 건 수량·날짜·시작시각 바꾸기 = 재계획 (2026-10-20, 생산계획 생애주기 검토 3)
 *
 * 손 안 댄 계획만 (batchHistoryReasons 가 비어 있어야): 원료 출고·확인·저장·결재·LOT 흔적이 있으면 거부 — 실행된 생산 건은 이력 보존 경로로.
 * 한 트랜잭션 (생산 건 행·기록 행 잠금 뒤 다시 검사):
 *   머리글(수량·날짜·시작) 변경 + 이 생산 건의 미확인 파생 계획 정리(원료 투입·원물 기준·CCP 공정·회차·기록지·행·이 생산 건의 금속검출 통과 행·일정 표)
 *   + 원료 투입 계획을 같은 함수(insertPlannedBatchInputs)로 다시 + 준비 미완(setup_pending=1).
 * 커밋 뒤: 생성과 같은 필수 준비(completeBatchSetup) → 확인(verifyBatchSetup) → 준비 완료. 빠진 것이 있으면 준비 미완으로 남아
 *   현장 확인·승인이 막고, 같은 재계획을 다시 보내면 이어서 준비한다.
 * 날짜를 옮기면 원래 날짜의 금속검출 하루 기록지에서 이 생산 건 몫만 정리한다 (다른 생산 건 행·사람이 손댄 행·기록지는 그대로).
 * SKU 구성(production_sku_output)은 사람이 정한 계획이라 그대로 둔다.
 */
import { getRawConnection } from "../db";
import { todayKST } from "../utils/timezone";

export class ReplanRejectedError extends Error {
  constructor(message: string) { super(message); this.name = "ReplanRejectedError"; }
}

export async function replanBatch(input: {
  tenantId: number; userId: number; batchId: number;
  plannedQuantityKg?: number | null; workDate?: string | null; startTime?: string | null;
}): Promise<{ batchId: number; setupMissing: string[]; changed: Record<string, [unknown, unknown]> }> {
  const pool: any = await getRawConnection();
  const { batchHistoryReasons } = await import("../lib/production/batchTouchGuard");
  const c = await pool.getConnection();
  let before: any;
  let after: { qty: number; date: string; time: string };
  const changed: Record<string, [unknown, unknown]> = {};
  try {
    await c.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await c.beginTransaction();
    try {
      const [[b]]: any = await c.execute(
        `SELECT id, product_id, site_id, mode, batch_code, planned_quantity, DATE_FORMAT(planned_date, '%Y-%m-%d') AS wd,
                DATE_FORMAT(start_time, '%H:%i') AS st, plan_only, status
           FROM h_batches WHERE id = ? AND tenant_id = ? FOR UPDATE`,
        [input.batchId, input.tenantId],
      );
      if (!b) throw new ReplanRejectedError("생산 건을 찾을 수 없습니다.");
      before = b;
      // 이 생산 건의 기록 행을 잠근 뒤 검사 — 검사와 정리 사이에 현장 확인이 끼어들지 못하게
      await c.execute(
        `SELECT r.id FROM h_ccp_form_rows r JOIN h_ccp_form_records f ON f.id = r.form_record_id AND f.tenant_id = r.tenant_id
          WHERE r.tenant_id = ? AND ((f.batch_id = ? AND f.ccp_type <> 'CCP-4P') OR (f.ccp_type = 'CCP-4P' AND r.batch_id = ?)) FOR UPDATE`,
        [input.tenantId, input.batchId, input.batchId],
      );
      const why = await batchHistoryReasons(c, input.batchId, input.tenantId);
      if (why.length) throw new ReplanRejectedError(`손 안 댄 계획만 수량·날짜를 바꿀 수 있습니다 — ${why.join(", ")}. 실행된 생산 건은 이력 보존 경로(무효·정정)로 처리합니다.`);
      const [nonField]: any = await c.execute(`SELECT COUNT(*) AS n FROM h_ccp_form_records WHERE tenant_id = ? AND batch_id = ? AND ccp_type <> 'CCP-4P' AND COALESCE(field_mode, 0) <> 1`, [input.tenantId, input.batchId]);
      if (Number((nonField as any[])[0]?.n ?? 0) > 0) throw new ReplanRejectedError("예전 방식 기록지로 만든 생산 건은 여기서 재계획하지 않습니다 — 삭제 뒤 다시 만드세요.");

      after = {
        qty: input.plannedQuantityKg != null ? Number(input.plannedQuantityKg) : Number(b.planned_quantity),
        date: input.workDate ?? String(b.wd),
        time: input.startTime ?? String(b.st ?? "09:00"),
      };
      if (!(after.qty > 0)) throw new ReplanRejectedError("계획량은 0보다 커야 합니다.");
      if (after.date < todayKST()) throw new ReplanRejectedError("지난 날짜로 옮길 수 없습니다 — 지난 생산은 그 날짜로 새로 입력하세요.");
      if (after.qty !== Number(b.planned_quantity)) changed.plannedQuantityKg = [Number(b.planned_quantity), after.qty];
      if (after.date !== String(b.wd)) changed.workDate = [String(b.wd), after.date];
      if (after.time !== String(b.st ?? "")) changed.startTime = [b.st ?? null, after.time];
      if (!Object.keys(changed).length) { await c.rollback(); return { batchId: input.batchId, setupMissing: [], changed }; }
      if (changed.workDate) {
        const guard = await import("../lib/production/dayProductionGuard");
        const dup = await guard.existingSameDayRuns(c, input.tenantId, after.date, [Number(b.product_id)], [input.batchId]);
        if (dup.size) throw new ReplanRejectedError(guard.existingRunProblem("같은 제품", dup.get(Number(b.product_id)) ?? []));
      }

      // 이 생산 건의 미확인 파생 계획 정리 (위에서 손 안 댄 것을 확인)
      await c.execute(`DELETE r FROM h_ccp_rows r JOIN h_ccp_instances i ON i.id = r.instance_id AND i.tenant_id = r.tenant_id WHERE i.batch_id = ? AND i.tenant_id = ?`, [input.batchId, input.tenantId]);
      await c.execute(`DELETE FROM h_ccp_instances WHERE batch_id = ? AND tenant_id = ?`, [input.batchId, input.tenantId]);
      await c.execute(`DELETE r FROM h_ccp_form_rows r JOIN h_ccp_form_records f ON f.id = r.form_record_id AND f.tenant_id = r.tenant_id WHERE f.batch_id = ? AND f.tenant_id = ? AND f.ccp_type <> 'CCP-4P'`, [input.batchId, input.tenantId]);
      await c.execute(`DELETE FROM h_ccp_form_records WHERE batch_id = ? AND tenant_id = ? AND ccp_type <> 'CCP-4P'`, [input.batchId, input.tenantId]);
      await c.execute(`DELETE FROM h_ccp_form_rows WHERE tenant_id = ? AND batch_id = ? AND equipment_type = 'passage'`, [input.tenantId, input.batchId]);
      await c.execute(`DELETE FROM h_batch_inputs WHERE batch_id = ? AND tenant_id = ?`, [input.batchId, input.tenantId]);
      await c.execute(`DELETE FROM h_batch_schedules WHERE batch_id = ? AND tenant_id = ?`, [input.batchId, input.tenantId]);
      try { await c.execute(`DELETE FROM h_batch_mass_basis WHERE batch_id = ? AND tenant_id = ?`, [input.batchId, input.tenantId]); }
      catch (e: any) { if (e?.code !== "ER_NO_SUCH_TABLE") throw e; }
      // 금속검출 하루 기록지가 이 생산 건을 기준(batch_id)으로 잡고 있으면 그날의 다른 생산 건으로 옮긴다 (기록지는 그날 공용)
      if (changed.workDate) {
        const [[other]]: any = await c.execute(
          `SELECT id FROM h_batches WHERE tenant_id = ? AND planned_date = ? AND id <> ? AND status <> 'cancelled' AND voided_at IS NULL ORDER BY id LIMIT 1`,
          [input.tenantId, String(b.wd), input.batchId],
        );
        if (other) await c.execute(`UPDATE h_ccp_form_records SET batch_id = ? WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND batch_id = ?`, [other.id, input.tenantId, input.batchId]);
        else {
          const { dropEmptyDailyMetal } = await import("../lib/production/batchTouchGuard");
          await dropEmptyDailyMetal(c, input.tenantId, input.batchId);
        }
      }
      await c.execute(
        `UPDATE h_batches SET planned_quantity = ?, planned_date = ?, start_time = ?, setup_pending = 1, plan_only = 1, updated_at = NOW() WHERE id = ? AND tenant_id = ?`,
        [after.qty, after.date, `${after.date} ${after.time}:00`, input.batchId, input.tenantId],
      );
      const { insertPlannedBatchInputs } = await import("../db/production/batchCRUD");
      await insertPlannedBatchInputs(c, { batchId: input.batchId, tenantId: input.tenantId, productId: Number(b.product_id), plannedQty: after.qty });
      await c.commit();
    } catch (e) {
      try { await c.rollback(); } catch { /* 원래 오류 */ }
      throw e;
    }
  } finally {
    c.release();
  }

  // 커밋 뒤: 생성과 같은 필수 준비 → 확인
  const { completeBatchSetup, verifyBatchSetup } = await import("./batchOrchestrator");
  const { getProductById } = await import("../db");
  const product = await getProductById(Number(before.product_id), input.tenantId);
  const [skuRows]: any = await pool.execute(`SELECT sku_id FROM production_sku_output WHERE batch_id = ? AND tenant_id = ?`, [input.batchId, input.tenantId]);
  await completeBatchSetup({
    tenantId: input.tenantId, siteId: Number(before.site_id), workDate: after.date, startTime: after.time, productId: Number(before.product_id),
    plannedQuantityKg: after.qty, mode: before.mode === "manual" ? "manual" : "auto", userId: input.userId, batchId: input.batchId,
    productName: (product as any)?.productName ?? "",
  });
  const setupMissing = await verifyBatchSetup(input.batchId, input.tenantId, { skuIds: (skuRows as any[]).map((r) => Number(r.sku_id)) });
  if (!setupMissing.length) await pool.execute(`UPDATE h_batches SET setup_pending = 0 WHERE id = ? AND tenant_id = ?`, [input.batchId, input.tenantId]);

  // 원래 날짜의 금속검출 하루 기록지 — 이 생산 건 몫만 정리 (손 안 댄 행만, 다른 생산 건·사람 기록 보존)
  if (changed.workDate) {
    try {
      const [[fr]]: any = await pool.execute(
        `SELECT id, field_mode, detector_equipment_id FROM h_ccp_form_records WHERE tenant_id = ? AND ccp_type = 'CCP-4P' AND work_date = ? ORDER BY id LIMIT 1`,
        [input.tenantId, String(before.wd)],
      );
      if (fr && Number(fr.field_mode ?? 0) === 1) {
        const { syncFieldMetalRows } = await import("../lib/haccp/fieldMetalRows");
        await syncFieldMetalRows(pool, { formRecordId: Number(fr.id), tenantId: input.tenantId, workDate: String(before.wd), detectorId: fr.detector_equipment_id ?? null });
        // 그날 생산 건이 하나도 없고 사람이 손대지 않은 빈 기록지는 정리
        const { dailyMetalTouched } = await import("../lib/production/batchTouchGuard");
        const [[left]]: any = await pool.execute(`SELECT COUNT(*) AS n FROM h_batches WHERE tenant_id = ? AND planned_date = ? AND status <> 'cancelled' AND voided_at IS NULL`, [input.tenantId, String(before.wd)]);
        if (Number(left.n) === 0 && !(await dailyMetalTouched(pool, Number(fr.id), input.tenantId))) {
          await pool.execute(`DELETE FROM h_ccp_form_rows WHERE form_record_id = ? AND tenant_id = ?`, [fr.id, input.tenantId]);
          await pool.execute(`DELETE FROM h_ccp_form_records WHERE id = ? AND tenant_id = ?`, [fr.id, input.tenantId]);
        }
      }
    } catch (e) {
      console.error(`[replanBatch] 원래 날짜 금속검출 기록지 정리 실패 (생산 건 재계획은 유지) batch=${input.batchId}:`, e);
    }
  }
  try {
    const { createAuditLog } = await import("../db");
    await createAuditLog({ action: "batch.replan", entityType: "batch", entityId: input.batchId, userId: input.userId, userEmail: "", userRole: "",
      description: `예정 생산 건 재계획 (${before.batch_code})`, changes: { changed, setupMissing } } as any, input.tenantId);
  } catch { /* 감사 기록 실패는 기존 방식대로 무시 */ }
  return { batchId: input.batchId, setupMissing, changed };
}
