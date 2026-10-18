/**
 * 일일일지 한 날짜 한 건 — ensureDailyLog (2026-10-18, docs/architecture/17 PR-C1 · 5-4)
 *
 * 범위 키: daily_log:{tenant}:{siteScope}:{YYYY-MM-DD} — 서버가 만든다 (입력으로 받지 않음).
 * DB 보장: h_generic_checklist_records.unique_key + UNIQUE(tenant_id, unique_key).
 *   키 칼럼·인덱스 이행은 scripts/daily-log-unique-key.ts (조사 → 승인·백업 → --apply). 시작 시 마이그레이션이 아니다.
 *   keyReady = 칼럼·인덱스(이름·칼럼 구성) 확인 + 키 없는 daily_log 행 0건. 그때만 키 경로를 쓴다.
 *   준비 전에는 이전처럼 회사+날짜 조회 후 생성 — DB 수준 보장이 아님을 로그로 남긴다(보장했다고 말하지 않는다).
 * 기존 일지가 있으면 그대로 돌려준다 — 값을 바꾸지 않는다.
 */

export const DAILY_LOG_KEY_INDEX = "uq_gcr_tenant_unique_key";

export function dailyLogKey(tenantId: number, siteScope: number, date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`일일일지 날짜 형식이 아닙니다: ${date}`);
  return `daily_log:${tenantId}:${siteScope}:${date}`;
}

let readyCache: { at: number; ready: boolean } | null = null;

/** 키 경로를 쓸 수 있는가 (60초 캐시). 칼럼·인덱스 구성·빈 키 행 검사 */
export async function dailyLogKeyReady(conn: any, force = false): Promise<boolean> {
  if (!force && readyCache && Date.now() - readyCache.at < 60_000) return readyCache.ready;
  let ready = false;
  try {
    const [ix]: any = await conn.query(
      `SELECT NON_UNIQUE AS nu, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'h_generic_checklist_records' AND INDEX_NAME = ?
        GROUP BY NON_UNIQUE`,
      [DAILY_LOG_KEY_INDEX],
    );
    const r = (ix as any[])[0];
    if (r && Number(r.nu) === 0 && String(r.cols) === "tenant_id,unique_key") {
      const [[n]]: any = await conn.query(`SELECT COUNT(*) AS c FROM h_generic_checklist_records WHERE form_type = 'daily_log' AND unique_key IS NULL`);
      ready = Number(n.c) === 0;
    }
  } catch {
    ready = false;
  }
  readyCache = { at: Date.now(), ready };
  return ready;
}

export function resetDailyLogKeyCache() { readyCache = null; }

export interface DailyLogRow { id: number; status: string; form_data: any; site_id: number }

/** 찾기 — 키 경로면 키로, 아니면 이전처럼 회사+날짜(가장 먼저 만든 것) */
export async function findDailyLog(conn: any, tenantId: number, siteScope: number, date: string): Promise<DailyLogRow | null> {
  const useKey = await dailyLogKeyReady(conn);
  const [rows]: any = useKey
    ? await conn.execute(
        `SELECT id, status, form_data, site_id FROM h_generic_checklist_records WHERE tenant_id = ? AND unique_key = ? LIMIT 1`,
        [tenantId, dailyLogKey(tenantId, siteScope, date)],
      )
    : await conn.execute(
        `SELECT id, status, form_data, site_id FROM h_generic_checklist_records
          WHERE tenant_id = ? AND form_type = 'daily_log' AND form_date = ? ORDER BY id LIMIT 1`,
        [tenantId, date],
      );
  return (rows as any[])[0] ?? null;
}

export interface EnsureArgs {
  tenantId: number;
  siteScope: number;
  /** site_id 칼럼(NOT NULL) 에 남길 값 — 확인된 사업장이면 그 id, 아니면 이전 대입값 (정보용, 키·조회에 쓰지 않음) */
  siteIdColumn: number;
  date: string;
  title: string;
  formData: unknown;
  status: "draft" | "submitted" | "approved";
  createdBy: number | null;
}

/**
 * 한 날짜 한 건 — 있으면 그 행(값 불변), 없으면 만든다.
 *   키 경로: INSERT … 키 충돌(ER_DUP_ENTRY)이면 이미 있는 행을 돌려준다 (동시 요청·재시도 안전).
 */
export async function ensureDailyLog(conn: any, a: EnsureArgs): Promise<{ id: number; created: boolean; row: DailyLogRow | null }> {
  const existing = await findDailyLog(conn, a.tenantId, a.siteScope, a.date);
  if (existing) return { id: Number(existing.id), created: false, row: existing };
  const useKey = await dailyLogKeyReady(conn);
  const key = dailyLogKey(a.tenantId, a.siteScope, a.date);
  const [[seq]]: any = await conn.execute(
    `SELECT COALESCE(MAX(tenant_seq), 0) + 1 AS ns FROM h_generic_checklist_records WHERE form_type = 'daily_log' AND tenant_id = ? AND YEAR(created_at) = YEAR(NOW())`,
    [a.tenantId],
  );
  const data = typeof a.formData === "string" ? a.formData : JSON.stringify(a.formData);
  try {
    const [ins]: any = useKey
      ? await conn.execute(
          `INSERT INTO h_generic_checklist_records (site_id, tenant_id, form_type, tenant_seq, form_date, title, form_data, status, created_by, unique_key)
           VALUES (?, ?, 'daily_log', ?, ?, ?, ?, ?, ?, ?)`,
          [a.siteIdColumn, a.tenantId, Number(seq.ns), a.date, a.title, data, a.status, a.createdBy, key],
        )
      : await conn.execute(
          `INSERT INTO h_generic_checklist_records (site_id, tenant_id, form_type, tenant_seq, form_date, title, form_data, status, created_by)
           VALUES (?, ?, 'daily_log', ?, ?, ?, ?, ?, ?)`,
          [a.siteIdColumn, a.tenantId, Number(seq.ns), a.date, a.title, data, a.status, a.createdBy],
        );
    if (!useKey) console.warn(`[dailyLog] 고유 키 이행 전 — 회사 ${a.tenantId} ${a.date} 일지를 조회 후 생성 (DB 수준 중복 방지 아님)`);
    return { id: Number(ins.insertId), created: true, row: null };
  } catch (e: any) {
    if (useKey && e?.code === "ER_DUP_ENTRY") {
      const again = await findDailyLog(conn, a.tenantId, a.siteScope, a.date);
      if (again) return { id: Number(again.id), created: false, row: again };
    }
    throw e;
  }
}
