import React, { useState, useMemo, useCallback } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import type { RouterOutput } from "@/lib/trpcTypes";
import type { TransactionRow } from "../../lib/transactionGrouping";

// 매출 리스트 도메인 타입 — TransactionRow 기반 (PurchasesList 와 동일 패턴)
type SaleRow = TransactionRow;
type PartnerRow = RouterOutput["partners"]["list"][number];
type SaleGroup = import("../../lib/transactionGrouping").TransactionGroup<SaleRow>;
type GroupPDFInput = { saleIds: number[]; [k: string]: unknown };
type GroupPDFResult = { pdf: string; message?: string; [k: string]: unknown };
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Search,
  FileText,
  Printer,
  Eye,
  Trash2,
  Edit,
  TrendingUp,
  Receipt,
  Calculator,
  Coins,
  RotateCcw,
  BarChart3,
  FileSpreadsheet,
  Upload,
  CheckCircle,
  DollarSign,
  XCircle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import * as XLSX from "xlsx";
import { EditSaleDialog } from "@/components/accounting/EditSaleDialog";
import { useLocation } from "wouter";
import ExcelBulkUploadModal from "@/components/ExcelBulkUploadModal";

import { todayLocal } from "../../lib/dateUtils";
import {
  groupTransactions,
  getAvailableActions,
  STATUS_LABELS,
  STATUS_COLORS,
  type TransactionGroup,
} from "../../lib/transactionGrouping";

export default function SalesList() {
  return (
    <DashboardLayout>
      <SalesListContent />
    </DashboardLayout>
  );
}

function SalesListContent() {
  const [, navigate] = useLocation();
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("all");
  const [itemNameSearch, setItemNameSearch] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editingSale, setEditingSale] = useState<any>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);

  // 매출 상태 일괄 복구 (approved → pending) — 2026-04-21 관리자 유지보수용
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const [bulkRestoreOpen, setBulkRestoreOpen] = useState(false);
  const [bulkRestoreScope, setBulkRestoreScope] = useState<"today" | "last_n_days" | "all_approved">("today");
  const [bulkRestoreDays, setBulkRestoreDays] = useState<number>(7);
  const [bulkRestorePreview, setBulkRestorePreview] = useState<{ affectedCount: number; minDate: string | null; maxDate: string | null; totalAmount: number } | null>(null);

  // ★ 2026-04-13: base64 → Blob 공통 헬퍼
  const base64ToPdfBlob = (b64: string): Blob => {
    const byteCharacters = atob(b64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    return new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
  };

  // 🖨️ 인쇄 — iframe 기반 자동 인쇄 대화상자
  const generatePDFMutation = trpc.haccpIntegration.generateSalePDF.useMutation({
    onSuccess: (data: any) => {
      const blob = base64ToPdfBlob(data.pdf);
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      iframe.src = url;
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (_) {
          window.open(url, "_blank");
        }
      };
      document.body.appendChild(iframe);
      setTimeout(() => {
        try { document.body.removeChild(iframe); URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
      }, 120_000);
      toast({ title: "인쇄", description: "프린트 대화상자를 엽니다." });
    },
    onError: (error: { message: string }) => {
      toast({ title: "인쇄 실패", description: error.message, variant: "destructive" });
    },
  });

  // 👁️ 자세히보기 — 새 탭 미리보기
  const previewPDFMutation = trpc.haccpIntegration.generateSalePDF.useMutation({
    onSuccess: (data: any) => {
      const blob = base64ToPdfBlob(data.pdf);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast({ title: "미리보기", description: "새 탭에서 인쇄/다운로드가 가능합니다." });
    },
    onError: (error: { message: string }) => {
      toast({ title: "미리보기 실패", description: error.message, variant: "destructive" });
    },
  });

  const handlePrintStatement = (saleId: number) => {
    generatePDFMutation.mutate({ saleId });
  };

  const handlePreviewStatement = (saleId: number) => {
    previewPDFMutation.mutate({ saleId });
  };

  // ─── 상태 전환 mutations (2026-04-14 추가) ───────────────
  const postMutation = trpc.inventoryAccounting.productSalePost.useMutation({
    onSuccess: () => {
      toast({ title: "매출 승인 완료", description: "매출이 승인되어 재고 및 회계 원장에 반영되었습니다." });
      refetch();
    },
    onError: (error: { message: string }) => {
      toast({ title: "승인 실패", description: error.message, variant: "destructive" });
    },
  });
  const saleCancelMutation = trpc.inventoryAccounting.productSaleCancel.useMutation({
    onSuccess: () => {
      toast({ title: "매출 취소 완료", description: "매출이 취소되어 재고 및 회계 원장이 롤백되었습니다." });
      refetch();
    },
    onError: (error: { message: string }) => {
      toast({ title: "취소 실패", description: error.message, variant: "destructive" });
    },
  });
  const markReceivedMutation = trpc.inventoryAccounting.saleMarkReceived.useMutation({
    onSuccess: () => {
      toast({ title: "수금 완료 처리", description: "매출이 수금 완료 상태로 전환되었습니다." });
      refetch();
    },
    onError: (error: { message: string }) => {
      toast({ title: "수금 처리 실패", description: error.message, variant: "destructive" });
    },
  });
  const saleRestoreMutation = trpc.inventoryAccounting.saleRestore.useMutation({
    onSuccess: () => {
      toast({ title: "복구 완료", description: "취소된 매출이 대기 상태로 복구되었습니다." });
      refetch();
    },
    onError: (error: { message: string }) => {
      toast({ title: "복구 실패", description: error.message, variant: "destructive" });
    },
  });

  // 매출 상태 일괄 복구 (approved → pending) — 관리자 전용
  const bulkRestoreMutation = trpc.inventoryAccounting.bulkRestoreApprovedToPending.useMutation({
    onSuccess: (data: { dryRun: boolean; affectedCount: number; minDate: string | null; maxDate: string | null; totalAmount: number; message: string }) => {
      if (data.dryRun) {
        setBulkRestorePreview({
          affectedCount: data.affectedCount,
          minDate: data.minDate,
          maxDate: data.maxDate,
          totalAmount: data.totalAmount,
        });
      } else {
        toast({ title: "일괄 복구 완료", description: data.message });
        setBulkRestoreOpen(false);
        setBulkRestorePreview(null);
        refetch();
      }
    },
    onError: (error: { message: string }) => {
      toast({ title: "일괄 복구 실패", description: error.message, variant: "destructive" });
    },
  });

  // ─── 그룹 PDF (2026-04-15 디버그 강화) ───────────────────
  // ★ fallback 제거 — 실패 시 명확한 에러 표시 (디버깅 가능하도록)
  const previewGroupPDFMutation = trpc.haccpIntegration.generateSaleGroupPDF.useMutation({
    onMutate: (variables: GroupPDFInput) => {
      console.log("[generateSaleGroupPDF] 호출:", variables);
    },
    onSuccess: (data: GroupPDFResult, variables: GroupPDFInput) => {
      console.log("[generateSaleGroupPDF] 성공:", { ids: variables?.saleIds, pdfBytes: data.pdf?.length });
      const blob = base64ToPdfBlob(data.pdf);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast({
        title: "거래명세표 미리보기",
        description: `${variables?.saleIds?.length || 0}개 품목 묶음 PDF 가 새 탭에서 열렸습니다.`,
      });
    },
    onError: (error: { message: string }, variables: GroupPDFInput) => {
      console.error("[generateSaleGroupPDF] 실패:", error.message, variables);
      toast({
        title: "거래명세표 그룹 PDF 실패",
        description: `ids=${JSON.stringify(variables?.saleIds)} · ${error.message}`,
        variant: "destructive",
      });
    },
  });
  const printGroupPDFMutation = trpc.haccpIntegration.generateSaleGroupPDF.useMutation({
    onMutate: (variables: GroupPDFInput) => {
      console.log("[printSaleGroupPDF] 호출:", variables);
    },
    onSuccess: (data: GroupPDFResult, variables: GroupPDFInput) => {
      console.log("[printSaleGroupPDF] 성공:", { ids: variables?.saleIds, pdfBytes: data.pdf?.length });
      const blob = base64ToPdfBlob(data.pdf);
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      iframe.src = url;
      iframe.onload = () => {
        try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
        catch (_) { window.open(url, "_blank"); }
      };
      document.body.appendChild(iframe);
      setTimeout(() => { try { document.body.removeChild(iframe); URL.revokeObjectURL(url); } catch (_) { /* ignore */ } }, 120_000);
      toast({
        title: "인쇄",
        description: `${variables?.saleIds?.length || 0}개 품목 묶음 PDF 프린트 대화상자를 엽니다.`,
      });
    },
    onError: (error: { message: string }, variables: GroupPDFInput) => {
      console.error("[printSaleGroupPDF] 실패:", error.message, variables);
      toast({
        title: "거래명세표 그룹 PDF 인쇄 실패",
        description: `ids=${JSON.stringify(variables?.saleIds)} · ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleGroupAction = async (
    group: TransactionGroup,
    action: "approve" | "markReceived" | "cancel" | "restore",
  ) => {
    // ★ 2026-05-16 PR-Q: silent fail 사고 진단 + 방어
    //   사용자 보고: "승인 버튼 클릭해도 아무 반응이 없어. 전에도 동일 문제 해결한 적 있는데 자꾸 반복돼"
    //   가능 원인:
    //     1) postMutation.isPending 이 이전 호출에서 stuck → 버튼 visually-disabled (잘 안 보임)
    //     2) 브라우저가 native confirm() 을 suppress (드물지만 가능)
    //     3) 클릭 핸들러는 호출됐는데 내부 분기에서 silent return
    //   해결:
    //     - 진입 즉시 console.log → DevTools 에서 호출 여부 확인 가능
    //     - 진입 즉시 toast → 사용자가 "버튼이 반응했다"는 것을 시각으로 확인
    //     - 모든 silent return 경로에 로깅 (어디서 빠졌는지 추적 가능)
    // eslint-disable-next-line no-console
    console.log(`[handleGroupAction] start action=${action} groupKey=${group.groupKey} items=${group.items.length} dominantStatus=${group.dominantStatus}`);

    const actionLabels: Record<string, string> = {
      approve: "승인",
      markReceived: "수금 완료 처리",
      cancel: "취소",
      restore: "복구",
    };
    const label = actionLabels[action];

    // ─── 대상/대상외 분리 (2026-05-11 PR-I) ─────────────────
    // 혼재(mixed) 그룹 부분 처리 시, 액션이 가능한 항목만 추려서 진행하고
    // 나머지(이미 다른 상태로 전환된 항목)는 건너뛴다는 점을 사용자에게 명시.
    const targets = group.items.filter((item) =>
      getAvailableActions(item.status, "sale").includes(action),
    );
    const skipped = group.items.filter(
      (item) => !getAvailableActions(item.status, "sale").includes(action),
    );

    if (targets.length === 0) {
      // eslint-disable-next-line no-console
      console.warn(`[handleGroupAction] ${action} 불가 — targets=0 (모든 항목이 다른 상태)`);
      toast({
        title: `${label} 불가`,
        description: "해당 상태의 품목이 없습니다.",
        variant: "destructive",
      });
      return;
    }

    // confirm 메시지 — 혼재 그룹이거나 일부 항목이 대상 외인 경우 명시
    const itemText =
      group.itemCount > 1 ? `${group.itemCount}개 품목` : "이 거래";
    let confirmMsg = `${group.transactionDate} ${group.partnerName} — ${itemText}을(를) ${label}하시겠습니까?`;
    if (skipped.length > 0) {
      confirmMsg += `\n\n· 처리 대상: ${targets.length}건\n· 건너뜀(이미 다른 상태): ${skipped.length}건`;
    }
    // ★ 2026-05-16 PR-Q: window.confirm 명시 호출 + 결과 로깅.
    //   일부 환경 (예: 임베드 / PWA / 자동화 도구) 에서 native confirm 이
    //   suppress 될 수 있는데, 그 때를 위해 명시 호출 + return 값 로깅.
    const confirmed = window.confirm(confirmMsg);
    // eslint-disable-next-line no-console
    console.log(`[handleGroupAction] confirm result=${confirmed} for ${action} (targets=${targets.length})`);
    if (!confirmed) {
      return;
    }

    // 사용자 액션 확인 즉시 토스트 — 처리 중임을 시각 피드백
    toast({
      title: `${label} 처리 중`,
      description: `${targets.length}건 처리 중입니다...`,
    });

    const targetIds = targets.map((item) => item.id);

    // ─── allSettled 로 부분 성공 허용 (2026-05-11 PR-I) ─────
    const runOne = (id: number): Promise<unknown> => {
      switch (action) {
        case "approve":
          return postMutation.mutateAsync({ saleId: id });
        case "markReceived":
          return markReceivedMutation.mutateAsync({ saleId: id });
        case "cancel":
          return saleCancelMutation.mutateAsync({ saleId: id });
        case "restore":
          return saleRestoreMutation.mutateAsync({ saleId: id });
        default:
          return Promise.reject(new Error(`알 수 없는 액션: ${action}`));
      }
    };

    const results = await Promise.allSettled(targetIds.map(runOne));

    const okIds: number[] = [];
    const failures: Array<{ id: number; message: string }> = [];
    results.forEach((res, idx) => {
      const id = targetIds[idx];
      if (res.status === "fulfilled") {
        okIds.push(id);
      } else {
        const reason = res.reason as { message?: string } | Error | undefined;
        const message =
          (reason as Error | undefined)?.message ??
          String(reason ?? "알 수 없는 오류");
        failures.push({ id, message });
        // eslint-disable-next-line no-console
        console.error(`[handleGroupAction] sale#${id} ${action} 실패:`, reason);
      }
    });

    // ─── 결과 토스트: 부분 성공/실패 명시 ──────────────────
    if (failures.length === 0) {
      const desc =
        skipped.length > 0
          ? `${okIds.length}건 처리됨 (건너뜀 ${skipped.length}건)`
          : `${okIds.length}건 처리됨`;
      toast({ title: `그룹 ${label} 완료`, description: desc });
    } else if (okIds.length === 0) {
      const sample = failures.slice(0, 3).map((f) => `#${f.id}: ${f.message}`).join(" / ");
      const more = failures.length > 3 ? ` 외 ${failures.length - 3}건` : "";
      toast({
        title: `그룹 ${label} 실패`,
        description: `${failures.length}건 모두 실패 — ${sample}${more}`,
        variant: "destructive",
      });
    } else {
      const failIds = failures.map((f) => `#${f.id}`).slice(0, 5).join(", ");
      const more = failures.length > 5 ? ` 외 ${failures.length - 5}건` : "";
      toast({
        title: `그룹 ${label} 부분 성공`,
        description: `성공 ${okIds.length}건 / 실패 ${failures.length}건 (${failIds}${more})`,
        variant: "destructive",
      });
    }
  };

  // 삭제 mutation
  const deleteMutation = trpc.haccpIntegration.deleteSale.useMutation({
    onSuccess: () => {
      toast({ title: "삭제 성공", description: "매출 거래가 삭제되었습니다." });
      refetch();
      setSelectedIds([]);
    },
    onError: (error: { message: string }) => {
      toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
    },
  });

  // 거래처 목록 조회
  const { data: partners = [] } = trpc.partners.list.useQuery();

  // 매출 거래 조회
  const { data: sales = [], isLoading, refetch } = trpc.haccpIntegration.getAllSales.useQuery({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    partnerId: selectedPartnerId !== "all" ? parseInt(selectedPartnerId) : undefined,
    itemName: itemNameSearch || undefined,
    status: selectedStatus !== "all" ? selectedStatus : undefined,
  });

  // ─── 거래 그룹화 + 페이지네이션 ─────────────────────────
  // ★ 2026-04-14: sales 선언 뒤로 이동 (TDZ 에러 방지)
  const groupedSales = useMemo(() => groupTransactions(sales as SaleRow[]), [sales]);

  // 그룹 단위 페이지네이션
  const [groupPage, setGroupPage] = useState(1);
  const GROUP_PAGE_SIZE = 25;
  const totalGroupPages = Math.max(1, Math.ceil(groupedSales.length / GROUP_PAGE_SIZE));
  const safeGroupPage = Math.min(groupPage, totalGroupPages);
  const pagedGroupsSales = useMemo(() => {
    const start = (safeGroupPage - 1) * GROUP_PAGE_SIZE;
    return groupedSales.slice(start, start + GROUP_PAGE_SIZE);
  }, [groupedSales, safeGroupPage]);
  const pagedSalesItems = useMemo(
    () => pagedGroupsSales.flatMap((g: SaleGroup) => g.items),
    [pagedGroupsSales],
  );

  // KPI 계산
  const kpiData = useMemo(() => {
    const totalCount = sales.length;
    const totalAmount = sales.reduce((sum: number, s: SaleRow) => sum + parseFloat(String(s.amount ?? "0")), 0);
    const totalTax = sales.reduce((sum: number, s: SaleRow) => sum + parseFloat(String(s.taxAmount ?? "0")), 0);
    const totalSum = totalAmount + totalTax;
    return { totalCount, totalAmount, totalTax, totalSum };
  }, [sales]);

  // ★ 2026-04-14: rowspan-flat 그룹 뷰로 전환하면서 usePaginatedSort 제거
  //   그룹 단위 페이지네이션은 groupedSales + groupPage 로 별도 구현

  // 전체 선택/해제
  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? sales.map((s: SaleRow) => s.id) : []);
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    setSelectedIds(checked ? [...selectedIds, id] : selectedIds.filter((sid) => sid !== id));
  };

  // 필터 초기화
  const handleResetFilters = () => {
    setStartDate("");
    setEndDate("");
    setSelectedPartnerId("all");
    setItemNameSearch("");
    setSelectedStatus("all");
  };

  // 선택 삭제
  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) {
      toast({ title: "선택 항목 없음", description: "삭제할 항목을 선택해주세요.", variant: "destructive" });
      return;
    }
    if (!confirm(`선택한 ${selectedIds.length}개 항목을 삭제하시겠습니까?`)) return;
    Promise.all(selectedIds.map((id) => deleteMutation.mutateAsync({ id })))
      .then(() => {
        toast({ title: "삭제 완료", description: `${selectedIds.length}개 항목이 삭제되었습니다.` });
        setSelectedIds([]);
        refetch();
      })
      .catch((error) => {
        toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
      });
  };

  // 선택 다운로드
  const handleDownloadSelected = () => {
    if (selectedIds.length === 0) {
      toast({ title: "선택 항목 없음", description: "다운로드할 항목을 선택해주세요.", variant: "destructive" });
      return;
    }
    const selected = sales.filter((s: SaleRow) => selectedIds.includes(s.id));
    downloadExcel(selected, "선택 매출조회", `선택_매출조회_${todayLocal()}.xlsx`);
  };

  // 전체 다운로드
  const handleExcelDownload = () => {
    if (sales.length === 0) {
      toast({ title: "데이터 없음", description: "다운로드할 데이터가 없습니다.", variant: "destructive" });
      return;
    }
    downloadExcel(sales, "매출조회", `매출조회_${todayLocal()}.xlsx`);
  };

  // 자동생성 안내 문구(예: "제품출고 자동생성...") 는 비고에 표시하지 않음
  const cleanNote = (n: unknown): string => {
    const s = String(n || "").trim();
    if (!s) return "-";
    if (/^제품출고\s*자동생성/.test(s) || /\(B2[BC]\s*임포트\)/.test(s)) return "-";
    return s;
  };

  const downloadExcel = (data: SaleRow[], sheetName: string, fileName: string) => {
    const excelData = data.map((s: SaleRow) => ({
      거래일자: new Date(s.transactionDate).toLocaleDateString("ko-KR"),
      거래처명: s.partnerName || "-",
      품목명: s.itemName || "-",
      수량: s.quantity || 0,
      단가: s.unitPrice || 0,
      금액: s.amount || 0,
      세금: s.taxAmount || 0,
      합계: parseFloat(String(s.amount ?? "0")) + parseFloat(String(s.taxAmount ?? "0")),
      증빙유형: getProofLabel(s.proofType),
      상태: getStatusLabel(s.status),
      비고: cleanNote(s.notes),
    }));
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, fileName);
    toast({ title: "다운로드 완료", description: "엑셀 파일이 다운로드되었습니다." });
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending: "대기 중", approved: "승인됨", received: "수금 완료", cancelled: "취소됨",
    };
    return map[status] || "-";
  };

  const getProofLabel = (type: string) => {
    const map: Record<string, string> = {
      tax_invoice: "세금계산서", receipt: "영수증", statement: "거래명세서", none: "없음",
    };
    return map[type] || "-";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50">대기 중</Badge>;
      case "approved":
        return <Badge variant="default" className="bg-blue-100 text-blue-700 border-blue-200">승인됨</Badge>;
      case "received":
        return <Badge variant="default" className="bg-green-100 text-green-700 border-green-200">수금 완료</Badge>;
      case "cancelled":
        return <Badge variant="destructive">취소됨</Badge>;
      default:
        return <Badge variant="outline">-</Badge>;
    }
  };

  const getProofBadge = (type: string) => {
    switch (type) {
      case "tax_invoice":
        return <Badge variant="outline" className="text-indigo-600 border-indigo-200 bg-indigo-50 text-xs">세금계산서</Badge>;
      case "receipt":
        return <Badge variant="outline" className="text-teal-600 border-teal-200 bg-teal-50 text-xs">영수증</Badge>;
      case "statement":
        return <Badge variant="outline" className="text-purple-600 border-purple-200 bg-purple-50 text-xs">거래명세서</Badge>;
      case "none":
        return <Badge variant="outline" className="text-xs">없음</Badge>;
      default:
        return <span className="text-sm text-muted-foreground">-</span>;
    }
  };

  const formatCurrency = (value: string | number) => {
    const num = typeof value === "string" ? parseFloat(value) : value;
    return isNaN(num) ? "0" : num.toLocaleString();
  };

  return (
    <>
      <div className="space-y-6">
        {/* 페이지 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">매출 조회</h1>
              <p className="text-sm text-muted-foreground">매출 거래 내역을 조회하고 관리합니다.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button
                onClick={() => { setBulkRestoreOpen(true); setBulkRestorePreview(null); }}
                variant="outline"
                size="sm"
                className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                title="approved → pending 일괄 복구 (관리자 유지보수)"
              >
                상태 일괄 복구
              </Button>
            )}
            <Button onClick={() => setBulkUploadOpen(true)} variant="outline" size="sm" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              엑셀 일괄등록
            </Button>
          </div>
        </div>

        {/* KPI 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">총 건수</p>
                  <p className="text-2xl font-bold">{kpiData.totalCount}<span className="text-sm font-normal text-muted-foreground ml-1">건</span></p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                  <BarChart3 className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">총 금액</p>
                  <p className="text-2xl font-bold">{formatCurrency(kpiData.totalAmount)}<span className="text-sm font-normal text-muted-foreground ml-1">원</span></p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-500">
                  <Receipt className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">총 세금</p>
                  <p className="text-2xl font-bold">{formatCurrency(kpiData.totalTax)}<span className="text-sm font-normal text-muted-foreground ml-1">원</span></p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-500">
                  <Calculator className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-violet-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">총 합계</p>
                  <p className="text-2xl font-bold text-violet-600">{formatCurrency(kpiData.totalSum)}<span className="text-sm font-normal text-muted-foreground ml-1">원</span></p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-50 text-violet-500">
                  <Coins className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 필터 카드 */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-4 w-4" />
                조회 조건
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={handleResetFilters} className="text-muted-foreground hover:text-foreground">
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                초기화
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">시작일</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">종료일</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">거래처</Label>
                <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
                  <SelectTrigger><SelectValue placeholder="전체" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {partners.map((p: PartnerRow) => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.companyName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">품목명</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="품목명 검색" value={itemNameSearch} onChange={(e) => setItemNameSearch(e.target.value)} className="pl-8" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">상태</Label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger><SelectValue placeholder="전체" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="pending">대기 중</SelectItem>
                    <SelectItem value="approved">승인됨</SelectItem>
                    <SelectItem value="received">수금 완료</SelectItem>
                    <SelectItem value="cancelled">취소됨</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 액션 버튼 영역 */}
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleDownloadSelected} disabled={selectedIds.length === 0}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  선택 다운로드 ({selectedIds.length})
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDeleteSelected} disabled={selectedIds.length === 0}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  선택 삭제 ({selectedIds.length})
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={handleExcelDownload}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                전체 다운로드
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 테이블 카드 */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" />
                매출 거래 내역
              </CardTitle>
              <span className="text-sm text-muted-foreground">
                총 {sales.length.toLocaleString()}개 품목 · {groupedSales.length.toLocaleString()}건 거래
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-muted/50 rounded-md animate-pulse" />
                ))}
              </div>
            ) : sales.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <TrendingUp className="h-12 w-12 mb-4 opacity-30" />
                <p className="text-base font-medium">조회된 매출 거래가 없습니다.</p>
                <p className="text-sm mt-1">필터 조건을 변경하거나 새로운 거래를 등록해주세요.</p>
              </div>
            ) : (
              <>
              {/* 거래 / 품목 수 요약 */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-xs text-muted-foreground">
                  총 <span className="font-semibold text-foreground">{groupedSales.length}</span>건 거래 ·{" "}
                  <span className="font-semibold text-foreground">{sales.length}</span>개 품목
                </div>
              </div>

              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-[44px]">
                        <Checkbox
                          checked={pagedSalesItems.length > 0 && pagedSalesItems.every((s: SaleRow) => selectedIds.includes(s.id))}
                          onCheckedChange={(checked) => setSelectedIds(checked ? pagedSalesItems.map((s: SaleRow) => s.id) : [])}
                        />
                      </TableHead>
                      <TableHead className="text-xs font-semibold">거래일자</TableHead>
                      <TableHead className="text-xs font-semibold">거래처명</TableHead>
                      <TableHead className="text-xs font-semibold">품목명</TableHead>
                      <TableHead className="text-xs font-semibold text-right">수량</TableHead>
                      <TableHead className="text-xs font-semibold text-right">단가</TableHead>
                      <TableHead className="text-xs font-semibold text-right">금액</TableHead>
                      <TableHead className="text-xs font-semibold text-right">세금</TableHead>
                      <TableHead className="text-xs font-semibold text-right">합계</TableHead>
                      <TableHead className="text-xs font-semibold">증빙</TableHead>
                      <TableHead className="text-xs font-semibold">상태</TableHead>
                      <TableHead className="text-xs font-semibold text-center">액션</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* 거래별 그룹화 rowspan-flat 렌더 (2026-04-14 재설계) */}
                    {pagedGroupsSales.map((group: SaleGroup, groupIdx: number) => {
                      const groupBgClass = groupIdx % 2 === 0 ? "" : "bg-slate-50/40";
                      const availableGroupActions = getAvailableActions(group.dominantStatus, "sale");
                      const statusLabel = STATUS_LABELS[group.dominantStatus] || group.dominantStatus;
                      const statusColor = STATUS_COLORS[group.dominantStatus] || "";
                      const isMultiItem = group.items.length > 1;
                      // ★ 2026-04-22: B2C 회계 제외 매출은 수금 버튼 숨김 (플랫폼 정산으로 처리)
                      const groupAllExcluded = group.items.every(
                        (it: any) => it.accountingExcluded === 1 || it.accountingExcluded === true
                      );

                      return group.items.map((sale: SaleRow, itemIdx: number) => {
                        const isFirst = itemIdx === 0;
                        const amount = parseFloat(String(sale.amount ?? "0"));
                        const tax = parseFloat(String(sale.taxAmount ?? "0"));
                        const itemActions = getAvailableActions(sale.status, "sale");

                        return (
                          <TableRow
                            key={`${group.groupKey}-${sale.id}`}
                            className={`group hover:bg-muted/20 ${groupBgClass}`}
                          >
                            <TableCell>
                              <Checkbox
                                checked={selectedIds.includes(sale.id)}
                                onCheckedChange={(checked) => handleSelectOne(sale.id, checked as boolean)}
                              />
                            </TableCell>
                            <TableCell className="text-sm whitespace-nowrap">
                              {isFirst && new Date(group.transactionDate).toLocaleDateString("ko-KR")}
                            </TableCell>
                            <TableCell className="text-sm">
                              {isFirst && (
                                <>
                                  <div className="font-medium">{group.partnerName}</div>
                                  {isMultiItem && (
                                    <div className="text-[10px] text-muted-foreground mt-0.5">
                                      [{group.itemCount}건] 총 {formatCurrency(group.grandTotal)}
                                    </div>
                                  )}
                                </>
                              )}
                            </TableCell>
                            <TableCell className="text-sm max-w-[160px] truncate">
                              {isMultiItem && !isFirst && <span className="text-muted-foreground mr-1">└</span>}
                              {sale.itemName || "-"}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {parseFloat(String(sale.quantity ?? "0")).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {formatCurrency(sale.unitPrice || "0")}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {formatCurrency(amount)}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums text-muted-foreground">
                              {formatCurrency(tax)}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums font-semibold">
                              {formatCurrency(amount + tax)}
                            </TableCell>
                            <TableCell>
                              {isFirst ? (
                                group.evidenceNumber ? (
                                  <Badge variant="outline" className="text-xs">{group.evidenceNumber}</Badge>
                                ) : getProofBadge(sale.proofType)
                              ) : ""}
                            </TableCell>
                            <TableCell>
                              {isFirst ? (
                                <Badge variant="outline" className={`${statusColor} text-xs`}>
                                  {statusLabel}
                                  {group.isMixed && <span className="ml-1">⚠</span>}
                                </Badge>
                              ) : ""}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                {isFirst ? (
                                  <>
                                    {availableGroupActions.includes("approve") && (
                                      // ★ PR-Q (2026-05-16): disabled=isPending 제거 — Promise.allSettled 로
                                      //   여러 호출을 다루는데 useMutation 의 isPending 이 마지막 mutation 만 추적해서
                                      //   불완전. handleGroupAction 자체가 reentrancy 안전하므로 disabled 불필요.
                                      <Button size="sm" variant="default"
                                        onClick={() => {
                                          // eslint-disable-next-line no-console
                                          console.log(`[ApproveBtn] click groupKey=${group.groupKey} dominantStatus=${group.dominantStatus} items=${group.items.length}`);
                                          handleGroupAction(group, "approve");
                                        }}
                                        title={isMultiItem ? "그룹 전체 승인" : "승인"}
                                        className="h-7 w-7 p-0 bg-blue-600 hover:bg-blue-700">
                                        <CheckCircle className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                    {availableGroupActions.includes("markReceived") && !groupAllExcluded && (
                                      <Button size="sm" variant="default"
                                        onClick={() => handleGroupAction(group, "markReceived")}
                                        disabled={markReceivedMutation.isPending}
                                        title={isMultiItem ? "그룹 전체 수금 완료" : "수금 완료"}
                                        className="h-7 w-7 p-0 bg-emerald-600 hover:bg-emerald-700">
                                        <DollarSign className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                    {groupAllExcluded && (
                                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-[9px]" title="B2C 전자상거래 — 수금은 [플랫폼 정산] 메뉴 이용">
                                        회계제외
                                      </Badge>
                                    )}
                                    {availableGroupActions.includes("restore") && (
                                      <Button size="sm" variant="outline"
                                        onClick={() => handleGroupAction(group, "restore")}
                                        disabled={saleRestoreMutation.isPending}
                                        title={isMultiItem ? "그룹 전체 복구" : "복구"}
                                        className="h-7 w-7 p-0 text-amber-600">
                                        <RotateCcw className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                    {/* 거래명세표 PDF — 그룹 묶음 (2026-04-15 가시화) */}
                                    <Button size="sm" variant="outline"
                                      onClick={() => {
                                        const ids = group.items.map((i: SaleRow) => i.id);
                                        console.log(`[매출 그룹 PDF 미리보기 클릭] group.items.length=${group.items.length}, ids=${JSON.stringify(ids)}`, group);
                                        toast({
                                          title: `📄 ${ids.length}개 품목 묶음 PDF 생성 중`,
                                          description: `ids=${JSON.stringify(ids)}`,
                                        });
                                        previewGroupPDFMutation.mutate({ saleIds: ids });
                                      }}
                                      disabled={previewGroupPDFMutation.isPending}
                                      title={`거래명세표 미리보기 (${group.items.length}개 품목)`} className="h-7 w-7 p-0">
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="sm" variant="outline"
                                      onClick={() => {
                                        const ids = group.items.map((i: SaleRow) => i.id);
                                        console.log(`[매출 그룹 PDF 인쇄 클릭] group.items.length=${group.items.length}, ids=${JSON.stringify(ids)}`, group);
                                        toast({
                                          title: `🖨️ ${ids.length}개 품목 묶음 인쇄 중`,
                                          description: `ids=${JSON.stringify(ids)}`,
                                        });
                                        printGroupPDFMutation.mutate({ saleIds: ids });
                                      }}
                                      disabled={printGroupPDFMutation.isPending}
                                      title={`거래명세표 인쇄 (${group.items.length}개 품목)`} className="h-7 w-7 p-0">
                                      <Printer className="h-3.5 w-3.5" />
                                    </Button>
                                    {availableGroupActions.includes("cancel") && (
                                      <Button size="sm" variant="outline"
                                        onClick={() => handleGroupAction(group, "cancel")}
                                        disabled={saleCancelMutation.isPending}
                                        title={isMultiItem ? "그룹 전체 취소" : "취소"}
                                        className="h-7 w-7 p-0 text-zinc-500 hover:bg-zinc-100">
                                        <XCircle className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                  </>
                                ) : null}
                                {/* 품목 단위 액션 */}
                                {itemActions.includes("edit") && (
                                  <Button size="sm" variant="outline"
                                    onClick={() => { setEditingSale(sale); setIsEditDialogOpen(true); }}
                                    title="품목 수정" className="h-7 w-7 p-0">
                                    <Edit className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                {itemActions.includes("delete") && (
                                  <Button size="sm" variant="outline"
                                    onClick={() => { if (confirm("이 거래를 삭제하시겠습니까?")) deleteMutation.mutate({ id: sale.id }); }}
                                    title="품목 삭제" className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      });
                    })}
                  </TableBody>
                </Table>
              </div>
              {/* 그룹 단위 페이지네이션 */}
              {totalGroupPages > 1 && (
                <div className="flex items-center justify-between pt-3">
                  <p className="text-sm text-muted-foreground">
                    {((safeGroupPage - 1) * GROUP_PAGE_SIZE) + 1}–{Math.min(safeGroupPage * GROUP_PAGE_SIZE, groupedSales.length)}건 /
                    총 {groupedSales.length}건 거래
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                      onClick={() => setGroupPage(1)} disabled={safeGroupPage <= 1} title="첫 페이지">«
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                      onClick={() => setGroupPage(safeGroupPage - 1)} disabled={safeGroupPage <= 1} title="이전">‹
                    </Button>
                    <span className="text-sm px-2 tabular-nums">{safeGroupPage} / {totalGroupPages}</span>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                      onClick={() => setGroupPage(safeGroupPage + 1)} disabled={safeGroupPage >= totalGroupPages} title="다음">›
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                      onClick={() => setGroupPage(totalGroupPages)} disabled={safeGroupPage >= totalGroupPages} title="마지막">»
                    </Button>
                  </div>
                </div>
              )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 수정 다이얼로그 */}
      {editingSale && (
        <EditSaleDialog
          sale={editingSale}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          onSuccess={() => { refetch(); setEditingSale(null); }}
        />
      )}

      {/* 엑셀 일괄등록 모달 */}
      <ExcelBulkUploadModal
        open={bulkUploadOpen}
        onOpenChange={setBulkUploadOpen}
        mode="sale"
      />

      {/* 매출 상태 일괄 복구 다이얼로그 (관리자 전용, 2026-04-21) */}
      {bulkRestoreOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-lg p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">매출 상태 일괄 복구</h2>
              <p className="text-sm text-muted-foreground mt-1">
                <span className="font-semibold text-amber-700">approved → pending</span> 으로 일괄 전환합니다.
                복구 후 각 매출을 승인 버튼으로 다시 처리해야 재고/LOT/분개가 반영됩니다.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs mb-1.5 block">대상 범위</Label>
                <Select
                  value={bulkRestoreScope}
                  onValueChange={(v: any) => { setBulkRestoreScope(v); setBulkRestorePreview(null); }}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">오늘 생성된 건만</SelectItem>
                    <SelectItem value="last_n_days">최근 N일</SelectItem>
                    <SelectItem value="all_approved">전체 approved 건</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {bulkRestoreScope === "last_n_days" && (
                <div>
                  <Label className="text-xs mb-1.5 block">일 수</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={bulkRestoreDays}
                    onChange={(e) => { setBulkRestoreDays(Number(e.target.value) || 7); setBulkRestorePreview(null); }}
                    className="h-9"
                  />
                </div>
              )}

              {bulkRestorePreview && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm space-y-1">
                  <div className="font-semibold text-amber-800">미리보기 결과</div>
                  <div>영향 건수: <span className="font-bold">{bulkRestorePreview.affectedCount}건</span></div>
                  {bulkRestorePreview.affectedCount > 0 && (
                    <>
                      <div>거래일자: {bulkRestorePreview.minDate} ~ {bulkRestorePreview.maxDate}</div>
                      <div>총 금액: ₩{bulkRestorePreview.totalAmount.toLocaleString()}</div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setBulkRestoreOpen(false); setBulkRestorePreview(null); }}
                disabled={bulkRestoreMutation.isPending}
              >
                취소
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => bulkRestoreMutation.mutate({
                  scope: bulkRestoreScope,
                  days: bulkRestoreScope === "last_n_days" ? bulkRestoreDays : undefined,
                  dryRun: true,
                })}
                disabled={bulkRestoreMutation.isPending}
              >
                {bulkRestoreMutation.isPending ? "조회 중..." : "미리보기"}
              </Button>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => {
                  if (!bulkRestorePreview || bulkRestorePreview.affectedCount === 0) return;
                  if (!window.confirm(`정말 ${bulkRestorePreview.affectedCount}건을 pending 으로 복구하시겠습니까?`)) return;
                  bulkRestoreMutation.mutate({
                    scope: bulkRestoreScope,
                    days: bulkRestoreScope === "last_n_days" ? bulkRestoreDays : undefined,
                    dryRun: false,
                  });
                }}
                disabled={bulkRestoreMutation.isPending || !bulkRestorePreview || bulkRestorePreview.affectedCount === 0}
              >
                실제 복구
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
