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
        if (!db) throw new Error("Database connection failed");
        const { hProductsV2 } = await import("../../../drizzle/schema_main.js");
        
        const page = input?.page || 1;
        const limit = input?.limit || 20;
        const offset = (page - 1) * limit;
        
        const conditions = [eq(hProductsV2.tenantId, ctx.tenantId ?? undefined), eq(hProductsV2.isActive, 1)];
        
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
        if (!db) throw new Error("Database connection failed");
        const { hProductsV2 } = await import("../../../drizzle/schema_main.js");
        
        const items = await db
          .select()
          .from(hProductsV2)
          .where(and(
            eq(hProductsV2.tenantId, ctx.tenantId ?? undefined),
            eq(hProductsV2.isActive, 1)
          ))
          .orderBy(asc(hProductsV2.productCode));
        
        return { items, total: items.length };
      }),
    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getProductById } = await import("../../db.js");
        return await getProductById(input.id);
      }),
    updateCcpMapping: tenantRequiredProcedure
      .input(
        z.object({
          productId: z.number(),
          ccpTypes: z.array(z.string())
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateProductCcpMapping } = await import("../../db.js");
        await updateProductCcpMapping(input.productId, input.ccpTypes);
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
        if (!db) throw new Error("Database connection failed");
        const { hProductsV2 } = await import("../../../drizzle/schema_main.js");
        const { shelfLifeMonths, ...rest } = input;
        const shelfLifeDays = shelfLifeMonths ? shelfLifeMonths * 30 : undefined;
        const result = await db.insert(hProductsV2).values({
          ...rest,
          shelfLifeDays,
          tenantId: ctx.tenantId ?? undefined,
          isActive: input.isActive ?? 1,
        });
        const newProductId = Number(result[0].insertId);
        
        // item_master 테이블에도 동기화 생성
        try {
          const { itemMaster } = await import("../../../drizzle/schema/schema_dual_unit.js");
          await db.insert(itemMaster).values({
            tenantId: ctx.tenantId ?? undefined,
            itemCode: input.productCode,
            itemName: input.productName,
            itemType: 'own_product',
            category: input.category || null,
            baseUnit: input.unit || 'kg',
            shelfLifeDays: shelfLifeDays || null,
            description: input.description || null,
            legacyProductId: newProductId,
            isActive: input.isActive ?? 1,
          });
        } catch (syncErr) {
          console.error('item_master 동기화 생성 실패:', syncErr);
        }
        
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
        if (!db) throw new Error("Database connection failed");
        const { hProductsV2 } = await import("../../../drizzle/schema_main.js");
        const { id, shelfLifeMonths, ...rest } = input;
        const shelfLifeDays = shelfLifeMonths ? shelfLifeMonths * 30 : undefined;
        const updateData: any = { ...rest };
        if (shelfLifeDays !== undefined) updateData.shelfLifeDays = shelfLifeDays;
        await db.update(hProductsV2).set(updateData).where(eq(hProductsV2.id, id));
        
        // item_master 테이블 동기화 (legacyProductId로 연결)
        try {
          const { itemMaster } = await import("../../../drizzle/schema/schema_dual_unit.js");
          const syncData: any = {};
          if (rest.productName) syncData.itemName = rest.productName;
          if (rest.category) syncData.category = rest.category;
          if (rest.unit) syncData.baseUnit = rest.unit;
          if (rest.productCode) syncData.itemCode = rest.productCode;
          if (shelfLifeDays !== undefined) syncData.shelfLifeDays = shelfLifeDays;
          if (Object.keys(syncData).length > 0) {
            await db.update(itemMaster).set(syncData).where(
              and(eq(itemMaster.legacyProductId, id), eq(itemMaster.tenantId, ctx.tenantId ?? undefined))
            );
          }
        } catch (syncErr) {
          console.error('item_master 동기화 실패:', syncErr);
        }
        
        return { success: true };
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("Database connection failed");
        const { hProductsV2 } = await import("../../../drizzle/schema_main.js");
        await db.update(hProductsV2).set({ isActive: 0 }).where(and(eq(hProductsV2.id, input.id), eq(hProductsV2.tenantId, ctx.tenantId ?? undefined)));
        
        // item_master 동기화 (비활성화)
        try {
          const { itemMaster } = await import("../../../drizzle/schema/schema_dual_unit.js");
          await db.update(itemMaster).set({ isActive: 0 }).where(
            and(eq(itemMaster.legacyProductId, input.id), eq(itemMaster.tenantId, ctx.tenantId ?? undefined))
          );
        } catch (syncErr) {
          console.error('item_master 동기화 실패:', syncErr);
        }
        
        return { success: true };
      }),

    // 자동 코드 생성
    generateCode: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { generateProductCode } = await import("../../db/codeGenerator.js");
        return await generateProductCode(ctx.tenantId ?? undefined);
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
        if (!db) throw new Error("Database connection failed");
        const { hProductsV2 } = await import("../../../drizzle/schema_main.js");
        const { createUploadHistory } = await import("../../db/uploadHistory.js");
        
        const results = { successCount: 0, insertCount: 0, updateCount: 0, failureCount: 0, errors: [] as any[] };
        
        // 현재 최대 코드 번호 조회
        const maxResult = await db.execute(sql`SELECT MAX(CAST(SUBSTRING(product_code, 5) AS UNSIGNED)) as maxNum FROM h_products_v2 WHERE tenant_id = ${ctx.tenantId} AND product_code REGEXP '^PRD-[0-9]+$'`);
        let codeCounter = Number((maxResult as any)[0]?.[0]?.maxNum || (maxResult as any)[0]?.maxNum || 0);
        
        for (let i = 0; i < input.products.length; i++) {
          try {
            const product = input.products[i];
            if (!product.productName?.trim()) {
              results.errors.push({ row: i + 2, productName: "", message: "제품명이 비어있습니다" });
              results.failureCount++;
              continue;
            }
            
            const existing = await db.select().from(hProductsV2)
              .where(and(eq(hProductsV2.tenantId, ctx.tenantId ?? undefined), eq(hProductsV2.productName, product.productName.trim())))
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
              codeCounter++;
              const productCode = "PRD-" + String(codeCounter).padStart(3, "0");
              
              const insertResult = await db.insert(hProductsV2).values({
                tenantId: ctx.tenantId ?? undefined,
                productCode: product.productCode || productCode,
                productName: product.productName.trim(),
                category: product.category || null,
                unit: product.unit || null,
                shelfLifeDays: shelfLifeDays || null,
                description: product.description || null,
              });
              
              // item_master 동기화
              try {
                const { itemMaster } = await import("../../../drizzle/schema/schema_dual_unit.js");
                await db.insert(itemMaster).values({
                  tenantId: ctx.tenantId ?? undefined,
                  itemCode: productCode,
                  itemName: product.productName.trim(),
                  itemType: 'own_product',
                  category: product.category || null,
                  baseUnit: product.unit || 'kg',
                  shelfLifeDays: shelfLifeDays || null,
                  description: product.description || null,
                  legacyProductId: Number(insertResult[0].insertId),
                  isActive: 1,
                });
              } catch (syncErr) {
                console.error('item_master 동기화 실패 (bulkCreate):', syncErr);
              }
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
});
