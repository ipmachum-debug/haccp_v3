import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";

let server: http.Server;
let browser: any;
let base: string;
const browserEnabled = process.env.PURCHASE_BROWSER_REQUIRED === "1" || Boolean(process.env.PURCHASE_BROWSER_CHANNEL);
beforeAll(async () => {
  if (!browserEnabled) return;
  const { build } = await import("esbuild");
  const result = await build({
    entryPoints: [path.resolve(__dirname, "__fixtures__/purchaseHarness.tsx")], bundle: true, write: false,
    format: "esm", platform: "browser", jsx: "automatic", logLevel: "silent",
    alias: { "@": path.resolve(__dirname, "../client/src"), "@shared": path.resolve(__dirname, "../shared") },
    define: { "process.env.NODE_ENV": '"test"' },
    plugins: [{ name: "purchase-test-boundaries", setup(b) {
      b.onResolve({ filter: /(^|\/)lib\/trpc$/ }, () => ({ path: path.resolve(__dirname, "__fixtures__/purchaseTrpcStub.ts") }));
      b.onResolve({ filter: /dashboard\/DashboardLayout$/ }, () => ({ path: "layout", namespace: "test-layout" }));
      b.onLoad({ filter: /.*/, namespace: "test-layout" }, () => ({ contents: "export default function Layout({children}) { return children; }" }));
    } }],
  });
  server = http.createServer((req, res) => {
    if (req.url === "/app.js") { res.setHeader("content-type", "text/javascript"); res.end(result.outputFiles[0].text); }
    else { res.setHeader("content-type", "text/html; charset=utf-8"); res.end('<div id="root"></div><script type="module" src="/app.js"></script>'); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const { chromium } = await import("playwright");
  browser = await chromium.launch({ channel: process.env.PURCHASE_BROWSER_CHANNEL || undefined });
}, 60000);
afterAll(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});
async function filledPage(itemName = "시험 피자치즈", packageSize = "750", packageUnit = "g") {
  const page = await browser.newPage();
  await page.goto(base);
  await page.getByPlaceholder("거래처를 검색하세요").click();
  await page.getByText("시험 거래처", { exact: true }).click();
  await page.getByPlaceholder("검색...", { exact: true }).click();
  await page.getByText(itemName, { exact: true }).click();
  const row = page.locator("tbody tr").first();
  await row.locator('input[type="number"]').nth(0).fill(packageSize);
  await row.getByRole("combobox").first().click();
  await page.getByRole("option", { name: packageUnit, exact: true }).click();
  await row.locator('input[type="number"]').nth(1).fill("2");
  return page;
}
describe.skipIf(!browserEnabled)("purchase entry in Chromium, synthetic data only", () => {
  it("keeps failure reason and input on the item row, then retries with the same request key", async () => {
    const page = await filledPage();
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await page.getByRole("alert").waitFor();
    expect(await page.getByRole("alert").textContent()).toContain("시험 원료 연결이 없습니다");
    const failureToast = page.locator('[data-sonner-toast]').filter({ hasText: "매입 등록 실패" });
    expect(await failureToast.count()).toBe(1);
    expect(await failureToast.textContent()).toContain("시험 피자치즈");
    expect(await page.locator('tbody input[type="number"]').first().inputValue()).toBe("750");
    await page.evaluate(() => { (window as any).__PURCHASE_TEST__.mode = "success"; });
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await page.getByText("1건 등록 완료", { exact: true }).waitFor();
    const calls = await page.evaluate(() => (window as any).__PURCHASE_TEST__.calls);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ packagingSize: 750, packagingUnit: "g", quantity: 2, unitPrice: 10455, amount: 20910, taxAmount: 2091, idempotencyKey: calls[0].idempotencyKey });
    expect(await page.getByRole("alert").count()).toBe(0);
    await page.close();
  });
  it("shows the converted package confirmation and prevents concurrent Ctrl+S requests", async () => {
    const page = await filledPage();
    await page.evaluate(() => { (window as any).__PURCHASE_TEST__.mode = "missing"; });
    const messages: string[] = [];
    page.on("dialog", async (dialog: any) => { messages.push(dialog.message()); await dialog.accept(); });
    await page.evaluate(() => { for (let n = 0; n < 3; n++) window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true })); });
    await page.getByText("1건 등록 완료", { exact: true }).waitFor();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("1개 = 0.75kg");
    const calls = await page.evaluate(() => (window as any).__PURCHASE_TEST__.calls);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ savePackUnit: true, idempotencyKey: calls[0].idempotencyKey });
    await page.close();
  });
  it("keeps 0.75kg without rounding it to 0.8kg", async () => {
    const page = await filledPage("시험 피자치즈", "0.75", "kg");
    expect(await page.locator('tbody input[type="number"]').first().inputValue()).toBe("0.75");
    await page.evaluate(() => { (window as any).__PURCHASE_TEST__.mode = "success"; });
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await page.getByText("1건 등록 완료", { exact: true }).waitFor();
    expect(await page.evaluate(() => (window as any).__PURCHASE_TEST__.calls[0].packagingSize)).toBe(0.75);
    await page.close();
  });
  it("sends mushroom pack packaging with the item's ea stock unit", async () => {
    const page = await filledPage("시험 양송이", "1", "Pack");
    expect(await page.getByPlaceholder("개", { exact: true }).inputValue()).toBe("ea");
    await page.evaluate(() => { (window as any).__PURCHASE_TEST__.mode = "success"; });
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await page.getByText("1건 등록 완료", { exact: true }).waitFor();
    expect(await page.evaluate(() => (window as any).__PURCHASE_TEST__.calls[0])).toMatchObject({ itemMasterId: 356, packagingSize: 1, packagingUnit: "pack", unit: "ea", quantity: 2 });
    await page.close();
  });
});
