import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Clock, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface CcpInspectionCardProps {
  ccp: any;
  onRecordSaved: () => void;
}

export function CcpInspectionCard({ ccp, onRecordSaved }: CcpInspectionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [measuredValue, setMeasuredValue] = useState("");
  const [result, setResult] = useState<"pass" | "fail">("pass");
  const [notes, setNotes] = useState("");

  const { data: records, refetch: refetchRecords } = trpc.ccp.getRecords.useQuery(
    { instanceId: ccp.id },
    { enabled: isExpanded }
  );

  const createRecordMutation = trpc.ccp.createRecord.useMutation({
    onSuccess: () => {
      toast.success("CCP 점검 기록이 저장되었습니다");
      setMeasuredValue("");
      setResult("pass");
      setNotes("");
      refetchRecords();
      onRecordSaved();
    },
    onError: (error) => {
      toast.error(`저장 실패: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!measuredValue.trim()) {
      toast.error("측정값을 입력해주세요");
      return;
    }

    createRecordMutation.mutate({
      instanceId: ccp.id,
      measuredValue: measuredValue.trim(),
      result,
      notes: notes.trim(),
    });
  };

  return (
    <div className="border rounded-lg">
      {/* CCP 헤더 */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-4">
          <div
            className={`p-2 rounded-full ${
              ccp.status === "approved"
                ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                : ccp.status === "submitted"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                  : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            {ccp.status === "approved" ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <Clock className="h-5 w-5" />
            )}
          </div>
          <div>
            <div className="font-semibold">
              {ccp.ccpType === "heating"
                ? "가열 살균"
                : ccp.ccpType === "cooling"
                  ? "냉각"
                  : ccp.ccpType === "metal_detection"
                    ? "금속 검출"
                    : ccp.templateName || ccp.ccpType}
            </div>
            <div className="text-sm text-muted-foreground">
              상태: {ccp.status === "draft" ? "초안" : ccp.status === "submitted" ? "제출됨" : ccp.status === "approved" ? "승인됨" : "반려됨"}
            </div>
            {ccp.criticalLimit && (
              <div className="text-sm text-orange-600 dark:text-orange-400 font-medium mt-1">
                한계기준: {ccp.criticalLimit}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {records && records.length > 0 && (
            <span className="text-sm text-muted-foreground">
              점검 기록: {records.length}건
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* CCP 점검 기록 입력 폼 */}
      {isExpanded && (
        <div className="p-4 border-t space-y-4">
          {/* 점검 기록 입력 폼 */}
          <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-accent/20 rounded-lg">
            <h4 className="font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              실시간 점검 기록 입력
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor={`measured-${ccp.id}`}>측정값 *</Label>
                <Input
                  id={`measured-${ccp.id}`}
                  type="text"
                  placeholder="예: 85°C, 120분, 정상"
                  value={measuredValue}
                  onChange={(e) => setMeasuredValue(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`result-${ccp.id}`}>판정 *</Label>
                <Select value={result} onValueChange={(v) => setResult(v as "pass" | "fail")}>
                  <SelectTrigger id={`result-${ccp.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pass">적합</SelectItem>
                    <SelectItem value="fail">부적합</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`notes-${ccp.id}`}>비고</Label>
                <Input
                  id={`notes-${ccp.id}`}
                  type="text"
                  placeholder="추가 메모"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={createRecordMutation.isPending}
              className="w-full"
            >
              {createRecordMutation.isPending ? "저장 중..." : "점검 기록 저장"}
            </Button>
          </form>

          {/* 점검 기록 목록 */}
          {records && records.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">점검 이력</h4>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {records.map((record: any) => (
                  <div
                    key={record.id}
                    className="p-3 border rounded-lg bg-background"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`text-sm font-semibold ${
                          record.recordData.result === "pass"
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {record.recordData.result === "pass" ? "✓ 적합" : "✗ 부적합"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(record.createdAt).toLocaleString("ko-KR")}
                      </span>
                    </div>
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">측정값:</span>
                        <span className="font-medium">{record.recordData.measuredValue}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">점검자:</span>
                        <span>{record.recordData.inspector}</span>
                      </div>
                      {record.recordData.notes && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">비고:</span>
                          <span>{record.recordData.notes}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
