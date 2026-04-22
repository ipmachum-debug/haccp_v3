// product 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { getDb } from "../../db";

export const productRouter = router({
    list: tenantRequiredProcedure
      .input(
        z.object({
          page: z.number().default(1),
          limit: z.number().default(20),
          search: z.string().optional(),
          category: z.string().optional(),
          sortBy: z.enum(["productCode", "productName", "category", "createdAt"]).optional(),
          sortOrder: z.enum(["asc", "desc"]).optional()
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const { hProductsV2 } = await import("../../../drizzle/schema/schema_main.js");
        
        const page = input?.page || 1;
        const limit = input?.limit || 20;
        const offset = (page - 1) * limit;
        
        const conditions = [eq(hProductsV2.tenantId, ctx.tenantId), eq(hProductsV2.isActive, 1)];
        
        if (input?.search) {
          conditions.push(
            or(
              like(hProductsV2.productName, `%${input.search}%`),
              like(hProductsV2.productCode, `%${input.search}%`)
            )!
          );
        }
        if (input?.category) {
          conditions.push(eq(hProductsV2.category, input.category));
        }
        
        const totalResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(hProductsV2)
          .where(and(...conditions));
        const total = Number(totalResult[0]?.count || 0);
        
        const orderByClause = input?.sortBy === "productCode"
          ? (input?.sortOrder === "desc" ? desc(hProductsV2.productCode) : asc(hProductsV2.productCode))
          : input?.sortBy === "productName"
          ? (input?.sortOrder === "desc" ? desc(hProductsV2.productName) : asc(hProductsV2.productName))
          : input?.sortBy === "category"
          ? (input?.sortOrder === "desc" ? desc(hProductsV2.category) : asc(hProductsV2.category))
          : desc(hProductsV2.createdAt);
        
        const items = await db
          .select()
          .from(hProductsV2)
          .where(and(...conditions))
          .limit(limit)
          .offset(offset)
          .orderBy(orderByClause);
        
        return { items, total, page, limit };
      }),
    // 제품 전체 내보내기 (엑셀 다운로드용)
    exportAll: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const { hProductsV2 } = await import("../../../drizzle/schema/schema_main.js");
        
        const items = await db
          .select()
          .from(hProductsV2)
          .where(and(
            eq(hProductsV2.tenantId, ctx.tenantId),
            eq(hProductsV2.isActive, 1)
          ))
          .orderBy(asc(hProductsV2.productCode));
        
        return { items, total: items.length };
      }),
    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getProductById } = await import("../../db.js");
        return await getProductById(input.id, tenantId ?? undefined);
      }),
    updateCcpMapping: tenantRequiredProcedure
      .input(
        z.object({
          productId: z.number(),
          ccpTypes: z.array(z.string())
        })
      )
      .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { updateProductCcpMapping } = await import("../../db.js");
        await updateProductCcpMapping(input.productId, input.ccpTypes, tenantId ?? undefined);
        return { success: true };
      }),
    create: adminProcedure
      .input(
        z.object({
          productName: z.string().min(1),
          productCode: z.string().min(1),
          category: z.string().optional(),
          unit: z.string().optional(),
          shelfLifeMonths: z.number().optional(),
          description: z.string().optional(),
          isActive: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const { hProductsV2 } = await import("../../../drizzle/schema/schema_main.js");
        const { shelfLifeMonths, ...rest } = input;
        const shelfLifeDays = shelfLifeMonths ? shelfLifeMonths * 30 : undefined;
        const result = await db.insert(hProductsV2).values({
          ...rest,
          shelfLifeDays,
          tenantId: ctx.tenantId,
          isActive: input.isActive ?? 1,
        });
        const newProductId = Number(result[0].insertId);

        // item_master 테이블에도 동기화 (upsert — UNIQUE 충돌 시 기존 행 연결)
        const { syncProductToItemMaster } = await import("../../db/production/itemMasterSync.js");
        await syncProductToItemMaster(db, {
          tenantId: ctx.tenantId,
          productId: newProductId,
          productCode: input.productCode,
          productName: input.productName,
          category: input.category,
          unit: input.unit,
          shelfLifeDays,
          description: input.description,
          isActive: input.isActive ?? 1,
        });

        return { success: true, id: newProductId };
      }),
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          productName: z.string().optional(),
          productCode: z.string().optional(),
          category: z.string().optional(),
          unit: z.string().optional(),
          shelfLifeMonths: z.number().optional(),
          description: z.string().optional(),
          isActive: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const { hProductsV2 } = await import("../../../drizzle/schema/schema_main.js");
        const { id, shelfLifeMonths, ...rest } = input;
        const shelfLifeDays = shelfLifeMonths ? shelfLifeMonths * 30 : undefined;
        const updateData: any = { ...rest };
        if (shelfLifeDays !== undefined) updateData.shelfLifeDays = shelfLifeDays;
        await db.update(hProductsV2).set(updateData).where(eq(hProductsV2.id, id));

        // item_master 테이블 동기화 (legacyProductId 우선, 없으면 itemCode 로 연결/신규)
        // 최신 값으로 동기화하기 위해 DB 에서 현재 값을 읽은 후 sync 호출
        const [current] = await db.select().from(hProductsV2).where(eq(hProductsV2.id, id)).limit(1);
        if (current) {
          const { syncProductToItemMaster } = await import("../../db/production/itemMasterSync.js");
          await syncProductToItemMaster(db, {
            tenantId: ctx.tenantId,
            productId: id,
            productCode: current.productCode,
            productName: current.productName,
            category: current.category,
            unit: current.unit,
            shelfLifeDays: current.shelfLifeDays,
            description: current.description,
            isActive: current.isActive,
          });
        }

        // h_products (v1) 동기화 제거 — h_products_v2로 통합 완료

        // CCP 비정규화 제품명 동기화 (해당 제품의 배치에 연결된 CCP 레코드)
        if (rest.productName) {
          try {
            const { getRawConnection } = await import("../../db/connection");
            const pool = await getRawConnection();
            if (pool) {
              // h_ccp_instances - 배치 기반 CCP 인스턴스
              await pool.execute(
                `UPDATE h_ccp_instances ci
                 JOIN h_batches b ON ci.batch_id = b.id
                 SET ci.product_name = ?
                 WHERE b.product_id = ? AND b.tenant_id = ?`,
                [rest.productName, id, ctx.tenantId]
              );
              // h_ccp_form_records - CCP 폼 레코드
              await pool.execute(
                `UPDATE h_ccp_form_records cfr
                 JOIN h_batches b ON cfr.batch_id = b.id
                 SET cfr.product_name = ?
                 WHERE b.product_id = ? AND b.tenant_id = ?`,
                [rest.productName, id, ctx.tenantId]
              );
              // h_ccp_form_rows - CCP 폼 데이터 행
              await pool.execute(
                `UPDATE h_ccp_form_rows r
                 JOIN h_ccp_form_records cfr ON r.form_record_id = cfr.id
                 JOIN h_batches b ON cfr.batch_id = b.id
                 SET r.product_name = ?
                 WHERE b.product_id = ? AND b.tenant_id = ?`,
                [rest.productName, id, ctx.tenantId]
              );
            }
          } catch (ccpSyncErr) {
            console.error('CCP 제품명 동기화 실패:', ccpSyncErr);
          }
        }
        
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const { hProductsV2 } = await import("../../../drizzle/schema/schema_main.js");
        await db.update(hProductsV2).set({ isActive: 0 } as any).where(and(eq(hProductsV2.id, input.id), eq(hProductsV2.tenantId, ctx.tenantId as any) ));

        // item_master 비활성화 동기화
        const { deactivateLinkedItemMaster } = await import("../../db/production/itemMasterSync.js");
        await deactivateLinkedItemMaster(db, ctx.tenantId, input.id);
        
        return { success: true };
      }),

    // 자동 코드 생성
    generateCode: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { generateProductCode } = await import("../../db/system/codeGenerator.js");
        return await generateProductCode(ctx.tenantId);
      }),

    // 일괄 등록 (UPSERT - 동일 제품명 있으면 수정, 없으면 신규)
    bulkCreate: adminProcedure
      .input(
        z.object({
          products: z.array(
            z.object({
              productCode: z.string().optional(),
              productName: z.string().min(1),
              category: z.string().optional(),
              unit: z.string().optional(),
              shelfLifeMonths: z.number().optional(),
              description: z.string().optional()
            })
          )
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const { hProductsV2 } = await import("../../../drizzle/schema/schema_main.js");
        const { createUploadHistory } = await import("../../db/system/uploadHistory.js");
        
        const results = { successCount: 0, insertCount: 0, updateCount: 0, failureCount: 0, errors: [] as any[] };

        // 통일된 제품코드 생성기 사용 (숫자 형식: 30001, 30002...)
        const { generateProductCode } = await import("../../db/system/codeGenerator.js");

        for (let i = 0; i < input.products.length; i++) {
          try {
            const product = input.products[i];
            if (!product.productName?.trim()) {
              results.errors.push({ row: i + 2, productName: "", message: "제품명이 비어있습니다" });
              results.failureCount++;
              continue;
            }
            
            const existing = await db.select().from(hProductsV2)
              .where(and(eq(hProductsV2.tenantId, ctx.tenantId as any) , eq(hProductsV2.productName, product.productName.trim())) as any)
              .limit(1);
            
            const shelfLifeDays = product.shelfLifeMonths ? product.shelfLifeMonths * 30 : undefined;
            
            if (existing.length > 0) {
              const updateData: any = {};
              if (product.category !== undefined) updateData.category = product.category;
              if (product.unit !== undefined) updateData.unit = product.unit;
              if (shelfLifeDays !== undefined) updateData.shelfLifeDays = shelfLifeDays;
              if (product.description !== undefined) updateData.description = product.description;
              
              if (Object.keys(updateData).length > 0) {
                await db.update(hProductsV2).set(updateData).where(eq(hProductsV2.id, existing[0].id));
              }
              results.updateCount++;
            } else {
              const productCode = product.productCode || await generateProductCode(ctx.tenantId);
              
              const insertResult = await db.insert(hProductsV2).values({
                tenantId: ctx.tenantId,
                productCode,
                productName: product.productName.trim(),
                category: product.category || null,
                unit: product.unit || null,
                shelfLifeDays: shelfLifeDays || null,
                description: product.description || null,
              });

              // item_master 동기화 (upsert — UNIQUE 충돌 시 기존 행 연결)
              const { syncProductToItemMaster } = await import("../../db/production/itemMasterSync.js");
              await syncProductToItemMaster(db, {
                tenantId: ctx.tenantId,
                productId: Number(insertResult[0].insertId),
                productCode,
                productName: product.productName.trim(),
                category: product.category,
                unit: product.unit,
                shelfLifeDays,
                description: product.description,
                isActive: 1,
              });
              results.insertCount++;
            }
            results.successCount++;
          } catch (error: any) {
            results.failureCount++;
            results.errors.push({ row: i + 2, productName: input.products[i].productName, message: error.message || "등록 실패" });
          }
        }
        
        await createUploadHistory({
          uploadType: "product",
          userId: ctx.user.id,
          userName: ctx.user.name,
          fileName: "Excel Upload",
          totalCount: input.products.length,
          successCount: results.successCount,
          errorCount: results.failureCount,
          errors: results.errors
        });
        
        return results;
      }),

    /**
     * 제품 마스터(h_products_v2) → 품목 마스터(item_master) 일괄 동기화.
     * 과거 sync 가 실패했거나 레거시 마이그레이션으로 누락된 제품을 복구하는 관리자 도구.
     * 테넌트 단위로만 동작하며, 각 행마다 upsert (기존 행이 있으면 갱신).
     */
    backfillItemMaster: adminProcedure.mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB 연결 실패");
      const { hProductsV2 } = await import("../../../drizzle/schema/schema_main.js");
      const { syncProductToItemMaster } = await import("../../db/production/itemMasterSync.js");

      const rows = await db
        .select()
        .from(hProductsV2)
        .where(eq(hProductsV2.tenantId, ctx.tenantId as any));

      const summary = {
        total: rows.length,
        inserted: 0,
        linked: 0,
        updated: 0,
        errors: 0,
        errorDetails: [] as Array<{ productCode: string; message: string }>,
      };

      for (const r of rows) {
        try {
          const action = await syncProductToItemMaster(db, {
            tenantId: ctx.tenantId,
            productId: r.id,
            productCode: r.productCode,
            productName: r.productName,
            category: r.category,
            unit: r.unit,
            shelfLifeDays: r.shelfLifeDays,
            description: r.description,
            isActive: r.isActive,
          });
          if (action === "inserted") summary.inserted++;
          else if (action === "linked") summary.linked++;
          else if (action === "updated") summary.updated++;
        } catch (e: any) {
          summary.errors++;
          summary.errorDetails.push({
            productCode: r.productCode,
            message: e?.message ?? String(e),
          });
        }
      }

      return summary;
    }),
});
