import { useState, useMemo, useCallback, useRef } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
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
  itemMasterId: number | null;
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

  const [uploadResult, setUploadResult] = useState<{ successCount: number; failCount: number; total: number; errors: any[] } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // ─── 데이터 조회 ───
  const { data: allPartners } = trpc.partners.search.useQuery(
    { search: '', limit: 50 },
    { staleTime: 60_000 }
  );
  const partners: any[] = (allPartners as any[]) ?? [];

  const { data: rawMaterials } = trpc.itemMaster.list.useQuery({ itemType: "raw_material" as any, isActive: 1, limit: 500 });
  const { data: ownProducts } = trpc.itemMaster.list.useQuery({ itemType: "own_product" as any, isActive: 1, limit: 500 });
  const { data: externalProducts } = trpc.itemMaster.list.useQuery({ itemType: "external_product" as any, isActive: 1, limit: 500 });
  const { data: subsidiaryItems } = trpc.itemMaster.list.useQuery({ itemType: "subsidiary" as any, isActive: 1, limit: 500 });

  const allItems = useMemo(() => [
    ...(ownProducts?.items ?? []).map((i: any) => ({ ...i, _displayType: '자사제품' })),
    ...(rawMaterials?.items ?? []).map((i: any) => ({ ...i, _displayType: '원재료' })),
    ...(externalProducts?.items ?? []).map((i: any) => ({ ...i, _displayType: '외부제품' })),
    ...(subsidiaryItems?.items ?? []).map((i: any) => ({ ...i, _displayType: '부자재' })),
  ], [rawMaterials, ownProducts, externalProducts, subsidiaryItems]);

  const utils = trpc.useUtils();
  const bulkMutation = trpc.haccpIntegration.bulkCreateSales.useMutation();

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

        const headers = jsonData[0].map((h: any) => String(h || '').trim());
        const rows = jsonData.slice(1).filter((row: any[]) => row.some((cell: any) => cell !== '' && cell !== null && cell !== undefined));

        const rawRows = rows.map((row: any[]) => {
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

      // 품목 매칭
      let itemMasterId: number | null = null;
      let itemMatchScore = 0;
      let itemMatchResults: FuzzyMatchResult[] = [];
      if (itemName && allItems.length > 0) {
        itemMatchResults = fuzzyMatchItem(itemName, allItems, 5);
        if (itemMatchResults.length > 0 && itemMatchResults[0].score >= 0.7) {
          itemMasterId = itemMatchResults[0].item.id;
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
        itemMasterId,
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
  }, [excelRawRows, excelHeaders, headerMapping, partners, allItems]);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 3: 리뷰
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const openMatchDialog = (rowId: string, type: 'item' | 'partner') => {
    setMatchDialogRowId(rowId);
    setMatchDialogType(type);
    setMatchDialogOpen(true);
  };

  const handleSelectMatch = (rowId: string, type: 'item' | 'partner', selected: any) => {
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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 4: 업로드
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const readyRows = parsedRows.filter(r => r.status === 'matched' || r.status === 'warning');
  const errorRows = parsedRows.filter(r => r.status === 'error');

  const handleBulkUpload = async () => {
    const uploadItems = readyRows
      .filter(r => r.partnerId && r.itemName && r.quantity > 0 && r.unitPrice > 0)
      .map(r => ({
        transactionDate: r.transactionDate,
        partnerId: r.partnerId!,
        itemName: r.itemName,
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        amount: r.amount,
        taxAmount: r.taxAmount,
        memo: r.memo || undefined,
      }));

    if (uploadItems.length === 0) {
      toast({ title: "등록 가능한 데이터가 없습니다.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const result = await bulkMutation.mutateAsync({ items: uploadItems });
      setUploadResult(result);
      utils.haccpIntegration.getAllSales.invalidate();
      setStep('result');
      toast({ title: `매출 일괄 등록 완료`, description: `성공: ${result.successCount}건, 실패: ${result.failCount}건` });
    } catch (e: any) {
      toast({ title: "등록 오류", description: e.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
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

          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => setStep('mapping')}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> 매핑 수정
            </Button>
            <div className="flex gap-2">
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
                        {row.status === 'matched' ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">완료</Badge> :
                         row.status === 'warning' ? <Badge className="bg-amber-100 text-amber-700 text-[10px]">확인</Badge> :
                         row.status === 'error' ? <Badge className="bg-red-100 text-red-700 text-[10px]">오류</Badge> :
                         <Badge variant="secondary" className="text-[10px]">대기</Badge>}
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
                        <button
                          onClick={() => openMatchDialog(row.id, 'item')}
                          className={`text-left w-full hover:underline flex items-center gap-1 ${
                            row.itemMasterId ? 'text-blue-700 dark:text-blue-400' : 'text-amber-600'
                          }`}
                        >
                          <Package className="h-3 w-3 shrink-0" />
                          <span className="truncate">{row.itemName || '-'}</span>
                          {row.itemMasterId && row.itemMatchScore < 1 && (
                            <span className="text-[9px] text-muted-foreground">({Math.round(row.itemMatchScore * 100)}%)</span>
                          )}
                        </button>
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
                <p key={i} className="text-xs text-red-600">행 {err.index + 1}: {err.message}</p>
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
    </div>
  );
}

function ItemSearchSelect({ items, onSelect }: { items: any[]; onSelect: (item: any) => void }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search) return items.slice(0, 10);
    const q = search.toLowerCase();
    return items.filter((i: any) =>
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
        {filtered.map((item: any) => (
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

function PartnerSearchSelect({ partners, onSelect }: { partners: any[]; onSelect: (p: any) => void }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search) return partners.slice(0, 10);
    const q = search.toLowerCase();
    return partners.filter((p: any) =>
      (p.company_name || '').toLowerCase().includes(q) || (p.biz_no || '').toLowerCase().includes(q)
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
        {filtered.map((p: any) => (
          <button key={p.id} onClick={() => onSelect(p)}
            className="w-full text-left px-2 py-1 text-xs hover:bg-muted rounded flex items-center gap-2">
            <span className="font-medium truncate flex-1">{p.company_name}</span>
            <span className="text-[10px] text-muted-foreground">{p.biz_no || ''}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
