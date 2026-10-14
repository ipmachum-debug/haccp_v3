/**
 * 문서 결재자 설정 화면 — plugin 카탈로그 키 (2026-10-15, 대표 발견)
 * 증상: /admin/settings 문서 결재 탭에서 모든 문서가 "선택 안함" (설정 데이터 51건은 그대로)
 * 원인: plugin 카탈로그는 문서 종류 키를 `code` 로 주는데 화면이 `ft.formType` 을 읽어 키가 undefined
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./__helpers__/appRoutes";
import { getDocumentFormTypes } from "../client/src/domain/engines/clientDocumentEngine";
import { DOCUMENT_FORM_TYPES as LEGACY } from "../client/src/lib/documentFormTypes";
import { foodPlugin } from "./domain/plugins/food";

describe("문서 결재자 설정 — 문서 종류 키", () => {
  it("화면이 plugin 의 code 를 formType 으로 맞춘다 (ft.formType 직접 읽기 금지)", () => {
    const src = readFileSync(join(REPO_ROOT, "client/src/pages/system/DocumentApprovalSettingsPage.tsx"), "utf-8");
    expect(src).toMatch(/getDocumentFormTypes\(domainPlugin\)\.map\(\(ft\) => \(\{ formType: ft\.code,/);
    expect(src).toMatch(/settings\.filter\(\(r\) => r\.changed && !!r\.formType\)/);
  });

  it("식품 plugin 카탈로그 키 = legacy 목록 키 (같은 document_type 값)", () => {
    const codes = getDocumentFormTypes(foodPlugin as any).map((t) => t.code);
    expect(codes.length).toBeGreaterThanOrEqual(45);
    expect(codes.every((c) => typeof c === "string" && /^[a-z0-9_]+$/.test(c))).toBe(true);
    const legacy = new Set((LEGACY as any[]).map((t) => t.formType));
    // 일지 화면이 쓰는 대표 키가 plugin 에 있다
    for (const k of ["hygiene_checklist", "pest_control_checklist", "employee_health_check", "temperature_humidity_check"]) {
      expect(codes).toContain(k);
      expect(legacy.has(k)).toBe(true);
    }
  });
});
