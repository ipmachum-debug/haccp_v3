import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, X, Upload } from "lucide-react";

interface TrainingLogModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TrainingLogModal({ open, onClose, onSuccess }: TrainingLogModalProps) {
  const [currentTab, setCurrentTab] = useState("basic");
  
  // 기본 정보
  const [educator, setEducator] = useState("");
  const [location, setLocation] = useState("");
  const [trainingDate, setTrainingDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [category, setCategory] = useState("자체교육");
  const [material, setMaterial] = useState("");
  
  // 교육내용
  const [topic1, setTopic1] = useState("");
  const [topic2, setTopic2] = useState("");
  const [topic3, setTopic3] = useState("");
  const [topic4, setTopic4] = useState("");
  const [contentSummary, setContentSummary] = useState("");
  const [contentResult, setContentResult] = useState("");
  
  // 증빙 및 참석자
  const [evidencePhotos, setEvidencePhotos] = useState<string[]>([]);
  const [attendees, setAttendees] = useState<{ name: string; signature: string }[]>([]);
  
  // 평가 및 개선조치
  const [concentration, setConcentration] = useState("상");
  const [understanding, setUnderstanding] = useState("상");
  const [application, setApplication] = useState("상");
  const [improvementAction, setImprovementAction] = useState("");

  const handleSave = async () => {
    try {
      const response = await fetch("/api/trainingLog/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          
          educator,
          location,
          trainingDate,
          startTime,
          endTime,
          targetAudience,
          category,
          material,
          topic1,
          topic2,
          topic3,
          topic4,
          contentSummary,
          contentResult,
          evidencePhotos,
          attendees,
          concentration,
          understanding,
          application,
          improvementAction,
          creator: educator,
        }),
      });

      if (response.ok) {
        alert("교육훈련일지가 저장되었습니다.");
        onSuccess();
        onClose();
      }
    } catch (error) {
      console.error(error);
      alert("저장 중 오류가 발생했습니다.");
    }
  };

  const addAttendee = () => {
    setAttendees([...attendees, { name: "", signature: "" }]);
  };

  const removeAttendee = (index: number) => {
    setAttendees(attendees.filter((_, i) => i !== index));
  };

  const updateAttendee = (index: number, field: "name" | "signature", value: string) => {
    const updated = [...attendees];
    updated[index][field] = value;
    setAttendees(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>교육훈련일지 작성</DialogTitle>
        </DialogHeader>

        <Tabs value={currentTab} onValueChange={setCurrentTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">기본 정보</TabsTrigger>
            <TabsTrigger value="content">교육내용</TabsTrigger>
            <TabsTrigger value="evidence">증빙 및 참석자</TabsTrigger>
            <TabsTrigger value="evaluation">평가 및 개선조치</TabsTrigger>
          </TabsList>

          {/* 기본 정보 탭 */}
          <TabsContent value="basic" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>교육자</Label>
                <Input value={educator} onChange={(e) => setEducator(e.target.value)} />
              </div>
              <div>
                <Label>장소</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>일시</Label>
                <Input type="date" value={trainingDate} onChange={(e) => setTrainingDate(e.target.value)} />
              </div>
              <div>
                <Label>시작 시간</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <Label>종료 시간</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>대상</Label>
                <Input value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="예: 전직원" />
              </div>
              <div>
                <Label>구분</Label>
                <Input value={category} onChange={(e) => setCategory(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>교재</Label>
              <Input value={material} onChange={(e) => setMaterial(e.target.value)} />
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setCurrentTab("content")}>다음</Button>
            </div>
          </TabsContent>

          {/* 교육내용 탭 */}
          <TabsContent value="content" className="space-y-4">
            <div className="bg-blue-50 p-4 rounded-lg space-y-3">
              <Label className="text-blue-900 font-semibold">요약 섹션 (4개 주제)</Label>
              
              <div>
                <Label>주제 1</Label>
                <Textarea
                  value={topic1}
                  onChange={(e) => setTopic1(e.target.value)}
                  placeholder="예: 과거 동파 발생 사례 공유"
                  rows={3}
                />
              </div>

              <div>
                <Label>주제 2</Label>
                <Textarea
                  value={topic2}
                  onChange={(e) => setTopic2(e.target.value)}
                  placeholder="예: 동파 원인 분석 교육"
                  rows={3}
                />
              </div>

              <div>
                <Label>주제 3</Label>
                <Textarea
                  value={topic3}
                  onChange={(e) => setTopic3(e.target.value)}
                  placeholder="예: 동파 예방 관리 기준 재교육"
                  rows={3}
                />
              </div>

              <div>
                <Label>주제 4</Label>
                <Textarea
                  value={topic4}
                  onChange={(e) => setTopic4(e.target.value)}
                  placeholder="예: 동파 발생 시 대응 절차 교육"
                  rows={3}
                />
              </div>
            </div>

            <div>
              <Label>교육내용 요약</Label>
              <Textarea
                value={contentSummary}
                onChange={(e) => setContentSummary(e.target.value)}
                rows={4}
              />
            </div>

            <div>
              <Label>교육결과</Label>
              <Textarea
                value={contentResult}
                onChange={(e) => setContentResult(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setCurrentTab("basic")}>이전</Button>
              <Button onClick={() => setCurrentTab("evidence")}>다음</Button>
            </div>
          </TabsContent>

          {/* 증빙 및 참석자 탭 */}
          <TabsContent value="evidence" className="space-y-4">
            <div>
              <Label>증빙 사진</Label>
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-2 text-sm text-gray-600">사진을 업로드하세요</p>
                <Input type="file" accept="image/*" multiple className="mt-4" />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>참석자 명단</Label>
                <Button size="sm" onClick={addAttendee}>
                  <Plus className="h-4 w-4 mr-1" /> 참석자 추가
                </Button>
              </div>

              <div className="space-y-2">
                {attendees.map((attendee, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <Input
                      placeholder="이름"
                      value={attendee.name}
                      onChange={(e) => updateAttendee(index, "name", e.target.value)}
                    />
                    <Input
                      placeholder="서명 (이미지 URL)"
                      value={attendee.signature}
                      onChange={(e) => updateAttendee(index, "signature", e.target.value)}
                    />
                    <Button size="sm" variant="destructive" onClick={() => removeAttendee(index)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setCurrentTab("content")}>이전</Button>
              <Button onClick={() => setCurrentTab("evaluation")}>다음</Button>
            </div>
          </TabsContent>

          {/* 평가 및 개선조치 탭 */}
          <TabsContent value="evaluation" className="space-y-4">
            <div className="bg-green-50 p-4 rounded-lg space-y-4">
              <Label className="text-green-900 font-semibold">교육 후 결과</Label>

              <div>
                <Label>종사자들의 집중도</Label>
                <RadioGroup value={concentration} onValueChange={setConcentration}>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="상" id="conc-high" />
                      <Label htmlFor="conc-high">상</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="중" id="conc-mid" />
                      <Label htmlFor="conc-mid">중</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="하" id="conc-low" />
                      <Label htmlFor="conc-low">하</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              <div>
                <Label>종사자들의 이해도</Label>
                <RadioGroup value={understanding} onValueChange={setUnderstanding}>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="상" id="under-high" />
                      <Label htmlFor="under-high">상</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="중" id="under-mid" />
                      <Label htmlFor="under-mid">중</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="하" id="under-low" />
                      <Label htmlFor="under-low">하</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              <div>
                <Label>종사자의 교육내용 반영도</Label>
                <RadioGroup value={application} onValueChange={setApplication}>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="상" id="app-high" />
                      <Label htmlFor="app-high">상</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="중" id="app-mid" />
                      <Label htmlFor="app-mid">중</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="하" id="app-low" />
                      <Label htmlFor="app-low">하</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <div>
              <Label>개선조치</Label>
              <Textarea
                value={improvementAction}
                onChange={(e) => setImprovementAction(e.target.value)}
                rows={4}
                placeholder="개선조치 사항을 입력하세요"
              />
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setCurrentTab("evidence")}>이전</Button>
              <Button onClick={handleSave}>저장</Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
