/**
 * 통합 문서출력 페이지 (컴팩트 리스트 + 삭제 기능)
 * - 체크박스 선택 일괄인쇄
 * - 직인/날인 표시 (상세)
 * - PDF 다운로드 지원
 * - 인쇄 이력 관리
 * - 인쇄이력 삭제 기능
 */
import { useState, useCallback } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import type { RouterOutput } from "@/lib/trpcTypes";

// 승인문서 도메인 타입 — trpc proxy 가 깊은 타입을 완전히 전파하지 못해 명시 추출
type ApprovalRequest = RouterOutput["approval"]["list"][number];
type ApprovalSetting = RouterOutput["organization"]["approvalSettings"]["list"][number];
type EmployeeRow = RouterOutput["organization"]["employees"]["list"][number];
import { useAuth } from "@/_core/hooks/useAuth";
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
  History, Loader2, Trash2
} from "lucide-react";
import { ApprovalSealRow } from "@/components/SealGenerator";

// 요청 유형별 카테고리 매핑
// 카테고리: ccp / prerequisite(선행/위생) / production(품목제조) /
//          inspection(검사) / production_log(생산일지) / material(원료수불)
const REQUEST_TYPE_CATEGORIES: Record<string, string> = {
  // === CCP ===
  ccp_review: "ccp", ccp_checklist: "ccp", ccp_deviation: "ccp", batch_plan: "ccp",
  batch_production: "ccp", ccp_form: "ccp",

  // === 선행/위생 ===
  daily_log: "prerequisite", checklist_approval: "prerequisite",
  employee_health_check: "prerequisite", temperature_humidity: "prerequisite",
  temperature_humidity_check: "prerequisite", personal_hygiene: "prerequisite",
  personal_hygiene_check: "prerequisite", sanitation_record: "prerequisite",
  hygiene_inspection: "prerequisite",
  workplace_hygiene_check: "prerequisite", hygiene_facility_check: "prerequisite",
  water_management_check: "prerequisite", illumination_check: "prerequisite",
  surface_contamination_test: "prerequisite", airborne_bacteria_test: "prerequisite",
  training_log: "prerequisite", vehicle_temperature_check: "prerequisite",
  waste_management: "prerequisite", daily_disposal_record: "prerequisite",
  equipment_inspection: "prerequisite", equipment_history: "prerequisite",
  air_compressor: "prerequisite", air_compressor_maintenance: "prerequisite",
  supplier_inspection: "prerequisite",

  // === 품목제조 ===
  batch_approval: "production", product_manufacturing: "production",
  inventory_adjustment: "production", document_approval: "production",

  // === 검사 (육안검사 / 완제품출고검사 / 자체품질) ===
  visual_inspection: "inspection",                   // 원재료 육안검사일지
  material_inspection: "inspection",                  // 원재료 검사 (구분)
  finished_product_inspection: "inspection",         // 완제품 출고검사일지
  finished_product_check: "inspection",
  weight_quality_check: "inspection",
  self_quality_inspection: "inspection",
  product_test_log: "inspection",
  product_test_report: "inspection",
  consumer_complaint: "inspection",
  food_recall_notice: "inspection",
  handover_document: "inspection",

  // === 생산일지 ===
  production_daily: "production_log",
  batch_completion: "production_log",

  // === 원료수불 ===
  material_usage_report: "material",
};

function getCategoryForRequest(requestType: string): string {
  return REQUEST_TYPE_CATEGORIES[requestType] || "prerequisite";
}

function getRequestTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    checklist_approval: "체크리스트", ccp_review: "CCP 검토", ccp_checklist: "CCP 체크리스트",
    ccp_deviation: "CCP 이탈", ccp_form: "CCP 모니터링", batch_plan: "CCP 배치그룹",
    batch_production: "배치CCP",
    // 생산일지
    batch_completion: "생산일지", production_daily: "생산일지",
    // 위생/선행
    daily_log: "위생관리점검표",
    batch_approval: "배치 승인", employee_health_check: "건강확인", temperature_humidity: "온습도",
    temperature_humidity_check: "온습도점검", personal_hygiene: "개인위생", personal_hygiene_check: "개인위생점검",
    sanitation_record: "세척소독", hygiene_inspection: "위생검사",
    inventory_adjustment: "재고조정", product_manufacturing: "품목제조", workplace_hygiene_check: "작업장위생",
    hygiene_facility_check: "위생시설", water_management_check: "용수관리", illumination_check: "조도점검",
    surface_contamination_test: "표면오염", airborne_bacteria_test: "낙하균", training_log: "교육훈련",
    vehicle_temperature_check: "차량온도", waste_management: "폐기물", daily_disposal_record: "폐기기록",
    equipment_inspection: "설비점검", equipment_history: "설비이력", air_compressor: "압축공기",
    air_compressor_maintenance: "에어콤프레샤", supplier_inspection: "공급업체",
    // 검사
    material_inspection: "원자재검사",
    visual_inspection: "육안검사일지",
    finished_product_check: "완제품검사",
    finished_product_inspection: "완제품출고검사일지",
    weight_quality_check: "중량검사", self_quality_inspection: "자체품질", product_test_log: "시험일지",
    product_test_report: "시험성적서", consumer_complaint: "소비자불만", food_recall_notice: "회수통보서",
    handover_document: "인수인계", document_approval: "문서승인",
    // 원료수불
    material_usage_report: "원료수불보고서",
  };
  return labels[type] || type;
}

const CATEGORY_BADGE_COLORS: Record<string, string> = {
  ccp: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  prerequisite: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  production: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  inspection: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  production_log: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  material: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const FORM_TYPE_TO_PATH: Record<string, string> = {
  air_compressor_filter: "/air-compressor", air_compressor_maintenance: "/air-compressor-maintenance",
  airborne_bacteria_test: "/airborne-bacteria-test", consumer_complaint: "/consumer-complaint",
  daily_disposal_record: "/daily-disposal-record", employee_health_check: "/employee-health-check",
  equipment_history: "/equipment-history", equipment_inspection: "/equipment-inspection",
  finished_product_check: "/finished-product-check", food_recall_notice: "/food-recall-notice",
  handover_document: "/handover-document", hygiene_facility_check: "/hygiene-facility-check",
  illumination_check: "/illumination-check", product_test_log: "/product-test-log",
  product_test_report: "/product-test-report", sanitation_record: "/sanitation-record",
  self_quality_inspection: "/self-quality-inspection", supplier_inspection: "/supplier-inspection",
  surface_contamination_test: "/surface-contamination-test", temperature_humidity_check: "/temperature-humidity-check",
  training_log: "/training-log", vehicle_temperature_check: "/vehicle-temperature-check",
  waste_management: "/waste-management", water_management_check: "/water-management-check",
  weight_quality_check: "/weight-quality-check", workplace_hygiene_check: "/workplace-hygiene-check",
};

export default function DocumentPrintManagement() {
  const { toast } = useToast();
  const trpcUtils = trpc.useUtils();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? 0;
  const [activeTab, setActiveTab] = useState("print-queue");

  // 필터 상태
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterPrintStatus, setFilterPrintStatus] = useState<string>("all");
  const [filterKeyword, setFilterKeyword] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({ dateFrom: "", dateTo: "", printStatus: "all", keyword: "" });

  const printedIdsKey = `haccp_printed_ids_t${tenantId}`;
  const printHistoryKey = `haccp_print_history_t${tenantId}`;

  const [printedIds, setPrintedIds] = useState<Set<number>>(() => {
    try { if (!tenantId) return new Set(); const saved = localStorage.getItem(printedIdsKey); return saved ? new Set(JSON.parse(saved)) : new Set(); } catch { return new Set(); }
  });
  const [printHistory, setPrintHistory] = useState<Array<{ date: string; ids: number[]; count: number }>>(() => {
    try { if (!tenantId) return []; const saved = localStorage.getItem(printHistoryKey); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [detailDialog, setDetailDialog] = useState<{ open: boolean; request: ApprovalRequest | null }>({ open: false, request: null });
  const [batchPrintConfirm, setBatchPrintConfirm] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<{ open: boolean; ids: number[]; titles: string[] }>({ open: false, ids: [], titles: [] });
  const [isDeleting, setIsDeleting] = useState(false);

  // ★ 출력대기 최근 N일 필터 (기본 3일)
  // - 오래된 승인 문서는 카테고리 탭에서만 보이고, 출력대기 탭에서는 숨김
  // - 필요 시 사용자가 "전체보기" 로 확장 가능
  const [printQueueRecentDays, setPrintQueueRecentDays] = useState<number>(3);
  const [printQueueShowAll, setPrintQueueShowAll] = useState<boolean>(false);

  const { data: approvedRequests = [], refetch: refetchApproved, isLoading } = trpc.approval.list.useQuery({ status: "approved" });
  const { data: allRequests = [], refetch: refetchAll } = trpc.approval.list.useQuery({});
  const { data: allApprovalSettings = [] } = trpc.organization.approvalSettings.list.useQuery();
  const { data: allEmployees = [] } = trpc.organization.employees.list.useQuery();

  const savePrintedIds = useCallback((ids: Set<number>) => {
    setPrintedIds(ids);
    try { localStorage.setItem(printedIdsKey, JSON.stringify(Array.from(ids))); } catch {}
  }, [printedIdsKey]);

  const savePrintHistory = useCallback((history: Array<{ date: string; ids: number[]; count: number }>) => {
    setPrintHistory(history);
    try { localStorage.setItem(printHistoryKey, JSON.stringify(history.slice(0, 100))); } catch {}
  }, [printHistoryKey]);

  // 제목에서 날짜 추출
  // 지원 포맷:
  //   1) "YYYY-MM-DD"       (예: "[CCP-CCP-1B] 2026-03-19 찹쌀떡")
  //   2) "YYYYMMDD" 배치코드 (예: "[자동] 배치 CCP 승인 - 30010-20260410-001 ...")
  //   3) "YYYY/MM/DD"       (예: "2026/04/10")
  //   4) "YYYY.MM.DD"       (예: "2026.04.10")
  const extractDateFromTitle = useCallback((title: string): string => {
    if (!title) return "";
    // 1) YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
    const m1 = title.match(/(\d{4})[-/.](\d{2})[-/.](\d{2})/);
    if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
    // 2) 배치코드 속 YYYYMMDD (- 양쪽에 8자리)
    //    "30010-20260410-001" 에서 20260410 만 추출
    const m2 = title.match(/-(\d{8})-/);
    if (m2) {
      const d = m2[1];
      const y = d.substring(0, 4);
      const mo = d.substring(4, 6);
      const da = d.substring(6, 8);
      // 유효 범위 체크 (2000~2099, 01~12, 01~31)
      if (Number(y) >= 2000 && Number(y) <= 2099 && Number(mo) >= 1 && Number(mo) <= 12 && Number(da) >= 1 && Number(da) <= 31) {
        return `${y}-${mo}-${da}`;
      }
    }
    return "";
  }, []);

  // 정렬용 날짜 계산 (우선순위: 작업일 → requestedAt → approvedAt → createdAt)
  const getSortableDate = useCallback((r: ApprovalRequest): string => {
    const workDate = extractDateFromTitle(r.title || "");
    if (workDate) return workDate;
    if (r.requestedAt) return new Date(r.requestedAt).toISOString().split("T")[0];
    if (r.approvedAt) return new Date(r.approvedAt).toISOString().split("T")[0];
    if (r.createdAt) return new Date(r.createdAt).toISOString().split("T")[0];
    return "";
  }, [extractDateFromTitle]);

  // 날짜 내림차순 정렬 (최신이 위)
  // 1차: 작업일(제목에서 추출)
  // 2차: requestedAt / approvedAt / createdAt
  // 3차: 제목 사전순
  const sortByDateDesc = useCallback((requests: ApprovalRequest[]): ApprovalRequest[] => {
    return [...requests].sort((a, b) => {
      const dateA = getSortableDate(a);
      const dateB = getSortableDate(b);
      if (dateA && dateB) {
        const cmp = dateB.localeCompare(dateA);
        if (cmp !== 0) return cmp;
      } else if (dateA && !dateB) {
        return -1;
      } else if (!dateA && dateB) {
        return 1;
      }
      // 같은 날짜: id 내림차순 (최신 요청이 위)
      const idA = Number(a.id || 0);
      const idB = Number(b.id || 0);
      if (idA !== idB) return idB - idA;
      return (a.title || "").localeCompare(b.title || "");
    });
  }, [getSortableDate]);

  const filterRequests = useCallback((requests: ApprovalRequest[], category?: string) => {
    let filtered = requests;
    if (category) filtered = filtered.filter(r => getCategoryForRequest(r.requestType) === category);
    if (appliedFilters.dateFrom) filtered = filtered.filter(r => { const d = getSortableDate(r); return d >= appliedFilters.dateFrom; });
    if (appliedFilters.dateTo) filtered = filtered.filter(r => { const d = getSortableDate(r); return d && d <= appliedFilters.dateTo; });
    if (appliedFilters.printStatus === "printed") filtered = filtered.filter(r => printedIds.has(r.id));
    else if (appliedFilters.printStatus === "unprinted") filtered = filtered.filter(r => !printedIds.has(r.id));
    if (appliedFilters.keyword) { const kw = appliedFilters.keyword.toLowerCase(); filtered = filtered.filter(r => (r.title || "").toLowerCase().includes(kw) || getRequestTypeLabel(r.requestType).toLowerCase().includes(kw)); }
    return sortByDateDesc(filtered);
  }, [appliedFilters, printedIds, getSortableDate, sortByDateDesc]);

  // === 출력대기 필터 ===
  // 1) 이미 인쇄한 것 제외
  // 2) 최근 N일 이내 문서만 (printQueueShowAll 이면 전체)
  const recentThresholdDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() - printQueueRecentDays);
    return d.toISOString().split("T")[0];
  })();
  const unprintedRequests = approvedRequests.filter((r: ApprovalRequest) => {
    if (printedIds.has(r.id)) return false;
    if (printQueueShowAll) return true;
    // 작업일(제목) 우선, 없으면 requestedAt/approvedAt/createdAt
    const d = getSortableDate(r);
    return d && d >= recentThresholdDate;
  });
  const printQueueFiltered = filterRequests(unprintedRequests);
  const ccpFiltered = filterRequests(approvedRequests, "ccp");
  const prerequisiteFiltered = filterRequests(approvedRequests, "prerequisite");
  const productionFiltered = filterRequests(approvedRequests, "production");
  const inspectionFiltered = filterRequests(approvedRequests, "inspection");
  const productionLogFiltered = filterRequests(approvedRequests, "production_log");
  const materialFiltered = filterRequests(approvedRequests, "material");

  const handleSearch = () => setAppliedFilters({ dateFrom: filterDateFrom, dateTo: filterDateTo, printStatus: filterPrintStatus, keyword: filterKeyword });
  const handleResetFilters = () => { setFilterDateFrom(""); setFilterDateTo(""); setFilterPrintStatus("all"); setFilterKeyword(""); setAppliedFilters({ dateFrom: "", dateTo: "", printStatus: "all", keyword: "" }); };
  const handleRefresh = () => { refetchApproved(); toast({ title: "새로고침 완료" }); };

  const handlePrint = async (request: ApprovalRequest) => {
    const newPrintedIds = new Set([...Array.from(printedIds), request.id]);
    savePrintedIds(newPrintedIds);
    savePrintHistory([{ date: new Date().toISOString(), ids: [request.id], count: 1 }, ...printHistory]);
    window.open(`/print-preview?ids=${request.id}`, '_blank');
    toast({ title: "인쇄 프리뷰 열림", description: `"${request.title}" 인쇄` });
  };

  const handleBatchPrintSelected = () => {
    if (selectedIds.length === 0) { toast({ title: "선택 필요", variant: "destructive" }); return; }
    setBatchPrintConfirm(true);
  };

  const executeBatchPrint = async (requests: ApprovalRequest[]) => {
    setIsPrinting(true);
    const ids = requests.map((r: ApprovalRequest) => r.id).filter(Boolean);

    if (ids.length === 0) {
      setIsPrinting(false);
      setBatchPrintConfirm(false);
      toast({ title: "선택 필요", variant: "destructive" });
      return;
    }

    // ★ 먼저 printedIds 를 즉시 업데이트 (UI 반영 보장)
    const newPrintedIds = new Set([...Array.from(printedIds), ...ids]);
    savePrintedIds(newPrintedIds);
    savePrintHistory([{ date: new Date().toISOString(), ids, count: ids.length }, ...printHistory]);

    // ★ URL 길이 제한 회피: 50건씩 분할하여 여러 창으로 인쇄
    const CHUNK_SIZE = 50;
    const chunks: number[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      chunks.push(ids.slice(i, i + CHUNK_SIZE));
    }

    if (chunks.length === 1) {
      window.open(`/print-preview?ids=${chunks[0].join(",")}`, "_blank");
    } else {
      // 여러 청크인 경우 순차로 열기 (브라우저 팝업 차단 회피)
      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        setTimeout(() => {
          window.open(`/print-preview?ids=${chunk.join(",")}`, "_blank");
        }, ci * 300);
      }
    }

    setIsPrinting(false);
    setSelectedIds([]);
    setBatchPrintConfirm(false);
    toast({
      title: "인쇄 프리뷰 열림",
      description:
        chunks.length > 1
          ? `${ids.length}건을 ${chunks.length}개 창으로 분할 인쇄 (각 ${CHUNK_SIZE}건)`
          : `${ids.length}건 인쇄`,
    });
  };

  const handleBatchPrintAll = (requests: ApprovalRequest[]) => {
    if (requests.length === 0) return;
    setSelectedIds(requests.map((r: ApprovalRequest) => r.id));
    setBatchPrintConfirm(true);
  };

  const handleRemoveFromPrinted = (id: number) => {
    const newIds = new Set(printedIds);
    newIds.delete(id);
    savePrintedIds(newIds);
    toast({ title: "삭제됨", description: "인쇄 이력에서 제거되었습니다." });
  };

  const toggleSelect = (id: number) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = (list: ApprovalRequest[]) => {
    const allIds = list.map((r: ApprovalRequest) => r.id);
    setSelectedIds(allIds.length > 0 && allIds.every((id: number) => selectedIds.includes(id)) ? [] : allIds);
  };

  const clearPrintHistory = () => { savePrintedIds(new Set()); savePrintHistory([]); toast({ title: "초기화 완료" }); };

  // === 삭제 기능 (서버 API 연동) ===
  const deleteRequestMutation = trpc.approval.deleteRequest.useMutation({
    onSuccess: () => {
      refetchApproved();
      refetchAll();
      toast({ title: "삭제 완료", description: "문서가 삭제되었습니다." });
    },
    onError: (error: { message: string }) => {
      toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
    },
  });

  const deleteMultipleMutation = trpc.approval.deleteMultipleRequests.useMutation({
    onSuccess: (data: any) => {
      refetchApproved();
      refetchAll();
      setSelectedIds([]);
      toast({ title: "일괄 삭제 완료", description: data.message });
    },
    onError: (error: { message: string }) => {
      toast({ title: "일괄 삭제 실패", description: error.message, variant: "destructive" });
    },
  });

  const handleDeleteRequest = (request: ApprovalRequest) => {
    setDeleteConfirmDialog({ open: true, ids: [request.id], titles: [request.title || `#${request.id}`] });
  };

  const handleDeleteSelectedRequests = () => {
    if (selectedIds.length === 0) { toast({ title: "선택 필요", variant: "destructive" }); return; }
    const titles = (activeTab === 'all-docs' ? allRequests : approvedRequests).filter((r: any) => selectedIds.includes(r.id)).map((r: any) => r.title || `#${r.id}`);
    setDeleteConfirmDialog({ open: true, ids: [...selectedIds], titles });
  };

  const executeDelete = async () => {
    setIsDeleting(true);
    try {
      if (deleteConfirmDialog.ids.length === 1) {
        await deleteRequestMutation.mutateAsync({ requestId: deleteConfirmDialog.ids[0] });
      } else {
        await deleteMultipleMutation.mutateAsync({ requestIds: deleteConfirmDialog.ids });
      }
      // 인쇄이력에서도 제거
      const newPrintedIds = new Set(printedIds);
      deleteConfirmDialog.ids.forEach(id => newPrintedIds.delete(id));
      savePrintedIds(newPrintedIds);
    } catch {} finally {
      setIsDeleting(false);
      setDeleteConfirmDialog({ open: false, ids: [], titles: [] });
    }
  };

  // 컴팩트 문서 행 렌더링
  const renderDocumentRow = (request: ApprovalRequest, showCheckbox: boolean = true, showDelete: boolean = true) => {
    const isSelected = selectedIds.includes(request.id);
    const isPrinted = printedIds.has(request.id);
    const cat = getCategoryForRequest(request.requestType);
    const catColor = CATEGORY_BADGE_COLORS[cat] || "";
    // ★ 작업일(work_date) 우선 표시: 제목에서 작업일을 추출하고, 없으면 approvedAt/requestedAt 사용
    // 승인 요청이 일괄 생성될 때 approvedAt/requestedAt이 실제 작업일과 다를 수 있음
    const workDateStr = extractDateFromTitle(request.title || "");
    const workDateLabel = workDateStr
      ? (() => { const d = new Date(workDateStr + "T00:00:00"); return d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }); })()
      : null;
    const approvedDate = workDateLabel
      ?? (request.approvedAt ? new Date(request.approvedAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }) : "-");
    const requestedDate = workDateLabel
      ?? (request.requestedAt ? new Date(request.requestedAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }) : "-");

    return (
      <div key={request.id}
        className={`flex items-center gap-2 px-3 py-2 border-b last:border-b-0 hover:bg-accent/40 transition-colors text-sm ${isSelected ? "bg-blue-50/60 dark:bg-blue-950/10" : ""}`}
      >
        {showCheckbox && (
          <button onClick={(e) => { e.stopPropagation(); toggleSelect(request.id); }} className="flex-shrink-0 text-muted-foreground hover:text-blue-600">
            {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
          </button>
        )}

        {/* 인쇄상태 */}
        <div className="flex-shrink-0">
          {isPrinted
            ? <Badge className="bg-green-100 text-green-700 text-[10px] px-1 py-0">완료</Badge>
            : <Badge className="bg-yellow-100 text-yellow-700 text-[10px] px-1 py-0">대기</Badge>
          }
        </div>

        {/* 유형 */}
        <Badge className={`${catColor} text-[10px] px-1 py-0 flex-shrink-0`}>
          {getRequestTypeLabel(request.requestType)}
        </Badge>

        {/* 제목 + 날짜 */}
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate text-sm">{request.title}</div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
            <span className="flex items-center gap-0.5"><CheckCircle className="h-2.5 w-2.5 text-green-500" />{workDateStr ? "작업" : "승인"} {approvedDate}</span>
            {!workDateStr && <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />요청 {requestedDate}</span>}
            <span className="text-gray-300">#{request.id}</span>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDetailDialog({ open: true, request })} title="상세">
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button variant={isPrinted ? "ghost" : "default"} size="sm" className="h-7 px-2 text-xs" onClick={() => handlePrint(request)}>
            <Printer className="h-3 w-3 mr-0.5" />{isPrinted ? "재인쇄" : "인쇄"}
          </Button>
          {showDelete && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500" onClick={() => handleDeleteRequest(request)} title="삭제">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  const renderEmpty = (message: string) => (
    <div className="text-center py-8 text-gray-400">
      <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-50" />
      <p className="text-xs">{message}</p>
    </div>
  );

  const renderSelectionBar = (list: ApprovalRequest[]) => {
    if (list.length === 0) return null;
    const allIds = list.map((r: ApprovalRequest) => r.id);
    const allSelected = allIds.length > 0 && allIds.every((id: number) => selectedIds.includes(id));
    const selectedCount = allIds.filter((id: number) => selectedIds.includes(id)).length;
    return (
      <div className="flex items-center gap-2 py-1.5 px-3 flex-wrap border-b bg-muted/30">
        <button onClick={() => toggleSelectAll(list)} className="text-muted-foreground hover:text-blue-600">
          {allSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
        </button>
        <span className="text-xs text-muted-foreground">전체 ({list.length}건)</span>
        {selectedCount > 0 && (
          <div className="flex gap-1.5 ml-auto">
            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handleDeleteSelectedRequests} disabled={isDeleting}>
              <Trash2 className="h-3 w-3 mr-0.5" />삭제 ({selectedCount})
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleBatchPrintSelected} disabled={isPrinting}>
              <Printer className="h-3 w-3 mr-0.5" />인쇄 ({selectedCount})
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleBatchPrintAll(list)} disabled={isPrinting}>
              <ListChecks className="h-3 w-3 mr-0.5" />전체 ({list.length})
            </Button>
          </div>
        )}
        {selectedCount === 0 && list.length > 0 && (
          <Button size="sm" variant="outline" className="h-7 text-xs ml-auto" onClick={() => handleBatchPrintAll(list)} disabled={isPrinting}>
            <ListChecks className="h-3 w-3 mr-0.5" />전체 인쇄 ({list.length})
          </Button>
        )}
      </div>
    );
  };

  return (
    <DashboardLayout>
    <div className="space-y-4">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Printer className="h-6 w-6 text-blue-600" />문서 출력
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">승인 완료된 문서를 인쇄합니다.</p>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        {[
          { key: "print-queue", icon: Clock, label: "출력대기", count: unprintedRequests.length, color: "yellow", ring: "ring-yellow-400" },
          { key: "ccp", icon: AlertTriangle, label: "CCP", count: ccpFiltered.length, color: "red", ring: "ring-red-400" },
          { key: "prerequisite", icon: Shield, label: "선행/위생", count: prerequisiteFiltered.length, color: "blue", ring: "ring-blue-400" },
          { key: "inspection", icon: ClipboardCheck, label: "검사일지", count: inspectionFiltered.length, color: "purple", ring: "ring-purple-400" },
          { key: "production_log", icon: FileText, label: "생산일지", count: productionLogFiltered.length, color: "teal", ring: "ring-teal-400" },
          { key: "material", icon: Package, label: "원료수불", count: materialFiltered.length, color: "amber", ring: "ring-amber-400" },
          { key: "production", icon: Package, label: "품목제조", count: productionFiltered.length, color: "green", ring: "ring-green-400" },
          { key: "history", icon: History, label: "인쇄이력", count: printedIds.size, color: "gray", ring: "ring-gray-400" },
        ].map(t => (
          <Card key={t.key} className={`cursor-pointer hover:shadow-md transition-all ${activeTab === t.key ? `ring-2 ${t.ring}` : ""}`} onClick={() => { setActiveTab(t.key); setSelectedIds([]); }}>
            <CardContent className="py-3 px-3 flex items-center gap-2">
              <div className={`p-1.5 rounded-lg bg-${t.color}-100 dark:bg-${t.color}-900/30`}>
                <t.icon className={`h-4 w-4 text-${t.color}-600`} />
              </div>
              <div>
                <p className="text-[10px] text-gray-500 leading-tight">{t.label}</p>
                <p className={`text-xl font-bold text-${t.color}-600`}>{t.count}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 필터 */}
      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-0.5"><label className="text-[10px] text-gray-500">시작일</label><Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="w-32 h-8 text-xs" /></div>
          <div className="flex flex-col gap-0.5"><label className="text-[10px] text-gray-500">종료일</label><Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="w-32 h-8 text-xs" /></div>
          <div className="flex flex-col gap-0.5"><label className="text-[10px] text-gray-500">인쇄상태</label>
            <Select value={filterPrintStatus} onValueChange={setFilterPrintStatus}><SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">전체</SelectItem><SelectItem value="unprinted">대기</SelectItem><SelectItem value="printed">완료</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-0.5"><label className="text-[10px] text-gray-500">검색</label><Input placeholder="제목/유형..." value={filterKeyword} onChange={(e) => setFilterKeyword(e.target.value)} className="w-36 h-8 text-xs" onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }} /></div>
          <Button onClick={handleSearch} className="h-8 text-xs"><Search className="h-3 w-3 mr-1" />조회</Button>
          <Button variant="outline" onClick={handleResetFilters} className="h-8 text-xs">초기화</Button>
          <Button variant="ghost" onClick={handleRefresh} className="h-8 text-xs ml-auto"><RefreshCw className="h-3 w-3 mr-1" />새로고침</Button>
        </div>
      </Card>

      {/* 탭 */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSelectedIds([]); }}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="print-queue" className="flex items-center gap-1 text-xs px-2 py-1.5">
            <Clock className="h-3.5 w-3.5" />출력대기
            {unprintedRequests.length > 0 && <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">{unprintedRequests.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="ccp" className="flex items-center gap-1 text-xs px-2 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />CCP
            {ccpFiltered.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{ccpFiltered.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="prerequisite" className="flex items-center gap-1 text-xs px-2 py-1.5">
            <Shield className="h-3.5 w-3.5" />선행/위생
            {prerequisiteFiltered.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{prerequisiteFiltered.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="inspection" className="flex items-center gap-1 text-xs px-2 py-1.5">
            <ClipboardCheck className="h-3.5 w-3.5" />검사일지
            {inspectionFiltered.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{inspectionFiltered.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="production_log" className="flex items-center gap-1 text-xs px-2 py-1.5">
            <FileText className="h-3.5 w-3.5" />생산일지
            {productionLogFiltered.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{productionLogFiltered.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="material" className="flex items-center gap-1 text-xs px-2 py-1.5">
            <Package className="h-3.5 w-3.5" />원료수불
            {materialFiltered.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{materialFiltered.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="production" className="flex items-center gap-1 text-xs px-2 py-1.5">
            <Package className="h-3.5 w-3.5" />품목제조
            {productionFiltered.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{productionFiltered.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1 text-xs px-2 py-1.5">
            <History className="h-3.5 w-3.5" />이력
            {printedIds.size > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{printedIds.size}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="all-docs" className="flex items-center gap-1 text-xs px-2 py-1.5">
            <FileText className="h-3.5 w-3.5" />전체문서
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{allRequests.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* 출력대기 */}
        <TabsContent value="print-queue" className="mt-2">
          <Card>
            <CardContent className="p-0">
              {/* 최근 N일 필터 안내 배너 */}
              <div className="px-3 py-2 border-b bg-blue-50/60 dark:bg-blue-950/20 flex items-center gap-2 flex-wrap text-xs">
                <Clock className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                <span className="text-blue-900 dark:text-blue-300 font-medium">
                  {printQueueShowAll
                    ? `전체 기간 (${unprintedRequests.length}건)`
                    : `최근 ${printQueueRecentDays}일 이내 (${unprintedRequests.length}건)`}
                </span>
                <span className="text-gray-500">
                  · 미인쇄 문서만 · 오래된 문서는 하단 카테고리 탭에서 확인
                </span>
                <div className="flex items-center gap-1 ml-auto">
                  {!printQueueShowAll && (
                    <>
                      <span className="text-gray-500">기간:</span>
                      <Select
                        value={String(printQueueRecentDays)}
                        onValueChange={(v) => setPrintQueueRecentDays(Number(v))}
                      >
                        <SelectTrigger className="w-20 h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">오늘</SelectItem>
                          <SelectItem value="3">3일</SelectItem>
                          <SelectItem value="7">7일</SelectItem>
                          <SelectItem value="14">14일</SelectItem>
                          <SelectItem value="30">30일</SelectItem>
                        </SelectContent>
                      </Select>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant={printQueueShowAll ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setPrintQueueShowAll(!printQueueShowAll)}
                  >
                    {printQueueShowAll ? "최근 필터" : "전체 보기"}
                  </Button>
                </div>
              </div>
              {renderSelectionBar(printQueueFiltered)}
              {printQueueFiltered.length > 0
                ? printQueueFiltered.map((r: ApprovalRequest) => renderDocumentRow(r))
                : renderEmpty(
                    printQueueShowAll
                      ? "출력 대기 문서가 없습니다."
                      : `최근 ${printQueueRecentDays}일 이내 출력 대기 문서가 없습니다. "전체 보기" 로 오래된 문서 확인 가능.`,
                  )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CCP */}
        <TabsContent value="ccp" className="mt-2">
          <Card><CardContent className="p-0">
            {renderSelectionBar(ccpFiltered)}
            {ccpFiltered.length > 0 ? ccpFiltered.map((r: ApprovalRequest) => renderDocumentRow(r)) : renderEmpty("CCP 승인 문서가 없습니다.")}
          </CardContent></Card>
        </TabsContent>

        {/* 선행/위생 */}
        <TabsContent value="prerequisite" className="mt-2">
          <Card><CardContent className="p-0">
            {renderSelectionBar(prerequisiteFiltered)}
            {prerequisiteFiltered.length > 0 ? prerequisiteFiltered.map((r: ApprovalRequest) => renderDocumentRow(r)) : renderEmpty("선행/위생 승인 문서가 없습니다.")}
          </CardContent></Card>
        </TabsContent>

        {/* 품목제조 */}
        <TabsContent value="production" className="mt-2">
          <Card><CardContent className="p-0">
            {renderSelectionBar(productionFiltered)}
            {productionFiltered.length > 0 ? productionFiltered.map((r: ApprovalRequest) => renderDocumentRow(r)) : renderEmpty("품목제조 승인 문서가 없습니다.")}
          </CardContent></Card>
        </TabsContent>

        {/* 검사일지 (육안검사 / 완제품출고검사) */}
        <TabsContent value="inspection" className="mt-2">
          <Card><CardContent className="p-0">
            {renderSelectionBar(inspectionFiltered)}
            {inspectionFiltered.length > 0 ? inspectionFiltered.map((r: ApprovalRequest) => renderDocumentRow(r)) : renderEmpty("승인된 검사일지가 없습니다. (육안검사 / 완제품출고검사)")}
          </CardContent></Card>
        </TabsContent>

        {/* 생산일지 */}
        <TabsContent value="production_log" className="mt-2">
          <Card><CardContent className="p-0">
            {renderSelectionBar(productionLogFiltered)}
            {productionLogFiltered.length > 0 ? productionLogFiltered.map((r: ApprovalRequest) => renderDocumentRow(r)) : renderEmpty("승인된 생산일지가 없습니다.")}
          </CardContent></Card>
        </TabsContent>

        {/* 원료수불 */}
        <TabsContent value="material" className="mt-2">
          <Card><CardContent className="p-0">
            {renderSelectionBar(materialFiltered)}
            {materialFiltered.length > 0 ? materialFiltered.map((r: ApprovalRequest) => renderDocumentRow(r)) : renderEmpty("승인된 원료수불 보고서가 없습니다.")}
          </CardContent></Card>
        </TabsContent>

        {/* 인쇄이력 */}
        <TabsContent value="history" className="mt-2">
          <Card>
            <CardHeader className="pb-2 px-3 pt-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <History className="h-4 w-4 text-gray-600" />인쇄 이력
                  <Badge variant="outline" className="ml-1 text-[10px]">{printedIds.size}건</Badge>
                </CardTitle>
                {printedIds.size > 0 && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={clearPrintHistory}>전체 초기화</Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {printedIds.size > 0 ? (
                <>
                  {sortByDateDesc(approvedRequests.filter((r: ApprovalRequest) => printedIds.has(r.id))).map((r: any) => renderDocumentRow(r, false, true))}
                  {printHistory.length > 0 && (
                    <div className="px-3 py-2 border-t">
                      <h4 className="text-[10px] font-medium text-gray-500 mb-1.5">최근 인쇄 기록</h4>
                      <div className="space-y-1">
                        {printHistory.slice(0, 10).map((h, i) => (
                          <div key={i} className="flex items-center gap-2 text-[10px] text-gray-500 py-0.5">
                            <Printer className="h-2.5 w-2.5" />
                            <span>{new Date(h.date).toLocaleString("ko-KR")}</span>
                            <Badge variant="outline" className="text-[10px] px-1 py-0">{h.count}건</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : renderEmpty("인쇄 이력이 없습니다.")}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 전체 문서 (모든 상태 - 삭제 전용) */}
        <TabsContent value="all-docs" className="mt-2">
          <Card>
            <CardHeader className="pb-2 px-3 pt-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-gray-600" />전체 문서 (모든 상태)
                  <Badge variant="outline" className="ml-1 text-[10px]">{allRequests.length}건</Badge>
                </CardTitle>
                <p className="text-[10px] text-red-500">테스트 데이터 정리용 - 문서를 선택하여 삭제할 수 있습니다</p>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {renderSelectionBar(sortByDateDesc(allRequests))}
              {allRequests.length > 0 ? sortByDateDesc(allRequests).map((r: ApprovalRequest) => {
                const isSelected = selectedIds.includes(r.id);
                const cat = getCategoryForRequest(r.requestType);
                const catColor = CATEGORY_BADGE_COLORS[cat] || "";
                const statusColors: Record<string, string> = {
                  approved: "bg-green-100 text-green-700",
                  pending: "bg-yellow-100 text-yellow-700",
                  pending_review: "bg-orange-100 text-orange-700",
                  pending_approval: "bg-blue-100 text-blue-700",
                  rejected: "bg-red-100 text-red-700",
                  cancelled: "bg-gray-100 text-gray-700",
                };
                const statusLabels: Record<string, string> = {
                  approved: "승인",
                  pending: "대기",
                  pending_review: "검토중",
                  pending_approval: "승인대기",
                  rejected: "거부",
                  cancelled: "취소",
                };
                const dateStr = r.requestedAt ? new Date(r.requestedAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }) : "-";
                return (
                  <div key={r.id}
                    className={`flex items-center gap-2 px-3 py-2 border-b last:border-b-0 hover:bg-accent/40 transition-colors text-sm ${isSelected ? "bg-blue-50/60 dark:bg-blue-950/10" : ""}`}
                  >
                    <button onClick={(e) => { e.stopPropagation(); toggleSelect(r.id); }} className="flex-shrink-0 text-muted-foreground hover:text-blue-600">
                      {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                    </button>
                    <Badge className={`${(r.status && statusColors[r.status]) || "bg-gray-100 text-gray-700"} text-[10px] px-1 py-0 flex-shrink-0`}>
                      {(r.status && statusLabels[r.status]) || r.status}
                    </Badge>
                    <Badge className={`${catColor} text-[10px] px-1 py-0 flex-shrink-0`}>
                      {getRequestTypeLabel(r.requestType)}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-sm">{r.title}</div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{dateStr}</span>
                        <span className="text-gray-300">#{r.id}</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500" onClick={() => handleDeleteRequest(r)} title="삭제">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              }) : renderEmpty("문서가 없습니다.")}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 상세보기 다이얼로그 */}
      <Dialog open={detailDialog.open} onOpenChange={(open) => setDetailDialog({ ...detailDialog, open })}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="text-base flex items-center gap-2"><Eye className="h-5 w-5" />문서 상세</DialogTitle></DialogHeader>
          {detailDialog.request && (
            <div className="space-y-3 py-1 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><label className="text-[10px] text-gray-500">번호</label><p className="text-xs font-medium">#{detailDialog.request.id}</p></div>
                <div><label className="text-[10px] text-gray-500">인쇄</label>
                  <div className="mt-0.5">{printedIds.has(detailDialog.request.id)
                    ? <Badge className="bg-green-100 text-green-700 text-[10px]">완료</Badge>
                    : <Badge className="bg-yellow-100 text-yellow-700 text-[10px]">대기</Badge>}
                  </div>
                </div>
                <div><label className="text-[10px] text-gray-500">유형</label><p className="text-xs">{getRequestTypeLabel(detailDialog.request.requestType)}</p></div>
                <div><label className="text-[10px] text-gray-500">카테고리</label><p className="text-xs capitalize">{getCategoryForRequest(detailDialog.request.requestType)}</p></div>
                <div className="col-span-2"><label className="text-[10px] text-gray-500">제목</label><p className="text-xs font-medium">{detailDialog.request.title}</p></div>
                {detailDialog.request.description && <div className="col-span-2"><label className="text-[10px] text-gray-500">설명</label><p className="text-xs">{detailDialog.request.description}</p></div>}
                <div><label className="text-[10px] text-gray-500">요청일</label><p className="text-xs">{detailDialog.request.requestedAt ? new Date(detailDialog.request.requestedAt).toLocaleString("ko-KR") : "-"}</p></div>
                <div><label className="text-[10px] text-gray-500">승인일</label><p className="text-xs">{detailDialog.request.approvedAt ? new Date(detailDialog.request.approvedAt).toLocaleString("ko-KR") : "-"}</p></div>
              </div>
              {/* 승인 직인 */}
              {(() => {
                if (!detailDialog.request) return null;
                const req = detailDialog.request;
                const cfd = (req as ApprovalRequest & { checklistFormData?: { approval?: { writerName?: string; reviewerName?: string; approverName?: string; reviewerApproved?: boolean; approverApproved?: boolean } } }).checklistFormData;
                const approval = cfd?.approval;
                const docSetting2 = (allApprovalSettings as ApprovalSetting[]).find((s: ApprovalSetting) => s.documentType === req.requestType);
                const empList2 = allEmployees as EmployeeRow[];
                const settingAuthor2 = docSetting2?.authorEmployeeId ? empList2.find((e: EmployeeRow) => e.id === docSetting2.authorEmployeeId)?.name : "";
                const settingReviewer2 = docSetting2?.reviewerEmployeeId ? empList2.find((e: EmployeeRow) => e.id === docSetting2.reviewerEmployeeId)?.name : "";
                const settingApprover2 = docSetting2?.approverEmployeeId ? empList2.find((e: EmployeeRow) => e.id === docSetting2.approverEmployeeId)?.name : "";
                const requesterName = (req as ApprovalRequest & { requester?: { name?: string } }).requester?.name;
                const reviewerNameFromReq = (req as ApprovalRequest & { reviewer?: { name?: string } }).reviewer?.name;
                const approverNameFromReq = (req as ApprovalRequest & { approver?: { name?: string } }).approver?.name;
                const writerName = approval?.writerName || settingAuthor2 || requesterName || "작성자";
                const reviewerName = approval?.reviewerName || settingReviewer2 || reviewerNameFromReq || "검토자";
                const approverName = approval?.approverName || settingApprover2 || approverNameFromReq || "승인자";
                const toDateStr = (d: string | Date | null | undefined) => (d ? (typeof d === "string" ? d : d.toISOString()) : undefined);
                return (
                  <div className="border-t pt-2 flex justify-center">
                    <ApprovalSealRow
                      writer={{ name: writerName, date: toDateStr(req.requestedAt || req.createdAt) }}
                      reviewer={req.reviewedAt || approval?.reviewerApproved ? { name: reviewerName, date: toDateStr(req.reviewedAt || req.approvedAt) } : undefined}
                      approver={req.approvedAt || approval?.approverApproved ? { name: approverName, date: toDateStr(req.approvedAt) } : undefined}
                      size={45}
                    />
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDetailDialog({ open: false, request: null })}>닫기</Button>
            {detailDialog.request && (
              <Button size="sm" onClick={() => { if (detailDialog.request) handlePrint(detailDialog.request); setDetailDialog({ open: false, request: null }); }}>
                <Printer className="h-3.5 w-3.5 mr-1" />인쇄
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={deleteConfirmDialog.open} onOpenChange={(open) => { if (!open) setDeleteConfirmDialog({ open: false, ids: [], titles: [] }); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />문서 삭제 확인
            </DialogTitle>
            <DialogDescription className="text-xs">
              {deleteConfirmDialog.ids.length === 1
                ? "이 문서를 삭제하시겠습니까? 삭제된 데이터는 복구할 수 없습니다."
                : `${deleteConfirmDialog.ids.length}건의 문서를 삭제하시겠습니까? 삭제된 데이터는 복구할 수 없습니다.`}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-40 overflow-y-auto space-y-1 py-2">
            {deleteConfirmDialog.titles.slice(0, 20).map((title, i) => (
              <div key={i} className="text-xs text-gray-600 flex items-center gap-1.5 py-0.5">
                <FileText className="h-3 w-3 text-gray-400 flex-shrink-0" />
                <span className="truncate">{title}</span>
              </div>
            ))}
            {deleteConfirmDialog.titles.length > 20 && (
              <p className="text-xs text-gray-400">...외 {deleteConfirmDialog.titles.length - 20}건</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmDialog({ open: false, ids: [], titles: [] })} disabled={isDeleting}>취소</Button>
            <Button variant="destructive" size="sm" onClick={executeDelete} disabled={isDeleting}>
              {isDeleting ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />삭제 중...</> : <><Trash2 className="h-3.5 w-3.5 mr-1" />삭제 ({deleteConfirmDialog.ids.length})</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 일괄 인쇄 확인 */}
      <Dialog open={batchPrintConfirm} onOpenChange={setBatchPrintConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2"><Printer className="h-5 w-5 text-blue-600" />일괄 인쇄</DialogTitle>
            <DialogDescription className="text-xs">{selectedIds.length}건 일괄 인쇄</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setBatchPrintConfirm(false)}>취소</Button>
            <Button size="sm" onClick={() => { const sel = approvedRequests.filter((r: ApprovalRequest) => selectedIds.includes(r.id)); executeBatchPrint(sel); }} disabled={isPrinting}>
              {isPrinting ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />...</> : <><Printer className="h-3.5 w-3.5 mr-1" />인쇄 ({selectedIds.length})</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
