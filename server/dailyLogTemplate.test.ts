/**
 * 일일일지 원본 템플릿 (PR-A, docs/architecture/17) — 켠 회사의 새 기록에만, 과거 기록 인쇄는 그대로
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
(globalThis as any).React = React;
const { renderDailyLogPages } = await import("../client/src/components/print/DailyLogRenderers");
import {
  KHACCP_HYGIENE, KHACCP_FOREIGN, KHACCP_TEMPLATE_CODE, khaccpDefaultChecks, khaccpSubmitIssues, isKhaccpRecord,
} from "../shared/dailyLog/khaccpTemplate";
import { LEGACY_V0_HYGIENE_CHECKS, DEFAULT_HYGIENE_CHECKS, normalizeDailyChecks, LEGACY_HYGIENE_OBJECT_KEYS } from "../shared/dailyLogChecks";

const html = (data: any) => renderToStaticMarkup(React.createElement("div", null, ...renderDailyLogPages(data)));
const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf-8");
const tplRecord = (patch: (h: any[]) => void = () => {}) => {
  const d: any = { templateCode: KHACCP_TEMPLATE_CODE, ...khaccpDefaultChecks() };
  patch(d.hygieneChecks);
  return d;
};

describe("원본 정의 — 18·14문항, 분류, 안정 ID", () => {
  it("문항 수·ID 유일", () => {
    expect(KHACCP_HYGIENE).toHaveLength(18);
    expect(KHACCP_FOREIGN).toHaveLength(14);
    expect(new Set([...KHACCP_HYGIENE, ...KHACCP_FOREIGN].map((x) => x.itemId)).size).toBe(32);
  });
  it("원본 분류: 위생 1~7 작업전, 이물 공정중 3~4·작업자 5~9", () => {
    expect(KHACCP_HYGIENE.slice(0, 7).every((x) => x.category === "작업전")).toBe(true);
    expect(KHACCP_FOREIGN.filter((x) => x.category === "공정중 혼입관리").map((x) => x.itemOrder)).toEqual([3, 4]);
    expect(KHACCP_FOREIGN.filter((x) => x.category === "작업자에 의한 이물혼입 관리").map((x) => x.itemOrder)).toEqual([5, 6, 7, 8, 9]);
  });
  it("원본 문구 (코드 기본값의 오기 없음)", () => {
    const all = [...KHACCP_HYGIENE, ...KHACCP_FOREIGN].map((x) => x.itemText).join("\n");
    for (const t of ["외출 복장", "개인 장신구", "자동온도기록지", "탐침온도계", "장갑 등 착용상태", "끈끈이 롤러등", "틈이나 구멍이 없이"]) expect(all).toContain(t);
    for (const t of ["이물 복장", "개인 청소가", "지육온도기록지", "천장 등 작업상태", "곤충이 붙어", "방문자 벽", "온송"]) expect(all + KHACCP_HYGIENE.map((x) => x.subcategory).join()).not.toContain(t);
  });
  it("운송 온도: 7번 ℃ 값만, 18번 예/아니오 + ℃ — 같은 질문 형태로 합치지 않음", () => {
    expect(KHACCP_HYGIENE[6]).toMatchObject({ itemId: "H07", responseType: "temperature", tempKey: "transportTemp" });
    expect(KHACCP_HYGIENE[17]).toMatchObject({ itemId: "H18", responseType: "check_temperature", tempKey: "vehicleTemp" });
  });
});

describe("과거 기록 해석은 그대로 (Codex 재검토 P1)", () => {
  it("v0 정의는 얼어 있고, 켜지 않은 회사의 기본값 = v0 (원본 템플릿과 별개)", () => {
    expect(Object.isFrozen(LEGACY_V0_HYGIENE_CHECKS)).toBe(true);
    expect(Object.isFrozen(LEGACY_V0_HYGIENE_CHECKS[0])).toBe(true);
    expect(DEFAULT_HYGIENE_CHECKS.map((x) => x.itemText)).toEqual(LEGACY_V0_HYGIENE_CHECKS.map((x) => x.itemText));
  });
  it("자동 초안(객체)은 v0 질문으로 읽음 — 원본 템플릿 문구로 바뀌지 않음", () => {
    const items = normalizeDailyChecks({ facility1: true }, LEGACY_V0_HYGIENE_CHECKS, LEGACY_HYGIENE_OBJECT_KEYS);
    expect(items[0].itemText).toBe(LEGACY_V0_HYGIENE_CHECKS[0].itemText);
  });
  it("인쇄·입력 화면이 v0 를 기준으로 읽음", () => {
    expect(read("client/src/components/print/DailyLogRenderers.tsx")).toMatch(/normalizeDailyChecks\(d\.hygieneChecks, LEGACY_V0_HYGIENE_CHECKS/);
  });
  it("templateCode 없는 기록(과거·승인)은 이전 인쇄 그대로 — 운송 온도 칸·원본 머리 문구 없음", () => {
    const legacy = { hygieneChecks: LEGACY_V0_HYGIENE_CHECKS.map((x, i) => ({ ...x, checkResult: "yes", ...(i === 6 ? { transportTemp: "-" } : {}) })) };
    const h = html(legacy);
    expect(h).toContain("① 관리기준 이탈 시 즉시 원인 파악 및 조치");
    expect(h).not.toContain("생산팀장에게 통보");
    expect(h).not.toContain("℃</span>");
    expect(h).toContain("감시시각");
  });
});

describe("원본 템플릿 기록 인쇄", () => {
  it("원본 머리 정보·개선조치 원문·감시시작, 운송 온도 값", () => {
    const h = html(tplRecord((hc) => { hc[6].transportTemp = 4.5; hc[17].checkResult = "yes"; hc[17].notApplicable = true; hc[17].notApplicableReason = "당일 출하 없음"; }));
    expect(h).toContain("생산팀장에게 통보");
    expect(h).toContain("온도: 1℃~35℃, 습도: 65%이하");
    expect(h).toContain("감시시작");
    expect(h).toContain("4.5℃");
    expect(h).toContain("운송 없음 (당일 출하 없음)");
    expect(h).toContain("완제품을 운송하는 중 온도기준을 준수하였는가?(자동온도기록지 별도관리)");
  });
  it("0 은 0℃, 빈칸은 미기록", () => {
    const h = html(tplRecord((hc) => { hc[6].transportTemp = 0; }));
    expect(h).toContain("0℃");
    const h2 = html(tplRecord());
    expect(h2).toMatch(/자동온도기록지 별도관리\)<\/td><td[^>]*>미기록/);
  });
});

describe("제출 검사 — 새 기록은 숫자 또는 '운송 없음'+사유 (Codex P2: '-' 는 과거 표시 호환만)", () => {
  it("과거 기록은 검사하지 않음 ('-' 그대로)", () => {
    expect(khaccpSubmitIssues({ hygieneChecks: [{ transportTemp: "-" }] })).toEqual([]);
    expect(isKhaccpRecord({ templateCode: "other" })).toBe(false);
  });
  it("빈칸·'-' 는 막고, 0·음수·소수는 값", () => {
    expect(khaccpSubmitIssues(tplRecord()).length).toBe(3); // 7 온도, 18 온도, 18 예/아니오
    expect(khaccpSubmitIssues(tplRecord((hc) => { hc[6].transportTemp = "-"; hc[17].vehicleTemp = -1.5; hc[17].checkResult = "no"; })).join()).toMatch(/위생 7번/);
    expect(khaccpSubmitIssues(tplRecord((hc) => { hc[6].transportTemp = 0; hc[17].vehicleTemp = -1.5; hc[17].checkResult = "no"; }))).toEqual([]);
  });
  it("'운송 없음' 은 사유 필수, 온도와 함께 쓰면 막음", () => {
    expect(khaccpSubmitIssues(tplRecord((hc) => { hc[6].notApplicable = true; hc[17].notApplicable = true; hc[17].notApplicableReason = "출하 없음"; hc[17].checkResult = "yes"; })).join()).toMatch(/위생 7번.*사유/);
    expect(khaccpSubmitIssues(tplRecord((hc) => { hc[6].notApplicable = true; hc[6].notApplicableReason = "출하 없음"; hc[6].transportTemp = 3; hc[17].notApplicable = true; hc[17].notApplicableReason = "출하 없음"; hc[17].checkResult = "yes"; })).join()).toMatch(/하나만 선택/);
  });
});

describe("서버 경로", () => {
  const router = read("server/routers/production/dailyLog.router.ts");
  it("templateCode 는 서버가 생성 때만 정함 (화면 값 버림), 기존 기록은 그 기록의 것", () => {
    expect(router).toMatch(/const clientFd = stripServerOwned\(input\.formData\)/);
    expect(router).toMatch(/existingRows\.length\s*\? \(existingFd\.templateCode \?\? null\)\s*: \(\(await templateEnabled\(tenantId\)\)/);
  });
  it("승인된 일지는 저장·수정 거부, 제출·승인 관문이 같은 운송 온도 검사", () => {
    expect(router.match(/승인된 일일일지는 수정할 수 없습니다/g)?.length).toBeGreaterThanOrEqual(3); // v1 저장·승인관리 수정·v2 저장
    expect(router).toMatch(/khaccpSubmitIssues\(\{ \.\.\.existingFd, \.\.\.clientFd, templateCode \}\)/);
    expect(read("server/lib/production/dailyLogApprovalGate.ts")).toMatch(/khaccpSubmitIssues\(fd\)/);
  });
  it("자동 생성 초안도 켠 회사만 원본 템플릿", () => {
    expect(read("server/lib/production/autoDailyReport.ts")).toMatch(/isTenantFeatureEnabled\(await getRawConnection\(\), tenantId, KHACCP_TEMPLATE_FEATURE\)/);
  });
});
