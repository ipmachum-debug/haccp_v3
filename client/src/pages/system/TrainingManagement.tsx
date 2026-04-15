import { useState } from "react";
import { useTabWithUrl } from "@/hooks/useTabWithUrl";
import { trpc } from "@/lib/trpc";
import { jsPDF } from "jspdf";
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

export default function TrainingManagement() {
  const [activeTab, setActiveTab] = useTabWithUrl('tab', 'courses');
  const [isCreateCourseOpen, setIsCreateCourseOpen] = useState(false);
  const [isCreateScheduleOpen, setIsCreateScheduleOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<any>(null);

  // 데이터 조회
  const { data: courses, isLoading: coursesLoading, refetch: refetchCourses } = trpc.training.listCourses.useQuery();
  const { data: schedules, refetch: refetchSchedules } = trpc.training.listUpcomingSchedules.useQuery({});
  const { data: participants, refetch: refetchParticipants } = trpc.training.listParticipantsByUser.useQuery({});

  // 교육 과정 생성
  const createCourseMutation = trpc.training.createCourse.useMutation({
    onSuccess: () => {
      alert("교육 과정이 성공적으로 등록되었습니다.");
      setIsCreateCourseOpen(false);
      refetchCourses();
    },
    onError: (error: any) => {
      alert(`등록 실패: ${error.message}`);
    },
  });

  // 교육 일정 생성
  const createScheduleMutation = trpc.training.createSchedule.useMutation({
    onSuccess: () => {
      alert("교육 일정이 성공적으로 등록되었습니다.");
      setIsCreateScheduleOpen(false);
      refetchSchedules();
    },
  });

  // 참가자 등록
  const addParticipantMutation = trpc.training.registerParticipant.useMutation({
    onSuccess: () => {
      alert("참가자가 등록되었습니다.");
      refetchParticipants();
    },
  });

  // 출석 처리
  const recordAttendanceMutation = trpc.training.recordAttendance.useMutation({
    onSuccess: () => {
      alert("출석이 처리되었습니다.");
      refetchParticipants();
    },
  });

  // 평가 점수 등록
  const recordAssessmentMutation = trpc.training.recordAssessment.useMutation({
    onSuccess: () => {
      alert("평가 점수가 등록되었습니다.");
      refetchParticipants();
    },
  });

  // 수료증 발급
  const issueCertificateMutation = trpc.training.issueCertificate.useMutation({
    onSuccess: () => {
      alert("수료증이 발급되었습니다.");
      refetchParticipants();
    },
  });

  const handleCreateCourse = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    createCourseMutation.mutate({
      courseCode: `COURSE-${Date.now()}`,
      courseName: formData.get("courseName") as string,
      category: "haccp_basic",
      description: formData.get("description") as string || undefined,
      duration: Number(formData.get("durationHours")),
      passingScore: formData.get("passingScore") as string,
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

  const handleDownloadReport = () => {
    if (!courses || courses.length === 0) {
      alert("보고서를 생성할 데이터가 없습니다.");
      return;
    }

    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text("Training Management Report", 105, 20, { align: "center" });
    
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString("ko-KR")}`, 20, 30);
    doc.text(`Total Courses: ${courses.length}`, 20, 36);
    
    let yPos = 46;
    courses.forEach((course: any, index: number) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(12);
      doc.text(`${index + 1}. ${course.courseName}`, 20, yPos);
      yPos += 7;
      
      doc.setFontSize(9);
      doc.text(`Code: ${course.courseCode}`, 25, yPos);
      yPos += 5;
      doc.text(`Category: ${course.category}`, 25, yPos);
      yPos += 5;
      doc.text(`Duration: ${course.duration} hours`, 25, yPos);
      yPos += 5;
      doc.text(`Passing Score: ${course.passingScore}`, 25, yPos);
      yPos += 5;
      if (course.validityPeriod) {
        doc.text(`Validity: ${course.validityPeriod} months`, 25, yPos);
        yPos += 5;
      }
      if (course.description) {
        doc.text(`Description: ${course.description.substring(0, 80)}`, 25, yPos);
        yPos += 5;
      }
      yPos += 5;
    });
    
    doc.save(`training-report-${todayLocal()}.pdf`);
    alert("보고서가 성공적으로 다운로드되었습니다.");
  };

  const getCourseTypeBadge = (type: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline"; label: string }> = {
      initial: { variant: "default", label: "초기 교육" },
      refresher: { variant: "secondary", label: "보수 교육" },
      specialized: { variant: "outline", label: "전문 교육" },
    };
    const config = variants[type] || variants.initial;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getScheduleStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive"; label: string }> = {
      scheduled: { variant: "secondary", label: "예정" },
      in_progress: { variant: "default", label: "진행 중" },
      completed: { variant: "secondary", label: "완료" },
      cancelled: { variant: "destructive", label: "취소" },
    };
    const config = variants[status] || variants.scheduled;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

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
          <Button variant="outline" onClick={handleDownloadReport}>
            <Download className="mr-2 h-4 w-4" />
            보고서 다운로드
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
            <div className="text-2xl font-bold">{participants?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">수료증 발급</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {participants?.filter((p: any) => p.certificateIssued === 1).length || 0}
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
                    <TableHead>교육 유형</TableHead>
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
                        <TableCell>{getCourseTypeBadge(course.courseType)}</TableCell>
                        <TableCell>{course.durationHours}시간</TableCell>
                        <TableCell>{course.passingScore}점</TableCell>
                        <TableCell>
                          {course.validityMonths ? `${course.validityMonths}개월` : "무기한"}
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
              <CardDescription>예정된 교육 일정을 확인하고 관리합니다.</CardDescription>
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
                          {courses?.find((c: any) => c.id === schedule.courseId)?.courseName}
                        </TableCell>
                        <TableCell>
                          {new Date(schedule.scheduledDate).toLocaleDateString("ko-KR")}
                        </TableCell>
                        <TableCell>
                          {schedule.startTime} - {schedule.endTime}
                        </TableCell>
                        <TableCell>{schedule.location || "-"}</TableCell>
                        <TableCell>{schedule.instructorName || "-"}</TableCell>
                        <TableCell>
                          {schedule.currentParticipants || 0}
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
              <CardDescription>교육 참가자의 출석 및 평가를 관리합니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>참가자 ID</TableHead>
                    <TableHead>교육 일정 ID</TableHead>
                    <TableHead>출석</TableHead>
                    <TableHead>평가 점수</TableHead>
                    <TableHead>수료 여부</TableHead>
                    <TableHead>수료증</TableHead>
                    <TableHead>작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {participants && participants.length > 0 ? (
                    participants.map((participant: any) => (
                      <TableRow key={participant.id}>
                        <TableCell className="font-medium">{participant.userId}</TableCell>
                        <TableCell>{participant.scheduleId}</TableCell>
                        <TableCell>
                          {participant.attended === 1 ? (
                            <Badge variant="default">출석</Badge>
                          ) : (
                            <Badge variant="secondary">미출석</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {participant.assessmentScore ? `${participant.assessmentScore}점` : "-"}
                        </TableCell>
                        <TableCell>
                          {participant.passed === 1 ? (
                            <Badge variant="default">
                              <CheckCircle className="mr-1 h-3 w-3" />
                              수료
                            </Badge>
                          ) : (
                            <Badge variant="secondary">미수료</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {participant.certificateIssued === 1 ? (
                            <Badge variant="outline">
                              <Award className="mr-1 h-3 w-3" />
                              발급 완료
                            </Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {participant.attended !== 1 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  recordAttendanceMutation.mutate({
                                    id: participant.id,
                                    attendanceStatus: "attended",
                                  })
                                }
                              >
                                출석
                              </Button>
                            )}
                            {participant.attended === 1 && !participant.assessmentScore && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const score = prompt("평가 점수를 입력하세요:");
                                  if (score) {
                                    const scoreNum = Number(score);
                                    recordAssessmentMutation.mutate({
                                      id: participant.id,
                                      assessmentScore: scoreNum,
                                      passed: scoreNum >= 80 ? 1 : 0,
                                    });
                                  }
                                }}
                              >
                                평가
                              </Button>
                            )}
                            {participant.passed === 1 && participant.certificateIssued !== 1 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  issueCertificateMutation.mutate({
                                    participantId: participant.id,
                                    certificateUrl: `/certificates/${participant.id}.pdf`,
                                  })
                                }
                              >
                                수료증
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        등록된 참가자가 없습니다.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
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
                <Label htmlFor="courseType">교육 유형 *</Label>
                <Select name="courseType" required>
                  <SelectTrigger>
                    <SelectValue placeholder="교육 유형 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="initial">초기 교육</SelectItem>
                    <SelectItem value="refresher">보수 교육</SelectItem>
                    <SelectItem value="specialized">전문 교육</SelectItem>
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
                    min="1"
                    placeholder="예: 8"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="passingScore">합격 점수 *</Label>
                  <Input
                    id="passingScore"
                    name="passingScore"
                    placeholder="예: 80"
                    required
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
    </div>
  );
}
