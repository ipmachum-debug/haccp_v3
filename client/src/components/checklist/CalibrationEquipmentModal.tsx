import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Save } from "lucide-react";

interface CalibrationEquipmentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CalibrationEquipmentModal({
  open,
  onClose,
  onSuccess,
}: CalibrationEquipmentModalProps) {
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
  });

  // 설비 생성 mutation
  const createEquipmentMutation = trpc.calibration.createEquipment.useMutation({
    onSuccess: () => {
      alert("검교정 설비가 등록되었습니다");
      onSuccess();
      handleReset();
    },
    onError: (error: { message: string }) => {
      alert(`등록 실패: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.code || !formData.name) {
      alert("설비 코드와 이름은 필수입니다");
      return;
    }

    createEquipmentMutation.mutate(formData);
  };

  const handleReset = () => {
    setFormData({
      code: "",
      name: "",
      equipmentType: "thermometer",
      location: "",
      manufacturer: "",
      model: "",
      serialNumber: "",
      purchaseDate: "",
      calibrationType: "self",
      calibrationCycle: 12,
      lastCalibrationDate: "",
      nextCalibrationDate: "",
      notes: "",
    });
  };

  const equipmentTypeLabels = {
    scale: "저울",
    thermometer: "온도계 (탐침, 심부온도계)",
    facility_thermometer: "시설온도계 (오븐, 냉장고, 냉동고)",
    timer: "타이머",
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>검교정 설비 등록</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 기본 정보 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="code">설비 코드 *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="예: TEMP-001"
                required
              />
            </div>
            <div>
              <Label htmlFor="name">설비명 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="예: 냉장고 온도계"
                required
              />
            </div>
          </div>

          {/* 설비 유형 */}
          <div>
            <Label htmlFor="equipmentType">설비 유형</Label>
            <Select
              value={formData.equipmentType}
              onValueChange={(value: any) => setFormData({ ...formData, equipmentType: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(equipmentTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 위치 및 제조사 정보 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="location">설치 위치</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="예: 1층 냉장실"
              />
            </div>
            <div>
              <Label htmlFor="manufacturer">제조사</Label>
              <Input
                id="manufacturer"
                value={formData.manufacturer}
                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                placeholder="예: 삼성전자"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="model">모델명</Label>
              <Input
                id="model"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                placeholder="예: RT-1234"
              />
            </div>
            <div>
              <Label htmlFor="serialNumber">시리얼 번호</Label>
              <Input
                id="serialNumber"
                value={formData.serialNumber}
                onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                placeholder="예: SN-123456"
              />
            </div>
          </div>

          {/* 검교정 정보 */}
          <div>
            <Label htmlFor="calibrationType">검교정 유형</Label>
            <Select
              value={formData.calibrationType}
              onValueChange={(value: any) => setFormData({ ...formData, calibrationType: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="self">자체 검교정</SelectItem>
                <SelectItem value="certified">공인 검교정</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="calibrationCycle">검교정 주기 (개월)</Label>
              <Input
                id="calibrationCycle"
                type="number"
                value={formData.calibrationCycle}
                onChange={(e) => setFormData({ ...formData, calibrationCycle: parseInt(e.target.value) || 12 })}
                min="1"
              />
            </div>
            <div>
              <Label htmlFor="lastCalibrationDate">최근 검교정일</Label>
              <Input
                id="lastCalibrationDate"
                type="date"
                value={formData.lastCalibrationDate}
                onChange={(e) => setFormData({ ...formData, lastCalibrationDate: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="nextCalibrationDate">다음 검교정일</Label>
              <Input
                id="nextCalibrationDate"
                type="date"
                value={formData.nextCalibrationDate}
                onChange={(e) => setFormData({ ...formData, nextCalibrationDate: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="purchaseDate">구매일</Label>
            <Input
              id="purchaseDate"
              type="date"
              value={formData.purchaseDate}
              onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
            />
          </div>

          {/* 비고 */}
          <div>
            <Label htmlFor="notes">비고</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="추가 정보를 입력하세요"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              취소
            </Button>
            <Button type="submit" disabled={createEquipmentMutation.isPending}>
              <Save className="w-4 h-4 mr-2" />
              {createEquipmentMutation.isPending ? "등록 중..." : "등록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
