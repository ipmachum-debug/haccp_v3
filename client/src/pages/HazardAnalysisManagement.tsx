import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Plus, Edit, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function HazardAnalysisManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAnalysis, setEditingAnalysis] = useState<any>(null);

  // 위해요소 분석 목록 조회
  const { data: analyses, refetch } = trpc.ccpMonitoring.getHazardAnalysis.useQuery({});

  // 위해요소 분석 생성
  const createMutation = trpc.ccpMonitoring.createHazardAnalysis.useMutation({
    onSuccess: () => {
      toast.success("위해요소 분석이 성공적으로 생성되었습니다.");
      refetch();
      setIsDialogOpen(false);
      setEditingAnalysis(null);
    },
    onError: (error) => {
      toast.error(`생성 실패: ${error.message}`);
    },
  });

  // 위해요소 분석 수정
  const updateMutation = trpc.ccpMonitoring.updateHazardAnalysis.useMutation({
    onSuccess: () => {
      toast.success("위해요소 분석이 성공적으로 수정되었습니다.");
      refetch();
      setIsDialogOpen(false);
      setEditingAnalysis(null);
    },
    onError: (error) => {
      toast.error(`수정 실패: ${error.message}`);
    },
  });

  // 위해요소 분석 삭제
  const deleteMutation = trpc.ccpMonitoring.deleteHazardAnalysis.useMutation({
    onSuccess: () => {
      toast.success("위해요소 분석이 성공적으로 삭제되었습니다.");
      refetch();
    },
    onError: (error) => {
      toast.error(`삭제 실패: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data = {
      processName: formData.get("processName") as string,
      hazardCategory: formData.get("hazardCategory") as "생물학적" | "화학적" | "물리적",
      hazardName: formData.get("hazardName") as string,
      cause: formData.get("cause") as string,
      severity: parseInt(formData.get("severity") as string),
      occurrence: parseInt(formData.get("occurrence") as string),
      riskLevel: parseInt(formData.get("riskLevel") as string),
      preventionMeasures: formData.get("preventionMeasures") as string,
      productCategory: formData.get("productCategory") as string || undefined,
    };

    if (editingAnalysis) {
      updateMutation.mutate({ id: editingAnalysis.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    deleteMutation.mutate({ id });
  };

  const handleEdit = (analysis: any) => {
    setEditingAnalysis(analysis);
    setIsDialogOpen(true);
  };

  const getRiskBadge = (level: number) => {
    const colors = {
      1: "bg-green-100 text-green-800",
      2: "bg-yellow-100 text-yellow-800",
      3: "bg-red-100 text-red-800",
    };
    const labels = { 1: "낮음", 2: "보통", 3: "높음" };
    return (
      <span className={`px-2 py-1 rounded text-xs font-semibold ${colors[level as keyof typeof colors]}`}>
        {labels[level as keyof typeof labels]}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-6 w-6" />
                위해요소 분석 관리
              </CardTitle>
              <CardDescription>
                HACCP 기준서에 따른 공정별 위해요소 분석을 등록하고 관리합니다.
              </CardDescription>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) setEditingAnalysis(null);
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  새 위해요소 분석
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingAnalysis ? "위해요소 분석 수정" : "새 위해요소 분석 등록"}</DialogTitle>
                  <DialogDescription>
                    HACCP 기준서 양식에 맞춰 위해요소 분석을 작성합니다.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="processName">공정명 *</Label>
                      <Input id="processName" name="processName" defaultValue={editingAnalysis?.processName} placeholder="예: 원료/보관, 1차분쇄, 가열(증숙)..." required />
                    </div>
                    <div>
                      <Label htmlFor="hazardCategory">구분 *</Label>
                      <Select name="hazardCategory" defaultValue={editingAnalysis?.hazardCategory} required>
                        <SelectTrigger>
                          <SelectValue placeholder="선택하세요" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="생물학적">생물학적</SelectItem>
                          <SelectItem value="화학적">화학적</SelectItem>
                          <SelectItem value="물리적">물리적</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="hazardName">명칭 *</Label>
                    <Input id="hazardName" name="hazardName" defaultValue={editingAnalysis?.hazardName} placeholder="예: 대장균(곡), 황색포도상구균, 금속조각..." required />
                  </div>

                  <div>
                    <Label htmlFor="cause">발생원인 *</Label>
                    <Textarea id="cause" name="cause" defaultValue={editingAnalysis?.cause} placeholder="예: 작업환경, 제조설비 및 기구용기 등 세척소독 관리 미흡으로 교차오염..." required />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="severity">심각성 *</Label>
                      <Select name="severity" defaultValue={editingAnalysis?.severity?.toString()} required>
                        <SelectTrigger>
                          <SelectValue placeholder="선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 (낮음)</SelectItem>
                          <SelectItem value="2">2 (보통)</SelectItem>
                          <SelectItem value="3">3 (높음)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="occurrence">발생가능성 *</Label>
                      <Select name="occurrence" defaultValue={editingAnalysis?.occurrence?.toString()} required>
                        <SelectTrigger>
                          <SelectValue placeholder="선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 (낮음)</SelectItem>
                          <SelectItem value="2">2 (보통)</SelectItem>
                          <SelectItem value="3">3 (높음)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="riskLevel">종합평가 *</Label>
                      <Select name="riskLevel" defaultValue={editingAnalysis?.riskLevel?.toString()} required>
                        <SelectTrigger>
                          <SelectValue placeholder="선택" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 (낮음)</SelectItem>
                          <SelectItem value="2">2 (보통)</SelectItem>
                          <SelectItem value="3">3 (높음)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="preventionMeasures">예방조치 및 관리방법 *</Label>
                    <Textarea id="preventionMeasures" name="preventionMeasures" defaultValue={editingAnalysis?.preventionMeasures} placeholder="예: 시행설명서 수행 또는 육안검사 실시, 작업환경 및 세척소독 관리..." required />
                  </div>

                  <div>
                    <Label htmlFor="productCategory">제품 카테고리</Label>
                    <Input id="productCategory" name="productCategory" defaultValue={editingAnalysis?.productCategory} placeholder="예: 전통떡류, 쑥개떡, 모시개떡..." />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      취소
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                      {editingAnalysis ? "수정" : "등록"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* 위해요소 분석 목록 */}
          <div className="space-y-4">
            {analyses?.map((analysis: any) => (
              <Card key={analysis.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{analysis.processName} - {analysis.hazardName}</CardTitle>
                      <CardDescription>
                        {analysis.hazardCategory} | {analysis.productCategory || "전체 제품"}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(analysis)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(analysis.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="font-semibold">발생원인:</span> {analysis.cause}
                    </div>
                    <div className="flex gap-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">심각성:</span> {getRiskBadge(analysis.severity)}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">발생가능성:</span> {getRiskBadge(analysis.occurrence)}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">종합평가:</span> {getRiskBadge(analysis.riskLevel)}
                      </div>
                    </div>
                    <div>
                      <span className="font-semibold">예방조치:</span> {analysis.preventionMeasures}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!analyses || analyses.length === 0) && (
              <div className="text-center py-12 text-muted-foreground">
                등록된 위해요소 분석이 없습니다. 새 위해요소 분석을 등록해주세요.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
