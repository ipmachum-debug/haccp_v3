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
import { AlertTriangle, Plus, Edit, FileText, Download, CheckCircle, XCircle } from "lucide-react";
import { RiskMatrix } from "@/components/RiskMatrix";
import DashboardLayout from "@/components/DashboardLayout";

export default function HazardAnalysis({ embedded, ..._ }: { embedded?: boolean; [key: string]: any } = {}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number>(1);
  const [editingHazard, setEditingHazard] = useState<any>(null);

  // 데이터 조회
  const { data: hazardList, isLoading, refetch } = trpc.hazardAnalysis.listByProduct.useQuery({
    productId: selectedProductId,
  });
  const { data: _rawProducts } = trpc.product.list.useQuery({ limit: 9999 });
  const products = (_rawProducts as any)?.items ?? (Array.isArray(_rawProducts) ? _rawProducts : []);

  // 생성 mutation
  const createMutation = trpc.hazardAnalysis.create.useMutation({
    onSuccess: () => {
      alert("위험 분석이 성공적으로 등록되었습니다.");
      setIsCreateOpen(false);
      refetch();
    },
    onError: (error: any) => {
      alert(`등록 실패: ${error.message}`);
    },
  });

  // 수정 mutation
  const updateMutation = trpc.hazardAnalysis.update.useMutation({
    onSuccess: () => {
      alert("위험 분석이 성공적으로 수정되었습니다.");
      setEditingHazard(null);
      refetch();
    },
    onError: (error: any) => {
      alert(`수정 실패: ${error.message}`);
    },
  });

  // CCP 지정 mutation
  const designateCcpMutation = trpc.hazardAnalysis.designateAsCcp.useMutation({
    onSuccess: () => {
      alert("CCP로 지정되었습니다.");
      refetch();
    },
  });

  // 승인 mutation
  const approveMutation = trpc.hazardAnalysis.approve.useMutation({
    onSuccess: () => {
      alert("위험 분석이 승인되었습니다.");
      refetch();
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    createMutation.mutate({
      productId: Number(formData.get("productId")),
      siteId: 1,
      processStep: formData.get("processStep") as string,
      hazardType: formData.get("hazardType") as "biological" | "chemical" | "physical",
      hazardDescription: formData.get("hazardDescription") as string,
      severity: Number(formData.get("severity")),
      likelihood: Number(formData.get("likelihood")),
      controlMeasures: formData.get("controlMeasures") as string || undefined,
      monitoringProcedure: formData.get("monitoringProcedure") as string || undefined,
      criticalLimit: formData.get("criticalLimit") as string || undefined,
      analyzedDate: formData.get("analyzedDate") as string,
    });
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    updateMutation.mutate({
      id: editingHazard.id,
      processStep: formData.get("processStep") as string,
      hazardType: formData.get("hazardType") as "biological" | "chemical" | "physical",
      hazardDescription: formData.get("hazardDescription") as string,
      severity: Number(formData.get("severity")),
      likelihood: Number(formData.get("likelihood")),
      controlMeasures: formData.get("controlMeasures") as string || undefined,
      monitoringProcedure: formData.get("monitoringProcedure") as string || undefined,
      criticalLimit: formData.get("criticalLimit") as string || undefined,
    });
  };

  const handleDesignateAsCcp = (hazardId: number) => {
    const ccpNumber = prompt("CCP 번호를 입력하세요 (예: CCP-1):");
    if (ccpNumber) {
      designateCcpMutation.mutate({ id: hazardId, ccpNumber });
    }
  };

  const handleDownloadReport = () => {
    if (!hazardList || hazardList.length === 0) {
      alert("보고서를 생성할 데이터가 없습니다.");
      return;
    }

    const doc = new jsPDF();
    
    // 한글 폰트 지원 부족으로 영문으로 작성
    doc.setFontSize(20);
    doc.text("Hazard Analysis Report", 105, 20, { align: "center" });
    
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString("ko-KR")}`, 20, 30);
    doc.text(`Product ID: ${selectedProductId}`, 20, 36);
    
    let yPos = 46;
    hazardList.forEach((hazard: any, index: number) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(12);
      doc.text(`${index + 1}. ${hazard.processStep}`, 20, yPos);
      yPos += 7;
      
      doc.setFontSize(9);
      doc.text(`Type: ${hazard.hazardType}`, 25, yPos);
      yPos += 5;
      doc.text(`Description: ${hazard.hazardDescription.substring(0, 80)}`, 25, yPos);
      yPos += 5;
      doc.text(`Severity: ${hazard.severity}/5, Likelihood: ${hazard.likelihood}/5`, 25, yPos);
      yPos += 5;
      doc.text(`Risk Score: ${hazard.riskScore} (${hazard.riskLevel})`, 25, yPos);
      yPos += 5;
      doc.text(`CCP: ${hazard.isCcp === 1 ? "Yes (" + (hazard.ccpNumber || "N/A") + ")" : "No"}`, 25, yPos);
      yPos += 5;
      doc.text(`Status: ${hazard.status}`, 25, yPos);
      yPos += 10;
    });
    
    doc.save(`hazard-analysis-report-${new Date().toISOString().split('T')[0]}.pdf`);
    alert("보고서가 성공적으로 다운로드되었습니다.");
  };

  const getRiskLevelBadge = (riskLevel: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      low: "secondary",
      medium: "default",
      high: "destructive",
      critical: "destructive",
    };
    return (
      <Badge variant={variants[riskLevel] || "default"}>
        {riskLevel === "low" && "낮음"}
        {riskLevel === "medium" && "중간"}
        {riskLevel === "high" && "높음"}
        {riskLevel === "critical" && "매우 높음"}
      </Badge>
    );
  };

  const getHazardTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      biological: "생물학적",
      chemical: "화학적",
      physical: "물리적",
    };
    return labels[type] || type;
  };

  if (isLoading) {
    return <div className="p-6">로딩 중...</div>;
  }

    const content = (
      <>
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-8 w-8" />
            위험 분석 (HACCP 원칙 1)
          </h1>
          <p className="text-muted-foreground mt-2">
            제품별 위험 요소를 식별하고 평가하여 중요관리점(CCP)을 결정합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownloadReport}>
            <Download className="mr-2 h-4 w-4" />
            보고서 다운로드
          </Button>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            위험 분석 등록
          </Button>
        </div>
      </div>

      {/* 제품 필터 */}
      <Card>
        <CardHeader>
          <CardTitle>제품 선택</CardTitle>
          <CardDescription>분석할 제품을 선택하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedProductId.toString()}
            onValueChange={(value) => setSelectedProductId(Number(value))}
          >
            <SelectTrigger className="w-[300px]">
              <SelectValue placeholder="제품 선택" />
            </SelectTrigger>
            <SelectContent>
              {products?.map((product: any) => (
                <SelectItem key={product.id} value={product.id.toString()}>
                  {product.productName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* 위험도 매트릭스 차트 */}
      {hazardList && hazardList.length > 0 && (
        <RiskMatrix hazards={hazardList} />
      )}

      {/* 통계 카드 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">전체 위험 분석</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hazardList?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CCP 지정</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {hazardList?.filter((h: any) => h.isCcp === 1).length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">높은 위험도</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {hazardList?.filter((h: any) => h.riskLevel === "high" || h.riskLevel === "critical").length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">승인 대기</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {hazardList?.filter((h: any) => h.status === "draft").length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 위험 분석 목록 */}
      <Card>
        <CardHeader>
          <CardTitle>위험 분석 목록</CardTitle>
          <CardDescription>
            등록된 위험 분석 항목을 확인하고 관리합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>공정 단계</TableHead>
                <TableHead>위험 유형</TableHead>
                <TableHead>위험 요소</TableHead>
                <TableHead>심각도</TableHead>
                <TableHead>발생 가능성</TableHead>
                <TableHead>위험도</TableHead>
                <TableHead>CCP</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hazardList && hazardList.length > 0 ? (
                hazardList.map((hazard: any) => (
                  <TableRow key={hazard.id}>
                    <TableCell className="font-medium">{hazard.processStep}</TableCell>
                    <TableCell>{getHazardTypeLabel(hazard.hazardType)}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {hazard.hazardDescription}
                    </TableCell>
                    <TableCell>{hazard.severity}</TableCell>
                    <TableCell>{hazard.likelihood}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{hazard.riskScore}</span>
                        {getRiskLevelBadge(hazard.riskLevel)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {hazard.isCcp === 1 ? (
                        <Badge>{hazard.ccpNumber || "CCP"}</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDesignateAsCcp(hazard.id)}
                        >
                          CCP 지정
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={hazard.status === "approved" ? "default" : "secondary"}>
                        {hazard.status === "draft" && "초안"}
                        {hazard.status === "approved" && "승인"}
                        {hazard.status === "rejected" && "반려"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingHazard(hazard)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {hazard.status === "draft" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => approveMutation.mutate({ id: hazard.id })}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    등록된 위험 분석이 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 등록 다이얼로그 */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>새로운 위험 분석 등록</DialogTitle>
              <DialogDescription>
                제품의 공정 단계별 위험 요소를 식별하고 평가합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="productId">제품 *</Label>
                <Select name="productId" defaultValue={selectedProductId.toString()} required>
                  <SelectTrigger>
                    <SelectValue placeholder="제품 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.map((product: any) => (
                      <SelectItem key={product.id} value={product.id.toString()}>
                        {product.productName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="processStep">공정 단계 *</Label>
                <Input
                  id="processStep"
                  name="processStep"
                  placeholder="예: 원료 입고, 가열, 냉각"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="hazardType">위험 유형 *</Label>
                <Select name="hazardType" required>
                  <SelectTrigger>
                    <SelectValue placeholder="위험 유형 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="biological">생물학적 (미생물, 병원균)</SelectItem>
                    <SelectItem value="chemical">화학적 (잔류 농약, 중금속)</SelectItem>
                    <SelectItem value="physical">물리적 (이물질, 파편)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="hazardDescription">위험 요소 설명 *</Label>
                <Textarea
                  id="hazardDescription"
                  name="hazardDescription"
                  placeholder="위험 요소에 대한 상세 설명"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="severity">심각도 (1-5) *</Label>
                  <Select name="severity" required>
                    <SelectTrigger>
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 - 매우 낮음</SelectItem>
                      <SelectItem value="2">2 - 낮음</SelectItem>
                      <SelectItem value="3">3 - 보통</SelectItem>
                      <SelectItem value="4">4 - 높음</SelectItem>
                      <SelectItem value="5">5 - 매우 높음</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="likelihood">발생 가능성 (1-5) *</Label>
                  <Select name="likelihood" required>
                    <SelectTrigger>
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 - 매우 낮음</SelectItem>
                      <SelectItem value="2">2 - 낮음</SelectItem>
                      <SelectItem value="3">3 - 보통</SelectItem>
                      <SelectItem value="4">4 - 높음</SelectItem>
                      <SelectItem value="5">5 - 매우 높음</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="controlMeasures">관리 방법</Label>
                <Textarea
                  id="controlMeasures"
                  name="controlMeasures"
                  placeholder="위험 요소를 관리하기 위한 방법"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="monitoringProcedure">모니터링 절차</Label>
                <Textarea
                  id="monitoringProcedure"
                  name="monitoringProcedure"
                  placeholder="위험 요소를 모니터링하는 절차"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="criticalLimit">한계기준</Label>
                <Input
                  id="criticalLimit"
                  name="criticalLimit"
                  placeholder="예: 75°C 이상, pH 4.5 이하"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="analyzedDate">분석 날짜 *</Label>
                <Input
                  id="analyzedDate"
                  name="analyzedDate"
                  type="date"
                  required
                />
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

      {/* 수정 다이얼로그 */}
      {editingHazard && (
        <Dialog open={!!editingHazard} onOpenChange={() => setEditingHazard(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleUpdate}>
              <DialogHeader>
                <DialogTitle>위험 분석 수정</DialogTitle>
                <DialogDescription>
                  위험 분석 정보를 수정합니다.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-processStep">공정 단계 *</Label>
                  <Input
                    id="edit-processStep"
                    name="processStep"
                    defaultValue={editingHazard.processStep}
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="edit-hazardType">위험 유형 *</Label>
                  <Select name="hazardType" defaultValue={editingHazard.hazardType} required>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="biological">생물학적</SelectItem>
                      <SelectItem value="chemical">화학적</SelectItem>
                      <SelectItem value="physical">물리적</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="edit-hazardDescription">위험 요소 설명 *</Label>
                  <Textarea
                    id="edit-hazardDescription"
                    name="hazardDescription"
                    defaultValue={editingHazard.hazardDescription}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-severity">심각도 (1-5) *</Label>
                    <Select name="severity" defaultValue={editingHazard.severity.toString()} required>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 - 매우 낮음</SelectItem>
                        <SelectItem value="2">2 - 낮음</SelectItem>
                        <SelectItem value="3">3 - 보통</SelectItem>
                        <SelectItem value="4">4 - 높음</SelectItem>
                        <SelectItem value="5">5 - 매우 높음</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit-likelihood">발생 가능성 (1-5) *</Label>
                    <Select name="likelihood" defaultValue={editingHazard.likelihood.toString()} required>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 - 매우 낮음</SelectItem>
                        <SelectItem value="2">2 - 낮음</SelectItem>
                        <SelectItem value="3">3 - 보통</SelectItem>
                        <SelectItem value="4">4 - 높음</SelectItem>
                        <SelectItem value="5">5 - 매우 높음</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="edit-controlMeasures">관리 방법</Label>
                  <Textarea
                    id="edit-controlMeasures"
                    name="controlMeasures"
                    defaultValue={editingHazard.controlMeasures || ""}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="edit-monitoringProcedure">모니터링 절차</Label>
                  <Textarea
                    id="edit-monitoringProcedure"
                    name="monitoringProcedure"
                    defaultValue={editingHazard.monitoringProcedure || ""}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="edit-criticalLimit">한계기준</Label>
                  <Input
                    id="edit-criticalLimit"
                    name="criticalLimit"
                    defaultValue={editingHazard.criticalLimit || ""}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingHazard(null)}>
                  취소
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? "수정 중..." : "수정"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
      </>
    );
    if (embedded) return content;
    return <DashboardLayout>{content}</DashboardLayout>;
}
