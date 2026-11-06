import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cp from "node:child_process";
import mysql from "mysql2/promise";

const root = process.cwd();
const baseSha = process.env.MYSQL_BASE_SHA;
if (!/^[a-f0-9]{40}$/.test(baseSha || "")) throw new Error("MYSQL_BASE_SHA must be an exact revision");
const url = new URL(process.env.MYSQL_IT_URL || "");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/haccp_it") {
  throw new Error("Only the disposable local CI MySQL database is allowed");
}
const output = path.join(root, "mysql-regression-results");
fs.mkdirSync(output, { recursive: true });
const baseline = fs.mkdtempSync(path.join(os.tmpdir(), "purchase-mysql-baseline-"));
cp.execFileSync("git", ["fetch", "--depth=1", "origin", baseSha], { stdio: "inherit" });
cp.execFileSync("git", ["worktree", "add", "--detach", baseline, baseSha], { stdio: "inherit" });
fs.symlinkSync(path.join(root, "node_modules"), path.join(baseline, "node_modules"), "junction");
const connection = await mysql.createConnection({ uri: url.href });
try {
  await connection.query("CREATE DATABASE haccp_baseline_it CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
} finally {
  await connection.end();
}
const baselineUrl = new URL(url);
baselineUrl.pathname = "/haccp_baseline_it";
function run(name, cwd, databaseUrl) {
  const report = path.join(output, name + ".json");
  const result = cp.spawnSync(process.execPath, [
    path.join(root, "node_modules/vitest/vitest.mjs"), "run", "server/saleLotStatus.mysql.test.ts",
    "--root", cwd, "--config", path.join(cwd, "vitest.config.ts"),
    "--pool=forks", "--minWorkers=1", "--maxWorkers=1", "--reporter=json", "--outputFile", report,
  ], { cwd, env: { ...process.env, MYSQL_IT_URL: databaseUrl }, encoding: "utf8", timeout: 300000, maxBuffer: 20_000_000 });
  fs.writeFileSync(path.join(output, name + ".log"), (result.stdout || "") + (result.stderr || ""));
  if (result.error || !fs.existsSync(report)) throw new Error(`${name}: test runner did not produce a report`);
  const data = JSON.parse(fs.readFileSync(report, "utf8"));
  if (!data.numTotalTests || data.numRuntimeErrorTestSuites) throw new Error(`${name}: incomplete test run`);
  return { data, cases: data.testResults.flatMap(s => s.assertionResults || []) };
}
const before = run("baseline", baseline, baselineUrl.href);
const after = run("head", root, url.href);
const failure = test => (test.failureMessages?.[0] || "").split("\n")[0];
const baselineFailures = new Map(before.cases.filter(t => t.status === "failed").map(t => [t.fullName, failure(t)]));
const regressions = after.cases.filter(t => t.status === "failed" && baselineFailures.get(t.fullName) !== failure(t));
const required = ["우유 6개 × 0.9kg", "피자치즈 750g 2개", "양송이 1pack=1ea 설정", "1500g 직접 매입"];
const focused = required.map(name => ({ name, passed: after.cases.some(t => t.fullName.includes(name) && t.status === "passed") }));
const summary = {
  baseline: { revision: baseSha, total: before.data.numTotalTests, passed: before.data.numPassedTests, failed: before.data.numFailedTests },
  head: { total: after.data.numTotalTests, passed: after.data.numPassedTests, failed: after.data.numFailedTests },
  existingFailures: [...baselineFailures].map(([name, message]) => ({ name, message })),
  regressions: regressions.map(t => ({ name: t.fullName, message: failure(t) })), focused,
};
fs.writeFileSync(path.join(output, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (baselineFailures.size) console.log(`::warning::Baseline has ${baselineFailures.size} existing failures; preserved in regression artifacts, not counted as passes.`);
if (regressions.length || focused.some(t => !t.passed) || after.data.numTotalTests <= before.data.numTotalTests) {
  throw new Error("MySQL regression or a missing required purchase test");
}
