import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { useTabWithUrl } from "@/hooks/useTabWithUrl";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Plus, Users, Calendar, Download, Award, CheckCircle } from "lucide-react";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

import { todayLocal } from "../../lib/dateUtils";
import { toast } from "sonner";
import { TRAINING_CATEGORY_LABELS, TRAINING_ATTENDANCE_LABELS, formatTrainingMinutes } from "@shared/trainingLabels";

/**
 * HACCP 교육 과정·일정·참가자 (h_training_courses / schedules / participants)
 * 2026-10-18 Codex 교육 점검 후속:
 *  - EDU-02 과정 '상세' · 일정 '관리' 창 (일정별 참가자 추가·출석·평가·수료증)
 *  - EDU-03 목록 필드 이름을 저장 이름과 맞춤 (duration·validityPeriod·trainerName·registeredCount)
 *  - EDU-04 보고서 PDF 는 서버에서 한글 폰트로
 *  참석 · 평가 합격 · 수료증은 서로 다른 사실 — 하나가 다른 것을 자동으로 만들지 않는다.
 */
function downloadBase64Pdf(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ymd = (v: unknown) => (v ? (v instanceof Date ? todayLocalOf(v) : String(v).slice(0, 10)) : "-");
function todayLocalOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type ParticipantRow = {
  id: number; scheduleId: number; userId: number | null; employeeId: number | null; employeeCode: string | null; userName: string | null; attendanceStatus: string | null;
  assessmentScore: string | null; passed: number | null; certificateIssued: number | null; certificateNumber: string | null;
  expiryDate: string | null; scheduledDate: string | null; courseName: string | null; passingScore: string | null;
};

/** 참가자 표 — 참가자 탭과 일정 관리 창이 같이 쓴다 */
function ParticipantTable({ rows, showSchedule, onChanged }: { rows: ParticipantRow[]; showSchedule: boolean; onChanged: () => void }) {
  // 평가 점수 입력 — 앱 안 창 (window.prompt 는 앱 안 브라우저에서 열리지 않음, Codex #592 검증)
  const [scoring, setScoring] = useState<ParticipantRow | null>(null);
  const [scoreText, setScoreText] = useState("");
  const done = (msg: string) => { toast.success(msg); onChanged(); };
  const fail = (e: { message: string }) => toast.error(e.message);
  const attendance = trpc.haccpTraining.recordAttendance.useMutation({ onSuccess: () => done("출석 상태를 저장했습니다."), onError: fail });
  const assessment = trpc.haccpTraining.recordAssessment.useMutation({
    onSuccess: (r: { passed: 0 | 1 | null }) => { setScoring(null); done(r.passed == null ? "평가 점수를 저장했습니다 (과정에 합격 점수가 없어 합격 판정은 하지 않음)." : r.passed ? "평가 점수 저장 — 합격" : "평가 점수 저장 — 불합격"); },
    onError: fail,
  });
  const certificate = trpc.haccpTraining.issueCertificate.useMutation({ onSuccess: (r: { certificateNumber: string; expiryDate: string | null }) => done(`수료증 ${r.certificateNumber} 발급${r.expiryDate ? ` · 재교육 기한 ${r.expiryDate}` : ""}`), onError: fail });
  const cancel = trpc.haccpTraining.cancelParticipant.useMutation({ onSuccess: () => done("참가 등록을 취소했습니다."), onError: fail });

  const scoreNum = scoreText.trim() === "" ? NaN : Number(scoreText);
  const scoreValid = Number.isFinite(scoreNum) && scoreNum >= 0 && scoreNum <= 100;
  const passLine = scoring?.passingScore != null ? Number(scoring.passingScore) : null;
  return (
    <>
    <Dialog open={!!scoring} onOpenChange={(o) => { if (!o) setScoring(null); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>평가 점수 — {scoring?.userName ?? ""}</DialogTitle>
          <DialogDescription>
            {scoring?.courseName ?? ""} {passLine != null ? `· 합격 ${passLine}점 이상` : "· 이 과정은 합격 점수가 없어 합격 판정을 하지 않습니다"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (scoring && scoreValid) assessment.mutate({ id: scoring.id, assessmentScore: scoreNum }); }}>
          <div className="grid gap-2">
            <Label htmlFor="assessmentScore">점수 (0~100)</Label>
            <Input id="assessmentScore" type="number" inputMode="decimal" min={0} max={100} step="0.5" autoFocus
              value={scoreText} onChange={(e) => setScoreText(e.target.value)} className="h-12 text-lg" />
            <p className="text-sm min-h-5">
              {!scoreText.trim() ? "" : !scoreValid ? <span className="text-red-600">0~100 사이로 입력하세요.</span>
                : passLine == null ? <span className="text-muted-foreground">점수만 기록합니다.</span>
                : scoreNum >= passLine ? <span className="text-emerald-700 font-medium">합격 예정</span>
                : <span className="text-red-600 font-medium">불합격 예정</span>}
            </p>
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => setScoring(null)}>취소</Button>
            <Button type="submit" disabled={!scoreValid || assessment.isPending}>{assessment.isPending ? "저장 중..." : "저장"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>참가자</TableHead>
          {showSchedule && <TableHead>교육</TableHead>}
          <TableHead>출석</TableHead>
          <TableHead>평가 점수</TableHead>
          <TableHead>합격</TableHead>
          <TableHead>수료증</TableHead>
          <TableHead>작업</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length ? rows.map((p) => {
          const attended = p.attendanceStatus === "attended";
          return (
            <TableRow key={p.id}>
              <TableCell className="font-medium">
                {p.userName ?? (p.employeeId ? `구성원 #${p.employeeId}` : `사용자 #${p.userId}`)}
                {p.employeeCode && <span className="ml-1 text-xs text-muted-foreground">{p.employeeCode}</span>}
              </TableCell>
              {showSchedule && <TableCell className="text-xs">{p.courseName ?? "-"} · {p.scheduledDate ?? "-"}</TableCell>}
              <TableCell>
                <Badge variant={attended ? "default" : "secondary"}>{TRAINING_ATTENDANCE_LABELS[p.attendanceStatus ?? "registered"] ?? p.attendanceStatus}</Badge>
              </TableCell>
              <TableCell>{p.assessmentScore != null ? `${Number(p.assessmentScore)}점` : "-"}</TableCell>
              <TableCell>
                {p.passed == null ? "-" : Number(p.passed) === 1
                  ? <Badge variant="default"><CheckCircle className="mr-1 h-3 w-3" />합격</Badge>
                  : <Badge variant="secondary">불합격</Badge>}
              </TableCell>
              <TableCell className="text-xs">
                {Number(p.certificateIssued) === 1
                  ? <span className="inline-flex items-center gap-1"><Award className="h-3 w-3" />{p.certificateNumber}{p.expiryDate ? ` (~${p.expiryDate})` : ""}</span>
                  : "-"}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {!attended && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => attendance.mutate({ id: p.id, attendanceStatus: "attended" })}>출석</Button>
                      {p.attendanceStatus !== "absent" && (
                        <Button size="sm" variant="ghost" onClick={() => attendance.mutate({ id: p.id, attendanceStatus: "absent" })}>결석</Button>
                      )}
                    </>
                  )}
                  {attended && Number(p.certificateIssued) !== 1 && (
                    <Button size="sm" variant="outline" onClick={() => {
                      setScoring(p);
                      setScoreText(p.assessmentScore != null ? String(Number(p.assessmentScore)) : "");
                    }}>평가</Button>
                  )}
                  {attended && Number(p.certificateIssued) !== 1 && (p.passingScore == null || Number(p.passed) === 1) && (
                    <Button size="sm" variant="outline" onClick={() => certificate.mutate({ participantId: p.id })}>수료증</Button>
                  )}
                  {Number(p.certificateIssued) !== 1 && (
                    <Button size="sm" variant="ghost" className="text-red-600" onClick={() => { if (confirm("참가 등록을 취소할까요?")) cancel.mutate({ id: p.id }); }}>취소</Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        }) : (
          <TableRow>
            <TableCell colSpan={showSchedule ? 7 : 6} className="text-center text-muted-foreground">등록된 참가자가 없습니다.</TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
    </>
  );
}

/** 일정 '관리' — 일정 정보 · 상태 · 참가자 추가와 관리 */
function ScheduleManageDialog({ schedule, courseName, onClose, onChanged }: { schedule: any; courseName: string; onClose: () => void; onChanged: () => void }) {
  const utils = trpc.useUtils();
  const { data: rows = [], refetch } = trpc.haccpTraining.listParticipants.useQuery({ scheduleId: schedule.id });
  // 참가자 = 구성원 관리 명단 (로그인 계정 없는 직원 포함, Codex #592 EDU-06)
  const { data: members = [] } = trpc.haccpTraining.listMemberOptions.useQuery();
  const [memberId, setMemberId] = useState<string>("");
  const changed = () => { refetch(); onChanged(); utils.haccpTraining.listParticipants.invalidate(); };
  const register = trpc.haccpTraining.registerParticipant.useMutation({
    onSuccess: () => { toast.success("참가자를 등록했습니다."); setMemberId(""); changed(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const updateSchedule = trpc.haccpTraining.updateSchedule.useMutation({
    onSuccess: () => { toast.success("일정 상태를 저장했습니다."); onChanged(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const registeredEmp = new Set((rows as ParticipantRow[]).map((r) => r.employeeId).filter((x) => x != null));
  const registeredUser = new Set((rows as ParticipantRow[]).map((r) => r.userId).filter((x) => x != null));
  const choices = (members as Array<{ id: number; name: string; employeeCode: string | null; userId: number | null }>)
    .filter((m) => !registeredEmp.has(m.id) && !(m.userId != null && registeredUser.has(m.userId)));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{courseName} · {ymd(schedule.scheduledDate)}</DialogTitle>
          <DialogDescription>
            {schedule.startTime ?? "-"} ~ {schedule.endTime ?? "-"} · 장소 {schedule.location || "-"} · 강사 {schedule.trainerName || "-"}
            {schedule.maxParticipants ? ` · 정원 ${schedule.maxParticipants}명` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <Label className="text-xs">일정 상태</Label>
            <Select value={schedule.status ?? "scheduled"} onValueChange={(v) => updateSchedule.mutate({ id: schedule.id, status: v as any })}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">예정</SelectItem>
                <SelectItem value="in_progress">진행 중</SelectItem>
                <SelectItem value="completed">완료</SelectItem>
                <SelectItem value="cancelled">취소</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1 flex-1 min-w-[220px]">
            <Label className="text-xs">참가자 추가 (구성원 명단)</Label>
            <div className="flex gap-2">
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger className="h-9"><SelectValue placeholder={choices.length ? "구성원 선택" : "추가할 구성원이 없습니다 (구성원 관리에서 등록)"} /></SelectTrigger>
                <SelectContent>
                  {choices.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}{m.employeeCode ? ` (${m.employeeCode})` : ""}{m.userId == null ? " · 계정 없음" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-9" disabled={!memberId || register.isPending}
                onClick={() => register.mutate({ scheduleId: schedule.id, employeeId: Number(memberId) })}>
                <Users className="mr-1 h-4 w-4" />등록
              </Button>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          출석 · 평가 합격 · 수료증은 따로 처리합니다. 일정 상태를 '완료'로 바꿔도 참가자가 자동으로 출석·수료되지 않습니다.
        </p>
        <div className="max-h-[50vh] overflow-auto">
          <ParticipantTable rows={rows as ParticipantRow[]} showSchedule={false} onChanged={changed} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 과정 '상세' — 과정 정보와 그 과정의 일정 */
function CourseDetailDialog({ course, onClose, onManageSchedule }: { course: any; onClose: () => void; onManageSchedule: (s: any) => void }) {
  const { data: schedules = [] } = trpc.haccpTraining.listSchedulesByCourse.useQuery({ courseId: course.id });
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{course.courseName}</DialogTitle>
          <DialogDescription>{course.courseCode} · {TRAINING_CATEGORY_LABELS[course.category] ?? course.category}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div><span className="text-muted-foreground text-xs block">교육 시간</span>{formatTrainingMinutes(course.duration)}</div>
          <div><span className="text-muted-foreground text-xs block">합격 점수</span>{course.passingScore != null ? `${Number(course.passingScore)}점` : "없음"}</div>
          <div><span className="text-muted-foreground text-xs block">유효 기간</span>{course.validityPeriod ? `${course.validityPeriod}개월` : "기한 없음"}</div>
        </div>
        {course.description && <p className="text-sm whitespace-pre-wrap">{course.description}</p>}
        <div>
          <h4 className="text-sm font-semibold mb-2">이 과정의 일정</h4>
          <Table>
            <TableHeader>
              <TableRow><TableHead>날짜</TableHead><TableHead>시간</TableHead><TableHead>강사</TableHead><TableHead>참가자</TableHead><TableHead>상태</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {(schedules as any[]).length ? (schedules as any[]).map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{ymd(s.scheduledDate)}</TableCell>
                  <TableCell>{s.startTime ?? "-"} ~ {s.endTime ?? "-"}</TableCell>
                  <TableCell>{s.trainerName || "-"}</TableCell>
                  <TableCell>{s.registeredCount ?? 0}{s.maxParticipants ? ` / ${s.maxParticipants}` : ""}</TableCell>
                  <TableCell>{getScheduleStatusBadge(s.status)}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => onManageSchedule(s)}>관리</Button></TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">등록된 일정이 없습니다.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getScheduleStatusBadge(status: string) {
  const variants: Record<string, { variant: "default" | "secondary" | "destructive"; label: string }> = {
    scheduled: { variant: "secondary", label: "예정" },
    in_progress: { variant: "default", label: "진행 중" },
    completed: { variant: "secondary", label: "완료" },
    cancelled: { variant: "destructive", label: "취소" },
  };
  const config = variants[status] || variants.scheduled;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export default function TrainingManagement() {
  const [activeTab, setActiveTab] = useTabWithUrl('tab', 'courses');
  const [isCreateCourseOpen, setIsCreateCourseOpen] = useState(false);
  // ?new=course 로 들어오면 과정 등록 창을 연다 (교육과정 목록의 '등록' — 2026-10-14 깨진 링크 정리)
  const newParam = new URLSearchParams(useSearch()).get("new");
  useEffect(() => { if (newParam === "course") setIsCreateCourseOpen(true); }, [newParam]);
  const [isCreateScheduleOpen, setIsCreateScheduleOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<any>(null);
  const [category, setCategory] = useState<string>("haccp_basic");

  // 데이터 조회
  const { data: courses, isLoading: coursesLoading, refetch: refetchCourses } = trpc.haccpTraining.listCourses.useQuery();
  const { data: schedules, refetch: refetchSchedules } = trpc.haccpTraining.listSchedules.useQuery();
  const { data: participants = [], refetch: refetchParticipants } = trpc.haccpTraining.listParticipants.useQuery({});
  const refetchAll = () => { refetchSchedules(); refetchParticipants(); };

  // 교육 과정 생성
  const createCourseMutation = trpc.haccpTraining.createCourse.useMutation({
    onSuccess: () => {
      toast.success("교육 과정을 등록했습니다.");
      setIsCreateCourseOpen(false);
      refetchCourses();
    },
    onError: (error: { message: string }) => toast.error(`등록 실패: ${error.message}`),
  });

  // 교육 일정 생성
  const createScheduleMutation = trpc.haccpTraining.createSchedule.useMutation({
    onSuccess: () => {
      toast.success("교육 일정을 등록했습니다.");
      setIsCreateScheduleOpen(false);
      refetchSchedules();
    },
    onError: (error: { message: string }) => toast.error(`등록 실패: ${error.message}`),
  });

  const reportMutation = trpc.haccpTraining.courseReportPdf.useMutation({
    onSuccess: (r: { base64: string }) => { downloadBase64Pdf(r.base64, `training-report-${todayLocal()}.pdf`); toast.success("보고서를 내려받았습니다."); },
    onError: (error: { message: string }) => toast.error(`보고서 생성 실패: ${error.message}`),
  });

  const handleCreateCourse = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const passing = String(formData.get("passingScore") ?? "").trim();

    createCourseMutation.mutate({
      courseCode: `COURSE-${Date.now()}`,
      courseName: formData.get("courseName") as string,
      category: category as any,
      description: formData.get("description") as string || undefined,
      // 교육 시간은 분으로 저장 (스키마·과정 목록과 같음). 화면은 시간 단위로 입력
      duration: Math.round(Number(formData.get("durationHours")) * 60),
      passingScore: passing || undefined,
      hasAssessment: passing ? 1 : 0,
      validityPeriod: Number(formData.get("validityMonths")) || undefined,
    });
  };

  const handleCreateSchedule = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    createScheduleMutation.mutate({
      courseId: Number(formData.get("courseId")),
      siteId: 1, // Default site
      scheduledDate: formData.get("scheduledDate") as string,
      startTime: formData.get("startTime") as string || undefined,
      endTime: formData.get("endTime") as string || undefined,
      location: formData.get("location") as string || undefined,
      trainerName: formData.get("instructorName") as string || undefined,
      maxParticipants: Number(formData.get("maxParticipants")) || undefined,
    });
  };

  const courseNameOf = (courseId: number) => courses?.find((c: any) => c.id === courseId)?.courseName ?? `과정 #${courseId}`;

  if (coursesLoading) {
    return <div className="p-6">로딩 중...</div>;
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <GraduationCap className="h-8 w-8" />
            교육 훈련 관리
          </h1>
          <p className="text-muted-foreground mt-2">
            교육 과정, 일정, 참가자를 관리하고 수료증을 발급합니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => reportMutation.mutate()} disabled={reportMutation.isPending}>
            <Download className="mr-2 h-4 w-4" />
            {reportMutation.isPending ? "만드는 중..." : "보고서 다운로드"}
          </Button>
          <Button onClick={() => setIsCreateCourseOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            교육 과정 등록
          </Button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">전체 교육 과정</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{courses?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">예정된 교육</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {schedules?.filter((s: any) => s.status === "scheduled").length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">전체 참가자</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(participants as ParticipantRow[]).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">수료증 발급</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(participants as ParticipantRow[]).filter((p) => Number(p.certificateIssued) === 1).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 탭 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="courses">교육 과정</TabsTrigger>
          <TabsTrigger value="schedules">교육 일정</TabsTrigger>
          <TabsTrigger value="participants">참가자 관리</TabsTrigger>
        </TabsList>

        {/* 교육 과정 탭 */}
        <TabsContent value="courses" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>교육 과정 목록</CardTitle>
              <CardDescription>등록된 교육 과정을 확인하고 관리합니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>교육 과정명</TableHead>
                    <TableHead>분류</TableHead>
                    <TableHead>교육 시간</TableHead>
                    <TableHead>합격 점수</TableHead>
                    <TableHead>유효 기간</TableHead>
                    <TableHead>작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {courses && courses.length > 0 ? (
                    courses.map((course: any) => (
                      <TableRow key={course.id}>
                        <TableCell className="font-medium">{course.courseName}</TableCell>
                        <TableCell><Badge variant="outline">{TRAINING_CATEGORY_LABELS[course.category] ?? course.category}</Badge></TableCell>
                        <TableCell>{formatTrainingMinutes(course.duration)}</TableCell>
                        <TableCell>{course.passingScore != null ? `${Number(course.passingScore)}점` : "-"}</TableCell>
                        <TableCell>
                          {course.validityPeriod ? `${course.validityPeriod}개월` : "기한 없음"}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedCourse(course)}
                          >
                            상세
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        등록된 교육 과정이 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 교육 일정 탭 */}
        <TabsContent value="schedules" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setIsCreateScheduleOpen(true)}>
              <Calendar className="mr-2 h-4 w-4" />
              교육 일정 등록
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>교육 일정 목록</CardTitle>
              <CardDescription>교육 일정과 참가자를 관리합니다 (지난 일정 포함, 최근 순).</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>교육 과정</TableHead>
                    <TableHead>교육 날짜</TableHead>
                    <TableHead>시간</TableHead>
                    <TableHead>장소</TableHead>
                    <TableHead>강사</TableHead>
                    <TableHead>참가자</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules && schedules.length > 0 ? (
                    schedules.map((schedule: any) => (
                      <TableRow key={schedule.id}>
                        <TableCell className="font-medium">
                          {courseNameOf(schedule.courseId)}
                        </TableCell>
                        <TableCell>
                          {ymd(schedule.scheduledDate)}
                        </TableCell>
                        <TableCell>
                          {schedule.startTime} - {schedule.endTime}
                        </TableCell>
                        <TableCell>{schedule.location || "-"}</TableCell>
                        <TableCell>{schedule.trainerName || "-"}</TableCell>
                        <TableCell>
                          {schedule.registeredCount || 0}
                          {schedule.maxParticipants ? ` / ${schedule.maxParticipants}` : ""}
                        </TableCell>
                        <TableCell>{getScheduleStatusBadge(schedule.status)}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedSchedule(schedule)}
                          >
                            관리
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        등록된 교육 일정이 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 참가자 관리 탭 */}
        <TabsContent value="participants" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>참가자 목록</CardTitle>
              <CardDescription>전체 교육 참가자의 출석·평가·수료증. 참가자 추가는 교육 일정의 '관리'에서 합니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <ParticipantTable rows={participants as ParticipantRow[]} showSchedule onChanged={refetchAll} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 교육 과정 등록 다이얼로그 */}
      <Dialog open={isCreateCourseOpen} onOpenChange={setIsCreateCourseOpen}>
        <DialogContent className="max-w-2xl">
          <form onSubmit={handleCreateCourse}>
            <DialogHeader>
              <DialogTitle>새로운 교육 과정 등록</DialogTitle>
              <DialogDescription>
                HACCP 인증을 위한 교육 과정을 등록합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="courseName">교육 과정명 *</Label>
                <Input
                  id="courseName"
                  name="courseName"
                  placeholder="예: HACCP 기본 교육"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="category">분류 *</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TRAINING_CATEGORY_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">교육 설명</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="교육 과정에 대한 상세 설명"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="durationHours">교육 시간 (시간) *</Label>
                  <Input
                    id="durationHours"
                    name="durationHours"
                    type="number"
                    min="0.5"
                    step="0.5"
                    placeholder="예: 1.5"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="passingScore">합격 점수 (평가 없는 교육은 비움)</Label>
                  <Input
                    id="passingScore"
                    name="passingScore"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="예: 80"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="validityMonths">유효 기간 (개월)</Label>
                <Input
                  id="validityMonths"
                  name="validityMonths"
                  type="number"
                  min="1"
                  placeholder="예: 12 (비워두면 무기한)"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateCourseOpen(false)}>
                취소
              </Button>
              <Button type="submit" disabled={createCourseMutation.isPending}>
                {createCourseMutation.isPending ? "등록 중..." : "등록"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 교육 일정 등록 다이얼로그 */}
      <Dialog open={isCreateScheduleOpen} onOpenChange={setIsCreateScheduleOpen}>
        <DialogContent className="max-w-2xl">
          <form onSubmit={handleCreateSchedule}>
            <DialogHeader>
              <DialogTitle>새로운 교육 일정 등록</DialogTitle>
              <DialogDescription>
                교육 과정의 일정을 등록합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="courseId">교육 과정 *</Label>
                <Select name="courseId" required>
                  <SelectTrigger>
                    <SelectValue placeholder="교육 과정 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {courses?.map((course: any) => (
                      <SelectItem key={course.id} value={course.id.toString()}>
                        {course.courseName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="scheduledDate">교육 날짜 *</Label>
                <Input
                  id="scheduledDate"
                  name="scheduledDate"
                  type="date"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="startTime">시작 시간 *</Label>
                  <Input
                    id="startTime"
                    name="startTime"
                    type="time"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="endTime">종료 시간 *</Label>
                  <Input
                    id="endTime"
                    name="endTime"
                    type="time"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="location">교육 장소</Label>
                <Input
                  id="location"
                  name="location"
                  placeholder="예: 본사 회의실"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="instructorName">강사명</Label>
                <Input
                  id="instructorName"
                  name="instructorName"
                  placeholder="예: 홍길동"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="maxParticipants">최대 참가자 수</Label>
                <Input
                  id="maxParticipants"
                  name="maxParticipants"
                  type="number"
                  min="1"
                  placeholder="예: 30"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateScheduleOpen(false)}>
                취소
              </Button>
              <Button type="submit" disabled={createScheduleMutation.isPending}>
                {createScheduleMutation.isPending ? "등록 중..." : "등록"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {selectedCourse && (
        <CourseDetailDialog course={selectedCourse} onClose={() => setSelectedCourse(null)}
          onManageSchedule={(sch) => { setSelectedCourse(null); setSelectedSchedule(sch); }} />
      )}
      {selectedSchedule && (
        <ScheduleManageDialog schedule={(schedules as any[] | undefined)?.find((x) => x.id === selectedSchedule.id) ?? selectedSchedule}
          courseName={courseNameOf(selectedSchedule.courseId)}
          onClose={() => setSelectedSchedule(null)} onChanged={refetchAll} />
      )}
    </div>
  );
}
