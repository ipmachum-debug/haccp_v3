/**
 * 일일일지 v2 화면·인쇄 (D1·D2·E, docs/architecture/17) — 인쇄는 기록의 정의 스냅샷, 화면은 회사 방식으로 고른다
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
(globalThis as any).React = React;
const { renderDailyLogV2Pages } = await import("../client/src/components/print/DailyLogV2Renderers");
import { khaccpDefinition } from "../shared/dailyLog/khaccpDefinition";
import { newRecordV2, evaluateRow } from "../shared/dailyLog/recordV2";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf-8");
const pagesHtml = (rec: any, doc?: any) => renderDailyLogV2Pages(rec, doc).map((p) => ({ title: p.title, html: renderToStaticMarkup(React.createElement("div", null, p.content)) }));

describe("v2 인쇄 — 영역마다 한 쪽, 기록의 스냅샷", () => {
  const def = khaccpDefinition();
  it("단지 정의: 5쪽, 빈 기록은 미기록·승인 전 표시", () => {
    const pages = pagesHtml(newRecordV2(def, "2026-11-20", 3), { status: "draft" });
    expect(pages).toHaveLength(5);
    expect(pages.every((p) => p.html.includes("승인 전 기록"))).toBe(true);
    expect(pages[2].html).toContain("미기록");
    expect(pages[2].html).not.toContain("text-red-700 font-medium\">부적합");
  });
  it("0℃ 는 값, 기준 밖은 부적합, 승인 기록은 상태 문구 없음", () => {
    const rec: any = newRecordV2(def, "2026-11-20", 3);
    const pt = def.points.find((p) => p.section === "refrigerator")!;
    rec.measurements = rec.measurements.map((m: any) => {
      if (m.pointId !== pt.pointId) return m;
      const next = { ...m, measuredAt: "09:00", temperature: m.slotId.endsWith(".am") ? 0 : 12 };
      return { ...next, evaluation: evaluateRow(pt, next) };
    });
    const page = pagesHtml(rec, { status: "approved" }).find((p) => p.title.includes("냉장"))!;
    expect(page.html).toContain(">0℃<");
    expect(page.html).toContain("text-center\">적합<");
    expect(page.html).toContain("text-red-700 font-medium\">부적합<");
    expect(page.html).not.toContain("승인 전 기록");
  });
  it("설정이 바뀌어도 인쇄는 기록에 담긴 정의로 — 사용 안 함 영역은 쪽이 없다", () => {
    const d2 = khaccpDefinition();
    d2.enabledSections = ["hygiene", "freezer"];
    expect(pagesHtml(newRecordV2(d2, "2026-11-20", 4)).map((p) => p.title)).toHaveLength(2);
  });
});

describe("화면 연결", () => {
  const form = read("client/src/pages/production/DailyLogForm.tsx");
  it("일지 화면은 회사 방식(mode)으로 v2/이전 화면을 고르고, 방식 조회 실패를 이전 화면으로 넘기지 않는다", () => {
    expect(form).toMatch(/trpc\.dailyLog\.mode\.useQuery/);
    expect(form).toMatch(/return <DashboardLayout><DailyLogV2Form/);
    expect(form).toMatch(/if \(mode\.isError\)/);
  });
  it("F01: v2 회사라도 그 날짜에 이전 방식 기록이 있으면 그 기록 형식(이전 화면)으로 연다 — 자동 변환 없음", () => {
    expect(form).toMatch(/existing\.data && !isV2Record\(existing\.data\.formData\)\) return <DailyLogFormV1 [^>]*legacyOnV2/);
    expect(form).toMatch(/if \(existing\.isLoading\) return loader/);
  });
  it("F02: 날짜를 바꾸면 주소도 ?date= 로 바꾼다 (이전 id 버림)", () => {
    expect(form).toMatch(/navigate\(`\/daily-log\/daily\?date=\$\{d\}`, \{ replace: true \}\)/);
    expect(form).toMatch(/function DailyLogFormV1\(\{ logDate, setLogDate/);
    expect(form).not.toMatch(/function DailyLogFormV1[\s\S]*useState\(paramDate/);
  });
  it("이전 화면: 일지 조회 실패면 빈 새 양식으로 바꾸지 않고 저장을 막는다", () => {
    expect(form).toMatch(/if \(existingError\) return;/);
    expect(form).toMatch(/isLoading = loadingExisting \|\| loadingPrev \|\| existingError/);
  });
  it("v2 입력: 조회만으로 만들지 않고(작성 시작), 버전을 같이 보낸다", () => {
    const v2 = read("client/src/components/production/DailyLogV2Form.tsx");
    expect(v2).toMatch(/startV2\.useMutation/);
    expect(v2).toMatch(/expectedDataVersion: dataVersion/);
    expect(v2).not.toMatch(/useEffect\([^)]*start\.mutate/);
  });
  it("인쇄 미리보기: v2 기록은 v2 쪽, 이전 기록은 이전 쪽", () => {
    const pp = read("client/src/pages/system/PrintPreviewPage.tsx");
    expect(pp).toMatch(/isV2Record\(/);
    expect(pp).toMatch(/renderDailyLogV2Pages\(/);
    expect(pp).toMatch(/renderDailyLogPages\(/);
  });
  it("인쇄 미리보기: ?print=0 이면 인쇄창을 띄우지 않고, PDF 파일명 날짜는 v2 업무일 우선", () => {
    const pp = read("client/src/pages/system/PrintPreviewPage.tsx");
    expect(pp).toMatch(/get\("print"\) !== "0"/);
    expect(pp).toMatch(/ymd\(fd\.businessDate\) \|\| ymd\(fd\.date\)/);
    const v2 = read("client/src/components/production/DailyLogV2Form.tsx");
    expect(v2).toMatch(/print-preview\?ids=\$\{approvalRequestId\}&print=0/);
  });
  it("F03: v2 인쇄 표는 칸 폭 고정 + 줄바꿈 (전역 nowrap 무효화), 행 단위 쪽 넘김", () => {
    const html = renderToStaticMarkup(React.createElement("div", null, renderDailyLogV2Pages(newRecordV2(khaccpDefinition(), "2026-11-20", 3))[0].content));
    expect(html).toContain("dlv2-print");
    expect(html).toMatch(/white-space: normal !important/);
    expect(html).toMatch(/table-layout: fixed !important/);
    expect(html).toMatch(/<colgroup>/);
  });
  it("실제 PDF (Codex PR596): 전역 행 높이 36px 해제, 인쇄 좌우 안쪽 여백(오른쪽 테두리 잘림), 특이사항 한 행, 양식 번호", () => {
    const rec: any = newRecordV2(khaccpDefinition(), "2026-11-20", 3);
    rec.notes = { hygiene: { specialNotes: "메모", improvementAction: "", actionBy: "", confirmedBy: "" } };
    const html = renderToStaticMarkup(React.createElement("div", null, renderDailyLogV2Pages(rec)[0].content));
    expect(html).toMatch(/\.dlv2-print tr \{ height: auto !important; \}/);
    expect(html).toMatch(/특이사항<\/td><td[^>]*>메모<\/td><td[^>]*>개선조치 및 결과<\/td>/);
    const pp = read("client/src/pages/system/PrintPreviewPage.tsx");
    expect(pp).toMatch(/@media print[\s\S]*\.print-page \{ padding: 0 1\.5mm; box-sizing: border-box; \}/);
    expect(pp).toMatch(/`양식 \$\{page\.pageIndex \+ 1\} \/ \$\{page\.totalPages\}`/);
  });
  it("설정 화면: ROUTES 경로, 초안 저장·발행에 설정 버전, 발행 확인 단계", () => {
    expect(read("client/src/App.tsx")).toMatch(/path=\{ROUTES\.DAILY_LOG_SETTINGS\}/);
    const st = read("client/src/pages/production/DailyLogSettings.tsx");
    expect(st).toMatch(/settingsSaveDraft\.useMutation/);
    expect(st).toMatch(/expectedRowVersion: rowVersion/);
    expect(st).toMatch(/confirmPublish/);
    expect(st).not.toMatch(/window\.(prompt|confirm)\(/);
  });
  it("개별 온습도·냉동냉장 화면은 v2 회사에 안내만 (막지 않음)", () => {
    for (const f of ["TemperatureHumidityCheckForm", "RefrigerationCheckForm"]) {
      expect(read(`client/src/pages/checklist/${f}.tsx`)).toMatch(/<DailyLogV2Notice /);
    }
    const n = read("client/src/components/production/DailyLogV2Notice.tsx");
    expect(n).toMatch(/version !== 2\) return null/);
  });
});
