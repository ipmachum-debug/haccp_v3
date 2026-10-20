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
let browser: any = null;
let base = "";
let skipReason: string | null = null;

beforeAll(async () => {
  try {
    const esbuild = await import("esbuild");
    const out = await esbuild.build({
      entryPoints: [path.resolve(__dirname, "__fixtures__/navHarness.tsx")],
      bundle: true, write: false, format: "esm", platform: "browser", jsx: "automatic",
      alias: { "@": path.resolve(__dirname, "../client/src") },
      define: { "process.env.NODE_ENV": '"development"' },
      logLevel: "silent",
    });
    const js = out.outputFiles[0].text;
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>`;
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
});
