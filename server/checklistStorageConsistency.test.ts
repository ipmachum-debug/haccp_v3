/**
 * 일지 저장소·기록일 일치 (2026-10-15, Codex 일지 전수 점검)
 *
 * 1. 공통 양식(ChecklistFormLayout)으로 저장하는 일지의 목록 화면은 같은 저장소(genericChecklist, 같은 formType)를 읽어야 한다.
 *    — 개인위생·방충·냉장냉동·품질이상·수질검사·용수사용 6종이 옛 전용 테이블을 읽어 저장한 기록이 목록에 안 보였다.
 * 2. 양식 본문에 기록일 칸(type="date" + collectFormData 에 들어가는 상태)이 있으면 config.dateField 로 알려야 한다.
 *    — 없으면 DB form_date = 저장한 날, 화면 날짜 = 점검일 로 갈라진다.
 * 3. resolveRecordDate / stripPrefillDates 순수 계산.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT, readAppRoutes, firstMatch, reachableClientFiles } from "./__helpers__/appRoutes";
import { resolveRecordDate, stripPrefillDates, isYmd } from "../client/src/lib/checklistRecordDate";

const PAGES = join(REPO_ROOT, "client/src/pages");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

type Form = { file: string; formType: string; listPath: string; dateField: string | null; src: string };

const forms: Form[] = walk(PAGES)
  .map((file) => ({ file, src: readFileSync(file, "utf-8") }))
  .filter(({ src }) => src.includes("<ChecklistFormLayout") && /const config: ChecklistFormConfig/.test(src))
  .map(({ file, src }) => ({
    file: file.slice(REPO_ROOT.length + 1),
    src,
    formType: src.match(/formType: "([a-z_]+)"/)![1],
    listPath: src.match(/listPath: "([^"]+)"/)![1],
    dateField: src.match(/dateField: "([A-Za-z_]+)"/)?.[1] ?? null,
  }));

const routes = readAppRoutes();
// 라우트가 없어 열 수 없는 양식은 제외 (위생·원료·출하 검사 공통 양식 3종 — 실제 검사는 별도 모듈 /dashboard/inspection/*)
const reachable = reachableClientFiles();
const UNROUTED_KNOWN = ["hygiene_inspection", "material_inspection", "shipping_inspection"];
const isReachable = (f: Form) => reachable.has(f.file);
const resolveFile = (importPath: string) => {
  const rel = importPath.replace(/^@\//, "client/src/").replace(/^\.\//, "client/src/");
  return join(REPO_ROOT, rel.endsWith(".tsx") ? rel : `${rel}.tsx`);
};

describe("공통 양식 일지 — 목록이 작성 화면과 같은 저장소를 읽는다", () => {
  it("공통 양식 일지를 찾았다 (40종 안팎)", () => {
    expect(forms.length).toBeGreaterThanOrEqual(35);
  });

  it("열 수 없는 양식은 알려진 3종뿐 (새로 생기면 라우트 연결 또는 목록 정리)", () => {
    expect(forms.filter((f) => !isReachable(f)).map((f) => f.formType).sort()).toEqual(UNROUTED_KNOWN);
  });

  for (const f of forms.filter(isReachable)) {
    it(`${f.formType} → 목록 ${f.listPath}`, () => {
      const r = firstMatch(routes, f.listPath);
      expect(r, `목록 경로 ${f.listPath} 라우트 없음`).toBeTruthy();
      expect(r!.importPath, `${f.listPath} 컴포넌트 import 경로`).toBeTruthy();
      const listSrc = readFileSync(resolveFile(r!.importPath!), "utf-8");
      const readsGeneric =
        (/<ChecklistListPage/.test(listSrc) && listSrc.includes(`formType: "${f.formType}"`)) ||
        (/genericChecklist\.list\.useQuery/.test(listSrc) && listSrc.includes(`"${f.formType}"`)) ||
        // 같은 목록이 여러 일지를 formType 목록으로 보여 주는 경우
        (/genericChecklist\.\w+\.useQuery/.test(listSrc) && listSrc.includes(f.formType));
      expect(readsGeneric, `${r!.importPath} 가 genericChecklist(${f.formType}) 를 읽지 않음`).toBe(true);
    });
  }
});

describe("기록일 — 양식의 날짜 칸이 DB form_date 가 된다", () => {
  for (const f of forms) {
    const collect = f.src.match(/collectFormData\s*=\s*\(\)\s*=>\s*\(\{([\s\S]*?)\}\);/)?.[1] ?? "";
    const collectKeys = new Set([...collect.matchAll(/^\s*(\w+)\s*[,:]/gm)].map((m) => m[1]));
    // type="date" 입력에 묶인 상태 중 collectFormData 에 들어가는 것 (행 안 날짜는 제외)
    const dateStates = [...f.src.matchAll(/type="date"[\s\S]{0,200}?value=\{(\w+)\}|value=\{(\w+)\}[\s\S]{0,120}?type="date"/g)]
      .map((m) => m[1] ?? m[2])
      .filter((k) => collectKeys.has(k) && !/expiry/i.test(k));
    if (dateStates.length === 0) continue;
    it(`${f.formType}: 날짜 칸 ${[...new Set(dateStates)].join(",")} → dateField`, () => {
      expect(f.dateField, `${f.file} config.dateField 누락`).toBeTruthy();
      expect(dateStates).toContain(f.dateField);
    });
  }

  it("formData 객체형 양식(방충 외 2종)도 지정됨", () => {
    const by = Object.fromEntries(forms.map((f) => [f.formType, f.dateField]));
    expect(by.pest_control_checklist).toBe("checkDate");
    expect(by.foreign_material_record).toBe("detectionDate");
    expect(by.hygiene_checklist).toBe("checkDate");
    expect(by.training_log).toBe("education_date");
  });
});

describe("resolveRecordDate / stripPrefillDates", () => {
  it("양식 날짜가 있으면 그것, 없거나 형식이 틀리면 작성일", () => {
    expect(resolveRecordDate({ checkDate: "2026-02-10" }, "checkDate", "2026-02-15")).toBe("2026-02-10");
    expect(resolveRecordDate({ checkDate: "2026-02-10T00:00:00.000Z" }, "checkDate", "2026-02-15")).toBe("2026-02-10");
    expect(resolveRecordDate({ checkDate: "" }, "checkDate", "2026-02-15")).toBe("2026-02-15");
    expect(resolveRecordDate({ checkDate: "2026-13-40" }, "checkDate", "2026-02-15")).toBe("2026-02-15");
    expect(resolveRecordDate({ checkDate: "2026-02-10" }, undefined, "2026-02-15")).toBe("2026-02-15");
    expect(resolveRecordDate(null, "checkDate", "2026-02-15")).toBe("2026-02-15");
    expect(isYmd("2026-02-10")).toBe(true);
  });

  it("미리 채우기에서 공통 날짜 칸 + 그 양식의 기록일 칸을 지운다 (지난 발생일이 따라오지 않게)", () => {
    const out = stripPrefillDates({ formDate: "a", checkDate: "b", issueDate: "2026-01-01", rows: [1] }, "issueDate");
    expect(out).toEqual({ rows: [1] });
  });
});

describe("목록 날짜 열 이름 = 양식 날짜 칸 이름 (기록일의 의미 구분)", () => {
  for (const f of forms.filter((x) => x.dateField)) {
    const r = firstMatch(routes, f.listPath);
    if (!r?.importPath) continue;
    const listSrc = readFileSync(resolveFile(r.importPath), "utf-8");
    const label = listSrc.match(/dateLabel: "([^"]+)"/)?.[1];
    if (!label) continue;
    it(`${f.formType}: 목록 "${label}" ↔ 양식 날짜 칸`, () => {
      const re = new RegExp(`htmlFor="${f.dateField}"[^>]*>\\s*([^<*]+?)\\s*\\*?\\s*<`);
      // Label htmlFor 가 없는 표 형식 양식은 표 머리 글자로 확인
      const formLabel = f.src.match(re)?.[1]?.trim() ?? (new RegExp(`>\\s*${label}\\s*<`).test(f.src) ? label : undefined);
      expect(formLabel, `${f.file} 의 ${f.dateField} Label`).toBe(label);
    });
  }
});

describe("날짜 입력은 저장되는 상태와 연결 (입력해도 저장 안 되는 칸 금지)", () => {
  for (const f of forms.filter(isReachable)) {
    const tags = [...f.src.matchAll(/<Input\b[^>]*type="date"[^>]*\/?>/g)].map((m) => m[0]);
    if (tags.length === 0) continue;
    it(`${f.formType}: type="date" ${tags.length}개 모두 value 연결`, () => {
      for (const t of tags) {
        expect(t, `${f.file}: ${t.slice(0, 80)}`).toMatch(/\bvalue=\{/);
        expect(t).not.toMatch(/defaultValue=/);
      }
    });
  }
});
