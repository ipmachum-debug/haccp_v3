/**
 * CCP 상태 동기화 — 기록지(h_ccp_form_records) → 인스턴스(h_ccp_instances)  (2026-10-12, CCP 단일 흐름 1단계)
 *
 * 정본은 공식 기록지다. 제출·승인·반려는 기록지에서 일어나고, 인스턴스(설비행 사본)의 status 는
 * 대시보드·Today·AI 규칙엔진·알림 스케줄러가 읽는다. 둘이 따로 놀아서 "기록지는 제출됐는데
 * 미완료 CCP 735건" 같은 불일치가 생겼다 (덤프 2026-10-10 실측).
 *
 * 규칙
 *  - 방향은 기록지 → 인스턴스 한쪽뿐. 기록지는 건드리지 않는다.
 *  - 상태는 올라가기만 한다 (draft < submitted < approved). 반려(rejected)는 항상 반영.
 *    배치 완료 시 인스턴스를 approved 로 올리는 기존 경로(completeBatch)를 끌어내리지 않기 위함.
 *  - CCP-4P 는 하루 1장짜리 일일 기록지라 같은 작업일의 4P 인스턴스 전부에 반영.
 *  - 실패해도 호출자를 깨뜨리지 않는다 (로그만). 기록지 쪽 트랜잭션이 정본이다.
 */
import { getRawConnection } from "../connection";

export type CcpStatus = "draft" | "submitted" | "approved" | "rejected";

const RANK: Record<CcpStatus, number> = { draft: 0, submitted: 1, approved: 2, rejected: -1 };

/** 인스턴스 현재 상태에 기록지 상태를 반영해야 하는가 — 반려는 항상, 그 외는 올라갈 때만 */
export function shouldApplyStatus(current: string | null | undefined, incoming: string | null | undefined): boolean {
  if (!incoming || !(incoming in RANK)) return false;
  if (incoming === "rejected") return current !== "rejected";
  const cur = current && current in RANK ? RANK[current as CcpStatus] : 0;
  return RANK[incoming as CcpStatus] > cur;
}

interface FormHead {
  id: number;
  tenant_id: number;
  batch_id: number | null;
  ccp_type: string;
  work_date: string | null;
  status: CcpStatus;
  writer_id: number | null;
  approver_id: number | null;
  submitted_at: Date | null;
  approved_at: Date | null;
}

async function loadFormHead(formRecordId: number, tenantId?: number): Promise<FormHead | null> {
  const conn = await getRawConnection();
  const [rows] = await conn.execute<any[]>(
    `SELECT id, tenant_id, batch_id, ccp_type, DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date,
            status, writer_id, approver_id, submitted_at, approved_at
     FROM h_ccp_form_records
     WHERE id = ?${tenantId ? " AND tenant_id = ?" : ""}
     LIMIT 1`,
    tenantId ? [formRecordId, tenantId] : [formRecordId],
  );
  return ((rows as any[])[0] as FormHead) ?? null;
}

/**
 * 기록지 1장의 상태를 같은 배치·CCP 유형의 인스턴스에 반영. 반영한 인스턴스 수를 돌려준다.
 */
export async function syncCcpInstanceStatusFromForm(formRecordId: number, tenantId?: number): Promise<number> {
  try {
    const form = await loadFormHead(formRecordId, tenantId);
    if (!form) return 0;
    const conn = await getRawConnection();

    const is4P = form.ccp_type === "CCP-4P";
    const [instances] = await conn.execute<any[]>(
      is4P && form.work_date
        ? `SELECT id, status FROM h_ccp_instances
           WHERE tenant_id = ? AND ccp_type = ? AND (batch_id = ? OR work_date = ?)`
        : `SELECT id, status FROM h_ccp_instances
           WHERE tenant_id = ? AND ccp_type = ? AND batch_id = ?`,
      is4P && form.work_date
        ? [form.tenant_id, form.ccp_type, form.batch_id ?? 0, form.work_date]
        : [form.tenant_id, form.ccp_type, form.batch_id ?? 0],
    );

    let applied = 0;
    for (const inst of instances as any[]) {
      if (!shouldApplyStatus(inst.status, form.status)) continue;
      const sets: string[] = ["status = ?"];
      const vals: any[] = [form.status];
      if (form.status === "submitted" || form.status === "approved") {
        sets.push("submitted_at = COALESCE(submitted_at, ?)");
        vals.push(form.submitted_at ?? new Date());
        if (form.writer_id) { sets.push("submitted_by = COALESCE(submitted_by, ?)"); vals.push(form.writer_id); }
      }
      if (form.status === "approved" || form.status === "rejected") {
        sets.push("approved_at = ?");
        vals.push(form.approved_at ?? new Date());
        if (form.approver_id) { sets.push("approved_by = ?"); vals.push(form.approver_id); }
      }
      vals.push(inst.id, form.tenant_id);
      await conn.execute(`UPDATE h_ccp_instances SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`, vals);
      applied++;
    }
    return applied;
  } catch (err) {
    console.error(`[ccpStatusSync] form #${formRecordId} → instance 반영 실패 (무시):`, err);
    return 0;
  }
}

/** 배치에 딸린 기록지 전부를 인스턴스에 반영 (배치 생성 직후 일괄 submitted 전환 뒤에 호출) */
export async function syncCcpInstanceStatusForBatch(batchId: number, tenantId: number): Promise<number> {
  try {
    const conn = await getRawConnection();
    const [forms] = await conn.execute<any[]>(
      `SELECT id FROM h_ccp_form_records WHERE batch_id = ? AND tenant_id = ?`,
      [batchId, tenantId],
    );
    let total = 0;
    for (const f of forms as any[]) total += await syncCcpInstanceStatusFromForm(f.id, tenantId);
    return total;
  } catch (err) {
    console.error(`[ccpStatusSync] batch #${batchId} 반영 실패 (무시):`, err);
    return 0;
  }
}

/**
 * 승인관리 결재 결과를 기록지에 기록하고 인스턴스에 반영.
 * approveRequest / rejectRequest 가 reference_type = 'ccp_form_record' 일 때 호출한다.
 * (2026-04-15 이후 이 고리가 없어서 승인 115건이 기록지에 반영되지 않았다.)
 */
export async function applyCcpFormDecision(params: {
  formRecordId: number;
  decision: "approved" | "rejected";
  userId: number;
  reason?: string;
  tenantId?: number;
}): Promise<{ formUpdated: boolean; instancesUpdated: number }> {
  try {
    const conn = await getRawConnection();
    const tenantClause = params.tenantId ? " AND tenant_id = ?" : "";
    const tenantArg = params.tenantId ? [params.tenantId] : [];
    const [res] = params.decision === "approved"
      ? await conn.execute(
          `UPDATE h_ccp_form_records
           SET status = 'approved', approver_id = ?, approved_at = NOW(), rejected_reason = NULL
           WHERE id = ? AND status <> 'approved'${tenantClause}`,
          [params.userId, params.formRecordId, ...tenantArg],
        )
      : await conn.execute(
          `UPDATE h_ccp_form_records
           SET status = 'rejected', approver_id = ?, approved_at = NOW(), rejected_reason = ?
           WHERE id = ?${tenantClause}`,
          [params.userId, params.reason ?? null, params.formRecordId, ...tenantArg],
        );
    const formUpdated = ((res as any)?.affectedRows ?? 0) > 0;
    const instancesUpdated = await syncCcpInstanceStatusFromForm(params.formRecordId, params.tenantId);
    return { formUpdated, instancesUpdated };
  } catch (err) {
    console.error(`[ccpStatusSync] 결재 반영 실패 form #${params.formRecordId} (무시):`, err);
    return { formUpdated: false, instancesUpdated: 0 };
  }
}
