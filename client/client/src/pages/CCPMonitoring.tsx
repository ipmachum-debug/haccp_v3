import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { TabsList } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { FileText, BarChart3, Download, Settings, Cpu, Loader2, CheckCircle, XCircle, Save, RotateCcw, Plus, Edit, Trash2, AlertTriangle, ShieldCheck, ShieldAlert } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CCPRecordsList } from "@/components/ccp/CCPRecordsList";
import { CCPStats } from "@/components/ccp/CCPStats";
import CCPLimitsManagement from "./CCPLimitsManagement";
import DashboardLayout from "@/components/DashboardLayout";

// CCP 유형 정의 (공통)
const ccpTypes = [
  { value: "CCP-1B", label: "CCP-1B (가열/증숙)" },
  { value: "CCP-2B", label: "CCP-2B (가열 굽기)" },
  { value: "CCP-3B", label: "CCP-3B (가열/볶음)" },
  { value: "CCP-4P", label: "CCP-4P (금속검출)" },
];

// 설비유형 정의 (공통)
const equipmentTypes = [
  "증숙기", "교반기", "냉각기", "금속검출기", "오븐",
  "레토르트", "살균기", "건조기", "포장기", "기타"
];

// CCP 타입별 설명
const ccpTypeDescriptions: Record<string, string> = {
  "CCP-1B": "가열/증숙",
  "CCP-2B": "가열 굽기",
  "CCP-3B": "가열/볶음",
  "CCP-4P": "금속검출",
};

// CCP 타입별 색상
const ccpTypeColors: Record<string, string> = {
  "CCP-1B": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "CCP-2B": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "CCP-3B": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "CCP-4P": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

// ============================================================
// CL 비교 헬퍼: 운영값이 한계기준 범위 내인지 판정
// ============================================================
function clCheck(value: string | number | undefined, min: number | null | undefined, max: number | null | undefined): "ok" | "warn" | "na" {
  if (!value && value !== 0) return "na";
  if (!min && min !== 0 && !max && max !== 0) return "na";
  const v = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(v as number)) return "na";
  if (min != null && (v as number) < min) return "warn";
  if (max != null && (v as number) > max) return "warn";
  return "ok";
}

function ClBadge({ status }: { status: "ok" | "warn" | "na" }) {
  if (status === "ok") return <Badge className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0 gap-0.5"><ShieldCheck className="h-3 w-3" />CL 적합</Badge>;
  if (status === "warn") return <Badge className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0 gap-0.5 animate-pulse"><ShieldAlert className="h-3 w-3" />CL 이탈</Badge>;
  return null;
}

// ============================================================
// 설비 등록/수정 다이얼로그 폼
// ============================================================
function EquipmentFormDialog({
  open,
  onOpenChange,
  initialData,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: any;
  onSaved: () => void;
}) {
  const isEdit = !!initialData;

  // equipments 테이블 필드명: name, type, code, ccpType (camelCase in drizzle)
  const [formData, setFormData] = useState({
    type: initialData?.type || "",
    name: initialData?.name || "",
    code: initialData?.code || "",
    ccpType: initialData?.ccpType || "",
    notes: initialData?.notes || "",
  });

  const createMutation = trpc.equipment.create.useMutation({
    onSuccess: () => {
      toast.success("설비가 등록되었습니다.");
      onOpenChange(false);
      onSaved();
    },
    onError: (error: any) => {
      toast.error(`설비 등록 실패: ${error.message}`);
    },
  });

  const updateMutation = trpc.equipment.update.useMutation({
    onSuccess: () => {
      toast.success("설비가 수정되었습니다.");
      onOpenChange(false);
      onSaved();
    },
    onError: (error: any) => {
      toast.error(`설비 수정 실패: ${error.message}`);
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.type || !formData.name || !formData.ccpType) {
      toast.error("필수 항목을 모두 입력하세요.");
      return;
    }
    if (isEdit) {
      updateMutation.mutate({ id: initialData.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            {isEdit ? "설비 수정" : "새 CCP 설비 등록"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">설비 유형 *</Label>
              <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="유형 선택" />
                </SelectTrigger>
                <SelectContent>
                  {equipmentTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">CCP 유형 *</Label>
              <Select value={formData.ccpType} onValueChange={(v) => setFormData({ ...formData, ccpType: v })}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="CCP 유형 선택" />
                </SelectTrigger>
                <SelectContent>
                  {ccpTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">설비명 *</Label>
              <Input
                placeholder="예: 증숙기1호"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="h-9"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">설비코드</Label>
              <Input
                placeholder="예: EQ-001"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                className="h-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">비고</Label>
            <Textarea
              placeholder="설비 관련 참고사항"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="resize-none"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              취소
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />저장 중...</>
              ) : (
                <><Save className="mr-2 h-4 w-4" />{isEdit ? "수정" : "등록"}</>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 설비기준 CCP 기록 컴포넌트 (설비 CRUD + 기록 입력)
// ============================================================
function EquipmentBasedCcpForm() {
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<any>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // equipments 테이블에서 설비 목록 조회 (equipment.list → getAllEquipments → { items, total, page, limit })
  const { data: equipData, isLoading: equipLoading, refetch: refetchEquipments } = trpc.equipment.list.useQuery({});
  const allEquipments = (equipData as any)?.items ?? [];
  // CCP 타입이 있는 설비만 필터
  const ccpEquipments = allEquipments.filter((e: any) => e.ccpType && e.ccpType !== "");

  // ★ 공정 그룹 목록 조회 (CL 비교용)
  const { data: processGroups } = trpc.ccpMonitoring.getProcessGroups.useQuery(undefined);
  const groups = Array.isArray(processGroups) ? processGroups : [];

  // 현재 선택된 설비 객체 (목록에서 최신 데이터 참조)
  const selectedEquipment = selectedEquipmentId
    ? ccpEquipments.find((e: any) => e.id === selectedEquipmentId) || null
    : null;

  // ★ 선택된 설비가 속한 공정 그룹 찾기
  const findGroupForEquipment = (equipId: number) => {
    return groups.find((g: any) => {
      const eqs = g.equipments || [];
      return eqs.some((eq: any) => (eq.equipmentId || eq.equipment_id) === equipId);
    });
  };

  const deleteMutation = trpc.equipment.delete.useMutation({
    onSuccess: () => {
      toast.success("설비가 삭제되었습니다.");
      setDeleteConfirmId(null);
      if (selectedEquipmentId === deleteConfirmId) {
        setSelectedEquipmentId(null);
      }
      refetchEquipments();
    },
    onError: (error: any) => {
      toast.error(`삭제 실패: ${error.message}`);
    },
  });

  const handleEquipmentSelect = (equip: any) => {
    setSelectedEquipmentId(equip.id);
  };

  const handleSaved = () => {
    refetchEquipments();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 왼쪽: 설비 목록 + 등록 버튼 */}
      <Card className="lg:col-span-1">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Cpu className="h-4 w-4" />
                CCP 설비 목록
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                설비를 선택하여 운영 기준값 설정
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsCreateDialogOpen(true)}
              className="h-8 text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              설비 등록
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {equipLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : ccpEquipments.length === 0 ? (
            <div className="text-center py-8">
              <Cpu className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                등록된 CCP 설비가 없습니다.
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                위의 "설비 등록" 버튼으로 설비를 추가하세요.
              </p>
              <Button
                size="sm"
                className="mt-4"
                onClick={() => setIsCreateDialogOpen(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                첫 설비 등록하기
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
              {ccpEquipments.map((equip: any) => {
                const belongsGroup = findGroupForEquipment(equip.id);
                return (
                  <div
                    key={equip.id}
                    className={`group relative rounded-lg border transition-all cursor-pointer ${
                      selectedEquipmentId === equip.id
                        ? "bg-primary/10 border-primary ring-1 ring-primary/20"
                        : "hover:bg-accent hover:border-accent-foreground/20"
                    }`}
                  >
                    <button
                      onClick={() => handleEquipmentSelect(equip)}
                      className="w-full text-left p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">{equip.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {equip.type} · {equip.code || ""}
                          </div>
                          {belongsGroup && (
                            <div className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5 truncate">
                              공정: {belongsGroup.name}
                            </div>
                          )}
                        </div>
                        <Badge className={`ml-2 text-[10px] px-1.5 py-0 ${ccpTypeColors[equip.ccpType] || "bg-gray-100 text-gray-800"}`}>
                          {equip.ccpType}
                        </Badge>
                      </div>
                    </button>
                    {/* 수정/삭제 버튼 - hover 시 표시 */}
                    <div className="absolute top-1 right-1 hidden group-hover:flex gap-0.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingEquipment(equip);
                        }}
                        className="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary"
                        title="수정"
                      >
                        <Edit className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(equip.id);
                        }}
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        title="삭제"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 전체 설비 수 표시 */}
          {ccpEquipments.length > 0 && (
            <div className="mt-3 pt-3 border-t text-xs text-muted-foreground text-center">
              CCP 설비 {ccpEquipments.length}개 등록됨
              {allEquipments.length > ccpEquipments.length && (
                <span> · 전체 설비 {allEquipments.length}개</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 오른쪽: 선택된 설비의 CCP 기록 폼 */}
      <div className="lg:col-span-2">
        {!selectedEquipment ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Cpu className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">설비를 선택하세요</h3>
              <p className="text-sm text-muted-foreground/70 mt-2 text-center">
                왼쪽 목록에서 설비를 선택하면
                <br />해당 설비의 CCP 타입에 맞는 운영 기준값을 설정할 수 있습니다.
              </p>
            </CardContent>
          </Card>
        ) : (
          <EquipmentCcpSettingsForm
            key={selectedEquipment.id}
            equipment={selectedEquipment}
            ccpTypeDescription={ccpTypeDescriptions[selectedEquipment.ccpType] || ""}
            onSaved={refetchEquipments}
            processGroup={findGroupForEquipment(selectedEquipment.id)}
          />
        )}
      </div>

      {/* 설비 등록 다이얼로그 */}
      <EquipmentFormDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSaved={handleSaved}
      />

      {/* 설비 수정 다이얼로그 */}
      {editingEquipment && (
        <EquipmentFormDialog
          open={!!editingEquipment}
          onOpenChange={(open) => { if (!open) setEditingEquipment(null); }}
          initialData={editingEquipment}
          onSaved={handleSaved}
        />
      )}

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              설비 삭제
            </DialogTitle>
            <DialogDescription>
              이 설비를 삭제하시겠습니까? 관련된 CCP 기록은 유지됩니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteMutation.mutate({ id: deleteConfirmId })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// 설비별 운영 CCP 기준값 설정 폼
// ★ processGroup prop 추가: 해당 설비가 속한 공정그룹의 CL 표시
// ============================================================
function EquipmentCcpSettingsForm({
  equipment,
  ccpTypeDescription,
  onSaved,
  processGroup,
}: {
  equipment: any;
  ccpTypeDescription: string;
  onSaved: () => void;
  processGroup?: any;
}) {
  // equipments 테이블 필드명: ccpType (camelCase via drizzle)
  const ccpType = (equipment.ccpType) as "CCP-1B" | "CCP-2B" | "CCP-3B" | "CCP-4P";

  // 공정그룹 CL 값 추출
  const cl = processGroup ? {
    tempMin: processGroup.temperature_min ?? processGroup.temperatureMin ?? null,
    tempMax: processGroup.temperature_max ?? processGroup.temperatureMax ?? null,
    timeMin: processGroup.time_min ?? processGroup.timeMin ?? null,
    timeMax: processGroup.time_max ?? processGroup.timeMax ?? null,
    pressureMin: processGroup.pressure_min ?? processGroup.pressureMin ?? null,
    pressureMax: processGroup.pressure_max ?? processGroup.pressureMax ?? null,
    phMin: processGroup.ph_min ?? processGroup.phMin ?? null,
    phMax: processGroup.ph_max ?? processGroup.phMax ?? null,
  } : null;

  // 설비의 기존 설정값을 초기값으로 사용 (drizzle camelCase 필드명)
  const getInitialSettings = () => ({
    // 가열 공정 (CCP-1B/2B/3B)
    heatingTimeMin: equipment.defaultTime?.toString() || "",
    pressureMpa: equipment.defaultPressure?.toString() || "",
    temperatureC: equipment.defaultTemperature?.toString() || "",
    tempEdgeC: equipment.edgeTemperature?.toString() || "",
    tempCenterC: equipment.centerTemperature?.toString() || "",
    batchOperationTimeMin: equipment.batchOperationTime?.toString() || "",
    // 금속검출 (CCP-4P)
    sensitivityFe: equipment.feSensitivity?.toString() || "",
    sensitivitySts: equipment.stsSensitivity?.toString() || "",
    detectionSpeedMpm: equipment.detectionSpeed?.toString() || "",
    batchLinkMode: equipment.batchLinkMode || "linked",
    workStartTime: equipment.workStartTime || "09:00",
    workEndTime: equipment.workEndTime || "16:30",
    lunchStartTime: equipment.lunchStartTime || "12:00",
    lunchEndTime: equipment.lunchEndTime || "13:00",
    // 공통
    monitoringMode: (equipment.monitoringInterval === 0 || !equipment.monitoringInterval) ? "once" : "periodic" as "once" | "periodic",
    monitoringInterval: equipment.monitoringInterval?.toString() || "",
    notes: equipment.notes || "",
  });

  const [settings, setSettings] = useState(getInitialSettings());
  const [hasChanges, setHasChanges] = useState(false);

  // equipment.update 뮤테이션 사용 (routers.ts의 기존 API)
  const updateMutation = trpc.equipment.update.useMutation({
    onSuccess: () => {
      toast.success(`${equipment.name} 운영 CCP 기준값이 저장되었습니다.`);
      setHasChanges(false);
      onSaved(); // 목록 새로고침
    },
    onError: (error: any) => {
      toast.error(`저장 실패: ${error.message}`);
    },
  });

  const handleSave = () => {
    // equipment.update API는 camelCase 필드명 사용
    const basePayload: any = {
      id: equipment.id,
      monitoringInterval: settings.monitoringMode === "periodic" && settings.monitoringInterval ? Number(settings.monitoringInterval) : 0,
      notes: settings.notes || undefined,
    };

    if (ccpType === "CCP-4P") {
      // 금속검출 전용 필드 (고정값만 저장)
      basePayload.feSensitivity = settings.sensitivityFe || undefined;
      basePayload.stsSensitivity = settings.sensitivitySts || undefined;
      basePayload.detectionSpeed = settings.detectionSpeedMpm || undefined;
      basePayload.workStartTime = settings.workStartTime || undefined;
      basePayload.workEndTime = settings.workEndTime || undefined;
      basePayload.lunchStartTime = settings.lunchStartTime || undefined;
      basePayload.lunchEndTime = settings.lunchEndTime || undefined;
      basePayload.batchLinkMode = settings.batchLinkMode || "linked";
    } else {
      // 가열 공정 필드
      basePayload.defaultTemperature = settings.temperatureC || undefined;
      basePayload.edgeTemperature = settings.tempEdgeC || undefined;
      basePayload.centerTemperature = settings.tempCenterC || undefined;
      basePayload.defaultPressure = settings.pressureMpa || undefined;
      basePayload.defaultTime = settings.heatingTimeMin ? Number(settings.heatingTimeMin) : undefined;
      basePayload.batchOperationTime = settings.batchOperationTimeMin ? Number(settings.batchOperationTimeMin) : undefined;
    }

    updateMutation.mutate(basePayload);
  };

  const updateSetting = (field: string, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-4 w-4" />
              {equipment.name} 운영 기준값
              <Badge variant="outline" className="ml-1 text-xs">{ccpType}</Badge>
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              {ccpTypeDescription} · {equipment.type} · {equipment.code || ""}
            </CardDescription>
          </div>
          {hasChanges && (
            <Badge variant="secondary" className="text-xs animate-pulse">변경사항 있음</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-2 bg-blue-50 dark:bg-blue-950/30 p-2.5 rounded-md border border-blue-200 dark:border-blue-800">
          이 설비의 운영 CCP 기준값을 설정합니다. 여기서 설정한 값은 CCP 모니터링 기록 시 기본값으로 사용되며, 한계기준 판정의 기준이 됩니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* ★ 공정그룹 CL(한계기준) 비교 패널 - 가열 공정만 */}
        {cl && (ccpType === "CCP-1B" || ccpType === "CCP-2B" || ccpType === "CCP-3B") && (
          <div className="rounded-lg border-2 border-red-200 dark:border-red-800 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="font-semibold text-sm text-red-700 dark:text-red-300">
                공정그룹 법적 한계기준 (CL) — {processGroup?.name}
              </span>
            </div>
            <p className="text-[11px] text-red-600/80 dark:text-red-400/80 mb-3">
              아래 운영값이 이 범위를 벗어나면 CL 이탈로 표시됩니다. 한계기준 설정 탭에서 CL 값을 관리할 수 있습니다.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(cl.tempMin != null || cl.tempMax != null) && (
                <div className="bg-white dark:bg-gray-900 rounded-md p-2.5 border border-red-200 dark:border-red-800">
                  <div className="text-[10px] text-muted-foreground mb-0.5">온도 (°C)</div>
                  <div className="font-semibold text-sm text-red-700 dark:text-red-300">
                    {cl.tempMin ?? "-"} ~ {cl.tempMax ?? "-"}
                  </div>
                  <div className="mt-1 flex gap-1">
                    <ClBadge status={clCheck(settings.temperatureC, cl.tempMin, cl.tempMax)} />
                  </div>
                </div>
              )}
              {(cl.timeMin != null || cl.timeMax != null) && (
                <div className="bg-white dark:bg-gray-900 rounded-md p-2.5 border border-red-200 dark:border-red-800">
                  <div className="text-[10px] text-muted-foreground mb-0.5">시간 (분)</div>
                  <div className="font-semibold text-sm text-red-700 dark:text-red-300">
                    {cl.timeMin ?? "-"} ~ {cl.timeMax ?? "-"}
                  </div>
                  <div className="mt-1 flex gap-1">
                    <ClBadge status={clCheck(settings.heatingTimeMin, cl.timeMin, cl.timeMax)} />
                  </div>
                </div>
              )}
              {(cl.pressureMin != null || cl.pressureMax != null) && (
                <div className="bg-white dark:bg-gray-900 rounded-md p-2.5 border border-red-200 dark:border-red-800">
                  <div className="text-[10px] text-muted-foreground mb-0.5">압력 (MPa)</div>
                  <div className="font-semibold text-sm text-red-700 dark:text-red-300">
                    {cl.pressureMin ?? "-"} ~ {cl.pressureMax ?? "-"}
                  </div>
                  <div className="mt-1 flex gap-1">
                    <ClBadge status={clCheck(settings.pressureMpa, cl.pressureMin, cl.pressureMax)} />
                  </div>
                </div>
              )}
              {(cl.phMin != null || cl.phMax != null) && (
                <div className="bg-white dark:bg-gray-900 rounded-md p-2.5 border border-red-200 dark:border-red-800">
                  <div className="text-[10px] text-muted-foreground mb-0.5">pH</div>
                  <div className="font-semibold text-sm text-red-700 dark:text-red-300">
                    {cl.phMin ?? "-"} ~ {cl.phMax ?? "-"}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 공정그룹 미배정 안내 */}
        {!processGroup && (ccpType === "CCP-1B" || ccpType === "CCP-2B" || ccpType === "CCP-3B") && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                이 설비는 아직 공정 그룹에 배정되지 않았습니다.
              </span>
            </div>
            <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-1 ml-6">
              "한계기준 설정" 탭에서 공정 그룹을 생성하고 이 설비를 배정하면, 법적 한계기준(CL)과 운영값을 자동으로 비교할 수 있습니다.
            </p>
          </div>
        )}

        {/* CCP-1B, CCP-2B, CCP-3B: 가열 공정 운영 기준값 */}
        {(ccpType === "CCP-1B" || ccpType === "CCP-2B" || ccpType === "CCP-3B") && (
          <div className="space-y-3">
            <h4 className="font-medium text-sm border-b pb-1.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              가열 공정 운영 기준값
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">가열시간 (분)</Label>
                  {cl && <ClBadge status={clCheck(settings.heatingTimeMin, cl.timeMin, cl.timeMax)} />}
                </div>
                <Input type="number" placeholder="예: 30" value={settings.heatingTimeMin} onChange={(e) => updateSetting("heatingTimeMin", e.target.value)} className={`h-9 ${cl && clCheck(settings.heatingTimeMin, cl.timeMin, cl.timeMax) === "warn" ? "border-red-400 bg-red-50 dark:bg-red-950/30" : ""}`} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">압력 (MPa)</Label>
                  {cl && <ClBadge status={clCheck(settings.pressureMpa, cl.pressureMin, cl.pressureMax)} />}
                </div>
                <Input placeholder="예: 0.15" value={settings.pressureMpa} onChange={(e) => updateSetting("pressureMpa", e.target.value)} className={`h-9 ${cl && clCheck(settings.pressureMpa, cl.pressureMin, cl.pressureMax) === "warn" ? "border-red-400 bg-red-50 dark:bg-red-950/30" : ""}`} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">1배치당 운영시간 (분)</Label>
                <Input type="number" placeholder="예: 45 (가열+유휴)" value={settings.batchOperationTimeMin} onChange={(e) => updateSetting("batchOperationTimeMin", e.target.value)} className="h-9" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">운영 온도 (°C)</Label>
                  {cl && <ClBadge status={clCheck(settings.temperatureC, cl.tempMin, cl.tempMax)} />}
                </div>
                <Input placeholder="예: 85" value={settings.temperatureC} onChange={(e) => updateSetting("temperatureC", e.target.value)} className={`h-9 ${cl && clCheck(settings.temperatureC, cl.tempMin, cl.tempMax) === "warn" ? "border-red-400 bg-red-50 dark:bg-red-950/30" : ""}`} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">가장자리 온도 (°C)</Label>
                <Input placeholder="예: 90" value={settings.tempEdgeC} onChange={(e) => updateSetting("tempEdgeC", e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">중심부 온도 (°C)</Label>
                <Input placeholder="예: 85" value={settings.tempCenterC} onChange={(e) => updateSetting("tempCenterC", e.target.value)} className="h-9" />
              </div>
            </div>
          </div>
        )}

        {/* CCP-4P: 금속검출 운영 기준값 */}
        {ccpType === "CCP-4P" && (
          <div className="space-y-4">
            <h4 className="font-medium text-sm border-b pb-1.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-500"></span>
              금속검출 운영 기준값
            </h4>

            {/* 한계기준 안내 (PDF 기준) */}
            <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
              <h5 className="text-xs font-semibold text-red-700 dark:text-red-300 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                CCP-4P 한계기준 (CL)
              </h5>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-white dark:bg-gray-900 p-2 rounded border">
                  <span className="text-muted-foreground">감도</span>
                  <p className="font-semibold text-red-600">130</p>
                </div>
                <div className="bg-white dark:bg-gray-900 p-2 rounded border">
                  <span className="text-muted-foreground">Fe</span>
                  <p className="font-semibold text-red-600">2.0mmΦ 이상 불검출</p>
                </div>
                <div className="bg-white dark:bg-gray-900 p-2 rounded border">
                  <span className="text-muted-foreground">SUS</span>
                  <p className="font-semibold text-red-600">3.0mmΦ 이상 불검출</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Fe 감도 (mm)</Label>
                <Input placeholder="예: 1.5" value={settings.sensitivityFe} onChange={(e) => updateSetting("sensitivityFe", e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">STS 감도 (mm)</Label>
                <Input placeholder="예: 2.0" value={settings.sensitivitySts} onChange={(e) => updateSetting("sensitivitySts", e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">검출 속도 (m/분)</Label>
                <Input placeholder="예: 25" value={settings.detectionSpeedMpm} onChange={(e) => updateSetting("detectionSpeedMpm", e.target.value)} className="h-9" />
              </div>
            </div>

            {/* 금속검출 작업 시간 설정 (고정값) */}
            <h4 className="font-medium text-sm border-b pb-1.5 flex items-center gap-2 mt-4">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              작업 시간 설정
            </h4>
            <div className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/30 p-2.5 rounded-md border border-amber-200 dark:border-amber-800 space-y-1">
              <p className="font-semibold text-amber-800 dark:text-amber-200">금속검출 모니터링 기준 (HACCP)</p>
              <p>1. <span className="font-bold">작업 시작 시</span> 검출 수행</p>
              <p>2. <span className="font-bold">품목(배치) 변경 시마다</span> 검출 수행</p>
              <p>3. <span className="font-bold">동일 품목 연속 작업 시</span> → 작업 시작, 점심시간 이후, 종료 시에만 체크</p>
              <p>4. <span className="font-bold">작업 종료 시</span> 검출 수행</p>
              <p className="mt-1 text-amber-600 dark:text-amber-400">※ 하루 작업 제품 수는 당일 생산계획(배치)에서 자동으로 가져옵니다.</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">작업 시작</Label>
                <Input type="time" value={settings.workStartTime} onChange={(e) => updateSetting("workStartTime", e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">작업 종료</Label>
                <Input type="time" value={settings.workEndTime} onChange={(e) => updateSetting("workEndTime", e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">점심 시간</Label>
                <div className="flex gap-1 items-center">
                  <Input type="time" value={settings.lunchStartTime} onChange={(e) => updateSetting("lunchStartTime", e.target.value)} className="h-9 text-xs" />
                  <span className="text-xs text-muted-foreground">~</span>
                  <Input type="time" value={settings.lunchEndTime} onChange={(e) => updateSetting("lunchEndTime", e.target.value)} className="h-9 text-xs" />
                </div>
              </div>
            </div>

            {/* 배치 연동 모드 설정 */}
            <h4 className="font-medium text-sm border-b pb-1.5 flex items-center gap-2 mt-4">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              배치 연동 설정
            </h4>
            <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/30 p-2.5 rounded-md border border-blue-200 dark:border-blue-800 space-y-1">
              <p className="font-semibold text-blue-800 dark:text-blue-200">배치 연동 모드 안내</p>
              <p><span className="font-bold">연동 (자동배치)</span>: 생산운영의 배치 데이터와 자동 연동되어 품목 변경/동일품목 기준으로 검출 스케줄이 자동 산출됩니다.</p>
              <p><span className="font-bold">비연동 (수동배치)</span>: 한계기준 설정에서 수동으로 배치 수를 지정하여 검출 스케줄을 관리합니다.</p>
            </div>
            <RadioGroup
              value={settings.batchLinkMode || "linked"}
              onValueChange={(v) => updateSetting("batchLinkMode", v)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="linked" id="batch-linked" />
                <Label htmlFor="batch-linked" className="text-xs cursor-pointer">
                  연동 (자동배치)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="manual" id="batch-manual" />
                <Label htmlFor="batch-manual" className="text-xs cursor-pointer">
                  비연동 (수동배치)
                </Label>
              </div>
            </RadioGroup>
            <p className="text-[10px] text-muted-foreground">
              ※ 실제 검출 스케줄은 <span className="font-semibold">한계기준 설정</span> 탭의 공정 그룹에서 확인 및 관리할 수 있습니다.
            </p>

          </div>
        )}

        {/* 공통: 모니터링 방식 및 비고 */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm border-b pb-1.5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gray-400"></span>
            모니터링 설정
          </h4>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">모니터링 방식</Label>
              <RadioGroup
                value={settings.monitoringMode}
                onValueChange={(v) => {
                  updateSetting("monitoringMode", v);
                  if (v === "once") updateSetting("monitoringInterval", "");
                }}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="once" id={`mon-once-${equipment.id}`} />
                  <Label htmlFor={`mon-once-${equipment.id}`} className="text-sm cursor-pointer">배치당 1회 (가열 후 체크)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="periodic" id={`mon-periodic-${equipment.id}`} />
                  <Label htmlFor={`mon-periodic-${equipment.id}`} className="text-sm cursor-pointer">주기적 모니터링</Label>
                </div>
              </RadioGroup>
            </div>
            {settings.monitoringMode === "periodic" && (
              <div className="grid grid-cols-2 gap-3 pl-6 border-l-2 border-blue-200">
                <div className="space-y-1.5">
                  <Label className="text-xs">모니터링 주기 (분)</Label>
                  <Input type="number" placeholder="예: 10" value={settings.monitoringInterval} onChange={(e) => updateSetting("monitoringInterval", e.target.value)} className="h-9" />
                </div>
                {settings.monitoringInterval && settings.batchOperationTimeMin && (
                  <div className="flex items-end pb-2">
                    <p className="text-xs text-muted-foreground">
                      → 배치당 약 <span className="font-semibold text-primary">{Math.ceil(Number(settings.batchOperationTimeMin) / Number(settings.monitoringInterval))}회</span> 체크
                    </p>
                  </div>
                )}
              </div>
            )}
            {settings.monitoringMode === "once" && (
              <p className="text-xs text-muted-foreground pl-6 border-l-2 border-green-200">
                가열시간 완료 후 1회 측정하여 기록합니다.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">비고</Label>
            <Textarea placeholder="설비 운영 관련 참고사항" value={settings.notes} onChange={(e) => updateSetting("notes", e.target.value)} rows={2} className="resize-none" />
          </div>
        </div>

        {/* 저장 버튼 */}
        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button variant="outline" size="sm" onClick={() => { setSettings(getInitialSettings()); setHasChanges(false); }}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />초기화
          </Button>
          <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending || !hasChanges} className="min-w-[120px]">
            {updateMutation.isPending ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />저장 중...</>
            ) : (
              <><Save className="mr-1.5 h-3.5 w-3.5" />기준값 저장</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// 메인 CCP 모니터링 페이지
// ============================================================
export default function CCPMonitoring() {
  const [activeTab, setActiveTab] = useState("records");
  const [selectedCcpType, setSelectedCcpType] = useState<"CCP-1B" | "CCP-2B" | "CCP-3B" | "CCP-4P">("CCP-1B");
  const [pdfPeriod, setPdfPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [reportCcpType, setReportCcpType] = useState("");

  const generateReportMutation = trpc.report.generateCcpReport.useMutation();
  const generatePdfMutation = trpc.ccpMonitoring.generateCcpPdf.useMutation();

  const handleGeneratePdf = async () => {
    try {
      const today = new Date();
      let startDate = new Date();
      let endDate = new Date();

      if (pdfPeriod === "daily") {
        startDate = today;
        endDate = today;
      } else if (pdfPeriod === "weekly") {
        startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (pdfPeriod === "monthly") {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      }

      const result = await generatePdfMutation.mutateAsync({
        period: pdfPeriod,
        startDate,
        endDate,
        ccpType: selectedCcpType,
      });

      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${result.pdf}`;
      link.download = `CCP_모니터링_${pdfPeriod}_${selectedCcpType}_${today.toISOString().split("T")[0]}.pdf`;
      link.click();

      toast.success("PDF 보고서가 성공적으로 생성되었습니다.");
    } catch (error: any) {
      toast.error(error.message || "PDF 생성 중 오류가 발생했습니다.");
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">CCP 모니터링</h1>
            <p className="text-muted-foreground mt-2">
              중요관리점(CCP) 모니터링 기록 및 관리
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={pdfPeriod}
              onChange={(e) => setPdfPeriod(e.target.value as "daily" | "weekly" | "monthly")}
              className="border rounded-md px-3 py-2"
            >
              <option value="daily">일간</option>
              <option value="weekly">주간</option>
              <option value="monthly">월간</option>
            </select>
            <Button onClick={handleGeneratePdf} disabled={generatePdfMutation.isPending}>
              <Download className="h-4 w-4 mr-2" />
              PDF 출력
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="records" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              모니터링 기록
            </TabsTrigger>
            <TabsTrigger value="equipment" className="flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              설비기준
            </TabsTrigger>
            <TabsTrigger value="limits" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              한계기준 설정
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              통계
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              보고서 생성
            </TabsTrigger>
          </TabsList>

          <TabsContent value="records" className="space-y-6">
            <CCPRecordsList />
          </TabsContent>

          <TabsContent value="equipment" className="space-y-6">
            <EquipmentBasedCcpForm />
          </TabsContent>

          <TabsContent value="limits" className="space-y-6">
            <CCPLimitsManagement />
          </TabsContent>

          <TabsContent value="stats" className="space-y-6">
            <CCPStats />
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  CCP 점검 보고서 생성
                </CardTitle>
                <CardDescription>
                  일일/주간/월간 CCP 점검 리포트를 PDF로 생성합니다
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">보고서 유형</label>
                    <select
                      value={pdfPeriod}
                      onChange={(e) => setPdfPeriod(e.target.value as "daily" | "weekly" | "monthly")}
                      className="w-full border rounded-md px-3 py-2"
                    >
                      <option value="daily">일일 보고서</option>
                      <option value="weekly">주간 보고서</option>
                      <option value="monthly">월간 보고서</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">CCP 타입 (선택)</label>
                    <input
                      value={reportCcpType}
                      onChange={(e) => setReportCcpType(e.target.value)}
                      placeholder="예: CCP-1A (전체는 빈칸)"
                      className="w-full border rounded-md px-3 py-2"
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">시작 날짜</label>
                    <input type="date" value={reportStartDate} onChange={(e) => setReportStartDate(e.target.value)} className="w-full border rounded-md px-3 py-2" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">종료 날짜</label>
                    <input type="date" value={reportEndDate} onChange={(e) => setReportEndDate(e.target.value)} className="w-full border rounded-md px-3 py-2" />
                  </div>
                </div>
                <Button
                  onClick={() => {
                    if (!reportStartDate || !reportEndDate) {
                      toast.error("기간을 선택해주세요");
                      return;
                    }
                    generateReportMutation.mutate(
                      {
                        reportType: pdfPeriod,
                        startDate: reportStartDate,
                        endDate: reportEndDate,
                        ccpType: reportCcpType || undefined,
                      },
                      {
                        onSuccess: (data) => {
                          const link = document.createElement("a");
                          link.href = `data:application/pdf;base64,${data.pdf}`;
                          link.download = data.filename;
                          link.click();
                          toast.success("보고서가 생성되었습니다");
                        },
                        onError: (error) => {
                          toast.error(`보고서 생성 실패: ${error.message}`);
                        },
                      }
                    );
                  }}
                  disabled={generateReportMutation.isPending}
                  className="w-full"
                >
                  {generateReportMutation.isPending ? (
                    <><Download className="h-4 w-4 mr-2 animate-spin" />생성 중...</>
                  ) : (
                    <><Download className="h-4 w-4 mr-2" />보고서 생성 및 다운로드</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
