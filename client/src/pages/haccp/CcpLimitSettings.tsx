import { useState } from "react";
import { trpc } from "../../lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { Pencil, Plus, Trash2, Shield, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

export default function CcpLimitSettings() {
  const L = useIndustryLabel();
  const [selectedCcpType, setSelectedCcpType] = useState<string>("all");
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingSpec, setEditingSpec] = useState<any>(null);

  // 제품 목록
  const { data: _rawProducts } = trpc.product.list.useQuery({ limit: 9999 });
  const products = (_rawProducts as any)?.items ?? (Array.isArray(_rawProducts) ? _rawProducts : []);

  // 제품-CCP 스펙 목록 조회
  const { data: specs, isLoading, refetch } = trpc.ccpMonitoring.getProductCcpSpecs.useQuery({
    ccpType: selectedCcpType === "all" ? undefined : selectedCcpType,
  });

  // 저장 mutation
  const saveMutation = trpc.ccpMonitoring.saveProductCcpSpec.useMutation({
    onSuccess: () => {
      toast.success("한계기준이 저장되었습니다");
      setShowEditDialog(false);
      setEditingSpec(null);
      refetch();
    },
    onError: (err: { message: string }) => toast.error(`저장 실패: ${err.message}`),
  });

  // 삭제 mutation
  const deleteMutation = trpc.ccpMonitoring.deleteProductCcpSpec.useMutation({
    onSuccess: () => {
      toast.success("한계기준이 삭제되었습니다");
      refetch();
    },
    onError: (err: { message: string }) => toast.error(`삭제 실패: ${err.message}`),
  });

  const specList = Array.isArray(specs) ? specs : [];

  const [formData, setFormData] = useState({
    productId: 0,
    ccpType: "CCP-1B",
    parameterName: "",
    legalStandard: "",
    internalStandard: "",
    criticalLimitMin: "",
    criticalLimitMax: "",
    operationalLimitMin: "",
    operationalLimitMax: "",
    unit: "",
    monitoringFrequency: "",
    correctiveAction: "",
  });

  const openNewDialog = () => {
    setEditingSpec(null);
    setFormData({
      productId: 0,
      ccpType: "CCP-1B",
      parameterName: "",
      legalStandard: "",
      internalStandard: "",
      criticalLimitMin: "",
      criticalLimitMax: "",
      operationalLimitMin: "",
      operationalLimitMax: "",
      unit: "",
      monitoringFrequency: "",
      correctiveAction: "",
    });
    setShowEditDialog(true);
  };

  const openEditDialog = (spec: any) => {
    setEditingSpec(spec);
    setFormData({
      productId: spec.product_id,
      ccpType: spec.ccp_type,
      parameterName: spec.parameter_name || "",
      legalStandard: spec.legal_standard || "",
      internalStandard: spec.internal_standard || "",
      criticalLimitMin: spec.critical_limit_min != null ? String(spec.critical_limit_min) : "",
      criticalLimitMax: spec.critical_limit_max != null ? String(spec.critical_limit_max) : "",
      operationalLimitMin: spec.operational_limit_min != null ? String(spec.operational_limit_min) : "",
      operationalLimitMax: spec.operational_limit_max != null ? String(spec.operational_limit_max) : "",
      unit: spec.unit || "",
      monitoringFrequency: spec.monitoring_frequency || "",
      correctiveAction: spec.corrective_action || "",
    });
    setShowEditDialog(true);
  };

  const handleSave = () => {
    if (!formData.productId) {
      toast.error("제품을 선택해주세요");
      return;
    }
    if (!formData.parameterName) {
      toast.error("관리 항목을 입력해주세요");
      return;
    }
    saveMutation.mutate({
      id: editingSpec?.id,
      productId: formData.productId,
      ccpType: formData.ccpType,
      parameterName: formData.parameterName,
      legalStandard: formData.legalStandard || undefined,
      internalStandard: formData.internalStandard || undefined,
      criticalLimitMin: formData.criticalLimitMin ? Number(formData.criticalLimitMin) : undefined,
      criticalLimitMax: formData.criticalLimitMax ? Number(formData.criticalLimitMax) : undefined,
      operationalLimitMin: formData.operationalLimitMin ? Number(formData.operationalLimitMin) : undefined,
      operationalLimitMax: formData.operationalLimitMax ? Number(formData.operationalLimitMax) : undefined,
      unit: formData.unit || undefined,
      monitoringFrequency: formData.monitoringFrequency || undefined,
      correctiveAction: formData.correctiveAction || undefined,
    });
  };

  const getDefaultParams = (ccpType: string) => {
    switch (ccpType) {
      case "CCP-1B": return [
        { name: "증숙 온도", unit: "℃", legalStd: "중심부 75℃ 이상 1분" },
        { name: "증숙 시간", unit: "분", legalStd: "제품별 상이" },
        { name: "증숙 압력", unit: "Mpa", legalStd: "제품별 상이" },
      ];
      case "CCP-2B": return [
        { name: "냉각 온도 (가장자리)", unit: "℃", legalStd: "15℃ 이하" },
        { name: "냉각 온도 (중심부)", unit: "℃", legalStd: "20℃ 이하" },
      ];
      case "CCP-3B": return [
        { name: "교반/볶음 온도", unit: "℃", legalStd: "중심부 75℃ 이상 1분" },
        { name: "가열 시간", unit: "분", legalStd: "제품별 상이" },
      ];
      case "CCP-4P": return [
        { name: "Fe 시험편 검출", unit: "-", legalStd: "적합" },
        { name: "STS 시험편 검출", unit: "-", legalStd: "적합" },
        { name: "감도 설정", unit: "mm", legalStd: "Fe 1.5mm / STS 2.0mm" },
      ];
      default: return [];
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Shield className="h-5 w-5" /> 한계기준 설정
          </h2>
          <p className="text-sm text-muted-foreground">
            제품별 CCP 한계기준(CL)과 운전기준(OL)을 설정합니다. 법적 기준과 자체 기준을 구분하여 관리합니다.
          </p>
        </div>
        <Button onClick={openNewDialog} className="min-h-[44px]">
          <Plus className="mr-2 h-4 w-4" /> 한계기준 추가
        </Button>
      </div>

      {/* CCP 유형 필터 */}
      <div className="flex gap-2 flex-wrap">
        {["all", "CCP-1B", "CCP-2B", "CCP-3B", "CCP-4P"].map((type) => (
          <Button
            key={type}
            variant={selectedCcpType === type ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCcpType(type)}
          >
            {type === "all" ? "전체" : type}
          </Button>
        ))}
      </div>

      {/* 안내 카드 */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">한계기준 설정 안내</p>
              <p className="text-sm text-amber-700 mt-1">
                <strong>한계기준(CL)</strong>: 식품안전에 위해를 방지하기 위한 최소/최대 허용 범위 (법적 기준 기반)<br />
                <strong>운전기준(OL)</strong>: CL 이탈 전 사전 경고를 위한 자체 운영 기준 (CL보다 엄격하게 설정 권장)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 한계기준 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">등록된 한계기준</CardTitle>
          <CardDescription>총 {specList.length}건</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">로딩 중...</p>
          ) : specList.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">등록된 한계기준이 없습니다</p>
              <p className="text-sm text-muted-foreground mt-2">위의 "한계기준 추가" 버튼을 눌러 제품별 한계기준을 설정해주세요</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{`${L("product")}`}</TableHead>
                    <TableHead>CCP 유형</TableHead>
                    <TableHead>관리 항목</TableHead>
                    <TableHead>법적 기준</TableHead>
                    <TableHead>자체 기준</TableHead>
                    <TableHead>한계기준(CL)</TableHead>
                    <TableHead>운전기준(OL)</TableHead>
                    <TableHead>단위</TableHead>
                    <TableHead>모니터링 주기</TableHead>
                    <TableHead>작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {specList.map((spec: any) => {
                    const product = products.find((p: any) => p.id === spec.product_id);
                    return (
                      <TableRow key={spec.id}>
                        <TableCell className="font-medium">{product?.productName || product?.product_name || `제품#${spec.product_id}`}</TableCell>
                        <TableCell><Badge variant="outline">{spec.ccp_type}</Badge></TableCell>
                        <TableCell>{spec.parameter_name}</TableCell>
                        <TableCell className="text-sm">{spec.legal_standard || '-'}</TableCell>
                        <TableCell className="text-sm">{spec.internal_standard || '-'}</TableCell>
                        <TableCell>
                          {spec.critical_limit_min != null || spec.critical_limit_max != null ? (
                            <span className="text-red-600 font-medium">
                              {spec.critical_limit_min ?? '-'} ~ {spec.critical_limit_max ?? '-'}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          {spec.operational_limit_min != null || spec.operational_limit_max != null ? (
                            <span className="text-amber-600 font-medium">
                              {spec.operational_limit_min ?? '-'} ~ {spec.operational_limit_max ?? '-'}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell>{spec.unit || '-'}</TableCell>
                        <TableCell>{spec.monitoring_frequency || '-'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(spec)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => {
                              if (confirm("이 한계기준을 삭제하시겠습니까?")) {
                                deleteMutation.mutate({ id: spec.id });
                              }
                            }}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 편집 다이얼로그 */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSpec ? "한계기준 수정" : "한계기준 추가"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>{`${L("product")} *`}</Label>
              <Select
                value={formData.productId ? String(formData.productId) : ""}
                onValueChange={(v) => setFormData(prev => ({ ...prev, productId: Number(v) }))}
              >
                <SelectTrigger><SelectValue placeholder={`${L("product")} 선택`} /></SelectTrigger>
                <SelectContent>
                  {products.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.productName || p.product_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>CCP 유형 *</Label>
              <Select value={formData.ccpType} onValueChange={(v) => setFormData(prev => ({ ...prev, ccpType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CCP-1B">CCP-1B (가열/증숙)</SelectItem>
                  <SelectItem value="CCP-2B">CCP-2B (냉각)</SelectItem>
                  <SelectItem value="CCP-3B">CCP-3B (교반/볶음)</SelectItem>
                  <SelectItem value="CCP-4P">CCP-4P (금속검출)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>관리 항목 *</Label>
              <Input value={formData.parameterName} onChange={(e) => setFormData(prev => ({ ...prev, parameterName: e.target.value }))} placeholder="예: 증숙 온도" />
              {/* 빠른 입력 버튼 */}
              <div className="flex flex-wrap gap-1 mt-1">
                {getDefaultParams(formData.ccpType).map((param) => (
                  <Button
                    key={param.name}
                    variant="outline"
                    size="sm"
                    className="text-xs h-6"
                    onClick={() => setFormData(prev => ({
                      ...prev,
                      parameterName: param.name,
                      unit: param.unit,
                      legalStandard: param.legalStd,
                    }))}
                  >
                    {param.name}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>단위</Label>
              <Input value={formData.unit} onChange={(e) => setFormData(prev => ({ ...prev, unit: e.target.value }))} placeholder="예: ℃, 분, Mpa" />
            </div>
            <div>
              <Label>법적 기준</Label>
              <Input value={formData.legalStandard} onChange={(e) => setFormData(prev => ({ ...prev, legalStandard: e.target.value }))} placeholder="예: 중심부 75℃ 이상 1분" />
            </div>
            <div>
              <Label>자체 기준</Label>
              <Input value={formData.internalStandard} onChange={(e) => setFormData(prev => ({ ...prev, internalStandard: e.target.value }))} placeholder="예: 중심부 80℃ 이상 3분" />
            </div>
            <div className="md:col-span-2">
              <p className="text-sm font-medium text-red-600 mb-2">한계기준 (Critical Limit)</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>최소값</Label>
                  <Input type="number" step="0.01" value={formData.criticalLimitMin} onChange={(e) => setFormData(prev => ({ ...prev, criticalLimitMin: e.target.value }))} placeholder="최소" />
                </div>
                <div>
                  <Label>최대값</Label>
                  <Input type="number" step="0.01" value={formData.criticalLimitMax} onChange={(e) => setFormData(prev => ({ ...prev, criticalLimitMax: e.target.value }))} placeholder="최대" />
                </div>
              </div>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm font-medium text-amber-600 mb-2">운전기준 (Operational Limit)</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>최소값</Label>
                  <Input type="number" step="0.01" value={formData.operationalLimitMin} onChange={(e) => setFormData(prev => ({ ...prev, operationalLimitMin: e.target.value }))} placeholder="최소" />
                </div>
                <div>
                  <Label>최대값</Label>
                  <Input type="number" step="0.01" value={formData.operationalLimitMax} onChange={(e) => setFormData(prev => ({ ...prev, operationalLimitMax: e.target.value }))} placeholder="최대" />
                </div>
              </div>
            </div>
            <div>
              <Label>모니터링 주기</Label>
              <Input value={formData.monitoringFrequency} onChange={(e) => setFormData(prev => ({ ...prev, monitoringFrequency: e.target.value }))} placeholder="예: 배치당 1회, 2시간마다" />
            </div>
            <div>
              <Label>개선 조치</Label>
              <Input value={formData.correctiveAction} onChange={(e) => setFormData(prev => ({ ...prev, correctiveAction: e.target.value }))} placeholder="이탈 시 개선 조치 내용" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>취소</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
