/**
 * 묶음 순차(grouped) 설비 운영의 측정시각 계산 — 순수 함수 (2026-10-16)
 *
 * 규칙은 server/db/haccp/ccpFormSettings.ts (syncCcpRowsToFormRows) 의 grouped 분기와 같다.
 *   - 행 순번(batch_seq) 1·2·3 → 첫 묶음 (같은 시각), 4·5·6 → 두 번째 묶음 (+간격)
 *   - 한 회차의 묶음 수 = ceil(설비 수 / 묶음 크기). 회차가 넘어가면 증숙기 한 사이클(cycleMin) 뒤
 *   offset = 회차 × cycleMin + 회차 안 묶음 순서 × intervalMin
 * 기준 시각(startTime) 은 기록지 첫 행의 시각 — 다른 품목과의 설비 사용 간격이 이미 반영돼 있다.
 */

export interface GroupedTimeParams {
  startTime: string; // HH:mm
  equipCount: number; // 기록지에 나오는 서로 다른 설비 수
  cycleMin: number; // 설비 1회 운전 시간 (h_ccp_rows.duration_min)
  intervalMin: number; // 묶음 간 간격
  batchSize: number; // 묶음 크기 (동시 운전 설비 수)
}

export function addMinutes(timeHHmm: string, addMin: number): string {
  const [h, m] = timeHHmm.split(":").map(Number);
  const total = h * 60 + m + addMin;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function isHHmm(v: unknown): v is string {
  return typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v);
}

/** batchSeq(1부터) 행의 묶음 순차 측정시각 */
export function groupedTimeFor(batchSeq: number, p: GroupedTimeParams): string {
  const batchSize = Math.max(1, Math.floor(p.batchSize));
  const groupsPerRound = Math.max(1, Math.ceil(p.equipCount / batchSize));
  const groupIndex = Math.floor((batchSeq - 1) / batchSize);
  const round = Math.floor(groupIndex / groupsPerRound);
  const groupInRound = groupIndex % groupsPerRound;
  return addMinutes(p.startTime, round * p.cycleMin + groupInRound * p.intervalMin);
}
