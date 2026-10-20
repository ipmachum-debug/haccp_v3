/**
 * 배치 일괄 생성 요청 키 — 같은 작업은 한 번만 (2026-10-18, PR-B)
 *
 * CEO 설계 "필수 안정성":
 *   더블탭·재시도·새로고침·응답 지연에도 같은 작업은 한 번만 생성한다.
 *   여러 품목 중 일부 실패 시 성공 행은 유지하고 실패 행만 같은 요청 키로 다시 처리한다.
 *
 * 화면이 요청마다 requestKey 를, 입력 줄마다 rowKey 를 만든다. (tenant, requestKey, rowKey) 가 한 줄의 처리 기록이다.
 *   new        : 처음 — 생성 진행
 *   done       : 이미 만든 줄 — 다시 만들지 않고 만든 배치를 돌려준다
 *   processing : 다른 요청이 처리 중 — 건너뛴다 (10분 넘게 멈춘 기록은 다시 처리)
 *   retry      : 이전에 실패한 줄 — 다시 처리
 * 표(h_batch_create_requests)가 아직 없는 DB 에서는 요청 키 없이 이전처럼 처리한다 (available = false).
 *
 * 생성 계약 (2026-10-20, 생산계획 생애주기 검토 1):
 *   - 생산 건은 만드는 INSERT 에 요청 줄 번호(h_batches.create_request_id, 회사별 유일)를 남긴다. 완료 표시(finishRow)가 실패하거나
 *     프로세스가 멈춰도 다시 처리할 때 linkedBatch 로 그 생산 건을 찾아 남은 준비만 이어서 한다 — 새 생산 건을 만들지 않는다.
 *   - 줄 지문(row_fingerprint): 같은 요청 키·줄 키로 다른 내용(작업일·제품·수량·SKU 등)을 보내면 conflict — 처리하지 않는다.
 */
import { createHash } from "node:crypto";

export type ClaimState = "new" | "done" | "processing" | "retry" | "conflict";

export interface ClaimResult {
  state: ClaimState;
  /** 요청 줄 번호 (h_batch_create_requests.id) */
  requestRowId?: number | null;
  batchId?: number | null;
}

/** 한 줄의 생산 의도 지문 — 같은 키로 같은 내용인지 (키 순서·SKU 순서와 무관) */
export function rowFingerprint(v: Record<string, unknown>): string {
  const norm = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(norm);
    if (x && typeof x === "object") return Object.fromEntries(Object.keys(x as any).sort().filter((k) => (x as any)[k] !== undefined).map((k) => [k, norm((x as any)[k])]));
    return x;
  };
  return createHash("sha256").update(JSON.stringify(norm(v))).digest("hex");
}

/** 요청 줄에 이미 연결된 생산 건 (같은 INSERT 로 남긴 번호) */
export async function linkedBatch(conn: any, tenantId: number, requestRowId: number): Promise<{ id: number; batchCode: string; setupPending: boolean } | null> {
  const [rows]: any = await conn.execute(
    `SELECT id, batch_code, setup_pending FROM h_batches WHERE tenant_id = ? AND create_request_id = ? LIMIT 1`,
    [tenantId, requestRowId],
  );
  const r = (rows as any[])[0];
  return r ? { id: Number(r.id), batchCode: String(r.batch_code ?? ""), setupPending: Number(r.setup_pending ?? 0) === 1 } : null;
}

/** 이 요청 키로 만든 생산 건들 — 같은 제품 중복 검사에서 '이 요청 자신' 만 빼기 위해 (그룹 전체를 빼지 않는다) */
export async function batchesOfRequest(conn: any, tenantId: number, requestKey: string): Promise<number[]> {
  const [rows]: any = await conn.execute(
    `SELECT b.id FROM h_batches b JOIN h_batch_create_requests r ON r.id = b.create_request_id AND r.tenant_id = b.tenant_id
      WHERE r.tenant_id = ? AND r.request_key = ?`,
    [tenantId, requestKey],
  );
  return (rows as any[]).map((r) => Number(r.id));
}

const STALE_MIN = 10;

/** 표가 있는가 — 없으면 요청 키를 쓰지 않는다 */
export async function requestKeysAvailable(conn: any): Promise<boolean> {
  try {
    await conn.query(`SELECT 1 FROM h_batch_create_requests LIMIT 0`);
    return true;
  } catch (e: any) {
    if (e?.code === "ER_NO_SUCH_TABLE") return false;
    throw e;
  }
}

/** 같은 요청 키로 이미 만든 하루 그룹 코드 (재시도 때 같은 그룹에 붙인다) */
export async function existingDayGroup(conn: any, tenantId: number, requestKey: string): Promise<string | null> {
  const [rows]: any = await conn.execute(
    `SELECT day_batch_group FROM h_batch_create_requests WHERE tenant_id = ? AND request_key = ? AND day_batch_group IS NOT NULL LIMIT 1`,
    [tenantId, requestKey],
  );
  return (rows as any[])[0]?.day_batch_group ?? null;
}

/** 한 줄 처리 시작 — 이미 처리됐거나 처리 중이면 그 상태를 돌려준다. fingerprint 가 다르면 conflict */
export async function claimRow(conn: any, tenantId: number, requestKey: string, rowKey: string, dayBatchGroup: string, fingerprint?: string | null): Promise<ClaimResult> {
  try {
    const [ins]: any = await conn.execute(
      `INSERT INTO h_batch_create_requests (tenant_id, request_key, row_key, day_batch_group, status, row_fingerprint) VALUES (?, ?, ?, ?, 'processing', ?)`,
      [tenantId, requestKey, rowKey, dayBatchGroup, fingerprint ?? null],
    );
    return { state: "new", requestRowId: Number(ins.insertId) };
  } catch (e: any) {
    if (e?.code !== "ER_DUP_ENTRY") throw e;
  }
  const [rows]: any = await conn.execute(
    `SELECT id, status, batch_id, row_fingerprint, TIMESTAMPDIFF(MINUTE, updated_at, NOW()) AS age_min
       FROM h_batch_create_requests WHERE tenant_id = ? AND request_key = ? AND row_key = ? LIMIT 1`,
    [tenantId, requestKey, rowKey],
  );
  const r = (rows as any[])[0];
  const requestRowId = r ? Number(r.id) : null;
  // 같은 요청 키·줄 키에 다른 내용 — 무엇을 만들라는 것인지 알 수 없다. 처리하지 않는다 (새 요청 키로 보내야 한다)
  if (fingerprint && r?.row_fingerprint && String(r.row_fingerprint) !== fingerprint) return { state: "conflict", requestRowId, batchId: r.batch_id != null ? Number(r.batch_id) : null };
  if (fingerprint && r && !r.row_fingerprint) {
    await conn.execute(`UPDATE h_batch_create_requests SET row_fingerprint = ? WHERE id = ? AND row_fingerprint IS NULL`, [fingerprint, requestRowId]);
  }
  if (r?.status === "done") return { state: "done", requestRowId, batchId: r.batch_id != null ? Number(r.batch_id) : null };
  // 실패했거나 오래 멈춘 처리 — 한 요청만 다시 잡는다 (조건부 UPDATE)
  const [upd]: any = await conn.execute(
    `UPDATE h_batch_create_requests SET status = 'processing', error = NULL, updated_at = NOW()
      WHERE tenant_id = ? AND request_key = ? AND row_key = ?
        AND (status = 'failed' OR (status = 'processing' AND updated_at < NOW() - INTERVAL ${STALE_MIN} MINUTE))`,
    [tenantId, requestKey, rowKey],
  );
  if (Number(upd?.affectedRows ?? 0) === 1) return { state: "retry", requestRowId };
  return { state: "processing", requestRowId };
}

export async function finishRow(conn: any, tenantId: number, requestKey: string, rowKey: string, batchId: number): Promise<void> {
  await conn.execute(
    `UPDATE h_batch_create_requests SET status = 'done', batch_id = ?, error = NULL WHERE tenant_id = ? AND request_key = ? AND row_key = ?`,
    [batchId, tenantId, requestKey, rowKey],
  );
}

/** 실패 표시 — 이미 만든 생산 건이 있으면 그 번호도 남긴다 (생산 건 쪽 create_request_id 가 정본 연결) */
export async function failRow(conn: any, tenantId: number, requestKey: string, rowKey: string, error: string, batchId?: number | null): Promise<void> {
  await conn.execute(
    `UPDATE h_batch_create_requests SET status = 'failed', error = ?, batch_id = COALESCE(?, batch_id) WHERE tenant_id = ? AND request_key = ? AND row_key = ?`,
    [error.slice(0, 1000), batchId ?? null, tenantId, requestKey, rowKey],
  );
}

/** 시작 시 마이그레이션용 DDL */
export const BATCH_CREATE_REQUESTS_DDL = `CREATE TABLE IF NOT EXISTS h_batch_create_requests (
  id bigint NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id int NOT NULL,
  request_key varchar(64) NOT NULL,
  row_key varchar(64) NOT NULL,
  day_batch_group varchar(50) NULL,
  status enum('processing','done','failed') NOT NULL DEFAULT 'processing',
  batch_id bigint NULL,
  error text NULL,
  row_fingerprint char(64) NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bcr_tenant_req_row (tenant_id, request_key, row_key),
  KEY idx_bcr_tenant_created (tenant_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
