/**
 * HR 관련 폼 컴포넌트 모음 — HRManagement.tsx 에서 분리 (2026-04-19)
 *
 * - LeaveRequestForm: 일반 사용자 휴가 신청
 * - ManualAttendanceForm: 관리자가 직원 출퇴근 수기 등록
 * - NewEmployeeForm: 비회원 직원 등록
 * - ManualLeaveForm: 관리자가 수기로 휴가 등록 (자동 승인)
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { todayLocal } from "@/lib/dateUtils";
import { leaveTypeLabels } from "./utils";
import type { Employee, DepartmentOption, PositionOption } from "./types";

// ─────────────────────────────────────────────────────
// 휴가 신청 (일반 사용자)
// ─────────────────────────────────────────────────────
export function LeaveRequestForm({ onSuccess }: { onSuccess: () => void }) {
  const [leaveType, setLeaveType] = useState("annual");
  const [startDate, setStartDate] = useState(todayLocal());
  const [endDate, setEndDate] = useState(todayLocal());
  const [reason, setReason] = useState("");

  const requestMut = trpc.hr.requestLeave.useMutation({
    onSuccess: (r: { message?: string }) => { toast.success(r.message); onSuccess(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">휴가 유형</Label>
        <Select value={leaveType} onValueChange={setLeaveType}>
          <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(leaveTypeLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">시작일</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">종료일</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>
      <div>
        <Label className="text-xs">사유 *</Label>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="휴가 사유" rows={2} />
      </div>
      <Button className="w-full" disabled={requestMut.isPending || !reason.trim()}
        onClick={() => requestMut.mutate({ leaveType: leaveType as "annual" | "sick" | "personal" | "maternity" | "other", startDate, endDate, reason })}>
        {requestMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        휴가 신청
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 출퇴근 수기 등록 (관리자)
// ─────────────────────────────────────────────────────
export function ManualAttendanceForm({ employees, onSubmit, isPending }: {
  employees: Employee[]; onSubmit: (data: Record<string, unknown>) => void; isPending: boolean;
}) {
  const [empId, setEmpId] = useState<number | null>(null);
  const [workDate, setWorkDate] = useState(todayLocal());
  const [clockIn, setClockIn] = useState("09:00:00");
  const [clockOut, setClockOut] = useState("18:00:00");
  const [notes, setNotes] = useState("");

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">인터넷 미사용/누락 직원의 출퇴근을 수기 등록합니다.</p>
      <div>
        <Label className="text-xs">직원 *</Label>
        <select className="w-full h-9 border rounded-lg px-2 text-sm"
          value={empId?.toString() || ""} onChange={(e) => setEmpId(Number(e.target.value) || null)}>
          <option value="">직원 선택</option>
          {employees.map((emp: Employee) => (
            <option key={emp.id} value={emp.userId || emp.id}>{emp.name} {emp.position ? `(${emp.position})` : ""}</option>
          ))}
        </select>
      </div>
      <div>
        <Label className="text-xs">날짜 *</Label>
        <Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} className="h-9 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">출근 시간 *</Label>
          <Input type="time" step="1" value={clockIn} onChange={(e) => setClockIn(e.target.value)} className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">퇴근 시간</Label>
          <Input type="time" step="1" value={clockOut} onChange={(e) => setClockOut(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>
      <div>
        <Label className="text-xs">비고</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="수기 등록 사유" className="h-9 text-sm" />
      </div>
      <Button className="w-full" disabled={isPending || !empId || !workDate || !clockIn}
        onClick={() => onSubmit({ employeeId: empId!, workDate, clockIn, clockOut: clockOut || undefined, notes: notes || undefined })}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        출퇴근 등록
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 비회원 직원 등록 (관리자)
// ─────────────────────────────────────────────────────
export function NewEmployeeForm({ departments, positions, onSubmit, isPending }: {
  departments: DepartmentOption[]; positions: PositionOption[];
  onSubmit: (data: Record<string, unknown>) => void; isPending: boolean;
}) {
  const [name, setName] = useState("");
  const [deptId, setDeptId] = useState<number | undefined>();
  const [posId, setPosId] = useState<number | undefined>();
  const [hireDate, setHireDate] = useState("");

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">회원가입 없이 직원을 등록합니다. 사번이 자동 생성됩니다.</p>
      <div>
        <Label className="text-xs">이름 *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" className="h-9 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">부서</Label>
          <select className="w-full h-9 border rounded-lg px-2 text-sm"
            value={deptId || ""} onChange={(e) => setDeptId(Number(e.target.value) || undefined)}>
            <option value="">선택 안함</option>
            {departments.map((d: DepartmentOption) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">직급</Label>
          <select className="w-full h-9 border rounded-lg px-2 text-sm"
            value={posId || ""} onChange={(e) => setPosId(Number(e.target.value) || undefined)}>
            <option value="">선택 안함</option>
            {positions.map((p: PositionOption) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <Label className="text-xs">입사일</Label>
        <Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} className="h-9 text-sm" />
      </div>
      <Button className="w-full" disabled={isPending || !name.trim()}
        onClick={() => onSubmit({ name: name.trim(), departmentId: deptId, positionId: posId, hireDate: hireDate || undefined })}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        직원 등록
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 수기 연차 등록 (관리자 → 자동 승인)
// ─────────────────────────────────────────────────────
export function ManualLeaveForm({ employees, preselectedId, onSubmit, isPending }: {
  employees: Employee[]; preselectedId: number | null;
  onSubmit: (data: Record<string, unknown>) => void; isPending: boolean;
}) {
  const [empId, setEmpId] = useState<number | null>(preselectedId);
  const [leaveType, setLeaveType] = useState("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const days = startDate && endDate
    ? Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000*60*60*24)) + 1)
    : 0;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">회원가입 안 된 직원 등 수기로 연차를 등록합니다. 자동 승인 처리됩니다.</p>
      <div>
        <Label className="text-xs">직원 선택 *</Label>
        <select className="w-full h-9 border rounded-lg px-2 text-sm"
          value={empId?.toString() || ""} onChange={(e) => setEmpId(Number(e.target.value) || null)}>
          <option value="">직원 선택</option>
          {employees.map((emp: Employee) => (
            <option key={emp.id} value={emp.id}>{emp.name} {emp.position ? `(${emp.position})` : ""}</option>
          ))}
        </select>
      </div>
      <div>
        <Label className="text-xs">유형</Label>
        <select className="w-full h-9 border rounded-lg px-2 text-sm" value={leaveType}
          onChange={(e) => setLeaveType(e.target.value)}>
          <option value="annual">연차</option>
          <option value="sick">병가</option>
          <option value="personal">경조</option>
          <option value="other">기타</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">시작일 *</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">종료일 *</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>
      {days > 0 && <p className="text-xs text-blue-600 font-bold">→ {days}일</p>}
      <div>
        <Label className="text-xs">사유 *</Label>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="연차 사유" className="h-9 text-sm" />
      </div>
      <Button className="w-full" disabled={isPending || !empId || !startDate || !endDate || !reason.trim()}
        onClick={() => onSubmit({ employeeId: empId!, leaveType, startDate, endDate, days, reason })}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        수기 등록 (자동 승인)
      </Button>
    </div>
  );
}
