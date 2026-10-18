/**
 * 하루 생산 입력 방어 (2026-10-19, Codex 단지 생산 입력 회귀 F-PROD-01·02)
 *
 * 입력량 = 제품의 **하루 총생산량**. 공정 회차(증숙·교반·굽기)는 BOM 1회 기준량으로 그 생산 건 안에서 계산한다.
 *   같은 제품을 여러 줄·여러 번 보내면 생산 건이 그만큼 늘고 원료가 그만큼 차감된다 — 기본은 막는다.
 *   실제로 LOT·생산지시를 나눠야 할 때만 API 줄에 separateRun 을 명시한다 (화면 기본 흐름에는 없음 — 원래 일괄 생성 화면과 같게).
 *   과거 생산 건을 같은 제품이라는 이유로 합치지 않는다 (막기만 한다).
 *
 * 시작시각: 배치 시작(in_progress) 때 '지금' 으로 덮어쓰면 과거 업무일 입력·자동 시작에서 계획 시작시각이
 *   입력 시각으로 바뀐다. 입력 시각은 created_at 에 남는다 (감사 시각을 업무일로 바꾸지 않는다).
 */

export interface DayLine { productId: number; separateRun?: boolean }

/** 같은 요청 안의 같은 제품 줄 — 줄 번호(0부터) → 문장. separateRun 이 아닌 두 번째 줄부터 */
export function duplicateLineProblems(items: DayLine[], nameOf: (id: number) => string = (id) => `제품 #${id}`): Map<number, string> {
  const out = new Map<number, string>();
  const firstIdx = new Map<number, number>();
  items.forEach((it, i) => {
    if (!firstIdx.has(it.productId)) { firstIdx.set(it.productId, i); return; }
    if (it.separateRun) return;
    out.set(i, `${nameOf(it.productId)} 이(가) ${firstIdx.get(it.productId)! + 1}번 줄에도 있습니다 — 하루 총생산량을 한 줄에 입력하세요 (회차는 BOM 기준량으로 자동 계산).`);
  });
  return out;
}

/** 같은 업무일에 이미 있는 같은 제품 생산 건 (취소 제외). 같은 요청의 재시도(같은 일일 그룹)는 제외 */
export async function existingSameDayRuns(
  conn: any, tenantId: number, workDate: string, productIds: number[], excludeDayGroup: string | null,
): Promise<Map<number, string[]>> {
  const ids = Array.from(new Set(productIds.filter((x) => Number.isFinite(x))));
  const out = new Map<number, string[]>();
  if (!ids.length) return out;
  const [rows]: any = await conn.query(
    `SELECT product_id, batch_code FROM h_batches
      WHERE tenant_id = ? AND planned_date = ? AND product_id IN (?) AND status <> 'cancelled'
        AND (? IS NULL OR day_batch_group IS NULL OR day_batch_group <> ?)
      ORDER BY id`,
    [tenantId, workDate, ids, excludeDayGroup, excludeDayGroup],
  );
  for (const r of rows as any[]) {
    const k = Number(r.product_id);
    out.set(k, [...(out.get(k) ?? []), String(r.batch_code)]);
  }
  return out;
}

export function existingRunProblem(productName: string, codes: string[]): string {
  return `이 업무일에 ${productName} 생산 건이 이미 있습니다 (${codes.slice(0, 3).join(", ")}${codes.length > 3 ? ` 외 ${codes.length - 3}건` : ""}) — 같은 생산을 다시 만들면 원료가 한 번 더 차감됩니다. 수량을 바꾸려면 기존 생산 건을 수정하세요.`;
}

/**
 * 시작(in_progress) 때 시작시각을 '지금' 으로 바꿀지.
 *   keepPlanned(자동 시작) 이거나 업무일이 오늘이 아니면, 이미 있는 계획 시작시각을 유지한다.
 *   시작시각이 비어 있으면 이전처럼 지금.
 */
export function shouldStampStartNow(a: { hasStartTime: boolean; plannedDate: string | null; todayKst: string; keepPlanned?: boolean }): boolean {
  if (!a.hasStartTime) return true;
  if (a.keepPlanned) return false;
  return !a.plannedDate || a.plannedDate === a.todayKst;
}
