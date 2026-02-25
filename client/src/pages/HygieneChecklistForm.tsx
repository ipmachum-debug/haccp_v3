import { useState } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const config: ChecklistFormConfig = {
  formType: "hygiene_checklist",
  title: "일반위생관리 체크리스트",
  listPath: "/hygiene/checklists",
  documentTitle: "일반위생관리 점검표",
};

const checkItems = [
  { id: "item1", label: "생산물 내부 옆은 상태는 양호한가?" },
  { id: "item2", label: "작업장 벽, 제조설비(출입구 식별 장치 없는 부분에 대한 청소·소독 상태는 양호한가?" },
  { id: "item3", label: "위생복 세탁은 실시하였는가?" },
  { id: "item4", label: "작업장 바닥 청소 및 소독 상태는 양호한가?" },
  { id: "item5", label: "화장실 청소 및 소독 상태는 양호한가?" },
  { id: "item6", label: "손 세척 및 소독 시설은 정상 작동하는가?" },
  { id: "item7", label: "폐기물 처리는 적절하게 이루어지는가?" },
  { id: "item8", label: "방충·방서 시설은 정상 작동하는가?" },
  { id: "item9", label: "원료 및 제품 보관 상태는 양호한가?" },
  { id: "item10", label: "종업원 개인위생 상태는 양호한가?" },
];

const initialData = {
  checkDate: "",

  item1: undefined as "yes" | "no" | undefined,
  item2: undefined as "yes" | "no" | undefined,
  item3: undefined as "yes" | "no" | undefined,
  item4: undefined as "yes" | "no" | undefined,
  item5: undefined as "yes" | "no" | undefined,
  item6: undefined as "yes" | "no" | undefined,
  item7: undefined as "yes" | "no" | undefined,
  item8: undefined as "yes" | "no" | undefined,
  item9: undefined as "yes" | "no" | undefined,
  item10: undefined as "yes" | "no" | undefined,
  specialNotes: "",
  correctiveAction: "",
  confirmation: "",
};

export default function HygieneChecklistForm() {
  const [formData, setFormData] = useState(initialData);

  const collectFormData = () => {
    return formData;
  };

  const onDataRestore = (data: any) => {
    if (data) {
      setFormData({
        ...initialData,
        ...data,
        checkDate: data.checkDate ? new Date(data.checkDate).toISOString().split('T')[0] : "",
      });
    }
  };

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
    >
      <div className="px-6 pb-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="checkDate">점검 일자 *</Label>
            <Input
              id="checkDate"
              type="date"
              value={formData.checkDate}
              onChange={(e) => setFormData({ ...formData, checkDate: e.target.value })}
              required
            />
          </div>

        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">점검 항목</h3>
          <div className="space-y-4">
            {checkItems.map((item) => (
              <div key={item.id} className="flex items-start gap-4 p-4 border rounded-lg">
                <div className="flex-1">
                  <Label>{item.label}</Label>
                </div>
                <RadioGroup
                  value={formData[item.id as keyof typeof formData] as string || ""}
                  onValueChange={(value) =>
                    setFormData({ ...formData, [item.id]: value as "yes" | "no" })
                  }
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="yes" id={`${item.id}-yes`} />
                    <Label htmlFor={`${item.id}-yes`} className="cursor-pointer">
                      예
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="no" id={`${item.id}-no`} />
                    <Label htmlFor={`${item.id}-no`} className="cursor-pointer">
                      아니오
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="specialNotes">특이사항</Label>
          <Textarea
            id="specialNotes"
            value={formData.specialNotes}
            onChange={(e) => setFormData({ ...formData, specialNotes: e.target.value })}
            placeholder="특이사항을 입력하세요"
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="correctiveAction">개선조치 및 결과</Label>
          <Textarea
            id="correctiveAction"
            value={formData.correctiveAction}
            onChange={(e) => setFormData({ ...formData, correctiveAction: e.target.value })}
            placeholder="개선조치 내용 및 결과를 입력하세요"
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmation">확인</Label>
          <Textarea
            id="confirmation"
            value={formData.confirmation}
            onChange={(e) => setFormData({ ...formData, confirmation: e.target.value })}
            placeholder="확인 사항을 입력하세요"
            rows={2}
          />
        </div>
      </div>
    </ChecklistFormLayout>
  );
}
