/**
 * 2-c 업종 품질 8종 공통 경로 (UI/UX 개편, 2026-10-14)
 *
 * 약속: 6개 업종 테넌트가 **이전과 같은 화면**(같은 공통 페이지 + 같은 업종 값)을 본다. 경로만 48 → 8.
 *  - 옛 경로 48개는 공통 경로로 리다이렉트하며 업종을 쿼리로 넘긴다
 *  - 업종 판정: 쿼리 업종은 슈퍼관리자이거나 테넌트 업종과 같을 때만, 아니면 테넌트 업종
 *  - 메뉴: 업종별 항목은 그대로 남고 경로만 공통 — 업종 격리는 항목의 industry 값
 *  - 기존 즐겨찾기(옛 경로)는 새 경로로 해석
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  INDUSTRY_KEYS, QUALITY_FUNCTIONS, LEGACY_REDIRECTS, MENU_PLACEMENTS, resolveLegacyPath, industryKeyOfCategory, qualityPath, hubOf,
} from "../shared/navigation/menuRegistry";
import { resolveQualityIndustry } from "../client/src/pages/quality/IndustryQualityRoute";
import { readAppRoutes, firstMatch } from "./__helpers__/appRoutes";

const OLD = /^\/dashboard\/(food|cosmetic|pharmaceutical|health-functional|medical-device|general-manufacturing)\/(change-control|nonconforming|corrective-action|audit|training|calibration|supplier|risk-assessment)$/;

describe("경로", () => {
  const routes = readAppRoutes();

  it("공통 경로 8개는 실제 라우트, 옛 경로 48개는 전부 리다이렉트 → 공통 경로 + 업종 쿼리", () => {
    for (const fn of QUALITY_FUNCTIONS) {
      const r = firstMatch(routes, qualityPath(fn));
      expect(r?.kind, fn).toBe("children");
      expect(hubOf(qualityPath(fn))).toBe("quality");
    }
    let n = 0;
    for (const ind of INDUSTRY_KEYS) for (const fn of QUALITY_FUNCTIONS) {
      const from = `/dashboard/${ind}/${fn}`;
      expect(firstMatch(routes, from)?.kind, from).toBe("redirect");
      expect(LEGACY_REDIRECTS.find((r) => r.from === from)?.to).toBe(`/quality/${fn}?industry=${ind}`);
      n++;
    }
    expect(n).toBe(48);
  });

  it("App.tsx 에 옛 업종 품질 컴포넌트 라우트가 남아 있지 않다", () => {
    expect(routes.filter((r) => r.kind !== "redirect" && OLD.test(r.path)).map((r) => r.path)).toEqual([]);
  });
});

describe("업종 판정", () => {
  it("테넌트 업종 그대로 — 이전 /dashboard/{업종}/{기능} 과 같은 업종 값", () => {
    for (const ind of INDUSTRY_KEYS) expect(resolveQualityIndustry({ requested: null, tenant: ind, isSuperAdmin: false })).toBe(ind);
  });

  it("옛 경로 쿼리 업종: 테넌트와 같으면 따르고, 다르면 테넌트 업종 (일반 사용자) / 슈퍼관리자는 쿼리 업종", () => {
    expect(resolveQualityIndustry({ requested: "food", tenant: "food", isSuperAdmin: false })).toBe("food");
    expect(resolveQualityIndustry({ requested: "cosmetic", tenant: "food", isSuperAdmin: false })).toBe("food");
    expect(resolveQualityIndustry({ requested: "cosmetic", tenant: "food", isSuperAdmin: true })).toBe("cosmetic");
    expect(resolveQualityIndustry({ requested: "nonsense", tenant: "pharmaceutical", isSuperAdmin: true })).toBe("pharmaceutical");
    expect(resolveQualityIndustry({ requested: null, tenant: null, isSuperAdmin: false })).toBeNull();
  });

  it("업종 카테고리 표 — 레이아웃 메뉴 격리 표 + 의료기기 플러그인의 electronics", () => {
    expect(industryKeyOfCategory("food")).toBe("food");
    expect(industryKeyOfCategory("cosmetics")).toBe("cosmetic");
    expect(industryKeyOfCategory("pharma")).toBe("pharmaceutical");
    expect(industryKeyOfCategory("supplement")).toBe("health-functional");
    expect(industryKeyOfCategory("general")).toBe("general-manufacturing");
    expect(industryKeyOfCategory("electronics")).toBe("medical-device");
    expect(industryKeyOfCategory(undefined)).toBeNull();
  });
});

describe("메뉴·즐겨찾기", () => {
  it("업종 품질 메뉴 41개 — 경로는 공통, 업종은 industry 값 (업종별 항목 수는 이전과 같다)", () => {
    // 업종 전용 항목(industry 지정)만 — HACCP 폴백의 식품 '부적합제품관리'(2026-10-14 공통 이전)는 업종 지정 없이 별도
    const q = MENU_PLACEMENTS.filter((p) => !!p.industry && (QUALITY_FUNCTIONS as readonly string[]).some((fn) => p.path === qualityPath(fn as any)));
    expect(q.length).toBe(41);
    expect(q.every((p) => !!p.industry)).toBe(true);
    const per = Object.fromEntries(INDUSTRY_KEYS.map((k) => [k, q.filter((p) => p.industry === k).length]));
    expect(per).toEqual({ food: 1, cosmetic: 8, pharmaceutical: 8, "health-functional": 8, "medical-device": 8, "general-manufacturing": 8 });
    expect(MENU_PLACEMENTS.filter((p) => OLD.test(p.path))).toEqual([]);
  });

  it("업종 플러그인 메뉴에도 옛 경로가 없다", () => {
    for (const f of ["food", "cosmetic", "general-manufacturing", "health-functional", "medical-device", "pharmaceutical"]) {
      const src = readFileSync(join(__dirname, "..", `server/domain/plugins/${f}.ts`), "utf-8");
      const paths = [...src.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]);
      expect(paths.filter((p) => OLD.test(p)), f).toEqual([]);
    }
  });

  it("옛 경로로 저장된 즐겨찾기는 새 경로로 해석", () => {
    expect(resolveLegacyPath("/dashboard/cosmetic/nonconforming")).toBe("/quality/nonconforming");
    expect(resolveLegacyPath("/dashboard/food/change-control")).toBe("/quality/change-control");
    expect(resolveLegacyPath("/dashboard/accounting/sales/list")).toBe("/dashboard/accounting/sales/list");
    const layout = readFileSync(join(__dirname, "..", "client/src/components/dashboard/DashboardLayout.tsx"), "utf-8");
    expect(layout).toContain("const favPath = resolveLegacyPath(fav.menuPath);");
    expect(layout).toContain("const required = item.industry ?? getMenuRequiredIndustry(item.path);");
  });
});

describe("식품 부적합 → 공통 부적합 이전 (2026-10-14 대표 결정, 14c)", () => {
  it("식품 메뉴: 부적합제품관리 = /quality/nonconforming, 회수 시뮬레이션 독립 메뉴, 시정조치(CAR)는 유지", () => {
    const food = readFileSync(join(__dirname, "..", "server/domain/plugins/food.ts"), "utf-8");
    expect(food).toContain('label: "부적합제품관리", path: "/quality/nonconforming"');
    expect(food).toContain('label: "회수 시뮬레이션", path: "/recall-simulation"');
    expect(food).not.toContain('"/dashboard/nonconforming-management"');
    expect(food).toContain('path: "/corrective-actions"');
    const legacy = MENU_PLACEMENTS.find((p) => p.label === "부적합제품관리");
    expect(legacy?.path).toBe("/quality/nonconforming");
  });

  it("구형 부적합 경로는 공통 부적합으로 리다이렉트, 구형 화면 라우트는 없다", () => {
    const routes = readAppRoutes();
    for (const from of ["/dashboard/nonconforming-management", "/nonconforming-products"]) {
      expect(firstMatch(routes, from)?.kind, from).toBe("redirect");
      expect(resolveLegacyPath(from)).toBe("/quality/nonconforming");
    }
    expect(firstMatch(routes, "/recall-simulation")?.kind).toBe("component");
  });

  it("공통 부적합 화면에 원인 분석·처리 입력 (식품 구형 화면에 있던 기능)", () => {
    const page = readFileSync(join(__dirname, "..", "client/src/pages/nonconforming/NonconformingPage.tsx"), "utf-8");
    expect(page).toContain("trpc.nonconforming.setRootCause.useMutation");
    expect(page).toContain("trpc.nonconforming.setDisposal.useMutation");
  });

  it("AI 컨텍스트의 부적합은 공통 테이블의 실제 칸을 읽는다", () => {
    const ai = readFileSync(join(__dirname, "..", "server/db/ai/aiContextLayer.ts"), "utf-8");
    expect(ai).toContain("FROM h_nonconformings");
    expect(ai).not.toContain("FROM h_nonconforming_products");
  });

  it("구형 시정조치 화면은 식품 CAR API(food.correctiveAction)로 연결", () => {
    for (const f of ["client/src/pages/haccp/CorrectiveActionList.tsx", "client/src/pages/haccp/CorrectiveAction.tsx"]) {
      const src = readFileSync(join(__dirname, "..", f), "utf-8");
      expect(src, f).not.toMatch(/trpc\.correctiveAction\./);
      expect(src, f).toMatch(/trpc\.food\.correctiveAction\./);
    }
  });
});
