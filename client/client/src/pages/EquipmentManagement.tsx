import React, { useState, useEffect } from 'react';
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Plus, Edit, Trash2, GripVertical } from "lucide-react";

interface Equipment {
  id: number;
  equipment_type: string;
  equipment_name: string;
  location: string;
  zone?: string;
  temperature_range?: string;
  display_order: number;
  is_active: boolean;
}

export default function EquipmentManagement() {
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [filterType, setFilterType] = useState<string>('all');

  // Form state
  const [formData, setFormData] = useState({
    equipment_type: '표충등',
    equipment_name: '',
    location: '',
    zone: '',
    temperature_range: '',
  });

  // tRPC queries
  const { data: equipments, refetch } = trpc.equipment.list.useQuery();
  const createMutation = trpc.equipment.create.useMutation();
  const updateMutation = trpc.equipment.update.useMutation();
  const deleteMutation = trpc.equipment.delete.useMutation();

  useEffect(() => {
    if (equipments) {
      setEquipmentList(equipments);
    }
  }, [equipments]);

  const handleOpenDialog = (equipment?: Equipment) => {
    if (equipment) {
      setEditingEquipment(equipment);
      setFormData({
        equipment_type: equipment.equipment_type,
        equipment_name: equipment.equipment_name,
        location: equipment.location,
        zone: equipment.zone || '',
        temperature_range: equipment.temperature_range || '',
      });
    } else {
      setEditingEquipment(null);
      setFormData({
        equipment_type: '표충등',
        equipment_name: '',
        location: '',
        zone: '',
        temperature_range: '',
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingEquipment(null);
  };

  const handleSave = async () => {
    try {
      if (editingEquipment) {
        await updateMutation.mutateAsync({
          id: editingEquipment.id,
          ...formData,
        });
      } else {
        await createMutation.mutateAsync(formData);
      }
      refetch();
      handleCloseDialog();
    } catch (error) {
      console.error('설비 저장 실패:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('이 설비를 삭제하시겠습니까?')) {
      try {
        await deleteMutation.mutateAsync({ id });
        refetch();
      } catch (error) {
        console.error('설비 삭제 실패:', error);
      }
    }
  };

  const filteredEquipments = equipmentList.filter(
    (eq) => filterType === 'all' || eq.equipment_type === filterType
  );

  const getTypeBadgeVariant = (type: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      표충등: 'default',
      'R-트랩': 'secondary',
      냉장고: 'outline',
      냉동고: 'outline',
      원재료실: 'outline',
      기타: 'secondary',
    };
    return variants[type] || 'default';
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">설비 관리</h1>
            <p className="text-muted-foreground mt-1">
              포충등, 트랩, 냉장고, 냉동고 등 모든 설비를 관리합니다
            </p>
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            설비 추가
          </Button>
        </div>

        <Alert>
          <AlertDescription>
            일일일지/주간일지 작성 시 등록된 설비가 자동으로 표시됩니다.
          </AlertDescription>
        </Alert>

        <div className="flex gap-4">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="설비 유형 필터" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="표충등">표충등</SelectItem>
              <SelectItem value="R-트랩">R-트랩</SelectItem>
              <SelectItem value="냉장고">냉장고</SelectItem>
              <SelectItem value="냉동고">냉동고</SelectItem>
              <SelectItem value="원재료실">원재료실</SelectItem>
              <SelectItem value="기타">기타</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>설비 유형</TableHead>
                  <TableHead>설비명</TableHead>
                  <TableHead>설치 위치</TableHead>
                  <TableHead>구역</TableHead>
                  <TableHead>온도 범위</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-center">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEquipments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      등록된 설비가 없습니다. 설비를 추가해주세요.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEquipments.map((equipment) => (
                    <TableRow key={equipment.id}>
                      <TableCell>
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                      <TableCell>
                        <Badge variant={getTypeBadgeVariant(equipment.equipment_type)}>
                          {equipment.equipment_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{equipment.equipment_name}</TableCell>
                      <TableCell>{equipment.location}</TableCell>
                      <TableCell>{equipment.zone || '-'}</TableCell>
                      <TableCell>{equipment.temperature_range || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={equipment.is_active ? 'default' : 'secondary'}>
                          {equipment.is_active ? '활성' : '비활성'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDialog(equipment)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(equipment.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 설비 추가/수정 다이얼로그 */}
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {editingEquipment ? '설비 수정' : '설비 추가'}
              </DialogTitle>
              <DialogDescription>
                설비 정보를 입력해주세요. * 표시는 필수 항목입니다.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="equipment_type">설비 유형 *</Label>
                <Select
                  value={formData.equipment_type}
                  onValueChange={(value) =>
                    setFormData({ ...formData, equipment_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="표충등">표충등</SelectItem>
                    <SelectItem value="R-트랩">R-트랩</SelectItem>
                    <SelectItem value="냉장고">냉장고</SelectItem>
                    <SelectItem value="냉동고">냉동고</SelectItem>
                    <SelectItem value="원재료실">원재료실</SelectItem>
                    <SelectItem value="기타">기타</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="equipment_name">설비명 *</Label>
                <Input
                  id="equipment_name"
                  value={formData.equipment_name}
                  onChange={(e) =>
                    setFormData({ ...formData, equipment_name: e.target.value })
                  }
                  placeholder="예: 표충등 IN-2, 냉장고1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">설치 위치 *</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) =>
                    setFormData({ ...formData, location: e.target.value })
                  }
                  placeholder="예: 중숙실, 1층 창고"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="zone">구역</Label>
                <Input
                  id="zone"
                  value={formData.zone}
                  onChange={(e) =>
                    setFormData({ ...formData, zone: e.target.value })
                  }
                  placeholder="예: 청결구역, 일반구역"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="temperature_range">온도 범위</Label>
                <Input
                  id="temperature_range"
                  value={formData.temperature_range}
                  onChange={(e) =>
                    setFormData({ ...formData, temperature_range: e.target.value })
                  }
                  placeholder="예: 0~10℃, -18℃이하"
                />
                <p className="text-sm text-muted-foreground">
                  냉장고/냉동고/원재료실의 경우 입력
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCloseDialog}>
                취소
              </Button>
              <Button
                onClick={handleSave}
                disabled={
                  !formData.equipment_name ||
                  !formData.location
                }
              >
                저장
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
