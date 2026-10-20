/**
 * 투입 줄 출고 확인 — 애매한 줄·보류 줄을 생산 건 화면에서 사람이 푼다 (2026-10-19, #608 검토 P1)
 *
 *   existing  — 이 줄의 출고는 이미 있는 '줄 번호 없는 옛 출고'(tx) 다. 옛 출고·줄 원본은 고치지 않고 결정만 남긴다.
 *               같은 생산 건·같은 원료(정본 매핑)·같은 단위·수량이 같아야 한다 (숫자만 같다고 인정하지 않음 — 단위·원료도).
 *               옛 출고 하나는 한 줄에만 (UNIQUE).
 *   issue_new — 이 줄은 옛 출고와 무관하다. 보류를 풀고 출고는 issueLineNow 가 공통 출고 엔진으로 바로 한다.
 * 줄 하나에 결정 하나 (줄 잠금). 추가만 — 고치거나 지우지 않는다. 결정은 변경 이력(audit_logs)에도 남긴다.
 * 무효 처리된 생산 건·다른 회사 줄은 거부.
 *
 * issueLineNow (2026-10-20, #610 시범 전 재확인) — 실제 투입을 확인한 줄을 지금 출고.
 *   단순 미출고 줄(옛 출고 후보 없음)은 판정할 것이 없다 — 사람은 '실제로 넣었다' 만 확인하고, 결정(issue_new)은 그 확인 기록으로 한 번 남는다.
 *   애매한 줄은 옛 출고와의 대응을 먼저 정해야 한다 (이 함수는 거부). 이미 'issue_new' 로 정한 줄은 판정 없이 출고만 다시 시도.
 *   출고는 공통 엔진(autoIssueMaterialsDispatch, 이 줄만) — 배치 잠금·줄 잠금 재확인·FEFO LOT·단위 검사·업무일자 그대로.
 *   원료 연결이 FK(정본 매핑)로 확인되지 않으면(이름 폴백) 출고하지 않는다.
 */
import { getRawConnection } from "../../db/connection";
import { classifyBatchLines, isRepresented } from "./issuedBatchLines";
import { assertBatchNotVoided } from "./batchVoidGuard";
import { insertAuditWith } from "./designFactorySave";
import { autoIssueMaterialsDispatch } from "./autoMaterialIssueDispatcher";
import { inventoryMaterialIdOfStockLine } from "../identity/itemIdentityService";

const EPS = 0.0005;

export async function resolveLineIssue(input: {
  tenantId: number;
  batchInputId: number;
  action: "existing" | "issue_new";
  txIds?: number[];
  note?: string | null;
  userId: number;
}, pool?: any): Promise<{ batchId: number; state: string }> {
  const p = pool ?? (await getRawConnection());
  const c = await p.getConnection();
  try {
    await c.beginTransaction();
    try {
      const [[line]]: any = await c.execute(
        `SELECT id, batch_id, material_id, unit, actual_quantity, planned_quantity, inventory_deducted FROM h_batch_inputs WHERE id = ? AND tenant_id = ? FOR UPDATE`,
        [input.batchInputId, input.tenantId],
      );
      if (!line) throw new Error("이 회사의 투입 줄이 아닙니다.");
      const batchId = Number(line.batch_id);
      await assertBatchNotVoided(c, batchId, input.tenantId);
      const [prev]: any = await c.execute(`SELECT id FROM h_batch_line_issue_decisions WHERE tenant_id = ? AND batch_input_id = ? LIMIT 1`, [input.tenantId, input.batchInputId]);
      if ((prev as any[]).length) throw new Error("이 줄은 이미 확인되었습니다.");
      const lines = await classifyBatchLines(batchId, input.tenantId, c);
      const info = lines.get(Number(line.id))!;
      if (isRepresented(info.state)) throw new Error("이 줄은 이미 출고로 확인됩니다 — 바꿀 것이 없습니다.");

      if (input.action === "existing") {
        const ids = Array.from(new Set((input.txIds ?? []).map(Number)));
        if (!ids.length) throw new Error("인정할 옛 출고를 고르세요.");
        const picked = info.candidates.filter((t) => ids.includes(t.txId));
        if (picked.length !== ids.length) throw new Error("이 줄의 후보가 아닌 출고가 있습니다 (같은 생산 건·같은 원료의 줄 번호 없는 출고만).");
        if (picked.some((t) => t.unit !== info.unit)) throw new Error(`단위가 다릅니다 (줄 ${info.unit}) — 숫자만 같다고 같은 출고로 인정하지 않습니다.`);
        const sum = picked.reduce((s, t) => s + t.quantity, 0);
        if (Math.abs(sum - info.quantity) > EPS) {
          throw new Error(`수량이 다릅니다 (줄 ${info.quantity}${info.unit} / 고른 출고 ${Math.round(sum * 1000) / 1000}${info.unit}) — 일부만 출고된 줄은 맞는 출고만 인정하고 나머지 줄은 '새로 출고' 로.`);
        }
        for (const t of picked) {
          await c.execute(
            `INSERT INTO h_batch_line_issue_decisions (tenant_id, batch_input_id, decision, tx_id, decided_by, decided_at, note) VALUES (?, ?, 'existing', ?, ?, NOW(), ?)`,
            [input.tenantId, input.batchInputId, t.txId, input.userId, input.note ?? null],
          );
        }
      } else {
        if (info.inventoryDeducted) throw new Error("이미 차감된 줄입니다.");
        await c.execute(
          `INSERT INTO h_batch_line_issue_decisions (tenant_id, batch_input_id, decision, tx_id, decided_by, decided_at, note) VALUES (?, ?, 'issue_new', NULL, ?, NOW(), ?)`,
          [input.tenantId, input.batchInputId, input.userId, input.note ?? null],
        );
      }
      // 보류 해제 — 기존 출고 인정이면 출고 완료, 새로 출고면 다음 자동 출고가 이 줄을 출고
      await c.execute(`UPDATE h_batch_inputs SET issue_hold = 0 WHERE id = ? AND tenant_id = ?`, [input.batchInputId, input.tenantId]);
      await insertAuditWith(c, {
        tenantId: input.tenantId, action: "batch_input.issue_decision", entityType: "batch_input", entityId: input.batchInputId, userId: input.userId,
        changes: { batchId, action: input.action, txIds: input.txIds ?? [], before: { state: info.state, issueHold: info.issueHold }, note: input.note ?? null },
        description: input.action === "existing" ? `투입 줄 #${input.batchInputId}: 옛 출고 #${(input.txIds ?? []).join(", #")} 를 이 줄의 출고로 인정` : `투입 줄 #${input.batchInputId}: 옛 출고와 무관 — 새로 출고`,
      });
      const after = (await classifyBatchLines(batchId, input.tenantId, c)).get(Number(line.id))!;
      await c.commit();
      return { batchId, state: after.state };
    } catch (e) {
      try { await c.rollback(); } catch { /* 원래 오류를 알린다 */ }
      throw e;
    }
  } finally {
    c.release();
  }
}

export async function issueLineNow(input: {
  tenantId: number;
  batchInputId: number;
  userId: number;
  note?: string | null;
}, pool?: any): Promise<{ batchId: number; issued: boolean; state: string; messages: string[] }> {
  const p = pool ?? (await getRawConnection());
  let batchId = 0;
  // 1. 확인 기록 — 줄 잠금 안에서 상태를 다시 보고, 결정이 없으면 한 번 남긴다 (보류였으면 해제)
  const c = await p.getConnection();
  try {
    await c.beginTransaction();
    try {
      const [[line]]: any = await c.execute(
        `SELECT bi.id, bi.batch_id, bi.material_id, b.plan_only FROM h_batch_inputs bi JOIN h_batches b ON b.id = bi.batch_id AND b.tenant_id = bi.tenant_id
          WHERE bi.id = ? AND bi.tenant_id = ? FOR UPDATE`,
        [input.batchInputId, input.tenantId],
      );
      if (!line) throw new Error("이 회사의 투입 줄이 아닙니다.");
      batchId = Number(line.batch_id);
      await assertBatchNotVoided(c, batchId, input.tenantId);
      if (Number(line.plan_only ?? 0) === 1) throw new Error("아직 시작하지 않은 예정 생산 건입니다 — 그날 첫 확인 때 출고됩니다.");
      const info = (await classifyBatchLines(batchId, input.tenantId, c)).get(Number(line.id))!;
      if (isRepresented(info.state) || info.inventoryDeducted) {
        await c.rollback();
        return { batchId, issued: true, state: info.state, messages: ["이미 출고된 줄입니다."] };
      }
      if (info.state === "ambiguous" && info.decision == null) throw new Error("줄 번호 없는 옛 출고와 대응이 애매한 줄입니다 — 먼저 '기존 출고로 인정' 또는 '옛 출고와 무관' 을 고르세요.");
      if (info.decision === "existing") throw new Error("이 줄은 옛 출고로 인정된 줄입니다.");
      if (!(info.quantity > 0)) throw new Error("출고할 수량이 없습니다.");
      // 투입 줄 번호 = 재고 원료 번호 칸 (번호 체계 2c). 이전엔 같은 숫자가 다른 원료의 품목 번호이면 '신뢰 안 함' 으로 정상 줄을 막았다.
      const mapped = await inventoryMaterialIdOfStockLine(Number(line.material_id), input.tenantId, c);
      if (!mapped.ok) throw new Error(`${mapped.message} — 연결을 확인한 뒤 출고합니다 (번호로 추측해 출고하지 않음).`);
      if (info.decision == null) {
        await c.execute(
          `INSERT INTO h_batch_line_issue_decisions (tenant_id, batch_input_id, decision, tx_id, decided_by, decided_at, note) VALUES (?, ?, 'issue_new', NULL, ?, NOW(), ?)`,
          [input.tenantId, input.batchInputId, input.userId, input.note ?? "실제 투입 확인 — 출고"],
        );
        await insertAuditWith(c, {
          tenantId: input.tenantId, action: "batch_input.issue_decision", entityType: "batch_input", entityId: input.batchInputId, userId: input.userId,
          changes: { batchId, action: "issue_confirm", before: { state: info.state, issueHold: info.issueHold }, note: input.note ?? null },
          description: `투입 줄 #${input.batchInputId}: 실제 투입 확인 — 출고`,
        });
      }
      if (info.issueHold) await c.execute(`UPDATE h_batch_inputs SET issue_hold = 0 WHERE id = ? AND tenant_id = ?`, [input.batchInputId, input.tenantId]);
      await c.commit();
    } catch (e) {
      try { await c.rollback(); } catch { /* 원래 오류를 알린다 */ }
      throw e;
    }
  } finally {
    c.release();
  }
  // 2. 출고 — 공통 엔진, 이 줄만. 실패하면 확인 기록은 남고 줄은 '출고 대기' — 다시 누르면 출고만 다시 (판정 반복 없음)
  const r = await autoIssueMaterialsDispatch(batchId, input.userId, input.tenantId, { onlyLineIds: [input.batchInputId] });
  const after = (await classifyBatchLines(batchId, input.tenantId, p)).get(input.batchInputId);
  const issued = !!after && (after.inventoryDeducted || isRepresented(after.state));
  return { batchId, issued, state: after?.state ?? "none", messages: issued ? [] : [...(r.errors ?? []), ...(r.warnings ?? [])].slice(0, 3) };
}
