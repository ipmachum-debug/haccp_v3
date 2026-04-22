/**
 * 엑셀 일괄등록 모달 컴포넌트
 * 
 * 매입/매출 등록 페이지 내에서 모달 형태로 사용.
 * 4-step 워크플로우: 파일 업로드 → 헤더 매핑 → 데이터 검증/매칭 → 등록 결과
 * 
 * Props로 mode('purchase' | 'sale')를 받아 매입/매출 구분.
 */
import { useState, useMemo, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import type { RouterOutput } from "@/lib/trpcTypes";

// 엑셀 업로드 도메인 타입
type PartnerRow = RouterOutput["partners"]["list"][number];
type ItemMasterRow = RouterOutput["itemMaster"]["list"]["items"][number];
type UploadItem = ItemMasterRow & { _displayType: string };
type UploadError = { row?: number; index?: number; message?: string; error?: string };
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle,
  Download, ArrowLeft, RefreshCw, Search, Package, Building2, X, ChevronRight,
  Sparkles, Wand2, Zap, ShieldCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { fuzzyMatchItem, fuzzyMatchPartner, autoMatchHeaders, type FuzzyMatchResult } from "@/lib/fuzzyMatch";

import { formatLocalDate, todayLocal } from "../lib/dateUtils";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 타입 정의
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type RowStatus = 'ready' | 'matched' | 'warning' | 'error';

type ParsedRow = {
  id: string;
  rowIndex: number;
  raw: Record<string, string>;
  transactionDate: string;
  partnerName: string;
  partnerId: number | null;
  partnerMatchScore: number;
  itemName: string;
  skuCode: string;  // Phase 8+: 엑셀 SKU 컬럼 원본
  itemMasterId: number | null;
  itemType: ItemMasterRow['itemType'] | null;  // 매칭된 품목 타입 (4종)
  itemMatchScore: number;
  itemMatchResults: FuzzyMatchResult[];
  quantity: number;
  unitPrice: number;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  taxRate: number;      // 실제 적용 세율 (10 = 과세, 0 = 면세)
  isTaxFree: boolean;   // 면세 여부 (UI 뱃지용)
  unit: string;
  memo: string;
  status: RowStatus;
  statusMessage: string;
};

type Step = 'upload' | 'mapping' | 'review' | 'result';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 매입/매출 공통 + 분기 헤더 필드
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PURCHASE_FIELDS = [
  { key: 'transactionDate', label: '거래일자', aliases: ['날짜', '일자', '매입일자', '매입일', '입고일', '입고일자', 'date', '거래날짜'] },
  { key: 'partnerName', label: '거래처', aliases: ['거래처명', '공급처', '공급업체', '업체명', '업체', '공급자', 'supplier', 'partner', '거래처이름'] },
  { key: 'itemName', label: '품목명', aliases: ['품목', '품명', '상품명', '제품명', '원재료명', '재료명', 'item', 'product', '자재명'] },
  { key: 'skuCode', label: 'SKU', aliases: ['sku코드', 'sku', 'SKU', 'skuCode', '상품코드', '품목코드', '자재코드', '원재료코드', 'itemcode'] },
  { key: 'quantity', label: '수량', aliases: ['수량(EA)', '입고수량', 'qty', 'quantity', '갯수', '개수'] },
  { key: 'unitPrice', label: '단가', aliases: ['단가(원)', '매입단가', '입고단가', 'price', 'unit price', '원가'] },
  { key: 'amount', label: '공급가액', aliases: ['금액', '공급가', '매입금액', 'amount', '합계금액', '공급가액(원)'] },
  { key: 'taxAmount', label: '부가세', aliases: ['세액', '부가세액', 'vat', 'tax', '부가가치세'] },
  { key: 'totalAmount', label: '합계', aliases: ['총금액', '총액', 'total', '합계금액', '매입합계'] },
  { key: 'unit', label: '단위', aliases: ['규격단위', 'unit', '포장단위'] },
  { key: 'memo', label: '비고', aliases: ['메모', '참고', 'note', 'memo', '비고사항', '적요'] },
];

const SALE_FIELDS = [
  { key: 'transactionDate', label: '거래일자', aliases: ['날짜', '일자', '매출일자', '매출일', '출고일', '출고일자', 'date', '거래날짜'] },
  { key: 'partnerName', label: '거래처', aliases: ['거래처명', '고객사', '고객', '업체명', '업체', '수요처', 'customer', 'partner', '거래처이름'] },
  { key: 'itemName', label: '품목명', aliases: ['품목', '품명', '상품명', '제품명', 'item', 'product', '출고제품'] },
  { key: 'skuCode', label: 'SKU', aliases: ['sku코드', 'sku', 'SKU', 'skuCode', '상품코드', '품목코드', 'itemcode'] },
  { key: 'quantity', label: '수량', aliases: ['수량(EA)', '출고수량', 'qty', 'quantity', '갯수', '개수'] },
  { key: 'unitPrice', label: '단가', aliases: ['단가(원)', '매출단가', '출고단가', '판매단가', 'price', 'unit price'] },
  { key: 'amount', label: '공급가액', aliases: ['금액', '공급가', '매출금액', 'amount', '합계금액', '공급가액(원)'] },
  { key: 'taxAmount', label: '부가세', aliases: ['세액', '부가세액', 'vat', 'tax', '부가가치세'] },
  { key: 'totalAmount', label: '합계', aliases: ['총금액', '총액', 'total', '합계금액', '매출합계'] },
  { key: 'unit', label: '포장규격(단위)', aliases: ['단위', '규격단위', '포장단위', '포장규격', 'unit', 'SKU단위', '판매단위', 'salesUnit'] },
  { key: 'memo', label: '비고', aliases: ['메모', '참고', 'note', 'memo', '비고사항', '적요'] },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Props
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ExcelBulkUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'purchase' | 'sale';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 메인 컴포넌트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function ExcelBulkUploadModal({ open, onOpenChange, mode }: ExcelBulkUploadModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isPurchase = mode === 'purchase';
  const EXPECTED_FIELDS = isPurchase ? PURCHASE_FIELDS : SALE_FIELDS;
  const modeLabel = isPurchase ? '매입' : '매출';
  const accentColor = isPurchase ? 'emerald' : 'blue';

  // 워크플로우 단계
  const [step, setStep] = useState<Step>('upload');

  // 엑셀 파싱 데이터
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [excelRawRows, setExcelRawRows] = useState<Record<string, string>[]>([]);
  const [headerMapping, setHeaderMapping] = useState<Record<string, number | null>>({});
  const [fileName, setFileName] = useState<string>('');

  // 매핑 완료 후 데이터
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);

  // 품목/거래처 매칭 서브 다이얼로그
  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [matchDialogRowId, setMatchDialogRowId] = useState<string>('');
  const [matchDialogType, setMatchDialogType] = useState<'item' | 'partner'>('item');

  // 업로드 결과
  const [uploadResult, setUploadResult] = useState<{ successCount: number; failCount: number; total: number; errors: UploadError[] } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // ─── 데이터 조회 ───
  const { data: allPartners } = trpc.partners.search.useQuery(
    { search: '', limit: 50 },
    { staleTime: 60_000, enabled: open }
  );
  const partners: PartnerRow[] = (allPartners as PartnerRow[]) ?? [];

  const { data: rawMaterials } = trpc.itemMaster.list.useQuery({ itemType: "raw_material" as any, isActive: 1, limit: 500 }, { enabled: open });
  const { data: ownProducts } = trpc.itemMaster.list.useQuery({ itemType: "own_product" as any, isActive: 1, limit: 500 }, { enabled: open });
  const { data: externalProducts } = trpc.itemMaster.list.useQuery({ itemType: "external_product" as any, isActive: 1, limit: 500 }, { enabled: open });
  const { data: subsidiaryItems } = trpc.itemMaster.list.useQuery({ itemType: "subsidiary" as any, isActive: 1, limit: 500 }, { enabled: open });

  const allItems = useMemo(() => [
    ...(rawMaterials?.items ?? []).map((i: ItemMasterRow) => ({ ...i, _displayType: '원재료' })),
    ...(ownProducts?.items ?? []).map((i: ItemMasterRow) => ({ ...i, _displayType: '자사제품' })),
    ...(externalProducts?.items ?? []).map((i: ItemMasterRow) => ({ ...i, _displayType: '외부제품' })),
    ...(subsidiaryItems?.items ?? []).map((i: ItemMasterRow) => ({ ...i, _displayType: '부자재' })),
  ], [rawMaterials, ownProducts, externalProducts, subsidiaryItems]);

  const utils = trpc.useUtils();
  const bulkPurchaseMutation = trpc.haccpIntegration.bulkCreatePurchases.useMutation();
  const bulkSaleMutation = trpc.haccpIntegration.bulkCreateSales.useMutation();
  const aiMatchMutation = (trpc as any).aiSkuMatch?.matchBatch?.useMutation?.();
  const [duplicateKeys, setDuplicateKeys] = useState<Set<string>>(new Set());
  const [isAiMatching, setIsAiMatching] = useState(false);

  // ★ 2026-04-22: B2C 전자상거래 (회계 제외) 체크박스 (매출 모드 전용)
  //   - 체크 시 이 업로드의 모든 매출이 accounting_excluded=1 로 INSERT
  //   - 재고 차감은 그대로 (HACCP), 매출 분개는 skip
  //   - 수금 처리도 차단 → [플랫폼 정산] 메뉴로 안내
  const [accountingExcluded, setAccountingExcluded] = useState(false);

  // ─── 리셋 ───
  const resetAll = useCallback(() => {
    setStep('upload');
    setExcelHeaders([]);
    setExcelRawRows([]);
    setHeaderMapping({});
    setFileName('');
    setParsedRows([]);
    setUploadResult(null);
    setMatchDialogOpen(false);
  }, []);

  // 모달 닫을 때 리셋
  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) resetAll();
    onOpenChange(isOpen);
  }, [onOpenChange, resetAll]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 1: 엑셀 파일 업로드 및 파싱
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        if (jsonData.length < 2) {
          toast({ title: "데이터가 부족합니다", description: "헤더와 최소 1행의 데이터가 필요합니다.", variant: "destructive" });
          return;
        }

        const headers = jsonData[0].map((h: string | number) => String(h || '').trim());
        const rows = jsonData.slice(1).filter((row: Array<string | number>) => row.some((cell) => cell !== '' && cell !== null && cell !== undefined));

        const rawRows = rows.map((row: Array<string | number>) => {
          const obj: Record<string, string> = {};
          headers.forEach((h: string, idx: number) => {
            obj[h] = String(row[idx] ?? '').trim();
          });
          return obj;
        });

        setExcelHeaders(headers);
        setExcelRawRows(rawRows);

        // 자동 헤더 매칭
        const mapping = autoMatchHeaders(headers, EXPECTED_FIELDS);
        setHeaderMapping(mapping);

        setStep('mapping');
        toast({ title: `${file.name} 파일 로드 완료`, description: `${headers.length}개 열, ${rawRows.length}행 감지` });
      } catch (err) {
        toast({ title: "엑셀 파일 파싱 오류", description: String(err), variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [toast, EXPECTED_FIELDS]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 2: 헤더 매핑
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const handleMappingChange = (fieldKey: string, colIdx: string) => {
    setHeaderMapping(prev => ({
      ...prev,
      [fieldKey]: colIdx === '__none__' ? null : Number(colIdx),
    }));
  };

  const applyMappingAndMatch = useCallback(() => {
    const rows: ParsedRow[] = excelRawRows.map((raw, idx) => {
      const getValue = (key: string): string => {
        const colIdx = headerMapping[key];
        if (colIdx === null || colIdx === undefined) return '';
        const header = excelHeaders[colIdx];
        return raw[header] ?? '';
      };

      // 날짜 파싱
      let transactionDate = getValue('transactionDate');
      if (transactionDate) {
        const numDate = Number(transactionDate);
        if (!isNaN(numDate) && numDate > 30000 && numDate < 60000) {
          const d = new Date((numDate - 25569) * 86400 * 1000);
          transactionDate = formatLocalDate(d);
        } else {
          transactionDate = transactionDate
            .replace(/[./]/g, '-')
            .replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
        }
      }

      const partnerName = getValue('partnerName');
      const itemName = getValue('itemName');
      const skuCode = getValue('skuCode');  // Phase 8+
      const quantity = parseFloat(getValue('quantity')) || 0;
      const unitPrice = parseFloat(getValue('unitPrice').replace(/,/g, '')) || 0;
      let amount = parseFloat(getValue('amount').replace(/,/g, '')) || 0;
      // 부가세 컬럼: 입력 유무를 구분해야 '명시적 0' (= 면세) 판정 가능
      const rawTaxAmount = getValue('taxAmount').replace(/,/g, '').trim();
      const taxAmountExplicit = rawTaxAmount !== '';
      let taxAmount = parseFloat(rawTaxAmount) || 0;
      let totalAmount = parseFloat(getValue('totalAmount').replace(/,/g, '')) || 0;
      const unit = getValue('unit') || 'EA';
      const memo = getValue('memo');

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 금액 자동계산 / 역산 / 과세·비과세 감지 (2026-04-21)
      // 규칙:
      //  (1) 수량×단가 있으면 → 공급가 계산
      //  (2) 합계만 있고 공급가 없으면 → 부가세 명시 0 이면 면세(합계=공급가), 아니면 과세 역산 (÷1.1)
      //  (3) 공급가=합계 + 부가세 미입력/0 → 면세로 인식
      //  (4) 과세: 부가세 = round(공급가 × 0.1), 합계 = 공급가 + 부가세
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      // (1) 수량×단가 → 공급가 (기본 경로)
      if (!amount && quantity && unitPrice) amount = quantity * unitPrice;

      // (2) 공급가 없이 합계만 있으면 역산
      if (!amount && totalAmount) {
        if (taxAmountExplicit && taxAmount === 0) {
          // 부가세=0 명시 → 면세
          amount = totalAmount;
        } else {
          // 과세 역산
          amount = Math.round(totalAmount / 1.1);
          if (!taxAmount) taxAmount = totalAmount - amount;
        }
      }

      // (3) 면세 판정: 공급가 = 합계 이거나, 부가세=0 명시
      //     (단, 합계 미입력 상태에서 부가세 비움은 과세로 가정)
      const looksLikeTaxFree =
        amount > 0 &&
        (
          (taxAmountExplicit && taxAmount === 0) ||
          (totalAmount > 0 && totalAmount === amount && !taxAmount)
        );

      // (4) 부가세/합계 자동 계산
      if (looksLikeTaxFree) {
        taxAmount = 0;
        if (!totalAmount) totalAmount = amount;
      } else {
        if (!taxAmount && amount) taxAmount = Math.round(amount * 0.1);
        if (!totalAmount && amount) totalAmount = amount + taxAmount;
      }

      const isTaxFree = looksLikeTaxFree || (amount > 0 && taxAmount === 0 && totalAmount === amount);
      const taxRate = isTaxFree ? 0 : 10;

      // 거래처 퍼지 매칭
      let partnerId: number | null = null;
      let partnerMatchScore = 0;
      if (partnerName && partners.length > 0) {
        const partnerMatches = fuzzyMatchPartner(partnerName, partners, 1);
        if (partnerMatches.length > 0 && partnerMatches[0].score >= 0.7) {
          partnerId = partnerMatches[0].partner.id;
          partnerMatchScore = partnerMatches[0].score;
        }
      }

      // 품목 매칭 — SKU 코드 우선, 없으면 품명 퍼지 (Phase 8+)
      let itemMasterId: number | null = null;
      let itemType: ItemMasterRow['itemType'] | null = null;
      let itemMatchScore = 0;
      let itemMatchResults: FuzzyMatchResult[] = [];

      // (1) SKU 코드 완전일치 시도
      if (skuCode && allItems.length > 0) {
        const skuNormalized = skuCode.toLowerCase().replace(/[\s\-_]/g, '');
        const skuExactMatch = allItems.find((i) => {
          const code = String(i.itemCode || '').toLowerCase().replace(/[\s\-_]/g, '');
          return code === skuNormalized;
        });
        if (skuExactMatch) {
          itemMasterId = skuExactMatch.id;
          itemType = skuExactMatch.itemType;
          itemMatchScore = 1.0;
        }
      }

      // (2) SKU 실패 시 품명 퍼지
      if (!itemMasterId && itemName && allItems.length > 0) {
        itemMatchResults = fuzzyMatchItem(itemName, allItems, 5);
        if (itemMatchResults.length > 0 && itemMatchResults[0].score >= 0.7) {
          itemMasterId = itemMatchResults[0].item.id;
          itemType = (itemMatchResults[0].item as ItemMasterRow).itemType;
          itemMatchScore = itemMatchResults[0].score;
        }
      }

      // 상태 결정
      let status: RowStatus = 'ready';
      let statusMessage = '';
      
      if (!transactionDate) { status = 'error'; statusMessage = '날짜 누락'; }
      else if (!partnerName) { status = 'error'; statusMessage = '거래처 누락'; }
      else if (!itemName) { status = 'error'; statusMessage = '품목명 누락'; }
      else if (quantity <= 0) { status = 'error'; statusMessage = '수량 오류'; }
      else if (unitPrice <= 0) { status = 'error'; statusMessage = '단가 오류'; }
      else if (!partnerId) { status = 'warning'; statusMessage = '거래처 매칭 실패'; }
      else if (!itemMasterId) { status = 'warning'; statusMessage = '품목 매칭 미확인'; }
      else if (itemMatchScore < 0.9 || partnerMatchScore < 0.9) { status = 'warning'; statusMessage = '유사도 확인 필요'; }
      else { status = 'matched'; statusMessage = '매칭 완료'; }

      return {
        id: `row-${idx}`,
        rowIndex: idx + 1,
        raw,
        transactionDate,
        partnerName,
        partnerId,
        partnerMatchScore,
        itemName,
        skuCode,
        itemMasterId,
        itemType,
        itemMatchScore,
        itemMatchResults,
        quantity,
        unitPrice,
        amount,
        taxAmount,
        totalAmount,
        taxRate,
        isTaxFree,
        unit,
        memo,
        status,
        statusMessage,
      };
    });

    setParsedRows(rows);
    setStep('review');
    // 중복 검사 비동기 실행 (매입/매출 모두)
    setTimeout(() => { void runDuplicateCheck(rows); }, 100);
  }, [excelRawRows, excelHeaders, headerMapping, partners, allItems, mode]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 3: 매칭 수정
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const openMatchDialog = (rowId: string, type: 'item' | 'partner') => {
    setMatchDialogRowId(rowId);
    setMatchDialogType(type);
    setMatchDialogOpen(true);
  };

  const handleSelectMatch = (rowId: string, type: "item" | "partner", selected: ItemMasterRow | PartnerRow) => {
    setParsedRows(prev => prev.map(row => {
      if (row.id !== rowId) return row;
      
      if (type === 'item') {
        const updated = { ...row, itemMasterId: selected.id, itemMatchScore: 1.0 };
        if (updated.partnerId && updated.transactionDate && updated.quantity > 0 && updated.unitPrice > 0) {
          updated.status = 'matched';
          updated.statusMessage = '매칭 완료';
        }
        return updated;
      } else {
        const updated = { ...row, partnerId: selected.id, partnerMatchScore: 1.0 };
        if (updated.itemName && updated.transactionDate && updated.quantity > 0 && updated.unitPrice > 0) {
          if (updated.itemMasterId || updated.status !== 'error') {
            updated.status = updated.itemMasterId ? 'matched' : 'warning';
            updated.statusMessage = updated.itemMasterId ? '매칭 완료' : '품목 매칭 미확인';
          }
        }
        return updated;
      }
    }));
    setMatchDialogOpen(false);
  };

  const handleRemoveRow = (rowId: string) => {
    setParsedRows(prev => prev.filter(r => r.id !== rowId));
  };

  /**
   * 업로드 중복 검사 (거래처+날짜+품목명 조합) — Phase 8+
   * 매입: checkPurchaseDuplicates, 매출: checkSalesDuplicates
   */
  const runDuplicateCheck = async (rows: ParsedRow[]) => {
    try {
      const candidates = rows
        .filter((r) => r.partnerId && r.transactionDate && r.itemName)
        .map((r) => ({ transactionDate: r.transactionDate, partnerId: r.partnerId!, itemName: r.itemName }));
      if (candidates.length === 0) {
        setDuplicateKeys(new Set());
        return;
      }
      const query = isPurchase
        ? (utils as any).haccpIntegration?.checkPurchaseDuplicates
        : (utils as any).haccpIntegration?.checkSalesDuplicates;
      if (!query) return;
      const result: Array<{ transactionDate: string; partnerId: number; itemName: string; isDuplicate: boolean }> =
        await query.fetch({ candidates });
      const keys = new Set<string>();
      for (const r of result || []) {
        if (r.isDuplicate) keys.add(`${r.transactionDate}|${r.partnerId}|${r.itemName}`);
      }
      setDuplicateKeys(keys);
    } catch (err) {
      console.warn("[checkDuplicates]", err);
    }
  };

  /**
   * AI 재매칭: 퍼지 0.7~0.9 구간 (warning) 행만 LLM 배치 재검증 — Phase 8+
   */
  const handleAiRematch = async () => {
    if (!aiMatchMutation) {
      toast({ title: "AI 매칭 비활성화", description: "서버 설정 확인 후 이용 가능합니다.", variant: "destructive" });
      return;
    }
    const targets = parsedRows.filter(
      (r) => r.status === 'warning' && r.itemName &&
        (!r.itemMasterId || (r.itemMatchScore >= 0.7 && r.itemMatchScore < 0.9))
    );
    if (targets.length === 0) {
      toast({ title: "AI 재매칭 대상 없음", description: "의심 구간(warning) 행이 없습니다." });
      return;
    }

    setIsAiMatching(true);
    try {
      const byPartner = new Map<number | null, typeof targets>();
      for (const r of targets) {
        const key = r.partnerId ?? null;
        if (!byPartner.has(key)) byPartner.set(key, []);
        byPartner.get(key)!.push(r);
      }

      const rowIndexToUpdate = new Map<number, { itemMasterId: number; itemType: ItemMasterRow['itemType']; score: number; reason: string }>();

      for (const [partnerId, rows] of Array.from(byPartner.entries())) {
        const payload = rows.map((r) => ({
          rowIndex: r.rowIndex,
          itemName: r.itemName,
          skuCode: r.skuCode || undefined,
          candidates: (r.itemMatchResults || []).slice(0, 5).map((m) => ({
            skuId: (m.item as ItemMasterRow).id,
            skuCode: (m.item as ItemMasterRow).itemCode,
            skuName: (m.item as ItemMasterRow).itemName,
            itemName: (m.item as ItemMasterRow).itemName,
            itemType: (m.item as ItemMasterRow).itemType,
            score: m.score,
          })),
        }));

        const results: Array<{ rowIndex: number; recommendedSkuId: number | null; confidence: number; reason: string; needsManualReview: boolean }> =
          await aiMatchMutation.mutateAsync({ partnerId, rows: payload });

        for (const res of results) {
          if (res.recommendedSkuId && res.confidence >= 70) {
            const item = allItems.find((i) => i.id === res.recommendedSkuId);
            if (item) {
              rowIndexToUpdate.set(res.rowIndex, {
                itemMasterId: item.id,
                itemType: item.itemType,
                score: res.confidence / 100,
                reason: res.reason,
              });
            }
          }
        }
      }

      if (rowIndexToUpdate.size === 0) {
        toast({ title: "AI 매칭 결과 없음", description: "신뢰도 70 이상 추천이 없습니다." });
        return;
      }

      setParsedRows((prev) =>
        prev.map((r) => {
          const upd = rowIndexToUpdate.get(r.rowIndex);
          if (!upd) return r;
          return {
            ...r,
            itemMasterId: upd.itemMasterId,
            itemType: upd.itemType,
            itemMatchScore: upd.score,
            status: upd.score >= 0.9 ? ('matched' as RowStatus) : ('warning' as RowStatus),
            statusMessage: `AI 추천: ${upd.reason}`,
          };
        })
      );
      toast({ title: "AI 재매칭 완료", description: `${rowIndexToUpdate.size}건 자동 매칭되었습니다.` });
    } catch (e) {
      const err = e as Error;
      toast({ title: "AI 재매칭 오류", description: err.message, variant: "destructive" });
    } finally {
      setIsAiMatching(false);
    }
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 4: 일괄 등록
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const readyRows = parsedRows.filter(r => r.status === 'matched' || r.status === 'warning');
  const errorRows = parsedRows.filter(r => r.status === 'error');

  const handleBulkUpload = async () => {
    if (isPurchase) {
      const uploadItems = readyRows
        .filter(r => r.partnerId && r.itemName && r.quantity > 0 && r.unitPrice > 0)
        .map(r => ({
          transactionDate: r.transactionDate,
          partnerId: r.partnerId!,
          itemName: r.itemName,
          itemMasterId: r.itemMasterId ?? undefined,
          quantity: r.quantity,
          unitPrice: r.unitPrice,
          amount: r.amount,
          taxAmount: r.taxAmount,
          taxRate: r.taxRate,
          memo: r.memo || undefined,
          unit: r.unit || undefined,
        }));

      if (uploadItems.length === 0) {
        toast({ title: "등록 가능한 데이터가 없습니다.", variant: "destructive" });
        return;
      }

      setIsUploading(true);
      try {
        const result = await bulkPurchaseMutation.mutateAsync({ items: uploadItems });
        setUploadResult(result);
        utils.haccpIntegration.getAllPurchases.invalidate();
        setStep('result');
        toast({ title: `매입 일괄 등록 완료`, description: `성공: ${result.successCount}건, 실패: ${result.failCount}건` });
      } catch (e) {
        const error = e as Error;
        toast({ title: "등록 오류", description: error.message, variant: "destructive" });
      } finally {
        setIsUploading(false);
      }
    } else {
      // 매출 업로드 — itemType 에 따라 productId vs materialId 라우팅 (Phase 8+)
      const itemLegacyMap = new Map<number, { productId?: number; materialId?: number }>();
      for (const it of allItems) {
        const legacyP = (it as any).legacyProductId as number | null;
        const legacyM = (it as any).legacyMaterialId as number | null;
        if (it.itemType === 'own_product' && legacyP) {
          itemLegacyMap.set(it.id, { productId: legacyP });
        } else if (legacyM) {
          itemLegacyMap.set(it.id, { materialId: legacyM });
        }
      }

      const uploadItems = readyRows
        .filter(r => r.partnerId && r.itemName && r.quantity > 0 && r.unitPrice > 0)
        .map(r => {
          const legacy = r.itemMasterId ? itemLegacyMap.get(r.itemMasterId) : undefined;
          return {
            transactionDate: r.transactionDate,
            partnerId: r.partnerId!,
            itemName: r.itemName,
            productId: legacy?.productId,
            materialId: legacy?.materialId,
            quantity: r.quantity,
            unitPrice: r.unitPrice,
            amount: r.amount,
            taxAmount: r.taxAmount,
            taxRate: r.taxRate,
            unit: r.unit || undefined,
            memo: r.memo || undefined,
          };
        });

      if (uploadItems.length === 0) {
        toast({ title: "등록 가능한 데이터가 없습니다.", variant: "destructive" });
        return;
      }

      setIsUploading(true);
      try {
        const result = await bulkSaleMutation.mutateAsync({
          items: uploadItems,
          accountingExcluded,  // ★ 2026-04-22: B2C 회계 제외 플래그 전달
        });
        setUploadResult(result);
        utils.haccpIntegration.getAllSales.invalidate();
        setStep('result');
        toast({ title: `매출 일괄 등록 완료`, description: `성공: ${result.successCount}건, 실패: ${result.failCount}건` });
      } catch (e) {
        const error = e as Error;
        toast({ title: "등록 오류", description: error.message, variant: "destructive" });
      } finally {
        setIsUploading(false);
      }
    }
  };

  // ─── 엑셀 양식 다운로드 ───
  const handleDownloadTemplate = () => {
    if (isPurchase) {
      // 매입 양식 (Phase 8+): SKU 컬럼 추가 + 안내 sheet 동봉
      const templateData = [
        ['거래일자', '거래처', '품목명', 'SKU', '수량', '단가', '공급가액', '부가세', '합계', '단위', '비고'],
        ['2026-03-05', '(주)골든푸드', '돈육(삼겹살)', '10001', '100', '15000', '1500000', '150000', '1650000', 'kg', ''],
        ['2026-03-05', '한솔농산', '고춧가루', '', '50', '8000', '400000', '40000', '440000', 'kg', '국내산 (SKU 미입력 시 품명 퍼지매칭)'],
        ['2026-03-05', '농협하나로', '쌀 20kg', '', '10', '55000', '550000', '0', '550000', '포', '면세품 (부가세=0 기재)'],
      ];
      const ws = XLSX.utils.aoa_to_sheet(templateData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "매입등록양식");
      ws['!cols'] = [
        { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 8 }, { wch: 10 },
        { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 6 }, { wch: 20 },
      ];

      // 안내 시트: 매칭 규칙 + 재고 연동 안내
      const guideRows = [
        ['매입 엑셀 일괄등록 안내'],
        [],
        ['■ 필수 열'],
        ['- 거래일자 : YYYY-MM-DD 또는 YYYYMMDD'],
        ['- 거래처   : 등록된 거래처명과 유사하게 (자동 매칭)'],
        ['- 품목명   : 등록된 품목 마스터 이름 (퍼지 매칭 0.7 이상)'],
        ['- 수량 / 단가 : 숫자'],
        [],
        ['■ 선택 열'],
        ['- SKU : 품목 코드 (예: 10001). 있으면 품목 매칭이 100% 확실'],
        ['- 공급가액/부가세/합계 : 비워두면 수량×단가로 자동 계산'],
        ['- 단위 : 기본 EA'],
        ['- 비고 : 자유 메모'],
        [],
        ['■ 금액 자동계산 규칙 (과세/비과세 자동 판정)'],
        ['1) 수량+단가만 입력 → 공급가=수량×단가, 부가세=공급가×10%, 합계=공급가+부가세'],
        ['2) 합계만 입력 → 공급가=round(합계÷1.1), 부가세=합계-공급가 (과세 가정)'],
        ['3) 합계=공급가 로 입력 → 면세로 자동 판정 (세율 0%, 부가세 0원)'],
        ['4) 부가세 열에 명시적으로 0 입력 → 면세로 자동 판정 (세율 0%)'],
        ['※ 비과세(면세) 거래는 부가세 컬럼에 "0" 을 직접 기재하세요 (빈칸은 과세로 간주)'],
        [],
        ['■ 매칭 파이프라인 (업로드 후 자동 실행)'],
        ['1) SKU 완전일치 → 즉시 확정'],
        ['2) 품명 퍼지 ≥0.9 → 즉시 확정'],
        ['3) 품명 퍼지 0.7~0.9 → "확인 필요" 표시 (AI 재매칭 버튼으로 LLM 재검증 가능)'],
        ['4) 매칭 실패 → 수동 선택'],
        [],
        ['■ 재고 연동 (원재료 매칭 시 자동)'],
        ['- 원재료 → LOT 자동 생성 (MAT-YYYYMMDD-순번) + FEFO 입고'],
        ['- 원재료 → 육안검사일지 자동 생성 (status=pending)'],
        ['- 카테고리 alertDays 설정 시 소비기한 알람 자동 생성'],
        ['- 원료수불부 입고 연동 + 복식부기 자동분개'],
        [],
        ['■ 묶음 (입고전표)'],
        ['- 같은 거래처+같은 거래일자 행들은 조회 시 1개 입고전표로 그룹화되어 표시됩니다.'],
        ['- 업로드 전 "입고전표 그룹화 예상" 카드에서 몇 건으로 묶일지 미리 확인 가능'],
        ['- 동일 거래처+날짜+품목 조합이 기존에 있으면 "중복" 뱃지 표시'],
      ];
      const wsGuide = XLSX.utils.aoa_to_sheet(guideRows);
      wsGuide['!cols'] = [{ wch: 70 }];
      XLSX.utils.book_append_sheet(wb, wsGuide, "안내");

      XLSX.writeFile(wb, `매입_일괄등록_양식_${todayLocal()}.xlsx`);
    } else {
      // 매출 양식 (Phase 8+): SKU 컬럼 추가 + 안내 sheet 동봉
      const templateData = [
        ['거래일자', '거래처', '품목명', 'SKU', '수량', '단가', '공급가액', '부가세', '합계', '포장규격(단위)', '비고'],
        ['2026-03-05', '맛나식품(주)', '돈까스 세트', '30001', '200', '5000', '1000000', '100000', '1100000', 'box', ''],
        ['2026-03-05', '학교급식센터', '불고기 도시락', '', '500', '3500', '1750000', '175000', '1925000', 'pack', '3월분 (SKU 미입력 시 품명 퍼지매칭)'],
        ['2026-03-05', '유치원', '생우유', '', '100', '2000', '200000', '0', '200000', 'box', '면세품 (부가세=0 기재)'],
      ];
      const ws = XLSX.utils.aoa_to_sheet(templateData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "매출등록양식");
      ws['!cols'] = [
        { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 8 }, { wch: 10 },
        { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 30 },
      ];

      // 안내 시트: 매칭 규칙 + 재고 차감 안내
      const guideRows = [
        ['매출 엑셀 일괄등록 안내'],
        [],
        ['■ 필수 열'],
        ['- 거래일자 : YYYY-MM-DD 또는 YYYYMMDD'],
        ['- 거래처   : 등록된 거래처명과 유사하게 (자동 매칭)'],
        ['- 품목명   : 등록된 품목 마스터 이름 (퍼지 매칭 0.7 이상)'],
        ['- 수량 / 단가 : 숫자'],
        [],
        ['■ 선택 열'],
        ['- SKU : 품목 코드 (예: 30001). 있으면 품목 매칭이 100% 확실'],
        ['- 공급가액/부가세/합계 : 비워두면 수량×단가로 자동 계산'],
        ['- 포장규격(단위) : 기본 EA'],
        ['- 비고 : 자유 메모'],
        [],
        ['■ 금액 자동계산 규칙 (과세/비과세 자동 판정)'],
        ['1) 수량+단가만 입력 → 공급가=수량×단가, 부가세=공급가×10%, 합계=공급가+부가세'],
        ['2) 합계만 입력 → 공급가=round(합계÷1.1), 부가세=합계-공급가 (과세 가정)'],
        ['3) 합계=공급가 로 입력 → 면세로 자동 판정 (세율 0%, 부가세 0원)'],
        ['4) 부가세 열에 명시적으로 0 입력 → 면세로 자동 판정 (세율 0%)'],
        ['※ 비과세(면세) 거래는 부가세 컬럼에 "0" 을 직접 기재하세요 (빈칸은 과세로 간주)'],
        [],
        ['■ 매칭 파이프라인 (업로드 후 자동 실행)'],
        ['1) SKU 완전일치 → 즉시 확정'],
        ['2) 품명 퍼지 ≥0.9 → 즉시 확정'],
        ['3) 품명 퍼지 0.7~0.9 → "확인 필요" 표시 (AI 재매칭 버튼으로 LLM 재검증 가능)'],
        ['4) 매칭 실패 → 수동 선택'],
        [],
        ['■ 재고 차감 (판매 품목 타입에 따라 자동)'],
        ['- 자사제품 → 완제품 재고 FEFO 차감 + 매출원가/제품재고 분개'],
        ['- 원재료/부자재/외부제품 → 해당 재고 FEFO 차감 + 매출원가/원재료재고 분개'],
        [],
        ['■ 묶음 (명세서)'],
        ['- 같은 거래처+같은 거래일자 행들은 조회 시 1개 명세서로 그룹화되어 표시됩니다.'],
        ['- 업로드 전 "명세서 그룹화 예상" 카드에서 몇 건으로 묶일지 미리 확인 가능'],
        ['- 동일 거래처+날짜+품목 조합이 기존에 있으면 "중복" 뱃지 표시'],
      ];
      const wsGuide = XLSX.utils.aoa_to_sheet(guideRows);
      wsGuide['!cols'] = [{ wch: 70 }];
      XLSX.utils.book_append_sheet(wb, wsGuide, "안내");

      XLSX.writeFile(wb, `매출_일괄등록_양식_${todayLocal()}.xlsx`);
    }
    toast({ title: "양식 다운로드 완료" });
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 렌더링
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const currentRow = parsedRows.find(r => r.id === matchDialogRowId);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[95vw] w-[1100px] max-h-[90vh] overflow-y-auto p-0">
        {/* 헤더 */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b sticky top-0 bg-background z-10">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className={`h-5 w-5 ${isPurchase ? 'text-emerald-600' : 'text-blue-600'}`} />
              {modeLabel} 엑셀 일괄등록
            </DialogTitle>
            {/* 프로그레스 스텝 */}
            <div className="flex items-center gap-1.5 text-xs">
              {(['upload', 'mapping', 'review', 'result'] as Step[]).map((s, i) => {
                const labels = ['업로드', '헤더 매핑', '검증/매칭', '결과'];
                const isActive = step === s;
                const isDone = (['upload', 'mapping', 'review', 'result'] as Step[]).indexOf(step) > i;
                return (
                  <div key={s} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition ${
                      isActive ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                      isDone ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {isDone ? <CheckCircle2 className="h-3 w-3" /> : <span className="w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[9px]">{i + 1}</span>}
                      {labels[i]}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4">
          {/* ─── Step 1: 파일 업로드 ─── */}
          {step === 'upload' && (
            <div className="text-center space-y-5 py-4">
              <div className={`mx-auto w-16 h-16 rounded-full ${isPurchase ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-blue-50 dark:bg-blue-900/20'} flex items-center justify-center`}>
                <Upload className={`h-8 w-8 ${isPurchase ? 'text-emerald-500' : 'text-blue-500'}`} />
              </div>
              <div>
                <h2 className="text-base font-semibold">엑셀 파일을 업로드해 주세요</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  .xlsx, .xls, .csv 형식 지원. 첫 번째 행은 헤더로 인식됩니다.
                </p>
              </div>
              <div className="flex justify-center gap-3">
                <Button onClick={() => fileInputRef.current?.click()} size="default" className="gap-2">
                  <Upload className="h-4 w-4" />
                  파일 선택
                </Button>
                <Button onClick={handleDownloadTemplate} variant="outline" size="default" className="gap-2">
                  <Download className="h-4 w-4" />
                  양식 다운로드
                </Button>
              </div>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />

              {/* AI 기능 안내 배너 */}
              <div className="max-w-md mx-auto rounded-xl border border-violet-200/70 bg-gradient-to-br from-violet-50 via-sky-50 to-emerald-50 dark:from-violet-950/30 dark:via-sky-950/20 dark:to-emerald-950/20 p-3 text-left shadow-sm">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="h-4 w-4 text-violet-600" />
                  <span className="text-xs font-semibold bg-gradient-to-r from-violet-600 to-sky-600 bg-clip-text text-transparent">
                    AI 매칭 엔진이 자동으로 분석합니다
                  </span>
                  <Badge variant="outline" className="ml-auto h-4 px-1.5 text-[9px] border-violet-300 text-violet-700 bg-white/60">
                    AI
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <div className="flex items-start gap-1.5">
                    <Zap className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                    <span><strong>SKU 완전일치</strong><br /><span className="text-muted-foreground">코드 정규화 후 1:1 매칭</span></span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <Wand2 className="h-3 w-3 text-sky-500 mt-0.5 shrink-0" />
                    <span><strong>퍼지 매칭</strong><br /><span className="text-muted-foreground">오타/띄어쓰기 자동 보정</span></span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <Sparkles className="h-3 w-3 text-violet-500 mt-0.5 shrink-0" />
                    <span><strong>AI 재매칭</strong><br /><span className="text-muted-foreground">GPT-4o 로 품명 유사도 분석</span></span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <ShieldCheck className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                    <span><strong>중복 감지</strong><br /><span className="text-muted-foreground">기존 거래와 충돌 사전 차단</span></span>
                  </div>
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-3 text-left text-xs text-muted-foreground max-w-md mx-auto space-y-0.5">
                <p className="font-medium text-foreground text-xs mb-1.5">필수 열:</p>
                <p>- <strong>거래일자</strong>: 2026-03-05 또는 20260305 형식</p>
                <p>- <strong>거래처</strong>: 등록된 거래처명과 유사하게</p>
                <p>- <strong>품목명</strong>: 등록된 품목 마스터와 유사하게</p>
                <p>- <strong>수량</strong>, <strong>단가</strong>: 숫자</p>
                <p className="mt-2 font-medium text-foreground text-xs mb-1">선택 열:</p>
                <p>- <strong>SKU</strong>: 품목 코드 (있으면 매칭 100% 확실)</p>
                <p className="mt-1.5 text-[10px]"><strong>금액 자동 계산:</strong> 수량×단가 → 공급가액/부가세/합계 자동 산출</p>
                <p className="text-[10px]"><strong>합계만 입력한 경우:</strong> 공급가액 = 합계 ÷ 1.1 로 역산 (과세 가정)</p>
                <p className="text-[10px]"><strong>비과세(면세) 처리:</strong> 공급가액=합계 또는 부가세=0 입력 시 자동 판정 (세율 0%)</p>
                <p className="text-[10px]">
                  같은 거래처·거래일자는 자동으로 하나의 {isPurchase ? '입고전표' : '명세서'}로 묶여 표시됩니다.
                </p>
              </div>
            </div>
          )}

          {/* ─── Step 2: 헤더 매핑 ─── */}
          {step === 'mapping' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">열 매핑 확인</h2>
                  <p className="text-xs text-muted-foreground">{fileName} - {excelHeaders.length}개 열, {excelRawRows.length}행</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep('upload')}>
                    <ArrowLeft className="h-3.5 w-3.5 mr-1" /> 다시 선택
                  </Button>
                  <Button size="sm" onClick={applyMappingAndMatch}>
                    다음: 데이터 검증 <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {EXPECTED_FIELDS.map(field => {
                  const mapped = headerMapping[field.key];
                  const isRequired = ['transactionDate', 'partnerName', 'itemName', 'quantity', 'unitPrice'].includes(field.key);
                  return (
                    <div key={field.key} className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm ${
                      mapped !== null && mapped !== undefined ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/10' :
                      isRequired ? 'border-red-200 bg-red-50/50 dark:bg-red-950/10' : 'border-muted'
                    }`}>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium flex items-center gap-1">
                          {field.label}
                          {isRequired && <span className="text-red-500 text-[10px]">*</span>}
                        </span>
                      </div>
                      <Select
                        value={mapped !== null && mapped !== undefined ? String(mapped) : '__none__'}
                        onValueChange={(v) => handleMappingChange(field.key, v)}
                      >
                        <SelectTrigger className="w-[160px] h-7 text-xs">
                          <SelectValue placeholder="연결할 열 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">-- 미연결 --</SelectItem>
                          {excelHeaders.map((h, i) => (
                            <SelectItem key={i} value={String(i)} className="text-xs">{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {mapped !== null && mapped !== undefined ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : isRequired ? (
                        <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                      ) : (
                        <div className="w-3.5 h-3.5 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 미리보기 */}
              <div>
                <h3 className="text-xs font-medium mb-1.5">데이터 미리보기 (상위 3행)</h3>
                <div className="overflow-x-auto border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {excelHeaders.map((h, i) => (
                          <TableHead key={i} className="text-[11px] whitespace-nowrap py-1.5">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {excelRawRows.slice(0, 3).map((row, i) => (
                        <TableRow key={i}>
                          {excelHeaders.map((h, j) => (
                            <TableCell key={j} className="text-[11px] py-1 whitespace-nowrap">{row[h]}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 3: 데이터 검증 & 매칭 ─── */}
          {step === 'review' && (
            <div className="space-y-3">
              {/* 요약 카드 */}
              <div className="grid grid-cols-4 gap-2">
                <Card className="p-2.5 border-l-4 border-l-blue-500">
                  <div className="text-[10px] text-muted-foreground">전체</div>
                  <div className="text-lg font-bold">{parsedRows.length}건</div>
                </Card>
                <Card className="p-2.5 border-l-4 border-l-emerald-500">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-2.5 w-2.5" /> 매칭 완료</div>
                  <div className="text-lg font-bold text-emerald-600">{parsedRows.filter(r => r.status === 'matched').length}건</div>
                </Card>
                <Card className="p-2.5 border-l-4 border-l-amber-500">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-2.5 w-2.5" /> 확인 필요</div>
                  <div className="text-lg font-bold text-amber-600">{parsedRows.filter(r => r.status === 'warning').length}건</div>
                </Card>
                <Card className="p-2.5 border-l-4 border-l-red-500">
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1"><XCircle className="h-2.5 w-2.5" /> 오류</div>
                  <div className="text-lg font-bold text-red-600">{errorRows.length}건</div>
                </Card>
              </div>

              {/* 그룹화 프리뷰 (매입/매출) — Phase 8+ */}
              {(() => {
                const groups = new Map<string, { partnerId: number; count: number }>();
                for (const r of readyRows) {
                  if (!r.partnerId || !r.transactionDate) continue;
                  const key = `${r.partnerId}|${r.transactionDate}`;
                  if (!groups.has(key)) groups.set(key, { partnerId: r.partnerId, count: 0 });
                  groups.get(key)!.count++;
                }
                if (groups.size === 0) return null;
                const cardTone = isPurchase
                  ? 'bg-emerald-50/40 border-emerald-200'
                  : 'bg-blue-50/40 border-blue-200';
                const textTone = isPurchase
                  ? 'text-emerald-900 dark:text-emerald-200'
                  : 'text-blue-900 dark:text-blue-200';
                const iconTone = isPurchase ? 'text-emerald-600' : 'text-blue-600';
                const groupLabel = isPurchase ? '입고전표' : '명세서';
                return (
                  <Card className={`p-2.5 ${cardTone} space-y-1.5`}>
                    <div className="flex items-center gap-2 text-xs">
                      <FileSpreadsheet className={`h-3.5 w-3.5 ${iconTone}`} />
                      <span className={`font-medium ${textTone}`}>
                        {groupLabel} 그룹화 예상: <strong>{groups.size}개 {groupLabel}</strong> × 평균 <strong>{(readyRows.length / groups.size).toFixed(1)}개 품목</strong>
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        (거래처 {new Set(Array.from(groups.values()).map(g => g.partnerId)).size}곳)
                      </span>
                    </div>
                    {duplicateKeys.size > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-orange-700 bg-orange-50 px-2 py-1 rounded">
                        <AlertTriangle className="h-3 w-3" />
                        <span>중복 가능성: <strong>{duplicateKeys.size}건</strong> — 같은 거래처+날짜+품목 조합이 이미 등록돼 있습니다.</span>
                      </div>
                    )}
                  </Card>
                );
              })()}

              {/* ★ 2026-04-22: B2C 전자상거래 (회계 제외) 체크박스 — 매출 모드 전용 */}
              {!isPurchase && (
                <Card className="p-3 bg-amber-50/40 border-amber-300">
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={accountingExcluded}
                      onChange={(e) => setAccountingExcluded(e.target.checked)}
                      className="mt-0.5 h-4 w-4 text-amber-600 rounded"
                    />
                    <div className="flex-1 text-xs">
                      <div className="font-semibold text-amber-900 mb-1">
                        🛒 B2C 전자상거래 (회계 제외)
                      </div>
                      <div className="text-amber-800 leading-relaxed">
                        체크 시 이 업로드 매출은 <strong>재고 차감</strong>만 처리되고,
                        <strong>회계 분개(매출/부가세/수금)</strong>는 생성하지 않습니다.
                        <br />
                        → 부가세 신고용 매출은 <strong>[플랫폼 정산]</strong> 메뉴에서
                        분기/월별로 별도 입력해주세요.
                        <br />
                        <span className="text-amber-700">
                          (이지어드민·스마트스토어·쿠팡·옥션·지마켓 등 중계 플랫폼 매출에 적용)
                        </span>
                      </div>
                    </div>
                  </label>
                </Card>
              )}

              {/* 액션 바 */}
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={() => setStep('mapping')}>
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" /> 매핑 수정
                </Button>
                <div className="flex gap-2">
                  {parsedRows.some(r => r.status === 'warning') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAiRematch}
                      disabled={isAiMatching}
                      className="border-violet-300 text-violet-700 hover:bg-violet-50"
                      title="매칭 유사도 70~90% 구간을 AI가 재검증합니다"
                    >
                      {isAiMatching ? (
                        <><RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> AI 매칭 중...</>
                      ) : (
                        <><Search className="h-3.5 w-3.5 mr-1" /> AI 재매칭</>
                      )}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={resetAll}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> 파일 다시 선택
                  </Button>
                  <Button size="sm" onClick={handleBulkUpload} disabled={readyRows.length === 0 || isUploading}
                    className={isPurchase ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700"}>
                    {isUploading ? (
                      <><RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> 등록 중...</>
                    ) : (
                      <><Upload className="h-3.5 w-3.5 mr-1" /> {readyRows.filter(r => r.partnerId).length}건 일괄 등록</>
                    )}
                  </Button>
                </div>
              </div>

              {/* 데이터 테이블 */}
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-[5]">
                      <TableRow className="bg-muted/80">
                        <TableHead className="w-[40px] text-[11px] text-center py-1.5">#</TableHead>
                        <TableHead className="w-[50px] text-[11px] text-center py-1.5">상태</TableHead>
                        <TableHead className="text-[11px] w-[90px] py-1.5">거래일자</TableHead>
                        <TableHead className="text-[11px] min-w-[110px] py-1.5">거래처</TableHead>
                        <TableHead className="text-[11px] min-w-[130px] py-1.5">품목명</TableHead>
                        <TableHead className="text-[11px] w-[60px] text-right py-1.5">수량</TableHead>
                        <TableHead className="text-[11px] w-[70px] text-center py-1.5">포장규격</TableHead>
                        <TableHead className="text-[11px] w-[80px] text-right py-1.5">단가</TableHead>
                        <TableHead className="text-[11px] w-[90px] text-right py-1.5">공급가액</TableHead>
                        <TableHead className="text-[11px] w-[70px] text-right py-1.5">부가세</TableHead>
                        <TableHead className="text-[11px] w-[90px] text-right py-1.5">합계</TableHead>
                        <TableHead className="text-[11px] w-[36px] py-1.5"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedRows.map((row) => (
                        <TableRow key={row.id} className={
                          row.status === 'error' ? 'bg-red-50/50 dark:bg-red-950/10' :
                          row.status === 'warning' ? 'bg-amber-50/30 dark:bg-amber-950/10' :
                          row.status === 'matched' ? 'bg-emerald-50/30 dark:bg-emerald-950/10' : ''
                        }>
                          <TableCell className="text-[11px] text-center text-muted-foreground py-1">{row.rowIndex}</TableCell>
                          <TableCell className="text-center py-1">
                            <div className="flex flex-col items-center gap-0.5">
                              {row.status === 'matched' ? <Badge className="bg-emerald-100 text-emerald-700 text-[9px] px-1 py-0">OK</Badge> :
                               row.status === 'warning' ? <Badge className="bg-amber-100 text-amber-700 text-[9px] px-1 py-0">확인</Badge> :
                               row.status === 'error' ? <Badge className="bg-red-100 text-red-700 text-[9px] px-1 py-0">오류</Badge> :
                               <Badge variant="secondary" className="text-[9px] px-1 py-0">대기</Badge>}
                              {row.partnerId && row.transactionDate && row.itemName &&
                                duplicateKeys.has(`${row.transactionDate}|${row.partnerId}|${row.itemName}`) && (
                                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300 text-[8px] px-1 py-0">중복</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-[11px] py-1">{row.transactionDate}</TableCell>
                          <TableCell className="text-[11px] py-1">
                            <button
                              onClick={() => openMatchDialog(row.id, 'partner')}
                              className={`text-left w-full hover:underline flex items-center gap-1 ${
                                row.partnerId ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'
                              }`}
                            >
                              <Building2 className="h-3 w-3 shrink-0" />
                              <span className="truncate">{row.partnerName || '-'}</span>
                              {row.partnerId && row.partnerMatchScore < 1 && (
                                <span className="text-[8px] text-muted-foreground">({Math.round(row.partnerMatchScore * 100)}%)</span>
                              )}
                            </button>
                          </TableCell>
                          <TableCell className="text-[11px] py-1">
                            <button
                              onClick={() => openMatchDialog(row.id, 'item')}
                              className={`text-left w-full hover:underline flex items-center gap-1 ${
                                row.itemMasterId ? 'text-blue-700 dark:text-blue-400' : 'text-amber-600'
                              }`}
                            >
                              <Package className="h-3 w-3 shrink-0" />
                              <span className="truncate">{row.itemName || '-'}</span>
                              {row.itemMasterId && row.itemMatchScore < 1 && (
                                <span className="text-[8px] text-muted-foreground">({Math.round(row.itemMatchScore * 100)}%)</span>
                              )}
                              {row.itemType && (
                                <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 ml-0.5">
                                  {row.itemType === 'own_product' ? '자사' :
                                   row.itemType === 'raw_material' ? '원재료' :
                                   row.itemType === 'subsidiary' ? '부자재' :
                                   row.itemType === 'external_product' ? '외부' : ''}
                                </Badge>
                              )}
                            </button>
                          </TableCell>
                          <TableCell className="text-[11px] text-right tabular-nums py-1">{row.quantity.toLocaleString()}</TableCell>
                          <TableCell className="text-[11px] text-center py-1">
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0">{row.unit || '-'}</Badge>
                          </TableCell>
                          <TableCell className="text-[11px] text-right tabular-nums py-1">{row.unitPrice.toLocaleString()}</TableCell>
                          <TableCell className="text-[11px] text-right tabular-nums py-1">{row.amount.toLocaleString()}</TableCell>
                          <TableCell className="text-[11px] text-right tabular-nums py-1">{row.taxAmount.toLocaleString()}</TableCell>
                          <TableCell className="text-[11px] text-right tabular-nums font-semibold py-1">{row.totalAmount.toLocaleString()}</TableCell>
                          <TableCell className="text-center py-1">
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => handleRemoveRow(row.id)}>
                              <X className="h-3 w-3 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* 하단 합계 */}
              <div className={`p-2.5 flex items-center justify-between rounded-lg border text-sm ${
                isPurchase ? 'bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-200' : 'bg-blue-50/50 dark:bg-blue-950/10 border-blue-200'
              }`}>
                <span className="text-xs font-medium">등록 대상 합계 ({readyRows.filter(r => r.partnerId).length}건)</span>
                <div className="flex gap-4 text-xs tabular-nums">
                  <span>공급가액: <strong>{readyRows.reduce((s, r) => s + r.amount, 0).toLocaleString()}</strong></span>
                  <span>부가세: <strong>{readyRows.reduce((s, r) => s + r.taxAmount, 0).toLocaleString()}</strong></span>
                  <span className={`font-bold ${isPurchase ? 'text-emerald-600' : 'text-blue-600'}`}>
                    합계: {readyRows.reduce((s, r) => s + r.totalAmount, 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 4: 결과 ─── */}
          {step === 'result' && uploadResult && (
            <div className="text-center space-y-5 py-4">
              <div className={`mx-auto w-16 h-16 rounded-full ${isPurchase ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-blue-50 dark:bg-blue-900/20'} flex items-center justify-center`}>
                <CheckCircle2 className={`h-8 w-8 ${isPurchase ? 'text-emerald-500' : 'text-blue-500'}`} />
              </div>
              <div>
                <h2 className="text-lg font-bold">{modeLabel} 일괄 등록 완료</h2>
                <p className="text-sm text-muted-foreground mt-0.5">총 {uploadResult.total}건 처리</p>
              </div>
              <div className="flex justify-center gap-8">
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-600">{uploadResult.successCount}</div>
                  <div className="text-xs text-muted-foreground">성공</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{uploadResult.failCount}</div>
                  <div className="text-xs text-muted-foreground">실패</div>
                </div>
              </div>
              {uploadResult.errors.length > 0 && (
                <div className="bg-red-50 dark:bg-red-950/10 rounded-lg p-3 text-left max-w-sm mx-auto">
                  <p className="text-xs font-medium text-red-700 mb-1.5">오류 상세:</p>
                  {uploadResult.errors.slice(0, 5).map((err, i) => (
                    <p key={i} className="text-[11px] text-red-600">행 {(err.index ?? 0) + 1}: {err.message}</p>
                  ))}
                  {uploadResult.errors.length > 5 && (
                    <p className="text-[11px] text-red-500 mt-1">... 외 {uploadResult.errors.length - 5}건</p>
                  )}
                </div>
              )}
              <div className="flex justify-center gap-3">
                <Button onClick={() => handleOpenChange(false)} className="gap-2">
                  닫기
                </Button>
                <Button variant="outline" onClick={resetAll} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  추가 업로드
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ─── 매칭 서브 다이얼로그 ─── */}
        <Dialog open={matchDialogOpen} onOpenChange={setMatchDialogOpen}>
          <DialogContent className="max-w-lg z-[60]">
            <DialogHeader>
              <DialogTitle className="text-sm">
                {matchDialogType === 'item' ? '품목 매칭 선택' : '거래처 매칭 선택'}
              </DialogTitle>
            </DialogHeader>
            {currentRow && (
              <div className="space-y-3">
                <div className="bg-muted/50 rounded-lg p-2.5 text-xs">
                  <span className="text-muted-foreground">입력값: </span>
                  <strong>{matchDialogType === 'item' ? currentRow.itemName : currentRow.partnerName}</strong>
                </div>

                {matchDialogType === 'item' ? (
                  <div className="space-y-1 max-h-[280px] overflow-y-auto">
                    {(currentRow.itemMatchResults.length > 0 ? currentRow.itemMatchResults : fuzzyMatchItem(currentRow.itemName, allItems, 10)).map((match, i) => (
                      <button key={i} onClick={() => handleSelectMatch(currentRow.id, 'item', match.item)}
                        className="w-full text-left px-3 py-2 rounded-lg border hover:bg-blue-50 dark:hover:bg-blue-950/20 flex items-center gap-3 transition">
                        <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{match.item.itemName}</div>
                          <div className="text-[10px] text-muted-foreground">{match.item._displayType} · {match.matchType}</div>
                        </div>
                        <Badge variant={match.score >= 0.9 ? 'default' : match.score >= 0.7 ? 'secondary' : 'outline'}
                          className="text-[10px]">
                          {Math.round(match.score * 100)}%
                        </Badge>
                      </button>
                    ))}
                    {currentRow.itemMatchResults.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-3">매칭 결과가 없습니다</p>
                    )}
                    <div className="border-t pt-2 mt-2">
                      <p className="text-xs text-muted-foreground mb-1">또는 전체 품목에서 선택:</p>
                      <ItemSearchSelect items={allItems} onSelect={(item) => handleSelectMatch(currentRow.id, 'item', item)} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1 max-h-[280px] overflow-y-auto">
                    {fuzzyMatchPartner(currentRow.partnerName, partners, 10).map((match, i) => (
                      <button key={i} onClick={() => handleSelectMatch(currentRow.id, 'partner', match.partner)}
                        className="w-full text-left px-3 py-2 rounded-lg border hover:bg-emerald-50 dark:hover:bg-emerald-950/20 flex items-center gap-3 transition">
                        <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{match.partner.company_name}</div>
                          <div className="text-[10px] text-muted-foreground">{match.partner.biz_no || ''}</div>
                        </div>
                        <Badge variant={match.score >= 0.9 ? 'default' : match.score >= 0.7 ? 'secondary' : 'outline'}
                          className="text-[10px]">
                          {Math.round(match.score * 100)}%
                        </Badge>
                      </button>
                    ))}
                    <div className="border-t pt-2 mt-2">
                      <p className="text-xs text-muted-foreground mb-1">또는 전체 거래처에서 선택:</p>
                      <PartnerSearchSelect partners={partners} onSelect={(p) => handleSelectMatch(currentRow.id, 'partner', p)} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 하위 검색 컴포넌트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ItemSearchSelect({ items, onSelect }: { items: UploadItem[]; onSelect: (item: UploadItem) => void }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search) return items.slice(0, 10);
    const q = search.toLowerCase();
    return items.filter((i: UploadItem) =>
      (i.itemName || '').toLowerCase().includes(q) || (i.itemCode || '').toLowerCase().includes(q)
    ).slice(0, 10);
  }, [search, items]);

  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="품목명/코드 검색..."
          className="h-7 text-xs pl-7" />
      </div>
      <div className="max-h-[140px] overflow-y-auto">
        {filtered.map((item: UploadItem) => (
          <button key={item.id} onClick={() => onSelect(item)}
            className="w-full text-left px-2 py-1 text-xs hover:bg-muted rounded flex items-center gap-2">
            <span className="font-medium truncate flex-1">{item.itemName}</span>
            <span className="text-[10px] text-muted-foreground">{item._displayType}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PartnerSearchSelect({ partners, onSelect }: { partners: PartnerRow[]; onSelect: (p: PartnerRow) => void }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search) return partners.slice(0, 10);
    const q = search.toLowerCase();
    return partners.filter((p: PartnerRow) =>
      (p.companyName || '').toLowerCase().includes(q) || (p.bizNo || '').toLowerCase().includes(q)
    ).slice(0, 10);
  }, [search, partners]);

  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="거래처명/사업자번호 검색..."
          className="h-7 text-xs pl-7" />
      </div>
      <div className="max-h-[140px] overflow-y-auto">
        {filtered.map((p: PartnerRow) => (
          <button key={p.id} onClick={() => onSelect(p)}
            className="w-full text-left px-2 py-1 text-xs hover:bg-muted rounded flex items-center gap-2">
            <span className="font-medium truncate flex-1">{p.companyName}</span>
            <span className="text-[10px] text-muted-foreground">{p.bizNo || ''}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
