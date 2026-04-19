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
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { FileText, Plus, Edit, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function ProductSpecificationManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSpec, setEditingSpec] = useState<any>(null);

  // 제품설명서 목록 조회
  const { data: specifications, refetch } = trpc.ccpMonitoring.getProductSpecifications.useQuery({});

  // 제품설명서 생성
  const createMutation = trpc.ccpMonitoring.createProductSpecification.useMutation({
    onSuccess: () => {
      toast.success("제품설명서가 성공적으로 생성되었습니다.");
      refetch();
      setIsDialogOpen(false);
      setEditingSpec(null);
    },
    onError: (error: { message: string }) => {
      toast.error(`생성 실패: ${error.message}`);
    },
  });

  // 제품설명서 수정
  const updateMutation = trpc.ccpMonitoring.updateProductSpecification.useMutation({
    onSuccess: () => {
      toast.success("제품설명서가 성공적으로 수정되었습니다.");
      refetch();
      setIsDialogOpen(false);
      setEditingSpec(null);
    },
    onError: (error: { message: string }) => {
      toast.error(`수정 실패: ${error.message}`);
    },
  });

  // 제품설명서 삭제
  const deleteMutation = trpc.ccpMonitoring.deleteProductSpecification.useMutation({
    onSuccess: () => {
      toast.success("제품설명서가 성공적으로 삭제되었습니다.");
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(`삭제 실패: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const data = {
      productName: formData.get("productName") as string,
      foodType: formData.get("foodType") as string,
      appearance: formData.get("appearance") as string,
      reportDate: new Date(formData.get("reportDate") as string),
      reporter: formData.get("reporter") as string,
      reportNumber: formData.get("reportNumber") as string,
      ingredients: formData.get("ingredients") as string,
      packageSizes: formData.get("packageSizes") as string,
      biologicalSpecs: formData.get("biologicalSpecs") as string,
      chemicalSpecs: formData.get("chemicalSpecs") as string,
      physicalSpecs: formData.get("physicalSpecs") as string,
      storageInstructions: formData.get("storageInstructions") as string,
      productUse: formData.get("productUse") as string,
      consumptionMethod: formData.get("consumptionMethod") as string,
      expiryPeriod: formData.get("expiryPeriod") as string,
      packagingMethod: formData.get("packagingMethod") as string,
      packagingMaterial: formData.get("packagingMaterial") as string,
      labelingRequirements: formData.get("labelingRequirements") as string,
      otherNotes: formData.get("otherNotes") as string || undefined,
    };

    if (editingSpec) {
      updateMutation.mutate({ id: editingSpec.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    deleteMutation.mutate({ id });
  };

  const handleEdit = (spec: any) => {
    setEditingSpec(spec);
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-6 w-6" />
                제품설명서 관리
              </CardTitle>
              <CardDescription>
                HACCP 기준서에 따른 제품설명서를 등록하고 관리합니다.
              </CardDescription>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) setEditingSpec(null);
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  새 제품설명서
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingSpec ? "제품설명서 수정" : "새 제품설명서 등록"}</DialogTitle>
                  <DialogDescription>
                    HACCP 기준서 양식에 맞춰 제품설명서를 작성합니다.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* 기본 정보 */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg">기본 정보</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="productName">제품명 *</Label>
                        <Input id="productName" name="productName" defaultValue={editingSpec?.productName} required />
                      </div>
                      <div>
                        <Label htmlFor="foodType">식품의 유형 *</Label>
                        <Input id="foodType" name="foodType" defaultValue={editingSpec?.foodType || "떡류"} required />
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor="appearance">성상 *</Label>
                        <Input id="appearance" name="appearance" defaultValue={editingSpec?.appearance || "고체형태로 고유의 향미를 가지고 이미,이취가 없음"} required />
                      </div>
                      <div>
                        <Label htmlFor="reportDate">품목제조보고 연월일 *</Label>
                        <Input id="reportDate" name="reportDate" type="date" defaultValue={editingSpec?.reportDate} required />
                      </div>
                      <div>
                        <Label htmlFor="reporter">보고자 *</Label>
                        <Input id="reporter" name="reporter" defaultValue={editingSpec?.reporter} required />
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor="reportNumber">품목제조보고 번호 *</Label>
                        <Input id="reportNumber" name="reportNumber" defaultValue={editingSpec?.reportNumber} required />
                      </div>
                    </div>
                  </div>

                  {/* 성분배합비율 */}
                  <div>
                    <Label htmlFor="ingredients">성분배합비율 *</Label>
                    <Textarea id="ingredients" name="ingredients" defaultValue={editingSpec?.ingredients} placeholder="예: 찹쌀(75%), 백설탕(9%), 밤다이스(1.1%)..." required />
                  </div>

                  {/* 제조(포장) 단위 */}
                  <div>
                    <Label htmlFor="packageSizes">제조(포장) 단위 *</Label>
                    <Input id="packageSizes" name="packageSizes" defaultValue={editingSpec?.packageSizes} placeholder="예: 40g, 50g, 60g, 80g, 400g..." required />
                  </div>

                  {/* 완제품의 규격 */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg">완제품의 규격</h3>
                    <div>
                      <Label htmlFor="biologicalSpecs">생물학적 규격 *</Label>
                      <Textarea id="biologicalSpecs" name="biologicalSpecs" defaultValue={editingSpec?.biologicalSpecs} placeholder="대장균, 일반세균 등 규격 입력..." required />
                    </div>
                    <div>
                      <Label htmlFor="chemicalSpecs">화학적 규격 *</Label>
                      <Textarea id="chemicalSpecs" name="chemicalSpecs" defaultValue={editingSpec?.chemicalSpecs} placeholder="보존료 등 규격 입력..." required />
                    </div>
                    <div>
                      <Label htmlFor="physicalSpecs">물리적 규격 *</Label>
                      <Textarea id="physicalSpecs" name="physicalSpecs" defaultValue={editingSpec?.physicalSpecs} placeholder="이물, 금속이물 등 규격 입력..." required />
                    </div>
                  </div>

                  {/* 보관·유통 상의 주의사항 */}
                  <div>
                    <Label htmlFor="storageInstructions">보관·유통 상의 주의사항 *</Label>
                    <Textarea id="storageInstructions" name="storageInstructions" defaultValue={editingSpec?.storageInstructions} placeholder="보관, 운송, 유통 방법 입력..." required />
                  </div>

                  {/* 제품용도 및 유통기간 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="productUse">제품용도 *</Label>
                      <Input id="productUse" name="productUse" defaultValue={editingSpec?.productUse} placeholder="예: 간식용 또는 식사대용" required />
                    </div>
                    <div>
                      <Label htmlFor="consumptionMethod">섭취방법 *</Label>
                      <Input id="consumptionMethod" name="consumptionMethod" defaultValue={editingSpec?.consumptionMethod} placeholder="예: 그대로 섭취" required />
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="expiryPeriod">소비기한 *</Label>
                      <Input id="expiryPeriod" name="expiryPeriod" defaultValue={editingSpec?.expiryPeriod} placeholder="예: 제조일로부터 12개월 [냉동보관(-18℃이하) 보관]" required />
                    </div>
                  </div>

                  {/* 포장방법 및 재질 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="packagingMethod">포장방법 *</Label>
                      <Textarea id="packagingMethod" name="packagingMethod" defaultValue={editingSpec?.packagingMethod} placeholder="예: PE로 포장후 박스포장..." required />
                    </div>
                    <div>
                      <Label htmlFor="packagingMaterial">포장재질 *</Label>
                      <Textarea id="packagingMaterial" name="packagingMaterial" defaultValue={editingSpec?.packagingMaterial} placeholder="예: 내포장재 – PE&PP, 외포장재 – 종이박스" required />
                    </div>
                  </div>

                  {/* 표시사항 */}
                  <div>
                    <Label htmlFor="labelingRequirements">표시사항 *</Label>
                    <Textarea id="labelingRequirements" name="labelingRequirements" defaultValue={editingSpec?.labelingRequirements} placeholder="식품의유형, 유통전문매원, 제조원, 원재료명 및 함량..." required />
                  </div>

                  {/* 기타 필요한 사항 */}
                  <div>
                    <Label htmlFor="otherNotes">기타 필요한 사항</Label>
                    <Textarea id="otherNotes" name="otherNotes" defaultValue={editingSpec?.otherNotes} placeholder="기타 필요한 사항을 입력하세요 (선택사항)" />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      취소
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                      {editingSpec ? "수정" : "등록"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* 제품설명서 목록 */}
          <div className="space-y-4">
            {specifications?.map((spec: any) => (
              <Card key={spec.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{spec.productName}</CardTitle>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(spec)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(spec.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <CardDescription>
                    {spec.foodType} | 보고번호: {spec.reportNumber}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-semibold">성상:</span> {spec.appearance}
                    </div>
                    <div>
                      <span className="font-semibold">보고자:</span> {spec.reporter}
                    </div>
                    <div>
                      <span className="font-semibold">제품용도:</span> {spec.productUse}
                    </div>
                    <div>
                      <span className="font-semibold">소비기한:</span> {spec.expiryPeriod}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!specifications || specifications.length === 0) && (
              <div className="text-center py-12 text-muted-foreground">
                등록된 제품설명서가 없습니다. 새 제품설명서를 등록해주세요.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
