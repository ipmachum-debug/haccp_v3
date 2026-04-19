/**
 * HR/급여 도메인 타입 — HRManagement.tsx 에서 추출 (2026-04-19)
 * trpc proxy 가 깊은 타입을 완전히 전파하지 못해 명시 추출
 */
import type { RouterOutput } from "@/lib/trpcTypes";

export type Employee = RouterOutput["payroll"]["employees"][number];
export type LeaveBalanceRow = RouterOutput["hr"]["leaveBalance"][number];
export type LeaveRow = RouterOutput["hr"]["leaveList"][number];
export type AttendanceRow = RouterOutput["hr"]["attendanceList"][number];
export type DepartmentOption = RouterOutput["hr"]["departments"][number];
export type PositionOption = RouterOutput["hr"]["positions"][number];
export type UnmatchedUser = RouterOutput["hr"]["unmatchedUsers"][number];
export type InactiveEmployee = RouterOutput["hr"]["employeesByStatus"][number];
export type MatchingStatus = RouterOutput["hr"]["matchingStatus"][number];
