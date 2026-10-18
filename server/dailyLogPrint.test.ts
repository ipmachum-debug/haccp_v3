/**
 * 일일일지 인쇄 — 저장된 질문 그대로, 미입력은 '미기록' (Codex 위생 점검 2026-10-18 DL-01·DL-02)
 * 온습도 기준 변경·빈 냉동 온도 제출 검사 (SAN-01·SAN-02)
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
// 화면 코드는 자동 JSX 런타임 기준 — 테스트(클래식 변환)에서는 React 를 전역에 둔다
(globalThis as any).React = React;
const { renderDailyLogPages } = await import("../client/src/components/print/DailyLogRenderers");
import { DEFAULT_HYGIENE_CHECKS, DEFAULT_FOREIGN_CHECKS, LEGACY_HYGIENE_OBJECT_KEYS, normalizeDailyChecks, checkVerdict } from "../shared/dailyLogChecks";
import { checklistSubmitProblems } from "../shared/checklist/submitChecks";

const html = (data: any) => renderToStaticMarkup(React.createElement("div", null, ...renderDailyLogPages(data)));
const rowOf = (h: string, text: string) => {
  const i = h.indexOf(text);
  return i < 0 ? "" : h.slice(i, h.indexOf("</tr>", i));
};

describe("DL-01: 인쇄는 저장된 질문·결과를 그대로", () => {
  const hygiene = DEFAULT_HYGIENE_CHECKS.map((c) => ({ ...c, checkResult: c.itemOrder === 7 ? "yes" : null }));
  const h = html({ date: "2026-10-18", hygieneChecks: hygiene, foreignMaterialChecks: DEFAULT_FOREIGN_CHECKS.map((c) => ({ ...c })) });
  it("7번 운송 온도 질문 옆에 '적합' — 다른 질문(위생복 세탁)에 붙지 않음", () => {
    expect(rowOf(h, "완제품을 운송하는 중 온도기준은 준수하였는가")).toContain("적합");
    expect(h).not.toContain("위생복 세탁은 실시하였는가");
  });
  it("입력 화면의 18개 질문이 모두 인쇄됨", () => {
    for (const c of DEFAULT_HYGIENE_CHECKS) expect(h).toContain(c.itemText);
    for (const c of DEFAULT_FOREIGN_CHECKS) expect(h).toContain(c.itemText);
  });
  it("DL-02: 미입력은 '미기록' (부적합 아님)", () => {
    expect(rowOf(h, "위생복장과 이물 복장이 구분하여")).toContain("미기록");
    expect(rowOf(h, "위생복장과 이물 복장이 구분하여")).not.toContain("부적합");
    expect(rowOf(h, "원·부재료 선별시")).toContain("미기록");
  });
  it("실제 '아니오'는 부적합", () => {
    const h2 = html({ hygieneChecks: DEFAULT_HYGIENE_CHECKS.map((c) => ({ ...c, checkResult: c.itemOrder === 9 ? "no" : "yes" })) });
    expect(rowOf(h2, "가열후 식힘 공정이 적절히")).toContain("부적합");
  });
  it("온도 평가 미입력 → 미기록, 값 0 은 0 그대로", () => {
    const h3 = html({ refrigeratorTemperature: [{ timePeriod: "오전", checkTime: "08:00", temperature: "0", evaluation: null }, { timePeriod: "오후", checkTime: "", temperature: "", evaluation: "fail" }] });
    const morning = h3.slice(h3.indexOf("원재료 냉장고 온도 점검 기록지"));
    expect(rowOf(morning, "오전")).toContain(">0<");
    expect(rowOf(morning, "오전")).toContain("미기록");
    expect(rowOf(morning, "오후")).toContain("부적합");
  });
});

describe("저장 형태별 해석", () => {
  it("자동 생성 초안(객체)은 입력 화면과 같은 키 순서", () => {
    const items = normalizeDailyChecks({ transport2: true, facility1: false }, DEFAULT_HYGIENE_CHECKS, LEGACY_HYGIENE_OBJECT_KEYS);
    expect(items[6]).toMatchObject({ itemOrder: 7, checkResult: "yes" });
    expect(items[0]).toMatchObject({ itemOrder: 1, checkResult: "no" });
    expect(items[1].checkResult).toBeNull();
  });
  it("배열은 저장된 질문 문구가 정본 (기본 문구로 바꾸지 않음)", () => {
    expect(normalizeDailyChecks([{ category: "기타", itemOrder: 1, itemText: "회사 질문", checkResult: "yes" }], DEFAULT_HYGIENE_CHECKS)[0].itemText).toBe("회사 질문");
  });
  it("판정 세 가지", () => {
    expect([true, "yes", "pass", "적합", false, "no", "fail", null, undefined, ""].map(checkVerdict))
      .toEqual(["적합", "적합", "적합", "적합", "부적합", "부적합", "부적합", "미기록", "미기록", "미기록"]);
  });
});

describe("제출 전 검사 (화면·서버 같은 함수)", () => {
  it("SAN-01: 기준을 25~30 으로 바꿨는데 실측 20 이 '적합' → 막음", () => {
    const p = checklistSubmitProblems("temperature_humidity_check", { spaceRows: [{ area: "시험공간", location: "중앙", tempStandard: "25 ~ 30°C", tempResult: "20", judgment: "적합" }] });
    expect(p.join()).toMatch(/'부적합' 인데 '적합'/);
    expect(checklistSubmitProblems("temperature_humidity_check", { spaceRows: [{ tempStandard: "18 ~ 26°C", tempResult: "20", judgment: "적합" }] })).toEqual([]);
  });
  it("SAN-02: 냉동 온도 빈칸 → 막음, 0 은 값", () => {
    expect(checklistSubmitProblems("refrigeration_check", { equipmentName: "냉동고", temperature: null, checkResult: "pass" }).join()).toMatch(/실측 온도/);
    expect(checklistSubmitProblems("refrigeration_check", { equipmentName: "냉동고", temperature: 0, checkResult: "pass" })).toEqual([]);
  });
  it("서버 승인 요청이 같은 검사를 거침", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const s = readFileSync(join(__dirname, "routers/checklist/genericChecklist.router.ts"), "utf-8");
    expect(s).toMatch(/checklistSubmitProblems\(cur\.formType, cur\.formData\)/);
  });
});
