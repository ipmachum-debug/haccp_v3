/**
 * 주간일지 작성 폼 (WeeklyLogForm)
 * - 날짜 선택 시 해당 주 기존 데이터 로드 -> 없으면 이전 주 데이터 pre-fill
 * - 2개 탭: 일반위생관리 (주간), 방충방서 (주간)
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

// 일반위생관리 주간 점검항목
const DEFAULT_WEEKLY_HYGIENE = [
  { category: "청소소독", itemOrder: 1, itemText: "냉장창고 내부 청소 상태는 양호한가?", checkResult: null as string | null },
  { category: "청소소독", itemOrder: 2, itemText: "작업장 벽, 제조설비(제품과 직접 닿지 않는 부분)에 대한 청소.소독 상태는 양호한가?", checkResult: null },
  { category: "위생관리", itemOrder: 3, itemText: "위생복 세탁은 실시하였는가?", checkResult: null },
  { category: "위생관리", itemOrder: 4, itemText: "작업장 내 환기 시스템이 정상 작동하고 있는가?", checkResult: null },
  { category: "폐기물관리", itemOrder: 5, itemText: "폐기물 처리 및 반출이 주기적으로 이루어지고 있는가?", checkResult: null },
  { category: "용수관리", itemOrder: 6, itemText: "용수(물) 관리 상태가 양호한가?", checkResult: null },
];

// 방충방서 주간 점검항목
const DEFAULT_WEEKLY_PEST = [
  { category: "포충등", itemOrder: 1, itemText: "포충등 점검 - 먼지 청소 상태", checkResult: null as string | null },
  { category: "포충등", itemOrder: 2, itemText: "포충등 점검 - 끈끈이 상태", checkResult: null },
  { category: "해충", itemOrder: 3, itemText: "파리류 포획 여부", checkResult: null },
  { category: "해충", itemOrder: 4, itemText: "초파리류 포획 여부", checkResult: null },
  { category: "해충", itemOrder: 5, itemText: "나방파리류 포획 여부", checkResult: null },
  { category: "해충", itemOrder: 6, itemText: "날개벌레류 포획 여부", checkResult: null },
  { category: "해충", itemOrder: 7, itemText: "바퀴벌레 발견 여부", checkResult: null },
  { category: "해충", itemOrder: 8, itemText: "개미류 발견 여부", checkResult: null },
  { category: "해충", itemOrder: 9, itemText: "거미류 발견 여부", checkResult: null },
  { category: "서류", itemOrder: 10, itemText: "쥐류 흔적 여부 (배설물, 발자국 등)", checkResult: null },
  { category: "기타", itemOrder: 11, itemText: "기타 해충 발견 여부", checkResult: null },
  { category: "방충관리", itemOrder: 12, itemText: "방충망/에어커튼 등 방충시설 정상 작동 여부", checkResult: null },
];

const EMPTY_NOTES = { specialNotes: "", improvementAction: "", actionBy: "", confirmedBy: "" };

export default function WeeklyLogForm() {
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
  const [hygieneChecks, setHygieneChecks] = useState(structuredClone(DEFAULT_WEEKLY_HYGIENE));
  const [hygieneNotes, setHygieneNotes] = useState({ ...EMPTY_NOTES });
  const [pestChecks, setPestChecks] = useState(structuredClone(DEFAULT_WEEKLY_PEST));
  const [pestNotes, setPestNotes] = useState({ ...EMPTY_NOTES });
  const [checkerName, setCheckerName] = useState("");
  const [managementNotes, setManagementNotes] = useState("");

  // API queries
  const { data: existingLog, isLoading: loadingExisting } = trpc.weeklyLog.getByDate.useQuery(
    { logDate },
    { enabled: !!logDate }
  );

  const { data: previousData, isLoading: loadingPrev } = trpc.weeklyLog.getPreviousFormData.useQuery(
    { beforeDate: logDate },
    { enabled: !!logDate && !existingLog }
  );

  const saveMutation = trpc.weeklyLog.saveFullForm.useMutation({
    onSuccess: (result: any) => {
      setRecordId(result.id);
      setRecordStatus(result.status);
      toast.success(result.status === 'submitted' ? '제출 완료 (승인관리로 이동됩니다)' : '저장 완료');
    },
    onError: (err: any) => toast.error('저장 실패: ' + err.message),
  });

  const applyFormData = useCallback((fd: any, isPreFill: boolean) => {
    if (!fd) return;
    if (Array.isArray(fd.hygieneChecks)) {
      setHygieneChecks(fd.hygieneChecks.map((item: any, i: number) => ({
        ...DEFAULT_WEEKLY_HYGIENE[i],
        ...item,
      })));
    }
    if (fd.hygieneNotes) setHygieneNotes({ ...EMPTY_NOTES, ...fd.hygieneNotes });
    if (Array.isArray(fd.pestChecks)) {
      setPestChecks(fd.pestChecks.map((item: any, i: number) => ({
        ...DEFAULT_WEEKLY_PEST[i],
        ...item,
      })));
    }
    if (fd.pestNotes) setPestNotes({ ...EMPTY_NOTES, ...fd.pestNotes });
    if (fd.checkerName) setCheckerName(fd.checkerName);
    if (fd.managementNotes) setManagementNotes(fd.managementNotes);
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
      setHygieneChecks(structuredClone(DEFAULT_WEEKLY_HYGIENE));
      setHygieneNotes({ ...EMPTY_NOTES });
      setPestChecks(structuredClone(DEFAULT_WEEKLY_PEST));
      setPestNotes({ ...EMPTY_NOTES });
      setCheckerName("");
      setManagementNotes("");
    }
  }, [existingLog, previousData, loadingExisting, loadingPrev, applyFormData]);

  const buildFormData = () => ({
    date: logDate,
    checkerName,
    managementNotes,
    hygieneChecks,
    hygieneNotes,
    pestChecks,
    pestNotes,
  });

  const handleSave = () => saveMutation.mutate({ logDate, formData: buildFormData(), status: 'draft' });
  const handleSubmit = () => saveMutation.mutate({ logDate, formData: buildFormData(), status: 'submitted' });

  const isLoading = loadingExisting || loadingPrev;
  const isSaving = saveMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/quality/checklists")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-6 w-6 text-green-600" />
              주간일지 작성
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              일반위생관리 (주간) + 방충방서 (주간)
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>점검자</Label>
              <Input value={checkerName} onChange={(e) => setCheckerName(e.target.value)} placeholder="점검자명" />
            </div>
            <div>
              <Label>관리 메모</Label>
              <Input value={managementNotes} onChange={(e) => setManagementNotes(e.target.value)} placeholder="관리 메모" />
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-12"><Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />데이터 로딩 중...</div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="hygiene">일반위생관리 (주간)</TabsTrigger>
            <TabsTrigger value="pest">방충방서 (주간)</TabsTrigger>
          </TabsList>

          {/* 1. 일반위생관리 */}
          <TabsContent value="hygiene" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>일반위생관리 및 공정점검표 (주간)</CardTitle>
                <CardDescription>매주 작성 - 적합/부적합 체크</CardDescription>
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
                          <input type="radio" name={`wh-${idx}`} checked={check.checkResult === 'yes'}
                            onChange={() => { const n = [...hygieneChecks]; n[idx] = {...n[idx], checkResult: 'yes'}; setHygieneChecks(n); }} />
                        </td>
                        <td className="border p-2 text-center">
                          <input type="radio" name={`wh-${idx}`} checked={check.checkResult === 'no'}
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

          {/* 2. 방충방서 */}
          <TabsContent value="pest" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>방충방서 점검표 (주간)</CardTitle>
                <CardDescription>해충 모니터링 및 방충시설 점검</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <table className="w-full border-collapse border text-sm">
                  <thead><tr className="bg-muted">
                    <th className="border p-2 w-[100px]">구분</th>
                    <th className="border p-2">점검 내용</th>
                    <th className="border p-2 w-[60px]">양호</th>
                    <th className="border p-2 w-[60px]">불량</th>
                  </tr></thead>
                  <tbody>
                    {pestChecks.map((check, idx) => (
                      <tr key={idx} className={check.checkResult === 'no' ? 'bg-red-50' : ''}>
                        <td className="border p-2 text-xs font-medium">{check.category}</td>
                        <td className="border p-2 text-xs">{check.itemText}</td>
                        <td className="border p-2 text-center">
                          <input type="radio" name={`wp-${idx}`} checked={check.checkResult === 'yes'}
                            onChange={() => { const n = [...pestChecks]; n[idx] = {...n[idx], checkResult: 'yes'}; setPestChecks(n); }} />
                        </td>
                        <td className="border p-2 text-center">
                          <input type="radio" name={`wp-${idx}`} checked={check.checkResult === 'no'}
                            onChange={() => { const n = [...pestChecks]; n[idx] = {...n[idx], checkResult: 'no'}; setPestChecks(n); }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <NotesSection notes={pestNotes} onChange={setPestNotes} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
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
