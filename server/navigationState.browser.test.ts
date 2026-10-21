/**
 * 작업 위치 보존 — 실제 브라우저(Chromium)·실제 라우터(wouter)·실제 방문 이력으로 (2026-10-21)
 *   server/__fixtures__/navHarness.tsx 를 esbuild 로 묶어 로컬 서버에서 띄운다 (운영 서버·DB 없음).
 *   새로고침·직접 링크·뒤로/앞으로·중첩 탭·검색 이력·돌아갈 곳·미저장 입력 보호를 확인한다.
 *   Chromium 을 띄울 수 없는 환경이면 건너뛴다.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import path from "path";
import type { AddressInfo } from "net";

let server: http.Server | null = null;
// 합성 조회 값 (회사 자료 아님) — 매입 60건(서로 다른 날짜 = 60묶음 = 3페이지), 매입 상세 1건
const SYNTHETIC_DATA = `window.__NAV_DATA__={
  "haccpIntegration.getAllPurchases": Array.from({length:60},(_,i)=>({id:i+1,transactionDate:"2026-0"+(1+Math.floor(i/28))+"-"+String(1+(i%28)).padStart(2,"0"),partnerId:1,partnerName:"시험 거래처",itemName:"시험 품목 "+(i+1),quantity:1,unitPrice:1,supplyAmount:1,totalTax:0,grandTotal:1,status:"draft",type:"purchase"})),
  "haccpIntegration.getPurchaseById": {id:5,transactionDate:"2026-01-05",partnerName:"시험 거래처",status:"draft",type:"purchase",supplyAmount:0,totalTax:0,grandTotal:0,items:[],notes:""}
};`;
let browser: any = null;
let base = "";
let skipReason: string | null = null;

beforeAll(async () => {
  try {
    const esbuild = await import("esbuild");
    const stub = path.resolve(__dirname, "__fixtures__/navTrpcStub.ts");
    const out = await esbuild.build({
      entryPoints: [path.resolve(__dirname, "__fixtures__/navHarness.tsx")],
      bundle: true, write: false, format: "esm", platform: "browser", jsx: "automatic", outdir: "nav-out",
      alias: { "@": path.resolve(__dirname, "../client/src"), "@shared": path.resolve(__dirname, "../shared") },
      define: { "process.env.NODE_ENV": '"development"', "import.meta.env": JSON.stringify({ MODE: "test", DEV: true, PROD: false }) },
      loader: { ".svg": "dataurl", ".png": "dataurl", ".jpg": "dataurl", ".webp": "dataurl", ".css": "empty" },
      // 실제 DashboardLayout 을 서버 없이 — 서버 연결(lib/trpc)만 대역으로 바꾼다. 화면 틀·메뉴·즐겨찾기·검색 코드는 운영 그대로
      plugins: [{ name: "trpc-stub", setup(b) { b.onResolve({ filter: /(^|\/)lib\/trpc$/ }, () => ({ path: stub })); } }],
      logLevel: "silent",
    });
    const js = out.outputFiles.find((f) => f.path.endsWith(".js"))!.text;
    // 즐겨찾기 한 개 — 실제 메뉴에 있는 경로 (통합 대시보드)
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div>`
      + `<script>window.__NAV_FAVORITES__=[{id:1,menuPath:"/dashboard",sortOrder:0}];${SYNTHETIC_DATA}</script>`
      + `<script type="module" src="/app.js"></script></body></html>`;
    server = http.createServer((req, res) => {
      if ((req.url ?? "").startsWith("/app.js")) { res.writeHead(200, { "content-type": "text/javascript" }); res.end(js); return; }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html); // 모든 경로 = 같은 앱 (직접 링크·새로고침)
    });
    await new Promise<void>((r) => server!.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const { chromium } = await import("playwright");
    const fs = await import("fs");
    // 설치된 playwright 와 브라우저 빌드가 다르면 미리 깔린 Chromium 으로 (클라우드 시험 환경)
    const pre = "/opt/pw-browsers/chromium";
    browser = await chromium.launch(fs.existsSync(pre) ? { executablePath: pre } : {});
  } catch (e: any) {
    skipReason = String(e?.message ?? e).slice(0, 200);
  }
}, 60000);

afterAll(async () => {
  await browser?.close().catch(() => undefined);
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
});

async function open(p: string) {
  const page = await browser.newPage();
  await page.goto(base + p);
  await page.getByTestId("page").or(page.getByTestId("tab")).first().waitFor();
  return page;
}
const text = (page: any, id: string) => page.getByTestId(id).textContent();
const urlOf = (page: any) => { const u = new URL(page.url()); return u.pathname + u.search; };

describe("작업 위치 보존 — 실제 브라우저", () => {
  it("탭은 URL 이 정본 — 새로고침·직접 링크 같은 탭, 잘못된 값은 기본, 기존 history.state 를 지우지 않음", async () => {
    if (skipReason) return console.warn("[skip] 브라우저 시험:", skipReason);
    const page = await open("/list?tab=b");
    expect(await text(page, "tab")).toBe("b");
    await page.evaluate(() => history.replaceState({ keep: 1 }, "", location.href));
    await page.getByTestId("tab-c").click();
    expect(await text(page, "tab")).toBe("c");
    expect(urlOf(page)).toBe("/list?tab=c");
    expect(await page.evaluate(() => (history.state as any)?.keep)).toBe(1); // 이전 훅은 replaceState({}) 로 지웠다
    await page.reload();
    expect(await text(page, "tab")).toBe("c");
    await page.goto(base + "/list?tab=zzz");
    expect(await text(page, "tab")).toBe("a");
    await page.getByTestId("tab-a").click(); // 기본값이면 쿼리에서 뺀다
    expect(urlOf(page)).toBe("/list");
    await page.close();
  });

  it("중첩 탭·검색 조건이 서로의 쿼리를 덮지 않음 · 검색 입력은 방문 이력을 쌓지 않음 · 빠른 연속 변경", async () => {
    if (skipReason) return;
    const page = await open("/list");
    const len0 = await page.evaluate(() => history.length);
    await page.getByTestId("tab-b").click();
    await page.getByTestId("inner-y").click();
    await page.getByTestId("search").pressSequentially("떡볶이", { delay: 5 });
    await page.getByTestId("status-done").click();
    await page.getByTestId("tab-c").click();
    const u = new URL(page.url());
    expect([u.searchParams.get("tab"), u.searchParams.get("inner"), u.searchParams.get("q"), u.searchParams.get("status")]).toEqual(["c", "y", "떡볶이", "done"]);
    expect([await text(page, "tab"), await text(page, "inner"), await text(page, "q"), await text(page, "status")]).toEqual(["c", "y", "떡볶이", "done"]);
    expect(await page.evaluate(() => history.length)).toBe(len0); // 탭·검색은 replace
    await page.reload();
    expect([await text(page, "tab"), await text(page, "inner"), await text(page, "q")]).toEqual(["c", "y", "떡볶이"]);
    await page.close();
  });

  it("목록 → 수정 → 뒤로(화면 버튼·브라우저) → 같은 탭·조건, 브라우저 앞으로도 URL 과 화면 일치", async () => {
    if (skipReason) return;
    const page = await open("/list?tab=c&inner=y&q=abc");
    await page.getByTestId("to-edit").click();
    await page.getByTestId("page").waitFor();
    expect(urlOf(page)).toContain("/edit/1?returnTo=");
    await page.getByTestId("back").click();
    await page.getByTestId("tab").waitFor();
    expect(urlOf(page)).toBe("/list?tab=c&inner=y&q=abc");
    expect([await text(page, "tab"), await text(page, "inner"), await text(page, "q")]).toEqual(["c", "y", "abc"]);
    // 브라우저 뒤로 → 수정 화면, 다시 뒤로 → 목록 같은 조건, 앞으로 → 수정
    await page.goBack(); await page.getByTestId("page").waitFor();
    await page.goBack(); await page.getByTestId("tab").waitFor();
    expect([await text(page, "tab"), await text(page, "q")]).toEqual(["c", "abc"]);
    await page.goForward(); await page.getByTestId("page").waitFor();
    expect(await text(page, "page")).toBe("edit");
    await page.close();
  });

  it("직접 링크·외부 주소 returnTo 는 안전한 기본 목록으로", async () => {
    if (skipReason) return;
    for (const p of ["/edit/1", "/edit/1?returnTo=https%3A%2F%2Fevil.example%2Fx", "/edit/1?returnTo=%2F%2Fevil.example"]) {
      const page = await open(p);
      await page.getByTestId("back").click();
      await page.getByTestId("tab").waitFor();
      expect(new URL(page.url()).origin).toBe(base);
      expect(urlOf(page)).toBe("/list?tab=b");
      await page.close();
    }
  });

  it("미저장 입력: 바뀐 게 없으면 묻지 않음 · 바뀌면 화면 버튼·메뉴 링크·브라우저 뒤로·창 닫기 모두 묻고, 머무르면 그대로 · 저장 뒤엔 묻지 않음", async () => {
    if (skipReason) return;
    const page = await open("/list?tab=b");
    await page.getByTestId("to-edit").click();
    await page.getByTestId("page").waitFor();
    const dialogs: string[] = [];
    let answer = false;
    page.on("dialog", async (d: any) => { dialogs.push(d.type()); answer ? await d.accept() : await d.dismiss(); });
    // 바뀐 게 없음 → 묻지 않고 돌아감
    await page.getByTestId("back").click(); await page.getByTestId("tab").waitFor();
    expect(dialogs).toEqual([]);
    await page.getByTestId("to-edit").click(); await page.getByTestId("page").waitFor();
    const editUrl = urlOf(page);
    await page.getByTestId("field").fill("changed");
    // 화면의 뒤로 → 묻고 머묾
    await page.getByTestId("back").click();
    expect(dialogs).toEqual(["confirm"]);
    expect(urlOf(page)).toBe(editUrl);
    expect(await page.getByTestId("field").inputValue()).toBe("changed");
    // 메뉴 링크 → 묻고 머묾
    await page.getByTestId("menu-link").click();
    expect(dialogs.length).toBe(2);
    expect(urlOf(page)).toBe(editUrl);
    // 브라우저 뒤로 → 묻고 머묾 (주소·입력 그대로)
    await page.goBack().catch(() => undefined);
    await page.waitForTimeout(200);
    expect(dialogs.length).toBe(3);
    expect(urlOf(page)).toBe(editUrl);
    expect(await page.getByTestId("field").inputValue()).toBe("changed");
    // 창 닫기·새로고침 → 브라우저 확인 (beforeunload 를 막아 둠 — 헤드리스 창 닫기 대화상자 대신 같은 이벤트로 확인)
    const blocks = () => page.evaluate(() => { const ev = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(ev); return ev.defaultPrevented; });
    expect(await blocks()).toBe(true);
    await page.getByTestId("field").fill("orig"); // 원래 값으로 되돌리면 바뀐 게 없음 → 막지 않음
    expect(await blocks()).toBe(false);
    await page.close();

    // 저장 뒤에는 묻지 않음 · 나가기로 하면 이동
    const p2 = await open("/edit/1?returnTo=%2Flist%3Ftab%3Dc");
    const d2: string[] = [];
    p2.on("dialog", async (d: any) => { d2.push(d.type()); await d.accept(); });
    await p2.getByTestId("field").fill("v2");
    await p2.getByTestId("save").click();
    await p2.getByTestId("back").click(); await p2.getByTestId("tab").waitFor();
    expect(d2).toEqual([]);
    expect(urlOf(p2)).toBe("/list?tab=c");
    // 바뀐 상태에서 '나감' 을 고르면 이동
    await p2.getByTestId("to-edit").click(); await p2.getByTestId("page").waitFor();
    await p2.getByTestId("field").fill("v3");
    answer = true;
    await p2.getByTestId("back").click(); await p2.getByTestId("tab").waitFor();
    expect(d2).toEqual(["confirm"]);
    expect(await text(p2, "tab")).toBe("c");
    await p2.close();
  });

  it("실제 DashboardLayout 버튼 — 사이드 메뉴·즐겨찾기·로고·전역 검색: 바뀐 게 없으면 바로 이동, 바뀌면 묻고 머묾/한 번만 이동, 같은 화면 탭은 묻지 않음", async () => {
    if (skipReason) return;
    const start = "/app/edit/1?tab=flow";
    const page = await browser.newPage();
    const dialogs: string[] = [];
    let answer = false;
    page.on("dialog", async (d: any) => { dialogs.push(d.message()); answer ? await d.accept() : await d.dismiss(); });
    const openLayout = async () => { await page.goto(base + start); await page.getByTestId("sidebar-logo-home").waitFor(); };
    const sidebar = (name: string) => page.getByRole("button", { name, exact: true }).first();
    const favorite = () => page.getByRole("button", { name: "통합 대시보드", exact: true }).last(); // 즐겨찾기 목록은 허브 메뉴 아래
    const viaSearch = async () => {
      await page.getByTestId("header-search").click();
      await page.getByPlaceholder("검색").fill("승인 관리");
      await page.keyboard.press("Enter");
    };
    const stillHere = async () => {
      expect(urlOf(page)).toBe(start);
      expect(await page.getByTestId("field").inputValue()).toBe("changed");
      expect(await text(page, "layout-tab")).toBe("flow");
    };

    // 바뀐 게 없음 → 어떤 버튼이든 묻지 않고 이동
    await openLayout();
    await sidebar("알림 관리").click();
    await page.waitForFunction(() => !location.pathname.startsWith("/app/edit"));
    expect(dialogs).toEqual([]);

    // 바뀜 → 네 가지 실제 버튼 모두 묻고, 취소하면 주소·입력·탭 그대로
    await openLayout();
    await page.getByTestId("field").fill("changed");
    const len0 = await page.evaluate(() => history.length);
    const routes: Array<[string, () => Promise<void>]> = [
      ["사이드 메뉴", () => sidebar("승인 관리").click()],
      ["즐겨찾기", () => favorite().click()],
      ["로고(홈)", () => page.getByTestId("sidebar-logo-home").click()],
      ["전역 검색", viaSearch],
    ];
    for (const [label, go] of routes) {
      const before = dialogs.length;
      await go();
      await page.waitForTimeout(100);
      expect(dialogs.length, label).toBe(before + 1);
      await stillHere();
    }
    expect(await page.evaluate(() => history.length)).toBe(len0); // 머문 이동은 방문 이력도 남기지 않음

    // 같은 화면의 탭 전환(쿼리만 바꿈) → 묻지 않음, 입력 그대로
    const n = dialogs.length;
    await page.getByTestId("layout-tab-table").click();
    expect(await text(page, "layout-tab")).toBe("table");
    await page.getByTestId("layout-tab-flow").click();
    expect(dialogs.length).toBe(n);
    await stillHere();

    // 화면의 뒤로 버튼(confirmLeave) — 나가기로 하면 한 번만 묻고 한 번만 이동
    answer = true;
    await page.getByTestId("back").click();
    await page.getByTestId("page").or(page.getByTestId("tab")).first().waitFor();
    expect(dialogs.length).toBe(n + 1);
    expect(await page.evaluate(() => history.length)).toBe(len0 + 1);

    // 사이드 메뉴에서 나가기로 하면 → 한 번 묻고, 그 메뉴로 한 번만 이동
    await openLayout();
    await page.getByTestId("field").fill("changed");
    const len1 = await page.evaluate(() => history.length);
    const m = dialogs.length;
    await sidebar("승인 관리").click();
    await page.waitForFunction(() => !location.pathname.startsWith("/app/edit"));
    expect(dialogs.length).toBe(m + 1);
    expect(await page.evaluate(() => history.length)).toBe(len1 + 1);
    // 떠난 뒤엔 더 묻지 않음 (보호는 화면과 함께 사라짐)
    await page.evaluate(() => history.pushState(null, "", "/somewhere-else"));
    expect(urlOf(page)).toBe("/somewhere-else");
    expect(dialogs.length).toBe(m + 1);
    await page.close();
  }, 60000);
});

describe("작업 위치 보존 2차 — 실제 운영 화면 (서버 연결만 대역, 화면 코드는 그대로)", () => {
  const param = (page: any, k: string) => new URL(page.url()).searchParams.get(k);
  const openReal = async (p: string) => {
    const page = await browser.newPage();
    const dialogs: string[] = [];
    page.on("dialog", async (d: any) => { dialogs.push(d.message()); await d.dismiss(); });
    await page.goto(base + p);
    await page.getByTestId("sidebar-logo-home").waitFor();
    return { page, dialogs };
  };
  const reload = async (page: any) => { await page.reload(); await page.getByTestId("sidebar-logo-home").waitFor(); };
  const selectedTab = async (page: any) => (await page.locator('main [role="tab"][data-state="active"]').first().innerText()).trim();

  it("승인 관리: 탭·처리이력 검색은 URL — 새로고침·뒤로/앞으로 뒤 같은 탭·검색어, 잘못된 탭 값은 기본, 방문 이력은 쌓지 않음", async () => {
    if (skipReason) return;
    const { page } = await openReal("/dashboard/approval");
    const len0 = await page.evaluate(() => history.length);
    await page.getByRole("tab", { name: "처리 이력" }).click();
    expect(param(page, "tab")).toBe("history");
    await page.getByPlaceholder("제목 또는 설명 검색...").fill("떡");
    await page.waitForFunction(() => new URL(location.href).searchParams.get("hq") === "떡");
    expect(await page.evaluate(() => history.length)).toBe(len0);
    await reload(page);
    expect(await selectedTab(page)).toBe("처리 이력");
    expect(await page.getByPlaceholder("제목 또는 설명 검색...").inputValue()).toBe("떡");
    // 다른 화면에 갔다가 뒤로 → 같은 탭·검색어
    await page.evaluate(() => history.pushState(null, "", "/dashboard/accounting/material-ledger"));
    await page.getByRole("tab", { name: "일일 입출고" }).waitFor();
    await page.goBack();
    await page.getByRole("tab", { name: "처리 이력" }).waitFor();
    expect(await selectedTab(page)).toBe("처리 이력");
    expect(await page.getByPlaceholder("제목 또는 설명 검색...").inputValue()).toBe("떡");
    await page.goto(base + "/dashboard/approval?tab=hack");
    await page.getByRole("tab", { name: "검토 대기" }).waitFor();
    expect(await selectedTab(page)).toBe("검토 대기");
    await page.close();
  }, 60000);

  it("원료 수불부: 안쪽 탭·날짜·검색은 URL(ledger… 키) — 새로고침 뒤 같은 자리, 잘못된 날짜는 오늘", async () => {
    if (skipReason) return;
    const { page } = await openReal("/dashboard/accounting/material-ledger");
    await page.locator('main input[type="date"]').first().fill("2026-09-14");
    await page.getByPlaceholder("원재료 검색...").first().fill("찹쌀");
    expect([param(page, "ledgerDate"), param(page, "ledgerQ")]).toEqual(["2026-09-14", "찹쌀"]);
    await page.getByRole("tab", { name: "기간 보고서 (인쇄·엑셀)" }).click();
    expect(param(page, "ledgerTab")).toBe("report");
    await reload(page);
    expect(await selectedTab(page)).toBe("기간 보고서 (인쇄·엑셀)");
    await page.getByRole("tab", { name: "일일 입출고" }).click();
    expect(await page.locator('main input[type="date"]').first().inputValue()).toBe("2026-09-14");
    expect(await page.getByPlaceholder("원재료 검색...").first().inputValue()).toBe("찹쌀");
    expect(param(page, "ledgerTab")).toBeNull(); // 기본 탭은 쿼리에서 뺀다
    await page.goto(base + "/dashboard/accounting/material-ledger?ledgerDate=2026-02-31");
    await page.locator('main input[type="date"]').first().waitFor();
    expect(await page.locator('main input[type="date"]').first().inputValue()).not.toBe("2026-02-31");
    await page.close();
  }, 60000);

  it("품목 마스터: 구분 탭·검색·상태는 URL — 새로고침 뒤 같은 목록 조건", async () => {
    if (skipReason) return;
    const { page } = await openReal("/dashboard/item-master");
    await page.getByRole("tab", { name: "원재료" }).click();
    await page.getByPlaceholder("검색...").fill("쌀");
    await page.locator("main select").first().selectOption("ALL");
    expect([param(page, "tab"), param(page, "q"), param(page, "status")]).toEqual(["raw_material", "쌀", "ALL"]);
    await reload(page);
    expect(await selectedTab(page)).toBe("원재료");
    expect(await page.getByPlaceholder("검색...").inputValue()).toBe("쌀");
    expect(await page.locator("main select").first().inputValue()).toBe("ALL");
    await page.close();
  }, 60000);

  it("매입 조회: 페이지는 URL — 새로고침 뒤 같은 페이지, 조건을 바꾸면 1페이지 · 매입 상세의 뒤로는 들어온 목록으로", async () => {
    if (skipReason) return;
    const { page } = await openReal("/dashboard/accounting/purchases/list");
    await page.locator('main button[title="다음"]').first().click();
    expect(param(page, "page")).toBe("2");
    const firstRow = async () => (await page.locator("main tbody tr").first().innerText()).replace(/\s+/g, " ");
    const onPage2 = await firstRow();
    await reload(page);
    expect(param(page, "page")).toBe("2");
    expect(await firstRow()).toBe(onPage2);
    // 매입 상세(돌아올 곳 = 지금 목록) → 뒤로 → 같은 페이지
    const listUrl = urlOf(page);
    await page.evaluate((u: string) => history.pushState(null, "", "/dashboard/accounting/purchases/5?returnTo=" + encodeURIComponent(u)), listUrl);
    await page.getByText("매입 거래 상세").waitFor();
    await page.locator("main button").filter({ has: page.locator("svg.lucide-arrow-left") }).first().click();
    await page.locator('main button[title="다음"]').first().waitFor();
    expect(urlOf(page)).toBe(listUrl);
    // 직접 링크로 연 상세는 기본 목록으로
    await page.goto(base + "/dashboard/accounting/purchases/5");
    await page.getByText("매입 거래 상세").waitFor();
    await page.locator("main button").filter({ has: page.locator("svg.lucide-arrow-left") }).first().click();
    await page.waitForFunction(() => location.pathname === "/dashboard/accounting/purchases/list");
    expect(param(page, "page")).toBeNull();
    // 조건을 바꾸면 1페이지로 (한 번의 주소 변경으로)
    await page.locator('main button[title="다음"]').first().click();
    expect(param(page, "page")).toBe("2");
    await page.getByPlaceholder("품목명 검색").fill("시험");
    expect([param(page, "item"), param(page, "page")]).toEqual(["시험", null]);
    await page.close();
  }, 60000);

  it("발주서 등록: 들어온 곳으로 돌아가기 · 입력하면 화면 버튼·사이드 메뉴 모두 묻고 취소하면 그대로", async () => {
    if (skipReason) return;
    const back = "/dashboard/item-master?tab=raw_material";
    const start = "/dashboard/accounting/purchase-orders/create?returnTo=" + encodeURIComponent(back);
    const { page, dialogs } = await openReal(start);
    await page.getByRole("button", { name: "돌아가기" }).click(); // 바뀐 게 없음 → 묻지 않고 들어온 곳으로
    await page.getByRole("tab", { name: "원재료" }).waitFor();
    expect(urlOf(page)).toBe(back);
    expect(dialogs).toEqual([]);
    await page.goto(base + start);
    await page.getByPlaceholder("발주 관련 특이사항").fill("시험 메모");
    await page.getByRole("button", { name: "돌아가기" }).click();
    expect(dialogs.length).toBe(1);
    await page.getByRole("button", { name: "승인 관리", exact: true }).first().click();
    expect(dialogs.length).toBe(2);
    expect(urlOf(page)).toBe(start);
    expect(await page.getByPlaceholder("발주 관련 특이사항").inputValue()).toBe("시험 메모");
    await page.close();
  }, 60000);

  it("생산: 날짜·보기·걸러 보기는 URL — 뒤로/앞으로가 주소와 화면을 함께 바꾸고, 기존 history.state 를 지우지 않음", async () => {
    if (skipReason) return;
    const { page } = await openReal("/dashboard/production/today?date=2026-09-14&view=all");
    const dateInput = () => page.getByTestId("work-date").inputValue();
    expect(await dateInput()).toBe("2026-09-14");
    await page.evaluate(() => history.replaceState({ keep: 1 }, "", location.href));
    await page.getByTestId("filter-done").click();
    expect(param(page, "filter")).toBe("done");
    await page.getByRole("button", { name: "다음날" }).click();
    expect(param(page, "date")).toBe("2026-09-15");
    expect(await page.evaluate(() => (history.state as any)?.keep)).toBe(1);
    // 다른 날짜 링크로 이동(방문 이력) → 뒤로 → 화면 날짜도 돌아온다 (이전엔 주소만 바뀌고 화면은 그대로였다)
    await page.evaluate(() => history.pushState(null, "", "/dashboard/production/today?date=2026-10-01&view=all"));
    await page.waitForFunction(() => (document.querySelector('[data-testid="work-date"]') as HTMLInputElement)?.value === "2026-10-01");
    await page.goBack();
    await page.waitForFunction(() => (document.querySelector('[data-testid="work-date"]') as HTMLInputElement)?.value === "2026-09-15");
    expect(param(page, "filter")).toBe("done");
    await reload(page);
    expect(await dateInput()).toBe("2026-09-15");
    expect(param(page, "filter")).toBe("done");
    await page.close();
  }, 60000);

  it("CCP 관리: 탭·기록 조건은 URL, 잘못된 탭은 기본 · CCP 기록 상세의 '목록으로'는 들어온 조건으로", async () => {
    if (skipReason) return;
    const { page } = await openReal("/quality/ccp-monitoring");
    await page.locator('main input[type="date"]').first().fill("2026-09-01");
    expect(param(page, "ccpFrom")).toBe("2026-09-01");
    await page.getByRole("tab", { name: "통계" }).click();
    await reload(page);
    expect(await selectedTab(page)).toBe("통계");
    await page.getByRole("tab", { name: "모니터링 기록" }).click();
    expect(await page.locator('main input[type="date"]').first().inputValue()).toBe("2026-09-01");
    const listUrl = urlOf(page);
    await page.evaluate((u: string) => history.pushState(null, "", "/dashboard/ccp/3?returnTo=" + encodeURIComponent(u)), listUrl);
    await page.getByRole("button", { name: "목록으로" }).click();
    await page.getByRole("tab", { name: "모니터링 기록" }).waitFor();
    expect(urlOf(page)).toBe(listUrl);
    await page.goto(base + "/quality/ccp-monitoring?tab=hack");
    await page.getByRole("tab", { name: "모니터링 기록" }).waitFor();
    expect(await selectedTab(page)).toBe("모니터링 기록");
    await page.close();
  }, 60000);
});

describe("생산 화면 #633 검증 P2 — 다른 화면 주소를 고치지 않음 · 로그인 정보가 늦어도 관리 보기 유지", () => {
  const openWith = async (p: string, init: Record<string, unknown> = {}) => {
    const page = await browser.newPage();
    await page.addInitScript((g: Record<string, unknown>) => { Object.assign(window as any, g); }, init);
    await page.goto(base + p);
    await page.getByTestId("sidebar-logo-home").waitFor();
    return page;
  };
  // 재고 보기 표시: 원재료 = '소모' 탭, 제품 = '출고' 탭, 부자재·외부상품 = '재고 조정' 두 탭만
  const inventoryShows = async (page: any) => {
    const tabs: string[] = (await page.locator('main [role="tab"]').allInnerTexts()).map((t: string) => t.trim());
    return tabs.includes("소모") ? "material" : tabs.includes("출고") ? "product" : tabs.includes("재고 조정") ? "sub-or-ext" : `?${tabs.join(",")}`;
  };

  for (const [view, shows] of [["product", "product"], ["subsidiary", "sub-or-ext"], ["external", "sub-or-ext"]] as const) {
    it(`재고(${view}) → 생산 → 전날 → 뒤로: 재고 주소·보기 그대로 · 다시 앞으로 → 생산 그대로 · 재고에 date/view 를 덧붙이지 않음`, async () => {
      if (skipReason) return;
      const inv = `/inventory-management?view=${view}`;
      const page = await openWith(inv);
      expect(await inventoryShows(page)).toBe(shows);
      await page.evaluate(() => history.pushState(null, "", "/dashboard/production/today")); // 메뉴 버튼과 같은 이동
      await page.getByTestId("work-date").waitFor();
      await page.getByRole("button", { name: "전날" }).click();
      const prodUrl = urlOf(page);
      expect(new URL(page.url()).searchParams.get("view")).toBe("all");
      await page.goBack();
      await page.waitForFunction(() => location.pathname === "/inventory-management");
      await page.waitForTimeout(300);
      expect(urlOf(page)).toBe(inv);
      expect(await inventoryShows(page)).toBe(shows);
      await page.goForward();
      await page.getByTestId("work-date").waitFor();
      expect(urlOf(page)).toBe(prodUrl);
      await page.goBack();
      await page.waitForFunction(() => location.pathname === "/inventory-management");
      await page.waitForTimeout(300);
      expect(urlOf(page)).toBe(inv);
      await page.close();
    }, 60000);
  }

  it("승인 관리: 검색어 입력 직후(300ms 안) 다른 화면으로 가도 그 화면 주소에 검색어를 덧붙이지 않음", async () => {
    if (skipReason) return;
    const page = await openWith("/dashboard/approval?tab=history");
    await page.getByPlaceholder("제목 또는 설명 검색...").fill("떡");
    await page.evaluate(() => history.pushState(null, "", "/inventory-management?view=product"));
    await page.waitForTimeout(600);
    expect(urlOf(page)).toBe("/inventory-management?view=product");
    await page.close();
  }, 60000);

  it("관리자: 로그인 정보가 늦게 와도 view=all 직접 링크·새로고침 뒤 관리 보기 유지 (그 사이 주소에 mine 을 쓰지 않음)", async () => {
    if (skipReason) return;
    const start = "/dashboard/production/today?date=2026-10-15&view=all";
    const page = await openWith(start, { __NAV_AUTH_DELAY_MS__: 700 });
    await page.getByTestId("work-date").waitFor();
    await page.waitForTimeout(300);
    expect(new URL(page.url()).searchParams.get("view")).toBe("all");
    expect(await page.getByTestId("work-date").inputValue()).toBe("2026-10-15");
    expect(await page.getByTestId("view-all").getAttribute("aria-pressed")).toBe("true");
    await page.reload();
    await page.getByTestId("work-date").waitFor();
    await page.waitForTimeout(300);
    expect(new URL(page.url()).searchParams.get("view")).toBe("all");
    expect(await page.getByTestId("view-all").getAttribute("aria-pressed")).toBe("true");
    await page.close();
  }, 60000);

  // 관리 보기를 열 수 없는 역할(검사원 등 — TodayProduction MANAGER 밖). 작업자는 기존 정책대로 계획하므로 관리 보기를 연다
  it("관리 보기 권한 없는 역할(검사원): view=all 링크로 들어와도 관리 보기로 우회할 수 없음 (로그인 정보가 늦어도)", async () => {
    if (skipReason) return;
    const page = await openWith("/dashboard/production/today?date=2026-10-15&view=all", { __NAV_AUTH_DELAY_MS__: 700, __NAV_ROLE__: "inspector" });
    await page.getByTestId("work-date").waitFor();
    await page.waitForFunction(() => new URL(location.href).searchParams.get("view") === "mine");
    expect(await page.getByTestId("view-all").count()).toBe(0); // 관리 버튼 없음
    expect(await page.getByTestId("filter-done").count()).toBe(0); // 관리용 목록 없음
    await page.close();
  }, 60000);

  it("작업자: 로그인 정보가 늦어도 직접 고른 관리 보기(view=all) 유지 — 기본은 현장", async () => {
    if (skipReason) return;
    const page = await openWith("/dashboard/production/today?date=2026-10-15&view=all", { __NAV_AUTH_DELAY_MS__: 700, __NAV_ROLE__: "worker" });
    await page.getByTestId("work-date").waitFor();
    await page.waitForTimeout(300);
    expect(new URL(page.url()).searchParams.get("view")).toBe("all");
    await page.goto(base + "/dashboard/production/today?date=2026-10-15");
    await page.getByTestId("work-date").waitFor();
    await page.evaluate(() => { try { localStorage.removeItem("production-view"); } catch {} });
    await page.reload();
    await page.getByTestId("work-date").waitFor();
    await page.waitForFunction(() => new URL(location.href).searchParams.get("view") === "mine");
    await page.close();
  }, 60000);
});
