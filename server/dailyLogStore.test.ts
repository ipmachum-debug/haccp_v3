/**
 * 일일일지 한 날짜 한 건·설정 발행 규칙 (docs/architecture/17 B2·C1·C2)
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
vi.mock("./db/connection", () => ({ getRawConnection: vi.fn(), getDb: vi.fn() }));
import { dailyLogKey } from "./lib/production/dailyLogStore";
import { removedIdProblems } from "./lib/production/dailyLogSettingsStore";
import { khaccpDefinition } from "../shared/dailyLog/khaccpDefinition";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf-8");

describe("한 날짜 한 건 키", () => {
  it("서버가 회사·사업장 범위·날짜로 만든다, 날짜 형식이 아니면 거부", () => {
    expect(dailyLogKey(2, 0, "2026-10-18")).toBe("daily_log:2:0:2026-10-18");
    expect(() => dailyLogKey(2, 0, "2026/10/18")).toThrow();
  });
  it("생성 경로 4곳이 같은 함수 (입력 화면·자동 생성·작성 모달·엑셀 임포트)", () => {
    expect(read("server/routers/production/dailyLog.router.ts")).toMatch(/ensureDailyLog\(conn, \{/);
    expect(read("server/lib/production/autoDailyReport.ts")).toMatch(/ensureDailyLog\(rawConn, \{/);
    expect(read("server/routers/checklist/genericChecklist.router.ts")).toMatch(/ensureDailyLog\(conn, \{/);
    expect(read("server/routers/system/excelImport.router.ts")).toMatch(/ensureDailyLog\(conn, \{/);
  });
  it("자동 생성은 사업장 대입값으로 찾지 않고, 승인된 일지·작성 중 실측값을 덮어쓰지 않는다", () => {
    const s = read("server/lib/production/autoDailyReport.ts");
    expect(s).not.toMatch(/AND site_id = \$\{siteId\}/);
    expect(s).toMatch(/JSON_SET\(COALESCE\(form_data, JSON_OBJECT\(\)\),\s*'\$\.batches'/);
    expect(s).toMatch(/const approvedLog = existing\.status === "approved"/);
  });
  it("고유 키 이행은 시작 시 마이그레이션이 아니라 승인 후 스크립트", () => {
    expect(read("server/db/startupMigrations.ts")).not.toMatch(/ADD COLUMN `?unique_key|uq_gcr_tenant_unique_key/);
    expect(read("scripts/daily-log-unique-key.ts")).toMatch(/--apply 는 --confirm 과 함께/);
  });
});

describe("설정 발행 — 이전 ID 를 지우면 안 됨 (사용 중지로)", () => {
  it("측정 대상·질문·회차 삭제는 거부, 사용 중지는 허용", () => {
    const prev = khaccpDefinition();
    const next = khaccpDefinition();
    next.points = next.points.filter((p) => p.pointId !== "kh.raw2");
    next.questions = next.questions.filter((q) => q.itemId !== "F09");
    next.points[0].slots = next.points[0].slots.slice(0, 1);
    const p = removedIdProblems(prev, next).join("\n");
    expect(p).toMatch(/측정 대상 'kh\.raw2'/);
    expect(p).toMatch(/질문 'F09'/);
    expect(p).toMatch(/회차 '오후'/);
    const ok = khaccpDefinition();
    ok.points[1].active = false;
    expect(removedIdProblems(prev, ok)).toEqual([]);
  });
});

describe("v2 저장·승인 경로", () => {
  const r = read("server/routers/production/dailyLog.router.ts");
  it("버전 잠금·서버 재판정·구조 검사·제출 검사, 제출·승인 뒤 수정 거부", () => {
    expect(r).toMatch(/AND status IN \('draft','rejected'\) AND data_version = \?/);
    expect(r).toMatch(/const merged: any = mergeV2\(a\.prev, a\.incoming\)/);
    expect(r).toMatch(/v2SaveProblems\(merged\)/);
    expect(r).toMatch(/v2SubmitIssues\(merged, nowKstParts\(\)\)/);
    expect(r).toMatch(/제출된 일지입니다 — 반려된 뒤 고칠 수 있습니다/);
  });
  it("조회 실패는 '일지 없음' 이 아니라 오류", () => {
    expect(r).toMatch(/일일일지를 불러오지 못했습니다/);
  });
  it("승인 관문은 v2 면 스냅샷 기준 + 미해결 이탈 차단", () => {
    expect(read("server/lib/production/dailyLogApprovalGate.ts")).toMatch(/if \(isV2Record\(fd\)\) \{\s*const v2 = v2ApproveIssues\(fd, nowKst\(\)\)/);
  });
  it("설정 쓰기는 관리자 + 기능 DAILY_LOG_V2 켠 회사만", () => {
    expect(r).toMatch(/settingsSaveDraft: adminProcedure/);
    expect(r).toMatch(/settingsPublish: adminProcedure/);
    expect(r).toMatch(/이 회사는 일지 설정 기능이 켜져 있지 않습니다/);
  });
});
