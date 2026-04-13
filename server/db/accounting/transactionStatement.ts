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
