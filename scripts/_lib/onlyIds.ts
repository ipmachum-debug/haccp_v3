/**
 * --only=<id,id,…> 파싱 — 잘못된 값은 오류 (2026-10-16, Codex #541 재검증 P1)
 *
 * 이전: --only=abc / --only=0 / --only= 가 빈 목록이 되어 ID 제한이 빠지고 전체가 대상이 됐다
 *   (1건 시험 적용이 전체 적용·전체 되돌리기로 번질 수 있음).
 * 지금: 옵션이 없으면 null(전체). 옵션이 있으면 양의 안전 정수만, 하나라도 틀리면 throw — DB 연결 전에 종료.
 */
export function parseOnlyIds(argv: string[]): number[] | null {
  const given = argv.filter((a) => a === "--only" || a.startsWith("--only="));
  if (given.length === 0) return null;
  if (given.length > 1) throw new Error("--only 는 한 번만 지정하세요");
  const raw = given[0] === "--only" ? "" : given[0].slice("--only=".length);
  const parts = raw.split(",").map((p) => p.trim());
  if (parts.length === 0 || parts.some((p) => !/^[1-9]\d*$/.test(p))) {
    throw new Error(`--only 값이 올바르지 않습니다: '${raw}' (예: --only=1717 또는 --only=1717,1718)`);
  }
  const ids = parts.map(Number);
  if (ids.some((n) => !Number.isSafeInteger(n))) throw new Error(`--only 값이 너무 큽니다: '${raw}'`);
  return Array.from(new Set(ids));
}
