
import { useState, useCallback } from "react";
import ChecklistFormLayout from "@/components/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { todayLocal } from "../lib/dateUtils";

import {
  Plus,
  Trash2,
  Upload,
  FileText,
  X,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const config: ChecklistFormConfig = {
  formType: "self_quality_inspection",
  title: "자가품질검사 등록",
  listPath: "/quality/self-inspection",
  documentTitle: "자가품질검사서",
};

interface InspectionItem {
  id: string;
  name: string;
  standard: string;
  result: string;
  pass: boolean | null;
}

const initialInspectionItems: InspectionItem[] = [
  { id: "1", name: "", standard: "", result: "", pass: null },
];

export default function SelfQualityInspectionForm() {
  const [foodCode, setFoodCode] = useState("");
  const [foodName, setFoodName] = useState("");
  const [inspectionDate, setInspectionDate] = useState(
    todayLocal()
  );
  const [expiryDate, setExpiryDate] = useState("");
  const [inspector, setInspector] = useState("이선영");
  const [note, setNote] = useState("");
  const [inspectionItems, setInspectionItems] = useState<InspectionItem[]>(
    initialInspectionItems
  );
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const collectFormData = () => ({
    foodCode,
    foodName,
    inspectionDate,
    expiryDate,
    inspector,
    note,
    inspectionItems,
    files: files.map(f => f.name), // 실제 파일 객체 대신 파일 이름만 저장하거나, 파일 업로드 로직을 별도로 처리해야 합니다.
  });

  const onDataRestore = (fd: any) => {
    if (fd.foodCode) setFoodCode(fd.foodCode);
    if (fd.foodName) setFoodName(fd.foodName);
    if (fd.inspectionDate) setInspectionDate(fd.inspectionDate);
    if (fd.expiryDate) setExpiryDate(fd.expiryDate);
    if (fd.inspector) setInspector(fd.inspector);
    if (fd.note) setNote(fd.note);
    if (fd.inspectionItems) setInspectionItems(fd.inspectionItems);
    // `files`는 복원 로직이 필요하다면 별도 구현이 필요합니다.
  };

  const addInspectionItem = () => {
    setInspectionItems((prev) => [
      ...prev,
      { id: Date.now().toString(), name: "", standard: "", result: "", pass: null },
    ]);
  };

  const removeInspectionItem = (id: string) => {
    if (inspectionItems.length > 1) {
      setInspectionItems((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const updateInspectionItem = (
    id: string,
    field: keyof InspectionItem,
    value: any
  ) => {
    setInspectionItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };
  
  const autoCheckPass = (id: string) => {
    const item = inspectionItems.find((i) => i.id === id);
    if (item && item.standard && item.result) {
      const pass = item.standard.toLowerCase() === item.result.toLowerCase();
      updateInspectionItem(id, "pass", pass);
    }
  };

  const loadTemplate = (templateName: string) => {
    if (templateName === "bacteria") {
      setInspectionItems([
        { id: "1", name: "대장균", standard: "음성", result: "", pass: null },
        { id: "2", name: "세균수", standard: "100 이하", result: "", pass: null },
        { id: "3", name: "대장균군", standard: "음성", result: "", pass: null },
      ]);
    } else if (templateName === "chemical") {
      setInspectionItems([
        { id: "1", name: "pH", standard: "6.0~8.0", result: "", pass: null },
        { id: "2", name: "산도", standard: "0.3 이하", result: "", pass: null },
        { id: "3", name: "과산화물가", standard: "10 이하", result: "", pass: null },
      ]);
    }
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...droppedFiles]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...selectedFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
    >
      <div className="space-y-6 px-6 pb-6">
        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle>검사 정보</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="food-code">품목코드</Label>
                <Input id="food-code" placeholder="예: F-001" value={foodCode} onChange={(e) => setFoodCode(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="food-name">품명</Label>
                <Input id="food-name" placeholder="예: 신선 샐러드" value={foodName} onChange={(e) => setFoodName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inspection-date">검사일자</Label>
                <Input id="inspection-date" type="date" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiry-date">유통기한</Label>
                <Input id="expiry-date" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="inspector">검사자</Label>
                <Input id="inspector" value={inspector} onChange={(e) => setInspector(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>검사 항목</CardTitle>
            <div className="flex items-center gap-2">
                <Select onValueChange={loadTemplate}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="템플릿 불러오기" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bacteria">세균 검사</SelectItem>
                    <SelectItem value="chemical">이화학 검사</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={addInspectionItem} className="gap-1">
                  <Plus className="h-4 w-4" /> 항목 추가
                </Button>
              </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {inspectionItems.map((item, index) => (
              <div key={item.id} className="p-4 bg-gray-50/50 rounded-lg border">
                <div className="flex justify-between items-center mb-4">
                  <p className="font-semibold">항목 {index + 1}</p>
                  <Button variant="ghost" size="icon" onClick={() => removeInspectionItem(item.id)} className="h-7 w-7">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>검사항목</Label>
                    <Input value={item.name} onChange={(e) => updateInspectionItem(item.id, "name", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>검사기준</Label>
                    <Input value={item.standard} onChange={(e) => updateInspectionItem(item.id, "standard", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>검사결과</Label>
                    <Input value={item.result} onChange={(e) => updateInspectionItem(item.id, "result", e.target.value)} onBlur={() => autoCheckPass(item.id)} />
                  </div>
                  <div>
                    <Label>적합 여부</Label>
                    <div className="flex items-center gap-2 mt-2">
                      <Button variant={item.pass === true ? "default" : "outline"} size="sm" className="flex-1" onClick={() => updateInspectionItem(item.id, "pass", true)}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> 적합
                      </Button>
                      <Button variant={item.pass === false ? "destructive" : "outline"} size="sm" className="flex-1" onClick={() => updateInspectionItem(item.id, "pass", false)}>
                        <XCircle className="h-4 w-4 mr-1" /> 부적합
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" /> 시험성적서 첨부
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${
                isDragging
                  ? "border-green-500 bg-green-50"
                  : "border-gray-300 hover:border-green-400 hover:bg-gray-50"
              }`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-lg font-medium mb-2">파일을 드래그 앤 드롭하거나 클릭하여 업로드</p>
              <p className="text-sm text-muted-foreground mb-4">JPG, JPEG, PNG, PDF 형식 지원 (최대 10MB)</p>
              <input type="file" id="file-upload" className="hidden" multiple accept=".jpg,.jpeg,.png,.pdf" onChange={handleFileSelect} />
              <label htmlFor="file-upload">
                <Button variant="outline" className="gap-2" asChild>
                  <span><FileText className="h-4 w-4" /> 파일 선택</span>
                </Button>
              </label>
            </div>
            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">첨부된 파일 ({files.length})</p>
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-gray-500" />
                      <div>
                        <p className="text-sm font-medium">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(2)} KB</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeFile(index)} className="h-8 w-8 p-0 hover:bg-red-100 hover:text-red-600">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle>비고</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea placeholder="추가 메모나 특이사항을 입력하세요..." value={note} onChange={(e) => setNote(e.target.value)} rows={4} />
          </CardContent>
        </Card>
      </div>
    </ChecklistFormLayout>
  );
}

export { SelfQualityInspectionForm };
