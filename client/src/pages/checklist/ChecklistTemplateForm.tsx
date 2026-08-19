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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, GripVertical, Save, ArrowLeft } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

type TemplateItem = {
  id?: number;
  sortOrder: number;
  itemName: string;
  itemType: "checkbox" | "number" | "text" | "select" | "time" | "date" | "temperature" | "pressure";
  required: boolean;
  validationRules?: any;
  defaultValue?: string;
  helpText?: string;
};

export default function ChecklistTemplateForm() {
  const params = useParams();
  const templateId = params.id ? parseInt(params.id) : undefined;
  const [, setLocation] = useLocation();
  const { hasRole } = useAuth();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("CCP");
  const [ccpType, setCcpType] = useState("");
  const [priority, setPriority] = useState(0);
  // ★ 2026-08-18: 자동 생성 주기. batch_create 를 지정해야 배치 생성 파이프라인(STEP 10)이
  //   이 템플릿으로 체크리스트를 자동 생성한다. "none" = 수동 생성.
  const [frequency, setFrequency] = useState<string>("none");
  const [items, setItems] = useState<TemplateItem[]>([
    {
      sortOrder: 1,
      itemName: "",
      itemType: "checkbox",
      required: true,
    },
  ]);

  const { data: template, isLoading } = trpc.checklistTemplate.getById.useQuery(
    { id: templateId! },
    { enabled: !!templateId }
  );

  const createMutation = trpc.checklistTemplate.create.useMutation({
    onSuccess: () => {
      alert("템플릿이 생성되었습니다.");
      setLocation("/checklist-templates");
    },
    onError: (error: { message: string }) => {
      alert(`생성 실패: ${error.message}`);
    },
  });

  const updateMutation = trpc.checklistTemplate.update.useMutation({
    onSuccess: () => {
      alert("템플릿이 수정되었습니다.");
      setLocation("/checklist-templates");
    },
    onError: (error: { message: string }) => {
      alert(`수정 실패: ${error.message}`);
    },
  });

  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description || "");
      setCategory(template.category);
      setCcpType(template.ccpType || "");
      setPriority(template.priority);
      setFrequency((template as any).frequency || "none");
      setItems(
        template.items.map((item: any) => ({
          id: item.id,
          sortOrder: item.sortOrder,
          itemName: item.itemName,
          itemType: item.itemType,
          required: Boolean(item.required),
          validationRules: item.validationRules,
          defaultValue: item.defaultValue || "",
          helpText: item.helpText || "",
        }))
      );
    }
  }, [template]);

  const addItem = () => {
    setItems([
      ...items,
      {
        sortOrder: items.length + 1,
        itemName: "",
        itemType: "checkbox",
        required: true,
      },
    ]);
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    // 정렬 순서 재조정
    newItems.forEach((item, i) => {
      item.sortOrder = i + 1;
    });
    setItems(newItems);
  };

  const updateItem = (index: number, field: keyof TemplateItem, value: any) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    setItems(newItems);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert("템플릿 이름을 입력하세요.");
      return;
    }

    if (items.length === 0) {
      alert("최소 1개 이상의 항목을 추가하세요.");
      return;
    }

    if (items.some((item) => !item.itemName.trim())) {
      alert("모든 항목의 텍스트를 입력하세요.");
      return;
    }

    const data = {
      name,
      description: description || undefined,
      category: category as any,
      ccpType: ccpType || undefined,
      priority,
      frequency: frequency === "none" ? null : (frequency as any),
      generationMode: frequency === "none" ? ("manual" as const) : ("auto" as const),
      items: items.map((item) => ({
        ...item,
        defaultValue: item.defaultValue || undefined,
        helpText: item.helpText || undefined,
      })),
    };

    if (templateId) {
      updateMutation.mutate({ id: templateId, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  if (!hasRole(["admin"])) {
    return (
    <DashboardLayout>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>접근 권한 없음</CardTitle>
            <CardDescription>
              체크리스트 템플릿 관리는 관리자만 접근할 수 있습니다.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    
    </DashboardLayout>
  );
  }

  if (templateId && isLoading) {
    return (
      <div className="space-y-6">
        <div className="text-center">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => setLocation("/checklist-templates")}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          목록으로
        </Button>
        <h1 className="text-3xl font-bold">
          {templateId ? "템플릿 수정" : "새 템플릿 생성"}
        </h1>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
            <CardDescription>
              체크리스트 템플릿의 기본 정보를 입력하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">템플릿 이름 *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: CCP 온도 점검 체크리스트"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">설명</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="템플릿에 대한 간단한 설명을 입력하세요."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="category">카테고리 *</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CCP">CCP 점검</SelectItem>
                    <SelectItem value="SANITATION">위생 관리</SelectItem>
                    <SelectItem value="QUALITY">품질 관리</SelectItem>
                    <SelectItem value="SAFETY">안전 관리</SelectItem>
                    <SelectItem value="TRAINING">교육 훈련</SelectItem>
                    <SelectItem value="MAINTENANCE">보정 관리</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="ccpType">CCP 타입</Label>
                <Input
                  id="ccpType"
                  value={ccpType}
                  onChange={(e) => setCcpType(e.target.value)}
                  placeholder="예: CCP-2B"
                />
              </div>

              <div>
                <Label htmlFor="priority">우선순위</Label>
                <Input
                  id="priority"
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="frequency">자동 생성 주기</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger id="frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">수동 생성 (자동 없음)</SelectItem>
                  <SelectItem value="batch_create">배치 생성 시 자동 생성</SelectItem>
                  <SelectItem value="batch_complete">배치 완료 시 자동 생성</SelectItem>
                  <SelectItem value="daily">매일</SelectItem>
                  <SelectItem value="weekly">매주</SelectItem>
                  <SelectItem value="monthly">매월</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                "배치 생성 시 자동 생성" 을 선택하면 배치를 만들 때 이 템플릿의 체크리스트가
                당일 1건 자동으로 만들어집니다 (일일일지·위생점검표 등).
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>체크리스트 항목</CardTitle>
                <CardDescription>
                  체크리스트에 포함될 항목들을 추가하세요.
                </CardDescription>
              </div>
              <Button type="button" onClick={addItem} variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                항목 추가
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                항목이 없습니다. "항목 추가" 버튼을 클릭하여 항목을 추가하세요.
              </div>
            ) : (
              <div className="space-y-4">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="border rounded-lg p-4 space-y-3 bg-muted/30"
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-5 h-5 text-muted-foreground" />
                      <span className="font-semibold text-sm">
                        항목 {index + 1}
                      </span>
                      <div className="ml-auto">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <Label>항목 텍스트 *</Label>
                        <Input
                          value={item.itemName}
                          onChange={(e) =>
                            updateItem(index, "itemName", e.target.value)
                          }
                          placeholder="예: 가열 시작 시간"
                          required
                        />
                      </div>

                      <div>
                        <Label>입력 타입</Label>
                        <Select
                          value={item.itemType}
                          onValueChange={(value) =>
                            updateItem(index, "itemType", value)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="checkbox">체크박스</SelectItem>
                            <SelectItem value="number">숫자</SelectItem>
                            <SelectItem value="text">텍스트</SelectItem>
                            <SelectItem value="time">시간</SelectItem>
                            <SelectItem value="date">날짜</SelectItem>
                            <SelectItem value="temperature">온도</SelectItem>
                            <SelectItem value="pressure">압력</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>기본값</Label>
                        <Input
                          value={item.defaultValue || ""}
                          onChange={(e) =>
                            updateItem(index, "defaultValue", e.target.value)
                          }
                          placeholder="선택사항"
                        />
                      </div>

                      <div className="col-span-2">
                        <Label>도움말</Label>
                        <Input
                          value={item.helpText || ""}
                          onChange={(e) =>
                            updateItem(index, "helpText", e.target.value)
                          }
                          placeholder="항목에 대한 설명을 입력하세요."
                        />
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={`required-${index}`}
                          checked={item.required}
                          onCheckedChange={(checked) =>
                            updateItem(index, "required", checked)
                          }
                        />
                        <Label htmlFor={`required-${index}`}>필수 항목</Label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setLocation("/checklist-templates")}
          >
            취소
          </Button>
          <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
            <Save className="w-4 h-4 mr-2" />
            {templateId ? "수정" : "생성"}
          </Button>
        </div>
      </form>
    </div>
  );
}
