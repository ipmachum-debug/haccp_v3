/**
 * 배치 자동출고 잠금 (UI/UX 개편 P-2 보강, 2026-10-14)
 *
 * 생산 시작의 자동출고와 '누락 출고 다시 실행' 이 같은 배치에서 겹치지 않게 한다.
 * 자동출고의 줄 단위 재출고 방어(#483)는 "조회 후 출고" 라서 두 실행이 동시에 돌면 같은 줄을 둘 다 출고할 수 있다.
 * MySQL GET_LOCK(이름, 0) — 기다리지 않고 바로 실패. 잠금은 연결에 묶이므로 풀에서 연결 하나를 잡고 끝나면 반납한다.
 */
import { getRawConnection } from "../../db/connection";

export const batchIssueLockName = (tenantId: number, batchId: number) => `millio:batch-issue:${tenantId}:${batchId}`;

export async function withBatchIssueLock<T>(
  tenantId: number,
  batchId: number,
  fn: () => Promise<T>,
): Promise<{ locked: true; value: T } | { locked: false }> {
  const pool: any = await getRawConnection();
  const conn = await pool.getConnection();
  const name = batchIssueLockName(tenantId, batchId);
  try {
    const [rows]: any = await conn.query("SELECT GET_LOCK(?, 0) AS got", [name]);
    if (Number(rows?.[0]?.got) !== 1) return { locked: false };
    try {
      return { locked: true, value: await fn() };
    } finally {
      await conn.query("SELECT RELEASE_LOCK(?)", [name]).catch(() => undefined);
    }
  } finally {
    conn.release();
  }
}
