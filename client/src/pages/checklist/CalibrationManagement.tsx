import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
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
import { format } from "date-fns";
import { ko } from "date-fns/locale";

export default function CalibrationManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [equipmentModalOpen, setEquipmentModalOpen] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<any>(null);

  const { toast } = useToast();
  // 설비 목록 조회
  const { data: equipments, refetch: refetchEquipments } = trpc.checklistCalibration.listEquipments.useQuery({
    search: searchTerm,
    isActive: true,
  });

  // 검교정 기록 목록 조회
  const { data: records } = trpc.checklistCalibration.listRecords.useQuery({});

  // 다음 교정일 임박/초과 알림 (설비별 최신 기록 기준)
  const { data: upcoming } = trpc.checklistCalibration.upcomingCalibrations.useQuery({ withinDays: 30 });

  // 설비 삭제 (기록 없을 때만) / 비활성화 (기록 있는 교체 설비)
  const deleteEquipmentMutation = trpc.checklistCalibration.deleteEquipment.useMutation({
    onSuccess: () => {
      toast({ title: "설비가 삭제되었습니다" });
      refetchEquipments();
    },
    onError: (error: { message: string }) => {
      toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
    },
  });
  const deactivateEquipmentMutation = trpc.checklistCalibration.updateEquipment.useMutation({
    onSuccess: () => {
      toast({ title: "설비가 비활성화되었습니다", description: "목록에서 숨겨지며 이력은 보존됩니다." });
      refetchEquipments();
    },
    onError: (error: { message: string }) => {
      toast({ title: "비활성화 실패", description: error.message, variant: "destructive" });
    },
  });

  const handleDeleteEquipment = (equipment: any) => {
    if (confirm(`설비 '${equipment.name}'을(를) 삭제하시겠습니까?\n\n※ 검교정 기록이 있으면 삭제되지 않고 안내됩니다 (이력 보존).`)) {
      deleteEquipmentMutation.mutate({ id: equipment.id });
    }
  };
  const handleDeactivateEquipment = (equipment: any) => {
    if (confirm(`설비 '${equipment.name}'을(를) 비활성화하시겠습니까?\n\n목록에서 숨겨지고 검교정 이력은 그대로 보존됩니다. (교체된 기존 설비 처리용)`)) {
      deactivateEquipmentMutation.mutate({ id: equipment.id, isActive: false });
    }
  };

  // D-day 표시 (남은 일수 → 라벨/색상)
  const getDdayBadge = (daysRemaining: number | null, status: string) => {
    if (status === "no_record") return { label: "기록 없음", color: "gray" };
    if (daysRemaining === null) return { label: "미정", color: "gray" };
    if (daysRemaining < 0) return { label: `${Math.abs(daysRemaining)}일 초과`, color: "red" };
    if (daysRemaining === 0) return { label: "오늘", color: "orange" };
    if (daysRemaining <= 7) return { label: `D-${daysRemaining}`, color: "orange" };
    return { label: `${daysRemaining}일 남음`, color: "green" };
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
                  {upcoming && upcoming.length > 0 ? (
                    <div className="grid gap-4">
                      {[...upcoming]
                        .sort((a, b) => {
                          // 초과(음수) → 임박 → 기록없음(null) 순
                          const av = a.daysRemaining ?? Number.MAX_SAFE_INTEGER;
                          const bv = b.daysRemaining ?? Number.MAX_SAFE_INTEGER;
                          return av - bv;
                        })
                        .map((item) => {
                          const dday = getDdayBadge(item.daysRemaining, item.status);
                          return (
                            <div
                              key={item.equipmentId}
                              className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold">{item.equipmentName}</h3>
                                  <Badge variant="outline">{item.equipmentCode}</Badge>
                                  {item.calibrationCycleMonths && (
                                    <Badge variant="secondary">주기 {item.calibrationCycleMonths}개월</Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {item.status === "no_record"
                                    ? "검교정 기록이 없습니다 — 일지를 작성하세요"
                                    : `최근 교정일: ${item.lastCalibrationDate ? format(new Date(item.lastCalibrationDate), "yyyy-MM-dd") : "-"}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <p className="text-sm text-muted-foreground">다음 검교정일</p>
                                  <p className="font-semibold">
                                    {item.nextCalibrationDate
                                      ? format(new Date(item.nextCalibrationDate), "yyyy-MM-dd")
                                      : "미정"}
                                  </p>
                                </div>
                                <Badge
                                  variant={
                                    dday.color === "red"
                                      ? "destructive"
                                      : dday.color === "orange"
                                      ? "default"
                                      : "secondary"
                                  }
                                  className="min-w-[80px] justify-center"
                                >
                                  {(dday.color === "red" || dday.color === "orange") && (
                                    <AlertCircle className="w-3 h-3 mr-1" />
                                  )}
                                  {dday.label}
                                </Badge>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    const eqp = equipments?.find((e: any) => e.id === item.equipmentId) || null;
                                    setSelectedEquipment(eqp);
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
                      <CheckCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>
                        {equipments && equipments.length > 0
                          ? "임박하거나 초과된 검교정 일정이 없습니다"
                          : "등록된 검교정 설비가 없습니다"}
                      </p>
                      {(!equipments || equipments.length === 0) && (
                        <Button
                          variant="outline"
                          className="mt-4"
                          onClick={() => setEquipmentModalOpen(true)}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          첫 설비 등록하기
                        </Button>
                      )}
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
                              <p>검교정 유형: {equipment.calibrationType === "certified" ? "공인 검교정" : "자체 검교정"}</p>
                              <p>제조사: {equipment.manufacturer || "-"}</p>
                              <p>모델: {equipment.model || "-"}</p>
                              <p>주기: {equipment.calibrationCycleMonths ? `${equipment.calibrationCycleMonths}개월` : "미설정"}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 justify-end">
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
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-amber-600 border-amber-300 hover:bg-amber-50"
                              onClick={() => handleDeactivateEquipment(equipment)}
                              disabled={deactivateEquipmentMutation.isPending}
                            >
                              비활성화
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteEquipment(equipment)}
                              disabled={deleteEquipmentMutation.isPending}
                            >
                              삭제
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

// 설비 등록/수정 모달 컴포넌트
function EquipmentModal({ open, onClose, onSuccess, equipment }: any) {
  const isEdit = !!equipment?.id;
  const [formData, setFormData] = useState({
    code: equipment?.code || "",
    name: equipment?.name || "",
    equipmentType: equipment?.equipmentType || "thermometer",
    manufacturer: equipment?.manufacturer || "",
    model: equipment?.model || "",
    purchaseDate: equipment?.purchaseDate ? String(equipment.purchaseDate).slice(0, 10) : "",
    calibrationType: equipment?.calibrationType || "internal",
    calibrationCycleMonths: equipment?.calibrationCycleMonths ?? 12,
    notes: equipment?.notes || "",
  });

  const createMutation = trpc.checklistCalibration.createEquipment.useMutation({
    onSuccess: () => {
      alert("설비가 등록되었습니다");
      onSuccess();
    },
    onError: (error: { message: string }) => {
      alert(`등록 실패: ${error.message}`);
    },
  });

  const updateMutation = trpc.checklistCalibration.updateEquipment.useMutation({
    onSuccess: () => {
      alert("설비가 수정되었습니다");
      onSuccess();
    },
    onError: (error: { message: string }) => {
      alert(`수정 실패: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code || !formData.name) {
      alert("설비 코드와 이름은 필수입니다");
      return;
    }
    const payload = {
      name: formData.name,
      equipmentType: formData.equipmentType,
      calibrationType: formData.calibrationType,
      calibrationCycleMonths: formData.calibrationCycleMonths || undefined,
      manufacturer: formData.manufacturer || undefined,
      model: formData.model || undefined,
      purchaseDate: formData.purchaseDate || undefined,
      notes: formData.notes || undefined,
    };
    if (isEdit) {
      updateMutation.mutate({ id: equipment.id, ...payload });
    } else {
      createMutation.mutate({ code: formData.code, ...payload });
    }
  };
  const isPending = createMutation.isPending || updateMutation.isPending;

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
                disabled={isEdit}
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
                placeholder="예: RT-1234"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
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
            <div>
              <Label>검교정 주기 (개월)</Label>
              <Input
                type="number"
                value={formData.calibrationCycleMonths}
                onChange={(e) => setFormData({ ...formData, calibrationCycleMonths: parseInt(e.target.value) || 0 })}
                min="1"
                placeholder="예: 12"
              />
              <p className="text-xs text-muted-foreground mt-1">일지 작성 시 다음 교정일 자동계산에 사용</p>
            </div>
            <div>
              <Label>구매일</Label>
              <Input
                type="date"
                value={formData.purchaseDate}
                onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
              />
            </div>
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
            <Button type="submit" disabled={isPending}>
              {isPending ? "저장 중..." : isEdit ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// 일지 작성 모달 컴포넌트 (완전 버전)
function LogModal({ open, onClose, onSuccess, equipment }: any) {
  const { toast } = useToast();
  // 설비 선택용 목록 (상단 "일지 작성" 버튼으로 사전 선택 없이 열 때 필요)
  const { data: equipmentList } = trpc.checklistCalibration.listEquipments.useQuery({ isActive: true });
  const [formData, setFormData] = useState({
    equipmentId: equipment?.id || "",
    calibrationDate: format(new Date(), "yyyy-MM-dd"),
    nextCalibrationDate: "",
    regularCalibrationDate: "",
    // 성적서(인증서) 관리
    calibrationInstitution: "",
    certificateNumber: "",
    calibratedBy: "",
    certificateFile: null as string | null,
    // 판정
    result: "" as "" | "pass" | "fail" | "conditional_pass",
    calibrationMethod: [
      "한국표준과학연구원 사이트에 접속하여 표준시각으로 맞춘다(Utck 3.1)을 다운도드함. URL : https://www.kriss.re.kr/standard/view.do?pg=standard_set_01",
      "다운도드한 압축파일을 풀고 실행 파일 가동시킨다.",
      "프로그램이 대상 컴퓨터와 시간을 자동적으로 대조하여 오차를 제 동시에 맞추어 보정한 후 프로그램의 오차를 출력 (모니터링 시간에 맞추어 입력수 있는 곳을 클릭하여 시간이 맞추어 입력수 있도록 한다.",
    ],
    toleranceCriteria: "± 1℃",
    photoEquipment: null as string | null,
    photoPosition: null as string | null,
    photoResult: null as string | null,
    results: [
      { category: "시작점", calibrationValue: "", panelValue: "", deviation: 0, pass: true },
    ],
    deviationContent: "",
    improvementAction: "",
    notes: "",
  });

  // 선택된 설비 (auto 다음교정일 계산 근거)
  const selectedEq = (equipmentList || []).find((e: any) => e.id === Number(formData.equipmentId));

  // 다음 교정일 자동계산 미리보기 (미입력 시 설비 주기 적용)
  const autoNextDate = (() => {
    if (formData.nextCalibrationDate) return null;
    if (!selectedEq?.calibrationCycleMonths || !formData.calibrationDate) return null;
    const d = new Date(formData.calibrationDate);
    d.setMonth(d.getMonth() + selectedEq.calibrationCycleMonths);
    return format(d, "yyyy-MM-dd");
  })();

  // 판정 자동 유도 (미선택 시 보정값 행 전체 합격 여부)
  const derivedResult: "pass" | "fail" = formData.results.every((r) => r.pass) ? "pass" : "fail";

  const createRecord = trpc.checklistCalibration.createRecord.useMutation({
    onSuccess: () => {
      toast({ title: "검교정 일지가 저장되었습니다." });
      onSuccess?.();
      onClose();
    },
    onError: (error: { message: string }) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (status: "draft" | "pending_review") => {
    if (!formData.equipmentId) {
      toast({ title: "설비를 선택하세요", variant: "destructive" });
      return;
    }
    createRecord.mutate({
      equipmentId: Number(formData.equipmentId),
      calibrationDate: formData.calibrationDate,
      nextCalibrationDate: formData.nextCalibrationDate || undefined,
      regularCalibrationDate: formData.regularCalibrationDate || undefined,
      calibrationInstitution: formData.calibrationInstitution || undefined,
      certificateNumber: formData.certificateNumber || undefined,
      calibratedBy: formData.calibratedBy || undefined,
      certificateFile: formData.certificateFile || undefined,
      result: (formData.result || derivedResult) as "pass" | "fail" | "conditional_pass",
      calibrationMethod: formData.calibrationMethod,
      judgmentCriteria: formData.toleranceCriteria || undefined,
      deviationContent: formData.deviationContent || undefined,
      improvementMethod: formData.improvementAction || undefined,
      photoEquipment: formData.photoEquipment || undefined,
      photoPosition: formData.photoPosition || undefined,
      photoResult: formData.photoResult || undefined,
      notes: formData.notes || undefined,
      approvalStatus: status,
      results: formData.results.map((r) => ({
        ...r,
        calibrationValue: Number(r.calibrationValue),
        panelValue: Number(r.panelValue),
      })),
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
          {/* 설비 선택 */}
          <div>
            <label className="text-sm font-medium">검교정 설비 *</label>
            <Select
              value={formData.equipmentId ? String(formData.equipmentId) : ""}
              onValueChange={(value) => setFormData({ ...formData, equipmentId: Number(value) })}
            >
              <SelectTrigger>
                <SelectValue placeholder="설비를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {(equipmentList || []).map((e: any) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.name} ({e.code}){e.calibrationCycleMonths ? ` · 주기 ${e.calibrationCycleMonths}개월` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
              {autoNextDate && (
                <p className="text-xs text-blue-600 mt-1">
                  미입력 시 자동계산: {autoNextDate} (주기 {selectedEq?.calibrationCycleMonths}개월)
                </p>
              )}
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

          {/* 성적서(인증서) 관리 */}
          <div className="border rounded-lg p-4 bg-muted/30 space-y-4">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <span className="text-sm font-semibold">교정 성적서(인증서)</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">교정기관</label>
                <Input
                  value={formData.calibrationInstitution}
                  onChange={(e) => setFormData({ ...formData, calibrationInstitution: e.target.value })}
                  placeholder="예: 한국표준과학연구원"
                />
              </div>
              <div>
                <label className="text-sm font-medium">성적서 번호</label>
                <Input
                  value={formData.certificateNumber}
                  onChange={(e) => setFormData({ ...formData, certificateNumber: e.target.value })}
                  placeholder="예: KRISS-2026-001"
                />
              </div>
              <div>
                <label className="text-sm font-medium">교정자</label>
                <Input
                  value={formData.calibratedBy}
                  onChange={(e) => setFormData({ ...formData, calibratedBy: e.target.value })}
                  placeholder="예: 홍길동"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">성적서 파일 첨부</label>
              <Input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => e.target.files?.[0] && handleFileUpload("certificateFile", e.target.files[0])}
              />
              {formData.certificateFile && (
                <p className="text-xs text-green-600 mt-1">✓ 성적서 파일이 첨부되었습니다</p>
              )}
            </div>
          </div>

          {/* 판정 */}
          <div>
            <label className="text-sm font-medium">최종 판정</label>
            <Select
              value={formData.result || derivedResult}
              onValueChange={(value: any) => setFormData({ ...formData, result: value })}
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pass">합격</SelectItem>
                <SelectItem value="fail">부적합</SelectItem>
                <SelectItem value="conditional_pass">조건부 합격(보정 후 사용)</SelectItem>
              </SelectContent>
            </Select>
            {!formData.result && (
              <p className="text-xs text-muted-foreground mt-1">
                미선택 시 보정값 판정 기준 자동 적용: <strong>{derivedResult === "pass" ? "합격" : "부적합"}</strong>
              </p>
            )}
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
          <Button variant="outline" onClick={() => handleSubmit("draft")} disabled={createRecord.isPending}>
            임시저장
          </Button>
          <Button onClick={() => handleSubmit("pending_review")} disabled={createRecord.isPending}>
            승인요청
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
