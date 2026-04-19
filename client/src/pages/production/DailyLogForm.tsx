/**
 * 일일일지 작성 폼 (DailyLogForm)
 * - 날짜 선택 시 해당일 기존 데이터 로드 → 없으면 이전일 데이터 pre-fill
 * - 5개 탭: 일반위생관리, 이물관리, 원재료실 온습도, 냉동고 온도, 냉장고 온도
 * - 저장(draft) / 제출(submitted→승인요청) 지원
 */
import { useLocation, useSearch } from "wouter";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Calendar, Save, Send, FileText, ArrowLeft, Loader2, Copy } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

import { todayLocal } from "../../lib/dateUtils";

// 기본 위생점검 항목 정의
const DEFAULT_HYGIENE_CHECKS = [
  { category: "작업전", subcategory: "개인위생", itemOrder: 1, itemText: "위생복장과 이물 복장이 구분하여 보관되고 있는가?", checkResult: null as string | null },
  { category: "작업전", subcategory: "개인위생", itemOrder: 2, itemText: "종사자의 건강상태가 양호하고 개인 청소가 등을 소지하지 않으며, 청결한 위생복장을 착용하고 있는가?", checkResult: null },
  { category: "작업전", subcategory: "개인위생", itemOrder: 3, itemText: "위생설비(손 세척기 등) 중 이상이 있는 것이 없으며, 종사자는 위생처리를 하고 입실하는가?", checkResult: null },
  { category: "작업중", subcategory: "방충방서", itemOrder: 4, itemText: "방충 방서작업장은 밀폐가 잘 이루어지고 있으며, 방충시설(방충망 파손 등)에는 이상이 없는가?", checkResult: null },
  { category: "작업중", subcategory: "설비", itemOrder: 5, itemText: "파손되거나 고장 난 제조설비가 없는가?", checkResult: null },
  { category: "입고시", subcategory: "온송", itemOrder: 6, itemText: "입고 보관냉장/냉동창고의 온도는 적절히 관리되고 있는가? (냉장창고 : 0~10℃, 냉동창고 : -18℃이하)", checkResult: null },
  { category: "출하시", subcategory: "온송", itemOrder: 7, itemText: "완제품을 운송하는 중 온도기준은 준수하였는가?(지육온도기록지 별도관리)", checkResult: null },
  { category: "작업중", subcategory: "공정관리", itemOrder: 8, itemText: "청결구역상태와 일반구역상태이 분리되어 있으며 오염되지 않도록 관리되고 있는가?", checkResult: null },
  { category: "작업중", subcategory: "공정관리", itemOrder: 9, itemText: "가열후 식힘 공정이 적절히 관리되고 있는가?", checkResult: null },
  { category: "작업중", subcategory: "공정관리", itemOrder: 10, itemText: "완제품의 포장 상태는 양호한가?", checkResult: null },
  { category: "작업중", subcategory: "공정관리", itemOrder: 11, itemText: "모니터링방법(탐정온도계 등)는 사용전후 세척·소독을 실시하고 있는가?", checkResult: null },
  { category: "작업후", subcategory: "방충방서", itemOrder: 12, itemText: "작업장 주변의 음식물 폐기물은 잘 정리되어 보관되어있고, 주기적으로 반출되고 있는가?", checkResult: null },
  { category: "작업후", subcategory: "청소소독", itemOrder: 13, itemText: "작업장 바닥, 배수로, 위생시설, 제조설비(식품과 직접 닿는 부분)의 청소·소독 상태는 양호한가?", checkResult: null },
  { category: "작업후", subcategory: "설비", itemOrder: 14, itemText: "파손되거나 고장 난 제조설비가 없는가?", checkResult: null },
  { category: "작업후", subcategory: "점검", itemOrder: 15, itemText: "중요관리점(CCP) 점검표를 작성 주기에 맞게 작성하고, 한계기준 이탈 시 적절히 개선조치 하였는가?", checkResult: null },
  { category: "작업후", subcategory: "보관", itemOrder: 16, itemText: "사용 후 보관하고 있는 원·부재료 등은 교차오염의 우려가 없도록 구분, 이격관리 및 밀봉하여 관리하고 있는가?", checkResult: null },
  { category: "입고시", subcategory: "입고검사", itemOrder: 17, itemText: "입고 검수일 · 부재료 입고 시 시험성적서를 수령하거나, 육안검사를 실시하고 있는가?", checkResult: null },
  { category: "출하시", subcategory: "온송", itemOrder: 18, itemText: "완제품 운송차량 내부는 청결하고 다른 물품과 구분하여 적재되어 있으며, 차량의 온도는 기준을 준수하고 있는가?", checkResult: null },
];

const DEFAULT_FOREIGN_CHECKS = [
  { category: "원료 입고종 이물관리", itemOrder: 1, itemText: "원·부재료 입고시 외부의 이물을 제거한 후 입고하는가?", checkResult: null as string | null },
  { category: "원료 입고종 이물관리", itemOrder: 2, itemText: "원·부재료 선별시 적절하게 이루어지고 있는가?", checkResult: null },
  { category: "공정중 혼입관리", itemOrder: 3, itemText: "원·부재료 전처리시 이물이 혼입되지 않게 배치하는가?", checkResult: null },
  { category: "공정중 혼입관리", itemOrder: 4, itemText: "공정중 작업도구 중 재질이 벗겨진 자재를 사용하지 않는가?", checkResult: null },
  { category: "공정중 혼입관리", itemOrder: 5, itemText: "작업장에 개인소지품을 소지하지 않았으며 지정된 위생복 및 위생화를 착용하였는가?", checkResult: null },
  { category: "작업장 이물혼입 관리", itemOrder: 6, itemText: "천장 등 작업상태가 올바르며 파손 부위는 없는가?", checkResult: null },
  { category: "작업장 이물혼입 관리", itemOrder: 7, itemText: "작업도구, 공구, 필기도구 등은 지정된 위치에 보관되어 있는가?", checkResult: null },
  { category: "작업장 이물혼입 관리", itemOrder: 8, itemText: "작업에 클립, 핀 칼날 등 이물혼입의 우려가 있는 불필요한 물품이 없는가?", checkResult: null },
  { category: "작업장 이물혼입 관리", itemOrder: 9, itemText: "작업장에 출입하기전 곤충이 붙어있는 것이 없는가?", checkResult: null },
  { category: "제조설비 이물혼입 관리", itemOrder: 10, itemText: "탈락의 우려가 있는 나사류 및 파손 우려가 있는 설비는 없는가?", checkResult: null },
  { category: "제조설비 이물혼입 관리", itemOrder: 11, itemText: "설비등은 주기적으로 세척소독하여 오염물질이 혼입되지 않게 관리하는가?", checkResult: null },
  { category: "제조설비 이물혼입 관리", itemOrder: 12, itemText: "세척소독 및 정비후 나사, 볼트 등의 누락된 곳은 없는가?", checkResult: null },
  { category: "해충 혼입관리", itemOrder: 13, itemText: "작업장 종업원, 방문자 벽 등의 틈이 없는가?", checkResult: null },
  { category: "해충 혼입관리", itemOrder: 14, itemText: "포충등 및 포획장비는 정상작동되며 지정된 위치에 있는가?", checkResult: null },
];

const DEFAULT_TEMP_HUMIDITY = [
  { roomName: "원재료실1", timePeriod: "오전", checkTime: "", temperature: "", humidity: "", evaluation: null as string | null },
  { roomName: "원재료실1", timePeriod: "오후", checkTime: "", temperature: "", humidity: "", evaluation: null },
  { roomName: "원재료실2", timePeriod: "오전", checkTime: "", temperature: "", humidity: "", evaluation: null },
  { roomName: "원재료실2", timePeriod: "오후", checkTime: "", temperature: "", humidity: "", evaluation: null },
];

const DEFAULT_FREEZER = [
  { timePeriod: "오전", checkTime: "", rapidFreezerTemp: "", freezerTemp: "", evaluation: null as string | null },
  { timePeriod: "오후", checkTime: "", rapidFreezerTemp: "", freezerTemp: "", evaluation: null },
];

const DEFAULT_REFRIGERATOR = [
  { timePeriod: "오전", checkTime: "", temperature: "", evaluation: null as string | null },
  { timePeriod: "오후", checkTime: "", temperature: "", evaluation: null },
];

const EMPTY_NOTES = { specialNotes: "", improvementAction: "", actionBy: "", confirmedBy: "" };
const EMPTY_ISSUES = { issueDescription: "", actionTaken: "", completionDate: "", actionBy: "", confirmedBy: "" };
const EMPTY_REF_ISSUES = { issueDatetime: "", issueDescription: "", actionTaken: "", completionDate: "", actionBy: "", confirmedBy: "" };

export default function DailyLogForm() {
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const paramDate = params.get("date");
  const paramId = params.get("id");

  const [logDate, setLogDate] = useState(paramDate || todayLocal());
  const [activeTab, setActiveTab] = useState("hygiene");
  const [recordId, setRecordId] = useState<number | null>(paramId ? parseInt(paramId) : null);
  const [recordStatus, setRecordStatus] = useState<string>("new");
  const [preFilledFrom, setPreFilledFrom] = useState<string | null>(null);

  // 문서결재설정에서 작성자 자동 로드
  const { data: approvalSetting } = (trpc as any).organization.approvalSettings.getByType.useQuery(
    { documentType: "daily_log" },
    { staleTime: 60000 }
  );
  const { data: employees } = (trpc as any).organization.employees.list.useQuery(undefined, { staleTime: 60000 });
  const authorName = (() => {
    if (!approvalSetting?.authorEmployeeId || !employees) return "";
    const emp = (employees as any[]).find((e: any) => e.id === approvalSetting.authorEmployeeId);
    return emp?.name || "";
  })();

  // Form data states
  const [hygieneChecks, setHygieneChecks] = useState(structuredClone(DEFAULT_HYGIENE_CHECKS));
  const [hygieneNotes, setHygieneNotes] = useState({ ...EMPTY_NOTES });
  const [foreignMaterialChecks, setForeignMaterialChecks] = useState(structuredClone(DEFAULT_FOREIGN_CHECKS));
  const [foreignMaterialNotes, setForeignMaterialNotes] = useState({ ...EMPTY_NOTES });
  const [temperatureHumidity, setTemperatureHumidity] = useState(structuredClone(DEFAULT_TEMP_HUMIDITY));
  const [temperatureHumidityIssues, setTemperatureHumidityIssues] = useState({ ...EMPTY_ISSUES });
  const [freezerTemperature, setFreezerTemperature] = useState(structuredClone(DEFAULT_FREEZER));
  const [freezerIssues, setFreezerIssues] = useState({ ...EMPTY_ISSUES });
  const [refrigeratorTemperature, setRefrigeratorTemperature] = useState(structuredClone(DEFAULT_REFRIGERATOR));
  const [refrigeratorIssues, setRefrigeratorIssues] = useState({ ...EMPTY_REF_ISSUES });
  const [batchData, setBatchData] = useState<any[]>([]);

  // API queries
  const { data: existingLog, isLoading: loadingExisting } = trpc.dailyLog.getByDate.useQuery(
    { logDate },
    { enabled: !!logDate }
  );

  const { data: previousData, isLoading: loadingPrev } = trpc.dailyLog.getPreviousFormData.useQuery(
    { beforeDate: logDate },
    { enabled: !!logDate && !existingLog }
  );

  const saveMutation = trpc.dailyLog.saveFullForm.useMutation({
    onSuccess: (result: any) => {
      setRecordId(result.id);
      setRecordStatus(result.status);
      toast.success(result.status === 'submitted' ? '제출 완료 (승인관리로 이동됩니다)' : '저장 완료');
    },
    onError: (err: { message: string }) => toast.error('저장 실패: ' + err.message),
  });

  // form_data를 state에 반영하는 함수
  const applyFormData = useCallback((fd: any, isPreFill: boolean) => {
    if (!fd) return;
    // 위생점검 - 배열 형태 OR 오브젝트 형태 모두 지원
    if (Array.isArray(fd.hygieneChecks)) {
      setHygieneChecks(fd.hygieneChecks.map((item: any, i: number) => ({
        ...DEFAULT_HYGIENE_CHECKS[i],
        ...item,
      })));
    } else if (fd.hygieneChecks && typeof fd.hygieneChecks === 'object') {
      // 오브젝트 형태 (autoDailyReport 생성) → 배열로 변환
      const hc = fd.hygieneChecks;
      const keys = ['facility1','facility2','hygiene1','pest1','hygiene2','transport1','transport2',
        'process1','process2','process3','process4','pest2','cleaning1','hygiene3',
        'ccp1','storage1','inspection1','storage2'];
      setHygieneChecks(DEFAULT_HYGIENE_CHECKS.map((item, i) => ({
        ...item,
        checkResult: hc[keys[i]] === true ? 'yes' : hc[keys[i]] === false ? 'no' : (isPreFill ? item.checkResult : null),
      })));
    }
    if (fd.hygieneNotes) setHygieneNotes({ ...EMPTY_NOTES, ...fd.hygieneNotes });
    if (Array.isArray(fd.foreignMaterialChecks)) {
      setForeignMaterialChecks(fd.foreignMaterialChecks.map((item: any, i: number) => ({
        ...DEFAULT_FOREIGN_CHECKS[i],
        ...item,
      })));
    }
    if (fd.foreignMaterialNotes) setForeignMaterialNotes({ ...EMPTY_NOTES, ...fd.foreignMaterialNotes });
    // 온도/습도: 배열 또는 객체 형태 모두 지원
    if (Array.isArray(fd.temperatureHumidity)) {
      setTemperatureHumidity(fd.temperatureHumidity.map((item: any, i: number) => ({
        ...DEFAULT_TEMP_HUMIDITY[i],
        ...item,
      })));
    } else if (fd.temperatureHumidity && typeof fd.temperatureHumidity === 'object') {
      // 객체 형태 (autoDailyReport) → 배열로 변환
      const th = fd.temperatureHumidity;
      const mapping = [
        { key: 'room1Morning', room: '원재료실1', period: '오전' },
        { key: 'room1Afternoon', room: '원재료실1', period: '오후' },
        { key: 'room2Morning', room: '원재료실2', period: '오전' },
        { key: 'room2Afternoon', room: '원재료실2', period: '오후' },
      ];
      setTemperatureHumidity(mapping.map((m, i) => {
        const src = th[m.key] || {};
        return {
          ...DEFAULT_TEMP_HUMIDITY[i],
          checkTime: src.time || '',
          temperature: src.temp || '',
          humidity: src.humidity || '',
          evaluation: src.pass === true ? 'pass' : src.pass === false ? 'fail' : null,
        };
      }));
    }
    if (fd.temperatureHumidityIssues) setTemperatureHumidityIssues({ ...EMPTY_ISSUES, ...fd.temperatureHumidityIssues });
    if (Array.isArray(fd.freezerTemperature)) {
      setFreezerTemperature(fd.freezerTemperature.map((item: any, i: number) => ({
        ...DEFAULT_FREEZER[i],
        ...item,
      })));
    } else if (fd.freezerTemperature && typeof fd.freezerTemperature === 'object' && !Array.isArray(fd.freezerTemperature)) {
      const ft = fd.freezerTemperature;
      setFreezerTemperature([
        { ...DEFAULT_FREEZER[0], checkTime: ft.morning?.time || '', rapidFreezerTemp: ft.morning?.rapidFreezer || '', freezerTemp: ft.morning?.freezer || '', evaluation: ft.morning?.pass === true ? 'pass' : ft.morning?.pass === false ? 'fail' : null },
        { ...DEFAULT_FREEZER[1], checkTime: ft.afternoon?.time || '', rapidFreezerTemp: ft.afternoon?.rapidFreezer || '', freezerTemp: ft.afternoon?.freezer || '', evaluation: ft.afternoon?.pass === true ? 'pass' : ft.afternoon?.pass === false ? 'fail' : null },
      ]);
    }
    if (fd.freezerIssues) setFreezerIssues({ ...EMPTY_ISSUES, ...fd.freezerIssues });
    if (Array.isArray(fd.refrigeratorTemperature)) {
      setRefrigeratorTemperature(fd.refrigeratorTemperature.map((item: any, i: number) => ({
        ...DEFAULT_REFRIGERATOR[i],
        ...item,
      })));
    } else if (fd.refrigeratorTemperature && typeof fd.refrigeratorTemperature === 'object' && !Array.isArray(fd.refrigeratorTemperature)) {
      const rt = fd.refrigeratorTemperature;
      setRefrigeratorTemperature([
        { ...DEFAULT_REFRIGERATOR[0], checkTime: rt.morning?.time || '', temperature: rt.morning?.temp || '', evaluation: rt.morning?.pass === true ? 'pass' : rt.morning?.pass === false ? 'fail' : null },
        { ...DEFAULT_REFRIGERATOR[1], checkTime: rt.afternoon?.time || '', temperature: rt.afternoon?.temp || '', evaluation: rt.afternoon?.pass === true ? 'pass' : rt.afternoon?.pass === false ? 'fail' : null },
      ]);
    }
    if (fd.refrigeratorIssues) setRefrigeratorIssues({ ...EMPTY_REF_ISSUES, ...fd.refrigeratorIssues });
    if (Array.isArray(fd.batches)) setBatchData(fd.batches);
  }, []);

  // 데이터 로드 효과
  useEffect(() => {
    if (loadingExisting || loadingPrev) return;
    if (existingLog) {
      // 해당 날짜 데이터 존재 → 로드
      setRecordId(existingLog.id);
      setRecordStatus(existingLog.status);
      setPreFilledFrom(null);
      applyFormData(existingLog.formData, false);
    } else if (previousData) {
      // 이전 데이터 pre-fill
      setRecordId(null);
      setRecordStatus("new");
      setPreFilledFrom(previousData.sourceDate);
      applyFormData(previousData.formData, true);
      // 온도/배치 데이터도 이전값 유지 (사용자가 필요 시 수정)
      setBatchData([]);
    } else {
      // 최초 작성 → 빈 폼
      setRecordId(null);
      setRecordStatus("new");
      setPreFilledFrom(null);
      setHygieneChecks(structuredClone(DEFAULT_HYGIENE_CHECKS));
      setHygieneNotes({ ...EMPTY_NOTES });
      setForeignMaterialChecks(structuredClone(DEFAULT_FOREIGN_CHECKS));
      setForeignMaterialNotes({ ...EMPTY_NOTES });
      setTemperatureHumidity(structuredClone(DEFAULT_TEMP_HUMIDITY));
      setTemperatureHumidityIssues({ ...EMPTY_ISSUES });
      setFreezerTemperature(structuredClone(DEFAULT_FREEZER));
      setFreezerIssues({ ...EMPTY_ISSUES });
      setRefrigeratorTemperature(structuredClone(DEFAULT_REFRIGERATOR));
      setRefrigeratorIssues({ ...EMPTY_REF_ISSUES });
      setBatchData([]);
    }
  }, [existingLog, previousData, loadingExisting, loadingPrev, applyFormData]);

  // formData 생성
  const buildFormData = () => ({
    date: logDate,
    hygieneChecks,
    hygieneNotes,
    foreignMaterialChecks,
    foreignMaterialNotes,
    temperatureHumidity,
    temperatureHumidityIssues,
    freezerTemperature,
    freezerIssues,
    refrigeratorTemperature,
    refrigeratorIssues,
  });

  const handleSave = () => saveMutation.mutate({ logDate, formData: buildFormData(), status: 'draft' });
  const handleSubmit = () => saveMutation.mutate({ logDate, formData: buildFormData(), status: 'submitted' });

  const isLoading = loadingExisting || loadingPrev;
  const isSaving = saveMutation.isPending;

  return (
    <DashboardLayout>
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/daily-logs")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6 text-blue-600" />
              일일일지 작성
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              일반위생관리 및 공정점검표 (5개 항목)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* 상태 배지 */}
          {recordStatus === 'new' && <Badge variant="outline">신규 작성</Badge>}
          {recordStatus === 'draft' && <Badge className="bg-gray-100 text-gray-700">작성중</Badge>}
          {recordStatus === 'submitted' && <Badge className="bg-blue-100 text-blue-700">제출됨</Badge>}
          {recordStatus === 'approved' && <Badge className="bg-green-100 text-green-700">승인완료</Badge>}

          {preFilledFrom && (
            <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">
              <Copy className="h-3 w-3 mr-1" />
              {preFilledFrom} 데이터 기반
            </Badge>
          )}

          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <Input
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="w-40"
            />
          </div>
          <Button variant="outline" onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            저장
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving || isLoading}>
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            제출
          </Button>
        </div>
      </div>

      {/* 작성자 정보 (문서결재설정에서 자동) */}
      {authorName && (
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">작성자 (문서결재설정)</Label>
                <div className="text-sm font-medium mt-1">{authorName}</div>
              </div>
              {approvalSetting?.reviewerEmployeeId && employees && (
                <div>
                  <Label className="text-xs text-muted-foreground">검토자</Label>
                  <div className="text-sm font-medium mt-1">{(employees as any[]).find((e: any) => e.id === approvalSetting.reviewerEmployeeId)?.name || "-"}</div>
                </div>
              )}
              {approvalSetting?.approverEmployeeId && employees && (
                <div>
                  <Label className="text-xs text-muted-foreground">승인자</Label>
                  <div className="text-sm font-medium mt-1">{(employees as any[]).find((e: any) => e.id === approvalSetting.approverEmployeeId)?.name || "-"}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 배치 정보 (자동생성 데이터가 있는 경우) */}
      {batchData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">배치 생산 정보 (자동 연동)</CardTitle>
            <CardDescription>{logDate} 배치 {batchData.length}건</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full border-collapse border text-sm">
              <thead><tr className="bg-muted">
                <th className="border p-1">배치코드</th><th className="border p-1">제품명</th>
                <th className="border p-1">계획(kg)</th><th className="border p-1">실제(kg)</th>
                <th className="border p-1">CCP</th><th className="border p-1">이탈</th>
              </tr></thead>
              <tbody>
                {batchData.map((b: any, i: number) => (
                  <tr key={i}>
                    <td className="border p-1 text-xs text-center">{b.batchCode || "-"}</td>
                    <td className="border p-1">{b.productName || "-"}</td>
                    <td className="border p-1 text-center">{b.plannedQuantity ?? "-"}</td>
                    <td className="border p-1 text-center">{b.actualQuantity ?? 0}</td>
                    <td className="border p-1 text-center">{b.ccpTotal ?? 0}</td>
                    <td className="border p-1 text-center">{b.ccpDeviation ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />데이터 로딩 중...</div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="hygiene">일반위생관리</TabsTrigger>
            <TabsTrigger value="foreign">이물관리</TabsTrigger>
            <TabsTrigger value="temperature">원재료실 온습도</TabsTrigger>
            <TabsTrigger value="freezer">냉동고 온도</TabsTrigger>
            <TabsTrigger value="refrigerator">냉장고 온도</TabsTrigger>
          </TabsList>

          {/* 1. 일반위생관리 */}
          <TabsContent value="hygiene" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>일반위생관리 및 공정점검표</CardTitle>
                    <CardDescription>매일 작성 - 적합/부적합 체크</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs gap-1"
                    onClick={() => setHygieneChecks(prev => prev.map(c => ({ ...c, checkResult: 'yes' })))}>
                    ✓ 일괄 적합
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border text-sm">
                    <thead><tr className="bg-muted">
                      <th className="border p-2 w-[100px]">구분</th>
                      <th className="border p-2">점검 내용</th>
                      <th className="border p-2 w-[60px]">예</th>
                      <th className="border p-2 w-[60px]">아니오</th>
                    </tr></thead>
                    <tbody>
                      {hygieneChecks.map((check, idx) => (
                        <tr key={idx} className={check.checkResult === 'no' ? 'bg-red-50' : ''}>
                          <td className="border p-2 text-xs font-medium">{check.category}</td>
                          <td className="border p-2 text-xs">{check.itemText}</td>
                          <td className="border p-2 text-center">
                            <input type="radio" name={`h-${idx}`} checked={check.checkResult === 'yes'}
                              onChange={() => { const n = [...hygieneChecks]; n[idx] = {...n[idx], checkResult: 'yes'}; setHygieneChecks(n); }} />
                          </td>
                          <td className="border p-2 text-center">
                            <input type="radio" name={`h-${idx}`} checked={check.checkResult === 'no'}
                              onChange={() => { const n = [...hygieneChecks]; n[idx] = {...n[idx], checkResult: 'no'}; setHygieneChecks(n); }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <NotesSection notes={hygieneNotes} onChange={setHygieneNotes} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* 2. 이물관리 */}
          <TabsContent value="foreign" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>이물관리 점검표</CardTitle>
                  <Button size="sm" variant="outline" className="text-xs gap-1"
                    onClick={() => setForeignMaterialChecks(prev => prev.map(c => ({ ...c, checkResult: 'yes' })))}>
                    ✓ 일괄 적합
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border text-sm">
                    <thead><tr className="bg-muted">
                      <th className="border p-2 w-[140px]">구분</th>
                      <th className="border p-2">점검 내용</th>
                      <th className="border p-2 w-[60px]">적합</th>
                      <th className="border p-2 w-[60px]">부적합</th>
                    </tr></thead>
                    <tbody>
                      {foreignMaterialChecks.map((check, idx) => (
                        <tr key={idx} className={check.checkResult === 'no' ? 'bg-red-50' : ''}>
                          <td className="border p-2 text-xs font-medium">{check.category}</td>
                          <td className="border p-2 text-xs">{check.itemText}</td>
                          <td className="border p-2 text-center">
                            <input type="radio" name={`f-${idx}`} checked={check.checkResult === 'yes'}
                              onChange={() => { const n = [...foreignMaterialChecks]; n[idx] = {...n[idx], checkResult: 'yes'}; setForeignMaterialChecks(n); }} />
                          </td>
                          <td className="border p-2 text-center">
                            <input type="radio" name={`f-${idx}`} checked={check.checkResult === 'no'}
                              onChange={() => { const n = [...foreignMaterialChecks]; n[idx] = {...n[idx], checkResult: 'no'}; setForeignMaterialChecks(n); }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <NotesSection notes={foreignMaterialNotes} onChange={setForeignMaterialNotes} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* 3. 원재료실 온습도 */}
          <TabsContent value="temperature" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>원재료실 온/습도 점검기록지</CardTitle><CardDescription>온도: 1~35 C, 습도: 65% 이하</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <table className="w-full border-collapse border text-sm">
                  <thead><tr className="bg-muted">
                    <th className="border p-2">구분</th><th className="border p-2">검사시각</th>
                    <th className="border p-2">온도 (C)</th><th className="border p-2">습도 (%)</th><th className="border p-2">평가</th>
                  </tr></thead>
                  <tbody>
                    {temperatureHumidity.map((t, i) => (
                      <tr key={i}>
                        <td className="border p-2 text-xs font-medium">{t.roomName} {t.timePeriod}</td>
                        <td className="border p-2"><Input type="time" value={t.checkTime} onChange={(e) => { const n = [...temperatureHumidity]; n[i] = {...n[i], checkTime: e.target.value}; setTemperatureHumidity(n); }} className="h-8 text-xs" /></td>
                        <td className="border p-2"><Input type="number" step="0.1" value={t.temperature} onChange={(e) => { const n = [...temperatureHumidity]; n[i] = {...n[i], temperature: e.target.value}; setTemperatureHumidity(n); }} className="h-8 text-xs" placeholder="C" /></td>
                        <td className="border p-2"><Input type="number" step="0.1" value={t.humidity} onChange={(e) => { const n = [...temperatureHumidity]; n[i] = {...n[i], humidity: e.target.value}; setTemperatureHumidity(n); }} className="h-8 text-xs" placeholder="%" /></td>
                        <td className="border p-2">
                          <select value={t.evaluation || ''} onChange={(e) => { const n = [...temperatureHumidity]; n[i] = {...n[i], evaluation: e.target.value || null}; setTemperatureHumidity(n); }} className="text-xs h-8 border rounded px-1 w-full">
                            <option value="">-</option><option value="pass">적합</option><option value="fail">부적합</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <IssuesSection issues={temperatureHumidityIssues} onChange={setTemperatureHumidityIssues} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* 4. 냉동고 온도 */}
          <TabsContent value="freezer" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>급속냉동고 / 냉동고 온도 점검기록지</CardTitle><CardDescription>급속냉동고: -27 C 이하, 냉동고: -18 C 이하</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <table className="w-full border-collapse border text-sm">
                  <thead><tr className="bg-muted">
                    <th className="border p-2">시간</th><th className="border p-2">검사시각</th>
                    <th className="border p-2">급속냉동고 (C)</th><th className="border p-2">냉동고 (C)</th><th className="border p-2">평가</th>
                  </tr></thead>
                  <tbody>
                    {freezerTemperature.map((t, i) => (
                      <tr key={i}>
                        <td className="border p-2 text-xs font-medium">{t.timePeriod}</td>
                        <td className="border p-2"><Input type="time" value={t.checkTime} onChange={(e) => { const n = [...freezerTemperature]; n[i] = {...n[i], checkTime: e.target.value}; setFreezerTemperature(n); }} className="h-8 text-xs" /></td>
                        <td className="border p-2"><Input type="number" step="0.1" value={t.rapidFreezerTemp} onChange={(e) => { const n = [...freezerTemperature]; n[i] = {...n[i], rapidFreezerTemp: e.target.value}; setFreezerTemperature(n); }} className="h-8 text-xs" placeholder="C" /></td>
                        <td className="border p-2"><Input type="number" step="0.1" value={t.freezerTemp} onChange={(e) => { const n = [...freezerTemperature]; n[i] = {...n[i], freezerTemp: e.target.value}; setFreezerTemperature(n); }} className="h-8 text-xs" placeholder="C" /></td>
                        <td className="border p-2">
                          <select value={t.evaluation || ''} onChange={(e) => { const n = [...freezerTemperature]; n[i] = {...n[i], evaluation: e.target.value || null}; setFreezerTemperature(n); }} className="text-xs h-8 border rounded px-1 w-full">
                            <option value="">-</option><option value="pass">적합</option><option value="fail">부적합</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <IssuesSection issues={freezerIssues} onChange={setFreezerIssues} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* 5. 냉장고 온도 */}
          <TabsContent value="refrigerator" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>원재료 냉장고 온도 점검 기록지</CardTitle><CardDescription>온도: 0~10 C</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <table className="w-full border-collapse border text-sm">
                  <thead><tr className="bg-muted">
                    <th className="border p-2">시간</th><th className="border p-2">검사시각</th>
                    <th className="border p-2">온도 (C)</th><th className="border p-2">평가</th>
                  </tr></thead>
                  <tbody>
                    {refrigeratorTemperature.map((t, i) => (
                      <tr key={i}>
                        <td className="border p-2 text-xs font-medium">{t.timePeriod}</td>
                        <td className="border p-2"><Input type="time" value={t.checkTime} onChange={(e) => { const n = [...refrigeratorTemperature]; n[i] = {...n[i], checkTime: e.target.value}; setRefrigeratorTemperature(n); }} className="h-8 text-xs" /></td>
                        <td className="border p-2"><Input type="number" step="0.1" value={t.temperature} onChange={(e) => { const n = [...refrigeratorTemperature]; n[i] = {...n[i], temperature: e.target.value}; setRefrigeratorTemperature(n); }} className="h-8 text-xs" placeholder="C" /></td>
                        <td className="border p-2">
                          <select value={t.evaluation || ''} onChange={(e) => { const n = [...refrigeratorTemperature]; n[i] = {...n[i], evaluation: e.target.value || null}; setRefrigeratorTemperature(n); }} className="text-xs h-8 border rounded px-1 w-full">
                            <option value="">-</option><option value="pass">적합</option><option value="fail">부적합</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <IssuesSection issues={refrigeratorIssues} onChange={setRefrigeratorIssues} hasDatetime />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
    </DashboardLayout>
  );
}

// 특이사항 섹션 컴포넌트
function NotesSection({ notes, onChange }: { notes: any; onChange: (n: any) => void }) {
  return (
    <div className="space-y-3 pt-4 border-t">
      <h3 className="font-semibold text-sm">특이사항 및 조치</h3>
      <div className="grid gap-3">
        <div><Label className="text-xs">특이사항</Label>
          <Textarea value={notes.specialNotes} onChange={(e) => onChange({ ...notes, specialNotes: e.target.value })} placeholder="특이사항" className="text-sm" rows={2} /></div>
        <div><Label className="text-xs">개선조치 및 결과</Label>
          <Textarea value={notes.improvementAction} onChange={(e) => onChange({ ...notes, improvementAction: e.target.value })} placeholder="개선조치" className="text-sm" rows={2} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">조치자</Label><Input value={notes.actionBy} onChange={(e) => onChange({ ...notes, actionBy: e.target.value })} className="h-8 text-sm" /></div>
          <div><Label className="text-xs">확인자</Label><Input value={notes.confirmedBy} onChange={(e) => onChange({ ...notes, confirmedBy: e.target.value })} className="h-8 text-sm" /></div>
        </div>
      </div>
    </div>
  );
}

// 이상 발생 섹션 컴포넌트
function IssuesSection({ issues, onChange, hasDatetime }: { issues: any; onChange: (n: any) => void; hasDatetime?: boolean }) {
  return (
    <div className="space-y-3 pt-4 border-t">
      <h3 className="font-semibold text-sm">이상 발생 내용</h3>
      <div className="grid gap-3">
        {hasDatetime && <div><Label className="text-xs">일시</Label><Input type="datetime-local" value={issues.issueDatetime || ''} onChange={(e) => onChange({ ...issues, issueDatetime: e.target.value })} className="h-8 text-sm" /></div>}
        <div><Label className="text-xs">발생내용</Label>
          <Textarea value={issues.issueDescription} onChange={(e) => onChange({ ...issues, issueDescription: e.target.value })} placeholder="발생내용" className="text-sm" rows={2} /></div>
        <div><Label className="text-xs">조치내용 및 결과</Label>
          <Textarea value={issues.actionTaken} onChange={(e) => onChange({ ...issues, actionTaken: e.target.value })} placeholder="조치내용" className="text-sm" rows={2} /></div>
        <div className="grid grid-cols-3 gap-3">
          <div><Label className="text-xs">완료일자</Label><Input type="date" value={issues.completionDate} onChange={(e) => onChange({ ...issues, completionDate: e.target.value })} className="h-8 text-sm" /></div>
          <div><Label className="text-xs">조치자</Label><Input value={issues.actionBy} onChange={(e) => onChange({ ...issues, actionBy: e.target.value })} className="h-8 text-sm" /></div>
          <div><Label className="text-xs">확인자</Label><Input value={issues.confirmedBy} onChange={(e) => onChange({ ...issues, confirmedBy: e.target.value })} className="h-8 text-sm" /></div>
        </div>
      </div>
    </div>
  );
}
