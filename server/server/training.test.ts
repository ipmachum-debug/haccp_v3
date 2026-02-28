import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { Context } from "./_core/context";

/**
 * 교육 훈련 관리 시스템 API 테스트
 */

const createTestContext = (userId: number = 1, role: "admin" | "user" = "admin"): Context => ({
  user: {
    id: userId,
    email: "test@example.com",
    name: "Test User",
    role,
    isActive: 1
  }
});

describe("교육 훈련 관리 시스템", () => {
  let courseId: number = 0;
  let scheduleId: number = 0;
  let participantId: number = 0;

  describe("교육 과정 관리", () => {
    it("새로운 교육 과정을 생성할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.training.createCourse({
        courseCode: "HACCP-BASIC-001",
        courseName: "HACCP 기초 교육",
        category: "haccp_basic",
        description: "HACCP 7원칙 및 12절차 이해",
        objectives: "HACCP 기본 개념 습득 및 실무 적용 능력 배양",
        duration: 240, // 4시간
        isMandatory: 1,
        targetRoles: "전 직원",
        validityPeriod: 12, // 12개월
        hasAssessment: 1,
        passingScore: "70.00"
      });

      expect(result).toHaveProperty("id");
      expect(typeof result.id).toBe("number");
      courseId = result.id;
    });

    it("교육 과정 상세 정보를 조회할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.training.getCourse({ id: courseId });

      expect(result).toBeDefined();
      expect(result.courseCode).toBe("HACCP-BASIC-001");
      expect(result.courseName).toBe("HACCP 기초 교육");
      expect(result.isMandatory).toBe(1);
    });

    it("전체 교육 과정 목록을 조회할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.training.listCourses();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("카테고리별 교육 과정을 조회할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.training.listCoursesByCategory({ category: "haccp_basic" });

      expect(Array.isArray(result)).toBe(true);
      expect(result.every((c) => c.category === "haccp_basic")).toBe(true);
    });

    it("필수 교육 과정만 조회할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.training.listMandatoryCourses();

      expect(Array.isArray(result)).toBe(true);
      expect(result.every((c) => c.isMandatory === 1)).toBe(true);
    });

    it("교육 과정을 수정할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      await caller.training.updateCourse({
        id: courseId,
        duration: 300, // 5시간으로 변경
        passingScore: "80.00"
      });

      const result = await caller.training.getCourse({ id: courseId });
      expect(result.duration).toBe(300);
      expect(result.passingScore).toBe("80.00");
    });
  });

  describe("교육 일정 관리", () => {
    it("교육 일정을 생성할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + 7);

      const result = await caller.training.createSchedule({
        courseId,
        siteId: 1,
        scheduledDate: scheduledDate.toISOString().split("T")[0],
        startTime: "09:00",
        endTime: "13:00",
        location: "본사 교육장",
        trainerName: "김강사",
        maxParticipants: 30,
        notes: "HACCP 기초 교육 1차"
      });

      expect(result).toHaveProperty("id");
      scheduleId = result.id;
    });

    it("교육 일정 상세 정보를 조회할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.training.getSchedule({ id: scheduleId });

      expect(result).toBeDefined();
      expect(result.location).toBe("본사 교육장");
      expect(result.maxParticipants).toBe(30);
    });

    it("과정별 교육 일정을 조회할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.training.listSchedulesByCourse({ courseId });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("예정된 교육 일정을 조회할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.training.listUpcomingSchedules({ siteId: 1 });

      expect(Array.isArray(result)).toBe(true);
    });

    it("교육 일정을 수정할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      await caller.training.updateSchedule({
        id: scheduleId,
        location: "본사 대강당",
        maxParticipants: 50
      });

      const result = await caller.training.getSchedule({ id: scheduleId });
      expect(result.location).toBe("본사 대강당");
      expect(result.maxParticipants).toBe(50);
    });
  });

  describe("교육 참가자 관리", () => {
    it("교육에 참가 등록할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.training.registerParticipant({
        scheduleId,
        userId: 1
      });

      expect(result).toHaveProperty("id");
      participantId = result.id;
    });

    it("참가자 정보를 조회할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.training.getParticipant({ id: participantId });

      expect(result).toBeDefined();
      expect(result.scheduleId).toBe(scheduleId);
      expect(result.attendanceStatus).toBe("registered");
    });

    it("일정별 참가자 목록을 조회할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.training.listParticipantsBySchedule({ scheduleId });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("사용자별 교육 이력을 조회할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.training.listParticipantsByUser({ userId: 1 });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("출석을 처리할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      await caller.training.recordAttendance({
        id: participantId,
        attendanceStatus: "attended"
      });

      const result = await caller.training.getParticipant({ id: participantId });
      expect(result.attendanceStatus).toBe("attended");
    });

    it("평가 점수를 등록할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      await caller.training.recordAssessment({
        id: participantId,
        assessmentScore: 85,
        passed: 1
      });

      const result = await caller.training.getParticipant({ id: participantId });
      expect(result.assessmentScore).toBe("85.00");
      expect(result.passed).toBe(1);
    });

    it("수료증을 발급할 수 있어야 함", async () => {
      if (participantId === 0) {
        console.log("participantId not initialized, skipping test");
        return;
      }

      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.training.issueCertificate({
        participantId,
        certificateUrl: "https://example.com/certificates/cert-001.pdf"
      });

      expect(result).toHaveProperty("certificateNumber");
      expect(result).toHaveProperty("expiryDate");

      const participant = await caller.training.getParticipant({ id: participantId });
      expect(participant.certificateIssued).toBe(1);
      expect(participant.certificateNumber).toBeDefined();
    });
  });

  describe("교육 만료 알림", () => {
    it("사용자별 알림 목록을 조회할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.training.listRemindersByUser({ userId: 1 });

      expect(Array.isArray(result)).toBe(true);
    });

    it("발송 대기 중인 알림 목록을 조회할 수 있어야 함", async () => {
      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.training.listPendingReminders();

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("교육 과정 아카이브", () => {
    it("교육 과정을 삭제(아카이브)할 수 있어야 함", async () => {
      if (courseId === 0) {
        console.log("courseId not initialized, skipping test");
        return;
      }

      const caller = appRouter.createCaller(createTestContext());
      const result = await caller.training.deleteCourse({ id: courseId });

      expect(result.success).toBe(true);

      // 아카이브된 과정은 일반 목록에서 조회되지 않음
      const courses = await caller.training.listCourses();
      const archived = courses.find((c) => c.id === courseId);
      expect(archived).toBeUndefined();
    });
  });
});
