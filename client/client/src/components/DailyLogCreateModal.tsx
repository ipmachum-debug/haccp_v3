import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Calendar, CheckCircle2, Thermometer, Droplet } from "lucide-react";
import InspectorSettingField from "@/components/InspectorSettingField";
import WriterSelect from "@/components/WriterSelect";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";

export function DailyLogCreateModal() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [inspector, setInspector] = useState("");
  const [isLoadingPrev, setIsLoadingPrev] = useState(false);
  const [prevDataLoaded, setPrevDataLoaded] = useState(false);

  // 1. 일반위생관리 체크리스트 상태
  const [hygieneChecks, setHygieneChecks] = useState({
    // 개인위생
    hygiene1: false,
    hygiene2: false,
    hygiene3: false,
    // 방충방서
    pest1: false,
    // 설비
    facility1: false,
    // 입고보관
    storage1: false,
    storageTemp: "",
    // 운송
    transport1: "",
    // 공정관리
    process1: false,
    process2: false,
    process3: false,
    process4: false,
    // 방충방서(작업중)
    pest2: false,
    // 청소소독
    cleaning1: false,
    // 설비(작업중)
    facility2: false,
    // 점검
    ccp1: false,
    // 보관
    storage2: false,
    // 입고검수
    inspection1: false,
    // 운송(출하시)
    transport2: "",
  });

  // 2. 이물관리 체크리스트 상태
  const [foreignMaterialChecks, setForeignMaterialChecks] = useState({
    material1: false,
    material2: false,
    material3: false,
    process1: false,
    process2: false,
    process3: false,
    worker1: false,
    worker2: false,
    worker3: false,
    equipment1: false,
    equipment2: false,
    equipment3: false,
    pest1: false,
    pest2: false,
  });

  // 3. 원재료실 온/습도
  const [temperatureHumidity, setTemperatureHumidity] = useState({
    room1Morning: { time: "07:48", temp: "", humidity: "", pass: true },
    room1Afternoon: { time: "18:02", temp: "", humidity: "", pass: true },
    room2Morning: { time: "07:49", temp: "", humidity: "", pass: true },
    room2Afternoon: { time: "18:03", temp: "", humidity: "", pass: true },
  });

  // 4. 급속냉동고/냉동고 온도
  const [freezerTemperature, setFreezerTemperature] = useState({
    morning: { time: "07:50", rapidFreezer: "", freezer: "", pass: true },
    afternoon: { time: "18:04", rapidFreezer: "", freezer: "", pass: true },
  });

  // 5. 원재료 냉장고 온도
  const [refrigeratorTemperature, setRefrigeratorTemperature] = useState({
    morning: { time: "07:48", temp: "", pass: true },
    afternoon: { time: "18:02", temp: "", pass: true },
  });



  // 결재 정보 (검토자/승인자)
  const [approval, setApproval] = useState({
    writerId: null as number | null,
    writerName: "",
    reviewerId: null as number | null,
    reviewerName: "",
    approverId: null as number | null,
    approverName: "",
    writerApproved: false,
    reviewerApproved: false,
    approverApproved: false,
    writerDate: "",
    reviewerDate: "",
    approverDate: "",
  });

  // 조직/책임관리에서 결재자 설정 조회
  const { data: employees } = trpc.organization.employees.list.useQuery();
  const activeEmployees = (employees || []).filter((e: any) => e.isActive === 1);
  const { data: approvalSetting } = trpc.organization.approvalSettings.getByType.useQuery(
    { documentType: "daily_log" },
    { retry: false }
  );

  // 이전 작성 데이터 자동 불러오기
  const { data: previousLogs } = trpc.genericChecklist.list.useQuery(
    { formType: "daily_log" },
    { enabled: !prevDataLoaded }
  );

  useEffect(() => {
    if (previousLogs && previousLogs.length > 0 && !prevDataLoaded) {
      setPrevDataLoaded(true);
      const latest = previousLogs[0] as any; // 가장 최근 데이터 (createdAt desc)
      const fd = latest.formData;
      if (!fd) return;
      setIsLoadingPrev(true);
      try {
        // 점검자
        if (fd.inspector) setInspector(fd.inspector);

        // 일반위생관리 체크리스트 (체크 상태 복원)
        if (fd.hygieneChecks) setHygieneChecks(prev => ({ ...prev, ...fd.hygieneChecks }));
        // 이물관리 체크리스트
        if (fd.foreignMaterialChecks) setForeignMaterialChecks(prev => ({ ...prev, ...fd.foreignMaterialChecks }));
        // 온습도 (시간만 복원, 측정값은 비움)
        if (fd.temperatureHumidity) {
          const th = fd.temperatureHumidity;
          setTemperatureHumidity(prev => ({
            room1Morning: { ...prev.room1Morning, time: th.room1Morning?.time || prev.room1Morning.time },
            room1Afternoon: { ...prev.room1Afternoon, time: th.room1Afternoon?.time || prev.room1Afternoon.time },
            room2Morning: { ...prev.room2Morning, time: th.room2Morning?.time || prev.room2Morning.time },
            room2Afternoon: { ...prev.room2Afternoon, time: th.room2Afternoon?.time || prev.room2Afternoon.time },
          }));
        }
        // 급속냉동고 (시간만 복원)
        if (fd.freezerTemperature) {
          const ft = fd.freezerTemperature;
          setFreezerTemperature(prev => ({
            morning: { ...prev.morning, time: ft.morning?.time || prev.morning.time },
            afternoon: { ...prev.afternoon, time: ft.afternoon?.time || prev.afternoon.time },
          }));
        }
        // 냉장고 (시간만 복원)
        if (fd.refrigeratorTemperature) {
          const rt = fd.refrigeratorTemperature;
          setRefrigeratorTemperature(prev => ({
            morning: { ...prev.morning, time: rt.morning?.time || prev.morning.time },
            afternoon: { ...prev.afternoon, time: rt.afternoon?.time || prev.afternoon.time },
          }));
        }
      } finally {
        setIsLoadingPrev(false);
      }
    }
  }, [previousLogs, prevDataLoaded]);

  // 결재자 자동 설정
  useEffect(() => {
    if (approvalSetting && activeEmployees.length > 0) {
      const setting = approvalSetting as any;
      if (setting.authorEmployeeId) {
        const author = activeEmployees.find((e: any) => e.id === setting.authorEmployeeId);
        if (author) setApproval(prev => ({ ...prev, writerId: author.id, writerName: author.name }));
      }
      if (setting.reviewerEmployeeId) {
        const reviewer = activeEmployees.find((e: any) => e.id === setting.reviewerEmployeeId);
        if (reviewer) setApproval(prev => ({ ...prev, reviewerId: reviewer.id, reviewerName: reviewer.name }));
      }
      if (setting.approverEmployeeId) {
        const approver = activeEmployees.find((e: any) => e.id === setting.approverEmployeeId);
        if (approver) setApproval(prev => ({ ...prev, approverId: approver.id, approverName: approver.name }));
      }
    } else if (!approvalSetting && activeEmployees.length > 0) {
      // 설정이 없으면 approvalRole 기반 자동 설정
      const reviewer = activeEmployees.find((e: any) => e.approvalRole === "reviewer");
      if (reviewer) setApproval(prev => ({ ...prev, reviewerId: reviewer.id, reviewerName: reviewer.name }));
      const approver = activeEmployees.find((e: any) => e.approvalRole === "approver");
      if (approver) setApproval(prev => ({ ...prev, approverId: approver.id, approverName: approver.name }));
    }
  }, [approvalSetting, activeEmployees]);

  // 일괄체크 핸들러
  const handleCheckAllHygiene = (checked: boolean) => {
    setHygieneChecks(prev => ({
      ...prev,
      hygiene1: checked, hygiene2: checked, hygiene3: checked,
      pest1: checked, facility1: checked, storage1: checked,
      process1: checked, process2: checked, process3: checked, process4: checked,
      pest2: checked, cleaning1: checked, facility2: checked,
      ccp1: checked, storage2: checked, inspection1: checked,
    }));
  };

  const handleCheckAllForeignMaterial = (checked: boolean) => {
    setForeignMaterialChecks(prev => ({
      ...prev,
      material1: checked, material2: checked, material3: checked,
      process1: checked, process2: checked, process3: checked,
      worker1: checked, worker2: checked, worker3: checked,
      equipment1: checked, equipment2: checked, equipment3: checked,
      pest1: checked, pest2: checked,
    }));
  };

  // 모든 체크 여부 확인
  const allHygieneChecked = [
    hygieneChecks.hygiene1, hygieneChecks.hygiene2, hygieneChecks.hygiene3,
    hygieneChecks.pest1, hygieneChecks.facility1, hygieneChecks.storage1,
    hygieneChecks.process1, hygieneChecks.process2, hygieneChecks.process3, hygieneChecks.process4,
    hygieneChecks.pest2, hygieneChecks.cleaning1, hygieneChecks.facility2,
    hygieneChecks.ccp1, hygieneChecks.storage2, hygieneChecks.inspection1,
  ].every(Boolean);

  const allForeignMaterialChecked = Object.values(foreignMaterialChecks).every(Boolean);

  const { toast } = useToast();
  const createMutation = trpc.genericChecklist.create.useMutation({
    onSuccess: () => {
      toast({ title: "저장 완료", description: "일일일지가 저장되었습니다." });
    },
    onError: (err: any) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });
  const submitForReviewMutation = trpc.genericChecklist.submitForReview.useMutation({
    onSuccess: () => {
      toast({ title: "제출 완료", description: "일일일지가 승인 요청되었습니다." });
    },
    onError: (err: any) => {
      toast({ title: "제출 실패", description: err.message, variant: "destructive" });
    },
  });

  const buildLogData = () => ({
    date,
    inspector,

    hygieneChecks,
    foreignMaterialChecks,
    temperatureHumidity,
    freezerTemperature,
    refrigeratorTemperature,
    approval: {
      writerId: approval.writerId,
      writerName: inspector || approval.writerName,
      reviewerId: approval.reviewerId,
      reviewerName: approval.reviewerName,
      approverId: approval.approverId,
      approverName: approval.approverName,
      writerApproved: true,
      reviewerApproved: false,
      approverApproved: false,
      writerDate: new Date().toLocaleDateString("ko-KR"),
      reviewerDate: "",
      approverDate: "",
    },
  });

  const handleSave = () => {
    const logData = buildLogData();
    createMutation.mutate({
      formType: "daily_log",
      formDate: date,
      title: "일일일지 - " + date,
      formData: logData,
      status: "draft",
    });
  };

  const handleSubmit = () => {
    const logData = buildLogData();
    createMutation.mutate({
      formType: "daily_log",
      formDate: date,
      title: "일일일지 - " + date,
      formData: logData,
      status: "submitted",
    }, {
      onSuccess: (result: any) => {
        if (result?.id) {
          submitForReviewMutation.mutate({
            id: result.id,
            requestType: "daily_log",
            title: "일일일지 - " + date,
            description: "일일일지 승인 요청",
          });
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* 공통 정보 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            일일일지 기본 정보
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>점검일자</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <InspectorSettingField
              value={inspector}
              onChange={setInspector}
              label="점검자(작성자)"
              storageKey="daily_log"
            />
          </div>
        </CardContent>
      </Card>

      {/* 1. 일반위생관리 및 공정점검표 */}
      <Card>
        <CardHeader className="bg-blue-50">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-blue-600" />
              1. 일반위생관리 및 공정점검표
            </CardTitle>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={allHygieneChecked}
                onCheckedChange={(checked) => handleCheckAllHygiene(checked as boolean)}
              />
              <label className="text-sm font-medium">일괄 체크</label>
            </div>
          </div>
          <CardDescription>매일 작성</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {/* 일일 (작업전) */}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm bg-gray-100 px-3 py-2 rounded">일일 (작업전)</h4>
            
            <div className="space-y-2 pl-4">
              <p className="text-sm font-medium">개인위생</p>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={hygieneChecks.hygiene1} 
                  onCheckedChange={(checked) => setHygieneChecks({...hygieneChecks, hygiene1: checked as boolean})}
                />
                <label className="text-sm">위생복장과 이물 복장이 구분하여 보관되고 있는가?</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={hygieneChecks.hygiene2} 
                  onCheckedChange={(checked) => setHygieneChecks({...hygieneChecks, hygiene2: checked as boolean})}
                />
                <label className="text-sm">종사자의 건강상태가 양호하고 개인 장신구 등을 소지하지 않으며, 청결한 위생복장을 착용하고 식당하고 있는가?</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={hygieneChecks.hygiene3} 
                  onCheckedChange={(checked) => setHygieneChecks({...hygieneChecks, hygiene3: checked as boolean})}
                />
                <label className="text-sm">위생설비(손 세척기 등) 중 이상이 있는 것이 없으며, 종사자는 위생처리를 하고 입실하는가?</label>
              </div>
            </div>

            <div className="space-y-2 pl-4">
              <p className="text-sm font-medium">방충방서</p>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={hygieneChecks.pest1} 
                  onCheckedChange={(checked) => setHygieneChecks({...hygieneChecks, pest1: checked as boolean})}
                />
                <label className="text-sm">작업장 입구전등은 밀폐가 잘 이루어지고 있으며, 방충시설(방충망 파손 등)에는 이상이 없는가?</label>
              </div>
            </div>

            <div className="space-y-2 pl-4">
              <p className="text-sm font-medium">설비</p>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={hygieneChecks.facility1} 
                  onCheckedChange={(checked) => setHygieneChecks({...hygieneChecks, facility1: checked as boolean})}
                />
                <label className="text-sm">파손되거나 고장 난 제조설비가 없는가?</label>
              </div>
            </div>

            <div className="space-y-2 pl-4">
              <p className="text-sm font-medium">입고 보관</p>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={hygieneChecks.storage1} 
                  onCheckedChange={(checked) => setHygieneChecks({...hygieneChecks, storage1: checked as boolean})}
                />
                <label className="text-sm">냉장/냉동창고의 온도는 적절히 관리되고 있는가? (냉장창고: 0~10℃, 냉동창고: -18℃이하)</label>
              </div>
            </div>

            <div className="space-y-2 pl-4">
              <p className="text-sm font-medium">운송</p>
              <div className="flex items-center space-x-2 flex-1">
                <label className="text-sm">완제품을 운송하는 중 온도기준을 준수하였는가?</label>
                <Input 
                  type="number" 
                  className="w-24" 
                  placeholder="온도"
                  value={hygieneChecks.transport1}
                  onChange={(e) => setHygieneChecks({...hygieneChecks, transport1: e.target.value})}
                />
                <span className="text-sm">℃</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* 일일 (작업중) */}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm bg-gray-100 px-3 py-2 rounded">일일 (작업중)</h4>
            
            <div className="space-y-2 pl-4">
              <p className="text-sm font-medium">공정관리</p>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={hygieneChecks.process1} 
                  onCheckedChange={(checked) => setHygieneChecks({...hygieneChecks, process1: checked as boolean})}
                />
                <label className="text-sm">청결구역작업과 일반구역작업이 분리되어 있으며 오염되지 않도록 관리되고 있는가?</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={hygieneChecks.process2} 
                  onCheckedChange={(checked) => setHygieneChecks({...hygieneChecks, process2: checked as boolean})}
                />
                <label className="text-sm">가열후 식힘 공정이 적절히 관리되고 있는가?</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={hygieneChecks.process3} 
                  onCheckedChange={(checked) => setHygieneChecks({...hygieneChecks, process3: checked as boolean})}
                />
                <label className="text-sm">완제품의 표장 상태는 양호한가?</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={hygieneChecks.process4} 
                  onCheckedChange={(checked) => setHygieneChecks({...hygieneChecks, process4: checked as boolean})}
                />
                <label className="text-sm">모니터링방비(탐침온도계 등)는 사용전후 세척·소독을 실시하고 있는가?</label>
              </div>
            </div>

            <div className="space-y-2 pl-4">
              <p className="text-sm font-medium">방충방서</p>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={hygieneChecks.pest2} 
                  onCheckedChange={(checked) => setHygieneChecks({...hygieneChecks, pest2: checked as boolean})}
                />
                <label className="text-sm">작업장 주변의 음식물 쓰레기를 잘 정리되어 보관되어지고 있고, 주기적으로 반출하고 있는가?</label>
              </div>
            </div>

            <div className="space-y-2 pl-4">
              <p className="text-sm font-medium">청소소독</p>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={hygieneChecks.cleaning1} 
                  onCheckedChange={(checked) => setHygieneChecks({...hygieneChecks, cleaning1: checked as boolean})}
                />
                <label className="text-sm">작업장 바닥, 배수로, 위생시설, 제조설비(식품과 직접 닿는 부분)의 청소·소독 상태는 양호한가?</label>
              </div>
            </div>

            <div className="space-y-2 pl-4">
              <p className="text-sm font-medium">설비</p>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={hygieneChecks.facility2} 
                  onCheckedChange={(checked) => setHygieneChecks({...hygieneChecks, facility2: checked as boolean})}
                />
                <label className="text-sm">파손되거나 고장 난 제조설비가 없는가?</label>
              </div>
            </div>

            <div className="space-y-2 pl-4">
              <p className="text-sm font-medium">점검</p>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={hygieneChecks.ccp1} 
                  onCheckedChange={(checked) => setHygieneChecks({...hygieneChecks, ccp1: checked as boolean})}
                />
                <label className="text-sm">중요관리점(CCP) 점검표를 작성 주기에 맞게 작성하고, 한계기준 이탈 시 적절히 개선조치 하였는가?</label>
              </div>
            </div>

            <div className="space-y-2 pl-4">
              <p className="text-sm font-medium">보관</p>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={hygieneChecks.storage2} 
                  onCheckedChange={(checked) => setHygieneChecks({...hygieneChecks, storage2: checked as boolean})}
                />
                <label className="text-sm">사용 후 보관하고 있는 원 · 부재료 등은 교차오염의 우려가 없도록 구분, 이격관리 및 밀봉하여 관리하고 있는가?</label>
              </div>
            </div>
          </div>

          <Separator />

          {/* 일일 (입고시) */}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm bg-gray-100 px-3 py-2 rounded">일일 (입고시)</h4>
            <div className="space-y-2 pl-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={hygieneChecks.inspection1} 
                  onCheckedChange={(checked) => setHygieneChecks({...hygieneChecks, inspection1: checked as boolean})}
                />
                <label className="text-sm">입고 검수·부재료 입고 시 시험성적서를 수령하거나, 육안검사를 실시하고 있는가?</label>
              </div>
            </div>
          </div>

          <Separator />

          {/* 일일 (출하시) */}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm bg-gray-100 px-3 py-2 rounded">일일 (출하시)</h4>
            <div className="space-y-2 pl-4">
              <div className="flex items-center space-x-2 flex-1">
                <label className="text-sm">완제품 운송차량 내부는 청결하고 다른 물품과 구분하여 적재되어 있으며, 차량의 온도는 기준을 준수하고 있는가?</label>
                <Input 
                  type="number" 
                  className="w-24" 
                  placeholder="온도"
                  value={hygieneChecks.transport2}
                  onChange={(e) => setHygieneChecks({...hygieneChecks, transport2: e.target.value})}
                />
                <span className="text-sm">℃</span>
              </div>
            </div>
          </div>

          {/* 특이사항 */}
          <div className="space-y-2">
            <Label>특이사항</Label>
            <Textarea placeholder="특이사항을 입력하세요" rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* 2. 이물관리 점검표 */}
      <Card>
        <CardHeader className="bg-green-50">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Droplet className="h-5 w-5 text-green-600" />
              2. 이물관리 점검표
            </CardTitle>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={allForeignMaterialChecked}
                onCheckedChange={(checked) => handleCheckAllForeignMaterial(checked as boolean)}
              />
              <label className="text-sm font-medium">일괄 체크</label>
            </div>
          </div>
          <CardDescription>검사방법: 육안검사 / 점검주기: 1회/일</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-3">
            <h4 className="font-semibold text-sm bg-gray-100 px-3 py-2 rounded">원료 입고중 이물관리</h4>
            <div className="space-y-2 pl-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={foreignMaterialChecks.material1} 
                  onCheckedChange={(checked) => setForeignMaterialChecks({...foreignMaterialChecks, material1: checked as boolean})}
                />
                <label className="text-sm">원·부재료 입고시 외부의 이물질 제거한 후 입고하는가?</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={foreignMaterialChecks.material2} 
                  onCheckedChange={(checked) => setForeignMaterialChecks({...foreignMaterialChecks, material2: checked as boolean})}
                />
                <label className="text-sm">원·부재료 선별시 적절하게 이루어지고 있는가?</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={foreignMaterialChecks.material3} 
                  onCheckedChange={(checked) => setForeignMaterialChecks({...foreignMaterialChecks, material3: checked as boolean})}
                />
                <label className="text-sm">원·부재료 전처리시 먼지·결절이물이 혼입되지 않게 배기하는가?</label>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-sm bg-gray-100 px-3 py-2 rounded">공정중 혼입관리</h4>
            <div className="space-y-2 pl-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={foreignMaterialChecks.process1} 
                  onCheckedChange={(checked) => setForeignMaterialChecks({...foreignMaterialChecks, process1: checked as boolean})}
                />
                <label className="text-sm">공정중 이용하는 작업도구 중 재질이 낡거나 자재를 사용하지 않는가?</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={foreignMaterialChecks.process2} 
                  onCheckedChange={(checked) => setForeignMaterialChecks({...foreignMaterialChecks, process2: checked as boolean})}
                />
                <label className="text-sm">작업장에 개인소지품들을 소지하지 않았으며 지정된 위생복 및 위생화를 착용하였는가?</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={foreignMaterialChecks.process3} 
                  onCheckedChange={(checked) => setForeignMaterialChecks({...foreignMaterialChecks, process3: checked as boolean})}
                />
                <label className="text-sm">장갑 등 작업상태가 올바르며 파손 부위는 없는가?</label>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-sm bg-gray-100 px-3 py-2 rounded">작업자에 의한 이물혼입 관리</h4>
            <div className="space-y-2 pl-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={foreignMaterialChecks.worker1} 
                  onCheckedChange={(checked) => setForeignMaterialChecks({...foreignMaterialChecks, worker1: checked as boolean})}
                />
                <label className="text-sm">작업도구, 공구, 필기도구 등은 지정된 위치에 보관되어 있는가?</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={foreignMaterialChecks.worker2} 
                  onCheckedChange={(checked) => setForeignMaterialChecks({...foreignMaterialChecks, worker2: checked as boolean})}
                />
                <label className="text-sm">작업에 클립, 핀 칼날등 이물혼입 우려가 있는 불필요한 물품이 없는가?</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={foreignMaterialChecks.worker3} 
                  onCheckedChange={(checked) => setForeignMaterialChecks({...foreignMaterialChecks, worker3: checked as boolean})}
                />
                <label className="text-sm">작업장에 출입하기전 끈끈이 클리너 이용제거 후 입실하는가?</label>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-sm bg-gray-100 px-3 py-2 rounded">제조설비에 의한 이물혼입 관리</h4>
            <div className="space-y-2 pl-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={foreignMaterialChecks.equipment1} 
                  onCheckedChange={(checked) => setForeignMaterialChecks({...foreignMaterialChecks, equipment1: checked as boolean})}
                />
                <label className="text-sm">탈락의 우려가 있는 나사류 및 파손 우려가 있는 설비는 없는가?</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={foreignMaterialChecks.equipment2} 
                  onCheckedChange={(checked) => setForeignMaterialChecks({...foreignMaterialChecks, equipment2: checked as boolean})}
                />
                <label className="text-sm">설비등은 주기적으로 세척스독하여 오염물질이 혼입되지 않게 관리하는가?</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={foreignMaterialChecks.equipment3} 
                  onCheckedChange={(checked) => setForeignMaterialChecks({...foreignMaterialChecks, equipment3: checked as boolean})}
                />
                <label className="text-sm">세척스독 및 정비후 나사, 볼트 등의 누락된 곳은 없는가?</label>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-semibold text-sm bg-gray-100 px-3 py-2 rounded">해충등 혼입관리</h4>
            <div className="space-y-2 pl-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={foreignMaterialChecks.pest1} 
                  onCheckedChange={(checked) => setForeignMaterialChecks({...foreignMaterialChecks, pest1: checked as boolean})}
                />
                <label className="text-sm">작업장 출입문, 외부의 벽 등은 틈이나 구멍이 없이 밀폐되어있는가?</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={foreignMaterialChecks.pest2} 
                  onCheckedChange={(checked) => setForeignMaterialChecks({...foreignMaterialChecks, pest2: checked as boolean})}
                />
                <label className="text-sm">포충등 및 포획장비는 정상작동되며 지정된 위치가 있는가?</label>
              </div>
            </div>
          </div>

          {/* 특이사항 */}
          <div className="space-y-2">
            <Label>특이사항</Label>
            <Textarea placeholder="특이사항을 입력하세요" rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* 3. 원재료실 온/습도 점검기록지 */}
      <Card>
        <CardHeader className="bg-orange-50">
          <CardTitle className="flex items-center gap-2">
            <Thermometer className="h-5 w-5 text-orange-600" />
            3. 원재료실 온/습도 점검기록지
          </CardTitle>
          <CardDescription>관리기준: 온도 1℃~35℃, 습도 65%이하 / 점검주기: 일2회</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-sm">구분</th>
                  <th className="border p-2 text-sm">검사시각</th>
                  <th className="border p-2 text-sm">온도 (℃)</th>
                  <th className="border p-2 text-sm">습도 (%)</th>
                  <th className="border p-2 text-sm">평가</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border p-2 text-sm">원재료실1 오전</td>
                  <td className="border p-2">
                    <Input type="time" value={temperatureHumidity.room1Morning.time} className="text-sm" />
                  </td>
                  <td className="border p-2">
                    <Input type="number" placeholder="온도" className="text-sm" />
                  </td>
                  <td className="border p-2">
                    <Input type="number" placeholder="습도" className="text-sm" />
                  </td>
                  <td className="border p-2 text-center">
                    <Checkbox checked={temperatureHumidity.room1Morning.pass} />
                  </td>
                </tr>
                <tr>
                  <td className="border p-2 text-sm">원재료실1 오후</td>
                  <td className="border p-2">
                    <Input type="time" value={temperatureHumidity.room1Afternoon.time} className="text-sm" />
                  </td>
                  <td className="border p-2">
                    <Input type="number" placeholder="온도" className="text-sm" />
                  </td>
                  <td className="border p-2">
                    <Input type="number" placeholder="습도" className="text-sm" />
                  </td>
                  <td className="border p-2 text-center">
                    <Checkbox checked={temperatureHumidity.room1Afternoon.pass} />
                  </td>
                </tr>
                <tr>
                  <td className="border p-2 text-sm">원재료실2 오전</td>
                  <td className="border p-2">
                    <Input type="time" value={temperatureHumidity.room2Morning.time} className="text-sm" />
                  </td>
                  <td className="border p-2">
                    <Input type="number" placeholder="온도" className="text-sm" />
                  </td>
                  <td className="border p-2">
                    <Input type="number" placeholder="습도" className="text-sm" />
                  </td>
                  <td className="border p-2 text-center">
                    <Checkbox checked={temperatureHumidity.room2Morning.pass} />
                  </td>
                </tr>
                <tr>
                  <td className="border p-2 text-sm">원재료실2 오후</td>
                  <td className="border p-2">
                    <Input type="time" value={temperatureHumidity.room2Afternoon.time} className="text-sm" />
                  </td>
                  <td className="border p-2">
                    <Input type="number" placeholder="온도" className="text-sm" />
                  </td>
                  <td className="border p-2">
                    <Input type="number" placeholder="습도" className="text-sm" />
                  </td>
                  <td className="border p-2 text-center">
                    <Checkbox checked={temperatureHumidity.room2Afternoon.pass} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <Label>이상 발생 내용</Label>
            <Textarea placeholder="이상 발생 내용을 입력하세요" rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* 4. 급속냉동고/냉동고 온도 점검기록지 */}
      <Card>
        <CardHeader className="bg-purple-50">
          <CardTitle className="flex items-center gap-2">
            <Thermometer className="h-5 w-5 text-purple-600" />
            4. 급속냉동고/냉동고 온도 점검기록지
          </CardTitle>
          <CardDescription>관리기준: 급속냉동고 -27℃ 이하, 냉동고 -18℃이하 / 점검주기: 일2회</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-sm">구분</th>
                  <th className="border p-2 text-sm">검사시각</th>
                  <th className="border p-2 text-sm">급속냉동고 (℃)</th>
                  <th className="border p-2 text-sm">냉동고 (℃)</th>
                  <th className="border p-2 text-sm">평가</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border p-2 text-sm">오전</td>
                  <td className="border p-2">
                    <Input type="time" value={freezerTemperature.morning.time} className="text-sm" />
                  </td>
                  <td className="border p-2">
                    <Input type="number" placeholder="온도" className="text-sm" />
                  </td>
                  <td className="border p-2">
                    <Input type="number" placeholder="온도" className="text-sm" />
                  </td>
                  <td className="border p-2 text-center">
                    <Checkbox checked={freezerTemperature.morning.pass} />
                  </td>
                </tr>
                <tr>
                  <td className="border p-2 text-sm">오후</td>
                  <td className="border p-2">
                    <Input type="time" value={freezerTemperature.afternoon.time} className="text-sm" />
                  </td>
                  <td className="border p-2">
                    <Input type="number" placeholder="온도" className="text-sm" />
                  </td>
                  <td className="border p-2">
                    <Input type="number" placeholder="온도" className="text-sm" />
                  </td>
                  <td className="border p-2 text-center">
                    <Checkbox checked={freezerTemperature.afternoon.pass} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <Label>이상 발생 내용</Label>
            <Textarea placeholder="이상 발생 내용을 입력하세요" rows={3} />
          </div>
        </CardContent>
      </Card>

      {/* 5. 원재료 냉장고 온도 점검 기록지 */}
      <Card>
        <CardHeader className="bg-cyan-50">
          <CardTitle className="flex items-center gap-2">
            <Thermometer className="h-5 w-5 text-cyan-600" />
            5. 원재료 냉장고 온도 점검 기록지
          </CardTitle>
          <CardDescription>관리기준: 온도 0℃~10℃ / 점검주기: 일2회</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border p-2 text-sm">구분</th>
                  <th className="border p-2 text-sm">검사 시각</th>
                  <th className="border p-2 text-sm">온도 (℃)</th>
                  <th className="border p-2 text-sm">평가</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border p-2 text-sm">오전</td>
                  <td className="border p-2">
                    <Input type="time" value={refrigeratorTemperature.morning.time} className="text-sm" />
                  </td>
                  <td className="border p-2">
                    <Input type="number" placeholder="온도" className="text-sm" />
                  </td>
                  <td className="border p-2 text-center">
                    <Checkbox checked={refrigeratorTemperature.morning.pass} />
                  </td>
                </tr>
                <tr>
                  <td className="border p-2 text-sm">오후</td>
                  <td className="border p-2">
                    <Input type="time" value={refrigeratorTemperature.afternoon.time} className="text-sm" />
                  </td>
                  <td className="border p-2">
                    <Input type="number" placeholder="온도" className="text-sm" />
                  </td>
                  <td className="border p-2 text-center">
                    <Checkbox checked={refrigeratorTemperature.afternoon.pass} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <Label>이상 발생 내용</Label>
            <Textarea placeholder="이상 발생 내용을 입력하세요" rows={3} />
          </div>
        </CardContent>
      </Card>



      {/* 이전 데이터 로드 안내 */}
      {isLoadingPrev && (
        <div className="text-center text-sm text-blue-600 py-2">이전 작성 데이터를 불러오는 중...</div>
      )}
      {prevDataLoaded && !isLoadingPrev && previousLogs && previousLogs.length > 0 && (
        <div className="text-center text-xs text-gray-500 py-1">이전 작성 데이터가 자동으로 불러와졌습니다. 변경할 부분만 수정하세요.</div>
      )}

      {/* 저장 버튼 */}
      <div className="flex justify-end gap-2 sticky bottom-0 bg-white p-4 border-t">
        <Button variant="outline" onClick={handleSave} disabled={createMutation.isPending}>
          {createMutation.isPending ? "저장 중..." : "임시 저장"}
        </Button>
        <Button onClick={handleSubmit} disabled={createMutation.isPending || submitForReviewMutation.isPending}>
          {submitForReviewMutation.isPending ? "제출 중..." : "제출하기"}
        </Button>
      </div>
    </div>
  );
}
