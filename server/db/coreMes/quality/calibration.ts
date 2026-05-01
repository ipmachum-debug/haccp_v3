/**
 * Calibration DB 헬퍼 — Layer 2 core-mes/quality (Phase Y-4)
 */
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../connection";
import { hCalibrations } from "../../../../drizzle/schema/coreMes/quality/calibration";
import {
  type Calibration,
  type CalibrationStatus,
  type CalibrationType,
  type CalibrationOutcome,
  type CalibrationVendorType,
  type CalibrationMeasurement,
  type IndustryContext,
  canTransition,
  calculateNextDueDate,
  suggestOutcome,
} from "../../../core-mes/quality/calibration";

// ─── 자동채번 ────────────────────────────────────────────

export async function generateCalibrationCode(tenantId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const year = new Date().getFullYear();
  const prefix = `CAL-${year}-`;
  const rows = await db
    .select({ code: hCalibrations.code })
    .from(hCalibrations)
    .where(
      and(
        eq(hCalibrations.tenantId, tenantId),
        sql`${hCalibrations.code} LIKE ${prefix + "%"}`,
      ),
    )
    .orderBy(desc(hCalibrations.code))
    .limit(1);
  let next = 1;
  if (rows.length > 0) {
    const m = rows[0].code.match(/^CAL-\d{4}-(\d+)$/);
    if (m) next = Number(m[1]) + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

// ─── CRUD ────────────────────────────────────────────

export type CreateCalibrationInput = {
  tenantId: number;
  industry: IndustryContext;
  type: CalibrationType;
  equipmentName: string;
  equipmentSerial: string;
  vendor: string;
  vendorType: CalibrationVendorType;
  scheduledDate: string;
  intervalMonths?: number;
  industryMetadata?: Record<string, unknown> | null;
};

export async function createCalibration(
  input: CreateCalibrationInput,
): Promise<{ id: number; code: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const code = await generateCalibrationCode(input.tenantId);

  const result = await db.insert(hCalibrations).values({
    tenantId: input.tenantId,
    industry: input.industry,
    code,
    type: input.type,
    equipmentName: input.equipmentName,
    equipmentSerial: input.equipmentSerial,
    vendor: input.vendor,
    vendorType: input.vendorType,
    scheduledDate: input.scheduledDate,
    intervalMonths: input.intervalMonths ?? 12,
    measurements: [],
    outcome: "pending",
    status: "planned",
    industryMetadata: input.industryMetadata ?? null,
  });

  const insertId =
    (result as unknown as Array<{ insertId?: number }>)[0]?.insertId ?? 0;
  return { id: Number(insertId), code };
}

export async function listCalibrations(
  tenantId: number,
  industry: IndustryContext,
  options?: {
    status?: CalibrationStatus;
    type?: CalibrationType;
    equipmentSerial?: string;
    /** next_due_date 임박 (예: "2026-05-01") 이전 항목만 */
    dueBefore?: string;
    limit?: number;
    offset?: number;
  },
): Promise<Calibration[]> {
  const db = await getDb();
  if (!db) return [];
  const conds = [
    eq(hCalibrations.tenantId, tenantId),
    eq(hCalibrations.industry, industry),
  ];
  if (options?.status) conds.push(eq(hCalibrations.status, options.status));
  if (options?.type) conds.push(eq(hCalibrations.type, options.type));
  if (options?.equipmentSerial)
    conds.push(eq(hCalibrations.equipmentSerial, options.equipmentSerial));
  if (options?.dueBefore)
    conds.push(sql`${hCalibrations.nextDueDate} <= ${options.dueBefore}`);

  const rows = await db
    .select()
    .from(hCalibrations)
    .where(and(...conds))
    .orderBy(desc(hCalibrations.scheduledDate), desc(hCalibrations.id))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);
  return rows.map(rowToEntity);
}

export async function getCalibrationById(
  tenantId: number,
  industry: IndustryContext,
  id: number,
): Promise<Calibration | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(hCalibrations)
    .where(
      and(
        eq(hCalibrations.id, id),
        eq(hCalibrations.tenantId, tenantId),
        eq(hCalibrations.industry, industry),
      ),
    )
    .limit(1);
  return rows[0] ? rowToEntity(rows[0]) : null;
}

// ─── 워크플로 ────────────────────────────────────────────

/**
 * 실시일 입력 + nextDueDate 자동 계산.
 */
export async function setCalibrationActualDate(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  actualDate: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getCalibrationById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Calibration 미존재 (id=${args.id})`);
  if (current.status === "archived" || current.status === "cancelled") {
    throw new Error(`종결 상태에서 변경 불가 (status=${current.status})`);
  }

  const nextDueDate = calculateNextDueDate(args.actualDate, current.intervalMonths);

  await db
    .update(hCalibrations)
    .set({ actualDate: args.actualDate, nextDueDate })
    .where(
      and(
        eq(hCalibrations.id, args.id),
        eq(hCalibrations.tenantId, args.tenantId),
        eq(hCalibrations.industry, args.industry),
      ),
    );
}

/**
 * 측정값 추가 — outcome 자동 재계산.
 */
export async function addCalibrationMeasurement(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  measurement: CalibrationMeasurement;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getCalibrationById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Calibration 미존재 (id=${args.id})`);
  if (current.status === "archived" || current.status === "cancelled") {
    throw new Error(`종결 상태에서 측정 추가 불가`);
  }

  const newMeasurements = [...current.measurements, args.measurement];
  await db
    .update(hCalibrations)
    .set({
      measurements: newMeasurements,
      outcome: suggestOutcome(newMeasurements),
    })
    .where(
      and(
        eq(hCalibrations.id, args.id),
        eq(hCalibrations.tenantId, args.tenantId),
        eq(hCalibrations.industry, args.industry),
      ),
    );
}

/**
 * 결론 / 인증서 입력.
 */
export async function setCalibrationConclusion(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  conclusion?: string;
  certificateUrl?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getCalibrationById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Calibration 미존재 (id=${args.id})`);
  if (current.status === "archived" || current.status === "cancelled") {
    throw new Error(`종결 상태에서 변경 불가`);
  }

  const updates: Record<string, unknown> = {};
  if (args.conclusion !== undefined) updates.conclusion = args.conclusion;
  if (args.certificateUrl !== undefined)
    updates.certificateUrl = args.certificateUrl;

  await db
    .update(hCalibrations)
    .set(updates)
    .where(
      and(
        eq(hCalibrations.id, args.id),
        eq(hCalibrations.tenantId, args.tenantId),
        eq(hCalibrations.industry, args.industry),
      ),
    );
}

/**
 * 상태 전이 — completed 시 approvedBy/approvedAt, archived 시 closedAt.
 */
export async function transitionCalibrationStatus(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  toStatus: CalibrationStatus;
  approvedBy?: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getCalibrationById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Calibration 미존재 (id=${args.id})`);
  if (!canTransition(current.status, args.toStatus)) {
    throw new Error(
      `잘못된 상태 전이: ${current.status} → ${args.toStatus}`,
    );
  }

  const updates: Record<string, unknown> = { status: args.toStatus };
  if (args.toStatus === "completed") {
    if (!args.approvedBy) throw new Error("completed 전이 시 approvedBy 필수");
    updates.approvedBy = args.approvedBy;
    updates.approvedAt = new Date();
  }
  if (args.toStatus === "archived") updates.closedAt = new Date();

  await db
    .update(hCalibrations)
    .set(updates)
    .where(
      and(
        eq(hCalibrations.id, args.id),
        eq(hCalibrations.tenantId, args.tenantId),
        eq(hCalibrations.industry, args.industry),
      ),
    );
}

// ─── 통계 ────────────────────────────────────────────

export async function getCalibrationStats(
  tenantId: number,
): Promise<Array<{
  industry: IndustryContext;
  type: CalibrationType;
  outcome: CalibrationOutcome;
  count: number;
}>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      industry: hCalibrations.industry,
      type: hCalibrations.type,
      outcome: hCalibrations.outcome,
      count: sql<number>`COUNT(*)`,
    })
    .from(hCalibrations)
    .where(eq(hCalibrations.tenantId, tenantId))
    .groupBy(hCalibrations.industry, hCalibrations.type, hCalibrations.outcome);
  return rows.map((r) => ({
    industry: r.industry as IndustryContext,
    type: r.type as CalibrationType,
    outcome: r.outcome as CalibrationOutcome,
    count: Number(r.count),
  }));
}

// ─── 변환 ────────────────────────────────────────────

function rowToEntity(
  row: typeof hCalibrations.$inferSelect,
): Calibration {
  return {
    id: row.id,
    tenantId: row.tenantId,
    industry: row.industry as IndustryContext,
    code: row.code,
    type: row.type as CalibrationType,
    equipmentName: row.equipmentName,
    equipmentSerial: row.equipmentSerial,
    vendor: row.vendor,
    vendorType: row.vendorType as CalibrationVendorType,
    scheduledDate: typeof row.scheduledDate === "string"
      ? row.scheduledDate
      : (row.scheduledDate as unknown as Date).toISOString().slice(0, 10),
    actualDate: row.actualDate
      ? typeof row.actualDate === "string"
        ? row.actualDate
        : (row.actualDate as unknown as Date).toISOString().slice(0, 10)
      : null,
    intervalMonths: row.intervalMonths,
    nextDueDate: row.nextDueDate
      ? typeof row.nextDueDate === "string"
        ? row.nextDueDate
        : (row.nextDueDate as unknown as Date).toISOString().slice(0, 10)
      : null,
    measurements: (row.measurements as unknown as CalibrationMeasurement[]) ?? [],
    outcome: row.outcome as CalibrationOutcome,
    certificateUrl: row.certificateUrl ?? null,
    conclusion: row.conclusion ?? null,
    approvedBy: row.approvedBy ?? null,
    approvedAt: row.approvedAt ?? null,
    closedAt: row.closedAt ?? null,
    status: row.status as CalibrationStatus,
    industryMetadata: (row.industryMetadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
