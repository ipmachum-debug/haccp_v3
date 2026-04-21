import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical } from "lucide-react";

interface TemplateFormProps {
  template?: any;
  onSuccess: () => void;
  onCancel: () => void;
}

interface TemplateItem {
  sortOrder: number;
  itemName: string;
  itemType: "checkbox" | "number" | "text" | "select" | "time" | "date" | "temperature" | "pressure";
  required: boolean;
  validationRules?: {
    min?: number;
    max?: number;
    unit?: string;
    options?: string[];
  };
  defaultValue?: string;
  helpText?: string;
}

export default function TemplateForm({ template, onSuccess, onCancel }: TemplateFormProps) {
  // toast from sonner
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("CCP");
  const [priority, setPriority] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [generationMode, setGenerationMode] = useState<"manual" | "auto">("manual");
  const [frequency, setFrequency] = useState<string | undefined>();
  const [items, setItems] = useState<TemplateItem[]>([]);

  // 템플릿 데이터 로드
  useEffect(() => {
    if (template) {
      setName(template.name || "");
      setDescription(template.description || "");
      setCategory(template.category || "CCP");
      setPriority(template.priority || 0);
      setIsActive(template.isActive === 1);
      
      const autoTriggerRules = template.autoTriggerRules as any;
      if (autoTriggerRules) {
        setGenerationMode(autoTriggerRules.mode || "manual");
        setFrequency(autoTriggerRules.frequency);
      }
    }
  }, [template]);

  // 템플릿 생성 mutation
  const createMutation = trpc.qualityChecklist.createTemplate.useMutation({
    onSuccess: () => {
      toast.success("새 템플릿이 성공적으로 생성되었습니다.");
      onSuccess();
    },
    onError: (error: { message: string }) => {
      toast.error(`템플릿 생성 실패: ${error.message}`);
    },
  });

  // 템플릿 수정 mutation
  const updateMutation = trpc.qualityChecklist.updateTemplate.useMutation({
    onSuccess: () => {
      toast.success("템플릿이 성공적으로 수정되었습니다.");
      onSuccess();
    },
    onError: (error: { message: string }) => {
      toast.error(`템플릿 수정 실패: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("템플릿 이름을 입력하세요.");
      return;
    }

    if (items.length === 0) {
      toast.error("최소 1개 이상의 항목을 추가하세요.");
      return;
    }

    if (generationMode === "auto" && !frequency) {
      toast.error("자동 생성 모드에서는 주기를 선택해야 합니다.");
      return;
    }

    const data = {
      name,
      description,
      category: category as any,
      priority,
      isActive,
      generationMode,
      frequency: frequency as any,
      items,
    };

    if (template) {
      updateMutation.mutate({
        id: template.id,
        ...data,
      });
    } else {
      createMutation.mutate(data);
    }
  };

  const addItem = () => {
    setItems([
      ...items,
      {
        sortOrder: items.length,
        itemName: "",
        itemType: "checkbox",
        required: true,
      },
    ]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      [field]: value,
    };
    setItems(newItems);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 기본 정보 */}
      <Card>
        <CardHeader>
          <CardTitle>기본 정보</CardTitle>
          <CardDescription>템플릿의 기본 정보를 입력하세요</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">템플릿 이름 *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 일일 위생 점검"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">설명</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="템플릿에 대한 설명을 입력하세요"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">카테고리 *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CCP">CCP 관리</SelectItem>
                  <SelectItem value="SANITATION">위생 관리</SelectItem>
                  <SelectItem value="QUALITY">품질 관리</SelectItem>
                  <SelectItem value="SAFETY">안전 관리</SelectItem>
                  <SelectItem value="TRAINING">교육 관리</SelectItem>
                  <SelectItem value="MAINTENANCE">시설 관리</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">우선순위</Label>
              <Input
                id="priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                min={0}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="isActive">활성화 상태</Label>
              <p className="text-sm text-muted-foreground">
                비활성화하면 체크리스트 생성에서 제외됩니다
              </p>
            </div>
            <Switch
              id="isActive"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </CardContent>
      </Card>

      {/* 자동 생성 설정 */}
      <Card>
        <CardHeader>
          <CardTitle>자동 생성 설정</CardTitle>
          <CardDescription>
            체크리스트를 자동으로 생성할지 수동으로 생성할지 선택하세요
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="generationMode">생성 모드 *</Label>
            <Select
              value={generationMode}
              onValueChange={(value) => setGenerationMode(value as "manual" | "auto")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">수동 생성</SelectItem>
                <SelectItem value="auto">자동 생성</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {generationMode === "manual"
                ? "사용자가 직접 체크리스트를 생성합니다"
                : "설정한 주기에 따라 자동으로 체크리스트가 생성됩니다"}
            </p>
          </div>

          {generationMode === "auto" && (
            <div className="space-y-2">
              <Label htmlFor="frequency">생성 주기 *</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger>
                  <SelectValue placeholder="주기를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">매일</SelectItem>
                  <SelectItem value="weekly">매주</SelectItem>
                  <SelectItem value="monthly">매월</SelectItem>
                  <SelectItem value="batch_create">배치 생성 시</SelectItem>
                  <SelectItem value="batch_complete">배치 완료 시</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 체크리스트 항목 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>체크리스트 항목</CardTitle>
              <CardDescription>
                체크리스트에 포함될 항목을 추가하세요
              </CardDescription>
            </div>
            <Button type="button" onClick={addItem} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              항목 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>아직 추가된 항목이 없습니다</p>
              <Button type="button" onClick={addItem} variant="outline" className="mt-4">
                <Plus className="w-4 h-4 mr-2" />
                첫 항목 추가하기
              </Button>
            </div>
          ) : (
            items.map((item, index) => (
              <Card key={index} className="border-2">
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="flex items-center gap-2 pt-2">
                      <GripVertical className="w-5 h-5 text-muted-foreground" />
                      <span className="text-sm font-medium">{index + 1}</span>
                    </div>
                    <div className="flex-1 space-y-4">
                      <div className="space-y-2">
                        <Label>항목 내용 *</Label>
                        <Input
                          value={item.itemName}
                          onChange={(e) => updateItem(index, "itemName", e.target.value)}
                          placeholder="예: 작업장 바닥 청결 상태 확인"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>입력 유형</Label>
                          <Select
                            value={item.itemType}
                            onValueChange={(value) => updateItem(index, "itemType", value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="checkbox">체크박스</SelectItem>
                              <SelectItem value="number">숫자</SelectItem>
                              <SelectItem value="text">텍스트</SelectItem>
                              <SelectItem value="select">선택</SelectItem>
                              <SelectItem value="time">시간</SelectItem>
                              <SelectItem value="date">날짜</SelectItem>
                              <SelectItem value="temperature">온도</SelectItem>
                              <SelectItem value="pressure">압력</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center justify-between pt-7">
                          <Label>필수 항목</Label>
                          <Switch
                            checked={item.required}
                            onCheckedChange={(checked) =>
                              updateItem(index, "required", checked)
                            }
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>도움말</Label>
                        <Input
                          value={item.helpText || ""}
                          onChange={(e) => updateItem(index, "helpText", e.target.value)}
                          placeholder="항목에 대한 설명이나 도움말을 입력하세요"
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(index)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </CardContent>
      </Card>

      {/* 버튼 */}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          취소
        </Button>
        <Button
          type="submit"
          disabled={createMutation.isPending || updateMutation.isPending}
        >
          {template ? "수정" : "생성"}
        </Button>
      </div>
    </form>
  );
}
