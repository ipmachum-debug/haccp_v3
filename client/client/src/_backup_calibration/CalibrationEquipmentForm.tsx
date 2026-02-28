import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Save } from "lucide-react";

export default function CalibrationEquipmentForm() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/calibration/equipment/:id");
  const equipmentId = params?.id;

  const [formData, setFormData] = useState({
    code: "",
    name: "",
    equipmentType: "thermometer" as "scale" | "thermometer" | "facility_thermometer" | "timer",
    location: "",
    manufacturer: "",
    model: "",
    serialNumber: "",
    purchaseDate: "",
    calibrationType: "self" as "self" | "certified",
    calibrationCycle: 12,
    lastCalibrationDate: "",
    nextCalibrationDate: "",
    notes: "",
    isActive: true,
  });

  // 설비 조회
  const { data: equipment } = trpc.calibration.getEquipmentById.useQuery(
    { id: Number(equipmentId) },
    { enabled: !!equipmentId }
  );

  // 설비 생성 mutation
  const createEquipmentMutation = trpc.calibration.createEquipment.useMutation({
    onSuccess: () => {
      alert("검교정 설비가 등록되었습니다");
      setLocation("/calibration");
    },
    onError: (error) => {
      alert(`등록 실패: ${error.message}`);
    },
  });

  // 설비 수정 mutation
  const updateEquipmentMutation = trpc.calibration.updateEquipment.useMutation({
    onSuccess: () => {
      alert("검교정 설비가 수정되었습니다");
      setLocation("/calibration");
    },
    onError: (error) => {
      alert(`수정 실패: ${error.message}`);
    },
  });

  // 설비 정보 로드
  useEffect(() => {
    if (equipment) {
      setFormData({
        code: equipment.code,
        name: equipment.name,
        equipmentType: equipment.equipmentType || "thermometer",
        location: equipment.location || "",
        manufacturer: equipment.manufacturer || "",
        model: equipment.model || "",
        serialNumber: equipment.serialNumber || "",
        purchaseDate: equipment.purchaseDate || "",
        calibrationType: equipment.calibrationType,
        calibrationCycle: equipment.calibrationCycle,
        lastCalibrationDate: equipment.lastCalibrationDate || "",
        nextCalibrationDate: equipment.nextCalibrationDate || "",
        notes: equipment.notes || "",
        isActive: equipment.isActive,
      });
    }
  }, [equipment]);

  // 저장 핸들러
  const handleSave = () => {
    if (!formData.code || !formData.name) {
      alert("설비코드와 설비명은 필수 입력 항목입니다");
      return;
    }

    if (equipmentId) {
      updateEquipmentMutation.mutate({
        id: Number(equipmentId),
        ...formData,
      });
    } else {
      createEquipmentMutation.mutate(formData);
    }
  };

  // 설비 유형별 설명
  const equipmentTypeDescriptions = {
    scale: "저울 - 무게 측정 장비",
    thermometer: "온도계 - 탐침, 심부온도계 등",
    facility_thermometer: "시설온도계 - 오븐, 냉장고, 냉동고 등",
    timer: "타이머 - 시간 측정 장비",
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      {/* 헤더 */}
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={() => setLocation("/calibration")}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          목록으로
        </Button>
        <h1 className="text-3xl font-bold mb-2">
          {equipmentId ? "검교정 설비 수정" : "검교정 설비 등록"}
        </h1>
        <p className="text-muted-foreground">
          검교정이 필요한 설비를 등록하세요
        </p>
      </div>

      {/* 기본 정보 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>기본 정보</CardTitle>
          <CardDescription>설비의 기본 정보를 입력하세요</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>설비코드 *</Label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="예: TEMP-001"
              />
            </div>
            <div>
              <Label>설비명 *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="예: 냉장고 온도계"
              />
            </div>
          </div>

          <div>
            <Label>설비 유형 *</Label>
            <Select
              value={formData.equipmentType}
              onValueChange={(value) => setFormData({ ...formData, equipmentType: value as any })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scale">저울</SelectItem>
                <SelectItem value="thermometer">온도계 (탐침, 심부온도계)</SelectItem>
                <SelectItem value="facility_thermometer">시설온도계 (오븐, 냉장고, 냉동고)</SelectItem>
                <SelectItem value="timer">타이머</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-1">
              {equipmentTypeDescriptions[formData.equipmentType]}
            </p>
          </div>

          <div>
            <Label>설치 위치</Label>
            <Input
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="예: 원료 보관실 냉장고"
            />
          </div>
        </CardContent>
      </Card>

      {/* 제조사 정보 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>제조사 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>제조사</Label>
              <Input
                value={formData.manufacturer}
                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                placeholder="예: 삼성전자"
              />
            </div>
            <div>
              <Label>모델명</Label>
              <Input
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                placeholder="예: RT38K5000S8"
              />
            </div>
            <div>
              <Label>시리얼 번호</Label>
              <Input
                value={formData.serialNumber}
                onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                placeholder="예: 1234567890"
              />
            </div>
          </div>

          <div>
            <Label>구입일자</Label>
            <Input
              type="date"
              value={formData.purchaseDate}
              onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {/* 검교정 정보 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>검교정 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>검교정 유형 *</Label>
              <Select
                value={formData.calibrationType}
                onValueChange={(value) => setFormData({ ...formData, calibrationType: value as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">자체검교정</SelectItem>
                  <SelectItem value="certified">공인기관 검교정</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>검교정 주기 (개월) *</Label>
              <Input
                type="number"
                value={formData.calibrationCycle}
                onChange={(e) => setFormData({ ...formData, calibrationCycle: Number(e.target.value) })}
                placeholder="12"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>최근 검교정일</Label>
              <Input
                type="date"
                value={formData.lastCalibrationDate}
                onChange={(e) => setFormData({ ...formData, lastCalibrationDate: e.target.value })}
              />
            </div>
            <div>
              <Label>다음 검교정일</Label>
              <Input
                type="date"
                value={formData.nextCalibrationDate}
                onChange={(e) => setFormData({ ...formData, nextCalibrationDate: e.target.value })}
              />
            </div>
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
          onClick={handleSave}
          disabled={createEquipmentMutation.isPending || updateEquipmentMutation.isPending}
        >
          <Save className="w-4 h-4 mr-2" />
          {equipmentId ? "수정" : "등록"}
        </Button>
      </div>
    </div>
  );
}
