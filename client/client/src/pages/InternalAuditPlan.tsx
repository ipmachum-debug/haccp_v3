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
import { Calendar, Plus, Edit, FileText, CheckCircle } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

export default function InternalAuditPlan({ embedded }: { embedded?: boolean } = {}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // 데이터 조회
  const { data: planList, isLoading, refetch } = trpc.internalAudit.listPlans.useQuery({
    planYear: selectedYear,
    limit: 100,
  });

  // 생성 mutation
  const createMutation = trpc.internalAudit.createPlan.useMutation({
    onSuccess: () => {
      alert("내부 감사 계획이 성공적으로 등록되었습니다.");
      setIsCreateOpen(false);
      refetch();
    },
    onError: (error) => {
      alert(`등록 실패: ${error.message}`);
    },
  });

  // 수정 mutation
  const updateMutation = trpc.internalAudit.updatePlan.useMutation({
    onSuccess: () => {
      alert("내부 감사 계획이 성공적으로 수정되었습니다.");
      setIsEditOpen(false);
      refetch();
    },
    onError: (error) => {
      alert(`수정 실패: ${error.message}`);
    },
  });

  // 승인 mutation
  const approveMutation = trpc.internalAudit.approvePlan.useMutation({
    onSuccess: () => {
      alert("내부 감사 계획이 승인되었습니다.");
      refetch();
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    createMutation.mutate({
      planYear: Number(formData.get("planYear")),
      planNumber: formData.get("planNumber") as string,
      planName: formData.get("planName") as string,
      auditScope: formData.get("auditScope") as string,
      auditFrequency: formData.get("auditFrequency") as string,
      notes: formData.get("notes") as string,
    });
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedPlan) return;

    const formData = new FormData(e.currentTarget);

    updateMutation.mutate({
      id: selectedPlan.id,
      planName: formData.get("planName") as string,
      auditScope: formData.get("auditScope") as string,
      auditFrequency: formData.get("auditFrequency") as string,
      status: formData.get("status") as any,
      notes: formData.get("notes") as string,
    });
  };

  const openEdit = (plan: any) => {
    setSelectedPlan(plan);
    setIsEditOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      draft: { label: "작성 중", className: "bg-gray-500" },
      approved: { label: "승인 완료", className: "bg-blue-500" },
      in_progress: { label: "진행 중", className: "bg-yellow-500" },
      completed: { label: "완료", className: "bg-green-500" },
    };
    const config = statusConfig[status] || { label: status, className: "bg-gray-500" };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

    const content = (
      <>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">내부 감사 계획</h1>
            <p className="text-gray-500 mt-1">HACCP 원칙 6 - 연간 내부 감사 계획 수립 및 관리</p>
          </div>
          <div className="flex gap-2">
            <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026, 2027].map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}년
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => setIsCreateOpen(true)} className="w-full md:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              계획 등록
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{selectedYear}년 내부 감사 계획</CardTitle>
            <CardDescription>
              연간 내부 감사 계획을 수립하고 진행 상황을 관리합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">로딩 중...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>계획번호</TableHead>
                    <TableHead>계획명</TableHead>
                    <TableHead>감사 범위</TableHead>
                    <TableHead>감사 주기</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>승인일</TableHead>
                    <TableHead>작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {planList?.map((plan: any) => (
                    <TableRow key={plan.id}>
                      <TableCell className="font-medium">{plan.planNumber}</TableCell>
                      <TableCell>{plan.planName}</TableCell>
                      <TableCell className="max-w-xs truncate">{plan.auditScope || "-"}</TableCell>
                      <TableCell>{plan.auditFrequency || "-"}</TableCell>
                      <TableCell>{getStatusBadge(plan.status)}</TableCell>
                      <TableCell>{plan.approvedDate || "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(plan)}
                          >
                            <Edit className="w-3 h-3 mr-1" />
                            수정
                          </Button>
                          {plan.status === "draft" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => approveMutation.mutate({ id: plan.id })}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              승인
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!planList || planList.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                        {selectedYear}년 내부 감사 계획이 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* 계획 등록 다이얼로그 */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>내부 감사 계획 등록</DialogTitle>
              <DialogDescription>
                새로운 연간 내부 감사 계획을 등록합니다.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="planYear">계획 연도 *</Label>
                  <Input
                    id="planYear"
                    name="planYear"
                    type="number"
                    defaultValue={new Date().getFullYear()}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="planNumber">계획번호 *</Label>
                  <Input
                    id="planNumber"
                    name="planNumber"
                    placeholder="예: IAP-2026-001"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="planName">계획명 *</Label>
                <Input
                  id="planName"
                  name="planName"
                  placeholder="예: 2026년 HACCP 내부 감사 계획"
                  required
                />
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

              <div>
                <Label htmlFor="auditFrequency">감사 주기</Label>
                <Input
                  id="auditFrequency"
                  name="auditFrequency"
                  placeholder="예: 반기별 1회, 분기별 1회"
                />
              </div>

              <div>
                <Label htmlFor="notes">비고</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  rows={3}
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

        {/* 계획 수정 다이얼로그 */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>내부 감사 계획 수정</DialogTitle>
              <DialogDescription>
                계획번호: {selectedPlan?.planNumber}
              </DialogDescription>
            </DialogHeader>
            {selectedPlan && (
              <form onSubmit={handleUpdate} className="space-y-4">
                <div>
                  <Label htmlFor="planName">계획명 *</Label>
                  <Input
                    id="planName"
                    name="planName"
                    defaultValue={selectedPlan.planName}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="auditScope">감사 범위</Label>
                  <Textarea
                    id="auditScope"
                    name="auditScope"
                    defaultValue={selectedPlan.auditScope || ""}
                    rows={4}
                  />
                </div>

                <div>
                  <Label htmlFor="auditFrequency">감사 주기</Label>
                  <Input
                    id="auditFrequency"
                    name="auditFrequency"
                    defaultValue={selectedPlan.auditFrequency || ""}
                  />
                </div>

                <div>
                  <Label htmlFor="status">상태</Label>
                  <Select name="status" defaultValue={selectedPlan.status}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">작성 중</SelectItem>
                      <SelectItem value="approved">승인 완료</SelectItem>
                      <SelectItem value="in_progress">진행 중</SelectItem>
                      <SelectItem value="completed">완료</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="notes">비고</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    defaultValue={selectedPlan.notes || ""}
                    rows={3}
                  />
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                    취소
                  </Button>
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? "저장 중..." : "저장"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </div>
      </>
    );
    if (embedded) return content;
    return <DashboardLayout>{content}</DashboardLayout>;
}
