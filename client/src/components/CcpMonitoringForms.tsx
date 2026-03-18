/**
 * CCP 모니터링 기록지 컴포넌트 (v2 - BOM 배치수 자동계산 + 설비 순차할당)
 *
 * CCP-2B: 중요관리점(CCP-2B) 모니터링일지 [가열(굽기)공정]
 * CCP-1B: 중요관리점(CCP-1B) 모니터링일지 [가열(증숙)공정 - 교반기/증숙기]
 * CCP-4P: 중요관리점(CCP-4P) 모니터링일지 [금속검출공정]
 *
 * 핵심 기능:
 * - BOM 배치목표량(batch_target_kg) 조회 → 배치수 자동계산(계획생산량 ÷ BOM배치량)
 * - 설비 순차할당: 배치1→설비1, 배치2→설비2, 배치3→설비3
 * - 그룹방식: 동시(concurrent) / 순차(sequential) + 배치간격(분)
 * - 자동/수동 처리모드 → 승인관리 연동
 *
 * 기준서 CL 값:
 * CCP-2B: 가열시간 10~15분, 가열온도 150°C 이상
 * CCP-1B: 가열시간 10~15분 (교반기1: 0.16MPa, 교반기2,3: 0.12MPa), 품온 90°C 이상
 * CCP-4P: 감도 130, Fe 2.0mmΦ 이상 불검출, SUS 3.0mmΦ 이상 불검출
 */
import React, { useState, useEffect, useCallback } from "react";
import { trpc } from "../lib/trpc";
import { useToast } from "../hooks/use-toast";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "../components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import { Textarea } from "../components/ui/textarea";
import {
  Zap, Settings, Plus, Trash2, CheckCircle, XCircle, Send,
  AlertTriangle, RefreshCw, Loader2, Clock, ChevronDown, ChevronUp,
  Calculator, Wrench,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useLocation } from "wouter";

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Types
// ─────────────────────────────────────────────────────────────────────────────
const CCP_TYPE_LABELS: Record<string, string> = {
  "CCP-2B": "가열(굽기)공정",
  "CCP-1B": "가열(증숙)공정",
  "CCP-4P": "금속검출공정",
};

// CL 기준값 (기준서 기반)
const CCP_CL_DEFAULTS: Record<string, {
  heatTimeMinLo?: number; heatTimeMinHi?: number;
  heatTempLo?: number; pressureMpaLo?: number; productTempLo?: number;
  metalSensitivity?: number; feMm?: number; susMm?: number;
}> = {
  "CCP-2B": { heatTimeMinLo: 10, heatTimeMinHi: 15, heatTempLo: 150 },
  "CCP-1B": { heatTimeMinLo: 10, heatTimeMinHi: 15, pressureMpaLo: 0.12, productTempLo: 90 },
  "CCP-4P": { metalSensitivity: 130, feMm: 2.0, susMm: 3.0 },
};

interface CcpFormRecord {
  id: number;
  ccpType: string;
  workDate: string;
  productName?: string | null;
  processGroupId?: number | null;
  processGroupName?: string | null;
  bomBatchKg?: string | null;
  plannedQtyKg?: string | null;
  batchCount: number;
  equipGroupMode: "concurrent" | "sequential";
  equipIntervalMin?: number | null;
  clHeatTimeMinLo?: number | null;
  clHeatTimeMinHi?: number | null;
  clHeatTempLo?: string | null;
  clPressureMpaLo?: string | null;
  clProductTempLo?: string | null;
  clMetalSensitivity?: number | null;
  clFeMm?: string | null;
  clSusMm?: string | null;
  status: "draft" | "submitted" | "approved" | "rejected";
}

interface CcpFormRow {
  id: number;
  batchSeq: number;
  equipmentId?: number | null;
  equipmentName?: string | null;
  equipmentType?: string | null;
  productName?: string | null;
  measurementTime?: string | null;
  inputQtyKg?: string | null;
  result?: "적합" | "부적합" | null;
  heatTimeMin?: number | null;
  heatTempC?: string | null;
  siruName?: string | null;
  pressureMpa?: string | null;
  tempEdgeC?: string | null;
  tempCenterC?: string | null;
  metalFeMid?: string | null;
  metalSusMid?: string | null;
  metalProductOnly?: string | null;
  metalFeProduct?: string | null;
  metalSusProduct?: string | null;
  passTimeStart?: string | null;
  passTimeEnd?: string | null;
  passQty?: number | null;
  detectedQty?: number | null;
  specialNote?: string | null;
  isDeviation?: number;
  deviationNote?: string | null;
  correctiveAction?: string | null;
  actionBy?: string | null;
  confirmedBy?: string | null;
  note?: string | null;
}

interface EquipmentInfo {
  id: number;
  equipment_name: string;
  equipment_type: string;
  equipment_code?: string;
  sort_order?: number;
}

interface Props {
  batchId: number;
  batchNumber: string;
  productId?: number;
  productName?: string;
  plannedQtyKg?: number;
  workDate?: string;
  onFormSaved?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Components
// ─────────────────────────────────────────────────────────────────────────────
function ResultBadge({ result }: { result?: string | null }) {
  if (!result) return <span className="text-gray-400 text-sm">-</span>;
  return (
    <Badge variant={result === "적합" ? "default" : "destructive"}
      className={result === "적합" ? "bg-green-600 text-white text-xs" : "text-xs"}>
      {result}
    </Badge>
  );
}

function OXCell({ value, onChange }: { value?: string | null; onChange?: (v: string) => void }) {
  if (!onChange) {
    return (
      <span className={cn("font-bold text-lg",
        value === "O" ? "text-green-600" : value === "X" ? "text-red-500" : "text-gray-300")}>
        {value || "-"}
      </span>
    );
  }
  return (
    <Select value={value || "O"} onValueChange={onChange}>
      <SelectTrigger className="h-7 w-16 text-xs px-2">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="O"><span className="text-green-600 font-bold">O (통과)</span></SelectItem>
        <SelectItem value="X"><span className="text-red-500 font-bold">X (불검출)</span></SelectItem>
      </SelectContent>
    </Select>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BOM 배치수 계산 섹션
// ─────────────────────────────────────────────────────────────────────────────
function BatchCountCalc({
  productId, plannedQtyKg, batchCount, onBatchCountChange, disabled,
}: {
  productId?: number; plannedQtyKg?: number;
  batchCount: number; onBatchCountChange: (n: number) => void; disabled?: boolean;
}) {
  const { data: bomData } = trpc.ccpForm.getBomBatchKg.useQuery(
    { productId: productId! },
    { enabled: !!productId }
  );
  const bomBatchKg = bomData?.bomBatchKg;
  const autoBatchCount = bomBatchKg && plannedQtyKg
    ? Math.ceil(plannedQtyKg / bomBatchKg) : null;

  useEffect(() => {
    if (autoBatchCount && autoBatchCount !== batchCount) {
      onBatchCountChange(autoBatchCount);
    }
  }, [autoBatchCount]);

  return (
    <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
      <Calculator className="h-4 w-4 text-blue-600 flex-shrink-0" />
      <div className="flex-1">
        <div className="font-semibold text-blue-800">배치수 자동계산</div>
        <div className="text-xs text-blue-600 mt-0.5">
          {bomBatchKg
            ? `BOM 배치량 ${bomBatchKg}kg × 계획 ${plannedQtyKg ?? "?"}kg → `
            : "BOM 배치량 조회 중... "}
          <span className="font-bold text-blue-800">
            {autoBatchCount ? `${autoBatchCount}배치` : "-"}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">배치수:</span>
        <Input
          type="number" min={1} max={99}
          value={batchCount}
          onChange={e => onBatchCountChange(Math.max(1, parseInt(e.target.value) || 1))}
          className="h-8 w-16 text-center text-sm"
          disabled={disabled}
        />
        {autoBatchCount && autoBatchCount !== batchCount && (
          <Button size="sm" variant="outline" className="h-8 text-xs"
            onClick={() => onBatchCountChange(autoBatchCount)}>
            <RefreshCw className="h-3 w-3 mr-1" />
            자동적용
          </Button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 설비 할당 섹션 (배치 인터벌 포함)
// ─────────────────────────────────────────────────────────────────────────────
function EquipmentAssignSection({
  batchId, batchCount, equipGroupMode, equipIntervalMin,
  onModeChange, onIntervalChange, equipmentList,
}: {
  batchId: number; batchCount: number;
  equipGroupMode: "concurrent" | "sequential";
  equipIntervalMin: number;
  onModeChange: (v: "concurrent" | "sequential") => void;
  onIntervalChange: (v: number) => void;
  equipmentList: EquipmentInfo[];
}) {
  // 배치 → 설비 순차 할당 표시
  const assignments = Array.from({ length: batchCount }, (_, i) => {
    const equipIdx = equipmentList.length > 0 ? i % equipmentList.length : -1;
    const equip = equipIdx >= 0 ? equipmentList[equipIdx] : null;
    const timeOffset = equipGroupMode === "sequential" ? i * equipIntervalMin : 0;
    return { batchSeq: i + 1, equip, timeOffset };
  });

  return (
    <div className="p-3 border rounded-lg space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Wrench className="h-4 w-4 text-orange-500" />
        설비 할당 및 배치 간격
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">그룹 방식</Label>
          <Select value={equipGroupMode} onValueChange={v => onModeChange(v as any)}>
            <SelectTrigger className="h-8 text-xs mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sequential">순차 (배치간 간격 설정)</SelectItem>
              <SelectItem value="concurrent">동시 (모든 배치 동시 시작)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {equipGroupMode === "sequential" && (
          <div>
            <Label className="text-xs text-muted-foreground">배치 간격 (분)</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number" min={0} max={120}
                value={equipIntervalMin}
                onChange={e => onIntervalChange(parseInt(e.target.value) || 0)}
                className="h-8 text-sm w-20"
              />
              <span className="text-xs text-muted-foreground">분</span>
            </div>
          </div>
        )}
      </div>
      {/* 배치→설비 할당 테이블 */}
      {equipmentList.length > 0 && (
        <div className="mt-2">
          <div className="text-xs text-muted-foreground mb-1">배치별 설비 할당 (순차)</div>
          <div className="flex flex-wrap gap-2">
            {assignments.map(a => (
              <div key={a.batchSeq} className="flex items-center gap-1 px-2 py-1 bg-gray-50 border rounded text-xs">
                <span className="font-medium text-blue-700">배치{a.batchSeq}</span>
                <span className="text-gray-400">→</span>
                <span className="font-medium text-orange-700">
                  {a.equip ? `${a.equip.equipment_name} (${a.equip.equipment_type})` : "설비없음"}
                </span>
                {a.timeOffset > 0 && (
                  <span className="text-gray-400">+{a.timeOffset}분</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 행 입력 폼 (CCP 유형별)
// ─────────────────────────────────────────────────────────────────────────────
function RowInputForm({
  ccpType, batchSeq, formRecordId, equipmentName, equipmentType,
  clDefaults, onSaved, editRow,
}: {
  ccpType: string; batchSeq: number; formRecordId: number;
  equipmentName?: string; equipmentType?: string;
  clDefaults: typeof CCP_CL_DEFAULTS[string];
  onSaved: () => void; editRow?: CcpFormRow;
}) {
  const { toast } = useToast();
  const [measurementTime, setMeasurementTime] = useState(editRow?.measurementTime ?? "");
  const [inputQtyKg, setInputQtyKg] = useState(editRow?.inputQtyKg ?? "");
  const [result, setResult] = useState<"적합" | "부적합" | "">(editRow?.result ?? "");

  // CCP-2B
  const [heatTimeMin, setHeatTimeMin] = useState(editRow?.heatTimeMin?.toString() ?? "");
  const [heatTempC, setHeatTempC] = useState(editRow?.heatTempC ?? "");

  // CCP-1B
  const [siruName, setSiruName] = useState(editRow?.siruName ?? equipmentName ?? "");
  const [pressureMpa, setPressureMpa] = useState(editRow?.pressureMpa ?? "");
  const [tempEdgeC, setTempEdgeC] = useState(editRow?.tempEdgeC ?? "");
  const [tempCenterC, setTempCenterC] = useState(editRow?.tempCenterC ?? "");

  // CCP-4P
  const [metalFeMid, setMetalFeMid] = useState(editRow?.metalFeMid ?? "O");
  const [metalSusMid, setMetalSusMid] = useState(editRow?.metalSusMid ?? "O");
  const [metalProductOnly, setMetalProductOnly] = useState(editRow?.metalProductOnly ?? "O");
  const [metalFeProduct, setMetalFeProduct] = useState(editRow?.metalFeProduct ?? "O");
  const [metalSusProduct, setMetalSusProduct] = useState(editRow?.metalSusProduct ?? "O");
  const [passTimeStart, setPassTimeStart] = useState(editRow?.passTimeStart ?? "");
  const [passTimeEnd, setPassTimeEnd] = useState(editRow?.passTimeEnd ?? "");
  const [passQty, setPassQty] = useState(editRow?.passQty?.toString() ?? "");
  const [detectedQty, setDetectedQty] = useState(editRow?.detectedQty?.toString() ?? "");
  const [specialNote, setSpecialNote] = useState(editRow?.specialNote ?? "");

  // 이탈
  const [isDeviation, setIsDeviation] = useState(editRow?.isDeviation === 1);
  const [deviationNote, setDeviationNote] = useState(editRow?.deviationNote ?? "");
  const [correctiveAction, setCorrectiveAction] = useState(editRow?.correctiveAction ?? "");
  const [actionBy, setActionBy] = useState(editRow?.actionBy ?? "");
  const [confirmedBy, setConfirmedBy] = useState(editRow?.confirmedBy ?? "");
  const [note, setNote] = useState(editRow?.note ?? "");

  const saveRowMutation = trpc.ccpForm.saveRow.useMutation({
    onSuccess: () => {
      toast({ title: "저장 완료", description: `배치 ${batchSeq} CCP 기록이 저장되었습니다.` });
      onSaved();
    },
    onError: (err: any) => toast({ title: "저장 실패", description: err.message, variant: "destructive" }),
  });

  const handleSave = () => {
    // 자동 적합/부적합 판정
    let autoResult: "적합" | "부적합" | "" = result as any;
    if (!autoResult) {
      if (ccpType === "CCP-2B") {
        const ht = parseFloat(heatTimeMin); const temp = parseFloat(heatTempC);
        const lo = clDefaults.heatTimeMinLo ?? 10; const hi = clDefaults.heatTimeMinHi ?? 15;
        const tempLo = clDefaults.heatTempLo ?? 150;
        if (ht && temp) autoResult = (ht >= lo && ht <= hi && temp >= tempLo) ? "적합" : "부적합";
      } else if (ccpType === "CCP-1B") {
        const ht = parseFloat(heatTimeMin); const p = parseFloat(pressureMpa);
        const tc = parseFloat(tempCenterC);
        const lo = clDefaults.heatTimeMinLo ?? 10; const hi = clDefaults.heatTimeMinHi ?? 15;
        const pLo = clDefaults.pressureMpaLo ?? 0.12; const tLo = clDefaults.productTempLo ?? 90;
        if (ht && tc) autoResult = (ht >= lo && ht <= hi && p >= pLo && tc >= tLo) ? "적합" : "부적합";
      } else if (ccpType === "CCP-4P") {
        const allPass = [metalFeMid, metalSusMid, metalProductOnly, metalFeProduct, metalSusProduct]
          .every(v => v === "O");
        autoResult = allPass ? "적합" : "부적합";
      }
    }

    saveRowMutation.mutate({
      formRecordId, batchSeq,
      equipmentName: equipmentName || siruName || undefined,
      equipmentType: equipmentType || undefined,
      measurementTime: measurementTime || undefined,
      inputQtyKg: inputQtyKg ? parseFloat(inputQtyKg) : undefined,
      result: autoResult || undefined,
      // CCP-2B
      heatTimeMin: heatTimeMin ? parseFloat(heatTimeMin) : undefined,
      heatTempC: heatTempC ? parseFloat(heatTempC) : undefined,
      // CCP-1B
      siruName: siruName || undefined,
      pressureMpa: pressureMpa ? parseFloat(pressureMpa) : undefined,
      tempEdgeC: tempEdgeC ? parseFloat(tempEdgeC) : undefined,
      tempCenterC: tempCenterC ? parseFloat(tempCenterC) : undefined,
      // CCP-4P
      metalFeMid, metalSusMid, metalProductOnly, metalFeProduct, metalSusProduct,
      passTimeStart: passTimeStart || undefined,
      passTimeEnd: passTimeEnd || undefined,
      passQty: passQty ? parseInt(passQty) : undefined,
      detectedQty: detectedQty ? parseInt(detectedQty) : undefined,
      specialNote: specialNote || undefined,
      isDeviation,
      deviationNote: deviationNote || undefined,
      correctiveAction: correctiveAction || undefined,
      actionBy: actionBy || undefined,
      confirmedBy: confirmedBy || undefined,
      note: note || undefined,
    });
  };

  return (
    <div className="space-y-3 p-3 border rounded-lg bg-gray-50/50">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs text-muted-foreground">측정시각</Label>
          <Input type="time" value={measurementTime} onChange={e => setMeasurementTime(e.target.value)}
            className="h-8 text-sm mt-1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">투입량(kg)</Label>
          <Input type="number" placeholder="0.0" value={inputQtyKg}
            onChange={e => setInputQtyKg(e.target.value)} className="h-8 text-sm mt-1" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">판정</Label>
          <Select value={result} onValueChange={v => setResult(v as any)}>
            <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="자동판정" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="적합"><span className="text-green-600">✅ 적합</span></SelectItem>
              <SelectItem value="부적합"><span className="text-red-500">❌ 부적합</span></SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* CCP-2B: 굽기공정 */}
      {ccpType === "CCP-2B" && (
        <div className="grid grid-cols-2 gap-2 p-2 bg-orange-50 border border-orange-100 rounded">
          <div>
            <Label className="text-xs">가열시간(분) <span className="text-orange-600">CL: {clDefaults.heatTimeMinLo}~{clDefaults.heatTimeMinHi}분</span></Label>
            <Input type="number" placeholder="예: 12" value={heatTimeMin}
              onChange={e => setHeatTimeMin(e.target.value)} className="h-8 text-sm mt-1" />
          </div>
          <div>
            <Label className="text-xs">가열온도(°C) <span className="text-orange-600">CL: {clDefaults.heatTempLo}°C 이상</span></Label>
            <Input type="number" placeholder="예: 180" value={heatTempC}
              onChange={e => setHeatTempC(e.target.value)} className="h-8 text-sm mt-1" />
          </div>
        </div>
      )}

      {/* CCP-1B: 증숙공정 */}
      {ccpType === "CCP-1B" && (
        <div className="p-2 bg-blue-50 border border-blue-100 rounded space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">시루명 (설비기준 = 시루)</Label>
              <Input placeholder="예: 교반기 1호" value={siruName}
                onChange={e => setSiruName(e.target.value)} className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">가열시간(분) <span className="text-blue-600">CL: {clDefaults.heatTimeMinLo}~{clDefaults.heatTimeMinHi}분</span></Label>
              <Input type="number" placeholder="예: 12" value={heatTimeMin}
                onChange={e => setHeatTimeMin(e.target.value)} className="h-8 text-sm mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">압력(MPa) <span className="text-blue-600">CL: {clDefaults.pressureMpaLo}MPa 이상</span></Label>
              <Input type="number" step="0.01" placeholder="0.12" value={pressureMpa}
                onChange={e => setPressureMpa(e.target.value)} className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">모서리온도(°C)</Label>
              <Input type="number" placeholder="90" value={tempEdgeC}
                onChange={e => setTempEdgeC(e.target.value)} className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">중심온도(°C) <span className="text-blue-600">CL: {clDefaults.productTempLo}°C↑</span></Label>
              <Input type="number" placeholder="90" value={tempCenterC}
                onChange={e => setTempCenterC(e.target.value)} className="h-8 text-sm mt-1" />
            </div>
          </div>
        </div>
      )}

      {/* CCP-4P: 금속검출 */}
      {ccpType === "CCP-4P" && (
        <div className="p-2 bg-purple-50 border border-purple-100 rounded space-y-2">
          <div className="text-xs font-semibold text-purple-800 mb-1">
            테스트피스 확인 (CL: Fe {clDefaults.feMm}mmΦ 불검출, SUS {clDefaults.susMm}mmΦ 불검출, 감도 {clDefaults.metalSensitivity})
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[
              { label: "Fe 중간", val: metalFeMid, set: setMetalFeMid },
              { label: "SUS 중간", val: metalSusMid, set: setMetalSusMid },
              { label: "제품 단독", val: metalProductOnly, set: setMetalProductOnly },
              { label: "Fe+제품", val: metalFeProduct, set: setMetalFeProduct },
              { label: "SUS+제품", val: metalSusProduct, set: setMetalSusProduct },
            ].map(({ label, val, set }) => (
              <div key={label} className="text-center">
                <div className="text-xs text-muted-foreground mb-1">{label}</div>
                <OXCell value={val} onChange={set} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2 mt-2">
            <div>
              <Label className="text-xs">통과시작</Label>
              <Input type="time" value={passTimeStart} onChange={e => setPassTimeStart(e.target.value)}
                className="h-7 text-xs mt-1" />
            </div>
            <div>
              <Label className="text-xs">통과종료</Label>
              <Input type="time" value={passTimeEnd} onChange={e => setPassTimeEnd(e.target.value)}
                className="h-7 text-xs mt-1" />
            </div>
            <div>
              <Label className="text-xs">통과수량(개)</Label>
              <Input type="number" value={passQty} onChange={e => setPassQty(e.target.value)}
                className="h-7 text-xs mt-1" />
            </div>
            <div>
              <Label className="text-xs">검출수량(개)</Label>
              <Input type="number" value={detectedQty} onChange={e => setDetectedQty(e.target.value)}
                className="h-7 text-xs mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">특이사항</Label>
            <Input placeholder="특이사항" value={specialNote} onChange={e => setSpecialNote(e.target.value)}
              className="h-7 text-xs mt-1" />
          </div>
        </div>
      )}

      {/* 이탈 / 개선조치 */}
      <div className="flex items-center gap-2">
        <input type="checkbox" id={`dev-${formRecordId}-${batchSeq}`}
          checked={isDeviation} onChange={e => setIsDeviation(e.target.checked)} />
        <label htmlFor={`dev-${formRecordId}-${batchSeq}`} className="text-xs text-red-600 cursor-pointer">
          이탈(비적합) 발생
        </label>
      </div>
      {isDeviation && (
        <div className="grid grid-cols-2 gap-2 p-2 bg-red-50 border border-red-100 rounded text-xs">
          <div>
            <Label className="text-xs">이탈 내용</Label>
            <Textarea placeholder="이탈 발생 내용" value={deviationNote}
              onChange={e => setDeviationNote(e.target.value)} className="h-14 text-xs mt-1" />
          </div>
          <div>
            <Label className="text-xs">개선조치</Label>
            <Textarea placeholder="개선조치 내용" value={correctiveAction}
              onChange={e => setCorrectiveAction(e.target.value)} className="h-14 text-xs mt-1" />
          </div>
          <div>
            <Label className="text-xs">조치자</Label>
            <Input placeholder="조치자명" value={actionBy}
              onChange={e => setActionBy(e.target.value)} className="h-7 text-xs mt-1" />
          </div>
          <div>
            <Label className="text-xs">확인자</Label>
            <Input placeholder="확인자명" value={confirmedBy}
              onChange={e => setConfirmedBy(e.target.value)} className="h-7 text-xs mt-1" />
          </div>
        </div>
      )}
      <div>
        <Input placeholder="비고" value={note} onChange={e => setNote(e.target.value)}
          className="h-7 text-xs" />
      </div>

      <Button size="sm" className="w-full" onClick={handleSave}
        disabled={saveRowMutation.isPending}>
        {saveRowMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
        배치 {batchSeq} 저장
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 단일 CCP 기록지 패널
// ─────────────────────────────────────────────────────────────────────────────
function CcpFormPanel({
  formRecord, rows, batchId, productId, plannedQtyKg, equipmentGroups, onRefresh,
}: {
  formRecord: CcpFormRecord;
  rows: CcpFormRow[];
  batchId: number;
  productId?: number;
  plannedQtyKg?: number;
  equipmentGroups: { processGroupId: number; processGroupName: string; ccpType: string; equipment: EquipmentInfo[] }[];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [expanded, setExpanded] = useState(true);
  const [batchCount, setBatchCount] = useState(formRecord.batchCount || 1);
  const [equipGroupMode, setEquipGroupMode] = useState<"concurrent" | "sequential">(
    formRecord.equipGroupMode || "sequential"
  );
  const [equipIntervalMin, setEquipIntervalMin] = useState(formRecord.equipIntervalMin ?? 10);
  const [addingBatch, setAddingBatch] = useState<number | null>(null);

  const updateRecordMutation = trpc.ccpForm.updateRecord.useMutation({
    onSuccess: onRefresh,
    onError: (err: any) => toast({ title: "설정 저장 실패", description: err.message, variant: "destructive" }),
  });

  const deleteRowMutation = trpc.ccpForm.deleteRow.useMutation({
    onSuccess: () => { toast({ title: "삭제 완료" }); onRefresh(); },
    onError: (err: any) => toast({ title: "삭제 실패", description: err.message, variant: "destructive" }),
  });

  const submitMutation = trpc.ccpForm.submit.useMutation({
    onSuccess: (data: any) => {
      toast({ title: "승인 요청 완료", description: "CCP 기록지가 승인관리로 이동되었습니다." });
      setTimeout(() => setLocation("/dashboard/approval"), 1200);
    },
    onError: (err: any) => toast({ title: "제출 실패", description: err.message, variant: "destructive" }),
  });

  const ccpGroup = equipmentGroups.find(g => g.ccpType === formRecord.ccpType);
  const equipmentList: EquipmentInfo[] = ccpGroup?.equipment ?? [];
  const clDefaults = CCP_CL_DEFAULTS[formRecord.ccpType] ?? {};

  // 배치수 변경 시 저장
  const handleBatchCountChange = (n: number) => {
    setBatchCount(n);
    updateRecordMutation.mutate({ id: formRecord.id, batchCount: n });
  };

  const handleModeChange = (v: "concurrent" | "sequential") => {
    setEquipGroupMode(v);
    updateRecordMutation.mutate({ id: formRecord.id, equipGroupMode: v });
  };

  const handleIntervalChange = (v: number) => {
    setEquipIntervalMin(v);
    updateRecordMutation.mutate({ id: formRecord.id, equipIntervalMin: v });
  };

  // 각 배치시퀀스에 해당하는 행 찾기
  const getRowForBatch = (seq: number) => rows.find(r => r.batchSeq === seq);

  // 설비 자동할당 (순차: 배치1→설비1, 배치2→설비2...)
  const getEquipForBatch = (seq: number): EquipmentInfo | null => {
    if (equipmentList.length === 0) return null;
    return equipmentList[(seq - 1) % equipmentList.length];
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* 헤더 */}
      <div
        className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-indigo-50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-bold">{formRecord.ccpType}</Badge>
          <span className="text-sm font-semibold">{CCP_TYPE_LABELS[formRecord.ccpType] ?? formRecord.ccpType}</span>
          <Badge variant={
            formRecord.status === "approved" ? "default" :
            formRecord.status === "submitted" ? "secondary" :
            formRecord.status === "rejected" ? "destructive" : "outline"
          } className="text-xs">
            {formRecord.status === "approved" ? "✅ 승인완료" :
             formRecord.status === "submitted" ? "⏳ 검토중" :
             formRecord.status === "rejected" ? "❌ 반려" : "✏️ 작성중"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {batchCount}배치 · {rows.length}건 입력
          </span>
        </div>
        <div className="flex items-center gap-2">
          {formRecord.status === "draft" && rows.length > 0 && (
            <Button size="sm" variant="default" className="h-7 text-xs bg-green-600 hover:bg-green-700"
              onClick={e => {
                e.stopPropagation();
                submitMutation.mutate({
                  formRecordId: formRecord.id,
                  batchNumber: `배치 #${batchId}`,
                  productName: formRecord.productName ?? undefined,
                  ccpType: formRecord.ccpType,
                  workDate: formRecord.workDate,
                });
              }}
              disabled={submitMutation.isPending}>
              <Send className="h-3 w-3 mr-1" />
              승인요청 → 승인관리
            </Button>
          )}
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {expanded && (
        <div className="p-3 space-y-3">
          {/* CL 기준값 표시 */}
          <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
            <span className="font-semibold">CL 기준:</span>{" "}
            {formRecord.ccpType === "CCP-2B" && `가열시간 ${clDefaults.heatTimeMinLo}~${clDefaults.heatTimeMinHi}분 · 온도 ${clDefaults.heatTempLo}°C 이상`}
            {formRecord.ccpType === "CCP-1B" && `가열시간 ${clDefaults.heatTimeMinLo}~${clDefaults.heatTimeMinHi}분 · 압력 ${clDefaults.pressureMpaLo}MPa 이상 · 품온 ${clDefaults.productTempLo}°C 이상`}
            {formRecord.ccpType === "CCP-4P" && `감도 ${clDefaults.metalSensitivity} · Fe ${clDefaults.feMm}mmΦ 불검출 · SUS ${clDefaults.susMm}mmΦ 불검출`}
          </div>

          {/* BOM 배치수 계산 */}
          <BatchCountCalc
            productId={productId}
            plannedQtyKg={plannedQtyKg}
            batchCount={batchCount}
            onBatchCountChange={handleBatchCountChange}
          />

          {/* 설비 할당 */}
          <EquipmentAssignSection
            batchId={batchId}
            batchCount={batchCount}
            equipGroupMode={equipGroupMode}
            equipIntervalMin={equipIntervalMin}
            onModeChange={handleModeChange}
            onIntervalChange={handleIntervalChange}
            equipmentList={equipmentList}
          />

          {/* 배치별 기록 입력 */}
          <div className="space-y-2">
            <div className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              배치별 측정 기록
            </div>
            {Array.from({ length: batchCount }, (_, i) => {
              const seq = i + 1;
              const existingRow = getRowForBatch(seq);
              const equip = getEquipForBatch(seq);
              const timeOffset = equipGroupMode === "sequential" ? (i * equipIntervalMin) : 0;

              return (
                <div key={seq} className="border rounded">
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-bold text-blue-700">배치 {seq}</span>
                      {equip && (
                        <span className="text-xs text-orange-700 bg-orange-50 px-2 py-0.5 rounded">
                          {equip.equipment_type === "시루" ? "시루" : "설비"}: {equip.equipment_name}
                        </span>
                      )}
                      {timeOffset > 0 && (
                        <span className="text-xs text-gray-500">+{timeOffset}분 후 시작</span>
                      )}
                      {existingRow && <ResultBadge result={existingRow.result} />}
                    </div>
                    <div className="flex items-center gap-1">
                      {existingRow && (
                        <Button size="sm" variant="ghost" className="h-6 text-xs"
                          onClick={() => setAddingBatch(addingBatch === seq ? null : seq)}>
                          {addingBatch === seq ? "접기" : "수정"}
                        </Button>
                      )}
                      {!existingRow && (
                        <Button size="sm" variant="outline" className="h-6 text-xs text-green-600 border-green-300"
                          onClick={() => setAddingBatch(addingBatch === seq ? null : seq)}>
                          <Plus className="h-3 w-3 mr-0.5" />
                          입력
                        </Button>
                      )}
                      {existingRow && (
                        <Button size="sm" variant="ghost" className="h-6 text-red-400 hover:text-red-600"
                          onClick={() => deleteRowMutation.mutate({ id: existingRow.id })}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* 기존 행 요약 표시 */}
                  {existingRow && addingBatch !== seq && (
                    <div className="px-3 py-2 text-xs grid grid-cols-4 gap-2">
                      <div><span className="text-muted-foreground">시각:</span> {existingRow.measurementTime || "-"}</div>
                      <div><span className="text-muted-foreground">투입:</span> {existingRow.inputQtyKg ? `${existingRow.inputQtyKg}kg` : "-"}</div>
                      {formRecord.ccpType === "CCP-2B" && (
                        <>
                          <div><span className="text-muted-foreground">가열:</span> {existingRow.heatTimeMin ?? "-"}분</div>
                          <div><span className="text-muted-foreground">온도:</span> {existingRow.heatTempC ?? "-"}°C</div>
                        </>
                      )}
                      {formRecord.ccpType === "CCP-1B" && (
                        <>
                          <div><span className="text-muted-foreground">가열:</span> {existingRow.heatTimeMin ?? "-"}분</div>
                          <div><span className="text-muted-foreground">품온:</span> {existingRow.tempCenterC ?? "-"}°C</div>
                        </>
                      )}
                      {formRecord.ccpType === "CCP-4P" && (
                        <>
                          <div><span className="text-muted-foreground">Fe:</span> <OXCell value={existingRow.metalFeMid} /></div>
                          <div><span className="text-muted-foreground">SUS:</span> <OXCell value={existingRow.metalSusMid} /></div>
                        </>
                      )}
                    </div>
                  )}

                  {/* 입력 폼 */}
                  {addingBatch === seq && (
                    <div className="p-3">
                      <RowInputForm
                        ccpType={formRecord.ccpType}
                        batchSeq={seq}
                        formRecordId={formRecord.id}
                        equipmentName={equip?.equipment_name}
                        equipmentType={equip?.equipment_type}
                        clDefaults={clDefaults}
                        editRow={existingRow}
                        onSaved={() => { setAddingBatch(null); onRefresh(); }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 전체 요약 테이블 */}
          {rows.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-semibold text-muted-foreground mb-1">기록 요약</div>
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="py-1 text-xs">배치</TableHead>
                    <TableHead className="py-1 text-xs">설비</TableHead>
                    <TableHead className="py-1 text-xs">시각</TableHead>
                    <TableHead className="py-1 text-xs">
                      {formRecord.ccpType === "CCP-4P" ? "Fe/SUS" : "시간/온도"}
                    </TableHead>
                    <TableHead className="py-1 text-xs">판정</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.sort((a, b) => a.batchSeq - b.batchSeq).map(row => (
                    <TableRow key={row.id} className="text-xs">
                      <TableCell className="py-1">배치 {row.batchSeq}</TableCell>
                      <TableCell className="py-1">{row.equipmentName || "-"}</TableCell>
                      <TableCell className="py-1">{row.measurementTime || "-"}</TableCell>
                      <TableCell className="py-1">
                        {formRecord.ccpType === "CCP-2B" && `${row.heatTimeMin ?? "-"}분 / ${row.heatTempC ?? "-"}°C`}
                        {formRecord.ccpType === "CCP-1B" && `${row.heatTimeMin ?? "-"}분 / ${row.tempCenterC ?? "-"}°C`}
                        {formRecord.ccpType === "CCP-4P" && (
                          <div className="flex gap-1">
                            <OXCell value={row.metalFeMid} />
                            <OXCell value={row.metalSusMid} />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="py-1"><ResultBadge result={row.result} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────────────────────────
export function CcpMonitoringForms({
  batchId, batchNumber, productId, productName, plannedQtyKg, workDate, onFormSaved,
}: Props) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const today = workDate ?? new Date().toISOString().split("T")[0];

  // CCP 기록지 목록 조회
  const { data: formRecords, refetch: refetchForms, isLoading: formsLoading } =
    trpc.ccpForm.getByBatch.useQuery({ batchId }, { enabled: !!batchId });

  // 설비 목록 조회
  const { data: equipmentGroups = [] } = trpc.ccpForm.getEquipmentForBatch.useQuery(
    { batchId }, { enabled: !!batchId }
  );

  // 각 기록지의 행 데이터 조회
  const firstRecord = (formRecords as any[])?.[0];
  const { data: firstRecordFull } = trpc.ccpForm.getById.useQuery(
    { id: firstRecord?.id ?? 0 }, { enabled: !!firstRecord?.id }
  );

  // CCP 인스턴스 기반 CCP 유형 파악
  const { data: ccpInstances } = trpc.ccp.getByBatchId.useQuery(
    { batchId }, { enabled: !!batchId }
  );

  const getOrCreateMutation = trpc.ccpForm.getOrCreate.useMutation({
    onSuccess: () => {
      toast({ title: "CCP 기록지 생성", description: "기록지가 준비되었습니다." });
      refetchForms();
      utils.ccpForm.getById.invalidate();
    },
    onError: (err: any) => toast({ title: "기록지 생성 실패", description: err.message, variant: "destructive" }),
  });

  const resyncRowsMutation = trpc.ccpForm.resyncRows.useMutation({
    onSuccess: (data: any) => {
      if (data.synced > 0) {
        toast({ title: "배치행 재생성 완료", description: `${data.synced}건의 CCP 행이 재동기화되었습니다.` });
      }
      // getByBatch + 각 기록지의 getById 캐시 모두 무효화
      refetchForms();
      utils.ccpForm.getById.invalidate();
    },
    onError: (err: any) => toast({ title: "재동기화 실패", description: err.message, variant: "destructive" }),
  });

  // CCP 기록지 자동 생성 (없으면)
  const handleCreateForms = useCallback(() => {
    if (!ccpInstances || ccpInstances.length === 0) {
      toast({ title: "CCP 인스턴스 없음", description: "먼저 CCP를 자동 생성해주세요.", variant: "destructive" });
      return;
    }
    const uniqueTypes = Array.from(new Set((ccpInstances as any[]).map((c: any) => c.ccpType as string)));
    for (const ccpType of uniqueTypes) {
      const inst = (ccpInstances as any[]).find((c: any) => c.ccpType === ccpType);
      const cl = CCP_CL_DEFAULTS[ccpType] ?? {};
      getOrCreateMutation.mutate({
        batchId, ccpType, workDate: today,
        productId, productName,
        processGroupId: inst?.processGroupId ?? undefined,
        plannedQtyKg,
        clHeatTimeMinLo: cl.heatTimeMinLo, clHeatTimeMinHi: cl.heatTimeMinHi,
        clHeatTempLo: cl.heatTempLo, clPressureMpaLo: cl.pressureMpaLo,
        clProductTempLo: cl.productTempLo,
        clMetalSensitivity: cl.metalSensitivity, clFeMm: cl.feMm, clSusMm: cl.susMm,
      });
    }
  }, [ccpInstances, batchId, today, productId, productName, plannedQtyKg]);

  const handleRefresh = () => { refetchForms(); onFormSaved?.(); };

  // ★ 자동 재동기화: 페이지 로드 시 CCP-1B/2B 누락 행 자동 추가
  //    syncCcpRowsToFormRows는 기존 행을 보호하고 누락분만 추가하므로 안전
  //    getByBatch 결과에 rowCount가 없으므로, batchCount > 1인 기록이 하나라도 있으면 실행
  const [autoSynced, setAutoSynced] = useState(false);
  useEffect(() => {
    if (autoSynced || !formRecords || !Array.isArray(formRecords) || (formRecords as any[]).length === 0) return;
    if (resyncRowsMutation.isPending) return;
    
    // batchCount > 1인 CCP-1B/2B 기록이 있으면 자동 재동기화 (누락 행만 추가, 기존 데이터 보호)
    const hasBatchRecords = (formRecords as any[]).some((fr: any) => 
      fr.ccpType !== "CCP-4P" && fr.batchCount && Number(fr.batchCount) > 1
    );
    
    if (hasBatchRecords) {
      setAutoSynced(true);
      resyncRowsMutation.mutate({ batchId });
    }
  }, [formRecords, autoSynced, batchId]);

  if (formsLoading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        CCP 모니터링 기록지 로딩 중...
      </div>
    );
  }

  const records = (formRecords as CcpFormRecord[] | undefined) ?? [];

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 gap-3">
        <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center">
          <Zap className="h-7 w-7 text-blue-500" />
        </div>
        <p className="text-sm font-semibold">CCP 모니터링 기록지가 없습니다</p>
        <p className="text-xs text-muted-foreground">
          CCP 인스턴스를 기반으로 공식 기록지를 생성하세요.
        </p>
        <Button onClick={handleCreateForms} disabled={getOrCreateMutation.isPending}
          className="mt-1">
          {getOrCreateMutation.isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />생성 중...</>
          ) : (
            <><Plus className="h-4 w-4 mr-2" />CCP 기록지 생성</>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 도움말 */}
      <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded text-xs text-green-800">
        <Calculator className="h-4 w-4 flex-shrink-0 mt-0.5 text-green-600" />
        <div>
          <strong>배치수 자동계산:</strong> BOM 배치목표량(kg) ÷ 계획생산량(kg) = 배치수
          <br />
          <strong>설비 순차할당:</strong> 배치1→설비1, 배치2→설비2, 배치3→설비3 (순환)
          <br />
          <strong>굽기/증숙 공정:</strong> 설비기준에서 시루(교반기/증숙기)가 표시됩니다.
        </div>
      </div>

      {/* CCP 기록지 패널 목록 */}
      {records.map((record) => {
        // 해당 기록지의 행 데이터는 별도 쿼리 필요 (현재는 formRecord 안에 없음)
        return (
          <CcpFormPanelWrapper
            key={record.id}
            formRecord={record}
            batchId={batchId}
            productId={productId}
            plannedQtyKg={plannedQtyKg}
            equipmentGroups={equipmentGroups as any}
            onRefresh={handleRefresh}
          />
        );
      })}

      {/* 기록지 추가 / 행 재동기화 버튼 */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleCreateForms}
          disabled={getOrCreateMutation.isPending} className="flex-1 text-xs">
          <RefreshCw className="h-3 w-3 mr-1" />
          기록지 동기화 (CCP 인스턴스 기반)
        </Button>
        <Button variant="outline" size="sm" onClick={() => resyncRowsMutation.mutate({ batchId })}
          disabled={resyncRowsMutation.isPending} className="flex-1 text-xs text-orange-600 border-orange-300 hover:bg-orange-50">
          {resyncRowsMutation.isPending ? (
            <><Loader2 className="h-3 w-3 animate-spin mr-1" />재동기화 중...</>
          ) : (
            <><Wrench className="h-3 w-3 mr-1" />배치행 재생성 (배치수 변경 시)</>
          )}
        </Button>
      </div>
    </div>
  );
}

// 기록지 래퍼 (행 데이터 별도 조회)
function CcpFormPanelWrapper({
  formRecord, batchId, productId, plannedQtyKg, equipmentGroups, onRefresh,
}: {
  formRecord: CcpFormRecord;
  batchId: number;
  productId?: number;
  plannedQtyKg?: number;
  equipmentGroups: any[];
  onRefresh: () => void;
}) {
  const { data: fullRecord, refetch } = trpc.ccpForm.getById.useQuery(
    { id: formRecord.id }, { enabled: !!formRecord.id }
  );
  const rows: CcpFormRow[] = (fullRecord as any)?.rows ?? [];

  const handleRefresh = () => { refetch(); onRefresh(); };

  return (
    <CcpFormPanel
      formRecord={formRecord}
      rows={rows}
      batchId={batchId}
      productId={productId}
      plannedQtyKg={plannedQtyKg}
      equipmentGroups={equipmentGroups}
      onRefresh={handleRefresh}
    />
  );
}
