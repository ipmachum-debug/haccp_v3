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

export default function PositionManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<any>(null);
  const [formData, setFormData] = useState({
    positionName: "",
    level: 0,
    description: "",
  });

  const utils = trpc.useUtils();
  const { data: positions, isLoading } = trpc.organization.positions.list.useQuery();
  
  const createMutation = trpc.organization.positions.create.useMutation({
    onSuccess: () => {
      toast.success("직급이 생성되었습니다.");
      utils.organization.positions.list.invalidate();
      handleCloseDialog();
    },
    onError: (error: { message: string }) => {
      toast.error(`직급 생성 실패: ${error.message}`);
    },
  });

  const updateMutation = trpc.organization.positions.update.useMutation({
    onSuccess: () => {
      toast.success("직급이 수정되었습니다.");
      utils.organization.positions.list.invalidate();
      handleCloseDialog();
    },
    onError: (error: { message: string }) => {
      toast.error(`직급 수정 실패: ${error.message}`);
    },
  });

  const deleteMutation = trpc.organization.positions.delete.useMutation({
    onSuccess: () => {
      toast.success("직급이 삭제되었습니다.");
      utils.organization.positions.list.invalidate();
    },
    onError: (error: { message: string }) => {
      toast.error(`직급 삭제 실패: ${error.message}`);
    },
  });

  const handleOpenDialog = (position?: any) => {
    if (position) {
      setEditingPosition(position);
      setFormData({
        positionName: position.positionName || "",
        level: position.level || 0,
        description: position.description || "",
      });
    } else {
      setEditingPosition(null);
      setFormData({
        positionName: "",
        level: 0,
        description: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingPosition(null);
    setFormData({
      positionName: "",
      level: 0,
      description: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.positionName.trim()) {
      toast.error("직급명을 입력해주세요.");
      return;
    }

    if (editingPosition) {
      updateMutation.mutate({
        id: editingPosition.id,
        ...formData,
        approvalRole: editingPosition.approvalRole || "none",
      });
    } else {
      createMutation.mutate({
        ...formData,
        approvalRole: "none",
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("정말 이 직급을 삭제하시겠습니까?")) {
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
              <CardTitle>직급 관리</CardTitle>
              <CardDescription>회사의 직급 체계를 관리합니다.</CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              직급 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {positions && positions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>직급명</TableHead>
                  <TableHead>레벨</TableHead>
                  <TableHead>설명</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((pos: any) => (
                  <TableRow key={pos.id}>
                    <TableCell className="font-medium">{pos.positionName}</TableCell>
                    <TableCell>{pos.level || "-"}</TableCell>
                    <TableCell>{pos.description || "-"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDialog(pos)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(pos.id)}
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
              등록된 직급이 없습니다.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingPosition ? "직급 수정" : "직급 추가"}
              </DialogTitle>
              <DialogDescription>
                직급 정보를 설정해주세요.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="positionName">직급명 *</Label>
                <Input
                  id="positionName"
                  value={formData.positionName}
                  onChange={(e) =>
                    setFormData({ ...formData, positionName: e.target.value })
                  }
                  placeholder="예: 팀장, 과장, 부장"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="level">레벨</Label>
                <Input
                  id="level"
                  type="number"
                  value={formData.level}
                  onChange={(e) =>
                    setFormData({ ...formData, level: parseInt(e.target.value) || 0 })
                  }
                  placeholder="1-10"
                />
                <p className="text-xs text-muted-foreground">
                  숫자가 높을수록 상위 직급입니다.
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
                  placeholder="직급에 대한 설명을 입력하세요"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                취소
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingPosition ? "수정" : "추가"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
