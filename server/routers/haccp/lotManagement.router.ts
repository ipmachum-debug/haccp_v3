// lotManagement 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { lt, or } from "drizzle-orm";
import { getDb, getRawConnection } from "../../db";

import { todayKST } from "../../utils/timezone";

export const lotManagementRouter = router({
    // 원재료 입고 + LOT 자동 생성 + 매입전표 자동 생성
    createReceivingWithLot: tenantRequiredProcedure
      .input(z.object({
        materialId: z.number(),
        materialCode: z.string(),
        quantity: z.number(),
        unit: z.string().default('kg'),
        unitPrice: z.number().optional(),
        supplierName: z.string().optional(),
        partnerId: z.number().optional(), // 마스터 거래처 ID
        expiryDate: z.string().optional(),
        receiptDate: z.string().optional(),
        notes: z.string().optional(),
        idempotencyKey: z.string().min(8).max(64).optional(), // 화면이 만든 요청 키 — 더블 클릭에 입고 한 번
      }))
      .mutation(async ({ input, ctx }) => {
        // ★ 2026-10-17 (입고 정본화 PR-4): 직접 입고 = 입고 문서 + 입고 확정 (재고 반영 한 곳).
        //   이전: LOT·재고를 따로 만들고 연결 없는 대기 매입전표(material_receipt) 를 만들었다 — 승인하면 LOT 이 한 벌 더.
        //   지금: 단가가 있으면 입고 줄에 연결된 대기 전표 초안 (전표 확정 = 분개만).
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const { generateMaterialLotNumber } = await import("../../db/haccp/visualInspection");
        const { receiveDirect } = await import("../../lib/inventory/inbound/inboundService");
        const receiptDate = input.receiptDate || todayKST();
        const lotNumber = await generateMaterialLotNumber(db, ctx.tenantId, input.materialCode, receiptDate);
        const r = await receiveDirect({
          tenantId: ctx.tenantId, userId: ctx.user.id, idempotencyKey: input.idempotencyKey ?? null,
          materialId: input.materialId, quantity: input.quantity, unit: input.unit, unitPrice: input.unitPrice ?? null,
          // 거래처는 선택한 id 만 (회사 소속 검증) — 자유 입력 이름은 원문으로 따로 보존, 이름으로 id 추정 안 함 (Codex #560 검증 N4)
          supplierId: input.partnerId ?? null, supplierName: input.partnerId ? null : (input.supplierName ?? null),
          receiptDate, expiryDate: input.expiryDate ?? null,
          lotNumber, notes: input.notes ?? null, createVoucherDraft: true,
        });
        return {
          success: true, status: r.status, lotId: r.lotId, lotNumber: r.lotNumber || lotNumber, inboundHeaderId: r.headerId,
          accountingPurchaseCreated: r.voucherIds.length > 0, pendingApproval: r.status === "pending_approval",
        };
      }),

    // LOT 이력 조회 (입고→사용→출고 추적)
    getLotHistory: tenantRequiredProcedure
      .input(z.object({
        materialId: z.number().optional(),
        lotNumber: z.string().optional(),
        limit: z.number().optional(),
      }))
      .query(async ({ input, ctx }) => {
        const { getDb } = await import("../../db");
        const db = await getDb();
        if (!db) return [];
        try {
          const { getMaterialLotHistory } = await import("../../db/haccp/visualInspection");
          return await getMaterialLotHistory(db, ctx.tenantId, input);
        } catch (err) {
          console.error('[lotManagement.getLotHistory]', err);
          return [];
        }
      }),

    // 기존 입고 건 LOT 일괄 생성 (backfill) — 중단 (2026-10-17, 입고 정본화 PR-4)
    //   이전: LOT 번호 없는 입고마다 LOT 을 새로 만들었다 — 다른 경로로 이미 재고가 잡힌 입고면 이중 계상.
    //   기존 행을 이름·날짜로 자동 연결·생성하지 않는다 (Codex 권고). 누락 재고는 실사·재고 조정으로.
    backfillLots: tenantRequiredProcedure
      .mutation(async () => {
        throw new TRPCError({ code: "FORBIDDEN", message: "LOT 일괄 생성은 중단되었습니다 (이중 계상 위험). 누락 재고는 실사·재고 조정으로 처리하세요." });
      }),
});
