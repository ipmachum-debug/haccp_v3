import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText } from "lucide-react";
import { toast } from "sonner";

import { todayLocal } from "../../lib/dateUtils";

export default function ChecklistCreate() {
  const [, setLocation] = useLocation();
  const [templateId, setTemplateId] = useState<string>("");
  const [scheduledDate, setScheduledDate] = useState<string>(todayLocal());

  const { data: templates } = trpc.qualityChecklist.listTemplates.useQuery({ isActive: true });

  // 템플릿 이름에 따른 전용 폼 URL 매핑
  const getFormUrlByTemplateName = (templateName: string): string | null => {
    const mappings: Record<string, string> = {
      "수질 검사": "/quality/water-quality-tests/new",
      "수질검사": "/quality/water-quality-tests/new",
      "공기압축기": "/quality/air-compressors/new",
      "유효성 평가": "/quality/validity-evaluations/new",
      "유효성평가": "/quality/validity-evaluations/new",
      "개인위생 점검": "/quality/personal-hygiene-checks/new",
      "개인위생점검": "/quality/personal-hygiene-checks/new",
      "용수 사용 점검": "/quality/water-usage-checks/new",
      "용수사용점검": "/quality/water-usage-checks/new",
      "설비 세척": "/quality/equipment-cleaning-records/new",
      "설비세척": "/quality/equipment-cleaning-records/new",
      "이물 관리": "/quality/foreign-material-records/new",
      "이물관리": "/quality/foreign-material-records/new",
      "냉동냉장": "/quality/refrigeration-checks/new",
      "냉동·냉장": "/quality/refrigeration-checks/new",
      "포장재 보관": "/quality/packaging-storage-records/new",
      "포장재보관": "/quality/packaging-storage-records/new",
      "품질 이상": "/quality/quality-issue-records/new",
      "품질이상": "/quality/quality-issue-records/new",
      "CAPA": "/quality/capa-records/new",
      "개선조치": "/quality/capa-records/new",
    };

    // 정확한 매칭 시도
    if (mappings[templateName]) {
      return mappings[templateName];
    }

    // 부분 매칭 시도 (템플릿 이름에 키워드가 포함되어 있는 경우)
    for (const [keyword, url] of Object.entries(mappings)) {
      if (templateName.includes(keyword)) {
        return url;
      }
    }

    return null;
  };

  const createInstanceMutation = trpc.qualityChecklist.createInstance.useMutation({
    onSuccess: (data: any) => {
      toast.success("체크리스트가 생성되었습니다");
      
      // 선택된 템플릿 찾기
      const selectedTemplate = templates?.find((t: any) => t.id === parseInt(templateId));
      
      // 전용 폼 URL 확인
      if (selectedTemplate) {
        const formUrl = getFormUrlByTemplateName(selectedTemplate.name);
        if (formUrl) {
          setLocation(formUrl);
          return;
        }
      }
      
      // 전용 폼이 없으면 기본 상세 페이지로 이동
      setLocation(`/quality/checklists/${data.id}`);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateId) {
      toast.error("템플릿을 선택해주세요");
      return;
    }
    if (!scheduledDate) {
      toast.error("예정일을 입력해주세요");
      return;
    }
    createInstanceMutation.mutate({
      templateId: parseInt(templateId),
      targetDate: scheduledDate,
    });
  };

  return (
    <DashboardLayout>
    <div className="space-y-6">
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 bg-clip-text text-transparent">
            새 체크리스트 생성
          </h1>
          <p className="text-muted-foreground mt-2">
            템플릿을 선택하여 새로운 체크리스트를 생성합니다
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              체크리스트 정보
            </CardTitle>
            <CardDescription>
              템플릿과 예정일을 선택해주세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="template">템플릿</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger id="template">
                    <SelectValue placeholder="템플릿 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates?.map((template: any) => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.name} ({template.category})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="scheduledDate">예정일</Label>
                <Input
                  id="scheduledDate"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  required
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/quality/checklists/list")}
                >
                  취소
                </Button>
                <Button type="submit" disabled={createInstanceMutation.isPending}>
                  {createInstanceMutation.isPending ? "생성 중..." : "생성"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
    </DashboardLayout>
  );
}
