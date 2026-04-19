import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Pencil, Trash2, Plus } from "lucide-react";

export default function DepartmentManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<any>(null);
  const [formData, setFormData] = useState({
    departmentName: "",
    description: "",
  });

  const utils = trpc.useUtils();
  const { data: departments, isLoading } = trpc.organization.departments.list.useQuery();
  
  const createMutation = trpc.organization.departments.create.useMutation({
    onSuccess: () => {
      toast.success("부서가 생성되었습니다.");
      utils.organization.departments.list.invalidate();
      handleCloseDialog();
    },
    onError: (error: { message: string }) => {
      toast.error(`부서 생성 실패: ${error.message}`);
    },
  });

  const updateMutation = trpc.organization.departments.update.useMutation({
    onSuccess: () => {
      toast.success("부서가 수정되었습니다.");
      utils.organization.departments.list.invalidate();
      handleCloseDialog();
    },
    onError: (error: { message: string }) => {
      toast.error(`부서 수정 실패: ${error.message}`);
    },
  });

  const deleteMutation = trpc.organization.departments.delete.useMutation({
    onSuccess: () => {
      toast.success("부서가 삭제되었습니다.");
      utils.organization.departments.list.invalidate();
    },
    onError: (error: { message: string }) => {
      toast.error(`부서 삭제 실패: ${error.message}`);
    },
  });

  const handleOpenDialog = (department?: any) => {
    if (department) {
      setEditingDepartment(department);
      setFormData({
        departmentName: department.departmentName || "",
        description: department.description || "",
      });
    } else {
      setEditingDepartment(null);
      setFormData({
        departmentName: "",
        description: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingDepartment(null);
    setFormData({
      departmentName: "",
      description: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.departmentName.trim()) {
      toast.error("부서명을 입력해주세요.");
      return;
    }

    if (editingDepartment) {
      updateMutation.mutate({
        id: editingDepartment.id,
        ...formData,
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("정말 이 부서를 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="text-center">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>부서 관리</CardTitle>
              <CardDescription>회사의 부서를 관리합니다.</CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              부서 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {departments && departments.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>부서명</TableHead>
                  <TableHead>설명</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map((dept: any) => (
                  <TableRow key={dept.id}>
                    <TableCell className="font-medium">{dept.departmentName}</TableCell>
                    <TableCell>{dept.description || "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDialog(dept)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(dept.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              등록된 부서가 없습니다.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingDepartment ? "부서 수정" : "부서 추가"}
              </DialogTitle>
              <DialogDescription>
                부서 정보를 입력해주세요.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="departmentName">부서명 *</Label>
                <Input
                  id="departmentName"
                  value={formData.departmentName}
                  onChange={(e) =>
                    setFormData({ ...formData, departmentName: e.target.value })
                  }
                  placeholder="예: 생산팀"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">설명</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="부서에 대한 설명을 입력하세요"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                취소
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingDepartment ? "수정" : "추가"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
