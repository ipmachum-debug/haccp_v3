/**
 * 신규 회사 첫 설정 (2026-10-20 신규 회사 실제 브라우저 시험 1차)
 *   P1 공정 생성: 빈칸 = 그 방향 기준 없음 (생성·수정 같은 계약), 오류는 창 안에, 입력 유지
 *   P1 업종: 가입 때 고르고, 없으면 로그인 첫 화면에서 고르고, 관리자 설정에도 있음 (관리자만 변경)
 *   P2 우리 공장: 첫 설비·공정 등록을 그 화면 안에서 (같은 저장 경로)
 *   그 밖: 체험 기간 하나, 설비 새 등록은 빈 양식·중복 거부, 제품 없음 → 등록 연결, 회사명 재입력 없음, 개발 도구 숨김
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { limitProblems } from "./lib/haccp/processGroupLimits";
import { TRIAL_DAYS } from "../shared/const";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf-8");

describe("공정 한계기준 — 빈칸 = 기준 없음", () => {
  it("하한만·상한만·빈칸·0 은 통과, 최소 > 최대와 숫자 아닌 값만 막음", () => {
    expect(limitProblems({ temperatureMin: 90, temperatureMax: null, timeMin: 10, pressureMin: 0.16 })).toEqual([]);
    expect(limitProblems({ temperatureMax: 200 })).toEqual([]);
    expect(limitProblems({ timeMin: 0, timeMax: 0 })).toEqual([]);
    expect(limitProblems({ temperatureMin: 95, temperatureMax: 90 })[0]).toMatch(/온도.*최소/);
    expect(limitProblems({ phMin: Number.NaN })[0]).toMatch(/pH 최소/);
  });
  it("서버: 생성 입력도 null 을 받고, 0 을 지우지 않고, 공정·설비 연결은 한 트랜잭션", () => {
    const s = read("server/routers/ccpMonitoring/processGroups.router.ts");
    const create = s.slice(s.indexOf("createProcessGroup:"), s.indexOf("updateProcessGroup:"));
    expect(create).toMatch(/temperatureMax: z\.number\(\)\.nullable\(\)\.optional\(\)/);
    expect(create).not.toMatch(/input\.temperature(Min|Max) \|\| null/);
    expect(create).toMatch(/beginTransaction[\s\S]*commit[\s\S]*rollback/);
    expect(create).toMatch(/이 회사의 설비가 아닌/);
    expect(s).toMatch(/limitProblems\(input\)[\s\S]*limitProblems\(input\)/); // 생성·수정 둘 다
  });
  it("화면: 오류는 창 안에(입력·설비 선택 유지), 성공해야 닫고 비움, 0 은 빈칸으로 바꾸지 않음", () => {
    const s = read("client/src/pages/haccp/CCPLimitsManagement.tsx");
    expect(s).toMatch(/group-save-error/);
    expect(s).toMatch(/limit-blank-note/);
    expect(s).toMatch(/setCreateKey\(\(k\) => k \+ 1\)/);
    expect(s).toMatch(/temperatureMax: initialData\?\.temperature_max \?\? initialData\?\.temperatureMax \?\? ""/);
    const create = s.slice(s.indexOf("const createMutation = trpc.ccpMonitoring.createProcessGroup"), s.indexOf("const updateMutation"));
    expect(create).not.toMatch(/onError/); // 실패는 토스트로 사라지지 않고 창 안에
  });
});

describe("업종 — 회사 첫 입력에서, 없으면 첫 화면에서", () => {
  it("가입: 업종 필수 선택 → 서버가 목록 코드만 받고 분류도 저장", () => {
    const c = read("client/src/pages/landing/OnboardingPage.tsx");
    expect(c).toMatch(/signup-industry/);
    expect(c).toMatch(/if \(!form\.industryCode\) return "업종을 골라주세요"/);
    const s = read("server/routers/auth/onboarding.router.ts");
    expect(s).toMatch(/!INDUSTRY_PROFILES\[input\.industryCode\]/);
    expect(s).toMatch(/industry_code, industry_category\)/);
  });
  it("업종 변경은 관리자만·목록 코드만, 바꾸면 업종 메뉴(플러그인)도 바로 다시", () => {
    const s = read("server/routers/system/industry.router.ts");
    expect(s).toMatch(/업종은 관리자만 바꿀 수 있습니다/);
    expect(read("client/src/hooks/useIndustryFeatures.ts")).toMatch(/utils\.domain\.currentPlugin\.invalidate\(\)/);
  });
  it("업종이 없는 회사 관리자: 첫 화면 맨 위에서 고름 → 공정이 없으면 우리 공장으로. 관리자 설정에도 업종 칸", () => {
    const b = read("client/src/components/dashboard/FirstSetupBanner.tsx");
    expect(b).toMatch(/setup-industry/);
    expect(b).toMatch(/setup-factory/);
    expect(b).toMatch(/ROUTES\.DESIGN_FACTORY/);
    expect(read("client/src/components/dashboard/DashboardLayout.tsx")).toMatch(/<FirstSetupBanner \/>\{children\}/);
    expect(read("client/src/pages/system/AdminSettings.tsx")).toMatch(/industry-card[\s\S]*<IndustryPicker \/>/);
    expect(read("client/src/pages/system/SystemSettings.tsx")).not.toMatch(/industryCode \|\| "C10"/); // 정하지 않은 업종을 '식품' 으로 보이지 않음
  });
});

describe("우리 공장 — 첫 설비·공정 등록을 그 화면에서", () => {
  it("공정이 없으면 등록 칸을 바로 열고, 저장은 CCP 관리와 같은 경로", () => {
    const s = read("client/src/pages/design/DesignFactory.tsx");
    expect(s).not.toMatch(/먼저 등록하세요 \(CCP 관리\)/);
    expect(s).toMatch(/!groups\.length \|\| adding/);
    expect(s).toMatch(/trpc\.equipment\.create\.useMutation/);
    expect(s).toMatch(/trpc\.ccpMonitoring\.createProcessGroup\.useMutation/);
    expect(s).toMatch(/np-error/);
    expect(s).toMatch(/batchOperationTime: int\(newEq\.cycle\)/); // 새 설비의 한 번 도는 시간도 같이
    // 받은 '한 번 도는 시간' 을 저장에서 버리지 않음
    expect(read("server/db/haccp/equipmentGroupsTenant.ts")).toMatch(/batchOperationTime: equipment\.batchOperationTime \?\? null/);
  });
});

describe("그 밖", () => {
  it("체험 기간 하나 — 서버 부여와 첫 화면·가입·FAQ 안내가 같은 값", () => {
    expect(TRIAL_DAYS).toBe(14);
    expect(read("server/routers/auth/onboarding.router.ts")).toMatch(/getDate\(\) \+ TRIAL_DAYS/);
    for (const f of ["client/src/pages/landing/LandingPage.tsx", "client/src/pages/FAQPage.tsx", "client/src/pages/RoadmapPage.tsx", "client/src/pages/landing/OnboardingPage.tsx"]) {
      expect(read(f)).not.toMatch(/30일 무료|30-day free|30 days free|14일 무료/);
    }
  });
  it("설비 새 등록: 열 때마다 빈 양식, 같은 이름·코드는 서버가 거부", () => {
    expect(read("client/src/pages/haccp/CCPMonitoring.tsx")).toMatch(/\{isCreateDialogOpen && \(\s*<EquipmentFormDialog/);
    expect(read("server/routers/checklist/equipment.router.ts")).toMatch(/같은 이름의 설비가 이미 있습니다/);
  });
  it("제품 없음 → 제품 등록 연결, 메뉴 이름 = 여는 화면, 회사명 재입력 없음, 개발 도구는 플랫폼 관리자만", () => {
    expect(read("client/src/pages/production/TodayProductionWorkbench.tsx")).toMatch(/product-first-add/);
    expect(read("client/src/components/dashboard/DashboardLayout.tsx")).toMatch(/"마스터 데이터": `\$\{industryLabel\("product", "제품"\)\}·\$\{materialLabel\} 마스터`/);
    expect(read("server/db/system/companyInfo.ts")).toMatch(/SELECT t\.name/);
    expect(read("client/src/pages/system/AdminSettings.tsx")).toMatch(/\{isPlatformAdmin && \(<>/);
    const a = read("server/routers/system/admin.router.ts");
    expect(a.match(/ctx\.user\.role !== "super_admin"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("BOM 신규 저장 — 품목 정체성 번호 하나 (2026-10-20 신규 회사 시험 2차 P1)", () => {
  it("등록 화면: 제품은 정체성 목록(자사 제품)에서, 제품명은 고르면 채움, 들어가는 곳을 처음 입력에서, 실패는 화면에", () => {
    const s = read("client/src/pages/production/MfReportCreate.tsx");
    expect(s).toMatch(/trpc\.itemMaster\.list\.useQuery\(\{ itemType: "own_product"/);
    expect(s).not.toMatch(/trpc\.product\.list\.useQuery/);
    expect(s).toMatch(/if \(p && !nameTouched\) setProductName\(p\.itemName\)/);
    expect(s).toMatch(/new-stage/);
    expect(s).toMatch(/processGroupId: ing\.processGroupId \?\? null/);
    expect(s).toMatch(/mf-save-error/);
    expect(read("client/src/pages/design/DesignRecipes.tsx")).toMatch(/첫 배합 등록/);
  });
  it("서버: 회사 소유 + 칸마다 종류(제품 = 자사 제품, 원료 = 원료), 머리·버전·원료 줄 한 트랜잭션", () => {
    expect(read("server/routers/production/mfReport.router.ts")).toMatch(/await assertMfIdsOwned\(conn[\s\S]*await assertMfItemKinds\(conn/);
    const o = read("server/lib/production/mfReportOwnership.ts");
    expect(o).toMatch(/BOM_PRODUCT_TYPES = \["own_product"\]/);
    const c = read("server/db/production/mfReportCRUD.ts");
    expect(c).toMatch(/return db\.transaction\(async \(tx: any\) =>/);
    expect(c).toMatch(/entryStage: pg != null \? null/);
  });
});
