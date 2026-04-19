import { useState, useEffect, useCallback } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Edit, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function IntermediateManagement() {

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isComponentDialogOpen, setIsComponentDialogOpen] = useState(false);
  const [selectedIntermediate, setSelectedIntermediate] = useState<any>(null);
  const [autoCode, setAutoCode] = useState("");

  // 혼합재제 목록 조회
  const { data: intermediates, refetch } = trpc.intermediate.list.useQuery();

  // 원재료 목록 조회 (혼합재제 구성용)
  const { data: _rawMaterials } = trpc.material.list.useQuery({ limit: 9999 });
  const materials = (_rawMaterials as any)?.items ?? (Array.isArray(_rawMaterials) ? _rawMaterials : []);

  // 혼합재제 생성
  const createMutation = trpc.intermediate.create.useMutation({
    onSuccess: () => {
      toast.success("혼합재제가 생성되었습니다.");
      setIsCreateDialogOpen(false);
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(`생성 실패: ${error.message}`);
    },
  });

  // 혼합재제 수정
  const updateMutation = trpc.intermediate.update.useMutation({
    onSuccess: () => {
      toast.success("혼합재제가 수정되었습니다.");
      setIsEditDialogOpen(false);
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(`수정 실패: ${error.message}`);
    },
  });

  // 클라이언트 코드 자동 생성 (MIX-001 형식)
  const generateNextCode = useCallback(() => {
    const prefix = "MIX";
    const existingCodes = (intermediates || []).filter((i: any) => i.materialCode?.startsWith(prefix + "-")).map((i: any) => {
      const parts = (i.materialCode || "").split("-");
      return parseInt(parts[1] || "0", 10);
    }).filter((n: number) => !isNaN(n));
    const maxNum = existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
    return `${prefix}-${(maxNum + 1).toString().padStart(3, "0")}`;
  }, [intermediates]);

  // 생성 다이얼로그가 열릴 때 자동 코드 생성
  useEffect(() => {
    if (isCreateDialogOpen) {
      setAutoCode(generateNextCode());
    }
  }, [isCreateDialogOpen]);

  // 혼합재제 삭제
  const deleteMutation = trpc.intermediate.delete.useMutation({
    onSuccess: () => {
      toast.success("혼합재제가 삭제되었습니다.");
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(`삭제 실패: ${error.message}`);
    },
  });

  // 혼합재제 구성 추가
  const addComponentMutation = trpc.intermediate.addComponent.useMutation({
    onSuccess: () => {
      toast.success("구성 원재료가 추가되었습니다.");
      setIsComponentDialogOpen(false);
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(`추가 실패: ${error.message}`);
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      materialCode: autoCode,
      materialName: formData.get("materialName") as string,
      unit: formData.get("unit") as string,
      category: "MIXED",
    });
  };

  const handleEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    updateMutation.mutate({
      id: selectedIntermediate.id,
      materialName: formData.get("materialName") as string,
      unit: formData.get("unit") as string,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleAddComponent = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    addComponentMutation.mutate({
      intermediateMaterialId: selectedIntermediate.id,
      componentMaterialId: Number(formData.get("componentMaterialId")),
      ratioPercent: formData.get("quantity") as string,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">혼합재제 관리</h1>
          <p className="text-muted-foreground mt-2">
            팥앙금, 크림치즈 등 중간재를 관리합니다.
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          혼합재제 생성
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>혼합재제 목록</CardTitle>
          <CardDescription>
            등록된 혼합재제 목록입니다. 각 혼합재제의 구성 원재료를 관리할 수
            있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>코드</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>규격</TableHead>
                <TableHead>단위</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {intermediates?.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.materialCode}</TableCell>
                  <TableCell>{item.materialName}</TableCell>
                  <TableCell>{item.spec || "-"}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {item.status === "ACTIVE" ? "활성" : "비활성"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedIntermediate(item);
                        setIsComponentDialogOpen(true);
                      }}
                    >
                      <Package className="h-4 w-4 mr-1" />
                      구성 관리
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedIntermediate(item);
                        setIsEditDialogOpen(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 혼합재제 생성 다이얼로그 */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>혼합재제 생성</DialogTitle>
            <DialogDescription>
              새로운 혼합재제를 생성합니다. 코드는 자동으로 생성됩니다.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="materialCode">코드</Label>
                <Input
                  id="materialCode"
                  name="materialCode"
                  value={autoCode}
                  readOnly
                  className="bg-muted"
                  placeholder="자동 생성됩니다"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="materialName">이름</Label>
                <Input
                  id="materialName"
                  name="materialName"
                  placeholder="팥앙금"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="spec">규격</Label>
                <Input
                  id="spec"
                  name="spec"
                  placeholder="1kg"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="unit">단위</Label>
                <Input
                  id="unit"
                  name="unit"
                  placeholder="kg"
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createMutation.isPending}>
                생성
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 혼합재제 수정 다이얼로그 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>혼합재제 수정</DialogTitle>
            <DialogDescription>
              혼합재제 정보를 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>코드</Label>
                <Input
                  value={selectedIntermediate?.materialCode || ""}
                  disabled
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="materialName">이름</Label>
                <Input
                  id="materialName"
                  name="materialName"
                  defaultValue={selectedIntermediate?.materialName || ""}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="spec">규격</Label>
                <Input
                  id="spec"
                  name="spec"
                  defaultValue={selectedIntermediate?.spec || ""}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="unit">단위</Label>
                <Input
                  id="unit"
                  name="unit"
                  defaultValue={selectedIntermediate?.unit || ""}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={updateMutation.isPending}>
                수정
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 혼합재제 구성 관리 다이얼로그 */}
      <Dialog open={isComponentDialogOpen} onOpenChange={setIsComponentDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedIntermediate?.materialName} 구성 관리
            </DialogTitle>
            <DialogDescription>
              혼합재제를 구성하는 원재료를 추가/수정/삭제합니다.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddComponent}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="componentMaterialId">원재료</Label>
                <Select name="componentMaterialId" required>
                  <SelectTrigger>
                    <SelectValue placeholder="원재료 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {materials?.map((material: any) => (
                      <SelectItem key={material.id} value={String(material.id)}>
                        {material.materialName} ({material.materialCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="quantity">수량</Label>
                <Input
                  id="quantity"
                  name="quantity"
                  placeholder="100"
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={addComponentMutation.isPending}>
                추가
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
