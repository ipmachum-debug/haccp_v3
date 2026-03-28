import { useState } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { todayLocal } from "../lib/dateUtils";

const config: ChecklistFormConfig = {
  formType: "water_management_check",
  title: "용수관리 점검표",
  listPath: "/water-management-check",
  documentTitle: "용수관리 점검표",
};

interface CheckItem {
  category: string;
  subCategory: string;
  question: string;
  result: "good" | "bad" | "";
}

interface DeviationItem {
  date: string;
  location: string;
  detail: string;
  action: string;
  actionDate: string;
  actionBy: string;
  confirmedBy: string;
}

const initialCheckItems: CheckItem[] = [
  { category: "용수저장탱크", subCategory: "주변", question: "쓰레기 등 불필요한 물건이 방치되어 있지 않는가?", result: "" },
  { category: "용수저장탱크", subCategory: "주변", question: "청소 상태는 깨끗한가?", result: "" },
  { category: "용수저장탱크", subCategory: "상부", question: "잠금장치는 제대로 설치되어 있는가?", result: "" },
  { category: "용수저장탱크", subCategory: "상부", question: "오염원은 없는가?", result: "" },
  { category: "용수저장탱크", subCategory: "내부", question: "균열 혹은 누수는 없는가?", result: "" },
  { category: "용수저장탱크", subCategory: "내부", question: "침전물은 없는가?", result: "" },
  { category: "용수저장탱크", subCategory: "내부", question: "부유물질은 없는가?", result: "" },
  { category: "공급시설", subCategory: "배관", question: "균열 혹은 누수는 없는가?", result: "" },
  { category: "공급시설", subCategory: "배관", question: "접합부는 제대로 고정되어 있는가?", result: "" },
  { category: "공급시설", subCategory: "배관", question: "침전물 등의 발생은 없는가?", result: "" },
  { category: "공급시설", subCategory: "급수펌프", question: "정상적으로 작동하는가?", result: "" },
  { category: "공급시설", subCategory: "급수펌프", question: "접합부는 제대로 고정되어 있는가?", result: "" },
];

export default function WaterManagementCheckForm() {
  const { toast } = useToast();
  const [checkDate, setCheckDate] = useState(todayLocal());
  const [inspector, setInspector] = useState("");
  const [checkCycle] = useState("1회 / 주");
  const [checkItems, setCheckItems] = useState<CheckItem[]>(initialCheckItems.map(item => ({ ...item })));
  const [deviations, setDeviations] = useState<DeviationItem[]>([]);

  const collectFormData = () => ({
    checkDate,
    inspector,
    checkCycle,
    checkItems,
    deviations,
  });

  const onDataRestore = (fd: any) => {
    if (fd.checkDate) setCheckDate(fd.checkDate);
    if (fd.inspector) setInspector(fd.inspector);
    if (fd.checkItems) setCheckItems(fd.checkItems);
    if (fd.deviations) setDeviations(fd.deviations);
  };

  const toggleResult = (index: number, value: "good" | "bad") => {
    const newItems = [...checkItems];
    newItems[index].result = newItems[index].result === value ? "" : value;
    setCheckItems(newItems);
  };

  const handleAllGood = () => {
    const newItems = checkItems.map(item => ({ ...item, result: "good" as const }));
    setCheckItems(newItems);
    toast({ title: "일괄 적용", description: "전체 항목을 '양호'로 설정했습니다." });
  };

  const addDeviation = () => {
    setDeviations([...deviations, { date: "", location: "", detail: "", action: "", actionDate: "", actionBy: "", confirmedBy: "" }]);
  };

  const updateDeviation = (index: number, field: keyof DeviationItem, value: string) => {
    const newDeviations = [...deviations];
    newDeviations[index][field] = value;
    setDeviations(newDeviations);
  };

  const removeDeviation = (index: number) => {
    setDeviations(deviations.filter((_, i) => i !== index));
  };

  const getCategorySpan = (items: CheckItem[], index: number, field: "category" | "subCategory") => {
    if (index > 0 && items[index][field] === items[index - 1][field] && (field === "subCategory" ? items[index].category === items[index - 1].category : true)) {
      return 0;
    }
    let span = 1;
    for (let i = index + 1; i < items.length; i++) {
      if (items[i][field] === items[index][field] && (field === "subCategory" ? items[i].category === items[index].category : true)) {
        span++;
      } else break;
    }
    return span;
  };

  const extraActions = (
    <Button variant="outline" onClick={handleAllGood}>일괄양호</Button>
  );

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
      extraActions={extraActions}
    >
      <div className="px-6 pb-6">
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>점검일자</Label>
                <Input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)} />
              </div>
              <div>
                <Label>점검자</Label>
                <Input value={inspector} onChange={(e) => setInspector(e.target.value)} placeholder="점검자 이름" />
              </div>
              <div>
                <Label>점검 주기</Label>
                <Input value={checkCycle} readOnly className="bg-gray-50" />
              </div>
              <div>
                <Label>범례</Label>
                <div className="flex items-center gap-4 h-10 text-sm">
                  <span>양호: O</span>
                  <span>불량: X</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">구분</TableHead>
                  <TableHead className="w-[150px]">세부구분</TableHead>
                  <TableHead>점검항목</TableHead>
                  <TableHead className="w-[180px] text-center">점검결과</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checkItems.map((item, index) => {
                  const categorySpan = getCategorySpan(checkItems, index, "category");
                  const subCategorySpan = getCategorySpan(checkItems, index, "subCategory");
                  return (
                    <TableRow key={index}>
                      {categorySpan > 0 && <TableCell rowSpan={categorySpan} className="font-semibold align-top">{item.category}</TableCell>}
                      {subCategorySpan > 0 && <TableCell rowSpan={subCategorySpan} className="align-top">{item.subCategory}</TableCell>}
                      <TableCell>{item.question}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-2">
                          <Button
                            variant={item.result === "good" ? "default" : "outline"}
                            className={`w-16 ${item.result === "good" ? "bg-green-500 hover:bg-green-600" : ""}`}
                            onClick={() => toggleResult(index, "good")}
                          >
                            양호
                          </Button>
                          <Button
                            variant={item.result === "bad" ? "destructive" : "outline"}
                            className="w-16"
                            onClick={() => toggleResult(index, "bad")}
                          >
                            불량
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">부적합 사항 및 조치내역</h3>
              <Button variant="outline" size="sm" onClick={addDeviation}><Plus className="mr-2 h-4 w-4" />추가</Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>발생일자</TableHead>
                  <TableHead>발생장소</TableHead>
                  <TableHead>부적합 내용</TableHead>
                  <TableHead>조치내용</TableHead>
                  <TableHead>조치일자</TableHead>
                  <TableHead>조치자</TableHead>
                  <TableHead>확인자</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deviations.map((dev, index) => (
                  <TableRow key={index}>
                    <TableCell><Input type="date" value={dev.date} onChange={e => updateDeviation(index, "date", e.target.value)} /></TableCell>
                    <TableCell><Input value={dev.location} onChange={e => updateDeviation(index, "location", e.target.value)} /></TableCell>
                    <TableCell><Input value={dev.detail} onChange={e => updateDeviation(index, "detail", e.target.value)} /></TableCell>
                    <TableCell><Input value={dev.action} onChange={e => updateDeviation(index, "action", e.target.value)} /></TableCell>
                    <TableCell><Input type="date" value={dev.actionDate} onChange={e => updateDeviation(index, "actionDate", e.target.value)} /></TableCell>
                    <TableCell><Input value={dev.actionBy} onChange={e => updateDeviation(index, "actionBy", e.target.value)} /></TableCell>
                    <TableCell><Input value={dev.confirmedBy} onChange={e => updateDeviation(index, "confirmedBy", e.target.value)} /></TableCell>
                    <TableCell><Button variant="ghost" size="icon" onClick={() => removeDeviation(index)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ChecklistFormLayout>
  );
}

export { WaterManagementCheckForm };
