import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileText, CheckCircle, Sparkles, Loader2,
} from "lucide-react";

// ============================================================================
// Tab 4: 시정조치 AI
// ============================================================================
export function CorrectiveActionTab() {
  const [deviationType, setDeviationType] = useState("CCP 온도 이탈");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [actualValue, setActualValue] = useState("");
  const [standardValue, setStandardValue] = useState("");
  const [draft, setDraft] = useState<Record<string, string> | null>(null);

  const mutation = trpc.ai.generateCorrectiveAction.useMutation();

  const handleGenerate = async () => {
    if (!description.trim()) return;
    const result = await mutation.mutateAsync({
      type: deviationType,
      description,
      location: location || undefined,
      batchCode: batchCode || undefined,
      actualValue: actualValue || undefined,
      standardValue: standardValue || undefined,
    });
    if (result.success) {
      setDraft(result.draft as Record<string, string>);
    }
  };

  const FIELD_LABELS: Record<string, string> = {
    immediateAction: "즉시 조치사항",
    rootCauseAnalysis: "근본원인 분석",
    rootCauseCategory: "원인 분류",
    correctiveAction: "시정조치 내용",
    preventiveAction: "재발방지 대책",
    verificationMethod: "효과 검증 방법",
    timeline: "조치 기한",
    responsiblePerson: "담당부서/담당자",
    additionalNotes: "기타 참고사항",
  };

  return (
    <div className="space-y-2.5">
      <Card>
        <CardContent className="py-2.5 px-3 space-y-2.5">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <FileText className="w-4 h-4" /> 시정조치서 AI 초안 생성
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div>
              <Label>이탈/부적합 유형</Label>
              <Select value={deviationType} onValueChange={setDeviationType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CCP 온도 이탈">CCP 온도 이탈</SelectItem>
                  <SelectItem value="CCP 시간 이탈">CCP 시간 이탈</SelectItem>
                  <SelectItem value="CCP 압력 이탈">CCP 압력 이탈</SelectItem>
                  <SelectItem value="금속검출 부적합">금속검출 부적합</SelectItem>
                  <SelectItem value="위생점검 불량">위생점검 불량</SelectItem>
                  <SelectItem value="원재료 검사 부적합">원재료 검사 부적합</SelectItem>
                  <SelectItem value="출하검사 부적합">출하검사 부적합</SelectItem>
                  <SelectItem value="보관온도 이상">보관온도 이상</SelectItem>
                  <SelectItem value="기타">기타</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>발생 장소</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="예: 가열실, 냉각실, 포장실" />
            </div>
          </div>
          <div>
            <Label>상세 설명</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="이탈/부적합의 상세 내용을 입력하세요. 예: 증숙 공정에서 중심온도 78도C로 한계기준(85도C) 미달..."
              className="min-h-[100px]" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <div>
              <Label>관련 배치코드</Label>
              <Input value={batchCode} onChange={(e) => setBatchCode(e.target.value)} placeholder="예: B-2026-0316-001" />
            </div>
            <div>
              <Label>실측값</Label>
              <Input value={actualValue} onChange={(e) => setActualValue(e.target.value)} placeholder="예: 78도C" />
            </div>
            <div>
              <Label>기준값</Label>
              <Input value={standardValue} onChange={(e) => setStandardValue(e.target.value)} placeholder="예: 85도C 이상" />
            </div>
          </div>
          <Button onClick={handleGenerate} disabled={mutation.isPending || !description.trim()}>
            {mutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            시정조치서 초안 생성
          </Button>
        </CardContent>
      </Card>

      {/* 생성된 초안 */}
      {draft && (
        <Card className="border-green-200">
          <CardContent className="py-2.5 px-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5 text-green-800 mb-2">
              <CheckCircle className="w-4 h-4" /> AI 생성 시정조치서 초안
            </h3>
            <div className="space-y-2">
              {Object.entries(draft)
                .filter(([key]) => FIELD_LABELS[key])
                .map(([key, value]) => (
                  <div key={key} className="border-b pb-2">
                    <Label className="text-xs text-muted-foreground">{FIELD_LABELS[key]}</Label>
                    <p className="text-sm mt-1">{value}</p>
                  </div>
                ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4 border-t pt-2">
              * 이 내용은 AI가 생성한 초안입니다. 반드시 담당자가 검토 후 수정/확정하세요.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
