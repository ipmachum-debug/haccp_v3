/**
 * 배치 오케스트레이터 서비스
 *
 * 기존 batch.create 라우터 로직을 서비스로 분리하여
 * 단일 배치 생성(createSingleBatch)과 일괄 배치 생성(bulkCreateForDay)
 * 모두에서 재사용할 수 있도록 구성
 *
 * [파이프라인]
 * 1. createBatch (DB insert + 원재료 투입 자동생성)
 * 2. autoCreateCcpInstancesForBatch (공정그룹 → 설비 → CCP rows)
 * 3. getOrCreateCcpFormRecord (인쇄용 양식 기록지)
 * 4. SKU 생산수량 기록 (production_sku_output)
 * 5. CCP 점검 알림 (수동배치)
 * 6. 배치 스케줄 생성
 * 7. 승인요청 자동 등록
 * 8. 일일일지 자동생성
 */

import { getRawConnection } from "../db";
import { todayKST } from "../utils/timezone";
import { asProductionProductId } from "../../shared/identity/itemIds";

export interface SingleBatchInput {
  tenantId: number;
  siteId: number;
  workDate: string; // "YYYY-MM-DD"
  startTime: string; // "HH:mm"
  endTime?: string; // "HH:mm"
  productId: number;
  plannedQuantityKg: number;
  batchCode?: string;
  dayBatchGroup?: string;
  batchOrder?: number;
  skuOutputs?: Array<{
    skuId: number;
    plannedQty: number;
    actualQty?: number;
    defectiveQty?: number;
    note?: string;
  }>;
  mode: "auto" | "manual";
  userId: number;
  userEmail?: string;
  userRole?: string;
  /** true = skip daily report + approval (caller handles at group level) */
  skipGroupActions?: boolean;
  /** 오늘만 바꾼 시작시각 — CCP 계획에서 설비 작업 시작보다 우선 (PR-B) */
  startTimeOverride?: string | null;
  /** 오늘만 쓰지 않는 설비 (PR-B) */
  excludedEquipmentIds?: number[];
  /** 생성 요청 줄 번호 — 생산 건 INSERT 에 같이 남겨 재시도가 찾는다 (2026-10-20) */
  createRequestId?: number | null;
  /** 이미 만든 생산 건(같은 요청 줄에 연결됨)의 남은 준비만 이어서 — 새 생산 건을 만들지 않는다 */
  resumeBatchId?: number | null;
}

export interface SingleBatchResult {
  batchId: number;
  batchCode: string;
  productId: number;
  productName: string;
  ccpCreated: boolean;
  ccpCount: number;
  ccpGroups: Array<{ id: number; name: string; ccp_type: string }>;
  approvalRequestId: number | null;
  scheduleCreated: boolean;
  dailyReportCreated: boolean;
  periodicLogsResult: any;
  /** 필수 준비 중 빠진 것 — 비어 있어야 생성 완료. 남으면 생산 건은 '준비 미완' 으로 남고 같은 요청 재시도가 이어서 */
  setupMissing: string[];
  /** 이미 있던 생산 건을 이어서 완성했는가 */
  resumed: boolean;
}

/**
 * @deprecated v1 퇴출 완료 — h_products_v2.id를 직접 사용
 * DB 마이그레이션(migrate-products-v1-to-v2.ts) 실행 후에는
 * 모든 product_id가 h_products_v2.id이므로 변환이 불필요합니다.
 * 하위 호환을 위해 함수는 유지하되 입력값을 그대로 반환합니다.
 */
export async function resolveToHProductId(
  productId: number,
  _tenantId: number,
): Promise<number> {
  return productId; // v1 퇴출 후: 변환 불필요, ID 그대로 반환
}

/**
 * 생산 건 하나를 만들거나 다시 계획하기 전에 볼 계획 막힘 — 미리보기(batch.previewDay)와 같은 planCcpForDay 결과에서
 *   BOM 줄 양 계약 위반(qtyError)과 자정을 넘는 회차(blocking). 읽기만 한다.
 */
export async function planProblems(a: {
  tenantId: number; workDate: string; productId: number; plannedKg: number; startTime: string;
  startTimeOverride?: string | null; excludedEquipmentIds?: number[]; excludeBatchId?: number | null;
}): Promise<string[]> {
  const { planCcpForDay } = await import("./ccp-batch");
  const day = await planCcpForDay({
    tenantId: a.tenantId, workDate: a.workDate, excludedEquipmentIds: a.excludedEquipmentIds, excludeBatchId: a.excludeBatchId ?? null,
    rows: [{ rowKey: "check", productId: a.productId, plannedKg: a.plannedKg, startTime: a.startTime, startTimeOverride: a.startTimeOverride ?? null }],
  });
  const out: string[] = [];
  const bom = day.meta[0]?.bom;
  if (bom?.qtyError) out.push(`원료 양 계산 불가 — ${bom.qtyError}`);
  out.push(...(day.plans[0]?.blocking ?? []));
  return out;
}

/**
 * 단일 배치 생성 파이프라인 (2026-10-20, 생산계획 생애주기 검토 1·4 — 생성 계약)
 *
 *   1) 생산 건 머리글 + 원료 투입 계획 = 한 트랜잭션 (createBatch). 요청 줄 번호·예정 표시·준비 미완(setup_pending=1)을 같은 INSERT 에.
 *   2) 필수 준비 (completeBatchSetup — 몇 번 다시 해도 같은 결과): CCP 공정·회차 → 기록지 → 기록 행 → 요청한 SKU 구성.
 *   3) 확인 (verifyBatchSetup): 실제로 저장된 것을 읽어 빠진 것이 없을 때만 준비 완료(setup_pending=0).
 *      빠진 것이 있으면 생성 완료로 보지 않는다 — 생산 건은 남기고(요청 줄에 연결), 같은 요청 재시도가 그 생산 건을 이어서 완성한다.
 *      준비 미완 생산 건은 현장 첫 확인·승인이 막는다.
 *   4) 지난 날짜(즉시 실행)만 실행 단계 — 준비가 끝난 뒤 activation_pending 1→0 을 잡아 한 번.
 *   선택 단계(일정 표·감사 기록)는 실패해도 생성은 완료 (로그).
 */
export async function createSingleBatch(
  input: SingleBatchInput,
): Promise<SingleBatchResult> {
  const { createBatch, getProductById, createAuditLog } = await import("../db");
  const conn = await getRawConnection();
  const planOnly = input.workDate >= todayKST();

  let batchId: number;
  let batchCodeFinal: string;
  const resumed = !!input.resumeBatchId;
  if (input.resumeBatchId) {
    const [[b]]: any = await conn.execute(`SELECT id, batch_code, voided_at FROM h_batches WHERE id = ? AND tenant_id = ?`, [input.resumeBatchId, input.tenantId]);
    if (!b) throw new Error(`이어서 준비할 생산 건 #${input.resumeBatchId} 을 찾을 수 없습니다.`);
    if (b.voided_at) throw new Error(`생산 건 #${input.resumeBatchId} 은 무효 처리되어 이어서 준비하지 않습니다.`);
    batchId = Number(b.id);
    batchCodeFinal = String(b.batch_code);
  } else {
    // ★ PR #263: CCP 공정그룹 매핑 사전 검증 (fail-fast).
    // 4월 17일 batch 580 흑임자인절미 0건 CCP form record 사고 재발 방지.
    const productMetaForValidation = await getProductById(input.productId, input.tenantId);
    const productNameForValidation = (productMetaForValidation as any)?.productName || `제품 #${input.productId}`;
    const { validateProductCcpMapping } = await import("./validateProductCcpMapping");
    const ccpValidation = await validateProductCcpMapping({
      productId: input.productId,
      productName: productNameForValidation,
      tenantId: input.tenantId,
    });
    if (!ccpValidation.valid) {
      const { TRPCError } = await import("@trpc/server");
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: ccpValidation.message,
        cause: {
          guidance: ccpValidation.guidance,
          bomMappingCount: ccpValidation.bomMappingCount,
          manualMappingCount: ccpValidation.manualMappingCount,
          hasApprovedBom: ccpValidation.hasApprovedBom,
          hasMetalDetection: ccpValidation.hasMetalDetection,
        },
      });
    }
    // 미리보기 막힘 사유와 같은 계획 함수로 먼저 본다 (2026-10-20 검토 1·5) — 만들고 나서 준비가 실패해 반쯤 남지 않게.
    //   BOM 줄 양을 계약대로 정할 수 없음(원료 투입 계획 줄은 createBatch 가 같은 계약으로 다시 막음) · 자정을 넘는 회차.
    {
      const problems = await planProblems({ tenantId: input.tenantId, workDate: input.workDate, productId: input.productId, plannedKg: input.plannedQuantityKg,
        startTime: input.startTime, startTimeOverride: input.startTimeOverride ?? null, excludedEquipmentIds: input.excludedEquipmentIds });
      if (problems.length) {
        const { TRPCError } = await import("@trpc/server");
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: problems.join(" / ") });
      }
    }
    // === 1. 배치 생성 (머리글 + 원료 투입 계획 한 트랜잭션) ===
    // KST 날짜를 UTC 변환 없이 정확히 유지하기 위해 noon(12:00)으로 설정
    const plannedDate = new Date(`${input.workDate}T12:00:00`);
    batchCodeFinal = input.batchCode || await generateBatchCode(input.tenantId, input.productId, input.workDate);
    batchId = await createBatch({
      tenantId: input.tenantId,
      siteId: input.siteId,
      productId: input.productId,
      batchCode: batchCodeFinal,
      dayBatchGroup: input.dayBatchGroup,
      batchOrder: input.batchOrder,
      plannedQuantity: input.plannedQuantityKg.toString(),
      plannedDate,
      batchStartTime: input.startTime,
      // 행별 처리 방식 저장 — 빠지면 createBatch 가 auto 로 저장해 수동 행이 자동이 됐다 (지티 QA B02)
      mode: input.mode,
      createdBy: input.userId,
      createRequestId: input.createRequestId ?? null,
      // ★ 2026-10-19 (현장 1·하루 생산 흐름): 오늘·미래는 '예정' — 원료는 현장 첫 확인에서. 지난 날짜만 바로 실행.
      planOnly,
      activationPending: !planOnly,
    });
  }

  // === 2. 필수 준비 (CCP·기록지·행·SKU) — 다시 해도 같은 결과 ===
  const product = await getProductById(input.productId, input.tenantId);
  const productName = product?.productName || "";
  const setup = await completeBatchSetup({ ...input, batchId, productName });
  const ccpGroups = setup.ccpGroups;
  const ccpCreated = ccpGroups.length > 0;
  const ccpCount = ccpGroups.length;

  // === 3. 실제로 저장된 것 확인 — 빠진 것이 없을 때만 준비 완료 ===
  const setupMissing = await verifyBatchSetup(batchId, input.tenantId, { skuIds: (input.skuOutputs ?? []).filter((x) => x.plannedQty || x.actualQty).map((x) => x.skuId) });
  let approvalRequestId: number | null = null;
  let dailyReportCreated = false;
  let periodicLogsResult: any = null;
  if (!setupMissing.length) {
    await conn.execute(`UPDATE h_batches SET setup_pending = 0 WHERE id = ? AND tenant_id = ?`, [batchId, input.tenantId]);
    // === 4. 지난 날짜(뒤늦은 입력 — 이미 한 생산)만 실행 단계 — 한 번 (activation_pending 1→0 을 먼저 잡음) ===
    if (!planOnly) {
      if (input.skipGroupActions) {
        // 일괄 생성: 그룹 단계(승인요청·일지)는 호출자가 그룹으로 — 시작·출고·기록지 제출 전환만 (실행권·남음 계약 그대로)
        const [claim]: any = await conn.execute(
          `UPDATE h_batches SET activation_claimed_at = NOW() WHERE id = ? AND tenant_id = ? AND activation_pending = 1 AND (activation_claimed_at IS NULL OR activation_claimed_at < NOW() - INTERVAL 5 MINUTE)`,
          [batchId, input.tenantId]);
        if (Number(claim?.affectedRows ?? 0) === 1) {
          const r = await runExecutionSteps({ input, batchId, batchCodeFinal, productName, ccpCreated, ccpCount, ccpGroups });
          ({ approvalRequestId, dailyReportCreated, periodicLogsResult } = r);
          await conn.execute(r.failures.length ? `UPDATE h_batches SET activation_claimed_at = NULL WHERE id = ? AND tenant_id = ?`
            : `UPDATE h_batches SET activation_pending = 0, activation_claimed_at = NULL WHERE id = ? AND tenant_id = ?`, [batchId, input.tenantId]);
        }
      } else {
        const [[b]]: any = await conn.execute(`SELECT site_id FROM h_batches WHERE id = ? AND tenant_id = ?`, [batchId, input.tenantId]);
        const r = await finishBatchActivation({
          batchId, tenantId: input.tenantId, userId: input.userId, siteId: Number(b?.site_id ?? input.siteId), workDate: input.workDate, mode: input.mode,
          plannedQuantityKg: input.plannedQuantityKg, batchCode: batchCodeFinal, productName, ccpGroups,
        }, { startDone: false });
        ({ approvalRequestId, dailyReportCreated, periodicLogsResult } = r);
      }
    }
  }

  // === 선택: 감사로그 (처음 만들 때) ===
  if (!resumed) {
    try {
      await createAuditLog({
        action: "batch.create",
        entityType: "batch",
        entityId: batchId,
        userId: input.userId,
        userEmail: input.userEmail || "",
        userRole: input.userRole || "",
        description: `배치 생성: ${batchCodeFinal} (${productName}) ${ccpCreated ? `CCP ${ccpCount}건` : ""}`,
        changes: { mode: input.mode, workDate: input.workDate, setupMissing },
      });
    } catch {
      // audit log 실패는 무시
    }
  }

  return {
    batchId,
    batchCode: batchCodeFinal,
    productId: input.productId,
    productName,
    ccpCreated,
    ccpCount,
    ccpGroups,
    approvalRequestId,
    scheduleCreated: setup.scheduleCreated,
    dailyReportCreated,
    periodicLogsResult,
    setupMissing,
    resumed,
  };
}

/**
 * 생산 건 필수 준비 — CCP 공정·회차 → 기록지 → 기록 행 → 요청 SKU 구성 (+ 선택: 일정 표). 몇 번 다시 해도 같은 결과.
 *   오류는 여기서 숨기지 않고 로그로 남긴 뒤 계속 — 무엇이 빠졌는지는 verifyBatchSetup 이 실제 저장 상태로 판단한다.
 */
export async function completeBatchSetup(a: SingleBatchInput & { batchId: number; productName: string }): Promise<{ ccpGroups: Array<{ id: number; name: string; ccp_type: string }>; scheduleCreated: boolean }> {
  const { autoCreateCcpInstancesForBatch } = await import("./ccp-batch");
  const conn = await getRawConnection();
  const { batchId } = a;
  let ccpGroups: Array<{ id: number; name: string; ccp_type: string }> = [];
  try {
    // 회차 기준량은 ccp-batch 가 배치가 쓰는 BOM 버전에서 읽는다 (결함 #11). 이미 만든 공정은 다시 만들지 않는다.
    const result = await autoCreateCcpInstancesForBatch({
      siteId: a.siteId, workDate: a.workDate, batchId, productId: a.productId, productName: a.productName, createdBy: a.userId,
      tenantId: a.tenantId, plannedQuantity: a.plannedQuantityKg, startTimeOverride: a.startTimeOverride ?? null, excludedEquipmentIds: a.excludedEquipmentIds,
    });
    const bomBatchKg = result.subBatchKg ?? undefined;
    ccpGroups = (result.groups || []).map((g: any) => ({ id: g.id, name: g.name, ccp_type: g.ccp_type }));
    if ((result.groups || []).length) {
      const { getOrCreateCcpFormRecord } = await import("../db/haccp/ccpFormRecords");
      for (const group of result.groups as any[]) {
        try {
          await getOrCreateCcpFormRecord({
            tenantId: a.tenantId, siteId: a.siteId, batchId, ccpType: group.ccp_type, workDate: a.workDate, productId: a.productId, productName: a.productName,
            processGroupId: group.id, processGroupName: group.name, bomBatchKg, plannedQtyKg: a.plannedQuantityKg, writerId: a.userId,
            clHeatTimeMinLo: group.time_min ?? undefined, clHeatTimeMinHi: group.time_max ?? undefined, clHeatTempLo: group.temperature_min ?? undefined,
            clPressureMpaLo: group.pressure_min ?? undefined, clProductTempLo: group.temperature_min ?? undefined,
            clHeatTempHi: group.temperature_max ?? undefined, clPressureMpaHi: group.pressure_max ?? undefined,
          });
        } catch (formErr: any) {
          console.error(`[batchSetup] 기록지 준비 실패 (${group.ccp_type}/${group.name}) batch=${batchId}:`, formErr?.message || formErr);
        }
      }
    }
  } catch (error) {
    console.error(`[batchSetup] CCP 공정 준비 실패 batch=${batchId}:`, error);
  }

  // SKU 구성 — 같은 SKU 는 덮어씀 (ON DUPLICATE KEY)
  if (a.skuOutputs && a.skuOutputs.length > 0) {
    try {
      // ★ 2026-05-09 (PR #281): SKU 번들 자동 매칭 — child SKU → parent bundle 룩업
      const childIds = a.skuOutputs.map((o: any) => o.skuId).filter((id: number) => Number.isFinite(id));
      const bundleMap = new Map<number, number>();
      if (childIds.length > 0) {
        try {
          const [bRows]: any = await conn.query(
            `SELECT child_sku_id, parent_sku_id FROM sku_bundles WHERE tenant_id = ? AND child_sku_id IN (?) ORDER BY sort_order, id`,
            [a.tenantId, childIds],
          );
          for (const r of bRows as any[]) if (!bundleMap.has(Number(r.child_sku_id))) bundleMap.set(Number(r.child_sku_id), Number(r.parent_sku_id));
        } catch (e: any) {
          if (e?.code !== "ER_NO_SUCH_TABLE") throw e; // sku_bundles 표 생성 전 DB 만 넘어감
        }
      }
      for (const skuOut of a.skuOutputs) {
        if (!skuOut.plannedQty && !skuOut.actualQty) continue;
        const [skuRows]: any = await conn.execute("SELECT kg_per_sales_unit FROM product_skus WHERE id=? AND tenant_id=?", [skuOut.skuId, a.tenantId]);
        if (!(skuRows as any[]).length) throw new Error(`SKU #${skuOut.skuId} 는 이 회사의 SKU 가 아닙니다.`);
        const kgPerUnit = (skuRows as any[])[0]?.kg_per_sales_unit ? parseFloat((skuRows as any[])[0].kg_per_sales_unit) : 1;
        const qty = skuOut.actualQty ?? skuOut.plannedQty;
        await conn.execute(
          `INSERT INTO production_sku_output (tenant_id, batch_id, sku_id, bundle_sku_id, quantity, defective_qty, total_kg, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE bundle_sku_id=VALUES(bundle_sku_id), quantity=VALUES(quantity), defective_qty=VALUES(defective_qty), total_kg=VALUES(total_kg)`,
          [a.tenantId, batchId, skuOut.skuId, bundleMap.get(skuOut.skuId) ?? null, qty, skuOut.defectiveQty || 0, (qty * kgPerUnit).toFixed(3), skuOut.note || null],
        );
      }
    } catch (skuErr) {
      console.error(`[batchSetup] SKU 구성 저장 실패 batch=${batchId}:`, skuErr);
    }
  }

  // 기록 행 — SKU 구성 뒤에 (금속검출 통과량 = SKU 판매단위 수량)
  if (ccpGroups.length) {
    try {
      const { syncCcpRowsToFormRows } = await import("../db/haccp/ccpFormRecords");
      await syncCcpRowsToFormRows({ batchId, tenantId: a.tenantId });
    } catch (syncErr) {
      console.error(`[batchSetup] 기록 행 준비 실패 batch=${batchId}:`, syncErr);
    }
  }

  // 선택: 일정 표 — 이미 있으면 다시 만들지 않는다
  let scheduleCreated = false;
  try {
    const [ex]: any = await conn.execute(`SELECT id FROM h_batch_schedules WHERE batch_id = ? AND tenant_id = ? LIMIT 1`, [batchId, a.tenantId]);
    if ((ex as any[]).length) scheduleCreated = true;
    else {
      const { createBatchSchedule } = await import("../db/production/batchSchedules");
      await createBatchSchedule({ tenantId: a.tenantId, batchId, scheduledDate: new Date(`${a.workDate}T12:00:00`), status: "scheduled",
        notes: `시작: ${a.startTime}${a.endTime ? `, 종료: ${a.endTime}` : ""}` });
      scheduleCreated = true;
    }
  } catch (error) {
    console.error(`[batchSetup] 일정 표 생성 실패 (선택 단계) batch=${batchId}:`, error);
  }
  return { ccpGroups, scheduleCreated };
}

/**
 * 생산 건 필수 준비가 실제로 저장됐는지 — 빠진 것 목록 (빈 목록 = 준비 완료).
 *   원료 투입 계획(BOM 의 차감 원료 줄 수) · CCP 공정 · 공정마다 기록지와 기록 행 · 금속검출 하루 기록지(현장 기록지면 이 생산 건 통과 행) · 요청 SKU.
 */
export async function verifyBatchSetup(batchId: number, tenantId: number, opts: { skuIds?: number[] } = {}): Promise<string[]> {
  const conn: any = await getRawConnection();
  const missing: string[] = [];
  const [[b]]: any = await conn.execute(`SELECT id, product_id, DATE_FORMAT(planned_date, '%Y-%m-%d') AS wd FROM h_batches WHERE id = ? AND tenant_id = ?`, [batchId, tenantId]);
  if (!b) return ["생산 건이 없습니다"];
  // 원료 투입 계획
  const { selectBomVersion } = await import("../lib/identity/itemIdentityService");
  const picked = await selectBomVersion(asProductionProductId(Number(b.product_id)), tenantId, conn);
  if (picked) {
    const [[e]]: any = await conn.execute(
      `SELECT COUNT(*) AS n FROM h_mf_ingredients WHERE mf_report_version_id = ? AND material_id IS NOT NULL AND (is_deductible IS NULL OR is_deductible <> 0)`, [picked.versionId]);
    const [[h]]: any = await conn.execute(`SELECT COUNT(*) AS n FROM h_batch_inputs WHERE batch_id = ? AND tenant_id = ?`, [batchId, tenantId]);
    if (Number(h.n) < Number(e.n)) missing.push(`원료 투입 계획 ${h.n}/${e.n}줄`);
  }
  // CCP 공정 → 기록지 → 기록 행
  const [inst]: any = await conn.execute(`SELECT DISTINCT process_group_id, ccp_type FROM h_ccp_instances WHERE batch_id = ? AND tenant_id = ?`, [batchId, tenantId]);
  if (!(inst as any[]).length) missing.push("CCP 공정이 없습니다");
  for (const i of inst as any[]) {
    if (String(i.ccp_type) === "CCP-4P") {
      // 이 생산 건의 금속검출 기록지 (통과 행이 있는 기록지, 없으면 그날 열린 기록지) — 승인본을 골라 '행 없음' 으로 멈추지 않게 (dayMetalForm)
      const { metalFormForBatch } = await import("../lib/haccp/dayMetalForm");
      const mf = await metalFormForBatch(conn, tenantId, batchId, String(b.wd));
      const fr = mf ? { id: mf.id, field_mode: mf.fieldMode ? 1 : 0 } : null;
      if (!fr) { missing.push("금속검출 하루 기록지가 없습니다"); continue; }
      if (Number(fr.field_mode ?? 0) === 1) {
        const [[pr]]: any = await conn.execute(
          `SELECT COUNT(*) AS n FROM h_ccp_form_rows WHERE form_record_id = ? AND tenant_id = ? AND equipment_type = 'passage' AND batch_id = ?`, [fr.id, tenantId, batchId]);
        if (Number(pr.n) === 0) missing.push("금속검출 통과 행이 없습니다");
      }
      continue;
    }
    const [[fr]]: any = await conn.execute(
      `SELECT f.id, (SELECT COUNT(*) FROM h_ccp_form_rows r WHERE r.form_record_id = f.id AND r.tenant_id = f.tenant_id) AS n_rows
         FROM h_ccp_form_records f WHERE f.tenant_id = ? AND f.batch_id = ? AND f.ccp_type = ?${i.process_group_id != null ? " AND f.process_group_id = ?" : ""} ORDER BY f.id LIMIT 1`,
      i.process_group_id != null ? [tenantId, batchId, i.ccp_type, i.process_group_id] : [tenantId, batchId, i.ccp_type],
    );
    if (!fr) missing.push(`${i.ccp_type} 기록지가 없습니다 (공정 #${i.process_group_id ?? "-"})`);
    else if (Number(fr.n_rows) === 0) missing.push(`${i.ccp_type} 기록 행이 없습니다 (공정 #${i.process_group_id ?? "-"})`);
  }
  // 요청 SKU
  const want = Array.from(new Set((opts.skuIds ?? []).map(Number)));
  if (want.length) {
    const [have]: any = await conn.query(`SELECT sku_id FROM production_sku_output WHERE batch_id = ? AND tenant_id = ? AND sku_id IN (?)`, [batchId, tenantId, want]);
    const got = new Set((have as any[]).map((r) => Number(r.sku_id)));
    const lack = want.filter((x) => !got.has(x));
    if (lack.length) missing.push(`SKU 구성 ${want.length - lack.length}/${want.length}`);
  }
  return missing;
}

interface ExecutionCtx {
  input: Pick<SingleBatchInput, "tenantId" | "userId" | "siteId" | "workDate" | "mode" | "endTime" | "plannedQuantityKg" | "skipGroupActions">;
  batchId: number;
  batchCodeFinal: string;
  productName: string;
  ccpCreated: boolean;
  ccpCount: number;
  ccpGroups: Array<{ id: number; name: string; ccp_type: string }>;
}

/**
 * 생산 건 실행 단계 — 생산 시작(진행 중)·원료 자동 출고(auto)·승인요청·기록지 제출·일지.
 * 오늘(또는 지난) 날짜 생산 건은 만들 때 바로, 미래 날짜 예정 생산 건은 그날 확인할 때(activatePlannedBatch) 한 번.
 */
async function runExecutionSteps(ctx: ExecutionCtx, opts: { startDone?: boolean } = {}): Promise<{ approvalRequestId: number | null; dailyReportCreated: boolean; periodicLogsResult: any; failures: string[] }> {
  const { input, batchId, batchCodeFinal, productName, ccpCreated, ccpCount, ccpGroups } = ctx;
  void ccpCount;
  // 필수 단계 실패 목록 (2026-10-20, #612 추가 검토 3) — 비어 있어야 '실행 단계 끝' (activation_pending 0). 선택 단계(기간별 일지)는 넣지 않는다
  const failures: string[] = [];
  // === 5.5. 배치 상태 → in_progress 전환 + 원료 자동 출고 (auto 모드) ===
  // ★ auto 모드이거나 endTime 이 지정되어 있으면 즉시 시작 상태로 전환하고
  //    h_batch_inputs 기준 원료 차감 + material_ledger_daily 반영
  //    (기존에는 updateStatus 뮤테이션으로만 트리거되어 auto 모드 배치는 수불 반영 누락)
  if (!opts.startDone && ccpCreated && (input.mode === "auto" || input.endTime)) {
    try {
      const { updateBatchStatus } = await import("../db/production/batchCRUD");
      // 자동 시작 — 계획 시작시각(업무일 + 시작시각) 유지, 입력 시각으로 덮어쓰지 않음 (F-PROD-02)
      await updateBatchStatus(batchId, "in_progress", input.tenantId, { keepPlannedStart: true });
      // 자동출고 공통 진입점 (배치 잠금·회사 확인·줄 단위 트랜잭션, 2026-10-17)
      const { autoIssueMaterialsDispatch } = await import("../lib/production/autoMaterialIssueDispatcher");
      const issueResult = await autoIssueMaterialsDispatch(batchId, input.userId, input.tenantId);
      if (!issueResult?.success) {
        console.warn(`[batchOrchestrator] 원료 자동 출고 일부 실패 (batch=${batchId}):`, issueResult?.errors);
      } else {
        console.log(
          `[batchOrchestrator] 배치 #${batchId} 원료 자동 출고 완료: ${issueResult.issuedMaterials?.length || 0}건`,
        );
      }
    } catch (issueErr: any) {
      console.error(`[batchOrchestrator] 배치 #${batchId} 원료 자동 출고 실패:`, issueErr);
      failures.push(`시작·원료 출고: ${issueErr?.message ?? issueErr}`);
    }
  }

  // === 6. 승인요청 자동 등록 (skipGroupActions가 true면 caller가 그룹 수준에서 처리) ===
  let approvalRequestId: number | null = null;
  if (ccpCreated && !input.skipGroupActions) {
    try {
      const { autoCreateApprovalRequest } = await import("../lib/production/autoApprovalRequest");
      const approvalResult = await autoCreateApprovalRequest(
        batchId, input.userId, null,
      );
      if (approvalResult.success) {
        approvalRequestId = approvalResult.approvalRequestId;
      } else {
        failures.push(`승인요청: ${(approvalResult as any).message ?? "실패"}`);
      }
    } catch (approvalErr: any) {
      console.error("[batchOrchestrator] 승인요청 생성 실패:", approvalErr);
      failures.push(`승인요청: ${approvalErr?.message ?? approvalErr}`);
    }

    // === 6.1. CCP-4P 금속검출 통합 승인요청 (단일 배치 모드) ===
    // CCP-4P는 날짜별 1건 통합 기록지 → 승인요청이 없으면 자동 생성
    // ★ 2026-04-15 수정: 작성자 자동승인 후 'pending_review' 상태 (검토자 단계)
    //   이전: status='approved' 로 즉시 점프 → 검토/승인 단계 건너뛰기 버그
    if (ccpGroups.some(g => g.ccp_type === "CCP-4P")) {
      try {
        const conn4p = await getRawConnection();
        // 그날 열린 금속검출 기록지 (승인 뒤 추가 기록지 포함) — 승인된 기록지의 상태는 바꾸지 않는다 (dayMetalForm)
        const { openDayMetalForm } = await import("../lib/haccp/dayMetalForm");
        const open4p = await openDayMetalForm(conn4p as any, input.tenantId, input.workDate);
        const [ccp4pRecs] = await conn4p.execute<any[]>(
          `SELECT id, batch_id, status, approval_request_id FROM h_ccp_form_records WHERE id = ? AND tenant_id = ? LIMIT 1`,
          [open4p?.id ?? 0, input.tenantId],
        );
        if ((ccp4pRecs as any[]).length > 0) {
          const ccp4pRec = (ccp4pRecs as any[])[0];
          if (!ccp4pRec.approval_request_id) {
            // form_record 는 'submitted' 로 (작성자 완료 + 검토 대기)
            await conn4p.execute(
              `UPDATE h_ccp_form_records SET status='submitted', submitted_at=NOW(), writer_id=? WHERE id=? AND tenant_id=?`,
              [input.userId, ccp4pRec.id, input.tenantId],
            );
            const title4p = `[CCP 기록지-CCP-4P] ${input.workDate} 금속검출 통합`;
            // ★ PR #264: 작성자 사전 검토 단계 추가 (pending_writer → pending_review → ...)
            const desc4p = `금속검출공정 CCP 기록지 (일일 통합)\n작업일: ${input.workDate}\n[작성자 사전 검토 대기]`;
            // ★ Mission 1 fallback: ENUM 미적용 환경에서 pending_writer INSERT 실패 시 pending_review 로 재시도
            let approvalResult4p: any;
            try {
              [approvalResult4p] = await conn4p.execute(
                `INSERT INTO h_approval_requests
                  (site_id, tenant_id, request_type, reference_type, reference_id,
                   title, description, status, priority,
                   requested_by, requested_at, created_at)
                 VALUES (?, ?, 'ccp_form', 'ccp_form_record', ?,
                         ?, ?, 'pending_writer', 'high',
                         ?, NOW(), NOW())`,
                [
                  input.siteId, input.tenantId, ccp4pRec.id,
                  title4p, desc4p,
                  input.userId,
                ],
              );
            } catch (ccp4pWriterErr: any) {
              const isEnumError =
                ccp4pWriterErr?.code === "WARN_DATA_TRUNCATED" ||
                ccp4pWriterErr?.errno === 1265 ||
                /Data truncated/i.test(String(ccp4pWriterErr?.message || ccp4pWriterErr?.sqlMessage || ""));
              if (!isEnumError) throw ccp4pWriterErr;
              console.warn(
                `[batchOrchestrator] CCP-4P pending_writer INSERT 실패 (ENUM 미적용 추정) → pending_review 폴백`,
              );
              [approvalResult4p] = await conn4p.execute(
                `INSERT INTO h_approval_requests
                  (site_id, tenant_id, request_type, reference_type, reference_id,
                   title, description, status, priority,
                   requested_by, requested_at, created_at)
                 VALUES (?, ?, 'ccp_form', 'ccp_form_record', ?,
                         ?, ?, 'pending_review', 'high',
                         ?, NOW(), NOW())`,
                [
                  input.siteId, input.tenantId, ccp4pRec.id,
                  title4p, desc4p,
                  input.userId,
                ],
              );
            }
            const approvalId4p = (approvalResult4p as any).insertId;
            await conn4p.execute(
              `UPDATE h_ccp_form_records SET approval_request_id=? WHERE id=? AND tenant_id=?`,
              [approvalId4p, ccp4pRec.id, input.tenantId],
            );
            console.log(`[batchOrchestrator] CCP-4P 금속검출 통합 승인요청 등록 (pending_review): approvalId=${approvalId4p}`);
            // 기록지 submitted → 같은 날 4P 인스턴스에 반영 (2026-10-12)
            const { syncCcpInstanceStatusFromForm } = await import("../db/haccp/ccpStatusSync");
            await syncCcpInstanceStatusFromForm(ccp4pRec.id, input.tenantId);
          }
        }
      } catch (ccp4pErr: any) {
        failures.push(`금속검출 승인요청: ${ccp4pErr?.message ?? ccp4pErr}`);
        console.error("[batchOrchestrator] CCP-4P 승인요청 생성 실패:", ccp4pErr);
      }
    }

  }

  // === 6.2. CCP-1B / CCP-2B h_ccp_form_records.status → 'submitted' 전환 ===
  // ★ 2026-04-15 수정: 'approved' → 'submitted' (작성자 완료 후 검토 대기)
  //   이전: approved 로 즉시 넘겨 승인 워크플로우 건너뛰기
  //   현재: 작성자 자동승인 단계로 submitted, 검토자가 검토 필요
  if (ccpCreated) {
    try {
      const ccp1b2bConn = await getRawConnection();
      const [updateResult] = await ccp1b2bConn.execute(
        `UPDATE h_ccp_form_records
         SET status = 'submitted', submitted_at = NOW(), writer_id = ?
         WHERE batch_id = ? AND tenant_id = ? AND ccp_type IN ('CCP-1B','CCP-2B')
           AND status NOT IN ('submitted', 'approved')`,
        [input.userId, batchId, input.tenantId],
      );
      const affected = (updateResult as any).affectedRows || 0;
      if (affected > 0) {
        console.log(`[batchOrchestrator] CCP-1B/2B form_record ${affected}건 → submitted (batchId=${batchId})`);
        // 기록지 submitted → 인스턴스에 반영 (2026-10-12, CCP 단일 흐름 1단계)
        const { syncCcpInstanceStatusForBatch } = await import("../db/haccp/ccpStatusSync");
        await syncCcpInstanceStatusForBatch(batchId, input.tenantId);
      }
    } catch (ccp1b2bErr: any) {
      failures.push(`기록지 제출 전환: ${ccp1b2bErr?.message ?? ccp1b2bErr}`);
      console.error("[batchOrchestrator] CCP-1B/2B form_record status 전환 실패:", ccp1b2bErr);
    }
  }

  // === 6.3. 배치별 batch_production 승인요청 생성 (CCP 기록지 인쇄용) ===
  // ★ 2026-04-15 수정:
  //   - status: 'approved' → 'pending_review' (작성자 자동승인 → 검토자 단계)
  //   - 제목: "[CCP 기록지]" prefix 로 생산일지와 구분 (중복 표시 오해 방지)
  //   이전 버그: 검토/승인 단계 건너뛰고 즉시 출력 대기로 점프
  // ★ 2026-05-09 수정 (Mission 1, post-mortem of bulkCreateForDay regression):
  //   PR #264 (353814b) 가 'pending_writer' 상태로 INSERT 하지만 ENUM 마이그
  //   레이션 누락으로 `Data truncated for column 'status'` 발생 → silent fail.
  //   bulkCreateForDay 경로의 모든 batch_production AR 누락 (e.g. 4/20 배치 586/587/588).
  //   픽스:
  //     A) DB ENUM 확장 (sql/step10) — 'pending_writer' 추가
  //     B) startupMigrations idempotent 마이그레이션 — 부팅 시 자동 보정
  //     C) 코드 fallback — 'pending_writer' INSERT 실패 시 'pending_review' 로 재시도
  //        (운영 환경 ENUM 패치 누락된 인스턴스에 대비한 방어선)
  // 중복 생성 방지: 동일 batch_id 의 batch_production AR 이 이미 있으면 skip
  if (ccpCreated && ccpCount > 0) {
    try {
      const bpConn = await getRawConnection();
      const [existing] = await bpConn.execute<any[]>(
        `SELECT id FROM h_approval_requests
         WHERE tenant_id = ? AND request_type = 'batch_production'
           AND reference_type = 'batch' AND reference_id = ?
         LIMIT 1`,
        [input.tenantId, batchId],
      );
      if ((existing as any[]).length === 0) {
        const ccpGroupNames = ccpGroups
          .map((g: any) => `${g.name || g.ccp_type}(${g.ccp_type})`)
          .join(", ");
        const modeLabel = input.mode === "manual" ? "[수동]" : "[자동]";
        const bpTitle = `[CCP 기록지]${modeLabel} ${batchCodeFinal} (${productName})`;
        const bpDescWriter =
          `제품: ${productName}\n계획일: ${input.workDate}\n` +
          `CCP ${ccpCount}건 자동 생성 완료\n배치코드: ${batchCodeFinal}\n` +
          `CCP 공정: ${ccpGroupNames}\n` +
          `[작성자 사전 검토 대기]`;
        const bpDescReview =
          `제품: ${productName}\n계획일: ${input.workDate}\n` +
          `CCP ${ccpCount}건 자동 생성 완료\n배치코드: ${batchCodeFinal}\n` +
          `CCP 공정: ${ccpGroupNames}\n` +
          `[검토 대기 — fallback: pending_writer ENUM 미적용 환경]`;
        // ★ PR #264: pending_writer 로 등록 (작성자 사전 검토 → 검토자 → 승인자)
        try {
          await bpConn.execute(
            `INSERT INTO h_approval_requests
               (site_id, tenant_id, request_type, reference_type, reference_id,
                title, description, status, priority,
                requested_by, requested_at, created_at)
             VALUES (?, ?, 'batch_production', 'batch', ?,
                     ?, ?, 'pending_writer', 'high',
                     ?, NOW(), NOW())`,
            [
              input.siteId, input.tenantId, batchId,
              bpTitle, bpDescWriter,
              input.userId,
            ],
          );
          console.log(`[batchOrchestrator] 배치 #${batchId} batch_production 승인요청 등록 (pending_writer — 작성자 사전 검토 대기)`);
        } catch (writerErr: any) {
          // ★ Fallback: ENUM 에 pending_writer 가 없는 (마이그레이션 미적용) 환경
          //   에서 'Data truncated' 발생 → pending_review 로 재시도하여 데이터 손실 방지
          const isEnumError =
            writerErr?.code === "WARN_DATA_TRUNCATED" ||
            writerErr?.errno === 1265 ||
            /Data truncated/i.test(String(writerErr?.message || writerErr?.sqlMessage || ""));
          if (isEnumError) {
            console.warn(
              `[batchOrchestrator] 배치 #${batchId} pending_writer INSERT 실패 (ENUM 미적용 추정) → pending_review 폴백 시도`,
            );
            await bpConn.execute(
              `INSERT INTO h_approval_requests
                 (site_id, tenant_id, request_type, reference_type, reference_id,
                  title, description, status, priority,
                  requested_by, requested_at, created_at)
               VALUES (?, ?, 'batch_production', 'batch', ?,
                       ?, ?, 'pending_review', 'high',
                       ?, NOW(), NOW())`,
              [
                input.siteId, input.tenantId, batchId,
                bpTitle, bpDescReview,
                input.userId,
              ],
            );
            console.log(
              `[batchOrchestrator] 배치 #${batchId} batch_production 승인요청 등록 (pending_review fallback — ENUM 마이그레이션 필요)`,
            );
          } else {
            // ENUM 외 에러는 외부 catch 로 위임
            throw writerErr;
          }
        }
      }
    } catch (bpErr: any) {
      failures.push(`생산 승인요청: ${bpErr?.message ?? bpErr}`);
      console.error(`[batchOrchestrator] 배치 #${batchId} batch_production 승인요청 생성 실패:`, bpErr);
    }
  }

  // === 7. 일일일지 자동생성 (skipGroupActions가 true면 caller가 그룹 수준에서 처리) ===
  let dailyReportCreated = false;
  if (!input.skipGroupActions) {
    try {
      const { autoGenerateDailyReport } = await import("../lib/production/autoDailyReport");
      const dailyResult = await autoGenerateDailyReport(batchId, input.userId, input.workDate);
      dailyReportCreated = dailyResult.success;
    } catch (dailyErr: any) {
      failures.push(`일일일지: ${dailyErr?.message ?? dailyErr}`);
      console.error("[batchOrchestrator] 일일일지 생성 실패:", dailyErr);
    }
  }

  // === 7.5 주간/월간/연간 일지 자동생성 (auto 모드 + 단일 배치 전용) ===
  let periodicLogsResult: any = null;
  if (!input.skipGroupActions) {
    try {
      const { autoGenerateAllPeriodicLogs } = await import("../lib/production/autoPeriodicLogs");
      periodicLogsResult = await autoGenerateAllPeriodicLogs(
        input.mode,
        input.tenantId,
        input.siteId,
        input.workDate,
        input.userId,
        { batchId, productName, plannedQty: input.plannedQuantityKg },
      );
      if (periodicLogsResult) {
        const newLogs = [periodicLogsResult.weekly, periodicLogsResult.monthly, periodicLogsResult.yearly]
          .filter((r: any) => r?.isNew);
        if (newLogs.length > 0) {
          console.log(`[batchOrchestrator] 기간별 일지 ${newLogs.length}건 자동생성`);
        }
      }
    } catch (periodicErr) {
      console.error("[batchOrchestrator] 기간별 일지 생성 실패:", periodicErr);
    }
  }

  return { approvalRequestId, dailyReportCreated, periodicLogsResult, failures };
}

/** 예정 생산 건 실행 — 트랜잭션 안 부분의 결과. 커밋 뒤 finishBatchActivation 에 넘긴다 */
export interface BatchActivation {
  batchId: number; tenantId: number; userId: number;
  siteId: number; workDate: string; mode: "auto" | "manual"; plannedQuantityKg: number; batchCode: string; productName: string;
  ccpGroups: Array<{ id: number; name: string; ccp_type: string }>;
}

/**
 * 예정 생산 건 실행 (현장 1, 2026-10-19 / 한 단위 2026-10-20 #611 검토 P1) — 그날 처음 확인할 때.
 *
 * 호출자 트랜잭션(conn) 안에서: 생산 건 행 잠금 → 예정 해제(plan_only 1→0) → 진행 중 → 원료 출고(공통 엔진, 같은 연결)
 *   → 남은 미출고 줄 0 확인. 남은 줄이 있거나 오류면 throw — 호출자가 롤백하면 해제·출고가 모두 없던 일이 된다.
 *   현장 확인은 이 결과와 행 확인·이력을 같은 트랜잭션으로 커밋한다 (확인·차감·기록은 함께 성공 — CEO 정책).
 * 커밋 뒤 해야 할 일(결재 요청·일지 등 실행 단계)은 activation_pending = 1 로 남겨 두고 finishBatchActivation 이 한 번 처리한다
 *   (커밋 뒤 프로세스가 멈춰도 다음 확인·조회 때 resumeBatchActivation 이 이어서 한다).
 * 예정일 전이면 막는다. 이미 실행된(또는 예정이 아닌) 생산 건이면 null.
 */
export async function activateBatchInTx(conn: any, batchId: number, tenantId: number, userId: number): Promise<BatchActivation | null> {
  // 무효 처리된 생산 건은 시작·확인하지 않는다 (이력 보존형 복구 — 원본 보존)
  const { assertBatchNotVoided } = await import("../lib/production/batchVoidGuard");
  await assertBatchNotVoided(conn, batchId, tenantId);
  let row: any;
  try {
    [[row]] = await conn.execute(
      `SELECT b.id, b.plan_only, b.status, b.site_id, b.mode, b.planned_quantity, b.batch_code, DATE_FORMAT(b.planned_date, '%Y-%m-%d') AS work_date,
              COALESCE(p.product_name, '') AS product_name, b.setup_pending
         FROM h_batches b LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
        WHERE b.id = ? AND b.tenant_id = ? FOR UPDATE`,
      [batchId, tenantId],
    ) as any;
  } catch (e: any) {
    if (e?.code === "ER_BAD_FIELD_ERROR") return null; // 컬럼 생성 전 DB — 예정 생산 건 없음
    throw e;
  }
  // 생산 건 행을 잠갔으니 같은 생산 건의 다른 첫 확인은 여기서 기다렸다가 plan_only = 0 을 보고 지나간다 (한 번만)
  if (!row || Number(row.plan_only) !== 1) return null;
  // 필수 준비(원료 계획·CCP·기록지·행·SKU)가 끝나지 않은 생산 건은 시작하지 않는다 (생산계획 생애주기 검토 4)
  if (Number(row.setup_pending ?? 0) === 1) {
    throw new Error(`생산 건 ${row.batch_code} 의 준비(원료 계획·CCP 기록지)가 끝나지 않았습니다 — 생산 계획 화면에서 같은 내용으로 다시 생성하면 이어서 준비합니다.`);
  }
  if (String(row.work_date) > todayKST()) {
    throw new Error(`예정 생산 건입니다 — ${row.work_date} 에 확인하면 시작되고 원료가 출고됩니다.`);
  }
  await conn.execute(`UPDATE h_batches SET plan_only = 0, activation_pending = 1 WHERE id = ? AND tenant_id = ?`, [batchId, tenantId]);
  const [gRows]: any = await conn.execute(
    `SELECT DISTINCT g.id, g.name, i.ccp_type FROM h_ccp_instances i LEFT JOIN ccp_process_groups g ON g.id = i.process_group_id AND g.tenant_id = i.tenant_id
      WHERE i.batch_id = ? AND i.tenant_id = ?`,
    [batchId, tenantId],
  );
  const ccpGroups = (gRows as any[]).map((g) => ({ id: Number(g.id), name: String(g.name ?? ""), ccp_type: String(g.ccp_type) }));
  const isAuto = row.mode !== "manual";
  if (isAuto && ccpGroups.length > 0) {
    // 진행 중 — 계획 시작시각 유지 (updateBatchStatus keepPlannedStart 와 같은 규칙: 시작시각이 없을 때만 지금)
    await conn.execute(`UPDATE h_batches SET status = 'in_progress', start_time = COALESCE(start_time, ?), updated_at = ? WHERE id = ? AND tenant_id = ?`,
      [new Date(), new Date(), batchId, tenantId]);
    // 원료 출고 — 공통 엔진을 같은 연결로 (줄마다 SAVEPOINT). 다 출고되지 않으면 확인하지 않는다.
    const { autoIssueMaterialsDispatch } = await import("../lib/production/autoMaterialIssueDispatcher");
    const { countUnissuedBatchLines } = await import("../lib/production/issuedBatchLines");
    const issue = await autoIssueMaterialsDispatch(batchId, userId, tenantId, { txConn: conn });
    const left = await countUnissuedBatchLines(batchId, tenantId, conn);
    if (left > 0 || issue?.busy) {
      const why = [...(issue?.errors ?? []), ...(issue?.warnings ?? [])].slice(0, 3).join(" / ");
      throw new Error(`원료 출고가 끝나지 않아 확인하지 않았습니다 (남은 원료 ${left}줄${why ? ` — ${why}` : ""}). 재고를 확인한 뒤 다시 확인하세요.`);
    }
  }
  return {
    batchId, tenantId, userId, siteId: Number(row.site_id), workDate: String(row.work_date), mode: row.mode === "manual" ? "manual" : "auto",
    plannedQuantityKg: Number(row.planned_quantity), batchCode: String(row.batch_code), productName: String(row.product_name), ccpGroups,
  };
}

/**
 * 커밋 뒤 실행 단계(결재 요청·기록지 제출 전환·일지) — 실행권과 '끝남' 을 분리 (2026-10-20, #612 추가 검토 3).
 *   실행권: activation_claimed_at 을 잡는다 (비어 있거나 5분 넘게 묵은 경우만 — 잡은 뒤 멈춰도 5분 뒤 다른 요청이 이어서).
 *   끝남: 필수 단계가 모두 성공했을 때만 activation_pending 1→0. 하나라도 실패하면 남음 1 그대로 — 다음 확인·재시도가 이어서
 *   (각 단계는 이미 만든 것을 다시 만들지 않는다: 승인요청·문서·일지는 있으면 재사용, 제출 전환은 작성중일 때만).
 */
export async function finishBatchActivation(a: BatchActivation, opts: { startDone?: boolean } = {}): Promise<{ ran: boolean; ok: boolean; failures: string[]; approvalRequestId: number | null; dailyReportCreated: boolean; periodicLogsResult: any }> {
  const conn = await getRawConnection();
  const [claim]: any = await conn.execute(
    `UPDATE h_batches SET activation_claimed_at = NOW() WHERE id = ? AND tenant_id = ? AND activation_pending = 1
        AND (activation_claimed_at IS NULL OR activation_claimed_at < NOW() - INTERVAL 5 MINUTE)`,
    [a.batchId, a.tenantId],
  );
  if (Number(claim?.affectedRows ?? 0) !== 1) return { ran: false, ok: false, failures: [], approvalRequestId: null, dailyReportCreated: false, periodicLogsResult: null }; // 끝났거나 다른 요청이 하는 중
  let r: Awaited<ReturnType<typeof runExecutionSteps>>;
  try {
    r = await runExecutionSteps({
      input: { tenantId: a.tenantId, userId: a.userId, siteId: a.siteId, workDate: a.workDate, mode: a.mode, endTime: undefined, plannedQuantityKg: a.plannedQuantityKg, skipGroupActions: false },
      batchId: a.batchId, batchCodeFinal: a.batchCode, productName: a.productName, ccpCreated: a.ccpGroups.length > 0, ccpCount: a.ccpGroups.length, ccpGroups: a.ccpGroups,
    }, { startDone: opts.startDone ?? true }); // 첫 확인은 출고를 끝냈으니 시작 부분 건너뜀 (지난 날짜가 멈춘 경우만 시작부터)
  } catch (e: any) {
    r = { approvalRequestId: null, dailyReportCreated: false, periodicLogsResult: null, failures: [`실행 단계: ${e?.message ?? e}`] };
  }
  const ok = r.failures.length === 0;
  await conn.execute(
    ok ? `UPDATE h_batches SET activation_pending = 0, activation_claimed_at = NULL WHERE id = ? AND tenant_id = ?`
       : `UPDATE h_batches SET activation_claimed_at = NULL WHERE id = ? AND tenant_id = ?`,
    [a.batchId, a.tenantId],
  );
  if (!ok) console.warn(`[finishBatchActivation] 배치 #${a.batchId} 실행 단계 남음 — 다음에 이어서: ${r.failures.join(" / ")}`);
  if (ok) {
    try {
      const { createAuditLog } = await import("../db");
      await createAuditLog({ action: "batch.plan_activate", entityType: "batch", entityId: a.batchId, userId: a.userId, userEmail: "", userRole: "", description: `생산 건 실행 단계 완료 (${a.batchCode})`, changes: { workDate: a.workDate } } as any, a.tenantId);
    } catch { /* 감사 기록 실패는 기존 방식대로 무시 */ }
  }
  return { ran: true, ok, ...r };
}

/**
 * 커밋 뒤 실행 단계가 남은 생산 건(프로세스 중단 등)을 이어서 처리 — 남은 게 없으면 아무것도 하지 않는다.
 */
export async function resumeBatchActivation(batchId: number, tenantId: number, userId: number): Promise<boolean> {
  const conn = await getRawConnection();
  let row: any;
  try {
    [[row]] = await conn.execute(
      `SELECT b.id, b.activation_pending, b.setup_pending, b.status, b.site_id, b.mode, b.planned_quantity, b.batch_code, DATE_FORMAT(b.planned_date, '%Y-%m-%d') AS work_date,
              COALESCE(p.product_name, '') AS product_name
         FROM h_batches b LEFT JOIN h_products_v2 p ON p.id = b.product_id AND p.tenant_id = b.tenant_id
        WHERE b.id = ? AND b.tenant_id = ?`,
      [batchId, tenantId],
    ) as any;
  } catch (e: any) {
    if (e?.code === "ER_BAD_FIELD_ERROR") return false;
    throw e;
  }
  if (!row || Number(row.activation_pending) !== 1) return false;
  if (Number(row.setup_pending ?? 0) === 1) return false; // 준비가 끝나야 실행 단계
  const [gRows]: any = await conn.execute(
    `SELECT DISTINCT g.id, g.name, i.ccp_type FROM h_ccp_instances i LEFT JOIN ccp_process_groups g ON g.id = i.process_group_id AND g.tenant_id = i.tenant_id
      WHERE i.batch_id = ? AND i.tenant_id = ?`,
    [batchId, tenantId],
  );
  const r = await finishBatchActivation({
    batchId, tenantId, userId, siteId: Number(row.site_id), workDate: String(row.work_date), mode: row.mode === "manual" ? "manual" : "auto",
    plannedQuantityKg: Number(row.planned_quantity), batchCode: String(row.batch_code), productName: String(row.product_name),
    ccpGroups: (gRows as any[]).map((g) => ({ id: Number(g.id), name: String(g.name ?? ""), ccp_type: String(g.ccp_type) })),
  }, { startDone: String(row.status) !== "planned" });
  return r.ran; // 다른 요청이 실행권을 잡고 있으면 false (겹쳐 실행하지 않음)
}

/**
 * 예정 생산 건 실행 — 혼자 쓰는 경로(기록지 확인·제출 등). 한 트랜잭션으로 실행하고 커밋 뒤 실행 단계.
 */
export async function ensureBatchActivated(batchId: number, tenantId: number, userId: number): Promise<{ activated: boolean }> {
  const { withTransaction } = await import("../db/connection");
  const a = await withTransaction((conn) => activateBatchInTx(conn, batchId, tenantId, userId), "ensureBatchActivated");
  if (!a) {
    await resumeBatchActivation(batchId, tenantId, userId);
    return { activated: false };
  }
  await finishBatchActivation(a);
  return { activated: true };
}

/**
 * 기록지 확인(제출)으로 예정 생산 건 실행 — 생산 건 기록지면 그 생산 건, 금속검출(날짜별 하나)이면 그날의 예정 생산 건 전부.
 */
export async function ensureActivatedForFormRecord(formRecordId: number, tenantId: number, userId: number): Promise<number> {
  const conn = await getRawConnection();
  const [[fr]]: any = await conn.execute(
    `SELECT batch_id, ccp_type, DATE_FORMAT(work_date, '%Y-%m-%d') AS wd FROM h_ccp_form_records WHERE id = ? AND tenant_id = ?`,
    [formRecordId, tenantId],
  );
  if (!fr) return 0;
  const { assertFormNotVoided, assertBatchNotVoided } = await import("../lib/production/batchVoidGuard");
  await assertFormNotVoided(conn, formRecordId, tenantId);
  if (fr.batch_id && String(fr.ccp_type) !== "CCP-4P") await assertBatchNotVoided(conn, Number(fr.batch_id), tenantId);
  let ids: number[] = [];
  if (fr.batch_id) ids = [Number(fr.batch_id)];
  else if (String(fr.ccp_type) === "CCP-4P") {
    try {
      const [rows]: any = await conn.execute(`SELECT id FROM h_batches WHERE tenant_id = ? AND planned_date = ? AND plan_only = 1 AND status <> 'cancelled' ORDER BY id`, [tenantId, fr.wd]);
      ids = (rows as any[]).map((r) => Number(r.id));
    } catch (e: any) {
      if (e?.code !== "ER_BAD_FIELD_ERROR") throw e;
    }
  }
  let n = 0;
  for (const id of ids) if ((await ensureBatchActivated(id, tenantId, userId)).activated) n++;
  return n;
}

/**
 * 배치 코드 자동 생성
 * 형식: {product_code}-{YYYYMMDD}-{시퀀스}
 */
async function generateBatchCode(
  tenantId: number,
  productId: number,
  workDate: string,
): Promise<string> {
  const conn = await getRawConnection();

  // 제품 코드 조회 (h_products_v2 → item_master 폴백)
  // ★ 2026-05-08: h_products_v2 미등록 product_id 폴백 — item_master.item_code 사용
  let productCode = "00000";
  try {
    const [rows] = await conn.execute<any[]>(
      `SELECT COALESCE(p.product_code, im.item_code) AS product_code
       FROM (SELECT ? AS product_id, ? AS tenant_id) q
       LEFT JOIN h_products_v2 p ON p.id = q.product_id AND p.tenant_id = q.tenant_id
       LEFT JOIN item_master im ON im.id = q.product_id AND im.tenant_id = q.tenant_id
       LIMIT 1`,
      [productId, tenantId],
    );
    if ((rows as any[]).length > 0 && (rows as any[])[0].product_code) {
      productCode = (rows as any[])[0].product_code;
    }
  } catch { /* use default */ }

  // 해당 날짜의 기존 배치 수 조회
  const dateStr = workDate.replace(/-/g, "");
  const [countRows] = await conn.execute<any[]>(
    "SELECT COUNT(*) as cnt FROM h_batches WHERE tenant_id=? AND batch_code LIKE ?",
    [tenantId, `${productCode}-${dateStr}-%`],
  );
  const seq = ((countRows as any[])[0]?.cnt || 0) + 1;

  return `${productCode}-${dateStr}-${String(seq).padStart(3, "0")}`;
}
