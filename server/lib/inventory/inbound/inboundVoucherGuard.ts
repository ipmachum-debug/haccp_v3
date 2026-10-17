/**
 * 입고 줄에 연결된 매입전표 확정 전 검사 (2026-10-17, Codex #561·562 검증 R2·R3·R6)
 *
 * 재고 사용 확정(purchasePost) 과 회계 전용 확정(erpPurchasePost) 이 같은 검사를 쓴다. 호출자 트랜잭션(conn) 에서 입고 줄을 잠근다.
 *   R2: 살아 있는 입고 줄만 — 확정된 문서이고 취소 수량이 없어야 한다 (헤더는 다른 줄 때문에 confirmed 로 남을 수 있다).
 *   R3: 금액 기준 하나 — 단가 있던 줄은 입고 금액, 무단가 줄은 첫 확정 때의 평가액. 다르면 확정하지 않는다.
 *       무단가 줄의 첫 확정: LOT 이 있으면 아직 쓰이지 않은 LOT 만 이 금액으로 평가 (이미 쓰인 LOT 은 소급하지 않고 확정 보류 —
 *       LOT 평가액과 회계 자산이 달라지므로). 평가 단가·금액·전표를 입고 줄에 남긴다.
 *   R6: 처리 기준은 문서 것 — LOT 이 있는 줄은 재고 경로, 없는 줄(회계 전용 입고) 은 회계 경로 (지금 회사 설정과 무관).
 */
const EPS = 0.0005;

export type InboundVoucherLine = { lineId: number; lotId: number | null; materialId: number; tracked: boolean };

export async function assertInboundVoucherPostable(conn: any, p: {
  tenantId: number; purchaseId: number; inboundLineId: number; supplyAmount: number;
}): Promise<InboundVoucherLine> {
  const [il]: any = await conn.execute(
    `SELECT l.id, l.header_id, l.line_number, l.lot_id, l.material_id, l.purchase_quantity, l.total_price, l.cancelled_qty,
            l.valuation_unit_price, l.valuation_amount, l.disposition, h.status
       FROM h_inbound_lines l JOIN h_inbound_headers h ON h.id = l.header_id AND h.tenant_id = l.tenant_id
      WHERE l.id = ? AND l.tenant_id = ? LIMIT 1 FOR UPDATE`,
    [p.inboundLineId, p.tenantId],
  );
  const line = (il as any[])[0];
  if (!line || line.status !== "confirmed") {
    throw new Error(`연결된 입고 줄 #${p.inboundLineId} 이 확정되지 않았습니다 — 입고를 먼저 확정하세요.`);
  }
  if (Number(line.cancelled_qty) > EPS) {
    throw new Error(`연결된 입고 줄 ${line.header_id}-${line.line_number} 은 취소됐습니다 — 이 전표는 확정할 수 없습니다 (전표를 취소하세요).`);
  }
  if (line.disposition === "quarantine") {
    throw new Error(`연결된 입고 줄 ${line.header_id}-${line.line_number} 은 검수 불합격으로 격리 중입니다 — 확정할 수 없습니다 (CEO 결정 4).`);
  }
  const amount = Math.round(Number(p.supplyAmount) * 100) / 100;
  const lotId = line.lot_id != null ? Number(line.lot_id) : null;
  const priced = Number(line.total_price) > 0;
  if (priced) {
    if (Math.abs(amount - Number(line.total_price)) > 0.5) {
      throw new Error(`전표 공급가 ${amount} 가 입고 금액 ${Number(line.total_price)} 와 다릅니다 — 확정할 수 없습니다.`);
    }
  } else if (line.valuation_amount != null) {
    if (Math.abs(amount - Number(line.valuation_amount)) > 0.5) {
      throw new Error(`이 입고는 ${Number(line.valuation_amount)} 원(단가 ${Number(line.valuation_unit_price)}) 으로 평가됐습니다 — 다른 금액 ${amount} 으로 확정할 수 없습니다 (재평가는 별도 절차).`);
    }
  } else {
    // 무단가 입고의 첫 평가
    if (!(amount > 0)) throw new Error("단가 없는 입고의 전표는 금액이 있어야 확정할 수 있습니다.");
    const qty = Number(line.purchase_quantity);
    const unitPrice = qty > 0 ? Math.round((amount / qty) * 100) / 100 : 0;
    if (lotId) {
      const [lt]: any = await conn.execute(
        `SELECT l.unit_price, l.quantity, l.available_quantity,
                (SELECT COUNT(*) FROM h_inventory_transactions t WHERE t.tenant_id = l.tenant_id AND t.lot_id = l.id AND t.transaction_type <> 'receipt') AS moves
           FROM h_inventory_lots l WHERE l.id = ? AND l.tenant_id = ? LIMIT 1 FOR UPDATE`,
        [lotId, p.tenantId],
      );
      const lot = (lt as any[])[0];
      if (!lot) throw new Error(`연결 LOT #${lotId} 을 찾을 수 없습니다.`);
      if (!(Number(lot.unit_price) > 0)) {
        const unmoved = Number(lot.moves) === 0 && Math.abs(Number(lot.quantity) - Number(lot.available_quantity)) < EPS;
        if (!unmoved || !(Number(lot.quantity) > 0)) {
          throw new Error(`연결 LOT #${lotId} 이 이미 사용돼 단가를 소급할 수 없습니다 — LOT 평가액과 회계가 달라지므로 확정을 보류합니다 (원가 정정 절차 필요).`);
        }
        await conn.execute(`UPDATE h_inventory_lots SET unit_price = ? WHERE id = ? AND tenant_id = ?`,
          [(Math.round((amount / Number(lot.quantity)) * 100) / 100).toFixed(2), lotId, p.tenantId]);
      } else if (Math.abs(Math.round((amount / Number(lot.quantity)) * 100) / 100 - Number(lot.unit_price)) > 0.005) {
        // 평가 기록 이전에 이미 단가가 매겨진 LOT — 그 단가가 기준
        throw new Error(`연결 LOT #${lotId} 단가 ${Number(lot.unit_price)} 와 전표 금액 ${amount} 이 맞지 않습니다 — 확정할 수 없습니다 (재평가는 별도 절차).`);
      }
    }
    await conn.execute(
      `UPDATE h_inbound_lines SET valuation_unit_price = ?, valuation_amount = ?, valuation_purchase_id = ? WHERE id = ? AND tenant_id = ?`,
      [unitPrice, amount, p.purchaseId, p.inboundLineId, p.tenantId],
    );
  }
  return { lineId: Number(line.id), lotId, materialId: Number(line.material_id), tracked: lotId != null };
}
