/**
 * 팝빌 (Popbill) 어댑터 — Phase C (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * SaaS 플랫폼이 1개의 LinkID/SecretKey 로 N개 테넌트의 사업자번호를
 * 위임받아 전자세금계산서/현금영수증/문자/팩스 등을 발행하는 구조.
 *
 * 환경변수:
 *   POPBILL_LINK_ID       - 팝빌 파트너 LinkID
 *   POPBILL_SECRET_KEY    - 파트너 SecretKey
 *   POPBILL_IS_TEST       - 'true' = 테스트 모드, 'false' = 운영
 *   POPBILL_BASE_URL      - 자동: test → popbill-test.linkhub.co.kr / 운영 → popbill.linkhub.co.kr
 *
 * 모드:
 *   1. STUB MODE  - 환경변수 미설정 시 모든 호출이 가짜 응답 반환 (로컬 개발/테스트)
 *   2. LIVE MODE  - 환경변수 설정 시 실제 팝빌 API 호출
 *
 * Phase C 시점에는 STUB 모드만 검증.
 * 실제 LIVE 호출은 popbill-node SDK 추가 후 enable.
 * ═══════════════════════════════════════════════════════════════
 */

export interface PopbillConfig {
  linkId: string;
  secretKey: string;
  isTest: boolean;
}

export interface PopbillTaxInvoice {
  // 작성자 (당사) 사업자번호
  invoicerCorpNum: string;
  // 공급받는자 사업자번호 (매출 시) 또는 공급자 사업자번호 (매입 시)
  invoiceeCorpNum: string;
  invoiceeCorpName: string;
  invoiceeCEOName?: string;
  invoiceeAddr?: string;
  invoiceeContactName?: string;
  invoiceeEmail?: string;

  // 작성일자 / 공급일자
  writeDate: string; // YYYYMMDD
  taxInvoiceType?: string; // "01" = 일반, "02" = 영세율 등

  // 영수/청구 구분
  chargeDirection?: "정과세" | "영세율" | "면세";
  purposeType?: "영수" | "청구"; // 한국어 그대로

  // 금액
  supplyCostTotal: string; // 공급가액
  taxTotal: string;        // 세액
  totalAmount: string;     // 합계

  // 품목 (최대 4건)
  detailList: Array<{
    serialNum: number;       // 1~4
    itemName: string;
    spec?: string;
    qty?: string;
    unitCost?: string;
    supplyCost: string;
    tax: string;
    purchaseDT?: string;
  }>;

  // 비고
  remark1?: string;
  remark2?: string;
  remark3?: string;

  // 사내 관리키 (멱등성 보장)
  mgtKey: string;
}

export interface PopbillIssueResult {
  success: boolean;
  ntsConfirmNum?: string; // 국세청 승인번호
  receiptNum?: string;    // 팝빌 접수번호
  invoiceUrl?: string;    // 팝빌 영수증 URL
  message?: string;
  raw?: any;              // 응답 원본
}

export interface PopbillBalance {
  remainPoint: number;
  unPaidAmount?: number;
}

/**
 * 환경변수 기반 설정 로드
 */
export function getPopbillConfig(): PopbillConfig | null {
  const linkId = process.env.POPBILL_LINK_ID;
  const secretKey = process.env.POPBILL_SECRET_KEY;
  if (!linkId || !secretKey) {
    return null;
  }
  return {
    linkId,
    secretKey,
    isTest: process.env.POPBILL_IS_TEST !== "false",
  };
}

/**
 * 모드 확인
 */
export function isPopbillStubMode(): boolean {
  return getPopbillConfig() === null;
}

/**
 * ─────────────────────────────────────────────────────
 * 회원 등록/조회
 * ─────────────────────────────────────────────────────
 *
 * STUB 모드: 모든 사업자번호가 회원으로 가정.
 * LIVE 모드: popbill SDK CheckIsMember 호출.
 */
export async function checkIsMember(corpNum: string): Promise<boolean> {
  const config = getPopbillConfig();
  if (!config) {
    console.log(`[Popbill STUB] checkIsMember(${corpNum}) → true`);
    return true;
  }
  // TODO: popbill-node SDK 통합
  // const popbill = require("popbill");
  // popbill.config({ ... });
  // return new Promise((resolve) =>
  //   popbill.taxinvoice.checkIsMember(corpNum, config.linkId, (err, result) => resolve(!err && result.code === 1))
  // );
  console.warn(`[Popbill LIVE 미구현] checkIsMember(${corpNum}) → 스텁 응답`);
  return true;
}

/**
 * 회원 등록 (RegistContact)
 *
 * SaaS 가 새 테넌트를 팝빌에 등록할 때 호출.
 */
export async function registMember(params: {
  corpNum: string;
  corpName: string;
  ceoName?: string;
  addr?: string;
  bizType?: string;
  bizClass?: string;
  contactName?: string;
  contactEmail?: string;
  contactTel?: string;
}): Promise<{ success: boolean; message?: string }> {
  if (isPopbillStubMode()) {
    console.log(`[Popbill STUB] registMember(${params.corpNum}, ${params.corpName})`);
    return { success: true, message: "STUB: 등록 완료" };
  }
  // TODO: popbill-node SDK 통합
  console.warn(`[Popbill LIVE 미구현] registMember`);
  return { success: false, message: "LIVE 모드 미구현" };
}

/**
 * ─────────────────────────────────────────────────────
 * 세금계산서 발행
 * ─────────────────────────────────────────────────────
 */
export async function issueTaxInvoice(
  invoice: PopbillTaxInvoice,
  memo?: string,
): Promise<PopbillIssueResult> {
  if (isPopbillStubMode()) {
    const fakeNtsNum = `STUB-${Date.now().toString().slice(-8)}`;
    console.log(
      `[Popbill STUB] issueTaxInvoice(invoicer=${invoice.invoicerCorpNum}, ` +
        `invoicee=${invoice.invoiceeCorpNum}, mgtKey=${invoice.mgtKey}, ` +
        `total=${invoice.totalAmount}) → ${fakeNtsNum}`,
    );
    return {
      success: true,
      ntsConfirmNum: fakeNtsNum,
      receiptNum: `STUB-RCP-${Date.now()}`,
      message: "STUB: 발행 성공 (실제 국세청 미전송)",
      raw: { stub: true, memo, invoice },
    };
  }
  // TODO: popbill-node SDK 통합 (RegistIssue)
  console.warn(`[Popbill LIVE 미구현] issueTaxInvoice`);
  return { success: false, message: "LIVE 모드 미구현" };
}

/**
 * 세금계산서 취소 발행 (CancelIssue)
 */
export async function cancelTaxInvoice(
  invoicerCorpNum: string,
  mgtKey: string,
  memo?: string,
): Promise<PopbillIssueResult> {
  if (isPopbillStubMode()) {
    console.log(`[Popbill STUB] cancelTaxInvoice(${invoicerCorpNum}, ${mgtKey})`);
    return { success: true, message: "STUB: 취소 완료", raw: { stub: true, memo } };
  }
  console.warn(`[Popbill LIVE 미구현] cancelTaxInvoice`);
  return { success: false, message: "LIVE 모드 미구현" };
}

/**
 * 팝빌 포인트 조회
 */
export async function getBalance(corpNum: string): Promise<PopbillBalance> {
  if (isPopbillStubMode()) {
    return { remainPoint: 99999, unPaidAmount: 0 };
  }
  console.warn(`[Popbill LIVE 미구현] getBalance(${corpNum})`);
  return { remainPoint: 0 };
}

/**
 * 팝빌 영수증/PDF URL 가져오기 (인증된 임시 URL)
 */
export async function getInvoiceUrl(
  invoicerCorpNum: string,
  mgtKey: string,
): Promise<string | null> {
  if (isPopbillStubMode()) {
    return `https://popbill-stub.local/invoice/${mgtKey}`;
  }
  console.warn(`[Popbill LIVE 미구현] getInvoiceUrl(${invoicerCorpNum}, ${mgtKey})`);
  return null;
}

/**
 * ─────────────────────────────────────────────────────
 * 팝빌 호스팅 페이지 단축 URL (인증 토큰 포함)
 * ─────────────────────────────────────────────────────
 *
 * 테넌트별 개별 관리 모델 (2026-04-14):
 *   각 테넌트가 자기 corpNum으로 팝빌 호스팅 페이지(충전/로그인/회원정보)에
 *   바로 접근할 수 있도록 인증된 URL 을 생성.
 *
 * type:
 *   - CHRG   → 포인트 충전 페이지
 *   - LOGIN  → 팝빌 홈택스 대시보드 (로그인 세션 자동 생성)
 *   - MEMBER → 회원정보 변경 페이지
 *   - PWD    → 비밀번호 변경 페이지
 */
export type PopbillHostedPageType = "CHRG" | "LOGIN" | "MEMBER" | "PWD";

export async function getPopbillURL(
  corpNum: string,
  type: PopbillHostedPageType,
  userId?: string,
): Promise<string | null> {
  if (isPopbillStubMode()) {
    const stubPaths: Record<PopbillHostedPageType, string> = {
      CHRG: "charge",
      LOGIN: "login",
      MEMBER: "member",
      PWD: "password",
    };
    return `https://popbill-stub.local/${stubPaths[type]}?corpNum=${corpNum}&userId=${userId || ""}&stub=1`;
  }
  // TODO: popbill-node SDK 통합
  //   const popbill = require("popbill");
  //   popbill.config({ LinkID, SecretKey, ... });
  //   return new Promise((resolve, reject) =>
  //     popbill.taxinvoice.getPopbillURL(corpNum, userId || "", type, (err, url) =>
  //       err ? reject(err) : resolve(url)
  //     )
  //   );
  console.warn(`[Popbill LIVE 미구현] getPopbillURL(${corpNum}, ${type})`);
  return null;
}

/**
 * 사내 세금계산서 → 팝빌 형식 변환
 *
 * tax_invoices 테이블의 raw 데이터를 PopbillTaxInvoice 로 변환.
 * 라인 4개 초과 시 첫 4개만 사용 + remark1 에 "외 N건" 추가.
 */
export function buildPopbillPayload(
  ti: any,
  lines: any[],
  issuerCorpNum: string,
  issuerName: string,
): PopbillTaxInvoice {
  const detailList = lines.slice(0, 4).map((l, idx) => ({
    serialNum: idx + 1,
    itemName: l.itemName,
    spec: l.itemSpec || undefined,
    qty: l.quantity ? String(l.quantity) : undefined,
    unitCost: l.unitPrice ? String(l.unitPrice) : undefined,
    supplyCost: String(l.supplyAmount),
    tax: String(l.taxAmount || 0),
  }));

  let remark1 = ti.remark1 || "";
  if (lines.length > 4) {
    remark1 = `${remark1}${remark1 ? " " : ""}외 ${lines.length - 4}건`.trim();
  }

  return {
    invoicerCorpNum: issuerCorpNum.replace(/-/g, ""),
    invoiceeCorpNum: (ti.partnerBizNo || "").replace(/-/g, ""),
    invoiceeCorpName: ti.partnerName || "",
    invoiceeCEOName: ti.partnerCeo || undefined,
    invoiceeAddr: ti.partnerAddress || undefined,
    writeDate: ti.issueDate.replace(/-/g, ""),
    chargeDirection:
      ti.taxCategory === "tax_free"
        ? "면세"
        : ti.taxCategory === "zero_rated"
          ? "영세율"
          : "정과세",
    purposeType: ti.receiptType === "receipt" ? "영수" : "청구",
    supplyCostTotal: String(ti.supplyAmount),
    taxTotal: String(ti.taxAmount),
    totalAmount: String(ti.totalAmount),
    detailList,
    remark1: remark1 || undefined,
    remark2: ti.remark2 || undefined,
    remark3: ti.remark3 || undefined,
    mgtKey: ti.popbillMgtKey || `TI-${ti.id}`,
  };
}
