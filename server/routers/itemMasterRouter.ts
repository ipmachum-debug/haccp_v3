import { z } from "zod";
import { categories as categoriesTable } from "../../drizzle/schema/schema_categories";
import ExcelJS from 'exceljs';
import { tenantRequiredProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { itemMaster, productSkus } from "../../drizzle/schema";
import { eq, and, desc, asc, like, or, sql, inArray } from "drizzle-orm";
import { generateSkuCode, generateExternalProductCode, generateSubsidiaryCode, generateProductCode, generateMaterialCode } from "../db/codeGenerator.js";

export const itemMasterRouter = router({
  // ============================================================
  // 품목 마스터 CRUD
  // ============================================================
  
  // 품목 목록 조회
  list: tenantRequiredProcedure
    .input(z.object({
      itemType: z.enum(["raw_material", "own_product", "external_product", "subsidiary"]).optional(),
      search: z.string().optional(),
      isActive: z.number().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const tenantId = ctx.tenantId ?? undefined;
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 50;
      const offset = (page - 1) * limit;
      
      const conditions = [eq(itemMaster.tenantId, tenantId)];
      
      if (input?.itemType) {
        conditions.push(eq(itemMaster.itemType, input.itemType));
      }
      if (input?.isActive !== undefined) {
        conditions.push(eq(itemMaster.isActive, input.isActive));
      }
      if (input?.search) {
        conditions.push(
          or(
            like(itemMaster.itemName, `%${input.search}%`),
            like(itemMaster.itemCode, `%${input.search}%`)
          )!
        );
      }
      
      const [items, countResult] = await Promise.all([
        db.select()
          .from(itemMaster)
          .where(and(...conditions))
          .orderBy(asc(itemMaster.itemCode))
          .limit(limit)
          .offset(offset),
        db.select({ count: sql<number>`COUNT(*)` })
          .from(itemMaster)
          .where(and(...conditions))
      ]);
      
      return {
        items,
        total: countResult[0]?.count ?? 0,
        page,
        limit,
      };
    }),
  
  // 품목 상세 조회
  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const [item] = await db.select()
        .from(itemMaster)
        .where(and(
          eq(itemMaster.id, input.id),
          eq(itemMaster.tenantId, ctx.tenantId ?? undefined)
        ));
      return item ?? null;
    }),
  
  // 품목 코드 자동 생성
  generateCode: tenantRequiredProcedure
    .input(z.object({ itemType: z.enum(["raw_material", "own_product", "external_product", "subsidiary"]) }))
    .query(async ({ input, ctx }) => {
      let code: string;
      switch (input.itemType) {
        case "own_product":
          code = await generateProductCode(ctx.tenantId ?? undefined);
          break;
        case "raw_material":
          code = await generateMaterialCode(ctx.tenantId ?? undefined);
          break;
        case "external_product":
          code = await generateExternalProductCode(ctx.tenantId ?? undefined);
          break;
        case "subsidiary":
          code = await generateSubsidiaryCode(ctx.tenantId ?? undefined);
          break;
        default:
          code = "UNKNOWN";
      }
      return { code };
    }),

  // 품목 생성
  create: adminProcedure
    .input(z.object({
      itemCode: z.string().optional(),
      itemName: z.string().min(1),
      itemType: z.enum(["raw_material", "own_product", "external_product", "subsidiary"]),
      category: z.string().optional(),
      baseUnit: z.string().default("kg"),
      supplierId: z.number().optional(),
      purchaseUnit: z.string().optional(),
      purchaseConversionRate: z.number().optional(),
      productReportNo: z.string().optional(),
      shelfLifeDays: z.number().optional(),
      oemSupplierId: z.number().optional(),
      defaultUnitPrice: z.number().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      
      // itemCode가 없으면 자동 생성
      let itemCode = input.itemCode;
      if (!itemCode) {
        switch (input.itemType) {
          case "own_product":
            itemCode = await generateProductCode(ctx.tenantId ?? undefined);
            break;
          case "raw_material":
            itemCode = await generateMaterialCode(ctx.tenantId ?? undefined);
            break;
          case "external_product":
            itemCode = await generateExternalProductCode(ctx.tenantId ?? undefined);
            break;
          case "subsidiary":
            itemCode = await generateSubsidiaryCode(ctx.tenantId ?? undefined);
            break;
          default:
            itemCode = "UNKNOWN";
        }
      }
      
      const result = await db.insert(itemMaster).values({
        tenantId: ctx.tenantId ?? undefined,
        itemCode,
        itemName: input.itemName,
        itemType: input.itemType,
        category: input.category,
        baseUnit: input.baseUnit,
        supplierId: input.supplierId,
        purchaseUnit: input.purchaseUnit,
        purchaseConversionRate: input.purchaseConversionRate?.toString(),
        productReportNo: input.productReportNo,
        shelfLifeDays: input.shelfLifeDays,
        oemSupplierId: input.oemSupplierId,
        defaultUnitPrice: input.defaultUnitPrice?.toString(),
        description: input.description,
      });
      
      const insertId = (result as any)[0]?.insertId;
      
      // 제품 타입이면 기본 kg SKU 자동 생성
      if (input.itemType === "own_product" || input.itemType === "external_product") {
        const skuCode = await generateSkuCode(itemCode, ctx.tenantId ?? undefined);
        await db.insert(productSkus).values({
          tenantId: ctx.tenantId ?? undefined,
          itemId: insertId,
          skuCode,
          skuName: `${input.itemName} (kg)`,
          salesUnit: "kg",
          kgPerSalesUnit: "1.0000",
          isDefault: 1,
        });
      }
      
      return { id: insertId, message: "품목이 등록되었습니다." };
    }),
  
  // 품목 수정
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      itemName: z.string().optional(),
      category: z.string().optional(),
      baseUnit: z.string().optional(),
      supplierId: z.number().nullable().optional(),
      purchaseUnit: z.string().optional(),
      purchaseConversionRate: z.number().optional(),
      productReportNo: z.string().optional(),
      shelfLifeDays: z.number().optional(),
      oemSupplierId: z.number().nullable().optional(),
      defaultUnitPrice: z.number().optional(),
      description: z.string().optional(),
      isActive: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const { id, ...updateData } = input;
      
      const cleanData: any = {};
      if (updateData.itemName !== undefined) cleanData.itemName = updateData.itemName;
      if (updateData.category !== undefined) cleanData.category = updateData.category;
      if (updateData.baseUnit !== undefined) cleanData.baseUnit = updateData.baseUnit;
      if (updateData.supplierId !== undefined) cleanData.supplierId = updateData.supplierId;
      if (updateData.purchaseUnit !== undefined) cleanData.purchaseUnit = updateData.purchaseUnit;
      if (updateData.purchaseConversionRate !== undefined) cleanData.purchaseConversionRate = updateData.purchaseConversionRate.toString();
      if (updateData.productReportNo !== undefined) cleanData.productReportNo = updateData.productReportNo;
      if (updateData.shelfLifeDays !== undefined) cleanData.shelfLifeDays = updateData.shelfLifeDays;
      if (updateData.oemSupplierId !== undefined) cleanData.oemSupplierId = updateData.oemSupplierId;
      if (updateData.defaultUnitPrice !== undefined) cleanData.defaultUnitPrice = updateData.defaultUnitPrice.toString();
      if (updateData.description !== undefined) cleanData.description = updateData.description;
      if (updateData.isActive !== undefined) cleanData.isActive = updateData.isActive;
      
      await db.update(itemMaster)
        .set(cleanData)
        .where(and(
          eq(itemMaster.id, id),
          eq(itemMaster.tenantId, ctx.tenantId ?? undefined)
        ));
      
      return { success: true, message: "품목이 수정되었습니다." };
    }),
  
  // 품목 삭제 (소프트 삭제)
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await db.update(itemMaster)
        .set({ isActive: 0 })
        .where(and(
          eq(itemMaster.id, input.id),
          eq(itemMaster.tenantId, ctx.tenantId ?? undefined)
        ));
      return { success: true, message: "품목이 비활성화되었습니다." };
    }),

  // ============================================================
  // 템플릿 다운로드 및 전체 다운로드
  // ============================================================

  // 1. 템플릿 다운로드 (빈 템플릿 + 샘플 데이터)
  downloadTemplate: tenantRequiredProcedure
    .input(z.object({
      itemType: z.enum(['own_product', 'raw_material', 'supplier']),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const categories = await db.select({ name: categoriesTable.name })
        .from(categoriesTable)
        .where(eq(categoriesTable.tenantId, ctx.tenantId ?? undefined));
      const categoryNames = categories.map(c => c.name);
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(
        input.itemType === 'own_product' ? '제품 템플릿' : input.itemType === 'raw_material' ? '원재료 템플릿' : '거래처 템플릿'
      );
      const headers = input.itemType === 'own_product'
        ? ['제품 코드*','제품명*','카테고리*','단위*','소비기한(개월)*','설명']
        : input.itemType === 'raw_material'
        ? ['원재료 코드*','원재료명*','카테고리*','단위*','소비기한(일)*','설명']
        : ['거래처코드*','사업자번호*','대표자명','연락처','주소','거래처 유형*','인증서','등급','이메일','비고'];
      worksheet.addRow(headers);
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.columns = headers.map((h, i) => ({ width: i < 2 ? 15 : i === 2 ? 20 : 15 }));
      if (input.itemType === 'own_product') {
        worksheet.addRow(['','콩고물쑥떡(조코)',categoryNames[0]||'떡류','kg',7,'냉동보관, 대두 함유']);
        worksheet.addRow(['','콩고물쑥떡(멥기)',categoryNames[0]||'떡류','kg',7,'냉동보관, 대두 함유']);
      } else if (input.itemType === 'raw_material') {
        worksheet.addRow(['','찹쌀',categoryNames[0]||'곡물','kg',210,'실온보관']);
        worksheet.addRow(['','강낭콩(울타리콩)',categoryNames[0]||'곡물','kg',210,'실온보관']);
      } else {
        worksheet.addRow(['','603-81-93743','이정언','032-322-9958','인천 서구 원창로89번길 14-7, 3층 301호','공급업체','ISO 인증','A','sokoonymall@naver.com','원재료 공급']);
        worksheet.addRow(['','654-40-01248','이정애','010-9206-9984','인천 서구 청라커낼로260번길 7-19 3층 305호','제조업체','HACCP 인증','A+','sokoonymall@naver.com','OEM 제조']);
      }
      const dataStartRow = 2;
      const dataEndRow = 1000;
      if (input.itemType === 'supplier') {
        // 거래처 유형 드롭다운
        for (let row = dataStartRow; row <= dataEndRow; row++) {
          worksheet.getCell(`F${row}`).dataValidation = { type: 'list', allowBlank: false, formulae: ['"공급업체,제조업체,유통업체,기타"'], showErrorMessage: true, errorTitle: '거래처 유형 오류', error: '목록에서 선택해주세요' };
        }
      } else {
        if (categoryNames.length > 0) {
          for (let row = dataStartRow; row <= dataEndRow; row++) {
            worksheet.getCell(`C${row}`).dataValidation = { type: 'list', allowBlank: false, formulae: [`"${categoryNames.join(',')}"`], showErrorMessage: true, errorTitle: '카테고리 오류', error: '목록에서 선택해주세요' };
          }
        }
        for (let row = dataStartRow; row <= dataEndRow; row++) {
          worksheet.getCell(`D${row}`).dataValidation = { type: 'list', allowBlank: false, formulae: ['"kg,ea,box,pack,L,ml"'], showErrorMessage: true, errorTitle: '단위 오류', error: '목록에서 선택해주세요' };
        }
      }
      // 과세유형, 상태 드롭다운 제거 (DB 스키마에 없음)
      const buffer = await workbook.xlsx.writeBuffer();
      const base64 = buffer.toString('base64');
      const filename = input.itemType === 'own_product' ? '제품' : input.itemType === 'raw_material' ? '원재료' : '거래처';
      return { success: true, filename: `${filename}_템플릿_${new Date().toISOString().split('T')[0]}.xlsx`, data: base64 };
    }),

  // 2. 전체 다운로드 (현재 데이터를 템플릿 양식으로)
  downloadAll: tenantRequiredProcedure
    .input(z.object({
      itemType: z.enum(['own_product', 'raw_material', 'supplier']),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const categories = await db.select({ id: categoriesTable.id, name: categoriesTable.name })
        .from(categoriesTable)
        .where(eq(categoriesTable.tenantId, ctx.tenantId ?? undefined));
      const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
      const categoryNames = categories.map(c => c.name);
      const items = await db.select().from(itemMaster)
        .where(and(eq(itemMaster.tenantId, ctx.tenantId ?? undefined), eq(itemMaster.itemType, input.itemType)))
        .orderBy(itemMaster.itemCode);
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(input.itemType === 'own_product' ? '제품 목록' : input.itemType === 'raw_material' ? '원재료 목록' : '거래처 목록');
      const headers = input.itemType === 'own_product'
        ? ['제품 코드*','제품명*','카테고리*','단위*','소비기한(개월)*','설명']
        : input.itemType === 'raw_material'
        ? ['원재료 코드*','원재료명*','카테고리*','단위*','소비기한(일)*','설명']
        : ['거래처코드*','사업자번호*','대표자명','연락처','주소','거래처 유형*','인증서','등급','이메일','비고'];
      worksheet.addRow(headers);
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.columns = headers.map((h, i) => ({ width: i < 2 ? 15 : i === 2 ? 20 : 15 }));
      if (input.itemType === 'supplier') {
        // 거래처 데이터는 h_suppliers 테이블에서 가져오기
        const suppliers = await db.select().from(sql`h_suppliers`)
          .where(sql`tenant_id = ${ctx.tenantId}`);
        for (const supplier of suppliers) {
          const row = [
            supplier.supplier_code || '',
            supplier.business_number || '',
            supplier.contact_person || '',
            supplier.phone || '',
            supplier.address || '',
            supplier.supplier_type || '',
            supplier.certifications || '',
            supplier.rating || '',
            supplier.email || '',
            '' // 비고
          ];
          worksheet.addRow(row);
        }
      } else {
        for (const item of items) {
          const categoryName = item.categoryId ? categoryMap[item.categoryId] : item.category || '';
          const row = input.itemType === 'own_product'
            ? [item.itemCode, item.itemName, categoryName, item.baseUnit || item.unit, Math.round((item.shelfLifeDays || 0) / 30), item.description || '']
            : [item.itemCode, item.itemName, categoryName, item.baseUnit || item.unit, item.shelfLifeDays || item.expiryWarningDays || 0, item.description || ''];
          worksheet.addRow(row);
        }
      }
      const dataStartRow = 2;
      const dataEndRow = input.itemType === 'supplier' ? 1000 : items.length + 1000;
      if (input.itemType === 'supplier') {
        // 거래처 유형 드롭다운
        for (let row = dataStartRow; row <= dataEndRow; row++) {
          worksheet.getCell(`F${row}`).dataValidation = { type: 'list', allowBlank: false, formulae: ['"공급업체,제조업체,유통업체,기타"'], showErrorMessage: true, errorTitle: '거래처 유형 오류', error: '목록에서 선택해주세요' };
        }
      } else {
        if (categoryNames.length > 0) {
          for (let row = dataStartRow; row <= dataEndRow; row++) {
            worksheet.getCell(`C${row}`).dataValidation = { type: 'list', allowBlank: false, formulae: [`"${categoryNames.join(',')}"`], showErrorMessage: true, errorTitle: '카테고리 오류', error: '목록에서 선택해주세요' };
          }
        }
        for (let row = dataStartRow; row <= dataEndRow; row++) {
          worksheet.getCell(`D${row}`).dataValidation = { type: 'list', allowBlank: false, formulae: ['"kg,ea,box,pack,L,ml"'], showErrorMessage: true, errorTitle: '단위 오류', error: '목록에서 선택해주세요' };
        }
      }
      // 과세유형, 상태 드롭다운 제거 (DB 스키마에 없음)
      const buffer = await workbook.xlsx.writeBuffer();
      const base64 = buffer.toString('base64');
      const filename = input.itemType === 'own_product' ? '제품' : input.itemType === 'raw_material' ? '원재료' : '거래처';
      const count = input.itemType === 'supplier' ? 0 : items.length;
      return { success: true, filename: `${filename}_전체_${new Date().toISOString().split('T')[0]}.xlsx`, data: base64, count };
    }),
});

// ============================================================
// SKU 라우터
// ============================================================
export const productSkuRouter = router({
  // SKU 목록 조회 (품목별)
  listByItem: tenantRequiredProcedure
    .input(z.object({
      itemId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      return db.select()
        .from(productSkus)
        .where(and(
          eq(productSkus.itemId, input.itemId),
          eq(productSkus.tenantId, ctx.tenantId ?? undefined),
          eq(productSkus.isActive, 1)
        ))
        .orderBy(desc(productSkus.isDefault), asc(productSkus.skuCode));
    }),
  
  // 전체 SKU 목록 (매출 등록용)
  listAll: tenantRequiredProcedure
    .input(z.object({
      search: z.string().optional(),
      itemType: z.enum(["own_product", "external_product"]).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const conditions = [
        eq(productSkus.tenantId, ctx.tenantId ?? undefined),
        eq(productSkus.isActive, 1),
      ];
      
      // 품목 타입 필터링을 위해 item_master와 조인
      const query = db.select({
        id: productSkus.id,
        itemId: productSkus.itemId,
        skuCode: productSkus.skuCode,
        skuName: productSkus.skuName,
        netWeightG: productSkus.netWeightG,
        piecesPerPack: productSkus.piecesPerPack,
        packsPerBox: productSkus.packsPerBox,
        salesUnit: productSkus.salesUnit,
        kgPerSalesUnit: productSkus.kgPerSalesUnit,
        unitPrice: productSkus.unitPrice,
        barcode: productSkus.barcode,
        isDefault: productSkus.isDefault,
        // item_master 필드
        itemCode: itemMaster.itemCode,
        itemName: itemMaster.itemName,
        itemType: itemMaster.itemType,
        category: itemMaster.category,
      })
        .from(productSkus)
        .innerJoin(itemMaster, eq(productSkus.itemId, itemMaster.id))
        .where(and(
          eq(productSkus.tenantId, ctx.tenantId ?? undefined),
          eq(productSkus.isActive, 1),
          eq(itemMaster.isActive, 1),
          ...(input?.itemType ? [eq(itemMaster.itemType, input.itemType)] : []),
          ...(input?.search ? [
            or(
              like(productSkus.skuName, `%${input.search}%`),
              like(productSkus.skuCode, `%${input.search}%`),
              like(itemMaster.itemName, `%${input.search}%`)
            )!
          ] : [])
        ))
        .orderBy(asc(itemMaster.itemName), desc(productSkus.isDefault));
      
      return query;
    }),
  
  // SKU 코드 자동 생성
  generateCode: tenantRequiredProcedure
    .input(z.object({ parentItemCode: z.string() }))
    .query(async ({ input }) => {
      const code = await generateSkuCode(input.parentItemCode, ctx.tenantId ?? undefined);
      return { code };
    }),

  // SKU 생성
  create: adminProcedure
    .input(z.object({
      itemId: z.number(),
      skuCode: z.string().optional(),
      skuName: z.string().min(1),
      netWeightG: z.number().optional(),
      piecesPerPack: z.number().default(1),
      packsPerBox: z.number().default(1),
      salesUnit: z.string().default("box"),
      kgPerSalesUnit: z.number(),
      unitPrice: z.number().optional(),
      barcode: z.string().optional(),
      isDefault: z.number().default(0),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      
      // 기본 SKU 설정 시 기존 기본 SKU 해제
      if (input.isDefault === 1) {
        await db.update(productSkus)
          .set({ isDefault: 0 })
          .where(and(
            eq(productSkus.itemId, input.itemId),
            eq(productSkus.tenantId, ctx.tenantId ?? undefined)
          ));
      }
      
      // SKU 코드 자동 생성 (비어있으면)
      let skuCode = input.skuCode;
      if (!skuCode) {
        // itemId로 품목 코드 조회
        const [parentItem] = await db.select({ itemCode: itemMaster.itemCode })
          .from(itemMaster)
          .where(eq(itemMaster.id, input.itemId));
        skuCode = await generateSkuCode(parentItem?.itemCode || String(input.itemId), ctx.tenantId ?? undefined);
      }

      const result = await db.insert(productSkus).values({
        tenantId: ctx.tenantId ?? undefined,
        itemId: input.itemId,
        skuCode,
        skuName: input.skuName,
        netWeightG: input.netWeightG?.toString(),
        piecesPerPack: input.piecesPerPack,
        packsPerBox: input.packsPerBox,
        salesUnit: input.salesUnit,
        kgPerSalesUnit: input.kgPerSalesUnit.toString(),
        unitPrice: input.unitPrice?.toString(),
        barcode: input.barcode,
        isDefault: input.isDefault,
      });
      
      return { id: (result as any)[0]?.insertId, message: "SKU가 등록되었습니다." };
    }),
  
  // SKU 수정
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      skuName: z.string().optional(),
      netWeightG: z.number().optional(),
      piecesPerPack: z.number().optional(),
      packsPerBox: z.number().optional(),
      salesUnit: z.string().optional(),
      kgPerSalesUnit: z.number().optional(),
      unitPrice: z.number().optional(),
      barcode: z.string().optional(),
      isDefault: z.number().optional(),
      isActive: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const { id, ...updateData } = input;
      
      const cleanData: any = {};
      if (updateData.skuName !== undefined) cleanData.skuName = updateData.skuName;
      if (updateData.netWeightG !== undefined) cleanData.netWeightG = updateData.netWeightG.toString();
      if (updateData.piecesPerPack !== undefined) cleanData.piecesPerPack = updateData.piecesPerPack;
      if (updateData.packsPerBox !== undefined) cleanData.packsPerBox = updateData.packsPerBox;
      if (updateData.salesUnit !== undefined) cleanData.salesUnit = updateData.salesUnit;
      if (updateData.kgPerSalesUnit !== undefined) cleanData.kgPerSalesUnit = updateData.kgPerSalesUnit.toString();
      if (updateData.unitPrice !== undefined) cleanData.unitPrice = updateData.unitPrice.toString();
      if (updateData.barcode !== undefined) cleanData.barcode = updateData.barcode;
      if (updateData.isDefault !== undefined) cleanData.isDefault = updateData.isDefault;
      if (updateData.isActive !== undefined) cleanData.isActive = updateData.isActive;
      
      // 기본 SKU 설정 시 기존 기본 SKU 해제
      if (updateData.isDefault === 1) {
        const [sku] = await db.select({ itemId: productSkus.itemId })
          .from(productSkus)
          .where(eq(productSkus.id, id));
        if (sku) {
          await db.update(productSkus)
            .set({ isDefault: 0 })
            .where(and(
              eq(productSkus.itemId, sku.itemId),
              eq(productSkus.tenantId, ctx.tenantId ?? undefined)
            ));
        }
      }
      
      await db.update(productSkus)
        .set(cleanData)
        .where(and(
          eq(productSkus.id, id),
          eq(productSkus.tenantId, ctx.tenantId ?? undefined)
        ));
      
      return { success: true, message: "SKU가 수정되었습니다." };
    }),
  
  // SKU 삭제 (소프트 삭제)
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      await db.update(productSkus)
        .set({ isActive: 0 })
        .where(and(
          eq(productSkus.id, input.id),
          eq(productSkus.tenantId, ctx.tenantId ?? undefined)
        ));
      return { success: true, message: "SKU가 비활성화되었습니다." };
    }),
});
