/**
 * 일일일지 작성 모달 (PDF 양식 기준 5개 일지)
 * 1. 일반위생관리 및 공정점검표 (매일 작성)
 * 2. 이물관리 점검표
 * 3. 원재료실 온/습도 점검기록지
 * 4. 급속냉동고/냉동고 온도 점검기록지
 * 5. 원재료 냉장고 온도 점검 기록지
 */
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Calendar, CheckCircle2, Thermometer, Droplet, Save, Send, Loader2 } from "lucide-react";
import InspectorSettingField from "@/components/InspectorSettingField";
import WriterSelect from "@/components/WriterSelect";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";

import { todayLocal } from "../lib/dateUtils";

// ============================================================
// 일반위생관리 점검항목 정의 (PDF 기반)
// ============================================================
const HYGIENE_ITEMS = [
  {
    section: "일일 (작업전)",
    items: [
      { id: "h_personal_1", category: "개인위생", text: "위생복장과 외출 복장이 구분하여 보관되고 있는가?" },
      { id: "h_personal_2", category: "개인위생", text: "종사자의 건강상태가 양호하고 개인 장신구 등을 소지하지 않으며, 청결한 위생복장을 착용하고 작업하고 있는가?" },
      { id: "h_personal_3", category: "개인위생", text: "위생설비(손 세척기 등) 중 이상이 있는 것이 없으며, 종사자는 위생처리를 하고 입실하는가?" },
      { id: "h_pest_1", category: "방충방서", text: "작업장은 밀폐가 잘 이루어지고 있으며, 방충시설(방충망 파손 등)에는 이상이 없는가?" },
      { id: "h_facility_1", category: "설비", text: "파손되거나 고장 난 제조설비가 없는가?" },
      { id: "h_storage_1", category: "입고보관", text: "냉장/냉동창고의 온도는 적절히 관리되고 있는가? (냉장창고: 0~10℃, 냉동창고: -18℃이하)" },
      { id: "h_transport_1", category: "운송", text: "완제품을 운송하는 중 온도기준을 준수하였는가? (자동온도기록지 별도관리)", hasTemp: true },
    ],
  },
  {
    section: "일일 (작업중)",
    items: [
      { id: "h_process_1", category: "공정관리", text: "청결구역작업과 일반구역작업이 분리되어 있으며 오염되지 않도록 관리되고 있는가?" },
      { id: "h_process_2", category: "공정관리", text: "가열후 식힘 공정이 적절히 관리되고 있는가?" },
      { id: "h_process_3", category: "공정관리", text: "완제품의 포장 상태는 양호한가?" },
      { id: "h_process_4", category: "공정관리", text: "모니터링장비(탐침온도계 등)는 사용전후 세척·소독을 실시하고 있는가?" },
      { id: "h_pest_2", category: "방충방서", text: "작업장 주변의 음식물 폐기물은 잘 정리되어 보관되어지고 있고, 주기적으로 반출되고 있는가?" },
    ],
  },
  {
    section: "일일 (작업후)",
    items: [
      { id: "h_cleaning_1", category: "청소소독", text: "작업장 바닥, 배수로, 위생시설, 제조설비(식품과 직접 닿는 부분)의 청소·소독 상태는 양호한가?" },
      { id: "h_facility_2", category: "설비", text: "파손되거나 고장 난 제조설비가 없는가?" },
      { id: "h_ccp_1", category: "점검", text: "중요관리점(CCP) 점검표를 작성 주기에 맞게 작성하고, 한계기준 이탈 시 적절히 개선조치 하였는가?" },
      { id: "h_storage_2", category: "보관", text: "사용 후 보관하고 있는 원·부재료 등은 교차오염의 우려가 없도록 구분, 이격관리 및 밀봉하여 관리하고 있는가?" },
    ],
  },
  {
    section: "일일 (입고시)",
    items: [
      { id: "h_inspection_1", category: "입고검수", text: "원·부재료 입고 시 시험성적서를 수령하거나, 육안검사를 실시하고 있는가?" },
    ],
  },
  {
    section: "일일 (출하시)",
    items: [
      { id: "h_transport_2", category: "운송", text: "완제품 운송차량 내부는 청결하고 다른 물품과 구분하여 적재되어 있으며, 차량의 온도는 기준을 준수하고 있는가?", hasTemp: true },
    ],
  },
];

// ============================================================
// 이물관리 점검항목 정의 (PDF 기반)
// ============================================================
const FOREIGN_MATERIAL_ITEMS = [
  {
    section: "원료 입고중 이물관리",
    items: [
      { id: "f_material_1", text: "원·부재료 입고시 외부의 이물을 제거한 후 입고하는가?" },
      { id: "f_material_2", text: "원·부재료 선별시 적절하게 이루어지고 있는가?" },
      { id: "f_material_3", text: "원·부재료 전처리시 먼지·결절이물이 혼입되지 않게 배기하는가?" },
    ],
  },
  {
    section: "공정중 혼입관리",
    items: [
      { id: "f_process_1", text: "공정중 이용하는 작업도구 중 재질이 낡거나 자재를 사용하지 않는가?" },
      { id: "f_process_2", text: "작업장에 개인소지품들을 소지하지 않았으며 지정된 위생복 및 위생화를 착용하였는가?" },
      { id: "f_process_3", text: "장갑 등 작업상태가 올바르며 파손 부위는 없는가?" },
    ],
  },
  {
    section: "작업자에 의한 이물혼입 관리",
    items: [
      { id: "f_worker_1", text: "작업도구, 공구, 필기도구 등은 지정된 위치에 보관되어 있는가?" },
      { id: "f_worker_2", text: "작업에 클립, 핀 칼날등 이물혼입 우려가 있는 불필요한 물품이 없는가?" },
      { id: "f_worker_3", text: "작업장에 출입하기전 끈끈이 클리너 이용제거 후 입실하는가?" },
    ],
  },
  {
    section: "제조설비에 의한 이물혼입 관리",
    items: [
      { id: "f_equipment_1", text: "탈락의 우려가 있는 나사류 및 파손 우려가 있는 설비는 없는가?" },
      { id: "f_equipment_2", text: "설비등은 주기적으로 세척소독하여 오염물질이 혼입되지 않게 관리하는가?" },
      { id: "f_equipment_3", text: "세척소독 및 정비후 나사, 볼트 등의 누락된 곳은 없는가?" },
    ],
  },
  {
    section: "해충등 혼입관리",
    items: [
      { id: "f_pest_1", text: "작업장 출입문, 외부의 벽 등은 틈이나 구멍이 없이 밀폐되어있는가?" },
      { id: "f_pest_2", text: "포충등 및 포획장비는 정상작동되며 지정된 위치가 있는가?" },
    ],
  },
];

export function DailyLogCreateModal() {
  const { toast } = useToast();
  const hasLoadedRef = useRef(false);

  // 기본 정보
  const [date, setDate] = useState(() => todayLocal());
  const [inspector, setInspector] = useState("");

  // 1. 일반위생관리 체크 상태: { itemId: boolean }
  const [hygieneChecks, setHygieneChecks] = useState<Record<string, boolean>>({});
  const [hygieneTempValues, setHygieneTempValues] = useState<Record<string, string>>({});
  const [hygieneRemarks, setHygieneRemarks] = useState("");
  const [hygieneAction, setHygieneAction] = useState("");
  const [hygieneActionBy, setHygieneActionBy] = useState("");

  // 2. 이물관리 체크 상태
  const [foreignChecks, setForeignChecks] = useState<Record<string, boolean>>({});
  const [foreignRemarks, setForeignRemarks] = useState("");
  const [foreignAction, setForeignAction] = useState("");

  // 3. 원재료실 온/습도 (Room1, Room2 × AM/PM)
  const [tempHumidity, setTempHumidity] = useState({
    room1AM: { time: "07:48", temp: "", humidity: "", pass: true },
    room1PM: { time: "18:02", temp: "", humidity: "", pass: true },
    room2AM: { time: "07:49", temp: "", humidity: "", pass: true },
    room2PM: { time: "18:03", temp: "", humidity: "", pass: true },
  });
  const [tempHumidityAction, setTempHumidityAction] = useState("");

  // 4. 급속냉동고/냉동고 온도
  const [freezer, setFreezer] = useState({
    AM: { time: "07:50", blast: "", standard: "", pass: true },
    PM: { time: "18:04", blast: "", standard: "", pass: true },
  });
  const [freezerAction, setFreezerAction] = useState("");

  // 5. 원재료 냉장고 온도
  const [fridge, setFridge] = useState({
    AM: { time: "07:48", temp: "", pass: true },
    PM: { time: "18:02", temp: "", pass: true },
  });
  const [fridgeAction, setFridgeAction] = useState("");

  // 결재 정보
  const [approval, setApproval] = useState({
    writerId: null as number | null,
    writerName: "",
    reviewerId: null as number | null,
    reviewerName: "",
    approverId: null as number | null,
    approverName: "",
  });

  // API 호출
  const { data: employees } = trpc.organization.employees.list.useQuery();
  const activeEmployees = useMemo(
    () => (employees || []).filter((e: any) => e.isActive === 1),
    [employees]
  );
  const { data: approvalSetting } = trpc.organization.approvalSettings.getByType.useQuery(
    { documentType: "daily_log" },
    { retry: false }
  );

  // 결재자 자동 설정 (한 번만)
  useEffect(() => {
    if (hasLoadedRef.current) return;
    if (!activeEmployees.length) return;

    hasLoadedRef.current = true;
    const setting = approvalSetting as any;
    if (setting) {
      const author = setting.authorEmployeeId ? activeEmployees.find((e: any) => e.id === setting.authorEmployeeId) : null;
      const reviewer = setting.reviewerEmployeeId ? activeEmployees.find((e: any) => e.id === setting.reviewerEmployeeId) : null;
      const approver = setting.approverEmployeeId ? activeEmployees.find((e: any) => e.id === setting.approverEmployeeId) : null;
      setApproval({
        writerId: author?.id || null,
        writerName: author?.name || "",
        reviewerId: reviewer?.id || null,
        reviewerName: reviewer?.name || "",
        approverId: approver?.id || null,
        approverName: approver?.name || "",
      });
    } else {
      const reviewer = activeEmployees.find((e: any) => e.approvalRole === "reviewer");
      const approver = activeEmployees.find((e: any) => e.approvalRole === "approver");
      setApproval(prev => ({
        ...prev,
        reviewerId: reviewer?.id || null,
        reviewerName: reviewer?.name || "",
        approverId: approver?.id || null,
        approverName: approver?.name || "",
      }));
    }
  }, [activeEmployees, approvalSetting]);

  // 일괄 체크 핸들러
  const allHygieneIds = useMemo(() => HYGIENE_ITEMS.flatMap(s => s.items.map(i => i.id)), []);
  const allForeignIds = useMemo(() => FOREIGN_MATERIAL_ITEMS.flatMap(s => s.items.map(i => i.id)), []);

  const allHygieneChecked = allHygieneIds.every(id => hygieneChecks[id]);
  const allForeignChecked = allForeignIds.every(id => foreignChecks[id]);

  const toggleAllHygiene = useCallback((checked: boolean) => {
    const next: Record<string, boolean> = {};
    allHygieneIds.forEach(id => { next[id] = checked; });
    setHygieneChecks(next);
  }, [allHygieneIds]);

  const toggleAllForeign = useCallback((checked: boolean) => {
    const next: Record<string, boolean> = {};
    allForeignIds.forEach(id => { next[id] = checked; });
    setForeignChecks(next);
  }, [allForeignIds]);

  // 저장/제출
  const createMutation = trpc.genericChecklist.create.useMutation({
    onSuccess: () => toast({ title: "저장 완료", description: "일일일지가 저장되었습니다." }),
    onError: (err: any) => toast({ title: "저장 실패", description: err.message, variant: "destructive" }),
  });
  const submitForReviewMutation = trpc.genericChecklist.submitForReview.useMutation({
    onSuccess: () => toast({ title: "제출 완료", description: "일일일지가 승인 요청되었습니다." }),
    onError: (err: any) => toast({ title: "제출 실패", description: err.message, variant: "destructive" }),
  });

  const buildFormData = () => ({
    date,
    inspector,
    hygieneChecks,
    hygieneTempValues,
    hygieneRemarks,
    hygieneAction,
    hygieneActionBy,
    foreignChecks,
    foreignRemarks,
    foreignAction,
    tempHumidity,
    tempHumidityAction,
    freezer,
    freezerAction,
    fridge,
    fridgeAction,
    approval,
  });

  const handleSave = () => {
    createMutation.mutate({
      formType: "daily_log",
      formDate: date,
      title: `일일일지 - ${date}`,
      formData: buildFormData(),
      status: "draft",
    });
  };

  const handleSubmit = () => {
    createMutation.mutate(
      {
        formType: "daily_log",
        formDate: date,
        title: `일일일지 - ${date}`,
        formData: buildFormData(),
        status: "submitted",
      },
      {
        onSuccess: (result: any) => {
          if (result?.id) {
            submitForReviewMutation.mutate({
              id: result.id,
              requestType: "daily_log",
              title: `일일일지 - ${date}`,
              description: "일일일지 승인 요청",
            });
          }
        },
      }
    );
  };

  const isSaving = createMutation.isPending || submitForReviewMutation.isPending;

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="space-y-6">
      {/* 기본 정보 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-5 w-5" />
            기본 정보
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>점검일자</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <InspectorSettingField value={inspector} onChange={setInspector} label="점검자(작성자)" storageKey="daily_log" />
          </div>
          {/* 결재 라인 표시 */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="text-center border rounded p-2">
              <p className="text-xs text-muted-foreground">작성자</p>
              <p className="text-sm font-medium">{inspector || approval.writerName || "-"}</p>
            </div>
            <div className="text-center border rounded p-2">
              <p className="text-xs text-muted-foreground">검토자</p>
              <p className="text-sm font-medium">{approval.reviewerName || "-"}</p>
            </div>
            <div className="text-center border rounded p-2">
              <p className="text-xs text-muted-foreground">승인자</p>
              <p className="text-sm font-medium">{approval.approverName || "-"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ==============================
          1. 일반위생관리 및 공정점검표
         ============================== */}
      <Card>
        <CardHeader className="bg-blue-50 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-blue-600" />
              1. 일반위생관리 및 공정점검표
            </CardTitle>
            <div className="flex items-center gap-2">
              <Checkbox checked={allHygieneChecked} onCheckedChange={(c) => toggleAllHygiene(c as boolean)} />
              <label className="text-sm font-medium">일괄 적합</label>
            </div>
          </div>
          <CardDescription>매일 작성</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 pt-4">
          {HYGIENE_ITEMS.map((section) => (
            <div key={section.section}>
              <h4 className="font-semibold text-sm bg-gray-100 px-3 py-1.5 rounded mb-2">{section.section}</h4>
              {section.items.map((item) => {
                let prevCategory = "";
                const showCategory = item.category !== prevCategory;
                prevCategory = item.category;
                return (
                  <div key={item.id} className="pl-4 mb-1.5">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={!!hygieneChecks[item.id]}
                        onCheckedChange={(c) => setHygieneChecks((p) => ({ ...p, [item.id]: c as boolean }))}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <Badge variant="outline" className="text-[10px] mr-1 px-1 py-0">{item.category}</Badge>
                        <span className="text-sm">{item.text}</span>
                      </div>
                      {item.hasTemp && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Input
                            type="number"
                            className="w-20 h-7 text-sm"
                            placeholder="온도"
                            value={hygieneTempValues[item.id] || ""}
                            onChange={(e) => setHygieneTempValues((p) => ({ ...p, [item.id]: e.target.value }))}
                          />
                          <span className="text-xs">℃</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <Separator className="my-2" />
            </div>
          ))}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div><Label className="text-xs">특이사항</Label><Textarea rows={2} value={hygieneRemarks} onChange={(e) => setHygieneRemarks(e.target.value)} placeholder="특이사항" /></div>
            <div><Label className="text-xs">개선조치 및 결과</Label><Textarea rows={2} value={hygieneAction} onChange={(e) => setHygieneAction(e.target.value)} placeholder="개선조치" /></div>
            <div><Label className="text-xs">조치자</Label><Input value={hygieneActionBy} onChange={(e) => setHygieneActionBy(e.target.value)} placeholder="조치자" /></div>
          </div>
        </CardContent>
      </Card>

      {/* ==============================
          2. 이물관리 점검표
         ============================== */}
      <Card>
        <CardHeader className="bg-green-50 pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Droplet className="h-5 w-5 text-green-600" />
              2. 이물관리 점검표
            </CardTitle>
            <div className="flex items-center gap-2">
              <Checkbox checked={allForeignChecked} onCheckedChange={(c) => toggleAllForeign(c as boolean)} />
              <label className="text-sm font-medium">일괄 적합</label>
            </div>
          </div>
          <CardDescription>검사방법: 육안검사 / 점검주기: 1회/일</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 pt-4">
          {FOREIGN_MATERIAL_ITEMS.map((section) => (
            <div key={section.section}>
              <h4 className="font-semibold text-sm bg-gray-100 px-3 py-1.5 rounded mb-2">{section.section}</h4>
              {section.items.map((item) => (
                <div key={item.id} className="flex items-start gap-2 pl-4 mb-1.5">
                  <Checkbox
                    checked={!!foreignChecks[item.id]}
                    onCheckedChange={(c) => setForeignChecks((p) => ({ ...p, [item.id]: c as boolean }))}
                    className="mt-0.5"
                  />
                  <span className="text-sm">{item.text}</span>
                </div>
              ))}
              <Separator className="my-2" />
            </div>
          ))}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <div><Label className="text-xs">특이사항</Label><Textarea rows={2} value={foreignRemarks} onChange={(e) => setForeignRemarks(e.target.value)} placeholder="특이사항" /></div>
            <div><Label className="text-xs">개선조치 및 결과</Label><Textarea rows={2} value={foreignAction} onChange={(e) => setForeignAction(e.target.value)} placeholder="개선조치" /></div>
          </div>
        </CardContent>
      </Card>

      {/* ==============================
          3. 원재료실 온/습도 점검기록지
         ============================== */}
      <Card>
        <CardHeader className="bg-orange-50 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Thermometer className="h-5 w-5 text-orange-600" />
            3. 원재료실 온/습도 점검기록지
          </CardTitle>
          <CardDescription>관리기준: 온도 1℃~35℃, 습도 65%이하 / 점검주기: 일2회</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2">구분</th>
                  <th className="border p-2">감시시각</th>
                  <th className="border p-2">온도 (℃)</th>
                  <th className="border p-2">습도 (%)</th>
                  <th className="border p-2">적합</th>
                </tr>
              </thead>
              <tbody>
                {(["room1AM", "room1PM", "room2AM", "room2PM"] as const).map((key) => {
                  const labels: Record<string, string> = { room1AM: "원재료실1 오전", room1PM: "원재료실1 오후", room2AM: "원재료실2 오전", room2PM: "원재료실2 오후" };
                  const row = tempHumidity[key];
                  return (
                    <tr key={key}>
                      <td className="border p-2">{labels[key]}</td>
                      <td className="border p-1"><Input type="time" value={row.time} onChange={(e) => setTempHumidity(p => ({ ...p, [key]: { ...p[key], time: e.target.value } }))} className="h-7 text-sm" /></td>
                      <td className="border p-1"><Input type="number" placeholder="℃" value={row.temp} onChange={(e) => setTempHumidity(p => ({ ...p, [key]: { ...p[key], temp: e.target.value } }))} className="h-7 text-sm" /></td>
                      <td className="border p-1"><Input type="number" placeholder="%" value={row.humidity} onChange={(e) => setTempHumidity(p => ({ ...p, [key]: { ...p[key], humidity: e.target.value } }))} className="h-7 text-sm" /></td>
                      <td className="border p-1 text-center"><Checkbox checked={row.pass} onCheckedChange={(c) => setTempHumidity(p => ({ ...p, [key]: { ...p[key], pass: c as boolean } }))} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Label className="text-xs">이상 발생 내용 / 조치내용</Label>
            <Textarea rows={2} value={tempHumidityAction} onChange={(e) => setTempHumidityAction(e.target.value)} placeholder="이상 발생 시 내용 및 조치사항" />
          </div>
        </CardContent>
      </Card>

      {/* ==============================
          4. 급속냉동고/냉동고 온도 점검기록지
         ============================== */}
      <Card>
        <CardHeader className="bg-purple-50 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Thermometer className="h-5 w-5 text-purple-600" />
            4. 급속냉동고 / 냉동고 온도 점검기록지
          </CardTitle>
          <CardDescription>관리기준: 급속냉동고 -27℃ 이하, 냉동고 -18℃이하 / 점검주기: 일2회</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2">구분</th>
                  <th className="border p-2">감시시각</th>
                  <th className="border p-2">급속냉동고 (℃)</th>
                  <th className="border p-2">냉동고 (℃)</th>
                  <th className="border p-2">적합</th>
                </tr>
              </thead>
              <tbody>
                {(["AM", "PM"] as const).map((key) => {
                  const row = freezer[key];
                  return (
                    <tr key={key}>
                      <td className="border p-2">{key === "AM" ? "오전" : "오후"}</td>
                      <td className="border p-1"><Input type="time" value={row.time} onChange={(e) => setFreezer(p => ({ ...p, [key]: { ...p[key], time: e.target.value } }))} className="h-7 text-sm" /></td>
                      <td className="border p-1"><Input type="number" placeholder="℃" value={row.blast} onChange={(e) => setFreezer(p => ({ ...p, [key]: { ...p[key], blast: e.target.value } }))} className="h-7 text-sm" /></td>
                      <td className="border p-1"><Input type="number" placeholder="℃" value={row.standard} onChange={(e) => setFreezer(p => ({ ...p, [key]: { ...p[key], standard: e.target.value } }))} className="h-7 text-sm" /></td>
                      <td className="border p-1 text-center"><Checkbox checked={row.pass} onCheckedChange={(c) => setFreezer(p => ({ ...p, [key]: { ...p[key], pass: c as boolean } }))} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Label className="text-xs">이상 발생 내용 / 조치내용</Label>
            <Textarea rows={2} value={freezerAction} onChange={(e) => setFreezerAction(e.target.value)} placeholder="이상 발생 시 내용 및 조치사항" />
          </div>
        </CardContent>
      </Card>

      {/* ==============================
          5. 원재료 냉장고 온도 점검 기록지
         ============================== */}
      <Card>
        <CardHeader className="bg-cyan-50 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Thermometer className="h-5 w-5 text-cyan-600" />
            5. 원재료 냉장고 온도 점검 기록지
          </CardTitle>
          <CardDescription>관리기준: 온도 0℃~10℃ / 점검주기: 일2회</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2">구분</th>
                  <th className="border p-2">감시시각</th>
                  <th className="border p-2">온도 (℃)</th>
                  <th className="border p-2">적합</th>
                </tr>
              </thead>
              <tbody>
                {(["AM", "PM"] as const).map((key) => {
                  const row = fridge[key];
                  return (
                    <tr key={key}>
                      <td className="border p-2">{key === "AM" ? "오전" : "오후"}</td>
                      <td className="border p-1"><Input type="time" value={row.time} onChange={(e) => setFridge(p => ({ ...p, [key]: { ...p[key], time: e.target.value } }))} className="h-7 text-sm" /></td>
                      <td className="border p-1"><Input type="number" placeholder="℃" value={row.temp} onChange={(e) => setFridge(p => ({ ...p, [key]: { ...p[key], temp: e.target.value } }))} className="h-7 text-sm" /></td>
                      <td className="border p-1 text-center"><Checkbox checked={row.pass} onCheckedChange={(c) => setFridge(p => ({ ...p, [key]: { ...p[key], pass: c as boolean } }))} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <Label className="text-xs">이상 발생 내용 / 조치내용</Label>
            <Textarea rows={2} value={fridgeAction} onChange={(e) => setFridgeAction(e.target.value)} placeholder="이상 발생 시 내용 및 조치사항" />
          </div>
        </CardContent>
      </Card>

      {/* 저장/제출 버튼 */}
      <div className="flex justify-end gap-2 sticky bottom-0 bg-white p-4 border-t shadow-sm z-10">
        <Button variant="outline" onClick={handleSave} disabled={isSaving}>
          {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          임시 저장
        </Button>
        <Button onClick={handleSubmit} disabled={isSaving}>
          {submitForReviewMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
          제출하기 (승인요청)
        </Button>
      </div>
    </div>
  );
}
