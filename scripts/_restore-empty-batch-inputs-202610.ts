/**
 * 일회성 — 투입 0건으로 생성된 완료 배치의 원재료 투입 복원 (2026-10-13, CEO 결정 "하이브리드": 10월 2건만)
 *
 * 배경: BOM 품목 네임스페이스 수정(#446) 이전에 만들어진 배치 일부가 BOM 을 못 찾아 h_batch_inputs 0건으로
 *       생성됐다 (완료+투입0: 52건, 그중 10월 2건). 완료 배치는 화면에서 되돌릴 수 없어 스크립트로 복원한다.
 *
 * 방법: 같은 제품의 "투입이 정상인" 템플릿 배치의 투입 행을 수량 비율로 복제 → 자동출고(FEFO) 실행.
 *       자동출고는 배치 업무일자(planned_date, #457) 기준으로 LOT·원장·단가(시점 기준, #474)를 잡는다.
 *
 * 실행 (Genspark, 서버):
 *   npx tsx scripts/_restore-empty-batch-inputs-202610.ts --batch 1091 --dry-run          # 템플릿 자동 선택, 미리보기
 *   npx tsx scripts/_restore-empty-batch-inputs-202610.ts --batch 1091 --template 1101    # 템플릿 지정
 *   npx tsx scripts/_restore-empty-batch-inputs-202610.ts --batch 1091                    # 실행
 *   BACKFILL_USER_ID=4 → input_by / performed_by 에 기록될 사용자 (기본 1)
 *
 * 안전: 대상 배치에 투입이 1건이라도 있으면 중단. 템플릿은 같은 tenant·같은 product_id 만. dry-run 은 쓰기 없음.
 */
import { getRawConnection } from "../server/db/connection";

const args = process.argv.slice(2);
const getArg = (k: string): string | null => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};
const DRY = args.includes("--dry-run");
const BATCH_ID = Number(getArg("--batch"));
const TEMPLATE_ID_ARG = getArg("--template") ? Number(getArg("--template")) : null;
const USER_ID = Number(process.env.BACKFILL_USER_ID ?? 1);

async function main() {
  if (!BATCH_ID) throw new Error("--batch <id> 필수");
  const pool = await getRawConnection();

  const [bRows] = await pool.execute<any[]>(
    `SELECT id, tenant_id, product_id, batch_code, status, DATE_FORMAT(planned_date,'%Y-%m-%d') AS planned_date,
            planned_quantity, actual_quantity, created_by
     FROM h_batches WHERE id = ? LIMIT 1`, [BATCH_ID]);
  const batch = (bRows as any[])[0];
  if (!batch) throw new Error(`배치 #${BATCH_ID} 없음`);
  const tenantId = Number(batch.tenant_id);

  const [exist] = await pool.execute<any[]>(`SELECT COUNT(*) AS n FROM h_batch_inputs WHERE batch_id = ?`, [BATCH_ID]);
  if (Number((exist as any[])[0].n) > 0) throw new Error(`배치 #${BATCH_ID} 에 이미 투입 ${(exist as any[])[0].n}건 — 중단`);

  // 템플릿: 지정 없으면 같은 제품·같은 tenant 에서 투입이 있는 가장 최근 완료 배치
  let templateId = TEMPLATE_ID_ARG;
  if (!templateId) {
    const [tRows] = await pool.execute<any[]>(
      `SELECT b.id FROM h_batches b
       WHERE b.tenant_id = ? AND b.product_id = ? AND b.id <> ?
         AND EXISTS (SELECT 1 FROM h_batch_inputs bi WHERE bi.batch_id = b.id AND bi.inventory_deducted = 1)
       ORDER BY b.planned_date DESC, b.id DESC LIMIT 1`, [tenantId, batch.product_id, BATCH_ID]);
    templateId = (tRows as any[])[0]?.id ? Number((tRows as any[])[0].id) : null;
  }
  if (!templateId) throw new Error(`제품 #${batch.product_id} 에 투입이 있는 템플릿 배치가 없음 — --template 로 지정 필요`);

  const [tb] = await pool.execute<any[]>(
    `SELECT id, tenant_id, product_id, batch_code, planned_quantity, actual_quantity FROM h_batches WHERE id = ? LIMIT 1`, [templateId]);
  const tpl = (tb as any[])[0];
  if (!tpl) throw new Error(`템플릿 배치 #${templateId} 없음`);
  if (Number(tpl.tenant_id) !== tenantId || Number(tpl.product_id) !== Number(batch.product_id)) {
    throw new Error(`템플릿 #${templateId} 는 같은 tenant·제품이 아님 (tenant ${tpl.tenant_id}, product ${tpl.product_id})`);
  }

  const [tInputs] = await pool.execute<any[]>(
    `SELECT bi.material_id, bi.process_group_id, bi.planned_quantity, bi.unit, m.material_name
     FROM h_batch_inputs bi LEFT JOIN h_materials m ON m.id = bi.material_id
     WHERE bi.batch_id = ? ORDER BY bi.id`, [templateId]);
  if ((tInputs as any[]).length === 0) throw new Error(`템플릿 #${templateId} 투입 0건`);

  const targetQty = Number(batch.actual_quantity ?? batch.planned_quantity ?? 0);
  const tplQty = Number(tpl.actual_quantity ?? tpl.planned_quantity ?? 0);
  const scale = tplQty > 0 ? targetQty / tplQty : 1;

  console.log(`대상  : #${batch.id} ${batch.batch_code} (${batch.status}, 업무일 ${batch.planned_date}, ${targetQty}kg)`);
  console.log(`템플릿: #${tpl.id} ${tpl.batch_code} (${tplQty}kg) → 배율 ${scale.toFixed(4)}`);
  console.log(`복제할 투입 ${(tInputs as any[]).length}건:`);
  const plan = (tInputs as any[]).map((r) => ({
    materialId: Number(r.material_id),
    processGroupId: r.process_group_id != null ? Number(r.process_group_id) : null,
    unit: r.unit ?? "kg",
    plannedQuantity: Math.round(Number(r.planned_quantity) * scale * 1000) / 1000,
    name: r.material_name ?? `#${r.material_id}`,
  }));
  for (const p of plan) console.log(`   ${p.name.padEnd(20)} ${p.plannedQuantity} ${p.unit}`);

  if (DRY) { console.log("\n--dry-run: 쓰기 없음"); return; }

  for (const p of plan) {
    await pool.execute(
      `INSERT INTO h_batch_inputs (tenant_id, batch_id, material_id, process_group_id, planned_quantity, unit,
                                   unit_price, total_price, inventory_deducted, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, NOW())`,
      [tenantId, BATCH_ID, p.materialId, p.processGroupId, p.plannedQuantity, p.unit],
    );
  }
  console.log(`투입 ${plan.length}건 INSERT 완료 → 자동출고 실행 (업무일 ${batch.planned_date})`);

  const { autoIssueMaterialsDispatch } = await import("../server/lib/production/autoMaterialIssueDispatcher");
  const result: any = await autoIssueMaterialsDispatch(BATCH_ID, Number(batch.created_by ?? USER_ID), tenantId);
  console.log(`자동출고 결과: success=${result?.success} issued=${result?.issuedCount ?? result?.issued?.length ?? "?"} errors=${JSON.stringify(result?.errors ?? [])}`);
  if (result?.warnings?.length) console.log(`경고: ${JSON.stringify(result.warnings)}`);

  const [chk] = await pool.execute<any[]>(
    `SELECT COUNT(*) AS inputs, SUM(inventory_deducted) AS deducted, ROUND(SUM(total_price),2) AS cost
     FROM h_batch_inputs WHERE batch_id = ?`, [BATCH_ID]);
  console.log(`확인: 투입 ${(chk as any[])[0].inputs}건, 차감 ${(chk as any[])[0].deducted}건, 재료원가 ${(chk as any[])[0].cost}원`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
