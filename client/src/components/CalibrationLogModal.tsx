import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Save, Upload, X, Plus } from "lucide-react";

interface CalibrationLogModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CalibrationLogModal({ open, onClose, onSuccess }: CalibrationLogModalProps) {
  const [currentTab, setCurrentTab] = useState("basic");
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null);

  // 기본 정보
  const [calibrationDate, setCalibrationDate] = useState("");
  const [nextCalibrationDate, setNextCalibrationDate] = useState("");
  const [regularCalibrationDate, setRegularCalibrationDate] = useState("");

  // 검교정 방법 (5단계)
  const [method1, setMethod1] = useState("");
  const [method2, setMethod2] = useState("");
  const [method3, setMethod3] = useState("");
  const [method4, setMethod4] = useState("");
  const [method5, setMethod5] = useState("");

  // 판정기준
  const [toleranceCriteria, setToleranceCriteria] = useState("± 1℃");

  // 개선조치 방법
  const [improvementMethod, setImprovementMethod] = useState("");

  // 사진 3장
  const [photoEquipment, setPhotoEquipment] = useState("");
  const [photoPosition, setPhotoPosition] = useState("");
  const [photoResult, setPhotoResult] = useState("");

  // 검교정 결과 (동적 행 추가 가능)
  const [results, setResults] = useState<Array<{
    category: string;
    calibrationValue: string;
    panelValue: string;
    deviation: string;
    pass: string;
  }>>([
    { category: "", calibrationValue: "", panelValue: "", deviation: "", pass: "" }
  ]);

  // 이탈 내용
  const [deviationContent, setDeviationContent] = useState("");

  // 개선조치 및 결과
  const [improvementAction, setImprovementAction] = useState("");

  // 비고
  const [notes, setNotes] = useState("");

  // 설비 목록 조회
  const { data: equipmentList } = trpc.calibration.listEquipment.useQuery({ isActive: true });

  // 선택된 설비 정보
  const { data: selectedEquipment } = trpc.calibration.getEquipmentById.useQuery(
    { id: selectedEquipmentId! },
    { enabled: !!selectedEquipmentId }
  );

  // 검교정 일지 생성 mutation
  const createLogMutation = trpc.calibration.createRecord.useMutation({
    onSuccess: () => {
      alert("검교정 일지가 저장되었습니다");
      onSuccess();
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      alert(`저장 실패: ${error.message}`);
    },
  });

  // 설비 선택 시 정보 자동 로드
  useEffect(() => {
    if (selectedEquipment) {
      // 설비 유형에 따라 기본 검교정 방법 설정
      if (selectedEquipment.equipmentType === "thermometer") {
        setMethod1("한국표준과학연구원 사이트에 접속하여 표준시각으로 맞춘다 (Tick 3.1)을 다운드로 URL: https://www.kriss.re.kr/standard/view.do?pg=standard_set_01");
        setMethod2("다운로드 압축파일을 풀고 실행 파일 가동시킨다.");
        setMethod3("프로그램 타이머 온도계를 오븐에 삽입하여 60초이상 작동을 해 동시에 맞추어 보고 프로그램 오차를 측정 (모니터링 시간에 맞추어 입력수 있는 간격 설정)");
        setMethod4("프로그램 온도계의 오차를 측정 (모니터링 시간에 맞추어 입력수 있는 간격 설정)");
        setMethod5("검교정 온도계를 같은 제품로 측정하여 같은 위치 수 있도록 한다.");
        setToleranceCriteria("± 1℃");
      } else if (selectedEquipment.equipmentType === "timer") {
        setMethod1("보정 후 재측정");
        setMethod2("보정 불가능한 경우 타이머 교체");
        setToleranceCriteria("± 1초");
      }
    }
  }, [selectedEquipment]);

  const resetForm = () => {
    setCurrentTab("basic");
    setSelectedEquipmentId(null);
    setCalibrationDate("");
    setNextCalibrationDate("");
    setRegularCalibrationDate("");
    setMethod1("");
    setMethod2("");
    setMethod3("");
    setMethod4("");
    setMethod5("");
    setToleranceCriteria("± 1℃");
    setImprovementMethod("");
    setPhotoEquipment("");
    setPhotoPosition("");
    setPhotoResult("");
    setResults([{ category: "", calibrationValue: "", panelValue: "", deviation: "", pass: "" }]);
    setDeviationContent("");
    setImprovementAction("");
    setNotes("");
  };

  const handleSave = (status: "draft" | "pending_review") => {
    if (!selectedEquipmentId) {
      alert("검교정 설비를 선택해주세요");
      return;
    }

    if (!calibrationDate) {
      alert("검교정일을 입력해주세요");
      return;
    }

    createLogMutation.mutate({
      equipmentId: selectedEquipmentId,
      calibrationDate,
      nextCalibrationDate,
      calibrationMethod: [method1, method2, method3, method4, method5].filter(m => m).join("\n"),
      toleranceCriteria,
      improvementMethod,
      photoEquipment,
      photoPosition,
      photoResult,
      results: JSON.stringify(results),
      deviationContent,
      improvementAction,
      notes,
      status,
    });
  };

  const addResultRow = () => {
    setResults([...results, { category: "", calibrationValue: "", panelValue: "", deviation: "", pass: "" }]);
  };

  const removeResultRow = (index: number) => {
    setResults(results.filter((_, i) => i !== index));
  };

  const updateResult = (index: number, field: string, value: string) => {
    const newResults = [...results];
    newResults[index] = { ...newResults[index], [field]: value };

    // 오차 자동 계산
    if (field === "calibrationValue" || field === "panelValue") {
      const calibVal = parseFloat(newResults[index].calibrationValue);
      const panelVal = parseFloat(newResults[index].panelValue);
      if (!isNaN(calibVal) && !isNaN(panelVal)) {
        newResults[index].deviation = (calibVal - panelVal).toFixed(1);
        
        // 합격 판정 자동 표시
        const deviation = Math.abs(calibVal - panelVal);
        const tolerance = parseFloat(toleranceCriteria.replace(/[^0-9.]/g, ""));
        newResults[index].pass = deviation <= tolerance ? "합격" : "불합격";
      }
    }

    setResults(newResults);
  };

  const handlePhotoUpload = (type: "equipment" | "position" | "result", e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        if (type === "equipment") setPhotoEquipment(base64);
        else if (type === "position") setPhotoPosition(base64);
        else setPhotoResult(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>자체 검교정 일지 작성</DialogTitle>
        </DialogHeader>

        <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">기본정보</TabsTrigger>
            <TabsTrigger value="method">검교정방법</TabsTrigger>
            <TabsTrigger value="photos">사진첨부</TabsTrigger>
            <TabsTrigger value="results">검교정결과</TabsTrigger>
          </TabsList>

          {/* 기본 정보 탭 */}
          <TabsContent value="basic" className="space-y-4">
            <div>
              <Label>검교정 설비 선택 *</Label>
              <Select
                value={selectedEquipmentId?.toString()}
                onValueChange={(value) => setSelectedEquipmentId(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="설비를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {equipmentList?.map((equipment: any) => (
                    <SelectItem key={equipment.id} value={equipment.id.toString()}>
                      {equipment.code} - {equipment.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedEquipment && (
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <p><strong>설비명:</strong> {selectedEquipment.name}</p>
                <p><strong>설비코드:</strong> {selectedEquipment.code}</p>
                <p><strong>설비유형:</strong> {selectedEquipment.equipmentType}</p>
                <p><strong>설치위치:</strong> {(selectedEquipment as any)?.location || '-'}</p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>검교정일 *</Label>
                <Input
                  type="date"
                  value={calibrationDate}
                  onChange={(e) => setCalibrationDate(e.target.value)}
                />
              </div>
              <div>
                <Label>다음 검교정일</Label>
                <Input
                  type="date"
                  value={nextCalibrationDate}
                  onChange={(e) => setNextCalibrationDate(e.target.value)}
                />
              </div>
              <div>
                <Label>정기 검교정일</Label>
                <Input
                  type="date"
                  value={regularCalibrationDate}
                  onChange={(e) => setRegularCalibrationDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label>판정기준</Label>
              <Input
                value={toleranceCriteria}
                onChange={(e) => setToleranceCriteria(e.target.value)}
                placeholder="예: ± 1℃"
              />
            </div>
          </TabsContent>

          {/* 검교정 방법 탭 */}
          <TabsContent value="method" className="space-y-4">
            <div className="space-y-3">
              <div>
                <Label>1. 검교정 방법</Label>
                <Textarea
                  value={method1}
                  onChange={(e) => setMethod1(e.target.value)}
                  rows={2}
                  placeholder="첫 번째 단계"
                />
              </div>
              <div>
                <Label>2. 검교정 방법</Label>
                <Textarea
                  value={method2}
                  onChange={(e) => setMethod2(e.target.value)}
                  rows={2}
                  placeholder="두 번째 단계"
                />
              </div>
              <div>
                <Label>3. 검교정 방법</Label>
                <Textarea
                  value={method3}
                  onChange={(e) => setMethod3(e.target.value)}
                  rows={2}
                  placeholder="세 번째 단계"
                />
              </div>
              <div>
                <Label>4. 검교정 방법</Label>
                <Textarea
                  value={method4}
                  onChange={(e) => setMethod4(e.target.value)}
                  rows={2}
                  placeholder="네 번째 단계"
                />
              </div>
              <div>
                <Label>5. 검교정 방법</Label>
                <Textarea
                  value={method5}
                  onChange={(e) => setMethod5(e.target.value)}
                  rows={2}
                  placeholder="다섯 번째 단계"
                />
              </div>
            </div>

            <div>
              <Label>개선조치 방법</Label>
              <Textarea
                value={improvementMethod}
                onChange={(e) => setImprovementMethod(e.target.value)}
                rows={3}
                placeholder="개선조치 방법을 입력하세요"
              />
            </div>
          </TabsContent>

          {/* 사진 첨부 탭 */}
          <TabsContent value="photos" className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>측정 도구 사진</Label>
                <div className="border-2 border-dashed rounded-lg p-4 text-center">
                  {photoEquipment ? (
                    <div className="relative">
                      <img src={photoEquipment} alt="측정 도구" className="w-full h-40 object-cover rounded" />
                      <Button
                        size="sm"
                        variant="destructive"
                        className="absolute top-2 right-2"
                        onClick={() => setPhotoEquipment("")}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">클릭하여 업로드</p>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handlePhotoUpload("equipment", e)}
                      />
                    </label>
                  )}
                </div>
              </div>

              <div>
                <Label>시작일 시간 사진</Label>
                <div className="border-2 border-dashed rounded-lg p-4 text-center">
                  {photoPosition ? (
                    <div className="relative">
                      <img src={photoPosition} alt="시작일 시간" className="w-full h-40 object-cover rounded" />
                      <Button
                        size="sm"
                        variant="destructive"
                        className="absolute top-2 right-2"
                        onClick={() => setPhotoPosition("")}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">클릭하여 업로드</p>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handlePhotoUpload("position", e)}
                      />
                    </label>
                  )}
                </div>
              </div>

              <div>
                <Label>종료일 시간 사진</Label>
                <div className="border-2 border-dashed rounded-lg p-4 text-center">
                  {photoResult ? (
                    <div className="relative">
                      <img src={photoResult} alt="종료일 시간" className="w-full h-40 object-cover rounded" />
                      <Button
                        size="sm"
                        variant="destructive"
                        className="absolute top-2 right-2"
                        onClick={() => setPhotoResult("")}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">클릭하여 업로드</p>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handlePhotoUpload("result", e)}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* 검교정 결과 탭 */}
          <TabsContent value="results" className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>검교정 결과</Label>
                <Button size="sm" variant="outline" onClick={addResultRow}>
                  <Plus className="w-4 h-4 mr-2" />
                  행 추가
                </Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-left">구분</th>
                      <th className="p-2 text-left">검교정 온도계(A)</th>
                      <th className="p-2 text-left">판넬 온도계(B)</th>
                      <th className="p-2 text-left">오차(A-B)</th>
                      <th className="p-2 text-left">합격 판정</th>
                      <th className="p-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, index) => (
                      <tr key={index} className="border-t">
                        <td className="p-2">
                          <Input
                            value={result.category}
                            onChange={(e) => updateResult(index, "category", e.target.value)}
                            placeholder="예: 시작일"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            value={result.calibrationValue}
                            onChange={(e) => updateResult(index, "calibrationValue", e.target.value)}
                            placeholder="00:00"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            value={result.panelValue}
                            onChange={(e) => updateResult(index, "panelValue", e.target.value)}
                            placeholder="00:00"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            value={result.deviation}
                            readOnly
                            className="bg-muted"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            value={result.pass}
                            readOnly
                            className="bg-muted"
                          />
                        </td>
                        <td className="p-2">
                          {results.length > 1 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeResultRow(index)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <Label>이탈 내용</Label>
              <Textarea
                value={deviationContent}
                onChange={(e) => setDeviationContent(e.target.value)}
                rows={3}
                placeholder="이탈 내용을 입력하세요"
              />
            </div>

            <div>
              <Label>개선조치 및 결과</Label>
              <Textarea
                value={improvementAction}
                onChange={(e) => setImprovementAction(e.target.value)}
                rows={3}
                placeholder="개선조치 및 결과를 입력하세요"
              />
            </div>

            <div>
              <Label>비고</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="비고사항을 입력하세요"
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* 하단 버튼 */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSave("draft")}
            disabled={createLogMutation.isPending}
          >
            임시저장
          </Button>
          <Button
            onClick={() => handleSave("pending_review")}
            disabled={createLogMutation.isPending}
          >
            <Save className="w-4 h-4 mr-2" />
            승인요청
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
