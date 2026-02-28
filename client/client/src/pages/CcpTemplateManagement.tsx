import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function CcpTemplateManagement({ embedded = false }: { embedded?: boolean } = {}) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);

  const { data: templates, refetch } = trpc.ccpTemplate.list.useQuery();
  const createMutation = trpc.ccpTemplate.create.useMutation();
  const updateMutation = trpc.ccpTemplate.update.useMutation();
  const deleteMutation = trpc.ccpTemplate.delete.useMutation();

  const [formData, setFormData] = useState({
    templateName: "",
    productNamePattern: "",
    ccpType: "",
    description: "",
    priority: 0,
    isActive: 1,
  });

  const resetForm = () => {
    setFormData({
      templateName: "",
      productNamePattern: "",
      ccpType: "",
      description: "",
      priority: 0,
      isActive: 1,
    });
  };

  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync(formData);
      toast.success(
        "CCP 템플릿이 성공적으로 생성되었습니다."
      );
      setIsCreateDialogOpen(false);
      resetForm();
      refetch();
    } catch (error: any) {
      toast.error(
        error.message || "템플릿 생성 중 오류가 발생했습니다."
      );
    }
  };

  const handleEdit = (template: any) => {
    setSelectedTemplate(template);
    setFormData({
      templateName: template.templateName,
      productNamePattern: template.productNamePattern || "",
      ccpType: template.ccpType,
      description: template.description || "",
      priority: template.priority || 0,
      isActive: template.isActive || 1,
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedTemplate) return;
    try {
      await updateMutation.mutateAsync({
        id: selectedTemplate.id,
        ...formData,
      });
      toast.success(
        "CCP 템플릿이 성공적으로 수정되었습니다."
      );
      setIsEditDialogOpen(false);
      resetForm();
      setSelectedTemplate(null);
      refetch();
    } catch (error: any) {
      toast.error(
        error.message || "템플릿 수정 중 오류가 발생했습니다."
      );
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate) return;
    try {
      await deleteMutation.mutateAsync({ id: selectedTemplate.id });
      toast.success(
        "CCP 템플릿이 성공적으로 삭제되었습니다."
      );
      setIsDeleteDialogOpen(false);
      setSelectedTemplate(null);
      refetch();
    } catch (error: any) {
      toast.error(
        error.message || "템플릿 삭제 중 오류가 발생했습니다."
      );
    }
  };

  const content = (
    <div className={embedded ? "space-y-4" : "container py-8"}>
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">CCP 템플릿 관리</h1>
        <p className="text-muted-foreground">
          제품명 패턴에 따라 자동으로 생성될 CCP 타입을 설정합니다. 배치 생성 시 제품명이 패턴과 일치하면 해당 CCP가 자동으로 생성됩니다.
        </p>
      </div>

      <Card className="mb-6 border-blue-200 bg-blue-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <AlertCircle className="h-5 w-5" />
            사용 가이드
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-800 space-y-2">
          <p>
            <strong>제품명 패턴:</strong> 제품명에 포함될 키워드를 입력합니다. 예: "떡볶이", "김치", "만두"
          </p>
          <p>
            <strong>CCP 타입:</strong> 자동 생성될 CCP 타입을 입력합니다. 예: "CCP-1A (증숙)", "CCP-2 (금속검출)", "CCP-3B (냉각)"
          </p>
          <p>
            <strong>우선순위:</strong> 여러 패턴이 매칭될 경우 우선순위가 높은 템플릿이 먼저 적용됩니다. (숫자가 클수록 우선순위 높음)
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end mb-4">
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              템플릿 추가
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>CCP 템플릿 추가</DialogTitle>
              <DialogDescription>
                새로운 CCP 자동 생성 규칙을 추가합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="templateName">템플릿 이름 *</Label>
                <Input
                  id="templateName"
                  value={formData.templateName}
                  onChange={(e) =>
                    setFormData({ ...formData, templateName: e.target.value })
                  }
                  placeholder="예: 떡볶이 증숙 CCP"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="productNamePattern">제품명 패턴 *</Label>
                <Input
                  id="productNamePattern"
                  value={formData.productNamePattern}
                  onChange={(e) =>
                    setFormData({ ...formData, productNamePattern: e.target.value })
                  }
                  placeholder="예: 떡볶이"
                />
                <p className="text-xs text-muted-foreground">
                  제품명에 이 키워드가 포함되면 자동으로 CCP가 생성됩니다.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ccpType">CCP 타입 *</Label>
                <Input
                  id="ccpType"
                  value={formData.ccpType}
                  onChange={(e) =>
                    setFormData({ ...formData, ccpType: e.target.value })
                  }
                  placeholder="예: CCP-1A (증숙)"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="priority">우선순위</Label>
                <Input
                  id="priority"
                  type="number"
                  value={formData.priority}
                  onChange={(e) =>
                    setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })
                  }
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">
                  숫자가 클수록 우선순위가 높습니다.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">설명</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="템플릿에 대한 설명을 입력하세요."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "생성 중..." : "생성"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>템플릿 목록</CardTitle>
          <CardDescription>
            등록된 CCP 자동 생성 규칙 ({templates?.length || 0}개)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>템플릿 이름</TableHead>
                <TableHead>제품명 패턴</TableHead>
                <TableHead>CCP 타입</TableHead>
                <TableHead className="text-center">우선순위</TableHead>
                <TableHead className="text-center">상태</TableHead>
                <TableHead className="text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates && templates.length > 0 ? (
                templates.map((template: any) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">{template.templateName}</TableCell>
                    <TableCell>
                      <code className="bg-muted px-2 py-1 rounded text-sm">
                        {template.productNamePattern || "-"}
                      </code>
                    </TableCell>
                    <TableCell>{template.ccpType}</TableCell>
                    <TableCell className="text-center">{template.priority}</TableCell>
                    <TableCell className="text-center">
                      {template.isActive ? (
                        <Badge variant="default">활성</Badge>
                      ) : (
                        <Badge variant="secondary">비활성</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(template)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedTemplate(template);
                            setIsDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    등록된 템플릿이 없습니다. 템플릿을 추가하여 CCP 자동 생성 규칙을 설정하세요.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 수정 다이얼로그 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>CCP 템플릿 수정</DialogTitle>
            <DialogDescription>
              템플릿 정보를 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-templateName">템플릿 이름 *</Label>
              <Input
                id="edit-templateName"
                value={formData.templateName}
                onChange={(e) =>
                  setFormData({ ...formData, templateName: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-productNamePattern">제품명 패턴 *</Label>
              <Input
                id="edit-productNamePattern"
                value={formData.productNamePattern}
                onChange={(e) =>
                  setFormData({ ...formData, productNamePattern: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-ccpType">CCP 타입 *</Label>
              <Input
                id="edit-ccpType"
                value={formData.ccpType}
                onChange={(e) =>
                  setFormData({ ...formData, ccpType: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-priority">우선순위</Label>
              <Input
                id="edit-priority"
                type="number"
                value={formData.priority}
                onChange={(e) =>
                  setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-isActive">상태</Label>
              <select
                id="edit-isActive"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.isActive}
                onChange={(e) =>
                  setFormData({ ...formData, isActive: parseInt(e.target.value) })
                }
              >
                <option value={1}>활성</option>
                <option value={0}>비활성</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">설명</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "수정 중..." : "수정"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>템플릿 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              정말로 이 템플릿을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  if (embedded) return content;

  return (
    <DashboardLayout>
      {content}
    </DashboardLayout>
  );
}
