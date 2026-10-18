/**
 * 공통 일지 승인 요청 전 검사 — 화면과 서버가 같은 함수 (2026-10-18, Codex 위생 점검 SAN-01·SAN-02)
 *
 *   온습도 점검: 기록된 판정이 현재 기준으로 계산한 판정과 다르면 막는다 (기준만 바꾸고 판정이 그대로 남던 문제).
 *   냉동·냉장 설비 점검: 온도를 비우면 0 으로 저장되던 문제 — 실측 온도 없이 승인 요청할 수 없다.
 * 임시 저장은 막지 않는다. 승인 요청(제출)만 막는다. 빈 배열이면 통과.
 */
import { judgeTemp } from "./tempJudge";

const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

export function checklistSubmitProblems(formType: string | null | undefined, formData: any): string[] {
  const out: string[] = [];
  const fd = formData ?? {};
  if (formType === "temperature_humidity_check") {
    const rows: any[] = Array.isArray(fd.spaceRows) ? fd.spaceRows : [];
    for (const r of rows) {
      const calc = judgeTemp(r?.tempResult, r?.tempStandard);
      const name = [r?.area, r?.location].filter(Boolean).join(" ") || "점검 공간";
      if (calc && r?.judgment && r.judgment !== calc) {
        out.push(`${name}: 실측 ${r.tempResult}℃ 는 기준(${r.tempStandard})으로 '${calc}' 인데 '${r.judgment}' 로 기록돼 있습니다 — 다시 판정하세요.`);
      }
    }
  }
  if (formType === "refrigeration_check") {
    if (blank(fd.equipmentName)) out.push("설비명을 입력하세요.");
    if (blank(fd.temperature)) out.push("실측 온도를 입력하세요 — 빈칸은 0℃ 로 저장하지 않습니다.");
    else if (!Number.isFinite(Number(fd.temperature))) out.push("온도는 숫자로 입력하세요.");
    if (blank(fd.checkResult)) out.push("점검 결과를 선택하세요.");
  }
  return out;
}
