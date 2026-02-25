import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, Save, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

export default function CalibrationRecordForm() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const params = useParams();
  const recordId = params.id ? parseInt(params.id) : null;
  const isEdit = recordId !== null;

  const [formData, setFormData] = useState({
    equipmentId: 0,
    calibrationDate: "",
    nextCalibrationDate: "",
    regularCalibrationDate: "",
    notes: "",
  });

  // 검교정설비 목록 조회
  const { data: equipmentList } = trpc.calibration.listEquipment.useQuery({ isActive: true });

  // 기존 데이터 로드 (수정 모드)
  const { data: recordData, isLoading: isLoadingRecord } = trpc.calibration.getRecordById.useQuery(
    { id: recordId! },
    { enabled: isEdit }
  );

  useEffect(() => {
    if (recordData) {
      setFormData({
        equipmentId: recordData.record.equipmentId,
        calibrationDate: recordData.record.calibrationDate instanceof Date ? recordData.record.calibrationDate.toISOString().split('T')[0] : recordData.record.calibrationDate,
        nextCalibrationDate: recordData.record.nextCalibrationDate instanceof Date ? recordData.record.nextCalibrationDate.toISOString().split('T')[0] : recordData.record.nextCalibrationDate,
        regularCalibrationDate: recordData.record.regularCalibrationDate ? (recordData.record.regularCalibrationDate instanceof Date ? recordData.record.regularCalibrationDate.toISOString().split('T')[0] : recordData.record.regularCalibrationDate) : "",
        notes: recordData.record.notes || "",
      });
    }
  }, [recordData]);

  const createMutation = trpc.calibration.createRecord.useMutation({
    onSuccess: () => {
      toast({
        title: "등록 완료",
        description: "검교정 기록이 등록되었습니다.",
      });
      setLocation("/calibration/records");
    },
    onError: (error) => {
      toast({
        title: "등록 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = trpc.calibration.updateRecord.useMutation({
    onSuccess: () => {
      toast({
        title: "수정 완료",
        description: "검교정 기록이 수정되었습니다.",
      });
      setLocation("/calibration/records");
    },
    onError: (error) => {
      toast({
        title: "수정 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const submitForApprovalMutation = trpc.calibration.submitForApproval.useMutation({
    onSuccess: () => {
      toast({
        title: "결재 요청 완료",
        description: "검교정 기록이 결재 요청되었습니다.",
      });
      setLocation("/calibration/records");
    },
    onError: (error) => {
      toast({
        title: "결재 요청 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.equipmentId === 0) {
      toast({
        title: "입력 오류",
        description: "검교정설비를 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (isEdit) {
      updateMutation.mutate({ id: recordId!, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleSubmitForApproval = () => {
    if (recordId) {
      submitForApprovalMutation.mutate({ id: recordId });
    }
  };

  if (isEdit && isLoadingRecord) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const selectedEquipment = equipmentList?.find((e) => e.id === formData.equipmentId);

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/calibration/records")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <CardTitle>{isEdit ? "검교정 기록 수정" : "검교정 기록 작성"}</CardTitle>
              <CardDescription>
                {isEdit ? "검교정 기록을 수정합니다" : "새로운 검교정 기록을 작성합니다"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 검교정설비 선택 */}
            <div className="space-y-2">
              <Label htmlFor="equipmentId">검교정설비 *</Label>
              <Select
                value={formData.equipmentId.toString()}
                onValueChange={(value) => setFormData({ ...formData, equipmentId: parseInt(value) })}
                disabled={isEdit}
              >
                <SelectTrigger>
                  <SelectValue placeholder="검교정설비를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {equipmentList?.map((equipment) => (
                    <SelectItem key={equipment.id} value={equipment.id.toString()}>
                      {equipment.code} - {equipment.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedEquipment && (
                <div className="mt-2 p-3 bg-muted rounded-md">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">검교정구분:</span>
                    <Badge variant={selectedEquipment.calibrationType === "certified" ? "default" : "secondary"}>
                      {selectedEquipment.calibrationType === "certified" ? "공인기관" : "사내"}
                    </Badge>
                  </div>
                  {selectedEquipment.model && (
                    <p className="text-sm text-muted-foreground">모델: {selectedEquipment.model}</p>
                  )}
                  {selectedEquipment.manufacturer && (
                    <p className="text-sm text-muted-foreground">제조회사: {selectedEquipment.manufacturer}</p>
                  )}
                </div>
              )}
            </div>

            {/* 검교정일자 */}
            <div className="space-y-2">
              <Label htmlFor="calibrationDate">검교정일자 *</Label>
              <Input
                id="calibrationDate"
                type="date"
                value={formData.calibrationDate}
                onChange={(e) => setFormData({ ...formData, calibrationDate: e.target.value })}
                required
              />
            </div>

            {/* 차기 검교정 일자 */}
            <div className="space-y-2">
              <Label htmlFor="nextCalibrationDate">차기 검교정 일자 *</Label>
              <Input
                id="nextCalibrationDate"
                type="date"
                value={formData.nextCalibrationDate}
                onChange={(e) => setFormData({ ...formData, nextCalibrationDate: e.target.value })}
                required
              />
            </div>

            {/* 정기 검교정 일자(설정치) */}
            <div className="space-y-2">
              <Label htmlFor="regularCalibrationDate">정기 검교정 일자(설정치)</Label>
              <Input
                id="regularCalibrationDate"
                type="date"
                value={formData.regularCalibrationDate}
                onChange={(e) => setFormData({ ...formData, regularCalibrationDate: e.target.value })}
              />
              <p className="text-sm text-muted-foreground">
                정기적으로 검교정을 수행해야 하는 날짜를 설정합니다.
              </p>
            </div>

            {/* 비고 */}
            <div className="space-y-2">
              <Label htmlFor="notes">비고</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="추가 정보를 입력하세요"
                rows={4}
              />
            </div>

            {/* 버튼 */}
            <div className="flex gap-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setLocation("/calibration/records")}
              >
                취소
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    저장
                  </>
                )}
              </Button>
              {isEdit && recordData?.record.approvalStatus === "draft" && (
                <Button
                  type="button"
                  variant="default"
                  onClick={handleSubmitForApproval}
                  disabled={submitForApprovalMutation.isPending}
                >
                  {submitForApprovalMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      요청 중...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      결재 요청
                    </>
                  )}
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
