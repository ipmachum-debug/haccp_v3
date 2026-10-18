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
 */

export type ClaimState = "new" | "done" | "processing" | "retry";

export interface ClaimResult {
  state: ClaimState;
  batchId?: number | null;
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

/** 한 줄 처리 시작 — 이미 처리됐거나 처리 중이면 그 상태를 돌려준다 */
export async function claimRow(conn: any, tenantId: number, requestKey: string, rowKey: string, dayBatchGroup: string): Promise<ClaimResult> {
  try {
    await conn.execute(
      `INSERT INTO h_batch_create_requests (tenant_id, request_key, row_key, day_batch_group, status) VALUES (?, ?, ?, ?, 'processing')`,
      [tenantId, requestKey, rowKey, dayBatchGroup],
    );
    return { state: "new" };
  } catch (e: any) {
    if (e?.code !== "ER_DUP_ENTRY") throw e;
  }
  const [rows]: any = await conn.execute(
    `SELECT status, batch_id, TIMESTAMPDIFF(MINUTE, updated_at, NOW()) AS age_min
       FROM h_batch_create_requests WHERE tenant_id = ? AND request_key = ? AND row_key = ? LIMIT 1`,
    [tenantId, requestKey, rowKey],
  );
  const r = (rows as any[])[0];
  if (r?.status === "done") return { state: "done", batchId: r.batch_id != null ? Number(r.batch_id) : null };
  // 실패했거나 오래 멈춘 처리 — 한 요청만 다시 잡는다 (조건부 UPDATE)
  const [upd]: any = await conn.execute(
    `UPDATE h_batch_create_requests SET status = 'processing', error = NULL, updated_at = NOW()
      WHERE tenant_id = ? AND request_key = ? AND row_key = ?
        AND (status = 'failed' OR (status = 'processing' AND updated_at < NOW() - INTERVAL ${STALE_MIN} MINUTE))`,
    [tenantId, requestKey, rowKey],
  );
  if (Number(upd?.affectedRows ?? 0) === 1) return { state: "retry" };
  return { state: "processing" };
}

export async function finishRow(conn: any, tenantId: number, requestKey: string, rowKey: string, batchId: number): Promise<void> {
  await conn.execute(
    `UPDATE h_batch_create_requests SET status = 'done', batch_id = ?, error = NULL WHERE tenant_id = ? AND request_key = ? AND row_key = ?`,
    [batchId, tenantId, requestKey, rowKey],
  );
}

export async function failRow(conn: any, tenantId: number, requestKey: string, rowKey: string, error: string): Promise<void> {
  await conn.execute(
    `UPDATE h_batch_create_requests SET status = 'failed', error = ? WHERE tenant_id = ? AND request_key = ? AND row_key = ?`,
    [error.slice(0, 1000), tenantId, requestKey, rowKey],
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
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bcr_tenant_req_row (tenant_id, request_key, row_key),
  KEY idx_bcr_tenant_created (tenant_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
