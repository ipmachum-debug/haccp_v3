// material 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router, workerProcedure } from "../../_core/trpc";
import { z } from "zod";
import { and, asc, count, desc, eq, inArray, like, lt, or, sql } from "drizzle-orm";
import { hMaterials } from "../../../drizzle/schema/schema_main";
import { getDb } from "../../db";

export const materialRouter = router({
    // 원재료 목록 조회 - itemMaster 기반 (h_mf_ingredients.material_id와 일치)
    list: tenantRequiredProcedure
      .input(
        z.object({
          page: z.number().default(1),
          limit: z.number().default(20),
          search: z.string().optional(),
          category: z.string().optional(),
          kind: z.enum(["RAW", "PACKAGING", "SUBSIDIARY"]).optional(),
          itemTypes: z.array(z.string()).optional(),
          isActive: z.number().optional(),
          sortBy: z.enum(["materialCode", "materialName", "category", "createdAt"]).optional(),
          sortOrder: z.enum(["asc", "desc"]).optional()
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const { itemMaster } = await import("../../../drizzle/schema.js");
        
        const page = input?.page || 1;
        const limit = input?.limit || 20;
        const offset = (page - 1) * limit;
        
        // WHERE 조건 구성 - itemMaster 기반
        const types = input?.itemTypes && input.itemTypes.length > 0
          ? input.itemTypes
          : ["raw_material"];
        const conditions: any[] = [
          eq(itemMaster.tenantId, ctx.tenantId),
          types.length === 1
            ? eq(itemMaster.itemType, types[0] as any)
            : inArray(itemMaster.itemType, types as any[])
        ];
        
        if (input?.search) {
          conditions.push(
            or(
              like(itemMaster.itemName, `%${input.search}%`),
              like(itemMaster.itemCode, `%${input.search}%`)
            )!
          );
        }
        
        if (input?.category) {
          conditions.push(eq(itemMaster.category, input.category));
        }
        
        // P0 FIX: 기본적으로 활성 데이터만 조회
        if (input?.isActive !== undefined) {
          conditions.push(eq(itemMaster.isActive, input.isActive));
        } else {
          conditions.push(eq(itemMaster.isActive, 1));
        }
        
        // 전체 개수 조회
        const totalResult = await db
          .select({ count: sql<number>`count(*)` })
          .from(itemMaster)
          .where(and(...conditions));
        
        const total = Number(totalResult[0]?.count || 0);
        
        // 목록 조회 - materialName/materialCode 호환 필드명 유지
        const items = await db
          .select({
            id: itemMaster.id,
            materialCode: itemMaster.itemCode,
            materialName: itemMaster.itemName,
            category: itemMaster.category,
            unit: itemMaster.baseUnit,
            tenantId: itemMaster.tenantId,
            isActive: itemMaster.isActive,
            supplierId: itemMaster.supplierId,
            description: itemMaster.description,
            createdAt: itemMaster.createdAt,
            updatedAt: itemMaster.updatedAt,
          })
          .from(itemMaster)
          .where(and(...conditions))
          .limit(limit)
          .offset(offset)
          .orderBy(
            input?.sortBy === "materialCode" 
              ? (input?.sortOrder === "desc" ? desc(itemMaster.itemCode) : asc(itemMaster.itemCode))
              : input?.sortBy === "materialName"
              ? (input?.sortOrder === "desc" ? desc(itemMaster.itemName) : asc(itemMaster.itemName))
              : input?.sortBy === "category"
              ? (input?.sortOrder === "desc" ? desc(itemMaster.category) : asc(itemMaster.category))
              : desc(itemMaster.createdAt)
          );
        
        return {
          items,
          total,
          page,
          limit
        };
      }),

    // 원재료 전체 내보내기 (엑셀 다운로드용)
    exportAll: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        
        const items = await db
          .select()
          .from(hMaterials)
          .where(and(
            eq(hMaterials.tenantId, ctx.tenantId),
            eq(hMaterials.isActive, 1)
          ))
          .orderBy(asc(hMaterials.materialCode));
        
        return { items, total: items.length };
      }),
    
    // 원재료 상세 조회
    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        
        const materials = await db
          .select()
          .from(hMaterials)
          .where(
            and(
              eq(hMaterials.id, input.id),
              eq(hMaterials.tenantId, ctx.tenantId)
            )
          )
          .limit(1);
        
        if (materials.length === 0) {
          throw new Error("원재료를 찾을 수 없습니다");
        }
        
        return materials[0];
      }),
    
    // 원재료 생성
    create: workerProcedure
      .input(
        z.object({
          materialCode: z.string(),
          materialName: z.string(),
          kind: z.enum(["RAW", "PACKAGING", "SUBSIDIARY"]),
          category: z.string().optional(),
          categoryId: z.number().optional(),
          unit: z.string().optional(),
          supplierId: z.number().optional(),
          shelfLifeDays: z.number().optional(),
          expiryWarningDays: z.number().optional(),
          safetyStockLevel: z.number().optional(),
          unitPrice: z.number().optional(),
          purchaseUnit: z.string().optional(),
          conversionRate: z.number().optional(),
          defaultPackagingSize: z.number().optional(),
          description: z.string().optional(),
          isActive: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        
        // 중복 코드 체크
        const existing = await db
          .select()
          .from(hMaterials)
          .where(
            and(
              eq(hMaterials.materialCode, input.materialCode),
              eq(hMaterials.tenantId, ctx.tenantId as any) 
            )
          )
          .limit(1);
        
        if (existing.length > 0) {
          throw new Error("이미 존재하는 원재료 코드입니다");
        }
        
        const result = await db.insert(hMaterials).values({
          ...input,
          tenantId: ctx.tenantId
        } as any);
        const newMaterialId = Number(result[0].insertId);
        
        // item_master 테이블에도 동기화 생성
        try {
          const { itemMaster } = await import("../../../drizzle/schema/schema_dual_unit.js");
          await db.insert(itemMaster).values({
            tenantId: ctx.tenantId,
            itemCode: input.materialCode,
            itemName: input.materialName,
            itemType: 'raw_material',
            category: input.category || null,
            baseUnit: input.unit || 'kg',
            supplierId: input.supplierId || null,
            purchaseUnit: input.purchaseUnit || null,
            purchaseConversionRate: input.conversionRate ? String(input.conversionRate) : '1.0000',
            shelfLifeDays: input.shelfLifeDays || null,
            description: input.description || null,
            legacyMaterialId: newMaterialId,
            isActive: input.isActive ?? 1,
          });
        } catch (syncErr) {
          console.error('item_master 동기화 생성 실패 (material):', syncErr);
        }
        
        return {
          success: true,
          id: newMaterialId
        };
      }),
    
    // 원재료 수정
    update: workerProcedure
      .input(
        z.object({
          id: z.number(),
          materialCode: z.string().optional(),
          materialName: z.string().optional(),
          kind: z.enum(["RAW", "PACKAGING", "SUBSIDIARY"]).optional(),
          category: z.string().optional(),
          categoryId: z.number().optional(),
          unit: z.string().optional(),
          supplierId: z.number().optional(),
          shelfLifeDays: z.number().optional(),
          expiryWarningDays: z.number().optional(),
          safetyStockLevel: z.number().optional(),
          unitPrice: z.number().optional(),
          purchaseUnit: z.string().optional(),
          conversionRate: z.number().optional(),
          defaultPackagingSize: z.number().optional(),
          description: z.string().optional(),
          isActive: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");

        const { id, ...data } = input;

        await db
          .update(hMaterials)
          .set(data as any)
          .where(
            and(
              eq(hMaterials.id, id),
              eq(hMaterials.tenantId, ctx.tenantId as any)
            )
          );

        // ★ 2026-05-09 (PR #277): item_master 동기화 — 헬퍼 사용으로 매칭 보강
        // 기존: WHERE legacyMaterialId = id 만 매칭 → PR #269 로 만든 row (legacyMaterialId NULL) 누락
        // 변경: syncMaterialToItemMaster() 가 legacyMaterialId / id / itemCode 3중 매칭 → drift 차단
        try {
          // 최신 값으로 동기화하기 위해 DB 에서 현재 값을 읽은 후 sync 호출
          const [current] = await db
            .select()
            .from(hMaterials)
            .where(
              and(
                eq(hMaterials.id, id),
                eq(hMaterials.tenantId, ctx.tenantId as any)
              )
            )
            .limit(1);
          if (current) {
            const { syncMaterialToItemMaster } = await import("../../db/production/itemMasterSync.js");
            await syncMaterialToItemMaster(db, {
              tenantId: ctx.tenantId,
              materialId: id,
              materialCode: current.materialCode,
              materialName: current.materialName,
              category: current.category,
              unit: current.unit,
              supplierId: (current as any).supplierId ?? null,
              purchaseUnit: (current as any).purchaseUnit ?? null,
              purchaseConversionRate: (current as any).conversionRate
                ? String((current as any).conversionRate)
                : null,
              shelfLifeDays: current.shelfLifeDays,
              description: current.description,
              isActive: current.isActive,
            });
          }
        } catch (syncErr) {
          console.error('item_master 동기화 실패 (material):', syncErr);
        }

        return { success: true };
      }),
    
    // 원재료 삭제 (soft delete)
    delete: workerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        
        // list는 itemMaster 기반이므로 input.id는 itemMaster.id
        // 먼저 itemMaster에서 legacyMaterialId를 조회
        const { itemMaster } = await import("../../../drizzle/schema/schema_dual_unit.js");
        const [item] = await db.select({ legacyMaterialId: itemMaster.legacyMaterialId })
          .from(itemMaster)
          .where(
            and(
              eq(itemMaster.id, input.id),
              eq(itemMaster.tenantId, ctx.tenantId as any) 
            )
          )
          .limit(1);
        
        // itemMaster 비활성화
        await db.update(itemMaster).set({ isActive: 0 }).where(
          and(eq(itemMaster.id, input.id) as any, eq(itemMaster.tenantId, ctx.tenantId as any) )
        );
        
        // hMaterials도 비활성화 (legacyMaterialId로 연결)
        if (item?.legacyMaterialId) {
          await db
            .update(hMaterials)
            .set({ isActive: 0 })
            .where(
              and(
                eq(hMaterials.id, item.legacyMaterialId),
                eq(hMaterials.tenantId, ctx.tenantId as any) 
              )
            );
        }
        
        return { success: true };
      }),
    
    // 원재료 대량 등록 (엑셀 업로드)
    bulkCreate: workerProcedure
      .input(
        z.object({
          materials: z.array(
            z.object({
              materialName: z.string(),
              unit: z.string().optional(),
              safetyStock: z.number().optional(),
              category: z.string().optional(),
              expiryWarningDays: z.number().optional(),
              storageMethod: z.string().optional(),
              notes: z.string().optional(),
            })
          ),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        
        let insertCount = 0;
        let updateCount = 0;
        let failureCount = 0;
        const errors: { row: number; name: string; error: string }[] = [];
        
        // MAX 코드 번호를 루프 밖에서 한 번만 조회
        const maxCodeResult = await db.execute(sql`
          SELECT COALESCE(MAX(CAST(SUBSTRING(material_code, 5) AS UNSIGNED)), 0) as max_num 
          FROM h_materials WHERE tenant_id = ${ctx.tenantId}
        `);
        // drizzle db.execute returns [rows, fields] for MySQL
        const maxRows = Array.isArray((maxCodeResult as any)[0]) ? (maxCodeResult as any)[0] : maxCodeResult;
        let codeCounter = Number((maxRows as any)[0]?.max_num || 0);
        for (let i = 0; i < input.materials.length; i++) {
          const mat = input.materials[i];
          try {
            const trimmedName = mat.materialName.trim();
            if (!trimmedName) {
              errors.push({ row: i + 1, name: mat.materialName, error: "원재료명이 비어있습니다" });
              failureCount++;
              continue;
            }
            
            // 기존 원재료 조회 (원재료명으로 매칭)
            const existing = await db
              .select()
              .from(hMaterials)
              .where(
                and(
                  eq(hMaterials.materialName, trimmedName),
                  eq(hMaterials.tenantId, ctx.tenantId as any) 
                )
              )
              .limit(1);
            
            if (existing.length > 0) {
              // UPSERT: 이미 존재하면 변경된 필드만 업데이트
              const updates: Record<string, any> = {};
              if (mat.unit && mat.unit !== existing[0].unit) updates.unit = mat.unit;
              if (mat.category !== undefined && mat.category !== existing[0].category) updates.category = mat.category || null;
              if (mat.safetyStock !== undefined) {
                const newSafety = String(mat.safetyStock);
                if (newSafety !== existing[0].safetyStockLevel) updates.safetyStockLevel = newSafety;
              }
              if (mat.expiryWarningDays !== undefined && mat.expiryWarningDays !== existing[0].expiryWarningDays) {
                updates.expiryWarningDays = mat.expiryWarningDays;
              }
              const newDesc = [mat.storageMethod, mat.notes].filter(Boolean).join(" / ") || null;
              if (newDesc !== existing[0].description) updates.description = newDesc;
              
              if (Object.keys(updates).length > 0) {
                await db.update(hMaterials)
                  .set(updates)
                  .where(eq(hMaterials.id, existing[0].id));
                updateCount++;
              } else {
                updateCount++; // 변경 없어도 성공으로 카운트
              }
            } else {
              // INSERT: 신규 등록
              codeCounter++;
              const materialCode = `MAT-${String(codeCounter).padStart(3, '0')}`;
              
              const matInsertResult = await db.insert(hMaterials).values({
                materialCode,
                materialName: trimmedName,
                kind: "RAW",
                category: mat.category || null,
                unit: mat.unit || "kg",
                safetyStockLevel: mat.safetyStock !== undefined ? String(mat.safetyStock) : "0.000",
                expiryWarningDays: mat.expiryWarningDays || 7,
                description: [mat.storageMethod, mat.notes].filter(Boolean).join(" / ") || null,
                tenantId: ctx.tenantId,
              });
              
              // item_master 동기화
              try {
                const { itemMaster } = await import("../../../drizzle/schema/schema_dual_unit.js");
                await db.insert(itemMaster).values({
                  tenantId: ctx.tenantId,
                  itemCode: materialCode,
                  itemName: trimmedName,
                  itemType: 'raw_material',
                  category: mat.category || null,
                  baseUnit: mat.unit || 'kg',
                  shelfLifeDays: mat.expiryWarningDays || null,
                  description: [mat.storageMethod, mat.notes].filter(Boolean).join(" / ") || null,
                  legacyMaterialId: Number(matInsertResult[0].insertId),
                  isActive: 1,
                });
              } catch (syncErr) {
                console.error('item_master 동기화 실패 (material bulkCreate):', syncErr);
              }
              insertCount++;
            }
          } catch (err: any) {
            errors.push({ row: i + 1, name: mat.materialName, error: err.message });
            failureCount++;
          }
        }
        
        return {
          success: failureCount === 0,
          successCount: insertCount + updateCount,
          insertCount,
          updateCount,
          failureCount,
          errors,
          total: input.materials.length,
        };
      }),

    // 가격 이력 조회
    getPriceHistory: tenantRequiredProcedure
      .input(z.object({ materialId: z.number() }))
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        
        // 원재료 입고 이력에서 가격 정보 추출
        const history = await db.execute(sql`
          SELECT 
            il.receivedAt as date,
            il.unitPrice as price,
            il.quantity,
            s.supplierName as supplier
          FROM h_inventory_lots il
          LEFT JOIN h_suppliers s ON il.supplierId = s.id AND s.tenant_id = ${ctx.tenantId}
          WHERE il.materialId = ${input.materialId}
            AND il.tenant_id = ${ctx.tenantId}
            AND il.unitPrice IS NOT NULL
          ORDER BY il.receivedAt DESC
          LIMIT 50
        `);
        
        return (history as unknown as any[])[0] || [];
      })
});
