/**
 * 일일일지 설정 — 회사·사업장별 초안/발행 버전 (2026-10-18, docs/architecture/17 PR-B2)
 *
 * h_daily_log_settings          : (tenant_id, site_scope) 1행 — 발행 버전 포인터, 편집 중 초안, row_version(동시 편집 보호)
 * h_daily_log_setting_versions  : 발행본 — 고치지 않는다 (UNIQUE tenant_id, site_scope, version_no)
 *
 * site_scope: 확인된 사업장 id(h_sites, 같은 회사 소유) 또는 0 = 사업장 구분 없음.
 *   기존 일지의 site_id 값은 사업장 표와 연결되지 않은 대입값이 섞여 있어 쓰지 않는다 (tenant_id 를 사업장으로 보지 않는다).
 * 발행은 새로 만드는 일지부터 적용된다. 이미 만든 일지는 그 기록의 정의 스냅샷을 쓴다.
 */
import { definitionProblems, parseDefinition, type DailyLogDefinition } from "../../../shared/dailyLog/definition";

export const DAILY_LOG_V2_FEATURE = "DAILY_LOG_V2";

export const DAILY_LOG_SETTINGS_DDL = [
  `CREATE TABLE IF NOT EXISTS h_daily_log_settings (
    id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tenant_id int NOT NULL,
    site_scope bigint NOT NULL DEFAULT 0,
    active_version_id bigint NULL,
    draft_json json NULL,
    row_version int NOT NULL DEFAULT 0,
    updated_by bigint NULL,
    updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_dls_tenant_site (tenant_id, site_scope)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS h_daily_log_setting_versions (
    id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tenant_id int NOT NULL,
    site_scope bigint NOT NULL DEFAULT 0,
    version_no int NOT NULL,
    schema_version int NOT NULL DEFAULT 1,
    definition_json json NOT NULL,
    created_by bigint NULL,
    created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_by bigint NULL,
    published_at timestamp NULL,
    supersedes_version_id bigint NULL,
    UNIQUE KEY uq_dlsv_tenant_site_no (tenant_id, site_scope, version_no)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

const parseJson = (v: unknown) => (v == null ? null : typeof v === "string" ? JSON.parse(v) : v);

/** 요청한 사업장이 같은 회사 소유인지 — 없으면 0(사업장 구분 없음). 다른 회사·없는 사업장은 오류 */
export async function resolveSiteScope(conn: any, tenantId: number, siteId?: number | null): Promise<number> {
  if (!siteId) return 0;
  const [rows]: any = await conn.execute(`SELECT id FROM h_sites WHERE id = ? AND tenant_id = ? LIMIT 1`, [siteId, tenantId]);
  if (!(rows as any[]).length) throw new Error("이 회사의 사업장이 아닙니다.");
  return Number(siteId);
}

export interface SettingsState {
  rowVersion: number;
  draft: DailyLogDefinition | null;
  active: { versionId: number; versionNo: number; definition: DailyLogDefinition; publishedAt: string | null; publishedBy: number | null } | null;
}

export async function loadSettings(conn: any, tenantId: number, siteScope: number): Promise<SettingsState> {
  const [rows]: any = await conn.execute(
    `SELECT s.row_version, s.draft_json, v.id AS vid, v.version_no, v.definition_json, DATE_FORMAT(v.published_at, '%Y-%m-%d %H:%i') AS pat, v.published_by
       FROM h_daily_log_settings s
       LEFT JOIN h_daily_log_setting_versions v ON v.id = s.active_version_id AND v.tenant_id = s.tenant_id AND v.site_scope = s.site_scope
      WHERE s.tenant_id = ? AND s.site_scope = ? LIMIT 1`,
    [tenantId, siteScope],
  );
  const r = (rows as any[])[0];
  if (!r) return { rowVersion: 0, draft: null, active: null };
  return {
    rowVersion: Number(r.row_version),
    draft: parseJson(r.draft_json),
    active: r.vid ? { versionId: Number(r.vid), versionNo: Number(r.version_no), definition: parseJson(r.definition_json), publishedAt: r.pat ?? null, publishedBy: r.published_by != null ? Number(r.published_by) : null } : null,
  };
}

/** 오늘 새 일지에 쓸 발행 정의 (없으면 null — v1 경로) */
export async function activeDefinition(conn: any, tenantId: number, siteScope: number): Promise<{ versionId: number; definition: DailyLogDefinition } | null> {
  const s = await loadSettings(conn, tenantId, siteScope);
  return s.active ? { versionId: s.active.versionId, definition: s.active.definition } : null;
}

/** 초안 저장 — row_version 이 맞을 때만 (오래된 화면이 덮어쓰지 않게) */
export async function saveDraft(conn: any, tenantId: number, siteScope: number, draft: unknown, expectedRowVersion: number, userId: number): Promise<number> {
  await conn.execute(
    `INSERT IGNORE INTO h_daily_log_settings (tenant_id, site_scope, row_version) VALUES (?, ?, 0)`,
    [tenantId, siteScope],
  );
  const [res]: any = await conn.execute(
    `UPDATE h_daily_log_settings SET draft_json = ?, row_version = row_version + 1, updated_by = ?
      WHERE tenant_id = ? AND site_scope = ? AND row_version = ?`,
    [JSON.stringify(draft), userId, tenantId, siteScope, expectedRowVersion],
  );
  if (Number(res?.affectedRows ?? 0) !== 1) throw new Error("다른 곳에서 설정이 바뀌었습니다 — 새로 불러온 뒤 다시 저장하세요.");
  return expectedRowVersion + 1;
}

/** 이전 발행본에 있던 ID 를 지우면 안 된다 — 사용 중지로 남긴다 (ID 재사용·과거 연결 혼동 방지) */
export function removedIdProblems(prev: DailyLogDefinition | null, next: DailyLogDefinition): string[] {
  if (!prev) return [];
  const out: string[] = [];
  const has = (ids: string[], label: string, nextIds: Set<string>) => {
    for (const x of ids) if (!nextIds.has(x)) out.push(`${label} '${x}' 를 지울 수 없습니다 — '사용 안 함' 으로 바꾸세요 (과거 일지 연결 보존).`);
  };
  has(prev.zones.map((z) => z.zoneId), "구역", new Set(next.zones.map((z) => z.zoneId)));
  has(prev.points.map((p) => p.pointId), "측정 대상", new Set(next.points.map((p) => p.pointId)));
  has(prev.questions.map((q) => q.itemId), "질문", new Set(next.questions.map((q) => q.itemId)));
  const nextSlots = new Set(next.points.flatMap((p) => p.slots.map((s) => `${p.pointId}|${s.slotId}`)));
  for (const p of prev.points) for (const s of p.slots) if (next.points.some((n) => n.pointId === p.pointId) && !nextSlots.has(`${p.pointId}|${s.slotId}`)) {
    out.push(`'${p.name}' 회차 '${s.label}' 를 지울 수 없습니다 — 회차는 새 ID 로 추가하고 이전 회차는 남겨 두세요.`);
  }
  return out;
}

/** 발행 — 초안 검사 통과·row_version 일치 시 새 버전 행(불변) + 포인터 이동을 한 트랜잭션으로. 일지·승인·재고는 만들지 않는다 */
export async function publishDraft(pool: any, tenantId: number, siteScope: number, expectedRowVersion: number, userId: number): Promise<{ versionId: number; versionNo: number }> {
  const conn = typeof pool.getConnection === "function" ? await pool.getConnection() : pool;
  const tx = conn !== pool;
  try {
    if (tx) await conn.beginTransaction();
    // 같은 회사·사업장 설정 행을 잠근다 (동시 발행 방지)
    await conn.execute(`SELECT id FROM h_daily_log_settings WHERE tenant_id = ? AND site_scope = ? FOR UPDATE`, [tenantId, siteScope]);
    const r = await publishInTx(conn, tenantId, siteScope, expectedRowVersion, userId);
    if (tx) await conn.commit();
    return r;
  } catch (e) {
    if (tx) await conn.rollback().catch(() => {});
    throw e;
  } finally {
    if (tx) conn.release?.();
  }
}

async function publishInTx(conn: any, tenantId: number, siteScope: number, expectedRowVersion: number, userId: number): Promise<{ versionId: number; versionNo: number }> {
  const s = await loadSettings(conn, tenantId, siteScope);
  if (s.rowVersion !== expectedRowVersion) throw new Error("다른 곳에서 설정이 바뀌었습니다 — 새로 불러온 뒤 다시 발행하세요.");
  if (!s.draft) throw new Error("발행할 초안이 없습니다.");
  const problems = [...definitionProblems(s.draft), ...removedIdProblems(s.active?.definition ?? null, s.draft as DailyLogDefinition)];
  if (problems.length) throw new Error(`발행할 수 없습니다 — ${problems.slice(0, 5).join(" / ")}${problems.length > 5 ? ` 외 ${problems.length - 5}건` : ""}`);
  const def = parseDefinition(s.draft);
  const [[mx]]: any = await conn.execute(
    `SELECT COALESCE(MAX(version_no), 0) AS n FROM h_daily_log_setting_versions WHERE tenant_id = ? AND site_scope = ?`,
    [tenantId, siteScope],
  );
  const versionNo = Number(mx.n) + 1;
  const [ins]: any = await conn.execute(
    `INSERT INTO h_daily_log_setting_versions (tenant_id, site_scope, version_no, schema_version, definition_json, created_by, published_by, published_at, supersedes_version_id)
     VALUES (?, ?, ?, 1, ?, ?, ?, NOW(), ?)`,
    [tenantId, siteScope, versionNo, JSON.stringify(def), userId, userId, s.active?.versionId ?? null],
  );
  const versionId = Number(ins.insertId);
  const [res]: any = await conn.execute(
    `UPDATE h_daily_log_settings SET active_version_id = ?, draft_json = NULL, row_version = row_version + 1, updated_by = ?
      WHERE tenant_id = ? AND site_scope = ? AND row_version = ?`,
    [versionId, userId, tenantId, siteScope, expectedRowVersion],
  );
  if (Number(res?.affectedRows ?? 0) !== 1) throw new Error("발행 중 다른 변경과 겹쳤습니다 — 다시 시도하세요.");
  return { versionId, versionNo };
}
