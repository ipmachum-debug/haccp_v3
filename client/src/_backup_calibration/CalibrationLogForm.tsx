import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Save, Send, Upload, X, Plus, Check, AlertCircle, Camera } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface CalibrationResult {
  section: string;
  calibrationTemp: string;
  panelTemp: string;
  difference: string;
  pass: boolean;
}

export default function CalibrationLogForm() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/calibration/new");
  const equipmentId = params ? new URLSearchParams(window.location.search).get("equipmentId") : null;

  // 폼 상태
  const [formData, setFormData] = useState({
    equipmentId: equipmentId ? Number(equipmentId) : 0,
    equipmentName: "",
    equipmentCode: "",
    calibrationDate: format(new Date(), "yyyy-MM-dd"),
    nextCalibrationDate: "",
    regularCalibrationDate: "",
    calibrationMethod: `1. 검교정 온도계를 준비한다
2. 판넬 온도계 위치에 검교정 온도계를 고정한다
3. 30분 후 검교정 온도계와 판넬 온도계의 값을 확인한다
4. 오차를 계산하여 판정기준(± 1℃) 이내인지 확인한다
5. 결과를 기록하고 사진을 촬영한다`,
    toleranceCriteria: "± 1℃",
    improvementMethod: "판정기준을 벗어난 경우, 판넬 온도계를 교체하거나 보정한다",
    photoEquipment: "",
    photoPosition: "",
    photoResult: "",
    results: [] as CalibrationResult[],
    deviationContent: "",
    improvementAction: "",
    notes: "",
  });

  const [photoFiles, setPhotoFiles] = useState<{
    equipment: File | null;
    position: File | null;
    result: File | null;
  }>({
    equipment: null,
    position: null,
    result: null,
  });

  // 검교정 설비 조회
  const { data: equipment } = trpc.calibration.getEquipmentById.useQuery(
    { id: Number(equipmentId) },
    { enabled: !!equipmentId }
  );

  // 검교정 기록 생성 mutation
  const createRecordMutation = trpc.calibration.createRecord.useMutation({
    onSuccess: () => {
      alert("검교정 일지가 저장되었습니다");
      setLocation("/calibration");
    },
    onError: (error) => {
      alert(`저장 실패: ${error.message}`);
    },
  });

  // 설비 정보 로드
  useEffect(() => {
    if (equipment) {
      setFormData((prev) => ({
        ...prev,
        equipmentName: equipment.name,
        equipmentCode: equipment.code,
      }));

      // 다음 검교정일 자동 계산 (1년 후)
      const nextDate = new Date();
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      setFormData((prev) => ({
        ...prev,
        nextCalibrationDate: format(nextDate, "yyyy-MM-dd"),
      }));
    }
  }, [equipment]);

  // 사진 업로드 핸들러
  const handlePhotoUpload = async (type: "equipment" | "position" | "result", file: File) => {
    // TODO: 실제 파일 업로드 API 구현 필요
    // 현재는 임시로 파일 객체를 저장
    setPhotoFiles((prev) => ({ ...prev, [type]: file }));

    // 임시 URL 생성
    const tempUrl = URL.createObjectURL(file);
    setFormData((prev) => ({
      ...prev,
      [`photo${type.charAt(0).toUpperCase() + type.slice(1)}`]: tempUrl,
    }));
  };

  // 검교정 결과 추가
  const addResult = () => {
    setFormData((prev) => ({
      ...prev,
      results: [
        ...prev.results,
        {
          section: "",
          calibrationTemp: "",
          panelTemp: "",
          difference: "",
          pass: false,
        },
      ],
    }));
  };

  // 검교정 결과 삭제
  const removeResult = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      results: prev.results.filter((_, i) => i !== index),
    }));
  };

  // 검교정 결과 수정
  const updateResult = (index: number, field: keyof CalibrationResult, value: string | boolean) => {
    setFormData((prev) => {
      const newResults = [...prev.results];
      newResults[index] = { ...newResults[index], [field]: value };

      // 오차 자동 계산
      if (field === "calibrationTemp" || field === "panelTemp") {
        const calibTemp = parseFloat(field === "calibrationTemp" ? (value as string) : newResults[index].calibrationTemp);
        const panelTemp = parseFloat(field === "panelTemp" ? (value as string) : newResults[index].panelTemp);

        if (!isNaN(calibTemp) && !isNaN(panelTemp)) {
          const diff = Math.abs(calibTemp - panelTemp);
          newResults[index].difference = diff.toFixed(1);
          newResults[index].pass = diff <= 1.0;
        }
      }

      return { ...prev, results: newResults };
    });
  };

  // 저장 핸들러
  const handleSave = (status: "draft" | "pending_review") => {
    if (!formData.equipmentId) {
      alert("설비를 선택해주세요");
      return;
    }

    if (!formData.calibrationDate || !formData.nextCalibrationDate) {
      alert("검교정일과 다음 검교정일을 입력해주세요");
      return;
    }

    if (formData.results.length === 0) {
      alert("검교정 결과를 최소 1개 이상 입력해주세요");
      return;
    }

    createRecordMutation.mutate({
      ...formData,
      approvalStatus: status,
    });
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      {/* 헤더 */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            onClick={() => setLocation("/calibration")}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            목록으로
          </Button>
          <h1 className="text-3xl font-bold mb-2">자체 검교정 일지 작성</h1>
          <p className="text-muted-foreground">
            검교정 설비의 정확도를 확인하고 기록하세요
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => handleSave("draft")}
            disabled={createRecordMutation.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            임시저장
          </Button>
          <Button
            onClick={() => handleSave("pending_review")}
            disabled={createRecordMutation.isPending}
          >
            <Send className="w-4 h-4 mr-2" />
            승인요청
          </Button>
        </div>
      </div>

      {/* 설비 정보 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>설비 정보</CardTitle>
          <CardDescription>검교정 대상 설비의 정보입니다</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>설비코드</Label>
              <Input value={formData.equipmentCode} disabled />
            </div>
            <div>
              <Label>설비명</Label>
              <Input value={formData.equipmentName} disabled />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 검교정 일자 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>검교정 일자</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>검교정일 *</Label>
              <Input
                type="date"
                value={formData.calibrationDate}
                onChange={(e) => setFormData({ ...formData, calibrationDate: e.target.value })}
              />
            </div>
            <div>
              <Label>다음 검교정일 *</Label>
              <Input
                type="date"
                value={formData.nextCalibrationDate}
                onChange={(e) => setFormData({ ...formData, nextCalibrationDate: e.target.value })}
              />
            </div>
            <div>
              <Label>정기 검교정일</Label>
              <Input
                type="date"
                value={formData.regularCalibrationDate}
                onChange={(e) => setFormData({ ...formData, regularCalibrationDate: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 검교정 방법 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>검교정 방법</CardTitle>
          <CardDescription>검교정 절차를 확인하세요</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.calibrationMethod}
            onChange={(e) => setFormData({ ...formData, calibrationMethod: e.target.value })}
            rows={6}
            className="font-mono text-sm"
          />
        </CardContent>
      </Card>

      {/* 판정기준 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>판정기준</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={formData.toleranceCriteria}
            onChange={(e) => setFormData({ ...formData, toleranceCriteria: e.target.value })}
          />
        </CardContent>
      </Card>

      {/* 사진 업로드 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="w-5 h-5" />
            검교정 사진 (3장)
          </CardTitle>
          <CardDescription>검교정 과정을 사진으로 기록하세요</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {/* 검교정 온도계 사진 */}
            <div className="space-y-2">
              <Label>1. 검교정 온도계</Label>
              {formData.photoEquipment ? (
                <div className="relative">
                  <img
                    src={formData.photoEquipment}
                    alt="검교정 온도계"
                    className="w-full h-48 object-cover rounded-md"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="absolute top-2 right-2"
                    onClick={() => {
                      setFormData({ ...formData, photoEquipment: "" });
                      setPhotoFiles({ ...photoFiles, equipment: null });
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-md cursor-pointer hover:bg-gray-50">
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <span className="text-sm text-gray-500">클릭하여 업로드</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload("equipment", file);
                    }}
                  />
                </label>
              )}
            </div>

            {/* 위치 고정 사진 */}
            <div className="space-y-2">
              <Label>2. 위치 고정</Label>
              {formData.photoPosition ? (
                <div className="relative">
                  <img
                    src={formData.photoPosition}
                    alt="위치 고정"
                    className="w-full h-48 object-cover rounded-md"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="absolute top-2 right-2"
                    onClick={() => {
                      setFormData({ ...formData, photoPosition: "" });
                      setPhotoFiles({ ...photoFiles, position: null });
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-md cursor-pointer hover:bg-gray-50">
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <span className="text-sm text-gray-500">클릭하여 업로드</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload("position", file);
                    }}
                  />
                </label>
              )}
            </div>

            {/* 결과 값 사진 */}
            <div className="space-y-2">
              <Label>3. 결과 값</Label>
              {formData.photoResult ? (
                <div className="relative">
                  <img
                    src={formData.photoResult}
                    alt="결과 값"
                    className="w-full h-48 object-cover rounded-md"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="absolute top-2 right-2"
                    onClick={() => {
                      setFormData({ ...formData, photoResult: "" });
                      setPhotoFiles({ ...photoFiles, result: null });
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-md cursor-pointer hover:bg-gray-50">
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <span className="text-sm text-gray-500">클릭하여 업로드</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload("result", file);
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 검교정 결과 테이블 */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>검교정 결과</CardTitle>
              <CardDescription>각 구역별 검교정 결과를 입력하세요</CardDescription>
            </div>
            <Button onClick={addResult} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              결과 추가
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {formData.results.length === 0 ? (
            <Alert>
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>
                검교정 결과를 추가해주세요. 최소 1개 이상의 결과가 필요합니다.
              </AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[150px]">구분</TableHead>
                  <TableHead>검교정 온도계 (℃)</TableHead>
                  <TableHead>판넬 온도계 (℃)</TableHead>
                  <TableHead>오차 (℃)</TableHead>
                  <TableHead>합격 판정</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {formData.results.map((result, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Input
                        value={result.section}
                        onChange={(e) => updateResult(index, "section", e.target.value)}
                        placeholder="예: 냉장고 상단"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.1"
                        value={result.calibrationTemp}
                        onChange={(e) => updateResult(index, "calibrationTemp", e.target.value)}
                        placeholder="0.0"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.1"
                        value={result.panelTemp}
                        onChange={(e) => updateResult(index, "panelTemp", e.target.value)}
                        placeholder="0.0"
                      />
                    </TableCell>
                    <TableCell>
                      <Input value={result.difference} disabled className="bg-gray-50" />
                    </TableCell>
                    <TableCell>
                      <Badge className={result.pass ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                        {result.pass ? (
                          <>
                            <Check className="w-3 h-3 mr-1" />
                            합격
                          </>
                        ) : (
                          <>
                            <X className="w-3 h-3 mr-1" />
                            불합격
                          </>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeResult(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 이탈 내용 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>이탈 내용</CardTitle>
          <CardDescription>판정기준을 벗어난 경우 이탈 내용을 기록하세요</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.deviationContent}
            onChange={(e) => setFormData({ ...formData, deviationContent: e.target.value })}
            rows={3}
            placeholder="예: 냉장고 하단 구역의 온도 오차가 1.5℃로 판정기준을 초과함"
          />
        </CardContent>
      </Card>

      {/* 개선조치 방법 및 결과 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>개선조치 방법 및 결과</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>개선조치 방법</Label>
            <Textarea
              value={formData.improvementMethod}
              onChange={(e) => setFormData({ ...formData, improvementMethod: e.target.value })}
              rows={3}
            />
          </div>
          <div>
            <Label>개선조치 결과</Label>
            <Textarea
              value={formData.improvementAction}
              onChange={(e) => setFormData({ ...formData, improvementAction: e.target.value })}
              rows={3}
              placeholder="예: 판넬 온도계를 교체하고 재검교정 실시, 오차 0.5℃로 개선됨"
            />
          </div>
        </CardContent>
      </Card>

      {/* 비고 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>비고</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={3}
            placeholder="추가 메모사항을 입력하세요"
          />
        </CardContent>
      </Card>

      {/* 하단 버튼 */}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => setLocation("/calibration")}
        >
          취소
        </Button>
        <Button
          variant="outline"
          onClick={() => handleSave("draft")}
          disabled={createRecordMutation.isPending}
        >
          <Save className="w-4 h-4 mr-2" />
          임시저장
        </Button>
        <Button
          onClick={() => handleSave("pending_review")}
          disabled={createRecordMutation.isPending}
        >
          <Send className="w-4 h-4 mr-2" />
          승인요청
        </Button>
      </div>
    </div>
  );
}
