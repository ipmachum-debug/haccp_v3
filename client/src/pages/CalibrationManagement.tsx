import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Calendar, AlertCircle, CheckCircle, Clock, FileText } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { ko } from "date-fns/locale";

export default function CalibrationManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [equipmentModalOpen, setEquipmentModalOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<any>(null);

  const { toast } = useToast();
  // 설비 목록 조회
  const { data: equipments, refetch: refetchEquipments } = trpc.calibration.listEquipments.useQuery({
    search: searchTerm,
    isActive: true,
  });

  // 검교정 기록 목록 조회
  const { data: records } = trpc.calibration.listRecords.useQuery({});

  // D-day 계산 및 상태 표시
  const getCalibrationStatus = (nextDate: string | null) => {
    if (!nextDate) return { label: "미정", color: "gray", daysLeft: null };
    
    const daysLeft = differenceInDays(new Date(nextDate), new Date());
    
    if (daysLeft < 0) {
      return { label: "기간 초과", color: "red", daysLeft };
    } else if (daysLeft <= 7) {
      return { label: `D-${daysLeft}`, color: "orange", daysLeft };
    } else {
      return { label: `${daysLeft}일 남음`, color: "green", daysLeft };
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">검교정 관리</h1>
            <p className="text-muted-foreground mt-2">
              검교정 설비 및 일지를 관리하고, 검교정 일정을 확인하세요
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setEquipmentModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              설비 등록
            </Button>
            <Button onClick={() => setLogModalOpen(true)} variant="outline">
              <FileText className="w-4 h-4 mr-2" />
              일지 작성
            </Button>
          </div>
        </div>

        {/* 검색 */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="설비명, 코드, 위치로 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* 탭 */}
        <Tabs defaultValue="schedule" className="w-full">
          <TabsList>
            <TabsTrigger value="schedule">
              <Calendar className="w-4 h-4 mr-2" />
              검교정 일정
            </TabsTrigger>
            <TabsTrigger value="equipment">
              <Clock className="w-4 h-4 mr-2" />
              설비 목록
            </TabsTrigger>
            <TabsTrigger value="records">
              <FileText className="w-4 h-4 mr-2" />
              검교정 기록
            </TabsTrigger>
          </TabsList>

          {/* 검교정 일정 탭 */}
          <TabsContent value="schedule" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>검교정 일정 현황</CardTitle>
                <CardDescription>
                  다음 검교정일이 임박한 설비를 확인하세요
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {equipments && equipments.length > 0 ? (
                    <div className="grid gap-4">
                      {equipments
                        .filter((eq: any) => eq.nextCalibrationDate)
                        .sort((a: any, b: any) => {
                          const aDate = new Date(a.nextCalibrationDate);
                          const bDate = new Date(b.nextCalibrationDate);
                          return aDate.getTime() - bDate.getTime();
                        })
                        .map((equipment: any) => {
                          const status = getCalibrationStatus(equipment.nextCalibrationDate);
                          return (
                            <div
                              key={equipment.id}
                              className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold">{equipment.name}</h3>
                                  <Badge variant="outline">{equipment.code}</Badge>
                                  <Badge variant="secondary">
                                    {equipment.equipmentType === "scale" && "저울"}
                                    {equipment.equipmentType === "thermometer" && "온도계"}
                                    {equipment.equipmentType === "facility_thermometer" && "시설온도계"}
                                    {equipment.equipmentType === "timer" && "타이머"}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {equipment.location} | 주기: {equipment.calibrationCycle}개월
                                </p>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <p className="text-sm text-muted-foreground">다음 검교정일</p>
                                  <p className="font-semibold">
                                    {equipment.nextCalibrationDate
                                      ? format(new Date(equipment.nextCalibrationDate), "yyyy-MM-dd")
                                      : "미정"}
                                  </p>
                                </div>
                                <Badge
                                  variant={
                                    status.color === "red"
                                      ? "destructive"
                                      : status.color === "orange"
                                      ? "default"
                                      : "secondary"
                                  }
                                  className="min-w-[80px] justify-center"
                                >
                                  {status.color === "red" && <AlertCircle className="w-3 h-3 mr-1" />}
                                  {status.label}
                                </Badge>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelectedEquipment(equipment);
                                    setLogModalOpen(true);
                                  }}
                                >
                                  일지 작성
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>등록된 검교정 설비가 없습니다</p>
                      <Button
                        variant="outline"
                        className="mt-4"
                        onClick={() => setEquipmentModalOpen(true)}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        첫 설비 등록하기
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 설비 목록 탭 */}
          <TabsContent value="equipment" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>검교정 설비 목록</CardTitle>
                <CardDescription>
                  등록된 검교정 설비를 관리하세요
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {equipments && equipments.length > 0 ? (
                    <div className="grid gap-4">
                      {equipments.map((equipment: any) => (
                        <div
                          key={equipment.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">{equipment.name}</h3>
                              <Badge variant="outline">{equipment.code}</Badge>
                              <Badge variant="secondary">
                                {equipment.equipmentType === "scale" && "저울"}
                                {equipment.equipmentType === "thermometer" && "온도계"}
                                {equipment.equipmentType === "facility_thermometer" && "시설온도계"}
                                {equipment.equipmentType === "timer" && "타이머"}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-2 text-sm text-muted-foreground">
                              <p>위치: {equipment.location || "-"}</p>
                              <p>제조사: {equipment.manufacturer || "-"}</p>
                              <p>모델: {equipment.model || "-"}</p>
                              <p>주기: {equipment.calibrationCycle}개월</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedEquipment(equipment);
                                setEquipmentModalOpen(true);
                              }}
                            >
                              수정
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedEquipment(equipment);
                                setLogModalOpen(true);
                              }}
                            >
                              일지 작성
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>등록된 검교정 설비가 없습니다</p>
                      <Button
                        variant="outline"
                        className="mt-4"
                        onClick={() => setEquipmentModalOpen(true)}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        첫 설비 등록하기
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 검교정 기록 탭 */}
          <TabsContent value="records" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>검교정 기록</CardTitle>
                <CardDescription>
                  작성된 검교정 일지를 확인하세요
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {records && records.length > 0 ? (
                    <div className="grid gap-4">
                      {records.map((record: any) => (
                        <div
                          key={record.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">{record.equipmentName || "설비명 없음"}</h3>
                              <Badge variant="outline">{record.equipmentCode || "-"}</Badge>
                              <Badge
                                variant={
                                  record.approvalStatus === "approved"
                                    ? "default"
                                    : record.approvalStatus === "pending_review"
                                    ? "secondary"
                                    : "outline"
                                }
                              >
                                {record.approvalStatus === "approved" && <CheckCircle className="w-3 h-3 mr-1" />}
                                {record.approvalStatus === "approved" && "승인"}
                                {record.approvalStatus === "pending_review" && "검토 중"}
                                {record.approvalStatus === "draft" && "임시저장"}
                                {record.approvalStatus === "rejected" && "반려"}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mt-2 text-sm text-muted-foreground">
                              <p>검교정일: {record.calibrationDate ? format(new Date(record.calibrationDate), "yyyy-MM-dd") : "-"}</p>
                              <p>다음 검교정일: {record.nextCalibrationDate ? format(new Date(record.nextCalibrationDate), "yyyy-MM-dd") : "-"}</p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline">
                              상세보기
                            </Button>
                            <Button size="sm" variant="outline">
                              PDF 출력
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>작성된 검교정 기록이 없습니다</p>
                      <Button
                        variant="outline"
                        className="mt-4"
                        onClick={() => setLogModalOpen(true)}
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        첫 일지 작성하기
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 설비 등록 모달 */}
        <EquipmentModal
          open={equipmentModalOpen}
          onClose={() => {
            setEquipmentModalOpen(false);
            setSelectedEquipment(null);
          }}
          onSuccess={() => {
            setEquipmentModalOpen(false);
            setSelectedEquipment(null);
            refetchEquipments();
          }}
          equipment={selectedEquipment}
        />

        {/* 일지 작성 모달 */}
        <LogModal
          open={logModalOpen}
          onClose={() => {
            setLogModalOpen(false);
            setSelectedEquipment(null);
          }}
          onSuccess={() => {
            setLogModalOpen(false);
            setSelectedEquipment(null);
          }}
          equipment={selectedEquipment}
        />
      </div>
    </DashboardLayout>
  );
}

// 설비 등록 모달 컴포넌트
function EquipmentModal({ open, onClose, onSuccess, equipment }: any) {
  const [formData, setFormData] = useState({
    code: equipment?.code || "",
    name: equipment?.name || "",
    equipmentType: equipment?.equipmentType || "thermometer",
    location: equipment?.location || "",
    manufacturer: equipment?.manufacturer || "",
    model: equipment?.model || "",
    serialNumber: equipment?.serialNumber || "",
    purchaseDate: equipment?.purchaseDate || "",
    calibrationType: equipment?.calibrationType || "internal",
    calibrationCycle: equipment?.calibrationCycle || 12,
    lastCalibrationDate: equipment?.lastCalibrationDate || "",
    nextCalibrationDate: equipment?.nextCalibrationDate || "",
    notes: equipment?.notes || "",
  });

  const createMutation = trpc.calibration.createEquipment.useMutation({
    onSuccess: () => {
      alert("설비가 등록되었습니다");
      onSuccess();
    },
    onError: (error) => {
      alert(`등록 실패: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code || !formData.name) {
      alert("설비 코드와 이름은 필수입니다");
      return;
    }
    createMutation.mutate(formData);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{equipment ? "설비 수정" : "설비 등록"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>설비 코드 *</Label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="예: TEMP-001"
                required
              />
            </div>
            <div>
              <Label>설비명 *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="예: 냉장고 온도계"
                required
              />
            </div>
          </div>
          <div>
            <Label>설비 유형</Label>
            <Select
              value={formData.equipmentType}
              onValueChange={(value: any) => setFormData({ ...formData, equipmentType: value })}
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
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>설치 위치</Label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="예: 1층 냉장실"
              />
            </div>
            <div>
              <Label>제조사</Label>
              <Input
                value={formData.manufacturer}
                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                placeholder="예: 삼성전자"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>모델명</Label>
              <Input
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                placeholder="예: RT-1234"
              />
            </div>
            <div>
              <Label>시리얼 번호</Label>
              <Input
                value={formData.serialNumber}
                onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                placeholder="예: SN-123456"
              />
            </div>
          </div>
          <div>
            <Label>검교정 유형</Label>
            <Select
              value={formData.calibrationType}
              onValueChange={(value: any) => setFormData({ ...formData, calibrationType: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">자체 검교정</SelectItem>
                <SelectItem value="certified">공인 검교정</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>검교정 주기 (개월)</Label>
              <Input
                type="number"
                value={formData.calibrationCycle}
                onChange={(e) => setFormData({ ...formData, calibrationCycle: parseInt(e.target.value) || 12 })}
                min="1"
              />
            </div>
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
          <div>
            <Label>구매일</Label>
            <Input
              type="date"
              value={formData.purchaseDate}
              onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
            />
          </div>
          <div>
            <Label>비고</Label>
            <Textarea
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
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "등록 중..." : equipment ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// 일지 작성 모달 컴포넌트 (완전 버전)
function LogModal({ open, onClose, onSuccess, equipment }: any) {
  const [formData, setFormData] = useState({
    equipmentId: equipment?.id || "",
    calibrationDate: format(new Date(), "yyyy-MM-dd"),
    nextCalibrationDate: "",
    regularCalibrationDate: "",
    calibrationMethod: [
      "한국표준과학연구원 사이트에 접속하여 표준시각으로 맞춘다(Utck 3.1)을 다운도드함. URL : https://www.kriss.re.kr/standard/view.do?pg=standard_set_01",
      "다운도드한 압축파일을 풀고 실행 파일 가동시킨다.",
      "프로그램이 대상 컴퓨터와 시간을 자동적으로 대조하여 오차를 제 동시에 맞추어 보정한 후 프로그램의 오차를 출력 (모니터링 시간에 맞추어 입력수 있는 곳을 클릭하여 시간이 맞추어 입력수 있도록 한다.",
    ],
    toleranceCriteria: "± 1℃",
    improvementMethod: "",
    photoEquipment: null,
    photoPosition: null,
    photoResult: null,
    results: [
      { category: "시작점", calibrationValue: "", panelValue: "", deviation: 0, pass: true },
    ],
    deviationContent: "",
    improvementAction: "",
    notes: "",
  });

  const createRecord = trpc.calibration.createRecord.useMutation({
    onSuccess: () => {
      toast({ title: "검교정 일지가 저장되었습니다." });
      onSuccess?.();
      onClose();
    },
    onError: (error) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (status: "draft" | "pending_review") => {
    createRecord.mutate({
      equipmentId: Number(formData.equipmentId),
      ...formData,
      status,
      results: formData.results.map(r => ({ ...r, calibrationValue: Number(r.calibrationValue), panelValue: Number(r.panelValue) })),
    });
  };

  const handleFileUpload = (field: string, file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev) => ({ ...prev, [field]: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const addResultRow = () => {
    setFormData((prev) => ({
      ...prev,
      results: [...prev.results, { category: "", calibrationValue: "", panelValue: "", deviation: 0, pass: true }],
    }));
  };

  const updateResultRow = (index: number, field: string, value: any) => {
    setFormData((prev) => {
      const newResults = [...prev.results];
      newResults[index] = { ...newResults[index], [field]: value };
      
      // 오차 자동 계산
      if (field === "calibrationValue" || field === "panelValue") {
        const standard = parseFloat(newResults[index].calibrationValue) || 0;
        const panel = parseFloat(newResults[index].panelValue) || 0;
        newResults[index].deviation = Math.abs(standard - panel);
        
        // 합격 판정 자동 계산 (± 1℃ 기준)
        const tolerance = parseFloat(prev.toleranceCriteria.replace(/[^0-9.]/g, "")) || 1;
        newResults[index].pass = newResults[index].deviation <= tolerance;
      }
      
      return { ...prev, results: newResults };
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>검교정 일지 작성</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* 검교정 일자 */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">검교정일</label>
              <Input
                type="date"
                value={formData.calibrationDate}
                onChange={(e) => setFormData({ ...formData, calibrationDate: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">다음 검교정일</label>
              <Input
                type="date"
                value={formData.nextCalibrationDate}
                onChange={(e) => setFormData({ ...formData, nextCalibrationDate: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">정기 검교정일</label>
              <Input
                type="date"
                value={formData.regularCalibrationDate}
                onChange={(e) => setFormData({ ...formData, regularCalibrationDate: e.target.value })}
              />
            </div>
          </div>

          {/* 검교정 방법 */}
          <div>
            <label className="text-sm font-medium">검교정 방법</label>
            {formData.calibrationMethod.map((method, index) => (
              <Input
                key={index}
                value={method}
                onChange={(e) => {
                  const newMethods = [...formData.calibrationMethod];
                  newMethods[index] = e.target.value;
                  setFormData({ ...formData, calibrationMethod: newMethods });
                }}
                className="mt-2"
                placeholder={`${index + 1}단계`}
              />
            ))}
          </div>

          {/* 판정기준 */}
          <div>
            <label className="text-sm font-medium">판정기준</label>
            <Input
              value={formData.toleranceCriteria}
              onChange={(e) => setFormData({ ...formData, toleranceCriteria: e.target.value })}
              placeholder="예: ± 1℃"
            />
          </div>

          {/* 사진 3장 업로드 */}
          <div>
            <label className="text-sm font-medium">사진 첨부</label>
            <div className="grid grid-cols-3 gap-4 mt-2">
              <div>
                <p className="text-xs text-muted-foreground mb-2">검교정 온도계</p>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload("photoEquipment", e.target.files[0])}
                />
                {formData.photoEquipment && (
                  <img src={formData.photoEquipment} alt="검교정 온도계" className="mt-2 w-full h-32 object-cover rounded" />
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">위치 고정</p>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload("photoPosition", e.target.files[0])}
                />
                {formData.photoPosition && (
                  <img src={formData.photoPosition} alt="위치 고정" className="mt-2 w-full h-32 object-cover rounded" />
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">결과 값</p>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload("photoResult", e.target.files[0])}
                />
                {formData.photoResult && (
                  <img src={formData.photoResult} alt="결과 값" className="mt-2 w-full h-32 object-cover rounded" />
                )}
              </div>
            </div>
          </div>

          {/* 검교정 결과 테이블 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">검교정 결과</label>
              <Button size="sm" variant="outline" onClick={addResultRow}>
                <Plus className="h-4 w-4 mr-1" /> 행 추가
              </Button>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left text-sm font-medium">구분</th>
                    <th className="p-2 text-left text-sm font-medium">검교정 온도계 값(A)</th>
                    <th className="p-2 text-left text-sm font-medium">판넬 온도계 값(B)</th>
                    <th className="p-2 text-left text-sm font-medium">오차 (A-B)</th>
                    <th className="p-2 text-left text-sm font-medium">합격 판정</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.results.map((result, index) => (
                    <tr key={index} className="border-t">
                      <td className="p-2">
                        <Input
                          value={result.category}
                          onChange={(e) => updateResultRow(index, "category", e.target.value)}
                          placeholder="예: 시작점"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          step="0.1"
                          value={result.calibrationValue}
                          onChange={(e) => updateResultRow(index, "calibrationValue", e.target.value)}
                          placeholder="예: 0.0"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          step="0.1"
                          value={result.panelValue}
                          onChange={(e) => updateResultRow(index, "panelValue", e.target.value)}
                          placeholder="예: 0.0"
                        />
                      </td>
                      <td className="p-2">
                        <span className="font-mono">{result.deviation.toFixed(1)}℃</span>
                      </td>
                      <td className="p-2">
                        <Badge variant={result.pass ? "default" : "destructive"}>
                          {result.pass ? "합격" : "불합격"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 이탈 내용 */}
          <div>
            <label className="text-sm font-medium">이탈 내용</label>
            <Textarea
              value={formData.deviationContent}
              onChange={(e) => setFormData({ ...formData, deviationContent: e.target.value })}
              placeholder="이탈 사항이 있을 경우 입력하세요"
              rows={3}
            />
          </div>

          {/* 개선조치 방법 및 결과 */}
          <div>
            <label className="text-sm font-medium">개선조치 방법 및 결과</label>
            <Textarea
              value={formData.improvementAction}
              onChange={(e) => setFormData({ ...formData, improvementAction: e.target.value })}
              placeholder="개선조치 방법 및 결과를 입력하세요"
              rows={3}
            />
          </div>

          {/* 비고 */}
          <div>
            <label className="text-sm font-medium">비고</label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="추가 사항을 입력하세요"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button variant="outline" onClick={() => handleSubmit("draft")} disabled={createRecord.isLoading}>
            임시저장
          </Button>
          <Button onClick={() => handleSubmit("pending_review")} disabled={createRecord.isLoading}>
            승인요청
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
