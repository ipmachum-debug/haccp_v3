/**
 * 생산 자동화 에이전트 라우터
 *
 * 자연어 입력 → 파싱 → 검증(preview) → 실행(execute)
 * "오늘 초코크림 케이크 3,200kg 생산, 시작 08:00" → 배치+CCP+체크리스트 자동 생성
 *
 * ★ DB 접근: getRawConnection() + pool.execute(sql, [params]) 패턴 사용
 *   (getDb()는 drizzle 인스턴스라 위치 파라미터 쿼리 미지원)
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getRawConnection } from "../../db";

export const autoAgentRouter = router({
  preview: tenantRequiredProcedure
    .input(z.object({
      text: z.string().min(1).max(5000),
      workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId!;
      const parsed = await parseAndMatchProducts(input.text, tenantId);

      if (!parsed?.items?.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "입력에서 생산 정보를 인식할 수 없습니다. 예: '초코크림 케이크 3200kg'",
        });
      }

      const pool = await getRawConnection();
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

        // BOM 조회
        let bomInfo = null;
        try {
          const [bomRows]: any = await pool.execute(
            `SELECT v.batch_target_kg, v.id as version_id
             FROM h_mf_reports r
             JOIN h_mf_report_versions v ON v.mf_report_id = r.id
             WHERE r.tenant_id = ? AND r.product_id = ?
             ORDER BY v.version_no DESC LIMIT 1`,
            [tenantId, productId]
          );
          if (bomRows?.[0]) {
            const batchKg = Number(bomRows[0].batch_target_kg) || 0;
            const batchCount = batchKg > 0 ? Math.ceil(quantity / batchKg) : 1;
            bomInfo = { batchKg, batchCount, versionId: bomRows[0].version_id };
          }
        } catch {}

        // CCP 수
        let ccpCount = 0;
        try {
          const [ccpRows]: any = await pool.execute(
            `SELECT COUNT(DISTINCT ccp_type) as cnt FROM h_ccp_instances
             WHERE tenant_id = ? AND batch_id IN (
               SELECT id FROM h_batches WHERE tenant_id = ? AND product_id = ? ORDER BY id DESC LIMIT 1
             )`,
            [tenantId, tenantId, productId]
          );
          ccpCount = ccpRows?.[0]?.cnt || 0;
        } catch {}
        if (ccpCount === 0) ccpCount = 4;

        // 체크리스트 수
        let checklistCount = 0;
        try {
          const [clRows]: any = await pool.execute(
            `SELECT COUNT(*) as cnt FROM h_checklist_templates WHERE tenant_id = ? AND is_active = 1`,
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

  getSiteId: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      const pool = await getRawConnection();
      const [rows]: any = await pool.execute(
        `SELECT id FROM h_sites WHERE tenant_id = ? LIMIT 1`,
        [ctx.tenantId]
      );
      return { siteId: rows?.[0]?.id || 1 };
    }),
});

// ─── 유틸 함수 ───

function normalize(s: string): string {
  return s.replace(/[\s\(\)\[\]·\-_]/g, "").toLowerCase();
}

function tokenize(s: string): string[] {
  return s.split(/[\s\(\)\[\]·\-_,]+/).filter(t => t.length > 0).map(t => t.toLowerCase());
}

function tokenMatchScore(inputTokens: string[], dbName: string): number {
  const dbNorm = normalize(dbName);
  const dbLower = dbName.toLowerCase();
  let matched = 0;
  for (const token of inputTokens) {
    if (dbNorm.includes(token) || dbLower.includes(token)) matched++;
  }
  if (matched === 0) return 0;
  return (matched / inputTokens.length) * 70 + (matched / Math.max(tokenize(dbName).length, 1)) * 30;
}

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

  if (items.length > 0) {
    const pool = await getRawConnection();
    let allProducts: any[] = [];
    try {
      const [productRows]: any = await pool.execute(
        `SELECT id, product_name FROM h_products_v2 WHERE tenant_id = ?`,
        [tenantId]
      );
      allProducts = productRows || [];
    } catch {}

    for (const item of items) {
      const input = normalize(item.rawName);
      const inputTokens = tokenize(item.rawName);
      let bestMatch: any = null;
      let bestScore = 0;

      for (const p of allProducts) {
        const pName = normalize(p.product_name);
        if (pName === input) { bestMatch = p; bestScore = 100; break; }
        if (pName.includes(input) || input.includes(pName)) {
          const score = Math.min(input.length, pName.length) / Math.max(input.length, pName.length) * 85;
          if (score > bestScore) { bestMatch = p; bestScore = score; }
        }
        if (inputTokens.length >= 1) {
          const tScore = tokenMatchScore(inputTokens, p.product_name);
          if (tScore > bestScore) { bestMatch = p; bestScore = tScore; }
        }
      }

      if (bestMatch && bestScore >= 30) {
        item.matched = { productId: bestMatch.id, productName: bestMatch.product_name };
        item.productId = bestMatch.id;
        item.productName = bestMatch.product_name;
      }
    }
  }

  return {
    items,
    startTime: timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}` : undefined,
  };
}
