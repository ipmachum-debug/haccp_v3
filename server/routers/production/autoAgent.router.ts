/**
 * 생산 자동화 에이전트 라우터
 *
 * 자연어 입력 → 파싱 → 검증(preview) → 실행(execute)
 * "오늘 초코크림 케이크 3,200kg 생산, 시작 08:00" → 배치+CCP+체크리스트 자동 생성
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";

export const autoAgentRouter = router({
  /**
   * 1단계: 자연어 파싱 + 검증 미리보기
   * 실제 DB에 아무것도 쓰지 않고 실행 계획만 반환
   */
  preview: tenantRequiredProcedure
    .input(z.object({
      text: z.string().min(1).max(5000),
      workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId!;
      const userId = ctx.user!.id;

      // 1) 자연어 파싱 (정규식 + DB 제품 매칭)
      const parsed = await parseAndMatchProducts(input.text, tenantId);

      if (!parsed?.items?.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "입력에서 생산 정보를 인식할 수 없습니다. 예: '초코크림 케이크 3200kg'",
        });
      }

      // 2) 각 항목별 검증
      const { getDb } = await import("../../db");
      const db = await getDb();
      const plans = [];

      for (const item of parsed.items) {
        const productId = item.matched?.productId || item.productId;
        const productName = item.matched?.productName || item.productName || item.rawName;
        const quantity = item.quantityKg || item.quantity || 0;

        if (!productId) {
          plans.push({
            status: "error" as const,
            productName: item.rawName || productName || "알 수 없음",
            quantity,
            error: `제품 "${item.rawName || productName}"을(를) 찾을 수 없습니다`,
          });
          continue;
        }

        // 레시피/BOM 조회
        let bomInfo = null;
        try {
          const [bomRows]: any = await db.execute(
            `SELECT v.batch_target_kg, v.id as version_id
             FROM h_mf_reports r
             JOIN h_mf_report_versions v ON v.report_id = r.id AND v.is_current = 1
             WHERE r.tenant_id = ? AND r.product_id = ?
             LIMIT 1` as any,
            [tenantId, productId]
          );
          if (bomRows?.[0]) {
            const batchKg = Number(bomRows[0].batch_target_kg) || 0;
            const batchCount = batchKg > 0 ? Math.ceil(quantity / batchKg) : 1;
            bomInfo = { batchKg, batchCount, versionId: bomRows[0].version_id };
          }
        } catch {}

        // CCP 매핑 확인
        let ccpCount = 0;
        try {
          const [ccpRows]: any = await db.execute(
            `SELECT COUNT(DISTINCT pg.id) as cnt
             FROM h_mf_report_lines l
             JOIN h_process_groups pg ON pg.id = l.process_group_id
             JOIN h_product_ccp_mapping m ON m.process_group_id = pg.id AND m.tenant_id = ?
             WHERE l.version_id = ? AND l.tenant_id = ?` as any,
            [tenantId, bomInfo?.versionId || 0, tenantId]
          );
          ccpCount = ccpRows?.[0]?.cnt || 0;
        } catch {}

        // 체크리스트 템플릿 수
        let checklistCount = 0;
        try {
          const [clRows]: any = await db.execute(
            `SELECT COUNT(*) as cnt FROM h_checklist_templates
             WHERE tenant_id = ? AND is_active = 1
             AND frequency IN ('daily', 'batch_create')` as any,
            [tenantId]
          );
          checklistCount = clRows?.[0]?.cnt || 0;
        } catch {}

        plans.push({
          status: "ready" as const,
          productId,
          productName,
          quantity,
          unit: "kg",
          bomInfo,
          ccpCount,
          checklistCount,
          startTime: input.startTime || parsed.startTime || "09:00",
        });
      }

      return {
        workDate: input.workDate || new Date().toISOString().slice(0, 10),
        startTime: input.startTime || parsed.startTime || "09:00",
        plans,
        rawParsed: parsed,
      };
    }),

  /**
   * 2단계: 사이트 ID 조회 (프론트에서 batch.bulkCreateForDay 호출 시 필요)
   */
  getSiteId: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      const { getDb } = await import("../../db");
      const db = await getDb();
      const [rows]: any = await db.execute(
        `SELECT id FROM h_sites WHERE tenant_id = ? LIMIT 1` as any,
        [ctx.tenantId]
      );
      return { siteId: rows?.[0]?.id || 1 };
    }),
});

async function parseAndMatchProducts(text: string, tenantId: number) {
  const items: any[] = [];
  const lines = text.split(/[,\n]/);
  for (const line of lines) {
    const match = line.match(/(.+?)\s*([\d,]+)\s*(?:kg|킬로)/i);
    if (match) {
      items.push({
        rawName: match[1].trim().replace(/^오늘\s*생산\s*:?\s*/i, "").replace(/^생산\s*:?\s*/i, "").trim(),
        quantityKg: Number(match[2].replace(/,/g, "")),
      });
    }
  }
  const timeMatch = text.match(/(\d{1,2}):(\d{2})/);

  // DB에서 제품명 매칭
  if (items.length > 0) {
    const { getDb } = await import("../../db");
    const db = await getDb();
    for (const item of items) {
      try {
        const [rows]: any = await db.execute(
          `SELECT id, product_name FROM h_products_v2
           WHERE tenant_id = ? AND product_name LIKE ?
           ORDER BY
             CASE WHEN product_name = ? THEN 0
                  WHEN product_name LIKE ? THEN 1
                  ELSE 2 END
           LIMIT 1` as any,
          [tenantId, `%${item.rawName}%`, item.rawName, `${item.rawName}%`]
        );
        if (rows?.[0]) {
          item.matched = { productId: rows[0].id, productName: rows[0].product_name };
          item.productId = rows[0].id;
          item.productName = rows[0].product_name;
        }
      } catch {}
    }
  }

  return {
    items,
    startTime: timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : undefined,
  };
}
