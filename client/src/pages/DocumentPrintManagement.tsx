/**
 * 통합 문서출력 페이지 (개선판)
 * - 체크박스 선택 일괄인쇄
 * - 직인/날인 표시
 * - PDF 다운로드 지원
 * - 인쇄 이력 관리
 * 탭: 출력대기(전체) | CCP 체크리스트 | 선행/위생 체크리스트 | 품목제조보고 | 인쇄이력
 */
import { useState, useMemo, useCallback, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Printer, Clock, Search, FileText, Shield,
  ClipboardCheck, Package, AlertTriangle, Eye, RefreshCw,
  CheckCircle, Download, CheckSquare, Square, ListChecks,
  History, FileDown, Loader2
} from "lucide-react";
import { ApprovalSealRow } from "@/components/SealGenerator";

// 요청 유형별 카테고리 매핑
const REQUEST_TYPE_CATEGORIES: Record<string, string> = {
  ccp_review: "ccp",
  ccp_checklist: "ccp",
  ccp_deviation: "ccp",
  checklist_approval: "prerequisite",
  employee_health_check: "prerequisite",
  temperature_humidity: "prerequisite",
  temperature_humidity_check: "prerequisite",
  personal_hygiene: "prerequisite",
  personal_hygiene_check: "prerequisite",
  sanitation_record: "prerequisite",
  hygiene_inspection: "prerequisite",
  material_inspection: "prerequisite",
  workplace_hygiene_check: "prerequisite",
  hygiene_facility_check: "prerequisite",
  water_management_check: "prerequisite",
  illumination_check: "prerequisite",
  surface_contamination_test: "prerequisite",
  airborne_bacteria_test: "prerequisite",
  training_log: "prerequisite",
  vehicle_temperature_check: "prerequisite",
  waste_management: "prerequisite",
  daily_disposal_record: "prerequisite",
  equipment_inspection: "prerequisite",
  equipment_history: "prerequisite",
  air_compressor: "prerequisite",
  air_compressor_maintenance: "prerequisite",
  supplier_inspection: "prerequisite",
  batch_approval: "production",
  product_manufacturing: "production",
  inventory_adjustment: "production",
  finished_product_check: "production",
  weight_quality_check: "production",
  self_quality_inspection: "production",
  product_test_log: "production",
  product_test_report: "production",
  consumer_complaint: "production",
  food_recall_notice: "production",
  handover_document: "production",
  document_approval: "production",
};

function getCategoryForRequest(requestType: string): string {
  return REQUEST_TYPE_CATEGORIES[requestType] || "prerequisite";
}

// 요청 유형 한글 매핑
function getRequestTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    checklist_approval: "체크리스트",
    ccp_review: "CCP 검토",
    ccp_deviation: "CCP 이탈",
    batch_approval: "배치 승인",
    employee_health_check: "건강상태 확인",
    temperature_humidity: "온습도 점검",
    temperature_humidity_check: "온·습도 점검표",
    personal_hygiene: "개인위생 점검",
    personal_hygiene_check: "개인위생 점검표",
    sanitation_record: "세척·소독 기록",
    hygiene_inspection: "위생 검사",
    material_inspection: "원자재 검사",
    inventory_adjustment: "재고 조정",
    product_manufacturing: "품목제조보고",
    workplace_hygiene_check: "작업장 위생 점검",
    hygiene_facility_check: "위생시설 점검표",
    water_management_check: "용수관리 점검표",
    illumination_check: "조도 점검표",
    surface_contamination_test: "표면오염 검사",
    airborne_bacteria_test: "낙하균 검사",
    training_log: "교육 훈련 일지",
    vehicle_temperature_check: "차량 온도 점검",
    waste_management: "폐기물관리대장",
    daily_disposal_record: "일일폐기기록",
    equipment_inspection: "설비 점검 기록",
    equipment_history: "설비 이력 관리",
    air_compressor: "압축공기 필터 관리",
    air_compressor_maintenance: "에어콤프레샤 관리",
    supplier_inspection: "공급업체 점검",
    finished_product_check: "완제품 검사",
    weight_quality_check: "중량 품질 검사",
    self_quality_inspection: "자체 품질 검사",
    product_test_log: "제품 시험 일지",
    product_test_report: "제품 시험 성적서",
    consumer_complaint: "소비자 불만 처리",
    food_recall_notice: "식품 회수 통보서",
    handover_document: "인수인계 문서",
    document_approval: "문서 승인",
  };
  return labels[type] || type;
}

// formType에서 폼 URL 매핑
const FORM_TYPE_TO_PATH: Record<string, string> = {
  air_compressor_filter: "/air-compressor",
  air_compressor_maintenance: "/air-compressor-maintenance",
  airborne_bacteria_test: "/airborne-bacteria-test",
  consumer_complaint: "/consumer-complaint",
  daily_disposal_record: "/daily-disposal-record",
  employee_health_check: "/employee-health-check",
  equipment_history: "/equipment-history",
  equipment_inspection: "/equipment-inspection",
  finished_product_check: "/finished-product-check",
  food_recall_notice: "/food-recall-notice",
  handover_document: "/handover-document",
  hygiene_facility_check: "/hygiene-facility-check",
  illumination_check: "/illumination-check",
  product_test_log: "/product-test-log",
  product_test_report: "/product-test-report",
  sanitation_record: "/sanitation-record",
  self_quality_inspection: "/self-quality-inspection",
  supplier_inspection: "/supplier-inspection",
  surface_contamination_test: "/surface-contamination-test",
  temperature_humidity_check: "/temperature-humidity-check",
  training_log: "/training-log",
  vehicle_temperature_check: "/vehicle-temperature-check",
  waste_management: "/waste-management",
  water_management_check: "/water-management-check",
  weight_quality_check: "/weight-quality-check",
  workplace_hygiene_check: "/workplace-hygiene-check",
};

// 인쇄 상태 배지
function PrintStatusBadge({ printed }: { printed: boolean }) {
  return printed
    ? <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">인쇄완료</Badge>
    : <Badge variant="default" className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">인쇄대기</Badge>;
}

export default function DocumentPrintManagement() {
  const { toast } = useToast();
  const trpcUtils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState("print-queue");

  // 필터 상태 (입력용)
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterPrintStatus, setFilterPrintStatus] = useState<string>("all");
  const [filterKeyword, setFilterKeyword] = useState("");

  // 실제 적용된 필터
  const [appliedFilters, setAppliedFilters] = useState({
    dateFrom: "",
    dateTo: "",
    printStatus: "all",
    keyword: "",
  });

  // 인쇄된 항목 추적 (로컬 상태 + localStorage)
  const [printedIds, setPrintedIds] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem("haccp_printed_ids");
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  // 인쇄 이력 (날짜, 문서 목록)
  const [printHistory, setPrintHistory] = useState<Array<{ date: string; ids: number[]; count: number }>>(() => {
    try {
      const saved = localStorage.getItem("haccp_print_history");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // 체크박스 선택 상태
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // 상세보기 다이얼로그
  const [detailDialog, setDetailDialog] = useState<{ open: boolean; request: any | null }>({
    open: false, request: null
  });

  // 일괄 인쇄 확인 다이얼로그
  const [batchPrintConfirm, setBatchPrintConfirm] = useState(false);

  // 인쇄 진행 상태
  const [isPrinting, setIsPrinting] = useState(false);

  // 승인된 문서 조회 (status: "approved")
  const { data: approvedRequests = [], refetch: refetchApproved, isLoading } = trpc.approval.list.useQuery({ status: "approved" });
  const { data: allApprovalSettings = [] } = trpc.organization.approvalSettings.list.useQuery();
  const { data: allEmployees = [] } = trpc.organization.employees.list.useQuery();

  // localStorage 동기화
  const savePrintedIds = useCallback((ids: Set<number>) => {
    setPrintedIds(ids);
    try { localStorage.setItem("haccp_printed_ids", JSON.stringify([...ids])); } catch {}
  }, []);

  const savePrintHistory = useCallback((history: Array<{ date: string; ids: number[]; count: number }>) => {
    setPrintHistory(history);
    try { localStorage.setItem("haccp_print_history", JSON.stringify(history.slice(0, 100))); } catch {}
  }, []);

  // 필터링 함수
  const filterRequests = useCallback((requests: any[], category?: string) => {
    let filtered = requests;

    // 카테고리 필터 (탭별)
    if (category) {
      filtered = filtered.filter(r => getCategoryForRequest(r.requestType) === category);
    }

    // 날짜 필터
    if (appliedFilters.dateFrom) {
      filtered = filtered.filter(r => {
        const date = r.approvedAt ? new Date(r.approvedAt).toISOString().split("T")[0] : "";
        return date >= appliedFilters.dateFrom;
      });
    }
    if (appliedFilters.dateTo) {
      filtered = filtered.filter(r => {
        const date = r.approvedAt ? new Date(r.approvedAt).toISOString().split("T")[0] : "";
        return date <= appliedFilters.dateTo;
      });
    }

    // 인쇄 상태 필터
    if (appliedFilters.printStatus === "printed") {
      filtered = filtered.filter(r => printedIds.has(r.id));
    } else if (appliedFilters.printStatus === "unprinted") {
      filtered = filtered.filter(r => !printedIds.has(r.id));
    }

    // 키워드 필터
    if (appliedFilters.keyword) {
      const kw = appliedFilters.keyword.toLowerCase();
      filtered = filtered.filter(r =>
        (r.title || "").toLowerCase().includes(kw) ||
        (r.description || "").toLowerCase().includes(kw) ||
        getRequestTypeLabel(r.requestType).toLowerCase().includes(kw)
      );
    }

    return filtered;
  }, [appliedFilters, printedIds]);

  // 탭별 데이터
  const unprintedRequests = approvedRequests.filter((r: any) => !printedIds.has(r.id));
  const printQueueFiltered = filterRequests(unprintedRequests);
  const ccpFiltered = filterRequests(approvedRequests, "ccp");
  const prerequisiteFiltered = filterRequests(approvedRequests, "prerequisite");
  const productionFiltered = filterRequests(approvedRequests, "production");

  // 조회하기 버튼 핸들러
  const handleSearch = () => {
    setAppliedFilters({
      dateFrom: filterDateFrom,
      dateTo: filterDateTo,
      printStatus: filterPrintStatus,
      keyword: filterKeyword,
    });
  };

  // 필터 초기화
  const handleResetFilters = () => {
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterPrintStatus("all");
    setFilterKeyword("");
    setAppliedFilters({ dateFrom: "", dateTo: "", printStatus: "all", keyword: "" });
  };

  // 새로고침
  const handleRefresh = () => {
    refetchApproved();
    toast({ title: "새로고침 완료", description: "최신 데이터를 불러왔습니다." });
  };

  // 해당 체크리스트 폼 페이지로 이동하여 인쇄
  const openFormForPrint = async (request: any) => {
    if (request.referenceType === "generic_checklist" && request.referenceId) {
      try {
        const record = await trpcUtils.genericChecklist.getById.fetch({ id: request.referenceId });
        if (record && record.formType) {
          const basePath = FORM_TYPE_TO_PATH[record.formType];
          if (basePath) {
            const formUrl = `${basePath}/${request.referenceId}`;
            window.open(formUrl, '_blank');
            return true;
          }
        }
      } catch (e) {
        console.error("폼 조회 오류:", e);
      }
    }
    return false;
  };

  // 개별 인쇄 - 인쇄 프리뷰 페이지로 이동
  const handlePrint = async (request: any) => {
    const newPrintedIds = new Set([...printedIds, request.id]);
    savePrintedIds(newPrintedIds);
    
    // 인쇄 이력 추가
    const now = new Date().toISOString();
    const newHistory = [{ date: now, ids: [request.id], count: 1 }, ...printHistory];
    savePrintHistory(newHistory);
    
    // 인쇄 프리뷰 페이지에서 열기
    window.open(`/print-preview?ids=${request.id}`, '_blank');
    
    toast({
      title: "인쇄 프리뷰 열림",
      description: `"${request.title}" 문서의 인쇄 프리뷰가 열렸습니다.`,
    });
  };

  // 선택된 항목 일괄 인쇄 (확인 다이얼로그 경유)
  const handleBatchPrintSelected = () => {
    if (selectedIds.length === 0) {
      toast({ title: "선택 필요", description: "인쇄할 문서를 선택해주세요.", variant: "destructive" });
      return;
    }
    setBatchPrintConfirm(true);
  };

  // 일괄 인쇄 실행 - 통합 인쇄 프리뷰 페이지로 이동
  const executeBatchPrint = async (requests: any[]) => {
    setIsPrinting(true);
    const ids = requests.map((r: any) => r.id);
    const newPrintedIds = new Set([...printedIds, ...ids]);
    savePrintedIds(newPrintedIds);

    // 인쇄 이력 추가
    const now = new Date().toISOString();
    const newHistory = [{ date: now, ids, count: ids.length }, ...printHistory];
    savePrintHistory(newHistory);

    // 하나의 인쇄 프리뷰 페이지에서 모든 문서를 연속 렌더링
    const idsParam = ids.join(",");
    window.open(`/print-preview?ids=${idsParam}`, '_blank');

    setIsPrinting(false);
    setSelectedIds([]);
    setBatchPrintConfirm(false);

    toast({
      title: "인쇄 프리뷰 열림",
      description: `${ids.length}건의 문서가 하나의 인쇄 프리뷰로 열렸습니다.`,
    });
  };

  // 전체 일괄 인쇄 (현재 탭의 필터된 목록)
  const handleBatchPrintAll = (requests: any[]) => {
    if (requests.length === 0) return;
    setSelectedIds(requests.map((r: any) => r.id));
    setBatchPrintConfirm(true);
  };

  // 체크박스 토글
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = (list: any[]) => {
    const allIds = list.map((r: any) => r.id);
    const allSelected = allIds.length > 0 && allIds.every((id: number) => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : allIds);
  };

  // 인쇄 이력 초기화
  const clearPrintHistory = () => {
    savePrintedIds(new Set());
    savePrintHistory([]);
    toast({ title: "초기화 완료", description: "인쇄 이력이 초기화되었습니다." });
  };

  // 문서 카드 렌더링 (체크박스 포함)
  const renderDocumentCard = (request: any, showCheckbox: boolean = true) => {
    const isSelected = selectedIds.includes(request.id);
    const isPrinted = printedIds.has(request.id);

    return (
      <Card key={request.id} className={`mb-3 hover:shadow-md transition-all ${isSelected ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-950/10 ring-1 ring-blue-300' : ''}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              {showCheckbox && (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSelect(request.id); }}
                  className="mt-1 text-muted-foreground hover:text-blue-600 transition-colors"
                >
                  {isSelected 
                    ? <CheckSquare className="w-5 h-5 text-blue-600" /> 
                    : <Square className="w-5 h-5" />
                  }
                </button>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <PrintStatusBadge printed={isPrinted} />
                  <Badge variant="outline" className="text-xs">
                    {getRequestTypeLabel(request.requestType)}
                  </Badge>
                  <span className="text-xs text-gray-400">#{request.id}</span>
                </div>
                <h3 className="font-semibold text-sm mt-1">{request.title}</h3>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                  <span className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    승인: {request.approvedAt ? new Date(request.approvedAt).toLocaleDateString("ko-KR") : "-"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    요청: {request.requestedAt ? new Date(request.requestedAt).toLocaleDateString("ko-KR") : "-"}
                  </span>
                </div>
                {request.description && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-1">{request.description}</p>
                )}

                {/* 승인 직인 (승인 완료 시) - formData.approval > 대시보드 설정 > 요청자 */}
                {(() => {
                  const cfd = (request as any).checklistFormData;
                  const approval = cfd?.approval;
                  // 대시보드 결재 설정에서 이름 조회
                  const docSetting = (allApprovalSettings as any[]).find((s: any) => s.documentType === request.requestType);
                  const empList = allEmployees as any[];
                  const settingAuthor = docSetting?.authorEmployeeId ? empList.find((e: any) => e.id === docSetting.authorEmployeeId)?.name : "";
                  const settingReviewer = docSetting?.reviewerEmployeeId ? empList.find((e: any) => e.id === docSetting.reviewerEmployeeId)?.name : "";
                  const settingApprover = docSetting?.approverEmployeeId ? empList.find((e: any) => e.id === docSetting.approverEmployeeId)?.name : "";
                  const writerName = approval?.writerName || settingAuthor || request.requester?.name || "작성자";
                  const reviewerName = approval?.reviewerName || settingReviewer || request.reviewer?.name || "검토자";
                  const approverName = approval?.approverName || settingApprover || request.approver?.name || "승인자";
                  return (
                    <div className="mt-2">
                      <ApprovalSealRow
                        writer={{ name: writerName, date: request.requestedAt || request.createdAt }}
                        reviewer={request.reviewedAt || approval?.reviewerApproved ? { name: reviewerName, date: request.reviewedAt || request.approvedAt } : undefined}
                        approver={request.approvedAt || approval?.approverApproved ? { name: approverName, date: request.approvedAt } : undefined}
                        size={35}
                      />
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 ml-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDetailDialog({ open: true, request })}
                title="상세보기"
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                variant={isPrinted ? "outline" : "default"}
                size="sm"
                onClick={() => handlePrint(request)}
              >
                <Printer className="h-4 w-4 mr-1" />
                {isPrinted ? "재인쇄" : "인쇄"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // 빈 상태 렌더링
  const renderEmpty = (message: string) => (
    <div className="text-center py-12 text-gray-400">
      <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
      <p className="text-sm">{message}</p>
    </div>
  );

  // 선택/일괄 인쇄 바 렌더링
  const renderSelectionBar = (list: any[], label: string) => {
    if (list.length === 0) return null;
    const allIds = list.map((r: any) => r.id);
    const allSelected = allIds.length > 0 && allIds.every((id: number) => selectedIds.includes(id));
    const selectedCount = allIds.filter((id: number) => selectedIds.includes(id)).length;

    return (
      <div className="flex items-center gap-2 py-2 flex-wrap mb-2">
        <button onClick={() => toggleSelectAll(list)}
          className="text-muted-foreground hover:text-blue-600 transition-colors"
        >
          {allSelected
            ? <CheckSquare className="w-5 h-5 text-blue-600" />
            : <Square className="w-5 h-5" />
          }
        </button>
        <span className="text-sm text-muted-foreground">전체 선택 ({list.length}건)</span>
        {selectedCount > 0 && (
          <div className="flex gap-2 ml-auto">
            <Button size="sm" onClick={handleBatchPrintSelected} disabled={isPrinting}>
              {isPrinting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />}
              선택 인쇄 ({selectedCount}건)
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleBatchPrintAll(list)} disabled={isPrinting}>
              <ListChecks className="h-4 w-4 mr-1" />
              전체 인쇄 ({list.length}건)
            </Button>
          </div>
        )}
        {selectedCount === 0 && list.length > 0 && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => handleBatchPrintAll(list)} disabled={isPrinting}>
            <ListChecks className="h-4 w-4 mr-1" />
            전체 일괄 인쇄 ({list.length}건)
          </Button>
        )}
      </div>
    );
  };

  // 필터 영역 렌더링
  const renderFilters = () => (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">시작일</label>
            <Input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="w-40 h-9"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">종료일</label>
            <Input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="w-40 h-9"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">인쇄상태</label>
            <Select value={filterPrintStatus} onValueChange={setFilterPrintStatus}>
              <SelectTrigger className="w-32 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="unprinted">인쇄대기</SelectItem>
                <SelectItem value="printed">인쇄완료</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">검색어</label>
            <Input
              placeholder="제목, 유형 검색..."
              value={filterKeyword}
              onChange={(e) => setFilterKeyword(e.target.value)}
              className="w-48 h-9"
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            />
          </div>
          <Button onClick={handleSearch} className="h-9">
            <Search className="h-4 w-4 mr-1" />
            조회하기
          </Button>
          <Button variant="outline" onClick={handleResetFilters} className="h-9">
            초기화
          </Button>
          <Button variant="ghost" onClick={handleRefresh} className="h-9 ml-auto">
            <RefreshCw className="h-4 w-4 mr-1" />
            새로고침
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout>
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Printer className="h-7 w-7 text-blue-600" />
          문서 출력
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          승인 완료된 문서를 인쇄합니다. 체크박스로 선택하여 일괄 인쇄하거나, 개별 인쇄할 수 있습니다.
        </p>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Card className={`cursor-pointer hover:shadow-md transition-all ${activeTab === "print-queue" ? "ring-2 ring-yellow-400" : ""}`} onClick={() => { setActiveTab("print-queue"); setSelectedIds([]); }}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
              <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500">출력대기</p>
              <p className="text-xl font-bold text-yellow-600">{unprintedRequests.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:shadow-md transition-all ${activeTab === "ccp" ? "ring-2 ring-red-400" : ""}`} onClick={() => { setActiveTab("ccp"); setSelectedIds([]); }}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500">CCP 체크리스트</p>
              <p className="text-xl font-bold text-red-600">{ccpFiltered.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:shadow-md transition-all ${activeTab === "prerequisite" ? "ring-2 ring-blue-400" : ""}`} onClick={() => { setActiveTab("prerequisite"); setSelectedIds([]); }}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500">선행/위생</p>
              <p className="text-xl font-bold text-blue-600">{prerequisiteFiltered.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:shadow-md transition-all ${activeTab === "production" ? "ring-2 ring-green-400" : ""}`} onClick={() => { setActiveTab("production"); setSelectedIds([]); }}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
              <Package className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500">품목제조보고</p>
              <p className="text-xl font-bold text-green-600">{productionFiltered.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={`cursor-pointer hover:shadow-md transition-all ${activeTab === "history" ? "ring-2 ring-gray-400" : ""}`} onClick={() => { setActiveTab("history"); setSelectedIds([]); }}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-900/30">
              <History className="h-5 w-5 text-gray-600 dark:text-gray-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500">인쇄이력</p>
              <p className="text-xl font-bold text-gray-600">{printedIds.size}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 필터 영역 */}
      {renderFilters()}

      {/* 탭 */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSelectedIds([]); }}>
        <TabsList className="mb-4 flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="print-queue" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 whitespace-nowrap">
            <Clock className="h-4 w-4" />
            출력대기
            {unprintedRequests.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">{unprintedRequests.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ccp" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 whitespace-nowrap">
            <AlertTriangle className="h-4 w-4" />
            CCP 체크리스트
          </TabsTrigger>
          <TabsTrigger value="prerequisite" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 whitespace-nowrap">
            <Shield className="h-4 w-4" />
            선행/위생
          </TabsTrigger>
          <TabsTrigger value="production" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 whitespace-nowrap">
            <Package className="h-4 w-4" />
            품목제조보고
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 whitespace-nowrap">
            <History className="h-4 w-4" />
            인쇄이력
            {printedIds.size > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{printedIds.size}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* 출력대기 탭 */}
        <TabsContent value="print-queue">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-600" />
                출력 대기 목록
                <Badge variant="outline" className="ml-2">{printQueueFiltered.length}건</Badge>
              </CardTitle>
              <p className="text-xs text-gray-400 mt-1">
                승인 완료된 문서 중 아직 인쇄하지 않은 문서입니다.
              </p>
            </CardHeader>
            <CardContent>
              {renderSelectionBar(printQueueFiltered, "출력대기")}
              {printQueueFiltered.length > 0
                ? printQueueFiltered.map((r: any) => renderDocumentCard(r))
                : renderEmpty("출력 대기 중인 문서가 없습니다.")}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CCP 체크리스트 탭 */}
        <TabsContent value="ccp">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                CCP 체크리스트
                <Badge variant="outline" className="ml-2">{ccpFiltered.length}건</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {renderSelectionBar(ccpFiltered, "CCP")}
              {ccpFiltered.length > 0
                ? ccpFiltered.map((r: any) => renderDocumentCard(r))
                : renderEmpty("CCP 관련 승인 문서가 없습니다.")}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 선행/위생 체크리스트 탭 */}
        <TabsContent value="prerequisite">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600" />
                선행/위생 체크리스트
                <Badge variant="outline" className="ml-2">{prerequisiteFiltered.length}건</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {renderSelectionBar(prerequisiteFiltered, "선행/위생")}
              {prerequisiteFiltered.length > 0
                ? prerequisiteFiltered.map((r: any) => renderDocumentCard(r))
                : renderEmpty("선행/위생 관련 승인 문서가 없습니다.")}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 품목제조보고 탭 */}
        <TabsContent value="production">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-5 w-5 text-green-600" />
                품목제조보고
                <Badge variant="outline" className="ml-2">{productionFiltered.length}건</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {renderSelectionBar(productionFiltered, "품목제조보고")}
              {productionFiltered.length > 0
                ? productionFiltered.map((r: any) => renderDocumentCard(r))
                : renderEmpty("품목제조보고 관련 승인 문서가 없습니다.")}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 인쇄이력 탭 */}
        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="h-5 w-5 text-gray-600" />
                    인쇄 이력
                    <Badge variant="outline" className="ml-2">{printedIds.size}건 인쇄됨</Badge>
                  </CardTitle>
                  <p className="text-xs text-gray-400 mt-1">
                    인쇄 완료된 문서 목록입니다. 재인쇄가 가능합니다.
                  </p>
                </div>
                {printedIds.size > 0 && (
                  <Button variant="outline" size="sm" onClick={clearPrintHistory}>
                    인쇄이력 초기화
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {printedIds.size > 0 ? (
                <>
                  {/* 인쇄 완료된 문서 목록 */}
                  {approvedRequests
                    .filter((r: any) => printedIds.has(r.id))
                    .map((r: any) => renderDocumentCard(r, false))
                  }
                  {/* 최근 인쇄 이력 */}
                  {printHistory.length > 0 && (
                    <div className="mt-6 border-t pt-4">
                      <h4 className="text-sm font-medium text-gray-600 mb-3">최근 인쇄 기록</h4>
                      <div className="space-y-2">
                        {printHistory.slice(0, 20).map((h, i) => (
                          <div key={i} className="flex items-center gap-3 text-xs text-gray-500 p-2 bg-gray-50 dark:bg-gray-900/20 rounded">
                            <Printer className="h-3 w-3" />
                            <span>{new Date(h.date).toLocaleString("ko-KR")}</span>
                            <Badge variant="outline" className="text-xs">{h.count}건</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                renderEmpty("인쇄 이력이 없습니다.")
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 상세보기 다이얼로그 */}
      <Dialog open={detailDialog.open} onOpenChange={(open) => setDetailDialog({ ...detailDialog, open })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              문서 상세
            </DialogTitle>
          </DialogHeader>
          {detailDialog.request && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">문서번호</label>
                  <p className="text-sm font-medium">#{detailDialog.request.id}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">인쇄상태</label>
                  <div className="mt-0.5"><PrintStatusBadge printed={printedIds.has(detailDialog.request.id)} /></div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">문서유형</label>
                  <p className="text-sm">{getRequestTypeLabel(detailDialog.request.requestType)}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">카테고리</label>
                  <p className="text-sm capitalize">{getCategoryForRequest(detailDialog.request.requestType)}</p>
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500">제목</label>
                  <p className="text-sm font-medium">{detailDialog.request.title}</p>
                </div>
                {detailDialog.request.description && (
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500">설명</label>
                    <p className="text-sm">{detailDialog.request.description}</p>
                  </div>
                )}
                <div>
                  <label className="text-xs text-gray-500">요청일시</label>
                  <p className="text-sm">
                    {detailDialog.request.requestedAt
                      ? new Date(detailDialog.request.requestedAt).toLocaleString("ko-KR")
                      : "-"}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">승인일시</label>
                  <p className="text-sm">
                    {detailDialog.request.approvedAt
                      ? new Date(detailDialog.request.approvedAt).toLocaleString("ko-KR")
                      : "-"}
                  </p>
                </div>
                {detailDialog.request.notes && (
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500">승인 코멘트</label>
                    <p className="text-sm text-green-600">{detailDialog.request.notes}</p>
                  </div>
                )}
              </div>

              {/* 승인 직인 - formData.approval > 대시보드 설정 > 요청자 */}
              {(() => {
                const cfd = (detailDialog.request as any).checklistFormData;
                const approval = cfd?.approval;
                // 대시보드 결재 설정에서 이름 조회
                const docSetting2 = (allApprovalSettings as any[]).find((s: any) => s.documentType === detailDialog.request.requestType);
                const empList2 = allEmployees as any[];
                const settingAuthor2 = docSetting2?.authorEmployeeId ? empList2.find((e: any) => e.id === docSetting2.authorEmployeeId)?.name : "";
                const settingReviewer2 = docSetting2?.reviewerEmployeeId ? empList2.find((e: any) => e.id === docSetting2.reviewerEmployeeId)?.name : "";
                const settingApprover2 = docSetting2?.approverEmployeeId ? empList2.find((e: any) => e.id === docSetting2.approverEmployeeId)?.name : "";
                const writerName = approval?.writerName || settingAuthor2 || detailDialog.request.requester?.name || "작성자";
                const reviewerName = approval?.reviewerName || settingReviewer2 || detailDialog.request.reviewer?.name || "검토자";
                const approverName = approval?.approverName || settingApprover2 || detailDialog.request.approver?.name || "승인자";
                return (
                  <div className="border-t pt-3 flex justify-center">
                    <ApprovalSealRow
                      writer={{ name: writerName, date: detailDialog.request.requestedAt || detailDialog.request.createdAt }}
                      reviewer={detailDialog.request.reviewedAt || approval?.reviewerApproved ? { name: reviewerName, date: detailDialog.request.reviewedAt || detailDialog.request.approvedAt } : undefined}
                      approver={detailDialog.request.approvedAt || approval?.approverApproved ? { name: approverName, date: detailDialog.request.approvedAt } : undefined}
                      size={50}
                    />
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialog({ open: false, request: null })}>
              닫기
            </Button>
            {detailDialog.request && (
              <Button onClick={() => {
                handlePrint(detailDialog.request);
                setDetailDialog({ open: false, request: null });
              }}>
                <Printer className="h-4 w-4 mr-1" />
                인쇄
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 일괄 인쇄 확인 다이얼로그 */}
      <Dialog open={batchPrintConfirm} onOpenChange={setBatchPrintConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-blue-600" />
              일괄 인쇄 확인
            </DialogTitle>
            <DialogDescription>
              선택한 {selectedIds.length}건의 문서를 일괄 인쇄하시겠습니까?
              하나의 인쇄 프리뷰 페이지에서 연속으로 출력됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
            <p>선택한 문서들이 하나의 인쇄 프리뷰 페이지에 연속으로 표시됩니다.</p>
            <p className="mt-1">인쇄 프리뷰에서 직접 인쇄하거나 PDF로 저장할 수 있습니다.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchPrintConfirm(false)}>취소</Button>
            <Button 
              onClick={() => {
                const selectedRequests = approvedRequests.filter((r: any) => selectedIds.includes(r.id));
                executeBatchPrint(selectedRequests);
              }}
              disabled={isPrinting}
            >
              {isPrinting 
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 인쇄 중...</>
                : <><Printer className="h-4 w-4 mr-1" /> 일괄 인쇄 ({selectedIds.length}건)</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
