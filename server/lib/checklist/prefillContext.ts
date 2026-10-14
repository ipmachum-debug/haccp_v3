/**
 * 일지 자동 채움 — 참고 기록 고르기 (일지 PR 2, 2026-10-15)
 *
 * 이전 getLatestByDate 는 "회사·양식·이전 날짜" 로 최신 1건만 골랐다.
 *  - 오늘 작성 중인 기록(초안)을 몰라서 매번 새 문서만 만들게 했고
 *  - 사업장을 구분하지 않아 다른 사업장 기록이 섞일 수 있었다.
 * 여기서는:
 *  - todayRecords: 같은 날 같은 양식 기록 (이어쓰기 안내·중복 확인용)
 *  - candidates: 오늘 이전 기록 최근 10건 (다른 기록 선택용, 반려 제외)
 *  - reference: 고른 기록(refId) 또는 후보 첫 건 — 승인완료 > 승인대기 > 작성중 순으로 더 믿을 만한 것을 먼저
 *  - 사업장: 사용자에게 사업장이 있으면 그 사업장 기록만. 없으면(관리자) 회사 전체
 */
export type PrefillRow = {
  id: number;
  siteId: number;
  formDate: string;
  status: string | null;
  title: string | null;
  formData: unknown;
  createdAt: Date | string;
};

export type PrefillCandidate = { id: number; siteId: number; formDate: string; status: string; title: string | null; writerName: string | null; summary: string };

const STATUS_RANK: Record<string, number> = { approved: 0, submitted: 1, draft: 2, rejected: 9 };

function parseData(fd: unknown): Record<string, unknown> {
  if (fd && typeof fd === "object") return fd as Record<string, unknown>;
  if (typeof fd === "string") { try { const v = JSON.parse(fd); return v && typeof v === "object" ? v : {}; } catch { return {}; } }
  return {};
}

/** 후보 한 줄 요약 — 첫 행들의 장소·설비 이름 (사람이 고를 수 있게) */
export function summarizeRecord(fd: Record<string, unknown>): string {
  for (const v of Object.values(fd)) {
    if (Array.isArray(v) && v.length && typeof v[0] === "object") {
      const names = v.slice(0, 3).map((r: any) => r?.area ?? r?.location ?? r?.["설비명"] ?? r?.equipmentName ?? r?.name ?? r?.item ?? r?.checkItem ?? r?.installLocation).filter((x) => typeof x === "string" && x.trim());
      if (names.length) return `${names.join(", ")}${v.length > 3 ? ` 외 ${v.length - 3}` : ""} (${v.length}행)`;
    }
  }
  return "";
}

export function pickPrefill(rows: readonly PrefillRow[], opts: { formDate: string; userSiteId: number | null; refId?: number | null }) {
  const scoped = opts.userSiteId ? rows.filter((r) => Number(r.siteId) === Number(opts.userSiteId)) : [...rows];
  const day = (r: PrefillRow) => String(r.formDate).slice(0, 10);
  const todayRecords = scoped.filter((r) => day(r) === opts.formDate).map((r) => ({ id: r.id, status: r.status ?? "draft", siteId: r.siteId }));
  const toCandidate = (r: PrefillRow): PrefillCandidate => {
    const fd = parseData(r.formData);
    const approval = (fd.approval ?? {}) as Record<string, unknown>;
    return {
      id: r.id, siteId: r.siteId, formDate: day(r), status: r.status ?? "draft", title: r.title,
      writerName: typeof approval.writerName === "string" ? approval.writerName : null,
      summary: summarizeRecord(fd),
    };
  };
  const before = scoped
    .filter((r) => day(r) < opts.formDate && (r.status ?? "draft") !== "rejected")
    .sort((a, b) => (day(a) < day(b) ? 1 : day(a) > day(b) ? -1 : 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const candidates = before.slice(0, 10).map(toCandidate);

  let referenceRow: PrefillRow | undefined;
  if (opts.refId) {
    // 직접 고른 기록 — 범위 안(같은 회사·양식·사업장)에서만. 오늘 기록도 고를 수 있다 (참고만, 원본 불변)
    referenceRow = scoped.find((r) => r.id === opts.refId);
  } else if (before.length) {
    // 가장 최근 날짜 안에서 승인완료 > 승인대기 > 작성중
    const latestDay = day(before[0]);
    referenceRow = before.filter((r) => day(r) === latestDay).sort((a, b) => (STATUS_RANK[a.status ?? "draft"] ?? 5) - (STATUS_RANK[b.status ?? "draft"] ?? 5))[0];
  }
  return {
    todayRecords,
    candidates,
    reference: referenceRow
      ? { ...toCandidate(referenceRow), formData: parseData(referenceRow.formData) }
      : null,
    refNotFound: !!opts.refId && !referenceRow,
  };
}
