import { useState } from "react";
import { trpc } from "../../lib/trpc";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Plus, Edit, Trash2, Power, PowerOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { useToast } from "@/hooks/use-toast";

/**
 * 체크리스트 스케줄 관리 페이지
 * 주기별 자동 생성 규칙 설정
 */

type FrequencyType = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "INTERVAL";

interface ScheduleFormData {
  templateId: number;
  frequencyType: FrequencyType;
  rule: Record<string, any>;
  dueTime?: string;
  gracePeriodHours: number;
  autoGenerate: boolean;
}

export default function ChecklistScheduleManagement() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<any>(null);
  const [formData, setFormData] = useState<ScheduleFormData>({
    templateId: 0,
    frequencyType: "DAILY",
    rule: {},
    dueTime: "",
    gracePeriodHours: 0,
    autoGenerate: true,
  });

  // 데이터 조회
  const { data: templates = [] } = trpc.checklistSchedule.getTemplates.useQuery();
  const { data: schedules = [], refetch } = trpc.checklistSchedule.list.useQuery({});

  // Mutations
  const createMutation = trpc.checklistSchedule.create.useMutation({
    onSuccess: () => {
      toast({ title: "스케줄이 생성되었습니다." });
      setIsCreateDialogOpen(false);
      refetch();
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = trpc.checklistSchedule.update.useMutation({
    onSuccess: () => {
      toast({ title: "스케줄이 수정되었습니다." });
      setEditingSchedule(null);
      refetch();
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = trpc.checklistSchedule.delete.useMutation({
    onSuccess: () => {
      toast({ title: "스케줄이 삭제되었습니다." });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = trpc.checklistSchedule.toggleActive.useMutation({
    onSuccess: () => {
      toast({ title: "스케줄 상태가 변경되었습니다." });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      templateId: 0,
      frequencyType: "DAILY",
      rule: {},
      dueTime: "",
      gracePeriodHours: 0,
      autoGenerate: true,
    });
  };

  const handleCreate = () => {
    if (formData.templateId === 0) {
      toast({ title: "오류", description: "템플릿을 선택해주세요.", variant: "destructive" });
      return;
    }

    createMutation.mutate(formData);
  };

  const handleUpdate = () => {
    if (!editingSchedule) return;

    updateMutation.mutate({
      id: editingSchedule.id,
      rule: formData.rule,
      dueTime: formData.dueTime,
      gracePeriodHours: formData.gracePeriodHours,
      autoGenerate: formData.autoGenerate,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleToggleActive = (id: number, active: boolean) => {
    toggleActiveMutation.mutate({ id, active: !active });
  };

  const openEditDialog = (schedule: any) => {
    setEditingSchedule(schedule);
    setFormData({
      templateId: schedule.templateId,
      frequencyType: schedule.frequencyType,
      rule: schedule.rule || {},
      dueTime: schedule.dueTime || "",
      gracePeriodHours: Number(schedule.gracePeriodHours) || 0,
      autoGenerate: schedule.autoGenerate === 1,
    });
  };

  const getFrequencyLabel = (type: string) => {
    const labels: Record<string, string> = {
      DAILY: "일일",
      WEEKLY: "주간",
      MONTHLY: "월간",
      YEARLY: "연간",
      INTERVAL: "특정 주기",
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">체크리스트 스케줄 관리</h1>
          <p className="text-muted-foreground mt-1">
            주기별 자동 생성 규칙을 설정하고 관리합니다
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          스케줄 추가
        </Button>
      </div>

      {/* 스케줄 목록 */}
      <div className="grid gap-4">
        {schedules.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              등록된 스케줄이 없습니다. 새 스케줄을 추가해주세요.
            </CardContent>
          </Card>
        ) : (
          schedules.map((schedule: any) => (
            <Card key={schedule.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      {schedule.template?.name || "템플릿 없음"}
                      <Badge variant={schedule.active ? "default" : "secondary"}>
                        {getFrequencyLabel(schedule.frequencyType)}
                      </Badge>
                      {schedule.active ? (
                        <Badge variant="default" className="bg-green-500">
                          활성
                        </Badge>
                      ) : (
                        <Badge variant="secondary">비활성</Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-2">
                      {schedule.template?.description || ""}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleActive(schedule.id, schedule.active === 1)}
                    >
                      {schedule.active ? (
                        <PowerOff className="w-4 h-4" />
                      ) : (
                        <Power className="w-4 h-4" />
                      )}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(schedule)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(schedule.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">마감 시간</div>
                    <div className="font-medium">{schedule.dueTime || "당일 23:59"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">유예 시간</div>
                    <div className="font-medium">{schedule.gracePeriodHours || 0}시간</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">자동 생성</div>
                    <div className="font-medium">
                      {schedule.autoGenerate ? "활성화" : "비활성화"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* 생성/수정 다이얼로그 */}
      <Dialog
        open={isCreateDialogOpen || editingSchedule !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateDialogOpen(false);
            setEditingSchedule(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingSchedule ? "스케줄 수정" : "새 스케줄 추가"}</DialogTitle>
            <DialogDescription>
              체크리스트 자동 생성 규칙을 설정합니다
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* 템플릿 선택 */}
            <div className="space-y-2">
              <Label>템플릿</Label>
              <Select
                value={formData.templateId.toString()}
                onValueChange={(value) =>
                  setFormData({ ...formData, templateId: parseInt(value) })
                }
                disabled={!!editingSchedule}
              >
                <SelectTrigger>
                  <SelectValue placeholder="템플릿을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template: any) => (
                    <SelectItem key={template.id} value={template.id.toString()}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 주기 선택 */}
            <div className="space-y-2">
              <Label>주기</Label>
              <Select
                value={formData.frequencyType}
                onValueChange={(value: FrequencyType) =>
                  setFormData({ ...formData, frequencyType: value })
                }
                disabled={!!editingSchedule}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAILY">일일</SelectItem>
                  <SelectItem value="WEEKLY">주간</SelectItem>
                  <SelectItem value="MONTHLY">월간</SelectItem>
                  <SelectItem value="YEARLY">연간</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 마감 시간 */}
            <div className="space-y-2">
              <Label>마감 시간 (HH:mm)</Label>
              <Input
                type="time"
                value={formData.dueTime}
                onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
                placeholder="23:59"
              />
            </div>

            {/* 유예 시간 */}
            <div className="space-y-2">
              <Label>유예 시간 (시간)</Label>
              <Input
                type="number"
                value={formData.gracePeriodHours}
                onChange={(e) =>
                  setFormData({ ...formData, gracePeriodHours: parseInt(e.target.value) || 0 })
                }
                min="0"
              />
            </div>

            {/* 자동 생성 */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="autoGenerate"
                checked={formData.autoGenerate}
                onChange={(e) => setFormData({ ...formData, autoGenerate: e.target.checked })}
                className="w-4 h-4"
              />
              <Label htmlFor="autoGenerate" className="cursor-pointer">
                자동 생성 활성화
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                setEditingSchedule(null);
                resetForm();
              }}
            >
              취소
            </Button>
            <Button onClick={editingSchedule ? handleUpdate : handleCreate}>
              {editingSchedule ? "수정" : "생성"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
