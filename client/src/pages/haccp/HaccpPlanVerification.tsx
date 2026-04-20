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
import { CheckCircle, XCircle, AlertTriangle, Plus, Edit, FileText, Download } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

export default function HaccpPlanVerification({ embedded, ..._ }: { embedded?: boolean; [key: string]: any } = {}) {
  const L = useIndustryLabel();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedVerification, setSelectedVerification] = useState<any>(null);
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);

  // 데이터 조회
  const { data: verificationList, isLoading, refetch } = trpc.haccpPlanVerification.list.useQuery({
    limit: 100,
  });

  // 생성 mutation
  const createMutation = trpc.haccpPlanVerification.create.useMutation({
    onSuccess: () => {
      alert("HACCP 계획 검증이 성공적으로 등록되었습니다.");
      setIsCreateOpen(false);
      refetch();
    },
    onError: (error: { message: string }) => {
      alert(`등록 실패: ${error.message}`);
    },
  });

  // 수정 mutation
  const updateMutation = trpc.haccpPlanVerification.update.useMutation({
    onSuccess: () => {
      alert("HACCP 계획 검증이 성공적으로 수정되었습니다.");
      setIsDetailOpen(false);
      refetch();
    },
    onError: (error: { message: string }) => {
      alert(`수정 실패: ${error.message}`);
    },
  });

  // 승인 mutation
  const approveMutation = trpc.haccpPlanVerification.approve.useMutation({
    onSuccess: () => {
      alert("HACCP 계획 검증이 승인되었습니다.");
      refetch();
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    createMutation.mutate({
      verificationNumber: formData.get("verificationNumber") as string,
      verificationDate: formData.get("verificationDate") as string,
      verificationPeriod: formData.get("verificationPeriod") as string,
      verificationType: formData.get("verificationType") as any,
      siteId: 1,
      verificationScope: formData.get("verificationScope") as string,
      verificationMethod: formData.get("verificationMethod") as string,
    });
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedVerification) return;

    const formData = new FormData(e.currentTarget);

    updateMutation.mutate({
      id: selectedVerification.id,
      hazardAnalysisAdequate: Number(formData.get("hazardAnalysisAdequate")),
      ccpDeterminationAdequate: Number(formData.get("ccpDeterminationAdequate")),
      criticalLimitsAdequate: Number(formData.get("criticalLimitsAdequate")),
      monitoringProceduresAdequate: Number(formData.get("monitoringProceduresAdequate")),
      correctiveActionsAdequate: Number(formData.get("correctiveActionsAdequate")),
      recordKeepingAdequate: Number(formData.get("recordKeepingAdequate")),
      overallResult: formData.get("overallResult") as any,
      recommendations: formData.get("recommendations") as string,
      improvementActions: formData.get("improvementActions") as string,
      actionDueDate: formData.get("actionDueDate") as string,
      nextVerificationDate: formData.get("nextVerificationDate") as string,
      notes: formData.get("notes") as string,
    });
  };

  const openDetail = (verification: any) => {
    setSelectedVerification(verification);
    setIsDetailOpen(true);
  };

  const getVerificationTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      annual: "정기 검증",
      product_change: "제품 변경",
      process_change: "공정 변경",
      incident: "사고 발생",
      regulation_change: "법규 변경",
    };
    return labels[type] || type;
  };

  const getResultBadge = (result: string) => {
    if (result === "adequate") {
      return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />적합</Badge>;
    } else if (result === "needs_improvement") {
      return <Badge className="bg-yellow-500"><AlertTriangle className="w-3 h-3 mr-1" />개선 필요</Badge>;
    } else if (result === "inadequate") {
      return <Badge className="bg-red-500"><XCircle className="w-3 h-3 mr-1" />부적합</Badge>;
    }
    return <Badge variant="outline">미평가</Badge>;
  };

    const content = (
      <>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">HACCP 계획 검증</h1>
            <p className="text-gray-500 mt-1">HACCP 원칙 6 - HACCP 계획의 효과성 검증</p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} className="w-full md:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            검증 등록
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>검증 기록 목록</CardTitle>
            <CardDescription>
              HACCP 계획의 효과성을 정기적으로 검증하고 개선 사항을 관리합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">로딩 중...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>검증번호</TableHead>
                    <TableHead>검증일자</TableHead>
                    <TableHead>검증 유형</TableHead>
                    <TableHead>검증 기간</TableHead>
                    <TableHead>종합 평가</TableHead>
                    <TableHead>승인 상태</TableHead>
                    <TableHead>다음 검증일</TableHead>
                    <TableHead>작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {verificationList?.map((verification: any) => (
                    <TableRow key={verification.id}>
                      <TableCell className="font-medium">{verification.verificationNumber}</TableCell>
                      <TableCell>{verification.verificationDate}</TableCell>
                      <TableCell>{getVerificationTypeLabel(verification.verificationType)}</TableCell>
                      <TableCell>{verification.verificationPeriod || "-"}</TableCell>
                      <TableCell>{getResultBadge(verification.overallResult)}</TableCell>
                      <TableCell>
                        {verification.approvedBy ? (
                          <Badge className="bg-blue-500">승인 완료</Badge>
                        ) : (
                          <Badge variant="outline">승인 대기</Badge>
                        )}
                      </TableCell>
                      <TableCell>{verification.nextVerificationDate || "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openDetail(verification)}
                          >
                            <Edit className="w-3 h-3 mr-1" />
                            상세
                          </Button>
                          {!verification.approvedBy && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => approveMutation.mutate({ id: verification.id })}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              승인
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!verificationList || verificationList.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                        등록된 검증 기록이 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* 검증 등록 다이얼로그 */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>HACCP 계획 검증 등록</DialogTitle>
              <DialogDescription>
                새로운 HACCP 계획 검증을 등록합니다.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="verificationNumber">검증번호 *</Label>
                  <Input
                    id="verificationNumber"
                    name="verificationNumber"
                    placeholder="예: VER-2026-001"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="verificationDate">검증일자 *</Label>
                  <Input
                    id="verificationDate"
                    name="verificationDate"
                    type="date"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="verificationType">검증 유형 *</Label>
                  <Select name="verificationType" required>
                    <SelectTrigger>
                      <SelectValue placeholder="검증 유형 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="annual">정기 검증</SelectItem>
                      <SelectItem value="product_change">{`${L("product")} 변경`}</SelectItem>
                      <SelectItem value="process_change">{`${L("process")} 변경`}</SelectItem>
                      <SelectItem value="incident">사고 발생</SelectItem>
                      <SelectItem value="regulation_change">법규 변경</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="verificationPeriod">검증 기간</Label>
                  <Input
                    id="verificationPeriod"
                    name="verificationPeriod"
                    placeholder="예: 2025.01.01 ~ 2025.12.31"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="verificationScope">검증 범위</Label>
                <Textarea
                  id="verificationScope"
                  name="verificationScope"
                  placeholder="검증 대상 제품, 공정, CCP 등을 입력하세요"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="verificationMethod">검증 방법</Label>
                <Textarea
                  id="verificationMethod"
                  name="verificationMethod"
                  placeholder="문서 검토, 현장 확인, 기록 검토 등"
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

        {/* 검증 상세/수정 다이얼로그 */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>HACCP 계획 검증 상세</DialogTitle>
              <DialogDescription>
                검증번호: {selectedVerification?.verificationNumber}
              </DialogDescription>
            </DialogHeader>
            {selectedVerification && (
              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded">
                  <div>
                    <span className="text-sm text-gray-500">검증일자</span>
                    <p className="font-medium">{selectedVerification.verificationDate}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">검증 유형</span>
                    <p className="font-medium">{getVerificationTypeLabel(selectedVerification.verificationType)}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">검증 기간</span>
                    <p className="font-medium">{selectedVerification.verificationPeriod || "-"}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">HACCP 7원칙 적합성 평가</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="hazardAnalysisAdequate">1. 위험 분석</Label>
                      <Select name="hazardAnalysisAdequate" defaultValue={selectedVerification.hazardAnalysisAdequate?.toString()}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">적합</SelectItem>
                          <SelectItem value="0">부적합</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="ccpDeterminationAdequate">2. CCP 결정</Label>
                      <Select name="ccpDeterminationAdequate" defaultValue={selectedVerification.ccpDeterminationAdequate?.toString()}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">적합</SelectItem>
                          <SelectItem value="0">부적합</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="criticalLimitsAdequate">3. 한계기준 설정</Label>
                      <Select name="criticalLimitsAdequate" defaultValue={selectedVerification.criticalLimitsAdequate?.toString()}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">적합</SelectItem>
                          <SelectItem value="0">부적합</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="monitoringProceduresAdequate">4. 모니터링 절차</Label>
                      <Select name="monitoringProceduresAdequate" defaultValue={selectedVerification.monitoringProceduresAdequate?.toString()}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">적합</SelectItem>
                          <SelectItem value="0">부적합</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="correctiveActionsAdequate">5. 시정 조치</Label>
                      <Select name="correctiveActionsAdequate" defaultValue={selectedVerification.correctiveActionsAdequate?.toString()}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">적합</SelectItem>
                          <SelectItem value="0">부적합</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="recordKeepingAdequate">7. 기록 유지</Label>
                      <Select name="recordKeepingAdequate" defaultValue={selectedVerification.recordKeepingAdequate?.toString()}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">적합</SelectItem>
                          <SelectItem value="0">부적합</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="overallResult">종합 평가 *</Label>
                    <Select name="overallResult" defaultValue={selectedVerification.overallResult} required>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="adequate">적합</SelectItem>
                        <SelectItem value="needs_improvement">개선 필요</SelectItem>
                        <SelectItem value="inadequate">부적합</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="recommendations">권고 사항</Label>
                    <Textarea
                      id="recommendations"
                      name="recommendations"
                      defaultValue={selectedVerification.recommendations || ""}
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label htmlFor="improvementActions">개선 조치 계획</Label>
                    <Textarea
                      id="improvementActions"
                      name="improvementActions"
                      defaultValue={selectedVerification.improvementActions || ""}
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="actionDueDate">조치 완료 기한</Label>
                      <Input
                        id="actionDueDate"
                        name="actionDueDate"
                        type="date"
                        defaultValue={selectedVerification.actionDueDate || ""}
                      />
                    </div>

                    <div>
                      <Label htmlFor="nextVerificationDate">다음 검증 예정일</Label>
                      <Input
                        id="nextVerificationDate"
                        name="nextVerificationDate"
                        type="date"
                        defaultValue={selectedVerification.nextVerificationDate || ""}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="notes">비고</Label>
                    <Textarea
                      id="notes"
                      name="notes"
                      defaultValue={selectedVerification.notes || ""}
                      rows={2}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsDetailOpen(false)}>
                    닫기
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
