import { getDb } from "../db";
import { getPurchaseById, getSaleById } from "./haccpIntegration";
import { getCompanyInfo } from "./companyInfo";
import { getPrimaryBankAccount } from "../bankTransactions";
import { generateTransactionStatementPDF } from "../transactionStatementPDF";
import { partners } from "../../drizzle/schema";
import { eq, and} from "drizzle-orm";

/**
 * 매입 거래명세표 PDF 생성
 */
export async function generatePurchaseStatementPDF(purchaseId: number, tenantId?: number): Promise<Buffer> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 매입 거래 정보 조회
  const purchase = await getPurchaseById(purchaseId);
  if (!purchase) {
    throw new Error("매입 거래를 찾을 수 없습니다");
  }

  // 거래처 정보 조회
  const [partner] = await db
    .select()
    .from(partners)
    .where(and(eq(partners.tenantId, tenantId as any) , eq(partners.id, purchase.partnerId as any) ) as any)    .limit(1);

  if (!partner) {
    throw new Error("거래처 정보를 찾을 수 없습니다");
  }

  // 회사 정보 조회
  const companyInfo = await getCompanyInfo(tenantId!);

  // PDF 데이터 구성
  const pdfData = {
    transactionDate: purchase.transactionDate,
    transactionType: "purchase" as const,
    
    // 공급자 = 거래처 (매입의 경우)
    supplier: {
      name: partner.companyName,
      businessNumber: partner.bizNo || undefined,
      address: partner.address || undefined,
      representative: partner.ceoName || undefined,
      phone: partner.phone || undefined
    },
    
    // 공급받는자 = 우리 회사
    recipient: {
      name: companyInfo.companyName || "회사명 미설정",
      businessNumber: companyInfo.companyBusinessNumber,
      address: companyInfo.companyAddress,
      representative: companyInfo.companyRepresentative,
      phone: companyInfo.companyPhone
    },
    
    // 품목 정보 (단일 품목)
    items: [
      {
        itemName: purchase.itemName,
        quantity: purchase.quantity,
        unit: purchase.unit || "EA",
        unitPrice: purchase.unitPrice,
        amount: purchase.totalAmount,
        note: purchase.notes || undefined
      },
    ],
    
    // 합계 정보
    totalAmount: purchase.totalAmount,
    taxAmount: purchase.taxAmount || "0",
    grandTotal: parseFloat(purchase.totalAmount || "0") + parseFloat(purchase.taxAmount || "0"),
    
    memo: purchase.notes || undefined
  };

  return await generateTransactionStatementPDF(pdfData);
}

/**
 * 매출 거래명세표 PDF 생성
 */
export async function generateSaleStatementPDF(saleId: number, tenantId?: number): Promise<Buffer> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 매출 거래 정보 조회
  const sale = await getSaleById(saleId);
  if (!sale) {
    throw new Error("매출 거래를 찾을 수 없습니다");
  }

  // 거래처 정보 조회
  const [partner] = await db
    .select()
    .from(partners)
    .where(and(eq(partners.tenantId, tenantId as any) , eq(partners.id, sale.partnerId as any) ) as any)    .limit(1);

  if (!partner) {
    throw new Error("거래처 정보를 찾을 수 없습니다");
  }

  // 회사 정보 조회
  const companyInfo = await getCompanyInfo(tenantId!);

  // 대표 계좌 조회
  const primaryAccount = await getPrimaryBankAccount();

  // PDF 데이터 구성
  const pdfData = {
    transactionDate: sale.transactionDate,
    transactionType: "sale" as const,
    
    // 공급자 = 우리 회사 (매출의 경우)
    supplier: {
      name: companyInfo.companyName || "회사명 미설정",
      businessNumber: companyInfo.companyBusinessNumber,
      address: companyInfo.companyAddress,
      representative: companyInfo.companyRepresentative,
      phone: companyInfo.companyPhone
    },
    
    // 공급받는자 = 거래처
    recipient: {
      name: partner.companyName,
      businessNumber: partner.bizNo || undefined,
      address: partner.address || undefined,
      representative: partner.ceoName || undefined,
      phone: partner.phone || undefined
    },
    
    // 품목 정보 (단일 품목)
    items: [
      {
        itemName: sale.itemName,
        quantity: sale.quantity,
        unit: sale.unit || "EA",
        unitPrice: sale.unitPrice,
        amount: sale.totalAmount,
        note: sale.notes || undefined
      },
    ],
    
    // 합계 정보
    totalAmount: sale.totalAmount,
    taxAmount: sale.taxAmount || "0",
    grandTotal: parseFloat(sale.totalAmount || "0") + parseFloat(sale.taxAmount || "0"),
    
    memo: sale.notes || undefined,
    
    // 입금 계좌 정보 (대표 계좌)
    bankAccount: primaryAccount ? {
      bankName: primaryAccount.bankName,
      accountNumber: primaryAccount.accountNo,
      ownerName: (primaryAccount as any).ownerName || "예금주 미설정"
    } : undefined
  };

  return await generateTransactionStatementPDF(pdfData);
}
