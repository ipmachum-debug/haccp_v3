/**
 * 방충·방서 점검표 — 옛 형식(items) 호환 변환 (2026-10-15, Codex 점검: 공통 기록 #91)
 *
 * 옛 양식은 form_data.items = [{ location, deviceType, captureCount, notes }] 로 저장했다.
 * 지금 양식은 form_data.rows = [{ equipmentName, installLocation, flyingPests, crawlingPests, managementNote, … }] 만 읽어서
 * 옛 기록을 열면 행이 비어 보였다.
 *
 * 변환 원칙 — 없는 정보를 만들지 않는다:
 *  - 장치 이름: 옛 스키마에 정의된 값만 한글로 (trap_light=포충등, trap_box=포서통), 모르는 값은 원래 값 그대로
 *  - 포획 수: 옛 기록에는 비래·보행 구분이 없다 → 해충 칸에 나눠 넣지 않고 관리 비고에 "포획 N (구분 없음)" 으로 남긴다
 *  - 옛 형식의 확인자·개선조치(최상위 칸)는 특이사항에 옮겨 적는다
 *  - 무엇을 옮겼고 무엇을 옮기지 못했는지 notices 로 돌려준다 (부분 복원을 성공으로 표시하지 않기 위해)
 */
export const LEGACY_DEVICE_LABELS: Readonly<Record<string, string>> = { trap_light: "포충등", trap_box: "포서통" };

export type LegacyPestItem = { location?: unknown; deviceType?: unknown; captureCount?: unknown; notes?: unknown };

export type ConvertedPestRow = {
  equipmentName: string;
  installLocation: string;
  managementNote: string;
};

export type PestCompatResult = {
  converted: boolean;
  rows: ConvertedPestRow[];
  specialNotesAppend: string;
  notices: string[];
};

const str = (v: unknown) => (v == null ? "" : String(v)).trim();

export function convertLegacyPestItems(data: Record<string, unknown> | null | undefined): PestCompatResult {
  const empty: PestCompatResult = { converted: false, rows: [], specialNotesAppend: "", notices: [] };
  if (!data || (Array.isArray(data.rows) && data.rows.length > 0)) return empty;
  const items = Array.isArray(data.items) ? (data.items as LegacyPestItem[]) : [];
  if (items.length === 0) return empty;

  const unknownDevices = new Set<string>();
  const rows = items.map((it) => {
    const dev = str(it.deviceType);
    const label = LEGACY_DEVICE_LABELS[dev];
    if (dev && !label) unknownDevices.add(dev);
    const count = it.captureCount;
    const parts: string[] = [];
    if (count !== undefined && count !== null && str(count) !== "") parts.push(`포획 ${str(count)} (옛 기록 · 비래/보행 구분 없음)`);
    if (str(it.notes)) parts.push(str(it.notes));
    return { equipmentName: label ?? dev, installLocation: str(it.location), managementNote: parts.join(" · ") };
  });

  const extra: string[] = [];
  if (str(data.confirmer)) extra.push(`확인자: ${str(data.confirmer)}`);
  if (str(data.correctiveAction)) extra.push(`개선조치: ${str(data.correctiveAction)}`);

  const notices = [
    `옛 형식 기록입니다. ${rows.length}개 행을 지금 양식으로 옮겨 표시했습니다.`,
    "포획 수는 옛 기록에 비래·보행 구분이 없어 해충 칸이 아닌 관리 비고에 적었습니다.",
  ];
  if (unknownDevices.size) notices.push(`장치 종류 ${[...unknownDevices].join(", ")} 는 옛 값 그대로 표시합니다.`);
  if (extra.length) notices.push("옛 형식의 확인자·개선조치는 특이사항에 옮겨 적었습니다.");
  notices.push("이 화면에서 저장하면 지금 형식으로 저장됩니다.");

  return { converted: true, rows, specialNotesAppend: extra.join("\n"), notices };
}
