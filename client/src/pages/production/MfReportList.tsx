import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Search, FileText, Eye, Edit, Trash2, Plus, Filter, CheckSquare, FileDown, AlertTriangle, Shield, FlaskConical } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ProductionLogsSection from "@/components/production/ProductionLogsSection";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";


import { todayLocal } from "../../lib/dateUtils";

import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

// 2026-04-20 분해: 두 섹션을 _mfReport/ 로 이동
import { CcpMappingSection } from "./_mfReport/CcpMappingSection";
import { DeviationAnalysisSection } from "./_mfReport/DeviationAnalysisSection";

export default function MfReportList({ embedded, ..._ }: { embedded?: boolean; [key: string]: any } = {}) {
  const L = useIndustryLabel();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReport, setSelectedReport] = useState<number | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkAction, setBulkAction] = useState<string>("");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportReportId, setExportReportId] = useState<number | null>(null);
  const [exportMode, setExportMode] = useState<"summary" | "detailed">("summary");

  // 재고 차감 입력
  const [deductDialogOpen, setDeductDialogOpen] = useState(false);
  const [deductReportId, setDeductReportId] = useState<number | null>(null);
  const [batchKg, setBatchKg] = useState(10);
  const [productionDate, setProductionDate] = useState(todayLocal());
  const [producedQuantity, setProducedQuantity] = useState(100);
  const [notes, setNotes] = useState("");

  // 품목제조보고 목록 조회
  const { data: reports, isLoading, refetch } = trpc.mfReport.list.useQuery();
  
  // 일괄 처리 mutation
  const bulkUpdateStatusMutation = trpc.mfReport.bulkUpdateStatus.useMutation({
    onSuccess: () => {
      toast.success("상태가 변경되었습니다");
      refetch();
      setSelectedIds([]);
    },
    onError: () => {
      toast.error("상태 변경에 실패했습니다");
    },
  });
  
  const bulkDeleteMutation = trpc.mfReport.bulkDelete.useMutation({
    onSuccess: () => {
      toast.success("삭제되었습니다");
      refetch();
      setSelectedIds([]);
    },
    onError: () => {
      toast.error("삭제에 실패했습니다");
    },
  });
  
  const bulkExportPdfMutation = trpc.mfReport.bulkExportPdf.useMutation({
    onSuccess: (data: any) => {
      toast.success("PDF가 생성되었습니다");
      // PDF 다운로드 처리
      const blob = new Blob([data as any], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `품목제조보고_일괄_${todayLocal()}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    },
    onError: () => {
      toast.error("PDF 생성에 실패했습니다");
    },
  });

  // 품목제조보고 상세 조회
  const { data: reportDetail, isLoading: isDetailLoading } = trpc.mfReport.getById.useQuery(
    { id: selectedReport! },
    { enabled: !!selectedReport }
  );

  // 품목제조보고 버전 목록 조회
  const { data: versions } = trpc.mfReport.getVersions.useQuery(
    { mfReportId: selectedReport! },
    { enabled: !!selectedReport }
  );

  // 필터링된 목록
  const filteredReports = reports?.filter((report: any) => {
    // 검색어 필터
    const matchesSearch = report.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.reportNo?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // 상태 필터
    const matchesStatus = statusFilter === "ALL" || report.status === statusFilter;
    
    // 날짜 범위 필터
    let matchesDateRange = true;
    if (startDate || endDate) {
      const reportDate = new Date(report.reportDate);
      if (startDate) {
        const start = new Date(startDate);
        matchesDateRange = matchesDateRange && reportDate >= start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchesDateRange = matchesDateRange && reportDate <= end;
      }
    }
    
    return matchesSearch && matchesStatus && matchesDateRange;
  });

  // 선택 토글
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredReports?.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredReports?.map((r: any) => r.id) || []);
    }
  };
  
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };
  
  // 일괄 작업 실행
  const handleBulkAction = () => {
    if (selectedIds.length === 0) {
      toast.error("항목을 선택해주세요");
      return;
    }
    
    if (!bulkAction) {
      toast.error("작업을 선택해주세요");
      return;
    }
    
    if (bulkAction === "delete") {
      if (confirm(`${selectedIds.length}개 항목을 삭제하시겠습니까?`)) {
        bulkDeleteMutation.mutate({ ids: selectedIds });
      }
    } else if (bulkAction === "pdf") {
      bulkExportPdfMutation.mutate({ ids: selectedIds });
    } else {
      bulkUpdateStatusMutation.mutate({ 
        ids: selectedIds, 
        status: bulkAction as "ACTIVE" | "INACTIVE" | "ARCHIVED" 
      });
    }
  };
  
  // 상세 보기
  const handleViewDetail = (reportId: number) => {
    setSelectedReport(reportId);
    setDetailDialogOpen(true);
  };

  // 품목제조보고 수정
  const handleEdit = (reportId: number) => {
    setLocation(`/dashboard/mf-report/modify/${reportId}`);
  };

  // 보정배합비 / 공정매핑 관리
  const handleFormula = (reportId: number) => {
    setLocation(`/dashboard/mf-report/edit/${reportId}`);
  };

  // 배합표 출력
  const handleExportLabel = (reportId: number) => {
    setExportReportId(reportId);
    setExportDialogOpen(true);
  };

  // tRPC utils 사용
  const utils = trpc.useUtils();

  const handleConfirmExport = async () => {
    if (!exportReportId) return;

    try {
      // 최신 버전 ID 조회
      const versions = await utils.mfReport.getVersions.fetch({ mfReportId: exportReportId });
      if (!versions || versions.length === 0) {
        toast.error("버전 정보를 찾을 수 없습니다");
        return;
      }

      const latestVersion = versions[0];
      const result = await utils.mfReport.generateLabel.fetch({
        versionId: latestVersion.id,
        mode: exportMode,
      });

      // Base64 PDF 다운로드
      const pdfBlob = new Blob(
        [Uint8Array.from(atob(result.pdfBase64), c => c.charCodeAt(0))],
        { type: "application/pdf" }
      );
      const url = window.URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `배합표_${exportMode === "summary" ? "요약" : "상세"}_${todayLocal()}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast.success("배합표가 다운로드되었습니다");
      setExportDialogOpen(false);
    } catch (error) {
      toast.error(`배합표 출력 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    }
  };

  // 재고 차감 mutation
  const deductInventoryMutation = trpc.mfReport.deductInventory.useMutation({
    onSuccess: () => {
      toast.success("재고 차감이 완료되었습니다");
      utils.mfReport.list.invalidate();
    },
    onError: (error: { message: string }) => {
      toast.error(`재고 차감 실패: ${error.message}`);
    },
  });

  // 재고 차감 다이얼로그 열기
  const handleDeductInventory = (reportId: number) => {
    setDeductReportId(reportId);
    setDeductDialogOpen(true);
  };

  // 재고 차감 확인
  const handleConfirmDeduct = async () => {
    if (!deductReportId) return;

    try {
      // 최신 버전 ID 조회
      const versions = await utils.mfReport.getVersions.fetch({ mfReportId: deductReportId });
      if (!versions || versions.length === 0) {
        toast.error("버전 정보를 찾을 수 없습니다");
        return;
      }

      const latestVersion = versions[0];
      deductInventoryMutation.mutate({
        versionId: latestVersion.id,
        batchKg,
        productionDate,
        producedQuantity,
        notes: notes || undefined,
      });

      setDeductDialogOpen(false);
    } catch (error) {
      toast.error(`재고 차감 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    }
  };

  // 상태 배지 색상
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <Badge variant="default">활성</Badge>;
      case "INACTIVE":
        return <Badge variant="secondary">비활성</Badge>;
      case "ARCHIVED":
        return <Badge variant="outline">보관</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

    const content = (
      <>
    <div className="container py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">품목제조보고</h1>
          <p className="text-muted-foreground mt-1">제품별 품목제조보고서를 관리합니다</p>
        </div>
        <Button onClick={() => setLocation("/dashboard/mf-report/create")}>
          <Plus className="w-4 h-4 mr-2" />
          신규 등록
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>품목제조보고 목록</CardTitle>
          <CardDescription>등록된 품목제조보고서를 조회하고 관리할 수 있습니다</CardDescription>
        </CardHeader>
        <CardContent className="overflow-visible px-0 sm:px-6">
          {/* 일괄 작업 */}
          {selectedIds.length > 0 && (
            <div className="flex gap-4 items-center mb-4 p-4 bg-muted rounded-lg">
              <span className="text-sm font-medium">
                {selectedIds.length}개 항목 선택됨
              </span>
              <Select value={bulkAction} onValueChange={setBulkAction}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="작업 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">활성으로 변경</SelectItem>
                  <SelectItem value="INACTIVE">비활성으로 변경</SelectItem>
                  <SelectItem value="ARCHIVED">보관으로 변경</SelectItem>
                  <SelectItem value="pdf">PDF 출력</SelectItem>
                  <SelectItem value="delete">삭제</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleBulkAction} disabled={!bulkAction}>
                <CheckSquare className="w-4 h-4 mr-2" />
                실행
              </Button>
              <Button variant="outline" onClick={() => setSelectedIds([])}>
                선택 취소
              </Button>
            </div>
          )}
          
          {/* 검색 및 필터 */}
          <div className="space-y-4 mb-6">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="제품명 또는 보고서 번호로 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <Label htmlFor="status-filter" className="mb-2 block">상태</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger id="status-filter">
                    <SelectValue placeholder="상태 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">전체</SelectItem>
                    <SelectItem value="ACTIVE">활성</SelectItem>
                    <SelectItem value="INACTIVE">비활성</SelectItem>
                    <SelectItem value="ARCHIVED">보관</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex-1">
                <Label htmlFor="start-date" className="mb-2 block">시작 날짜</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              
              <div className="flex-1">
                <Label htmlFor="end-date" className="mb-2 block">종료 날짜</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              
              <Button
                variant="outline"
                onClick={() => {
                  setStatusFilter("ALL");
                  setStartDate("");
                  setEndDate("");
                  setSearchTerm("");
                }}
              >
                <Filter className="w-4 h-4 mr-2" />
                필터 초기화
              </Button>
            </div>
          </div>

          {/* 테이블 */}
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredReports && filteredReports.length > 0 ? (
            <div className="overflow-x-auto -mx-2 sm:mx-0" style={{ WebkitOverflowScrolling: 'touch' }}>
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedIds.length === filteredReports.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>보고서 번호</TableHead>
                  <TableHead>제품명</TableHead>
                  <TableHead>보고일</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>생성일</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReports.map((report: any) => (
                  <TableRow key={report.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(report.id)}
                        onCheckedChange={() => toggleSelect(report.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{report.reportNo}</TableCell>
                    <TableCell>{report.productName || "-"}</TableCell>
                    <TableCell>
                      {report.reportDate ? new Date(report.reportDate).toLocaleDateString("ko-KR") : "-"}
                    </TableCell>
                    <TableCell>{getStatusBadge(report.status || "ACTIVE")}</TableCell>
                    <TableCell>
                      {report.createdAt ? new Date(report.createdAt).toLocaleDateString("ko-KR") : "-"}
                    </TableCell>
                    <TableCell className="text-right"><div className="flex flex-wrap gap-1 justify-end">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetail(report.id)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(report.id)}
                          title="품목제조보고 수정"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleFormula(report.id)}
                          title="보정배합비 / 공정매핑 관리"
                        >
                          <FlaskConical className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleExportLabel(report.id)}
                          title="배합표 출력"
                        >
                          <FileDown className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeductInventory(report.id)}
                          title="재고 차감 실행"
                        >
                          <CheckSquare className="w-4 h-4" />
                        </Button>
                      </div>
                    </div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>등록된 품목제조보고가 없습니다</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setLocation("/dashboard/mf-report/create")}
              >
                <Plus className="w-4 h-4 mr-2" />
                첫 품목제조보고 등록하기
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 상세 보기 다이얼로그 */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>품목제조보고 상세</DialogTitle>
            <DialogDescription>품목제조보고서의 상세 정보를 확인합니다</DialogDescription>
          </DialogHeader>

          {isDetailLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : reportDetail ? (
            <div className="space-y-6">
              {/* 기본 정보 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">보고서 번호</label>
                  <p className="text-base mt-1">{reportDetail.reportNo}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">제품명</label>
                  <p className="text-base mt-1">{reportDetail.productName || "-"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">보고일</label>
                  <p className="text-base mt-1">
                    {reportDetail.reportDate
                      ? new Date(reportDetail.reportDate).toLocaleDateString("ko-KR")
                      : "-"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">상태</label>
                  <div className="mt-1">{getStatusBadge(reportDetail.status || "ACTIVE")}</div>
                </div>
              </div>

              {/* 최신 버전 정보 */}
              {reportDetail.latestVersion && (
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3">최신 버전 정보</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">버전</label>
                      <p className="text-base mt-1">v{reportDetail.latestVersion.versionNo}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">승인 상태</label>
                      <div className="mt-1">
                        {reportDetail.latestVersion.approvalStatus === "APPROVED" ? (
                          <Badge variant="default">승인됨</Badge>
                        ) : reportDetail.latestVersion.approvalStatus === "DRAFT" ? (
                          <Badge variant="secondary">초안</Badge>
                        ) : (
                          <Badge variant="outline">
                            {reportDetail.latestVersion.approvalStatus}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">시행일</label>
                      <p className="text-base mt-1">
                        {new Date(reportDetail.latestVersion.effectiveFrom).toLocaleDateString(
                          "ko-KR"
                        )}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">변경 사유</label>
                      <p className="text-base mt-1">
                        {reportDetail.latestVersion.changeReason || "-"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 배합비 (법적 + 보정) */}
              {reportDetail.ingredients && reportDetail.ingredients.length > 0 && (
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3">배합비 ({reportDetail.ingredients.length}종)</h3>
                  <p className="text-xs text-muted-foreground mb-2">법적 배합비: 식약처 신고용 (정제수 포함) | 보정 배합비: 재고 차감/원료수불용 (정제수 제외)</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-2 font-medium">순번</th>
                          <th className="text-left p-2 font-medium">구분</th>
                          <th className="text-left p-2 font-medium">원재료명</th>
                          <th className="text-right p-2 font-medium">법적 (%)</th>
                          <th className="text-right p-2 font-medium">보정 (%)</th>
                          <th className="text-center p-2 font-medium">차감</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportDetail.ingredients.map((ing: any, idx: number) => {
                          const isWater = ing.materialId === 191;
                          return (
                            <tr key={ing.id || idx} className={`border-b hover:bg-accent/50 ${isWater ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}>
                              <td className="p-2">{ing.lineNo || idx + 1}</td>
                              <td className="p-2">
                                <Badge variant={ing.materialType === "RAW" ? "default" : ing.materialType === "MIXED" ? "secondary" : "outline"}>
                                  {ing.materialType === "RAW" ? "원재료" : ing.materialType === "MIXED" ? "혼합재제" : "부재료"}
                                </Badge>
                              </td>
                              <td className="p-2 font-medium">
                                {ing.materialName || ing.flavorName || `ID: ${ing.materialId}`}
                                {isWater && <span className="ml-1 text-xs text-blue-500">(차감제외)</span>}
                              </td>
                              <td className="p-2 text-right font-mono">{Number(ing.quantity).toFixed(2)}</td>
                              <td className="p-2 text-right font-mono font-semibold">
                                {isWater ? (
                                  <span className="text-muted-foreground">-</span>
                                ) : (
                                  <span className="text-emerald-600 dark:text-emerald-400">
                                    {ing.correctedQuantity ? Number(ing.correctedQuantity).toFixed(2) : Number(ing.quantity).toFixed(2)}
                                  </span>
                                )}
                              </td>
                              <td className="p-2 text-center">{ing.isDeductible ? "✓" : "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 font-semibold">
                          <td colSpan={3} className="p-2 text-right">합계</td>
                          <td className="p-2 text-right font-mono">
                            {reportDetail.ingredients.reduce((sum: number, ing: any) => sum + Number(ing.quantity), 0).toFixed(2)}%
                          </td>
                          <td className="p-2 text-right font-mono text-emerald-600 dark:text-emerald-400">
                            {reportDetail.ingredients
                              .filter((ing: any) => ing.materialId !== 191)
                              .reduce((sum: number, ing: any) => sum + Number(ing.correctedQuantity || ing.quantity), 0).toFixed(2)}%
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* 생산 이력 */}
              {reportDetail.latestVersion && (
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3">생산 이력</h3>
                  <ProductionLogsSection versionId={reportDetail.latestVersion.id} />
                </div>
              )}

              {/* 오차 분석 (배치 학습 기반) */}
              {reportDetail.latestVersion && (
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    오차 분석
                    <Badge variant="outline" className="text-xs font-normal">배치 학습 기반</Badge>
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    실제 배치 생산 데이터를 기반으로 보정 배합비 대비 실제 투입 비율의 오차를 분석합니다.
                    배치가 축적될수록 분석 정확도가 향상됩니다.
                  </p>
                  <DeviationAnalysisSection versionId={reportDetail.latestVersion.id} />
                </div>
              )}
              {/* CCP 매핑 정보 */}
              {reportDetail.productId && (
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    CCP 매핑
                    <Badge variant="outline" className="text-xs font-normal">제품별 CCP 관리</Badge>
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    이 제품에 적용되는 CCP(중요관리점) 타입과 한계기준을 확인하고 수정할 수 있습니다.
                  </p>
                  <CcpMappingSection productId={reportDetail.productId} productName={reportDetail.productName || ""} />
                </div>
              )}
              {/* 버전 이력 */}
              {versions && versions.length > 0 && (
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3">버전 이력 ({versions.length}개)</h3>
                  <div className="space-y-2">
                    {versions.map((version: any) => (
                      <div
                        key={version.id}
                        className="flex justify-between items-center p-2 bg-muted/50 rounded"
                      >
                        <div>
                          <span className="font-medium">v{version.versionNo}</span>
                          <span className="text-sm text-muted-foreground ml-2">
                            {new Date(version.effectiveFrom).toLocaleDateString("ko-KR")}
                          </span>
                        </div>
                        <Badge
                          variant={
                            version.approvalStatus === "APPROVED"
                              ? "default"
                              : version.approvalStatus === "DRAFT"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {version.approvalStatus === "APPROVED"
                            ? "승인됨"
                            : version.approvalStatus === "DRAFT"
                            ? "초안"
                            : version.approvalStatus}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
                  닫기
                </Button>
                <Button onClick={() => handleEdit(reportDetail.id)}>
                  <Edit className="w-4 h-4 mr-2" />
                  수정
                </Button>
                <Button onClick={() => handleFormula(reportDetail.id)} variant="outline">
                  <FlaskConical className="w-4 h-4 mr-2" />
                  보정배합비
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 배합표 출력 다이얼로그 */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>배합표 출력</DialogTitle>
            <DialogDescription>
              출력할 배합표 형식을 선택하세요
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="exportMode">출력 형식</Label>
              <Select value={exportMode} onValueChange={(value: "summary" | "detailed") => setExportMode(value)}>
                <SelectTrigger id="exportMode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="summary">요약형 (원재료 + 중간재)</SelectItem>
                  <SelectItem value="detailed">상세형 (BOM 펼침)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                {exportMode === "summary"
                  ? "요약형: 원재료와 중간재를 그대로 표시합니다."
                  : "상세형: 중간재의 구성 요소를 모두 펼쳐서 표시합니다."}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleConfirmExport}>
                <FileDown className="w-4 h-4 mr-2" />
                다운로드
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 재고 차감 입력 다이얼로그 */}
      <Dialog open={deductDialogOpen} onOpenChange={setDeductDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>재고 차감 실행</DialogTitle>
            <DialogDescription>
              배치 크기, 생산일자, 생산량을 입력하세요
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="batchKg">배치 크기 (kg)</Label>
              <Input
                id="batchKg"
                type="number"
                value={batchKg}
                onChange={(e) => setBatchKg(Number(e.target.value))}
                min={0.01}
                step={0.01}
              />
            </div>
            <div>
              <Label htmlFor="productionDate">생산일자</Label>
              <Input
                id="productionDate"
                type="date"
                value={productionDate}
                onChange={(e) => setProductionDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="producedQuantity">생산량 (개)</Label>
              <Input
                id="producedQuantity"
                type="number"
                value={producedQuantity}
                onChange={(e) => setProducedQuantity(Number(e.target.value))}
                min={1}
                step={1}
              />
            </div>
            <div>
              <Label htmlFor="notes">비고 (선택사항)</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="추가 메모를 입력하세요"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeductDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleConfirmDeduct}>
                재고 차감 실행
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
      </>
    );
    if (embedded) return content;
    return <DashboardLayout>{content}</DashboardLayout>;
}
