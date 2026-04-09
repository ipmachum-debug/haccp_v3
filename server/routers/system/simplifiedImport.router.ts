/**
 * 단순 데이터 임포트 라우터
 *
 * 신규 테넌트 온보딩 시 과거 운영 데이터를 축적하는 API.
 * JSON 직접 입력 + 엑셀 파일 업로드 두 가지 경로를 지원한다.
 */

import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import {
  processOnboardingData,
  type OnboardingDataInput,
} from "../../db/simplifiedDataProcessor";

// ── Zod 스키마 ──

const materialInputSchema = z.object({
  name: z.string().min(1),
  qty: z.number().positive(),
  unitPrice: z.number().optional(),
});

const ccpRecordSchema = z.object({
  type: z.string().min(1),     // CCP-1B, CCP-2B, CCP-4P
  temp: z.number().optional(),
  time: z.number().optional(),
  pressure: z.number().optional(),
  feMm: z.number().optional(),
  susMm: z.number().optional(),
  result: z.string().optional(),
});

const outboundSchema = z.object({
  qty: z.number().positive(),
  partner: z.string().optional(),
  unitPrice: z.number().optional(),
  releaseType: z.string().optional(),
});

const inspectionSchema = z.object({
  itemName: z.string().min(1),
  origin: z.string().optional(),
  result: z.string().optional(),
});

const productionRecordSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  productName: z.string().min(1),
  productionQty: z.number().positive(),
  materials: z.array(materialInputSchema).optional(),
  ccpRecords: z.array(ccpRecordSchema).optional(),
  outbound: outboundSchema.optional(),
  inspections: z.array(inspectionSchema).optional(),
});

const purchaseRecordSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  materialName: z.string().min(1),
  qty: z.number().positive(),
  unitPrice: z.number().optional(),
  supplier: z.string().optional(),
});

const onboardingInputSchema = z.object({
  purchases: z.array(purchaseRecordSchema).optional(),
  productions: z.array(productionRecordSchema).optional(),
  siteId: z.number().optional(),
});

// ── 라우터 ──

export const simplifiedImportRouter = router({
  /**
   * JSON 데이터 직접 임포트
   * 프론트엔드 또는 외부 에이전트가 구조화된 JSON을 전달
   */
  importJson: tenantRequiredProcedure
    .input(onboardingInputSchema)
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!;
      const userId = ctx.user!.id as number;

      const result = await processOnboardingData(tenantId, userId, input as OnboardingDataInput);
      return result;
    }),

  /**
   * 단순 엑셀 파일 임포트
   * 3시트 구조: 매입, 생산, (선택)출고
   */
  importExcel: tenantRequiredProcedure
    .input(z.object({ fileBase64: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId!;
      const userId = ctx.user!.id as number;

      // ExcelJS로 파싱
      const ExcelJS = await import("exceljs");
      const wb = new ExcelJS.default.Workbook();
      const buffer = Buffer.from(input.fileBase64, "base64");
      await wb.xlsx.load(buffer);

      const data: OnboardingDataInput = { purchases: [], productions: [] };

      // ── 시트1: 매입 (원재료 입고) ──
      const purchaseSheet = wb.getWorksheet("매입") ?? wb.getWorksheet("입고") ?? wb.worksheets[0];
      if (purchaseSheet) {
        purchaseSheet.eachRow((row, rowNumber) => {
          if (rowNumber <= 1) return; // 헤더 스킵
          const date = parseExcelDate(row.getCell(1).value);
          const materialName = String(row.getCell(2).value ?? "").trim();
          const qty = Number(row.getCell(3).value) || 0;
          const unitPrice = Number(row.getCell(4).value) || 0;
          const supplier = String(row.getCell(5).value ?? "").trim() || undefined;

          if (date && materialName && qty > 0) {
            data.purchases!.push({ date, materialName, qty, unitPrice, supplier });
          }
        });
      }

      // ── 시트2: 생산 ──
      const prodSheet = wb.getWorksheet("생산") ?? wb.worksheets[1];
      if (prodSheet) {
        prodSheet.eachRow((row, rowNumber) => {
          if (rowNumber <= 1) return;
          const date = parseExcelDate(row.getCell(1).value);
          const productName = String(row.getCell(2).value ?? "").trim();
          const productionQty = Number(row.getCell(3).value) || 0;

          // 원료는 col 4에 JSON 또는 "원료명:수량,원료명:수량" 형태
          const materialsRaw = String(row.getCell(4).value ?? "").trim();
          const materials = parseMaterialsString(materialsRaw);

          // CCP은 col 5에 "CCP-1B:95℃/30분,CCP-4P:Fe2.0/SUS3.0" 형태
          const ccpRaw = String(row.getCell(5).value ?? "").trim();
          const ccpRecords = parseCcpString(ccpRaw);

          // 출고 col 6: 수량, col 7: 거래처, col 8: 단가
          const outQty = Number(row.getCell(6).value) || 0;
          const outPartner = String(row.getCell(7).value ?? "").trim() || undefined;
          const outPrice = Number(row.getCell(8).value) || 0;

          if (date && productName && productionQty > 0) {
            data.productions!.push({
              date,
              productName,
              productionQty,
              materials: materials.length > 0 ? materials : undefined,
              ccpRecords: ccpRecords.length > 0 ? ccpRecords : undefined,
              outbound: outQty > 0 ? { qty: outQty, partner: outPartner, unitPrice: outPrice } : undefined,
            });
          }
        });
      }

      const result = await processOnboardingData(tenantId, userId, data);
      return { ...result, parsedCounts: { purchases: data.purchases?.length ?? 0, productions: data.productions?.length ?? 0 } };
    }),

  /**
   * 엑셀 템플릿 다운로드 (base64)
   */
  downloadTemplate: tenantRequiredProcedure
    .query(async () => {
      const ExcelJS = await import("exceljs");
      const wb = new ExcelJS.default.Workbook();

      // 시트1: 매입
      const ws1 = wb.addWorksheet("매입");
      ws1.columns = [
        { header: "날짜(YYYY-MM-DD)", key: "date", width: 16 },
        { header: "원재료명", key: "material", width: 20 },
        { header: "수량(kg)", key: "qty", width: 12 },
        { header: "단가(원)", key: "price", width: 12 },
        { header: "거래처", key: "supplier", width: 20 },
      ];
      ws1.addRow({ date: "2026-01-15", material: "쌀가루", qty: 500, price: 3000, supplier: "농협" });

      // 시트2: 생산
      const ws2 = wb.addWorksheet("생산");
      ws2.columns = [
        { header: "날짜(YYYY-MM-DD)", key: "date", width: 16 },
        { header: "제품명", key: "product", width: 20 },
        { header: "생산량(kg)", key: "qty", width: 14 },
        { header: "원료투입(원료:kg,...)", key: "materials", width: 30 },
        { header: "CCP기록", key: "ccp", width: 40 },
        { header: "출고량(kg)", key: "outQty", width: 12 },
        { header: "출고거래처", key: "outPartner", width: 18 },
        { header: "출고단가(원)", key: "outPrice", width: 14 },
      ];
      ws2.addRow({
        date: "2026-01-15",
        product: "떡볶이떡",
        qty: 280,
        materials: "쌀가루:200,소금:5",
        ccp: "CCP-1B:95/30,CCP-4P:2.0/3.0",
        outQty: 250,
        outPartner: "이마트",
        outPrice: 5000,
      });

      // 스타일
      for (const ws of [ws1, ws2]) {
        ws.getRow(1).font = { bold: true };
        ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FE" } };
      }

      const buf = await wb.xlsx.writeBuffer();
      return { fileBase64: Buffer.from(buf as ArrayBuffer).toString("base64"), filename: "단순임포트_템플릿.xlsx" };
    }),

  /**
   * AI 데이터 검증 (엑셀)
   * 업로드 전 데이터 이상치 탐지 및 오차 범위 검증
   */
  validateData: tenantRequiredProcedure
    .input(z.object({ fileBase64: z.string() }))
    .mutation(async ({ input }) => {
      const ExcelJS = await import("exceljs");
      const wb = new ExcelJS.default.Workbook();
      const buffer = Buffer.from(input.fileBase64, "base64");
      await wb.xlsx.load(buffer);

      return validateParsedData(wb);
    }),

  /**
   * AI 데이터 검증 (JSON)
   */
  validateJson: tenantRequiredProcedure
    .input(onboardingInputSchema)
    .mutation(async ({ input }) => {
      return validateJsonData(input);
    }),
});

// ── 파싱 헬퍼 ──

function parseExcelDate(val: unknown): string {
  if (!val) return "";
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val).trim();
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

/** "쌀가루:200,소금:5" → MaterialInput[] */
function parseMaterialsString(raw: string): { name: string; qty: number; unitPrice?: number }[] {
  if (!raw) return [];
  try {
    // JSON 시도
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* 문자열 파싱으로 fallback */ }

  return raw.split(",").map((pair) => {
    const [name, qtyStr] = pair.split(":").map((s) => s.trim());
    return { name, qty: Number(qtyStr) || 0 };
  }).filter((m) => m.name && m.qty > 0);
}

/** "CCP-1B:95/30,CCP-4P:2.0/3.0" → CcpRecord[] */
function parseCcpString(raw: string): { type: string; temp?: number; time?: number; feMm?: number; susMm?: number }[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* 문자열 파싱으로 fallback */ }

  return raw.split(",").map((pair) => {
    const [typeStr, valStr] = pair.split(":").map((s) => s.trim());
    if (!typeStr || !valStr) return null;
    const vals = valStr.split("/").map(Number);

    if (typeStr === "CCP-4P") {
      return { type: typeStr, feMm: vals[0] || 2.0, susMm: vals[1] || 3.0 };
    }
    return { type: typeStr, temp: vals[0], time: vals[1] };
  }).filter(Boolean) as any[];
}

// ══════════════════════════════════════════════
// AI 데이터 검증 로직
// ══════════════════════════════════════════════

type Warning = { field: string; message: string; severity: "low" | "medium" | "high" };

/** HACCP 식품 생산 데이터의 통계 기반 이상치 탐지 */
function validateJsonData(input: any) {
  const warnings: Warning[] = [];
  let totalRecords = 0;
  let suspiciousRecords = 0;

  const purchases = input.purchases ?? [];
  const productions = input.productions ?? [];

  // ── 매입 데이터 검증 ──
  const purchaseQtys = purchases.map((p: any) => p.qty).filter((q: number) => q > 0);
  const purchasePrices = purchases.map((p: any) => p.unitPrice).filter((p: number) => p > 0);

  for (const p of purchases) {
    totalRecords++;
    // 날짜 범위 체크
    if (p.date) {
      const d = new Date(p.date);
      const now = new Date();
      if (d > now) { warnings.push({ field: `매입 ${p.date}`, message: "미래 날짜입니다", severity: "high" }); suspiciousRecords++; }
      const twoYearsAgo = new Date(); twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      if (d < twoYearsAgo) { warnings.push({ field: `매입 ${p.date}`, message: "2년 이전 데이터입니다", severity: "medium" }); }
    }
    // 수량 이상치 (평균의 5배 초과)
    if (purchaseQtys.length >= 3) {
      const avg = purchaseQtys.reduce((a: number, b: number) => a + b, 0) / purchaseQtys.length;
      if (p.qty > avg * 5) { warnings.push({ field: `매입 ${p.materialName}`, message: `수량 ${p.qty}kg이 평균(${Math.round(avg)}kg)의 5배 초과`, severity: "high" }); suspiciousRecords++; }
    }
    // 단가 이상치
    if (purchasePrices.length >= 3 && p.unitPrice > 0) {
      const avg = purchasePrices.reduce((a: number, b: number) => a + b, 0) / purchasePrices.length;
      if (p.unitPrice > avg * 3) { warnings.push({ field: `매입 ${p.materialName}`, message: `단가 ${p.unitPrice}원이 평균(${Math.round(avg)}원)의 3배 초과`, severity: "medium" }); suspiciousRecords++; }
    }
  }

  // ── 생산 데이터 검증 ──
  const prodQtyMap = new Map<string, number[]>();
  for (const p of productions) {
    const arr = prodQtyMap.get(p.productName) ?? [];
    arr.push(p.productionQty);
    prodQtyMap.set(p.productName, arr);
  }

  for (const p of productions) {
    totalRecords++;
    // 날짜 범위
    if (p.date) {
      const d = new Date(p.date);
      if (d > new Date()) { warnings.push({ field: `생산 ${p.date} ${p.productName}`, message: "미래 날짜입니다", severity: "high" }); suspiciousRecords++; }
    }
    // 제품별 생산량 이상치
    const qtys = prodQtyMap.get(p.productName) ?? [];
    if (qtys.length >= 3) {
      const avg = qtys.reduce((a, b) => a + b, 0) / qtys.length;
      if (p.productionQty > avg * 5) { warnings.push({ field: `생산 ${p.productName}`, message: `생산량 ${p.productionQty}kg이 평균(${Math.round(avg)}kg)의 5배 초과`, severity: "high" }); suspiciousRecords++; }
    }
    // 원료 투입 vs 생산량 비율 체크
    if (p.materials && p.materials.length > 0) {
      const totalInput = p.materials.reduce((s: number, m: any) => s + (m.qty || 0), 0);
      if (totalInput > 0 && p.productionQty > totalInput * 1.5) {
        warnings.push({ field: `생산 ${p.date} ${p.productName}`, message: `생산량(${p.productionQty}kg)이 원료투입량(${totalInput}kg)의 150% 초과 — 수율 이상`, severity: "medium" });
        suspiciousRecords++;
      }
      if (totalInput > 0 && p.productionQty < totalInput * 0.3) {
        warnings.push({ field: `생산 ${p.date} ${p.productName}`, message: `생산량(${p.productionQty}kg)이 원료투입량(${totalInput}kg)의 30% 미만 — 손실 과다`, severity: "medium" });
      }
    }
    // 출고량 > 생산량 체크
    if (p.outbound && p.outbound.qty > p.productionQty) {
      warnings.push({ field: `출고 ${p.date} ${p.productName}`, message: `출고량(${p.outbound.qty}kg)이 생산량(${p.productionQty}kg) 초과`, severity: "high" });
      suspiciousRecords++;
    }
    // CCP 온도 범위 체크
    if (p.ccpRecords) {
      for (const ccp of p.ccpRecords) {
        if (ccp.temp !== undefined) {
          if (ccp.temp < 60 || ccp.temp > 200) {
            warnings.push({ field: `CCP ${p.date} ${ccp.type}`, message: `온도 ${ccp.temp}°C가 일반 범위(60~200°C) 밖`, severity: "medium" });
          }
        }
        if (ccp.time !== undefined && ccp.time > 120) {
          warnings.push({ field: `CCP ${p.date} ${ccp.type}`, message: `시간 ${ccp.time}분이 2시간 초과`, severity: "low" });
        }
      }
    }
  }

  return {
    warnings,
    stats: {
      totalRecords,
      validRecords: totalRecords - suspiciousRecords,
      suspiciousRecords,
    },
  };
}

/** 엑셀 워크북 기반 검증 */
function validateParsedData(wb: any) {
  // 엑셀을 파싱해서 JSON 형태로 변환 후 validateJsonData 재사용
  const data: any = { purchases: [], productions: [] };

  const purchaseSheet = wb.getWorksheet("매입") ?? wb.getWorksheet("입고") ?? wb.worksheets[0];
  if (purchaseSheet) {
    purchaseSheet.eachRow((row: any, rowNumber: number) => {
      if (rowNumber <= 1) return;
      const date = parseExcelDate(row.getCell(1).value);
      const materialName = String(row.getCell(2).value ?? "").trim();
      const qty = Number(row.getCell(3).value) || 0;
      const unitPrice = Number(row.getCell(4).value) || 0;
      if (date && materialName && qty > 0) {
        data.purchases.push({ date, materialName, qty, unitPrice });
      }
    });
  }

  const prodSheet = wb.getWorksheet("생산") ?? wb.worksheets[1];
  if (prodSheet) {
    prodSheet.eachRow((row: any, rowNumber: number) => {
      if (rowNumber <= 1) return;
      const date = parseExcelDate(row.getCell(1).value);
      const productName = String(row.getCell(2).value ?? "").trim();
      const productionQty = Number(row.getCell(3).value) || 0;
      const materialsRaw = String(row.getCell(4).value ?? "").trim();
      const materials = parseMaterialsString(materialsRaw);
      const ccpRaw = String(row.getCell(5).value ?? "").trim();
      const ccpRecords = parseCcpString(ccpRaw);
      const outQty = Number(row.getCell(6).value) || 0;

      if (date && productName && productionQty > 0) {
        data.productions.push({
          date, productName, productionQty,
          materials: materials.length > 0 ? materials : undefined,
          ccpRecords: ccpRecords.length > 0 ? ccpRecords : undefined,
          outbound: outQty > 0 ? { qty: outQty } : undefined,
        });
      }
    });
  }

  return validateJsonData(data);
}
