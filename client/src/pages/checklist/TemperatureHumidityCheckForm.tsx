import { useState, useCallback } from "react";
import ChecklistFormLayout from "@/components/checklist/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/checklist/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { todayLocal } from "../../lib/dateUtils";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Settings,
  Plus,
  Trash2,
  Edit,
  CheckCircle2,
} from "lucide-react";

const config: ChecklistFormConfig = {
  formType: "temperature_humidity_check",
  title: "온·습도 점검표",
  listPath: "/temperature-humidity-check",
  documentTitle: "온·습도 점검표",
};

interface SpaceRow {
  id: string;
  area: string;
  location: string;
  tempStandard: string;
  tempResult: string;
  judgment: "적합" | "부적합" | "";
}

const initialRows: SpaceRow[] = [
  { id: "1", area: "위생실", location: "중앙", tempStandard: "18 ~ 26°C", tempResult: "", judgment: "" },
  { id: "2", area: "냉장실", location: "중앙", tempStandard: "-2 ~ 5°C", tempResult: "", judgment: "" },
  { id: "3", area: "냉동실", location: "중앙", tempStandard: "-18°C 이하", tempResult: "", judgment: "" },
  { id: "4", area: "가공실", location: "중앙", tempStandard: "15°C 이하", tempResult: "", judgment: "" },
  { id: "5", area: "포장실", location: "중앙", tempStandard: "18 ~ 26°C", tempResult: "", judgment: "" },
  { id: "6", area: "포장실", location: "검수구역", tempStandard: "18 ~ 26°C", tempResult: "", judgment: "" },
  { id: "7", area: "승강기", location: "중앙", tempStandard: "18 ~ 26°C", tempResult: "", judgment: "" },
  { id: "8", area: "부자재창고", location: "중앙", tempStandard: "18 ~ 26°C", tempResult: "", judgment: "" },
  { id: "9", area: "화장실", location: "중앙", tempStandard: "18 ~ 26°C", tempResult: "", judgment: "" },
  { id: "10", area: "탈의실(남)", location: "중앙", tempStandard: "18 ~ 26°C", tempResult: "", judgment: "" },
  { id: "11", area: "탈의실(여)", location: "중앙", tempStandard: "18 ~ 26°C", tempResult: "", judgment: "" },
];

export default function TemperatureHumidityCheckForm() {
  const [checkDate, setCheckDate] = useState(todayLocal());
  const [spaceRows, setSpaceRows] = useState<SpaceRow[]>(initialRows.map(s => ({ ...s })));

  // 설정 모달
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newArea, setNewArea] = useState("");
  const [newLocation, setNewLocation] = useState("중앙");
  const [newTempStandard, setNewTempStandard] = useState("18 ~ 26°C");
  const [editingRow, setEditingRow] = useState<SpaceRow | null>(null);

  const collectFormData = () => ({
    checkDate,
    spaceRows,
  });

  const onDataRestore = (fd: any) => {
    if (fd.checkDate) setCheckDate(fd.checkDate);
    if (fd.spaceRows) setSpaceRows(fd.spaceRows);
  };

  const handleTempChange = useCallback((index: number, value: string) => {
    setSpaceRows(prev => {
      const newRows = [...prev];
      newRows[index] = { ...newRows[index], tempResult: value };
      return newRows;
    });
  }, []);

  const handleJudgmentToggle = useCallback((index: number) => {
    setSpaceRows(prev => {
      const newRows = [...prev];
      const current = newRows[index].judgment;
      let next: "적합" | "부적합" | "" = "";
      if (current === "") next = "적합";
      else if (current === "적합") next = "부적합";
      else next = "";
      newRows[index] = { ...newRows[index], judgment: next };
      return newRows;
    });
  }, []);

  const addSpaceRow = useCallback(() => {
    if (!newArea.trim()) return;
    const newId = `custom_${Date.now()}`;
    setSpaceRows(prev => [...prev, {
      id: newId,
      area: newArea,
      location: newLocation,
      tempStandard: newTempStandard,
      tempResult: "",
      judgment: "",
    }]);
    setNewArea("");
    setNewLocation("중앙");
    setNewTempStandard("18 ~ 26°C");
  }, [newArea, newLocation, newTempStandard]);

  const removeSpaceRow = useCallback((id: string) => {
    setSpaceRows(prev => prev.filter(r => r.id !== id));
  }, []);

  const updateSpaceRow = useCallback(() => {
    if (!editingRow) return;
    setSpaceRows(prev => prev.map(r => r.id === editingRow.id ? editingRow : r));
    setEditingRow(null);
  }, [editingRow]);

  const setAllPass = useCallback(() => {
    setSpaceRows(prev => prev.map(row => ({ ...row, judgment: "적합" as const })));
  }, []);

  const autoJudge = useCallback(() => {
    setSpaceRows(prev => prev.map(row => {
      if (!row.tempResult) return row;
      const temp = parseFloat(row.tempResult);
      if (isNaN(temp)) return row;

      let pass = false;
      const std = row.tempStandard;
      const rangeMatch = std.match(/([-\d.]+)\s*~\s*([-\d.]+)/);
      const belowMatch = std.match(/([-\d.]+)°?C?\s*이하/);
      
      if (rangeMatch) {
        const min = parseFloat(rangeMatch[1]);
        const max = parseFloat(rangeMatch[2]);
        pass = temp >= min && temp <= max;
      } else if (belowMatch) {
        const max = parseFloat(belowMatch[1]);
        pass = temp <= max;
      }

      return { ...row, judgment: pass ? "적합" as const : "부적합" as const };
    }));
  }, []);

  const extraActions = (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={setAllPass}>
        <CheckCircle2 className="h-4 w-4 mr-1" />
        일괄 적합
      </Button>
      <Button variant="outline" size="sm" onClick={autoJudge}>
        자동 판정
      </Button>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-1" />
            설정
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>점검 공간 관리</DialogTitle>
            <DialogDescription>회사에 맞게 점검 공간을 추가, 수정, 삭제할 수 있습니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">현재 점검 공간</Label>
              {spaceRows.map((row) => (
                <div key={row.id} className="flex items-center gap-2 p-2 border rounded-lg">
                  {editingRow?.id === row.id ? (
                    <>
                      <Input value={editingRow.area} onChange={(e) => setEditingRow({ ...editingRow, area: e.target.value })}
                        className="flex-1 h-8 text-sm" placeholder="구분" />
                      <Input value={editingRow.location} onChange={(e) => setEditingRow({ ...editingRow, location: e.target.value })}
                        className="w-20 h-8 text-sm" placeholder="위치" />
                      <Input value={editingRow.tempStandard} onChange={(e) => setEditingRow({ ...editingRow, tempStandard: e.target.value })}
                        className="w-28 h-8 text-sm" placeholder="온도기준" />
                      <Button size="sm" variant="default" onClick={updateSpaceRow} className="h-8 px-2">
                        <CheckCircle2 className="h-3 w-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">{row.area} - {row.location} ({row.tempStandard})</span>
                      <Button size="sm" variant="ghost" onClick={() => setEditingRow({ ...row })} className="h-7 px-1">
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeSpaceRow(row.id)} className="h-7 px-1 text-red-500">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t pt-3 space-y-2">
              <Label className="text-sm font-semibold">새 공간 추가</Label>
              <div className="flex gap-2">
                <Input value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="구분 (예: 원료창고)" className="flex-1 h-8 text-sm" />
                <Input value={newLocation} onChange={(e) => setNewLocation(e.target.value)} placeholder="위치" className="w-20 h-8 text-sm" />
                <Input value={newTempStandard} onChange={(e) => setNewTempStandard(e.target.value)} placeholder="온도기준" className="w-28 h-8 text-sm" />
                <Button size="sm" onClick={addSpaceRow} className="h-8">
                  <Plus className="h-3 w-3 mr-1" />
                  추가
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
      extraActions={extraActions}
      writerField="writer"
    >
      <div className="px-6 pb-6">
        <div className="py-2">
            <Table className="w-full border-collapse">
              <TableBody>
                <TableRow>
                  <TableCell className="border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-semibold w-24 text-center">작성일</TableCell>
                  <TableCell className="border border-gray-300 px-3 py-2 w-1/3">
                    <Input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)}
                      className="h-8 border-none shadow-none p-0 text-sm" />
                  </TableCell>
                  <TableCell className="border border-gray-300 bg-gray-50 px-3 py-2 text-sm font-semibold w-24 text-center">작성자</TableCell>
                  <TableCell className="border border-gray-300 px-3 py-2">
                    {/* WriterSelect is handled by ChecklistFormLayout */}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div className="py-2 pb-6">
            <Table className="w-full border-collapse text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="border border-gray-300 bg-gray-50 px-3 py-2 text-center font-semibold w-[18%]">구분</TableHead>
                  <TableHead className="border border-gray-300 bg-gray-50 px-3 py-2 text-center font-semibold w-[14%]">위 치</TableHead>
                  <TableHead className="border border-gray-300 bg-gray-50 px-3 py-2 text-center font-semibold w-[20%]">온도기준(°C)</TableHead>
                  <TableHead className="border border-gray-300 bg-gray-50 px-3 py-2 text-center font-semibold w-[20%]">점검결과</TableHead>
                  <TableHead className="border border-gray-300 bg-gray-50 px-3 py-2 text-center font-semibold w-[28%]">판정(적/부)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {spaceRows.map((row, index) => (
                  <TableRow key={row.id} className="hover:bg-gray-50/50">
                    <TableCell className="border border-gray-300 px-3 py-2 text-center font-medium">{row.area}</TableCell>
                    <TableCell className="border border-gray-300 px-3 py-2 text-center">{row.location}</TableCell>
                    <TableCell className="border border-gray-300 px-3 py-2 text-center">{row.tempStandard}</TableCell>
                    <TableCell className="border border-gray-300 px-1 py-1 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Input
                          value={row.tempResult}
                          onChange={(e) => handleTempChange(index, e.target.value)}
                          placeholder=""
                          className="h-7 w-16 border-none shadow-none p-0 text-sm text-center"
                          type="number"
                          step="0.1"
                        />
                        <span className="text-xs text-gray-500">°C</span>
                      </div>
                    </TableCell>
                    <TableCell
                      className="border border-gray-300 px-3 py-2 text-center cursor-pointer hover:bg-blue-50 transition-colors select-none"
                      onClick={() => handleJudgmentToggle(index)}
                      title="클릭하여 적합/부적합 전환"
                    >
                      {row.judgment === "적합" ? (
                        <span className="inline-flex items-center gap-1 text-blue-600">
                           <CheckCircle2 className="w-4 h-4" /> 적합
                        </span>
                      ) : row.judgment === "부적합" ? (
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <CheckCircle2 className="w-4 h-4" /> 부적합
                        </span>
                      ) : (
                        <span className="text-gray-400">선택</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
      </div>
    </ChecklistFormLayout>
  );
}
