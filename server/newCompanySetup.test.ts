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

describe("배합 승인 — 배합 상세에서 기존 서버 흐름으로 (2026-10-20 신규 회사 시험 3차 P1)", () => {
  it("화면: 관리자 = 이 버전 승인·반려, 그 밖 = 승인 요청, 성공 뒤 같은 화면 다시 읽음", () => {
    const s = read("client/src/pages/design/DesignRecipeDetail.tsx");
    expect(s).toMatch(/trpc\.mfReport\.approveVersion\.useMutation/);
    expect(s).toMatch(/trpc\.mfReport\.requestApproval\.useMutation/);
    expect(s).toMatch(/trpc\.mfReport\.reject\.useMutation/);
    expect(s).toMatch(/utils\.productionDesign\.invalidate\(\); onDone\(\)/);
  });
  it("서버: 상태 확인 뒤에만 바꾸고(이미 처리된 버전은 그대로), 상태·이력은 한 트랜잭션, 회사 조건", () => {
    const a = read("server/db/production/mfReportApproval.ts");
    expect(a).toMatch(/APPROVED: \{ from: \["DRAFT", "PENDING"\]/);
    expect(a).toMatch(/r\.tenant_id = \$\{tenantId\} FOR UPDATE/);
    expect(a).toMatch(/AND approval_status = \$\{String\(now\)\}/);
    expect(read("server/routers/production/mfReport.router.ts")).toMatch(/approvalStep\(\(\) => approveMfReportVersion/);
  });
});

describe("신규 회사 시험 4차 — 완료 보고서 열기 · BOM 기준량 · 도장 이름 · 인쇄 문구", () => {
  it("완료 보고서: 저장 주소에서 파일 위치만 꺼내 새 서명 주소 — 서명 쿼리 버림, 다른 회사 경로 거부", async () => {
    const { reportKeyFromUrl } = await import("./storage");
    expect(reportKeyFromUrl("https://cdn.example.test/tenant-15/reports/batch-completion-report-30001-20261020-001-1.pdf", 15)).toBe("tenant-15/reports/batch-completion-report-30001-20261020-001-1.pdf");
    expect(reportKeyFromUrl("https://s3.example.test/bucket/tenant-15/reports/r.pdf?X-Amz-Signature=abc&X-Amz-Expires=3600", 15)).toBe("tenant-15/reports/r.pdf");
    expect(reportKeyFromUrl("https://s3.example.test/tenant-2/reports/r.pdf", 15)).toBeNull();
    expect(reportKeyFromUrl("https://s3.example.test/reports/r.pdf", 15)).toBe("reports/r.pdf");
    expect(reportKeyFromUrl(null, 15)).toBeNull();
    const d = read("client/src/pages/production/BatchDetail.tsx");
    expect(d).not.toMatch(/window\.open\(batch\.completionReportUrl/);
    // 브라우저는 저장소 주소로 가지 않는다 — 같은 사이트 주소로 서버가 받아 내려준다 (#622 재검증: 서버 200 · 브라우저 거부)
    expect(d).toMatch(/const reportPath = `\/api\/batch-report\/download\/\$\{batchId\}`;/);
    expect(d).not.toMatch(/completionReportLink/);
  });
  it("BOM 기준량: 생산 건 기록지 저장값 먼저, 없으면 생산이 쓰는 버전 선택 함수 — 생산 제품 번호와 BOM 번호를 직접 비교하지 않음", () => {
    const s = read("server/routers/haccp/ccpForm.router.ts");
    const f = s.slice(s.indexOf("getBomBatchKg:"), s.indexOf("getEquipmentForBatch:"));
    expect(f).not.toMatch(/WHERE mr\.product_id = \?/);
    expect(f).toMatch(/bom_batch_kg > 0/);
    expect(f).toMatch(/selectBomVersion\(asProductionProductId\(input\.productId\)/);
    expect(read("client/src/components/ccp/CcpMonitoringForms.tsx")).toMatch(/bomLoading \? "BOM 배치량 조회 중\.\.\. " : "배합\(BOM\) 1배치 기준량이 없습니다/);
  });
  it("도장: 긴 이름도 누가 했는지 보이게 (3자 한 줄 · 4~6자 두 줄 · 7자 이상 도장 아래 전체)", async () => {
    const { stampLines } = await import("../client/src/components/checklist/ApprovalStampBox");
    expect(stampLines("홍길동")).toEqual({ inStamp: ["홍길동"], below: null });
    expect(stampLines("시험관리자")).toEqual({ inStamp: ["시험관", "리자"], below: null });
    expect(stampLines("생산흐름 시험관리자")).toEqual({ inStamp: ["인"], below: "생산흐름 시험관리자" });
    expect(stampLines("")).toEqual({ inStamp: ["인"], below: null });
  });
  it("인쇄 문구(주기·방법·개선조치): 우리 공장 공정 추가·고치기에서 한 번 — 같은 공정 칸에, 같은 저장·이력", () => {
    const f = read("client/src/pages/design/DesignFactory.tsx");
    expect(f).toMatch(/function PrintTexts/);
    expect(f).toMatch(/input\.monitoringMethod = texts\.method/);
    expect(f).toMatch(/monitoringMethod: texts\.method\.trim\(\) \|\| undefined/);
    expect(read("server/lib/production/designFactorySave.ts")).toMatch(/col\("monitoring_method", txt\(input\.monitoringMethod\)/);
  });
});


describe("신규 회사 시험 5차 — 완료 보고서 실제 읽힘 확인·다시 만들기 · 회사 폴더 · 도장 줄바꿈", () => {
  it("완료 처리 때 보고서를 회사 폴더에 저장, 열기 전 1바이트 확인, 못 읽으면 그 자리에서 다시 만들기(관리자)", () => {
    expect(read("server/db/production/batchLifecycle.ts")).toMatch(/generateBatchCompletionReport\(batchId, tenantId\)/);
    const r = read("server/routers/production/batch.crud.router.ts");
    expect(r).toMatch(/regenerateCompletionReport: tenantRequiredProcedure/);
    // 새 파일을 서버가 읽을 수 있을 때만, 그 사이 바뀌지 않았을 때만 위치 교체 (기존 위치 먼저 지우지 않음)
    const g = r.slice(r.indexOf("regenerateCompletionReport:"), r.indexOf("getById:"));
    expect(g.indexOf("probeStorageUrl(")).toBeGreaterThan(0);
    expect(g.indexOf("probeStorageUrl(")).toBeLessThan(g.indexOf("UPDATE h_batches SET completion_report_url"));
    expect(g).toMatch(/UPDATE h_batches SET completion_report_url = \? WHERE id = \? AND tenant_id = \? AND \(completion_report_url <=> \?\)/);
    expect(g).toMatch(/batch\.completion_report\.regenerate_failed/);
    expect(r).not.toMatch(/completionReportLink:/);
    const idx = read("server/_core/index.ts");
    expect(idx).toMatch(/app\.use\("\/api\/batch-report", batchReportDownloadRouter\)/);
    expect(read("server/routers/production/batchReportDownload.router.ts")).toMatch(/requireTenantAuth/);
    const d = read("client/src/pages/production/BatchDetail.tsx");
    expect(d).toMatch(/report-regenerate/);
    expect(d).toMatch(/report-make/);
    expect(d).not.toMatch(/보고서 생성 중\.\.\.\s*<\/div>/);
  });
  it("도장 아래 이름은 칸 폭 안에서 줄바꿈 (표 칸 전체 nowrap 을 풀어 옆 칸으로 넘치지 않게)", () => {
    const s = read("client/src/components/checklist/ApprovalStampBox.tsx");
    expect(s).toMatch(/max-w-\[44px\] whitespace-normal break-all/);
  });
});

describe("번호 체계 2b — 화면이 번호 종류를 밝혀 보낸다 (2026-10-20 Codex 점검)", () => {
  it("조정 화면 LOT: 품목 번호와 LOT 의 재고 번호를 직접 비교하지 않고 FK 연결값으로만 (연결 없으면 빈 목록)", async () => {
    const { lotsOfInventoryMaterial } = await import("../client/src/lib/materialLots");
    const lots = [{ id: 1, materialId: 500, status: "available" }, { id: 2, materialId: 100, status: "available" }, { id: 3, materialId: 500, status: "depleted" }];
    // 품목 100 = 쌀A (FK 500), 재고 100 = 설탕B
    expect(lotsOfInventoryMaterial(lots, 500).map((l) => l.id)).toEqual([1]); // 이전: 품목 번호 100 으로 비교 → 설탕B LOT(2)
    expect(lotsOfInventoryMaterial(lots, null)).toEqual([]);
    const tab = read("client/src/pages/inventory/_inventoryManagement/AdjustmentTab.tsx");
    expect(tab).not.toMatch(/Number\(l\.materialId\) === materialId/);
    expect(tab).toMatch(/itemMasterId: materialId/);
    expect(read("server/routers/master/material.router.ts")).toMatch(/inventoryMaterialId: hMaterials\.id/);
  });
  it("발주 반복 추천: 같은 품목·같은 단위만 중복 (kg 줄이 있어도 포대 추천은 넣을 수 있음), 연결 안 된 추천은 중복으로 보지 않음", async () => {
    const { isSuggestionInLines } = await import("../client/src/lib/poSuggestions");
    const lines = [{ materialId: 100, unit: "kg" }];
    expect(isSuggestionInLines(lines, { itemMasterId: 100, unit: "KG " })).toBe(true);
    expect(isSuggestionInLines(lines, { itemMasterId: 100, unit: "bag" })).toBe(false);
    expect(isSuggestionInLines(lines, { itemMasterId: null, unit: "kg" })).toBe(false);
    const c = read("client/src/pages/accounting/PurchaseOrderCreate.tsx");
    expect(c).not.toMatch(/l\.materialId === s\.materialId/);
    expect(c).toMatch(/itemMasterId: l\.materialId/);
  });
  it("호출부: 입고·LOT 조회·투입·차감 제외(추가=품목/해제=재고)·포장 단위(발주 줄의 풀린 재고 번호)·발주 수정(안 바꾼 줄은 그대로)", () => {
    expect(read("client/src/pages/inventory/_inventoryManagement/ReceiptTab.tsx")).toMatch(/itemMasterId: matId/);
    expect(read("client/src/pages/production/MaterialReceiptManagement.tsx")).toMatch(/\{ itemMasterId: selectedMaterialId! \}/);
    const bd = read("client/src/pages/production/BatchDetail.tsx");
    expect(bd).toMatch(/\{ itemMasterId: selectedMaterialId! \}/);
    expect(bd).toMatch(/itemMasterId: selectedMaterialId,/);
    const a = read("client/src/pages/system/AdminSettings.tsx");
    expect(a).toMatch(/inventoryMaterialId: m\.materialId, exempt: false/);
    expect(a).toMatch(/itemMasterId: exemptPick\.id, exempt: true/);
    const l = read("client/src/pages/accounting/PurchaseOrderList.tsx");
    expect(l).toMatch(/inventoryMaterialId: recv\.inventoryMaterialId!/);
    expect(l).toMatch(/sameMaterialAsLineId: l\.keepLineId/);
    // 서버: 추측 변환(toInventoryMaterialId) 을 입고·조정·설정 경로에서 쓰지 않는다
    for (const f of ["server/lib/inventory/inbound/inboundService.ts", "server/lib/inventory/stockAdjustment.ts", "server/routers/inventory/inbound.router.ts", "server/db/inventory/inventoryFunctions.ts"]) {
      expect(read(f)).not.toMatch(/toInventoryMaterialId\(/);
    }
    // 2c: 생산 경로(자동 출고·출고 확인·시작 검사·현장 확인 목록)도 투입 줄 규칙으로 — 추측 변환 함수 자체를 없앴다
    expect(read("server/lib/identity/itemIdentityService.ts")).not.toMatch(/export async function toInventoryMaterialId/);
    for (const f of ["server/lib/production/autoMaterialIssue.ts", "server/lib/production/lineIssueDecision.ts", "server/lib/production/batchStartValidation.ts", "server/routers/production/batch.plan.router.ts"]) {
      expect(read(f)).toMatch(/inventoryMaterialIdOfStockLine/);
    }
  });
});

describe("금속검출 하루 기록지 — 승인 뒤 추가 생산 (2026-10-20 #626 운영 시험)", () => {
  it("준비 검사·현장 화면·동기화·결재·생성이 같은 기록지 고르기(dayMetalForm)를 쓴다 — '그날 첫 기록지' 직접 조회 없음", () => {
    for (const f of ["server/services/batchOrchestrator.ts", "server/services/batchReplan.ts", "server/db/production/batchCRUD.ts", "server/routers/production/batch.crud.router.ts", "server/db/haccp/ccpFormRecordsCRUD.ts"]) {
      expect(read(f)).not.toMatch(/ccp_type = 'CCP-4P' AND work_date = \?[^`]*ORDER BY id( ASC)? LIMIT 1/);
    }
    expect(read("server/lib/haccp/fieldMetalRows.ts")).toMatch(/NOT_IN_OTHER_METAL_FORM/);
    expect(read("server/services/fieldWork.ts")).toMatch(/String\(x\.status\) !== "approved"/);
    // 승인본 머리글 보호
    const c = read("server/db/haccp/ccpFormRecordsCRUD.ts");
    expect(c).toMatch(/SET planned_qty_kg = \?, batch_count = \? WHERE id = \? AND tenant_id = \? AND status <> 'approved'/);
    expect(c).toMatch(/SET \$\{updateFields\.join\(', '\)\} WHERE id = \? AND tenant_id = \? AND status <> 'approved'/);
  });
});

describe("번호 체계 2d — 남은 화면이 품목 번호를 밝혀 보낸다 (2026-10-20)", () => {
  it("재고 추이·발주 제안 이력·원가 절감·단가 이력·매입 전표 수정·중간재 구성·재고 예측", () => {
    expect(read("client/src/pages/inventory/InventoryTrend.tsx")).toMatch(/itemMasterId: selectedMaterialId/);
    expect(read("client/src/pages/inventory/PurchaseProposalHistory.tsx")).toMatch(/itemMasterId: selectedMaterialId/);
    expect(read("client/src/pages/production/CostSavingAI.tsx")).not.toMatch(/materialId: selectedMaterialId/);
    expect(read("client/src/pages/master/MaterialManagement.tsx")).toMatch(/itemMasterId: priceHistoryMaterialId!/);
    expect(read("client/src/components/masterData/MaterialPriceChart.tsx")).toMatch(/itemMasterId: materialId/);
    const ep = read("client/src/components/accounting/EditPurchaseDialog.tsx");
    expect(ep).toMatch(/itemMasterId: formData\.materialId \|\| undefined/);
    expect(ep).toMatch(/purchaseMaterialItem\.useQuery/);
    expect(read("client/src/pages/manufacturing/IntermediatesPage.tsx")).toMatch(/itemMasterId: componentMaterialId/);
    expect(read("client/src/pages/inventory/InventoryPredictionDashboard.tsx")).toMatch(/id: selectedMaterialId/);
    // 원가 절감 함수 인자 순서 (회사, 원료)
    expect(read("server/routers/production/costSavingAI.router.ts")).not.toMatch(/\(input\.materialId, tenantId/);
    // 매입 확정: 이름으로 원료를 찾지 않는다
    const pp = read("server/lib/accounting/purchasePost.ts");
    expect(pp).not.toMatch(/material_name LIKE/);
    expect(pp).not.toMatch(/item_name LIKE/);
    expect(pp).toMatch(/inventoryMaterialIdOfStoredMixed/);
  });
});
