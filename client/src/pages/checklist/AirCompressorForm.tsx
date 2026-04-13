import { useState } from "react";
import ChecklistFormLayout from "@/components/checklist/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/checklist/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const config: ChecklistFormConfig = {
  formType: "air_compressor_filter",
  title: "압축공기 필터, 에어컨 필터 관리대장",
  listPath: "/air-compressor",
  documentTitle: "압축공기 필터, 에어컨 필터 관리대장 {year}년",
};

interface FilterItem {
  no: number;
  usage: string;
  productName: string;
  spec: string;
  installDate: string;
  replaceCycle: string;
  monthlyChecks: { [month: string]: { fit: boolean; unfit: boolean } };
}

const months = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

function createEmptyItem(no: number): FilterItem {
  const monthlyChecks: { [month: string]: { fit: boolean; unfit: boolean } } = {};
  months.forEach((m) => {
    monthlyChecks[m] = { fit: false, unfit: false };
  });
  return {
    no,
    usage: "",
    productName: "",
    spec: "",
    installDate: "",
    replaceCycle: "",
    monthlyChecks,
  };
}

const initialItems: FilterItem[] = [
    { ...createEmptyItem(1), usage: "청소용", productName: "15A-3200 (PRE FILTER)", spec: "20A", installDate: "2021.07", replaceCycle: "2회/1년" },
    { ...createEmptyItem(2), usage: "청소용", productName: "15A-3100 (LINE FILTER)", spec: "20A", installDate: "2021.07", replaceCycle: "2회/1년" },
    { ...createEmptyItem(3), usage: "청소용", productName: "15A-1300 (COALESCENT FILTER)", spec: "20A", installDate: "2021.07", replaceCycle: "2회/1년" },
    { ...createEmptyItem(4), usage: "청소용", productName: "Foodmax Air 68", spec: "-", installDate: "2021.08", replaceCycle: "2회/1년" },
    { ...createEmptyItem(5), usage: "청소용", productName: "CPV-Q1108DXO 프리필터", spec: "-", installDate: "2021.07", replaceCycle: "2주 1번 물세척 (반영구적)" },
];

export default function AirCompressorForm() {
  const { toast } = useToast();
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [department, setDepartment] = useState("");
  const [oilFilterDate, setOilFilterDate] = useState("");
  const [writeFrequency, setWriteFrequency] = useState("1회/월 (압축공기 뚜껑, 식용윤활유) / 2회/월 (에어컨 프리필터)");
  const [items, setItems] = useState<FilterItem[]>(initialItems);
  const [notes, setNotes] = useState("");
  const [improvement, setImprovement] = useState("");

  const collectFormData = () => ({
    year, department, oilFilterDate, writeFrequency, items, notes, improvement
  });

  const onDataRestore = (fd: any) => {
    if (fd.year) setYear(fd.year);
    if (fd.department) setDepartment(fd.department);
    if (fd.oilFilterDate) setOilFilterDate(fd.oilFilterDate);
    if (fd.writeFrequency) setWriteFrequency(fd.writeFrequency);
    if (fd.items) setItems(fd.items);
    if (fd.notes) setNotes(fd.notes);
    if (fd.improvement) setImprovement(fd.improvement);
  };

  const updateItem = (index: number, field: keyof FilterItem, value: any) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    setItems(newItems);
  };

  const toggleCheck = (itemIndex: number, month: string, type: "fit" | "unfit") => {
    const newItems = [...items];
    const current = newItems[itemIndex].monthlyChecks[month];
    if (type === "fit") {
      current.fit = !current.fit;
      if (current.fit) current.unfit = false;
    } else {
      current.unfit = !current.unfit;
      if (current.unfit) current.fit = false;
    }
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, createEmptyItem(items.length + 1)]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    const newItems = items.filter((_, i) => i !== index).map((item, i) => ({ ...item, no: i + 1 }));
    setItems(newItems);
  };

  const handleBatchFit = () => {
    const currentMonth = new Date().getMonth();
    const monthKey = months[currentMonth];
    const newItems = items.map((item) => {
      const newChecks = { ...item.monthlyChecks };
      newChecks[monthKey] = { fit: true, unfit: false };
      return { ...item, monthlyChecks: newChecks };
    });
    setItems(newItems);
    toast({ title: "일괄 적용 완료", description: `${monthKey} 전체 항목을 '적합'으로 설정했습니다.` });
  };

  const extraActions = (
    <>
      <Button variant="outline" onClick={handleBatchFit}>일괄적합</Button>
      <Button variant="outline" size="icon"><Settings className="h-4 w-4" /></Button>
    </>
  );

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
      extraActions={extraActions}
      documentTitle={`압축공기 필터, 에어컨 필터 관리대장 ${year}년`}
    >
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label>연도</Label>
            <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
          </div>
          <div>
            <Label>담당부서</Label>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="담당부서 입력" />
          </div>
          <div>
            <Label>윤활유*필터 교체일자</Label>
            <Input value={oilFilterDate} onChange={(e) => setOilFilterDate(e.target.value)} placeholder="교체일자 입력" />
          </div>
          <div>
            <Label>작성주기</Label>
            <Input value={writeFrequency} onChange={(e) => setWriteFrequency(e.target.value)} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table className="min-w-full border-collapse border border-gray-300">
            <TableHeader>
              <TableRow>
                <TableHead className="border border-gray-300 text-center" rowSpan={2}>No</TableHead>
                <TableHead className="border border-gray-300 text-center" rowSpan={2}>사용처</TableHead>
                <TableHead className="border border-gray-300 text-center" rowSpan={2}>품명</TableHead>
                <TableHead className="border border-gray-300 text-center" rowSpan={2}>규격</TableHead>
                <TableHead className="border border-gray-300 text-center" rowSpan={2}>설치일자</TableHead>
                <TableHead className="border border-gray-300 text-center" rowSpan={2}>교체주기</TableHead>
                <TableHead className="border border-gray-300 text-center" colSpan={12}>월별 점검</TableHead>
                <TableHead className="border border-gray-300 text-center" rowSpan={2}>비고</TableHead>
                <TableHead className="border border-gray-300 text-center" rowSpan={2}>개선사항</TableHead>
                <TableHead className="border border-gray-300 text-center print:hidden" rowSpan={2}>삭제</TableHead>
              </TableRow>
              <TableRow>
                {months.map((month) => (
                  <TableHead key={month} className="border border-gray-300 text-center">{month}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, itemIndex) => (
                <TableRow key={item.no}>
                  <TableCell className="border border-gray-300 text-center">{item.no}</TableCell>
                  <TableCell className="border border-gray-300"><Input className="w-24" value={item.usage} onChange={(e) => updateItem(itemIndex, 'usage', e.target.value)} /></TableCell>
                  <TableCell className="border border-gray-300"><Input className="w-48" value={item.productName} onChange={(e) => updateItem(itemIndex, 'productName', e.target.value)} /></TableCell>
                  <TableCell className="border border-gray-300"><Input className="w-24" value={item.spec} onChange={(e) => updateItem(itemIndex, 'spec', e.target.value)} /></TableCell>
                  <TableCell className="border border-gray-300"><Input className="w-28" value={item.installDate} onChange={(e) => updateItem(itemIndex, 'installDate', e.target.value)} /></TableCell>
                  <TableCell className="border border-gray-300"><Input className="w-40" value={item.replaceCycle} onChange={(e) => updateItem(itemIndex, 'replaceCycle', e.target.value)} /></TableCell>
                  {months.map((month) => (
                    <TableCell key={month} className="border border-gray-300 text-center">
                      <div className="flex flex-col items-center">
                        <div className="flex items-center"><Label className="mr-1 text-xs">적합</Label><Checkbox checked={item.monthlyChecks[month].fit} onCheckedChange={() => toggleCheck(itemIndex, month, 'fit')} /></div>
                        <div className="flex items-center"><Label className="mr-1 text-xs">부적합</Label><Checkbox checked={item.monthlyChecks[month].unfit} onCheckedChange={() => toggleCheck(itemIndex, month, 'unfit')} /></div>
                      </div>
                    </TableCell>
                  ))}
                  <TableCell className="border border-gray-300"><Textarea className="w-32" value={notes} onChange={(e) => setNotes(e.target.value)} /></TableCell>
                  <TableCell className="border border-gray-300"><Textarea className="w-32" value={improvement} onChange={(e) => setImprovement(e.target.value)} /></TableCell>
                  <TableCell className="border border-gray-300 text-center print:hidden">
                    <Button variant="ghost" size="icon" onClick={() => removeItem(itemIndex)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex justify-end print:hidden">
            <Button onClick={addItem}><Plus className="mr-2 h-4 w-4" /> 행 추가</Button>
        </div>
      </div>
    </ChecklistFormLayout>
  );
}
