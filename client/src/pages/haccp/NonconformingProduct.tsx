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
import { AlertTriangle, Plus, Edit, FileText, CheckCircle } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

export default function NonconformingProduct({ embedded, ..._ }: { embedded?: boolean; [key: string]: any } = {}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedNcp, setSelectedNcp] = useState<any>(null);

  // 데이터 조회
  const { data: ncpList, isLoading, refetch } = trpc.nonconformingProduct.list.useQuery({
    siteId: 1,
    limit: 100,
  });

  // 생성 mutation
  const createMutation = trpc.nonconformingProduct.create.useMutation({
    onSuccess: () => {
      alert("부적합 제품이 성공적으로 등록되었습니다.");
      setIsCreateOpen(false);
      refetch();
    },
    onError: (error: { message: string }) => {
      alert(`등록 실패: ${error.message}`);
    },
  });

  // 수정 mutation
  const updateMutation = trpc.nonconformingProduct.update.useMutation({
    onSuccess: () => {
      alert("부적합 제품이 성공적으로 수정되었습니다.");
      refetch();
    },
    onError: (error: { message: string }) => {
      alert(`수정 실패: ${error.message}`);
    },
  });

  // 승인 mutation
  const approveMutation = trpc.nonconformingProduct.approve.useMutation({
    onSuccess: () => {
      alert("부적합 제품이 승인되었습니다.");
      refetch();
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    createMutation.mutate({
      siteId: 1,
      ncpNumber: formData.get("ncpNumber") as string,
      detectionDate: formData.get("detectionDate") as string,
      detectionSource: formData.get("detectionSource") as any,
      productName: formData.get("productName") as string,
      lotNumber: formData.get("lotNumber") as string,
      quantity: parseFloat(formData.get("quantity") as string),
      unit: formData.get("unit") as string,
      nonconformityType: formData.get("nonconformityType") as any,
      nonconformityDescription: formData.get("nonconformityDescription") as string,
      rootCause: formData.get("rootCause") as string,
      causeCategory: formData.get("causeCategory") as any,
    });
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedNcp) return;

    const formData = new FormData(e.currentTarget);

    updateMutation.mutate({
      id: selectedNcp.id,
      disposalMethod: formData.get("disposalMethod") as any,
      disposalDate: formData.get("disposalDate") as string,
      disposalDetails: formData.get("disposalDetails") as string,
      disposalCost: formData.get("disposalCost") ? parseFloat(formData.get("disposalCost") as string) : undefined,
      preventiveActions: formData.get("preventiveActions") as string,
      notes: formData.get("notes") as string,
    });
  };

  const openDetail = (ncp: any) => {
    setSelectedNcp(ncp);
    setIsDetailOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      detected: { label: "발견", className: "bg-red-500" },
      under_investigation: { label: "조사 중", className: "bg-yellow-500" },
      pending_disposal: { label: "처리 대기", className: "bg-orange-500" },
      disposed: { label: "처리 완료", className: "bg-blue-500" },
      closed: { label: "종결", className: "bg-gray-500" },
    };
    const config = statusConfig[status] || { label: status, className: "bg-gray-500" };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const getDetectionSourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      incoming_inspection: "입고 검사",
      in_process_inspection: "공정 검사",
      final_inspection: "출하 검사",
      customer_complaint: "고객 불만",
      internal_audit: "내부 감사",
      ccp_monitoring: "CCP 모니터링",
      other: "기타",
    };
    return labels[source] || source;
  };

  const getNonconformityTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      physical: "물리적",
      chemical: "화학적",
      biological: "생물학적",
      sensory: "관능적",
      packaging: "포장 불량",
      labeling: "표시 불량",
      specification: "규격 미달",
      other: "기타",
    };
    return labels[type] || type;
  };

  const getDisposalMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      pending: "처리 대기",
      rework: "재작업",
      downgrade: "등급 하향",
      alternative_use: "용도 변경",
      disposal: "폐기",
      return_to_supplier: "공급업체 반품",
      customer_return: "고객 반품",
    };
    return labels[method] || method;
  };

    const content = (
      <>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">부적합 제품 관리</h1>
            <p className="text-gray-500 mt-1">부적합 제품 등록, 원인 분석, 처리 관리</p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            부적합 제품 등록
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>부적합 제품 목록</CardTitle>
            <CardDescription>
              발견된 부적합 제품을 관리하고 처리합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">로딩 중...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>부적합 번호</TableHead>
                    <TableHead>발견일</TableHead>
                    <TableHead>{`${L("product")}명`}</TableHead>
                    <TableHead>LOT 번호</TableHead>
                    <TableHead>수량</TableHead>
                    <TableHead>발견 경로</TableHead>
                    <TableHead>부적합 유형</TableHead>
                    <TableHead>처리 방법</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ncpList?.map((ncp: any) => (
                    <TableRow key={ncp.id}>
                      <TableCell className="font-medium">{ncp.ncpNumber}</TableCell>
                      <TableCell>{ncp.detectionDate}</TableCell>
                      <TableCell>{ncp.productName}</TableCell>
                      <TableCell>{ncp.lotNumber || "-"}</TableCell>
                      <TableCell>{ncp.quantity} {ncp.unit}</TableCell>
                      <TableCell>{getDetectionSourceLabel(ncp.detectionSource)}</TableCell>
                      <TableCell>{getNonconformityTypeLabel(ncp.nonconformityType)}</TableCell>
                      <TableCell>{getDisposalMethodLabel(ncp.disposalMethod)}</TableCell>
                      <TableCell>{getStatusBadge(ncp.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openDetail(ncp)}
                          >
                            <Edit className="w-3 h-3 mr-1" />
                            상세
                          </Button>
                          {ncp.status === "pending_disposal" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => approveMutation.mutate({ id: ncp.id })}
                            >
                              <CheckCircle className="w-3 h-3 mr-1" />
                              승인
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!ncpList || ncpList.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                        등록된 부적합 제품이 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* 부적합 제품 등록 다이얼로그 */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>부적합 제품 등록</DialogTitle>
              <DialogDescription>
                새로운 부적합 제품을 등록합니다.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="ncpNumber">부적합 번호 *</Label>
                  <Input
                    id="ncpNumber"
                    name="ncpNumber"
                    placeholder="예: NCP-2026-001"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="detectionDate">발견일 *</Label>
                  <Input
                    id="detectionDate"
                    name="detectionDate"
                    type="date"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="detectionSource">발견 경로 *</Label>
                <Select name="detectionSource" required>
                  <SelectTrigger>
                    <SelectValue placeholder="발견 경로 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="incoming_inspection">입고 검사</SelectItem>
                    <SelectItem value="in_process_inspection">{`${L("process")} 검사`}</SelectItem>
                    <SelectItem value="final_inspection">출하 검사</SelectItem>
                    <SelectItem value="customer_complaint">고객 불만</SelectItem>
                    <SelectItem value="internal_audit">내부 감사</SelectItem>
                    <SelectItem value="ccp_monitoring">CCP 모니터링</SelectItem>
                    <SelectItem value="other">기타</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="productName">{`${L("product")}명 *`}</Label>
                  <Input
                    id="productName"
                    name="productName"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="lotNumber">LOT 번호</Label>
                  <Input
                    id="lotNumber"
                    name="lotNumber"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="quantity">수량 *</Label>
                  <Input
                    id="quantity"
                    name="quantity"
                    type="number"
                    step="0.01"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="unit">단위 *</Label>
                  <Input
                    id="unit"
                    name="unit"
                    placeholder="예: kg, 개"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="nonconformityType">부적합 유형 *</Label>
                <Select name="nonconformityType" required>
                  <SelectTrigger>
                    <SelectValue placeholder="부적합 유형 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="physical">물리적 (이물질 등)</SelectItem>
                    <SelectItem value="chemical">화학적 (잔류 농약 등)</SelectItem>
                    <SelectItem value="biological">생물학적 (미생물 등)</SelectItem>
                    <SelectItem value="sensory">관능적 (색, 맛, 냄새 등)</SelectItem>
                    <SelectItem value="packaging">포장 불량</SelectItem>
                    <SelectItem value="labeling">표시 불량</SelectItem>
                    <SelectItem value="specification">규격 미달</SelectItem>
                    <SelectItem value="other">기타</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="nonconformityDescription">부적합 상세 설명 *</Label>
                <Textarea
                  id="nonconformityDescription"
                  name="nonconformityDescription"
                  rows={4}
                  required
                />
              </div>

              <div>
                <Label htmlFor="rootCause">근본 원인</Label>
                <Textarea
                  id="rootCause"
                  name="rootCause"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="causeCategory">원인 분류</Label>
                <Select name="causeCategory">
                  <SelectTrigger>
                    <SelectValue placeholder="원인 분류 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="material">{`${L("material")}`}</SelectItem>
                    <SelectItem value="process">{`${L("process")}`}</SelectItem>
                    <SelectItem value="equipment">장비</SelectItem>
                    <SelectItem value="human_error">인적 오류</SelectItem>
                    <SelectItem value="environment">환경</SelectItem>
                    <SelectItem value="method">방법</SelectItem>
                    <SelectItem value="other">기타</SelectItem>
                  </SelectContent>
                </Select>
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

        {/* 부적합 제품 상세 다이얼로그 */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>부적합 제품 상세</DialogTitle>
              <DialogDescription>
                부적합 번호: {selectedNcp?.ncpNumber}
              </DialogDescription>
            </DialogHeader>
            {selectedNcp && (
              <Tabs defaultValue="info" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="info">기본 정보</TabsTrigger>
                  <TabsTrigger value="disposal">처리 정보</TabsTrigger>
                  <TabsTrigger value="prevention">재발 방지</TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded">
                    <div>
                      <span className="text-sm text-gray-500">발견일</span>
                      <p className="font-medium">{selectedNcp.detectionDate}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">발견 경로</span>
                      <p className="font-medium">{getDetectionSourceLabel(selectedNcp.detectionSource)}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">{`${L("product")}명`}</span>
                      <p className="font-medium">{selectedNcp.productName}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">LOT 번호</span>
                      <p className="font-medium">{selectedNcp.lotNumber || "-"}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">수량</span>
                      <p className="font-medium">{selectedNcp.quantity} {selectedNcp.unit}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">부적합 유형</span>
                      <p className="font-medium">{getNonconformityTypeLabel(selectedNcp.nonconformityType)}</p>
                    </div>
                  </div>

                  <div>
                    <span className="text-sm text-gray-500">부적합 상세 설명</span>
                    <p className="mt-1">{selectedNcp.nonconformityDescription}</p>
                  </div>

                  <div>
                    <span className="text-sm text-gray-500">근본 원인</span>
                    <p className="mt-1">{selectedNcp.rootCause || "-"}</p>
                  </div>
                </TabsContent>

                <TabsContent value="disposal" className="space-y-4 mt-4">
                  <form onSubmit={handleUpdate} className="space-y-4">
                    <div>
                      <Label htmlFor="disposalMethod">처리 방법</Label>
                      <Select name="disposalMethod" defaultValue={selectedNcp.disposalMethod}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">처리 대기</SelectItem>
                          <SelectItem value="rework">재작업</SelectItem>
                          <SelectItem value="downgrade">등급 하향</SelectItem>
                          <SelectItem value="alternative_use">용도 변경</SelectItem>
                          <SelectItem value="disposal">폐기</SelectItem>
                          <SelectItem value="return_to_supplier">공급업체 반품</SelectItem>
                          <SelectItem value="customer_return">고객 반품</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="disposalDate">처리일</Label>
                      <Input
                        id="disposalDate"
                        name="disposalDate"
                        type="date"
                        defaultValue={selectedNcp.disposalDate}
                      />
                    </div>

                    <div>
                      <Label htmlFor="disposalDetails">처리 상세 내용</Label>
                      <Textarea
                        id="disposalDetails"
                        name="disposalDetails"
                        defaultValue={selectedNcp.disposalDetails || ""}
                        rows={4}
                      />
                    </div>

                    <div>
                      <Label htmlFor="disposalCost">처리 비용 (원)</Label>
                      <Input
                        id="disposalCost"
                        name="disposalCost"
                        type="number"
                        step="0.01"
                        defaultValue={selectedNcp.disposalCost}
                      />
                    </div>

                    <Button type="submit" disabled={updateMutation.isPending}>
                      {updateMutation.isPending ? "저장 중..." : "저장"}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="prevention" className="space-y-4 mt-4">
                  <form onSubmit={handleUpdate} className="space-y-4">
                    <div>
                      <Label htmlFor="preventiveActions">재발 방지 대책</Label>
                      <Textarea
                        id="preventiveActions"
                        name="preventiveActions"
                        defaultValue={selectedNcp.preventiveActions || ""}
                        rows={6}
                        placeholder="재발 방지를 위한 구체적인 대책을 입력하세요"
                      />
                    </div>

                    <div>
                      <Label htmlFor="notes">비고</Label>
                      <Textarea
                        id="notes"
                        name="notes"
                        defaultValue={selectedNcp.notes || ""}
                        rows={4}
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
      </div>
      </>
    );
    if (embedded) return content;
    return <DashboardLayout>{content}</DashboardLayout>;
}
