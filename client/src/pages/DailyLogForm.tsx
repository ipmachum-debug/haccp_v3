import { useLocation } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Save, Send, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function DailyLogForm() {
  const [, setLocation] = useLocation();

  const { toast } = useToast();
  const [logDate, setLogDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState("hygiene");

  // 일반위생관리 체크리스트 데이터
  const [hygieneChecks, setHygieneChecks] = useState([
    { category: "작업전", subcategory: "개인위생", itemOrder: 1, itemText: "위생복장과 이물 복장이 구분하여 보관되고 있는가?", checkResult: undefined },
    { category: "작업전", subcategory: "개인위생", itemOrder: 2, itemText: "종사자의 건강상태가 양호하고 개인 청소가 등을 소지하지 않으며, 청결한 위생복장을 착용하고 있는가?", checkResult: undefined },
    { category: "작업전", subcategory: "개인위생", itemOrder: 3, itemText: "위생설비(손 세척기 등) 중 이상이 있는 것이 없으며, 종사자는 위생처리를 하고 입실하는가?", checkResult: undefined },
    { category: "작업중", subcategory: "방충방서", itemOrder: 4, itemText: "방충 방서작업장은 밀폐가 잘 이루어지고 있으며, 방충시설(방충망 파손 등)에는 이상이 없는가?", checkResult: undefined },
    { category: "작업중", subcategory: "설비", itemOrder: 5, itemText: "파손되거나 고장 난 제조설비가 없는가?", checkResult: undefined },
    { category: "입고시", subcategory: "온송", itemOrder: 6, itemText: "입고 보관냉장/냉동창고의 온도는 적절히 관리되고 있는가? (냉장창고 : 0~10℃, 냉동창고 : -18℃이하)", checkResult: undefined, temperatureValue: undefined },
    { category: "출하시", subcategory: "온송", itemOrder: 7, itemText: "완제품을 운송하는 중 온도기준은 준수하였는가?(지육온도기록지 별도관리)", checkResult: undefined },
    { category: "작업중", subcategory: "공정관리", itemOrder: 8, itemText: "청결구역상태와 일반구역상태이 분리되어 있으며 오염되지 않도록 관리되고 있는가?", checkResult: undefined },
    { category: "작업중", subcategory: "공정관리", itemOrder: 9, itemText: "가열후 식힘 공정이 적절히 관리되고 있는가?", checkResult: undefined },
    { category: "작업중", subcategory: "공정관리", itemOrder: 10, itemText: "완제품의 포장 상태는 양호한가?", checkResult: undefined },
    { category: "작업중", subcategory: "공정관리", itemOrder: 11, itemText: "모니터링방법(탐정온도계 등)는 사용전후 세척·소독을 실시하고 있는가?", checkResult: undefined },
    { category: "작업후", subcategory: "방충방서", itemOrder: 12, itemText: "작업장 주변의 음식물 폐기물은 잘 정리되어 보관되어있지고 있고, 주기적으로 반출되고 있는가?", checkResult: undefined },
    { category: "작업후", subcategory: "청소소독", itemOrder: 13, itemText: "작업장 바닥, 배수로, 위생시설, 제조설비(식품과 직접 닿는 부분)의 청소·소독 상태는 양호한가?", checkResult: undefined },
    { category: "작업후", subcategory: "설비", itemOrder: 14, itemText: "파손되거나 고장 난 제조설비가 없는가?", checkResult: undefined },
    { category: "작업후", subcategory: "점검", itemOrder: 15, itemText: "중요관리점(CCP) 점검표를 작성 주기에 맞게 작성하고, 한계기준 이탈 시 적절히 개선조치 하였는가?", checkResult: undefined },
    { category: "작업후", subcategory: "보관", itemOrder: 16, itemText: "사용 후 보관하고 있는 원 · 부재료 등은 교차오염의 우려가 없도록 구분, 이격관리 및 밀봉하여 관리하고 있는가?", checkResult: undefined },
    { category: "입고시", subcategory: "입고검사", itemOrder: 17, itemText: "입고 검수일 · 부재료 입고 시 시험성적서를 수령하거나, 육안검사를 실시하고 있는가?", checkResult: undefined },
    { category: "출하시", subcategory: "온송", itemOrder: 18, itemText: "완제품 운송차량 내부는 청결하고 다른 물품과 구분하여 적재되어 있으며, 차량의 온도는 기준을 준수하고 있는가?", checkResult: undefined },
  ]);

  const [hygieneNotes, setHygieneNotes] = useState({
    specialNotes: "",
    improvementAction: "",
    actionBy: "",
    confirmedBy: ""
  });

  // 이물관리 체크리스트 데이터
  const [foreignMaterialChecks, setForeignMaterialChecks] = useState([
    { category: "원료 입고종 이물관리", itemOrder: 1, itemText: "원·부재료 입고시 외부의 이물을 제거한 후 입고하는가?", checkResult: undefined },
    { category: "원료 입고종 이물관리", itemOrder: 2, itemText: "원·부재료 선별시 적절하게 이루어지고 있는가?", checkResult: undefined },
    { category: "공정중 혼입관리", itemOrder: 3, itemText: "원·부재료 전처리시 입복·점검이후의 혼입되지 않게 배치하는가?", checkResult: undefined },
    { category: "공정중 혼입관리", itemOrder: 4, itemText: "공정중 이물하는 작업도구 중 재질이 벗겨진 자재를 사용하지 않는가?", checkResult: undefined },
    { category: "공정중 혼입관리", itemOrder: 5, itemText: "작업장에 개인소지품들을 소지하지 않았으며 지정된 위생복 및 위생화를 착용하였는가?", checkResult: undefined },
    { category: "작업장에 의한 이물혼입 관리", itemOrder: 6, itemText: "천장 등 작업상태가 올바르면 파손 부위는 없는가?", checkResult: undefined },
    { category: "작업장에 의한 이물혼입 관리", itemOrder: 7, itemText: "작업도구, 공구, 필기도구 등은 지정된 위치에 보관되어 있는가?", checkResult: undefined },
    { category: "작업장에 의한 이물혼입 관리", itemOrder: 8, itemText: "작업에 클립, 핀 칼날등 이물혼입의 우려가 있는 불필요한 물품이 없는가?", checkResult: undefined },
    { category: "작업장에 의한 이물혼입 관리", itemOrder: 9, itemText: "작업장에 출입하기전 곤충이 물리는 것이 없는가?", checkResult: undefined },
    { category: "제조설비에 의한 이물혼입 관리", itemOrder: 10, itemText: "탈락의 우려가 있는 나사류 및 파손 우려가 있는 설비는 없는가?", checkResult: undefined },
    { category: "제조설비에 의한 이물혼입 관리", itemOrder: 11, itemText: "설비등은 주기적으로 세척소독하여 오염물질의 혼입되지 않게 관리하는가?", checkResult: undefined },
    { category: "제조설비에 의한 이물혼입 관리", itemOrder: 12, itemText: "세척소독 및 정비후 나사, 볼트 등의 누락된 곳은 없는가?", checkResult: undefined },
    { category: "해충등 혼입관리", itemOrder: 13, itemText: "작업장 종업원, 방문자 벽 등의 틈이 없는가?", checkResult: undefined },
    { category: "해충등 혼입관리", itemOrder: 14, itemText: "포충등 및 포획장비는 정상작동되며 지정된 위치가 있는가?", checkResult: undefined },
  ]);

  const [foreignMaterialNotes, setForeignMaterialNotes] = useState({
    specialNotes: "",
    improvementAction: "",
    actionBy: "",
    confirmedBy: ""
  });

  // 원재료실 온/습도 데이터
  const [temperatureHumidity, setTemperatureHumidity] = useState([
    { roomName: "원재료실1", timePeriod: "오전" as const, checkTime: "", temperature: undefined, humidity: undefined, evaluation: undefined },
    { roomName: "원재료실1", timePeriod: "오후" as const, checkTime: "", temperature: undefined, humidity: undefined, evaluation: undefined },
    { roomName: "원재료실2", timePeriod: "오전" as const, checkTime: "", temperature: undefined, humidity: undefined, evaluation: undefined },
    { roomName: "원재료실2", timePeriod: "오후" as const, checkTime: "", temperature: undefined, humidity: undefined, evaluation: undefined },
  ]);

  const [temperatureHumidityIssues, setTemperatureHumidityIssues] = useState({
    issueDescription: "",
    actionTaken: "",
    completionDate: "",
    actionBy: "",
    confirmedBy: ""
  });

  // 냉동고 온도 데이터
  const [freezerTemperature, setFreezerTemperature] = useState([
    { timePeriod: "오전" as const, checkTime: "", rapidFreezerTemp: undefined, freezerTemp: undefined, evaluation: undefined },
    { timePeriod: "오후" as const, checkTime: "", rapidFreezerTemp: undefined, freezerTemp: undefined, evaluation: undefined },
  ]);

  const [freezerIssues, setFreezerIssues] = useState({
    issueDescription: "",
    actionTaken: "",
    completionDate: "",
    actionBy: "",
    confirmedBy: ""
  });

  // 냉장고 온도 데이터
  const [refrigeratorTemperature, setRefrigeratorTemperature] = useState([
    { timePeriod: "오전" as const, checkTime: "", temperature: undefined, evaluation: undefined },
    { timePeriod: "오후" as const, checkTime: "", temperature: undefined, evaluation: undefined },
  ]);

  const [refrigeratorIssues, setRefrigeratorIssues] = useState({
    issueDatetime: "",
    issueDescription: "",
    actionTaken: "",
    completionDate: "",
    actionBy: "",
    confirmedBy: ""
  });

  // 일일일지 생성 mutation
  const createMutation = trpc.dailyLog.create.useMutation({
    onSuccess: () => {
      toast({
        title: "저장 완료",
        description: "일일일지가 저장되었습니다.",
      });
    },
    onError: (error) => {
      toast({
        title: "저장 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 일일일지 제출 mutation
  const submitMutation = trpc.dailyLog.submit.useMutation({
    onSuccess: () => {
      toast({
        title: "제출 완료",
        description: "일일일지가 제출되었습니다.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "제출 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 저장 핸들러
  const handleSave = () => {
    createMutation.mutate({
      logDate,
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
  };

  // 제출 핸들러
  const handleSubmit = () => {
    // 먼저 저장
    createMutation.mutate(
      {
        logDate,
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
      },
      {
        onSuccess: (data) => {
          // 저장 성공 후 제출
          if (data.dailyLogId) {
            submitMutation.mutate({ dailyLogId: data.dailyLogId });
          }
        },
      }
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">일일일지 작성</h1>
          <p className="text-muted-foreground mt-1">
            매일 작성하는 5개 일지를 한 화면에서 작성하세요
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <Input
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="w-40"
            />
          </div>
          <Button variant="outline" onClick={handleSave} disabled={createMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            저장
          </Button>
          <Button onClick={handleSubmit} disabled={submitMutation.isPending}>
            <Send className="h-4 w-4 mr-2" />
            제출
          </Button>
        </div>
      </div>

      {/* 5개 일지 탭 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="hygiene">일반위생관리</TabsTrigger>
          <TabsTrigger value="foreign">이물관리</TabsTrigger>
          <TabsTrigger value="temperature">원재료실 온습도</TabsTrigger>
          <TabsTrigger value="freezer">냉동고 온도</TabsTrigger>
          <TabsTrigger value="refrigerator">냉장고 온도</TabsTrigger>
        </TabsList>

        {/* 1. 일반위생관리 및 공정점검표 */}
        <TabsContent value="hygiene" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>일반위생관리 및 공정점검표</CardTitle>
              <CardDescription>매일 작성</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border p-2">구분</th>
                      <th className="border p-2 w-2/3">점검 내용</th>
                      <th className="border p-2">예</th>
                      <th className="border p-2">아니오</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hygieneChecks.map((check, index) => (
                      <tr key={index}>
                        <td className="border p-2 text-sm">{check.category}</td>
                        <td className="border p-2 text-sm">{check.itemText}</td>
                        <td className="border p-2 text-center">
                          <input
                            type="radio"
                            name={`hygiene-${index}`}
                            checked={check.checkResult === 'yes'}
                            onChange={() => {
                              const newChecks = [...hygieneChecks];
                              newChecks[index].checkResult = 'yes';
                              setHygieneChecks(newChecks);
                            }}
                          />
                        </td>
                        <td className="border p-2 text-center">
                          <input
                            type="radio"
                            name={`hygiene-${index}`}
                            checked={check.checkResult === 'no'}
                            onChange={() => {
                              const newChecks = [...hygieneChecks];
                              newChecks[index].checkResult = 'no';
                              setHygieneChecks(newChecks);
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 특이사항 */}
              <div className="space-y-3 pt-4">
                <h3 className="font-semibold">특이사항 및 조치</h3>
                <div className="grid gap-3">
                  <div>
                    <Label>특이사항</Label>
                    <Textarea
                      value={hygieneNotes.specialNotes}
                      onChange={(e) => setHygieneNotes({ ...hygieneNotes, specialNotes: e.target.value })}
                      placeholder="특이사항을 입력하세요"
                    />
                  </div>
                  <div>
                    <Label>개선조치 및 결과</Label>
                    <Textarea
                      value={hygieneNotes.improvementAction}
                      onChange={(e) => setHygieneNotes({ ...hygieneNotes, improvementAction: e.target.value })}
                      placeholder="개선조치 및 결과를 입력하세요"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>조치자</Label>
                      <Input
                        value={hygieneNotes.actionBy}
                        onChange={(e) => setHygieneNotes({ ...hygieneNotes, actionBy: e.target.value })}
                        placeholder="조치자"
                      />
                    </div>
                    <div>
                      <Label>확인</Label>
                      <Input
                        value={hygieneNotes.confirmedBy}
                        onChange={(e) => setHygieneNotes({ ...hygieneNotes, confirmedBy: e.target.value })}
                        placeholder="확인자"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. 이물관리 점검표 */}
        <TabsContent value="foreign" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>이물관리 점검표</CardTitle>
              <CardDescription>육안 검사</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border p-2">구분</th>
                      <th className="border p-2 w-2/3">점검 내용</th>
                      <th className="border p-2">적합</th>
                      <th className="border p-2">부적합</th>
                    </tr>
                  </thead>
                  <tbody>
                    {foreignMaterialChecks.map((check, index) => (
                      <tr key={index}>
                        <td className="border p-2 text-sm">{check.category}</td>
                        <td className="border p-2 text-sm">{check.itemText}</td>
                        <td className="border p-2 text-center">
                          <input
                            type="radio"
                            name={`foreign-${index}`}
                            checked={check.checkResult === '적합'}
                            onChange={() => {
                              const newChecks = [...foreignMaterialChecks];
                              newChecks[index].checkResult = '적합';
                              setForeignMaterialChecks(newChecks);
                            }}
                          />
                        </td>
                        <td className="border p-2 text-center">
                          <input
                            type="radio"
                            name={`foreign-${index}`}
                            checked={check.checkResult === '부적합'}
                            onChange={() => {
                              const newChecks = [...foreignMaterialChecks];
                              newChecks[index].checkResult = '부적합';
                              setForeignMaterialChecks(newChecks);
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 특이사항 */}
              <div className="space-y-3 pt-4">
                <h3 className="font-semibold">특이사항 및 조치</h3>
                <div className="grid gap-3">
                  <div>
                    <Label>특이사항</Label>
                    <Textarea
                      value={foreignMaterialNotes.specialNotes}
                      onChange={(e) => setForeignMaterialNotes({ ...foreignMaterialNotes, specialNotes: e.target.value })}
                      placeholder="특이사항을 입력하세요"
                    />
                  </div>
                  <div>
                    <Label>개선조치 및 결과</Label>
                    <Textarea
                      value={foreignMaterialNotes.improvementAction}
                      onChange={(e) => setForeignMaterialNotes({ ...foreignMaterialNotes, improvementAction: e.target.value })}
                      placeholder="개선조치 및 결과를 입력하세요"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>조치</Label>
                      <Input
                        value={foreignMaterialNotes.actionBy}
                        onChange={(e) => setForeignMaterialNotes({ ...foreignMaterialNotes, actionBy: e.target.value })}
                        placeholder="조치자"
                      />
                    </div>
                    <div>
                      <Label>확인</Label>
                      <Input
                        value={foreignMaterialNotes.confirmedBy}
                        onChange={(e) => setForeignMaterialNotes({ ...foreignMaterialNotes, confirmedBy: e.target.value })}
                        placeholder="확인자"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. 원재료실 온/습도 */}
        <TabsContent value="temperature" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>원재료실 온/습도 점검기록지</CardTitle>
              <CardDescription>온도: 1°C~35°C, 습도: 65%이하</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border p-2">검사시각</th>
                      <th className="border p-2">온도 (°C)</th>
                      <th className="border p-2">습도 (%)</th>
                      <th className="border p-2">평가</th>
                    </tr>
                  </thead>
                  <tbody>
                    {temperatureHumidity.map((temp, index) => (
                      <tr key={index}>
                        <td className="border p-2">
                          <div className="text-sm font-medium">{temp.roomName} - {temp.timePeriod}</div>
                          <Input
                            type="time"
                            value={temp.checkTime}
                            onChange={(e) => {
                              const newTemp = [...temperatureHumidity];
                              newTemp[index].checkTime = e.target.value;
                              setTemperatureHumidity(newTemp);
                            }}
                            className="mt-1"
                          />
                        </td>
                        <td className="border p-2">
                          <Input
                            type="number"
                            step="0.1"
                            value={temp.temperature || ''}
                            onChange={(e) => {
                              const newTemp = [...temperatureHumidity];
                              newTemp[index].temperature = parseFloat(e.target.value);
                              setTemperatureHumidity(newTemp);
                            }}
                            placeholder="온도"
                          />
                        </td>
                        <td className="border p-2">
                          <Input
                            type="number"
                            step="0.1"
                            value={temp.humidity || ''}
                            onChange={(e) => {
                              const newTemp = [...temperatureHumidity];
                              newTemp[index].humidity = parseFloat(e.target.value);
                              setTemperatureHumidity(newTemp);
                            }}
                            placeholder="습도"
                          />
                        </td>
                        <td className="border p-2">
                          <RadioGroup
                            value={temp.evaluation}
                            onValueChange={(value) => {
                              const newTemp = [...temperatureHumidity];
                              newTemp[index].evaluation = value as '적합' | '부적합';
                              setTemperatureHumidity(newTemp);
                            }}
                          >
                            <div className="flex gap-4">
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="적합" id={`temp-pass-${index}`} />
                                <Label htmlFor={`temp-pass-${index}`}>적합</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="부적합" id={`temp-fail-${index}`} />
                                <Label htmlFor={`temp-fail-${index}`}>부적합</Label>
                              </div>
                            </div>
                          </RadioGroup>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 이상 발생 내용 */}
              <div className="space-y-3 pt-4">
                <h3 className="font-semibold">이상 발생 내용</h3>
                <div className="grid gap-3">
                  <div>
                    <Label>발생내용</Label>
                    <Textarea
                      value={temperatureHumidityIssues.issueDescription}
                      onChange={(e) => setTemperatureHumidityIssues({ ...temperatureHumidityIssues, issueDescription: e.target.value })}
                      placeholder="발생내용을 입력하세요"
                    />
                  </div>
                  <div>
                    <Label>조치내용 및 결과</Label>
                    <Textarea
                      value={temperatureHumidityIssues.actionTaken}
                      onChange={(e) => setTemperatureHumidityIssues({ ...temperatureHumidityIssues, actionTaken: e.target.value })}
                      placeholder="조치내용 및 결과를 입력하세요"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>완료일자</Label>
                      <Input
                        type="date"
                        value={temperatureHumidityIssues.completionDate}
                        onChange={(e) => setTemperatureHumidityIssues({ ...temperatureHumidityIssues, completionDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>조치자</Label>
                      <Input
                        value={temperatureHumidityIssues.actionBy}
                        onChange={(e) => setTemperatureHumidityIssues({ ...temperatureHumidityIssues, actionBy: e.target.value })}
                        placeholder="조치자"
                      />
                    </div>
                    <div>
                      <Label>확인자</Label>
                      <Input
                        value={temperatureHumidityIssues.confirmedBy}
                        onChange={(e) => setTemperatureHumidityIssues({ ...temperatureHumidityIssues, confirmedBy: e.target.value })}
                        placeholder="확인자"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. 냉동고 온도 */}
        <TabsContent value="freezer" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>급속냉동고 / 냉동고 온도 점검기록지</CardTitle>
              <CardDescription>급속냉동고: -27°C 이하, 냉동고: -18°C이하</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border p-2">검사시각</th>
                      <th className="border p-2">급속냉동고 (°C)</th>
                      <th className="border p-2">냉동고 (°C)</th>
                      <th className="border p-2">평가</th>
                    </tr>
                  </thead>
                  <tbody>
                    {freezerTemperature.map((temp, index) => (
                      <tr key={index}>
                        <td className="border p-2">
                          <div className="text-sm font-medium">{temp.timePeriod}</div>
                          <Input
                            type="time"
                            value={temp.checkTime}
                            onChange={(e) => {
                              const newTemp = [...freezerTemperature];
                              newTemp[index].checkTime = e.target.value;
                              setFreezerTemperature(newTemp);
                            }}
                            className="mt-1"
                          />
                        </td>
                        <td className="border p-2">
                          <Input
                            type="number"
                            step="0.1"
                            value={temp.rapidFreezerTemp || ''}
                            onChange={(e) => {
                              const newTemp = [...freezerTemperature];
                              newTemp[index].rapidFreezerTemp = parseFloat(e.target.value);
                              setFreezerTemperature(newTemp);
                            }}
                            placeholder="급속냉동고 온도"
                          />
                        </td>
                        <td className="border p-2">
                          <Input
                            type="number"
                            step="0.1"
                            value={temp.freezerTemp || ''}
                            onChange={(e) => {
                              const newTemp = [...freezerTemperature];
                              newTemp[index].freezerTemp = parseFloat(e.target.value);
                              setFreezerTemperature(newTemp);
                            }}
                            placeholder="냉동고 온도"
                          />
                        </td>
                        <td className="border p-2">
                          <RadioGroup
                            value={temp.evaluation}
                            onValueChange={(value) => {
                              const newTemp = [...freezerTemperature];
                              newTemp[index].evaluation = value as '적합' | '부적합';
                              setFreezerTemperature(newTemp);
                            }}
                          >
                            <div className="flex gap-4">
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="적합" id={`freezer-pass-${index}`} />
                                <Label htmlFor={`freezer-pass-${index}`}>적합</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="부적합" id={`freezer-fail-${index}`} />
                                <Label htmlFor={`freezer-fail-${index}`}>부적합</Label>
                              </div>
                            </div>
                          </RadioGroup>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 이상 발생 내용 */}
              <div className="space-y-3 pt-4">
                <h3 className="font-semibold">이상 발생 내용</h3>
                <div className="grid gap-3">
                  <div>
                    <Label>발생내용</Label>
                    <Textarea
                      value={freezerIssues.issueDescription}
                      onChange={(e) => setFreezerIssues({ ...freezerIssues, issueDescription: e.target.value })}
                      placeholder="발생내용을 입력하세요"
                    />
                  </div>
                  <div>
                    <Label>조치내용 및 결과</Label>
                    <Textarea
                      value={freezerIssues.actionTaken}
                      onChange={(e) => setFreezerIssues({ ...freezerIssues, actionTaken: e.target.value })}
                      placeholder="조치내용 및 결과를 입력하세요"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>완료일자</Label>
                      <Input
                        type="date"
                        value={freezerIssues.completionDate}
                        onChange={(e) => setFreezerIssues({ ...freezerIssues, completionDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>조치자</Label>
                      <Input
                        value={freezerIssues.actionBy}
                        onChange={(e) => setFreezerIssues({ ...freezerIssues, actionBy: e.target.value })}
                        placeholder="조치자"
                      />
                    </div>
                    <div>
                      <Label>확인자</Label>
                      <Input
                        value={freezerIssues.confirmedBy}
                        onChange={(e) => setFreezerIssues({ ...freezerIssues, confirmedBy: e.target.value })}
                        placeholder="확인자"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 5. 냉장고 온도 */}
        <TabsContent value="refrigerator" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>원재료 냉장고 온도 점검 기록지</CardTitle>
              <CardDescription>온도: 0°C~10°C</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border">
                  <thead>
                    <tr className="bg-muted">
                      <th className="border p-2">검사시각</th>
                      <th className="border p-2">온도 (°C)</th>
                      <th className="border p-2">평가</th>
                    </tr>
                  </thead>
                  <tbody>
                    {refrigeratorTemperature.map((temp, index) => (
                      <tr key={index}>
                        <td className="border p-2">
                          <div className="text-sm font-medium">{temp.timePeriod}</div>
                          <Input
                            type="time"
                            value={temp.checkTime}
                            onChange={(e) => {
                              const newTemp = [...refrigeratorTemperature];
                              newTemp[index].checkTime = e.target.value;
                              setRefrigeratorTemperature(newTemp);
                            }}
                            className="mt-1"
                          />
                        </td>
                        <td className="border p-2">
                          <Input
                            type="number"
                            step="0.1"
                            value={temp.temperature || ''}
                            onChange={(e) => {
                              const newTemp = [...refrigeratorTemperature];
                              newTemp[index].temperature = parseFloat(e.target.value);
                              setRefrigeratorTemperature(newTemp);
                            }}
                            placeholder="온도"
                          />
                        </td>
                        <td className="border p-2">
                          <RadioGroup
                            value={temp.evaluation}
                            onValueChange={(value) => {
                              const newTemp = [...refrigeratorTemperature];
                              newTemp[index].evaluation = value as '적합' | '부적합';
                              setRefrigeratorTemperature(newTemp);
                            }}
                          >
                            <div className="flex gap-4">
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="적합" id={`ref-pass-${index}`} />
                                <Label htmlFor={`ref-pass-${index}`}>적합</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="부적합" id={`ref-fail-${index}`} />
                                <Label htmlFor={`ref-fail-${index}`}>부적합</Label>
                              </div>
                            </div>
                          </RadioGroup>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 이상 발생 내용 */}
              <div className="space-y-3 pt-4">
                <h3 className="font-semibold">이상 발생 내용</h3>
                <div className="grid gap-3">
                  <div>
                    <Label>일시</Label>
                    <Input
                      type="datetime-local"
                      value={refrigeratorIssues.issueDatetime}
                      onChange={(e) => setRefrigeratorIssues({ ...refrigeratorIssues, issueDatetime: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>발생내용</Label>
                    <Textarea
                      value={refrigeratorIssues.issueDescription}
                      onChange={(e) => setRefrigeratorIssues({ ...refrigeratorIssues, issueDescription: e.target.value })}
                      placeholder="발생내용을 입력하세요"
                    />
                  </div>
                  <div>
                    <Label>조치내용 및 결과</Label>
                    <Textarea
                      value={refrigeratorIssues.actionTaken}
                      onChange={(e) => setRefrigeratorIssues({ ...refrigeratorIssues, actionTaken: e.target.value })}
                      placeholder="조치내용 및 결과를 입력하세요"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>완료일자</Label>
                      <Input
                        type="date"
                        value={refrigeratorIssues.completionDate}
                        onChange={(e) => setRefrigeratorIssues({ ...refrigeratorIssues, completionDate: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>조치자</Label>
                      <Input
                        value={refrigeratorIssues.actionBy}
                        onChange={(e) => setRefrigeratorIssues({ ...refrigeratorIssues, actionBy: e.target.value })}
                        placeholder="조치자"
                      />
                    </div>
                    <div>
                      <Label>확인자</Label>
                      <Input
                        value={refrigeratorIssues.confirmedBy}
                        onChange={(e) => setRefrigeratorIssues({ ...refrigeratorIssues, confirmedBy: e.target.value })}
                        placeholder="확인자"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
