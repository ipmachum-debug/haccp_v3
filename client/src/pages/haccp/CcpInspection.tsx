import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Plus, Save, CheckCircle2, UserCheck, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import confetti from "canvas-confetti";

export default function CcpInspection() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const instanceId = params.id ? parseInt(params.id, 10) : 0;

  const { data: rows, refetch } = trpc.ccp.getRowsByInstanceId.useQuery(
    { instanceId },
    { enabled: !!instanceId }
  );
  
  const { data: instance } = trpc.ccp.getInstanceById.useQuery(
    { instanceId },
    { enabled: !!instanceId }
  );

  // CCP 템플릿 조회 (한계기준 정보)
  const { data: template } = trpc.ccp.getTemplateByType.useQuery(
    { ccpType: instance?.ccpType || "" },
    { enabled: !!instance?.ccpType }
  );

  const [formData, setFormData] = useState({
    tempC: "",
    durationMin: "",
    pressureBar: "",
    result: "" as "PASS" | "FAIL" | "N/A" | "",
    note: "",
  });

  const [deviationWarning, setDeviationWarning] = useState<string | null>(null);

  // 실시간 한계기준 검사
  useEffect(() => {
    if (!template || !template.rows || template.rows.length === 0) {
      setDeviationWarning(null);
      return;
    }

    const warnings: string[] = [];

    // 온도 검사
    if (formData.tempC && template.rows[0]) {
      const tempValue = parseFloat(formData.tempC);
      const row = template.rows[0];
      
      if (row.criticalLimitMin && tempValue < parseFloat(row.criticalLimitMin)) {
        warnings.push(`온도가 한계기준 최소값(${row.criticalLimitMin}${row.unit || "°C"})보다 낮습니다!`);
      }
      if (row.criticalLimitMax && tempValue > parseFloat(row.criticalLimitMax)) {
        warnings.push(`온도가 한계기준 최대값(${row.criticalLimitMax}${row.unit || "°C"})보다 높습니다!`);
      }
    }

    // 시간 검사
    if (formData.durationMin && template.rows[1]) {
      const durationValue = parseInt(formData.durationMin);
      const row = template.rows[1];
      
      if (row.criticalLimitMin && durationValue < parseFloat(row.criticalLimitMin)) {
        warnings.push(`시간이 한계기준 최소값(${row.criticalLimitMin}${row.unit || "분"})보다 짧습니다!`);
      }
      if (row.criticalLimitMax && durationValue > parseFloat(row.criticalLimitMax)) {
        warnings.push(`시간이 한계기준 최대값(${row.criticalLimitMax}${row.unit || "분"})보다 깁니다!`);
      }
    }

    // 압력 검사
    if (formData.pressureBar && template.rows[2]) {
      const pressureValue = parseFloat(formData.pressureBar);
      const row = template.rows[2];
      
      if (row.criticalLimitMin && pressureValue < parseFloat(row.criticalLimitMin)) {
        warnings.push(`압력이 한계기준 최소값(${row.criticalLimitMin}${row.unit || "bar"})보다 낮습니다!`);
      }
      if (row.criticalLimitMax && pressureValue > parseFloat(row.criticalLimitMax)) {
        warnings.push(`압력이 한계기준 최대값(${row.criticalLimitMax}${row.unit || "bar"})보다 높습니다!`);
      }
    }

    setDeviationWarning(warnings.length > 0 ? warnings.join(" ") : null);
  }, [formData.tempC, formData.durationMin, formData.pressureBar, template]);

  const createRowMutation = trpc.ccp.createRow.useMutation({
    onSuccess: (data: any) => {
      if (data.deviation || deviationWarning) {
        toast.warning("⚠️ CCP 한계기준 이탈 발생! 조치가 필요합니다.", { duration: 5000 });
      } else {
        toast.success("점검 데이터가 저장되었습니다");
      }
      refetch();
      // 폼 초기화
      setFormData({
        tempC: "",
        durationMin: "",
        pressureBar: "",
        result: "",
        note: "",
      });
      setDeviationWarning(null);
    },
    onError: (error: { message: string }) => {
      toast.error(`저장 실패: ${error.message}`);
    },
  });

  const updateStatusMutation = trpc.ccp.updateStatus.useMutation({
    onSuccess: () => {
      // 축하 애니메이션
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899']
      });
      
      toast.success("CCP 점검이 완료되었습니다!");
      setLocation(`/dashboard/batch`);
    },
    onError: (error: { message: string }) => {
      toast.error(`제출 실패: ${error.message}`);
    },
  });
  
  const requestReviewMutation = trpc.approval.requestCcpReview.useMutation({
    onSuccess: () => {
      toast.success("CCP 검토 요청이 전송되었습니다");
    },
    onError: (error: { message: string }) => {
      toast.error(`검토 요청 실패: ${error.message}`);
    },
  });

  const handleAddRow = () => {
    if (!formData.result) {
      toast.error("결과를 선택해주세요");
      return;
    }

    createRowMutation.mutate({
      instanceId,
      measuredAt: new Date(),
      tempC: formData.tempC || undefined,
      durationMin: formData.durationMin ? parseInt(formData.durationMin) : undefined,
      pressureBar: formData.pressureBar || undefined,
      result: formData.result,
      note: formData.note || undefined,
      sortOrder: rows ? rows.length + 1 : 1,
    });
  };

  const handleSubmit = () => {
    if (!rows || rows.length === 0) {
      toast.error("점검 데이터를 먼저 추가해주세요");
      return;
    }

    updateStatusMutation.mutate({
      instanceId,
      status: "submitted",
    });
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:gap-6">
        {/* 헤더 */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="lg"
              className="md:size-icon"
              onClick={() => setLocation(`/dashboard/batch`)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">CCP 점검 기록</h1>
              <p className="text-muted-foreground mt-1">중요관리점 점검 데이터를 입력하세요</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={updateStatusMutation.isPending}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {updateStatusMutation.isPending ? "제출 중..." : "점검 완료 및 제출"}
            </Button>
            {rows && rows.length > 0 && (
              <Button
                variant="default"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => requestReviewMutation.mutate({
                  ccpInstanceId: instanceId,
                  title: `CCP 점검 검토 요청`,
                  description: `CCP 점검이 완료되었습니다. 검토를 요청합니다.`,
                  priority: "high" as const
                })}
                disabled={requestReviewMutation.isPending}
              >
                <UserCheck className="mr-2 h-4 w-4" />
                검토 요청
              </Button>
            )}
          </div>
        </div>

        {/* 한계기준 표시 */}
        {template && template.criticalLimit && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>CCP 한계기준</AlertTitle>
            <AlertDescription className="text-base">
              {template.criticalLimit}
            </AlertDescription>
          </Alert>
        )}

        {/* 실시간 이탈 경고 */}
        {deviationWarning && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>⚠️ 한계기준 이탈 감지</AlertTitle>
            <AlertDescription className="text-base font-semibold">
              {deviationWarning}
            </AlertDescription>
          </Alert>
        )}

        {/* 점검 데이터 입력 폼 */}
        <Card>
          <CardHeader>
            <CardTitle>점검 데이터 입력</CardTitle>
            <CardDescription>온도, 시간, 압력 등의 측정값을 입력하세요</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tempC">
                  온도 (°C)
                  {template && template.rows && template.rows[0] && (
                    <span className="text-muted-foreground text-sm ml-2">
                      ({template.rows[0].criticalLimitMin && `${template.rows[0].criticalLimitMin}~`}
                      {template.rows[0].criticalLimitMax && `${template.rows[0].criticalLimitMax}`}
                      {template.rows[0].unit || "°C"})
                    </span>
                  )}
                </Label>
                <Input
                  id="tempC"
                  type="number"
                  step="0.1"
                  placeholder="85.0"
                  value={formData.tempC}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData({ ...formData, tempC: value });
                  }}
                  className="h-12 text-lg md:h-10 md:text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="durationMin">
                  시간 (분)
                  {template && template.rows && template.rows[1] && (
                    <span className="text-muted-foreground text-sm ml-2">
                      ({template.rows[1].criticalLimitMin && `${template.rows[1].criticalLimitMin}~`}
                      {template.rows[1].criticalLimitMax && `${template.rows[1].criticalLimitMax}`}
                      {template.rows[1].unit || "분"})
                    </span>
                  )}
                </Label>
                <Input
                  id="durationMin"
                  type="number"
                  placeholder="15"
                  value={formData.durationMin}
                  onChange={(e) => setFormData({ ...formData, durationMin: e.target.value })}
                  className="h-12 text-lg md:h-10 md:text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pressureBar">
                  압력 (bar)
                  {template && template.rows && template.rows[2] && (
                    <span className="text-muted-foreground text-sm ml-2">
                      ({template.rows[2].criticalLimitMin && `${template.rows[2].criticalLimitMin}~`}
                      {template.rows[2].criticalLimitMax && `${template.rows[2].criticalLimitMax}`}
                      {template.rows[2].unit || "bar"})
                    </span>
                  )}
                </Label>
                <Input
                  id="pressureBar"
                  type="number"
                  step="0.01"
                  placeholder="1.50"
                  value={formData.pressureBar}
                  onChange={(e) => setFormData({ ...formData, pressureBar: e.target.value })}
                  className="h-12 text-lg md:h-10 md:text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="result">결과 *</Label>
                <Select
                  value={formData.result}
                  onValueChange={(value) =>
                    setFormData({ ...formData, result: value as "PASS" | "FAIL" | "N/A" })
                  }
                >
                  <SelectTrigger id="result" className="h-12 text-lg md:h-10 md:text-base">
                    <SelectValue placeholder="결과 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PASS">적합 (PASS)</SelectItem>
                    <SelectItem value="FAIL">부적합 (FAIL)</SelectItem>
                    <SelectItem value="N/A">해당없음 (N/A)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="note">비고</Label>
                <Textarea
                  id="note"
                  placeholder="특이사항이나 조치사항을 입력하세요"
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  rows={3}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button 
                onClick={handleAddRow} 
                disabled={createRowMutation.isPending}
                className="h-12 text-lg md:h-10 md:text-base w-full md:w-auto"
              >
                <Plus className="mr-2 h-4 w-4" />
                {createRowMutation.isPending ? "추가 중..." : "점검 데이터 추가"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 점검 기록 목록 */}
        <Card>
          <CardHeader>
            <CardTitle>점검 기록 목록</CardTitle>
            <CardDescription>입력된 점검 데이터를 확인하세요</CardDescription>
          </CardHeader>
          <CardContent>
            {rows && rows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">순서</th>
                      <th className="text-left p-2">측정 시각</th>
                      <th className="text-left p-2">온도 (°C)</th>
                      <th className="text-left p-2">시간 (분)</th>
                      <th className="text-left p-2">압력 (bar)</th>
                      <th className="text-left p-2">결과</th>
                      <th className="text-left p-2">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row: any) => (
                      <tr key={row.id} className="border-b">
                        <td className="p-2">{row.sortOrder}</td>
                        <td className="p-2">
                          {row.measuredAt ? new Date(row.measuredAt).toLocaleString("ko-KR") : "-"}
                        </td>
                        <td className="p-2">{row.tempC || "-"}</td>
                        <td className="p-2">{row.durationMin || "-"}</td>
                        <td className="p-2">{row.pressureBar || "-"}</td>
                        <td className="p-2">
                          <span
                            className={`inline-block px-2 py-1 rounded text-sm ${
                              row.result === "PASS"
                                ? "bg-green-100 text-green-800"
                                : row.result === "FAIL"
                                ? "bg-red-100 text-red-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {row.result}
                          </span>
                        </td>
                        <td className="p-2">{row.note || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                아직 점검 데이터가 없습니다. 위 폼에서 데이터를 입력해주세요.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
