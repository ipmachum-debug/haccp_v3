/**
 * 발주 수량 변경 — 요청 → 승인 → 추가 입고 (2026-10-17, CEO 결정 3)
 *
 * 초과 입고는 자동 허용 오차 없이 차단한다 (입고 확정이 발주 잔량을 넘으면 거부). 실제로 더 들어왔다면
 * 발주 수량 변경을 요청하고 승인받은 뒤 추가로 입고한다. 원래 발주 수량과 변경 이력은 이 표에 남는다.
 *   - 요청: 승인·일부 입고·입고 완료 발주의 줄만 (작성 중 발주는 직접 수정, 취소된 발주는 불가). 새 수량 ≥ 이미 입고된 수량.
 *     줄당 대기 요청은 하나 (DB UNIQUE).
 *   - 승인: 발주 줄을 잠그고 요청 당시 수량이 지금 수량과 같은지 다시 본다 (그사이 바뀌었으면 거부) → 줄 수량·금액,
 *     발주 합계, 발주 상태(입고 완료 → 일부 입고 등) 갱신. 요청자와 승인자 기록.
 *   - 반려: 사유와 함께 이력만.
 */
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const EPS = 0.0005;

export async function requestPoLineQtyChange(conn: any, p: { tenantId: number; userId: number; poLineId: number; newQty: number; reason: string }) {
  const reason = String(p.reason ?? "").trim();
  if (!reason) throw new Error("변경 사유가 필요합니다.");
  if (!(p.newQty > 0)) throw new Error("새 발주 수량은 0 보다 커야 합니다.");
  const [rows]: any = await conn.execute(
    `SELECT l.id, l.po_id, l.ordered_qty, l.received_qty, p.status
       FROM purchase_order_lines l JOIN purchase_orders p ON p.id = l.po_id AND p.tenant_id = l.tenant_id
      WHERE l.id = ? AND l.tenant_id = ? LIMIT 1 FOR UPDATE`,
    [p.poLineId, p.tenantId],
  );
  const line = (rows as any[])[0];
  if (!line) throw new Error("발주 줄을 찾을 수 없습니다.");
  if (line.status === "draft") throw new Error("작성 중 발주서는 직접 수정하세요.");
  if (!["approved", "partial_received", "received"].includes(line.status)) throw new Error(`수량을 바꿀 수 없는 발주서 상태입니다 (${line.status}).`);
  if (Math.abs(Number(line.ordered_qty) - p.newQty) < EPS) throw new Error("지금 발주 수량과 같습니다.");
  if (p.newQty + EPS < Number(line.received_qty)) throw new Error(`이미 입고된 수량(${Number(line.received_qty)}) 보다 작게 바꿀 수 없습니다.`);
  try {
    const [r]: any = await conn.execute(
      `INSERT INTO purchase_order_line_changes (tenant_id, po_id, po_line_id, old_qty, new_qty, reason, requested_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [p.tenantId, line.po_id, line.id, Number(line.ordered_qty), round3(p.newQty), reason.slice(0, 500), p.userId],
    );
    return { changeId: Number(r.insertId) };
  } catch (e: any) {
    if (e?.code === "ER_DUP_ENTRY" || /Duplicate entry/.test(String(e?.message))) throw new Error("이 발주 줄에 승인 대기 중인 변경 요청이 이미 있습니다.");
    throw e;
  }
}

export async function decidePoLineQtyChange(conn: any, p: { tenantId: number; userId: number; changeId: number; approve: boolean; note?: string | null }) {
  const [cr]: any = await conn.execute(
    `SELECT * FROM purchase_order_line_changes WHERE id = ? AND tenant_id = ? LIMIT 1 FOR UPDATE`, [p.changeId, p.tenantId],
  );
  const ch = (cr as any[])[0];
  if (!ch) throw new Error("변경 요청을 찾을 수 없습니다.");
  if (ch.status !== "pending") throw new Error("이미 처리된 변경 요청입니다.");
  if (!p.approve) {
    await conn.execute(
      `UPDATE purchase_order_line_changes SET status = 'rejected', decided_by = ?, decided_at = NOW(), decision_note = ? WHERE id = ? AND tenant_id = ?`,
      [p.userId, p.note ?? null, p.changeId, p.tenantId],
    );
    return { status: "rejected" as const };
  }
  // 잠금 순서: 발주 헤더 → 발주 줄 (입고 확정과 같은 순서)
  const [ph]: any = await conn.execute(`SELECT id, status FROM purchase_orders WHERE id = ? AND tenant_id = ? LIMIT 1 FOR UPDATE`, [ch.po_id, p.tenantId]);
  const po = (ph as any[])[0];
  if (!po || !["approved", "partial_received", "received"].includes(po.status)) throw new Error(`수량을 바꿀 수 없는 발주서 상태입니다 (${po?.status ?? "없음"}).`);
  const [lr]: any = await conn.execute(
    `SELECT id, ordered_qty, received_qty, unit_price, amount, tax_amount FROM purchase_order_lines WHERE id = ? AND tenant_id = ? LIMIT 1 FOR UPDATE`,
    [ch.po_line_id, p.tenantId],
  );
  const line = (lr as any[])[0];
  if (!line) throw new Error("발주 줄을 찾을 수 없습니다.");
  if (Math.abs(Number(line.ordered_qty) - Number(ch.old_qty)) > EPS) throw new Error("요청 뒤 발주 수량이 바뀌었습니다 — 다시 요청하세요.");
  if (Number(ch.new_qty) + EPS < Number(line.received_qty)) throw new Error(`이미 입고된 수량(${Number(line.received_qty)}) 보다 작게 바꿀 수 없습니다.`);
  const newQty = Number(ch.new_qty);
  const amount = Math.round(newQty * Number(line.unit_price) * 100) / 100;
  const taxRate = Number(line.amount) > 0 ? Number(line.tax_amount ?? 0) / Number(line.amount) : 0.1;
  const tax = Math.round(amount * taxRate);
  await conn.execute(
    `UPDATE purchase_order_lines SET ordered_qty = ?, amount = ?, tax_amount = ? WHERE id = ? AND tenant_id = ?`,
    [newQty, amount, tax, line.id, p.tenantId],
  );
  await conn.execute(
    `UPDATE purchase_orders p
        JOIN (SELECT po_id, SUM(amount) AS a, SUM(COALESCE(tax_amount, 0)) AS t FROM purchase_order_lines WHERE po_id = ? AND tenant_id = ? GROUP BY po_id) s ON s.po_id = p.id
        SET p.total_amount = s.a, p.tax_amount = s.t, p.grand_total = s.a + s.t
      WHERE p.id = ? AND p.tenant_id = ?`,
    [ch.po_id, p.tenantId, ch.po_id, p.tenantId],
  );
  const [st]: any = await conn.execute(
    `SELECT COUNT(*) AS n, SUM(received_qty >= ordered_qty - ?) AS full, SUM(received_qty > ?) AS any_recv FROM purchase_order_lines WHERE po_id = ? AND tenant_id = ?`,
    [EPS, EPS, ch.po_id, p.tenantId],
  );
  const s = (st as any[])[0];
  const status = Number(s.full) === Number(s.n) ? "received" : Number(s.any_recv) > 0 ? "partial_received" : "approved";
  await conn.execute(`UPDATE purchase_orders SET status = ? WHERE id = ? AND tenant_id = ?`, [status, ch.po_id, p.tenantId]);
  await conn.execute(
    `UPDATE purchase_order_line_changes SET status = 'approved', decided_by = ?, decided_at = NOW(), decision_note = ? WHERE id = ? AND tenant_id = ?`,
    [p.userId, p.note ?? null, p.changeId, p.tenantId],
  );
  return { status: "approved" as const, poStatus: status, orderedQty: newQty };
}

export async function listPoLineQtyChanges(conn: any, tenantId: number, poId: number) {
  const [rows]: any = await conn.execute(
    `SELECT c.id, c.po_line_id, l.line_number, l.item_name, l.unit, c.old_qty, c.new_qty, c.reason, c.status,
            c.requested_by, c.requested_at, c.decided_by, c.decided_at, c.decision_note
       FROM purchase_order_line_changes c LEFT JOIN purchase_order_lines l ON l.id = c.po_line_id AND l.tenant_id = c.tenant_id
      WHERE c.tenant_id = ? AND c.po_id = ? ORDER BY c.id DESC`,
    [tenantId, poId],
  );
  return (rows as any[]).map((r) => ({
    id: Number(r.id), poLineId: Number(r.po_line_id), lineNumber: r.line_number != null ? Number(r.line_number) : null,
    itemName: r.item_name, unit: r.unit, oldQty: Number(r.old_qty), newQty: Number(r.new_qty), reason: r.reason, status: r.status,
    requestedBy: Number(r.requested_by), requestedAt: r.requested_at, decidedBy: r.decided_by != null ? Number(r.decided_by) : null,
    decidedAt: r.decided_at, decisionNote: r.decision_note,
  }));
}
