/**
 * 생산 설계 > 우리 공장 — 그 자리에서 고치고 저장 (2026-10-19, 입력 단순화)
 *
 * 공정 하나: 운영 가열시간 · 몇 대씩 · 시작 간격 · 연결 설비
 *   - 운영 가열시간 = 생산 계획이 쓰는 가열시간 하나. 저장 위치는 계획이 이미 읽는 공정 시간 설정(ccp_time_profiles, 활성 1개).
 *     한계기준(time_min/max)은 판정·제출 검증용이라 따로 두고 바꾸지 않는다.
 *     비우면 시간 설정을 끄고 이전처럼 설비 기본 가열시간을 쓴다 (다른 회사 기존 동작 그대로).
 *   - 설비 점유 = 설비 사이클 + (운영 가열 − 설비 기본 가열), 간격 — 기존 계획 계산 그대로 (occupancyFor).
 * 설비 하나: 한 번 도는 시간 · 평소 온도 · 작업 시작 시각.
 * 바뀐 칸만 저장하고 변경·적용 이력(audit_logs)에 전·후를 남긴다. 보내지 않은 칸은 그대로.
 * 한 번 저장은 전부 되거나 전부 안 된다 — 호출부가 트랜잭션 연결(withTransaction)을 넘긴다 (Codex #605 P1: 가열시간만 바뀌거나 설비 연결이 사라지던 문제).
 * 검사(회사 소유·설비 번호)는 쓰기 전에 모두 한다.
 */

/** 한 연결에서 시작·커밋·되돌리기 — 실패하면 아무것도 바뀌지 않는다 */
export async function withTransaction<T>(pool: any, fn: (c: any) => Promise<T>): Promise<T> {
  const c = typeof pool.getConnection === "function" ? await pool.getConnection() : pool;
  const own = c !== pool;
  try {
    await c.beginTransaction();
    const r = await fn(c);
    await c.commit();
    return r;
  } catch (e) {
    try { await c.rollback(); } catch { /* 연결이 끊긴 경우 — 원래 오류를 알린다 */ }
    throw e;
  } finally {
    if (own) c.release();
  }
}

export interface SaveProcessInput {
  groupId: number;
  /** 운영 가열시간(분). undefined = 그대로, null = 시간 설정 끄기(설비 기본값 사용) */
  heatMin?: number | null;
  mode?: "sequential" | "concurrent" | "grouped";
  batchSize?: number;
  intervalMin?: number;
  /** 연결 설비 (순서대로). undefined = 그대로 */
  equipmentIds?: number[];
}

export async function saveProcess(conn: any, tenantId: number, input: SaveProcessInput) {
  const [[g]]: any = await conn.execute(
    `SELECT id, name, ccp_type, equip_group_mode, equip_batch_size, equip_interval_min FROM ccp_process_groups WHERE id = ? AND tenant_id = ?`,
    [input.groupId, tenantId],
  );
  if (!g) throw new Error("이 회사의 공정이 아닙니다.");
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  // 검사 먼저 — 연결 설비는 이 회사 설비만 (쓰기 전에 거부)
  const eqIds = input.equipmentIds !== undefined ? Array.from(new Set(input.equipmentIds.map(Number))) : undefined;
  if (eqIds?.length) {
    const [own]: any = await conn.query(`SELECT id FROM equipments WHERE tenant_id = ? AND id IN (?)`, [tenantId, eqIds]);
    if ((own as any[]).length !== eqIds.length) throw new Error("이 회사의 설비가 아닌 번호가 있습니다.");
  }

  // 1) 운영 가열시간 — 활성 시간 설정 1개로 맞춘다
  if (input.heatMin !== undefined) {
    const [profiles]: any = await conn.execute(
      `SELECT id, time_minutes FROM ccp_time_profiles WHERE tenant_id = ? AND ccp_process_group_id = ? AND is_active = 1 ORDER BY id`,
      [tenantId, input.groupId],
    );
    const before = (profiles as any[]).length === 1 ? Number(profiles[0].time_minutes) : null;
    if (input.heatMin === null) {
      if ((profiles as any[]).length) await conn.execute(`UPDATE ccp_time_profiles SET is_active = 0 WHERE tenant_id = ? AND ccp_process_group_id = ? AND is_active = 1`, [tenantId, input.groupId]);
    } else if ((profiles as any[]).length) {
      await conn.execute(`UPDATE ccp_time_profiles SET time_minutes = ? WHERE id = ? AND tenant_id = ?`, [input.heatMin, profiles[0].id, tenantId]);
      // 여러 개였으면 하나만 남긴다 — 계획은 활성 1개일 때만 시간 설정을 쓴다
      if ((profiles as any[]).length > 1) await conn.execute(`UPDATE ccp_time_profiles SET is_active = 0 WHERE tenant_id = ? AND ccp_process_group_id = ? AND is_active = 1 AND id <> ?`, [tenantId, input.groupId, profiles[0].id]);
    } else {
      await conn.execute(
        `INSERT INTO ccp_time_profiles (tenant_id, process_type, profile_name, time_minutes, ccp_process_group_id, description, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [tenantId, String(g.ccp_type ?? "OTHER"), String(g.name), input.heatMin, input.groupId, "생산 설계 > 우리 공장 운영 가열시간"],
      );
    }
    if ((before ?? null) !== (input.heatMin ?? null) || (profiles as any[]).length > 1) changes.heat_min = { before, after: input.heatMin };
  }

  // 2) 운전 방식 · 몇 대씩 · 간격
  const sets: string[] = [];
  const vals: unknown[] = [];
  const col = (c: string, v: unknown, before: unknown) => {
    if (v === undefined || String(v) === String(before ?? "")) return;
    sets.push(`${c} = ?`); vals.push(v); changes[c] = { before: before ?? null, after: v };
  };
  col("equip_group_mode", input.mode, g.equip_group_mode);
  col("equip_batch_size", input.batchSize, g.equip_batch_size);
  col("equip_interval_min", input.intervalMin, g.equip_interval_min);
  if (sets.length) await conn.execute(`UPDATE ccp_process_groups SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`, [...vals, input.groupId, tenantId]);

  // 3) 연결 설비 — 이 회사 설비만
  if (eqIds !== undefined) {
    const ids = eqIds;
    const [cur]: any = await conn.execute(`SELECT equipment_id FROM ccp_process_group_equipments WHERE tenant_id = ? AND process_group_id = ? ORDER BY sort_order, equipment_id`, [tenantId, input.groupId]);
    const before = (cur as any[]).map((r) => Number(r.equipment_id));
    if (before.join(",") !== ids.join(",")) {
      await conn.execute(`DELETE FROM ccp_process_group_equipments WHERE tenant_id = ? AND process_group_id = ?`, [tenantId, input.groupId]);
      for (const [k, id] of ids.entries()) {
        await conn.execute(`INSERT INTO ccp_process_group_equipments (tenant_id, process_group_id, equipment_id, sort_order) VALUES (?, ?, ?, ?)`, [tenantId, input.groupId, id, k]);
      }
      const [names]: any = ids.length || before.length
        ? await conn.query(`SELECT id, name FROM equipments WHERE tenant_id = ? AND id IN (?)`, [tenantId, Array.from(new Set([...ids, ...before, 0]))])
        : [[]];
      const nm = new Map((names as any[]).map((r) => [Number(r.id), String(r.name)]));
      changes.equipment_ids = { before: before.map((i) => nm.get(i) ?? `#${i}`).join(", ") || "없음", after: ids.map((i) => nm.get(i) ?? `#${i}`).join(", ") || "없음" };
    }
  }
  return { name: String(g.name), changes };
}

export interface SaveEquipmentInput {
  equipmentId: number;
  cycleMin?: number | null;
  tempC?: number | null;
  /** HH:MM, null = 비움(계획 기본 09:00) */
  workStartTime?: string | null;
}

export async function saveEquipment(conn: any, tenantId: number, input: SaveEquipmentInput) {
  const [[e]]: any = await conn.execute(
    `SELECT id, name, batch_operation_time, default_temperature, work_start_time FROM equipments WHERE id = ? AND tenant_id = ?`,
    [input.equipmentId, tenantId],
  );
  if (!e) throw new Error("이 회사의 설비가 아닙니다.");
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  const sets: string[] = [];
  const vals: unknown[] = [];
  const same = (a: unknown, b: unknown) => (a == null || a === "" ? null : Number.isFinite(Number(a)) ? Number(a) : String(a)) === (b == null || b === "" ? null : Number.isFinite(Number(b)) ? Number(b) : String(b));
  const col = (c: string, key: string, v: unknown, before: unknown) => {
    if (v === undefined || same(v, before)) return;
    sets.push(`${c} = ?`); vals.push(v); changes[key] = { before: before ?? null, after: v };
  };
  col("batch_operation_time", "batchOperationTime", input.cycleMin, e.batch_operation_time);
  col("default_temperature", "defaultTemperature", input.tempC, e.default_temperature);
  const ws = e.work_start_time ? String(e.work_start_time).slice(0, 5) : null;
  if (input.workStartTime !== undefined && (input.workStartTime ?? null) !== ws) {
    sets.push("work_start_time = ?"); vals.push(input.workStartTime); changes.workStartTime = { before: ws, after: input.workStartTime };
  }
  if (sets.length) await conn.execute(`UPDATE equipments SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`, [...vals, input.equipmentId, tenantId]);
  return { name: String(e.name), changes };
}

/** 변경 이력을 같은 트랜잭션 연결로 남긴다 — 설정 저장과 함께 성공하거나 함께 취소 (Codex #605 재검토 1) */
export async function insertAuditWith(c: any, a: { tenantId: number; action: string; entityType: string; entityId: number; userId: number; userEmail?: string | null; userRole?: string | null; changes: unknown; description: string }) {
  await c.execute(
    `INSERT INTO audit_logs (tenant_id, action, entity_type, entity_id, user_id, user_email, user_role, changes, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [a.tenantId, a.action, a.entityType, a.entityId, a.userId, a.userEmail ?? null, a.userRole ?? null, JSON.stringify(a.changes ?? {}), a.description],
  );
}
