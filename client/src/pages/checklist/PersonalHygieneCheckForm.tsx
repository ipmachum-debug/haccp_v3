import { useState, useCallback, ReactNode } from "react";
import ChecklistFormLayout from "@/components/checklist/ChecklistFormLayout";
import type { ChecklistFormConfig } from "@/components/checklist/ChecklistFormLayout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Settings, Plus, Trash2, Edit, CheckCircle2 } from "lucide-react";

import { todayLocal } from "../../lib/dateUtils";

// 점검 항목 타입 정의
interface CheckColumn {
  id: string;
  label: string;
  subLabel?: string;
}

// 종사자 행 데이터 타입
interface EmployeeRow {
  name: string;
  checks: Record<string, "적합" | "부적합" | "">;
}

const config: ChecklistFormConfig = {
  formType: "personal_hygiene_check",
  title: "개인 위생관리 점검표",
  listPath: "/personal-hygiene-check",
  documentTitle: "개인 위생관리 점검표",
};

// 기본 점검 항목
const DEFAULT_CHECK_COLUMNS: CheckColumn[] = [
  { id: "health", label: "건강상태", subLabel: "및 상처 유무" },
  { id: "uniform", label: "위생복,위생모,", subLabel: "위생화 청결상태" },
  { id: "belongings", label: "개인 소지품", subLabel: "소지 유무" },
  { id: "workerHygiene", label: "작업자 위생상태" },
  { id: "hygieneRoom", label: "위생전실", subLabel: "절차 준수" },
  { id: "handWash", label: "손세척, 소독", subLabel: "준수 여부" },
];

// 초기 종사자 행 데이터 (10행)
const initialEmployeeRows: EmployeeRow[] = Array.from({ length: 10 }, () => ({ name: "", checks: {} }));

export default function PersonalHygieneCheckForm() {
  // 폼 고유 state
  const [checkDate, setCheckDate] = useState(todayLocal());
  const [inspector, setInspector] = useState("");
  const [checkColumns, setCheckColumns] = useState<CheckColumn[]>(DEFAULT_CHECK_COLUMNS);
  const [employeeRows, setEmployeeRows] = useState<EmployeeRow[]>(initialEmployeeRows);
  const [specialNotes, setSpecialNotes] = useState("");
  const [improvementAction, setImprovementAction] = useState("");
  const [actionBy, setActionBy] = useState("");
  const [confirmedBy, setConfirmedBy] = useState("");

  // 설정 모달 state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState<CheckColumn | null>(null);
  const [newColumnLabel, setNewColumnLabel] = useState("");
  const [newColumnSubLabel, setNewColumnSubLabel] = useState("");

  // 폼 데이터 수집 (저장 시 호출됨)
  const collectFormData = () => ({
    checkDate,
    inspector,
    checkColumns, // 커스텀 항목 저장을 위해 포함
    employeeRows: employeeRows.filter(row => row.name.trim() !== ""), // 이름이 있는 행만 저장
    specialNotes,
    improvementAction,
    actionBy,
    confirmedBy,
  });

  // 기존 데이터 복원 (편집/보기 모드)
  const onDataRestore = (data: any) => {
    if (data.checkDate) setCheckDate(data.checkDate);
    if (data.inspector) setInspector(data.inspector);
    if (data.checkColumns) setCheckColumns(data.checkColumns);
    if (data.employeeRows) {
      const restoredRows = data.employeeRows;
      // 최소 10행을 유지하도록 빈 행 추가
      while (restoredRows.length < 10) {
        restoredRows.push({ name: "", checks: {} });
      }
      setEmployeeRows(restoredRows);
    }
    if (data.specialNotes) setSpecialNotes(data.specialNotes);
    if (data.improvementAction) setImprovementAction(data.improvementAction);
    if (data.actionBy) setActionBy(data.actionBy);
    if (data.confirmedBy) setConfirmedBy(data.confirmedBy);
  };

  // 종사자 이름 변경
  const handleNameChange = useCallback((index: number, name: string) => {
    setEmployeeRows(prev => {
      const newRows = [...prev];
      newRows[index] = { ...newRows[index], name };
      return newRows;
    });
  }, []);

  // 체크 값 토글 (클릭으로 적합/부적합/공백 전환)
  const handleCheckToggle = useCallback((rowIndex: number, columnId: string) => {
    setEmployeeRows(prev => {
      const newRows = [...prev];
      const currentValue = newRows[rowIndex].checks[columnId] || "";
      let nextValue: "적합" | "부적합" | "" = "";
      if (currentValue === "") nextValue = "적합";
      else if (currentValue === "적합") nextValue = "부적합";
      else nextValue = "";
      newRows[rowIndex] = {
        ...newRows[rowIndex],
        checks: { ...newRows[rowIndex].checks, [columnId]: nextValue },
      };
      return newRows;
    });
  }, []);

  // 종사자 행 추가
  const addEmployeeRow = useCallback(() => {
    setEmployeeRows(prev => [...prev, { name: "", checks: {} }]);
  }, []);

  // 종사자 행 삭제
  const removeEmployeeRow = useCallback((index: number) => {
    setEmployeeRows(prev => prev.filter((_, i) => i !== index));
  }, []);

  // 점검 항목 추가
  const addCheckColumn = useCallback(() => {
    if (!newColumnLabel.trim()) return;
    const newId = `custom_${Date.now()}`;
    setCheckColumns(prev => [...prev, { id: newId, label: newColumnLabel, subLabel: newColumnSubLabel || undefined }]);
    setNewColumnLabel("");
    setNewColumnSubLabel("");
  }, [newColumnLabel, newColumnSubLabel]);

  // 점검 항목 삭제
  const removeCheckColumn = useCallback((id: string) => {
    setCheckColumns(prev => prev.filter(col => col.id !== id));
  }, []);

  // 점검 항목 수정
  const updateCheckColumn = useCallback(() => {
    if (!editingColumn) return;
    setCheckColumns(prev =>
      prev.map(col =>
        col.id === editingColumn.id
          ? { ...col, label: editingColumn.label, subLabel: editingColumn.subLabel }
          : col
      )
    );
    setEditingColumn(null);
  }, [editingColumn]);

  // 전체 행 일괄 적합 처리
  const setAllPass = useCallback(() => {
    setEmployeeRows(prev =>
      prev.map(row => {
        if (!row.name.trim()) return row; // 이름 없는 행은 스킵
        const checks: Record<string, "적합" | "부적합" | ""> = {};
        checkColumns.forEach(col => {
          checks[col.id] = "적합";
        });
        return { ...row, checks };
      })
    );
  }, [checkColumns]);

  const extraActions: ReactNode = (
    <>
      <Button variant="outline" size="sm" onClick={setAllPass} title="모든 종사자를 일괄 적합 처리">
        <CheckCircle2 className="h-4 w-4 mr-1" />
        일괄 적합
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
            <DialogTitle>점검 항목 관리</DialogTitle>
            <DialogDescription>
              회사에 맞게 점검 항목을 추가, 수정, 삭제할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">현재 점검 항목</Label>
              {checkColumns.map((col) => (
                <div key={col.id} className="flex items-center gap-2 p-2 border rounded-lg">
                  {editingColumn?.id === col.id ? (
                    <>
                      <Input
                        value={editingColumn.label}
                        onChange={(e) => setEditingColumn({ ...editingColumn, label: e.target.value })}
                        className="flex-1 h-8 text-sm"
                      />
                      <Input
                        value={editingColumn.subLabel || ""}
                        onChange={(e) => setEditingColumn({ ...editingColumn, subLabel: e.target.value })}
                        placeholder="부제목"
                        className="flex-1 h-8 text-sm"
                      />
                      <Button size="sm" variant="default" onClick={updateCheckColumn} className="h-8 px-2">
                        <CheckCircle2 className="h-3 w-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">
                        {col.label}
                        {col.subLabel && <span className="text-xs text-muted-foreground ml-1">({col.subLabel})</span>}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => setEditingColumn({ ...col })} className="h-7 px-1">
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeCheckColumn(col.id)} className="h-7 px-1 text-red-500 hover:text-red-700">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t pt-4 space-y-2">
              <Label className="text-sm font-semibold">새 항목 추가</Label>
              <div className="flex gap-2">
                <Input
                  value={newColumnLabel}
                  onChange={(e) => setNewColumnLabel(e.target.value)}
                  placeholder="항목명"
                  className="flex-1 h-8 text-sm"
                />
                <Input
                  value={newColumnSubLabel}
                  onChange={(e) => setNewColumnSubLabel(e.target.value)}
                  placeholder="부제목 (선택)"
                  className="flex-1 h-8 text-sm"
                />
                <Button size="sm" onClick={addCheckColumn} className="h-8">
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
    </>
  );

  return (
    <ChecklistFormLayout
      config={config}
      collectFormData={collectFormData}
      onDataRestore={onDataRestore}
      extraActions={extraActions}
    >
      <div className="px-6 pb-6">
        {/* 헤더 정보 (점검일자, 점검자) */}
        <div className="py-2">
          <Table className="w-full border-collapse mb-4">
            <TableBody>
              <TableRow>
                <TableCell className="border bg-gray-50 px-3 py-2 text-sm font-semibold w-24 text-center">
                  점검 일자
                </TableCell>
                <TableCell className="border px-3 py-2 w-1/3">
                  <Input
                    type="date"
                    value={checkDate}
                    onChange={(e) => setCheckDate(e.target.value)}
                    className="w-full h-8 text-sm"
                  />
                </TableCell>
                <TableCell className="border bg-gray-50 px-3 py-2 text-sm font-semibold w-24 text-center">
                  점검자
                </TableCell>
                <TableCell className="border px-3 py-2 w-1/3">
                  <Input
                    value={inspector}
                    onChange={(e) => setInspector(e.target.value)}
                    placeholder="점검자명 입력"
                    className="w-full h-8 text-sm"
                  />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {/* 점검표 테이블 */}
        <div className="overflow-x-auto">
          <Table className="min-w-full border-collapse text-center text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="border p-2 font-semibold bg-gray-50 w-8">No.</TableHead>
                <TableHead className="border p-2 font-semibold bg-gray-50 w-32">종사자</TableHead>
                {checkColumns.map((col) => (
                  <TableHead key={col.id} className="border p-2 font-semibold bg-gray-50 min-w-[100px]">
                    {col.label}
                    {col.subLabel && <div className="text-xs font-normal text-gray-500">{col.subLabel}</div>}
                  </TableHead>
                ))}
                <TableHead className="border p-2 font-semibold bg-gray-50 w-16">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employeeRows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  <TableCell className="border p-1">{rowIndex + 1}</TableCell>
                  <TableCell className="border p-1">
                    <Input
                      value={row.name}
                      onChange={(e) => handleNameChange(rowIndex, e.target.value)}
                      placeholder="이름"
                      className="w-full h-7 text-center text-sm p-1"
                    />
                  </TableCell>
                  {checkColumns.map((col) => (
                    <TableCell
                      key={col.id}
                      className="border p-1 cursor-pointer"
                      onClick={() => handleCheckToggle(rowIndex, col.id)}
                    >
                      <span
                        className={`font-bold ${
                          row.checks[col.id] === "적합" ? "text-green-600" : 
                          row.checks[col.id] === "부적합" ? "text-red-600" : "text-gray-400"
                        }`}
                      >
                        {row.checks[col.id] === "적합" ? "O" : row.checks[col.id] === "부적합" ? "X" : "-"}
                      </span>
                    </TableCell>
                  ))}
                  <TableCell className="border p-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEmployeeRow(rowIndex)}
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                      title="해당 행 삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex justify-start mt-2">
          <Button size="sm" variant="outline" onClick={addEmployeeRow}>
            <Plus className="h-4 w-4 mr-1" />
            종사자 추가
          </Button>
        </div>

        {/* 하단 특이사항 및 개선조치 */}
        <div className="mt-4">
          <Table className="w-full border-collapse">
            <TableBody>
              <TableRow>
                <TableCell className="border bg-gray-50 px-3 py-2 text-sm font-semibold w-24 text-center align-top">
                  특이사항
                </TableCell>
                <TableCell className="border p-2">
                  <Textarea
                    value={specialNotes}
                    onChange={(e) => setSpecialNotes(e.target.value)}
                    placeholder="점검 중 발견된 특이사항을 기록하세요."
                    className="min-h-[80px] text-sm"
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="border bg-gray-50 px-3 py-2 text-sm font-semibold w-24 text-center align-top">
                  개선조치 및<br />결과확인
                </TableCell>
                <TableCell className="border p-2 space-y-2">
                  <Textarea
                    value={improvementAction}
                    onChange={(e) => setImprovementAction(e.target.value)}
                    placeholder="부적합 사항에 대한 개선 조치 내용을 기록하세요."
                    className="min-h-[80px] text-sm"
                  />
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="actionBy" className="text-sm whitespace-nowrap">조치자:</Label>
                      <Input
                        id="actionBy"
                        value={actionBy}
                        onChange={(e) => setActionBy(e.target.value)}
                        className="h-8 text-sm w-32"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="confirmedBy" className="text-sm whitespace-nowrap">확인자:</Label>
                      <Input
                        id="confirmedBy"
                        value={confirmedBy}
                        onChange={(e) => setConfirmedBy(e.target.value)}
                        className="h-8 text-sm w-32"
                      />
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </ChecklistFormLayout>
  );
}

export { PersonalHygieneCheckForm };
