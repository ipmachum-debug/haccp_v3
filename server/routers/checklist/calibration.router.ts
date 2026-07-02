import { z } from "zod";
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { getDb } from "../../db";
import { calibrationEquipment, calibrationRecords } from "../../../drizzle/schema/calibration";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// 교정일 + 주기(개월) → 다음 교정일 자동 계산
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// 항목별 보정값 스키마 (results_json 에 영속화)
const resultItemSchema = z.object({
  category: z.string(),
  calibrationValue: z.number(),
  panelValue: z.number(),
  deviation: z.number(),
  pass: z.boolean(),
});

export const calibrationRouter = router({
  listEquipments: tenantRequiredProcedure.input(z.object({ search: z.string().optional(), isActive: z.boolean().optional() }).optional()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (db === null) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
    const conditions = [eq(calibrationEquipment.tenantId, Number(ctx.tenantId))];
    if (input?.isActive !== undefined) conditions.push(eq(calibrationEquipment.isActive, input.isActive));
    let equipments = await db.select().from(calibrationEquipment).where(and(...conditions)).orderBy(desc(calibrationEquipment.createdAt));
    const q = input?.search?.trim().toLowerCase();
    if (q) {
      equipments = equipments.filter((e) =>
        e.name.toLowerCase().includes(q) ||
        e.code.toLowerCase().includes(q) ||
        (e.model ?? "").toLowerCase().includes(q) ||
        (e.manufacturer ?? "").toLowerCase().includes(q),
      );
    }
    return equipments;
  }),
  getEquipmentById: tenantRequiredProcedure.input(z.number()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
    const [equipment] = await db.select().from(calibrationEquipment).where(and(eq(calibrationEquipment.id, input), eq(calibrationEquipment.tenantId, Number(ctx.tenantId)))).limit(1);
    return equipment || null;
  }),
  createEquipment: tenantRequiredProcedure.input(z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    equipmentType: z.enum(["scale", "thermometer", "facility_thermometer", "timer"]).default("thermometer"),
    calibrationType: z.enum(["certified", "internal"]),
    calibrationCycleMonths: z.number().int().positive().optional(), // 교정 주기(개월) — 다음교정일 자동계산 근거
    model: z.string().optional(),
    manufacturer: z.string().optional(),
    purchasePrice: z.string().optional(),
    purchaseDate: z.string().optional(),
    isActive: z.boolean().default(true),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
    const { purchaseDate, ...restInput } = input;
    const [equipment] = await db.insert(calibrationEquipment).values({ ...restInput, ...(purchaseDate && { purchaseDate: new Date(purchaseDate) }), tenantId: Number(ctx.tenantId), createdBy: Number(ctx.user.id) });
    return { success: true, id: equipment.insertId };
  }),
  updateEquipment: tenantRequiredProcedure.input(z.object({
    id: z.number(),
    name: z.string().min(1).optional(),
    equipmentType: z.enum(["scale", "thermometer", "facility_thermometer", "timer"]).optional(),
    calibrationType: z.enum(["certified", "internal"]).optional(),
    calibrationCycleMonths: z.number().int().positive().nullable().optional(),
    model: z.string().optional(),
    manufacturer: z.string().optional(),
    purchasePrice: z.string().optional(),
    purchaseDate: z.string().optional(),
    isActive: z.boolean().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
    const { id, purchaseDate, ...rest } = input;
    // 테넌트 소유 확인
    const [owned] = await db.select({ id: calibrationEquipment.id }).from(calibrationEquipment).where(and(eq(calibrationEquipment.id, id), eq(calibrationEquipment.tenantId, Number(ctx.tenantId)))).limit(1);
    if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "설비를 찾을 수 없습니다" });
    await db.update(calibrationEquipment).set({ ...rest, ...(purchaseDate && { purchaseDate: new Date(purchaseDate) }) }).where(and(eq(calibrationEquipment.id, id), eq(calibrationEquipment.tenantId, Number(ctx.tenantId))));
    return { success: true };
  }),
  listRecords: tenantRequiredProcedure.input(z.object({ equipmentId: z.number().optional(), startDate: z.string().optional(), endDate: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
    let conditions = [eq(calibrationRecords.tenantId, Number(ctx.tenantId))];
    if (input?.equipmentId) conditions.push(eq(calibrationRecords.equipmentId, input.equipmentId));
    if (input?.startDate) conditions.push(gte(calibrationRecords.calibrationDate, new Date(input.startDate)));
    if (input?.endDate) conditions.push(lte(calibrationRecords.calibrationDate, new Date(input.endDate)));
    const rows = await db
      .select({ record: calibrationRecords, equipmentName: calibrationEquipment.name, equipmentCode: calibrationEquipment.code })
      .from(calibrationRecords)
      .leftJoin(calibrationEquipment, eq(calibrationRecords.equipmentId, calibrationEquipment.id))
      .where(and(...conditions))
      .orderBy(desc(calibrationRecords.calibrationDate));
    return rows.map((r) => ({ ...r.record, equipmentName: r.equipmentName, equipmentCode: r.equipmentCode }));
  }),
  createRecord: tenantRequiredProcedure.input(z.object({
    equipmentId: z.number(),
    calibrationDate: z.string(),
    nextCalibrationDate: z.string().optional(), // 미지정 시 설비 교정주기로 자동계산
    regularCalibrationDate: z.string().optional(),
    // 성적서(인증서) 관리
    calibrationInstitution: z.string().optional(),
    certificateNumber: z.string().optional(),
    calibratedBy: z.string().optional(),
    certificateFile: z.string().optional(), // base64 성적서 첨부
    // 판정 + 보정값
    result: z.enum(["pass", "fail", "conditional_pass"]).optional(),
    results: z.array(resultItemSchema).default([]),
    calibrationMethod: z.array(z.string()).default([]),
    judgmentCriteria: z.string().optional(),
    deviationContent: z.string().optional(),
    improvementMethod: z.string().optional(),
    // 증빙 사진 (설비/위치/결과) — results_json 에 영속화
    photoEquipment: z.string().optional(),
    photoPosition: z.string().optional(),
    photoResult: z.string().optional(),
    notes: z.string().optional(),
    approvalStatus: z.enum(["draft", "pending_review", "approved", "rejected"]).default("draft"),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });

    // 설비 조회 (테넌트 격리 + 교정주기 확보)
    const [equipment] = await db.select().from(calibrationEquipment)
      .where(and(eq(calibrationEquipment.id, input.equipmentId), eq(calibrationEquipment.tenantId, Number(ctx.tenantId)))).limit(1);
    if (!equipment) throw new TRPCError({ code: "NOT_FOUND", message: "검교정 설비를 찾을 수 없습니다" });

    const calibrationDate = new Date(input.calibrationDate);

    // 다음 교정일 자동계산: 명시값 우선 → 없으면 설비 교정주기(개월) 적용
    let nextCalibrationDate: Date;
    if (input.nextCalibrationDate) {
      nextCalibrationDate = new Date(input.nextCalibrationDate);
    } else if (equipment.calibrationCycleMonths && equipment.calibrationCycleMonths > 0) {
      nextCalibrationDate = addMonths(calibrationDate, equipment.calibrationCycleMonths);
    } else {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "다음 교정일을 입력하거나, 설비에 교정 주기(개월)를 설정하세요.",
      });
    }

    // 판정 자동 유도: 명시값 우선 → 없으면 보정값 항목의 pass 여부로 판정
    let result = input.result;
    if (!result && input.results.length > 0) {
      result = input.results.every((r) => r.pass) ? "pass" : "fail";
    }

    // 폼이 수집하는 상세 데이터를 results_json 에 영속화 (기존엔 유실되던 데이터)
    const resultsJson = {
      items: input.results,
      method: input.calibrationMethod,
      criteria: input.judgmentCriteria ?? null,
      deviationContent: input.deviationContent ?? null,
      improvementMethod: input.improvementMethod ?? null,
      photos: {
        equipment: input.photoEquipment ?? null,
        position: input.photoPosition ?? null,
        result: input.photoResult ?? null,
      },
    };

    const [record] = await db.insert(calibrationRecords).values({
      tenantId: Number(ctx.tenantId),
      equipmentId: input.equipmentId,
      calibrationDate,
      nextCalibrationDate,
      ...(input.regularCalibrationDate && { regularCalibrationDate: new Date(input.regularCalibrationDate) }),
      calibrationInstitution: input.calibrationInstitution,
      certificateNumber: input.certificateNumber,
      calibratedBy: input.calibratedBy,
      certificateFile: input.certificateFile,
      result: result as any,
      resultsJson,
      notes: input.notes,
      approvalStatus: input.approvalStatus,
      createdBy: Number(ctx.user.id),
    });
    return { success: true, id: record.insertId };
  }),
  // 다음 교정일 임박/초과 알림 — 설비별 최신 기록 기준
  upcomingCalibrations: tenantRequiredProcedure.input(z.object({ withinDays: z.number().int().positive().default(30) }).optional()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
    const withinDays = input?.withinDays ?? 30;

    const equipments = await db.select().from(calibrationEquipment)
      .where(and(eq(calibrationEquipment.tenantId, Number(ctx.tenantId)), eq(calibrationEquipment.isActive, true)));

    const records = await db.select().from(calibrationRecords)
      .where(eq(calibrationRecords.tenantId, Number(ctx.tenantId)))
      .orderBy(desc(calibrationRecords.calibrationDate));

    // 설비별 최신 기록 매핑 (calibrationDate desc 정렬이므로 최초 등장이 최신)
    const latestByEquipment = new Map<number, typeof records[number]>();
    for (const r of records) {
      if (!latestByEquipment.has(r.equipmentId)) latestByEquipment.set(r.equipmentId, r);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const MS_PER_DAY = 1000 * 60 * 60 * 24;

    const alerts = equipments.map((equip) => {
      const latest = latestByEquipment.get(equip.id);
      const nextDate = latest?.nextCalibrationDate ? new Date(latest.nextCalibrationDate) : null;
      let daysRemaining: number | null = null;
      let status: "overdue" | "due_soon" | "ok" | "no_record" = "no_record";
      if (nextDate) {
        nextDate.setHours(0, 0, 0, 0);
        daysRemaining = Math.round((nextDate.getTime() - today.getTime()) / MS_PER_DAY);
        if (daysRemaining < 0) status = "overdue";
        else if (daysRemaining <= withinDays) status = "due_soon";
        else status = "ok";
      }
      return {
        equipmentId: equip.id,
        equipmentCode: equip.code,
        equipmentName: equip.name,
        calibrationCycleMonths: equip.calibrationCycleMonths ?? null,
        lastCalibrationDate: latest?.calibrationDate ?? null,
        nextCalibrationDate: latest?.nextCalibrationDate ?? null,
        daysRemaining,
        status,
      };
    });

    // 임박/초과/미기록만 반환 (정상 ok 제외)
    return alerts.filter((a) => a.status !== "ok");
  }),
});
