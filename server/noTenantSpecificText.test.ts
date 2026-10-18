/**
 * 특정 회사(단지) 전용 문구·숫자가 공용 코드에 남지 않게 (CEO 2026-10-18: "단지 전용은 안 돼")
 *   한계기준·주기·모니터링 방법·개선조치·감도는 모두 회사 설정(공정그룹·설비)에서 온다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILES = [
  "client/src/components/print/CcpRenderers.tsx",
  "client/src/components/ccp/CCP1BForm.tsx",
  "client/src/components/ccp/CCP2BForm.tsx",
  "client/src/components/ccp/ccpCl.ts",
  "client/src/components/ccp/CcpMonitoringForms.tsx",
  "server/lib/blankFormPdf.ts",
  "server/db/haccp/ccpFormRecordsCRUD.ts",
];
const FORBIDDEN = [
  /찹쌀떡류|참쌀떡류|전통떡류|약식\b|마카다미아|호두|땅콩|시루 최대|교반기1호기|교반기2호기/,
  /\|\| *10\b|\|\| *15\b|\|\| *"0\.16"|\|\| *"90"|\?\? *130\b|\?\? *"2\.0"|\?\? *"3\.0"|= *2\.0,|= *3\.0;/,
  /같은품목 작업시 2시간마다|동일품목 연속작업시 2시간/,
  /"0\.12Mpa|"0\.16Mpa|"0\.28Mpa/,
];

describe("공용 CCP 코드에 특정 회사 문구·기본값 없음", () => {
  for (const f of FILES) {
    it(f, () => {
      const src = readFileSync(join(__dirname, "..", f), "utf-8");
      for (const re of FORBIDDEN) {
        const m = src.match(re);
        expect(m, `${f}: ${m?.[0]}`).toBeNull();
      }
    });
  }
  it("인쇄 '주 기' 는 공정그룹 문구(monitoringCycle)에서", () => {
    const src = readFileSync(join(__dirname, "..", "client/src/components/print/CcpRenderers.tsx"), "utf-8");
    expect(src.match(/monitoringCycleText \? renderMultiline\(monitoringCycleText\) : EMPTY_TEXT\("주기"\)/g)?.length).toBe(3);
  });
});
