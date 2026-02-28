import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useParams, useLocation } from "wouter";
import { trpc } from "../lib/trpc";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Calendar } from "../components/ui/calendar";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Save,
  Send,
  Sparkles,
  Upload,
  FileText,
  Calendar as CalendarIcon,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

/**
 * 체크리스트 작성 폼
 * 기간별 탭, 캘린더 뷰, AI 자동 작성 포함
 */

type FrequencyTab = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export default function ChecklistInstanceForm() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<FrequencyTab>("DAILY");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedInstance, setSelectedInstance] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isAiGenerating, setIsAiGenerating] = useState(false);

  // 데이터 조회
  const { data: instances = [], refetch } = trpc.checklistInstance.list.useQuery({
    periodKey: format(selectedDate, "yyyy-MM-dd"),
  });

  const instanceDetail = trpc.checklistInstance.getById.useQuery(
    { id: selectedInstance?.id || 0 },
    { enabled: !!selectedInstance }
  );

  // Mutations
  const updateMutation = trpc.checklistInstance.update.useMutation({
    onSuccess: () => {
      toast({ title: "임시 저장되었습니다." });
      refetch();
    },
    onError: (error) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const submitMutation = trpc.checklistInstance.submit.useMutation({
    onSuccess: () => {
      toast({ title: "제출되었습니다." });
      setLocation("/checklist-instance");
    },
    onError: (error) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const aiGenerateMutation = trpc.checklistInstance.generateWithAI.useMutation({
    onSuccess: (data: any) => {
      setFormData(data.data);
      toast({ title: "AI가 내용을 생성했습니다.", description: "검토 후 수정하실 수 있습니다." });
      setIsAiGenerating(false);
    },
    onError: (error: any) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
      setIsAiGenerating(false);
    },
  });

  const uploadAttachmentMutation = trpc.checklistInstance.uploadAttachment.useMutation({
    onSuccess: (data) => {
      toast({ title: "파일이 업로드되었습니다." });
      // 첨부파일 목록 업데이트
      if (selectedInstance) {
        const currentAttachments = formData.attachments || [];
        setFormData({
          ...formData,
          attachments: [...currentAttachments, data.attachment],
        });
      }
    },
    onError: (error) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  // 인스턴스 선택 시 데이터 로드
  useEffect(() => {
    if (instanceDetail.data) {
      setFormData(instanceDetail.data.data || {});
    }
  }, [instanceDetail.data]);

  // 기간 키 생성
  const generatePeriodKey = (date: Date, frequency: FrequencyTab): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    switch (frequency) {
      case "DAILY":
        return `${year}-${month}-${day}`;
      case "WEEKLY": {
        const startOfYear = new Date(year, 0, 1);
        const dayOfYear = Math.floor(
          (date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)
        );
        const weekNumber = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);
        return `${year}-W${String(weekNumber).padStart(2, "0")}`;
      }
      case "MONTHLY":
        return `${year}-${month}`;
      case "YEARLY":
        return `${year}`;
      default:
        return `${year}-${month}-${day}`;
    }
  };

  // AI 자동 작성
  const handleAiGenerate = () => {
    if (!selectedInstance) {
      toast({ title: "오류", description: "인스턴스를 선택해주세요.", variant: "destructive" });
      return;
    }

    setIsAiGenerating(true);
    aiGenerateMutation.mutate({
      templateId: selectedInstance.templateId,
      periodKey: selectedInstance.periodKey,
    });
  };

  // 임시 저장
  const handleSave = () => {
    if (!selectedInstance) {
      toast({ title: "오류", description: "인스턴스를 선택해주세요.", variant: "destructive" });
      return;
    }

    updateMutation.mutate({
      id: selectedInstance.id,
      data: formData,
    });
  };

  // 제출
  const handleSubmit = () => {
    if (!selectedInstance) {
      toast({ title: "오류", description: "인스턴스를 선택해주세요.", variant: "destructive" });
      return;
    }

    if (confirm("제출하시겠습니까? 제출 후에는 수정할 수 없습니다.")) {
      submitMutation.mutate({ id: selectedInstance.id });
    }
  };

  // 파일 업로드
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedInstance) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      uploadAttachmentMutation.mutate({
        instanceId: selectedInstance.id,
        file: {
          name: file.name,
          type: file.type,
          data: base64,
        },
      });
    };
    reader.readAsDataURL(file);
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: any }> = {
      pending: { label: "작성 대기", variant: "secondary" },
      in_progress: { label: "작성 중", variant: "default" },
      pending_review: { label: "승인 대기", variant: "default" },
      approved: { label: "승인 완료", variant: "default" },
      rejected: { label: "반려", variant: "destructive" },
      completed: { label: "완료", variant: "default" },
    };
    const config = statusMap[status] || { label: status, variant: "secondary" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* 헤더 */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/checklist-instance")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">체크리스트 작성</h1>
            <p className="text-muted-foreground mt-1">기간별 체크리스트를 작성하고 제출합니다</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSave} disabled={!selectedInstance}>
            <Save className="w-4 h-4 mr-2" />
            임시 저장
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedInstance}>
            <Send className="w-4 h-4 mr-2" />
            제출
          </Button>
        </div>
      </div>

      {/* 기간별 탭 */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FrequencyTab)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="DAILY">일일</TabsTrigger>
          <TabsTrigger value="WEEKLY">주간</TabsTrigger>
          <TabsTrigger value="MONTHLY">월간</TabsTrigger>
          <TabsTrigger value="YEARLY">연간</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 캘린더 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5" />
                  날짜 선택
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  locale={ko}
                  className="rounded-md border"
                />
                <div className="mt-4 text-sm text-muted-foreground">
                  선택된 기간: {generatePeriodKey(selectedDate, activeTab)}
                </div>
              </CardContent>
            </Card>

            {/* 인스턴스 목록 */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>체크리스트 목록</CardTitle>
                <CardDescription>작성할 체크리스트를 선택하세요</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {instances.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      해당 기간에 생성된 체크리스트가 없습니다.
                    </div>
                  ) : (
                    instances.map((instance: any) => (
                      <div
                        key={instance.id}
                        className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                          selectedInstance?.id === instance.id
                            ? "border-primary bg-primary/5"
                            : "hover:border-primary/50"
                        }`}
                        onClick={() => setSelectedInstance(instance)}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-medium">{instance.template?.name || "템플릿 없음"}</div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {instance.template?.description || ""}
                            </div>
                            <div className="text-xs text-muted-foreground mt-2">
                              마감: {instance.dueDate ? format(new Date(instance.dueDate), "yyyy-MM-dd HH:mm", { locale: ko }) : "미정"}
                            </div>
                          </div>
                          <div>{getStatusBadge(instance.status)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 작성 폼 */}
          {selectedInstance && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{selectedInstance.template?.name || "체크리스트 작성"}</CardTitle>
                    <CardDescription>{selectedInstance.template?.description || ""}</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleAiGenerate}
                    disabled={isAiGenerating}
                  >
                    {isAiGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        생성 중...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        AI 자동 작성
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 동적 폼 필드 */}
                {selectedInstance.template?.items?.map((item: any, index: number) => (
                  <div key={item.id || index} className="space-y-2">
                    <Label htmlFor={`item-${item.id}`}>
                      {item.label || item.name}
                      {item.required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    {item.type === "text" && (
                      <Input
                        id={`item-${item.id}`}
                        value={formData[item.name] || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, [item.name]: e.target.value })
                        }
                        placeholder={item.placeholder || ""}
                      />
                    )}
                    {item.type === "textarea" && (
                      <Textarea
                        id={`item-${item.id}`}
                        value={formData[item.name] || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, [item.name]: e.target.value })
                        }
                        placeholder={item.placeholder || ""}
                        rows={4}
                      />
                    )}
                    {item.type === "number" && (
                      <Input
                        id={`item-${item.id}`}
                        type="number"
                        value={formData[item.name] || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, [item.name]: e.target.value })
                        }
                        placeholder={item.placeholder || ""}
                      />
                    )}
                    {item.description && (
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    )}
                  </div>
                ))}

                {/* 첨부파일 */}
                <div className="space-y-2">
                  <Label>첨부파일</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      onChange={handleFileUpload}
                      className="flex-1"
                      accept="image/*,.pdf"
                    />
                    <Button variant="outline" size="icon">
                      <Upload className="w-4 h-4" />
                    </Button>
                  </div>
                  {formData.attachments && formData.attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {formData.attachments.map((file: any, index: number) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 text-sm text-muted-foreground"
                        >
                          <FileText className="w-4 h-4" />
                          <span>{file.fileName}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 메모 */}
                <div className="space-y-2">
                  <Label htmlFor="memo">메모</Label>
                  <Textarea
                    id="memo"
                    value={formData.memo || ""}
                    onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                    placeholder="추가 메모를 입력하세요"
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
