import { useState, useRef, useCallback } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Download, FileText, AlertCircle, CheckCircle2,
  RefreshCw, Factory, ShieldCheck, Loader2, Info,
  Eye, Printer, ChevronLeft, ChevronRight, Trash2, Send, ArrowLeft, Package, Timer, Calendar
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ApprovalSeal } from "@/components/SealGenerator";

import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

// 2026-04-20 분해: types / Print HTML / Document / Dialog / helpers 를 _productionDailyReport/ 로 이동
import type {
  ReportBatch, ReportSummary, ReportIssue, ReportApprovalInfo, ReportListRow,
} from "./_productionDailyReport/types";
import {
  BatchStatusBadge, ApprovalStatusBadge, generatePrintHTML,
  ProductionDailyDocument, BatchDetailDialog,
  fmtDateTimeFull, safeNum,
} from "./_productionDailyReport/PrintDocument";


// ===========================================================================
// 메인 컴포넌트
// ===========================================================================
export function ProductionDailyReportContent() {
  const L = useIndustryLabel();
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // ---- API ----
  const { data: reportList = [], isLoading: loadingList, refetch: refetchList } = trpc.dailyReport.listReports.useQuery(
    { year: currentYear, month: currentMonth },
    { keepPreviousData: true, refetchOnWindowFocus: true, refetchInterval: 15000 }
  );
  const { data: generatedReport, isLoading: loadingDetail, refetch: refetchDetail } = trpc.dailyReport.getGeneratedReport.useQuery(
    { date: selectedReportId ? (reportList as ReportListRow[]).find((r: ReportListRow) => r.id === selectedReportId)?.reportDate : "" },
    { enabled: !!selectedReportId, refetchOnWindowFocus: true, refetchInterval: selectedReportId ? 20000 : false }
  );
  const regenerateMutation = trpc.dailyReport.regenerateReport.useMutation({
    onSuccess: (r: any) => {
      toast.success(r.message);
      // 즉시 refetch + 500ms 후 한번 더 (DB 반영 시간 고려)
      refetchList();
      if (selectedReportId) refetchDetail();
      setTimeout(() => { refetchList(); if (selectedReportId) refetchDetail(); }, 500);
    },
    onError: (e: { message: string }) => toast.error("생성 실패: " + e.message),
  });
  const submitMutation = trpc.dailyReport.submitForApproval.useMutation({
    onSuccess: (r: any) => {
      toast.success(r.message);
      refetchList();
      if (selectedReportId) refetchDetail();
      setTimeout(() => { refetchList(); }, 500);
    },
    onError: (e: { message: string }) => toast.error("승인 요청 실패: " + e.message),
  });
  const deleteMutation = trpc.dailyReport.deleteReports.useMutation({
    onSuccess: (r: any) => {
      toast.success(r.message);
      setSelectedIds(new Set());
      refetchList();
      setTimeout(() => { refetchList(); }, 500);
    },
    onError: (e: { message: string }) => toast.error("삭제 실패: " + e.message),
  });

  // ---- Detail data ----
  const selectedReport = (reportList as ReportListRow[]).find((r: ReportListRow) => r.id === selectedReportId);
  const rpt = generatedReport?.summary;
  const allBatches = rpt?.production?.batches || [];
  const allIssues = rpt?.issues || [];

  // ---- Month navigation ----
  const prevMonth = () => {
    if (currentMonth === 1) { setCurrentMonth(12); setCurrentYear(y => y - 1); }
    else setCurrentMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 12) { setCurrentMonth(1); setCurrentYear(y => y + 1); }
    else setCurrentMonth(m => m + 1);
  };

  // ---- Selection ----
  const toggleSelect = (id: number) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleSelectAll = () => {
    const ids = (reportList as ReportListRow[]).map((r) => r.id);
    setSelectedIds(prev => prev.size === ids.length ? new Set() : new Set(ids));
  };

  // ---- Print (proper document style) ----
  const handlePrint = useCallback(() => {
    if (!selectedReport || !rpt) return;
    const ai = {
      requesterName: selectedReport.requesterName,
      reviewerName: selectedReport.reviewerName,
      approverName: selectedReport.approverName,
      approvedAt: selectedReport.approvedAt,
      reviewedAt: selectedReport.reviewedAt,
      requestedAt: selectedReport.requestedAt,
    };
    const html = generatePrintHTML(allBatches, rpt, selectedReport.reportDate || "", allIssues, ai);
    const w = window.open("", "_blank");
    if (!w) { toast.error("팝업 차단을 해제해주세요."); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 600);
  }, [selectedReport, rpt, allBatches, allIssues]);

  // ---- Generate today ----
  const today = format(new Date(), "yyyy-MM-dd");

  // ===========================================================================
  // 상세보기 모드 (문서 형태)
  // ===========================================================================
  if (selectedReportId) {
    const isApproved = selectedReport?.approvalStatus === "approved";
    const isPending = selectedReport?.approvalStatus === "pending_review" || selectedReport?.approvalStatus === "pending_approval" || selectedReport?.approvalStatus === "pending";
    const canSubmit = !selectedReport?.approvalStatus && !isPending;
    const canPrint = isApproved;

    return (
      <div className="space-y-4">
        {/* 상단 네비게이션 */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedReportId(null)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> 목록으로
          </Button>
          <div className="flex items-center gap-2">
            {canSubmit && (
              <Button size="sm" onClick={() => submitMutation.mutate({ reportId: selectedReportId })} disabled={submitMutation.isPending}>
                {submitMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                승인 요청
              </Button>
            )}
            {canPrint && (
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-1" /> 출력
              </Button>
            )}
            {canPrint && (
              <Button variant="outline" size="sm" onClick={() => {
                if (!selectedReport || !rpt) return;
                const html = generatePrintHTML(allBatches, rpt, selectedReport.reportDate || "", allIssues, {
                  requesterName: selectedReport.requesterName, reviewerName: selectedReport.reviewerName,
                  approverName: selectedReport.approverName, approvedAt: selectedReport.approvedAt,
                  reviewedAt: selectedReport.reviewedAt, requestedAt: selectedReport.requestedAt,
                });
                const blob = new Blob([html], { type: "text/html" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `생산일지-${selectedReport.reportDate}.html`; a.click();
                URL.revokeObjectURL(url);
                toast.success("다운로드 완료");
              }}>
                <Download className="h-4 w-4 mr-1" /> 다운로드
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => { if (selectedReport) regenerateMutation.mutate({ date: selectedReport.reportDate }); }} disabled={regenerateMutation.isPending}>
              {regenerateMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              갱신
            </Button>
          </div>
        </div>

        {/* 상태 배너 */}
        {selectedReport && (
          <div className={cn(
            "flex items-center gap-3 text-xs rounded-lg p-3 border",
            isApproved ? "bg-green-50/50 border-green-200" : isPending ? "bg-yellow-50/50 border-yellow-200" : "bg-muted/50"
          )}>
            <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="font-medium">{selectedReport.reportDate} 생산일지</span>
            <ApprovalStatusBadge status={selectedReport.approvalStatus} />
            {isApproved && <span className="text-green-600 font-medium flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> 승인완료 - 출력 가능</span>}
            {isPending && <span className="text-yellow-600">승인 처리 대기중</span>}
            {canSubmit && <span className="text-orange-600">승인 요청 후 출력할 수 있습니다</span>}
          </div>
        )}

        {/* 문서 내용 */}
        {loadingDetail ? (
          <div className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />로딩 중...</div>
        ) : (
          <Card className="overflow-hidden shadow-sm border-2">
            <CardContent className="p-0">
              <ProductionDailyDocument
                batches={allBatches}
                summary={rpt}
                dateString={selectedReport?.reportDate || ""}
                issues={allIssues}
                approvalInfo={{
                  requesterName: selectedReport?.requesterName,
                  reviewerName: selectedReport?.reviewerName,
                  approverName: selectedReport?.approverName,
                  approvedAt: selectedReport?.approvedAt,
                  reviewedAt: selectedReport?.reviewedAt,
                  requestedAt: selectedReport?.requestedAt,
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* 배치 리스트 (하단) */}
        {allBatches.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4 text-blue-600" />
                배치 상세 리스트 ({allBatches.length}건)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>배치코드</TableHead><TableHead>제품명</TableHead>
                  <TableHead className="text-right">계획(kg)</TableHead><TableHead className="text-right">실제(kg)</TableHead>
                  <TableHead>상태</TableHead><TableHead>시작</TableHead><TableHead>종료</TableHead>
                  <TableHead>CCP</TableHead>
                  <TableHead className="text-center w-16">상세</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {allBatches.map((b: ReportBatch, idx: number) => (
                    <TableRow key={(b as { batchId?: number }).batchId || b.id || idx} className="hover:bg-muted/50">
                      <TableCell className="text-xs text-muted-foreground">{idx+1}</TableCell>
                      <TableCell className="font-mono font-medium text-sm">{b.batchCode}</TableCell>
                      <TableCell>{b.productName||"-"}</TableCell>
                      <TableCell className="text-right">{safeNum(b.plannedQuantity)}</TableCell>
                      <TableCell className="text-right font-medium">{b.actualQuantity ? safeNum(b.actualQuantity) : "-"}</TableCell>
                      <TableCell><BatchStatusBadge status={b.status ?? ""} /></TableCell>
                      <TableCell className="text-sm">{fmtTime(b.startTime)}</TableCell>
                      <TableCell className="text-sm">{fmtTime(b.endTime)}</TableCell>
                      <TableCell>
                        {(b.ccpDetails || []).length > 0 ? (b.ccpDetails || []).map((c: ReportCcpDetail, ci: number) => (
                          <span key={ci} className={cn(
                            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium mr-1",
                            (c.failCount ?? 0) > 0 ? "bg-red-100 text-red-700" : c.status === "draft" ? "bg-gray-100 text-gray-600" : "bg-green-100 text-green-700"
                          )}>
                            {c.ccpType}
                          </span>
                        )) : <span className="text-xs text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSelectedBatch(b)}><Eye className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <BatchDetailDialog batch={selectedBatch} open={!!selectedBatch} onClose={() => setSelectedBatch(null)} />
      </div>
    );
  }

  // ===========================================================================
  // 리스트 모드 (월별)
  // ===========================================================================
  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Factory className="h-5 w-5 text-blue-600" />
            생산일지 관리
          </h2>
          <p className="text-sm text-muted-foreground mt-1">월별 생산일지 리스트 - 클릭하여 문서 형태 상세보기 및 승인/출력</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => regenerateMutation.mutate({ date: today })} disabled={regenerateMutation.isPending}>
            {regenerateMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            오늘 생성/갱신
          </Button>
          {(reportList as ReportListRow[]).some((r: ReportListRow) => r.needsGeneration) && (
            <Button variant="default" size="sm" onClick={async () => {
              const pendingDates = (reportList as ReportListRow[]).filter((r: ReportListRow) => r.needsGeneration).map((r: ReportListRow) => r.reportDate);
              for (const d of pendingDates) {
                try { regenerateMutation.mutate({ date: d }); } catch {}
              }
            }} disabled={regenerateMutation.isPending}>
              {regenerateMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              미생성 일괄 생성 ({(reportList as ReportListRow[]).filter((r: ReportListRow) => r.needsGeneration).length}건)
            </Button>
          )}
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => {
              if (window.confirm(`${selectedIds.size}건을 삭제하시겠습니까?`))
                deleteMutation.mutate({ ids: Array.from(selectedIds) });
            }} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              선택 삭제 ({selectedIds.size})
            </Button>
          )}
        </div>
      </div>

      {/* 월 네비게이션 */}
      <div className="flex items-center justify-center gap-4">
        <Button variant="ghost" size="icon" onClick={prevMonth}><ChevronLeft className="h-5 w-5" /></Button>
        <span className="text-lg font-bold min-w-[140px] text-center flex items-center justify-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          {currentYear}년 {currentMonth}월
        </span>
        <Button variant="ghost" size="icon" onClick={nextMonth}><ChevronRight className="h-5 w-5" /></Button>
      </div>

      {/* 리스트 테이블 */}
      <Card>
        <CardContent className="p-0">
          {loadingList ? (
            <div className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />로딩 중...</div>
          ) : (reportList as ReportListRow[]).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="font-medium">{currentYear}년 {currentMonth}월 생산일지가 없습니다.</p>
              <p className="text-sm mt-1">[오늘 생성/갱신] 버튼으로 생산일지를 생성하세요.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={selectedIds.size === (reportList as ReportListRow[]).length && (reportList as ReportListRow[]).length > 0} onCheckedChange={toggleSelectAll} />
                  </TableHead>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>작업일</TableHead>
                  <TableHead className="text-center">배치</TableHead>
                  <TableHead className="text-right">계획(kg)</TableHead>
                  <TableHead className="text-right">실제(kg)</TableHead>
                  <TableHead className="text-center">달성률</TableHead>
                  <TableHead className="text-center">CCP</TableHead>
                  <TableHead className="text-center">이상</TableHead>
                  <TableHead className="text-center">승인상태</TableHead>
                  <TableHead className="text-center">생성시각</TableHead>
                  <TableHead className="text-center w-28">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(reportList as ReportListRow[]).map((r: ReportListRow, idx: number) => (
                  <TableRow key={r.id || `pending-${r.reportDate}`} className={cn(
                    "hover:bg-muted/50 cursor-pointer transition-colors",
                    r.needsGeneration && "bg-amber-50/50 border-l-2 border-l-amber-400",
                    selectedIds.has(r.id) && "bg-blue-50/50",
                    r.approvalStatus === "approved" && "bg-green-50/30",
                    (r.approvalStatus === "pending_review" || r.approvalStatus === "pending_approval") && "bg-yellow-50/30"
                  )}>
                    <TableCell onClick={e => e.stopPropagation()}>
                      {!r.needsGeneration && <Checkbox checked={selectedIds.has(r.id)} onCheckedChange={() => toggleSelect(r.id)} />}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-medium" onClick={() => !r.needsGeneration && setSelectedReportId(r.id)}>
                      <div className="flex items-center gap-1.5">
                        <FileText className={`h-4 w-4 shrink-0 ${r.needsGeneration ? "text-amber-500" : "text-blue-500"}`} />
                        {r.reportDate}
                        {r.needsGeneration && <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1 text-amber-600 border-amber-300">미생성</Badge>}
                      </div>
                      {r.productNames && r.productNames.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[280px]" title={r.productNames.join(", ")}>
                          {r.productNames.join(", ")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center" onClick={() => !r.needsGeneration && setSelectedReportId(r.id)}>
                      <span className="font-bold">{r.totalBatches}</span>
                      <span className="text-xs text-muted-foreground ml-0.5">건</span>
                      {r.completedBatches > 0 && <span className="text-xs text-green-600 ml-1">({r.completedBatches}완료)</span>}
                    </TableCell>
                    <TableCell className="text-right" onClick={() => !r.needsGeneration && setSelectedReportId(r.id)}>{safeNum(r.totalPlannedQty)}</TableCell>
                    <TableCell className="text-right font-medium" onClick={() => !r.needsGeneration && setSelectedReportId(r.id)}>{safeNum(r.totalActualQty)}</TableCell>
                    <TableCell className="text-center" onClick={() => !r.needsGeneration && setSelectedReportId(r.id)}>
                      <span className={cn("font-bold", r.achievementRate >= 90 ? "text-green-600" : r.achievementRate >= 50 ? "text-orange-600" : "text-red-600")}>
                        {r.achievementRate}%
                      </span>
                    </TableCell>
                    <TableCell className="text-center" onClick={() => !r.needsGeneration && setSelectedReportId(r.id)}>
                      {r.ccpTotal > 0 ? r.ccpTotal : "-"}
                    </TableCell>
                    <TableCell className="text-center" onClick={() => !r.needsGeneration && setSelectedReportId(r.id)}>
                      {r.issueCount > 0 ? <Badge variant="destructive" className="text-xs">{r.issueCount}</Badge> : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="text-center" onClick={() => !r.needsGeneration && setSelectedReportId(r.id)}>
                      {r.needsGeneration ? <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">일보 미생성</Badge> : <ApprovalStatusBadge status={r.approvalStatus} />}
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground" onClick={() => !r.needsGeneration && setSelectedReportId(r.id)}>
                      {r.generatedAt ? format(new Date(r.generatedAt), "MM-dd HH:mm") : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {r.needsGeneration ? (
                          <Button variant="outline" size="sm" className="h-7 text-xs text-amber-600 border-amber-300 hover:bg-amber-50"
                            onClick={() => regenerateMutation.mutate({ date: r.reportDate })}
                            disabled={regenerateMutation.isPending}>
                            {regenerateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                            생성
                          </Button>
                        ) : (
                          <>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSelectedReportId(r.id)} title="상세보기">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`${r.reportDate} 생산일지를 삭제하시겠습니까?`))
                                deleteMutation.mutate({ ids: [r.id] });
                            }} title="삭제">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Standalone page */
export default function ProductionDailyReport() {
  return (
    <DashboardLayout>
      <ProductionDailyReportContent />
    </DashboardLayout>
  );
}
