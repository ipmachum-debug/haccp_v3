import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import type { RouterOutput } from "@/lib/trpcTypes";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, Layers, Settings2, GripVertical, AlertTriangle, Clock, Package, Link2, Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";

import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
import {
  type ProductRow,
  type ProcessGroup,
  type ProcessGroupProduct,
  type EquipmentRow,
  type CcpLimitEquipment,
  type CcpLimitInitialData,
  ccpTypes,
  processTypes,
  getCcpColor,
} from "./_ccpLimits/constants";
import {
  ProcessGroupFormDialog,
  TimeProfileDialog,
  ProductTimeProfileMapDialog,
} from "./_ccpLimits/Dialogs";

// ========== 메인 컴포넌트 ==========
export default function CCPLimitsManagement() {
  const L = useIndustryLabel();
  const [filterCcpType, setFilterCcpType] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [isTimeProfileOpen, setIsTimeProfileOpen] = useState(false);
  const [isProductMapOpen, setIsProductMapOpen] = useState(false);

  // 공정 그룹 목록 조회
  const { data: processGroups, refetch } = trpc.ccpMonitoring.getProcessGroups.useQuery(
    filterCcpType !== "all" ? { ccpType: filterCcpType } : undefined
  );

  // 설비 목록 조회 (equipments 테이블 → { items, total, page, limit })
  const { data: equipmentData } = trpc.equipment.list.useQuery({});
  const equipmentList: EquipmentRow[] = (equipmentData as { items?: EquipmentRow[] } | undefined)?.items ?? [];

  // 공정 그룹 생성
  const createMutation = trpc.ccpMonitoring.createProcessGroup.useMutation({
    onSuccess: () => {
      toast.success("공정 그룹이 생성되었습니다");
      refetch();
      setIsCreateOpen(false);
    },
    onError: (err: { message: string }) => toast.error("생성 실패: " + err.message),
  });

  // 공정 그룹 수정
  const updateMutation = trpc.ccpMonitoring.updateProcessGroup.useMutation({
    onSuccess: () => {
      toast.success("공정 그룹이 수정되었습니다");
      refetch();
      setEditingGroup(null);
    },
    onError: (err: { message: string }) => toast.error("수정 실패: " + err.message),
  });

  // 공정 그룹 삭제
  const deleteMutation = trpc.ccpMonitoring.deleteProcessGroup.useMutation({
    onSuccess: () => {
      toast.success("공정 그룹이 삭제되었습니다");
      refetch();
    },
    onError: (err: { message: string }) => toast.error("삭제 실패: " + err.message),
  });

  const groups = Array.isArray(processGroups) ? processGroups : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">CCP 공정 그룹 관리</CardTitle>
              <CardDescription className="text-sm">
                공정별로 설비를 병렬 그룹화하고 법적 한계기준(CL)을 설정합니다. 시간 프로파일과 제품 매핑으로 세밀한 관리가 가능합니다.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={filterCcpType} onValueChange={setFilterCcpType}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="CCP 유형 필터" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 CCP 유형</SelectItem>
                  {ccpTypes.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={() => setIsTimeProfileOpen(true)} className="gap-1">
                <Clock className="h-3.5 w-3.5" />
                시간 설정 관리
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsProductMapOpen(true)} className="gap-1">
                <Link2 className="h-3.5 w-3.5" />
                제품별 공정시간
              </Button>
              <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> 공정 그룹 추가
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Layers className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">등록된 공정 그룹이 없습니다</p>
              <p className="text-sm mt-1">"공정 그룹 추가" 버튼을 클릭하여 CCP 공정을 설정하세요.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group: ProcessGroup) => {
                const eqs = group.equipments || [];
                const groupCcpType = group.ccp_type || group.ccpType;
                return (
                  <div key={group.id} className="border rounded-lg p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Layers className="h-5 w-5 text-gray-400" />
                          <span className="font-semibold text-base">{group.name}</span>
                        </div>
                        <Badge className={getCcpColor(groupCcpType)}>
                          {groupCcpType}
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingGroup(group)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700"
                          onClick={() => {
                            if (confirm("이 공정 그룹을 삭제하시겠습니까?")) {
                              deleteMutation.mutate({ id: group.id });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {group.description && (
                      <p className="text-sm text-gray-500 mt-1 ml-7">{group.description}</p>
                    )}

                    <div className="mt-3 grid grid-cols-2 gap-4">
                      {/* 법적 한계치 */}
                      <div className="bg-red-50 rounded-md p-3">
                        <span className="text-xs font-semibold text-red-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> 법적 한계기준 (CL)
                        </span>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-sm">
                          {(group.temperature_min || group.temperature_max || group.temperatureMin || group.temperatureMax) && (
                            <div className="col-span-2 flex justify-between">
                              <span className="text-gray-500">온도</span>
                              <span className="font-medium">
                                {group.temperature_min || group.temperatureMin || "-"} ~ {group.temperature_max || group.temperatureMax || "-"} °C
                              </span>
                            </div>
                          )}
                          {(group.time_min || group.time_max || group.timeMin || group.timeMax) && (
                            <div className="col-span-2 flex justify-between">
                              <span className="text-gray-500">시간</span>
                              <span className="font-medium">
                                {group.time_min || group.timeMin || "-"} ~ {group.time_max || group.timeMax || "-"} 분
                              </span>
                            </div>
                          )}
                          {(group.pressure_min || group.pressure_max || group.pressureMin || group.pressureMax) && (
                            <div className="col-span-2 flex justify-between">
                              <span className="text-gray-500">압력</span>
                              <span className="font-medium">
                                {group.pressure_min || group.pressureMin || "-"} ~ {group.pressure_max || group.pressureMax || "-"} MPa
                              </span>
                            </div>
                          )}
                          {(group.ph_min || group.ph_max || group.phMin || group.phMax) && (
                            <div className="col-span-2 flex justify-between">
                              <span className="text-gray-500">pH</span>
                              <span className="font-medium">
                                {group.ph_min || group.phMin || "-"} ~ {group.ph_max || group.phMax || "-"}
                              </span>
                            </div>
                          )}
                          {!(group.temperature_min || group.temperature_max || group.temperatureMin || group.temperatureMax ||
                            group.time_min || group.time_max || group.timeMin || group.timeMax ||
                            group.pressure_min || group.pressure_max || group.pressureMin || group.pressureMax ||
                            group.ph_min || group.ph_max || group.phMin || group.phMax) && (
                            <p className="col-span-2 text-xs text-gray-400">한계기준 미설정</p>
                          )}
                        </div>
                      </div>

                      {/* 병렬 설비 그룹 */}
                      <div className="bg-blue-50 rounded-md p-3">
                        <span className="text-xs font-semibold text-blue-600 flex items-center gap-1">
                          <Settings2 className="h-3 w-3" /> 병렬 설비 그룹 ({eqs.length}대)
                        </span>
                        {eqs.length === 0 ? (
                          <p className="text-xs text-gray-400 mt-2">설비가 배정되지 않았습니다</p>
                        ) : (
                          <div className="mt-2 space-y-1">
                            {eqs.map((eq: CcpLimitEquipment, idx: number) => (
                              <div key={eq.id || idx} className="flex items-center gap-2 text-sm">
                                <Badge variant="outline" className="text-xs w-6 h-5 flex items-center justify-center p-0">
                                  {idx + 1}
                                </Badge>
                                <span className="font-medium">{eq.equipmentName || eq.equipment_name || eq.name}</span>
                                <span className="text-xs text-gray-400">{eq.equipmentCode || eq.code}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 모니터링 방법 & 시정 조치 */}
                    {((group.monitoring_method || group.monitoringMethod) || (group.corrective_action || group.correctiveAction)) && (
                      <div className="mt-2 grid grid-cols-2 gap-4 text-xs text-gray-500">
                        {(group.monitoring_method || group.monitoringMethod) && (
                          <div><span className="font-medium">모니터링:</span> {group.monitoring_method || group.monitoringMethod}</div>
                        )}
                        {(group.corrective_action || group.correctiveAction) && (
                          <div><span className="font-medium">시정조치:</span> {group.corrective_action || group.correctiveAction}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 생성 다이얼로그 */}
      <ProcessGroupFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        equipmentList={equipmentList}
        onSubmit={(data) => createMutation.mutate(data)}
      />

      {/* 수정 다이얼로그 */}
      {editingGroup && (
        <ProcessGroupFormDialog
          open={!!editingGroup}
          onOpenChange={(open) => { if (!open) setEditingGroup(null); }}
          initialData={editingGroup}
          equipmentList={equipmentList}
          onSubmit={(data) => updateMutation.mutate({ id: editingGroup.id, ...data })}
        />
      )}

      {/* 시간 프로파일 관리 다이얼로그 */}
      <TimeProfileDialog
        open={isTimeProfileOpen}
        onOpenChange={setIsTimeProfileOpen}
        onGroupUpdated={refetch}
      />

      {/* 제품별 시간 프로파일 매핑 다이얼로그 */}
      <ProductTimeProfileMapDialog
        open={isProductMapOpen}
        onOpenChange={setIsProductMapOpen}
      />
    </div>
  );
}
