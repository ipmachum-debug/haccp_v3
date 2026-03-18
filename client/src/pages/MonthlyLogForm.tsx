/**
 * 월간일지 작성 폼 (MonthlyLogForm)
 * - 날짜 선택 시 해당 월 기존 데이터 로드 -> 없으면 이전 월 데이터 pre-fill
 * - 2개 탭: 일반위생관리 (월간), CCP 검증점검표 (월간)
 * - 저장(draft) / 제출(submitted -> 승인요청) 지원
 */
import { useLocation, useSearch } from "wouter";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Calendar, Save, Send, FileText, ArrowLeft, Loader2, Copy } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";

// 일반위생관리 월간 점검항목
const DEFAULT_MONTHLY_HYGIENE = [
  { category: "청소소독", itemOrder: 1, itemText: "작업장 전체 대청소 및 소독 실시 여부", checkResult: null as string | null },
  { category: "청소소독", itemOrder: 2, itemText: "환기시설, 배수시설 청소 상태", checkResult: null },
  { category: "교육훈련", itemOrder: 3, itemText: "종사자 위생교육 실시 여부", checkResult: null },
  { category: "교육훈련", itemOrder: 4, itemText: "HACCP 관련 교육 실시 여부", checkResult: null },
  { category: "설비관리", itemOrder: 5, itemText: "제조설비 정기 점검 및 정비 실시 여부", checkResult: null },
  { category: "설비관리", itemOrder: 6, itemText: "계측기기 교정 상태 확인", checkResult: null },
  { category: "방충방서", itemOrder: 7, itemText: "방역업체 정기 방역 실시 여부", checkResult: null },
  { category: "방충방서", itemOrder: 8, itemText: "포충등/끈끈이 교체 실시 여부", checkResult: null },
  { category: "용수관리", itemOrder: 9, itemText: "용수 수질검사 실시 여부", checkResult: null },
  { category: "기타", itemOrder: 10, itemText: "보존식 관리 기록 확인", checkResult: null },
];

// CCP 검증점검표 월간
const DEFAULT_MONTHLY_CCP = [
  { category: "가열공정", itemOrder: 1, itemText: "CCP 한계기준 온도/시간 모니터링 기록 확인", checkResult: null as string | null, notes: "" },
  { category: "가열공정", itemOrder: 2, itemText: "모니터링 장비(온도계 등) 교정 확인", checkResult: null, notes: "" },
  { category: "가열공정", itemOrder: 3, itemText: "온도 측정 방법 적절성 확인", checkResult: null, notes: "" },
  { category: "가열공정", itemOrder: 4, itemText: "시간 측정 방법 적절성 확인", checkResult: null, notes: "" },
  { category: "가열공정", itemOrder: 5, itemText: "중심부 온도 측정 방법 적절성 확인", checkResult: null, notes: "" },
  { category: "가열공정", itemOrder: 6, itemText: "모니터링 담당자 현장 관찰 (관찰일:", checkResult: null, notes: "" },
  { category: "가열공정", itemOrder: 7, itemText: "개선조치 절차 이해도 확인", checkResult: null, notes: "" },
  { category: "가열공정", itemOrder: 8, itemText: "모니터링 담당자 면담 (면담일:", checkResult: null, notes: "" },
  { category: "금속검출", itemOrder: 9, itemText: "금속검출기 테스트 기록 확인", checkResult: null, notes: "" },
  { category: "금속검출", itemOrder: 10, itemText: "금속검출기 교정 확인", checkResult: null, notes: "" },
  { category: "금속검출", itemOrder: 11, itemText: "금속검출 방법 적절성 확인", checkResult: null, notes: "" },
  { category: "금속검출", itemOrder: 12, itemText: "모니터링 담당자 현장 관찰 (관찰일:", checkResult: null, notes: "" },
  { category: "금속검출", itemOrder: 13, itemText: "개선조치 절차 이해도 확인", checkResult: null, notes: "" },
  { category: "금속검출", itemOrder: 14, itemText: "모니터링 담당자 면담 (면담일:", checkResult: null, notes: "" },
];

const EMPTY_NOTES = { specialNotes: "", improvementAction: "", actionBy: "", confirmedBy: "" };
const EMPTY_DEVIATION = { deviationDetails: "", improvementAction: "", actionTaker: "", confirmation: "" };

export default function MonthlyLogForm() {
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const paramDate = params.get("date");
  const paramId = params.get("id");

  const [logDate, setLogDate] = useState(paramDate || new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState("hygiene");
  const [recordId, setRecordId] = useState<number | null>(paramId ? parseInt(paramId) : null);
  const [recordStatus, setRecordStatus] = useState<string>("new");
  const [preFilledFrom, setPreFilledFrom] = useState<string | null>(null);

  // Form data states
  const [hygieneChecks, setHygieneChecks] = useState(structuredClone(DEFAULT_MONTHLY_HYGIENE));
  const [hygieneNotes, setHygieneNotes] = useState({ ...EMPTY_NOTES });
  const [ccpChecks, setCcpChecks] = useState(structuredClone(DEFAULT_MONTHLY_CCP));
  const [ccpDeviation, setCcpDeviation] = useState({ ...EMPTY_DEVIATION });
  const [checkerName, setCheckerName] = useState("");
  const [confirmerName, setConfirmerName] = useState("");

  // 문서결재설정에서 작성자/확인자 자동 로드
  const { data: approvalSetting } = (trpc as any).organization.approvalSettings.getByType.useQuery(
    { documentType: "monthly_log" },
    { staleTime: 60000 }
  );
  const { data: employees } = (trpc as any).organization.employees.list.useQuery(undefined, { staleTime: 60000 });

  // 작성자/확인자 자동 설정 (신규 작성 시 빈 값이면 설정값으로 채움)
  useEffect(() => {
    if (!checkerName && approvalSetting?.authorEmployeeId && employees) {
      const emp = (employees as any[]).find((e: any) => e.id === approvalSetting.authorEmployeeId);
      if (emp?.name) setCheckerName(emp.name);
    }
    if (!confirmerName && approvalSetting?.reviewerEmployeeId && employees) {
      const emp = (employees as any[]).find((e: any) => e.id === approvalSetting.reviewerEmployeeId);
      if (emp?.name) setConfirmerName(emp.name);
    }
  }, [approvalSetting, employees, checkerName, confirmerName]);

  // API queries
  const { data: existingLog, isLoading: loadingExisting } = trpc.monthlyLog.getByDate.useQuery(
    { logDate },
    { enabled: !!logDate }
  );

  const { data: previousData, isLoading: loadingPrev } = trpc.monthlyLog.getPreviousFormData.useQuery(
    { beforeDate: logDate },
    { enabled: !!logDate && !existingLog }
  );

  const saveMutation = trpc.monthlyLog.saveFullForm.useMutation({
    onSuccess: (result: any) => {
      setRecordId(result.id);
      setRecordStatus(result.status);
      toast.success(result.status === 'submitted' ? '제출 완료 (승인관리로 이동됩니다)' : '저장 완료');
    },
    onError: (err: any) => toast.error('저장 실패: ' + err.message),
  });

  const applyFormData = useCallback((fd: any, _isPreFill: boolean) => {
    if (!fd) return;
    if (Array.isArray(fd.hygieneChecks)) {
      setHygieneChecks(fd.hygieneChecks.map((item: any, i: number) => ({
        ...DEFAULT_MONTHLY_HYGIENE[i],
        ...item,
      })));
    }
    if (fd.hygieneNotes) setHygieneNotes({ ...EMPTY_NOTES, ...fd.hygieneNotes });
    if (Array.isArray(fd.ccpChecks)) {
      setCcpChecks(fd.ccpChecks.map((item: any, i: number) => ({
        ...DEFAULT_MONTHLY_CCP[i],
        ...item,
      })));
    }
    if (fd.ccpDeviation) setCcpDeviation({ ...EMPTY_DEVIATION, ...fd.ccpDeviation });
    if (fd.checkerName) setCheckerName(fd.checkerName);
    if (fd.confirmerName) setConfirmerName(fd.confirmerName);
  }, []);

  useEffect(() => {
    if (loadingExisting || loadingPrev) return;
    if (existingLog) {
      setRecordId(existingLog.id);
      setRecordStatus(existingLog.status);
      setPreFilledFrom(null);
      applyFormData(existingLog.formData, false);
    } else if (previousData) {
      setRecordId(null);
      setRecordStatus("new");
      setPreFilledFrom(previousData.sourceDate);
      applyFormData(previousData.formData, true);
    } else {
      setRecordId(null);
      setRecordStatus("new");
      setPreFilledFrom(null);
      setHygieneChecks(structuredClone(DEFAULT_MONTHLY_HYGIENE));
      setHygieneNotes({ ...EMPTY_NOTES });
      setCcpChecks(structuredClone(DEFAULT_MONTHLY_CCP));
      setCcpDeviation({ ...EMPTY_DEVIATION });
      setCheckerName("");
      setConfirmerName("");
    }
  }, [existingLog, previousData, loadingExisting, loadingPrev, applyFormData]);

  const buildFormData = () => ({
    date: logDate,
    checkerName,
    confirmerName,
    hygieneChecks,
    hygieneNotes,
    ccpChecks,
    ccpDeviation,
  });

  const handleSave = () => saveMutation.mutate({ logDate, formData: buildFormData(), status: 'draft' });
  const handleSubmit = () => saveMutation.mutate({ logDate, formData: buildFormData(), status: 'submitted' });

  const isLoading = loadingExisting || loadingPrev;
  const isSaving = saveMutation.isPending;

  return (
    <DashboardLayout>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/quality/checklists")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6 text-purple-600" />
              월간일지 작성
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              일반위생관리 (월간) + CCP 검증점검표 (월간)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
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
            <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} className="w-40" />
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

      {/* Basic Info */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label>점검자 (작성자)</Label>
              <Input value={checkerName} onChange={(e) => setCheckerName(e.target.value)} placeholder="점검자명" />
            </div>
            <div>
              <Label>확인자 (검토자)</Label>
              <Input value={confirmerName} onChange={(e) => setConfirmerName(e.target.value)} placeholder="확인자명" />
            </div>
            {approvalSetting?.approverEmployeeId && employees && (
              <div>
                <Label className="text-xs text-muted-foreground">승인자</Label>
                <div className="text-sm font-medium mt-2">{(employees as any[]).find((e: any) => e.id === approvalSetting.approverEmployeeId)?.name || "-"}</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />데이터 로딩 중...</div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="hygiene">일반위생관리 (월간)</TabsTrigger>
            <TabsTrigger value="ccp">CCP 검증점검표 (월간)</TabsTrigger>
          </TabsList>

          {/* 1. 일반위생관리 (월간) */}
          <TabsContent value="hygiene" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>일반위생관리 및 공정점검표 (월간)</CardTitle>
                <CardDescription>매월 작성 - 적합/부적합 체크</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                          <input type="radio" name={`mh-${idx}`} checked={check.checkResult === 'yes'}
                            onChange={() => { const n = [...hygieneChecks]; n[idx] = {...n[idx], checkResult: 'yes'}; setHygieneChecks(n); }} />
                        </td>
                        <td className="border p-2 text-center">
                          <input type="radio" name={`mh-${idx}`} checked={check.checkResult === 'no'}
                            onChange={() => { const n = [...hygieneChecks]; n[idx] = {...n[idx], checkResult: 'no'}; setHygieneChecks(n); }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <NotesSection notes={hygieneNotes} onChange={setHygieneNotes} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* 2. CCP 검증점검표 (월간) */}
          <TabsContent value="ccp" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>중요관리점(CCP) 검증점검표 (월간)</CardTitle>
                <CardDescription>가열공정 / 금속검출 - 적합/부적합 체크</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <table className="w-full border-collapse border text-sm">
                  <thead><tr className="bg-muted">
                    <th className="border p-2 w-[90px]">구분</th>
                    <th className="border p-2">검증 내용</th>
                    <th className="border p-2 w-[60px]">적합</th>
                    <th className="border p-2 w-[60px]">부적합</th>
                    <th className="border p-2 w-[150px]">비고</th>
                  </tr></thead>
                  <tbody>
                    {ccpChecks.map((check, idx) => (
                      <tr key={idx} className={check.checkResult === 'no' ? 'bg-red-50' : ''}>
                        <td className="border p-2 text-xs font-medium">{check.category}</td>
                        <td className="border p-2 text-xs">{check.itemText}</td>
                        <td className="border p-2 text-center">
                          <input type="radio" name={`mc-${idx}`} checked={check.checkResult === 'yes'}
                            onChange={() => { const n = [...ccpChecks]; n[idx] = {...n[idx], checkResult: 'yes'}; setCcpChecks(n); }} />
                        </td>
                        <td className="border p-2 text-center">
                          <input type="radio" name={`mc-${idx}`} checked={check.checkResult === 'no'}
                            onChange={() => { const n = [...ccpChecks]; n[idx] = {...n[idx], checkResult: 'no'}; setCcpChecks(n); }} />
                        </td>
                        <td className="border p-1">
                          <Input
                            value={check.notes || ''}
                            onChange={(e) => { const n = [...ccpChecks]; n[idx] = {...n[idx], notes: e.target.value}; setCcpChecks(n); }}
                            className="h-7 text-xs" placeholder="비고"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* 한계기준 이탈 */}
                <div className="space-y-3 pt-4 border-t">
                  <h3 className="font-semibold text-sm">한계기준 이탈내용 및 개선조치</h3>
                  <div className="grid gap-3">
                    <div><Label className="text-xs">이탈 내용</Label>
                      <Textarea value={ccpDeviation.deviationDetails} onChange={(e) => setCcpDeviation({...ccpDeviation, deviationDetails: e.target.value})} placeholder="한계기준 이탈 내용" className="text-sm" rows={2} /></div>
                    <div><Label className="text-xs">개선조치 및 결과</Label>
                      <Textarea value={ccpDeviation.improvementAction} onChange={(e) => setCcpDeviation({...ccpDeviation, improvementAction: e.target.value})} placeholder="개선조치" className="text-sm" rows={2} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label className="text-xs">조치자</Label><Input value={ccpDeviation.actionTaker} onChange={(e) => setCcpDeviation({...ccpDeviation, actionTaker: e.target.value})} className="h-8 text-sm" /></div>
                      <div><Label className="text-xs">확인자</Label><Input value={ccpDeviation.confirmation} onChange={(e) => setCcpDeviation({...ccpDeviation, confirmation: e.target.value})} className="h-8 text-sm" /></div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
    </DashboardLayout>
  );
}

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
