import { getDb } from "../connection";
import { getPurchaseById, getSaleById } from "../haccp/haccpIntegration";
import { getCompanyInfo } from "../system/companyInfo";
import { getPrimaryBankAccount } from "../../bankTransactions";
import { generateTransactionStatementPDF } from "../../transactionStatementPDF";
import { partners } from "../../../drizzle/schema";
import { eq, and } from "drizzle-orm";

// placeholder for missing partner info
const EMPTY_PARTNER = {
  companyName: "거래처 미지정",
  bizNo: null,
  address: null,
  ceoName: null,
  phone: null,
} as const;

/**
 * 매입 거래명세표 PDF 생성
 *
 * ★ 2026-04-13 리팩터:
 *   - tenantId 누락 버그 수정
 *   - partner_id NULL 매입도 PDF 생성 가능 (placeholder 사용)
 *   - 전체 try/catch 로 에러 로그 명확화 (서버 로그에서 원인 파악 가능)
 */
export async function generatePurchaseStatementPDF(purchaseId: number, tenantId?: number): Promise<Buffer> {
  try {
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    // 1. 매입 거래 정보 조회
    const purchase = await getPurchaseById(purchaseId, tenantId);
    if (!purchase) {
      throw new Error(`매입 거래를 찾을 수 없습니다 (id=${purchaseId}, tenant=${tenantId})`);
    }

    // 2. 거래처 정보 조회 (partner_id NULL 이면 placeholder 사용)
    let partner: any = EMPTY_PARTNER;
    if (purchase.partnerId && tenantId) {
      const [found] = await db
        .select()
        .from(partners)
        .where(and(
          eq(partners.tenantId, tenantId as any),
          eq(partners.id, purchase.partnerId as any),
        ) as any)
        .limit(1);
      if (found) {
        partner = found;
      } else {
        console.warn(`[generatePurchaseStatementPDF] partner 조회 실패: id=${purchase.partnerId}, tenant=${tenantId} → placeholder 사용`);
      }
    }

    // 3. 회사 정보 조회 (null 가드)
    const companyInfo = tenantId ? await getCompanyInfo(tenantId) : {};

    // 4. PDF 데이터 구성
    const pdfData = {
      transactionDate: purchase.transactionDate,
      transactionType: "purchase" as const,

      // 공급자 = 거래처 (매입의 경우)
      supplier: {
        name: partner.companyName || EMPTY_PARTNER.companyName,
        businessNumber: partner.bizNo || undefined,
        address: partner.address || undefined,
        representative: partner.ceoName || undefined,
        phone: partner.phone || undefined,
      },

      // 공급받는자 = 우리 회사
      recipient: {
        name: companyInfo.companyName || "회사명 미설정",
        businessNumber: companyInfo.companyBusinessNumber,
        address: companyInfo.companyAddress,
        representative: companyInfo.companyRepresentative,
        phone: companyInfo.companyPhone,
      },

      // 품목 정보 (단일 품목)
      items: [
        {
          itemName: purchase.itemName || "품목명 없음",
          quantity: purchase.quantity,
          unit: purchase.unit || "EA",
          unitPrice: purchase.unitPrice,
          amount: purchase.totalAmount,
          note: purchase.notes || undefined,
        },
      ],

      // 합계 정보
      totalAmount: purchase.totalAmount,
      taxAmount: purchase.taxAmount || "0",
      grandTotal: parseFloat(String(purchase.totalAmount || "0")) + parseFloat(String(purchase.taxAmount || "0")),

      memo: purchase.notes || undefined,
    };

    return await generateTransactionStatementPDF(pdfData);
  } catch (err: any) {
    console.error(`[generatePurchaseStatementPDF] 실패: purchaseId=${purchaseId}, tenantId=${tenantId}`, err);
    throw new Error(`거래명세표 생성 실패: ${err.message || String(err)}`);
  }
}

/**
 * 매출 거래명세표 PDF 생성
 *
 * ★ 2026-04-13 리팩터:
 *   - tenantId 누락 버그 수정
 *   - partner_id NULL 매출도 PDF 생성 가능 (placeholder 사용)
 *   - 전체 try/catch 로 에러 로그 명확화
 */
export async function generateSaleStatementPDF(saleId: number, tenantId?: number): Promise<Buffer> {
  try {
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    // 1. 매출 거래 정보 조회
    const sale = await getSaleById(saleId, tenantId);
    if (!sale) {
      throw new Error(`매출 거래를 찾을 수 없습니다 (id=${saleId}, tenant=${tenantId})`);
    }

    // 2. 거래처 정보 조회 (partner_id NULL 이면 placeholder 사용)
    let partner: any = EMPTY_PARTNER;
    if (sale.partnerId && tenantId) {
      const [found] = await db
        .select()
        .from(partners)
        .where(and(
          eq(partners.tenantId, tenantId as any),
          eq(partners.id, sale.partnerId as any),
        ) as any)
        .limit(1);
      if (found) {
        partner = found;
      } else {
        console.warn(`[generateSaleStatementPDF] partner 조회 실패: id=${sale.partnerId}, tenant=${tenantId} → placeholder 사용`);
      }
    }

    // 3. 회사 정보 조회
    const companyInfo = tenantId ? await getCompanyInfo(tenantId) : {};

    // 4. 대표 계좌 조회 (null 허용)
    let primaryAccount: any = null;
    try {
      primaryAccount = await getPrimaryBankAccount();
    } catch (bankErr) {
      console.warn(`[generateSaleStatementPDF] getPrimaryBankAccount 실패 (graceful):`, bankErr);
    }

    // 5. PDF 데이터 구성
    const pdfData = {
      transactionDate: sale.transactionDate,
      transactionType: "sale" as const,

      // 공급자 = 우리 회사 (매출의 경우)
      supplier: {
        name: companyInfo.companyName || "회사명 미설정",
        businessNumber: companyInfo.companyBusinessNumber,
        address: companyInfo.companyAddress,
        representative: companyInfo.companyRepresentative,
        phone: companyInfo.companyPhone,
      },

      // 공급받는자 = 거래처
      recipient: {
        name: partner.companyName || EMPTY_PARTNER.companyName,
        businessNumber: partner.bizNo || undefined,
        address: partner.address || undefined,
        representative: partner.ceoName || undefined,
        phone: partner.phone || undefined,
      },

      // 품목 정보
      items: [
        {
          itemName: sale.itemName || "품목명 없음",
          quantity: sale.quantity,
          unit: sale.unit || "EA",
          unitPrice: sale.unitPrice,
          amount: sale.totalAmount,
          note: sale.notes || undefined,
        },
      ],

      // 합계 정보
      totalAmount: sale.totalAmount,
      taxAmount: sale.taxAmount || "0",
      grandTotal: parseFloat(String(sale.totalAmount || "0")) + parseFloat(String(sale.taxAmount || "0")),

      memo: sale.notes || undefined,

      // 입금 계좌 정보 (대표 계좌, 있을 때만)
      bankAccount: primaryAccount ? {
        bankName: primaryAccount.bankName,
        accountNumber: primaryAccount.accountNo,
        ownerName: (primaryAccount as any).ownerName || "예금주 미설정",
      } : undefined,
    };

    return await generateTransactionStatementPDF(pdfData);
  } catch (err: any) {
    console.error(`[generateSaleStatementPDF] 실패: saleId=${saleId}, tenantId=${tenantId}`, err);
    throw new Error(`거래명세표 생성 실패: ${err.message || String(err)}`);
  }
}

/**
 * 매입 거래명세표 PDF — 여러 품목 한 장 묶음 (그룹 PDF)
 * ★ 2026-04-14: 거래명세표 그룹화 지원
 *   - (같은 날짜 + 같은 거래처 + 같은 증빙번호) 의 품목들을 하나의 PDF 로 묶음
 *   - 공급자/공급받는자는 첫 매입 기준
 *   - 품목은 모든 매입을 배열로 집계, 합계는 합산
 */
export async function generatePurchaseStatementPDFByIds(
  purchaseIds: number[], tenantId?: number
): Promise<Buffer> {
  try {
    if (!purchaseIds.length) throw new Error("매입 ID 가 제공되지 않았습니다.");
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    // 1. 모든 매입 조회
    const purchases: any[] = [];
    for (const id of purchaseIds) {
      const p = await getPurchaseById(id, tenantId);
      if (p) purchases.push(p);
    }
    if (!purchases.length) {
      throw new Error(`유효한 매입이 없습니다. ids=${purchaseIds.join(',')}`);
    }

    const first = purchases[0];

    // 2. 거래처 (첫 매입 기준)
    let partner: any = EMPTY_PARTNER;
    if (first.partnerId && tenantId) {
      const [found] = await db
        .select()
        .from(partners)
        .where(and(
          eq(partners.tenantId, tenantId as any),
          eq(partners.id, first.partnerId as any),
        ) as any)
        .limit(1);
      if (found) partner = found;
    }

    // 3. 회사 정보
    const companyInfo = tenantId ? await getCompanyInfo(tenantId) : {};

    // 4. 품목 배열 집계
    const items = purchases.map((p: any) => ({
      itemName: p.itemName || "품목명 없음",
      quantity: p.quantity,
      unit: p.unit || "EA",
      unitPrice: p.unitPrice,
      amount: p.totalAmount,
      note: p.notes || undefined,
    }));

    // 5. 합계 재계산
    const totalAmount = purchases.reduce(
      (sum: number, p: any) => sum + parseFloat(String(p.totalAmount || "0")), 0
    );
    const taxAmount = purchases.reduce(
      (sum: number, p: any) => sum + parseFloat(String(p.taxAmount || "0")), 0
    );
    const grandTotal = totalAmount + taxAmount;

    // 6. 메모 (품목 개수 안내 + 첫 메모 있으면 추가)
    const memoParts: string[] = [];
    if (purchases.length > 1) memoParts.push(`총 ${purchases.length}개 품목`);
    if (first.notes) memoParts.push(first.notes);
    const memo = memoParts.join(" · ") || undefined;

    const pdfData = {
      transactionDate: first.transactionDate,
      transactionType: "purchase" as const,
      supplier: {
        name: partner.companyName || EMPTY_PARTNER.companyName,
        businessNumber: partner.bizNo || undefined,
        address: partner.address || undefined,
        representative: partner.ceoName || undefined,
        phone: partner.phone || undefined,
      },
      recipient: {
        name: companyInfo.companyName || "회사명 미설정",
        businessNumber: companyInfo.companyBusinessNumber,
        address: companyInfo.companyAddress,
        representative: companyInfo.companyRepresentative,
        phone: companyInfo.companyPhone,
      },
      items,
      totalAmount: String(totalAmount),
      taxAmount: String(taxAmount),
      grandTotal,
      memo,
    };

    return await generateTransactionStatementPDF(pdfData);
  } catch (err: any) {
    console.error(`[generatePurchaseStatementPDFByIds] 실패: purchaseIds=${purchaseIds}, tenantId=${tenantId}`, err);
    throw new Error(`거래명세표 그룹 생성 실패: ${err.message || String(err)}`);
  }
}

/**
 * 매출 거래명세표 PDF — 여러 품목 한 장 묶음 (그룹 PDF)
 */
export async function generateSaleStatementPDFByIds(
  saleIds: number[], tenantId?: number
): Promise<Buffer> {
  try {
    if (!saleIds.length) throw new Error("매출 ID 가 제공되지 않았습니다.");
    const db = await getDb();
    if (!db) throw new Error("DB 연결 실패");

    // 1. 모든 매출 조회
    const sales: any[] = [];
    for (const id of saleIds) {
      const s = await getSaleById(id, tenantId);
      if (s) sales.push(s);
    }
    if (!sales.length) {
      throw new Error(`유효한 매출이 없습니다. ids=${saleIds.join(',')}`);
    }

    const first = sales[0];

    // 2. 거래처 (첫 매출 기준)
    let partner: any = EMPTY_PARTNER;
    if (first.partnerId && tenantId) {
      const [found] = await db
        .select()
        .from(partners)
        .where(and(
          eq(partners.tenantId, tenantId as any),
          eq(partners.id, first.partnerId as any),
        ) as any)
        .limit(1);
      if (found) partner = found;
    }

    // 3. 회사 정보
    const companyInfo = tenantId ? await getCompanyInfo(tenantId) : {};

    // 4. 대표 계좌 (있으면)
    let primaryAccount: any = null;
    try {
      primaryAccount = await getPrimaryBankAccount();
    } catch (bankErr) {
      console.warn(`[generateSaleStatementPDFByIds] getPrimaryBankAccount 실패 (graceful):`, bankErr);
    }

    // 5. 품목 배열 집계
    const items = sales.map((s: any) => ({
      itemName: s.itemName || "품목명 없음",
      quantity: s.quantity,
      unit: s.unit || "EA",
      unitPrice: s.unitPrice,
      amount: s.totalAmount,
      note: s.notes || undefined,
    }));

    // 6. 합계 재계산
    const totalAmount = sales.reduce(
      (sum: number, s: any) => sum + parseFloat(String(s.totalAmount || "0")), 0
    );
    const taxAmount = sales.reduce(
      (sum: number, s: any) => sum + parseFloat(String(s.taxAmount || "0")), 0
    );
    const grandTotal = totalAmount + taxAmount;

    // 7. 메모
    const memoParts: string[] = [];
    if (sales.length > 1) memoParts.push(`총 ${sales.length}개 품목`);
    if (first.notes) memoParts.push(first.notes);
    const memo = memoParts.join(" · ") || undefined;

    const pdfData = {
      transactionDate: first.transactionDate,
      transactionType: "sale" as const,
      supplier: {
        name: companyInfo.companyName || "회사명 미설정",
        businessNumber: companyInfo.companyBusinessNumber,
        address: companyInfo.companyAddress,
        representative: companyInfo.companyRepresentative,
        phone: companyInfo.companyPhone,
      },
      recipient: {
        name: partner.companyName || EMPTY_PARTNER.companyName,
        businessNumber: partner.bizNo || undefined,
        address: partner.address || undefined,
        representative: partner.ceoName || undefined,
        phone: partner.phone || undefined,
      },
      items,
      totalAmount: String(totalAmount),
      taxAmount: String(taxAmount),
      grandTotal,
      memo,
      bankAccount: primaryAccount ? {
        bankName: primaryAccount.bankName,
        accountNumber: primaryAccount.accountNo,
        ownerName: (primaryAccount as any).ownerName || "예금주 미설정",
      } : undefined,
    };

    return await generateTransactionStatementPDF(pdfData);
  } catch (err: any) {
    console.error(`[generateSaleStatementPDFByIds] 실패: saleIds=${saleIds}, tenantId=${tenantId}`, err);
    throw new Error(`거래명세표 그룹 생성 실패: ${err.message || String(err)}`);
  }
}
