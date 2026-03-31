// supplier 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { and, eq, lt, or, sql } from "drizzle-orm";
import { hSuppliers } from "../../../drizzle/schema";
import { getDb } from "../../db";

export const supplierRouter = router({
    getAll: tenantRequiredProcedure
      .input(
        z.object({
          page: z.number().default(1),
          limit: z.number().default(20),
          search: z.string().optional(),
          sortBy: z.enum(["supplierCode", "supplierName", "supplierType", "createdAt"]).optional(),
          sortOrder: z.enum(["asc", "desc"]).optional()
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        const { getSupplierPartners } = await import("../../partners");
        return await getSupplierPartners({
          page: input?.page,
          limit: input?.limit,
          search: input?.search,
          sortBy: input?.sortBy,
          sortOrder: input?.sortOrder,
        }, ctx.tenantId!);
      }),
    // 거래처 전체 내보내기 (엑셀 다운로드용)
    exportAll: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { getSupplierPartners } = await import("../../partners");
        const result = await getSupplierPartners({ page: 1, limit: 10000 }, ctx.tenantId!);
        return { items: result.items, total: result.total };
      }),
    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getSupplierById } = await import("../../db");
        return await getSupplierById(input.id);
      }),
    create: adminProcedure
      .input(
        z.object({
          supplierName: z.string().min(1),
          supplierCode: z.string().optional(),
          businessNumber: z.string().optional(),
          contactPerson: z.string().optional(),
          phone: z.string().optional(),
          email: z.string().email().optional(),
          address: z.string().optional(),
          supplierType: z.string().optional(),
          certifications: z.string().optional(),
          rating: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createSupplierPartner } = await import("../../partners");
        return await createSupplierPartner({ ...input, tenantId: ctx.tenantId! });
      }),
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          supplierName: z.string().optional(),
          supplierCode: z.string().optional(),
          businessNumber: z.string().optional(),
          contactPerson: z.string().optional(),
          phone: z.string().optional(),
          email: z.string().email().optional(),
          address: z.string().optional(),
          supplierType: z.string().optional(),
          certifications: z.string().optional(),
          rating: z.string().optional(),
          isActive: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateSupplierPartner } = await import("../../partners");
        const { id, ...data } = input;
        return await updateSupplierPartner(id, data);
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteSupplierPartner } = await import("../../partners");
        return await deleteSupplierPartner(input.id, ctx.tenantId!);
      }),

    // 자동 코드 생성
    generateCode: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { generateSupplierCode } = await import("../../db/codeGenerator.js");
        return await generateSupplierCode(ctx.tenantId!);
      }),
    
    // 거래처 일괄 등록 (UPSERT - 동일 거래처명 있으면 수정, 없으면 신규)
    bulkCreate: adminProcedure
      .input(
        z.object({
          suppliers: z.array(
            z.object({
              supplierName: z.string().min(1),
              businessNumber: z.string().optional(),
              contactPerson: z.string().optional(),
              phone: z.string().optional(),
              email: z.string().email().optional().or(z.literal("")),
              address: z.string().optional(),
              supplierType: z.string().optional(),
              notes: z.string().optional()
            })
          )
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error("DB 연결 실패");
        const { createUploadHistory } = await import("../../db/uploadHistory.js");
        
        const results = { successCount: 0, insertCount: 0, updateCount: 0, failureCount: 0, errors: [] as any[] };
        
        // 현재 최대 코드 번호 조회
        const maxResult = await db.execute(sql`SELECT MAX(CAST(SUBSTRING(supplier_code, 5) AS UNSIGNED)) as maxNum FROM h_suppliers WHERE tenant_id = ${ctx.tenantId} AND supplier_code REGEXP '^SUP-[0-9]+$'`);
        let codeCounter = Number((maxResult as any)[0]?.[0]?.maxNum || (maxResult as any)[0]?.maxNum || 0);
        
        for (let i = 0; i < input.suppliers.length; i++) {
          try {
            const supplier = input.suppliers[i];
            if (!supplier.supplierName?.trim()) {
              results.errors.push({ row: i + 2, supplierName: "", message: "거래처명이 비어있습니다" });
              results.failureCount++;
              continue;
            }
            
            const existing = await db.select().from(hSuppliers)
              .where(and(eq(hSuppliers.tenantId, ctx.tenantId! as any) , eq(hSuppliers.supplierName, supplier.supplierName.trim())) as any)
              .limit(1);
            
            if (existing.length > 0) {
              const updateData: any = {};
              if (supplier.businessNumber !== undefined) updateData.businessNumber = supplier.businessNumber;
              if (supplier.contactPerson !== undefined) updateData.contactPerson = supplier.contactPerson;
              if (supplier.phone !== undefined) updateData.phone = supplier.phone;
              if (supplier.email && supplier.email !== "") updateData.email = supplier.email;
              if (supplier.address !== undefined) updateData.address = supplier.address;
              if (supplier.supplierType !== undefined) updateData.supplierType = supplier.supplierType;
              
              if (Object.keys(updateData).length > 0) {
                await db.update(hSuppliers).set(updateData).where(eq(hSuppliers.id, existing[0].id));
              }
              results.updateCount++;
            } else {
              codeCounter++;
              const supplierCode = "SUP-" + String(codeCounter).padStart(3, "0");
              
              await db.insert(hSuppliers).values({
                tenantId: ctx.tenantId!,
                supplierCode,
                supplierName: supplier.supplierName.trim(),
                businessNumber: supplier.businessNumber || null,
                contactPerson: supplier.contactPerson || null,
                phone: supplier.phone || null,
                email: (supplier.email && supplier.email !== "") ? supplier.email : null,
                address: supplier.address || null,
                supplierType: supplier.supplierType || null,
              } as any);
              results.insertCount++;
            }
            results.successCount++;
          } catch (error: any) {
            results.failureCount++;
            results.errors.push({ row: i + 2, supplierName: input.suppliers[i].supplierName, message: error.message || "등록 실패" });
          }
        }
        
        await createUploadHistory({
          uploadType: "supplier",
          userId: ctx.user.id,
          userName: ctx.user.name,
          fileName: "Excel Upload",
          totalCount: input.suppliers.length,
          successCount: results.successCount,
          errorCount: results.failureCount,
          errors: results.errors
        });
        
        return results;
      }),
});
