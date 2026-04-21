import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Wrench, Plus, Eye, Download, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

import { formatLocalDate, todayLocal } from "../../lib/dateUtils";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

export default function CorrectiveAction() {
  const L = useIndustryLabel();
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<any>(null);

  // 데이터 조회
  const { data: actionList, isLoading, refetch } = trpc.correctiveAction.listByStatus.useQuery(
    { status: selectedStatus === "all" ? "open" : selectedStatus as any },
    { enabled: selectedStatus !== "all" }
  );

  const { data: allActions } = trpc.correctiveAction.listByStatus.useQuery({ status: "open" });

  // 생성 mutation
  const createMutation = trpc.correctiveAction.create.useMutation({
    onSuccess: () => {
      alert("시정 조치가 성공적으로 등록되었습니다.");
      setIsCreateOpen(false);
      refetch();
    },
    onError: (error: { message: string }) => {
      alert(`등록 실패: ${error.message}`);
    },
  });

  // 즉시 조치 등록
  const immediateActionMutation = trpc.correctiveAction.recordImmediateAction.useMutation({
    onSuccess: () => {
      alert("즉시 조치가 등록되었습니다.");
      refetch();
    },
  });

  // 근본 원인 분석
  const rootCauseAnalysisMutation = trpc.correctiveAction.recordRootCause.useMutation({
    onSuccess: () => {
      alert("근본 원인 분석이 등록되었습니다.");
      refetch();
    },
  });

  // 시정 조치 실행
  const correctiveActionMutation = trpc.correctiveAction.recordCorrectiveAction.useMutation({
    onSuccess: () => {
      alert("시정 조치가 실행되었습니다.");
      refetch();
    },
  });

  // 효과 검증
  const verificationMutation = trpc.correctiveAction.verifyEffectiveness.useMutation({
    onSuccess: () => {
      alert("효과 검증이 완료되었습니다.");
      refetch();
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    createMutation.mutate({
      sourceType: "other",
      batchId: Number(formData.get("batchId")) || undefined,
      ccpInstanceId: Number(formData.get("ccpRecordId")) || undefined,
      problemDescription: formData.get("issueDescription") as string,
      occurredAt: formData.get("occurredAt") as string,
      priority: formData.get("priority") as "low" | "medium" | "high" | "critical",
    });
  };

  const handleDownloadReport = () => {
    const actions = selectedStatus === "all" ? allActions : actionList;
    if (!actions || actions.length === 0) {
      alert("보고서를 생성할 데이터가 없습니다.");
      return;
    }

    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text("Corrective Action Report", 105, 20, { align: "center" });
    
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString("ko-KR")}`, 20, 30);
    doc.text(`Status Filter: ${selectedStatus}`, 20, 36);
    
    let yPos = 46;
    actions.forEach((action: any, index: number) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(12);
      doc.text(`${index + 1}. CAR-${action.id}`, 20, yPos);
      yPos += 7;
      
      doc.setFontSize(9);
      doc.text(`Issue: ${action.issueDescription.substring(0, 80)}`, 25, yPos);
      yPos += 5;
      doc.text(`Priority: ${action.priority}`, 25, yPos);
      yPos += 5;
      doc.text(`Status: ${action.status}`, 25, yPos);
      yPos += 5;
      doc.text(`Occurred: ${new Date(action.occurredAt).toLocaleDateString()}`, 25, yPos);
      yPos += 5;
      if (action.immediateAction) {
        doc.text(`Immediate Action: ${action.immediateAction.substring(0, 60)}`, 25, yPos);
        yPos += 5;
      }
      if (action.rootCause) {
        doc.text(`Root Cause: ${action.rootCause.substring(0, 60)}`, 25, yPos);
        yPos += 5;
      }
      yPos += 5;
    });
    
    doc.save(`corrective-action-report-${todayLocal()}.pdf`);
    alert("보고서가 성공적으로 다운로드되었습니다.");
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string; icon: any }> = {
      open: { variant: "destructive", label: "열림", icon: AlertCircle },
      investigating: { variant: "secondary", label: "조사 중", icon: Clock },
      action_taken: { variant: "default", label: "조치 완료", icon: CheckCircle2 },
      verifying: { variant: "outline", label: "검증 중", icon: Clock },
      closed: { variant: "secondary", label: "종료", icon: CheckCircle2 },
    };
    const config = variants[status] || variants.open;
    const Icon = config.icon;
    return (
    <DashboardLayout>

      <Badge variant={config.variant} className="flex items-center gap-1 w-fit">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    
    </DashboardLayout>
  );
  };

  const getPriorityBadge = (priority: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      low: "secondary",
      medium: "default",
      high: "destructive",
      critical: "destructive",
    };
    return (
      <Badge variant={variants[priority] || "default"}>
        {priority === "low" && "낮음"}
        {priority === "medium" && "중간"}
        {priority === "high" && "높음"}
        {priority === "critical" && "긴급"}
      </Badge>
    );
  };

  const displayList = selectedStatus === "all" ? allActions : actionList;

  if (isLoading && selectedStatus !== "all") {
    return <div className="p-6">로딩 중...</div>;
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Wrench className="h-8 w-8" />
            시정 조치 관리
          </h1>
          <p className="text-muted-foreground mt-2">
            CCP 이탈 발생 시 즉시 시정 조치를 등록하고 효과를 검증합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownloadReport}>
            <Download className="mr-2 h-4 w-4" />
            보고서 다운로드
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            시정 조치 등록
          </Button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">전체</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allActions?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">열림</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {allActions?.filter((a: any) => a.status === "open").length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">조사 중</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {allActions?.filter((a: any) => a.status === "investigating").length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">조치 완료</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {allActions?.filter((a: any) => a.status === "action_taken").length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">종료</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {allActions?.filter((a: any) => a.status === "closed").length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 상태 필터 */}
      <Card>
        <CardHeader>
          <CardTitle>상태 필터</CardTitle>
          <CardDescription>조회할 시정 조치 상태를 선택하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="상태 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="open">열림</SelectItem>
              <SelectItem value="investigating">조사 중</SelectItem>
              <SelectItem value="action_taken">조치 완료</SelectItem>
              <SelectItem value="verifying">검증 중</SelectItem>
              <SelectItem value="closed">종료</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* 시정 조치 목록 */}
      <Card>
        <CardHeader>
          <CardTitle>시정 조치 목록</CardTitle>
          <CardDescription>
            등록된 시정 조치 항목을 확인하고 관리합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>문제 설명</TableHead>
                <TableHead>발생 시간</TableHead>
                <TableHead>발견자</TableHead>
                <TableHead>우선순위</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayList && displayList.length > 0 ? (
                displayList.map((action: any) => (
                  <TableRow key={action.id}>
                    <TableCell className="font-medium">#{action.id}</TableCell>
                    <TableCell className="max-w-xs truncate">{action.issueDescription}</TableCell>
                    <TableCell>{new Date(action.occurredAt).toLocaleString("ko-KR")}</TableCell>
                    <TableCell>{action.detectedBy}</TableCell>
                    <TableCell>{getPriorityBadge(action.priority)}</TableCell>
                    <TableCell>{getStatusBadge(action.status)}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedAction(action)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    등록된 시정 조치가 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 등록 다이얼로그 */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>새로운 시정 조치 등록</DialogTitle>
              <DialogDescription>
                CCP 이탈 또는 문제 발생 시 시정 조치를 등록합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="issueDescription">문제 설명 *</Label>
                <Textarea
                  id="issueDescription"
                  name="issueDescription"
                  placeholder="발생한 문제에 대한 상세 설명"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="occurredAt">발생 시간 *</Label>
                  <Input
                    id="occurredAt"
                    name="occurredAt"
                    type="datetime-local"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="detectedBy">발견자 *</Label>
                  <Input
                    id="detectedBy"
                    name="detectedBy"
                    placeholder="발견자 이름"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="priority">우선순위 *</Label>
                <Select name="priority" required>
                  <SelectTrigger>
                    <SelectValue placeholder="우선순위 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">낮음</SelectItem>
                    <SelectItem value="medium">중간</SelectItem>
                    <SelectItem value="high">높음</SelectItem>
                    <SelectItem value="critical">긴급</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="batchId">{`${L("batch")} ID (선택)`}</Label>
                  <Input
                    id="batchId"
                    name="batchId"
                    type="number"
                    placeholder="관련 배치 ID"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="ccpRecordId">CCP 기록 ID (선택)</Label>
                  <Input
                    id="ccpRecordId"
                    name="ccpRecordId"
                    type="number"
                    placeholder="관련 CCP 기록 ID"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                취소
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "등록 중..." : "등록"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 상세 다이얼로그 */}
      {selectedAction && (
        <Dialog open={!!selectedAction} onOpenChange={() => setSelectedAction(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>시정 조치 상세 정보 (#{selectedAction.id})</DialogTitle>
              <DialogDescription>
                시정 조치의 전체 프로세스를 관리합니다.
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="info" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="info">기본 정보</TabsTrigger>
                <TabsTrigger value="immediate">즉시 조치</TabsTrigger>
                <TabsTrigger value="root">근본 원인</TabsTrigger>
                <TabsTrigger value="corrective">시정 조치</TabsTrigger>
                <TabsTrigger value="verification">효과 검증</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4">
                <div className="grid gap-4">
                  <div>
                    <Label>문제 설명</Label>
                    <p className="text-sm text-muted-foreground">{selectedAction.issueDescription}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>발생 시간</Label>
                      <p className="text-sm text-muted-foreground">
                        {new Date(selectedAction.occurredAt).toLocaleString("ko-KR")}
                      </p>
                    </div>
                    <div>
                      <Label>발견자</Label>
                      <p className="text-sm text-muted-foreground">{selectedAction.detectedBy}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>우선순위</Label>
                      <div className="mt-1">{getPriorityBadge(selectedAction.priority)}</div>
                    </div>
                    <div>
                      <Label>상태</Label>
                      <div className="mt-1">{getStatusBadge(selectedAction.status)}</div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="immediate" className="space-y-4">
                {selectedAction.immediateAction ? (
                  <div className="grid gap-4">
                    <div>
                      <Label>즉시 조치 내용</Label>
                      <p className="text-sm text-muted-foreground">{selectedAction.immediateAction}</p>
                    </div>
                    <div>
                      <Label>조치 시간</Label>
                      <p className="text-sm text-muted-foreground">
                        {selectedAction.immediateActionDate && new Date(selectedAction.immediateActionDate).toLocaleString("ko-KR")}
                      </p>
                    </div>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      immediateActionMutation.mutate({
                        id: selectedAction.id,
                        immediateAction: formData.get("immediateAction") as string,
                      });
                    }}
                  >
                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="immediateAction">즉시 조치 내용 *</Label>
                        <Textarea
                          id="immediateAction"
                          name="immediateAction"
                          placeholder="즉시 취한 조치 내용을 입력하세요"
                          required
                        />
                      </div>
                      <Button type="submit">즉시 조치 등록</Button>
                    </div>
                  </form>
                )}
              </TabsContent>

              <TabsContent value="root" className="space-y-4">
                {selectedAction.rootCauseAnalysis ? (
                  <div className="grid gap-4">
                    <div>
                      <Label>근본 원인 분석</Label>
                      <p className="text-sm text-muted-foreground">{selectedAction.rootCauseAnalysis}</p>
                    </div>
                    <div>
                      <Label>분석 시간</Label>
                      <p className="text-sm text-muted-foreground">
                        {selectedAction.rootCauseAnalysisDate && new Date(selectedAction.rootCauseAnalysisDate).toLocaleString("ko-KR")}
                      </p>
                    </div>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      rootCauseAnalysisMutation.mutate({
                        id: selectedAction.id,
                        rootCauseAnalysis: formData.get("rootCauseAnalysis") as string,
                        rootCauseCategory: "other",
                      });
                    }}
                  >
                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="rootCauseAnalysis">근본 원인 분석 *</Label>
                        <Textarea
                          id="rootCauseAnalysis"
                          name="rootCauseAnalysis"
                          placeholder="문제의 근본 원인을 분석하세요 (5 Whys, Fishbone 등)"
                          required
                          rows={6}
                        />
                      </div>
                      <Button type="submit">근본 원인 분석 등록</Button>
                    </div>
                  </form>
                )}
              </TabsContent>

              <TabsContent value="corrective" className="space-y-4">
                {selectedAction.correctiveActionTaken ? (
                  <div className="grid gap-4">
                    <div>
                      <Label>시정 조치 내용</Label>
                      <p className="text-sm text-muted-foreground">{selectedAction.correctiveActionTaken}</p>
                    </div>
                    <div>
                      <Label>완료 시간</Label>
                      <p className="text-sm text-muted-foreground">
                        {selectedAction.actionCompletedDate && new Date(selectedAction.actionCompletedDate).toLocaleString("ko-KR")}
                      </p>
                    </div>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      correctiveActionMutation.mutate({
                        id: selectedAction.id,
                        correctiveAction: formData.get("correctiveActionTaken") as string,
                        actionStartDate: todayLocal(),
                        actionDueDate: formatLocalDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
                      });
                    }}
                  >
                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="correctiveActionTaken">시정 조치 내용 *</Label>
                        <Textarea
                          id="correctiveActionTaken"
                          name="correctiveActionTaken"
                          placeholder="근본 원인을 해결하기 위한 시정 조치를 입력하세요"
                          required
                          rows={6}
                        />
                      </div>
                      <Button type="submit">시정 조치 등록</Button>
                    </div>
                  </form>
                )}
              </TabsContent>

              <TabsContent value="verification" className="space-y-4">
                {selectedAction.verificationResult ? (
                  <div className="grid gap-4">
                    <div>
                      <Label>검증 결과</Label>
                      <p className="text-sm text-muted-foreground">{selectedAction.verificationResult}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>효과성</Label>
                        <div className="mt-1">
                          <Badge variant={selectedAction.isEffective === 1 ? "default" : "destructive"}>
                            {selectedAction.isEffective === 1 ? "효과적" : "비효과적"}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <Label>검증 시간</Label>
                        <p className="text-sm text-muted-foreground">
                          {selectedAction.verificationDate && new Date(selectedAction.verificationDate).toLocaleString("ko-KR")}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      verificationMutation.mutate({
                        id: selectedAction.id,
                        verificationMethod: "실제 검증",
                        verificationResult: formData.get("verificationResult") as string,
                        isEffective: formData.get("isEffective") === "1" ? 1 : 0,
                        verifiedDate: todayLocal(),
                      });
                    }}
                  >
                    <div className="grid gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="verificationResult">검증 결과 *</Label>
                        <Textarea
                          id="verificationResult"
                          name="verificationResult"
                          placeholder="시정 조치의 효과를 검증한 결과를 입력하세요"
                          required
                          rows={6}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="isEffective">효과성 *</Label>
                        <Select name="isEffective" required>
                          <SelectTrigger>
                            <SelectValue placeholder="효과성 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">효과적</SelectItem>
                            <SelectItem value="0">비효과적</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="submit">효과 검증 등록</Button>
                    </div>
                  </form>
                )}
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedAction(null)}>
                닫기
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
