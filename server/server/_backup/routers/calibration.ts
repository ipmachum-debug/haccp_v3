import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { calibrationEquipment, calibrationRecords } from "../../drizzle/schema/calibration";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const calibrationRouter = router({
  listEquipments: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (db === null) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
    const equipments = await db.select().from(calibrationEquipment).where(eq(calibrationEquipment.tenantId, Number(ctx.user.tenantId))).orderBy(desc(calibrationEquipment.createdAt));
    return equipments;
  }),
  createEquipment: protectedProcedure.input(z.object({ code: z.string().min(1), name: z.string().min(1), equipmentType: z.enum(["scale", "thermometer", "facility_thermometer", "timer"]).default("thermometer"), calibrationType: z.enum(["certified", "internal"]), model: z.string().optional(), manufacturer: z.string().optional(), purchasePrice: z.string().optional(), purchaseDate: z.string().optional(), isActive: z.boolean().default(true), notes: z.string().optional() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
    const { purchaseDate, ...restInput } = input;
    const [equipment] = await db.insert(calibrationEquipment).values({ ...restInput, ...(purchaseDate && { purchaseDate: new Date(purchaseDate) }), tenantId: Number(ctx.user.tenantId), createdBy: Number(ctx.user.id) });
    return { success: true, id: equipment.insertId };
  }),
  listRecords: protectedProcedure.input(z.object({ equipmentId: z.number().optional(), startDate: z.string().optional(), endDate: z.string().optional() }).optional()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
    let conditions = [eq(calibrationRecords.tenantId, Number(ctx.user.tenantId))];
    if (input?.equipmentId) conditions.push(eq(calibrationRecords.equipmentId, input.equipmentId));
    if (input?.startDate) conditions.push(gte(calibrationRecords.calibrationDate, new Date(input.startDate)));
    if (input?.endDate) conditions.push(lte(calibrationRecords.calibrationDate, new Date(input.endDate)));
    const records = await db.select().from(calibrationRecords).where(and(...conditions)).orderBy(desc(calibrationRecords.calibrationDate));
    return records;
  }),
  createRecord: protectedProcedure.input(z.object({ equipmentId: z.number(), calibrationDate: z.string(), nextCalibrationDate: z.string().optional(), regularCalibrationDate: z.string().optional(), calibrationMethod: z.array(z.string()).default([]), judgmentCriteria: z.string().default("± 1℃"), photo1: z.string().optional(), photo2: z.string().optional(), photo3: z.string().optional(), results: z.array(z.object({ category: z.string(), calibrationValue: z.number(), panelValue: z.number(), deviation: z.number(), pass: z.boolean() })).default([]), deviationContent: z.string().optional(), improvementMethod: z.string().optional(), notes: z.string().optional(), status: z.enum(["draft", "pending", "approved", "rejected"]).default("draft") })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
    const { calibrationDate, nextCalibrationDate, regularCalibrationDate, results, ...restInput } = input;
    const [record] = await db.insert(calibrationRecords).values({ ...restInput, calibrationDate: new Date(calibrationDate), ...(nextCalibrationDate && { nextCalibrationDate: new Date(nextCalibrationDate) }), ...(regularCalibrationDate && { regularCalibrationDate: new Date(regularCalibrationDate) }), results: JSON.stringify(results), tenantId: Number(ctx.user.tenantId), createdBy: Number(ctx.user.id) });
    return { success: true, id: record.insertId };
  }),
});
