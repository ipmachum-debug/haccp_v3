import { useState } from "react";
import { trpc } from "@/lib/trpc";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardCheck, Plus, Edit, FileText, Play, CheckCircle, AlertTriangle } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

export default function InternalAudit({ embedded, ..._ }: { embedded?: boolean; [key: string]: any } = {}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedAudit, setSelectedAudit] = useState<any>(null);
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const [checklistForm, setChecklistForm] = useState<any>({});

  // 데이터 조회
  const { data: auditList, isLoading, refetch } = trpc.internalAudit.list.useQuery({
    limit: 100,
  });

  // 생성 mutation
  const createMutation = trpc.internalAudit.create.useMutation({
    onSuccess: () => {
      alert("내부 감사가 성공적으로 등록되었습니다.");
      setIsCreateOpen(false);
      refetch();
    },
    onError: (error: { message: string }) => {
      alert(`등록 실패: ${error.message}`);
    },
  });

  // 수정 mutation
  const updateMutation = trpc.internalAudit.update.useMutation({
    onSuccess: () => {
      alert("내부 감사가 성공적으로 수정되었습니다.");
      refetch();
    },
    onError: (error: { message: string }) => {
      alert(`수정 실패: ${error.message}`);
    },
  });

  // 감사 시작 mutation
  const startMutation = trpc.internalAudit.start.useMutation({
    onSuccess: () => {
      alert("내부 감사가 시작되었습니다.");
      refetch();
    },
  });

  // 감사 완료 mutation
  const completeMutation = trpc.internalAudit.complete.useMutation({
    onSuccess: () => {
      alert("내부 감사가 완료되었습니다.");
      refetch();
    },
  });

  // 체크리스트 추가 mutation
  const addChecklistMutation = trpc.internalAudit.addChecklistItem.useMutation({
    onSuccess: () => {
      alert("체크리스트 항목이 추가되었습니다.");
      setIsChecklistOpen(false);
      setChecklistForm({});
      if (selectedAudit) {
        // 상세 정보 새로고침
        refetch();
      }
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    createMutation.mutate({
      auditNumber: formData.get("auditNumber") as string,
      auditName: formData.get("auditName") as string,
      auditType: formData.get("auditType") as any,
      scheduledDate: formData.get("scheduledDate") as string,
      siteId: 1,
      leadAuditor: 1, // 현재 로그인 사용자
      auditScope: formData.get("auditScope") as string,
    });
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedAudit) return;

    const formData = new FormData(e.currentTarget);

    updateMutation.mutate({
      id: selectedAudit.id,
      overallRating: formData.get("overallRating") as any,
      executiveSummary: formData.get("executiveSummary") as string,
      strengths: formData.get("strengths") as string,
      weaknesses: formData.get("weaknesses") as string,
      recommendations: formData.get("recommendations") as string,
      notes: formData.get("notes") as string,
    });
  };

  const handleAddChecklist = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedAudit) return;

    const formData = new FormData(e.currentTarget);

    addChecklistMutation.mutate({
      auditId: selectedAudit.id,
      category: formData.get("category") as string,
      subCategory: formData.get("subCategory") as string,
      checkItem: formData.get("checkItem") as string,
      checkCriteria: formData.get("checkCriteria") as string,
      checkResult: formData.get("checkResult") as any,
      findings: formData.get("findings") as string,
      evidence: formData.get("evidence") as string,
      remarks: formData.get("remarks") as string,
    });
  };

  const openDetail = (audit: any) => {
    setSelectedAudit(audit);
    setIsDetailOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      scheduled: { label: "예정", className: "bg-gray-500" },
      in_progress: { label: "진행 중", className: "bg-yellow-500" },
      completed: { label: "완료", className: "bg-green-500" },
      cancelled: { label: "취소", className: "bg-red-500" },
    };
    const config = statusConfig[status] || { label: status, className: "bg-gray-500" };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const getAuditTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      scheduled: "정기 감사",
      special: "특별 감사",
      follow_up: "후속 감사",
    };
    return labels[type] || type;
  };

  const getRatingBadge = (rating: string) => {
    const ratingConfig: Record<string, { label: string; className: string }> = {
      excellent: { label: "우수", className: "bg-green-600" },
      good: { label: "양호", className: "bg-blue-500" },
      acceptable: { label: "보통", className: "bg-yellow-500" },
      needs_improvement: { label: "개선 필요", className: "bg-orange-500" },
      unacceptable: { label: "부적합", className: "bg-red-500" },
    };
    const config = ratingConfig[rating] || { label: "-", className: "bg-gray-500" };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

    const content = (
      <>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">내부 감사 실시</h1>
            <p className="text-gray-500 mt-1">HACCP 원칙 6 - 내부 감사 실시 및 결과 관리</p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} className="w-full md:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            감사 등록
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>내부 감사 목록</CardTitle>
            <CardDescription>
              내부 감사를 실시하고 결과를 기록합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">로딩 중...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>감사번호</TableHead>
                    <TableHead>감사명</TableHead>
                    <TableHead>감사 유형</TableHead>
                    <TableHead>예정일</TableHead>
                    <TableHead>실시일</TableHead>
                    <TableHead>종합 평가</TableHead>
                    <TableHead>준수율</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditList?.map((audit: any) => (
                    <TableRow key={audit.id}>
                      <TableCell className="font-medium">{audit.auditNumber}</TableCell>
                      <TableCell>{audit.auditName}</TableCell>
                      <TableCell>{getAuditTypeLabel(audit.auditType)}</TableCell>
                      <TableCell>{audit.scheduledDate}</TableCell>
                      <TableCell>{audit.actualStartDate || "-"}</TableCell>
                      <TableCell>
                        {audit.overallRating ? getRatingBadge(audit.overallRating) : "-"}
                      </TableCell>
                      <TableCell>
                        {audit.complianceRate ? `${audit.complianceRate}%` : "-"}
                      </TableCell>
                      <TableCell>{getStatusBadge(audit.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openDetail(audit)}
                          >
                            <Edit className="w-3 h-3 mr-1" />
                            상세
                          </Button>
                          {audit.status === "scheduled" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => startMutation.mutate({ id: audit.id })}
                            >
                              <Play className="w-3 h-3 mr-1" />
                              시작
                            </Button>
                          )}
                          {audit.status === "in_progress" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => completeMutation.mutate({ id: audit.id })}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              완료
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!auditList || auditList.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                        등록된 내부 감사가 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* 감사 등록 다이얼로그 */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>내부 감사 등록</DialogTitle>
              <DialogDescription>
                새로운 내부 감사를 등록합니다.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="auditNumber">감사번호 *</Label>
                  <Input
                    id="auditNumber"
                    name="auditNumber"
                    placeholder="예: IA-2026-001"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="scheduledDate">예정일 *</Label>
                  <Input
                    id="scheduledDate"
                    name="scheduledDate"
                    type="date"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="auditName">감사명 *</Label>
                <Input
                  id="auditName"
                  name="auditName"
                  placeholder="예: 2026년 1분기 HACCP 내부 감사"
                  required
                />
              </div>

              <div>
                <Label htmlFor="auditType">감사 유형 *</Label>
                <Select name="auditType" required>
                  <SelectTrigger>
                    <SelectValue placeholder="감사 유형 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">정기 감사</SelectItem>
                    <SelectItem value="special">특별 감사</SelectItem>
                    <SelectItem value="follow_up">후속 감사</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="auditScope">감사 범위</Label>
                <Textarea
                  id="auditScope"
                  name="auditScope"
                  placeholder="감사 대상 부서, 공정, 시스템 등을 입력하세요"
                  rows={4}
                />
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

        {/* 감사 상세 다이얼로그 */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>내부 감사 상세</DialogTitle>
              <DialogDescription>
                감사번호: {selectedAudit?.auditNumber}
              </DialogDescription>
            </DialogHeader>
            {selectedAudit && (
              <Tabs defaultValue="info" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="info">기본 정보</TabsTrigger>
                  <TabsTrigger value="checklist">체크리스트</TabsTrigger>
                  <TabsTrigger value="result">결과 요약</TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded">
                    <div>
                      <span className="text-sm text-gray-500">감사명</span>
                      <p className="font-medium">{selectedAudit.auditName}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">감사 유형</span>
                      <p className="font-medium">{getAuditTypeLabel(selectedAudit.auditType)}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">예정일</span>
                      <p className="font-medium">{selectedAudit.scheduledDate}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">실시일</span>
                      <p className="font-medium">{selectedAudit.actualStartDate || "-"}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">상태</span>
                      <p className="font-medium">{getStatusBadge(selectedAudit.status)}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">준수율</span>
                      <p className="font-medium">{selectedAudit.complianceRate ? `${selectedAudit.complianceRate}%` : "-"}</p>
                    </div>
                  </div>

                  <div>
                    <span className="text-sm text-gray-500">감사 범위</span>
                    <p className="mt-1">{selectedAudit.auditScope || "-"}</p>
                  </div>
                </TabsContent>

                <TabsContent value="checklist" className="space-y-4 mt-4">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <h3 className="font-semibold">감사 체크리스트</h3>
                    <Button size="sm" onClick={() => setIsChecklistOpen(true)}>
                      <Plus className="w-3 h-3 mr-1" />
                      항목 추가
                    </Button>
                  </div>

                  <div className="border rounded p-4">
                    <p className="text-sm text-gray-500">
                      총 {selectedAudit.totalCheckItems || 0}개 항목 
                      (적합: {selectedAudit.passedItems || 0}, 부적합: {selectedAudit.failedItems || 0}, N/A: {selectedAudit.naItems || 0})
                    </p>
                  </div>

                  <p className="text-sm text-gray-500">
                    체크리스트 항목은 별도 관리 화면에서 확인할 수 있습니다.
                  </p>
                </TabsContent>

                <TabsContent value="result" className="space-y-4 mt-4">
                  <form onSubmit={handleUpdate} className="space-y-4">
                    <div>
                      <Label htmlFor="overallRating">종합 평가</Label>
                      <Select name="overallRating" defaultValue={selectedAudit.overallRating}>
                        <SelectTrigger>
                          <SelectValue placeholder="평가 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="excellent">우수</SelectItem>
                          <SelectItem value="good">양호</SelectItem>
                          <SelectItem value="acceptable">보통</SelectItem>
                          <SelectItem value="needs_improvement">개선 필요</SelectItem>
                          <SelectItem value="unacceptable">부적합</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="executiveSummary">요약</Label>
                      <Textarea
                        id="executiveSummary"
                        name="executiveSummary"
                        defaultValue={selectedAudit.executiveSummary || ""}
                        rows={3}
                      />
                    </div>

                    <div>
                      <Label htmlFor="strengths">강점</Label>
                      <Textarea
                        id="strengths"
                        name="strengths"
                        defaultValue={selectedAudit.strengths || ""}
                        rows={3}
                      />
                    </div>

                    <div>
                      <Label htmlFor="weaknesses">약점</Label>
                      <Textarea
                        id="weaknesses"
                        name="weaknesses"
                        defaultValue={selectedAudit.weaknesses || ""}
                        rows={3}
                      />
                    </div>

                    <div>
                      <Label htmlFor="recommendations">권고 사항</Label>
                      <Textarea
                        id="recommendations"
                        name="recommendations"
                        defaultValue={selectedAudit.recommendations || ""}
                        rows={3}
                      />
                    </div>

                    <div>
                      <Label htmlFor="notes">비고</Label>
                      <Textarea
                        id="notes"
                        name="notes"
                        defaultValue={selectedAudit.notes || ""}
                        rows={2}
                      />
                    </div>

                    <Button type="submit" disabled={updateMutation.isPending}>
                      {updateMutation.isPending ? "저장 중..." : "저장"}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>

        {/* 체크리스트 항목 추가 다이얼로그 */}
        <Dialog open={isChecklistOpen} onOpenChange={setIsChecklistOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>체크리스트 항목 추가</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddChecklist} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category">카테고리 *</Label>
                  <Input
                    id="category"
                    name="category"
                    placeholder="예: HACCP 계획"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="subCategory">세부 카테고리</Label>
                  <Input
                    id="subCategory"
                    name="subCategory"
                    placeholder="예: 위험 분석"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="checkItem">점검 항목 *</Label>
                <Textarea
                  id="checkItem"
                  name="checkItem"
                  placeholder="점검할 항목을 입력하세요"
                  rows={2}
                  required
                />
              </div>

              <div>
                <Label htmlFor="checkCriteria">점검 기준</Label>
                <Textarea
                  id="checkCriteria"
                  name="checkCriteria"
                  placeholder="점검 기준을 입력하세요"
                  rows={2}
                />
              </div>

              <div>
                <Label htmlFor="checkResult">점검 결과 *</Label>
                <Select name="checkResult" required>
                  <SelectTrigger>
                    <SelectValue placeholder="결과 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pass">적합</SelectItem>
                    <SelectItem value="fail">부적합</SelectItem>
                    <SelectItem value="na">해당 없음</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="findings">발견 사항</Label>
                <Textarea
                  id="findings"
                  name="findings"
                  rows={2}
                />
              </div>

              <div>
                <Label htmlFor="evidence">증거</Label>
                <Textarea
                  id="evidence"
                  name="evidence"
                  placeholder="관련 문서, 사진 등"
                  rows={2}
                />
              </div>

              <div>
                <Label htmlFor="remarks">비고</Label>
                <Textarea
                  id="remarks"
                  name="remarks"
                  rows={2}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsChecklistOpen(false)}>
                  취소
                </Button>
                <Button type="submit" disabled={addChecklistMutation.isPending}>
                  {addChecklistMutation.isPending ? "추가 중..." : "추가"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      </>
    );
    if (embedded) return content;
    return <DashboardLayout>{content}</DashboardLayout>;
}
