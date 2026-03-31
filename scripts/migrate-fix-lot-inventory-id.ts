/**
 * 마이그레이션: h_inventory_lots.inventory_id 누락 복구
 *
 * 근본 원인: createMaterialReceivingWithLot에서 LOT 생성 시 inventory_id를 설정하지 않았음
 * FEFO 할당(allocateLotsFEFO)이 inventory_id로 LOT를 검색하므로 재고 차감이 안 됨
 *
 * 이 스크립트는:
 * 1. inventory_id가 NULL인 h_inventory_lots를 조회
 * 2. 같은 tenant_id + material_id로 h_inventory를 조회하여 매칭
 * 3. h_inventory_lots.inventory_id를 업데이트
 *
 * 실행: npx tsx scripts/migrate-fix-lot-inventory-id.ts
 */

import { getDb } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  console.log("[migrate-fix-lot-inventory-id] 시작...");

  // 1. inventory_id가 NULL 또는 0인 LOT 수 확인
  const [countRows]: any = await db.execute(sql.raw(`
    SELECT COUNT(*) AS cnt FROM h_inventory_lots
    WHERE inventory_id IS NULL OR inventory_id = 0
  `));
  const total = Number((countRows as any[])[0]?.cnt || 0);
  console.log(`[migrate-fix-lot-inventory-id] inventory_id 미설정 LOT: ${total}건`);

  if (total === 0) {
    console.log("[migrate-fix-lot-inventory-id] 수정할 LOT가 없습니다. 완료.");
    process.exit(0);
  }

  // 2. h_inventory_lots → h_inventory 매칭하여 inventory_id 설정
  const [result]: any = await db.execute(sql.raw(`
    UPDATE h_inventory_lots il
    INNER JOIN h_inventory inv ON inv.material_id = il.material_id AND inv.tenant_id = il.tenant_id
    SET il.inventory_id = inv.id
    WHERE il.inventory_id IS NULL OR il.inventory_id = 0
  `));

  const updated = (result as any)?.affectedRows || (result as any)?.changedRows || 0;
  console.log(`[migrate-fix-lot-inventory-id] ${updated}건 업데이트 완료`);

  // 3. 여전히 누락된 LOT 확인 (h_inventory에 해당 material_id가 없는 경우)
  const [remainRows]: any = await db.execute(sql.raw(`
    SELECT COUNT(*) AS cnt FROM h_inventory_lots
    WHERE inventory_id IS NULL OR inventory_id = 0
  `));
  const remaining = Number((remainRows as any[])[0]?.cnt || 0);
  if (remaining > 0) {
    console.log(`[migrate-fix-lot-inventory-id] 경고: ${remaining}건의 LOT에 대응하는 h_inventory 레코드가 없습니다.`);
    console.log("[migrate-fix-lot-inventory-id] 이 LOT들은 h_inventory 레코드가 생성되면 자동으로 매칭됩니다.");

    // h_inventory 레코드가 없는 LOT에 대해 h_inventory 자동 생성
    const [orphanRows]: any = await db.execute(sql.raw(`
      SELECT DISTINCT il.tenant_id, il.material_id, il.unit,
        SUM(il.quantity) AS total_qty, SUM(il.available_quantity) AS avail_qty
      FROM h_inventory_lots il
      WHERE (il.inventory_id IS NULL OR il.inventory_id = 0)
        AND NOT EXISTS (
          SELECT 1 FROM h_inventory inv
          WHERE inv.material_id = il.material_id AND inv.tenant_id = il.tenant_id
        )
      GROUP BY il.tenant_id, il.material_id, il.unit
    `));

    for (const orphan of (orphanRows as any[])) {
      const [insResult]: any = await db.execute(sql.raw(`
        INSERT INTO h_inventory (tenant_id, material_id, total_quantity, available_quantity, reserved_quantity, unit)
        VALUES (${orphan.tenant_id}, ${orphan.material_id}, ${orphan.total_qty}, ${orphan.avail_qty}, 0, '${orphan.unit || 'kg'}')
      `));
      const newInvId = (insResult as any)?.insertId;
      if (newInvId) {
        await db.execute(sql.raw(`
          UPDATE h_inventory_lots
          SET inventory_id = ${newInvId}
          WHERE material_id = ${orphan.material_id} AND tenant_id = ${orphan.tenant_id}
            AND (inventory_id IS NULL OR inventory_id = 0)
        `));
        console.log(`  - material_id=${orphan.material_id}, tenant_id=${orphan.tenant_id}: h_inventory 생성(id=${newInvId}) + LOT 연결`);
      }
    }
  }

  console.log("[migrate-fix-lot-inventory-id] 완료!");
  process.exit(0);
}

main().catch(err => {
  console.error("[migrate-fix-lot-inventory-id] 오류:", err);
  process.exit(1);
});
