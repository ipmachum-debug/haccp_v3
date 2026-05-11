import { useState, useMemo, useCallback, useRef } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import type { RouterOutput } from "@/lib/trpcTypes";

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
  Download, ArrowLeft, RefreshCw, Search, Package, Building2, X, ChevronRight, Tag, Boxes,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";
import { fuzzyMatchItem, fuzzyMatchPartner, autoMatchHeaders, type FuzzyMatchResult } from "@/lib/fuzzyMatch";

import { formatLocalDate, todayLocal } from "../../lib/dateUtils";

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
  itemType: ItemMasterRow['itemType'] | null;  // 매칭된 품목 타입 (4종 중 하나)
  itemMatchScore: number;
  itemMatchResults: FuzzyMatchResult[];
  quantity: number;
  unitPrice: number;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  memo: string;
  status: RowStatus;
  statusMessage: string;
};

const EXPECTED_FIELDS = [
  { key: 'transactionDate', label: '거래일자', aliases: ['날짜', '일자', '매출일자', '매출일', '출고일', '출고일자', 'date', '거래날짜'] },
  { key: 'partnerName', label: '거래처', aliases: ['거래처명', '고객사', '고객', '업체명', '업체', '수요처', 'customer', 'partner', '거래처이름'] },
  { key: 'itemName', label: '품목명', aliases: ['품목', '품명', '상품명', '제품명', 'item', 'product', '출고제품'] },
  { key: 'skuCode', label: 'SKU', aliases: ['sku코드', 'sku', 'skuCode', 'SKU', '상품코드', '품목코드', 'itemcode'] },
  { key: 'quantity', label: '수량', aliases: ['수량(EA)', '출고수량', 'qty', 'quantity', '갯수', '개수'] },
  { key: 'unitPrice', label: '단가', aliases: ['단가(원)', '매출단가', '출고단가', '판매단가', 'price', 'unit price'] },
  { key: 'amount', label: '공급가액', aliases: ['금액', '공급가', '매출금액', 'amount', '합계금액', '공급가액(원)'] },
  { key: 'taxAmount', label: '부가세', aliases: ['세액', '부가세액', 'vat', 'tax', '부가가치세'] },
  { key: 'totalAmount', label: '합계', aliases: ['총금액', '총액', 'total', '합계금액', '매출합계'] },
  { key: 'memo', label: '비고', aliases: ['메모', '참고', 'note', 'memo', '비고사항', '적요'] },
];

export default function SalesBulkUpload() {
  return (
    <DashboardLayout>
      <SalesBulkUploadContent />
    </DashboardLayout>
  );
}

function SalesBulkUploadContent() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  type Step = 'upload' | 'mapping' | 'review' | 'result';
  const [step, setStep] = useState<Step>('upload');

  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [excelRawRows, setExcelRawRows] = useState<Record<string, string>[]>([]);
  const [headerMapping, setHeaderMapping] = useState<Record<string, number | null>>({});
  const [fileName, setFileName] = useState<string>('');

  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);

  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [matchDialogRowId, setMatchDialogRowId] = useState<string>('');
  const [matchDialogType, setMatchDialogType] = useState<'item' | 'partner'>('item');
  // ★ PR-F (2026-05-11): 인라인 별칭 추가 다이얼로그
  //   매출 화면 안에서 직접 "이 품목명 → 어떤 SKU" 매핑을 등록 → 향후 자동 매칭.
  //   "혼합 매칭 UI 가 어디 있는지 안 보여" 사용자 사고 해결.
  const [aliasDialogOpen, setAliasDialogOpen] = useState(false);
  const [aliasDialogRowId, setAliasDialogRowId] = useState<string>('');
  const [aliasSkuQuery, setAliasSkuQuery] = useState<string>('');
  const [aliasSelectedSkuId, setAliasSelectedSkuId] = useState<number | null>(null);

  const [uploadResult, setUploadResult] = useState<{ successCount: number; failCount: number; total: number; errors: UploadError[]; insertedIds?: number[] } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isAiMatching, setIsAiMatching] = useState(false);

  // ★ PR-J (2026-05-11): 일괄 등록 직후 승인 다이얼로그
  //   사용자 의도: "일괄 등록 마지막 단계에서 승인을 묻고, '승인' 선택 시
  //   재고 즉시 차감. 그러지 않으면 pending 으로만 등록." (회계 제외 체크와는 별도 흐름)
  //   ─────────────────────────────────────────────────
  //   approveDialogOpen: 다이얼로그 표시 여부
  //   approveCandidateIds: 방금 INSERT 된 sale.id 들 (서버에서 insertedIds 로 전달)
  //   isApproving: productSalePost 일괄 호출 중 로딩 표시
  //   accountingExcludedAtUpload: 업로드 시 체크된 회계제외 플래그 (참고용 표시)
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [approveCandidateIds, setApproveCandidateIds] = useState<number[]>([]);
  const [isApproving, setIsApproving] = useState(false);
  const [accountingExcludedAtUpload, setAccountingExcludedAtUpload] = useState(false);

  // 일괄 등록 시 회계 제외 체크 (B2C 전자상거래용)
  const [accountingExcluded, setAccountingExcluded] = useState(false);

  // PR-J: 업로드 직후 일괄 승인용 mutation
  const postMutation = trpc.inventoryAccounting.productSalePost.useMutation();

  // ─── 데이터 조회 ───
  const { data: allPartners } = trpc.partners.search.useQuery(
    { search: '', limit: 50 },
    { staleTime: 60_000 }
  );
  const partners: PartnerRow[] = (allPartners as PartnerRow[]) ?? [];

  const { data: rawMaterials } = trpc.itemMaster.list.useQuery({ itemType: "raw_material" as any, isActive: 1, limit: 500 });
  const { data: ownProducts } = trpc.itemMaster.list.useQuery({ itemType: "own_product" as any, isActive: 1, limit: 500 });
  const { data: externalProducts } = trpc.itemMaster.list.useQuery({ itemType: "external_product" as any, isActive: 1, limit: 500 });
  const { data: subsidiaryItems } = trpc.itemMaster.list.useQuery({ itemType: "subsidiary" as any, isActive: 1, limit: 500 });

  const allItems = useMemo(() => [
    ...(ownProducts?.items ?? []).map((i: ItemMasterRow) => ({ ...i, _displayType: '자사제품' })),
    ...(rawMaterials?.items ?? []).map((i: ItemMasterRow) => ({ ...i, _displayType: '원재료' })),
    ...(externalProducts?.items ?? []).map((i: ItemMasterRow) => ({ ...i, _displayType: '외부제품' })),
    ...(subsidiaryItems?.items ?? []).map((i: ItemMasterRow) => ({ ...i, _displayType: '부자재' })),
  ], [rawMaterials, ownProducts, externalProducts, subsidiaryItems]);

  const utils = trpc.useUtils();
  const bulkMutation = trpc.haccpIntegration.bulkCreateSales.useMutation();
  const aiMatchMutation = (trpc as any).aiSkuMatch?.matchBatch?.useMutation?.();
  const [duplicateKeys, setDuplicateKeys] = useState<Set<string>>(new Set());

  // ★ PR-F: 별칭 다이얼로그용 SKU 목록 (혼합 SKU 포함 자사제품 전체)
  //   alias 추가 mutation 도 함께 준비.
  const { data: aliasSkus } = (trpc as any).productSku?.listAll?.useQuery?.(
    { itemType: "own_product" },
    { enabled: aliasDialogOpen },
  ) ?? { data: undefined };
  const addAliasMutation = (trpc as any).skuAlias?.addAlias?.useMutation?.({
    onSuccess: (data: any) => {
      toast({ title: "별칭이 등록되었습니다.", description: `"${data?.alias || ''}" → SKU 매칭 갱신` });
      setAliasDialogOpen(false);
      setAliasSelectedSkuId(null);
      setAliasSkuQuery("");
      // 별칭 등록 후 즉시 재매칭 실행 (현 행만이라도 매칭됨)
      setTimeout(() => { void runAliasMatch(parsedRows); }, 200);
    },
    onError: (err: { message: string }) => {
      toast({ title: "별칭 등록 실패", description: err.message, variant: "destructive" });
    },
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 1: 파일 업로드
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
  }, [toast]);

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
      const skuCode = getValue('skuCode');  // Phase 8+: SKU 컬럼
      const quantity = parseFloat(getValue('quantity')) || 0;
      const unitPrice = parseFloat(getValue('unitPrice').replace(/,/g, '')) || 0;
      let amount = parseFloat(getValue('amount').replace(/,/g, '')) || 0;
      let taxAmount = parseFloat(getValue('taxAmount').replace(/,/g, '')) || 0;
      let totalAmount = parseFloat(getValue('totalAmount').replace(/,/g, '')) || 0;
      const memo = getValue('memo');

      if (!amount && quantity && unitPrice) amount = quantity * unitPrice;
      if (!taxAmount && amount) taxAmount = Math.round(amount * 0.1);
      if (!totalAmount && amount) totalAmount = amount + taxAmount;

      // 거래처 매칭
      let partnerId: number | null = null;
      let partnerMatchScore = 0;
      if (partnerName && partners.length > 0) {
        const partnerMatches = fuzzyMatchPartner(partnerName, partners, 1);
        if (partnerMatches.length > 0 && partnerMatches[0].score >= 0.7) {
          partnerId = partnerMatches[0].partner.id;
          partnerMatchScore = partnerMatches[0].score;
        }
      }

      // 품목 매칭 — SKU 코드 우선, 없으면 품명 퍼지
      let itemMasterId: number | null = null;
      let itemType: ItemMasterRow['itemType'] | null = null;
      let itemMatchScore = 0;
      let itemMatchResults: FuzzyMatchResult[] = [];

      // (1) SKU 코드 완전일치 시도 (Phase 8+)
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

      // (2) SKU 매칭 실패 시 품명 퍼지 매칭
      if (!itemMasterId && itemName && allItems.length > 0) {
        itemMatchResults = fuzzyMatchItem(itemName, allItems, 5);
        if (itemMatchResults.length > 0 && itemMatchResults[0].score >= 0.7) {
          itemMasterId = itemMatchResults[0].item.id;
          itemType = (itemMatchResults[0].item as ItemMasterRow).itemType;
          itemMatchScore = itemMatchResults[0].score;
        }
      }

      // 상태
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
        memo,
        status,
        statusMessage,
      };
    });

    setParsedRows(rows);
    setStep('review');
    // 중복 검사 비동기 실행 (UI 차단하지 않음)
    setTimeout(() => { void runDuplicateCheck(); }, 100);
    // ★ PR-C/D (2026-05-11): alias 기반 정확 매칭 — fuzzy 결과 위에 덮어쓰기.
    //   "단지 혼합10종설기" 처럼 등록된 별칭을 가진 행은 fuzzy 점수와 무관하게 alias 우선.
    setTimeout(() => { void runAliasMatch(rows); }, 100);
  }, [excelRawRows, excelHeaders, headerMapping, partners, allItems]);

  /**
   * ★ PR-C/D (2026-05-11): SKU 별칭 기반 정확 매칭
   * 품목 마스터 → 각 SKU 행의 "별칭 관리" 다이얼로그에서 등록한 alias 가 있으면,
   * Excel 의 itemName 과 정확 매칭되어 자동으로 그 SKU 의 item_master 행으로 인식.
   * - fuzzy 매칭 결과보다 우선
   * - 등록된 alias 가 없으면 동작 변화 0 (기존 fuzzy 결과 유지)
   */
  const runAliasMatch = async (initialRows: ParsedRow[]) => {
    const texts = Array.from(new Set(initialRows.map((r) => r.itemName).filter(Boolean)));
    if (texts.length === 0) return;
    try {
      const result: any = await (utils as any).skuAlias?.bulkMatchPreview?.fetch?.({ texts });
      if (!result || !result.matches || result.matches.length === 0) return;
      const byText = new Map<string, { itemId: number; skuName: string; matchSource: string }>();
      for (const m of result.matches as Array<{ text: string; itemId: number; skuName: string; matchSource: string }>) {
        byText.set(m.text.trim(), { itemId: m.itemId, skuName: m.skuName, matchSource: m.matchSource });
      }
      setParsedRows((prev) =>
        prev.map((r) => {
          const m = byText.get(r.itemName.trim());
          if (!m) return r;
          const item = allItems.find((i) => i.id === m.itemId);
          if (!item) return r;
          return {
            ...r,
            itemMasterId: item.id,
            itemType: item.itemType,
            itemMatchScore: 1.0,
            status: r.partnerId ? 'matched' : 'warning',
            statusMessage: `별칭 매칭 (${m.matchSource}) → ${m.skuName}`,
          };
        }),
      );
      const matchedCount = result.matchedCount ?? result.matches.length;
      if (matchedCount > 0) {
        toast({
          title: "별칭 매칭 완료",
          description: `${matchedCount}건이 SKU 별칭으로 자동 매칭되었습니다.`,
        });
      }
    } catch (err) {
      console.warn("[runAliasMatch]", err);
    }
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 3: 리뷰
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
        const itemRow = selected as ItemMasterRow;
        const updated = { ...row, itemMasterId: selected.id, itemType: itemRow.itemType, itemMatchScore: 1.0 };
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
   * 업로드 직전 중복 검사 (거래처+날짜+품목명 조합이 이미 존재하는지)
   */
  const checkDuplicatesFn = (trpc as any).haccpIntegration.checkSalesDuplicates;
  const runDuplicateCheck = async () => {
    try {
      const candidates = parsedRows
        .filter((r) => r.partnerId && r.transactionDate && r.itemName)
        .map((r) => ({ transactionDate: r.transactionDate, partnerId: r.partnerId!, itemName: r.itemName }));
      if (candidates.length === 0) {
        setDuplicateKeys(new Set());
        return;
      }
      // tRPC query (not mutation) - fetch directly
      const result: Array<{ transactionDate: string; partnerId: number; itemName: string; isDuplicate: boolean }> =
        await (checkDuplicatesFn?.fetch?.({ candidates }) ?? utils.haccpIntegration.checkSalesDuplicates?.fetch?.({ candidates }) ?? []);
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
   * AI 재매칭: 매칭 점수 0.7~0.9 구간 (warning) 행만 LLM으로 재검증
   * - 거래처별로 묶어서 배치 호출 (거래처 이력 활용)
   */
  const handleAiRematch = async () => {
    if (!aiMatchMutation) {
      toast({ title: "AI 매칭 비활성화", description: "서버 배포 후 이용 가능합니다.", variant: "destructive" });
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
      // 거래처별 그룹화 (거래처 이력 컨텍스트 활용)
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
            status: upd.score >= 0.9 ? 'matched' : 'warning',
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
  // Step 4: 업로드
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const readyRows = parsedRows.filter(r => r.status === 'matched' || r.status === 'warning');
  const errorRows = parsedRows.filter(r => r.status === 'error');

  const handleBulkUpload = async () => {
    // 매칭된 item_master → legacy FK 조회 맵 구성
    //   own_product → legacyProductId (h_products_v2.id)
    //   raw_material/subsidiary/external_product → legacyMaterialId (h_materials.id)
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
          // itemType 에 따라 productId 또는 materialId 중 하나만 전송 (XOR)
          productId: legacy?.productId,
          materialId: legacy?.materialId,
          quantity: r.quantity,
          unitPrice: r.unitPrice,
          amount: r.amount,
          taxAmount: r.taxAmount,
          memo: r.memo || undefined,
        };
      });

    if (uploadItems.length === 0) {
      toast({ title: "등록 가능한 데이터가 없습니다.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      // ★ PR-J (2026-05-11): accountingExcluded 플래그 전달
      //   기존 흐름은 status=pending 으로만 INSERT (재고 차감 X, 분개 X).
      //   회계 제외 체크 여부는 별도 컬럼 (accounting_excluded) 으로 저장되며,
      //   업로드 자체에서는 재고 차감을 하지 않는다 ─ 다음 단계의
      //   "지금 모두 승인하고 재고 차감" 다이얼로그에서 일괄 승인 시점에 차감.
      const result = await bulkMutation.mutateAsync({
        items: uploadItems,
        accountingExcluded,
      });
      setUploadResult(result);
      utils.haccpIntegration.getAllSales.invalidate();
      setStep('result');
      toast({
        title: `매출 일괄 등록 완료`,
        description: `성공: ${result.successCount}건, 실패: ${result.failCount}건`,
      });

      // ★ PR-J: 마지막 단계 승인 다이얼로그 트리거
      //   insertedIds 가 1건 이상이면 사용자에게 "지금 모두 승인하고 재고 차감
      //   하시겠습니까?" 묻는다. "예" → productSalePost 일괄 호출, "아니오" → pending 유지.
      const ids = (result as { insertedIds?: number[] }).insertedIds ?? [];
      if (ids.length > 0) {
        setApproveCandidateIds(ids);
        setAccountingExcludedAtUpload(accountingExcluded);
        setApproveDialogOpen(true);
      }
    } catch (e) {
        const error = e as Error;
      toast({ title: "등록 오류", description: error.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  // ★ PR-J (2026-05-11): 일괄 승인 핸들러
  //   업로드 직후 다이얼로그에서 "지금 모두 승인" 선택 시 호출.
  //   - productSalePost 를 Promise.allSettled 로 호출해 부분 실패 허용
  //   - 결과는 토스트로 "성공 N건 / 실패 M건" 표시
  //   - mixed 그룹 처리 흐름(PR-I)과 동일한 패턴 적용
  const handleBulkApproveAfterUpload = async () => {
    if (approveCandidateIds.length === 0) {
      setApproveDialogOpen(false);
      return;
    }
    setIsApproving(true);
    try {
      const results = await Promise.allSettled(
        approveCandidateIds.map((id) => postMutation.mutateAsync({ saleId: id })),
      );
      const okIds: number[] = [];
      const failures: Array<{ id: number; message: string }> = [];
      results.forEach((res, idx) => {
        const id = approveCandidateIds[idx];
        if (res.status === "fulfilled") {
          okIds.push(id);
        } else {
          const reason = res.reason as { message?: string } | Error | undefined;
          const message =
            (reason as Error | undefined)?.message ??
            String(reason ?? "알 수 없는 오류");
          failures.push({ id, message });
          // eslint-disable-next-line no-console
          console.error(`[bulkApproveAfterUpload] sale#${id} 승인 실패:`, reason);
        }
      });

      utils.haccpIntegration.getAllSales.invalidate();

      if (failures.length === 0) {
        toast({
          title: "일괄 승인 완료",
          description: `${okIds.length}건 모두 승인 + 재고 차감 완료`,
        });
      } else if (okIds.length === 0) {
        const sample = failures.slice(0, 3).map((f) => `#${f.id}: ${f.message}`).join(" / ");
        const more = failures.length > 3 ? ` 외 ${failures.length - 3}건` : "";
        toast({
          title: "일괄 승인 실패",
          description: `${failures.length}건 모두 실패 — ${sample}${more}`,
          variant: "destructive",
        });
      } else {
        const failIds = failures.map((f) => `#${f.id}`).slice(0, 5).join(", ");
        const more = failures.length > 5 ? ` 외 ${failures.length - 5}건` : "";
        toast({
          title: "일괄 승인 부분 성공",
          description: `성공 ${okIds.length}건 / 실패 ${failures.length}건 (${failIds}${more})`,
          variant: "destructive",
        });
      }
    } finally {
      setIsApproving(false);
      setApproveDialogOpen(false);
      setApproveCandidateIds([]);
    }
  };

  // 다이얼로그에서 "아니오" — pending 유지
  const handleSkipApprove = () => {
    toast({
      title: "대기 상태로 저장",
      description: `${approveCandidateIds.length}건이 pending 상태로 등록되었습니다. 매출 조회에서 개별/그룹 승인 가능.`,
    });
    setApproveDialogOpen(false);
    setApproveCandidateIds([]);
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      ['거래일자', '거래처', '품목명', '수량', '단가', '공급가액', '부가세', '합계', '비고'],
      ['2026-03-05', '맛나식품(주)', '돈까스 세트', '200', '5000', '1000000', '100000', '1100000', ''],
      ['2026-03-05', '학교급식센터', '불고기 도시락', '500', '3500', '1750000', '175000', '1925000', '3월분'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "매출등록양식");
    ws['!cols'] = [
      { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 8 }, { wch: 10 },
      { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 15 },
    ];
    XLSX.writeFile(wb, `매출_일괄등록_양식_${todayLocal()}.xlsx`);
    toast({ title: "양식 다운로드 완료" });
  };

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 렌더링
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const currentRow = parsedRows.find(r => r.id === matchDialogRowId);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/accounting/sales/list')} className="h-8 px-2">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            매출 엑셀 일괄등록
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            엑셀 파일을 업로드하면 품목명/거래처를 자동으로 매칭합니다
          </p>
        </div>
      </div>

      {/* 프로그레스 */}
      <div className="flex items-center gap-2 text-sm">
        {(['upload', 'mapping', 'review', 'result'] as Step[]).map((s, i) => {
          const labels = ['파일 업로드', '헤더 매핑', '데이터 검증', '등록 결과'];
          const isActive = step === s;
          const isDone = (['upload', 'mapping', 'review', 'result'] as Step[]).indexOf(step) > i;
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition ${
                isActive ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                isDone ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
                'bg-muted text-muted-foreground'
              }`}>
                {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="w-4 h-4 rounded-full border flex items-center justify-center text-[10px]">{i + 1}</span>}
                {labels[i]}
              </div>
            </div>
          );
        })}
      </div>

      {/* Step 1: 업로드 */}
      {step === 'upload' && (
        <Card className="p-8">
          <div className="text-center space-y-6">
            <div className="mx-auto w-20 h-20 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <Upload className="h-10 w-10 text-blue-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">엑셀 파일을 업로드해 주세요</h2>
              <p className="text-sm text-muted-foreground mt-1">
                .xlsx 또는 .xls 형식을 지원합니다. 첫 번째 행은 헤더로 인식됩니다.
              </p>
            </div>
            <div className="flex justify-center gap-3">
              <Button onClick={() => fileInputRef.current?.click()} size="lg" className="gap-2">
                <Upload className="h-4 w-4" />
                파일 선택
              </Button>
              <Button onClick={handleDownloadTemplate} variant="outline" size="lg" className="gap-2">
                <Download className="h-4 w-4" />
                양식 다운로드
              </Button>
            </div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
            <div className="bg-muted/50 rounded-lg p-4 text-left text-xs text-muted-foreground max-w-lg mx-auto space-y-1">
              <p className="font-medium text-foreground text-sm mb-2">필수 열:</p>
              <p>- <strong>거래일자</strong>: 2026-03-05 또는 20260305 형식</p>
              <p>- <strong>거래처</strong>: 등록된 거래처명과 유사하게</p>
              <p>- <strong>품목명</strong>: 등록된 품목 마스터와 유사하게</p>
              <p>- <strong>수량</strong>, <strong>단가</strong>: 숫자</p>
              <p className="mt-2 text-[11px]">공급가액/부가세/합계는 수량×단가로 자동 계산 가능합니다.</p>
            </div>
          </div>
        </Card>
      )}

      {/* Step 2: 헤더 매핑 */}
      {step === 'mapping' && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">열 매핑 확인</h2>
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

          <div className="grid grid-cols-2 gap-3">
            {EXPECTED_FIELDS.map(field => {
              const mapped = headerMapping[field.key];
              const isRequired = ['transactionDate', 'partnerName', 'itemName', 'quantity', 'unitPrice'].includes(field.key);
              return (
                <div key={field.key} className={`flex items-center gap-3 p-3 rounded-lg border ${
                  mapped !== null && mapped !== undefined ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/10' : 
                  isRequired ? 'border-red-200 bg-red-50/50 dark:bg-red-950/10' : 'border-muted'
                }`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium flex items-center gap-1">
                      {field.label}
                      {isRequired && <span className="text-red-500 text-xs">*</span>}
                    </div>
                  </div>
                  <Select
                    value={mapped !== null && mapped !== undefined ? String(mapped) : '__none__'}
                    onValueChange={(v) => handleMappingChange(field.key, v)}
                  >
                    <SelectTrigger className="w-[180px] h-8 text-xs">
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
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : isRequired ? (
                    <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                  ) : (
                    <div className="w-4 h-4 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>

          {/* 미리보기 */}
          <div>
            <h3 className="text-sm font-medium mb-2">데이터 미리보기 (상위 3행)</h3>
            <div className="overflow-x-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    {excelHeaders.map((h, i) => (
                      <TableHead key={i} className="text-xs whitespace-nowrap">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {excelRawRows.slice(0, 3).map((row, i) => (
                    <TableRow key={i}>
                      {excelHeaders.map((h, j) => (
                        <TableCell key={j} className="text-xs py-1 whitespace-nowrap">{row[h]}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </Card>
      )}

      {/* Step 3: 리뷰 */}
      {step === 'review' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <Card className="p-3 border-l-4 border-l-blue-500">
              <div className="text-xs text-muted-foreground">전체</div>
              <div className="text-xl font-bold">{parsedRows.length}건</div>
            </Card>
            <Card className="p-3 border-l-4 border-l-emerald-500">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> 매칭 완료</div>
              <div className="text-xl font-bold text-emerald-600">{parsedRows.filter(r => r.status === 'matched').length}건</div>
            </Card>
            <Card className="p-3 border-l-4 border-l-amber-500">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> 확인 필요</div>
              <div className="text-xl font-bold text-amber-600">{parsedRows.filter(r => r.status === 'warning').length}건</div>
            </Card>
            <Card className="p-3 border-l-4 border-l-red-500">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><XCircle className="h-3 w-3" /> 오류</div>
              <div className="text-xl font-bold text-red-600">{errorRows.length}건</div>
            </Card>
          </div>

          {/* 거래처 + 날짜 그룹화 프리뷰 (Phase 8+) */}
          {(() => {
            const groups = new Map<string, { partnerId: number | null; partnerName: string; date: string; count: number }>();
            for (const r of readyRows) {
              if (!r.partnerId || !r.transactionDate) continue;
              const key = `${r.partnerId}|${r.transactionDate}`;
              if (!groups.has(key)) {
                groups.set(key, { partnerId: r.partnerId, partnerName: r.partnerName, date: r.transactionDate, count: 0 });
              }
              groups.get(key)!.count++;
            }
            if (groups.size === 0) return null;
            return (
              <Card className="p-3 bg-blue-50/40 border-blue-200 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                  <span className="font-medium text-blue-900 dark:text-blue-200">
                    명세서 그룹화 예상: <strong>{groups.size}개 명세서</strong> × 평균 <strong>{(readyRows.length / groups.size).toFixed(1)}개 품목</strong>
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    (거래처 {new Set(Array.from(groups.values()).map(g => g.partnerId)).size}곳, 날짜 {new Set(Array.from(groups.values()).map(g => g.date)).size}일)
                  </span>
                </div>
                {duplicateKeys.size > 0 && (
                  <div className="flex items-center gap-2 text-xs text-orange-700 bg-orange-50 px-2 py-1 rounded">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>중복 가능성: <strong>{duplicateKeys.size}건</strong> — 동일 거래처+날짜+품목 조합이 이미 등록되어 있습니다 (테이블에 "중복" 뱃지 표시).</span>
                  </div>
                )}
              </Card>
            );
          })()}

          {/* ★ PR-J (2026-05-11): 회계 제외 체크 + 일괄 등록 버튼 */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setStep('mapping')}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> 매핑 수정
            </Button>
            <div className="flex items-center gap-3 flex-wrap">
              <label
                className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 cursor-pointer select-none"
                title="B2C 전자상거래 등 회계 분개에서 제외할 매출을 일괄 등록할 때 체크하세요. 다음 단계 다이얼로그에서 '지금 모두 승인' 선택 시 재고가 즉시 차감됩니다."
              >
                <input
                  type="checkbox"
                  checked={accountingExcluded}
                  onChange={(e) => setAccountingExcluded(e.target.checked)}
                  disabled={isUploading}
                  className="h-3.5 w-3.5"
                />
                <span className="font-medium">회계 제외 (B2C)</span>
              </label>
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
              <Button variant="outline" size="sm" onClick={() => { setStep('upload'); setParsedRows([]); setExcelHeaders([]); setExcelRawRows([]); }}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> 파일 다시 선택
              </Button>
              <Button size="sm" onClick={handleBulkUpload} disabled={readyRows.length === 0 || isUploading}
                className="bg-blue-600 hover:bg-blue-700">
                {isUploading ? (
                  <><RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> 등록 중...</>
                ) : (
                  <><Upload className="h-3.5 w-3.5 mr-1" /> {readyRows.filter(r => r.partnerId).length}건 일괄 등록</>
                )}
              </Button>
            </div>
          </div>

          <Card className="border">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[50px] text-xs text-center">#</TableHead>
                    <TableHead className="w-[60px] text-xs text-center">상태</TableHead>
                    <TableHead className="text-xs w-[100px]">거래일자</TableHead>
                    <TableHead className="text-xs min-w-[120px]">거래처</TableHead>
                    <TableHead className="text-xs min-w-[150px]">품목명</TableHead>
                    <TableHead className="text-xs w-[70px] text-right">수량</TableHead>
                    <TableHead className="text-xs w-[90px] text-right">단가</TableHead>
                    <TableHead className="text-xs w-[100px] text-right">공급가액</TableHead>
                    <TableHead className="text-xs w-[80px] text-right">부가세</TableHead>
                    <TableHead className="text-xs w-[100px] text-right">합계</TableHead>
                    <TableHead className="text-xs w-[70px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row) => (
                    <TableRow key={row.id} className={
                      row.status === 'error' ? 'bg-red-50/50 dark:bg-red-950/10' :
                      row.status === 'warning' ? 'bg-amber-50/30 dark:bg-amber-950/10' :
                      row.status === 'matched' ? 'bg-emerald-50/30 dark:bg-emerald-950/10' : ''
                    }>
                      <TableCell className="text-xs text-center text-muted-foreground">{row.rowIndex}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          {row.status === 'matched' ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">완료</Badge> :
                           row.status === 'warning' ? <Badge className="bg-amber-100 text-amber-700 text-[10px]">확인</Badge> :
                           row.status === 'error' ? <Badge className="bg-red-100 text-red-700 text-[10px]">오류</Badge> :
                           <Badge variant="secondary" className="text-[10px]">대기</Badge>}
                          {row.partnerId && row.transactionDate && row.itemName &&
                            duplicateKeys.has(`${row.transactionDate}|${row.partnerId}|${row.itemName}`) && (
                            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300 text-[9px] px-1 py-0">중복</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{row.transactionDate}</TableCell>
                      <TableCell className="text-xs">
                        <button
                          onClick={() => openMatchDialog(row.id, 'partner')}
                          className={`text-left w-full hover:underline flex items-center gap-1 ${
                            row.partnerId ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'
                          }`}
                        >
                          <Building2 className="h-3 w-3 shrink-0" />
                          <span className="truncate">{row.partnerName || '-'}</span>
                          {row.partnerId && row.partnerMatchScore < 1 && (
                            <span className="text-[9px] text-muted-foreground">({Math.round(row.partnerMatchScore * 100)}%)</span>
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openMatchDialog(row.id, 'item')}
                            className={`text-left flex-1 hover:underline flex items-center gap-1 min-w-0 ${
                              row.itemMasterId ? 'text-blue-700 dark:text-blue-400' : 'text-amber-600'
                            }`}
                          >
                            <Package className="h-3 w-3 shrink-0" />
                            <span className="truncate">{row.itemName || '-'}</span>
                            {row.itemMasterId && row.itemMatchScore < 1 && (
                              <span className="text-[9px] text-muted-foreground">({Math.round(row.itemMatchScore * 100)}%)</span>
                            )}
                            {row.itemType && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 ml-0.5">
                                {row.itemType === 'own_product' ? '자사' :
                                 row.itemType === 'raw_material' ? '원재료' :
                                 row.itemType === 'subsidiary' ? '부자재' :
                                 row.itemType === 'external_product' ? '외부' : ''}
                              </Badge>
                            )}
                          </button>
                          {/* ★ PR-F: 인라인 별칭 추가 — 매칭 0/낮음 + 'own_product' 매칭일 때만 표시
                              ("이 품목명을 어떤 SKU 의 별칭으로 등록" — 향후 자동 매칭) */}
                          {(!row.itemMasterId || row.itemMatchScore < 0.95) && row.itemName && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0 shrink-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                              onClick={() => {
                                setAliasDialogRowId(row.id);
                                setAliasSelectedSkuId(null);
                                setAliasSkuQuery(row.itemName);
                                setAliasDialogOpen(true);
                              }}
                              title="이 품목명을 SKU 별칭으로 등록 (혼합 SKU 등 자동 매칭용)"
                            >
                              <Tag className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{row.quantity.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{row.unitPrice.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{row.amount.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{row.taxAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums font-semibold">{row.totalAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleRemoveRow(row.id)}>
                          <X className="h-3 w-3 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="p-3 flex items-center justify-between bg-blue-50/50 dark:bg-blue-950/10 border-blue-200">
            <span className="text-sm font-medium">등록 대상 합계 ({readyRows.filter(r => r.partnerId).length}건)</span>
            <div className="flex gap-6 text-sm tabular-nums">
              <span>공급가액: <strong>{readyRows.reduce((s, r) => s + r.amount, 0).toLocaleString()}</strong></span>
              <span>부가세: <strong>{readyRows.reduce((s, r) => s + r.taxAmount, 0).toLocaleString()}</strong></span>
              <span className="text-blue-600 font-bold">합계: {readyRows.reduce((s, r) => s + r.totalAmount, 0).toLocaleString()}</span>
            </div>
          </Card>
        </div>
      )}

      {/* Step 4: 결과 */}
      {step === 'result' && uploadResult && (
        <Card className="p-8 text-center space-y-6">
          <div className="mx-auto w-20 h-20 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-blue-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold">매출 일괄 등록 완료</h2>
            <p className="text-sm text-muted-foreground mt-1">총 {uploadResult.total}건 처리</p>
          </div>
          <div className="flex justify-center gap-8">
            <div className="text-center">
              <div className="text-3xl font-bold text-emerald-600">{uploadResult.successCount}</div>
              <div className="text-xs text-muted-foreground">성공</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">{uploadResult.failCount}</div>
              <div className="text-xs text-muted-foreground">실패</div>
            </div>
          </div>
          {uploadResult.errors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/10 rounded-lg p-4 text-left max-w-md mx-auto">
              <p className="text-sm font-medium text-red-700 mb-2">오류 상세:</p>
              {uploadResult.errors.map((err, i) => (
                <p key={i} className="text-xs text-red-600">행 {(err.index ?? 0) + 1}: {err.message}</p>
              ))}
            </div>
          )}
          <div className="flex justify-center gap-3">
            <Button onClick={() => navigate('/dashboard/accounting/sales/list')} className="gap-2">
              매출 조회로 이동
            </Button>
            <Button variant="outline" onClick={() => { setStep('upload'); setParsedRows([]); setExcelHeaders([]); setExcelRawRows([]); setUploadResult(null); }} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              추가 업로드
            </Button>
          </div>
        </Card>
      )}

      {/* 매칭 다이얼로그 */}
      <Dialog open={matchDialogOpen} onOpenChange={setMatchDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {matchDialogType === 'item' ? '품목 매칭 선택' : '거래처 매칭 선택'}
            </DialogTitle>
          </DialogHeader>
          {currentRow && (
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <span className="text-muted-foreground">입력값: </span>
                <strong>{matchDialogType === 'item' ? currentRow.itemName : currentRow.partnerName}</strong>
              </div>

              {matchDialogType === 'item' ? (
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
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
                    <p className="text-sm text-muted-foreground text-center py-4">매칭 결과가 없습니다</p>
                  )}
                  <div className="border-t pt-2 mt-2">
                    <p className="text-xs text-muted-foreground mb-1">또는 전체 품목에서 선택:</p>
                    <ItemSearchSelect items={allItems} onSelect={(item) => handleSelectMatch(currentRow.id, 'item', item)} />
                  </div>
                </div>
              ) : (
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
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

      {/* ★ PR-F (2026-05-11): 인라인 별칭 추가 다이얼로그 */}
      <Dialog open={aliasDialogOpen} onOpenChange={setAliasDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-4 w-4 text-amber-600" />
              SKU 별칭 추가
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs">
              <div className="font-semibold text-amber-900 mb-1 flex items-center gap-1">
                <Boxes className="h-3 w-3" /> 혼합 제품 매칭 흐름
              </div>
              <ol className="list-decimal pl-5 space-y-0.5 text-amber-800">
                <li><b>품목 마스터 → SKU 행 → "번들 구성"</b> 으로 혼합 SKU 의 child + % 등록</li>
                <li>같은 SKU 행의 "별칭" 또는 <b>여기서</b> 자유로운 표기 (예: "단지 혼합10종설기") 를 SKU 의 별칭으로 등록</li>
                <li>다음 Excel 업로드부터 자동으로 이 SKU 에 매칭됨</li>
              </ol>
            </div>

            <div>
              <Label className="text-sm font-semibold">등록할 별칭 (Excel 행 품목명)</Label>
              <div className="mt-1 px-3 py-2 rounded border bg-muted text-sm font-medium">
                {parsedRows.find((r) => r.id === aliasDialogRowId)?.itemName || "-"}
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold">매칭할 SKU</Label>
              <Input
                value={aliasSkuQuery}
                onChange={(e) => setAliasSkuQuery(e.target.value)}
                placeholder="SKU 명 또는 코드 검색..."
                className="mt-1"
              />
              <div className="mt-2 max-h-60 overflow-y-auto border rounded">
                {(() => {
                  const q = aliasSkuQuery.trim().toLowerCase();
                  const filtered = (Array.isArray(aliasSkus) ? aliasSkus : []).filter((s: any) => {
                    if (!q) return true;
                    return (
                      String(s.skuName || s.itemName || "").toLowerCase().includes(q) ||
                      String(s.skuCode || "").toLowerCase().includes(q)
                    );
                  }).slice(0, 50);
                  if (filtered.length === 0) {
                    return (
                      <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                        매칭되는 SKU 가 없습니다. 품목 마스터에서 먼저 SKU 를 등록하세요.
                      </div>
                    );
                  }
                  return filtered.map((s: any) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setAliasSelectedSkuId(s.id)}
                      className={`w-full text-left px-3 py-2 text-xs border-b last:border-b-0 hover:bg-accent ${
                        aliasSelectedSkuId === s.id ? "bg-amber-50" : ""
                      }`}
                    >
                      <div className="font-medium">{s.skuName || s.itemName}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {s.skuCode}{s.itemName && s.skuName !== s.itemName ? ` · ${s.itemName}` : ""}
                      </div>
                    </button>
                  ));
                })()}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setAliasDialogOpen(false)}>
              취소
            </Button>
            <Button
              onClick={() => {
                const row = parsedRows.find((r) => r.id === aliasDialogRowId);
                if (!row || !row.itemName) {
                  toast({ title: "품목명이 없습니다.", variant: "destructive" });
                  return;
                }
                if (!aliasSelectedSkuId) {
                  toast({ title: "매칭할 SKU 를 선택하세요.", variant: "destructive" });
                  return;
                }
                addAliasMutation?.mutate?.({
                  skuId: aliasSelectedSkuId,
                  alias: row.itemName,
                  isPrimary: false,
                });
              }}
              disabled={!aliasSelectedSkuId || addAliasMutation?.isPending}
            >
              {addAliasMutation?.isPending ? "등록 중..." : "별칭으로 등록"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ★ PR-J (2026-05-11): 일괄 등록 직후 승인 다이얼로그
          insertedIds가 1건 이상이면 사용자에게 "지금 모두 승인하고 재고 차감"을 묻는다.
          - "지금 모두 승인": productSalePost 일괄 호출 (Promise.allSettled, 부분실패 허용)
          - "나중에 승인": pending 상태로 유지 (매출 조회에서 개별/그룹 승인 가능) */}
      <Dialog
        open={approveDialogOpen}
        onOpenChange={(open) => {
          if (!isApproving) setApproveDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>지금 승인하고 재고 차감할까요?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              <strong>{approveCandidateIds.length}건</strong>이 <em>pending</em> 상태로 등록되었습니다.
            </p>
            {accountingExcludedAtUpload && (
              <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  <strong>회계 제외</strong> 체크된 매출입니다. 승인 시 재고는 즉시 차감되지만 회계 분개에서는 제외됩니다 (B2C 전자상거래용).
                </span>
              </div>
            )}
            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
              <li><strong>지금 모두 승인</strong>: FEFO/BUNDLE 분해로 즉시 재고 차감</li>
              <li><strong>나중에 승인</strong>: pending 유지 → 매출 조회에서 개별/그룹 승인</li>
            </ul>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={handleSkipApprove}
              disabled={isApproving}
            >
              나중에 승인
            </Button>
            <Button
              onClick={handleBulkApproveAfterUpload}
              disabled={isApproving || approveCandidateIds.length === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isApproving ? (
                <><RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> 승인 중...</>
              ) : (
                <>지금 모두 승인 ({approveCandidateIds.length}건)</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

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
      <div className="max-h-[150px] overflow-y-auto">
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
      <div className="max-h-[150px] overflow-y-auto">
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
