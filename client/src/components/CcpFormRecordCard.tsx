/**
 * CCP Form Record Card - 배치 상세 페이지의 CCP 기록지 카드
 * 
 * h_ccp_form_records + h_ccp_form_rows를 기반으로
 * CCP 유형별(CCP-1B, CCP-2B, CCP-4P) 실제 설비 데이터를 표시하고 편집합니다.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  ChevronDown, ChevronUp, Save, Plus, Trash2,
  Thermometer, Clock, Gauge, ShieldCheck, ShieldAlert,
  AlertTriangle, CheckCircle2, Loader2, Send
} from "lucide-react";
import { toast } from "sonner";

// CCP 타입 색상
const ccpTypeColors: Record<string, string> = {
  "CCP-1B": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "CCP-2B": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "CCP-3B": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "CCP-4P": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

const ccpTypeLabels: Record<string, string> = {
  "CCP-1B": "가열/증숙",
  "CCP-2B": "가열 굽기",
  "CCP-3B": "가열/볶음",
  "CCP-4P": "금속검출",
};

function clCheck(value: number | string | null | undefined, lo: number | null | undefined, hi?: number | null | undefined): "ok" | "warn" | "na" {
  if (value == null || value === "") return "na";
  const v = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(v)) return "na";
  if (lo != null && v < lo) return "warn";
  if (hi != null && v > hi) return "warn";
  return "ok";
}

function ClBadge({ status }: { status: "ok" | "warn" | "na" }) {
  if (status === "ok") return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 text-[10px] px-1.5 py-0 gap-0.5"><ShieldCheck className="h-3 w-3" />적합</Badge>;
  if (status === "warn") return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-[10px] px-1.5 py-0 gap-0.5 animate-pulse"><ShieldAlert className="h-3 w-3" />이탈</Badge>;
  return <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 text-[10px] px-1.5 py-0">미입력</Badge>;
}

interface CcpFormRecordCardProps {
  formData: {
    record: any;
    rows: any[];
  };
  batchCode: string;
  onSaved: () => void;
}

export function CcpFormRecordCard({ formData, batchCode, onSaved }: CcpFormRecordCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [editingRowId, setEditingRowId] = useState<number | null>(null);
  const [rowEdits, setRowEdits] = useState<Record<string, any>>({});

  const { record, rows } = formData;
  const ccpType = record?.ccpType || "CCP-1B";
  const isMetal = ccpType === "CCP-4P";
  const isHeating = ["CCP-1B", "CCP-2B", "CCP-3B"].includes(ccpType);

  // Mutations
  const upsertRowMutation = trpc.ccpForm.saveRow.useMutation({
    onSuccess: () => {
      toast.success("기록이 저장되었습니다");
      setEditingRowId(null);
      setRowEdits({});
      onSaved();
    },
    onError: (err: any) => toast.error(`저장 실패: ${err.message}`),
  });

  const deleteRowMutation = trpc.ccpForm.deleteRow.useMutation({
    onSuccess: () => {
      toast.success("행이 삭제되었습니다");
      onSaved();
    },
    onError: (err: any) => toast.error(`삭제 실패: ${err.message}`),
  });

  const submitMutation = trpc.ccpForm.submit.useMutation({
    onSuccess: () => {
      toast.success("승인 요청이 등록되었습니다");
      onSaved();
    },
    onError: (err: any) => toast.error(`승인 요청 실패: ${err.message}`),
  });

  // Edit handlers
  const startEditing = (row: any) => {
    setEditingRowId(row.id);
    setRowEdits({
      measurementTime: row.measurementTime ? new Date(row.measurementTime).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "",
      inputQtyKg: row.inputQtyKg ?? "",
      heatTimeMin: row.heatTimeMin ?? "",
      heatTempC: row.heatTempC ?? "",
      pressureMpa: row.pressureMpa ?? "",
      tempEdgeC: row.tempEdgeC ?? "",
      tempCenterC: row.tempCenterC ?? "",
      metalFeMid: row.metalFeMid ?? "",
      metalSusMid: row.metalSusMid ?? "",
      metalFeProduct: row.metalFeProduct ?? "",
      metalSusProduct: row.metalSusProduct ?? "",
      passQty: row.passQty ?? "",
      detectedQty: row.detectedQty ?? "",
      result: row.result || "PASS",
      note: row.note || "",
    });
  };

  const saveRow = (row: any) => {
    upsertRowMutation.mutate({
      id: row.id,
      formRecordId: record.id,
      batchSeq: row.batchSeq || 1,
      equipmentId: row.equipmentId,
      equipmentName: row.equipmentName,
      equipmentType: row.equipmentType,
      ...(rowEdits.heatTimeMin !== "" && { heatTimeMin: parseFloat(rowEdits.heatTimeMin) }),
      ...(rowEdits.heatTempC !== "" && { heatTempC: parseFloat(rowEdits.heatTempC) }),
      ...(rowEdits.pressureMpa !== "" && { pressureMpa: parseFloat(rowEdits.pressureMpa) }),
      ...(rowEdits.tempEdgeC !== "" && { tempEdgeC: parseFloat(rowEdits.tempEdgeC) }),
      ...(rowEdits.tempCenterC !== "" && { tempCenterC: parseFloat(rowEdits.tempCenterC) }),
      ...(rowEdits.metalFeMid !== "" && { metalFeMid: parseFloat(rowEdits.metalFeMid) }),
      ...(rowEdits.metalSusMid !== "" && { metalSusMid: parseFloat(rowEdits.metalSusMid) }),
      ...(rowEdits.metalFeProduct !== "" && { metalFeProduct: parseFloat(rowEdits.metalFeProduct) }),
      ...(rowEdits.metalSusProduct !== "" && { metalSusProduct: parseFloat(rowEdits.metalSusProduct) }),
      ...(rowEdits.passQty !== "" && { passQty: parseInt(rowEdits.passQty) }),
      ...(rowEdits.detectedQty !== "" && { detectedQty: parseInt(rowEdits.detectedQty) }),
      ...(rowEdits.inputQtyKg !== "" && { inputQtyKg: parseFloat(rowEdits.inputQtyKg) }),
      result: rowEdits.result || "PASS",
      note: rowEdits.note || "",
    });
  };

  const handleSubmit = () => {
    if (!record) return;
    if (confirm("CCP 기록지를 제출하고 승인 요청을 등록하시겠습니까?")) {
      submitMutation.mutate({
        formRecordId: record.id,
        batchNumber: batchCode,
        productName: record.productName || "",
      });
    }
  };

  // Status badge
  const statusBadge = (status: string) => {
    switch (status) {
      case "draft": return <Badge variant="outline">초안</Badge>;
      case "submitted": return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">제출됨</Badge>;
      case "approved": return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">승인됨</Badge>;
      case "rejected": return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">반려됨</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <Badge className={ccpTypeColors[ccpType] || "bg-gray-100"}>{ccpType}</Badge>
          <div>
            <div className="font-semibold text-sm">
              {ccpTypeLabels[ccpType] || ccpType}
              {record?.processGroupName && (
                <span className="text-muted-foreground font-normal ml-2">
                  ({record.processGroupName})
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground flex gap-3 mt-0.5">
              <span>제품: {record?.productName || "-"}</span>
              <span>행: {rows?.length || 0}건</span>
              {record?.clHeatTempLo && <span>CL 온도: {record.clHeatTempLo}+</span>}
              {record?.clHeatTimeMinLo && <span>CL 시간: {record.clHeatTimeMinLo}~{record.clHeatTimeMinHi}분</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge(record?.status || "draft")}
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <CardContent className="pt-0 pb-4">
          {/* CL limits summary */}
          <div className="mb-3 p-2 bg-amber-50 dark:bg-amber-950/20 rounded text-xs grid grid-cols-2 md:grid-cols-4 gap-2">
            {isHeating && (
              <>
                {record?.clHeatTempLo != null && (
                  <div className="flex items-center gap-1">
                    <Thermometer className="h-3 w-3 text-red-500" />
                    <span>온도 CL: {record.clHeatTempLo}+</span>
                  </div>
                )}
                {record?.clHeatTimeMinLo != null && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-blue-500" />
                    <span>시간 CL: {record.clHeatTimeMinLo}~{record.clHeatTimeMinHi}분</span>
                  </div>
                )}
                {record?.clPressureMpaLo != null && (
                  <div className="flex items-center gap-1">
                    <Gauge className="h-3 w-3 text-green-500" />
                    <span>압력 CL: {record.clPressureMpaLo}+ MPa</span>
                  </div>
                )}
              </>
            )}
            {isMetal && (
              <>
                <div className="flex items-center gap-1">
                  <span>Fe: {record?.clFeMm ?? 2.0}mm</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>SUS: {record?.clSusMm ?? 3.0}mm</span>
                </div>
              </>
            )}
          </div>

          {/* Data Table */}
          {(!rows || rows.length === 0) ? (
            <div className="text-center py-6 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">기록 행이 없습니다. 배치 생성 시 자동으로 생성됩니다.</p>
            </div>
          ) : isHeating ? (
            /* Heating CCP Table */
            <div className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>설비</TableHead>
                    <TableHead className="text-center">온도(C)</TableHead>
                    <TableHead className="text-center">시간(분)</TableHead>
                    <TableHead className="text-center">압력(MPa)</TableHead>
                    <TableHead className="text-center">가장자리(C)</TableHead>
                    <TableHead className="text-center">중심부(C)</TableHead>
                    <TableHead className="text-center">판정</TableHead>
                    <TableHead className="text-center">비고</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row: any, idx: number) => {
                    const isEditing = editingRowId === row.id;
                    const tempStatus = clCheck(isEditing ? rowEdits.heatTempC : row.heatTempC, record?.clHeatTempLo);
                    const timeStatus = clCheck(isEditing ? rowEdits.heatTimeMin : row.heatTimeMin, record?.clHeatTimeMinLo, record?.clHeatTimeMinHi);

                    return (
                      <TableRow key={row.id} className={isEditing ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}>
                        <TableCell className="font-mono">{idx + 1}</TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{row.equipmentName || row.siruName || `-`}</TableCell>

                        {/* Temperature */}
                        <TableCell className="text-center">
                          {isEditing ? (
                            <Input
                              className="h-7 w-16 text-xs text-center mx-auto"
                              type="number"
                              value={rowEdits.heatTempC}
                              onChange={(e) => setRowEdits({ ...rowEdits, heatTempC: e.target.value })}
                            />
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <span>{row.heatTempC ?? "-"}</span>
                              <ClBadge status={tempStatus} />
                            </div>
                          )}
                        </TableCell>

                        {/* Time */}
                        <TableCell className="text-center">
                          {isEditing ? (
                            <Input
                              className="h-7 w-16 text-xs text-center mx-auto"
                              type="number"
                              value={rowEdits.heatTimeMin}
                              onChange={(e) => setRowEdits({ ...rowEdits, heatTimeMin: e.target.value })}
                            />
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <span>{row.heatTimeMin ?? "-"}</span>
                              <ClBadge status={timeStatus} />
                            </div>
                          )}
                        </TableCell>

                        {/* Pressure */}
                        <TableCell className="text-center">
                          {isEditing ? (
                            <Input
                              className="h-7 w-16 text-xs text-center mx-auto"
                              type="number"
                              step="0.01"
                              value={rowEdits.pressureMpa}
                              onChange={(e) => setRowEdits({ ...rowEdits, pressureMpa: e.target.value })}
                            />
                          ) : (
                            <span>{row.pressureMpa ?? "-"}</span>
                          )}
                        </TableCell>

                        {/* Edge temp */}
                        <TableCell className="text-center">
                          {isEditing ? (
                            <Input
                              className="h-7 w-16 text-xs text-center mx-auto"
                              type="number"
                              value={rowEdits.tempEdgeC}
                              onChange={(e) => setRowEdits({ ...rowEdits, tempEdgeC: e.target.value })}
                            />
                          ) : (
                            <span>{row.tempEdgeC ?? "-"}</span>
                          )}
                        </TableCell>

                        {/* Center temp */}
                        <TableCell className="text-center">
                          {isEditing ? (
                            <Input
                              className="h-7 w-16 text-xs text-center mx-auto"
                              type="number"
                              value={rowEdits.tempCenterC}
                              onChange={(e) => setRowEdits({ ...rowEdits, tempCenterC: e.target.value })}
                            />
                          ) : (
                            <span>{row.tempCenterC ?? "-"}</span>
                          )}
                        </TableCell>

                        {/* Result */}
                        <TableCell className="text-center">
                          {isEditing ? (
                            <Select value={rowEdits.result} onValueChange={(v) => setRowEdits({ ...rowEdits, result: v })}>
                              <SelectTrigger className="h-7 w-16 text-xs mx-auto">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="PASS">적합</SelectItem>
                                <SelectItem value="FAIL">부적합</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            row.result === "PASS" ? (
                              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 text-[10px]">적합</Badge>
                            ) : row.result === "FAIL" ? (
                              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-[10px]">부적합</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )
                          )}
                        </TableCell>

                        {/* Note */}
                        <TableCell className="text-center">
                          {isEditing ? (
                            <Input
                              className="h-7 w-24 text-xs mx-auto"
                              value={rowEdits.note}
                              onChange={(e) => setRowEdits({ ...rowEdits, note: e.target.value })}
                            />
                          ) : (
                            <span className="text-muted-foreground">{row.note || "-"}</span>
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell>
                          {isEditing ? (
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                className="h-6 w-6"
                                disabled={upsertRowMutation.isPending}
                                onClick={() => saveRow(row)}
                              >
                                {upsertRowMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingRowId(null)}>
                                <span className="text-xs">X</span>
                              </Button>
                            </div>
                          ) : (
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEditing(row)}>
                              <Save className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            /* Metal Detection CCP-4P Table */
            <div className="overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>제품명</TableHead>
                    <TableHead className="text-center">Fe 시험편</TableHead>
                    <TableHead className="text-center">SUS 시험편</TableHead>
                    <TableHead className="text-center">Fe 제품</TableHead>
                    <TableHead className="text-center">SUS 제품</TableHead>
                    <TableHead className="text-center">통과수량</TableHead>
                    <TableHead className="text-center">검출수량</TableHead>
                    <TableHead className="text-center">판정</TableHead>
                    <TableHead className="text-center">비고</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row: any, idx: number) => {
                    const isEditing = editingRowId === row.id;
                    return (
                      <TableRow key={row.id} className={isEditing ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}>
                        <TableCell className="font-mono">{idx + 1}</TableCell>
                        <TableCell className="font-medium whitespace-nowrap">{row.productName || row.equipmentName || "-"}</TableCell>

                        <TableCell className="text-center">
                          {isEditing ? (
                            <Input className="h-7 w-14 text-xs text-center mx-auto" type="number" step="0.1"
                              value={rowEdits.metalFeMid} onChange={(e) => setRowEdits({ ...rowEdits, metalFeMid: e.target.value })} />
                          ) : <span>{row.metalFeMid ?? "-"}</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          {isEditing ? (
                            <Input className="h-7 w-14 text-xs text-center mx-auto" type="number" step="0.1"
                              value={rowEdits.metalSusMid} onChange={(e) => setRowEdits({ ...rowEdits, metalSusMid: e.target.value })} />
                          ) : <span>{row.metalSusMid ?? "-"}</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          {isEditing ? (
                            <Input className="h-7 w-14 text-xs text-center mx-auto" type="number" step="0.1"
                              value={rowEdits.metalFeProduct} onChange={(e) => setRowEdits({ ...rowEdits, metalFeProduct: e.target.value })} />
                          ) : <span>{row.metalFeProduct ?? "-"}</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          {isEditing ? (
                            <Input className="h-7 w-14 text-xs text-center mx-auto" type="number" step="0.1"
                              value={rowEdits.metalSusProduct} onChange={(e) => setRowEdits({ ...rowEdits, metalSusProduct: e.target.value })} />
                          ) : <span>{row.metalSusProduct ?? "-"}</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          {isEditing ? (
                            <Input className="h-7 w-14 text-xs text-center mx-auto" type="number"
                              value={rowEdits.passQty} onChange={(e) => setRowEdits({ ...rowEdits, passQty: e.target.value })} />
                          ) : <span>{row.passQty ?? "-"}</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          {isEditing ? (
                            <Input className="h-7 w-14 text-xs text-center mx-auto" type="number"
                              value={rowEdits.detectedQty} onChange={(e) => setRowEdits({ ...rowEdits, detectedQty: e.target.value })} />
                          ) : <span>{row.detectedQty ?? 0}</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          {isEditing ? (
                            <Select value={rowEdits.result} onValueChange={(v) => setRowEdits({ ...rowEdits, result: v })}>
                              <SelectTrigger className="h-7 w-16 text-xs mx-auto"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="PASS">적합</SelectItem>
                                <SelectItem value="FAIL">부적합</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            row.result === "PASS" ? <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 text-[10px]">적합</Badge>
                            : row.result === "FAIL" ? <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-[10px]">부적합</Badge>
                            : <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {isEditing ? (
                            <Input className="h-7 w-24 text-xs mx-auto" value={rowEdits.note}
                              onChange={(e) => setRowEdits({ ...rowEdits, note: e.target.value })} />
                          ) : <span className="text-muted-foreground">{row.note || "-"}</span>}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <div className="flex gap-1">
                              <Button size="icon" className="h-6 w-6" disabled={upsertRowMutation.isPending} onClick={() => saveRow(row)}>
                                {upsertRowMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingRowId(null)}>
                                <span className="text-xs">X</span>
                              </Button>
                            </div>
                          ) : (
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEditing(row)}>
                              <Save className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Submit button */}
          {record?.status === "draft" && rows?.length > 0 && (
            <div className="mt-4 pt-3 border-t flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                모든 행을 입력 후 제출하면 승인 요청이 생성됩니다
              </p>
              <Button
                onClick={handleSubmit}
                disabled={submitMutation.isPending}
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {submitMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
                CCP 기록지 제출
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
