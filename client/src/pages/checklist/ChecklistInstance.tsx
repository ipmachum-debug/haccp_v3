import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, CheckCircle } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

export default function ChecklistInstance() {
  const params = useParams();
  const instanceId = parseInt(params.id!);
  const [, setLocation] = useLocation();
  const { user, hasRole } = useAuth();

  const [itemValues, setItemValues] = useState<Record<number, string>>({});

  const { data: instance, isLoading, refetch } = trpc.checklistInstance.getById.useQuery({
    id: instanceId,
  });

  const updateMutation = trpc.checklistInstance.update.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (error: any) => {
      alert(`저장 실패: ${error.message}`);
    },
  });

  const submitMutation = trpc.checklistInstance.submit.useMutation({
    onSuccess: () => {
      alert("체크리스트가 제출되었습니다.");
      refetch();
    },
    onError: (error: any) => {
      alert(`제출 실패: ${error.message}`);
    },
  });

  useEffect(() => {
    if (instance?.items) {
      const values: Record<number, string> = {};
      instance.items.forEach((item: any) => {
        if (item.value !== null && item.value !== undefined) {
          values[item.id] = item.value;
        }
      });
      setItemValues(values);
    }
  }, [instance]);

  const handleValueChange = (itemId: number, value: string) => {
    setItemValues((prev) => ({ ...prev, [itemId]: value }));
  };

  const handleSaveItem = (itemId: number) => {
    const value = itemValues[itemId] || "";
    updateMutation.mutate({
      id: instanceId,
      data: { [itemId]: value },
    });
  };

  const handleComplete = () => {
    if (confirm("체크리스트를 완료 처리하시겠습니까? 완료 후에는 수정할 수 없습니다.")) {
      submitMutation.mutate({ id: instanceId });
    }
  };

  if (!hasRole(["admin", "worker", "inspector"])) {
    return (
    <DashboardLayout>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>접근 권한 없음</CardTitle>
            <CardDescription>
              체크리스트 작성은 작업자 이상만 접근할 수 있습니다.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    
    </DashboardLayout>
  );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="text-center">로딩 중...</div>
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>체크리스트를 찾을 수 없습니다</CardTitle>
            <CardDescription>
              요청하신 체크리스트가 존재하지 않거나 삭제되었습니다.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const isCompleted = instance.status === "completed";
  const canEdit = !isCompleted && hasRole(["admin", "worker"]);

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => setLocation(`/dashboard/batch/${instance.batchId}`)}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          배치로 돌아가기
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{instance.template.name}</h1>
            <p className="text-muted-foreground mt-2">
              {instance.template.description}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isCompleted ? (
              <Badge className="bg-green-100 text-green-800">
                <CheckCircle className="w-4 h-4 mr-1" />
                완료
              </Badge>
            ) : (
              <Badge variant="outline">진행 중</Badge>
            )}
          </div>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>체크리스트 항목</CardTitle>
          <CardDescription>
            {canEdit
              ? "각 항목을 작성하고 저장 버튼을 클릭하세요."
              : "체크리스트가 완료되어 수정할 수 없습니다."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {instance.items.map((item: any, index: number) => (
              <div
                key={item.id}
                className="border rounded-lg p-4 space-y-3 bg-muted/30"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <Label className="text-base font-semibold">
                      {index + 1}. {item.itemText}
                      {item.required && (
                        <span className="text-red-600 ml-1">*</span>
                      )}
                    </Label>
                    {item.helpText && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {item.helpText}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {item.inputType === "checkbox" ? (
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`item-${item.id}`}
                        checked={itemValues[item.id] === "true"}
                        onCheckedChange={(checked) =>
                          handleValueChange(item.id, checked ? "true" : "false")
                        }
                        disabled={!canEdit}
                      />
                      <Label htmlFor={`item-${item.id}`}>확인</Label>
                    </div>
                  ) : item.inputType === "number" ||
                    item.inputType === "temperature" ||
                    item.inputType === "pressure" ? (
                    <Input
                      type="number"
                      value={itemValues[item.id] || ""}
                      onChange={(e) =>
                        handleValueChange(item.id, e.target.value)
                      }
                      placeholder={
                        item.inputType === "temperature"
                          ? "온도 (°C)"
                          : item.inputType === "pressure"
                          ? "압력 (bar)"
                          : "숫자 입력"
                      }
                      disabled={!canEdit}
                      className="flex-1"
                    />
                  ) : item.inputType === "time" ? (
                    <Input
                      type="time"
                      value={itemValues[item.id] || ""}
                      onChange={(e) =>
                        handleValueChange(item.id, e.target.value)
                      }
                      disabled={!canEdit}
                      className="flex-1"
                    />
                  ) : item.inputType === "date" ? (
                    <Input
                      type="date"
                      value={itemValues[item.id] || ""}
                      onChange={(e) =>
                        handleValueChange(item.id, e.target.value)
                      }
                      disabled={!canEdit}
                      className="flex-1"
                    />
                  ) : (
                    <Input
                      type="text"
                      value={itemValues[item.id] || ""}
                      onChange={(e) =>
                        handleValueChange(item.id, e.target.value)
                      }
                      placeholder="텍스트 입력"
                      disabled={!canEdit}
                      className="flex-1"
                    />
                  )}

                  {canEdit && (
                    <Button
                      size="sm"
                      onClick={() => handleSaveItem(item.id)}
                      disabled={updateMutation.isPending}
                    >
                      <Save className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {canEdit && !isCompleted && (
        <div className="flex items-center justify-end">
          <Button
            onClick={handleComplete}
            disabled={submitMutation.isPending}
            size="lg"
          >
            <CheckCircle className="w-5 h-5 mr-2" />
            체크리스트 완료
          </Button>
        </div>
      )}

      {isCompleted && instance.completedAt && (
        <Card>
          <CardHeader>
            <CardTitle>완료 정보</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm space-y-1">
              <p>
                <span className="font-semibold">완료 시간:</span>{" "}
                {new Date(instance.completedAt).toLocaleString("ko-KR")}
              </p>
              {instance.completedBy && (
                <p>
                  <span className="font-semibold">완료자:</span>{" "}
                  {instance.completedBy}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
