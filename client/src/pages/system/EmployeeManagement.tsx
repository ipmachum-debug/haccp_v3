import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Pencil, Trash2, Plus } from "lucide-react";

import { formatLocalDate } from "../../lib/dateUtils";

export default function EmployeeManagement() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  const [formData, setFormData] = useState({
    employeeCode: "",
    name: "",
    departmentId: "",
    positionId: "",
    hireDate: "",
  });

  const utils = trpc.useUtils();
  const { data: employees, isLoading } = trpc.organization.employees.list.useQuery();
  const { data: departments } = trpc.organization.departments.list.useQuery();
  const { data: positions } = trpc.organization.positions.list.useQuery();
  
  const createMutation = trpc.organization.employees.create.useMutation({
    onSuccess: () => {
      toast.success("구성원이 생성되었습니다.");
      utils.organization.employees.list.invalidate();
      handleCloseDialog();
    },
    onError: (error: { message: string }) => {
      toast.error(`구성원 생성 실패: ${error.message}`);
    },
  });

  const updateMutation = trpc.organization.employees.update.useMutation({
    onSuccess: () => {
      toast.success("구성원이 수정되었습니다.");
      utils.organization.employees.list.invalidate();
      handleCloseDialog();
    },
    onError: (error: { message: string }) => {
      toast.error(`구성원 수정 실패: ${error.message}`);
    },
  });

  const deleteMutation = trpc.organization.employees.delete.useMutation({
    onSuccess: () => {
      toast.success("구성원이 삭제되었습니다.");
      utils.organization.employees.list.invalidate();
    },
    onError: (error: { message: string }) => {
      toast.error(`구성원 삭제 실패: ${error.message}`);
    },
  });

  // 클라이언트 사번 자동 생성 (EMP-001 형식)
  const generateNextEmployeeCode = useCallback(() => {
    const prefix = "EMP";
    const existingCodes = (employees || []).filter((e: any) => e.employeeCode?.startsWith(prefix + "-")).map((e: any) => {
      const parts = (e.employeeCode || "").split("-");
      return parseInt(parts[1] || "0", 10);
    }).filter((n: number) => !isNaN(n));
    const maxNum = existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
    return `${prefix}-${(maxNum + 1).toString().padStart(3, "0")}`;
  }, [employees]);

  const handleOpenDialog = (employee?: any) => {
    if (employee) {
      setEditingEmployee(employee);
      setFormData({
        employeeCode: employee.employeeCode || "",
        name: employee.name || "",
        departmentId: employee.departmentId?.toString() || "",
        positionId: employee.positionId?.toString() || "",
        hireDate: employee.hireDate ? formatLocalDate(new Date(employee.hireDate)) : "",
      });
    } else {
      setEditingEmployee(null);
      const nextCode = generateNextEmployeeCode();
      setFormData({
        employeeCode: nextCode,
        name: "",
        departmentId: "",
        positionId: "",
        hireDate: "",
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingEmployee(null);
    setFormData({
      employeeCode: "",
      name: "",
      departmentId: "",
      positionId: "",
      hireDate: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.employeeCode.trim() || !formData.name.trim()) {
      toast.error("사번과 이름을 입력해주세요.");
      return;
    }

    const submitData: any = {
      employeeCode: formData.employeeCode,
      name: formData.name,
      departmentId: formData.departmentId ? parseInt(formData.departmentId) : undefined,
      positionId: formData.positionId ? parseInt(formData.positionId) : undefined,
      hireDate: formData.hireDate ? new Date(formData.hireDate) : undefined,
    };

    if (editingEmployee) {
      updateMutation.mutate({
        id: editingEmployee.id,
        ...submitData,
      });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("정말 이 구성원을 삭제하시겠습니까?")) {
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
              <CardTitle>구성원 관리</CardTitle>
              <CardDescription>회사의 구성원을 관리합니다.</CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              구성원 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {employees && employees.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>사번</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead>부서</TableHead>
                  <TableHead>직급</TableHead>
                  <TableHead>입사일</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((emp: any) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">{emp.employeeCode}</TableCell>
                    <TableCell>{emp.name}</TableCell>
                    <TableCell>{emp.departmentName || "-"}</TableCell>
                    <TableCell>{emp.positionName || "-"}</TableCell>
                    <TableCell>
                      {emp.hireDate ? new Date(emp.hireDate).toLocaleDateString('ko-KR') : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDialog(emp)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(emp.id)}
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
              등록된 구성원이 없습니다.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editingEmployee ? "구성원 수정" : "구성원 추가"}
              </DialogTitle>
              <DialogDescription>
                구성원 정보를 입력해주세요.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="employeeCode">사번 *</Label>
                  <Input
                    id="employeeCode"
                    value={formData.employeeCode}
                    readOnly
                    className="bg-muted"
                    placeholder="자동 생성됩니다"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="name">이름 *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="홍길동"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="departmentId">부서</Label>
                  <Select
                    value={formData.departmentId}
                    onValueChange={(value) =>
                      setFormData({ ...formData, departmentId: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="부서 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments?.map((dept: any) => (
                        <SelectItem key={dept.id} value={dept.id.toString()}>
                          {dept.departmentName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="positionId">직급</Label>
                  <Select
                    value={formData.positionId}
                    onValueChange={(value) =>
                      setFormData({ ...formData, positionId: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="직급 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {positions?.map((pos: any) => (
                        <SelectItem key={pos.id} value={pos.id.toString()}>
                          {pos.positionName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="hireDate">입사일</Label>
                <Input
                  id="hireDate"
                  type="date"
                  value={formData.hireDate}
                  onChange={(e) =>
                    setFormData({ ...formData, hireDate: e.target.value })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                취소
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingEmployee ? "수정" : "추가"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
