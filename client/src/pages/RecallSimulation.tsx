import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Play, CheckCircle, BarChart3, MapPin, ClipboardList } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

export default function RecallSimulation({ embedded, ..._ }: { embedded?: boolean; [key: string]: any } = {}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const [selectedSim, setSelectedSim] = useState<any>(null);

  const { data: simList, isLoading, refetch } = trpc.recallSimulation.list.useQuery({
    siteId: 1, limit: 100,
  });

  const createMutation = trpc.recallSimulation.create.useMutation({
    onSuccess: () => { alert("회수 시뮬레이션이 등록되었습니다."); setIsCreateOpen(false); refetch(); },
    onError: (err) => { alert(`등록 실패: ${err.message}`); },
  });

  const startMutation = trpc.recallSimulation.start.useMutation({
    onSuccess: () => { alert("시뮬레이션이 시작되었습니다."); refetch(); },
  });

  const completeMutation = trpc.recallSimulation.complete.useMutation({
    onSuccess: () => { alert("시뮬레이션이 완료되었습니다."); setIsCompleteOpen(false); refetch(); },
    onError: (err) => { alert(`완료 실패: ${err.message}`); },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      siteId: 1,
      simulationNumber: fd.get("simulationNumber") as string,
      simulationDate: fd.get("simulationDate") as string,
      simulationType: fd.get("simulationType") as any,
      productId: 1,
      productName: fd.get("productName") as string,
      lotNumber: fd.get("lotNumber") as string,
      recallReason: fd.get("recallReason") as string,
      recallCategory: fd.get("recallCategory") as any,
      productionDate: fd.get("productionDate") as string,
      expiryDate: fd.get("expiryDate") as string,
      totalProducedQuantity: parseFloat(fd.get("totalProducedQuantity") as string),
      totalProducedUnit: fd.get("totalProducedUnit") as string,
      distributedQuantity: parseFloat(fd.get("distributedQuantity") as string),
      remainingInventory: parseFloat(fd.get("remainingInventory") as string),
      targetRecallQuantity: parseFloat(fd.get("targetRecallQuantity") as string),
      targetRecallRate: parseFloat(fd.get("targetRecallRate") as string),
      responsiblePerson: 1,
    });
  };

  const handleComplete = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedSim) return;
    const fd = new FormData(e.currentTarget);
    completeMutation.mutate({
      id: selectedSim.id,
      actualRecalledQuantity: parseFloat(fd.get("actualRecalledQuantity") as string),
      actualRecallRate: parseFloat(fd.get("actualRecallRate") as string),
      traceabilityScore: parseInt(fd.get("traceabilityScore") as string),
      responseTimeScore: parseInt(fd.get("responseTimeScore") as string),
      recallRateScore: parseInt(fd.get("recallRateScore") as string),
      overallScore: parseInt(fd.get("overallScore") as string),
      result: fd.get("result") as any,
      findings: fd.get("findings") as string,
      improvements: fd.get("improvements") as string,
    });
  };

  const getStatusBadge = (status: string) => {
    const cfg: Record<string, { label: string; className: string }> = {
      planned: { label: "계획", className: "bg-blue-500" },
      in_progress: { label: "진행 중", className: "bg-yellow-500" },
      completed: { label: "완료", className: "bg-green-500" },
      cancelled: { label: "취소", className: "bg-gray-500" },
    };
    const c = cfg[status] || { label: status, className: "bg-gray-500" };
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  const getResultBadge = (result: string | null) => {
    if (!result) return "-";
    const cfg: Record<string, { label: string; className: string }> = {
      excellent: { label: "우수", className: "bg-green-600" },
      good: { label: "양호", className: "bg-green-500" },
      fair: { label: "보통", className: "bg-yellow-500" },
      poor: { label: "미흡", className: "bg-orange-500" },
      fail: { label: "불합격", className: "bg-red-500" },
    };
    const c = cfg[result] || { label: result, className: "bg-gray-500" };
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  const getCategoryLabel = (cat: string) => {
    const labels: Record<string, string> = {
      class_1: "Class I (생명 위협)",
      class_2: "Class II (건강 위해)",
      class_3: "Class III (경미한 위해)",
    };
    return labels[cat] || cat;
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      scheduled: "정기 훈련",
      unscheduled: "비정기 훈련",
      actual_recall: "실제 회수",
    };
    return labels[type] || type;
  };

    const content = (
      <>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">회수 시뮬레이션</h1>
            <p className="text-gray-500 mt-1">제품 추적성 및 회수 효과성 평가</p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} className="w-full md:w-auto">
            <Plus className="w-4 h-4 mr-2" />
            시뮬레이션 등록
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>시뮬레이션 목록</CardTitle>
            <CardDescription>회수 시뮬레이션 및 모의 훈련을 관리합니다.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">로딩 중...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>번호</TableHead>
                    <TableHead>실시일</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>제품명</TableHead>
                    <TableHead>LOT</TableHead>
                    <TableHead>등급</TableHead>
                    <TableHead>목표 회수율</TableHead>
                    <TableHead>실제 회수율</TableHead>
                    <TableHead>종합 점수</TableHead>
                    <TableHead>결과</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {simList?.map((sim: any) => (
                    <TableRow key={sim.id}>
                      <TableCell className="font-medium">{sim.simulationNumber}</TableCell>
                      <TableCell>{sim.simulationDate}</TableCell>
                      <TableCell>{getTypeLabel(sim.simulationType)}</TableCell>
                      <TableCell>{sim.productName}</TableCell>
                      <TableCell>{sim.lotNumber}</TableCell>
                      <TableCell>{getCategoryLabel(sim.recallCategory)}</TableCell>
                      <TableCell>{sim.targetRecallRate}%</TableCell>
                      <TableCell>{sim.actualRecallRate}%</TableCell>
                      <TableCell>{sim.overallScore || "-"}</TableCell>
                      <TableCell>{getResultBadge(sim.result)}</TableCell>
                      <TableCell>{getStatusBadge(sim.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => { setSelectedSim(sim); setIsDetailOpen(true); }}>
                            상세
                          </Button>
                          {sim.status === "planned" && (
                            <Button variant="outline" size="sm" onClick={() => startMutation.mutate({ id: sim.id })}>
                              <Play className="w-3 h-3 mr-1" />시작
                            </Button>
                          )}
                          {sim.status === "in_progress" && (
                            <Button variant="outline" size="sm" onClick={() => { setSelectedSim(sim); setIsCompleteOpen(true); }}>
                              <CheckCircle className="w-3 h-3 mr-1" />완료
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!simList || simList.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-8 text-gray-500">
                        등록된 시뮬레이션이 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* 시뮬레이션 등록 다이얼로그 */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>회수 시뮬레이션 등록</DialogTitle>
              <DialogDescription>새로운 회수 시뮬레이션을 등록합니다.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>시뮬레이션 번호 *</Label>
                  <Input name="simulationNumber" placeholder="RS-2026-001" required />
                </div>
                <div>
                  <Label>실시일 *</Label>
                  <Input name="simulationDate" type="date" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>유형 *</Label>
                  <Select name="simulationType" required>
                    <SelectTrigger><SelectValue placeholder="유형 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">정기 훈련</SelectItem>
                      <SelectItem value="unscheduled">비정기 훈련</SelectItem>
                      <SelectItem value="actual_recall">실제 회수</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>회수 등급 *</Label>
                  <Select name="recallCategory" required>
                    <SelectTrigger><SelectValue placeholder="등급 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="class_1">Class I (생명 위협)</SelectItem>
                      <SelectItem value="class_2">Class II (건강 위해)</SelectItem>
                      <SelectItem value="class_3">Class III (경미한 위해)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>제품명 *</Label>
                  <Input name="productName" required />
                </div>
                <div>
                  <Label>LOT 번호 *</Label>
                  <Input name="lotNumber" required />
                </div>
              </div>
              <div>
                <Label>회수 사유 *</Label>
                <Textarea name="recallReason" rows={3} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>생산일 *</Label>
                  <Input name="productionDate" type="date" required />
                </div>
                <div>
                  <Label>유통기한</Label>
                  <Input name="expiryDate" type="date" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>총 생산량 *</Label>
                  <Input name="totalProducedQuantity" type="number" step="0.01" required />
                </div>
                <div>
                  <Label>단위 *</Label>
                  <Input name="totalProducedUnit" placeholder="kg" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>출고량 *</Label>
                  <Input name="distributedQuantity" type="number" step="0.01" required />
                </div>
                <div>
                  <Label>재고량 *</Label>
                  <Input name="remainingInventory" type="number" step="0.01" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>목표 회수량 *</Label>
                  <Input name="targetRecallQuantity" type="number" step="0.01" required />
                </div>
                <div>
                  <Label>목표 회수율 (%) *</Label>
                  <Input name="targetRecallRate" type="number" step="0.01" defaultValue="100" required />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>취소</Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "등록 중..." : "등록"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* 시뮬레이션 상세 다이얼로그 */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>시뮬레이션 상세</DialogTitle>
              <DialogDescription>{selectedSim?.simulationNumber}</DialogDescription>
            </DialogHeader>
            {selectedSim && (
              <Tabs defaultValue="info" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="info">기본 정보</TabsTrigger>
                  <TabsTrigger value="tracking">유통 추적</TabsTrigger>
                  <TabsTrigger value="evaluation">효과성 평가</TabsTrigger>
                </TabsList>
                <TabsContent value="info" className="space-y-4 mt-4">
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 rounded">
                    <div><span className="text-sm text-gray-500">유형</span><p className="font-medium">{getTypeLabel(selectedSim.simulationType)}</p></div>
                    <div><span className="text-sm text-gray-500">실시일</span><p className="font-medium">{selectedSim.simulationDate}</p></div>
                    <div><span className="text-sm text-gray-500">등급</span><p className="font-medium">{getCategoryLabel(selectedSim.recallCategory)}</p></div>
                    <div><span className="text-sm text-gray-500">제품명</span><p className="font-medium">{selectedSim.productName}</p></div>
                    <div><span className="text-sm text-gray-500">LOT</span><p className="font-medium">{selectedSim.lotNumber}</p></div>
                    <div><span className="text-sm text-gray-500">상태</span><p>{getStatusBadge(selectedSim.status)}</p></div>
                  </div>
                  <div><span className="text-sm text-gray-500">회수 사유</span><p className="mt-1">{selectedSim.recallReason}</p></div>
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-blue-50 rounded">
                    <div><span className="text-sm text-gray-500">총 생산량</span><p className="font-medium">{selectedSim.totalProducedQuantity} {selectedSim.totalProducedUnit}</p></div>
                    <div><span className="text-sm text-gray-500">출고량</span><p className="font-medium">{selectedSim.distributedQuantity} {selectedSim.totalProducedUnit}</p></div>
                    <div><span className="text-sm text-gray-500">재고량</span><p className="font-medium">{selectedSim.remainingInventory} {selectedSim.totalProducedUnit}</p></div>
                  </div>
                </TabsContent>
                <TabsContent value="tracking" className="space-y-4 mt-4">
                  <div className="text-center py-8 text-gray-500">
                    <MapPin className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>유통 경로 추적 기능은 시뮬레이션 시작 후 사용 가능합니다.</p>
                    <p className="text-sm mt-1">거래처별 출고 현황 및 회수 진행 상황을 추적합니다.</p>
                  </div>
                </TabsContent>
                <TabsContent value="evaluation" className="space-y-4 mt-4">
                  {selectedSim.status === "completed" ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card>
                          <CardHeader className="pb-2"><CardTitle className="text-sm">추적성 점수</CardTitle></CardHeader>
                          <CardContent><p className="text-3xl font-bold">{selectedSim.traceabilityScore}/100</p></CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="pb-2"><CardTitle className="text-sm">대응 시간 점수</CardTitle></CardHeader>
                          <CardContent><p className="text-3xl font-bold">{selectedSim.responseTimeScore}/100</p></CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="pb-2"><CardTitle className="text-sm">회수율 점수</CardTitle></CardHeader>
                          <CardContent><p className="text-3xl font-bold">{selectedSim.recallRateScore}/100</p></CardContent>
                        </Card>
                        <Card>
                          <CardHeader className="pb-2"><CardTitle className="text-sm">종합 점수</CardTitle></CardHeader>
                          <CardContent><p className="text-3xl font-bold">{selectedSim.overallScore}/100</p></CardContent>
                        </Card>
                      </div>
                      <div className="p-4 bg-gray-50 rounded">
                        <p className="text-sm text-gray-500">평가 결과</p>
                        <div className="mt-1">{getResultBadge(selectedSim.result)}</div>
                      </div>
                      {selectedSim.findings && (
                        <div><span className="text-sm text-gray-500">발견 사항</span><p className="mt-1">{selectedSim.findings}</p></div>
                      )}
                      {selectedSim.improvements && (
                        <div><span className="text-sm text-gray-500">개선 사항</span><p className="mt-1">{selectedSim.improvements}</p></div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <BarChart3 className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                      <p>시뮬레이션 완료 후 효과성 평가 결과가 표시됩니다.</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>

        {/* 시뮬레이션 완료 다이얼로그 */}
        <Dialog open={isCompleteOpen} onOpenChange={setIsCompleteOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>시뮬레이션 완료 및 효과성 평가</DialogTitle>
              <DialogDescription>{selectedSim?.simulationNumber} 시뮬레이션의 결과를 입력합니다.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleComplete} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>실제 회수량 *</Label>
                  <Input name="actualRecalledQuantity" type="number" step="0.01" required />
                </div>
                <div>
                  <Label>실제 회수율 (%) *</Label>
                  <Input name="actualRecallRate" type="number" step="0.01" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>추적성 점수 (0-100) *</Label>
                  <Input name="traceabilityScore" type="number" min="0" max="100" required />
                </div>
                <div>
                  <Label>대응 시간 점수 (0-100) *</Label>
                  <Input name="responseTimeScore" type="number" min="0" max="100" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>회수율 점수 (0-100) *</Label>
                  <Input name="recallRateScore" type="number" min="0" max="100" required />
                </div>
                <div>
                  <Label>종합 점수 (0-100) *</Label>
                  <Input name="overallScore" type="number" min="0" max="100" required />
                </div>
              </div>
              <div>
                <Label>평가 결과 *</Label>
                <Select name="result" required>
                  <SelectTrigger><SelectValue placeholder="평가 결과 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excellent">우수</SelectItem>
                    <SelectItem value="good">양호</SelectItem>
                    <SelectItem value="fair">보통</SelectItem>
                    <SelectItem value="poor">미흡</SelectItem>
                    <SelectItem value="fail">불합격</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>발견 사항</Label>
                <Textarea name="findings" rows={3} />
              </div>
              <div>
                <Label>개선 사항</Label>
                <Textarea name="improvements" rows={3} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCompleteOpen(false)}>취소</Button>
                <Button type="submit" disabled={completeMutation.isPending}>
                  {completeMutation.isPending ? "저장 중..." : "완료 처리"}
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
